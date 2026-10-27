#!/usr/bin/env bash
#
# restore — put a clone back the way a snapshot found it.
#
# The other half of snapshot.sh, and the half that has to be right when everything else has
# already gone wrong. Two rules shape it:
#
#   * Nothing is touched until every artifact is in hand. A restore that fetches the database,
#     drops the live one, and then finds the webroot missing has destroyed the thing it was
#     called to save.
#   * The image comes back too. An upgrade moves PHP mid-chain, 8.2 for Joomla 5 and 8.3 for
#     Joomla 6; putting a Joomla 5 webroot under the image Joomla 6 left behind is not the site
#     that was snapshotted.
#
# Usage:
#   restore.sh --label example-com --tag before-j6 [--site example.com] [--root /srv/tracy]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
# Sourced before the defaults below: TRACY_PRIVATE_ROOT is where a site's private half lives (.env,
# work/, compose.yml) and tracy_webroot_dir() is where its SERVED files live — two roots since Plan
# 3 Task 2, and lib/roots.sh is the only place that split is named.
. "$HERE/../lib/roots.sh"

LABEL=""; TAG=""; SITE=""; ROOT="$TRACY_PRIVATE_ROOT"; PLATFORM="joomla"
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --site) SITE="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$TAG" ] || { echo "need --label and --tag" >&2; exit 2; }

TAG="$(python3 "$HERE/snapshot_meta.py" --safe-tag "$TAG")"
SITE="${SITE:-$LABEL}"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no site at $SITE_DIR" >&2; exit 1; }

: "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"
: "${TRACY_MIGRATE_S3_ACCESS_KEY:?}"; : "${TRACY_MIGRATE_S3_SECRET_KEY:?}"

# 🔒 web-image.sh FIRST, because the platform file calls into it AT LOAD TIME. `platform/joomla.sh`
# opens with `WEB_IMAGE="$(tracy_web_image joomla …)"`, so sourcing the platform without the library
# dies on line 6 with `tracy_web_image: command not found` — measured 08/09/2026 restoring a site
# onto a fresh host, which is the first time anybody ran this script standalone.
#
# ⚠ IT LOOKED FINE BECAUSE NOBODY RAN IT ALONE. `provision.sh`, `render-compose.sh` and `set-php.sh`
# all source the library before reaching a platform file; this script was the one that did not, and
# a rollback tool that only works when another script ran first is a rollback tool that is not there
# on the day it is needed.
#
# restore.sh does not USE the platform's WEB_IMAGE — the image comes from the snapshot's meta.json,
# which is the point of a restore. It needs the platform file for DB_NAME and DB_SQL_MODE.
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"
# shellcheck source=/dev/null
. "$HERE/platform/$PLATFORM.sh"

WORK="$SITE_DIR/work/restore-$TAG"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"

fetch() {
  AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  aws s3 cp --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" \
    "s3://$TRACY_MIGRATE_S3_BUCKET/$1" "$2" --only-show-errors
}
PREFIX="$SITE/snapshot/$TAG"

# ── 1. get everything first, change nothing yet ─────────────────────────────────────────
echo "==> fetching snapshot $TAG"
fetch "$PREFIX/meta.json"   "$WORK/meta.json"
fetch "$PREFIX/db.sql.gz"   "$WORK/db.sql.gz"
fetch "$PREFIX/webroot.tar" "$WORK/webroot.tar"

# Read before writing, so a snapshot missing the image is refused while the site is still whole.
WEB_IMAGE_SAVED="$(python3 -c '
import json, sys
meta = json.load(open(sys.argv[1]))
image = meta.get("web_image")
if not image:
    sys.exit("snapshot metadata carries no web_image; refusing to guess")
print(image)' "$WORK/meta.json")"

# An archive that arrived truncated is not a way back. Better to find out now than after the
# live database has been dropped for it.
gzip -t "$WORK/db.sql.gz"
tar -tf "$WORK/webroot.tar" >/dev/null

DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"
[ -n "$DB_PASSWORD" ] || { echo "no DB_PASSWORD in $SITE_DIR/.env" >&2; exit 1; }

# A database that will take the dump, asked for while the site is still whole. It used to be started
# only at step 5, after the web container was stopped, the webroot swapped and the image changed, so a
# database that never came up (a password the volume does not know, a server that will not start)
# left a half-restored site serving nothing. Now that refusal comes here, with the site exactly as it
# was. The server that stays up, not one that merely answers: migrate-site-from-host.sh brings this
# database up on a NEW volume, whose first boot answers from a temporary server and then stops it
# (lib/db-ready.sh, measured 05/10/2026). Step 5 asks again before the DROP.
echo "==> checking the database"
( cd "$SITE_DIR" && docker compose start db ) >/dev/null 2>&1 || true
# shellcheck source=../lib/db-ready.sh
. "$HERE/../lib/db-ready.sh"
tracy_db_wait_ready "$SITE_DIR" "$DB_PASSWORD" || exit 1

echo "==> restoring $LABEL to $TAG (image $WEB_IMAGE_SAVED)"

