#!/usr/bin/env bash
#
# backup-postgres — the tracy database of this host, as one compressed dump.
#
#   backup-postgres.sh              # write a dump, prune old ones
#   backup-postgres.sh --list       # what is on disk now
#
# ## Why this exists
#
# The `tracy` database holds every account, seat, site record and workspace — the one thing on a
# host that no deploy can rebuild. Measured 29/09/2026 on prod1 while planning the move to AWS: no
# timer, no cron and no script anywhere backed it up, and `pg_dump` appeared nowhere in this repo.
# `backup-host-dsh.sh` protects the dsh identity; this is its sibling for the database, and it
# deliberately keeps the same shape (same TRACY_BACKUP_* variables, same verify-then-prune order).
#
# ## What it does
#
# `pg_dumpall` from the running postgres container (roles AND databases, so a restore onto a fresh
# cluster needs nothing else), gzip, then READ IT BACK: `gzip -t`, the dump's own completion marker,
# and at least one CREATE TABLE. A dump that was cut short compresses and exits 0 like a good one.
#
# 🔒 AN ARCHIVE ON THE SAME DISK DOES NOT SURVIVE THE FAILURE IT EXISTS FOR. It protects against a
# bad migration, a wrong DELETE, a corrupted volume — not against losing the machine. Set
# TRACY_BACKUP_REMOTE (an rsync destination) for an off-host copy; until then every run says so.
#
# Restore (onto a stopped tracy-web, never a serving one):
#   gzip -dc <file> | docker exec -i tracy-postgres-1 psql -U tracy -d postgres
# after dropping and recreating the `tracy` database. "role already exists" is expected.
#
# Scheduled by `tracy-backup-postgres.timer` on the host (daily, like the dsh backup).
set -euo pipefail

CONTAINER="${TRACY_POSTGRES_CONTAINER:-tracy-postgres-1}"
DB_USER="${TRACY_POSTGRES_USER:-tracy}"
DEST="${TRACY_BACKUP_DIR:-/var/backups/tracy}"
KEEP="${TRACY_BACKUP_KEEP:-14}"
REMOTE="${TRACY_BACKUP_REMOTE:-}"
MODE=backup

while [ $# -gt 0 ]; do
  case "$1" in
    --list) MODE=list ;;
    --dest) DEST="${2:?--dest needs a path}"; shift ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "error: $*" >&2; exit 1; }

if [ "$MODE" = list ]; then
  ls -lh "$DEST"/postgres-*.sql.gz 2>/dev/null || echo "no dumps in $DEST"
  exit 0
fi

docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null | grep running >/dev/null \
  || die "$CONTAINER is not running — nothing to dump"

mkdir -p "$DEST"
chmod 700 "$DEST"
OUT="$DEST/postgres-$(hostname -s)-$(date +%Y%m%d-%H%M%S).sql.gz"

# umask in a subshell around the write only: the dump holds password hashes and session state.
( umask 077
  docker exec "$CONTAINER" pg_dumpall -U "$DB_USER" | gzip -6 > "$OUT" )

# Verify by reading it back. All three, because each catches a different way of being cut short.
gzip -t "$OUT" || die "$OUT is not a valid gzip — the dump was cut off"
DONE=$(gzip -dc "$OUT" | grep -c 'dump complete' || true)
TABLES=$(gzip -dc "$OUT" | grep -c '^CREATE TABLE' || true)
[ "$DONE" -gt 0 ] || die "$OUT has no completion marker — pg_dumpall stopped early"
[ "$TABLES" -gt 0 ] || die "$OUT has no CREATE TABLE — this is not a database dump"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1), $TABLES tables)"

if [ -n "$REMOTE" ]; then
  echo "copying to $REMOTE"
  rsync -a --chmod=F600 "$OUT" "$REMOTE/" || die "off-host copy FAILED — the local dump stands, but this host is still one disk away from losing its database"
  echo "off-host copy ok"
else
  echo "⚠ TRACY_BACKUP_REMOTE is not set: this dump lives on the same disk as the database."
  echo "  It survives a bad migration or a wrong DELETE. It does not survive losing this machine."
fi

# Prune AFTER the new one is written and verified, never before.
ls -1t "$DEST"/postgres-*.sql.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "pruning $(basename "$old")"
  rm -f "$old"
done
