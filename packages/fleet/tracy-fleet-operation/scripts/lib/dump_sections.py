#!/usr/bin/env python3
"""A database dump read as its tables: what "Sync from live" (webroot-sync.sh) needs to load only the
tables of the two reads of the live site that differ.

The base (the read the last sync merged) and the read being merged now hold, table for table, the
same rows wherever the customer changed nothing; live-pull.mjs even copies an unmoved table's part
from the last read byte for byte. Such a table answers "same" in the merge whatever the copy did
(lib/live_sync.py `merge_table`: the live site did not change it), so loading it into two scratch
schemas — every row parsed and indexed twice — bought nothing. Left out of both, it answers "same"
all the same: a table neither read holds is the copy's.

Two formats are read: live-pull.mjs's (a `-- table `name`` line opens each table's part, nothing
before the first) and mariadb-dump's (`-- Table structure for table `name``, a head of session
settings, views, routines and a tail). A table's part runs from its line to the next table's, a
view's, or the routines'/events'/tail's.

  digest            stdin (a dump) → JSON: each table's digest, the head's, what may not be left out
  same A B --keep K the tables two digests hold alike, one per line, but those named in K and those
                    no table may be left out of (a view in either dump: none)
  cut --skip F      stdin → stdout without the tables named in F
  cut --only F      stdin → stdout with only the tables named in F (the head and tail kept)
  split --streams N --out D [--skip F]
                    stdin → each table's part in a file of its own under D, shared out by size among
                    N loads (one line of paths per load on stdout, largest first); exit 3 — nothing to
                    load side by side — for a dump with views, routines, a tail, LOCK TABLES or no
                    `-- table` line at all

A table's digest does not depend on how its rows were cut into INSERTs: live-pull.mjs reads a table
in pages cut by bytes and time, so two reads of the same rows rarely group them alike. The lines of
a part are hashed as written, but consecutive `INSERT INTO `t` VALUES …;` lines of the table are
hashed as their VALUES lists joined by commas — the rows, in order, which is what loading them
makes. Two parts with one digest load into the same table. Each such line is one whole statement:
both writers end a statement with its line and escape a newline inside a value.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys

MARKERS = (b"-- table `", b"-- Table structure for table `")
VIEW = (b"-- Temporary table structure for view", b"-- Final view structure for view")
# Where mariadb-dump stops listing tables (dump_tables.py END): routines, events, the tail.
END = (b"-- Dumping routines for database", b"-- Dumping events for database", b"/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE")
REFERENCES = re.compile(rb"REFERENCES `((?:[^`]|``)+)`")


def _name(line: bytes) -> str | None:
    for marker in MARKERS:
        if line.startswith(marker):
            rest = line[len(marker):].rstrip(b"\r\n")
            if rest.endswith(b"`"):
                return rest[:-1].replace(b"``", b"`").decode("utf-8", "surrogateescape")
            return None
    return None


def digest(src) -> dict:
    """{"head": digest, "tables": {name: digest}, "fixed": [names that may not be left out],
    "views": bool}. `fixed`: a table named twice, and every table on either end of a foreign key
    (loading one without the other is not the same load)."""
    head = hashlib.sha256()
    tables: dict[str, str] = {}
    fixed: set[str] = set()
    views = False
    current: str | None = None
    h = None
    prefix = b""
    in_insert = False

    def close():
        if current is not None:
            if current in tables:
                fixed.add(current)
            tables[current] = h.hexdigest()

    for line in src:
        name = _name(line)
        if name is not None:
            close()
            current, h, in_insert = name, hashlib.sha256(), False
            prefix = b"INSERT INTO `" + name.encode("utf-8", "surrogateescape").replace(b"`", b"``") + b"` VALUES "
            h.update(line)
            continue
        if line.startswith(VIEW) or line.startswith(END):
            views = views or line.startswith(VIEW)
            close()
            current = None
            continue
        if current is None:
            # The head (and anything after the tables): only what a loader runs counts.
            if line.strip() and not line.startswith(b"--"):
                head.update(line)
            continue
        if line.startswith(prefix) and line.endswith(b";\n"):
            h.update(b"," if in_insert else b"\0I")
            h.update(line[len(prefix):-2])
            in_insert = True
            continue
        in_insert = False
        h.update(b"\0L")
        h.update(line)
        if b"REFERENCES `" in line:
            fixed.add(current)
            fixed.update(m.replace(b"``", b"`").decode("utf-8", "surrogateescape") for m in REFERENCES.findall(line))
    close()
    return {"head": head.hexdigest(), "tables": tables, "fixed": sorted(fixed), "views": views}


def same(a: dict, b: dict, keep: set[str]) -> list[str]:
    if a.get("views") or b.get("views") or a.get("head") != b.get("head"):
        return []
    fixed = set(a.get("fixed", [])) | set(b.get("fixed", [])) | keep
    alike = sorted(t for t, d in a["tables"].items() if t not in fixed and b["tables"].get(t) == d)
    # Never every table: a scratch schema left with none reads as one the server refused to make.
    return alike[:-1] if alike and len(alike) == len(a["tables"]) else alike


def cut(src, out, names: set[str], only: bool) -> None:
    """Every line but the parts of `names` (only=False), or only theirs with the head and the tail."""
    keep = True
    for line in src:
        name = _name(line)
        if name is not None:
            keep = (name in names) == only
        elif line.startswith(VIEW) or line.startswith(END):
            # Views, routines, events and the tail are no table's: kept by a cut that drops tables,
            # left out by one that keeps only the named ones (the tail itself always kept).
            keep = not only or line.startswith(END[2])
        if keep:
            out.write(line)


class NotSplittable(Exception):
    """A dump whose tables cannot load each on a connection of its own: one holding views, routines,
    events, mariadb-dump's tail, or LOCK TABLES (a table locked on one connection is not on the next:
    ERROR 1100, dev 26/10/2026)."""


def split(src, out_dir: str, streams: int, skip: set[str]) -> list[list[str]]:
    """Each table's part (the head's lines in front of every part) in `<out_dir>/<n>.sql`; the parts
    shared out among `streams` loads, the largest part first to the load holding the fewest bytes."""
    import os
    head: list[bytes] = []
    parts: list[tuple[str, int]] = []
    out = None
    size = 0
    seen_table = False

    def close():
        nonlocal out
        if out is not None:
            out.close()
            parts.append((out.name, size))
            out = None

    for line in src:
        if line.startswith(VIEW) or line.startswith(END) or line.startswith(b"LOCK TABLES"):
            close()
            raise NotSplittable(line[:60].decode("utf-8", "replace"))
        name = _name(line)
        if name is not None:
            close()
            seen_table = True
            if name not in skip:
                out = open(os.path.join(out_dir, f"{len(parts)}.sql"), "wb")
                out.writelines(head)
                out.write(line)
                size = len(line)
            continue
        if out is not None:
            out.write(line)
            size += len(line)
        elif not seen_table:
            # Before the first table: the session settings every load needs.
            head.append(line)
    close()
    # No `-- table` line at all: not a dump of tables this cuts (statements loaded as they are, in
    # one load), never "nothing to load".
    if not seen_table:
        raise NotSplittable("no table")
    loads: list[tuple[int, list[str]]] = [(0, []) for _ in range(max(1, streams))]
    for path, bytes_ in sorted(parts, key=lambda part: -part[1]):
        at = min(range(len(loads)), key=lambda i: loads[i][0])
        loads[at] = (loads[at][0] + bytes_, loads[at][1] + [path])
    return [paths for _, paths in loads if paths]


def _names(path: str) -> set[str]:
    with open(path, encoding="utf-8", errors="surrogateescape") as f:
        return {line.rstrip("\n") for line in f if line.strip()}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="op", required=True)
    sub.add_parser("digest")
    s = sub.add_parser("same")
    s.add_argument("a")
    s.add_argument("b")
    s.add_argument("--keep", required=True)
    c = sub.add_parser("cut")
    which = c.add_mutually_exclusive_group(required=True)
    which.add_argument("--skip")
    which.add_argument("--only")
    sp = sub.add_parser("split")
    sp.add_argument("--streams", type=int, required=True)
    sp.add_argument("--out", required=True)
    sp.add_argument("--skip")
    args = parser.parse_args(argv)
    if args.op == "digest":
        json.dump(digest(sys.stdin.buffer), sys.stdout)
        print()
    elif args.op == "same":
        with open(args.a) as fa, open(args.b) as fb:
            names = same(json.load(fa), json.load(fb), _names(args.keep))
        sys.stdout.write("".join(n + "\n" for n in names))
    elif args.op == "split":
        try:
            loads = split(sys.stdin.buffer, args.out, args.streams, _names(args.skip) if args.skip else set())
        except NotSplittable:
            return 3
        sys.stdout.write("".join(" ".join(paths) + "\n" for paths in loads))
    else:
        cut(sys.stdin.buffer, sys.stdout.buffer, _names(args.skip or args.only), only=bool(args.only))
        sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
