#!/usr/bin/env python3
"""Three-way merge of an imported site's copy with a fresh read of its live site ("Sync from live",
plan tasks/ke-hoach-dong-bo-tu-live.md).

    base    the live site as it was last read: at import, or at the previous sync
    ours    the copy on this host, with everything Tracy and its agent changed on it
    theirs  the live site as read now, with everything the customer changed since

The result is ours + (theirs - base). A place both sides changed in two different ways is a
CONFLICT, and conflicts are never guessed: each one is listed with a stable id, the copy's version
stays in the result, and a decisions file (`{"<id>": "ours" | "theirs"}`) given to a later run of the
same merge picks the side. The merge is deterministic, so a re-run with decisions sees the same ids.

Two halves, both pure with respect to the copy (they never write its webroot or its database):

    files   three commits of the site's webroot repo → one tree, with git plumbing and a private index
    db      three MariaDB schemas → the scratch schema that holds a frozen copy of ours, merged in place

Why rows and not statements: Tracy keeps no values of what it changed in the database (only pointers,
`site_write`), and the agent's shell writes leave no record at all, so the only complete account of
"what the copy changed" is the copy itself compared with the base. The same holds for the live side.

Usage (the answer is one JSON object on stdout):
    live_sync.py files --repo R --base REV --ours REV --theirs REV --platform P [--decisions F]
    live_sync.py normalise --schema S --platform P --prefix X   (a read of the live site, before `db`)
    live_sync.py db --base-schema B --ours-schema M --theirs-schema T --work-schema W --platform P
                    --prefix X [--decisions F] [--pushed F]   (SQL client: env TRACY_SYNC_SQL, a JSON argv)

`--pushed` names what "Sync to live" (lib/live_push.py, webroot-live-push.sh) wrote on the live site
since the base was read: those places are taken as base from the side the push says before anything is
compared (`DbMerge.seed_pushed`), so the push's own records do not come back as the live site's.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import importlib.util
import json
import time
import os
import re
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# One list each, kept where it is used first: what provision writes into Joomla's configuration.php
# for THIS environment, and which files are Tracy's own doors into a site. A second copy here would
# drift from the first the day someone adds a setting to the renderer.
_RENDER = _load("render_configuration", HERE.parent / "provision" / "render_configuration.py")
_EXPORT = _load("export_package", HERE / "export-package.py")

# Joomla settings that belong to the environment, never to the customer's site: the copy's own values
# win whatever either side did. `dbprefix` too: the copy's tables carry it, and a dump with another
# prefix is not a change this merge can carry.
JOOMLA_ENVIRONMENT_SETTINGS = frozenset(_RENDER.QUOTED | _RENDER.BARE | {"dbprefix"})

CONFIG_FILES = {"joomla": "configuration.php", "wordpress": "wp-config.php"}

# Files that bind a site to the server it runs on, like the environment settings above: always the
# copy's own, whatever the live site carries. WordPress's object cache drop-in talks to a cache
# server (Redis, Memcached) that the copy does not have — taken from the live site, every request
# of the copy answered 500 "Error establishing a Redis connection" while its `WP_REDIS_*` settings
# stayed the copy's (#106).
ENVIRONMENT_FILES = {"wordpress": frozenset({"wp-content/object-cache.php"})}

# WordPress's own rules, its address rewrite and its wp-config.php merge (lib/live_sync_wordpress.py).
_WORDPRESS = _load("live_sync_wordpress", HERE / "live_sync_wordpress.py")

GIT_CONFIG = ("-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "gc.autoDetach=false")


def read_decisions(path: str | None) -> dict[str, str]:
    if not path:
        return {}
    raw = json.loads(Path(path).read_text())
    return {str(k): v for k, v in raw.items() if v in ("ours", "theirs")}


# ── files ────────────────────────────────────────────────────────────────────────────────────


def git(repo: str, *args: str, data: bytes | None = None, env: dict | None = None) -> bytes:
    return subprocess.run(
        ["git", *GIT_CONFIG, f"--git-dir={repo}", *args],
        input=data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
        env={**os.environ, **(env or {})},
    ).stdout


def ls_tree(repo: str, rev: str) -> dict[str, tuple[str, str]]:
    """path → (mode, object id) for every entry of `rev`'s tree, recursively."""
    entries = {}
    for record in git(repo, "ls-tree", "-r", "-z", "--full-tree", rev).split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, _kind, oid = meta.decode().split(" ")
        entries[path.decode("utf-8", "surrogateescape")] = (mode, oid)
    return entries


def blob(repo: str, oid: str) -> bytes:
    return git(repo, "cat-file", "blob", oid)


def write_blob(repo: str, data: bytes) -> str:
    return git(repo, "hash-object", "-w", "--stdin", data=data).decode().strip()


def is_binary(data: bytes) -> bool:
    return b"\0" in data[:8000]


