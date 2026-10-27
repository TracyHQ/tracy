#!/usr/bin/env bash
#
# prune-snapshots — let go of restore points that have outlived their upgrade.
#
# By age, not by count. A count says nothing about whether the upgrade a snapshot belonged to
# is finished, and "keep the last 3" quietly deletes the one taken before a chain that is
# still half-run. The newest is never deleted whatever its age: a site nobody has touched in
# months is the least able to recover, and leaving it with zero restore points is the one
# outcome this whole ticket exists to prevent. That rule lives in snapshot_meta.prune, with
# its tests.
#
# Usage:
#   prune-snapshots.sh --site example.com [--keep-days 30] [--dry-run]
set -euo pipefail

SITE=""; KEEP_DAYS="30"; DRY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --keep-days) KEEP_DAYS="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SITE" ] || { echo "need --site" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"
: "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"

DROP="$("$HERE/list-snapshots.sh" --site "$SITE" --json \
        | python3 "$HERE/snapshot_meta.py" --prune --keep-days "$KEEP_DAYS")"

[ -n "$DROP" ] || { echo "==> nothing to prune"; exit 0; }

for tag in $DROP; do
  if [ -n "$DRY" ]; then
    echo "would drop $tag"
    continue
  fi
  echo "==> dropping snapshot $tag"
  AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  aws s3 rm --recursive --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" \
    "s3://$TRACY_MIGRATE_S3_BUCKET/$SITE/snapshot/$tag/" --only-show-errors
done
