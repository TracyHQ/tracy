#!/usr/bin/env python3
"""Read-only scan of one quickstart asset for quickstart-inventory.mjs.

  quickstart-inventory-archive.py scan <root> <relative-path> [--limits <json>] [--deadline <epoch-seconds>]
  quickstart-inventory-archive.py hash|stat <root> <relative-path> [--deadline <epoch-seconds>]
  quickstart-inventory-archive.py list <root> [--deadline <epoch-seconds>]

<root> is the canonical input directory (the caller resolves the path it was given once, realpath).
It is opened from `/` one component at a time without following a link, and every path below it is
reached through directory descriptors (openat, O_NOFOLLOW): no link below the root is followed, and a
link that appears on the root's own path after it was resolved is refused.

The asset is a ZIP, a tar (plain, gzip, bzip2, xz), a `.sql` or a `.sql.gz`. Nothing is extracted to
disk and nothing inside is executed or imported: every member is streamed once (so a corrupt,
truncated or encrypted member fails the scan), the few metadata files the inventory needs are
parsed in memory (and the text of the few typography files TEXT_RE names is kept for source-font.mjs, each
under maxTextBytes and all under maxTextTotal), and a nested archive (`.zip`, `.tar`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tar.xz`)
is spooled to an anonymous (already unlinked) temporary file and scanned the same way, up to `maxDepth` levels.

stdout, on success, is one JSON object:
  {"sha256", "size", "format", "containers": [{"id", "parent", "path", "format",
   "members": [[path, "f"|"d", size]...], "files": {path: parsed}}], "stats": {...}}
`parsed` is {"kind": "xml"|"php"|"sql"|"text", ...} — see parse_xml, parse_php and finish_sql (after scan_sql).

`hash` hashes a regular file below <root>: stdout {"sha256", "size", "dev", "ino", "mtimeNs"}. `stat`
gives the same stamp without reading. `list` gives the entries of <root> and of each of its non-hidden
sub-directories with their kind (file, dir, link, other, bad-name), links listed, never entered. All
three exit 3 with {"problem", "at", "detail"} on stderr when refused. `scan` reads the descriptor the
walk opened and adds "stamp" to its answer.

A refused input (symlink, hard link, device, FIFO, socket, traversal or absolute path, duplicate
member or directory, a directory entry carrying data, encrypted member, over a limit, corrupt or
unsupported container) ends with exit 3 and {"error", "member"} as JSON on stderr. Usage errors exit 2.
Archive metadata is bounded before it is loaded: a ZIP's end-of-central-directory record is read
first (declared entry count and central directory size), and each tar metadata header (PAX, GNU
long name) is counted and size-checked before tarfile reads it.
"""
import errno
import gzip
import hashlib
import io
import json
import lzma
import os
import re
import stat
import struct
import sys
import tarfile
import tempfile
import time
import zipfile
import zlib
import xml.etree.ElementTree as ET

DEFAULT_LIMITS = {
    'maxMembers': 200000,          # members across the asset and every nested archive
    'maxExpandedBytes': 8 << 30,   # bytes decompressed across the asset
    'maxRatio': 200,               # expanded/compressed, for members expanding past ratioFloor
    'ratioFloor': 1 << 20,
    'maxDepth': 2,                 # nested archive levels below the asset
    'maxNestedBytes': 2 << 30,     # one nested archive, spooled
    'maxMetadataBytes': 4 << 20,   # one XML or PHP file that is parsed
    'maxDirectoryBytes': 64 << 20, # one ZIP central directory, one tar metadata header (PAX, long name)
    'maxSqlBytes': 1 << 30,        # one SQL file that is parsed
    'maxSqlRows': 200000,          # rows kept per SQL file for the modelled tables
    'maxTextBytes': 2 << 20,       # one typography file whose text is kept (see TEXT_RE)
    'maxTextTotal': 48 << 20,      # the typography text kept across the asset and every nested archive
}

CHUNK = 1 << 20
META_TYPES = (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.SOLARIS_XHDTYPE, tarfile.GNUTYPE_LONGNAME,
              tarfile.GNUTYPE_LONGLINK)

# Metadata candidates, matched anywhere in a member path; the Node side keeps those under a
# detected Joomla root.
XML_RE = re.compile(
    r'(?:^|/)(?:'
    r'(?:administrator/)?templates/[^/]+/templateDetails\.xml'
    r'|administrator/components/com_[^/]+/[^/]+\.xml'
    r'|(?:administrator/)?modules/mod_[^/]+/[^/]+\.xml'
    r'|plugins/[^/]+/[^/]+/[^/]+\.xml'
    r'|administrator/manifests/(?:files|libraries|packages)/[^/]+\.xml'
    r'|(?:administrator/|api/)?language/[^/]+/(?:langmetadata|install)\.xml'
    r')$')
PHP_RE = re.compile(r'(?:^|/)(?:(?:administrator/|installation/|api/)?index\.php|libraries/src/Version\.php)$')
# The typography inputs whose text is kept for the source-font check (source-font.mjs reads them): a
# template's T4 profiles (etc/ and local/etc/), its custom-font lists, T3 assets.xml, the CSS/LESS
# anywhere under css/ and less/ (so a local override and a nested @import are read), and T4's shipped Google font list. Nothing else is kept as text.
TEXT_RE = re.compile(
    r'(?:^|/)(?:'
    r'templates/[^/]+/(?:local/)?etc/(?:site|theme)/[^/]+\.json'
    r'|templates/[^/]+/(?:local/)?etc/(?:customfonts|fontcustoms)\.json'
    r'|templates/[^/]+/(?:local/)?etc/assets\.xml'
    r'|templates/[^/]+/(?:local/)?(?:css/(?:[^/]+/)*[^/]+\.css|less/(?:[^/]+/)*[^/]+\.less)'
    r'|templates/[^/]+/fonts/(?:[^/]+/)*[^/]+\.css'
    r'|plugins/system/t4/admin/etc/googlefonts/fonts\.json'
    r')$')
# A font file's bytes are digested (streamed, never kept): the source-font report names the exact font files its verdicts rest on.
FONT_FILE_RE = re.compile(r'\.(?:woff2?|ttf|otf|eot)$', re.I)
ADMIN_TEMPLATE_RE = re.compile(r'(?:^|/)administrator/templates/')
SQL_RE = re.compile(r'\.sql(?:\.gz)?$', re.I)
# SQL inside the Joomla tree is an extension's install/update schema, not a site database — only
# the installer set (installation/sql/mysql/) and dumps outside any Joomla directory are parsed.
INSTALLER_SQL_RE = re.compile(r'(?:^|/)installation/sql/mysql/[^/]+\.sql$', re.I)
JOOMLA_DIR_RE = re.compile(
    r'(?:^|/)(?:administrator|api|cache|cli|components|images|includes|installation|language|layouts|'
    r'libraries|media|modules|plugins|templates|tmp)/')
NESTED_RE = re.compile(r'\.(?:zip|tar|tgz|tar\.gz|tar\.bz2|tar\.xz)$', re.I)


class Refused(Exception):
    def __init__(self, message, member=None):
        Exception.__init__(self, message)
        self.member = member


class Budget:
    def __init__(self, limits, deadline):
        self.limits = limits
        self.deadline = deadline
        self.members = 0
        self.expanded = 0

    def tick(self, member=None):
        if self.deadline and time.time() > self.deadline:
            raise Refused('deadline passed while scanning', member)

    def count_member(self, member):
        self.members += 1
        if self.members > self.limits['maxMembers']:
            raise Refused('more than %d members (maxMembers)' % self.limits['maxMembers'], member)

    def add_bytes(self, n, member):
        self.expanded += n
        if self.expanded > self.limits['maxExpandedBytes']:
            raise Refused('more than %d expanded bytes (maxExpandedBytes)' % self.limits['maxExpandedBytes'], member)


def normalise(name, member_label):
    """The canonical member path, or Refused. Directories keep no trailing slash."""
    if '\x00' in name:
        raise Refused('member name contains NUL', member_label)
    if '\\' in name:
        raise Refused('member name contains a backslash (not a portable path)', member_label)
    if name.startswith('/') or re.match(r'^[A-Za-z]:', name):
        raise Refused('absolute member path', member_label)
    parts = [p for p in name.split('/') if p not in ('', '.')]
    if any(p == '..' for p in parts):
        raise Refused('member path escapes the archive (..)', member_label)
    if not parts:
        raise Refused('empty member path', member_label)
    return '/'.join(parts)


