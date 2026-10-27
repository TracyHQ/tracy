#!/usr/bin/env bash
#
# snapshot — a restore point for a clone that is standing.
#
# The README's "Not here yet" list carried rollback from the beginning. Nothing here dumped
# the database before an import or before a deploy, so a clone that broke had one way back:
# run Migrate again from the customer's live site. That is fine while the only thing this host
# does is stand a copy up. It stops being fine the moment it upgrades one: Joomla's updater
# copies files with Folder::copy, which has no transaction, so a failure halfway leaves a tree
# that is half one version and half another.
#
#   webroot/  ──tar──┐
#                    ├─► s3://<bucket>/<site>/snapshot/<tag>/
#   database  ──dump─┘        webroot.tar · db.sql.gz · meta.json
#
# Usage:
#   snapshot.sh --label example-com --tag before-j6 [--site example.com] [--root /srv/tracy]
#
# Reads the same R2 credentials provision.sh does:
#   TRACY_MIGRATE_S3_BUCKET  TRACY_MIGRATE_S3_ENDPOINT
#   TRACY_MIGRATE_S3_ACCESS_KEY  TRACY_MIGRATE_S3_SECRET_KEY
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
# Sourced before the defaults below: TRACY_PRIVATE_ROOT is where a site's private half lives (.env,
# work/, compose.yml) and tracy_webroot_dir() is where its SERVED files live — two roots since Plan
# 3 Task 2, and lib/roots.sh is the only place that split is named.
. "$HERE/../lib/roots.sh"

LABEL=""; TAG=""; SITE=""; ROOT="$TRACY_PRIVATE_ROOT"; PLATFORM="joomla"; KEEP_DAYS="30"
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --keep-days) KEEP_DAYS="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$TAG" ] || { echo "need --label and --tag" >&2; exit 2; }

# Refused, never cleaned up: a tag is a directory here and a key segment in the store, and
# quietly turning ../other-site into other-site writes a snapshot over a neighbour's.
TAG="$(python3 "$HERE/snapshot_meta.py" --safe-tag "$TAG")"
SITE="${SITE:-$LABEL}"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no site at $SITE_DIR" >&2; exit 1; }

: "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"
: "${TRACY_MIGRATE_S3_ACCESS_KEY:?}"; : "${TRACY_MIGRATE_S3_SECRET_KEY:?}"

# shellcheck source=/dev/null
. "$HERE/platform/$PLATFORM.sh"

WORK="$SITE_DIR/work/snapshot-$TAG"
# The same reasoning as provision.sh's trap: these are whole copies of the site, the run that
# most needs them cleared is the one that failed, and the end of the script is not always
# reached. The running site keeps webroot/ and the db volume; only this scratch goes.
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"

DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"
[ -n "$DB_PASSWORD" ] || { echo "no DB_PASSWORD in $SITE_DIR/.env" >&2; exit 1; }

echo "==> snapshot $LABEL/$TAG"

# ── the database ────────────────────────────────────────────────────────────────────────
# --single-transaction so the dump is one point in time without locking the site out, and
# --max-allowed-packet to match the import side: a real content table runs one statement past
# the 16M default, and a dump that cannot be re-imported is not a restore point.
echo "==> dumping database"
( cd "$SITE_DIR" && docker compose exec -T db \
    mariadb-dump -uroot -p"$DB_PASSWORD" --single-transaction --quick \
      --max-allowed-packet=256M --routines --events "$DB_NAME" ) \
  | gzip -c > "$WORK/db.sql.gz"
# A dump that failed halfway still leaves a file, and gzip still writes a valid trailer for
# what it got. Check the archive is whole before anything treats it as a way back.
gzip -t "$WORK/db.sql.gz"

# ── the files ───────────────────────────────────────────────────────────────────────────
# Rooted at the webroot's contents, exactly as provision.sh extracts it, so a restore and a
# provision put the same bytes in the same place.
echo "==> packing webroot"
tar -cf "$WORK/webroot.tar" -C "$(tracy_webroot_dir "$LABEL")" .

# ── what it takes to put this back ──────────────────────────────────────────────────────
# The image especially. An upgrade moves PHP mid-chain, 8.2 for Joomla 5 and 8.3 for Joomla 6,
# and restoring a Joomla 5 webroot under whatever image the upgrade left behind is a different
# site wearing the same files.
CURRENT_IMAGE="$(sed -n 's/^ *image: *//p' "$SITE_DIR/docker-compose.yml" | grep -v mariadb | sed -n 1p)"
CURRENT_IMAGE="${CURRENT_IMAGE:-$WEB_IMAGE}"
PHP_VERSION="$( ( cd "$SITE_DIR" && docker compose exec -T web php -r 'echo PHP_VERSION;' ) 2>/dev/null || echo "unknown" )"
CMS_VERSION="$( ( cd "$SITE_DIR" && docker compose exec -T web sh -c \
  'cd /var/www/html && php -r "\$x=simplexml_load_file(\"administrator/manifests/files/joomla.xml\"); echo (string)\$x->version;"' ) 2>/dev/null || echo "unknown" )"

python3 "$HERE/snapshot_meta.py" --build \
  --label "$LABEL" --tag "$TAG" --platform "$PLATFORM" \
  --web-image "$CURRENT_IMAGE" --cms-version "${CMS_VERSION:-unknown}" \
  --php-version "${PHP_VERSION:-unknown}" \
  --db-bytes "$(wc -c < "$WORK/db.sql.gz")" \
  --webroot-bytes "$(wc -c < "$WORK/webroot.tar")" > "$WORK/meta.json"

# ── upload ──────────────────────────────────────────────────────────────────────────────
put() { # local path -> key
  AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  aws s3 cp --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" \
    "$1" "s3://$TRACY_MIGRATE_S3_BUCKET/$2" --only-show-errors
}
PREFIX="$SITE/snapshot/$TAG"
echo "==> uploading to $PREFIX"
put "$WORK/db.sql.gz"   "$PREFIX/db.sql.gz"
put "$WORK/webroot.tar" "$PREFIX/webroot.tar"
# meta.json last, on purpose. It is what list-snapshots.sh and restore.sh look for, so a run
# that dies mid-upload leaves a snapshot that is visibly absent rather than one that looks
# complete and is not.
put "$WORK/meta.json"   "$PREFIX/meta.json"

echo "==> snapshot $TAG ready"
"$HERE/prune-snapshots.sh" --site "$SITE" --keep-days "$KEEP_DAYS" || \
  echo "==> prune failed; snapshot is safe, old ones stay" >&2
