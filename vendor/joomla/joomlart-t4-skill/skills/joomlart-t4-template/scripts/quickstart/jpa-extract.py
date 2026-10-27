#!/usr/bin/env python3
"""Minimal Akeeba JPA (unencrypted) extractor. Format: 'JPA' archive header + per-file 'JPF' entity blocks.
Compression: 0=none, 1=raw deflate (gzdeflate). Usage: jpa-extract.py <archive.jpa> <dest_dir>"""
import sys, os, struct, zlib

def main():
    src, dest = sys.argv[1], sys.argv[2]
    f = open(src, 'rb')
    sig = f.read(3)
    if sig != b'JPA':
        raise SystemExit(f"not a JPA archive (sig={sig!r})")
    header_len = struct.unpack('<H', f.read(2))[0]
    major, minor = f.read(1)[0], f.read(1)[0]
    file_count = struct.unpack('<I', f.read(4))[0]
    unc, comp = struct.unpack('<I', f.read(4))[0], struct.unpack('<I', f.read(4))[0]
    # skip any extra header bytes
    consumed = 19
    if header_len > consumed:
        f.read(header_len - consumed)
    print(f"JPA v{major}.{minor} files={file_count} uncompressed={unc} compressed={comp}")

    n_files = n_dirs = 0
    while True:
        pos0 = f.tell()
        esig = f.read(3)
        if len(esig) < 3:
            break
        if esig != b'JPF':
            raise SystemExit(f"bad entity signature {esig!r} at {pos0}")
        eh_len = struct.unpack('<H', f.read(2))[0]   # TOTAL entity-header length, measured from pos0
        path_len = struct.unpack('<H', f.read(2))[0]
        path = f.read(path_len).decode('utf-8', 'surrogateescape')
        etype = f.read(1)[0]          # 0 dir, 1 file, 2 link
        ctype = f.read(1)[0]          # 0 none, 1 deflate, 2 bzip2
        csize = struct.unpack('<I', f.read(4))[0]
        usize = struct.unpack('<I', f.read(4))[0]
        perms = struct.unpack('<I', f.read(4))[0]
        # The entity header may carry extra trailing fields (timestamps). Skip to the
        # real data start = pos0 + eh_len, regardless of how many extra bytes there are.
        f.seek(pos0 + eh_len)
        outp = os.path.join(dest, path)
        if etype == 0:  # directory
            os.makedirs(outp, exist_ok=True); n_dirs += 1; continue
        if etype == 2:  # symlink: data is the target
            data = f.read(csize)
            try:
                tgt = (zlib.decompress(data, -15) if ctype == 1 else data).decode('utf-8','surrogateescape')
                os.makedirs(os.path.dirname(outp), exist_ok=True)
                if not os.path.lexists(outp): os.symlink(tgt, outp)
            except Exception: pass
            continue
        # file
        os.makedirs(os.path.dirname(outp), exist_ok=True)
        data = f.read(csize)
        if ctype == 1:
            data = zlib.decompress(data, -15)
        elif ctype == 2:
            import bz2; data = bz2.decompress(data)
        with open(outp, 'wb') as o:
            o.write(data)
        try: os.chmod(outp, perms & 0o777)
        except Exception: pass
        n_files += 1
    print(f"extracted: {n_files} files, {n_dirs} dirs -> {dest}")

main()
