#!/usr/bin/env bash
#
# What every script that changes a site's standing on this host shares: go-live.sh (live, draft,
# drop-domain) and teardown.sh. Sourced, never run.
#
#   tracy_site_lifecycle_lock ROOT LABEL   one such script per site at a time
#   tracy_golive_ledger FILE               the site's record of its own domains, read once and checked
#   tracy_golive_ledger_add FILE NAME      one name onto that record
#   tracy_golive_ledger_drop FILE NAME     one name off it
#   tracy_site_env FILE KEY                one value out of the site's `.env`
#
# A script that takes the lock sets TRACY_SCRIPT_ARGV=("$@") before it reads its arguments: the lock
# is taken by starting the script again with the descriptor already held (below).
#
# 🔒 THE LOCK IS THE KERNEL'S, NOT A FLAG SOMEBODY HAS TO REMEMBER TO CLEAR. tracy-host keeps "a
# go-live holds this site" in memory, and a job record says `running` until tracy-host writes
# otherwise — a restarted tracy-host knows neither, and marks the job failed whether or not the
# script behind it has ended. This lock is an flock on a file descriptor the script (and every child
# it starts) holds: it is gone exactly when the last of them has ended, however that happened, and it
# cannot be left behind. So a second script for the same site refuses before its first step, and
# "nothing holds the lock" is proof that no earlier one is still at work.
#
# Taken through python3 because the hosts' containers have no `flock` binary everywhere (the dev Mac
# has none at all); both scripts already need python3 for the tunnel.
#
# 🔒 EVERY FILE HERE IS OPENED ONCE, WITHOUT FOLLOWING A LINK, AND JUDGED BY ITS DESCRIPTOR. Looking
# at a name (`[ -f ]`) and then opening the name is two questions about what may be two different
# things: swapped in between, the open follows a link, waits for ever on a pipe, or writes into
# somebody else's file. So the lock and the record are opened by python3 with O_NOFOLLOW and
# O_NONBLOCK, relative to their folder's descriptor, and `fstat` of what was opened decides whether
# it is a plain file. A shell cannot open that way, which is why the lock is handed DOWN: python3
# opens and locks it, then starts the script again with the lock on descriptor 8.

# Exit code of a script that found the site held by another one (EX_TEMPFAIL).
TRACY_SITE_BUSY=75
# The most a record of domains may weigh: ten names of 253 characters is under 3 KB.
TRACY_GOLIVE_LEDGER_MAX=65536

# 🔒 THE FILE KEEPS THE NAME go-live.sh GAVE IT BEFORE THE LOCK WAS SHARED (`.go-live-<label>.lock`).
# A host is not updated in one instant: an older go-live.sh may still be running, or be started by a
# job taken before the update, while a newer script starts for the same site. Under another name the
# two would each hold "the" lock and run side by side. One name, so old and new refuse each other.
_tracy_site_lifecycle_file() {
  printf '%s/.go-live-%s.lock' "$1" "$2"
}

# The one program behind every function below: `python3 -c "$_TRACY_SITE_LIFECYCLE_PY" VERB …`.
#   lock FILE BASH SCRIPT [ARG…]   open + lock FILE, then run SCRIPT again with the answer in
#                                  TRACY_SITE_LIFECYCLE_ANSWER (`held:<dev>:<ino>:<file>` with the
#                                  lock on fd 8 · `busy` · `refused`)
#   held ANSWER FILE               exit 0 when fd 8 is the plain file ANSWER names
#   ledger-read FILE MAX           the names, one per line; exit 1 with the reason on stdout
#   ledger-add | ledger-drop FILE MAX NAME
#   env-read FILE MAX KEY          the value of the first `KEY=` line; nothing when there is none
# shellcheck disable=SC2016
_TRACY_SITE_LIFECYCLE_PY='
import errno, fcntl, os, re, stat, sys