def merge_text(repo: str, base: bytes, ours: bytes, theirs: bytes, favour: str | None = None) -> tuple[bytes, bool]:
    """`git merge-file` on three versions: the merged bytes, and whether it merged cleanly. A failed
    merge's bytes carry the conflict markers, kept for whoever resolves it. `favour="ours"`: the hunks
    both sides changed take the copy's lines (`favour_ours`), every other hunk merges as usual —
    never a failure; the flag then says whether every line the live site wrote is in the result
    (False: a hunk took the copy's lines over the live site's)."""
    with tempfile.TemporaryDirectory(prefix="live-sync-") as tmp:
        paths = []
        for name, data in (("ours", ours), ("base", base), ("theirs", theirs)):
            path = os.path.join(tmp, name)
            Path(path).write_bytes(data)
            paths.append(path)
        done = subprocess.run(
            ["git", "merge-file", "-p", *(["--diff3"] if favour == "ours" else []),
             "-L", "ours", "-L", "base", "-L", "theirs", *paths],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
    if done.returncode < 0 or done.returncode > 127:
        raise RuntimeError(f"git merge-file failed: {done.stderr.decode(errors='replace').strip()}")
    if favour == "ours":
        return favour_ours(done.stdout)
    return done.stdout, done.returncode == 0


CONFLICT = re.compile(
    rb"^<<<<<<< ours\n(.*?)^\|\|\|\|\|\|\| base\n(.*?)^=======\n(.*?)^>>>>>>> theirs\n", re.S | re.M)


def favour_ours(merged: bytes) -> tuple[bytes, bool]:
    """Each conflict of a diff3 merge resolved for the copy. Where the live site only ADDED lines
    next to the base lines — the customer appending CSS rules to the end of `user.css` while the agent
    appended its own, or edited the line above — the copy's side stays as it is and the customer's
    new lines follow it (those the copy already has are not repeated): nobody changed the other's
    line, so there is nothing for Tracy to win. A conflict where the live site changed or removed a
    base line the copy also changed takes the copy's lines (David, 20/10/2026: Tracy wins). Also
    answers whether no hunk of the live site's was left out (only additions met)."""
    lost = False

    def resolve(m: re.Match) -> bytes:
        nonlocal lost
        o, b, t = (x.splitlines(keepends=True) for x in m.groups())
        for side in (o, t):
            if side and not side[-1].endswith(b"\n"):
                side[-1] += b"\n"
        n = len(b)
        if t[:n] == b:  # the live site only added lines after the base lines: the copy's, then those
            return b"".join(o + [line for line in t[n:] if line not in o])
        if t[len(t) - n:] == b:  # … or only before them
            return b"".join([line for line in t[:len(t) - n] if line not in o] + o)
        lost = True
        return b"".join(o)
    out = CONFLICT.sub(resolve, merged)
    return out, not lost


SETTING = re.compile(r"^\s*public\s+\$(\w+)\s*=\s*(.*?);\s*$")


def joomla_settings(text: str) -> dict[str, str] | None:
    """Joomla's configuration.php as setting → its PHP literal, or None when a line inside the class
    is not a one-line `public $name = value;` (then the file is not one this can merge by setting)."""
    settings = {}
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if not inside:
            inside = stripped.startswith("class ") and "{" in stripped
            continue
        if stripped in ("}", "};"):
            break
        if not stripped or stripped.startswith(("//", "#", "/*", "*")):
            continue
        match = SETTING.match(line)
        if not match:
            return None
        settings[match.group(1)] = match.group(2)
    return settings if inside else None


def remove_setting(text: str, name: str) -> str:
    return re.sub(rf"^\s*public\s+\${re.escape(name)}\s*=.*?;\s*\n", "", text, flags=re.M)


def merge_joomla_config(base: bytes, ours: bytes, theirs: bytes, decisions: dict, path: str):
    """Merge configuration.php setting by setting: the environment's settings stay the copy's, every
    other setting takes the side that changed it. Returns (bytes, conflicts), or None when one of the
    three does not parse (the caller then treats the file as one conflict)."""
    texts = [b.decode("utf-8", "surrogateescape") for b in (base, ours, theirs)]
    parsed = [joomla_settings(t) for t in texts]
    if any(p is None for p in parsed):
        return None
    b, o, t = parsed
    out = texts[1]
    conflicts = []
    for name in sorted(set(b) | set(t)):
        if name in JOOMLA_ENVIRONMENT_SETTINGS:
            continue
        vb, vo, vt = b.get(name), o.get(name), t.get(name)
        if vt == vb or vo == vt:
            continue
        cid = f"file:{path}#{name}"
        if decisions.get(cid) == "ours":
            continue
        if vo != vb and decisions.get(cid) != "theirs":
            conflicts.append({"id": cid, "kind": "setting", "path": path, "setting": name,
                              "base": vb, "ours": vo, "theirs": vt})
            continue
        if vt is None:
            out = remove_setting(out, name)
        else:
            out, unset = _RENDER.substitute(out, {name: vt})
            if unset:
                return None
    return out.encode("utf-8", "surrogateescape"), conflicts


CONFIG_MERGERS = {"joomla": merge_joomla_config, "wordpress": _WORDPRESS.merge_wp_config}


# ── a column holding JSON (Joomla's params, attribs, images, urls, metadata, rules) ─────────────

_MISSING = object()
# How deep a JSON value is followed, a JSON string inside one included: past this, a key both sides
# changed is one value.
JSON_DEPTH = 12


def _json_object(text):
    """A JSON object read from text, or None: anything else — an array, a number, invalid JSON, a
    duplicated key (which would be read two ways) — is not merged key by key."""
    if not isinstance(text, str) or not text.lstrip().startswith("{"):
        return None
    def no_twins(pairs):
        out = {}
        for k, v in pairs:
            if k in out:
                raise ValueError("duplicated key")
            out[k] = v
        return out
    try:
        value = json.loads(text, object_pairs_hook=no_twins)
    except (ValueError, RecursionError):
        return None
    return value if isinstance(value, dict) else None


def _json_text(value, like: str) -> str:
    """`value` written as JSON the way `like` was: Joomla writes `json_encode` (no spaces, slashes and
    non-ASCII escaped unless told otherwise), and a site's own text keeps its own style, so the
    columns the merge rewrites read as the CMS wrote them."""
    spaced = '": ' in like or '", "' in like
    out = json.dumps(value, ensure_ascii="\\u" in like, separators=(", ", ": ") if spaced else (",", ":"))
    return out.replace("/", "\\/") if "\\/" in like else out


def _same(a, b) -> bool:
    """Equal as JSON, types included: Python's `True == 1` and `1 == 1.0` are not edits left unseen."""
    if a is _MISSING or b is _MISSING:
        return a is b
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


# How long a value of a JSON key both sides changed is shown, in characters.
JSON_VALUE_LIMIT = 120


def _shown(value) -> str | None:
    """A JSON value as a person reads it, cut short: a string as it is, anything else as JSON; None
    for a key that side removed."""
    if value is _MISSING:
        return None
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text if len(text) <= JSON_VALUE_LIMIT else text[:JSON_VALUE_LIMIT - 1] + "…"


def _merge_json(base, ours, theirs, path: list[str], clashes: list[str], depth: int,
                details: list | None = None):
    """Three versions of one JSON value, merged key by key: a key only one side changed (added or
    removed included) takes that side's; a key both changed differently keeps the copy's and is named
    in `clashes`. Objects are followed into, a string holding a JSON object too (T4's
    `jatools-config`: a whole module's content in one string); any other value is one value."""
    if _same(ours, theirs) or _same(theirs, base):
        return ours
    if _same(ours, base):
        return theirs
    if depth < JSON_DEPTH:
        if all(isinstance(v, dict) for v in (base, ours, theirs)):
            out = {}
            keys = list(ours) + [k for k in theirs if k not in ours] + [k for k in base if k not in ours and k not in theirs]
            for k in keys:
                v = _merge_json(base.get(k, _MISSING), ours.get(k, _MISSING), theirs.get(k, _MISSING),
                                path + [k], clashes, depth + 1, details)
                if v is not _MISSING:
                    out[k] = v
            return out
        if all(isinstance(v, str) for v in (base, ours, theirs)):
            inner = [_json_object(v) for v in (base, ours, theirs)]
            if all(v is not None for v in inner):
                merged = _merge_json(*inner, path, clashes, depth + 1, details)
                return ours if _same(merged, inner[1]) else theirs if _same(merged, inner[2]) else _json_text(merged, ours)
    clashes.append(" › ".join(path) or "(the whole value)")
    if details is not None:
        details.append({"path": clashes[-1], "ours": _shown(ours), "theirs": _shown(theirs)})
    return ours


_LAYOUT_BETWEEN_TAGS = re.compile(r">\s+<")
_LAYOUT_RUN = re.compile(r"\s+")


def layout_text(text: str) -> str:
    """A text column as a reader sees it: whitespace between tags dropped, every other run of
    whitespace one space, none at the ends. A CMS's editor saves an article's HTML re-indented (a
    title changed in Joomla's admin rewrites the untouched fulltext's `  <li>` as `<li>`): two values
    alike here differ only in layout, which no person changed."""
    return _LAYOUT_RUN.sub(" ", _LAYOUT_BETWEEN_TAGS.sub("><", text)).strip()


def merge_json_column(base: str, ours: str, theirs: str,
                      details: list | None = None) -> tuple[str, list[str]] | None:
    """One column both sites changed, when all three versions are JSON objects: the merged text and
    the keys both changed differently (the copy's kept there), or None to leave the column whole.
    `details`, when given, receives each of those keys with both sides' values cut short
    (`{path, ours, theirs}`), for the person reading what was kept.

    Joomla keeps a module's whole content, a menu item's or an article's options, in one such column:
    compared whole, a live site that changed a hero's title and a copy that changed its eyebrow
    clashed, the copy's column stayed, and the live title was lost (David, 23/10/2026)."""
    parsed = [_json_object(v) for v in (base, ours, theirs)]
    if any(v is None for v in parsed):
        return None
    clashes: list[str] = []
    merged = _merge_json(*parsed, [], clashes, 0, details)
    if _same(merged, parsed[1]):
        return ours, clashes
    if _same(merged, parsed[2]) and not clashes:
        return theirs, clashes
    return _json_text(merged, ours), clashes



def tracy_owned(platform: str, path: str) -> bool:
    return _EXPORT.tracy_only(platform, path) is not None


def merge_files(repo: str, base: str, ours: str, theirs: str, platform: str, decisions: dict,
                prefer: str | None = None, pushed: dict | None = None) -> dict:
    """`pushed`: path → (the copy's blob "Sync to live" sent there, side) from `pushed.json` `files`
    (lib/live_push.py `record`). Side `ours`, a push: where the copy still holds that blob, the live
    site's file is the push's own result (the engine may write the same settings in its own layout),
    taken as it is, never merged back as a change of both sides. Side `theirs`, its Undo: the live
    site went back to what it held, the copy keeps Tracy's (an Undo takes nothing off the copy)."""
    pushed = pushed or {}
    # The live site's files as the base had them (a read that found no file moved): every path is
    # the copy's, so the copy's tree is the answer — without listing 40,000 files three times (7 s).
    tree_of = lambda rev: git(repo, "rev-parse", f"{rev}^{{tree}}").decode().strip()
    if tree_of(theirs) == tree_of(base):
        return {"ok": True, "tree": tree_of(ours), "conflicts": [],
                "counts": {"fromTheirs": 0, "merged": 0, "tracyOwned": 0}}
    b, o, t = ls_tree(repo, base), ls_tree(repo, ours), ls_tree(repo, theirs)
    result: dict[str, tuple[str, str]] = {}
    conflicts: list[dict] = []
    counts = {"fromTheirs": 0, "merged": 0, "tracyOwned": 0}

    for path in sorted(set(b) | set(o) | set(t)):
        eb, eo, et = b.get(path), o.get(path), t.get(path)
        chosen = eo
        if eo == et or et == eb:
            pass
        elif path in pushed and pushed[path][1] == "theirs" and CONFIG_FILES.get(platform) != path:
            pass
        elif eo is not None and et is not None and pushed.get(path, (None,))[0] == eo[1] \
                and not tracy_owned(platform, path) and CONFIG_FILES.get(platform) != path:
            chosen = et
            counts["fromTheirs"] += 1
        elif tracy_owned(platform, path):
            # Tracy's own doors: the copy's version, whatever the live site carries (a different
            # Claude Cowork release, or none).
            counts["tracyOwned"] += 1
        elif path in ENVIRONMENT_FILES.get(platform, ()):
            pass  # the copy's own, or none
        elif CONFIG_FILES.get(platform) == path:
            # 🔒 Setting by setting even when the copy left the file alone: taken whole, the live
            # site's configuration carries the live database's password and address into the copy.
            chosen, conflict = merge_both(repo, path, platform, eb, eo, et, decisions, prefer)
            if conflict:
                conflicts.append(conflict)
            # Counted whenever the result took something of the live file, a clash in it or not:
            # a CSS file merged line by line with one clash read "0 merged" (#1648).
            if chosen != eo:
                counts["merged"] += 1
        elif eo == eb:
            chosen = et
            counts["fromTheirs"] += 1
        else:
            chosen, conflict = merge_both(repo, path, platform, eb, eo, et, decisions, prefer)
            if conflict:
                conflicts.append(conflict)
            if chosen != eo:
                counts["merged"] += 1
        if chosen is not None:
            result[path] = chosen

    tree = write_tree(repo, result)
    return {"ok": True, "tree": tree, "conflicts": conflicts, "counts": counts}


def merge_both(repo, path, platform, eb, eo, et, decisions, prefer=None):
    """Both sides changed `path` differently, or it is the configuration file: (entry to keep,
    conflict or None)."""
    cid = f"file:{path}"
    # The configuration file is never taken whole: the live site's copy carries the live database's
    # credentials and address. Its decisions are per setting (`merge_joomla_config`).
    pick = None if CONFIG_FILES.get(platform) == path else decisions.get(cid)
    if pick == "theirs":
        return et, None
    if pick == "ours":
        return eo, None

    def conflict(reason, draft=None):
        entry = {"id": cid, "kind": "file", "path": path, "reason": reason,
                 "base": eb[1] if eb else None, "ours": eo[1] if eo else None,
                 "theirs": et[1] if et else None}
        if draft:
            entry["draft"] = draft
        return eo, entry

    if eb is None or eo is None or et is None:
        return conflict("added-both" if eb is None and eo and et else "delete-modify")
    if "120000" in (eb[0], eo[0], et[0]) or "160000" in (eb[0], eo[0], et[0]):
        return conflict("not-a-file")
    mode = eo[0] if et[0] == eb[0] else et[0]
    data = [blob(repo, e[1]) for e in (eb, eo, et)]
    if CONFIG_FILES.get(platform) == path:
        merged = CONFIG_MERGERS[platform](*data, decisions, path)
        if merged is None:
            return conflict("config-unreadable")
        content, setting_conflicts = merged
        if setting_conflicts:
            # The file holds the settings that merged; the conflicting ones stay the copy's until a
            # decision names them. Reported one by one, so a decision is about one setting.
            return (mode, write_blob(repo, content)), {"id": cid, "kind": "settings", "path": path,
                                                       "settings": setting_conflicts}
        return (mode, write_blob(repo, content)), None
    if any(is_binary(d) for d in data):
        return conflict("binary")
    merged, clean = merge_text(repo, *data)
    if not clean and prefer == "ours":
        # The copy's lines where both changed the same lines, the live site's everywhere else. Where
        # the live site only added lines beside the copy's, nothing of it was left out: not kept.
        kept, whole = merge_text(repo, *data, favour="ours")
        return (mode, write_blob(repo, kept)), None if whole else conflict("both-changed")[1]
    if not clean:
        return conflict("both-changed", draft=write_blob(repo, merged))
    return (mode, write_blob(repo, merged)), None


def write_tree(repo: str, entries: dict[str, tuple[str, str]]) -> str:
    """A tree object of `entries`, through an index of its own: the copy's index is never read or
    written."""
    with tempfile.TemporaryDirectory(prefix="live-sync-index-") as tmp:
        env = {"GIT_INDEX_FILE": os.path.join(tmp, "index")}
        listing = b"".join(
            f"{mode} {oid}\t".encode() + path.encode("utf-8", "surrogateescape") + b"\0"
            for path, (mode, oid) in sorted(entries.items())
        )
        git(repo, "update-index", "-z", "--index-info", data=listing, env=env)
        return git(repo, "write-tree", env=env).decode().strip()


def stat_manifest(repo: str, rev: str, stat: dict) -> dict[str, dict]:
    """The manifest of a read that found no live file moved, when no read left one: each file the live
    site lists (`stat`: path → size, mtime) named by the blob of `rev`'s tree at that path, where the
    sizes agree — `git:<oid>`, a name live-pull compares and never takes for the bytes' sha1. A file
    the tree lacks, or holds at another size (the copy's own configuration.php), has no sha1: the
    next read asks the site to hash it, and reads it where the site will not (configuration.php).
    Only `ls-tree`: no blob is read (the sha1s of the bytes cost 33 s and the site's own hashing
    7 minutes, 22/10/2026)."""
    blobs: dict[str, tuple[str, int]] = {}
    for record in git(repo, "ls-tree", "-r", "-l", "-z", "--full-tree", rev).split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, kind, oid, size = meta.decode().split()
        if kind == "blob" and mode in ("100644", "100755"):
            blobs[path.decode("utf-8", "surrogateescape")] = (oid, int(size))
    out: dict[str, dict] = {}
    for path, f in stat.items():
        entry = {"size": f.get("size"), "mtime": f.get("mtime")}
        blob = blobs.get(path)
        if blob and blob[1] == f.get("size"):
            entry["sha1"] = "git:" + blob[0]
        out[path] = entry
    return out


# ── database ─────────────────────────────────────────────────────────────────────────────────

# Per platform, by table name without the site's prefix:
#   tracyTables     Tracy's own tables: the copy's, always (Claude Cowork's registry, contracts, logs)
#   tracyRows       rows of a shared table that are Tracy's: the copy's, always (a SQL condition on
#                   the row, alias `r`)
#   ignoreTables    state of the running copy, not of the site: the copy's, never merged
#   appendTables    append-only logs: the live site's new rows come over; a new row on each side
#                   under one id keeps the copy's and counts the other as skipped, never a conflict
#   derivedColumns  columns the CMS rebuilds from others (nested sets): not compared; a table whose
#                   rows changed is listed in `rebuild`
#   rebuildDependencies tables whose derived data must be rebuilt when a source table changes
#   volatileColumns columns that change on every visit or save: when both sides changed one, the
#                   live site's value is taken and it is not a conflict
#   counterColumns  counters: when both sides moved one, the larger is taken, not a conflict
#   naturalKeys     the columns that match a row of a table with no primary key (below)
#   bookkeepingColumns, orderedTrees, dependents: below, where they are set
# Conditions of `refs` that reach the record's kind through another table of the same schema.
FIELD_CONTEXT = "field_id IN (SELECT f.id FROM {{fields}} f WHERE f.context {context})"
UCM_TYPE = "ucm_type_id IN (SELECT ct.type_id FROM {{content_types}} ct WHERE ct.type_alias = '{alias}')"
# Phoca Cart's rows that belong to one product, read from its install SQL
# (admin/install/sql/mysql/install.utf8.sql, Phoca Cart 6.1.9, PhocaCz/PhocaCart@87834868): the
# product's own tables keyed by its id, its translations, tags, labels, parameter values, related
# products, and its customer groups (`item_groups`, type 3 = product: admin/libraries/phocacart/group/
# group.php). Orders, reviews, wishlists and hits name a product but are a customer's, not the product's.
PHOCACART_PRODUCT_ROWS = [
    ("phocacart_product_categories", "product_id", None, None),
    ("phocacart_product_featured", "product_id", None, None),
    ("phocacart_product_images", "product_id", None, None),
    ("phocacart_product_files", "product_id", None, None),
    ("phocacart_product_discounts", "product_id", None, None),
    ("phocacart_product_price_groups", "product_id", None, None),
    ("phocacart_product_point_groups", "product_id", None, None),
    ("phocacart_product_stock", "product_id", None, None),
    ("phocacart_product_price_history", "product_id", None, None),
    ("phocacart_attributes", "product_id", None, None),
    ("phocacart_specifications", "product_id", None, None),
    ("phocacart_products_i18n", "id", None, None),
    ("phocacart_tags_related", "item_id", None, None),
    ("phocacart_taglabels_related", "item_id", None, None),
    ("phocacart_parameter_values_related", "item_id", None, None),
    ("phocacart_product_related", "product_a", None, None),
    ("phocacart_product_related", "product_b", None, None),
    ("phocacart_item_groups", "item_id", "type = 3", None),
]

POLICIES = {
    "joomla": {
        "tracyTables": re.compile(r"^claudecowork_"),
        "tracyRows": {
            "extensions": "(r.`element` IN ('com_claudecowork','tracyaccess') OR r.`element` LIKE 'claudecowork%')",
        },
        # `finder_*`: Smart Search's index, which each site rebuilds as its own articles are saved. Both
        # sites saving one article made the same index rows twice and held the sync for a person
        # (measured on the customer's site, 23/10/2026); the copy keeps its own index.
        # `user_keys`: "remember me" tokens, one per browser that signed in to THIS site — session
        # state like `session`, never the site's content (coordinator, 23/10/2026).
        "ignoreTables": {"session", "user_keys", "updates", "finder_links", "finder_links_terms", "finder_terms",
                         "finder_taxonomy", "finder_taxonomy_map", "finder_tokens", "finder_tokens_aggregate",
                         "finder_logging"},
        # `scheduler_logs`: Joomla 5's task scheduler logs a row on each site as visits run its tasks,
        # so both add one under the same id between two syncs (measured on a live Tracy Business
        # site, 21/10/2026: the sync stopped on "ng_scheduler_logs: live record 36").
        "appendTables": {"action_logs", "ucm_history", "messages", "scheduler_logs"},
        "derivedColumns": {
            "assets": {"lft", "rgt", "level"},
            "menu": {"lft", "rgt", "level", "path"},
            "categories": {"lft", "rgt", "level", "path"},
            "tags": {"lft", "rgt", "level", "path"},
        },
        # Tables with no primary key, matched row to row by these columns when no unique key of their
        # own does it (a unique key with no NULL column is taken first). Without a key the whole table
        # was the copy's: an article Tracy saved rewrote its tag rows, and every tag the customer
        # added on the live site was lost (#1647, 23/10/2026). `fields_values`: a field with several
        # values (checkboxes) has one row per value, so the value is part of the key.
        "naturalKeys": {
            "contentitem_tag_map": ["type_alias", "content_item_id", "tag_id"],
            "fields_values": ["field_id", "item_id", "value"],
            # Phoca Cart 6.1.9 gives it no key at all; its four columns are NOT NULL and are the row.
            "phocacart_item_groups": ["item_id", "group_id", "product_id", "type"],
        },
        # Columns a CMS restamps on every save of the record they belong to, never edited by a
        # person: not compared (a row that differs only there is the same row) and never taken on
        # their own. Unlike `derivedColumns`, nothing is rebuilt from them.
        "bookkeepingColumns": {
            "contentitem_tag_map": {"tag_date"},
        },
        # Nested-set trees whose sibling order a person sets (Joomla's own order is `lft`): the
        # columns that make one list of siblings, the parent first. A menu's top items all hang under
        # the root, one list per menu (`menutype`); a category's, one per component (`extension`).
        "orderedTrees": {
            "menu": ["parent_id", "menutype", "client_id"],
            "categories": ["parent_id", "extension"],
            "tags": ["parent_id"],
        },
        # Rows that belong to a record: when the merge keeps a record the live site deleted (Tracy
        # changed it: Tracy wins), these rows of it stay too, though the live site deleted them with
        # it. (table, column, condition, the record's column it holds — its id when None). Without
        # them the record stays half: an article with no workflow row is missing from the
        # administrator's list while the site still serves it (#1647, 23/10/2026). The other way too:
        # when the live site's new record is held (`added-both`: both sites added one under the same
        # number, in a table the adapter cannot number again), the rows the live site added with it
        # stay out of the copy and are named with it (`belonging`); taken one by one, Tracy's product
        # gained the live product's category and nothing said so (27/10/2026).
        "dependents": {
            "content": [("workflow_associations", "item_id", "extension = 'com_content.article'", None),
                        ("contentitem_tag_map", "content_item_id", "type_alias = 'com_content.article'", None),
                        ("ucm_content", "core_content_item_id", "core_type_alias = 'com_content.article'", None),
                        ("ucm_base", "ucm_item_id", UCM_TYPE.format(alias="com_content.article"), None),
                        ("fields_values", "item_id", FIELD_CONTEXT.format(context="= 'com_content.article'"), None),
                        ("content_frontpage", "content_id", None, None),
                        ("assets", "id", None, "asset_id")],
            "categories": [("contentitem_tag_map", "content_item_id", "type_alias = 'com_content.category'", None),
                           ("ucm_content", "core_content_item_id", "core_type_alias = 'com_content.category'", None),
                           ("ucm_base", "ucm_item_id", UCM_TYPE.format(alias="com_content.category"), None),
                           ("fields_values", "item_id", FIELD_CONTEXT.format(context="LIKE '%.categories'"), None),
                           ("assets", "id", None, "asset_id")],
            "tags": [("contentitem_tag_map", "tag_id", None, None)],
            "modules": [("modules_menu", "moduleid", None, None), ("assets", "id", None, "asset_id")],
            "users": [("user_usergroup_map", "user_id", None, None),
                      ("fields_values", "item_id", FIELD_CONTEXT.format(context="= 'com_users.user'"), None)],
            "contact_details": [("contentitem_tag_map", "content_item_id", "type_alias = 'com_contact.contact'", None),
                                ("ucm_content", "core_content_item_id", "core_type_alias = 'com_contact.contact'", None),
                                ("ucm_base", "ucm_item_id", UCM_TYPE.format(alias="com_contact.contact"), None),
                                ("fields_values", "item_id", FIELD_CONTEXT.format(context="= 'com_contact.contact'"), None),
                                ("assets", "id", None, "asset_id")],
            "fields": [("fields_values", "field_id", None, None),
                       ("fields_categories", "field_id", None, None),
                       ("assets", "id", None, "asset_id")],
            "phocacart_products": PHOCACART_PRODUCT_ROWS,
        },
        # Counters both sites move on their own (a page view, a banner shown or clicked): when both
        # moved one, the larger stays and it is not a clash (#1648: an impression count was listed
        # as a place Tracy kept). `table.column` names a column of one table only.
        "counterColumns": {"hits", "banners.impmade", "banners.clicks"},
        # A record's edit lock: who has its edit form open on THIS site, and since when. State of a
        # session, never of the site: not compared, and every row of the result keeps the copy's own
        # lock (a row new from the live site: none). An administrator who opened an article on the
        # live site and left it locked the copy's article after a sync (23/10/2026). By column
        # name, in every table that has them.
        "sessionColumns": {"checked_out", "checked_out_time"},
        # A column that mirrors another record's: an asset's title is its article's, category's or
        # module's. Taken from the live site where only it changed there, never a clash of its own —
        # the record it mirrors is named once (dev, 26/10/2026: one title both sites changed read
        # "Both sites changed 2 places", the second the asset's).
        "mirrorColumns": {"assets": {"title"}},
        # Rows a person did not change as a record of their own: the rows that belong to a record (its
        # asset, workflow, tags, versions…) and the site's logs. Merged as any other row; never counted
        # in `records`, the number of records the live site brought (a new article is one, not five).
        "uncountedTables": {"assets", "workflow_associations", "ucm_content", "ucm_base", "contentitem_tag_map",
                            "content_frontpage", "modules_menu", "user_usergroup_map", "fields_values",
                            "history", "ucm_history", "action_logs", "messages", "scheduler_logs",
                            "redirect_links", "update_sites", "update_sites_extensions", "schemas",
                            *{t for t, _, _, _ in PHOCACART_PRODUCT_ROWS}},
        "volatileColumns": {"lastvisitDate", "lastResetTime",
                            "resetCount", "modified", "modified_by", "modified_user_id", "modified_time",
                            "version",
                            # `scheduler_tasks`: stamped by every run of a task, on either site.
                            "last_execution", "next_execution", "times_executed", "times_failed",
                            "last_exit_code", "locked",
                            # `update_sites`: stamped by each site's own check for extension updates.
                            "last_check_timestamp"},
        # What provision does to a copy's database and the live site never has: done to a read of the
        # live site before it is compared, so the copy's own change does not read as "the live site
        # put it back". The same statement as provision/platform/joomla.sh
        # `platform_neutralize_live_domain` (test/live-sync-db.test.mjs holds the two equal): the SEF
        # plugin's `domain` would send the copy's visitors to the live site.
        # Records both sites may create, numbered by AUTO_INCREMENT from the same last number: an
        # article the agent made on the copy and one the customer made on the live site meet under
        # one id. The live site's record is given a new number in the merge, and so is everything
        # that points at it — `refs` (a column holding the id, with the rows it applies to; `{name}`
        # in the condition is the table `name` of the same schema), `texts` (a link written into
        # text: `{id}` is the number) and `names` (an asset or a version named after it). `key`: the
        # record's number column when it is not `id`.
        # The numbers given are remembered (`--id-map`), so the record keeps its copy number in every
        # later sync. Order matters: assets last, after the names that carry the other ids.
        "entities": [
            ("content", {
                "refs": [("content_frontpage", "content_id", None),
                         ("workflow_associations", "item_id", "extension = 'com_content.article'"),
                         ("contentitem_tag_map", "content_item_id", "type_alias = 'com_content.article'"),
                         ("ucm_content", "core_content_item_id", "core_type_alias = 'com_content.article'"),
                         ("ucm_base", "ucm_item_id", UCM_TYPE.format(alias="com_content.article")),
                         # Custom field values name their item in a text column, through the field's
                         # context (measured 21/10/2026: an article's "Origin" stayed on the old
                         # number and showed on Tracy's article).
                         ("fields_values", "item_id", FIELD_CONTEXT.format(context="= 'com_content.article'")),
                         # The user action log names the record it is about: it follows the new number,
                         # and a log row never holds a sync (measured 22/10/2026: "Article created" on the
                         # live site held "ng_action_logs.item_id=2601" for a person).
                         ("action_logs", "item_id", "extension = 'com_content.article'")],
                "texts": [("menu", "link", "option=com_content&view=article&id={id}"),
                          ("content", "introtext", "option=com_content&view=article&id={id}"),
                          ("content", "fulltext", "option=com_content&view=article&id={id}")],
                "names": [("assets", "name", "com_content.article.{id}"),
                          ("history", "item_id", "com_content.article.{id}")],
            }),
            ("categories", {
                "refs": [("categories", "parent_id", None), ("content", "catid", None),
                         ("contentitem_tag_map", "content_item_id", "type_alias = 'com_content.category'"),
                         ("ucm_content", "core_content_item_id", "core_type_alias = 'com_content.category'"),
                         ("ucm_base", "ucm_item_id", UCM_TYPE.format(alias="com_content.category")),
                         # A category field's context is `<component>.categories`.
                         ("fields_values", "item_id", FIELD_CONTEXT.format(context="LIKE '%.categories'")),
                         ("action_logs", "item_id", "extension = 'com_categories.category'")],
                "texts": [("menu", "link", "option=com_content&view=category&id={id}"),
                          ("menu", "link", "option=com_content&view=category&layout=blog&id={id}")],
                "names": [("assets", "name", "com_content.category.{id}"),
                          ("history", "item_id", "com_content.category.{id}")],
            }),
            ("menu", {"refs": [("menu", "parent_id", None), ("modules_menu", "menuid", None),
                               ("action_logs", "item_id", "extension = 'com_menus.item'")]}),
            ("modules", {"refs": [("modules_menu", "moduleid", None),
                                  ("action_logs", "item_id", "extension = 'com_modules.module'")],
                         "names": [("assets", "name", "com_modules.module.{id}")]}),
            ("users", {"refs": [("user_usergroup_map", "user_id", None), ("content", "created_by", None),
                                ("content", "modified_by", None), ("action_logs", "user_id", None),
                                ("history", "editor_user_id", None),
                                ("fields_values", "item_id", FIELD_CONTEXT.format(context="= 'com_users.user'")),
                                ("action_logs", "item_id", "extension = 'com_users.user'")],
                       "names": [("assets", "name", "com_users.user.{id}")]}),
            ("tags", {"refs": [("tags", "parent_id", None), ("contentitem_tag_map", "tag_id", None)]}),
            # Joomla's own logs both sites add to between two syncs (measured 21/10/2026: a
            # version and a 404 under one number held almost every sync for a person). Nothing
            # points at their numbers; what they point at follows above (`history.item_id`).
            #   history         Joomla 4/5's versions (`ucm_history` in Joomla 3)
            #   redirect_links  the 404 log, and the redirects the owner makes from it
            ("history", {"key": "version_id"}),
            ("redirect_links", {}),
            ("assets", {"refs": [("assets", "parent_id", None), ("content", "asset_id", None),
                                 ("categories", "asset_id", None), ("modules", "asset_id", None),
                                 ("fields", "asset_id", None), ("fields_groups", "asset_id", None),
                                 ("contact_details", "asset_id", None), ("banners", "asset_id", None),
                                 ("workflows", "asset_id", None), ("workflow_stages", "asset_id", None),
                                 ("workflow_transitions", "asset_id", None)]}),
        ],
        "normalise": [
            "UPDATE `{prefix}extensions`\n"
            "   SET params = JSON_SET(params, '$.domain', '')\n"
            " WHERE type = 'plugin' AND folder = 'system' AND element = 'sef'\n"
            "   AND JSON_VALID(params)\n"
            "   AND JSON_UNQUOTE(JSON_EXTRACT(params, '$.domain')) NOT IN ('');",
        ],
    },
}

POLICIES["wordpress"] = _WORDPRESS.POLICY
# Run on the three schemas before anything is compared (WordPress: the live address made the copy's).
PREPARE = {"wordpress": _WORDPRESS.prepare}
# Run once the reads carry the copy's numbers, before the clashes are numbered: rows of the copy that
# give their number up to a record of the live read (WordPress: its auto-drafts).
YIELD = {"wordpress": _WORDPRESS.yield_auto_drafts}

VALUE_LIMIT = 2000
# How many skipped live rows are named in an answer (all are counted).
SKIPPED_LIMIT = 50

# Tracy's copies of a site's tables, kept in the site's own database: `db.snapshot` parks one before a
# risky change (`_tracy_snap_<tag>__<name>`, the agent's way back) and `db.cleanup` moves a table to its
# trash (`_tracy_trash_<stamp>__<name>`). Neither is a table of the site, on any side: never compared,
# taken, dropped or reported — the copy's stay as they are, the live site's never come over. A chat
# edit's snapshot left the copy holding one the live site lacks, and a whole-database snapshot doubles
# what a merge would compare (#1649). The backups leave the snapshots out as well (site-backup.sh).
TRACY_COPY_TABLE = re.compile(r"^_tracy_(snap|trash)_")


def q(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def unescape(field: str) -> str | None:
    """A field of `mariadb --batch` output: NULL, or the value with its escapes undone."""
    if field == "NULL":
        return None
    out, i = [], 0
    while i < len(field):
        ch = field[i]
        if ch == "\\" and i + 1 < len(field):
            nxt = field[i + 1]
            out.append({"t": "\t", "n": "\n", "0": "\0", "\\": "\\"}.get(nxt, nxt))
            i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


class SqlError(RuntimeError):
    """A script the database refused, or a client that stopped: the whole client output in the
    message (for the job's log), its last line in `said` (for the sync's answer, `failure_line`)."""

    def __init__(self, message: str, said: str):
        super().__init__(message)
        self.said = said


class Sql:
    """The site's database server through the client the caller names (`TRACY_SYNC_SQL`, a JSON argv
    such as `docker compose exec -T -e MYSQL_PWD=… db mariadb -uroot`). One script per call, results
    as rows of strings.

    ONE client for every call (#1649): each call used to start the client anew, a `docker compose
    exec` of its own — 0.2 to 0.5 s each, and a merge makes hundreds (a 290 MB site's took 1,040 s).
    The client reads the scripts one after the other on its standard input, each followed by a
    SELECT of a marker that only this call knows; its answer is the lines before the marker. The
    batch client stops at a script's first error, as a client of its own did, and its error is
    raised; the next call starts a new one. Session state carries over between calls — only
    `FOREIGN_KEY_CHECKS = 0` is ever set, and every script names its database."""

    def __init__(self, argv: list[str]):
        self.argv = argv
        self.database: str | None = None
        self.calls = 0
        self._proc: subprocess.Popen | None = None
        self._err = None

    def _client(self) -> subprocess.Popen:
        if self._proc is None or self._proc.poll() is not None:
            self._err = tempfile.TemporaryFile()
            self._proc = subprocess.Popen(
                [*self.argv, "--batch", "--skip-column-names", "--max-allowed-packet=256M", "--unbuffered"],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self._err)
        return self._proc

    def run(self, script: str) -> list[list[str | None]]:
        # A default database: MariaDB resolves the alias of a multi-table DELETE against it, and
        # answers "No database selected" without one even when every table is qualified.
        if self.database:
            script = f"USE {q(self.database)};\n{script}"
        script = script.rstrip()
        if not script.endswith(";"):
            script += ";"
        self.calls += 1
        marker = f"tracy-sql-done-{os.urandom(8).hex()}"
        proc = self._client()
        # Written from a thread of its own: a long script whose answers fill the pipe while it is
        # still being written would otherwise wait on this reader, and this reader on it.
        data = f"{script}\nSELECT '{marker}';\n".encode("utf-8", "surrogateescape")
        def feed() -> None:
            try:
                proc.stdin.write(data)
                proc.stdin.flush()
            except (BrokenPipeError, OSError):
                pass  # The client stopped on an error: the reader below says which.
        writer = threading.Thread(target=feed, daemon=True)
        writer.start()
        lines: list[str] = []
        ended = False
        for raw in proc.stdout:
            line = raw.decode("utf-8", "surrogateescape").rstrip("\n")
            if line == marker:
                ended = True
                break
            if line != "":
                lines.append(line)
        writer.join()
        if not ended:
            status = proc.wait()
            self._err.seek(0)
            error = self._err.read().decode(errors="replace").strip()
            self._proc = None
            # The client's own error is its last line (`ERROR 1062 (23000) at line 3: …`). A database
            # server that died under the statement leaves none — only the exit status of the
            # `docker compose exec` (137) and whatever docker said before.
            said = [line for line in error.splitlines() if line.strip() and not line.startswith("WARNING:")]
            raise SqlError(f"SQL failed: {error[-2000:]}",
                           said[-1] if said else f"the SQL client stopped with status {status} and no error"
                           " (did the database server stop?)")
        return [[unescape(f) for f in line.split("\t")] for line in lines]

    def close(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            try:
                self._proc.stdin.close()
                self._proc.wait(timeout=30)
            except (OSError, subprocess.TimeoutExpired):
                self._proc.kill()
        self._proc = None


def sql_str(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'"


_FOREIGN_KEYS = _load("foreign_keys", HERE / "foreign_keys.py")
capture_foreign_keys = _FOREIGN_KEYS.capture
rebase_foreign_key = _FOREIGN_KEYS.rebase
foreign_key_sql = _FOREIGN_KEYS.add_sql


class Schema:
    """What one schema holds: table → ordered columns [(name, definition)], primary key, unique keys."""

    def __init__(self, name: str):
        self.name = name
        self.columns: dict[str, list[tuple[str, str]]] = {}
        self.primary: dict[str, list[str]] = {}
        self.unique: dict[str, dict[str, list[str]]] = {}
        self.checksum: dict[str, str | None] = {}


def read_schemas(sql: Sql, names: list[str], needs_checksum=None) -> dict[str, Schema]:
    """Each schema's tables, columns and keys, and the checksum of every table `needs_checksum(schemas,
    schema, table)` asks for (all when None). The checksums are read side by side, a client per
    schema: CHECKSUM TABLE reads every row, and three schemas one after the other were the longest
    step of a Joomla merge (24/10/2026)."""
    schemas = {n: Schema(n) for n in names}
    listed = ",".join(sql_str(n) for n in names)
    rows = sql.run(
        f"""SELECT 'T', table_schema, table_name FROM information_schema.tables
              WHERE table_schema IN ({listed}) AND table_type = 'BASE TABLE';
            SELECT 'C', table_schema, table_name, column_name, column_type, IFNULL(collation_name, '-'), is_nullable
              FROM information_schema.columns
              WHERE table_schema IN ({listed}) ORDER BY table_schema, table_name, ordinal_position;
            SELECT 'K', table_schema, table_name, index_name, column_name FROM information_schema.statistics
              WHERE table_schema IN ({listed}) AND non_unique = 0
              ORDER BY table_schema, table_name, index_name, seq_in_index;"""
    )
    for row in rows:
        tag, schema, table = row[0], schemas[row[1]], row[2]
        if TRACY_COPY_TABLE.match(table):
            continue
        if tag == "T":
            schema.columns.setdefault(table, [])
        elif tag == "C" and table in schema.columns:
            # The collation is part of a column's definition here: two schemas whose columns differ
            # only in it cannot be compared with `<=>` ("Illegal mix of collations"), so they count
            # as different structures.
            schema.columns[table].append((row[3], f"{row[4]} {row[5]} {row[6]}"))
        elif tag == "K" and table in schema.columns and row[3] == "PRIMARY":
            schema.primary.setdefault(table, []).append(row[4])
        elif tag == "K" and table in schema.columns:
            schema.unique.setdefault(table, {}).setdefault(row[3], []).append(row[4])
    asks = []
    for schema in schemas.values():
        tables = sorted(t for t in schema.columns if needs_checksum is None or needs_checksum(schemas, schema.name, t))
        if tables:
            asks.append((schema, "CHECKSUM TABLE " + ", ".join(f"{q(schema.name)}.{q(t)}" for t in tables) + ";"))

    def checksum(i: int, schema: Schema, script: str) -> None:
        # The first on the caller's client, the others on clients of their own.
        client = sql if i == 0 else Sql(sql.argv)
        try:
            for row in client.run(script):
                schema.checksum[row[0].split(".", 1)[1]] = row[1]
        finally:
            if client is not sql:
                client.close()

    if len(asks) <= 1:
        for schema, script in asks:
            checksum(0, schema, script)
    else:
        with concurrent.futures.ThreadPoolExecutor(len(asks)) as pool:
            for done in [pool.submit(checksum, i, schema, script) for i, (schema, script) in enumerate(asks)]:
                done.result()
    return schemas


def short(value: str | None) -> dict:
    """A value as the resolver sees it: text, cut to VALUE_LIMIT characters."""
    if value is None:
        return {"null": True}
    data = bytes.fromhex(value)
    # A NUL (PHP's serialized protected properties carry them) cannot be stored by the reader's
    # JSON column (Postgres jsonb): shown as the replacement character instead.
    text = data.decode("utf-8", "replace").replace("\x00", "\ufffd")
    out = {"text": text[:VALUE_LIMIT]}
    if len(text) > VALUE_LIMIT:
        out["truncated"] = len(text)
    return out


class IdMap:
    """Live ids of records the merge numbered again, per table without prefix: `{table: {live: copy}}`.

    Applied to every read of the live site — the base (the read the last sync merged) and the read
    being merged now — before anything is compared, so a record the customer made keeps the copy
    number it was given, and the customer's later edits of it come over to that record. New clashes
    found in this merge are added; the caller stores the map only once the merge is in place."""

    OFFSET = 2_000_000_000

    def __init__(self, sql: Sql, prefix: str, entities: list, mapping: dict):
        self.sql, self.prefix, self.entities = sql, prefix, entities
        self.map: dict[str, dict[int, int]] = {t: {int(k): int(v) for k, v in m.items()} for t, m in mapping.items()}
        self.added: list[dict] = []
        self.held: list[dict] = []
        # Per schema and table, the numbers `apply` gave this read's records: `{copy: live}`.
        self.applied: dict[str, dict[str, dict[int, int]]] = {}
        self._catalogue: dict[str, set[tuple[str, str | None]]] = {}
        self._types: dict[str, dict[tuple[str, str], str]] = {}
        self._ref_columns: dict[tuple[str, str], tuple[list[tuple[str, str, str]], set[str]]] = {}
        self._primary: dict[tuple[str, str], list[str] | None] = {}

    def table(self, name: str) -> str:
        return self.prefix + name

    def catalogue(self, schema: str) -> set[tuple[str, str | None]]:
        """The tables of `schema`, and their columns, in one query: each question below is a lookup.
        Every SQL call is a process of its own (about 0.1 s through `docker exec`), and asked one by
        one these took 22 s of a 88 s sync (measured 22/10/2026). Renumbering moves rows, never
        tables or columns, so it is read once."""
        if schema not in self._catalogue:
            rows = self.sql.run(f"SELECT table_name, column_name, data_type FROM information_schema.columns"
                                f" WHERE table_schema = {sql_str(schema)};")
            self._catalogue[schema] = {(r[0], None) for r in rows} | {(r[0], r[1]) for r in rows}
            self._types[schema] = {(r[0], r[1]): r[2] for r in rows}
        return self._catalogue[schema]

    def is_integer(self, schema: str, table: str, column: str) -> bool:
        """Whether a column of `schema` holds integers (`int()` reads every value of it)."""
        self.catalogue(schema)
        return self._types[schema].get((self.table(table), column)) in self.INT_TYPES

    def exists(self, schema: str, table: str) -> bool:
        return (self.table(table), None) in self.catalogue(schema)

    def column_exists(self, schema: str, table: str, column: str) -> bool:
        return (self.table(table), column) in self.catalogue(schema)

    def key(self, table: str) -> str:
        """The number column of an entity's records."""
        return next((rule.get("key", "id") for t, rule in self.entities if t == table), "id")

    def cond(self, schema: str, where: str) -> str:
        """A `refs` condition with each `{name}` as table `name` of `schema`."""
        return re.sub(r"\{(\w+)\}", lambda m: f"{q(schema)}.{q(self.table(m.group(1)))}", where)

    def ids(self, schema: str, table: str) -> set[int]:
        return {int(r[0]) for r in self.sql.run(f"SELECT {q(self.key(table))} FROM {q(schema)}.{q(self.table(table))};")}

    def ids_of(self, asks: list[tuple[str, str]]) -> dict[tuple[str, str], set[int]]:
        """`ids` of several (schema, table) pairs, in one call."""
        script = [f"SELECT {i}, {q(self.key(table))} FROM {q(schema)}.{q(self.table(table))};" for i, (schema, table) in enumerate(asks)]
        out: dict[tuple[str, str], set[int]] = {ask: set() for ask in asks}
        for r in self.sql.run("\n".join(script)) if script else []:
            out[asks[int(r[0])]].add(int(r[1]))
        return out

    def numbers_of(self, asks: list[tuple[str, str, dict]]) -> dict[tuple[str, str], set[int]]:
        """The highest number a table's records use in a schema, and the highest its references still
        name (`ids` | `referenced`, of which a new number need only be above the top), for several
        (schema, table, rule) at once, in one call. Asked of the server as a MAX: every id of every
        record table, three times over, came back through the client (1.7 s on a 20,000-article
        site, #1649). A reference counts as `int()` would read it, and only above 0."""
        script: list[str] = []
        # Every top a table is asked for under one condition, in one read of it: `#__content` holds
        # the references of three kinds of record.
        reads: dict[tuple[str, str, str], list[tuple[int, str, str]]] = {}
        for i, (schema, table, rule) in enumerate(asks):
            reads.setdefault((schema, table, ""), []).append((i, "id", f"MAX({q(self.key(table))})"))
            for ref_table, column, where in rule.get("refs", []):
                if self.column_exists(schema, ref_table, column):
                    number = (q(column) if self.is_integer(schema, ref_table, column) else
                              f"IF(CAST({q(column)} AS CHAR) REGEXP '^[[:space:]]*[-+]?[0-9]+[[:space:]]*$',"
                              f" CAST({q(column)} AS DECIMAL(65, 0)), NULL)")
                    reads.setdefault((schema, ref_table, where or ""), []).append((i, "ref", f"MAX({number})"))
        for (schema, table, where), tops in reads.items():
            cond = f" WHERE ({self.cond(schema, where)})" if where else ""
            script.append(f"SELECT {', '.join(top for _, _, top in tops)} FROM {q(schema)}.{q(self.table(table))}{cond};")
        out: dict[tuple[str, str], set[int]] = {(schema, table): set() for schema, table, _ in asks}
        answers = self.sql.run("\n".join(script)) if script else []
        for tops, row in zip(reads.values(), answers):
            for (i, kind, _), value in zip(tops, row):
                if value is None:
                    continue
                n = int(value)
                # A reference of 0 or below names no record; a record's own id counts whatever it is.
                if kind == "id" or n > 0:
                    out[asks[i][:2]].add(n)
        for schema, table, rule in asks:
            if rule.get("typedRefs"):
                out[(schema, table)].update(rule["typedRefs"].read(self, schema))
        return out

    def renumber(self, schema: str, table: str, rule: dict, pairs: list[tuple[int, int]]) -> None:
        """Every `old` id of `table` in `schema` becomes `new`, with what points at it. Through a far
        offset first, so a chain (a → b while b → c) never meets itself on the primary key.

        One statement per column and step, every pair in it, rather than one per pair: a reference
        column has no index, and each statement read the whole table — every remembered number,
        each sync, twice over (#1649). A text column is rewritten by every pair's replacement in
        turn, as the statements one after the other did."""
        if not pairs:
            return
        steps = [[(old, old + self.OFFSET) for old, _ in pairs], [(old + self.OFFSET, new) for old, new in pairs]]
        key = q(self.key(table))

        def moved(column: str, step: list[tuple[int, int]], quoted: bool = False) -> tuple[str, str]:
            was = (lambda old: f"'{old}'") if quoted else str
            cases = " ".join(f"WHEN {was(old)} THEN {new}" for old, new in step)
            return f"CASE {column} {cases} END", ", ".join(was(old) for old, _ in step)

        for step in steps:
            script = ["SET FOREIGN_KEY_CHECKS = 0;"]
            value, olds = moved(key, step)
            script.append(f"UPDATE {q(schema)}.{q(self.table(table))} SET {key} = {value} WHERE {key} IN ({olds});")
            for ref_table, column, where in rule.get("refs", []):
                if self.column_exists(schema, ref_table, column):
                    cond = f" AND ({self.cond(schema, where)})" if where else ""
                    # The numbers quoted: a text column (WordPress's `meta_value`) compared with a
                    # bare number is cast row by row, and strict mode stops the UPDATE at the first
                    # value that is not one ("Truncated incorrect DOUBLE value").
                    value, olds = moved(q(column), step, quoted=True)
                    script.append(f"UPDATE {q(schema)}.{q(self.table(ref_table))} SET {q(column)} = {value}"
                                  f" WHERE {q(column)} IN ({olds}){cond};")
            self.sql.run("\n".join(script))
        # Names and links carry the final number only (an offset id is never written into text).
        # Names are unique too (`#__assets.name`): through a holding name first, like the ids.
        script = []
        for step in ("hold", "final"):
            for ref_table, column, template in rule.get("names", []):
                if not self.column_exists(schema, ref_table, column):
                    continue
                swaps = []
                for old, new in pairs:
                    held = f"tracy-sync-hold:{template.format(id=old)}"
                    swaps.append((template.format(id=old), held) if step == "hold" else (held, template.format(id=new)))
                cases = " ".join(f"WHEN {sql_str(frm)} THEN {sql_str(to)}" for frm, to in swaps)
                listed = ", ".join(sql_str(frm) for frm, _ in swaps)
                script.append(f"UPDATE {q(schema)}.{q(self.table(ref_table))} SET {q(column)} = CASE {q(column)} {cases} END"
                              f" WHERE {q(column)} IN ({listed});")
        # Links through a holding number as well: moved one after the other, `id=3 → 4` then
        # `id=4 → 5` would carry the first link along the chain to 5. Each table read once a step per
        # TEXT_NEST links of a column: its columns rewritten by those links in turn, the next
        # statement going on where the last stopped (the same replacements in the same order).
        for step in ("hold", "final"):
            by_table: dict[str, dict[str, list[tuple[str, str, str]]]] = {}
            for old, new in pairs:
                for ref_table, column, template in rule.get("texts", []):
                    if not self.column_exists(schema, ref_table, column):
                        continue
                    held = template.format(id=f"tracy-sync-hold-{old}x")
                    frm, to = (template.format(id=old), held) if step == "hold" else (held, template.format(id=new))
                    # `sql_str` doubles the backslashes for the SQL string; the regex then sees one.
                    pattern = re.escape(frm) + ("(?![0-9])" if step == "hold" else "")
                    by_table.setdefault(ref_table, {}).setdefault(column, []).append((frm, pattern, to))
            for ref_table, columns in by_table.items():
                rounds = max(len(swaps) for swaps in columns.values())
                # More than one statement: the rows holding any link of the step are found once (a
                # temporary table of their keys) and each statement rewrites only those, rather than
                # each reading the whole table again — 8 statements a step over every post's content
                # (dev, 23/10/2026: 58 remembered posts, 10 s of each WordPress sync). A row holding
                # none of the step's links at its start never gets one from the step's own rewrites
                # (they write only where a link was), so these are the rows every statement touched.
                pk = self.primary_key(schema, ref_table) if rounds > self.TEXT_NEST else None
                rows = None
                if pk:
                    rows = f"{q(schema)}.{q('tracy_links_' + hashlib.sha1(ref_table.encode()).hexdigest()[:12])}"
                    keys = ", ".join(q(c) for c in pk)
                    found = " OR ".join(
                        f"{q(column)} REGEXP {sql_str('|'.join(p for _, p, _ in swaps[at:at + self.FIND_CHUNK]))}"
                        for column, swaps in columns.items() for at in range(0, len(swaps), self.FIND_CHUNK))
                    script.append(f"DROP TEMPORARY TABLE IF EXISTS {rows};"
                                  f" CREATE TEMPORARY TABLE {rows} (PRIMARY KEY ({keys})) AS SELECT {keys}"
                                  f" FROM {q(schema)}.{q(self.table(ref_table))} WHERE {found};")
                for at in range(0, rounds, self.TEXT_NEST):
                    script.append(self.links_update(schema, ref_table, {
                        column: swaps[at:at + self.TEXT_NEST]
                        for column, swaps in columns.items() if swaps[at:at + self.TEXT_NEST]}, rows, pk))
                if rows:
                    script.append(f"DROP TEMPORARY TABLE {rows};")
        if script:
            self.sql.run("\n".join(script))
        if rule.get("typedRefs"):
            rule["typedRefs"].rewrite(self, schema, pairs)

    # How many links one regular expression of the rows' search names (`renumber`): each is compiled
    # on its own, and a compiled pattern has a size limit.
    FIND_CHUNK = 100

    def primary_key(self, schema: str, table: str) -> list[str] | None:
        """The primary key's columns of `table` (without prefix) in `schema`, read once a merge."""
        cache = self._primary
        if (schema, table) not in cache:
            rows = self.sql.run(f"SELECT column_name FROM information_schema.statistics WHERE table_schema = {sql_str(schema)}"
                                f" AND table_name = {sql_str(self.table(table))} AND index_name = 'PRIMARY'"
                                f" ORDER BY seq_in_index;")
            cache[(schema, table)] = [r[0] for r in rows] or None
        return cache[(schema, table)]

    # How many links one statement rewrites in one column. Each is a REGEXP_REPLACE around the one
    # before, and MariaDB evaluates the nest by recursion with no guard on its stack: about 160 deep
    # the server dies of a segmentation fault (`mariadb:11`, 11.8.9; measured 24/10/2026). The links
    # are three per renumbered post and every number ever given is applied at each sync, so the
    # nest grew sync by sync until a sync with nothing to merge killed the site's database server
    # and stopped as MERGE_FAILED (dev, 23/10/2026, at 58 remembered posts).
    TEXT_NEST = 24

    def links_update(self, schema: str, ref_table: str, columns: dict[str, list[tuple[str, str, str]]],
                     rows: str | None = None, pk: list[str] | None = None) -> str:
        """One UPDATE of `ref_table` rewriting each column by its `(link, pattern, replacement)`
        swaps in turn, on the rows that hold one of the links.

        The rows are found by ONE regular expression per column, every link of the statement an
        alternative of it — the same patterns the rewrite uses, so a row is touched only where a
        link is. A LIKE per link read every post's whole content once per link: 174 of them took
        47 s over 54 MB of posts, the alternation 0.2 s (measured 24/10/2026; dev spent 80 to
        134 s of every WordPress sync there)."""
        sets, finds = [], []
        r = "r." if rows else ""
        for column, swaps in columns.items():
            value = r + q(column)
            for _, pattern, to in swaps:
                value = f"REGEXP_REPLACE({value}, {sql_str(pattern)}, {sql_str(to)})"
            sets.append(f"{r}{q(column)} = {value}")
            finds.append(f"{r}{q(column)} REGEXP {sql_str('|'.join(pattern for _, pattern, _ in swaps))}")
        if rows:
            # Only the rows `rows` names (their keys), each looked up by its key.
            on = " AND ".join(f"r.{q(c)} = k.{q(c)}" for c in pk)
            return (f"UPDATE {rows} k JOIN {q(schema)}.{q(self.table(ref_table))} r ON {on} SET {', '.join(sets)}"
                    f" WHERE {' OR '.join(finds)};")
        return (f"UPDATE {q(schema)}.{q(self.table(ref_table))} SET {', '.join(sets)}"
                f" WHERE {' OR '.join(finds)};")

    def apply(self, schema: str) -> None:
        """The remembered numbers, on one read of the live site. A record of the read that already
        holds one of those numbers on its own is numbered again too (and remembered)."""
        for table, rule in self.entities:
            mapping = self.map.get(table)
            if not mapping or not self.exists(schema, table):
                continue
            # The numbers this read uses for the table: its records', and the ones its references
            # still name with no record left (an orphan `#__workflow_associations` row after a delete
            # that skipped it, met on the stand 20/10/2026) — those sit on a number as surely.
            present = self.ids(schema, table) | self.referenced(schema, rule)
            pairs = [(live, copy) for live, copy in mapping.items() if live in present]
            moving = {old for old, _ in pairs}
            taken = {new for _, new in pairs}
            # A record of this read sitting on a number another record is moving to.
            squatters = sorted((present - moving) & taken)
            for live in squatters:
                fresh = self.fresh(table, present | taken)
                taken.add(fresh)
                self.seen.setdefault(table, set()).add(fresh)
                mapping[live] = fresh
                pairs.append((live, fresh))
                self.added.append({"table": table, "live": live, "copy": fresh, "why": "occupied"})
            self.applied.setdefault(schema, {})[table] = {new: old for old, new in pairs}
            self.renumber(schema, table, rule, pairs)

    def referenced(self, schema: str, rule: dict) -> set[int]:
        """Every number the reference columns of `rule` hold in `schema` (no names, no links)."""
        out: set[int] = set()
        for ref_table, column, where in rule.get("refs", []):
            if not self.column_exists(schema, ref_table, column):
                continue
            cond = f" WHERE ({self.cond(schema, where)})" if where else ""
            for r in self.sql.run(f"SELECT DISTINCT {q(column)} FROM {q(schema)}.{q(self.table(ref_table))}{cond};"):
                try:
                    if int(r[0]) > 0:
                        out.add(int(r[0]))
                except (TypeError, ValueError):
                    continue
        if rule.get("typedRefs"):
            out.update(rule["typedRefs"].read(self, schema))
        return out

    def fresh(self, table: str, also: set[int]) -> int:
        top = max([0, *also, *self.map.get(table, {}).values(), *self.seen.get(table, set())])
        return top + 1

    def survey(self, schemas: list[str]) -> None:
        """The top number any of the three schemas uses, per table: a number given here is above all
        (`fresh` asks for nothing but the highest)."""
        got = self.numbers_of([(s, table, rule) for table, rule in self.entities for s in schemas if self.exists(s, table)])
        self.seen = {table: set().union(*(got.get((s, table), set()) for s in schemas)) for table, _ in self.entities}

    def clash(self, base: str, ours: str, theirs: str, digest) -> None:
        """Records both sites created under one number since the base: the live site's one is
        given a number neither side uses, and remembered."""
        tables = [(table, rule) for table, rule in self.entities if all(self.exists(s, table) for s in (base, ours, theirs))]
        # Read at once: a table's own numbers move only when that table is renumbered, below.
        known = self.ids_of([(s, table) for table, _ in tables for s in (base, ours, theirs)])
        for table, rule in tables:
            b, o, t = known[(base, table)], known[(ours, table)], known[(theirs, table)]
            self.seen[table] = self.seen.get(table, set()) | b | o | t
            # A number this read holds because the map gave it (`apply`) is the copy's record of that
            # live record, never a second new one — whatever the base says: a record a push made that
            # the base does not hold yet, or a base older than the map. Numbered again, it came to the
            # copy twice, and the map lost the copy's number of it (a later push made it again).
            remembered = self.applied.get(theirs, {}).get(table, {})
            both = sorted((o & t) - b - set(remembered))
            differ = [i for i in both if digest(ours, table, i) != digest(theirs, table, i)]
            pairs = []
            taken = set(self.seen[table])
            for live in differ:
                fresh = self.fresh(table, taken)
                taken.add(fresh)
                self.seen[table].add(fresh)
                # The read was already renumbered: remember it under the live site's own number —
                # the one `apply` moved to `live` in THIS read. A remembered number whose record the
                # read no longer has points at `live` too: taken for it, it said the wrong live record
                # was renumbered and left the real one unremembered, its later edits meeting the
                # copy's record under its number (dev, S5, 24/10/2026).
                raw = self.moved(theirs, table, live, fresh)
                self.map.setdefault(table, {})[raw] = fresh
                pairs.append((live, fresh))
                self.added.append({"table": table, "live": raw, "copy": fresh, "why": "created-on-both"})
            self.held += self.unhandled_refs(base, theirs, table, pairs)
            self.renumber(theirs, table, rule, pairs)

    def moved(self, schema: str, table: str, number: int, to: int) -> int:
        """The record of `schema` under `number` now goes under `to`: answers its live site's own
        number — the one `apply` moved to `number` in this read, else `number` itself — and keeps
        `applied` saying where it is. Never looked up among the map's values: a remembered number
        whose record the read no longer has can point at `number` too (dev, S5, 24/10/2026)."""
        applied = self.applied.setdefault(schema, {}).setdefault(table, {})
        raw = applied.pop(number, number)
        applied[to] = raw
        return raw

    INT_TYPES = ("int", "bigint", "smallint", "mediumint", "tinyint")
    TEXT_TYPES = ("varchar", "char", "tinytext", "text", "mediumtext", "longtext")

    # A column of a table the adapter does not know, named as if it held one of these records' ids.
    REF_NAME = re.compile(r"(^|_)(content|article|item|category|catid|menu|menuid|module|moduleid|user|userid|tag)(_?id)?$", re.I)

    # How many numbers one IN list of `unhandled_refs` names.
    REF_CHUNK = 500

    def unhandled_refs(self, base: str, theirs: str, table: str, pairs: list[tuple[int, int]]) -> list[dict]:
        """Rows of tables outside the adapter that point, by a column named like a reference, at one of
        the live site's records being numbered again. The adapter cannot move them, so they would point
        at the copy's record that kept the number: held for a person (council, 20/10/2026).

        Counted in one call: per column and side, one grouped SELECT over every number (REF_CHUNK
        at a time), each row filed under the number it equals by the same `=` as before. Two COUNTs
        and a table lookup per column and number made 2,556 SQL calls and 49 s of a WordPress sync's
        "clashes numbered" (dev, 23/10/2026)."""
        if not pairs:
            return []
        cols, in_base = self.ref_columns(base, theirs)
        olds = sorted({old for old, _ in pairs})
        script = []
        for i, (tbl, col, kind) in enumerate(cols):
            # The number as the column holds it: compared as text in a text column ('3', not 3,
            # which would also match '3abc').
            lit = (lambda n: sql_str(str(n))) if kind in self.TEXT_TYPES else str
            for side, schema in ((0, theirs), (1, base)):
                if side == 1 and tbl not in in_base:
                    continue
                for at in range(0, len(olds), self.REF_CHUNK):
                    chunk = olds[at:at + self.REF_CHUNK]
                    which = " ".join(f"WHEN {q(col)} = {lit(n)} THEN {n}" for n in chunk)
                    script.append(f"SELECT {i}, {side}, CASE {which} END, COUNT(*) FROM {q(schema)}.{q(tbl)}"
                                  f" WHERE {q(col)} IN ({', '.join(lit(n) for n in chunk)}) GROUP BY 3;")
        counts: dict[tuple[int, int, int], int] = {}
        for i, side, n, count in self.sql.run("\n".join(script)) if script else []:
            counts[(int(i), int(side), int(n))] = int(count)
        held = []
        for i, (tbl, col, _) in enumerate(cols):
            for old, _ in pairs:
                n_t, n_b = counts.get((i, 0, old), 0), counts.get((i, 1, old), 0)
                if n_t > n_b:
                    held.append({"id": f"held:{tbl}.{col}={old}", "kind": "reference", "table": tbl, "column": col,
                                 "points_at": table, "live": old, "rows": n_t - n_b, "reason": "unhandled-reference"})
        return held

    def ref_columns(self, base: str, theirs: str) -> tuple[list[tuple[str, str, str]], set[str]]:
        """The columns `unhandled_refs` counts in — of tables outside the adapter, named like a
        reference, holding integers or text — with each one's type, and the tables `base` has. Read
        once a merge: renumbering never moves a table or a column, nor touches these tables."""
        if (base, theirs) not in self._ref_columns:
            known = {self.table(t) for t, _ in self.entities}
            for _, rule in self.entities:
                known |= {self.table(r[0]) for r in rule.get("refs", [])}
            # Text columns too: Joomla keeps some ids as text (`fields_values.item_id`), and so may others.
            listed = ", ".join(sql_str(t) for t in self.INT_TYPES + self.TEXT_TYPES)
            rows = self.sql.run(
                f"SELECT 'c', table_name, column_name, data_type FROM information_schema.columns"
                f" WHERE table_schema = {sql_str(theirs)} AND data_type IN ({listed}) AND column_name <> 'id'"
                f" ORDER BY table_name, ordinal_position;"
                f" SELECT 't', table_name, '', '' FROM information_schema.tables WHERE table_schema = {sql_str(base)};")
            cols = [(tbl, col, kind) for tag, tbl, col, kind in rows if tag == "c" and tbl not in known
                    and tbl.startswith(self.prefix) and self.REF_NAME.search(col)]
            self._ref_columns[(base, theirs)] = (cols, {tbl for tag, tbl, _, _ in rows if tag == "t"})
        return self._ref_columns[(base, theirs)]

    def as_json(self) -> dict:
        return {t: {str(k): v for k, v in m.items()} for t, m in self.map.items() if m}


class DbMerge:
    """Merge `theirs` into `ours` (a scratch schema holding a frozen copy of the copy's database),
    table by table, against `base`. The three schemas hold no triggers while this runs: a REPLACE
    would otherwise fire the copy's own (Claude Cowork's identity triggers hand a replaced article a
    new id). The caller puts the copy's triggers back on the result before it is dumped."""

    def __init__(self, sql: Sql, base: str, ours: str, theirs: str, work: str, platform: str,
                 prefix: str, decisions: dict, id_map: dict | None = None, pushed: list | None = None):
        self.sql, self.platform, self.prefix, self.decisions = sql, platform, prefix, decisions
        self._writable = {}
        # What "Sync to live" wrote on the live site since the base was read (`seed_pushed`).
        self.pushed = [p for p in (pushed or []) if isinstance(p, dict) and isinstance(p.get("table"), str)]
        self.seeded = 0
        self.names = {"base": base, "ours": ours, "theirs": theirs}
        self.work = work
        self.policy = POLICIES.get(platform, {})
        self.conflicts: list[dict] = []
        self.tables: dict[str, str] = {}
        self.rebuild: set[str] = set()
        # `records`: the live site's records this merge brought — added, deleted, or changed in a column
        # a person edits (`counted`): what the owner is told came over. The row counts beside it hold
        # every row, logs and stamps included.
        self.counts = {"tablesFromTheirs": 0, "rowsFromTheirs": 0, "rowsDeleted": 0, "rowsMerged": 0,
                       "skipped": 0, "records": 0}
        # The live site's rows `skipped` counts, named: a count alone told nobody what (#1648).
        self.skipped: list[dict] = []
        # The live site's new records the merge did not take (`added-both`, not picked "theirs"), per
        # table of records (`dependents`): `{name: {id: its conflict, or None when a person picked
        # "ours"}}`. The rows the live site added with them stay out (`held_record_rows`).
        self.held_records: dict[str, dict[str, dict | None]] = {}
        self.order_kept = False
        self.schemas: tuple = ()
        self.theirs = Schema(theirs)
        self.ids = IdMap(sql, prefix, self.policy.get("entities", []), id_map or {})
        self.cache: dict = {}
        if self.policy.get("refName"):
            self.ids.REF_NAME = self.policy["refName"]

    def bare(self, table: str) -> str:
        return table[len(self.prefix):] if self.prefix and table.startswith(self.prefix) else table

    def ref(self, side: str, table: str) -> str:
        return f"{q(self.names[side])}.{q(table)}"

    def row_digest(self, schema: str, table: str, id_: int) -> str | None:
        rows = self.sql.run(f"SELECT MD5(CONCAT_WS(',', {self.digest_columns(schema, table)}))"
                            f" FROM {q(schema)}.{q(self.prefix + table)} r WHERE r.{q(self.ids.key(table))} = {id_};")
        return rows[0][0] if rows else None

    def digest_columns(self, schema: str, table: str) -> str:
        cols = self.sql.run(f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(schema)}"
                            f" AND table_name = {sql_str(self.prefix + table)} ORDER BY ordinal_position;")
        derived = self.policy.get("derivedColumns", {}).get(table, set()) | self.policy.get("sessionColumns", set())
        keep = [c[0] for c in cols if c[0] not in derived and c[0] not in ("id", "asset_id", self.ids.key(table))]
        return ", ".join(f"COALESCE(MD5(CAST(r.{q(c)} AS BINARY)), '-')" for c in keep) or "''"

    def run(self) -> dict:
        self.sql.run("SET FOREIGN_KEY_CHECKS=0;")
        try:
            return self._run()
        finally:
            self.sql.run("SET FOREIGN_KEY_CHECKS=1;")

    def _run(self) -> dict:
        self.sql.database = self.names["ours"]
        # Where a merge's time goes, on stderr (webroot-sync.sh keeps it in the job's log).
        started = time.monotonic()
        # With the sync's own clock (TRACY_SYNC_T0, webroot-sync.sh), each phase is a timed step of
        # the sync — kept as its progress and in its timing (#1649): where a slow merge's time went
        # is read from the sync's row, with no shell on the host.
        def phase(name: str) -> None:
            print(step_line(f"db merge: {name} at {time.monotonic() - started:.1f}s ({self.sql.calls} SQL calls)"),
                  file=sys.stderr)
        # The numbers both sites gave the same new records, before anything is compared: the reads
        # of the live site take the numbers the copy already gave their records, then this merge's
        # own clashes are numbered.
        if self.platform in PREPARE:
            PREPARE[self.platform](self.sql, self.names, self.prefix,
                                   lambda m: print(f"==> db merge: {m}", file=sys.stderr))
            phase("reads prepared")
        if self.platform == "wordpress":
            self.policy = {**self.policy, **_WORDPRESS.counting_policy(self.sql, self.names, self.prefix)}
        self.ids.survey(list(self.names.values()))
        phase("ids surveyed")
        self.ids.apply(self.names["base"])
        self.ids.apply(self.names["theirs"])
        phase("ids applied")
        # The records a push made on the live site are in the base before clashes are numbered (they
        # are the copy's own, not two records under one number); what came with them, after.
        if self.pushed:
            self.seed_pushed("records")
        # A copy auto-draft never holds a number a live post needs (after the pushed places are base).
        if self.platform in YIELD:
            YIELD[self.platform](self.sql, self.names, self.prefix,
                                 lambda m: print(f"==> db merge: {m}", file=sys.stderr))
        self.ids.clash(self.names["base"], self.names["ours"], self.names["theirs"], self.row_digest)
        phase("clashes numbered")
        if self.pushed:
            self.seed_pushed("dependents")
            phase(f"pushed places seeded ({self.seeded} statement(s))")
        joined = self.join_same_records()
        if joined:
            phase(f"{joined} copy record(s) took the live site's number")
        s = read_schemas(self.sql, list(self.names.values()), self.needs_checksum)
        phase("schemas read")
        B, M, T = (s[self.names[k]] for k in ("base", "ours", "theirs"))
        self.schemas = (B, M, T)
        self.theirs = T
        self.foreign_keys = capture_foreign_keys(self.sql, self.names["theirs"])
        self.sql.run(f"DROP DATABASE IF EXISTS {q(self.work)}; CREATE DATABASE {q(self.work)};")
        try:
            locks = self.keep_session_columns(M)
            for table in self.merge_order(set(B.columns) | set(M.columns) | set(T.columns)):
                at = time.monotonic()
                self.tables[table] = self.merge_table(table, B, M, T)
                if time.monotonic() - at > 1:
                    print(f"==> db merge: {table} {self.tables[table]} took {time.monotonic() - at:.1f}s", file=sys.stderr)
            phase("tables merged")
            self.restore_session_columns(locks)
        finally:
            self.sql.run(f"DROP DATABASE IF EXISTS {q(self.work)};")
        if self.rebuild:
            existing = {row[0] for row in self.sql.run(
                f"SELECT table_name FROM information_schema.tables WHERE table_schema = {sql_str(self.names['ours'])};")}
            self.rebuild.intersection_update(existing)
        return {"ok": True, "tables": {k: v for k, v in self.tables.items() if v != "same"},
                "conflicts": self.conflicts, "rebuild": sorted(self.rebuild), "counts": self.counts,
                "renumbered": self.ids.added, "idMap": self.ids.as_json(), "held": self.ids.held,
                "skipped": self.skipped[:SKIPPED_LIMIT], **({"pushedSeeded": self.seeded} if self.pushed else {})}

    # ── one record under two numbers ─────────────────────────────────────────────────────────────

    def join_same_records(self) -> int:
        """Rows of the copy that hold, under a number of their own, a record the live site added under
        another: the copy's number takes the live one, with everything that points at it (`renumber`),
        and the row takes the live site's values. Answers how many rows moved.

        A row qualifies when it is in neither the base nor the live read (the copy's own), the live
        row is not in the base nor the copy (new there), the two clash on a unique key — the copy's
        row is the only row of the copy the live one clashes with — and they are equal on every
        column that says what the record is: all but the number and the columns that only place a
        row or stamp it (`derivedColumns`, `bookkeepingColumns`, `sessionColumns`,
        `volatileColumns`, `counterColumns`). A column naming another such record differs only
        until that record moved: the rows are matched again, round by round, until none is found (a
        child whose parent took its live number in the round before).

        How it happens: the live site replaced a row (deleted, then inserted again under a new
        number with the same unique key, as Joomla's installer does with a component's
        administrator menu items on each update), and a sync before #1699 kept the copy's row as
        Tracy's version. The next base held only the live row, so the copy's row was the copy's own
        from then on, and every later replacement on the live site clashed with it again: a conflict
        at every sync, about a row nobody changed (dev, ja-energy-solutions24, 25/10/2026). A copy's
        row that differs in any of those columns (Tracy changed it) is left to the merge: a
        conflict, as before."""
        ours, base, theirs = self.names["ours"], self.names["base"], self.names["theirs"]
        tables = []
        for table, rule in self.ids.entities:
            key = self.ids.key(table)
            if not all(self.ids.exists(s, table) for s in (base, ours, theirs)):
                continue
            if not (self.ids.primary_key(ours, table) == [key] == self.ids.primary_key(theirs, table)
                    and self.ids.primary_key(base, table) == [key]):
                continue
            cols = {s: {c for t, c in self.ids.catalogue(s) if t == self.ids.table(table) and c} for s in (ours, theirs)}
            if cols[ours] != cols[theirs]:
                continue
            tables.append((table, rule, key, cols[ours]))
        if not tables:
            return 0
        listed = ", ".join(sql_str(self.ids.table(t)) for t, _, _, _ in tables)
        unique: dict[tuple[str, str], dict[str, list[str]]] = {}
        for schema, tbl, index, column in self.sql.run(
                f"SELECT table_schema, table_name, index_name, column_name FROM information_schema.statistics"
                f" WHERE table_schema IN ({sql_str(ours)}, {sql_str(theirs)}) AND table_name IN ({listed})"
                f" AND non_unique = 0 AND index_name <> 'PRIMARY' ORDER BY table_schema, table_name, index_name, seq_in_index;"):
            unique.setdefault((schema, tbl), {}).setdefault(index, []).append(column)
        session = self.policy.get("sessionColumns", set())
        asks = []
        for table, rule, key, names in tables:
            full = self.ids.table(table)
            keys = [cols for index, cols in sorted(unique.get((ours, full), {}).items())
                    if unique.get((theirs, full), {}).get(index) == cols]
            if not keys:
                continue
            placed = (self.policy.get("derivedColumns", {}).get(table, set())
                      | self.policy.get("bookkeepingColumns", {}).get(table, set()) | session
                      | self.named(self.policy.get("volatileColumns", set()), table)
                      | self.named(self.policy.get("counterColumns", set()), table))
            compared = sorted(names - placed - {key})
            # The columns the live row gives the copy's: all but the number, the place in a tree
            # (the copy's row keeps its place in the copy's) and the copy's own stamps and locks.
            taken = sorted(names - self.policy.get("derivedColumns", {}).get(table, set())
                           - self.policy.get("bookkeepingColumns", {}).get(table, set()) - session - {key})
            if not compared:
                continue
            asks.append((table, rule, key, keys, compared, taken))
        if not asks:
            return 0
        moved = 0
        remembered = {table: set(self.ids.map.get(table, {}).values()) for table, *_ in asks}
        while True:
            script, order = [], []
            for table, rule, key, keys, compared, _ in asks:
                b, m, t = (f"{q(s)}.{q(self.ids.table(table))}" for s in (base, ours, theirs))
                k = q(key)
                same = " AND ".join(f"CAST(rt.{q(c)} AS BINARY) <=> CAST(rm.{q(c)} AS BINARY)" for c in compared)
                tracy_rows = self.policy.get("tracyRows", {}).get(table)
                tracy = (f" OR EXISTS (SELECT 1 FROM {m} r WHERE r.{k} = rm.{k} AND ({tracy_rows}))"
                         f" OR EXISTS (SELECT 1 FROM {t} r WHERE r.{k} = rt.{k} AND ({tracy_rows}))") if tracy_rows else ""
                for cols in keys:
                    clash = " AND ".join(f"rm.{q(c)} = rt.{q(c)}" for c in cols)
                    order.append(table)
                    # Per live row new on the live site and each copy row it clashes with: whether the
                    # copy's row is the copy's own and the same record, and the live number free in the copy.
                    script.append(
                        f"SELECT {len(order) - 1}, rt.{k}, rm.{k},"
                        f" ({same}) AND NOT EXISTS (SELECT 1 FROM {b} x WHERE x.{k} = rm.{k})"
                        f" AND NOT EXISTS (SELECT 1 FROM {t} x WHERE x.{k} = rm.{k})"
                        f" AND NOT EXISTS (SELECT 1 FROM {m} x WHERE x.{k} = rt.{k})"
                        f" AND NOT (FALSE{tracy})"
                        f" FROM {t} rt JOIN {m} rm ON {clash} AND rm.{k} <> rt.{k}"
                        f" WHERE NOT EXISTS (SELECT 1 FROM {b} x WHERE x.{k} = rt.{k});")
            clashes: dict[str, dict[str, list[tuple[str, bool]]]] = {}
            for i, live, copy, ok in self.sql.run("\n".join(script)):
                clashes.setdefault(order[int(i)], {}).setdefault(live, []).append((copy, ok == "1"))
            found = 0
            for table, rule, key, _, _, taken in asks:
                pairs: dict[str, str] = {}
                claimed: dict[str, int] = {}
                for live, met in clashes.get(table, {}).items():
                    copies = {copy for copy, _ in met}
                    if len(copies) == 1 and all(ok for _, ok in met):
                        copy = copies.pop()
                        pairs[live] = copy
                        claimed[copy] = claimed.get(copy, 0) + 1
                try:
                    chosen = sorted((int(copy), int(live)) for live, copy in pairs.items()
                                    if claimed[copy] == 1 and int(copy) not in remembered[table])
                except ValueError:
                    continue
                if not chosen:
                    continue
                self.ids.renumber(ours, table, rule, chosen)
                m, t = (f"{q(s)}.{q(self.ids.table(table))}" for s in (ours, theirs))
                sets = ", ".join(f"rm.{q(c)} = rt.{q(c)}" for c in taken)
                self.sql.run(f"UPDATE {m} rm JOIN {t} rt ON rm.{q(key)} = rt.{q(key)} SET {sets}"
                             f" WHERE rm.{q(key)} IN ({', '.join(str(live) for _, live in chosen)});")
                for copy, live in chosen:
                    print(f"==> db merge: {table} {copy} is the live site's {live}: took its number", file=sys.stderr)
                found += len(chosen)
            if not found:
                return moved
            moved += found

    # ── what "Sync to live" wrote on the live site ───────────────────────────────────────────────
    #
    # A push writes the copy's values onto the live site through the engine; the next read of the
    # live site holds them, and the base (the read before the push) does not. Merged as they are, the
    # live site's version of a pushed record reads as the live site's own change: a record the push
    # created is "both sides created one" and comes back as a second record; one it updated, where
    # the CMS stored what it was given a little differently (a filter, a stamp), is a clash. So each
    # place the push wrote is first made base in the scratch base schema (never the kept dump):
    #   columns + from "ours"    the base row takes the copy's values of the columns the push wrote:
    #                            whatever the live site holds there that differs is the live site's
    #                            (the CMS's own rewrite, or the customer's edit since) and comes over
    #   columns + from "theirs"  the base row takes the live site's values (an Undo on live: the copy
    #                            keeps Tracy's change, and the next push offers it again)
    #   rows "ours" | "theirs"   the matching rows of the base are that side's (a set of rows, or a
    #                            record the copy deleted and the live site only trashed)
    #   create                   the record is new on the live site: its row and the rows that belong
    #                            to it there (`entities` refs and names: its asset, its workflow row,
    #                            its meta) are the base's, so the copy keeps its own.
    # `match` names the rows by column, in the copy's numbers (the id map was applied first).

    def _pk(self, schema: str, table: str) -> list[str]:
        rows = self.sql.run(f"SELECT column_name FROM information_schema.statistics WHERE table_schema = {sql_str(schema)}"
                            f" AND table_name = {sql_str(table)} AND index_name = 'PRIMARY' ORDER BY seq_in_index;")
        return [r[0] for r in rows]

    def _has(self, schema: str, table: str) -> bool:
        return bool(self.sql.run(f"SELECT 1 FROM information_schema.tables WHERE table_schema = {sql_str(schema)}"
                                 f" AND table_name = {sql_str(table)};"))

    @staticmethod
    def _match(alias: str, match: dict) -> str:
        parts = []
        for column, value in sorted(match.items()):
            if value is None:
                parts.append(f"{alias}.{q(column)} IS NULL")
            else:
                # As text: a number held in a text column (`fields_values.item_id`) matches too.
                parts.append(f"CAST({alias}.{q(column)} AS CHAR) = {sql_str(str(value))}")
        return " AND ".join(parts) or "FALSE"

    def _absent(self, table: str, cond_alias: str, pk: list[str], columns: list[str]) -> str:
        """A condition on `t` (a row of theirs): the base has no row with its key (all its columns
        when the table has no primary key)."""
        on = " AND ".join(f"b.{q(c)} <=> {cond_alias}.{q(c)}" for c in (pk or columns))
        return f"NOT EXISTS (SELECT 1 FROM {self.ref('base', table)} b WHERE {on})"

    def align_pushed(self, rec: dict) -> None:
        """A record the push made that the live site numbered in a second table the push could not see
        (WordPress gives a new term its `term_taxonomy` row): the live site's row takes the copy's
        number for the same record (`align.by` names it in both), with what points at it, and is
        remembered like a clash."""
        align = rec.get("align")
        if not isinstance(align, dict):
            return
        entity, match = align.get("entity"), align.get("match")
        entities = dict(self.policy.get("entities", []))
        if entity not in entities or not isinstance(match, dict):
            return
        table = self.prefix + entity
        if not all(self._has(s, table) for s in (self.names["ours"], self.names["theirs"])):
            return
        key = self.ids.key(entity)
        got = {side: self.sql.run(f"SELECT {q(key)} FROM {self.ref(side, table)} r WHERE {self._match('r', match)} LIMIT 2;")
               for side in ("ours", "theirs")}
        if len(got["ours"]) != 1 or len(got["theirs"]) != 1:
            return
        mine, live = int(got["ours"][0][0]), int(got["theirs"][0][0])
        if mine == live:
            return
        rule = entities[entity]
        # A live row already on the copy's number moves out of the way first, as a clash would.
        # Each named by its live site's own number (`IdMap.moved`), never by a remembered number
        # that happens to point at it.
        if self.sql.run(f"SELECT 1 FROM {self.ref('theirs', table)} WHERE {q(key)} = {mine} LIMIT 1;"):
            fresh = self.ids.fresh(entity, self.ids.ids(self.names["theirs"], entity) | {mine})
            self.ids.seen.setdefault(entity, set()).add(fresh)
            raw = self.ids.moved(self.names["theirs"], entity, mine, fresh)
            self.ids.map.setdefault(entity, {})[raw] = fresh
            self.ids.renumber(self.names["theirs"], entity, rule, [(mine, fresh)])
            self.ids.added.append({"table": entity, "live": raw, "copy": fresh, "why": "occupied"})
        raw = self.ids.moved(self.names["theirs"], entity, live, mine)
        self.ids.map.setdefault(entity, {})[raw] = mine
        self.ids.renumber(self.names["theirs"], entity, rule, [(live, mine)])
        self.ids.added.append({"table": entity, "live": raw, "copy": mine, "why": "pushed"})

    def writable_columns(self, side: str, table: str) -> list[str]:
        schema = self.names[side]
        if (schema, table) not in self._writable:
            rows = self.sql.run(f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(schema)}"
                                f" AND table_name = {sql_str(table)} AND extra NOT LIKE '%VIRTUAL GENERATED%'"
                                " AND extra NOT LIKE '%STORED GENERATED%' ORDER BY ordinal_position;")
            self._writable[(schema, table)] = [r[0] for r in rows]
        return self._writable[(schema, table)]

    def copy_rows_sql(self, target: str, source: str, table: str, alias: str = "r", verb: str = "INSERT") -> str:
        cols = self.writable_columns(source, table)
        listed = ", ".join(q(c) for c in cols)
        selected = ", ".join(f"{alias}.{q(c)}" for c in cols)
        return f"{verb} INTO {self.ref(target, table)} ({listed}) SELECT {selected} FROM {self.ref(source, table)} {alias}"

    def seed_pushed(self, phase: str) -> None:
        b, m, t = self.names["base"], self.names["ours"], self.names["theirs"]
        script = ["SET FOREIGN_KEY_CHECKS = 0;"]
        entities = dict(self.policy.get("entities", []))
        if phase == "records":
            for rec in self.pushed:
                self.align_pushed(rec)
        for rec in self.pushed:
            table = self.prefix + rec["table"]
            if not all(self._has(s, table) for s in (b, m, t)):
                continue
            match = rec.get("match") if isinstance(rec.get("match"), dict) else {}
            if not match:
                continue
            if phase == "records":
                rows = rec.get("rows")
                if rows in ("ours", "theirs"):
                    script.append(f"DELETE r FROM {self.ref('base', table)} r WHERE {self._match('r', match)};")
                    script.append(self.copy_rows_sql("base", rows, table) +
                                  f" WHERE {self._match('r', match)};")
                    continue
                pk = self._pk(t, table)
                columns = [c for c in rec.get("columns", []) if isinstance(c, str)]
                all_columns = [r[0] for r in self.sql.run(
                    f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(t)}"
                    f" AND table_name = {sql_str(table)};")]
                # A row the push made: the live site's, as the base's.
                script.append(self.copy_rows_sql("base", "theirs", table) +
                              f" WHERE {self._match('r', match)} AND {self._absent(table, 'r', pk, all_columns)};")
                side = "ours" if rec.get("from", "ours") == "ours" else "theirs"
                sets = ", ".join(f"bb.{q(c)} = s.{q(c)}" for c in columns if c in all_columns and c in self.writable_columns("base", table))
                if sets:
                    script.append(f"UPDATE {self.ref('base', table)} bb, {self.ref(side, table)} s SET {sets}"
                                  f" WHERE {self._match('bb', match)} AND {self._match('s', match)};")
                continue
            # dependents: the rows of a created record that the live site made with it.
            if not rec.get("create") or rec.get("entity") not in entities or rec.get("id") is None:
                continue
            rule = entities[rec["entity"]]
            ident = str(rec["id"])
            for ref_table, column, where in rule.get("refs", []):
                full = self.prefix + ref_table
                if not all(self._has(s, full) for s in (b, t)):
                    continue
                cols = [r[0] for r in self.sql.run(
                    f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(t)}"
                    f" AND table_name = {sql_str(full)};")]
                if column not in cols:
                    continue
                cond = f" AND ({self.ids.cond(t, where)})" if where else ""
                script.append(self.copy_rows_sql("base", "theirs", full) +
                              f" WHERE CAST(r.{q(column)} AS CHAR) = {sql_str(ident)}{cond}"
                              f" AND {self._absent(full, 'r', self._pk(t, full), cols)};")
            for ref_table, column, template in rule.get("names", []):
                full = self.prefix + ref_table
                if not all(self._has(s, full) for s in (b, t)):
                    continue
                cols = [r[0] for r in self.sql.run(
                    f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(t)}"
                    f" AND table_name = {sql_str(full)};")]
                if column not in cols:
                    continue
                script.append(self.copy_rows_sql("base", "theirs", full) +
                              f" WHERE r.{q(column)} = {sql_str(template.format(id=ident))}"
                              f" AND {self._absent(full, 'r', self._pk(t, full), cols)};")
        if len(script) > 1:
            self.sql.run("\n".join(script))
            self.seeded += len(script) - 1

    def needs_checksum(self, schemas: dict[str, Schema], schema: str, table: str) -> bool:
        """Whether `merge_table` reads this table's checksum in this schema: never for a table that
        is the copy's whatever (Tracy's own, or ignored); in the copy's schema, only for a table one
        of the reads holds (one neither holds is "same" before any checksum is read)."""
        name = self.bare(table)
        tracy_tables = self.policy.get("tracyTables")
        if (tracy_tables and tracy_tables.search(name)) or name in self.policy.get("ignoreTables", ()):
            return False
        if schema == self.names["ours"]:
            return any(table in schemas[self.names[side]].columns for side in ("base", "theirs"))
        return True

    def keep_session_columns(self, M: Schema) -> dict[str, tuple[list[str], list[str], str]]:
        """The copy's `sessionColumns` (edit locks) of every table that has them, set aside in the
        work schema before anything is merged: `{table: (primary key, columns, kept table)}`."""
        session = self.policy.get("sessionColumns", set())
        kept: dict[str, tuple[list[str], list[str], str]] = {}
        script = []
        for table, columns in sorted(M.columns.items()):
            cols = [c for c, _ in columns if c in session]
            pk = M.primary.get(table)
            if not cols or not pk:
                continue
            aside = f"{q(self.work)}.{q('s_' + hashlib.sha1(table.encode()).hexdigest()[:16])}"
            kept[table] = (pk, cols, aside)
            listed = ", ".join(q(c) for c in pk + cols)
            script.append(f"CREATE TABLE {aside} AS SELECT {listed} FROM {self.ref('ours', table)};"
                          f" ALTER TABLE {aside} ADD PRIMARY KEY ({', '.join(q(c) for c in pk)});")
        if script:
            self.sql.run("\n".join(script))
        return kept

    def restore_session_columns(self, kept: dict[str, tuple[list[str], list[str], str]]) -> None:
        """Every row of the result with the copy's own edit lock again: a row the copy had takes the
        value set aside, a row new from the live site its column's default (none: unlocked).
        Whatever the table went through — rows taken, the live site's whole table, a decision."""
        if not kept:
            return
        listed = ", ".join(sql_str(t) for t in kept)
        now: dict[str, dict[str, tuple[str, str | None]]] = {}
        for table, column, nullable, default in self.sql.run(
                f"SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns"
                f" WHERE table_schema = {sql_str(self.names['ours'])} AND table_name IN ({listed});"):
            now.setdefault(table, {})[column] = (nullable, default)
        script = []
        for table, (pk, cols, aside) in kept.items():
            have = now.get(table, {})
            if not all(c in have for c in pk):
                continue
            sets = []
            for c in cols:
                if c not in have:
                    continue
                nullable, default = have[c]
                # `column_default` is the default as SQL (`NULL`, `0`, `'0000-00-00 00:00:00'`).
                fresh = "NULL" if nullable == "YES" else default
                sets.append(f"r.{q(c)} = IF(s.{q(pk[0])} IS NULL, {fresh if fresh else 'r.' + q(c)}, s.{q(c)})")
            if sets:
                on = " AND ".join(f"s.{q(c)} = r.{q(c)}" for c in pk)
                script.append(f"UPDATE {self.ref('ours', table)} r LEFT JOIN {aside} s ON {on} SET {', '.join(sets)};")
        if script:
            self.sql.run("\n".join(script))

    def merge_order(self, tables: set[str]) -> list[str]:
        """The tables in the order they are merged: the records' own tables before the tables of rows
        that belong to them (`dependents`), which read what the merge kept of their record; the rest
        by name."""
        parents = {self.prefix + p for p in self.policy.get("dependents", {})}
        return sorted(tables, key=lambda t: (t not in parents, t))

    def counted(self, name: str) -> bool:
        """Whether rows of `name` count as records a person changed (`records`): not a log, a version
        or a row that belongs to a record (`uncountedTables`, `appendTables`)."""
        return name not in self.policy.get("uncountedTables", ()) and name not in self.policy.get("appendTables", ())

    def record_visible(self, name: str, alias: str, schema: Schema, table: str) -> str:
        """Whether an existing row represents a record, without excluding it from the merge.
        Missing discriminator columns keep the existing table-level counting rule."""
        columns = {c for c, _ in schema.columns[table]}
        hidden = [f"IFNULL({alias}.{q(c)} IN ({', '.join(sql_str(v) for v in sorted(values))}), FALSE)"
                  for c, values in self.policy.get("uncountedRows", {}).get(name, {}).items()
                  if c in columns and values]
        return "NOT (" + " OR ".join(hidden) + ")" if hidden else "TRUE"

    def edited_columns(self, table: str, name: str, key: list[str], M: Schema) -> list[str]:
        """The columns of `table` a person edits: not its key, nor a column the CMS rebuilds, stamps,
        counts or mirrors from another record."""
        p = self.policy
        skip = (p.get("derivedColumns", {}).get(name, set()) | p.get("bookkeepingColumns", {}).get(name, set())
                | p.get("sessionColumns", set()) | p.get("mirrorColumns", {}).get(name, set())
                | self.named(p.get("volatileColumns", set()), name) | self.named(p.get("counterColumns", set()), name))
        return [c for c in self.writable_columns("ours", table) if c not in key and c not in skip]

    def live_records(self, table: str, name: str, key: list[str], M: Schema) -> int:
        """The rows of a table the copy left alone that the live site added, deleted, or changed in a
        column a person edits: what taking its whole table brings, as records."""
        b, t = self.ref("base", table), self.ref("theirs", table)
        on = " AND ".join(f"rt.{q(c)} = rb.{q(c)}" for c in key)
        changed = " OR ".join(f"NOT (CAST(rt.{q(c)} AS BINARY) <=> CAST(rb.{q(c)} AS BINARY))"
                              for c in self.edited_columns(table, name, key, M)) or "FALSE"
        first = q(key[0])
        visible_b = self.record_visible(name, "rb", M, table)
        visible_t = self.record_visible(name, "rt", M, table)
        rows = self.sql.run(f"SELECT (SELECT COUNT(*) FROM {t} rt LEFT JOIN {b} rb ON {on}"
                            f" WHERE (rb.{first} IS NULL OR {changed})"
                            f" AND ({visible_t} OR (rb.{first} IS NOT NULL AND {visible_b})))"
                            f" + (SELECT COUNT(*) FROM {b} rb LEFT JOIN {t} rt ON {on}"
                            f" WHERE rt.{first} IS NULL AND {visible_b});")
        return int(rows[0][0] or 0) if rows else 0

    def mark_rebuild(self, table: str) -> None:
        """Queue derived data affected by a successful mutation, using the adapter's table names."""
        name = self.bare(table)
        self.rebuild.update(self.prefix + target for target in self.policy.get("rebuildDependencies", {}).get(name, ()))

    def take_table(self, table: str) -> None:
        """The live site's whole table, structure included, in place of the copy's."""
        m, t = self.ref("ours", table), self.ref("theirs", table)
        keys = [k for k in self.foreign_keys if k["table"] == table]
        writable = self.sql.run(f"SELECT column_name FROM information_schema.columns WHERE table_schema = {sql_str(self.names['theirs'])}"
                                f" AND table_name = {sql_str(table)} AND extra NOT LIKE '%VIRTUAL GENERATED%'"
                                " AND extra NOT LIKE '%STORED GENERATED%' ORDER BY ordinal_position;")
        cols = ", ".join(q(row[0]) for row in writable)
        if cols:
            insert = f"INSERT INTO {m} ({cols}) SELECT {cols} FROM {t};"
        else:
            # A generated-only table has no writable projection; preserve its row count.
            count = int(self.sql.run(f"SELECT COUNT(*) FROM {t};")[0][0])
            insert = "\n".join(f"INSERT INTO {m} () VALUES " + ",".join("()" for _ in range(min(1000, count - start))) + ";"
                               for start in range(0, count, 1000))
        self.sql.run(f"DROP TABLE IF EXISTS {m}; CREATE TABLE {m} LIKE {t};" + insert
                     + "\n".join(foreign_key_sql(rebase_foreign_key(k, self.names["theirs"], self.names["ours"])) for k in keys))
        self.counts["tablesFromTheirs"] += 1
        self.mark_rebuild(table)

    def table_conflict(self, table: str, reason: str) -> str:
        cid = f"db:{table}"
        pick = self.decisions.get(cid)
        if pick == "theirs":
            if table in self.theirs.columns:
                self.take_table(table)
            else:
                self.sql.run(f"DROP TABLE IF EXISTS {self.ref('ours', table)};")
                self.mark_rebuild(table)
            return "theirs-by-decision"
        if pick == "ours":
            return "ours-by-decision"
        self.conflicts.append({"id": cid, "kind": "table", "table": table, "reason": reason})
        return "conflict"

    def merge_table(self, table: str, B: Schema, M: Schema, T: Schema) -> str:
        name = self.bare(table)
        policy = self.policy
        tracy_tables = policy.get("tracyTables")
        inB, inM, inT = table in B.columns, table in M.columns, table in T.columns
        if tracy_tables and tracy_tables.search(name):
            return "ours-kept"
        if name in policy.get("ignoreTables", ()):
            # A plugin's own state (its logs, its settings it rewrites itself): the copy's, never
            # merged. A copy that has never had the table takes it whole once: the plugin came over
            # with its files and its place in `active_plugins`, and without its tables it fails on
            # every request (Wordfence installed on the live site after the import, #106).
            if inT and not inM:
                self.take_table(table)
                return "added"
            return "ours-kept"
        if not inT:
            if not inB or not inM:
                return "same"
            if M.checksum[table] == B.checksum[table]:
                self.sql.run(f"DROP TABLE {self.ref('ours', table)};")
                self.mark_rebuild(table)
                return "dropped"
            return self.table_conflict(table, "dropped-live-changed-copy")
        if not inM:
            if not inB:
                self.take_table(table)
                return "added"
            if T.checksum[table] == B.checksum[table]:
                return "same"
            return self.table_conflict(table, "dropped-copy-changed-live")
        if not inB:
            if M.columns[table] == T.columns[table] and M.checksum[table] == T.checksum[table]:
                return "same"
            return self.table_conflict(table, "added-both")
        cb, cm, ct = B.checksum[table], M.checksum[table], T.checksum[table]
        if ct == cb or (cm == ct and M.columns[table] == T.columns[table]):
            return "same"
        same_columns = B.columns[table] == M.columns[table] == T.columns[table]
        key = self.row_key(table, name, B, M, T) if same_columns else None
        # A table with rows of Tracy's own is never taken whole, even when the copy left it alone:
        # the live site's version of those rows is not the copy's. Nor is one holding rows of a
        # record the merge kept and the live site deleted (`dependents`): taken whole, they go.
        if cm == cb and name not in policy.get("tracyRows", {}) and not (key and self.holds_kept_rows(table, name)):
            # Counted before the live table takes the copy's place: a title the live site changed in
            # a table the copy left alone came over, and the dialog read "Nothing had changed on your
            # original site" (dev, 26/10/2026: only rows merged one by one were counted).
            if self.counted(name):
                self.counts["records"] += self.live_records(table, name, key, M) if key else 1
            self.take_table(table)
            # Taken whole, then the rows the live site added with a record the merge held go again
            # (`held_record_rows`): only those. Kept from being taken whole instead, a table with no
            # key (Phoca Cart's `item_groups`) was the copy's entirely, live rows of other records too.
            self.drop_held_rows(table, name, key)
            return "from-theirs"
        if not same_columns:
            return self.table_conflict(table, "schema-changed")
        if not key:
            # No primary key, no unique key without NULLs, no natural key known for it: its rows
            # cannot be matched one to one, so the whole table is the copy's (and named as such).
            return self.table_conflict(table, "no-primary-key")
        tree = self.tree_read(table, name, M) if name in policy.get("orderedTrees", {}) else None
        answer = self.merge_rows(table, name, key, M)
        if tree:
            self.merge_tree_order(table, name, tree)
            if self.order_kept and answer == "merged":
                answer = "conflict"
        return answer

    def row_key(self, table: str, name: str, B: Schema, M: Schema, T: Schema) -> list[str] | None:
        """The columns that match a row of `table` across the three schemas: the primary key; else a
        unique key all three have whose columns hold no NULL; else the policy's `naturalKeys`."""
        pk = M.primary.get(table)
        if pk and B.primary.get(table) == pk and T.primary.get(table) == pk:
            return pk
        not_null = {c for c, definition in M.columns[table] if definition.endswith(" NO")}
        for index in sorted(M.unique.get(table, {})):
            cols = M.unique[table][index]
            if (B.unique.get(table, {}).get(index) == cols == T.unique.get(table, {}).get(index)
                    and all(c in not_null for c in cols)):
                return cols
        known = self.policy.get("naturalKeys", {}).get(name)
        names = {c for c, _ in M.columns[table]}
        if known and all(c in names for c in known):
            return list(known)
        return None

    def dependent_columns_exist(self, parent: str, table: str, column: str, holds: str | None) -> bool:
        """Optional CMS columns must exist on both sides before a dependent rule emits SQL."""
        key = self.ids.key(parent)
        for schema in self.schemas[1:]:
            parent_columns = {c for c, _ in schema.columns.get(self.prefix + parent, [])}
            child_columns = {c for c, _ in schema.columns.get(self.prefix + table, [])}
            if not {key, holds or key} <= parent_columns or column not in child_columns:
                return False
        return True

    def kept_record_rows(self, name: str) -> str | None:
        """A condition on a row `r` of table `name` (in the copy's schema): it belongs to a record
        the merged copy holds and the live site does not (`dependents`). None when no rule names
        the table, or the records' tables are not in both schemas."""
        B, M, T = self.schemas
        parts = []
        for parent, rules in self.policy.get("dependents", {}).items():
            full = self.prefix + parent
            if full not in M.columns or full not in T.columns:
                continue
            key = q(self.ids.key(parent))
            for table, column, where, holds in rules:
                if table != name or not self.dependent_columns_exist(parent, table, column, holds):
                    continue
                cond = (f"r.{q(column)} IN (SELECT p.{q(holds or self.ids.key(parent))} FROM {self.ref('ours', full)} p"
                        f" WHERE NOT EXISTS (SELECT 1 FROM {self.ref('theirs', full)} x WHERE x.{key} = p.{key}))")
                if where:
                    cond += f" AND ({self.ids.cond(self.names['ours'], where)})"
                parts.append(f"({cond})")
        return " OR ".join(parts) or None

    def holds_kept_rows(self, table: str, name: str) -> bool:
        cond = self.kept_record_rows(name)
        return bool(cond and self.sql.run(f"SELECT 1 FROM {self.ref('ours', table)} r WHERE {cond} LIMIT 1;"))

    def held_rules(self, name: str) -> list[tuple[str, str, str | None, str]]:
        """The `dependents` rules that make rows of table `name` belong to a record the merge held:
        (the records' table, the row's column, its condition, the record's column it holds)."""
        out = []
        for parent, rules in self.policy.get("dependents", {}).items():
            if not self.held_records.get(parent):
                continue
            for table, column, where, holds in rules:
                if table == name and self.dependent_columns_exist(parent, table, column, holds):
                    out.append((parent, column, where, holds or self.ids.key(parent)))
        return out

    def held_record_rows(self, name: str) -> str | None:
        """A condition on a row `r` of table `name` in the live read: it belongs to a new record of the
        live site the merge held (`held_records`). None when no held record has rows there."""
        parts = []
        for parent, column, where, holds in self.held_rules(name):
            ids = ", ".join(sql_str(i) for i in sorted(self.held_records[parent]))
            cond = (f"r.{q(column)} IN (SELECT p.{q(holds)} FROM {self.ref('theirs', self.prefix + parent)} p"
                    f" WHERE CAST(p.{q(self.ids.key(parent))} AS CHAR) IN ({ids}))")
            if where:
                cond += f" AND ({self.ids.cond(self.names['theirs'], where)})"
            parts.append(f"({cond})")
        return " OR ".join(parts) or None

    def drop_held_rows(self, table: str, name: str, key: list[str] | None) -> None:
        """After `table` was taken whole (the copy had left it as the base): the rows of a record the
        merge held go again, named with it — one the live site added goes, one it changed to point
        at that record is the base's (the copy's) again. Matched to the base by the table's key; a
        table with none by every column, where a changed row reads as one deleted and one added,
        and the deleted one is the live site's change of another record."""
        cond = self.held_record_rows(name)
        if not cond:
            return
        m, b = self.ref("ours", table), self.ref("base", table)
        names = {c for c, _ in self.schemas[0].columns.get(table, [])}
        cols = [c for c in self.writable_columns("theirs", table) if c in names]
        match = key if key and all(c in names for c in key) else None
        if not cols:
            return
        same = " AND ".join(f"x.{q(c)} <=> r.{q(c)}" for c in (match or cols))
        moved = f"NOT EXISTS (SELECT 1 FROM {b} x WHERE {' AND '.join(f'x.{q(c)} <=> r.{q(c)}' for c in cols)})"
        self.name_held_rows(table, name, match or cols, f"{m} r WHERE {moved}", keyed=bool(match))
        listed = ", ".join(q(c) for c in cols)
        back = f"{q(self.work)}.{q('held_back_' + hashlib.sha1(table.encode()).hexdigest()[:16])}"
        script = []
        if match:
            # Before the live rows go: the base's version of each row the live site pointed there.
            script.append(f"CREATE TEMPORARY TABLE {back} AS SELECT x.* FROM {b} x WHERE EXISTS"
                          f" (SELECT 1 FROM {m} r WHERE ({cond}) AND {moved} AND {same});")
        script.append(f"DELETE r FROM {m} r WHERE ({cond}) AND {moved};")
        if match:
            script.append(f"INSERT INTO {m} ({listed}) SELECT {listed} FROM {back};")
            script.append(f"DROP TEMPORARY TABLE {back};")
        self.sql.run("\n".join(script))

    def name_held_rows(self, table: str, name: str, pk: list[str], rows_of: str, keyed: bool) -> None:
        """The rows of `table` left out as a held record's, named with that record: on its conflict
        (`belonging`), or in `skipped` when a person already picked the copy's record. `rows_of`: the
        rows that may be, as `<table> r WHERE …`; each rule's condition picks among them. `keyed`:
        `pk` matches a row to the base's, and a row the base had is named `changed` (the copy kept
        its own version; the live one, pointed at the held record, was not taken)."""
        b = self.ref("base", table)
        in_base = (f"EXISTS (SELECT 1 FROM {b} x WHERE {' AND '.join(f'x.{q(c)} <=> r.{q(c)}' for c in pk)})"
                   if keyed else "FALSE")
        for parent, column, where, holds in self.held_rules(name):
            key = q(self.ids.key(parent))
            # The rule's condition inside a table of its own: its bare columns are the row's.
            cond = f" AND ({self.ids.cond(self.names['theirs'], where)})" if where else ""
            picked = f"(SELECT r.* FROM {rows_of}{cond}) r"
            rows = self.sql.run(
                f"SELECT CAST(p.{key} AS CHAR), {in_base}, {', '.join('HEX(CAST(r.' + q(c) + ' AS BINARY))' for c in pk)}"
                f" FROM {picked} JOIN {self.ref('theirs', self.prefix + parent)} p ON p.{q(holds)} = r.{q(column)}"
                f" ORDER BY {', '.join('r.' + q(c) for c in pk)};")
            for row in rows:
                if row[0] not in self.held_records[parent]:
                    continue
                key_of = dict(zip(pk, (bytes.fromhex(h).decode("utf-8", "replace") for h in row[2:])))
                entry = {"table": table, "key": key_of, **({"changed": True} if row[1] == "1" else {})}
                conflict = self.held_records[parent][row[0]]
                if conflict is not None:
                    if len(conflict.setdefault("belonging", [])) < SKIPPED_LIMIT:
                        conflict["belonging"].append(entry)
                    conflict["belongingCount"] = conflict.get("belongingCount", 0) + 1
                else:
                    self.counts["skipped"] += 1
                    self.skipped.append({"id": f"db:{table}:{json.dumps(list(key_of.values()), ensure_ascii=False)}",
                                         "kind": "row", **entry, "reason": "belongs-to-held",
                                         "record": {"table": self.prefix + parent, "id": row[0]}})

    # ── the order of a tree's siblings ──────────────────────────────────────────────────────────

    def tree_read(self, table: str, name: str, M: Schema) -> dict | None:
        """Each side's lists of siblings, in order (`lft`), read before the rows are merged: the
        copy's own order is gone once the live site's rows replace some of its rows."""
        names = {c for c, _ in M.columns[table]}
        group = [c for c in self.policy["orderedTrees"][name] if c in names]
        if M.primary.get(table) != ["id"] or "lft" not in names or not group or group[0] != "parent_id":
            return None
        label = next((c for c in ("title", "name", "alias") if c in names), "id")
        return {"group": group, "label": label,
                **{side: self.tree_lists(side, table, group, label) for side in ("base", "ours", "theirs")}}

    def tree_lists(self, side: str, table: str, group: list[str], label: str) -> dict:
        """`{group: [(id, label), …]}` of one schema, each list in its order (`lft`, then id)."""
        cols = ", ".join(f"IFNULL(r.{q(c)}, '')" for c in group)
        lists: dict[tuple, list[tuple[str, str]]] = {}
        for row in self.sql.run(f"SELECT r.id, IFNULL(r.{q(label)}, ''), {cols} FROM {self.ref(side, table)} r"
                                f" ORDER BY r.lft, r.id;"):
            lists.setdefault(tuple(row[2:]), []).append((row[0], row[1]))
        return lists

    def merge_tree_order(self, table: str, name: str, tree: dict) -> bool:
        """The order of each list of siblings in the merged rows, three ways: the live site's when
        only it reordered (a menu item moved up on the live site, #1647), the copy's when only the
        copy did or both did the same; when both reordered differently the copy's, named in
        `conflicts` (kept). Siblings one side has and the other not go after the sibling they follow
        on their own side. The merged lists are written as `lft` (Joomla's `rebuild()` orders by it
        and recomputes the rest). True when an order was written."""
        group, label = tree["group"], tree["label"]
        merged = self.tree_lists("ours", table, group, label)
        lfts = {r[0]: int(r[1]) for r in self.sql.run(f"SELECT id, lft FROM {self.ref('ours', table)};")}
        self.order_kept = False
        written: dict[str, int] = {}
        for g, members in sorted(merged.items()):
            ids = [i for i, _ in members]
            present = set(ids)
            b, o, t = ([i for i, _ in tree[side].get(g, [])] for side in ("base", "ours", "theirs"))

            def among(x, y):
                both = set(x) & set(y)
                return [i for i in x if i in both]

            ours_moved = among(o, b) != among(b, o)
            theirs_moved = among(t, b) != among(b, t)
            primary, other = o, t
            if theirs_moved and not ours_moved:
                primary, other = t, o
            elif theirs_moved and among(o, t) != among(t, o):
                cid = f"db:{table}:order:{json.dumps(list(g), ensure_ascii=False)}"
                pick = self.decisions.get(cid)
                if pick == "theirs":
                    primary, other = t, o
                elif pick != "ours":
                    labels = {side: [n for _, n in tree[side].get(g, [])][:30] for side in ("base", "ours", "theirs")}
                    self.conflicts.append({"id": cid, "kind": "order", "table": table,
                                           "key": dict(zip(group, g)), **labels})
                    self.order_kept = True
            target = [i for i in primary if i in present]
            placed = set(target)
            for source in (other, ids):
                for at, i in enumerate(source):
                    if i in placed or i not in present:
                        continue
                    # After the sibling it follows on its own side; one that ends its side's list
                    # ends the merged one (an item added last stays last), one that starts it goes
                    # before the sibling it precedes.
                    before = next((source[j] for j in range(at - 1, -1, -1) if source[j] in placed), None)
                    after = next((source[j] for j in range(at + 1, len(source)) if source[j] in placed), None)
                    if after is None:
                        target.append(i)
                    elif before is None:
                        target.insert(target.index(after), i)
                    else:
                        target.insert(target.index(before) + 1, i)
                    placed.add(i)
            if target == ids:
                continue
            # The list keeps the `lft` places it had, given out in the new order: siblings of other
            # lists under the same parent keep theirs.
            slots = sorted(lfts[i] for i in ids)
            for n in range(1, len(slots)):
                slots[n] = max(slots[n], slots[n - 1] + 1)
            written.update(zip(target, slots))
        if not written:
            return False
        cases = " ".join(f"WHEN {int(i)} THEN {lft}" for i, lft in written.items())
        listed = ", ".join(str(int(i)) for i in written)
        self.sql.run(f"UPDATE {self.ref('ours', table)} SET lft = CASE id {cases} END WHERE id IN ({listed});")
        self.rebuild.add(table)
        return True

    def merge_rows(self, table: str, name: str, pk: list[str], M: Schema) -> str:
        b, m, t = (self.ref(side, table) for side in ("base", "ours", "theirs"))
        k = f"{q(self.work)}.{q('k_' + hashlib.sha1(table.encode()).hexdigest()[:16])}"
        derived = self.policy.get("derivedColumns", {}).get(name, set())
        bookkeeping = self.policy.get("bookkeepingColumns", {}).get(name, set()) | self.policy.get("sessionColumns", set())
        volatile = self.named(self.policy.get("volatileColumns", set()), name)
        counters = self.named(self.policy.get("counterColumns", set()), name)
        mirror = self.policy.get("mirrorColumns", {}).get(name, set())
        columns = [c for c in self.writable_columns("ours", table) if c not in pk and c not in derived and c not in bookkeeping]
        # A mirror column is merged like any other (the side that changed it), but a clash on it is the
        # record it mirrors' to name, never its own.
        hard = [c for c in columns if c not in volatile and c not in counters and c not in mirror]
        pk_list = ", ".join(q(c) for c in pk)
        types = {c: d.split(" ", 1)[0].lower() for c, d in M.columns[table]}
        # A key of text columns (a natural key, `fields_values.value`) is indexed by a prefix, and
        # not as a primary key: two values may share it. Rows whose key holds a NULL are left out:
        # they stay as the copy has them.
        long_text = any(re.match(r"(tiny|medium|long)?(text|blob)", types.get(c, "")) for c in pk)
        not_null = " AND ".join(f"{q(c)} IS NOT NULL" for c in pk)

        def on(a: str, z: str) -> str:
            return " AND ".join(f"{a}.{q(c)} = {z}.{q(c)}" for c in pk)

        def digest(alias: str) -> str:
            # One MD5 per column, not a HEX of the row: a row near max_allowed_packet would come back
            # NULL from a function that doubles it, and a NULL digest reads as "no such row".
            if not columns:
                return "MD5('')"
            parts = ", ".join(f"COALESCE(MD5(CAST({alias}.{q(c)} AS BINARY)), '-')" for c in columns)
            return f"MD5(CONCAT_WS(',', {parts}))"

        def differs(c: str, x: str, y: str) -> str:
            # Bytes, not the collation's idea of equal: a case-only edit is an edit.
            return f"NOT (CAST({x}.{q(c)} AS BINARY) <=> CAST({y}.{q(c)} AS BINARY))"

        joined = (f"JOIN {b} rb ON {on('k', 'rb')} JOIN {m} rm ON {on('k', 'rm')}"
                  f" JOIN {t} rt ON {on('k', 'rt')}")
        # A row the live site holds as the base had it is never the live site's change, whatever the
        # copy did: only the keys where the live site and the base differ — a row it changed, added or
        # deleted — are digested and classed. Found by comparing the two sides' bytes on their
        # primary key, not by digesting every row of all three (a 20,000-article table: 2.6 s → 0.6 s).
        first = q(pk[0])
        # A row whose key holds a NULL is no key of k (`not_null`): it stays as the copy has it.
        key_set = lambda alias: " AND ".join(f"{alias}.{q(c)} IS NOT NULL" for c in pk)
        live_moved = (" AND ".join(f"CAST(rt.{q(c)} AS BINARY) <=> CAST(rb.{q(c)} AS BINARY)" for c in columns)
                      or "TRUE")
        # k: every key the live site moved, its three digests, and its class —
        #   T  the live site changed the row and the copy did not
        #   X  both changed it, differently (cc: the columns both changed, differently)
        #   U  the live site's version would collide with another of the copy's rows on a unique key
        index = (f"ADD INDEX k_key ({', '.join(q(c) + ('(191)' if re.match(r'(tiny|medium|long)?(text|blob)', types.get(c, '')) else '') for c in pk)})"
                 if long_text else f"ADD PRIMARY KEY ({pk_list})")
        script = [
            f"CREATE TABLE {k} AS SELECT {', '.join('rt.' + q(c) for c in pk)} FROM {t} rt LEFT JOIN {b} rb ON {on('rt', 'rb')}"
            f" WHERE {key_set('rt')} AND (rb.{first} IS NULL OR NOT ({live_moved}))"
            f" UNION SELECT {', '.join('rb.' + q(c) for c in pk)} FROM {b} rb LEFT JOIN {t} rt ON {on('rt', 'rb')}"
            f" WHERE {key_set('rb')} AND rt.{first} IS NULL;",
            f"ALTER TABLE {k} {index}, ADD hb CHAR(32) NULL, ADD hm CHAR(32) NULL,"
            f" ADD ht CHAR(32) NULL, ADD cls CHAR(1) NULL, ADD cc TEXT NULL;",
            f"UPDATE {k} k JOIN {b} r ON {on('k', 'r')} SET k.hb = {digest('r')};",
            f"UPDATE {k} k JOIN {m} r ON {on('k', 'r')} SET k.hm = {digest('r')};",
            f"UPDATE {k} k JOIN {t} r ON {on('k', 'r')} SET k.ht = {digest('r')};",
        ]
        tracy_rows = self.policy.get("tracyRows", {}).get(name)
        if tracy_rows:
            for side in (b, m, t):
                script.append(f"DELETE k FROM {k} k JOIN {side} r ON {on('k', 'r')} WHERE {tracy_rows};")
        script.append(f"UPDATE {k} SET cls = CASE WHEN ht <=> hb OR hm <=> ht THEN NULL"
                      f" WHEN hm <=> hb THEN 'T' ELSE 'X' END;")
        held_rows = self.held_record_rows(name)
        if held_rows:
            # The live site added the row with a new record of its own the merge held (`added-both`),
            # or pointed a row it had at that record: not taken onto the copy's record that has its
            # number. Set aside — the copy keeps its own version, if any — and named with it.
            script.append(f"UPDATE {k} SET cls = 'H' WHERE cls IN ('T', 'X') AND ht IS NOT NULL AND ({pk_list}) IN"
                          f" (SELECT {', '.join('r.' + q(c) for c in pk)} FROM {t} r WHERE {held_rows});")
        kept_rows = self.kept_record_rows(name)
        if kept_rows:
            # The live site deleted a row the copy left alone, with the record it belongs to; the
            # merge kept that record (Tracy changed it): the row stays with it.
            script.append(f"UPDATE {k} SET cls = NULL WHERE cls = 'T' AND ht IS NULL AND ({pk_list}) IN"
                          f" (SELECT {', '.join('r.' + q(c) for c in pk)} FROM {m} r WHERE {kept_rows});")
        script.append(f"DELETE FROM {k} WHERE cls IS NULL;")
        if hard:
            listed = ", ".join(
                f"IF({differs(c, 'rt', 'rb')} AND {differs(c, 'rm', 'rb')} AND {differs(c, 'rm', 'rt')},"
                f" {sql_str(c)}, NULL)" for c in hard
            )
            script.append(f"UPDATE {k} k {joined} SET k.cc = CONCAT_WS(',', {listed}) WHERE k.cls = 'X';")
        for cols in M.unique.get(table, {}).values():
            # `=`, not `<=>`: a unique key holds any number of NULLs.
            clash = " AND ".join(f"rm.{q(c)} = rt.{q(c)}" for c in cols)
            other = " OR ".join(differs(c, "rm", "rt") for c in pk)
            # A copy row the live site deleted and the copy left alone (`T` with no live row) is no
            # clash: the merge deletes it before the live rows go in. That is the live site replacing
            # a row — deleted, then inserted again under a new number with the same unique key, as
            # Joomla's installer does with a component's administrator menu items on every update
            # (dev, ja-impact, 24/10/2026: the new row was "Tracy's version kept" and never came over).
            # A clash with any other copy row still makes the live row a conflict.
            script.append(f"UPDATE {k} k JOIN {t} rt ON {on('k', 'rt')} JOIN {m} rm ON {clash} AND ({other})"
                          f" LEFT JOIN {k} kd ON {on('kd', 'rm')} AND kd.cls = 'T' AND kd.ht IS NULL"
                          f" SET k.cls = 'U' WHERE k.cls IN ('T', 'X') AND kd.{first} IS NULL;")
        self.sql.run("\n".join(script))
        if held_rows:
            self.name_held_rows(table, name, pk, f"{t} r WHERE ({', '.join('r.' + q(c) for c in pk)}) IN"
                                                 f" (SELECT {pk_list} FROM {k} WHERE cls = 'H')", keyed=True)

        # The records this table brings, read before anything is written (`records`): a row the live
        # site added or deleted, or changed in a column a person edits (only the live site: T; both,
        # the live site's edit taken: X). A row whose only change is a stamp or a counter is none.
        count_after = self.counted(name) and name in self.policy.get("uncountedRows", {})
        if self.counted(name):
            edited = self.edited_columns(table, name, pk, M)
            live_edit = " OR ".join(differs(c, "rt", "rb") for c in edited) or "FALSE"
            taken = " OR ".join(f"({differs(c, 'rt', 'rb')} AND NOT {differs(c, 'rm', 'rb')})" for c in edited) or "FALSE"
            eligible = (f"(k.cls = 'T' AND (k.hb IS NULL OR k.ht IS NULL OR ({live_edit})))"
                        f" OR (k.cls = 'X' AND k.ht IS NOT NULL AND k.hm IS NOT NULL AND ({taken}))")
            joins = (f" LEFT JOIN {b} rb ON {on('k', 'rb')} LEFT JOIN {m} rm ON {on('k', 'rm')}"
                     f" LEFT JOIN {t} rt ON {on('k', 'rt')}")
            if count_after:
                # Snapshot the copy's visibility, then read the actual merged row after every
                # column decision. Inferring its type from the live row loses copy-only type edits.
                visible = self.record_visible(name, "rm", M, table)
                self.sql.run(f"ALTER TABLE {k} ADD record_change BOOLEAN NOT NULL DEFAULT FALSE,"
                             " ADD record_before BOOLEAN NOT NULL DEFAULT FALSE;"
                             f" UPDATE {k} k {joins} SET record_change = IFNULL(({eligible}), FALSE),"
                             f" record_before = rm.{first} IS NOT NULL AND ({visible});")
            else:
                got = self.sql.run(f"SELECT IFNULL(SUM({eligible}), 0) FROM {k} k {joins};")
                self.counts["records"] += int(got[0][0] or 0) if got else 0

        append = name in self.policy.get("appendTables", ())
        rows = self.sql.run(
            f"SELECT k.cls, k.hb IS NULL, k.hm IS NULL, k.ht IS NULL, IFNULL(k.cc, ''),"
            f" {', '.join('HEX(CAST(k.' + q(c) + ' AS BINARY))' for c in pk)} FROM {k} k"
            f" WHERE k.cls IN ('X', 'U') ORDER BY {', '.join('k.' + q(c) for c in pk)};"
        )
        # The columns both sides changed, of every row, read at once: `json_merged` asked three
        # queries a row and column, one call each (#1649).
        self.cache = {}
        both = [row for row in rows if row[0] == "X" and row[1:4] == ["0", "0", "0"] and row[4]]
        for c in sorted({c for row in both for c in row[4].split(",") if c}):
            self.prefetch((b, m, t), pk, [c], [row[5:] for row in both if c in row[4].split(",")])
        take_rows: list[list[str]] = []
        take_cols: list[tuple[str, list[str]]] = []
        # A JSON column both sides changed, merged key by key (`merge_json_column`): its merged text.
        json_sets: list[tuple[str, list[str], str]] = []
        found: list[dict] = []
        for row in rows:
            cls, no_b, no_m, no_t, cc, keys = row[0], row[1] == "1", row[2] == "1", row[3] == "1", row[4], row[5:]
            key = [bytes.fromhex(h).decode("utf-8", "replace") for h in keys]
            rid = f"db:{table}:{json.dumps(key, ensure_ascii=False)}"
            reason = ("unique-key" if cls == "U" else "added-both" if no_b
                      else "delete-modify" if no_m or no_t else None)
            if reason == "added-both" and append:
                self.counts["skipped"] += 1
                self.skipped.append({"id": rid, "kind": "row", "table": table, "key": dict(zip(pk, key)),
                                     "reason": "log-added-both"})
                continue
            if reason:
                pick = self.decisions.get(rid)
                conflict = None
                if pick == "theirs":
                    take_rows.append(keys)
                    # Delete/modify rows were excluded from the automatic imported count above.
                    # An explicit live choice applies that deletion or restores the live row.
                    if (no_m or no_t) and self.counted(name):
                        if count_after:
                            self.sql.run(f"UPDATE {k} r SET record_change = TRUE WHERE {self.key_where('r', pk, keys)};")
                        else:
                            self.counts["records"] += 1
                elif pick != "ours":
                    conflict = {"id": rid, "kind": "row", "table": table, "reason": reason,
                                "key": dict(zip(pk, key)), "_keys": keys, "_columns": None}
                    found.append(conflict)
                # The live site's new record stays out: so do the rows it added with it (`dependents`).
                if (reason == "added-both" and pick != "theirs" and name in self.policy.get("dependents", {})
                        and pk == [self.ids.key(name)]):
                    self.held_records.setdefault(name, {})[key[0]] = conflict
                continue
            for c in filter(None, cc.split(",")):
                pick = self.decisions.get(f"{rid}:{c}")
                if pick == "theirs":
                    take_cols.append((c, keys))
                    continue
                # A side whose change is layout only (an editor re-indenting HTML it saved): the other
                # side's change stands, and nothing is named — no person changed that place twice.
                layout = self.layout_change(keys, pk, c, (b, m, t))
                if layout == "theirs":
                    continue
                if layout == "ours":
                    take_cols.append((c, keys))
                    continue
                # Key by key when the column holds JSON: what only one side changed comes over, and
                # only the keys both changed differently are the copy's — and named. "ours" picked
                # by a person means the same: the live site's other keys are not dropped for it.
                details: list[dict] = []
                merged = self.json_merged(keys, pk, c, (b, m, t), details)
                if merged is not None:
                    text, clashes = merged
                    json_sets.append((c, keys, text))
                    if clashes and pick != "ours":
                        # The keys both changed, each with both values cut short: the whole JSON of
                        # a module's params ran out of the dialog (#1648).
                        found.append({"id": f"{rid}:{c}", "kind": "column", "table": table, "column": c,
                                      "key": dict(zip(pk, key)), "fields": clashes[:20],
                                      "fieldValues": details[:20], "_keys": keys, "_columns": [c]})
                    continue
                if pick != "ours":
                    found.append({"id": f"{rid}:{c}", "kind": "column", "table": table, "column": c,
                                  "key": dict(zip(pk, key)), "_keys": keys, "_columns": [c]})
        all_columns = [c for c, _ in M.columns[table]]
        # Each conflict's three versions, read at once by the columns they show (`values`).
        by_columns: dict[tuple[str, ...], list[list[str]]] = {}
        for conflict in found:
            by_columns.setdefault(tuple(conflict["_columns"] or all_columns), []).append(conflict["_keys"])
        for cols, keys_list in by_columns.items():
            self.prefetch((b, m, t), pk, list(cols), keys_list)
        for conflict in found:
            conflict["values"] = self.values(conflict.pop("_keys"), pk, conflict.pop("_columns") or all_columns,
                                             (b, m, t))
        self.conflicts += found

        counted = self.sql.run(
            f"SELECT IFNULL(SUM(cls = 'T' AND ht IS NOT NULL), 0), IFNULL(SUM(cls = 'T' AND ht IS NULL), 0),"
            f" IFNULL(SUM(cls = 'X'), 0) FROM {k};"
        )[0]
        took, deleted, merged = (int(x or 0) for x in counted)
        # Rows only the live site changed; the columns of both-changed rows only it changed (a
        # volatile column: whenever it changed); then what decisions picked. REPLACE also clears a
        # row of the copy that a picked row collides with on a unique key: that is what "theirs" means.
        apply = [
            "SET FOREIGN_KEY_CHECKS = 0;",
            f"DELETE r FROM {m} r JOIN {k} k ON {on('k', 'r')} WHERE k.cls = 'T' AND k.ht IS NULL;",
            self.copy_rows_sql("ours", "theirs", table, "rt", "REPLACE") + f" JOIN {k} k ON {on('k', 'rt')} WHERE k.cls = 'T';",
        ]
        if columns:
            def take(c: str) -> str:
                # A counter both moved: the larger. One only the live site moved: the live site's.
                if c in counters:
                    return (f"rm.{q(c)} = IF({differs(c, 'rt', 'rb')}, IF({differs(c, 'rm', 'rb')} AND"
                            f" NOT (rt.{q(c)} > rm.{q(c)}), rm.{q(c)}, rt.{q(c)}), rm.{q(c)})")
                return (f"rm.{q(c)} = IF({differs(c, 'rt', 'rb')}"
                        + ("" if c in volatile else f" AND NOT {differs(c, 'rm', 'rb')}")
                        + f", rt.{q(c)}, rm.{q(c)})")
            sets = ", ".join(take(c) for c in columns)
            apply.append(f"UPDATE {m} rm JOIN {k} k ON {on('k', 'rm')} JOIN {b} rb ON {on('k', 'rb')}"
                         f" JOIN {t} rt ON {on('k', 'rt')} SET {sets} WHERE k.cls = 'X';")
        for keys in take_rows:
            where = self.key_where("r", pk, keys)
            apply.append(f"DELETE r FROM {m} r WHERE {where};")
            apply.append(self.copy_rows_sql("ours", "theirs", table, "r", "REPLACE") + f" WHERE {where};")
        for c, keys in take_cols:
            apply.append(f"UPDATE {m} rm JOIN {t} rt ON {on('rm', 'rt')} SET rm.{q(c)} = rt.{q(c)}"
                         f" WHERE {self.key_where('rm', pk, keys)};")
        for c, keys, text in json_sets:
            apply.append(f"UPDATE {m} rm SET rm.{q(c)} = {sql_str(text)} WHERE {self.key_where('rm', pk, keys)};")
        # ROW_COUNT is read immediately after each write, on the same connection. A kept
        # column conflict can classify as X without changing the copy; it needs no recount.
        tracks_rebuild = name in self.policy.get("rebuildDependencies", {})
        if tracks_rebuild:
            changed = self.sql.run("\n".join(statement + "\nSELECT ROW_COUNT();" for statement in apply))
            if any(int(row[0] or 0) > 0 for row in changed):
                self.mark_rebuild(table)
        else:
            self.sql.run("\n".join(apply))
        if count_after:
            visible = self.record_visible(name, "rm", M, table)
            got = self.sql.run(f"SELECT IFNULL(SUM(k.record_change AND (k.record_before OR"
                               f" (rm.{first} IS NOT NULL AND ({visible})))), 0) FROM {k} k"
                               f" LEFT JOIN {m} rm ON {on('k', 'rm')};")
            self.counts["records"] += int(got[0][0] or 0) if got else 0
        self.counts["rowsFromTheirs"] += took + len(take_rows)
        self.counts["rowsDeleted"] += deleted
        self.counts["rowsMerged"] += merged
        if derived and not tracks_rebuild and (took or deleted or merged or take_rows):
            self.rebuild.add(table)
        return "conflict" if found else "merged"

    @staticmethod
    def named(columns: set[str], table: str) -> set[str]:
        """The policy's column names that apply to `table`: plain ones, and `table.column` ones."""
        return ({c for c in columns if "." not in c}
                | {c.split(".", 1)[1] for c in columns if c.startswith(table + ".")})

    @staticmethod
    def key_where(alias: str, pk: list[str], keys: list[str]) -> str:
        return " AND ".join(f"{alias}.{q(c)} = UNHEX({sql_str(h)})" for c, h in zip(pk, keys))

    def texts(self, keys: list[str], pk: list[str], column: str, refs: tuple) -> list[str] | None:
        """One row's column as base, copy and live hold it, as UTF-8 text; None when a side lacks
        it, holds NULL or holds bytes that are not UTF-8."""
        where = self.key_where("r", pk, keys)
        texts = []
        for ref in refs:
            got = self.cached(ref, keys, [column])
            if got is False:
                got = self.sql.run(f"SELECT HEX(CAST(r.{q(column)} AS BINARY)) FROM {ref} r WHERE {where};")
            if not got or got[0][0] is None:
                return None
            try:
                texts.append(bytes.fromhex(got[0][0]).decode("utf-8"))
            except ValueError:
                return None
        return texts

    def layout_change(self, keys: list[str], pk: list[str], column: str, refs: tuple) -> str | None:
        """Which side of a column both changed changed only its layout (`layout_text`): "theirs"
        (the live site's is the base's but for layout: the copy's stays), "ours" (the copy's is: the
        live site's comes over), or None when both changed what a reader sees."""
        texts = self.texts(keys, pk, column, refs)
        if texts is None:
            return None
        base, ours, theirs = (layout_text(x) for x in texts)
        if theirs == base or theirs == ours:
            return "theirs"
        if ours == base:
            return "ours"
        return None

    def json_merged(self, keys: list[str], pk: list[str], column: str, refs: tuple,
                    details: list | None = None) -> tuple[str, list[str]] | None:
        """`merge_json_column` over one row's column as base, copy and live hold it; None when any of
        the three is not a JSON object (or not UTF-8): the column stays one value."""
        texts = self.texts(keys, pk, column, refs)
        return None if texts is None else merge_json_column(*texts, details=details)

    def values(self, keys: list[str], pk: list[str], cols: list[str], refs: tuple) -> dict:
        """The three versions of a conflict's columns, for whoever resolves it."""
        select = ", ".join(f"HEX(CAST(r.{q(c)} AS BINARY))" for c in cols)
        where = self.key_where("r", pk, keys)
        out = {}
        for side, ref in zip(("base", "ours", "theirs"), refs):
            got = self.cached(ref, keys, cols)
            got = [[1, *got[0]]] if got else got
            if got is False:
                got = self.sql.run(f"SELECT 1, {select} FROM {ref} r WHERE {where};")
            out[side] = {c: short(v) for c, v in zip(cols, got[0][1:])} if got else None
        return out

    def prefetch(self, refs: tuple, pk: list[str], cols: list[str], keys_list: list[list[str]]) -> None:
        """`cols` of the rows `keys_list` names (each key as `HEX` of its bytes), on every side, read
        in one call into `self.cache` for `cached`: `{(ref, keys): {column: HEX or None}}`, None
        for a row the side does not hold."""
        if not cols or not keys_list:
            return
        select = ", ".join(f"HEX(CAST(r.{q(c)} AS BINARY))" for c in cols)
        named = ", ".join(f"HEX(CAST(r.{q(c)} AS BINARY))" for c in pk)
        script = []
        for side, ref in enumerate(refs):
            for i in range(0, len(keys_list), 200):
                where = " OR ".join(f"({self.key_where('r', pk, keys)})" for keys in keys_list[i:i + 200])
                script.append(f"SELECT {side}, {named}, {select} FROM {ref} r WHERE {where};")
            for keys in keys_list:
                self.cache.setdefault((ref, tuple(keys)), None)
        filled = set()
        for r in self.sql.run("\n".join(script)):
            ref, keys, values = refs[int(r[0])], tuple(r[1:1 + len(pk)]), r[1 + len(pk):]
            # A natural key two rows share (sync-a's `naturalKeys`): the first row, as one query's
            # `got[0]` would have been.
            if (ref, keys) in filled:
                continue
            filled.add((ref, keys))
            self.cache[(ref, keys)] = {**(self.cache.get((ref, keys)) or {}), **dict(zip(cols, values))}

    def cached(self, ref: str, keys: list[str], cols: list[str]):
        """What `prefetch` read of one row: `[[values of cols]]`, `[]` for a row the side lacks, or
        False when it was not read (the caller asks the server)."""
        if (ref, tuple(keys)) not in self.cache:
            return False
        row = self.cache[(ref, tuple(keys))]
        if row is None:
            return []
        if any(c not in row for c in cols):
            return False
        return [[row[c] for c in cols]]


