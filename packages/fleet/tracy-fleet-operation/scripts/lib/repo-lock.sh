#!/usr/bin/env bash
# repo-lock.sh — one lock per site repo, held by whatever writes that repo on this host.
#
# A site's GitHub repo is written by the site-folder sync (tools/push-site-folder.sh): hourly, from
# sync-site-folders.sh, and whenever somebody runs it by hand. Each run fetches `main`, commits on top
# of it and pushes. Two runs at the same minute would make the second push a non-fast-forward
# rejection. Holding this lock from the setup of the sync git dir to the push makes them take turns
# instead.
#
#   tracy_lock_repo <label>
#
# Takes the lock on file descriptor 8 and keeps it until the calling shell exits (the lock belongs
# to the open file, which the shell holds). fd 8, not 9: sync-site-folders.sh already holds 9, and
# push-site-folder.sh inherits it.
#
# Waits at most TRACY_REPO_LOCK_WAIT seconds (default 600) and then returns 1: a writer stuck for
# ten minutes is a fault to report, not a reason for the next hourly run to queue behind it forever.
#
# 🔒 Fails CLOSED when `flock` is missing. Pushing unlocked is exactly the race this file exists to
# stop, and on the fleet `flock` is always there (util-linux in the tracy-host image). The test
# suite on macOS puts a flock(2) stand-in on PATH instead (test/site-folder-sync.test.mjs).
#
# TRACY_REPO_LOCK_DIR is overridable for the test suite, which cannot write to /var/lock.

TRACY_REPO_LOCK_DIR="${TRACY_REPO_LOCK_DIR:-/var/lock}"

tracy_repo_lock_path() { printf '%s/tracy-repo-%s' "$TRACY_REPO_LOCK_DIR" "$1"; }

tracy_lock_repo() {
  local label="$1"
  [ -n "$label" ] || { echo "tracy_lock_repo needs a label" >&2; return 1; }
  command -v flock >/dev/null 2>&1 || { echo "'flock' is not on PATH — refusing to write the repo unlocked" >&2; return 1; }
  exec 8>"$(tracy_repo_lock_path "$label")"
  flock -w "${TRACY_REPO_LOCK_WAIT:-600}" 8 || {
    echo "the repo of $label stayed locked for ${TRACY_REPO_LOCK_WAIT:-600}s — another sync is stuck" >&2
    return 1
  }
}