class Container:
    def __init__(self, cid, parent, path, fmt):
        self.id = cid
        self.parent = parent
        self.path = path
        self.format = fmt
        self.members = {}
        self.files = {}

    def add(self, path, kind, size, label):
        prior = self.members.get(path)
        if prior is not None:
            if prior[0] == 'd' and kind == 'd' and prior[2]:
                self.members[path] = ('d', 0, False)  # an explicit directory entry after an implied one
                return
            raise Refused('duplicate member after normalisation', label)
        # every ancestor must be (or become) a directory
        parts = path.split('/')
        for i in range(1, len(parts)):
            anc = '/'.join(parts[:i])
            got = self.members.get(anc)
            if got is None:
                self.members[anc] = ('d', 0, True)
            elif got[0] != 'd':
                raise Refused('member %s is under %s, which is a file' % (path, anc), label)
        self.members[path] = (kind, size, False)

    def to_json(self):
        rows = [[p, v[0], v[1]] for p, v in sorted(self.members.items())]
        return {'id': self.id, 'parent': self.parent, 'path': self.path, 'format': self.format,
                'members': rows, 'files': self.files}


def sniff(fh):
    head = fh.read(512)
    fh.seek(0)
    if head.startswith(b'PK\x03\x04') or head.startswith(b'PK\x05\x06'):
        return 'zip'
    if head.startswith(b'\x1f\x8b'):
        return 'gzip'
    if head.startswith(b'BZh'):
        return 'bzip2'
    if head.startswith(b'\xfd7zXZ\x00'):
        return 'xz'
    if len(head) >= 262 and head[257:262] == b'ustar':
        return 'tar'
    return None


def zip_directory(fh):
    """(declared entries, central directory bytes) from the end-of-central-directory record (and its
    ZIP64 form), read before zipfile loads the directory; None when there is no record."""
    fh.seek(0, 2)
    end = fh.tell()
    tail_len = min(end, 22 + 65535)
    fh.seek(end - tail_len)
    tail = fh.read(tail_len)
    fh.seek(0)
    i = tail.rfind(b'PK\x05\x06')
    if i == -1 or len(tail) - i < 22:
        return None
    entries = struct.unpack('<H', tail[i + 10:i + 12])[0]
    cd_size = struct.unpack('<I', tail[i + 12:i + 16])[0]
    if (entries == 0xFFFF or cd_size == 0xFFFFFFFF) and i >= 20 and tail[i - 20:i - 16] == b'PK\x06\x07':
        z64_offset = struct.unpack('<Q', tail[i - 12:i - 4])[0]
        if z64_offset + 56 <= end:
            fh.seek(z64_offset)
            rec = fh.read(56)
            fh.seek(0)
            if rec[:4] == b'PK\x06\x06':
                entries = struct.unpack('<Q', rec[32:40])[0]
                cd_size = struct.unpack('<Q', rec[40:48])[0]
    return entries, cd_size


