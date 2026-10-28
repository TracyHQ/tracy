#!/usr/bin/env bash
# webroot-pack.sh — packs the Preview's code into a tar.gz for the desk to download and read (ADR 0073 §3).
#
# The `.webroot/` copy on the customer's machine is READ only: the agent needs to grep the whole tree and see the layout of
# templates and extensions, which asking file by file through a tool cannot do. It is never
# the source of truth — the real webroot is the copy running here.
#
# Packs CODE, not the image store: `images/` and `wp-content/uploads/` are the customer's media, hundreds of
# MB, with no line of code in them. Cache/log/tmp likewise, for more obvious reasons.
#
# Prints the object-store key for the caller (the desk asks the relay to sign a read URL for that key).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/publish-excludes.sh
. "$HERE/../lib/publish-excludes.sh"
# shellcheck source=../lib/webroot-platform.sh
. "$HERE/../lib/webroot-platform.sh"

LABEL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$LABEL" ]] || { echo "need --label" >&2; exit 2; }
tracy_require_label "$LABEL"

WEBROOT="$(tracy_webroot_dir "$LABEL")"
[[ -d "$WEBROOT" ]] || { echo "no webroot at $WEBROOT" >&2; exit 1; }

: "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"
: "${TRACY_MIGRATE_S3_ACCESS_KEY:?}"; : "${TRACY_MIGRATE_S3_SECRET_KEY:?}"

# The key sits under exactly the prefix the relay guards (`sites/<label>/`), so a seat of another site cannot
# get a read URL signed for it.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
KEY="sites/$LABEL/$STAMP-webroot-read.tar.gz"
TARBALL="/tmp/webroot-read-$LABEL.tar.gz"

# Same reason as the baseline: packing a few hundred MB on one core must yield the machine, and must queue
# behind other heavy work instead of running on top of it.
# Under the heavy lock: ionice only, never nice (webroot-git.sh, "NEVER `nice` WORK THAT HOLDS THE
# HEAVY LOCK").
# shellcheck source=../lib/heavy-slots.sh
. "$HERE/../lib/heavy-slots.sh"
heavy_wait /var/lock/tracy-webroot-heavy.lock 1800 || { echo "another heavy webroot job is running; try again shortly" >&2; exit 1; }

# The platform is read from the webroot itself, like every diagnostic script here (lib/webroot-platform.sh).
# Unknown means `-`, NOT "assume Joomla": the exclude list below decides
# which secret files must not leave this machine, and guessing the platform wrong there lets wp-config.php slip out.
PLATFORM="$(tracy_webroot_platform "$WEBROOT")"

# This read copy goes down to the customer's machine, so it must be free of secrets. The exclude list is SHARED with
# the old publish path (lib/publish-excludes.sh): there every line has a reason and a test running real
# rsync — Joomla's `configuration.php` carries the DB password and $secret, `wp-config.php` carries salts.
#
# `read-copy` changes exactly ONE line: it keeps `media/`. Joomla 4 moved template CSS/JS to
# `media/templates/site/<tpl>/`, so a copy without it is a copy with no stylesheet at all —
# the agent looks in `templates/`, sees a Joomla 3 layout and writes where no page reads.
# Rewriting the list here is the surest way to miss a line.
stage="/tmp/webroot-read-stage-$LABEL"
rm -rf "$stage"; mkdir -p "$stage"
excludes=()
while IFS= read -r rule; do
  [[ -n "$rule" ]] && excludes+=("$rule")
done < <(tracy_publish_excludes "$PLATFORM" read-copy)
ionice -c3 rsync -a --delete "${excludes[@]}" \
  --exclude='images/' --exclude='wp-content/uploads/' --exclude='.git' \
  "$WEBROOT/" "$stage/"
tracy_prune_data_files "$stage"

ionice -c3 tar -czf "$TARBALL" -C "$stage" . 2>/dev/null || true
rm -rf "$stage"
[[ -s "$TARBALL" ]] || { echo "pack produced nothing" >&2; exit 1; }

AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  ionice -c3 aws s3 cp --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" \
    "$TARBALL" "s3://$TRACY_MIGRATE_S3_BUCKET/$KEY" --only-show-errors

BYTES=$(stat -c %s "$TARBALL")
rm -f "$TARBALL"
echo "{\"ok\":true,\"key\":\"$KEY\",\"bytes\":$BYTES}"
