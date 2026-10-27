#!/usr/bin/env bash
#
# Put the CURRENT WordPress access mu-plugin (`tracy-access.php`) into every WordPress site on this
# host. Runs ON the fleet host; `dsh/deploy-host-dsh.sh` calls it at the end of every deploy, and it
# can be run by hand any time (it changes nothing when every site already has the shipped bytes).
#
#   resync-access-plugin.sh            every site under $TRACY_SITES_ROOT
#   resync-access-plugin.sh <label>    one site
#
# ## Why this exists (#677)
#
# `provision/platform/wordpress.sh` copies `provision/access/wordpress/tracy-access.php` into
# `<webroot>/wp-content/mu-plugins/` when a site is CREATED, and nothing copied it again. A deploy
# ships a new `/opt/tracy-fleet/provision/` and every existing WordPress site kept the copy it was
# born with — measured on sites provisioned before #618, which still showed the admin bar #618
# removed. The file mints admin sessions from a request header, so a fix to it is a security fix
# and has to reach every site at the deploy that ships it, not whenever a site is next rebuilt.
#
# ## Why on the host and never in the downloadable plugin
#
# The file trusts a header to log someone in as an administrator. It must exist only on sites Tracy
# runs, written from the host; bundling it into the public claude-cowork plugin (the way Joomla's
# access package updates itself) would ship that door to every customer who downloads the plugin.
# The copy goes to the webroot through the host's own directory, so a stopped site container still
# gets it.
#
# ## Backfill — once per host, by hand
#
# A host whose sites predate this script gets them all on its next deploy. To do it without waiting
# (or on a host whose deploy runner does not call `deploy-host-dsh.sh`), as root on the host:
#
#   export TRACY_SITES_ROOT="$(grep -m1 '^HOST_SITES_ROOT=' /etc/tracy/host-dsh.env | cut -d= -f2- | tr -d "\"'\r")"
#   export TRACY_SITES_ROOT="${TRACY_SITES_ROOT:-/srv/tracy-sites}"   # the root the deploy uses
#   sha256sum /opt/tracy-fleet/provision/access/wordpress/tracy-access.php \
#             "$TRACY_SITES_ROOT"/*/.webroot/wp-content/mu-plugins/tracy-access.php   # before
#   /opt/tracy-fleet/tools/resync-access-plugin.sh                                  # all sites
#   /opt/tracy-fleet/tools/resync-access-plugin.sh                                  # again: 0 updated
#
# Without TRACY_SITES_ROOT a hand run reads /srv/tracy-sites (`lib/roots.sh`), which is not the
# deploy's root on a host whose host-dsh.env sets HOST_SITES_ROOT elsewhere.
#
# Runbook with the browser check: `dsh/HOST-DSH.md` §2bis.
#
# ## Strict plugin only where the site is ready AND listed (P0, tasks/todo-tch-opensource.md)
#
# From 0.4.0 the plugin believes only an assertion signed with the site's own key. Pushed onto a site
# that has no key, or whose container does not mount it, it would sign nobody in — and a deploy runs
# this on every site. So a site is touched only when BOTH hold, otherwise it is left exactly as it is
# ("held", counted, not a failure):
#   - ready: `$TRACY_PRIVATE_ROOT/.site-access/<label>/ready.json` (written by provision or
#     tools/secure-site-access.sh once the container proved it reads its key) names the same kid as
#     `$TRACY_PRIVATE_ROOT/.site-access/<label>/key.json`;
#   - listed: the label (or `*`) is a line of `$TRACY_PRIVATE_ROOT/.site-access/rollout.list`, or
#     the site was born strict (`.site-access/<label>/strict.json`, written by provision).
# No private root, no list, or no line: nothing is upgraded. A canary is one line in that file.
#
# ## What it does to one site, and what it refuses
#
# Only a site whose `.tracy/site.json` says `"platform": "wordpress"` AND whose
# `.webroot/wp-content` exists is touched. Identical bytes: nothing is written (the file keeps its
# inode and mtime). Different or absent: the new bytes go to a temporary file IN THE SAME
# DIRECTORY, get mode 0644, and are renamed over the old one — a reader sees the whole old file or
# the whole new one, never half of a file that hands out admin sessions. Any path in that chain
# that is a symlink, or a destination that is not a regular file, is refused rather than followed:
# this runs as root, and a link inside a customer's webroot points wherever the customer chose.
#
# 🔒 NO CHECK-THEN-USE ON A PATH. The webroot is writable from inside the site, so a directory that
# was checked can be swapped for a symlink before it is written to. Every step below therefore runs
# in one python3 process that opens each component (site, .tracy, site.json, .webroot, wp-content,
# mu-plugins, the destination) relative to the descriptor of its parent with O_NOFOLLOW, and does
# the staging, chmod and rename against the pinned mu-plugins descriptor (openat/fchmod/renameat).
# A swap after the open moves nothing: the bytes land in the directory that was opened. A
# destination swapped for a directory makes the rename fail instead of moving the file into it.
# The same process creates the staging file with signals blocked and removes it however it ends.
#
# One site failing does not stop the others; the exit code is non-zero if any failed (or if the
# metadata of a site could not be read), and every failure names its site.
#
# ## The site's history gets the deploy's own commit (plan `tasks/todo-site-changes.md` §6, Q2)
#
# A rewrite of `tracy-access.php` is a change no person asked for in chat: OUTSIDE Tracy (Brian,
# 01/10). Before, the copy sat dirty in the webroot until the next chat turn's moment swallowed it
# (01/10: "Change the badge text" showed `tracy-access.php`). Now, for a site whose webroot repo
# exists (`$TRACY_PRIVATE_ROOT/<label>/webroot-baseline.git`), the copy runs under that site's
# webroot lock — the same file `webroot/webroot-git.sh` locks, so no moment commits halfway through
# it — in three steps:
#   1. `webroot-git.sh --op deploy-prepare`: an earlier deploy's record left by a run killed after
#      its copy is committed first; a destination already dirty is committed first, as the deploy's
#      when it already holds the shipped bytes, as an ordinary outside seal otherwise (a customer's
#      own edit is never relabelled a deploy); a pending record is written before the copy;
#   2. the copy, exactly as below;
#   3. `webroot-git.sh --op deploy-commit`: that ONE file, author "On the site", titled
#      "outside Tracy: deploy <tag> updated tracy-access.php"; bytes equal to HEAD → no commit.
# A site with no repo yet gets the copy alone (its baseline will hold it). tracy-web learns of the
# commit when the next chat turn opens on that site (`seal-outside` lists recent outside commits).
# TRACY_DEPLOY_TAG names the deploy (`deploy-host-dsh.sh` passes its tag; a hand run says `manual`).
#
# TRACY_ACCESS_SYNC_LOCK is overridable for the test suite, which cannot write to /run/lock.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

