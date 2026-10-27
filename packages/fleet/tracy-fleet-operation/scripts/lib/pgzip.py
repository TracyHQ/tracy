#!/usr/bin/env python3
"""gzip -6 on several cores: stdin compressed to stdout as ONE gzip member any gunzip reads, the way
pigz makes it. Used for a backup's database dump (lib/site-backup.sh), where `mariadb-dump | gzip -6`
spent most of its time in gzip on one core (a 39 MB WordPress dump: 0.65 s dumped, 2.2 s gzipped;
24/10/2026), and every Sync from live makes two (its point, and the Before-restore point).

The input is cut into blocks; each is deflated on its own thread (zlib lets go of the interpreter
while it works), primed with the 32 KiB before it as its dictionary so the ratio stays gzip's, and
ended on a byte boundary (a sync flush) — raw deflate streams laid end to end are one stream. The
last block ends the stream; the trailer is the CRC-32 and length of the whole input.

  mariadb-dump … | python3 pgzip.py [-1…-9] > dump.sql.gz
"""
from __future__ import annotations

import concurrent.futures
import os
import struct
import sys
import zlib

BLOCK = 1 << 20
WINDOW = 1 << 15


def _deflate(level: int, block: bytes, primer: bytes, last: bool) -> bytes:
    c = zlib.compressobj(level, zlib.DEFLATED, -15, 8, zlib.Z_DEFAULT_STRATEGY, *([primer] if primer else []))
    return c.compress(block) + c.flush(zlib.Z_FINISH if last else zlib.Z_SYNC_FLUSH)


def compress(src, out, level: int = 6, threads: int | None = None) -> None:
    threads = threads or max(1, min(8, (os.cpu_count() or 2) - 1))
    # gzip's own header: deflate, no name, no time, XFL as gzip sets it (2: -9, 4: -1), Unix.
    xfl = 2 if level == 9 else 4 if level == 1 else 0
    out.write(b"\x1f\x8b\x08\x00\x00\x00\x00\x00" + bytes([xfl, 3]))
    crc, size = 0, 0
    pending: list[concurrent.futures.Future] = []
    with concurrent.futures.ThreadPoolExecutor(threads) as pool:
        primer = b""
        block = src.read(BLOCK)
        while True:
            nxt = src.read(BLOCK) if block else b""
            last = not nxt
            crc = zlib.crc32(block, crc)
            size += len(block)
            pending.append(pool.submit(_deflate, level, block, primer, last))
            primer = (primer + block)[-WINDOW:]
            # In order, and never more than two blocks a thread ahead of the writer.
            while len(pending) > threads * 2 or (last and pending):
                out.write(pending.pop(0).result())
            if last:
                break
            block = nxt
    out.write(struct.pack("<II", crc & 0xFFFFFFFF, size & 0xFFFFFFFF))
    out.flush()


def main(argv: list[str]) -> int:
    level = 6
    for arg in argv:
        if len(arg) == 2 and arg[0] == "-" and arg[1] in "123456789":
            level = int(arg[1])
        else:
            print(f"pgzip.py: unknown argument {arg}", file=sys.stderr)
            return 2
    compress(sys.stdin.buffer, sys.stdout.buffer, level)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