NAME = re.compile(r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+")


class Refused(Exception):
    pass


def folder(path):
    """The descriptor of the folder `path` is in, and its name there: every later step is relative
    to that one folder, whatever the names leading to it are made to mean afterwards."""
    head, base = os.path.split(path)
    if not base:
        raise Refused("%s names no file" % path)
    try:
        return os.open(head or ".", os.O_RDONLY | os.O_DIRECTORY), base
    except OSError as e:
        raise Refused("%s cannot be opened: %s" % (head or ".", e.strerror))


def plain(fd):
    return stat.S_ISREG(os.fstat(fd).st_mode)


def lock(path, argv):
    answer = "refused"
    fd = -1
    try:
        dfd, base = folder(path)
        try:
            # O_NOFOLLOW: never through a link. O_NONBLOCK: a pipe under this name is opened at
            # once (and then refused) instead of waiting for its other end.
            fd = os.open(base, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o644, dir_fd=dfd)
        finally:
            os.close(dfd)
        if not plain(fd):
            raise Refused("%s is not a regular file" % path)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            st = os.fstat(fd)
            answer = "held:%d:%d:%s" % (st.st_dev, st.st_ino, path)
        except BlockingIOError:
            answer = "busy"
    except Refused as e:
        sys.stderr.write("!! %s\n" % e)
    except OSError as e:
        sys.stderr.write("!! %s: %s\n" % (path, e.strerror))
    if answer.startswith("held:"):
        if fd != 8:
            os.dup2(fd, 8, inheritable=True)
            os.close(fd)
        else:
            os.set_inheritable(8, True)
    elif fd >= 0:
        os.close(fd)
    os.environ["TRACY_SITE_LIFECYCLE_ANSWER"] = answer
    try:
        os.execv(argv[0], argv)
    except OSError as e:
        sys.stderr.write("!! cannot start %s again: %s\n" % (argv[1] if len(argv) > 1 else argv[0], e.strerror))
        return 1


def held(answer, path):
    parts = answer.split(":", 3)
    if len(parts) != 4 or parts[0] != "held" or parts[3] != path:
        return 1
    try:
        st = os.fstat(8)
    except OSError:
        return 1
    return 0 if stat.S_ISREG(st.st_mode) and [str(st.st_dev), str(st.st_ino)] == parts[1:3] else 1


def read_plain(dfd, base, path, most, what):
    """The bytes of a plain file opened ONCE without following a link or waiting on a pipe, or None
    when nothing is under the name. Anything else under it, or more than `most` bytes, is Refused."""
    try:
        fd = os.open(base, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dfd)
    except FileNotFoundError:
        return None
    except OSError as e:
        if e.errno in (errno.ELOOP, errno.EMLINK, errno.ENXIO, errno.EOPNOTSUPP):
            raise Refused("%s is not a regular file" % path)
        raise Refused("%s cannot be read" % path)
    try:
        if not plain(fd):
            raise Refused("%s is not a regular file" % path)
        try:
            raw = b""
            while len(raw) <= most:
                chunk = os.read(fd, most + 1 - len(raw))
                if not chunk:
                    break
                raw += chunk
        except OSError:
            raise Refused("%s cannot be read" % path)
    finally:
        os.close(fd)
    if len(raw) > most:
        raise Refused("%s cannot be read, or is larger than %s can be" % (path, what))
    return raw


def read_ledger(dfd, base, path, most):
    """The names on record, or None when there is no record. Anything else is Refused."""
    raw = read_plain(dfd, base, path, most, "a record of domains")
    if raw is None:
        return None
    names = []
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError:
        raise Refused("%s holds a line that is not a host name" % path)
    for line in text.split("\n"):
        if line == "":
            continue
        if len(line) > 253 or not NAME.fullmatch(line):
            raise Refused("%s holds a line that is not a host name" % path)
        names.append(line)
    return names


def write_ledger(dfd, base, path, names):
    """Beside the record, then moved over it: a write cut short never leaves half a record. The
    file beside it is made new (O_EXCL), so nothing that was put under its name is written into."""
    tmp = base + ".tmp"
    try:
        try:
            os.unlink(tmp, dir_fd=dfd)
        except FileNotFoundError:
            pass
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644, dir_fd=dfd)
        try:
            data = "".join(name + "\n" for name in names).encode("ascii")
            while data:
                data = data[os.write(fd, data):]
            os.fsync(fd)
        finally:
            os.close(fd)
        # What the move replaces is the NAME, never what a link under it points at; and a record
        # that stopped being a plain file since it was read is not replaced at all.
        try:
            now = os.stat(base, dir_fd=dfd, follow_symlinks=False)
            if not stat.S_ISREG(now.st_mode):
                raise Refused("%s is not a regular file" % path)
        except FileNotFoundError:
            pass
        os.rename(tmp, base, src_dir_fd=dfd, dst_dir_fd=dfd)
    except (OSError, Refused) as e:
        try:
            os.unlink(tmp, dir_fd=dfd)
        except OSError:
            pass
        if isinstance(e, Refused):
            raise
        raise Refused("%s cannot be written: %s" % (path, e.strerror))