def policy_tables(platform: str, prefix: str) -> set[str]:
    """Every table the merge reads or writes beyond comparing it whole (with the prefix): the
    records' tables and every table their numbers, names and links live in or are reached through,
    the tables of rows that belong to a record, the trees, the tables a read is normalised in and
    those with rows of Tracy's own. A table outside them that both reads of the live site hold alike
    is "same" in the merge whatever else happens to the reads (webroot-sync.sh loads neither copy of
    it: lib/dump_sections.py); one of these may not be, so these are always loaded."""
    policy = POLICIES.get(platform, {})
    named: set[str] = set()
    placeholders = re.compile(r"\{(\w+)\}")

    def conditions(*texts) -> None:
        for text in texts:
            if text:
                named.update(placeholders.findall(text))

    for table, rule in policy.get("entities", []):
        named.add(table)
        for ref_table, _, where in rule.get("refs", []):
            named.add(ref_table)
            conditions(where)
        for ref_table, _, _ in rule.get("names", []) + rule.get("texts", []):
            named.add(ref_table)
    for parent, rules in policy.get("dependents", {}).items():
        named.add(parent)
        for table, _, where, _ in rules:
            named.add(table)
            conditions(where)
    named.update(policy.get("orderedTrees", {}))
    named.update(policy.get("tracyRows", {}))
    for statement in policy.get("normalise", []):
        named.update(re.findall(r"\{prefix\}(\w+)", statement))
    # WordPress's reads are prepared by their `options` (the address, the numbering by name), and
    # their auto-drafts yield to the copy's in `posts`, `postmeta` and `term_relationships` (YIELD).
    if platform in PREPARE:
        named.add("options")
    if platform in YIELD:
        named.update(("posts", "postmeta", "term_relationships"))
    return {prefix + t for t in named}


