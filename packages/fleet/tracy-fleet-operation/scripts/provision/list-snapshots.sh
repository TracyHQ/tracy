#!/usr/bin/env bash
#
# list-snapshots — what a site can be put back to, and what it was at the time.
#
# Reads meta.json for each snapshot rather than the directory listing, because a run that died
# mid-upload leaves db.sql.gz and webroot.tar with no meta.json, and that is not something
# anything should offer as a way back. snapshot.sh uploads meta.json last for exactly this.
#
# Usage:
#   list-snapshots.sh --site example.com [--json]
set -euo pipefail

SITE=""; AS_JSON=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --json) AS_JSON=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SITE" ] || { echo "need --site" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"

: "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"
: "${TRACY_MIGRATE_S3_ACCESS_KEY:?}"; : "${TRACY_MIGRATE_S3_SECRET_KEY:?}"

s3() {
  AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  aws s3 --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" "$@"
}

PREFIX="$SITE/snapshot/"
TAGS="$(s3 ls "s3://$TRACY_MIGRATE_S3_BUCKET/$PREFIX" 2>/dev/null | awk '/PRE/ {print $2}' | tr -d '/' || true)"

RECORDS="["
first=1
for tag in $TAGS; do
  meta="$(s3 cp "s3://$TRACY_MIGRATE_S3_BUCKET/$PREFIX$tag/meta.json" - 2>/dev/null || true)"
  [ -n "$meta" ] || continue
  [ "$first" = 1 ] || RECORDS="$RECORDS,"
  RECORDS="$RECORDS$meta"
  first=0
done
RECORDS="$RECORDS]"

if [ -n "$AS_JSON" ]; then
  printf '%s\n' "$RECORDS"
  exit 0
fi

# The formatting lives in snapshot_meta.py, with tests. It was an inline python string here
# once and did not survive its own shell quoting, which is a poor way to find out.
printf '%s' "$RECORDS" | python3 "$HERE/snapshot_meta.py" --format