class Scanner:
    def __init__(self, limits, deadline):
        self.limits = limits
        self.budget = Budget(limits, deadline)
        self.containers = []
        self.text_kept = 0

    # ---------------------------------------------------------------- dispatch
    def scan_file(self, fh, name, parent, depth, size):
        """Scan an archive or SQL stream; `name` is the member path (or the asset basename)."""
        kind = sniff(fh)
        lower = name.lower()
        if kind == 'zip':
            return self.scan_zip(fh, name, parent, depth)
        if kind == 'gzip' and lower.endswith('.sql.gz'):
            return self.scan_sql_asset(fh, name, parent, compressed=True, size=size)
        if kind in ('tar', 'gzip', 'bzip2', 'xz'):
            return self.scan_tar(fh, name, parent, depth, kind, size)
        if lower.endswith('.sql'):
            return self.scan_sql_asset(fh, name, parent, compressed=False, size=size)
        raise Refused('not a ZIP, tar or SQL file (unsupported container)', name)

    def new_container(self, parent, path, fmt):
        c = Container(len(self.containers), parent, path, fmt)
        self.containers.append(c)
        return c

    # ---------------------------------------------------------------- zip
    def scan_zip(self, fh, name, parent, depth):
        declared = zip_directory(fh)
        if declared is not None:
            entries, cd_size = declared
            if cd_size > self.limits['maxDirectoryBytes']:
                raise Refused('central directory of %d bytes, more than %d (maxDirectoryBytes)' % (cd_size, self.limits['maxDirectoryBytes']), name)
            if self.budget.members + entries > self.limits['maxMembers']:
                raise Refused('the central directory declares %d members; more than %d in all (maxMembers)' % (entries, self.limits['maxMembers']), name)
        try:
            zf = zipfile.ZipFile(fh)
        except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, EOFError, ValueError) as e:
            raise Refused('corrupt or truncated ZIP (%s)' % e, name)
        c = self.new_container(parent, None if parent is None else name, 'zip')
        infos = zf.infolist()
        for info in infos:
            label = self.label(c, info.filename)
            self.budget.tick(label)
            self.budget.count_member(label)
            if info.flag_bits & 0x1:
                raise Refused('encrypted member', label)
            mode = (info.external_attr >> 16) & 0xFFFF
            ftype = stat.S_IFMT(mode) if mode else 0
            is_dir = info.filename.endswith('/')
            if ftype and ftype not in (stat.S_IFREG, stat.S_IFDIR):
                raise Refused('member is a %s, not a file or directory' % kind_name(ftype), label)
            if ftype == stat.S_IFDIR:
                is_dir = True
            path = normalise(info.filename, label)
            c.add(path, 'd' if is_dir else 'f', 0 if is_dir else info.file_size, label)
            try:
                src = zf.open(info)
            except NotImplementedError as e:
                raise Refused('unsupported compression (%s)' % e, label)
            except (zipfile.BadZipFile, OSError, EOFError, ValueError, zlib.error) as e:
                raise Refused('corrupt member (%s)' % e, label)
            with src:
                if is_dir:
                    # a directory entry is read too: it must be empty (and its CRC checks)
                    if info.file_size or self.drain(src, info.compress_size, label):
                        raise Refused('directory entry carries data', label)
                    continue
                self.consume(c, path, src, info.compress_size, depth, label)
        return c

    # ---------------------------------------------------------------- tar
    def scan_tar(self, fh, name, parent, depth, kind, size):
        mode = {'tar': 'r:', 'gzip': 'r:gz', 'bzip2': 'r:bz2', 'xz': 'r:xz'}[kind]
        fmt = {'tar': 'tar', 'gzip': 'tar.gz', 'bzip2': 'tar.bz2', 'xz': 'tar.xz'}[kind]
        c = self.new_container(parent, None if parent is None else name, fmt)
        scanner = self

        class BoundedInfo(tarfile.TarInfo):
            # every header, metadata ones (PAX, GNU long name/link) included, is seen here before
            # tarfile reads its body: metadata is counted and size-checked first
            def _proc_member(self, tf_):
                label = scanner.label(c, self.name or '(tar header)')
                scanner.budget.tick(label)
                if self.type == tarfile.GNUTYPE_SPARSE:
                    raise Refused('GNU sparse member (not supported)', label)
                if self.type in META_TYPES:
                    scanner.budget.count_member(label)
                    if self.size > scanner.limits['maxDirectoryBytes']:
                        raise Refused('tar metadata header of %d bytes, more than %d (maxDirectoryBytes)' % (self.size, scanner.limits['maxDirectoryBytes']), label)
                return tarfile.TarInfo._proc_member(self, tf_)

        try:
            tf = tarfile.open(fileobj=fh, mode=mode, tarinfo=BoundedInfo)
        except (tarfile.TarError, OSError, EOFError, zlib.error, lzma.LZMAError, ValueError) as e:
            raise Refused('corrupt or truncated %s, or not a tar (%s)' % (fmt, e), name)
        with tf:
            while True:
                try:
                    info = tf.next()
                except RecursionError:
                    raise Refused('tar metadata headers chained too deep', name)
                except (tarfile.TarError, OSError, EOFError, zlib.error, lzma.LZMAError, ValueError) as e:
                    raise Refused('corrupt or truncated %s (%s)' % (fmt, e), name)
                if info is None:
                    break
                label = self.label(c, info.name)
                self.budget.tick(label)
                self.budget.count_member(label)
                if info.issym() or info.islnk():
                    raise Refused('member is a link (%s -> %s)' % ('symlink' if info.issym() else 'hard link', info.linkname), label)
                if not (info.isreg() or info.isdir()):
                    raise Refused('member is not a file or directory (tar type %r)' % info.type, label)
                if info.isdir() and info.name.rstrip('/') == '.':
                    # `tar -C dir .` starts with the archive's own root directory: the root, not a member
                    if info.size:
                        raise Refused('directory entry carries data', label)
                    continue
                path = normalise(info.name, label)
                if info.isdir():
                    if info.size:
                        raise Refused('directory entry carries data', label)
                    c.add(path, 'd', 0, label)
                    continue
                c.add(path, 'f', info.size, label)
                try:
                    src = tf.extractfile(info)
                    self.consume(c, path, src, None, depth, label)
                except (tarfile.TarError, OSError, EOFError, zlib.error, lzma.LZMAError) as e:
                    raise Refused('corrupt member (%s)' % e, label)
        if kind != 'tar' and size:
            # the whole stream's ratio: a small tar.gz that expands without bound
            if self.budget.expanded > self.limits['ratioFloor'] and self.budget.expanded / float(size) > self.limits['maxRatio']:
                raise Refused('compression ratio above %d (maxRatio)' % self.limits['maxRatio'], name)
        return c

    def finish_sql(self):
        """Judge every SQL file's statements with the table prefixes of all the SQL files of its container."""
        for c in self.containers:
            pending = [(k, v) for k, v in c.files.items() if v.get('kind') == 'sql-pending']
            prefixes = set()
            for _, v in pending:
                prefixes |= v['prefixes']
            for k, v in pending:
                c.files[k] = finish_sql(v, prefixes, self.limits, self.budget)

    # ---------------------------------------------------------------- sql asset
    def scan_sql_asset(self, fh, name, parent, compressed, size):
        c = self.new_container(parent, None if parent is None else name, 'sql.gz' if compressed else 'sql')
        base = os.path.basename(name)
        c.add(base, 'f', size or 0, name)
        src = gzip.GzipFile(fileobj=fh) if compressed else fh
        data = self.read_capped(src, self.limits['maxSqlBytes'], name, compressed_size=size if compressed else None)
        c.files[base] = scan_sql(data, self.budget, name)
        return c

    # ---------------------------------------------------------------- members
    def label(self, c, name):
        # a container's path already is its whole chain from the asset
        return name if c.path is None else '%s!%s' % (c.path, name)

    def read_capped(self, src, cap, label, compressed_size=None):
        buf = io.BytesIO()
        total = 0
        while True:
            self.budget.tick(label)
            try:
                chunk = src.read(CHUNK)
            except (OSError, EOFError, zlib.error, lzma.LZMAError, zipfile.BadZipFile) as e:
                raise Refused('corrupt or truncated data (%s)' % e, label)
            if not chunk:
                break
            total += len(chunk)
            self.budget.add_bytes(len(chunk), label)
            self.check_ratio(total, compressed_size, label)
            if total > cap:
                raise Refused('larger than %d bytes, the parse limit for this kind of file' % cap, label)
            buf.write(chunk)
        return buf.getvalue()

    def read_text(self, src, compressed, label):
        """A typography file's text, or an error entry when it is over a limit or not UTF-8 (the member
        is read to its end either way, so a corrupt one still fails the scan)."""
        cap = self.limits['maxTextBytes']
        buf = io.BytesIO()
        total = 0
        while True:
            self.budget.tick(label)
            try:
                chunk = src.read(CHUNK)
            except (OSError, EOFError, zlib.error, lzma.LZMAError, zipfile.BadZipFile) as e:
                raise Refused('corrupt or truncated data (%s)' % e, label)
            if not chunk:
                break
            total += len(chunk)
            self.budget.add_bytes(len(chunk), label)
            self.check_ratio(total, compressed, label)
            if total <= cap:
                buf.write(chunk)
        if total > cap:
            return {'kind': 'text', 'error': 'larger than %d bytes (maxTextBytes)' % cap, 'size': total}
        if self.text_kept + total > self.limits['maxTextTotal']:
            return {'kind': 'text', 'error': 'not kept: more than %d bytes of typography text in the asset (maxTextTotal)' % self.limits['maxTextTotal'], 'size': total}
        try:
            text = buf.getvalue().decode('utf-8')
        except UnicodeDecodeError:
            return {'kind': 'text', 'error': 'not UTF-8', 'size': total}
        self.text_kept += total
        return {'kind': 'text', 'text': text, 'size': total}

    def check_ratio(self, total, compressed, label):
        if compressed is None or total <= self.limits['ratioFloor']:
            return
        if total / float(max(compressed, 1)) > self.limits['maxRatio']:
            raise Refused('compression ratio above %d (maxRatio)' % self.limits['maxRatio'], label)

    def consume(self, c, path, src, compressed, depth, label):
        lower = path.lower()
        if XML_RE.search(path):
            data = self.read_capped(src, self.limits['maxMetadataBytes'], label, compressed)
            c.files[path] = parse_xml(data)
            return
        if PHP_RE.search(path):
            data = self.read_capped(src, self.limits['maxMetadataBytes'], label, compressed)
            c.files[path] = parse_php(data)
            return
        if TEXT_RE.search(path) and not ADMIN_TEMPLATE_RE.search(path):
            c.files[path] = self.read_text(src, compressed, label)
            return
        if SQL_RE.search(lower) and (INSTALLER_SQL_RE.search(path) or not JOOMLA_DIR_RE.search(path)):
            if lower.endswith('.gz'):
                raw = self.read_capped(src, self.limits['maxSqlBytes'], label, compressed)
                try:
                    stream = gzip.GzipFile(fileobj=io.BytesIO(raw))
                    data = self.read_capped(stream, self.limits['maxSqlBytes'], label, len(raw))
                except Refused:
                    raise
            else:
                data = self.read_capped(src, self.limits['maxSqlBytes'], label, compressed)
            c.files[path] = scan_sql(data, self.budget, label)
            return
        if NESTED_RE.search(lower):
            if depth + 1 > self.limits['maxDepth']:
                raise Refused('nested archive deeper than %d levels (maxDepth)' % self.limits['maxDepth'], label)
            with tempfile.TemporaryFile() as spool:
                total = 0
                while True:
                    self.budget.tick(label)
                    try:
                        chunk = src.read(CHUNK)
                    except (OSError, EOFError, zlib.error, lzma.LZMAError, zipfile.BadZipFile) as e:
                        raise Refused('corrupt or truncated data (%s)' % e, label)
                    if not chunk:
                        break
                    total += len(chunk)
                    self.budget.add_bytes(len(chunk), label)
                    self.check_ratio(total, compressed, label)
                    if total > self.limits['maxNestedBytes']:
                        raise Refused('nested archive larger than %d bytes (maxNestedBytes)' % self.limits['maxNestedBytes'], label)
                    spool.write(chunk)
                spool.seek(0)
                self.scan_file(spool, label, c.id, depth + 1, total)
            return
        if FONT_FILE_RE.search(path) and not ADMIN_TEMPLATE_RE.search(path):
            digest = hashlib.sha256()
            size = self.drain(src, compressed, label, digest)
            c.files[path] = {'kind': 'digest', 'sha256': digest.hexdigest(), 'size': size}
            return
        # every other member: streamed through, so a corrupt one fails here, and counted
        self.drain(src, compressed, label)

    def drain(self, src, compressed, label, digest=None):
        """Read a member to its end (a corrupt one fails here); the number of bytes it held."""
        total = 0
        while True:
            self.budget.tick(label)
            try:
                chunk = src.read(CHUNK)
            except (OSError, EOFError, zlib.error, lzma.LZMAError, zipfile.BadZipFile) as e:
                raise Refused('corrupt or truncated data (%s)' % e, label)
            if not chunk:
                break
            if digest is not None:
                digest.update(chunk)
            total += len(chunk)
            self.budget.add_bytes(len(chunk), label)
            self.check_ratio(total, compressed, label)
        return total


def kind_name(ftype):
    return {stat.S_IFLNK: 'symlink', stat.S_IFIFO: 'FIFO', stat.S_IFSOCK: 'socket',
            stat.S_IFCHR: 'character device', stat.S_IFBLK: 'block device'}.get(ftype, 'special file')


# -------------------------------------------------------------------- XML
def decode_text(data):
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', 'replace')


def local(tag):
    return tag.rsplit('}', 1)[-1] if isinstance(tag, str) else ''


