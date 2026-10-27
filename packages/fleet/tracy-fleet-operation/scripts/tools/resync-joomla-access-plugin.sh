#!/usr/bin/env bash
#
# Put the CURRENT Joomla access plugin (provision/access/joomla/plg_system_tracyaccess) over the copy
# a Joomla site already has at `.webroot/plugins/system/tracyaccess/`. Runs ON the host. P0 of the
# open-source line: the strict plugin (0.2.0) believes only the assertion tracy-web signs with the
# site's own key.
#
#   resync-joomla-access-plugin.sh            every ready, listed Joomla site under $TRACY_SITES_ROOT
#   resync-joomla-access-plugin.sh <label>    one site (still only if ready and listed)
#   resync-joomla-access-plugin.sh --platform joomla <label>
#                                             same, for a site whose `.tracy/site.json` is not written
#                                             yet (provision) or names no platform
#
# Same guard as resync-access-plugin.sh (its header): a site is touched only when
# `$TRACY_PRIVATE_ROOT/.site-access/<label>/ready.json` names the kid of its `key.json`, AND the label
# (or `*`) is a line of `$TRACY_PRIVATE_ROOT/.site-access/rollout.list`. Anything else is "held" and
# left exactly as it is. A site provision created (`.site-access/<label>/strict.json`) counts as listed:
# it was born with the strict plugin and must never fall back to the header-trusting one. A site with no `plugins/system/tracyaccess/` is skipped: this tool replaces
# the plugin's files, it never installs or enables an extension.
#
# ⚠ The plugin on a Joomla site arrives inside the claude-cowork package (pkg_claudecowork); a later
# package update can put the old copy back. dsh/deploy-host-dsh.sh runs this at the end of every
# deploy, and provision/strict-site-access.sh runs it for a new site, until the package itself ships
# 0.2.0 (TracyHQ/claude-cowork).
#
# Writes: each file staged beside its destination and renamed into place, every directory opened
# relative to its parent with O_NOFOLLOW (the webroot is writable from inside the site; a symlink
# planted there is refused, never followed).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
SOURCE="$HERE/../provision/access/joomla/plg_system_tracyaccess"
FORCE=""
if [ "${1:-}" = --platform ]; then
  [ "${2:-}" = joomla ] && [ $# -eq 3 ] || { echo "resync-joomla-access-plugin: --platform joomla <label>" >&2; exit 2; }
  FORCE=joomla; shift 2
fi
[ $# -le 1 ] || { echo "resync-joomla-access-plugin: at most one label" >&2; exit 2; }
if [ $# -eq 1 ] && [[ ! "$1" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]]; then
  echo "resync-joomla-access-plugin: not a site label: $1" >&2; exit 2
fi
[ -d "$SOURCE" ] || { echo "resync-joomla-access-plugin: no $SOURCE" >&2; exit 1; }

exec python3 - "$SOURCE" "$TRACY_SITES_ROOT" "$TRACY_PRIVATE_ROOT" "${1:-}" "$FORCE" <<'PY'
import errno, json, os, secrets, stat, sys

SOURCE, ROOT, PRIVATE, ONLY, FORCE = sys.argv[1:6]
FILES = ['tracyaccess.xml', 'script.php', 'services/provider.php', 'src/Extension/TracyAccess.php',
         'lib/AccessJwt.php', 'lib/AccessAssertion.php']
DIR = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK

def say(m):
    print('resync-joomla-access-plugin: ' + m, file=sys.stderr, flush=True)

class Refused(Exception):
    pass

def kid(path):
    try:
        k = json.load(open(path)).get('kid')
        return k if isinstance(k, str) and k else None
    except (OSError, ValueError, AttributeError):
        return None

def held_back(label):
    if not PRIVATE or not os.path.isdir(PRIVATE):
        return 'no private root to prove readiness with'
    try:
        listed = {l.strip() for l in open(os.path.join(PRIVATE, '.site-access', 'rollout.list'))
                  if l.strip() and not l.lstrip().startswith('#')}
    except OSError:
        listed = set()
    born_strict = os.path.isfile(os.path.join(PRIVATE, '.site-access', label, 'strict.json'))
    if label not in listed and '*' not in listed and not born_strict:
        return 'not on the rollout list'
    k = kid(os.path.join(PRIVATE, '.site-access', label, 'key.json'))
    if k is None:
        return 'no access key (tools/secure-site-access.sh)'
    if kid(os.path.join(PRIVATE, '.site-access', label, 'ready.json')) != k:
        return 'not proven ready for kid %s (tools/secure-site-access.sh)' % k
    return ''

def opendir(parent, name, create=False):
    try:
        return os.open(name, DIR, dir_fd=parent)
    except FileNotFoundError:
        if not create:
            return None
        os.mkdir(name, 0o755, dir_fd=parent)
        return os.open(name, DIR, dir_fd=parent)
    except OSError as e:
        if e.errno in (errno.ELOOP, errno.ENOTDIR):
            raise Refused('%s is a symlink or not a directory — refused' % name)
        raise Refused('cannot open %s: %s' % (name, e.strerror))

def put(dirfd, name, data):
    try:
        st = os.stat(name, dir_fd=dirfd, follow_symlinks=False)
        if not stat.S_ISREG(st.st_mode) and not stat.S_ISLNK(st.st_mode):
            raise Refused('%s is not a regular file — refused' % name)
        if stat.S_ISREG(st.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=dirfd)
            try:
                if os.read(fd, len(data) + 1) == data:
                    return False
            finally:
                os.close(fd)
    except FileNotFoundError:
        pass
    tmp = '.%s.%s' % (name, secrets.token_hex(6))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=dirfd)
    try:
        os.write(fd, data)
        os.fchmod(fd, 0o644)
        os.fsync(fd)
    finally:
        os.close(fd)
    try:
        os.rename(tmp, name, src_dir_fd=dirfd, dst_dir_fd=dirfd)
    except OSError as e:
        os.unlink(tmp, dir_fd=dirfd)
        raise Refused('rename of %s failed: %s' % (name, e.strerror))
    return True

def resync(label):
    meta = os.path.join(ROOT, label, '.tracy', 'site.json')
    try:
        platform = json.load(open(meta)).get('platform') or FORCE or None
    except (OSError, ValueError, AttributeError):
        platform = FORCE or None
    if platform != 'joomla':
        return 'skipped'
    why = held_back(label)
    if why:
        say('%s: held — %s' % (label, why))
        return 'held'
    fds = []
    try:
        cur = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
        fds.append(cur)
        for part in [label, '.webroot', 'plugins', 'system', 'tracyaccess']:
            cur = opendir(cur, part)
            if cur is None:
                say('%s: no plugins/system/tracyaccess — skipped' % label)
                return 'skipped'
            fds.append(cur)
        changed = 0
        for rel in FILES:
            data = open(os.path.join(SOURCE, rel), 'rb').read()
            d = cur
            for part in rel.split('/')[:-1]:
                d = opendir(d, part, create=True)
                fds.append(d)
            changed += put(d, rel.split('/')[-1], data)
        say('%s: %s' % (label, 'updated %d file(s)' % changed if changed else 'up to date'))
        return 'updated' if changed else 'current'
    finally:
        for fd in fds:
            os.close(fd)

counts = {'updated': 0, 'current': 0, 'skipped': 0, 'held': 0}
failed = 0
labels = [ONLY] if ONLY else sorted(n for n in os.listdir(ROOT) if not n.startswith('.'))
for label in labels:
    try:
        counts[resync(label)] += 1
    except (Refused, OSError) as e:
        say('%s: %s' % (label, e))
        failed += 1
say('done: %d updated, %d up to date, %d skipped, %d held, %d failed'
    % (counts['updated'], counts['current'], counts['skipped'], counts['held'], failed))
sys.exit(1 if failed else 0)
PY