def ledger(verb, path, most, name=None):
    try:
        dfd, base = folder(path)
    except Refused:
        # No folder for the site at all (a teardown run again after the folder went): there is no
        # record in it, and nothing to take a name off. Only writing a name needs the folder.
        if verb != "ledger-add" and not os.path.lexists(os.path.dirname(path) or "."):
            return 0
        raise
    try:
        names = read_ledger(dfd, base, path, most)
        if verb == "ledger-read":
            sys.stdout.write("".join(n + "\n" for n in names or []))
            return 0
        if not NAME.fullmatch(name) or len(name) > 253:
            raise Refused("%s is not a host name" % name)
        if verb == "ledger-add":
            if names is not None and name in names:
                return 0
            write_ledger(dfd, base, path, (names or []) + [name])
        else:
            if names is None:
                return 0
            write_ledger(dfd, base, path, [n for n in names if n != name])
        return 0
    finally:
        os.close(dfd)


def env_read(path, most, key):
    try:
        dfd, base = folder(path)
    except Refused:
        if not os.path.lexists(os.path.dirname(path) or "."):
            return 0
        raise
    try:
        raw = read_plain(dfd, base, path, most, "a site .env")
    finally:
        os.close(dfd)
    for line in (raw or b"").decode("utf-8", "replace").split("\n"):
        if line.startswith(key + "="):
            sys.stdout.write(line[len(key) + 1:] + "\n")
            break
    return 0


def main(argv):
    verb = argv[0]
    try:
        if verb == "lock":
            return lock(argv[1], argv[2:])
        if verb == "held":
            return held(argv[1], argv[2])
        if verb == "env-read":
            return env_read(argv[1], int(argv[2]), argv[3])
        return ledger(verb, argv[1], int(argv[2]), argv[3] if len(argv) > 3 else None)
    except Refused as e:
        sys.stdout.write("%s\n" % e)
        return 1


sys.exit(main(sys.argv[1:]))
'