def parse_xml(data):
    """The fields of a Joomla manifest. External entities are never resolved: a document that
    declares entities is refused, and ElementTree does not fetch a DOCTYPE's external subset."""
    if re.search(rb'<!ENTITY', data, re.I):
        return {'kind': 'xml', 'error': 'entity declarations refused'}
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        return {'kind': 'xml', 'error': 'malformed XML (%s)' % e}
    fields = {}
    for key in ('name', 'version', 'author', 'element', 'creationDate', 'tag'):
        el = root.find(key)
        if el is not None and el.text is not None:
            fields[key] = el.text.strip()[:500]
    children = sorted(set(local(ch.tag) for ch in root))
    addfieldpaths = sorted(set(
        el.get('addfieldpath') for el in root.iter() if el.get('addfieldpath')))
    attrs = {}
    for key in ('type', 'client', 'group', 'method', 'version'):
        if root.get(key) is not None:
            attrs[key] = root.get(key)[:200]
    # the plugin a manifest element refers to, e.g. addfieldprefix/addfieldpath/addrulepath values
    refs = set()
    for el in root.iter():
        for value in el.attrib.values():
            for m in re.finditer(r'plugins/system/([A-Za-z0-9_]+)', value):
                refs.add(m.group(1).lower())
    return {'kind': 'xml', 'root': local(root.tag), 'attrs': attrs, 'fields': fields,
            'children': children, 'addfieldpaths': addfieldpaths, 'pluginRefs': sorted(refs)}


# -------------------------------------------------------------------- PHP (declarations only)
# A declaration counts only in PHP code: inline HTML outside <?php … ?>, comments and the inside of
# strings are masked first, so a commented-out define() or one quoted in a string is not read.
# Each literal string becomes a placeholder \x00<n>\x00; a string with interpolation or a heredoc
# is not a literal and matches nothing.
PHP_SQ_ESC = {'\\': '\\', "'": "'"}
PHP_DQ_ESC = {'n': '\n', 't': '\t', 'r': '\r', 'v': '\v', 'e': '\x1b', 'f': '\f', '\\': '\\', '$': '$', '"': '"'}


def php_code(text):
    """(code, strings): the PHP code of `text` with comments and inline HTML blanked and each string
    literal replaced by a placeholder; strings[n] is its value, or None when it is not a literal."""
    out = []
    strings = []
    i = 0
    n = len(text)
    code = False
    while i < n:
        if not code:
            j = text.find('<?', i)
            if j == -1:
                break
            if text.startswith('<?php', j):
                i = j + 5
            elif text.startswith('<?=', j):
                i = j + 3
            else:
                i = j + 2
            code = True
            out.append(' ')
            continue
        ch = text[i]
        if text.startswith('?>', i):
            code = False
            out.append(' ; ')
            i += 2
        elif text.startswith('//', i) or (ch == '#' and not text.startswith('#[', i)):
            while i < n and text[i] != '\n' and not text.startswith('?>', i):
                i += 1
            out.append(' ')
        elif text.startswith('/*', i):
            j = text.find('*/', i + 2)
            i = n if j == -1 else j + 2
            out.append(' ')
        elif ch in ('\'', '"', '`'):
            j = i + 1
            buf = []
            literal = ch != '`'
            while j < n and text[j] != ch:
                if text[j] == '\\' and j + 1 < n:
                    nxt = text[j + 1]
                    table = PHP_SQ_ESC if ch == "'" else PHP_DQ_ESC
                    buf.append(table[nxt] if nxt in table else '\\' + nxt)
                    j += 2
                    continue
                if ch == '"' and text[j] in '${':
                    literal = False
                buf.append(text[j])
                j += 1
            strings.append(''.join(buf) if literal else None)
            out.append('\x00%d\x00' % (len(strings) - 1))
            i = j + 1
        elif text.startswith('<<<', i):
            m = re.match(r'<<<[ \t]*([\'"]?)([A-Za-z_][A-Za-z0-9_]*)\1\r?\n', text[i:])
            if not m:
                out.append(ch)
                i += 1
                continue
            close = re.compile(r'\n[ \t]*%s\b' % re.escape(m.group(2)))
            c = close.search(text, i + m.end() - 1)
            i = n if c is None else c.end()
            strings.append(None)
            out.append('\x00%d\x00' % (len(strings) - 1))
        else:
            out.append(ch)
            i += 1
    return ''.join(out), strings


STR = r'\x00(\d+)\x00'
DEFINE_RE = re.compile(r'(?<![\w$>:])define\s*\(\s*' + STR + r'\s*,\s*' + STR + r'\s*\)', re.I)
CONST_RE = re.compile(r'\bconst\s+(MAJOR_VERSION|MINOR_VERSION|PATCH_VERSION|EXTRA_VERSION)\s*=\s*(?:' + STR + r'|(\d+))\s*;')
PHP_NAMES = ('JOOMLA_MINIMUM_PHP',)


def parse_php(data):
    code, strings = php_code(decode_text(data))
    defines = {}
    for m in DEFINE_RE.finditer(code):
        name, value = strings[int(m.group(1))], strings[int(m.group(2))]
        if name in PHP_NAMES and value is not None and 0 < len(value) <= 40:
            defines.setdefault(name, []).append(value)
    consts = {}
    for m in CONST_RE.finditer(code):
        value = m.group(3) if m.group(2) is None else strings[int(m.group(2))]
        if value is not None and len(value) <= 40:
            consts.setdefault(m.group(1), []).append(value)
    return {'kind': 'php', 'defines': defines, 'consts': consts}


# -------------------------------------------------------------------- SQL (MySQL dump forms)
TABLES = ('template_styles', 'languages', 'extensions', 'menu')
KEEP = {
    'template_styles': ('id', 'template', 'client_id', 'home', 'title', 'inheritable', 'parent', 'params'),
    'languages': ('lang_id', 'lang_code', 'title', 'title_native', 'sef', 'published', 'access', 'ordering'),
    'extensions': ('extension_id', 'name', 'type', 'element', 'folder', 'client_id', 'enabled', 'manifest_cache'),
    # the menu rows the source-font check replays: which style each page renders with, nothing of the content
    'menu': ('id', 'menutype', 'alias', 'path', 'type', 'published', 'template_style_id', 'home', 'language', 'client_id', 'parent_id'),
}
# a template style's params: only the T4 profile names (typelist-site, typelist-theme) leave the reader
TYPELIST_KEYS = ('typelist-site', 'typelist-theme')
TOKEN_RE = re.compile(
    r"""'(?:[^'\\]|\\.|'')*'"""        # single-quoted string
    r'''|"(?:[^"\\]|\\.|"")*"'''       # double-quoted string
    r'|`(?:[^`]|``)*`'                  # identifier
    r'|/\*.*?\*/'                       # block comment (incl. /*!40000 ... */)
    r'|--[^\n]*|#(?!__)[^\n]*'           # line comments (`#__` is Joomla's table prefix, not a comment)
    r'|;'
    r"""|[^'"`;/#-]+"""
    r'|.', re.S)
ESCAPES = {'0': '\x00', 'b': '\b', 'n': '\n', 'r': '\r', 't': '\t', 'Z': '\x1a', '\\': '\\', "'": "'", '"': '"'}


def unescape(body, quote):
    out = []
    i = 0
    n = len(body)
    while i < n:
        ch = body[i]
        if ch == '\\' and i + 1 < n:
            nxt = body[i + 1]
            out.append(ESCAPES.get(nxt, '\\' + nxt if nxt in '%_' else nxt))
            i += 2
            continue
        if ch == quote and i + 1 < n and body[i + 1] == quote:
            out.append(quote)
            i += 2
            continue
        out.append(ch)
        i += 1
    return ''.join(out)


EXEC_COMMENT_RE = re.compile(r'^/\*M?!(\d{5,6})?(.*)\*/$', re.S)


def statements(text, budget, label):
    """Split into statements outside quotes and comments: [(statement, [executable-comment bodies])].
    Plain comments are dropped. A version-conditional comment (`/*!40000 ... */`, `/*M!...*/`) runs on
    the servers it names, so its body stays in the statement and is also returned apart: whether it ran
    is not decided here."""
    parts = []
    cur = []
    bodies = []
    count = 0
    for m in TOKEN_RE.finditer(text):
        tok = m.group(0)
        count += 1
        if count % 50000 == 0:
            budget.tick(label)
        if tok == ';':
            stmt = ''.join(cur).strip()
            if stmt:
                parts.append((stmt, bodies))
            cur = []
            bodies = []
        elif tok.startswith('/*') or tok.startswith('--') or (tok.startswith('#') and not tok.startswith('#__')):
            em = EXEC_COMMENT_RE.match(tok) if tok.startswith('/*') else None
            if em and tok.startswith('/*M!') and em.group(1) == '999999':
                # mariadb-dump's `/*M!999999\- enable the sandbox mode */`: MariaDB runs it from version
                # 99.99.99 on, which no server is, so it is a comment
                em = None
            if em:
                cur.append(' %s ' % em.group(2))
                bodies.append(em.group(2))
            elif tok.startswith('--') and not (len(tok) == 2 or tok[2] in ' \t\r'):
                cur.append(tok)  # `--x` is not a comment in MySQL
            else:
                cur.append(' ')
        else:
            cur.append(tok)
    tail = ''.join(cur).strip()
    if tail:
        parts.append((tail, bodies))
    return parts


