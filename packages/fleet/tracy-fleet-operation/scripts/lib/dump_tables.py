#!/usr/bin/env python3
"""A mariadb-dump stream cut to the tables named: its head (the session settings), each named
table's section (structure, rows and its triggers) and its tail. Routines, events and every other
table are left out. Reads stdin, writes stdout; the number of tables kept goes to the file named
by --count.

  gzip -dc v12.mysql.gz | python3 dump_tables.py --tables tables.txt --count n.txt | mariadb scratch

What a Sync from live loads to put only the tables it changed in place (webroot-backup.sh
`restore-everything --only-tables`): loading the whole point to swap a handful of tables cost
seconds on every sync (David, 23/10/2026).
"""
from __future__ import annotations

import argparse
import re
import sys

SECTION = re.compile(rb"^-- Table structure for table `((?:[^`]|``)+)`")
VIEW = (b"-- Temporary table structure for view", b"-- Final view structure for view")
# Where the dump stops listing tables: its routines, its events, or the settings it puts back.
END = (b"-- Dumping routines for database", b"-- Dumping events for database", b"/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE")


def cut(src, out, wanted: set[str]) -> int:
    kept = 0
    keep = True  # the head, until the first table
    tail = False
    for line in src:
        if tail:
            out.write(line)
            continue
        if line.startswith(END):
            # Routines and events are the schema's, not a table's: skipped up to the tail; the tail
            # itself (the settings put back) is kept. A stray `--` comment line between costs nothing.
            if line.startswith(END[2]):
                tail = True
                out.write(line)
            else:
                keep = False
            continue
        if line.startswith(VIEW):
            # A view is no table: never in the cut (Joomla keeps none).
            keep = False
            continue
        m = SECTION.match(line)
        if m:
            keep = m.group(1).replace(b"``", b"`").decode("utf-8", "surrogateescape") in wanted
            kept += keep
        if keep:
            out.write(line)
    return kept


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tables", required=True)
    parser.add_argument("--count", required=True)
    args = parser.parse_args(argv)
    with open(args.tables, encoding="utf-8") as f:
        wanted = {line.strip() for line in f if line.strip()}
    kept = cut(sys.stdin.buffer, sys.stdout.buffer, wanted)
    sys.stdout.buffer.flush()
    with open(args.count, "w") as f:
        f.write(f"{kept}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
