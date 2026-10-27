#!/usr/bin/env bash
#
# The config every git call on a site's baseline repo (`webroot-baseline.git`, lib/roots.sh
# `tracy_repo_dir`) carries: no automatic maintenance.
#
# Sourced, never executed, by the scripts that write that repo — webroot/webroot-git.sh,
# webroot-edit.sh, webroot-push.sh, webroot-backup.sh — as
#   git "${TRACY_REPO_GIT_CONFIG[@]}" --git-dir="$REPO" --work-tree="$WEBROOT" …
# test/webroot-repo-gc.test.mjs runs the commits for real and scans those scripts for a call without it.
#
# 🔒 A COMMIT HERE MUST NOT LEAVE A GIT RUNNING BEHIND IT. `git commit` ends with an automatic
# maintenance run, and past gc.auto's 6700 loose objects that forks a DETACHED `git gc` — which the
# baseline of any real webroot always passes (`add -A -f` of the whole tree). The detached gc outlives
# the script that started it. Measured 05/10/2026 on the dev Mac: a site whose install had failed was
# deleted while its baseline's gc was still repacking; teardown's `rm -rf` lost the race ("Directory
# not empty"), and the gc then wrote `gc.log` ("fatal: unable to read 95727ea4…", "failed to run
# repack") into the directory just emptied — the one file left in it. A repack is also the heaviest
# thing git does, started at a moment nobody chose, on a host whose every core serves customers' sites
# (why webroot-git.sh runs its heavy steps under nice).
#
# `gc.autoDetach=false` as well: should something still ask for an automatic gc, it runs in the
# foreground and is over when the script is. What this gives up: nothing packs these repos on its own
# any more, so their objects stay loose.
TRACY_REPO_GIT_CONFIG=(-c gc.auto=0 -c maintenance.auto=false -c gc.autoDetach=false)

# ── who owns what a write puts in the webroot ─────────────────────────────────────────────────
# The site's web container reads and writes its webroot as its own user; a file or folder this
# host's root leaves there is one the CMS cannot write again (Media Manager uploads, extension
# updates: "synced files are root-owned", #1562). Whatever a script writes is given to the
# webroot's own owner, as webroot-push.sh gives its batch — the folder's `uid:gid`, read here in
# Python because the macOS test host's `stat` has no `-c`.
tracy_webroot_owner() { # webroot
  python3 -c 'import os,sys; s=os.stat(sys.argv[1]); print(f"{s.st_uid}:{s.st_gid}")' "$1"
}

# tracy_webroot_new_dirs <webroot> < paths: the folders a write of these webroot-relative paths
# (NUL-separated) will create — read BEFORE the write, while they are still missing.
tracy_webroot_new_dirs() {
  python3 -c 'import os, sys
root, made = sys.argv[1], set()
for rel in sys.stdin.buffer.read().split(b"\0"):
    d = os.path.dirname(os.fsdecode(rel)) if rel else ""
    while d not in ("", ".") and not os.path.lexists(os.path.join(root, d)):
        made.add(d)
        d = os.path.dirname(d)
sys.stdout.buffer.write(b"".join(os.fsencode(p) + b"\0" for p in sorted(made)))' "$1"
}

# tracy_webroot_own <webroot> < paths: each of these webroot-relative paths (NUL-separated) that
# exists now is given to the webroot's owner; a symlink itself (`-h`), never what it points at. Only
# inside the real webroot: a path whose folder resolves outside it (a symlinked parent, `..`) is
# skipped and named — the webroot is the customer's, and a link in it may point anywhere on the host.
# A path the write removed is skipped. Never fails the write it follows: a host that cannot chown
# says so.
tracy_webroot_own() {
  local webroot="$1" owner
  owner="$(tracy_webroot_owner "$webroot")"
  ( cd "$webroot" && python3 -c 'import os, sys
root = os.path.realpath(".")
def inside(path):
    return path == root or path.startswith(root + os.sep)
for rel in sorted(set(sys.stdin.buffer.read().split(b"\0"))):
    p = os.path.normpath(os.fsdecode(rel)) if rel else ""
    if not p or p == "." or not os.path.lexists(p):
        continue
    # The folder holding it, every link on the way resolved; the path itself only when it is no link.
    real = os.path.realpath(p) if not os.path.islink(p) else os.path.join(os.path.realpath(os.path.dirname(os.path.abspath(p))), os.path.basename(p))
    if not inside(real) or real == root:
        print(f"not given to the webroot owner, outside the webroot: {p}", file=sys.stderr)
        continue
    sys.stdout.buffer.write(os.fsencode(os.path.join(".", p)) + b"\0")' \
    | xargs -0 sh -c '[ "$#" -eq 0 ] || exec chown -h "$0" "$@"' "$owner" ) 2>&1 | sed 's/^/!! /' >&2 || true
}