IDENT = r'(?:`(?:[^`]|``)+`|[A-Za-z0-9_#$]+)'
HEAD_RE = re.compile(r'^(INSERT|REPLACE)\s+(?:LOW_PRIORITY\s+|DELAYED\s+|HIGH_PRIORITY\s+)?(?:IGNORE\s+)?(?:INTO\s+)?(%s(?:\s*\.\s*%s)?)\s*' % (IDENT, IDENT), re.I | re.S)
TABLE_STMT_RE = re.compile(
    r'^(?:(DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?|(CREATE)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|(TRUNCATE)\s+(?:TABLE\s+)?'
    r'|(UPDATE)\s+(?:LOW_PRIORITY\s+)?(?:IGNORE\s+)?|(DELETE)\s+(?:LOW_PRIORITY\s+)?(?:QUICK\s+)?(?:IGNORE\s+)?FROM\s+|(ALTER)\s+TABLE\s+'
    r'|(RENAME)\s+TABLE\s+)(%s(?:\s*\.\s*%s)?)' % (IDENT, IDENT), re.I | re.S)


def ident_name(raw):
    raw = raw.strip()
    q = re.fullmatch(r'(%s)\s*\.\s*(%s)' % (IDENT_ANY, IDENT_ANY), raw)
    if q:
        raw = q.group(2)
    if raw.startswith('`') and raw.endswith('`'):
        raw = raw[1:-1].replace('``', '`')
    elif raw.startswith('"') and raw.endswith('"') and len(raw) > 1:
        raw = raw[1:-1].replace('""', '"')
    return raw


PREFIX_RE = re.compile(r'^(?:#__|[A-Za-z0-9][A-Za-z0-9_$]*_)$')


def split_table(name, t):
    """The prefix when `name` is table `t` under a possible Joomla prefix, else None. `menu` is not
    the tail of `modules_menu`, the module-to-page join table."""
    if not name.endswith(t) or not PREFIX_RE.match(name[:-len(t)]):
        return None
    if t == 'menu' and name[:-len(t)].endswith('modules_'):
        return None
    return name[:-len(t)]


def modelled(name):
    """(prefix, table) when `name` is one of the modelled tables under a possible Joomla prefix
    (`#__`, or letters, digits, `_` and `$` ending in `_` — `jos_`, `my_site_`)."""
    for t in TABLES:
        prefix = split_table(name, t)
        if prefix is not None:
            return prefix, t
    return None


VALUE_RE = re.compile(
    r"""\s*(?:(?:_[A-Za-z0-9]+\s*)?'((?:[^'\\]|\\.|'')*)'|"((?:[^"\\]|\\.|"")*)"|(NULL)\b|(TRUE|FALSE)\b"""
    r"""|(-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)|(0x[0-9A-Fa-f]*)|[bB]'([01]*)')\s*""", re.S | re.I)


def parse_tuples(text, pos, budget, label):
    """Rows of a VALUES list starting at text[pos]; None when a value is not a literal."""
    rows = []
    n = len(text)
    while True:
        while pos < n and text[pos] in ' \t\r\n':
            pos += 1
        if pos >= n or text[pos] != '(':
            return None
        pos += 1
        row = []
        while True:
            m = VALUE_RE.match(text, pos)
            if not m:
                return None
            if m.group(1) is not None:
                row.append(unescape(m.group(1), "'"))
            elif m.group(2) is not None:
                row.append(unescape(m.group(2), '"'))
            elif m.group(3):
                row.append(None)
            elif m.group(4):
                row.append('1' if m.group(4).upper() == 'TRUE' else '0')
            elif m.group(5) is not None:
                row.append(m.group(5))
            elif m.group(6) is not None:
                row.append(m.group(6))
            else:
                row.append(m.group(7))
            pos = m.end()
            if pos < n and text[pos] == ',':
                pos += 1
                continue
            if pos < n and text[pos] == ')':
                pos += 1
                break
            return None
        rows.append(row)
        if len(rows) % 5000 == 0:
            budget.tick(label)
        while pos < n and text[pos] in ' \t\r\n':
            pos += 1
        if pos < n and text[pos] == ',':
            pos += 1
            continue
        rest = text[pos:].strip()
        return rows, rest


DDL_TOKEN_RE = re.compile(
    r"""'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`(?:[^`]|``)*`|[(),]|[^'"`(),]+""", re.S)


def create_columns(stmt):
    """Column names of a CREATE TABLE, in order: the items of its outer list that start with an identifier."""
    start = stmt.find('(')
    end = stmt.rfind(')')
    if start == -1 or end <= start:
        return None
    body = stmt[start + 1:end]
    cols = []
    depth = 0
    item = []
    for tok in DDL_TOKEN_RE.finditer(body):
        t = tok.group(0)
        if t == '(':
            depth += 1
        elif t == ')':
            depth -= 1
        if t == ',' and depth == 0:
            cols.append(''.join(item).strip())
            item = []
        else:
            item.append(t)
    cols.append(''.join(item).strip())
    names = []
    for c in cols:
        m = re.match(r'^`((?:[^`]|``)+)`', c)
        if m:
            names.append(m.group(1).replace('``', '`'))
    return names or None


def keep_row(table, columns, row):
    out = {}
    for col, value in zip(columns, row):
        if col not in KEEP[table]:
            continue
        if col == 'params':
            typelist = {}
            try:
                params = json.loads(value) if value else None
                if isinstance(params, dict):
                    for k in TYPELIST_KEYS:
                        if isinstance(params.get(k), str):
                            typelist[k] = params[k][:200]
            except ValueError:
                pass
            out['typelist'] = typelist
            continue
        if col == 'manifest_cache':
            version = None
            try:
                cache = json.loads(value) if value else None
                if isinstance(cache, dict) and isinstance(cache.get('version'), str):
                    version = cache['version'][:100]
            except ValueError:
                pass
            out['manifestVersion'] = version
            continue
        out[col] = value if value is None else str(value)[:500]
    return out


# a name: backquoted, bare, or double-quoted (an identifier under ANSI_QUOTES); single-quoted text is a value
MENTION_RE = re.compile(r"""'(?:[^'\\]|\\.|'')*'|"((?:[^"\\]|\\.|"")*)"|(`(?:[^`]|``)+`|[A-Za-z0-9_#$]+)|.""", re.S)
BARE_NAME_RE = re.compile(r'^[A-Za-z0-9_#$]+$')
DROP_RE = re.compile(r'^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(%s(?:\s*\.\s*%s)?(?:\s*,\s*%s(?:\s*\.\s*%s)?)*)\s*(?:RESTRICT|CASCADE)?\s*$' % (IDENT, IDENT, IDENT, IDENT), re.I | re.S)
NOOP_RE = re.compile(r'^(?:LOCK\s+TABLES?|UNLOCK\s+TABLES?)\b|^ALTER\s+TABLE\s+%s(?:\s*\.\s*%s)?\s+(?:DISABLE|ENABLE)\s+KEYS\s*$' % (IDENT, IDENT), re.I | re.S)


