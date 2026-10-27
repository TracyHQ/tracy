#!/usr/bin/env python3
"""Convert a verified, single-volume JPA quickstart to the existing fleet restore inputs.

Only the pinned release format is supported. No PHP restoration wizard is executed. Installer
files never enter the served webroot; SQL chunks are joined in their recorded order.
"""
import gzip
import io
import pathlib
import re
import struct
import tarfile
import zipfile
import zlib

MAX_EXPANDED = 2 * 1024 * 1024 * 1024


def entries(raw):
    if raw[:3] != b'JPA' or len(raw) < 19:
        raise ValueError('invalid JPA header')
    pos = struct.unpack_from('<H', raw, 3)[0]
    if pos < 19 or pos > len(raw):
        raise ValueError('invalid JPA header length')
    seen, expanded = set(), 0
    while pos < len(raw):
        if raw[pos:pos + 3] != b'JPF' or pos + 7 > len(raw):
            raise ValueError('invalid JPA entry')
        header, length = struct.unpack_from('<HH', raw, pos + 3)
        if header < 21 + length or pos + header > len(raw):
            raise ValueError('invalid JPA entry length')
        name = raw[pos + 7:pos + 7 + length].decode('utf-8')
        path = pathlib.PurePosixPath(name)
        if not name or path.is_absolute() or '..' in path.parts or '\\' in name or '\0' in name or name in seen:
            raise ValueError('unsafe or duplicate JPA path')
        seen.add(name)
        kind, compression, size, unpacked, mode = struct.unpack_from('<BBIII', raw, pos + 7 + length)
        if kind not in (0, 1) or compression not in (0, 1) or pos + header + size > len(raw):
            raise ValueError('unsupported JPA entry')
        expanded += unpacked
        if expanded > MAX_EXPANDED:
            raise ValueError('quickstart expansion exceeds limit')
        data = raw[pos + header:pos + header + size]
        pos += header + size
        if compression == 1:
            decoder = zlib.decompressobj(-15)
            data = decoder.decompress(data, unpacked + 1)
            if not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
                raise ValueError('invalid compressed JPA entry')
        if len(data) != unpacked:
            raise ValueError('JPA size mismatch')
        yield name, kind, mode, data


def convert(source, output, part, archive_name):
    if part not in ('webroot', 'database'):
        raise ValueError('invalid JPA output part')
    with zipfile.ZipFile(source) as outer:
        matches = [i for i in outer.infolist() if i.filename == archive_name]
        if len(matches) != 1 or matches[0].file_size > MAX_EXPANDED:
            raise ValueError('quickstart must carry its declared JPA exactly once')
        raw = outer.read(matches[0])
    sql, config = {}, None
    with tarfile.open(output, 'w:gz') if part == 'webroot' else io.BytesIO() as target:
        for name, kind, mode, data in entries(raw):
            if name == 'configuration.php':
                config = data
            if name.startswith('installation/'):
                if re.fullmatch(r'installation/sql/site\.(sql|s[0-9]+)', name):
                    sql[name] = data
                continue
            if part == 'webroot':
                item = tarfile.TarInfo(name)
                item.mode = mode & 0o777
                item.type = tarfile.DIRTYPE if kind == 0 else tarfile.REGTYPE
                item.size = len(data) if kind == 1 else 0
                target.addfile(item, io.BytesIO(data) if kind == 1 else None)
    if not config or 'installation/sql/site.sql' not in sql:
        raise ValueError('quickstart is missing configuration or database')
    prefix = re.search(rb"public\s+\$dbprefix\s*=\s*['\"]([a-zA-Z0-9_]+)['\"]", config)
    if not prefix:
        raise ValueError('quickstart has no valid table prefix')
    if part == 'database':
        chunks = sorted(sql, key=lambda n: 0 if n.endswith('.sql') else int(n.rsplit('.s', 1)[1]))
        if [int(n.rsplit('.s', 1)[1]) for n in chunks[1:]] != list(range(1, len(chunks))):
            raise ValueError('quickstart database chunks are incomplete')
        with gzip.open(output, 'wb') as target:
            for name in chunks:
                target.write(sql[name].replace(b'#__', prefix[1]))
                target.write(b'\n')
