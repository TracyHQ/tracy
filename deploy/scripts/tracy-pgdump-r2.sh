#!/usr/bin/env bash
#
# tracy-pgdump-r2 - copy the newest verified database dump of this shard to the shard's own R2
# bucket, encrypted, and keep 14 days there (spec 9 "pg_dump to R2 and a test restore", item 36).
#
#   tracy-pgdump-r2.sh [--dry-run]     # ExecStartPost of tracy-backup-postgres.service
#
# backup-postgres.sh (shipped by the deploy action, unchanged) makes and verifies the dump; this
# script only moves it off the machine, which that script's own warning asks for
# (backup-postgres.sh:22-24). It runs only when the dump succeeded (ExecStartPost).
#
# ENCRYPTED WITH age TO A PUBLIC KEY BEFORE IT LEAVES. The dump holds every account, seat and session
# of the shard, and the bucket's key has to live on this VM to upload. The private key of the
# recipient is NOT on the VM (kept in the operators' password manager): this VM can write a backup and
# cannot read one.
#
# Restore (drill: plan G5 step 5.4b, on a throwaway VM, onto a stopped tracy-web):
#   rclone copyto r2:<bucket>/postgres/<shard>/<dump>.sql.gz.age ./dump.sql.gz.age
#   age -d -i tracy-shard-backup.key ./dump.sql.gz.age | gzip -dc \
#     | docker exec -i tracy-postgres-1 psql -U tracy -d postgres
#   (drop and recreate the `tracy` database first; "role already exists" is expected,
#   backup-postgres.sh:26-28)
#
# Reads /etc/tracy/backup-r2.env (0600): R2_BACKUP_ENDPOINT R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY
# R2_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENT TRACY_SHARD_NAME [R2_BACKUP_KEEP_DAYS, default 14].
# The keys reach rclone through its environment (RCLONE_CONFIG_R2_*), never through an argv.
# Writes /var/lib/tracy/backup-r2.json {ok, object, bytes, finished_at}; the heartbeat reports it as
# last_backup {at, ok}, and the master's shard.backup_stale alert (W1) fires past 36 h or on ok=false.
# The R2 side is UNVERIFIED until d1 (plan G1 step 1.8). A bucket lifecycle rule (delete after 15
# days, prefix postgres/) is the second fence; the W6 checklist sets it.
#
# Paths come from TRACY_BACKUP_ENV, TRACY_BACKUP_DIR and TRACY_STATE_DIR (defaults above), the same
# names backup-postgres.sh reads, so a second stack on one host (the co-hosted trial shard) points
# all of them at its own directories and never shares a dump folder with the master.
set -euo pipefail

ENV_FILE="${TRACY_BACKUP_ENV:-/etc/tracy/backup-r2.env}"
DUMP_DIR="${TRACY_BACKUP_DIR:-/var/backups/tracy}"
STATE_DIR="${TRACY_STATE_DIR:-/var/lib/tracy}"
DRY_RUN=0
OBJECT=""

case "${1:-}" in
  '') ;;
  --dry-run) DRY_RUN=1 ;;
  -h|--help) sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "tracy-pgdump-r2: unknown argument $1" >&2; exit 2 ;;
esac

read_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d '"'"'"'\r' || true; }

# record <true|false> <object> <bytes>
record() {
  [ "$DRY_RUN" = 0 ] || return 0
  mkdir -p "$STATE_DIR"
  jq -nc --argjson ok "$1" --arg object "$2" --argjson bytes "${3:-0}" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{ok: $ok, object: $object, bytes: $bytes, finished_at: $at}' > "$STATE_DIR/backup-r2.json.tmp"
  mv -f "$STATE_DIR/backup-r2.json.tmp" "$STATE_DIR/backup-r2.json"
}
fail() { echo "tracy-pgdump-r2: $*" >&2; record false "$OBJECT" 0 || true; exit 1; }