# single-quoted text is a value; double-quoted text is kept, since under ANSI_QUOTES it is a name
VALUE_OR_DQ_RE = re.compile(r"'(?:[^'\\]|\\.|'')*'" r'|"(?:[^"\\]|\\.|"")*"', re.S)
QNAME = r'%s(?:\s*\.\s*%s)?' % (IDENT, IDENT)
# a name in a table position may also be double-quoted (ANSI_QUOTES)
DQ_IDENT = r'"(?:[^"]|"")+"'
IDENT_ANY = r'(?:%s|%s)' % (IDENT, DQ_IDENT)
QNAME_ANY = r'%s(?:\s*\.\s*%s)?' % (IDENT_ANY, IDENT_ANY)
# a table position: the keyword, the modifiers MySQL allows before the name, then a name list whose
# names may carry an alias (`a AS x, b y`)
ALIAS = r'(?:\s+AS\s+%s|\s+(?!(?:SET|WHERE|JOIN|INNER|LEFT|RIGHT|CROSS|NATURAL|STRAIGHT_JOIN|ON|USING|VALUES?|SELECT|LIMIT|ORDER|PARTITION|READ|WRITE|LOW_PRIORITY)\b)%s)?' % (IDENT_ANY, IDENT_ANY)
TABLE_POS_RE = re.compile(
    r'\b(?:FROM|JOIN|INTO|UPDATE|TABLES?|EXISTS|TRUNCATE|TO|USING)\s*\(*\s*'
    r'(?:(?:LOW_PRIORITY|HIGH_PRIORITY|DELAYED|QUICK|IGNORE|TEMPORARY|TABLE|IF\s+(?:NOT\s+)?EXISTS)\s+)*'
    r'(%s%s(?:\s*,\s*\(*\s*%s%s)*)' % (QNAME_ANY, ALIAS, QNAME_ANY, ALIAS), re.I)
# tables every Joomla site has: a prefix is a site's when it names one of them in a table position
CORE_TABLES = TABLES + ('content', 'users', 'modules', 'assets', 'categories', 'session', 'usergroups')
MODIFIERS = {'LOW_PRIORITY', 'HIGH_PRIORITY', 'DELAYED', 'QUICK', 'IGNORE', 'TEMPORARY', 'TABLE', 'IF', 'NOT', 'EXISTS'}


def table_prefixes(stmts):
    """The table prefixes this dump shows for a site: `#__`, and every prefix under which a table
    position (after FROM, INTO, TABLE, UPDATE …) names a core Joomla table. The prefixes of all the
    SQL files of one container are pooled before any statement is judged (finish_sql): a file that
    only changes a table (`custom.sql`) is read with the prefixes its base file declared."""
    found = {'#__'}
    for stmt, _ in stmts:
        bare = VALUE_OR_DQ_RE.sub(lambda v: v.group(0) if v.group(0).startswith('"') else "''", stmt)
        for m in TABLE_POS_RE.finditer(bare):
            for raw in re.findall(QNAME_ANY, m.group(1)):
                name = ident_name(raw)
                if name.upper() in MODIFIERS:
                    continue
                for t in CORE_TABLES:
                    prefix = split_table(name, t)
                    if prefix is not None:
                        found.add(prefix)
    return found


def tracked_mentions(stmt, prefixes):
    """{name: (prefix, table)} for every modelled table named in a statement, outside its
    single-quoted values, wherever it stands (an alias list, a subquery, a double-quoted name).
    An identifier counts as a table only under a prefix the dump uses for a site's tables: a column
    such as `display_languages` is not the `languages` table of a `display_` site."""
    found = {}
    for m in MENTION_RE.finditer(stmt):
        dq, tok = m.group(1), m.group(2)
        if dq is not None and BARE_NAME_RE.match(dq):
            tok = dq
        if tok:
            name = ident_name(tok)
            mt = modelled(name)
            if mt and mt[0] in prefixes:
                found[name] = mt
    return found


# statement forms that change only the tables they name: when they name no modelled table, they change
# none of its rows. Anything else — CALL, EXECUTE, a stored routine, trigger or event, a compound
# BEGIN ... END — may change any table.
HARMLESS_HEAD_RE = re.compile(
    r'^(?:SET|LOCK\s+TABLES?|UNLOCK\s+TABLES?|START\s+TRANSACTION|BEGIN(?:\s+WORK)?\s*$|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|USE'
    r'|CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMPORARY\s+)?TABLE|CREATE\s+(?:OR\s+REPLACE\s+)?(?:(?:UNIQUE|FULLTEXT|SPATIAL)\s+)?INDEX'
    r'|CREATE\s+(?:DATABASE|SCHEMA)'
    r'|CREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\w+\s+)?(?:DEFINER\s*=\s*\S+\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW'
    r'|DROP\s+(?:TEMPORARY\s+)?(?:TABLES?|INDEX|DATABASE|SCHEMA|VIEW)|INSERT|REPLACE'
    r'|ALTER\s+(?:ONLINE\s+)?(?:IGNORE\s+)?TABLE|ALTER\s+(?:DATABASE|SCHEMA)|UPDATE|DELETE|TRUNCATE|RENAME\s+TABLES?'
    r'|ANALYZE|OPTIMIZE|FLUSH)\b', re.I | re.S)
MAX_DIAGNOSTICS = 20
# a statement that defines an object (a view, a MERGE table, another table's definition) naming a modelled
# table other than as its own target builds on it; an index is part of the table and goes with it
DEFINING_RE = re.compile(r'^(?:CREATE|ALTER)\b(?!\s+(?:OR\s+REPLACE\s+)?(?:(?:UNIQUE|FULLTEXT|SPATIAL)\s+)?INDEX\b)', re.I)


def scan_sql(data, budget, label):
    """First pass over one SQL file: its statements and the table prefixes it shows. The effects wait
    for finish_sql, once every SQL file of the container has given its prefixes."""
    stmts = statements(decode_text(data), budget, label)
    return {'kind': 'sql-pending', 'stmts': stmts, 'prefixes': table_prefixes(stmts), 'label': label}