# ── 2. stop serving ─────────────────────────────────────────────────────────────────────
# Half a webroot and half a database, served to whoever is looking, is worse than a site that
# is plainly down for a minute.
( cd "$SITE_DIR" && docker compose stop web ) >/dev/null 2>&1 || true

# ── 3. the files, replaced INSIDE the directory rather than swapped ─────────────────────
# Unpack beside the live tree, then move the CONTENTS across. Extracting over the top would leave
# any file the snapshot does not carry, which is how a rolled-back site keeps the new version's
# leftovers and fails in ways nobody can reproduce.
#
# 🔒 THE DIRECTORY ITSELF IS NEVER RENAMED, and that is the whole point. Since Plan 3 Task 2 the
# webroot is tracy_webroot_dir() — the live bind mount into the running <label>-web-1. Renaming a
# mount point out from under a container does not move the container: it keeps serving the OLD,
# now-unlinked inode. The restore reports success, the site serves pre-restore content, and
# nothing says so until somebody restarts the stack. So only what is INSIDE the mount point moves.
#
# The old copy still survives until the new one is in place: the archive is extracted COMPLETELY
# into .restoring first, and the live contents move aside to .previous only after that succeeded.
# Both staging directories are siblings of the webroot, so each move is a rename on one filesystem.
# If this run dies between the two moves, the webroot is empty and the site is intact in
# .previous — recover by moving it back, before running another restore (the next one clears it).
move_contents() { # source_dir target_dir — everything inside, dotfiles included, directory intact
  local src="$1" dst="$2"
  # A subshell so `dotglob` cannot leak into the rest of the script. `dotglob` because a webroot's
  # most important files start with a dot (.htaccess); `nullglob` plus the count test so an empty
  # source is a no-op instead of handing `mv` a literal `*`.
  ( shopt -s dotglob nullglob
    set -- "$src"/*
    [ "$#" -eq 0 ] || mv "$@" "$dst/" )
}

WEBROOT_DIR="$(tracy_webroot_dir "$LABEL")"
STAGING="$WEBROOT_DIR.restoring"
PREVIOUS="$WEBROOT_DIR.previous"
rm -rf "$STAGING" "$PREVIOUS"
mkdir -p "$STAGING" "$PREVIOUS" "$WEBROOT_DIR"
# -m for the reason provision.sh gives: a webroot restored at mtime 0 is one OPcache never caches.
tar -xmf "$WORK/webroot.tar" -C "$STAGING"
move_contents "$WEBROOT_DIR" "$PREVIOUS"
move_contents "$STAGING" "$WEBROOT_DIR"
rm -rf "$STAGING" "$PREVIOUS"

# ── 4. the runtime the snapshot was taken under ─────────────────────────────────────────
if [ -n "$WEB_IMAGE_SAVED" ]; then
  "$HERE/set-web-image.sh" --label "$LABEL" --root "$ROOT" --image "$WEB_IMAGE_SAVED"
fi

# ── 5. the database, replaced whole ─────────────────────────────────────────────────────
# Dropped and recreated rather than imported over: an import over a live schema leaves every
# table the snapshot does not mention, and after a Joomla major upgrade that is a long list.
echo "==> replacing database"
( cd "$SITE_DIR" && docker compose start db ) >/dev/null 2>&1 || true
# Asked again (step 1 already did, before anything was touched): the server may have gone in the
# meantime, and the DROP below must not meet a database that is not there. Stopping here, with the
# reason, beats a DROP that fails — the old loop gave up silently and went on to it.
tracy_db_wait_ready "$SITE_DIR" "$DB_PASSWORD" || exit 1
( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" \
    -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\`;" )
gunzip -c "$WORK/db.sql.gz" \
  | ( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" \
      --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$DB_NAME" )

# ── 6. serve again ──────────────────────────────────────────────────────────────────────
( cd "$SITE_DIR" && docker compose up -d )
# A restored site gets a new access key (P0 contract): whatever the snapshot's era could read of the
# old one vouches for nothing now. The key directory is mounted, so the running site sees it at once.
if [ -f "$ROOT/.site-access/$LABEL/key.json" ]; then
  TRACY_PRIVATE_ROOT="$ROOT" bash "$HERE/../tools/issue-site-access-key.sh" --rotate "$LABEL"
  # Same mount, same container: a site that was ready stays ready under the new kid.
  ready="$ROOT/.site-access/$LABEL/ready.json"
  if [ -f "$ready" ]; then
    python3 - "$ROOT/.site-access/$LABEL/key.json" "$ready" <<'PYEOF'
import json, sys
kid = json.load(open(sys.argv[1]))['kid']
doc = json.load(open(sys.argv[2])); doc['kid'] = kid
open(sys.argv[2], 'w').write(json.dumps(doc) + '\n')
PYEOF
  fi
fi
# The snapshot's webroot may carry an older access plugin than the site ran. Both tools touch the site
# only if it is ready and listed or born strict (strict.json), so a held site keeps what it has.
for resync in resync-joomla-access-plugin.sh resync-access-plugin.sh; do
  TRACY_PRIVATE_ROOT="$ROOT" bash "$HERE/../tools/$resync" "$LABEL" \
    || echo "!! $resync did not finish for $LABEL — run it again on the host" >&2
done
echo "==> restored $LABEL to $TAG"