[ -r "$ENV_FILE" ] || fail "cannot read $ENV_FILE"
for key in R2_BACKUP_ENDPOINT R2_BACKUP_BUCKET R2_BACKUP_ACCESS_KEY R2_BACKUP_SECRET_KEY BACKUP_AGE_RECIPIENT TRACY_SHARD_NAME; do
  [ -n "$(read_env "$ENV_FILE" "$key")" ] || fail "$ENV_FILE has no value for $key"
done
ENDPOINT="$(read_env "$ENV_FILE" R2_BACKUP_ENDPOINT)"
BUCKET="$(read_env "$ENV_FILE" R2_BACKUP_BUCKET)"
RECIPIENT="$(read_env "$ENV_FILE" BACKUP_AGE_RECIPIENT)"
SHARD="$(read_env "$ENV_FILE" TRACY_SHARD_NAME)"
KEEP_DAYS="$(read_env "$ENV_FILE" R2_BACKUP_KEEP_DAYS)"; KEEP_DAYS="${KEEP_DAYS:-14}"
case "$KEEP_DAYS" in ''|*[!0-9]*) fail "R2_BACKUP_KEEP_DAYS must be a number of days" ;; esac
printf '%s' "$RECIPIENT" | grep -E '^age1[02-9ac-hj-np-z]{58}$' >/dev/null || fail "BACKUP_AGE_RECIPIENT is not an age public key (age1..., 62 characters)"

NEWEST="$( { ls -1t "$DUMP_DIR"/postgres-*.sql.gz 2>/dev/null || true; } | head -1)"
[ -n "$NEWEST" ] || fail "no dump in $DUMP_DIR - backup-postgres.sh did not leave one"
OBJECT="postgres/$SHARD/$(basename "$NEWEST").age"
REMOTE="r2:$BUCKET/$OBJECT"

# rclone reads a remote from its environment (RCLONE_CONFIG_<NAME>_<OPTION>): the key never sits in
# a file of its own or in an argv `ps` can show. The token may not create buckets, hence no_check_bucket.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="$ENDPOINT"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(read_env "$ENV_FILE" R2_BACKUP_ACCESS_KEY)"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(read_env "$ENV_FILE" R2_BACKUP_SECRET_KEY)"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

if [ "$DRY_RUN" = 1 ]; then
  echo "tracy-pgdump-r2 (dry run): newest dump $(basename "$NEWEST")"
  echo "  \$ age -r $RECIPIENT -o <tmp> $NEWEST"
  echo "  \$ rclone copyto <tmp> $REMOTE"
  echo "  \$ rclone lsjson $REMOTE    (its Size must equal the local encrypted file)"
  echo "  \$ rclone delete --min-age ${KEEP_DAYS}d r2:$BUCKET/postgres/$SHARD/"
  exit 0
fi

for tool in age rclone jq; do command -v "$tool" >/dev/null || fail "$tool is not installed (install-shard.sh step 1 installs it)"; done
ENC="$(mktemp "$DUMP_DIR/.push.XXXXXX")"
trap 'rm -f "$ENC"' EXIT
age -r "$RECIPIENT" -o "$ENC" "$NEWEST" || fail "age could not encrypt $NEWEST"
BYTES="$(wc -c < "$ENC" | tr -d ' ')"
rclone copyto "$ENC" "$REMOTE" || fail "upload to $REMOTE failed; the local dump stands"
REMOTE_BYTES="$(rclone lsjson "$REMOTE" 2>/dev/null | jq -r '.[0].Size // empty' || true)"
[ "$REMOTE_BYTES" = "$BYTES" ] || fail "$REMOTE holds ${REMOTE_BYTES:-nothing}, expected $BYTES bytes"
echo "tracy-pgdump-r2: $OBJECT ($BYTES bytes) is in R2"
rclone delete --min-age "${KEEP_DAYS}d" "r2:$BUCKET/postgres/$SHARD/" \
  || echo "tracy-pgdump-r2: removing copies older than ${KEEP_DAYS} days failed; the new copy stands"
record true "$OBJECT" "$BYTES"