def finish_sql(pending, prefixes, limits, budget):
    """The effects on the modelled tables, in statement order:
    {"op": "drop"|"create"|"insert"|"truncate"|"unsupported", "table", "prefix", "rows"?, "why"?}.
    An "unsupported" op with "persistent": true comes from an object that outlives a DROP and CREATE of
    the table — a trigger, routine or event (a statement of a kind not modelled), or a view or other
    table defined over it (CREATE/ALTER of another object naming it): the table stays unknown for the
    rest of the dump. Any other unsupported op is about the rows alone, and a later DROP ends it.
    Every statement that names a modelled table must be one of the modelled forms for that table;
    any other (UPDATE, multi-table forms, RENAME, ALTER, a form inside a version-conditional comment …)
    turns the table into an "unsupported" op. A statement of a kind the scan does not know (CALL,
    EXECUTE, DELIMITER …) may change any table: it adds an "unsupported" op, prefix null, for each.
    "statements" counts the statements by outcome, with their distinct reasons (kind, verb, reason —
    never a value of the dump) counted, at most MAX_DIAGNOSTICS of them; the rest in reasonsOmitted. Nothing else of the dump is kept — no content, no users,
    no configuration."""
    label = pending['label']
    ops = []
    columns_of = {}
    kept = [0]

    def unsupported(mt, why, persistent=False):
        op = {'op': 'unsupported', 'table': mt[1], 'prefix': mt[0], 'why': why}
        if persistent:
            op['persistent'] = True
        ops.append(op)

    def insert(m, stmt, name, mt):
        rest = stmt[m.end():]
        cols = None
        cm = re.match(r'^\(\s*((?:%s\s*,\s*)*%s)\s*\)\s*' % (IDENT, IDENT), rest, re.S)
        if cm:
            cols = [ident_name(c) for c in re.findall(IDENT, cm.group(1))]
            rest = rest[cm.end():]
        vm = re.match(r'^VALUES?\s*', rest, re.I)
        if not vm:
            return unsupported(mt, '%s without a VALUES list (SELECT or SET form)' % m.group(1).upper())
        parsed = parse_tuples(rest, vm.end(), budget, label)
        if parsed is None:
            return unsupported(mt, 'a value that is not a literal (expression or function call)')
        rows, tail = parsed
        if tail:
            # name the clause by its keywords only: a value of the dump never leaves the scan
            words = [w.upper() if re.match(r'^[A-Za-z_]+$', w) else '...' for w in tail.split(None, 3)[:3]]
            return unsupported(mt, 'trailing clause after VALUES (%s)' % ' '.join(words))
        if cols is None:
            cols = columns_of.get(name)
            if cols is None:
                return unsupported(mt, 'INSERT without a column list and no CREATE TABLE before it')
        if any(len(r) != len(cols) for r in rows):
            return unsupported(mt, 'a row whose value count differs from the column count')
        kept[0] += len(rows)
        if kept[0] > limits['maxSqlRows']:
            raise Refused('more than %d rows in the modelled tables (maxSqlRows)' % limits['maxSqlRows'], label)
        ops.append({'op': 'insert', 'table': mt[1], 'prefix': mt[0], 'replace': m.group(1).upper() == 'REPLACE',
                    'rows': [keep_row(mt[1], cols, r) for r in rows]})

    stmts = pending['stmts']
    diag = {'statements': len(stmts), 'modelled': 0, 'noEffect': 0, 'unsupported': 0, 'unrecognised': 0, 'reasons': [], 'reasonsOmitted': 0}
    reason_at = {}

    def tracked(name):
        mt = modelled(name)
        return mt if mt and mt[0] in prefixes else None

    def note(kind, verb, why):
        diag[kind] += 1
        key = (kind, verb, why)
        if key in reason_at:
            diag['reasons'][reason_at[key]]['count'] += 1
        elif len(diag['reasons']) < MAX_DIAGNOSTICS:
            reason_at[key] = len(diag['reasons'])
            diag['reasons'].append({'kind': kind, 'verb': verb, 'why': why, 'count': 1})
        else:
            diag['reasonsOmitted'] += 1

    for stmt, bodies in stmts:
        vm = re.match(r'[A-Za-z_]+', stmt)
        verb = vm.group(0).upper()[:20] if vm else '?'
        if not HARMLESS_HEAD_RE.match(stmt):
            # CALL, EXECUTE, DELIMITER, LOAD, HANDLER, SELECT, CREATE PROCEDURE … may change any table,
            # named or not: none is known after it
            note('unrecognised', verb, 'a %s statement, which the scan does not model, may change any table' % verb)
            for t in TABLES:
                ops.append({'op': 'unsupported', 'table': t, 'prefix': None, 'why': 'a %s statement the scan does not model' % verb, 'persistent': True})
            continue
        mentioned = tracked_mentions(stmt, prefixes)
        if not mentioned:
            diag['noEffect'] += 1
            continue
        if NOOP_RE.match(stmt):
            diag['noEffect'] += 1
            continue  # locks and key toggles change no row
        before = len(ops)
        in_bodies = tracked_mentions(' '.join(bodies), prefixes) if bodies else {}
        if in_bodies:
            # a version-conditional comment runs on some servers only: what it does to the table is not decided
            for name, mt in sorted(mentioned.items()):
                unsupported(mt, '%s statement naming %s inside a version-conditional comment (/*!...*/)' % (verb, name), bool(DEFINING_RE.match(stmt)))
            note('unsupported', verb, 'names %s inside a version-conditional comment' % ', '.join(sorted(in_bodies)))
            continue
        handled = set()
        m = HEAD_RE.match(stmt)
        d = DROP_RE.match(stmt)
        t = TABLE_STMT_RE.match(stmt)
        if m:
            name = ident_name(m.group(2))
            mt = tracked(name)
            if mt:
                handled.add(name)
                insert(m, stmt, name, mt)
        elif d:
            for raw in re.findall(QNAME, d.group(1)):
                name = ident_name(raw)
                mt = tracked(name)
                if mt:
                    handled.add(name)
                    columns_of.pop(name, None)
                    ops.append({'op': 'drop', 'table': mt[1], 'prefix': mt[0]})
        elif t:
            tverb = next(v for v in t.groups()[:7] if v).upper()
            name = ident_name(t.group(8))
            mt = tracked(name)
            rest = stmt[t.end():].strip()
            if mt:
                handled.add(name)
                if tverb == 'CREATE':
                    bare = re.sub(r"'(?:[^'\\]|\\.|'')*'", "''", rest)
                    if not rest.startswith('(') or re.search(r'\bLIKE\b|\bSELECT\b', bare, re.I):
                        unsupported(mt, 'CREATE TABLE ... LIKE/SELECT')
                    else:
                        columns_of[name] = create_columns(stmt)
                        ops.append({'op': 'create', 'table': mt[1], 'prefix': mt[0], 'ifNotExists': bool(re.search(r'IF\s+NOT\s+EXISTS', stmt[:t.end()], re.I))})
                        # a foreign key (ON DELETE/UPDATE CASCADE, SET NULL …) lets a statement on another
                        # table, naming none of the modelled ones, change this table's rows
                        if re.search(r'\bREFERENCES\b|\bFOREIGN\s+KEY\b', re.sub(r'`(?:[^`]|``)*`|"(?:[^"]|"")*"', '``', bare), re.I):
                            unsupported(mt, 'CREATE TABLE with a foreign key: statements on other tables may change its rows')
                elif tverb in ('TRUNCATE', 'DELETE') and not rest:
                    ops.append({'op': 'truncate', 'table': mt[1], 'prefix': mt[0]})
                else:
                    unsupported(mt, '%s statement changes rows the scan does not model' % tverb)
        # every other modelled table the statement names: a form not modelled for it. A CREATE or ALTER
        # that names it without being its own definition defines something over it (a view, a MERGE table)
        # that a DROP of the table does not remove
        for name, mt in sorted(mentioned.items()):
            if name not in handled:
                unsupported(mt, '%s statement naming %s is not a modelled form' % (verb, name), bool(DEFINING_RE.match(stmt)))
        new = [o for o in ops[before:] if o['op'] == 'unsupported']
        if new:
            note('unsupported', verb, '; '.join(sorted({o['why'] for o in new})))
        else:
            diag['modelled'] += 1
    return {'kind': 'sql', 'ops': ops, 'statements': diag}


# -------------------------------------------------------------------- main
def sha256_of(fh, budget, label):
    h = hashlib.sha256()
    size = 0
    while True:
        budget.tick(label)
        chunk = fh.read(CHUNK)
        if not chunk:
            break
        size += len(chunk)
        h.update(chunk)
    fh.seek(0)
    return h.hexdigest(), size




# -------------------------------------------------------------------- reading below the input root
class NotInside(Exception):
    def __init__(self, kind, at=None, detail=None):
        Exception.__init__(self, kind)
        self.kind = kind
        self.at = at
        self.detail = detail


CLOEXEC = getattr(os, 'O_CLOEXEC', 0)
# the root's ancestors are only passed through: search permission is enough where the platform can
# open a directory for that alone (O_PATH on Linux, O_SEARCH on macOS)
PASS_THROUGH = getattr(os, 'O_PATH', 0) or getattr(os, 'O_SEARCH', 0) or os.O_RDONLY


def errno_name(e):
    return errno.errorcode.get(e.errno, str(e.errno)) if e.errno else str(e)


def open_root(root):
    """The directory `root` as a descriptor. `root` is the canonical path the caller resolved once
    (absolute, no `.`/`..`/empty component, no link on the way); it is reached from `/` one component at
    a time without following a link, so a link that appears on that path after it was resolved is
    refused (`root-link`), never followed to another directory."""
    if not isinstance(root, str) or not root.startswith('/') or root.startswith('//') or os.path.normpath(root) != root or '\0' in root:
        raise NotInside('root-not-canonical')
    parts = [p for p in root.split('/') if p]
    fd = os.open('/', os.O_RDONLY | os.O_DIRECTORY | CLOEXEC)
    try:
        for i, part in enumerate(parts):
            at = '/' + '/'.join(parts[:i + 1])
            last = i == len(parts) - 1
            try:
                st = os.stat(part, dir_fd=fd, follow_symlinks=False)
            except OSError as e:
                raise NotInside('root', at, errno_name(e))
            if stat.S_ISLNK(st.st_mode):
                raise NotInside('root-link', at)
            if not stat.S_ISDIR(st.st_mode):
                raise NotInside('root', at, 'ENOTDIR')
            flags = (os.O_RDONLY if last else PASS_THROUGH) | os.O_DIRECTORY | os.O_NOFOLLOW | CLOEXEC
            try:
                nfd = os.open(part, flags, dir_fd=fd)
            except OSError as e:
                raise NotInside('root-link' if e.errno in (errno.ELOOP, errno.ENOTDIR) else 'root', at, errno_name(e))
            os.close(fd)
            fd = nfd
            now = os.fstat(fd)
            if (now.st_dev, now.st_ino) != (st.st_dev, st.st_ino) or not stat.S_ISDIR(now.st_mode):
                raise NotInside('root-link', at)
        return fd
    except BaseException:
        os.close(fd)
        raise