def prefer_ours(answer: dict) -> dict:
    """The copy wins every place both sides changed differently (the policy set 20/10/2026:
    "on a conflict, prefer Tracy's site"). Every unresolved conflict already leaves the copy's
    version in the result, so the merge is done: the conflicts become `kept` — what the live site
    changed and the copy did not take — so a sync says what it left behind instead of losing it
    silently. Draft blobs go: nobody resolves these."""
    kept, held = [], list(answer.get("held", []))
    conflicts = []
    for c in answer.pop("conflicts", []):
        # configuration.php's clashes, one kept place per setting with both values: listed as the
        # file, they read "deleted" on both sides (#1648).
        if c.get("kind") == "settings":
            conflicts += [{**s, "path": c.get("path")} for s in c.get("settings", [])]
        else:
            conflicts.append(c)
    for c in conflicts:
        c = {k: v for k, v in c.items() if k != "draft"}
        # Two new records, one on each side, under one number in a table the adapter cannot number
        # again: not a clash about one thing — taking the copy's would drop the customer's record.
        # Held for a person instead (council, 20/10/2026).
        (held if c.get("kind") == "row" and c.get("reason") == "added-both" else kept).append(c)
    return {**answer, "conflicts": [], "kept": kept, "held": held}


# ── entry ────────────────────────────────────────────────────────────────────────────────────


