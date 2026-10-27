#!/usr/bin/env python3
"""Webroot archive for pack.mjs: written with normalised metadata, read back as structured rows.

  archive.py build --root <webroot> --root-id <dev:ino> --list <members.nul> --config <wp-config.php> --out <tar.gz>
  archive.py list <tar.gz | -> [--read <member>]...

`build` writes every member named in the NUL-separated list (webroot-relative; a directory is
listed with a trailing `/`, the kind the walk saw, and a member whose kind changed since is refused)
plus the staged wp-config.php, with the metadata the fleet can serve: owner 0:0
(root/root), regular files 0644, a regular file whose source mode carries any execute bit 0755,
directories 0755, no setuid/setgid/sticky bits, no xattrs, ACLs or macOS metadata, gzip header
without a name or timestamp. The source tree is only read: nothing is chmod-ed there. The webroot
is opened once, with O_NOFOLLOW, and must be the directory the walk identified (`--root-id`, its
st_dev:st_ino) — then, and again when the build ends, or nothing is written. Every
member is reached one path component at a time from the webroot's descriptor with O_NOFOLLOW (a
parent swapped for a symlink since the walk is refused, never followed out of the webroot), and
before the build returns every member is looked up again: same inode, kind and mode, and a file
its size, mtime and ctime. A member that is not a plain file or directory, has a name that is not
canonical, cannot be read, or changes while or after it is archived stops the build with
`member <path>: <reason>` on stderr and exit 3; stdout is a JSON summary on success.

`list` prints one JSON array of {name, type, mode, uid, gid, uname, gname, size, linkname, pax}
so the check reads fields, not the columns of `tar -tv` (which differ between GNU and BSD tar).
A member named with `--read` that is a regular file also carries `content` (base64) — restore reads
wp-config.php from the bytes it will extract before anything on the stand is wiped.
"""
import base64
import errno
import gzip
import json
import os
import stat
import sys
import tarfile

FILE_MODE = 0o644
EXEC_MODE = 0o755
DIR_MODE = 0o755


class MemberError(Exception):
    pass


def kind_of(mode):
    if stat.S_ISREG(mode):
        return 'file'
    if stat.S_ISDIR(mode):
        return 'dir'
    if stat.S_ISLNK(mode):
        return 'symlink'
    if stat.S_ISFIFO(mode):
        return 'fifo'
    if stat.S_ISSOCK(mode):
        return 'socket'
    if stat.S_ISCHR(mode):
        return 'character device'
    if stat.S_ISBLK(mode):
        return 'block device'
    return 'unknown type'


def base_info(name, st):
    info = tarfile.TarInfo(name)
    info.uid = info.gid = 0
    info.uname = info.gname = 'root'
    info.mtime = int(st.st_mtime)
    return info


NOFOLLOW = getattr(os, 'O_NOFOLLOW', 0)
DIRECTORY = getattr(os, 'O_DIRECTORY', 0)


def identity(st):
    """What must not change between the walk, the read and the end of the build."""
    ident = (st.st_dev, st.st_ino, stat.S_IFMT(st.st_mode), stat.S_IMODE(st.st_mode))
    if stat.S_ISREG(st.st_mode):
        ident += (st.st_size, st.st_mtime_ns, st.st_ctime_ns)
    return ident


class Tree:
    """The webroot, opened once; every member reached one component at a time from its descriptor
    with O_NOFOLLOW, so a parent directory swapped for a symlink after the walk is refused, never
    followed out of the webroot."""

    def __init__(self, root, root_id):
        self.root = root
        self.root_id = root_id
        try:
            self.fd = os.open(root, os.O_RDONLY | DIRECTORY | NOFOLLOW)
        except OSError as e:
            raise MemberError('webroot %s: cannot be opened as a directory without following a symlink (%s)' % (root, e.strerror or e))
        try:
            self.check(os.fstat(self.fd), 'when the build opened it')
        except BaseException:
            os.close(self.fd)
            raise

    def check(self, st, when):
        if not stat.S_ISDIR(st.st_mode) or '%d:%d' % (st.st_dev, st.st_ino) != self.root_id:
            raise MemberError('webroot %s: is not the directory the walk read (%s) %s — replaced since the walk' % (self.root, self.root_id, when))

    def still_root(self):
        """The path still names the directory that was archived (no swap between walk and publish)."""
        try:
            st = os.stat(self.root, follow_symlinks=False)
        except OSError as e:
            raise MemberError('webroot %s: gone when the build ended (%s)' % (self.root, e.strerror or e))
        self.check(st, 'when the build ended')

    def parent(self, rel):
        parts = rel.split('/')
        fd = os.dup(self.fd)
        try:
            for i, part in enumerate(parts[:-1]):
                try:
                    nfd = os.open(part, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=fd)
                except OSError as e:
                    where = '/'.join(parts[:i + 1])
                    if e.errno in (errno.ELOOP, errno.ENOTDIR, errno.EMLINK):
                        raise MemberError('member %s: its parent %s is no longer a directory (a symlink or a file since the walk)' % (rel, where))
                    raise MemberError('member %s: its parent %s cannot be opened (%s)' % (rel, where, e.strerror or e))
                os.close(fd)
                fd = nfd
        except BaseException:
            os.close(fd)
            raise
        return fd, parts[-1]

    def lstat(self, rel):
        fd, leaf = self.parent(rel)
        try:
            return os.stat(leaf, dir_fd=fd, follow_symlinks=False)
        finally:
            os.close(fd)

    def close(self):
        os.close(self.fd)