def open_below(fd, rel, want_dir=False):
    """`rel` below the directory descriptor `fd`, one component at a time, never following a link.
    Returns (descriptor, stat); `fd` stays open (the caller's). The last component is a regular file,
    or a directory with `want_dir`."""
    parts = rel.split('/')
    if any(p in ('', '.', '..') or '\0' in p for p in parts):
        raise NotInside('not-relative')
    cur = fd
    try:
        for i, part in enumerate(parts):
            at = '/'.join(parts[:i + 1])
            last = i == len(parts) - 1
            try:
                st = os.stat(part, dir_fd=cur, follow_symlinks=False)
            except FileNotFoundError:
                raise NotInside('missing')
            except OSError as e:
                raise NotInside('open', at, errno_name(e))
            if stat.S_ISLNK(st.st_mode):
                raise NotInside('symlink', at)
            if (not last or want_dir) and not stat.S_ISDIR(st.st_mode):
                raise NotInside('not-directory', at)
            if last and not want_dir and not stat.S_ISREG(st.st_mode):
                raise NotInside('not-file', at)
            # O_NOFOLLOW: a link swapped in after the stat is refused (ELOOP), not followed; O_NONBLOCK:
            # a FIFO swapped in does not block the open
            flags = os.O_RDONLY | os.O_NOFOLLOW | CLOEXEC | (os.O_NONBLOCK if last and not want_dir else os.O_DIRECTORY)
            try:
                nfd = os.open(part, flags, dir_fd=cur)
            except OSError as e:
                raise NotInside('changed' if e.errno in (errno.ELOOP, errno.ENOTDIR, errno.ENOENT) else 'open', at, errno_name(e))
            if cur != fd:
                os.close(cur)
            cur = nfd
            now = os.fstat(cur)
            if (now.st_dev, now.st_ino) != (st.st_dev, st.st_ino) or stat.S_IFMT(now.st_mode) != stat.S_IFMT(st.st_mode):
                raise NotInside('changed', at)
        return cur, now
    except BaseException:
        if cur != fd:
            os.close(cur)
        raise


def stamp_of(st):
    return {'dev': st.st_dev, 'ino': st.st_ino, 'size': st.st_size, 'mtimeNs': st.st_mtime_ns}


def with_file(root, rel, fn):
    rfd = open_root(root)
    try:
        fd, st = open_below(rfd, rel)
    finally:
        os.close(rfd)
    try:
        return fn(fd, st)
    finally:
        os.close(fd)


def hash_inside(root, rel, deadline):
    """SHA-256 of `rel` as a regular file below the canonical directory `root`: what is hashed is the
    file at that path inside `root`, whatever happens to the path while it is walked."""
    def run(fd, st):
        h = hashlib.sha256()
        size = 0
        while True:
            if deadline is not None and time.time() > deadline:
                raise NotInside('deadline')
            try:
                chunk = os.read(fd, CHUNK)
            except OSError as e:
                raise NotInside('read', rel, errno_name(e))
            if not chunk:
                break
            size += len(chunk)
            h.update(chunk)
        out = stamp_of(os.fstat(fd))
        out.update({'sha256': h.hexdigest(), 'size': size})
        return out
    return with_file(root, rel, run)


def stat_inside(root, rel):
    """The stamp (device, inode, size, mtime) of `rel` below `root`, reached the same way; nothing is read."""
    return with_file(root, rel, lambda fd, st: stamp_of(os.fstat(fd)))


def kind_of(st):
    m = st.st_mode
    return 'link' if stat.S_ISLNK(m) else 'dir' if stat.S_ISDIR(m) else 'file' if stat.S_ISREG(m) else 'other'


def utf8_name(name):
    try:
        name.encode('utf-8')
        return True
    except UnicodeEncodeError:
        return False


def list_dir(fd):
    out = []
    for name in sorted(os.listdir(fd)):
        if not utf8_name(name):
            out.append({'name': name.encode('utf-8', 'surrogateescape').decode('utf-8', 'replace'), 'kind': 'bad-name'})
            continue
        try:
            st = os.stat(name, dir_fd=fd, follow_symlinks=False)
        except FileNotFoundError:
            continue
        out.append({'name': name, 'kind': kind_of(st)})
    return out


def list_inside(root):
    """The entries of `root` and of each non-hidden sub-directory of it, as they are (a link is listed as a
    link, never entered): what discovery chooses from is what is below the root."""
    rfd = open_root(root)
    try:
        entries = list_dir(rfd)
        for e in entries:
            if e['kind'] != 'dir' or e['name'].startswith('.'):
                continue
            fd, _ = open_below(rfd, e['name'], want_dir=True)
            try:
                e['entries'] = list_dir(fd)
            finally:
                os.close(fd)
        return {'root': root, 'entries': entries}
    finally:
        os.close(rfd)


def parse_deadline(argv):
    if not argv:
        return None
    if len(argv) != 2 or argv[0] != '--deadline':
        raise ValueError('usage')
    return float(argv[1])


def main_path_op(op, argv):
    """`hash`, `stat` and `list`: exit 3 with {"problem", "at", "detail"} on stderr when refused."""
    want = 1 if op == 'list' else 2
    try:
        if len(argv) < want:
            raise ValueError('usage')
        deadline = parse_deadline(argv[want:])
    except ValueError:
        sys.stderr.write('usage: quickstart-inventory-archive.py %s <root>%s [--deadline <epoch>]\n' % (op, '' if op == 'list' else ' <relative-path>'))
        return 2
    try:
        if op == 'hash':
            out = hash_inside(argv[0], argv[1], deadline)
        elif op == 'stat':
            out = stat_inside(argv[0], argv[1])
        else:
            out = list_inside(argv[0])
    except NotInside as e:
        sys.stderr.write(json.dumps({'problem': e.kind, 'at': e.at, 'detail': e.detail}) + '\n')
        return 3
    json.dump(out, sys.stdout, sort_keys=True)
    sys.stdout.write('\n')
    return 0


USAGE = ('usage: quickstart-inventory-archive.py scan <root> <relative-path> [--limits <json>] [--deadline <epoch>]\n'
         '       quickstart-inventory-archive.py hash|stat <root> <relative-path> [--deadline <epoch>]\n'
         '       quickstart-inventory-archive.py list <root> [--deadline <epoch>]\n')


def main(argv):
    if argv and argv[0] in ('hash', 'stat', 'list'):
        return main_path_op(argv[0], argv[1:])
    if len(argv) < 3 or argv[0] != 'scan':
        sys.stderr.write(USAGE)
        return 2
    root, rel = argv[1], argv[2]
    limits = dict(DEFAULT_LIMITS)
    deadline = None
    rest = argv[3:]
    while rest:
        flag = rest.pop(0)
        if not rest:
            sys.stderr.write('%s needs a value\n' % flag)
            return 2
        value = rest.pop(0)
        if flag == '--limits':
            try:
                extra = json.loads(value)
            except ValueError:
                sys.stderr.write('--limits is not JSON\n')
                return 2
            for k, v in extra.items():
                if k not in DEFAULT_LIMITS or not isinstance(v, int) or isinstance(v, bool) or v <= 0:
                    sys.stderr.write('--limits: %s is not a positive integer limit\n' % k)
                    return 2
                limits[k] = v
        elif flag == '--deadline':
            try:
                deadline = float(value)
            except ValueError:
                sys.stderr.write('--deadline is not a number\n')
                return 2
        else:
            sys.stderr.write('unknown option %s\n' % flag)
            return 2
    name = rel.split('/')[-1]
    scanner = Scanner(limits, deadline)

    def run(fd, st):
        # the descriptor the walk opened is the one read: no second open by name
        os.set_blocking(fd, True)
        with os.fdopen(os.dup(fd), 'rb') as fh:
            digest, size = sha256_of(fh, scanner.budget, name)
            if size == 0:
                raise Refused('empty file', name)
            scanner.scan_file(fh, name, None, 0, size)
            scanner.finish_sql()
            after = os.fstat(fh.fileno())
            if after.st_size != size or after.st_mtime_ns != st.st_mtime_ns:
                raise Refused('changed while it was scanned', name)
            return digest, size, stamp_of(after)

    try:
        try:
            digest, size, stamp = with_file(root, rel, run)
        except NotInside as e:
            why = {'missing': 'does not exist', 'not-file': 'not a regular file', 'symlink': 'a symlink, not followed'}.get(e.kind, e.kind)
            raise Refused('cannot be read below the input root (%s%s%s)' % (why, ' at ' + e.at if e.at else '', ', ' + e.detail if e.detail else ''), name)
    except Refused as e:
        sys.stderr.write(json.dumps({'error': str(e), 'member': e.member}) + '\n')
        return 3
    except MemoryError:
        sys.stderr.write(json.dumps({'error': 'out of memory while scanning', 'member': name}) + '\n')
        return 3
    top = scanner.containers[0]
    out = {'sha256': digest, 'size': size, 'format': top.format, 'stamp': stamp,
           'containers': [c.to_json() for c in scanner.containers],
           'stats': {'members': scanner.budget.members, 'expandedBytes': scanner.budget.expanded}}
    json.dump(out, sys.stdout, separators=(',', ':'), sort_keys=True)
    sys.stdout.write('\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