# Columns a Joomla site moves on its own (a page view, a login, an edit lock, a scheduled run, an
# update check): left out of `checksums`, so a person looking at the copy while it syncs does not read
# as Tracy changing it. The same list as live-pull.mjs SKIP_COLUMNS (and the engine's skip_columns).
SUBSTANCE_SKIP_COLUMNS = ("hits", "checked_out", "checked_out_time", "lastvisitDate", "lastResetTime",
                          "resetCount", "last_execution", "next_execution", "times_executed",
                          "times_failed", "last_exit_code", "locked", "last_check_timestamp")


# How many clients `substance_checksums` reads on at once.
CHECKSUM_CLIENTS = 3


def substance_checksums(sql: "Sql", schema: str, platform: str, prefix: str) -> list[tuple[str, str]]:
    """Each table's checksum of its substance — `<rows>:<xor of a 64-bit MD5 per row>` over every column
    but SUBSTANCE_SKIP_COLUMNS — leaving out the tables only the site's running writes (its sessions,
    its logs: the policy's ignoreTables and appendTables). What `apply` compares to know the copy did
    not move since `merge` read it; a CHECKSUM TABLE saw every visit to the copy (22/10/2026)."""
    policy = POLICIES.get(platform, {})
    ignore, append = policy.get("ignoreTables", set()), policy.get("appendTables", set())
    bare = lambda t: t[len(prefix):] if t.startswith(prefix) else None
    # `in`, not a list: WordPress names its noise tables by pattern (live_sync_wordpress.TableNames).
    noise = lambda t: bare(t) is not None and (bare(t) in ignore or bare(t) in append)
    # Rows the site rewrites by itself inside a table of substance (WordPress's transients and cron).
    noise_rows = policy.get("noiseRows", {})
    skip = ", ".join(sql_str(c) for c in SUBSTANCE_SKIP_COLUMNS)
    cols = sql.run(f"SELECT c.table_name, c.column_name FROM information_schema.columns c"
                   f" JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name"
                   f" WHERE c.table_schema = {sql_str(schema)} AND t.table_type = 'BASE TABLE'"
                   f" AND c.column_name NOT IN ({skip}) ORDER BY c.table_name, c.ordinal_position;")
    by_table: dict[str, list[str]] = {}
    for table, column in cols:
        if not noise(table) and not TRACY_COPY_TABLE.match(table):
            by_table.setdefault(table, []).append(column)
    if not by_table:
        return []
    parts: dict[str, str] = {}
    for table, columns in by_table.items():
        values = ", ".join(f"IFNULL(HEX(CAST({q(c)} AS BINARY)), 'N')" for c in columns)
        rows = noise_rows.get(bare(table) or "")
        parts[table] = (f"SELECT {sql_str(table)}, CONCAT(COUNT(*), ':', IFNULL(BIT_XOR(CAST(CONV(SUBSTRING("
                        f"MD5(CONCAT_WS(0x1f, {values})), 1, 16), 16, 10) AS UNSIGNED)), 0)) FROM {q(schema)}.{q(table)} r"
                        + (f" WHERE NOT {rows};" if rows else ";"))
    # Every row of every table is read and digested, three times a sync (before and after the copy
    # is read, and before it is replaced): on CHECKSUM_CLIENTS clients side by side, the tables
    # shared out by size; the answer in the order one client gave it.
    sizes = {r[0]: int(r[1] or 0) for r in sql.run(
        f"SELECT table_name, data_length FROM information_schema.tables WHERE table_schema = {sql_str(schema)};")}
    shares: list[list[str]] = [[] for _ in range(min(CHECKSUM_CLIENTS, len(parts)))]
    weight = [0] * len(shares)
    for table in sorted(parts, key=lambda t: -sizes.get(t, 0)):
        i = weight.index(min(weight))
        shares[i].append(table)
        weight[i] += sizes.get(table, 0) + 1
    got: dict[str, str] = {}

    def run(i: int, tables: list[str]) -> None:
        client = sql if i == 0 else Sql(sql.argv)
        try:
            for r in client.run("\n".join(parts[t] for t in tables)):
                got[r[0]] = r[1]
        finally:
            if client is not sql:
                client.close()

    with concurrent.futures.ThreadPoolExecutor(len(shares)) as pool:
        for done in [pool.submit(run, i, tables) for i, tables in enumerate(shares)]:
            done.result()
    return [(table, got[table]) for table in parts]