def add_dir(tar, rel, tree):
    fd, leaf = tree.parent(rel)
    try:
        try:
            dfd = os.open(leaf, os.O_RDONLY | DIRECTORY | NOFOLLOW, dir_fd=fd)
        except OSError as e:
            if e.errno in (errno.ELOOP, errno.ENOTDIR, errno.EMLINK):
                st = os.stat(leaf, dir_fd=fd, follow_symlinks=False)
                raise MemberError('member %s: was a directory when the webroot was walked, is now a %s' % (rel, kind_of(st.st_mode)))
            raise MemberError('member %s: cannot be opened (%s)' % (rel, e.strerror or e))
    finally:
        os.close(fd)
    try:
        st = os.fstat(dfd)
    finally:
        os.close(dfd)
    info = base_info(rel, st)
    info.type = tarfile.DIRTYPE
    info.mode = DIR_MODE
    tar.addfile(info)
    return 'dir', DIR_MODE, identity(st)


def add_file(tar, rel, tree=None, path=None):
    """A regular file, from the webroot (`tree`) or at an absolute `path` (the staged config)."""
    if tree is not None:
        pfd, leaf = tree.parent(rel)
    else:
        pfd, leaf = None, path
    try:
        try:
            before = os.stat(leaf, dir_fd=pfd, follow_symlinks=False)
        except OSError as e:
            raise MemberError('member %s: gone since the webroot was walked (%s)' % (rel, e.strerror or e))
        if stat.S_ISDIR(before.st_mode):
            raise MemberError('member %s: was a file when the webroot was walked, is now a directory' % rel)
        if not stat.S_ISREG(before.st_mode):
            raise MemberError('member %s: %s — only regular files and directories ship; take it off the stand or --exclude it' % (rel, kind_of(before.st_mode)))
        try:
            fd = os.open(leaf, os.O_RDONLY | NOFOLLOW | getattr(os, 'O_NONBLOCK', 0), dir_fd=pfd)
        except PermissionError:
            raise MemberError('member %s: the packer cannot read it (permission denied)' % rel)
        except OSError as e:
            raise MemberError('member %s: cannot be opened (%s)' % (rel, e.strerror or e))
        with os.fdopen(fd, 'rb') as f:
            opened = os.fstat(f.fileno())
            if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino) or not stat.S_ISREG(opened.st_mode):
                raise MemberError('member %s: was replaced while it was archived' % rel)
            mode = EXEC_MODE if opened.st_mode & 0o111 else FILE_MODE
            info = base_info(rel, opened)
            info.type = tarfile.REGTYPE
            info.mode = mode
            info.size = opened.st_size
            try:
                tar.addfile(info, f)
            except OSError as e:
                raise MemberError('member %s: changed while it was archived (%s)' % (rel, e))
            after = os.fstat(f.fileno())
            if identity(after) != identity(opened):
                raise MemberError('member %s: changed while it was archived' % rel)
        # the name still leads to the file that was read, with the metadata it was read with
        try:
            again = os.stat(leaf, dir_fd=pfd, follow_symlinks=False)
        except OSError as e:
            raise MemberError('member %s: gone while it was archived (%s)' % (rel, e.strerror or e))
        if identity(again) != identity(opened):
            raise MemberError('member %s: was replaced or changed while it was archived' % rel)
    finally:
        if pfd is not None:
            os.close(pfd)
    return 'file', mode, identity(opened)


def bad_name(rel):
    return rel.startswith('/') or any(s in ('', '.', '..') for s in rel.split('/'))