# Takes the site's lock, held on fd 8 until this shell and its children end.
# Returns 0 held · 75 another script holds it · 1 the lock cannot be asked for at all (said on
# stderr) — which is not "free".
#
# The first call does not return: python3 opens and locks the file and starts the calling script
# again ("$0" with TRACY_SCRIPT_ARGV), and the call in THAT run returns the answer. Nothing a script
# does before this call may change anything, since it runs twice.
tracy_site_lifecycle_lock() {
  local root="$1" label="$2" file answer="${TRACY_SITE_LIFECYCLE_ANSWER:-}"
  file="$(_tracy_site_lifecycle_file "$root" "$label")"
  unset TRACY_SITE_LIFECYCLE_ANSWER
  if [ -n "$answer" ]; then
    case "$answer" in
      busy) return "$TRACY_SITE_BUSY" ;;
      held:*)
        # Believed only with the descriptor to show for it: a plain file, the one the answer names.
        if python3 -c "$_TRACY_SITE_LIFECYCLE_PY" held "$answer" "$file"; then return 0; fi
        echo "!! descriptor 8 is not the go-live lock of $label ($file)" >&2
        return 1 ;;
      *)
        # Said why on the line before this one, by what tried to open it.
        echo "!! $file — the go-live lock of $label cannot be taken" >&2
        return 1 ;;
    esac
  fi
  if [ ! -d "$root" ]; then
    echo "!! $root is not a directory — the go-live lock of $label cannot be taken" >&2
    return 1
  fi
  # Asked first whether the interpreter runs at all: once this shell is replaced by it there is
  # nobody left to say "could not ask", which is not "free".
  if [ -z "${BASH:-}" ] || ! python3 -c 'import fcntl, os, stat' >/dev/null 2>&1; then
    echo "!! could not ask for the go-live lock of $label ($file)" >&2
    return 1
  fi
  exec python3 -c "$_TRACY_SITE_LIFECYCLE_PY" lock "$file" "$BASH" "$0" ${TRACY_SCRIPT_ARGV[@]+"${TRACY_SCRIPT_ARGV[@]}"}
}

# Reads the site's record of the domains a go-live added for it (`.golive-domains`, one name per
# line) ONCE, into GOLIVE_LEDGER (newline-separated, possibly empty). Returns 1 with the reason in
# GOLIVE_LEDGER_ERROR when the record cannot be trusted.
#
# 🔒 "NOT THERE" IS THE ONLY EMPTY RECORD. The names in it are ingress rules that send a customer's
# domain straight to this site's port; a caller that took an unreadable record for "no domains" went
# on to delete the site and left those rules pointing at a port the next site is given. So anything
# under that name that is not a plain readable file of host names — a link (dangling or not), a pipe,
# a folder, a file that cannot be read, a line that is not a host name — is a refusal, decided before
# the caller changes anything, on the descriptor that was opened and never on the name.
tracy_golive_ledger() {
  local file="$1" out rc=0
  GOLIVE_LEDGER=""; GOLIVE_LEDGER_ERROR=""
  out="$(python3 -c "$_TRACY_SITE_LIFECYCLE_PY" ledger-read "$file" "$TRACY_GOLIVE_LEDGER_MAX")" || rc=$?
  if [ "$rc" -ne 0 ]; then
    GOLIVE_LEDGER_ERROR="${out:-$file cannot be read}"
    return 1
  fi
  GOLIVE_LEDGER="$out"
  return 0
}

# One name onto the record, or off it. Returns 1 with the reason on stderr when the record is left
# as it was: it is read again here (the same checks), and a record that cannot be trusted is neither
# added to nor rewritten.
tracy_golive_ledger_add() {
  local out
  out="$(python3 -c "$_TRACY_SITE_LIFECYCLE_PY" ledger-add "$1" "$TRACY_GOLIVE_LEDGER_MAX" "$2")" && return 0
  [ -z "$out" ] || echo "!! $out" >&2
  return 1
}
tracy_golive_ledger_drop() {
  local out
  out="$(python3 -c "$_TRACY_SITE_LIFECYCLE_PY" ledger-drop "$1" "$TRACY_GOLIVE_LEDGER_MAX" "$2")" && return 0
  [ -z "$out" ] || echo "!! $out" >&2
  return 1
}

# The value of the first `KEY=` line of a site's `.env`, on stdout (nothing when the file or the line
# is not there). Returns 1, with the reason on stderr, when what is under that name is not a plain
# file: the port read from it decides WHOSE ingress rule a script removes, so it is never read
# through a link, and a pipe put there never holds the script.
tracy_site_env() {
  local out
  if out="$(python3 -c "$_TRACY_SITE_LIFECYCLE_PY" env-read "$1" 1048576 "$2")"; then
    printf '%s' "$out"
    return 0
  fi
  [ -z "$out" ] || echo "!! $out" >&2
  return 1
}
