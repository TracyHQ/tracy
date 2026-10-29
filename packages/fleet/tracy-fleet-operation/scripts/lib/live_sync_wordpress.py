"""WordPress's half of "Sync from live" (lib/live_sync.py, plan tasks/ke-hoach-dong-bo-tu-live.md §4).

What WordPress needs beyond Joomla's merge, all kept here so live_sync.py only names the platform:

    POLICY        the table rules of the merge (live_sync.py POLICIES): Tracy's own rows, the rows a
                  running site rewrites by itself, counters, and the records both sites number from
                  the same AUTO_INCREMENT, with every place that points at them
    prepare       run on the three scratch schemas before anything is compared:
                    - the live site's ADDRESS in the two reads of the live site (base and theirs) is
                      rewritten to the copy's, the way provision rewrote it into the copy
                      (`platform/wordpress.sh` platform_configure: `wp search-replace <live home>
                      <copy address> --all-tables --skip-columns=guid`), serialized PHP included;
                    - `options` rows are numbered by `option_name`: the copy's number where the copy
                      has the option, one above every side's numbers where it does not
    merge_wp_config   wp-config.php merged define by define (live_sync.py `merge_joomla_config`'s
                  counterpart): the copy's environment (database, address, salts, table prefix,
                  hosting) stays, every other constant takes the side that changed it

Why the address is rewritten in the reads and not compared around: provision rewrote it in the copy,
so every row holding the live address (options, post content, widget and theme settings serialized
with their string lengths) differs between the copy and the live site without anyone having changed
it. Rewritten the same way in base and theirs, an untouched row is the same on all three sides, a
row the customer changed comes over already holding the copy's address, and the base kept for the
next sync stays the raw read (webroot-sync.sh keeps `live/db.sql.gz`, rewritten at each merge).

The rewrite is provision's, byte for byte where it can be: a plain replace of the live `home` value,
skipping `guid` columns, through serialized PHP (strings re-measured, nested serialized strings
followed, array keys and property names left alone), and a plain replace where a value only looks
serialized. What provision did not rewrite (an escaped `https:\\/\\/` in JSON, an `http://` variant of
an `https://` home) is left as it is on all three sides alike.
"""

from __future__ import annotations

import re
from typing import Callable, NamedTuple

# ── SQL helpers (live_sync.py's own: this module is loaded by it and cannot import it back) ────