def build(root, root_id, list_file, config, out):
    with open(list_file, 'rb') as fh:
        names = [n.decode('utf-8', 'surrogateescape') for n in fh.read().split(b'\0') if n]
    seen = set()
    modes = {}
    executables = []
    written = []
    tree = Tree(root, root_id)
    try:
        with open(out, 'wb') as raw:
            # gzip -n: no name, no timestamp — the same archive bytes for the same tree
            with gzip.GzipFile(filename='', mode='wb', fileobj=raw, compresslevel=6, mtime=0) as gz:
                with tarfile.open(fileobj=gz, mode='w', format=tarfile.PAX_FORMAT) as tar:
                    for listed in names + ['wp-config.php']:
                        rel = listed[:-1] if listed.endswith('/') else listed
                        walked_dir = listed.endswith('/')
                        if rel in seen:
                            raise MemberError('member %s: listed twice' % rel)
                        if bad_name(rel):
                            raise MemberError('member %s: not a canonical relative path' % rel)
                        seen.add(rel)
                        if rel == 'wp-config.php':
                            kind, mode, _ = add_file(tar, rel, path=config)
                            if mode != FILE_MODE:
                                # the staged config is written by pack.mjs; it is never an executable
                                raise MemberError('member wp-config.php: staged copy carries an execute bit')
                        elif walked_dir:
                            kind, mode, ident = add_dir(tar, rel, tree)
                            written.append((rel, ident))
                        else:
                            kind, mode, ident = add_file(tar, rel, tree=tree)
                            written.append((rel, ident))
                        key = '%s %04o' % (kind, mode)
                        modes[key] = modes.get(key, 0) + 1
                        if kind == 'file' and mode == EXEC_MODE:
                            executables.append(rel)
        # Before the archive is handed back: every member is still what was written — same inode,
        # kind and mode, and a file its size, mtime and ctime. A stand that moved under the pack
        # does not get an archive that matches neither the walk nor the stand.
        for rel, ident in written:
            try:
                now = identity(tree.lstat(rel))
            except OSError as e:
                raise MemberError('member %s: gone after it was archived (%s)' % (rel, e.strerror or e))
            if now != ident:
                raise MemberError('member %s: changed after it was archived' % rel)
        tree.still_root()
    finally:
        tree.close()
    return {'members': len(seen), 'modes': modes, 'executables': executables}


TYPE_NAMES = {
    tarfile.REGTYPE: 'file',
    tarfile.AREGTYPE: 'file',
    tarfile.DIRTYPE: 'dir',
    tarfile.SYMTYPE: 'symlink',
    tarfile.LNKTYPE: 'hardlink',
    tarfile.CHRTYPE: 'character device',
    tarfile.BLKTYPE: 'block device',
    tarfile.FIFOTYPE: 'fifo',
    tarfile.CONTTYPE: 'contiguous file',
}


def listing(path, read=()):
    rows = []
    # `-`: the archive's bytes on stdin, read as a stream (restore lists what it extracts)
    opened = tarfile.open(fileobj=sys.stdin.buffer, mode='r|*') if path == '-' else tarfile.open(path, mode='r:*')
    with opened as tar:
        for m in tar:
            rows.append({
                'name': m.name,
                'type': TYPE_NAMES.get(m.type, 'unknown type'),
                'mode': m.mode,
                'uid': m.uid,
                'gid': m.gid,
                'uname': m.uname,
                'gname': m.gname,
                'size': m.size,
                'linkname': m.linkname,
                'pax': sorted(k for k in m.pax_headers if k not in ('path', 'linkpath', 'size', 'mtime', 'uid', 'gid', 'uname', 'gname')),
            })
            if m.name in read and m.isreg():
                rows[-1]['content'] = base64.b64encode(tar.extractfile(m).read()).decode('ascii')
    return rows


def main(argv):
    if len(argv) >= 2 and argv[0] == 'list':
        extra = argv[2:]
        if len(extra) % 2 or any(k != '--read' for k in extra[0::2]):
            sys.stderr.write('archive.py list: only --read <member> may follow the archive\n')
            return 2
        try:
            rows = listing(argv[1], set(extra[1::2]))
        except (tarfile.TarError, OSError, EOFError) as e:
            sys.stderr.write('archive %s cannot be read: %s\n' % (argv[1], e))
            return 3
        sys.stdout.write(json.dumps(rows, separators=(',', ':')))
        return 0
    if argv and argv[0] == 'build':
        opts = dict(zip(argv[1::2], argv[2::2]))
        missing = [k for k in ('--root', '--root-id', '--list', '--config', '--out') if k not in opts]
        if missing:
            sys.stderr.write('archive.py build: missing %s\n' % ', '.join(missing))
            return 2
        try:
            summary = build(opts['--root'], opts['--root-id'], opts['--list'], opts['--config'], opts['--out'])
        except MemberError as e:
            sys.stderr.write('%s\n' % e)
            return 3
        except OSError as e:
            sys.stderr.write('archive.py build: %s\n' % e)
            return 3
        sys.stdout.write(json.dumps(summary))
        return 0
    sys.stderr.write(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