# How long the line saying why the engine stopped may be, in characters.
FAILURE_LIMIT = 300
# The halves whose answer is one JSON object on stdout, and what each is called in the job's output.
ANSWERING = {"files": "file merge", "normalise": "normalise", "db": "db merge"}
ENGINE_FILES = {Path(__file__).name, "live_sync_wordpress.py", "live_push.py"}


def failure_line(exc: BaseException) -> str:
    """Why the engine stopped, in one line for the sync's answer and its progress: the exception's
    kind, the last line it said — for a statement the database refused, the SQL client's own error
    (`SqlError.said`) — and the engine's function it stopped in. Cut at the first quote: an SQL
    error quotes the row it is about (`Duplicate entry '…' for key …`), and a value of the site
    never goes into an answer."""
    said = getattr(exc, "said", None)
    if not said:
        lines = [line for line in str(exc).splitlines() if line.strip()]
        said = lines[-1].strip() if lines else ""
    quote = min((i for i in (said.find("'"), said.find('"')) if i >= 0), default=-1)
    if quote >= 0:
        said = said[:quote] + "'…'"
    # Where: the engine's last two calls on the way down, the SQL client's own left out (every
    # statement goes through it) and so are comprehensions — `IdMap.apply › IdMap.renumber`.
    path, tb = [], exc.__traceback__
    while tb is not None:
        frame = tb.tb_frame
        owner = frame.f_locals.get("self")
        if (Path(frame.f_code.co_filename).name in ENGINE_FILES and not isinstance(owner, Sql)
                and not frame.f_code.co_name.startswith("<")):
            path.append((type(owner).__name__ + "." if owner is not None else "") + frame.f_code.co_name)
        tb = tb.tb_next
    where = " › ".join(path[-2:])
    text = type(exc).__name__ + (f": {said}" if said else "") + (f" (in {where})" if where else "")
    return text[:FAILURE_LIMIT]


