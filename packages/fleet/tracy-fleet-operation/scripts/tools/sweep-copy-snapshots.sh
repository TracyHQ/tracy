#!/usr/bin/env bash
#
# Sweep the table snapshots `db.snapshot` left in every copy's own database on this host (#1649).
# Runs ON the host, inside the tracy-host container, once a day — started by tracy-host itself
# (`apps/tracy-host/src/sync.js`); can be run by hand any time.
#
#   sweep-copy-snapshots.sh            every site on this host
#   sweep-copy-snapshots.sh <label>    one site
#
# The rule and the drop are `tracy_snap_sweep` (lib/site-backup.sh, lib/copy_snapshots.py): per tag,
# a tag older than TRACY_SNAP_KEEP_DAYS (7) goes whole unless it is one of the newest
# TRACY_SNAP_KEEP_NEWEST (1). Every backup a site makes runs the same sweep under its locks (the
# retention step, so every Sync from live apply and every restore too); this clock is for the copies
# nobody backs up, where an agent's snapshots would otherwise stay for good.
#
# A site here is a private dir under TRACY_PRIVATE_ROOT holding a `.env` whose stack has a MariaDB
# (`tracy_backup_kind` = mysql: WordPress, Joomla); EmDash and anything else is passed over without
# a word. The database reached is always the stack's own `db` container (`tracy_db_exec`), never
# the customer's live site.
#
# Each site under its webroot lock (the file webroot-git.sh, webroot-backup.sh and webroot-sync.sh
# hold), taken WITHOUT waiting: a site busy with a restore, a sync or a backup is skipped — the
# backup's own retention sweeps it, or tomorrow's run does. Nothing here is worth queueing behind a
# thirty-minute job.
#
# The last line is always `done: N swept, B busy, U unreachable, F failed`; one site failing does
# not stop the others, and the exit code is non-zero only when F > 0 (a drop the database refused).
# A database that does not answer (a stopped site) is `unreachable`, not a fault.
#
# TRACY_SNAP_SWEEP_LOCK is overridable for the test suite, which cannot write to /var/lock.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$HERE/../lib/webroot-platform.sh"
# shellcheck source=../lib/site-backup.sh
. "$HERE/../lib/site-backup.sh"

ONLY="${1:-}"
[ -z "$ONLY" ] || tracy_require_label "$ONLY"

say() { echo "sweep-copy-snapshots: $*" >&2; }

# Fails CLOSED without flock, like sync-site-folders.sh: dropping tables beside a restore that is
# moving them is the race the site lock exists to stop. The fleet always has util-linux.
command -v flock >/dev/null 2>&1 || { say "'flock' is not on PATH — refusing to run unlocked"; exit 1; }
# One sweep at a time per host: the clock and a hand run.
exec 6>"${TRACY_SNAP_SWEEP_LOCK:-/var/lock/tracy-snap-sweep}"
flock -n 6 || { say "another sweep is running — this one is skipped"; exit 0; }

swept=0 busy=0 unreachable=0 failed=0
for dir in "$TRACY_PRIVATE_ROOT"/*/; do
  [ -d "$dir" ] || continue
  label="$(basename "$dir")"
  [ -z "$ONLY" ] || [ "$ONLY" = "$label" ] || continue
  # The fence every webroot script puts on a label (roots.sh); `_brands` and the like are no site.
  [[ "$label" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || continue
  [ -f "$dir/.env" ] || continue
  LABEL="$label"
  STACK="$(tracy_private_dir "$label")"
  WEBROOT="$(tracy_webroot_dir "$label")"
  REPO_DIR="$(tracy_repo_dir "$label")"
  [ "$(tracy_backup_kind)" = mysql ] || continue
  if [ -d "$REPO_DIR" ]; then
    exec 7>"$REPO_DIR/tracy-webroot.lock"
    if ! flock -n 7; then
      say "$label: a webroot job holds the site — skipped"
      busy=$((busy + 1))
      exec 7>&-
      continue
    fi
  fi
  # The listing first, on its own: a database that does not answer is a stopped site, not a fault.
  if ! tracy_db_exec mariadb -uroot -N -B -e 'SELECT 1' </dev/null >/dev/null 2>&1; then
    say "$label: the database does not answer — skipped"
    unreachable=$((unreachable + 1))
  elif out="$(tracy_snap_sweep 2>&1)"; then
    out="${out#==> }"
    [ -z "$out" ] || say "$label: $out"
    swept=$((swept + 1))
  else
    out="${out#==> }"
    say "$label: the sweep failed${out:+ — ${out#!! }}"
    failed=$((failed + 1))
  fi
  exec 7>&-
done

say "done: $swept swept, $busy busy, $unreachable unreachable, $failed failed"
[ "$failed" -eq 0 ]