# Beside the shipped scripts, exactly where provision reads it: a deploy ships both together.
SOURCE="$HERE/../provision/access/wordpress/tracy-access.php"
LOCK="${TRACY_ACCESS_SYNC_LOCK:-/run/lock/tracy-access-sync}"
NAME=tracy-access.php

say() { echo "resync-access-plugin: $*" >&2; }
die() { say "error: $*"; exit 1; }

# ── Arguments ───────────────────────────────────────────────────────────────────────────────────
[ $# -le 1 ] || die "at most one argument (a site label); got $#"
ONLY=""
if [ $# -eq 1 ]; then
  ONLY="$1"
  [ -n "$ONLY" ] || die "an empty label was given; pass none for every site"
  # A label is one directory name: no path separator, no dot-name, nothing that reads as an option.
  case "$ONLY" in
    -*|*/*|.*) die "not a site label: '$ONLY'" ;;
  esac
  printf '%s' "$ONLY" | grep -xE '[A-Za-z0-9][A-Za-z0-9._-]*' >/dev/null || die "not a site label: '$ONLY'"
fi

# ── Prerequisites — all of them before the lock, the lock before any write ─────────────────────
for tool in flock python3; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not on PATH — nothing was changed"
done

[ ! -L "$SOURCE" ] || die "$SOURCE is a symlink — refusing to copy what it points at"
[ -f "$SOURCE" ] || die "no $SOURCE — ship packages/fleet/tracy-fleet-operation/scripts/provision/ first"
[ -r "$SOURCE" ] || die "$SOURCE is not readable"
[ -s "$SOURCE" ] || die "$SOURCE is empty — refusing to install an empty plugin"

[ -d "$TRACY_SITES_ROOT" ] || die "no sites root at $TRACY_SITES_ROOT (TRACY_SITES_ROOT)"
[ -r "$TRACY_SITES_ROOT" ] && [ -x "$TRACY_SITES_ROOT" ] || die "$TRACY_SITES_ROOT is not readable"

# One run at a time per host: a deploy and a hand run must not stage into the same directory.
exec 9>"$LOCK" || die "cannot open the lock $LOCK"
flock 9 || die "cannot take the lock $LOCK"

WEBROOT_GIT="$HERE/../webroot/webroot-git.sh"
DEPLOY_TAG="${TRACY_DEPLOY_TAG:-manual}"

# The lock stays held: descriptor 9 is inherited across exec and closes only when python3 exits.
exec python3 - "$SOURCE" "$TRACY_SITES_ROOT" "$ONLY" "$TRACY_PRIVATE_ROOT" "$WEBROOT_GIT" "$DEPLOY_TAG" <<'PY'
import errno, fcntl, json, os, secrets, signal, stat, subprocess, sys, time

SOURCE, ROOT, ONLY, PRIVATE_ROOT, WEBROOT_GIT, DEPLOY_TAG = sys.argv[1:7]
REL = 'wp-content/mu-plugins/tracy-access.php'
NAME = 'tracy-access.php'
# O_NONBLOCK: opening a FIFO planted where a file or directory is expected must not hang the deploy.
DIR_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, 'O_CLOEXEC', 0)
FILE_FLAGS = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK | getattr(os, 'O_CLOEXEC', 0)
SIGNALS = {signal.SIGINT: 'interrupted', signal.SIGTERM: 'terminated', signal.SIGHUP: 'hung up'}
LABEL = ''  # the site being handled; read by the test suite's fault injection


def say(msg):
    print('resync-access-plugin: ' + msg, file=sys.stderr, flush=True)


class Interrupted(BaseException):
    def __init__(self, signum):
        super().__init__(signum)
        self.signum = signum


def on_signal(signum, _frame):
    raise Interrupted(signum)


for s in SIGNALS:
    signal.signal(s, on_signal)


class Refused(Exception):
    """This site failed; the message says why."""


def is_link(name, parent):
    try:
        return stat.S_ISLNK(os.stat(name, dir_fd=parent, follow_symlinks=False).st_mode)
    except OSError:
        return False


def open_dir(parent, name, what, shown):
    """The directory `name` under the pinned `parent`, never through a symlink. None if absent."""
    try:
        return os.open(name, DIR_FLAGS, dir_fd=parent)
    except FileNotFoundError:
        return None
    except OSError as e:
        if e.errno == errno.ELOOP or is_link(name, parent):
            raise Refused('%s %s is a symlink — refused' % (what, shown))
        if e.errno == errno.ENOTDIR:
            raise Refused('%s is not a directory — refused' % shown)
        raise Refused('cannot open %s %s: %s' % (what, shown, e.strerror))


def open_file(parent, name, what, shown):
    """(fd, bytes) of the regular file `name` under `parent`, never through a symlink. None if absent."""
    try:
        fd = os.open(name, FILE_FLAGS, dir_fd=parent)
    except FileNotFoundError:
        return None
    except OSError as e:
        if e.errno == errno.ELOOP or is_link(name, parent):
            raise Refused('%s %s is a symlink — refused' % (what, shown))
        if e.errno in (errno.EISDIR, errno.ENXIO):
            raise Refused('%s is not a regular file — refused' % shown)
        raise Refused('cannot open %s %s: %s' % (what, shown, e.strerror))
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Refused('%s is not a regular file — refused' % shown)
        chunks = []
        while True:
            chunk = os.read(fd, 1 << 16)
            if not chunk:
                break
            chunks.append(chunk)
        return b''.join(chunks)
    except OSError as e:
        raise Refused('could not read %s %s: %s' % (what, shown, e.strerror))
    finally:
        os.close(fd)


def platform_of(meta):
    def malformed(why):
        return Refused('.tracy/site.json is unreadable or malformed (%s) — platform unknown, not touched' % why)
    try:
        data = json.loads(meta.decode('utf-8'))
    except Exception as e:
        raise malformed(e)
    if not isinstance(data, dict):
        raise malformed('not a JSON object')
    platform = data.get('platform')
    if platform is not None and not isinstance(platform, str):
        raise malformed('platform is not a string')
    return platform


def install(mu, shown, source):
    """Stage `source` beside the destination in the pinned `mu` and rename it into place."""
    staged = None
    blocked = set(SIGNALS)
    try:
        name = '.%s.%s' % (NAME, secrets.token_hex(6))
        # Creation and recording it are one step as far as a signal can tell: a signal arriving in
        # between waits until `staged` names the file, so the cleanup below always sees it.
        signal.pthread_sigmask(signal.SIG_BLOCK, blocked)
        try:
            try:
                fd = os.open(name, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=mu)
            except OSError as e:
                raise Refused('could not create a staging file in %s: %s' % (shown, e.strerror))
            staged = name
        finally:
            signal.pthread_sigmask(signal.SIG_UNBLOCK, blocked)
        try:
            view = memoryview(source)
            try:
                while view:
                    view = view[os.write(fd, view):]
            except OSError as e:
                raise Refused('copy failed: %s' % e.strerror)
            try:
                os.fchmod(fd, 0o644)
            except OSError as e:
                raise Refused('chmod failed: %s' % e.strerror)
            try:
                os.fsync(fd)
                back = os.pread(fd, len(source) + 1, 0)
            except OSError as e:
                raise Refused('could not read the staged copy back: %s' % e.strerror)
            if back != source:
                raise Refused('staged copy differs from the source')
        finally:
            os.close(fd)
        try:
            # renameat on the pinned directory: replaces a file or a symlink at NAME itself, and
            # fails (EISDIR/ENOTEMPTY) on a directory planted there, never moving into it.
            os.rename(name, NAME, src_dir_fd=mu, dst_dir_fd=mu)
        except OSError as e:
            raise Refused('rename into place failed: %s' % e.strerror)
        staged = None
    finally:
        if staged is not None:
            try:
                os.unlink(staged, dir_fd=mu)
            except OSError:
                pass


def webroot_repo(label):
    """The site's webroot repo when it exists and this host ships webroot-git.sh, else None."""
    if not PRIVATE_ROOT or not os.path.isfile(WEBROOT_GIT):
        return None
    repo = os.path.join(PRIVATE_ROOT, label, 'webroot-baseline.git')
    return repo if os.path.isdir(repo) else None


class SiteLock:
    """The site's webroot lock (`<repo>/tracy-webroot.lock`, the file webroot-git.sh flocks), held
    across prepare → copy → commit. Waits up to two minutes: a moment holds it for seconds."""

    def __init__(self, repo):
        self.path = os.path.join(repo, 'tracy-webroot.lock')
        self.fd = None

    def __enter__(self):
        try:
            self.fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | getattr(os, 'O_CLOEXEC', 0), 0o600)
        except OSError as e:
            raise Refused('cannot open the webroot lock: %s' % e.strerror)
        until = time.monotonic() + 120
        while True:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                return self
            except BlockingIOError:
                if time.monotonic() > until:
                    os.close(self.fd)
                    raise Refused('the webroot is busy (its lock was held for two minutes) — not touched')
                time.sleep(0.2)

    def __exit__(self, *_):
        os.close(self.fd)


def webroot_git(label, *args):
    """One webroot-git.sh op for this site, under the lock this process holds; its JSON answer."""
    env = dict(os.environ, TRACY_WEBROOT_LOCK_HELD='1', TRACY_PRIVATE_ROOT=PRIVATE_ROOT, TRACY_SITES_ROOT=ROOT)
    r = subprocess.run(['bash', WEBROOT_GIT, '--label', label] + list(args), env=env,
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        why = (r.stderr.strip().splitlines() or ['failed'])[-1]
        raise Refused('webroot history (%s): %s' % (args[1], why))
    try:
        return json.loads(r.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        raise Refused('webroot history (%s) answered unreadably' % args[1])


class History:
    """The site's history steps around the compare-and-copy of one WordPress site (header: "The
    site's history"): lock + `deploy-prepare` on entry, `deploy-commit` on the way out — after a
    copy, after "up to date", after a refused copy (nothing changed, nothing committed). An
    interruption skips the commit: the pending record stays, and the next op commits it. A site with
    no webroot repo: nothing but the copy."""

    def __init__(self, label):
        self.label = label
        self.repo = webroot_repo(label)
        self.lock = None

    def __enter__(self):
        if self.repo is None:
            # BUG-DEV-2 (02/10, dev): TRACY_PRIVATE_ROOT unset → /srv/tracy, which existed but held
            # no site, and ~30 copies landed with nothing recorded and nothing said. Say it per site.
            UNRECORDED.append(self.label)
            if not PRIVATE_ROOT or not os.path.isdir(PRIVATE_ROOT):
                why = 'the private root %r does not exist' % PRIVATE_ROOT
            elif not os.path.isdir(os.path.join(PRIVATE_ROOT, self.label)):
                why = '%s holds no %s — is TRACY_PRIVATE_ROOT right on this host?' % (PRIVATE_ROOT, self.label)
            else:
                why = 'no webroot-baseline.git under %s' % os.path.join(PRIVATE_ROOT, self.label)
            say('%s: WARNING this copy is not recorded in the site history: %s' % (self.label, why))
            return self
        self.lock = SiteLock(self.repo).__enter__()
        try:
            webroot_git(self.label, '--op', 'deploy-prepare', '--path', REL, '--tag', DEPLOY_TAG, '--source', SOURCE)
        except BaseException:
            self.lock.__exit__()
            raise
        return self

    def __exit__(self, kind, _value, _tb):
        if self.lock is None:
            return False
        try:
            if kind is None or issubclass(kind, Refused):
                webroot_git(self.label, '--op', 'deploy-commit')
        finally:
            self.lock.__exit__()
        return False


# Sites whose copy could not be recorded in their history (no webroot repo found).
UNRECORDED = []


def rollout_list():
    try:
        with open(os.path.join(PRIVATE_ROOT, '.site-access', 'rollout.list')) as f:
            return {l.strip() for l in f if l.strip() and not l.lstrip().startswith('#')}
    except OSError:
        return set()


def kid_in(path):
    try:
        with open(path) as f:
            kid = json.load(f).get('kid')
        return kid if isinstance(kid, str) and kid else None
    except (OSError, ValueError, AttributeError):
        return None


def held_back(label):
    """Why this site must keep the plugin it has (see header), or '' when it may be upgraded."""
    if not PRIVATE_ROOT or not os.path.isdir(PRIVATE_ROOT):
        return 'no private root to prove readiness with'
    listed = rollout_list()
    born_strict = os.path.isfile(os.path.join(PRIVATE_ROOT, '.site-access', label, 'strict.json'))
    if label not in listed and '*' not in listed and not born_strict:
        return 'not on the rollout list'
    key = kid_in(os.path.join(PRIVATE_ROOT, '.site-access', label, 'key.json'))
    state = kid_in(os.path.join(PRIVATE_ROOT, '.site-access', label, 'ready.json'))
    if key is None:
        return 'no access key (tools/secure-site-access.sh)'
    if state != key:
        return 'not proven ready for kid %s (tools/secure-site-access.sh)' % key
    return ''


def resync(root, label, source):
    """'updated' | 'current' | 'skipped'; raises Refused when the site failed."""
    shown = os.path.join(ROOT, label)
    opened = []

    def keep(fd):
        if fd is not None:
            opened.append(fd)
        return fd

    try:
        site = open_dir(root, label, 'site directory', shown)
        if site is None:
            say('%s: gone — skipped' % label)
            return 'skipped'
        keep(site)
        tracy = keep(open_dir(site, '.tracy', 'metadata directory', shown + '/.tracy'))
        meta_shown = shown + '/.tracy/site.json'
        meta = open_file(tracy, 'site.json', 'metadata', meta_shown) if tracy is not None else None
        if meta is None:
            say('%s: no .tracy/site.json — platform unknown, skipped' % label)
            return 'skipped'
        platform = platform_of(meta)
        if platform is None:
            say('%s: no platform in .tracy/site.json — skipped' % label)
            return 'skipped'
        if platform != 'wordpress':
            say('%s: platform %s — skipped' % (label, platform))
            return 'skipped'
        why = held_back(label)
        if why:
            say('%s: held — %s' % (label, why))
            return 'held'

        webroot = keep(open_dir(site, '.webroot', 'webroot', shown + '/.webroot'))
        wpc_shown = shown + '/.webroot/wp-content'
        wpc = keep(open_dir(webroot, 'wp-content', 'wp-content', wpc_shown)) if webroot is not None else None
        if wpc is None:
            say('%s: no .webroot/wp-content — no WordPress to update, skipped' % label)
            return 'skipped'

        mu_shown = wpc_shown + '/mu-plugins'
        mu = keep(open_dir(wpc, 'mu-plugins', 'mu-plugins', mu_shown))
        if mu is None:
            try:
                os.mkdir('mu-plugins', 0o755, dir_fd=wpc)
            except FileExistsError:
                pass
            except OSError as e:
                raise Refused('could not create %s: %s' % (mu_shown, e.strerror))
            mu = keep(open_dir(wpc, 'mu-plugins', 'mu-plugins', mu_shown))
            if mu is None:
                raise Refused('could not create %s: it vanished' % mu_shown)

        dest_shown = mu_shown + '/' + NAME
        with History(label):
            try:
                current = open_file(mu, NAME, 'destination', dest_shown)
            except Refused as e:
                if str(e).startswith('could not read'):
                    raise Refused('could not compare %s: %s' % (dest_shown, e))
                raise
            if current == source:
                say('%s: up to date' % label)
                return 'current'
            install(mu, mu_shown, source)
            say('%s: updated %s' % (label, dest_shown))
            return 'updated'
    finally:
        for fd in opened:
            os.close(fd)


def main():
    global LABEL
    try:
        source = open_file(os.open(os.path.dirname(SOURCE), DIR_FLAGS & ~os.O_NOFOLLOW),
                           os.path.basename(SOURCE), 'source', SOURCE)
    except (Refused, OSError) as e:
        say('error: %s' % e)
        return 1
    if not source:
        say('error: %s is missing or empty — refusing to install it' % SOURCE)
        return 1
    try:
        root = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
        names = [ONLY] if ONLY else sorted(n for n in os.listdir(root) if not n.startswith('.'))
    except OSError as e:
        say('error: cannot read the sites root %s: %s' % (ROOT, e.strerror))
        return 1
    if ONLY:
        try:
            os.stat(ONLY, dir_fd=root, follow_symlinks=False)
        except FileNotFoundError:
            say("error: no site '%s' under %s" % (ONLY, ROOT))
            return 1

    counts = {'updated': 0, 'current': 0, 'skipped': 0, 'held': 0}
    failed = 0
    for label in names:
        LABEL = label
        try:
            if not stat.S_ISDIR(os.stat(label, dir_fd=root, follow_symlinks=False).st_mode) \
                    and not is_link(label, root):
                say('%s: not a directory — skipped' % label)
                counts['skipped'] += 1
                continue
            counts[resync(root, label, source)] += 1
        except Refused as e:
            say('%s: %s' % (label, e))
            failed += 1
        except FileNotFoundError:
            counts['skipped'] += 1
        except OSError as e:
            say('%s: %s' % (label, e))
            failed += 1
    LABEL = ''
    say('done: %d updated, %d up to date, %d skipped, %d held, %d failed'
        % (counts['updated'], counts['current'], counts['skipped'], counts['held'], failed))
    if UNRECORDED:
        say('WARNING: %d site(s) not recorded in their history (no webroot repo under %s): %s'
            % (len(UNRECORDED), PRIVATE_ROOT or '(unset)', ', '.join(UNRECORDED)))
    return 0 if failed == 0 else 1


try:
    sys.exit(main())
except Interrupted as e:
    say(SIGNALS.get(e.signum, 'signalled'))
    sys.exit(128 + e.signum)
PY