def step_line(said: str) -> str:
    """A line of the job's progress: `==> [Ns] …` on the sync's own clock (TRACY_SYNC_T0,
    webroot-sync.sh), which keeps it among the sync's timed steps."""
    t0 = os.environ.get("TRACY_SYNC_T0", "")
    return f"==> [{int(time.time()) - int(t0)}s] {said}" if t0.isdigit() else f"==> {said}"


def main(argv: list[str]) -> int:
    """Run one half; when it stops on an exception, say why where the sync can read it (#1654 S14:
    a MERGE_FAILED told nobody what had stopped): the traceback in the job's log, one line among its
    timed steps, and — for a half that answers in JSON — an answer whose `detail` is that line."""
    args = parse(argv)
    try:
        return run_half(args)
    except Exception as exc:  # noqa: BLE001 — every stop is reported, then the half fails
        import traceback
        traceback.print_exc()
        line = failure_line(exc)
        print(step_line(f"{ANSWERING.get(args.half, args.half)} stopped: {line}"), file=sys.stderr)
        if args.half in ANSWERING:
            print(json.dumps({"ok": False, "code": "MERGE_FAILED", "detail": line}, ensure_ascii=False))
        return 1


def parse(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="half", required=True)
    files = sub.add_parser("files")
    for flag in ("--repo", "--base", "--ours", "--theirs", "--platform"):
        files.add_argument(flag, required=True)
    files.add_argument("--decisions")
    files.add_argument("--prefer", choices=["ours"])
    files.add_argument("--pushed", help="JSON file of what Sync to live wrote on the live site since the base")
    stat_m = sub.add_parser("stat-manifest")
    for flag in ("--repo", "--rev", "--stat"):
        stat_m.add_argument(flag, required=True)
    normalise = sub.add_parser("normalise")
    for flag in ("--schema", "--platform"):
        normalise.add_argument(flag, required=True)
    normalise.add_argument("--prefix", default="")
    db = sub.add_parser("db")
    for flag in ("--base-schema", "--ours-schema", "--theirs-schema", "--work-schema", "--platform"):
        db.add_argument(flag, required=True)
    db.add_argument("--prefix", default="")
    db.add_argument("--decisions")
    db.add_argument("--prefer", choices=["ours"])
    db.add_argument("--id-map", help="JSON file of the numbers earlier syncs gave; read, not written")
    db.add_argument("--pushed", help="JSON file of what Sync to live wrote on the live site since the base")
    checksums = sub.add_parser("checksums")
    for flag in ("--schema", "--platform"):
        checksums.add_argument(flag, required=True)
    checksums.add_argument("--prefix", default="")
    keep = sub.add_parser("keep-tables")
    keep.add_argument("--platform", required=True)
    keep.add_argument("--prefix", default="")
    never = sub.add_parser("never-taken")
    never.add_argument("--platform", required=True)
    never.add_argument("--prefix", default="")
    return parser.parse_args(argv)