def q(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def sql_str(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


# ── serialized PHP ─────────────────────────────────────────────────────────────────────────────


class _Unreadable(ValueError):
    """Not a whole serialized PHP value."""


_MAX_DEPTH = 64
_NUMBER = re.compile(rb"-?[0-9]+")
_FLOAT = re.compile(rb"-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|-?INF|NAN")


def _int_until(data: bytes, at: int, stop: bytes) -> tuple[int, int]:
    end = data.find(stop, at)
    if end < 0 or not _NUMBER.fullmatch(data[at:end]):
        raise _Unreadable(at)
    return int(data[at:end]), end + len(stop)


def _quoted(data: bytes, at: int, length: int) -> tuple[bytes, int]:
    """`"<length bytes>"` at `at`: the bytes, and the index past the closing quote."""
    if data[at:at + 1] != b'"' or data[at + 1 + length:at + 2 + length] != b'"':
        raise _Unreadable(at)
    return data[at + 1:at + 1 + length], at + 2 + length


def _walk(data: bytes, at: int, old: bytes, new: bytes, depth: int, visit=None, path=(),
          layout=None) -> tuple[bytes, int]:
    """One serialized value at `at`, rewritten: (its new bytes, the index past the old ones). With
    `visit`, the record numbers `layout` places in the value (by path) are handed to it as well."""
    if depth > _MAX_DEPTH or at >= len(data):
        raise _Unreadable(at)
    kind = data[at:at + 2]
    layout = layout or THEME_MODS
    entity = layout.entity(path) if visit else None
    if visit and kind in (b"r:", b"R:"):
        raise _Unreadable("aliased serialized value")
    if entity and kind in (b"r:", b"R:", b"C:", b"O:"):
        raise _Unreadable("aliased serialized reference")
    if visit and path in layout.containers and kind == b"C:":
        raise _Unreadable("opaque reference container")
    if entity and kind == b"i:":
        number, end = _int_until(data, at + 2, b";")
        got = visit(entity, number) if number > 0 else number
        return (data[at:end] if got == number else b"i:%d;" % got), end
    if data[at:at + 2] == b"N;":
        return b"N;", at + 2
    if kind in (b"b:", b"i:", b"r:", b"R:"):
        end = data.find(b";", at)
        body = data[at + 2:end] if end > 0 else b""
        if not _NUMBER.fullmatch(body) or (kind == b"b:" and body not in (b"0", b"1")):
            raise _Unreadable(at)
        return data[at:end + 1], end + 1
    if kind == b"d:":
        end = data.find(b";", at)
        if end < 0 or not _FLOAT.fullmatch(data[at + 2:end]):
            raise _Unreadable(at)
        return data[at:end + 1], end + 1
    if kind == b"s:":
        length, at2 = _int_until(data, at + 2, b":")
        inner, after = _quoted(data, at2, length)
        if data[after:after + 1] != b";":
            raise _Unreadable(after)
        if entity and _NUMBER.fullmatch(inner):
            number = int(inner)
            got = visit(entity, number) if number > 0 else number
            rewritten = inner if got == number else str(got).encode("ascii")
        else:
            # A string inside may hold serialized PHP of its own (a plugin serializing twice).
            rewritten = replace_value(inner, old, new, depth + 1)
        return b"s:%d:\"" % len(rewritten) + rewritten + b"\";", after + 1
    if kind == b"E:":
        length, at2 = _int_until(data, at + 2, b":")
        _, after = _quoted(data, at2, length)
        if data[after:after + 1] != b";":
            raise _Unreadable(after)
        return data[at:after + 1], after + 1
    if kind == b"a:":
        count, at2 = _int_until(data, at + 2, b":")
        return _members(data, at, at2, count, old, new, depth, visit, path, layout)
    if kind == b"O:":
        length, at2 = _int_until(data, at + 2, b":")
        _, after = _quoted(data, at2, length)
        if data[after:after + 1] != b":":
            raise _Unreadable(after)
        count, at3 = _int_until(data, after + 1, b":")
        return _members(data, at, at3, count, old, new, depth, visit, path, layout)
    if kind == b"C:":
        # A class serializing itself (`Serializable`): its payload is the class's own format, not
        # PHP's, and is carried as it is.
        length, at2 = _int_until(data, at + 2, b":")
        _, after = _quoted(data, at2, length)
        if data[after:after + 1] != b":":
            raise _Unreadable(after)
        size, at3 = _int_until(data, after + 1, b":")
        if data[at3:at3 + 1] != b"{" or data[at3 + 1 + size:at3 + 2 + size] != b"}":
            raise _Unreadable(at3)
        return data[at:at3 + 2 + size], at3 + 2 + size
    raise _Unreadable(at)


def _members(data: bytes, start: int, at: int, count: int, old: bytes, new: bytes, depth: int, visit=None, path=(),
             layout=None):
    """An array's or an object's `{key value …}` from `at`, its keys kept and its values rewritten;
    the head (`a:2:` / `O:8:"stdClass":2:`) from `start` kept as it is."""
    if data[at:at + 1] != b"{":
        raise _Unreadable(at)
    out = [data[start:at + 1]]
    at += 1
    for _ in range(count):
        if data[at:at + 2] not in (b"i:", b"s:"):
            raise _Unreadable(at)
        key_end = _walk_key(data, at)
        out.append(data[at:key_end])
        if data[at:at + 2] == b"s:":
            length, key_at = _int_until(data, at + 2, b":")
            key, _ = _quoted(data, key_at, length)
            key = key.decode("utf-8", "surrogateescape")
        else:
            key, _ = _int_until(data, at + 2, b";")
        value, at = _walk(data, key_end, old, new, depth + 1, visit, path + (key,), layout)
        out.append(value)
    if data[at:at + 1] != b"}":
        raise _Unreadable(at)
    out.append(b"}")
    return b"".join(out), at + 1


def _walk_key(data: bytes, at: int) -> int:
    if data[at:at + 2] == b"i:":
        _, end = _int_until(data, at + 2, b";")
        return end
    length, at2 = _int_until(data, at + 2, b":")
    _, after = _quoted(data, at2, length)
    if data[after:after + 1] != b";":
        raise _Unreadable(after)
    return after + 1


_SERIALIZED_START = re.compile(rb"^(?:[aOC]:[0-9]+:|s:[0-9]+:\"|[bid]:|N;|E:[0-9]+:)")
# The same pattern for the server's REGEXP over a value's bytes (`rewrite_address`).
SERIALIZED_START_SQL = '^([aOC]:[0-9]+:|s:[0-9]+:"|[bid]:|N;|E:[0-9]+:)'


def replace_value(data: bytes, old: bytes, new: bytes, depth: int = 0) -> bytes:
    """`old` replaced by `new` in one column value, as `wp search-replace` does it: a value that is
    whole serialized PHP is rewritten inside, with every string's length said again; anything else
    (plain text, JSON, a value that only starts like serialized PHP) is a plain replace."""
    if not old or old not in data:
        return data
    if _SERIALIZED_START.match(data):
        try:
            rewritten, end = _walk(data, 0, old, new, depth)
            if data[end:].strip() == b"":
                return rewritten + data[end:]
        except (_Unreadable, IndexError, ValueError, RecursionError):
            pass
    return data.replace(old, new)


# ── the address ────────────────────────────────────────────────────────────────────────────────

# Column types a value can hold an address in (wp-cli's own choice: text and character columns).
TEXT_TYPES = ("char", "varchar", "tinytext", "text", "mediumtext", "longtext")
# Rows written back per SQL call.
WRITE_BATCH = 200


def option_value(sql, schema: str, prefix: str, name: str) -> str | None:
    rows = sql.run(f"SELECT HEX(CAST(option_value AS BINARY)) FROM {q(schema)}.{q(prefix + 'options')}"
                   f" WHERE option_name = {sql_str(name)} LIMIT 1;") if _has_table(sql, schema, prefix + "options") else []
    if not rows or rows[0][0] is None:
        return None
    return bytes.fromhex(rows[0][0]).decode("utf-8", "surrogateescape")


def _has_table(sql, schema: str, table: str) -> bool:
    return bool(sql.run(f"SELECT 1 FROM information_schema.tables WHERE table_schema = {sql_str(schema)}"
                        f" AND table_name = {sql_str(table)};"))


def counting_policy(sql, names: dict, prefix: str) -> dict:
    """Count the authoritative WooCommerce store when all three reads agree on its mode.
    A mode transition keeps per-table counts; an ID alone never proves a backup order."""
    schemas = sorted(set(names.values()))
    tables = [prefix + name for name in ("posts", "options", "wc_orders")]
    have = {tuple(row) for row in sql.run(
        "SELECT table_schema, table_name FROM information_schema.tables"
        f" WHERE table_schema IN ({', '.join(sql_str(s) for s in schemas)})"
        f" AND table_name IN ({', '.join(sql_str(t) for t in tables)});")}
    if not all((schema, table) in have for schema in schemas for table in tables):
        return {}
    # WooCommerce's controller uses get_option(...) === 'yes'; a missing row means legacy.
    modes = {option_value(sql, schema, prefix, "woocommerce_custom_orders_table_enabled") == "yes"
             for schema in schemas}
    if len(modes) != 1:
        return {}
    if modes == {True}:
        return {"uncountedRows": {**POLICY["uncountedRows"], "posts": {
            "post_type": {"shop_order_placehold", "shop_order", "shop_order_refund"}}}}
    return {"uncountedTables": POLICY["uncountedTables"] | {"wc_orders"}}


def rewrite_address(sql, schema: str, old: str, new: str) -> dict:
    """Every text value of `schema` holding `old`, rewritten to `new` (`replace_value`), `guid`
    columns left alone (a post's guid is an identifier feed readers key on; provision skipped it
    too). Rows are found and written by their primary key; a table without one is rewritten by SQL
    where none of its matching values looks serialized, and named in `skipped` otherwise."""
    old_b, new_b = old.encode("utf-8"), new.encode("utf-8")
    if not old or old == new:
        return {"rows": 0, "tables": 0, "skipped": []}
    listed = ", ".join(sql_str(t) for t in TEXT_TYPES)
    cols = sql.run(
        f"SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c"
        f" JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name"
        f" WHERE c.table_schema = {sql_str(schema)} AND t.table_type = 'BASE TABLE'"
        f" ORDER BY c.table_name, c.ordinal_position;")
    keys = sql.run(f"SELECT table_name, column_name FROM information_schema.statistics WHERE table_schema = {sql_str(schema)}"
                   f" AND index_name = 'PRIMARY' ORDER BY table_name, seq_in_index;")
    text: dict[str, list[str]] = {}
    types: dict[tuple[str, str], str] = {}
    for table, column, kind in cols:
        types[(table, column)] = kind
        if kind in TEXT_TYPES and column.lower() != "guid":
            text.setdefault(table, []).append(column)
    primary: dict[str, list[str]] = {}
    for table, column in keys:
        primary.setdefault(table, []).append(column)
    needle = "X'" + old_b.hex() + "'"
    found = f"LOCATE({needle}, CAST({{c}} AS BINARY)) > 0"
    # A value `replace_value` reads as serialized PHP starts so (_SERIALIZED_START, the same
    # pattern over the value's bytes); any other value holding the address is a plain replace,
    # which the server does as well as Python: REPLACE over the bytes, written back as bytes, the
    # way an `X'…'` of Python's answer was. Only the values that look serialized come over to be
    # walked — every post's content went there and back as hex, 20 s of a sync's 48 (24/10/2026).
    looks = f"CAST({{c}} AS BINARY) REGEXP {sql_str(SERIALIZED_START_SQL)}"
    plain = f"({found} AND NOT {looks})"
    rows_done, tables_done, skipped = 0, 0, []
    for table, columns in sorted(text.items()):
        ref = f"{q(schema)}.{q(table)}"
        pk = primary.get(table)
        if not pk:
            serialized = sql.run(
                f"SELECT 1 FROM {ref} WHERE " + " OR ".join(
                    f"({found.format(c=q(c))} AND CAST({q(c)} AS BINARY) REGEXP '^[aOCs]:[0-9]+:')" for c in columns)
                + " LIMIT 1;")
            if serialized:
                skipped.append(table)
                continue
            changed = 0
            for c in columns:
                changed += int(sql.run(f"UPDATE {ref} SET {q(c)} = REPLACE({q(c)}, {sql_str(old)}, {sql_str(new)})"
                                       f" WHERE {found.format(c=q(c))}; SELECT ROW_COUNT();")[-1][0])
            rows_done += changed
            tables_done += 1 if changed else 0
            continue
        any_col = " OR ".join(found.format(c=q(c)) for c in columns)
        # Each column of a row holding the address: its bytes when they look serialized, '' when a
        # plain replace does it, NULL when it does not hold the address.
        select = ", ".join([f"HEX(CAST({q(k)} AS BINARY))" for k in pk]
                           + [f"IF({found.format(c=q(c))}, IF({looks.format(c=q(c))}, HEX(CAST({q(c)} AS BINARY)), ''), NULL)"
                              for c in columns])
        hits = sql.run(f"SELECT {select} FROM {ref} WHERE {any_col};")
        if not hits:
            continue
        tables_done += 1
        writes = []
        changed_rows = 0
        plain_cols: set[str] = set()
        for row in hits:
            key_vals, values = row[:len(pk)], row[len(pk):]
            sets = []
            plain_here = False
            for column, value in zip(columns, values):
                if value is None:
                    continue
                if value == "":
                    # `old` is in it and `old` is not `new`: the replace changes it.
                    plain_here = True
                    plain_cols.add(column)
                    continue
                before = bytes.fromhex(value)
                after = replace_value(before, old_b, new_b)
                if after != before:
                    sets.append(f"{q(column)} = X'{after.hex()}'")
            if sets:
                where = " AND ".join(_key_match(k, types.get((table, k), ""), v) for k, v in zip(pk, key_vals))
                writes.append(f"UPDATE {ref} SET {', '.join(sets)} WHERE {where};")
            changed_rows += 1 if (sets or plain_here) else 0
        if plain_cols:
            # Before the serialized ones, on the values the SELECT saw: a column is one or the
            # other, and each assignment reads only its own column.
            cols = sorted(plain_cols, key=columns.index)
            sets = ", ".join(f"{q(c)} = IF({plain.format(c=q(c))}, REPLACE(CAST({q(c)} AS BINARY), {needle},"
                             f" X'{new_b.hex()}'), {q(c)})" for c in cols)
            sql.run(f"UPDATE {ref} SET {sets} WHERE {' OR '.join(plain.format(c=q(c)) for c in cols)};")
        for i in range(0, len(writes), WRITE_BATCH):
            sql.run("\n".join(writes[i:i + WRITE_BATCH]))
        rows_done += changed_rows
    return {"rows": rows_done, "tables": tables_done, "skipped": skipped}


INT_TYPES = ("tinyint", "smallint", "mediumint", "int", "bigint")


def _key_match(column: str, kind: str, hexed: str) -> str:
    """`column` equal to the value read as HEX: a number as a number (an index is used), anything
    else byte for byte."""
    raw = bytes.fromhex(hexed or "")
    if kind in INT_TYPES and re.fullmatch(rb"-?[0-9]+", raw):
        return f"{q(column)} = {raw.decode()}"
    return f"CAST({q(column)} AS BINARY) = X'{raw.hex()}'"


# ── options numbered by name ───────────────────────────────────────────────────────────────────


def align_options(sql, names: dict, prefix: str) -> dict:
    """`options` rows of base and theirs numbered by `option_name`: nothing points at `option_id`,
    and both sites number new options from the same AUTO_INCREMENT — compared by number, an option
    the customer added met one the copy added under one id, and every option the copy deleted moved
    the others' numbers nowhere. The copy's number where the copy has the name; one above every
    side's numbers otherwise, the same in base and theirs (in name order, so a re-run agrees)."""
    table = prefix + "options"
    if not all(_has_table(sql, s, table) for s in names.values()):
        return {"renumbered": 0}
    ref = {side: f"{q(schema)}.{q(table)}" for side, schema in names.items()}
    top = max(int(sql.run(f"SELECT IFNULL(MAX(option_id), 0) FROM {ref[side]};")[0][0]) for side in names)
    missing = [r[0] for r in sql.run(
        f"SELECT option_name FROM {ref['base']} UNION SELECT option_name FROM {ref['theirs']}"
        f" EXCEPT SELECT option_name FROM {ref['ours']} ORDER BY 1;")]
    offset = top + 1
    script = ["SET FOREIGN_KEY_CHECKS = 0;"]
    # Through a far number first: a row moving to a number another row still holds.
    for side in ("base", "theirs"):
        script.append(f"UPDATE {ref[side]} SET option_id = option_id + {offset};")
        script.append(f"UPDATE {ref[side]} r JOIN {ref['ours']} o ON o.option_name = r.option_name"
                      f" SET r.option_id = o.option_id;")
    for i, n in enumerate(missing):
        for side in ("base", "theirs"):
            script.append(f"UPDATE {ref[side]} SET option_id = {offset * 2 + i} WHERE option_name = {sql_str(n)};")
    # Then down to the first free numbers above every side's own: the far ones were only a passage.
    for i, n in enumerate(missing):
        for side in ("base", "theirs"):
            script.append(f"UPDATE {ref[side]} SET option_id = {top + 1 + i} WHERE option_id = {offset * 2 + i};")
    sql.run("\n".join(script))
    return {"renumbered": len(missing)}


# ── prepare: the reads of the live site made comparable with the copy ──────────────────────────


def copy_address(sql, ours: str, prefix: str) -> str | None:
    """The copy's own address, as its database holds it (provision's search-replace wrote it into
    `home`; a rename of the copy rewrites `home` too)."""
    value = option_value(sql, ours, prefix, "home")
    return value.strip() if value and value.strip() else None


def drop_auto_drafts(sql, schema: str, prefix: str) -> int:
    """The auto-drafts of one read of the live site taken out of it, with their meta: the empty posts
    wp-admin makes when "Add New" or the dashboard's Quick Draft opens (`AUTO_DRAFT`), which nobody
    wrote. Out of base and theirs alike, an auto-draft the live site made or WP-Cron deleted is no
    change; one the customer then wrote and published is a post the base never had — a new post that
    comes over. The copy's own are its own. Answers how many posts went."""
    posts, meta = prefix + "posts", prefix + "postmeta"
    if not _has_table(sql, schema, posts):
        return 0
    drafts = f"SELECT ID FROM {q(schema)}.{q(posts)} WHERE post_status = {sql_str(AUTO_DRAFT)}"
    script = []
    if _has_table(sql, schema, meta):
        # Through a list of numbers first: MariaDB will not delete from a table a subquery reads.
        script.append(f"DELETE m FROM {q(schema)}.{q(meta)} m JOIN ({drafts}) d ON d.ID = m.post_id;")
    script.append(f"DELETE FROM {q(schema)}.{q(posts)} WHERE post_status = {sql_str(AUTO_DRAFT)}; SELECT ROW_COUNT();")
    rows = sql.run("\n".join(script))
    return int(rows[-1][0]) if rows else 0


def yield_auto_drafts(sql, names: dict, prefix: str, log=lambda _m: None) -> list[int]:
    """The copy's auto-drafts under a number the live read gives a post of its own (once its numbers
    are the copy's, `IdMap.apply`) and the base never had: taken out of `ours` with their meta and
    terms, so the live site's post comes over under its own number. An auto-draft is the empty post
    wp-admin makes when "Add New" opens (`AUTO_DRAFT`), nobody's writing; it held the number the live
    site went on to publish a post under, and the live post was numbered again or lost (dev, S5,
    24/10/2026). The base holding that number is no clash of new posts: left to the merge.
    `names`: {"base", "ours", "theirs"} → schema. Answers the numbers given up."""
    posts, meta, terms = prefix + "posts", prefix + "postmeta", prefix + "term_relationships"
    if not all(_has_table(sql, names[side], posts) for side in ("base", "ours", "theirs")):
        return []
    o, t, b = (q(names[side]) for side in ("ours", "theirs", "base"))
    ids = sorted(int(r[0]) for r in sql.run(
        f"SELECT o.ID FROM {o}.{q(posts)} o JOIN {t}.{q(posts)} t ON t.ID = o.ID"
        f" LEFT JOIN {b}.{q(posts)} b ON b.ID = o.ID"
        f" WHERE o.post_status = {sql_str(AUTO_DRAFT)} AND b.ID IS NULL;"))
    if not ids:
        return []
    listed = ", ".join(str(i) for i in ids)
    script = []
    if _has_table(sql, names["ours"], meta):
        script.append(f"DELETE FROM {o}.{q(meta)} WHERE post_id IN ({listed});")
    if _has_table(sql, names["ours"], terms):
        # The posts' relationships only: under the same number, a link's categories and a term's
        # Polylang language and group are another record's (`TT_OF_POST`).
        taxonomies = prefix + "term_taxonomy"
        own = (f" AND {TT_OF_POST.replace('{term_taxonomy}', f'{o}.{q(taxonomies)}')}"
               if _has_table(sql, names["ours"], taxonomies) else "")
        script.append(f"DELETE FROM {o}.{q(terms)} WHERE object_id IN ({listed}){own};")
    script.append(f"DELETE FROM {o}.{q(posts)} WHERE ID IN ({listed}) AND post_status = {sql_str(AUTO_DRAFT)};")
    sql.run("\n".join(script))
    log(f"the copy's auto-drafts under a number the live site's post has: {listed} given up")
    return ids


def prepare(sql, names: dict, prefix: str, log=lambda _m: None) -> dict:
    """Before anything is compared: the auto-drafts of base and theirs taken out (`drop_auto_drafts`),
    the live site's address in both rewritten to the copy's, then `options` numbered by name.
    `names`: {"base", "ours", "theirs"} → schema."""
    said: dict = {}
    drafts = {side: drop_auto_drafts(sql, names[side], prefix) for side in ("base", "theirs")}
    if any(drafts.values()):
        said["autoDrafts"] = drafts
        log(f"auto-drafts left out: {drafts['base']} of the base, {drafts['theirs']} of the live read")
    to = copy_address(sql, names["ours"], prefix)
    for side in ("base", "theirs"):
        frm = option_value(sql, names[side], prefix, "home")
        frm = frm.strip() if frm else None
        if to and frm and frm != to:
            done = rewrite_address(sql, names[side], frm, to)
            said[side] = {"from": frm, "to": to, **done}
            log(f"{side}: {frm} → {to}: {done['rows']} row(s) in {done['tables']} table(s)"
                + (f", left alone (no key, serialized): {', '.join(done['skipped'])}" if done["skipped"] else ""))
    said["options"] = align_options(sql, names, prefix)
    return said


# ── the table rules ────────────────────────────────────────────────────────────────────────────


class TableNames:
    """A set of table names (without prefix) that also holds every name a pattern matches: `in`
    answers both; iterating gives the plain names only."""

    def __init__(self, names=(), patterns=()):
        self.names = frozenset(names)
        self.patterns = [re.compile(p) for p in patterns]

    def __contains__(self, name) -> bool:
        return name in self.names or any(p.search(name) for p in self.patterns)

    def __iter__(self):
        return iter(sorted(self.names))


# Rows a running WordPress rewrites by itself, on either site: never compared, never reported, the
# copy's kept (`tracyRows`), and left out of the checksum `apply` uses to see the copy moved
# (`noiseRows`) — a visit to the copy runs WP-Cron, which rewrites `cron` and transients.
# Said once as names, then as SQL (the merge, the checksum `apply` compares) and as a pattern over a
# dumped row (live-pull.mjs comparing two reads of the live site: `volatile_rows`).
# Each a name WordPress core (or a plugin's lock or session) writes on its own — on a visit that runs
# WP-Cron, an admin page load, a sign-in — read in core: wp-cron events (`wp_version_check` and the
# update checks → `_site_transient_update_*`, `delete_expired_transients`, `wp_https_detection`,
# `wp_update_user_counts`, `recovery_mode_clean_expired_keys`, `wp_site_health_scheduled_check`,
# `do_pings` → `_pingme`/`_encloseme`/`_trackbackme`), the dashboard (`dashboard_widget_options`, its
# Quick Draft's `dashboard_quick_press_last_post_id`, community events), wp-admin's own state per user
# (`user-settings`, screen options, closed boxes, the block editor's `persisted_preferences`), and a
# post's edit lock; and WooCommerce's analytics import, which its Action Scheduler runs on each site
# on its own and which keeps where it got to (`woocommerce_admin_scheduler_last_processed_order_*`).
# Never a name a person's edit writes: a site title, a page, a menu, a widget.
VOLATILE_NAMES = {
    # (table, its key column's place in a row, exact names, name prefixes, name suffixes)
    "options": (1, ("cron", "rewrite_rules", "recently_edited", "recovery_keys", "recovery_mode_email_last_sent",
                    "auto_updater.lock", "core_updater.lock", "can_compress_scripts", "health-check-site-status-result",
                    "wp_force_deactivated_plugins", "recently_activated", "action_scheduler_migration_status",
                    "https_detection_errors", "user_count", "dashboard_widget_options", "db_upgraded",
                    "_wp_suggested_policy_text_has_changed", "admin_email_lifespan",
                    "wp_calendar_block_has_published_posts", "auto_core_update_notified",
                    "auto_plugin_theme_update_emails"),
                ("_transient_", "_site_transient_", "action_scheduler_lock_", "_wc_session_", "wc_session_",
                 "woocommerce_admin_scheduler_"), ()),
    # A user option is stored under the site's table prefix (`wp_user-settings`): said by its end.
    "usermeta": (2, ("session_tokens", "community-events-location", "wc_last_active", "dismissed_wp_pointers"),
                 ("meta-box-order_", "closedpostboxes_", "metaboxhidden_", "screen_layout_"),
                 ("user-settings", "user-settings-time", "dashboard_quick_press_last_post_id",
                  "persisted_preferences", "nav_menu_recently_edited", "media_library_mode", "columnshidden",
                  "_per_page")),
    # A post's edit lock and last editor move every time someone opens it; `_encloseme`/`_pingme`/
    # `_trackbackme` are WordPress's own to-do marks for pings, which WP-Cron's `do_pings` clears.
    "postmeta": (2, ("_edit_lock", "_edit_last", "_encloseme", "_pingme", "_trackbackme"), (), ()),
}
_KEY_COLUMN = {"options": "option_name", "usermeta": "meta_key", "postmeta": "meta_key"}
# `posts.post_status`'s place in a row: an auto-draft is the empty post wp-admin makes each time
# "Add New" or the dashboard's Quick Draft opens (`get_default_post_to_edit`), and WP-Cron's
# `wp_scheduled_auto_draft_delete` deletes it a week later. Nobody wrote it: it never comes over, and
# its coming and going is no change of the live site.
POST_STATUS_PLACE = 7
AUTO_DRAFT = "auto-draft"


def _like(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("_", "\\_").replace("%", "\\%") + "%"


def _like_end(suffix: str) -> str:
    return "%" + suffix.replace("\\", "\\\\").replace("_", "\\_").replace("%", "\\%")


def volatile_sql(table: str) -> str:
    _, exact, prefixes, suffixes = VOLATILE_NAMES[table]
    column = "r." + _KEY_COLUMN[table]
    parts = [f"{column} IN ({', '.join(sql_str(n) for n in exact)})"] if exact else []
    parts += [f"{column} LIKE {sql_str(_like(p))}" for p in prefixes]
    parts += [f"{column} LIKE {sql_str(_like_end(s))}" for s in suffixes]
    return " OR ".join(parts)


# One value of a dumped row: a quoted string (backslash escapes, the dumper's `SqlValue`), NULL or a
# bare number. Written the same in Python's `re` and JavaScript's RegExp; the unrolled loop keeps a
# long post_content one linear pass.
_DUMPED_VALUE = r"(?:'[^'\\]*(?:\\[\s\S][^'\\]*)*'|NULL|-?[0-9.]+)"


def volatile_rows() -> dict[str, str]:
    """{table: pattern} over a row as a dump writes it, `(1,'name',…)` or `('1','name',…)`: the rows
    `volatile_sql` names, and a post that is an auto-draft. live-pull.mjs leaves them out when it
    compares two reads of the live site (TRACY_SYNC_VOLATILE_ROWS), so a visit that runs WP-Cron
    during the read does not stop it."""
    out = {}
    for table, (place, exact, prefixes, suffixes) in VOLATILE_NAMES.items():
        names = ([re.escape(n) + "'" for n in exact] + [re.escape(p) for p in prefixes]
                 + [r"[^'\\]*" + re.escape(s) + "'" for s in suffixes])
        out[table] = r"^\(" + r"'?-?[0-9]+'?," * place + "'(?:" + "|".join(names) + ")"
    out["posts"] = r"^\((?:" + _DUMPED_VALUE + ",){" + str(POST_STATUS_PLACE) + "}'" + AUTO_DRAFT + "'"
    return out


# The column that names a row of a table, by its place in a dumped row: how live-pull.mjs says WHICH
# rows of `options`/`usermeta`/`postmeta` differed between two reads (the name, never the value).
ROW_NAMES = {table: place for table, (place, *_rest) in VOLATILE_NAMES.items()}


VOLATILE_OPTIONS = volatile_sql("options")
VOLATILE_USERMETA = volatile_sql("usermeta")
VOLATILE_POSTMETA = volatile_sql("postmeta")
# Tracy's own options on the copy: Claude Cowork's token, contract, content seed and settings, and the
# sign-in plugin's (`platform/wordpress.sh` platform_install_access).
TRACY_OPTIONS = "r.option_name LIKE 'claude\\_cowork\\_%' OR r.option_name LIKE 'tracy\\_%' OR r.option_name LIKE '\\_tracy\\_%'"
# Claude Cowork's content uid (`_tracy_content_uid`) and Tracy's other marks: the copy's, minted
# again for rows that came over without one (sync-wordpress-after.php).
TRACY_POSTMETA = "r.meta_key LIKE '\\_tracy\\_%'"

# `_menu_item_object_id` names a post or a term, as the item's `_menu_item_type` says.
MENU_OBJECT = ("meta_key = '_menu_item_object_id' AND post_id IN (SELECT m.post_id FROM {{postmeta}} m"
               " WHERE m.meta_key = '_menu_item_type' AND m.meta_value = '{kind}')")
# `term_relationships.object_id` names a post, a link under `link_category`, or — under Polylang's
# `term_language` and `term_translations` — a term: Polylang files a term's language and its
# translation group as relationships of the term itself.
TERM_OBJECT_TAXONOMIES = ("term_language", "term_translations")
TT_OF = "term_taxonomy_id IN (SELECT tt.term_taxonomy_id FROM {{term_taxonomy}} tt WHERE tt.taxonomy {cmp})"
_TERM_OBJECTS = ", ".join(sql_str(t) for t in TERM_OBJECT_TAXONOMIES)
TT_OF_POST = TT_OF.format(cmp=f"NOT IN ('link_category', {_TERM_OBJECTS})")
TT_OF_LINK = TT_OF.format(cmp="= 'link_category'")
TT_OF_TERM = TT_OF.format(cmp=f"IN ({_TERM_OBJECTS})")


def theme_mod_entity(path: tuple) -> str | None:
    """Only WordPress's documented theme-mod reference paths name records."""
    if len(path) == 1 and path[0] in ("custom_logo", "custom_css_post_id", "header_video"):
        return "posts"
    if len(path) == 2 and path[0] == "nav_menu_locations":
        return "terms"
    if path == ("header_image_data", "attachment_id"):
        return "posts"
    return None


class Layout(NamedTuple):
    """Where a serialized value names records: `entity(path)` says which kind of record the value at
    a path (its keys from the top) names, or None; `containers` are paths whose value must be readable
    PHP (a custom-serialized payload there could hide a reference)."""
    entity: Callable[[tuple], str | None]
    containers: frozenset = frozenset()


THEME_MODS = Layout(theme_mod_entity, frozenset({("header_image_data",), ("nav_menu_locations",)}))


def polylang_group(entity: str) -> Layout:
    """A Polylang translation group (`post_translations` / `term_translations` description): language
    slug → the post's or term's number. Polylang Pro's `sync` entry maps languages to languages."""
    return Layout(lambda path: entity if len(path) == 1 and path[0] != "sync" else None)


# Polylang's settings (`polylang` option): the menu shown at each theme location, per language.
POLYLANG_SETTINGS = Layout(lambda path: "terms" if len(path) == 4 and path[0] == "nav_menus" else None,
                           frozenset({("nav_menus",)}))


def visit_serialized(data: bytes, visit, layout: Layout) -> bytes:
    """Walk one complete serialized value, retaining all non-reference bytes and representations."""
    try:
        result, end = _walk(data, 0, b"", b"", 0, visit, (), layout)
        if end != len(data):
            raise _Unreadable(end)
        return result
    except _Unreadable:
        raise ValueError("WordPress serialized references cannot be safely read or renumbered") from None


def visit_theme_mods(data: bytes, visit) -> bytes:
    """Walk complete serialized theme mods, retaining all non-reference bytes and representations."""
    return visit_serialized(data, visit, THEME_MODS)


class Serialized(NamedTuple):
    """Rows of one table whose column holds serialized PHP naming records (`layout`): `name` is the
    column that names the row. `strict`: a value that cannot be read stops the merge; otherwise it
    names nothing, as it names nothing to the plugin that reads it (`maybe_unserialize` gives up)."""
    table: str
    name: str
    column: str
    where: str
    layout: Layout
    strict: bool = True


SERIALIZED_REFS = {
    "posts": (
        Serialized("options", "option_name", "option_value", "option_name LIKE 'theme\\_mods\\_%'", THEME_MODS),
        Serialized("term_taxonomy", "term_taxonomy_id", "description", "taxonomy = 'post_translations'",
                   polylang_group("posts"), strict=False),
    ),
    "terms": (
        Serialized("options", "option_name", "option_value", "option_name LIKE 'theme\\_mods\\_%'", THEME_MODS),
        Serialized("options", "option_name", "option_value", "option_name = 'polylang'", POLYLANG_SETTINGS),
        Serialized("term_taxonomy", "term_taxonomy_id", "description", "taxonomy = 'term_translations'",
                   polylang_group("terms"), strict=False),
    ),
}


class SerializedReferences:
    """Typed serialized references of one kind of record, used for both allocating IDs and moving
    them (`IdMap` `typedRefs`): the theme mods' logo and menus, Polylang's translation groups and
    its per-language menus."""

    def __init__(self, entity: str, sources: tuple = ()):
        self.entity = entity
        self.sources = sources or SERIALIZED_REFS[entity]

    @staticmethod
    def rows(mapper, schema: str, source: Serialized):
        if not all(mapper.column_exists(schema, source.table, c) for c in (source.name, source.column)):
            return []
        return [(bytes.fromhex(name), bytes.fromhex(value)) for name, value in mapper.sql.run(
            f"SELECT HEX(CAST({q(source.name)} AS BINARY)), HEX({q(source.column)}) FROM {q(schema)}.{q(mapper.table(source.table))}"
            f" WHERE ({source.where}) AND {q(source.column)} IS NOT NULL;")]

    def visit(self, data: bytes, source: Serialized, visit) -> bytes:
        if not source.strict:
            # Not serialized PHP at all, or not whole: no number Polylang would read.
            try:
                return visit_serialized(data, visit, source.layout)
            except ValueError:
                return data
        return visit_serialized(data, visit, source.layout)

    def read(self, mapper, schema: str) -> set[int]:
        found = set()

        def collect(entity, number):
            if entity == self.entity:
                found.add(number)
            return number

        for source in self.sources:
            for _, data in self.rows(mapper, schema, source):
                self.visit(data, source, collect)
        return found

    def rewrite(self, mapper, schema: str, pairs: list[tuple[int, int]]) -> None:
        mapping = dict(pairs)
        updates = []
        for source in self.sources:
            for name, data in self.rows(mapper, schema, source):
                result = self.visit(data, source, lambda entity, number:
                                    mapping.get(number, number) if entity == self.entity else number)
                if result != data:
                    updates.append(f"UPDATE {q(schema)}.{q(mapper.table(source.table))}"
                                   f" SET {q(source.column)} = X'{result.hex()}'"
                                   f" WHERE CAST({q(source.name)} AS BINARY) = X'{name.hex()}' AND ({source.where});")
        if updates:
            mapper.sql.run("\n".join(updates))


# WooCommerce rows that name a post by its number: an order IS a post number (HPOS keeps the
# placeholder post and `wc_orders.id` equal; the legacy store keeps the order as the post), and its
# lines, addresses, meta and lookups name it as `order_id`; lines and lookups name products and
# variations (posts too). Renumbered with the post, or a live order placed under a number the copy
# already holds stays on that number and attaches to the copy's post (#107). A table or column a
# site lacks is passed over (`column_exists`).
WOOCOMMERCE_POST_REFS = (
    ("wc_orders", "id", None), ("wc_orders", "parent_order_id", None),
    ("wc_orders_meta", "order_id", None), ("wc_order_addresses", "order_id", None),
    ("wc_order_operational_data", "order_id", None), ("woocommerce_order_items", "order_id", None),
    ("woocommerce_order_itemmeta", "meta_value", "meta_key IN ('_product_id', '_variation_id')"),
    ("woocommerce_downloadable_product_permissions", "order_id", None),
    ("woocommerce_downloadable_product_permissions", "product_id", None),
    ("wc_order_stats", "order_id", None), ("wc_order_stats", "parent_id", None),
    ("wc_order_product_lookup", "order_id", None), ("wc_order_product_lookup", "product_id", None),
    ("wc_order_product_lookup", "variation_id", None),
    ("wc_order_tax_lookup", "order_id", None), ("wc_order_coupon_lookup", "order_id", None),
    ("wc_order_coupon_lookup", "coupon_id", None),
    ("wc_product_meta_lookup", "product_id", None),
)


# The taxonomy rows the copy's own relationships name that the base does not hold (a post filed or a
# menu item placed by Tracy): the SELECT `DbMerge.in_use_rows` reads, `{ours.…}`/`{base.…}` its tables.
NEW_RELATIONSHIPS = ("SELECT c.term_taxonomy_id FROM {ours.term_relationships} c WHERE NOT EXISTS"
                     " (SELECT 1 FROM {base.term_relationships} x WHERE x.object_id = c.object_id"
                     " AND x.term_taxonomy_id = c.term_taxonomy_id)")
RELATIONSHIP_COLUMNS = ("term_relationships.object_id", "term_relationships.term_taxonomy_id")
# Post meta WordPress keeps one of per post (`get_post_meta($id, $key, true)` everywhere it reads
# them): a row both sites added for one post is one row (`IdMap.align_single`, #118). Not a key that
# may hold several values on purpose (`_wp_old_slug`: one row per former address).
SINGLE_POSTMETA = ", ".join(sql_str(k) for k in (
    "_wp_page_template", "_thumbnail_id", "_wp_attachment_image_alt", "_wp_attached_file",
    "_wp_attachment_metadata", "_edit_last", "_wp_desired_post_slug", "_wp_trash_meta_status",
    "_wp_trash_meta_time", "_menu_item_type", "_menu_item_menu_item_parent", "_menu_item_object_id",
    "_menu_item_object", "_menu_item_target", "_menu_item_classes", "_menu_item_xfn", "_menu_item_url"))


POLICY = {
    "tracyTables": re.compile(r"^claude_cowork_"),
    "tracyRows": {
        "options": f"({TRACY_OPTIONS} OR {VOLATILE_OPTIONS})",
        "usermeta": f"({VOLATILE_USERMETA})",
        "postmeta": f"({VOLATILE_POSTMETA} OR {TRACY_POSTMETA})",
    },
    "noiseRows": {
        # The copy's own auto-drafts come and go as someone opens its wp-admin: no move of the copy.
        "posts": f"(r.post_status = {sql_str(AUTO_DRAFT)})",
        "options": f"({VOLATILE_OPTIONS})",
        "usermeta": f"({VOLATILE_USERMETA})",
        "postmeta": f"({VOLATILE_POSTMETA})",
    },
    # Logs, queues, caches and sessions of WordPress plugins — state of each running site, not the
    # site: Action Scheduler's queue and log, Wordfence's tables (its hits, logins, its own copy of
    # its settings it rewrites on every scan), Yoast's indexables (rebuilt from the posts), any
    # `…_log(s)`, `…_session(s)`, `…_cache`, `…_queue`, `…_hits`.
    "ignoreTables": TableNames(
        names=("wc_admin_notes", "wc_admin_note_actions", "wc_order_stats",
               "wc_order_product_lookup", "wc_customer_lookup"),
        patterns=(r"^actionscheduler_", r"^wf[a-z]", r"^yoast_indexable(_hierarchy)?$", r"^yoast_migrations$",
                  r"(^|_)(logs?|sessions?|cache|queue|hits)$")),
    # A category, tag or menu the live site deleted stays while the copy's own new or moved rows use it
    # (`DbMerge.in_use_rows`, #119): the taxonomy rows its new relationships name (a post filed in a
    # category, a menu item in a menu), and those rows' terms.
    "inUseParents": {
        "term_taxonomy": ("term_taxonomy_id", NEW_RELATIONSHIPS, RELATIONSHIP_COLUMNS),
        "terms": ("term_id", f"SELECT tt.term_id FROM {{ours.term_taxonomy}} tt WHERE tt.term_taxonomy_id IN ({NEW_RELATIONSHIPS})",
                  RELATIONSHIP_COLUMNS + ("term_taxonomy.term_id", "term_taxonomy.term_taxonomy_id")),
    },
    "appendTables": set(),
    # Rows that belong to a record (its meta, its terms' links), merged as any other but not counted
    # as records the live site brought (`live_sync.py` `records`): a new post with its meta is one.
    "uncountedTables": {"postmeta", "termmeta", "commentmeta", "usermeta", "term_relationships", "term_taxonomy",
                        "wc_orders_meta", "wc_order_addresses", "wc_order_operational_data",
                        "woocommerce_order_items", "woocommerce_order_itemmeta"},
    # HPOS reserves the order number with a post row. Keep it, but count the order's own row once.
    "uncountedRows": {"posts": {"post_type": {"shop_order_placehold"}}},
    # Counters WordPress recounts from the rows (sync-wordpress-after.php): not compared; a table that
    # took rows from the live site is recounted.
    "derivedColumns": {
        "posts": {"comment_count"},
        "term_taxonomy": {"count"},
    },
    # The source tables of those counters can change while the counter's own row stays put.
    "rebuildDependencies": {
        "term_relationships": {"term_taxonomy"},
        "posts": {"posts", "term_taxonomy"},
        "term_taxonomy": {"term_taxonomy"},
        "comments": {"posts"},
    },
    # Stamped by every save: when both sites saved one post, the live site's stamp, not a conflict.
    "volatileColumns": {"post_modified", "post_modified_gmt", "link_updated"},
    # A column of a table the adapter does not know, named as if it held a post's, a user's, a term's
    # or a comment's number (a WooCommerce lookup's `product_id`, an SEO plugin's `object_id`).
    "refName": re.compile(r"(^|_)(post|object|user|author|term|term_taxonomy|comment|product|order|attachment)_?id$",
                          re.I),
    # Order matters: a record's number moves before the records that name it are compared.
    "entities": [
        ("users", {"key": "ID",
                   "refs": [("usermeta", "user_id", None), ("posts", "post_author", None),
                            ("comments", "user_id", None), ("links", "link_owner", None)]}),
        ("posts", {"key": "ID", "typedRefs": SerializedReferences("posts"),
                   "refs": [("posts", "post_parent", None), ("postmeta", "post_id", None),
                            ("comments", "comment_post_ID", None),
                            ("term_relationships", "object_id", TT_OF_POST),
                            # A featured image, a menu item's parent item and what it opens.
                            ("postmeta", "meta_value", "meta_key IN ('_thumbnail_id', '_menu_item_menu_item_parent')"),
                            ("postmeta", "meta_value", MENU_OBJECT.format(kind="post_type")),
                            ("options", "option_value",
                             "option_name IN ('page_on_front', 'page_for_posts', 'wp_page_for_privacy_policy',"
                             " 'site_logo', 'site_icon')"),
                            *WOOCOMMERCE_POST_REFS],
                   # The post's number written into text: its guid's `?p=`, an image's class and a
                   # block's attributes in the content of the live site's posts.
                   "texts": [("posts", "guid", "?p={id}"), ("posts", "guid", "?page_id={id}"),
                             ("posts", "guid", "attachment_id={id}"),
                             ("posts", "post_content", "wp-image-{id}"),
                             ("posts", "post_content", '{{"id":{id}'),
                             ("posts", "post_content", '{{"ref":{id}')]}),
        ("terms", {"key": "term_id", "typedRefs": SerializedReferences("terms"),
                   "refs": [("term_taxonomy", "term_id", None), ("term_taxonomy", "parent", None),
                            ("termmeta", "term_id", None),
                            # Polylang: a term's language and translation group.
                            ("term_relationships", "object_id", TT_OF_TERM),
                            ("postmeta", "meta_value", MENU_OBJECT.format(kind="taxonomy")),
                            ("options", "option_value",
                             "option_name IN ('default_category', 'default_link_category', 'default_email_category')")]}),
        ("term_taxonomy", {"key": "term_taxonomy_id",
                           "refs": [("term_relationships", "term_taxonomy_id", None)]}),
        ("comments", {"key": "comment_ID",
                      "refs": [("comments", "comment_parent", None), ("commentmeta", "comment_id", None)]}),
        ("links", {"key": "link_id",
                   "refs": [("term_relationships", "object_id", TT_OF_LINK)]}),
        # Meta rows: nothing points at their numbers, but both sites add them under the same ones.
        ("postmeta", {"key": "meta_id", "single": {"natural": ("post_id", "meta_key"),
                                                     "where": f"meta_key IN ({SINGLE_POSTMETA})"}}),
        ("termmeta", {"key": "meta_id"}),
        ("commentmeta", {"key": "meta_id"}),
        ("usermeta", {"key": "umeta_id"}),
    ],
    "normalise": [],
}


def ignored_tables(prefix: str) -> dict:
    """POLICY's ignoreTables for live-pull.mjs (TRACY_SYNC_IGNORED_TABLES): the plugins' logs, queues,
    caches and sessions the merge never takes from the live site, so their moving while it is read
    (Action Scheduler's queue on every WP-Cron tick, Wordfence's hits) is no reason to read it
    again. `{prefix, names, patterns}`, the patterns over the name without the prefix; `{}` when the
    prefix is not known."""
    if not prefix:
        return {}
    rules = POLICY["ignoreTables"]
    return {"prefix": prefix, "names": sorted(rules.names), "patterns": [p.pattern for p in rules.patterns]}


# ── wp-config.php ──────────────────────────────────────────────────────────────────────────────

# Constants that belong to where the site runs, never to the customer's site: the copy's own value
# wins whatever either side did (its database, its address, its keys and salts, its hosting's
# paths, caches and file access). Said by name, by prefix, or by suffix.
ENVIRONMENT_CONSTANTS = frozenset({
    "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_HOST", "DB_CHARSET", "DB_COLLATE",
    "WP_HOME", "WP_SITEURL", "ABSPATH",
    "AUTH_KEY", "SECURE_AUTH_KEY", "LOGGED_IN_KEY", "NONCE_KEY",
    "AUTH_SALT", "SECURE_AUTH_SALT", "LOGGED_IN_SALT", "NONCE_SALT",
    "WP_CONTENT_DIR", "WP_CONTENT_URL", "WP_PLUGIN_DIR", "WP_PLUGIN_URL", "PLUGINDIR", "WPMU_PLUGIN_DIR",
    "WPMU_PLUGIN_URL", "UPLOADS", "WP_TEMP_DIR", "FS_METHOD", "FS_CHMOD_DIR", "FS_CHMOD_FILE",
    "COOKIE_DOMAIN", "COOKIEPATH", "SITECOOKIEPATH", "ADMIN_COOKIE_PATH", "PLUGINS_COOKIE_PATH", "COOKIEHASH",
    "DOMAIN_CURRENT_SITE", "PATH_CURRENT_SITE", "SITE_ID_CURRENT_SITE", "BLOG_ID_CURRENT_SITE",
    "FORCE_SSL_ADMIN", "FORCE_SSL_LOGIN", "WP_CACHE", "WP_MEMORY_LIMIT", "WP_MAX_MEMORY_LIMIT",
    "DISABLE_WP_CRON", "ALTERNATE_WP_CRON", "WP_ENVIRONMENT_TYPE", "WP_DEVELOPMENT_MODE",
    "CUSTOM_USER_TABLE", "CUSTOM_USER_META_TABLE", "WP_ALLOW_MULTISITE", "MULTISITE", "SUBDOMAIN_INSTALL",
})
ENVIRONMENT_PREFIXES = ("DB_", "FTP_", "WP_REDIS_", "REDIS_", "WP_CACHE_", "MEMCACHE", "WPE_", "WPCOM_", "SSH_")
ENVIRONMENT_SUFFIXES = ("_KEY", "_SALT", "_PASSWORD", "_SECRET", "_TOKEN")


def environment_constant(name: str) -> bool:
    upper = name.upper()
    return (upper in ENVIRONMENT_CONSTANTS or upper.startswith(ENVIRONMENT_PREFIXES)
            or upper.endswith(ENVIRONMENT_SUFFIXES))


_IDENT = re.compile(r"[A-Za-z0-9_\x80-\uffff]")


def _skip_string(src: str, i: int) -> int:
    quote = src[i]
    i += 1
    while i < len(src):
        if src[i] == "\\":
            i += 2
            continue
        if src[i] == quote:
            return i + 1
        i += 1
    return len(src)


def _skip_comment(src: str, i: int) -> int | None:
    if src.startswith("/*", i):
        end = src.find("*/", i + 2)
        return len(src) if end < 0 else end + 2
    if src[i] == "#" or src.startswith("//", i):
        end = src.find("\n", i)
        return len(src) if end < 0 else end
    return None


def _string_value(literal: str) -> str | None:
    """A PHP string literal's text when it is a plain one, else None."""
    m = re.fullmatch(r"'((?:[^'\\]|\\.)*)'", literal, re.S)
    if m:
        return re.sub(r"\\(['\\])", r"\1", m.group(1))
    m = re.fullmatch(r'"([^"\\$]*)"', literal)
    return m.group(1) if m else None


class Define:
    """One `define('NAME', value);` statement: its span in the file, its value's span and text."""

    def __init__(self, name, start, end, value_start, value_end, src):
        self.name, self.start, self.end = name, start, end
        self.value_start, self.value_end = value_start, value_end
        self.value = src[value_start:value_end].strip()
        self.text = src[start:end]


def scan_config(src: str):
    """wp-config.php's `define` statements and its `$table_prefix` assignments, read past comments
    and strings: ([Define], [(start, end) of each `$table_prefix = …;`]). None when a define cannot
    be read to its end (an unclosed call)."""
    defines, prefixes = [], []
    i, n = 0, len(src)
    while i < n:
        skipped = _skip_comment(src, i)
        if skipped is not None:
            i = skipped
            continue
        ch = src[i]
        if ch in "'\"":
            i = _skip_string(src, i)
            continue
        if src.startswith("$table_prefix", i) and not _IDENT.match(src[i + 13:i + 14] or " "):
            end = _statement_end(src, i)
            if end is None:
                return None
            prefixes.append((i, end))
            i = end
            continue
        if (src[i:i + 6].lower() == "define" and (i == 0 or not _IDENT.match(src[i - 1]))
                and not _IDENT.match(src[i + 6:i + 7] or " ")):
            parsed = _define_at(src, i)
            if parsed is None:
                return None
            if parsed is not False:
                defines.append(parsed)
                i = parsed.end
                continue
        i += 1
    return defines, prefixes


def _statement_end(src: str, i: int) -> int | None:
    """The index past the `;` ending the statement that starts at `i` (strings and parentheses
    followed)."""
    depth = 0
    n = len(src)
    while i < n:
        skipped = _skip_comment(src, i)
        if skipped is not None:
            i = skipped
            continue
        ch = src[i]
        if ch in "'\"":
            i = _skip_string(src, i)
            continue
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif ch == ";" and depth <= 0:
            return i + 1
        i += 1
    return None


def _define_at(src: str, start: int):
    """The Define starting at `start`; False when the word is not a call with a string name (left
    alone, part of the surrounding code); None when the call never closes."""
    i = start + 6
    while i < len(src) and src[i] in " \t\r\n":
        i += 1
    if src[i:i + 1] != "(":
        return False
    i += 1
    while i < len(src) and src[i] in " \t\r\n":
        i += 1
    if src[i:i + 1] not in ("'", '"'):
        return False
    name_end = _skip_string(src, i)
    name = _string_value(src[i:name_end])
    if not name:
        return False
    i = name_end
    while i < len(src) and src[i] in " \t\r\n":
        i += 1
    if src[i:i + 1] != ",":
        return False
    value_start = i + 1
    depth, i = 0, value_start
    while i < len(src):
        skipped = _skip_comment(src, i)
        if skipped is not None:
            i = skipped
            continue
        ch = src[i]
        if ch in "'\"":
            i = _skip_string(src, i)
            continue
        if ch in "([":
            depth += 1
        elif ch in ")]":
            if depth == 0 and ch == ")":
                break
            depth -= 1
        elif ch == "," and depth == 0:
            # define()'s third argument (case-insensitive, long gone): the value ends here.
            break
        i += 1
    else:
        return None
    value_end = i
    while i < len(src) and src[i] != ")":
        i += 1
    if i >= len(src):
        return None
    end = i + 1
    j = end
    while j < len(src) and src[j] in " \t":
        j += 1
    if src[j:j + 1] == ";":
        end = j + 1
    return Define(name, start, end, value_start, value_end, src)


def _skeleton(src: str, defines, prefixes) -> str:
    """The file with its defines and table prefix taken out and its blank space folded: what is left
    is code the merge does not merge by constant."""
    spans = sorted([(d.start, d.end) for d in defines] + list(prefixes))
    out, last = [], 0
    for a, b in spans:
        out.append(src[last:a])
        last = b
    out.append(src[last:])
    return re.sub(r"\s+", " ", "".join(out)).strip()


def _insert_point(src: str) -> int:
    """Where a new constant goes: above WordPress's own "stop editing" line, else above the line that
    loads wp-settings.php, else right after the opening tag."""
    for pattern in (r"^.*That's all, stop editing.*$", r"^.*wp-settings\.php.*$"):
        m = re.search(pattern, src, re.M)
        if m:
            return m.start()
    m = re.match(r"<\?php[^\n]*\n", src)
    return m.end() if m else 0


def merge_wp_config(base: bytes, ours: bytes, theirs: bytes, decisions: dict, path: str):
    """wp-config.php merged constant by constant: the environment's constants stay the copy's, every
    other `define` takes the side that changed it (added and removed included). Code of the live
    site's file outside its defines that changed since the base is not taken: it is one conflict
    (`(code)`), the copy's kept. Returns (bytes, conflicts), or None when a file cannot be read."""
    texts = [b.decode("utf-8", "surrogateescape") for b in (base, ours, theirs)]
    scans = [scan_config(t) for t in texts]
    if any(s is None for s in scans):
        return None
    by_name = []
    twice = set()
    for defines, _ in scans:
        seen: dict[str, Define] = {}
        for d in defines:
            if d.name in seen:
                twice.add(d.name)
            seen.setdefault(d.name, d)
        by_name.append(seen)
    b, o, t = by_name
    out = texts[1]
    conflicts = []
    edits = []  # (start, end, text) on `out`, applied from the end
    additions = []
    for name in sorted(set(b) | set(t)):
        if environment_constant(name):
            continue
        vb = b[name].value if name in b else None
        vo = o[name].value if name in o else None
        vt = t[name].value if name in t else None
        if vt == vb or vo == vt:
            continue
        cid = f"file:{path}#{name}"
        # Defined twice in one of the files (PHP keeps the first, a plugin may add a guarded second):
        # which one the live site changed cannot be said, so the copy's stay.
        if name in twice or (vo != vb and decisions.get(cid) != "theirs"):
            conflicts.append({"id": cid, "kind": "setting", "path": path, "setting": name,
                              "base": vb, "ours": vo, "theirs": vt})
            continue
        if vt is None:
            d = o[name]
            start, end = d.start, d.end
            # The whole line when the define stood alone on it.
            line_start = out.rfind("\n", 0, start) + 1
            line_end = out.find("\n", end)
            line_end = len(out) if line_end < 0 else line_end + 1
            if out[line_start:start].strip() == "" and out[end:line_end].strip() == "":
                start, end = line_start, line_end
            edits.append((start, end, ""))
        elif name in o:
            d = o[name]
            # The live site's value, with the copy's own spacing around it.
            lead = out[d.value_start:d.value_end]
            pad_l = lead[:len(lead) - len(lead.lstrip())]
            pad_r = lead[len(lead.rstrip()):]
            edits.append((d.value_start, d.value_end, pad_l + vt + pad_r))
        else:
            additions.append(t[name].text.strip())
    for start, end, text in sorted(edits, reverse=True):
        out = out[:start] + text + out[end:]
    if additions:
        at = _insert_point(out)
        out = out[:at] + "".join(a + "\n" for a in additions) + out[at:]
    if _skeleton(texts[0], *scans[0]) != _skeleton(texts[2], *scans[2]) and decisions.get(f"file:{path}#(code)") != "theirs":
        conflicts.append({"id": f"file:{path}#(code)", "kind": "setting", "path": path, "setting": "(code)",
                          "base": None, "ours": None, "theirs": None, "reason": "code-outside-constants"})
    return out.encode("utf-8", "surrogateescape"), conflicts


# ── the first read of the live site's files ────────────────────────────────────────────────────

LARGE_FILE_BYTES = 50 * 1024 * 1024


def first_manifest(repo: str, rev: str, webroot: str) -> dict[str, str]:
    """`{path: sha1}` of the copy as built: every file of `rev`'s tree (its bytes' sha1, not git's
    blob id), and the files over 50 MiB the history never holds, from the webroot. Handed to
    live-pull.mjs as the last read's manifest, so a first read takes only the files the live site
    holds differently — webroot-sync.sh lays them over `rev`."""
    import hashlib
    import os
    import subprocess

    git = ["git", "-c", "gc.auto=0", f"--git-dir={repo}"]
    listing = subprocess.run([*git, "ls-tree", "-r", "-z", "--full-tree", rev], stdout=subprocess.PIPE,
                             check=True).stdout
    blobs = []
    for record in listing.split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, kind, oid = meta.decode().split(" ")
        if kind == "blob" and mode in ("100644", "100755"):
            blobs.append((path.decode("utf-8", "surrogateescape"), oid))
    out: dict[str, str] = {}
    cat = subprocess.Popen([*git, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for path, oid in blobs:
            cat.stdin.write(oid.encode() + b"\n")
            cat.stdin.flush()
            header = cat.stdout.readline().split()
            if len(header) != 3:
                continue
            size, digest, left = int(header[2]), hashlib.sha1(), int(header[2])
            while left:
                chunk = cat.stdout.read(min(left, 1 << 20))
                if not chunk:
                    raise RuntimeError("git cat-file stopped")
                digest.update(chunk)
                left -= len(chunk)
            cat.stdout.read(1)  # the newline after each object
            out[path] = digest.hexdigest()
    finally:
        cat.stdin.close()
        cat.stdout.close()
        cat.wait()
    for base, dirs, files in os.walk(webroot):
        dirs[:] = [d for d in dirs if not (base == webroot and d == ".git")]
        for name in files:
            full = os.path.join(base, name)
            if os.path.islink(full) or os.path.getsize(full) <= LARGE_FILE_BYTES:
                continue
            digest = hashlib.sha1()
            with open(full, "rb") as handle:
                for chunk in iter(lambda: handle.read(1 << 20), b""):
                    digest.update(chunk)
            out[os.path.relpath(full, webroot).replace(os.sep, "/")] = digest.hexdigest()
    return out


def main(argv: list[str]) -> int:
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="WordPress's half of Sync from live")
    sub = parser.add_subparsers(dest="op", required=True)
    first = sub.add_parser("first-manifest")
    for flag in ("--repo", "--rev", "--webroot"):
        first.add_argument(flag, required=True)
    sub.add_parser("volatile-rows")
    sub.add_parser("row-names")
    ignored = sub.add_parser("ignored-tables")
    ignored.add_argument("--prefix", default="")
    args = parser.parse_args(argv)
    if args.op == "volatile-rows":
        print(json.dumps(volatile_rows()))
        return 0
    if args.op == "row-names":
        print(json.dumps(ROW_NAMES))
        return 0
    if args.op == "ignored-tables":
        print(json.dumps(ignored_tables(args.prefix)))
        return 0
    if args.op == "first-manifest":
        json.dump(first_manifest(args.repo, args.rev, args.webroot), sys.stdout)
        print()
    return 0


if __name__ == "__main__":
    import sys as _sys

    raise SystemExit(main(_sys.argv[1:]))
