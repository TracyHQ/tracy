"""Which of the table snapshots in a copy's own database have outlived their use (#1649).

The Claude Cowork engine's `db.snapshot` (Joomla, claude-cowork `joomla/cowork/lib/Engine.php`
`SNAP_PREFIX`) copies tables to `_tracy_snap_<tag>__<table>` inside the site's database, where
`<tag>` is `gmdate('YmdHis')` — UTC, 14 digits, one tag per call. Its one reader is `db.rollback
{tag}`, which renames that tag's copies back over the live tables. Nothing else reads them: Sync from
live ignores them (`live_sync.py` `TRACY_COPY_TABLE`), backups and export leave them out
(`site-backup.sh`), a restore never moves them, and undoing a chat turn goes to a backup point. And
nothing removed them, so every snapshot an agent took stayed in the copy for good — a whole-database
one doubling it.

THE RULE, per tag and never per table:

  * A tag younger than `keep_days` (7) stays: it covers the agent's own way back within a turn or a
    session, and an upgrade chain (`core.upgrade` prepare → finalise, hop after hop) that spans days.
  * The newest `keep_newest` (1) tags stay whatever their age: a customer who comes back to an
    upgrade weeks later and says "put it back" asks for the last one taken, and it costs one copy.
  * Every other dated tag goes, ALL its tables at once. Never part of a tag: `db.rollback` restores
    every table the tag carries, and a tag with some of its tables gone is a way back that silently
    restores half a site (the engine's own words: "half a snapshot is worse than none").
  * A name that wears the prefix but carries no valid stamp (`_tracy_snap_j6__…`, a month 13) is not
    ours to date: it is kept and named, never dropped. A stamp in the future is dated, and young.

`_tracy_trash_*` is not touched here: that is the engine's trash, emptied by `db.purge`.

Usage (reads table names, one per line, on stdin):

    copy_snapshots.py plan --schema S [--keep-days 7] [--keep-newest 1] [--now EPOCH] [--batch 50]

prints one `DROP TABLE IF EXISTS …;` statement per batch (all of one tag, at most `--batch` names),
then, as the last line, the answer:
`{"tags": n, "kept": [tag…], "dropped": [tag…], "tables": n dropped, "undated": [name…], "said": "…"}`
(`said`: one line for the log, empty when nothing was dropped and nothing is undated).
`IF EXISTS`: a tag `db.rollback` put back between the listing and the drop has no copies left, and
then there is nothing to drop.
"""
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone

PREFIX = "_tracy_snap_"
SNAP = re.compile(r"^_tracy_snap_([0-9]{14})__(.+)$")


def stamp_epoch(tag):
    """The UTC time a 14-digit `YmdHis` tag names, as epoch seconds, or None when it names none."""
    if not re.fullmatch(r"[0-9]{14}", tag or ""):
        return None
    try:
        when = datetime.strptime(tag, "%Y%m%d%H%M%S")
    except ValueError:
        return None
    return int(when.replace(tzinfo=timezone.utc).timestamp())


def plan(names, now, keep_days, keep_newest):
    """(tags to drop with their tables, tags kept, undated names) for the snapshot names given."""
    by_tag, undated = {}, []
    for name in names:
        if not name.startswith(PREFIX):
            continue
        m = SNAP.match(name)
        if not m or stamp_epoch(m.group(1)) is None:
            undated.append(name)
            continue
        by_tag.setdefault(m.group(1), []).append(name)
    newest_first = sorted(by_tag, reverse=True)  # 14-digit stamps sort as time does
    kept, drop = [], []
    for i, tag in enumerate(newest_first):
        young = now - stamp_epoch(tag) < keep_days * 86400
        if young or i < keep_newest:
            kept.append(tag)
        else:
            drop.append((tag, sorted(by_tag[tag])))
    return drop, kept, sorted(undated)


def q(name):
    return "`" + name.replace("`", "``") + "`"


def statements(schema, drop, batch):
    out = []
    for _tag, tables in drop:
        for i in range(0, len(tables), batch):
            names = ", ".join(f"{q(schema)}.{q(t)}" for t in tables[i : i + batch])
            out.append(f"DROP TABLE IF EXISTS {names};")
    return out


def main(argv):
    p = argparse.ArgumentParser()
    p.add_argument("op", choices=["plan"])
    p.add_argument("--schema", required=True)
    p.add_argument("--keep-days", type=float, default=7)
    p.add_argument("--keep-newest", type=int, default=1)
    p.add_argument("--now", type=int, default=None)
    p.add_argument("--batch", type=int, default=50)
    a = p.parse_args(argv)
    if a.keep_days < 0 or a.keep_newest < 0 or a.batch < 1:
        p.error("--keep-days and --keep-newest must not be negative, --batch at least 1")
    now = a.now if a.now is not None else int(time.time())
    names = [line.strip() for line in sys.stdin if line.strip()]
    drop, kept, undated = plan(names, now, a.keep_days, a.keep_newest)
    for statement in statements(a.schema, drop, a.batch):
        print(statement)
    tables = sum(len(t) for _, t in drop)
    said = []
    if drop:
        said.append(f"{len(drop)} of {len(kept) + len(drop)} tag(s) dropped ({tables} tables), kept {' '.join(kept) or 'none'}")
    if undated:
        said.append(f"{len(undated)} undated name(s) left alone")
    print(
        json.dumps(
            {
                "tags": len(kept) + len(drop),
                "kept": kept,
                "dropped": [tag for tag, _ in drop],
                "tables": tables,
                "undated": undated,
                "said": "; ".join(said),
            }
        )
    )


if __name__ == "__main__":
    main(sys.argv[1:])