def never_taken(platform: str, prefix: str) -> dict:
    """The tables a merge keeps the copy's whatever the live site holds — Tracy's own (`tracyTables`:
    the Claude Cowork engine's undo log, its caches) and the ignored ones (`ignoreTables`: sessions,
    Smart Search's index, plugins' logs and queues) — for live-pull.mjs (TRACY_SYNC_IGNORED_TABLES),
    which reads none of them again once it has a read of them: `{prefix, names, patterns}` over the
    name without the prefix, `{}` when the prefix is not known. The engine's undo log on a WordPress
    site held 22 MB and moved with every Sync to live write, and each sync after one read it whole
    (dev, 27/10/2026)."""
    if not prefix or platform not in POLICIES:
        return {}
    policy = POLICIES[platform]
    ignore = policy.get("ignoreTables", set())
    names = sorted(getattr(ignore, "names", ignore))
    patterns = [p.pattern for p in getattr(ignore, "patterns", [])]
    if policy.get("tracyTables") is not None:
        patterns.append(policy["tracyTables"].pattern)
    return {"prefix": prefix, "names": names, "patterns": patterns}


def run_half(args: argparse.Namespace) -> int:
    decisions = read_decisions(getattr(args, "decisions", None))

    if args.half == "keep-tables":
        sys.stdout.write("".join(t + "\n" for t in sorted(policy_tables(args.platform, args.prefix))))
        return 0
    if args.half == "never-taken":
        print(json.dumps(never_taken(args.platform, args.prefix)))
        return 0
    if args.half == "stat-manifest":
        with open(args.stat, encoding="utf-8", errors="surrogateescape") as f:
            print(json.dumps(stat_manifest(args.repo, args.rev, json.load(f)), ensure_ascii=False))
        return 0
    if args.half == "files":
        pushed_files = {}
        if getattr(args, "pushed", None) and Path(args.pushed).exists():
            said = json.loads(Path(args.pushed).read_text())
            for f in said.get("files", []) or []:
                if isinstance(f, dict) and isinstance(f.get("path"), str) and "ours" in f and (f["ours"] is None or isinstance(f["ours"], str)):
                    pushed_files[f["path"]] = (f["ours"], "theirs" if f.get("side") == "theirs" else "ours")
            # A setting of the configuration file an Undo of "Sync to live" put back on the live site:
            # the copy keeps Tracy's value there (merge_joomla_config reads the decision `ours`).
            for x in said.get("settings", []) or []:
                if isinstance(x, dict) and x.get("side") == "theirs" and isinstance(x.get("path"), str) \
                        and isinstance(x.get("setting"), str):
                    decisions.setdefault(f"file:{x['path']}#{x['setting']}", "ours")
        answer = merge_files(args.repo, args.base, args.ours, args.theirs, args.platform, decisions,
                             getattr(args, "prefer", None), pushed_files)
        print(json.dumps(prefer_ours(answer) if getattr(args, "prefer", None) == "ours" else answer,
                         ensure_ascii=False))
        return 0
    client = json.loads(os.environ.get("TRACY_SYNC_SQL", "null") or "null")
    if not isinstance(client, list) or not client:
        print(json.dumps({"ok": False, "code": "NO_SQL_CLIENT"}))
        return 2
    sql = Sql(client)
    try:
        if args.half == "checksums":
            for table, value in substance_checksums(sql, args.schema, args.platform, args.prefix):
                print(f"{table}\t{value}")
            return 0
        if args.half == "normalise":
            sql.database = args.schema
            statements = POLICIES.get(args.platform, {}).get("normalise", [])
            if statements:
                sql.run("\n".join(s.replace("{prefix}", args.prefix) for s in statements))
            answer = {"ok": True, "statements": len(statements)}
        else:
            id_map = json.loads(Path(args.id_map).read_text()) if args.id_map and Path(args.id_map).exists() else {}
            pushed = (json.loads(Path(args.pushed).read_text()).get("records", [])
                      if args.pushed and Path(args.pushed).exists() else [])
            answer = DbMerge(sql, args.base_schema, args.ours_schema, args.theirs_schema,
                             args.work_schema, args.platform, args.prefix, decisions, id_map, pushed).run()
            if getattr(args, "prefer", None) == "ours":
                answer = prefer_ours(answer)
    finally:
        sql.close()
    print(json.dumps(answer, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
