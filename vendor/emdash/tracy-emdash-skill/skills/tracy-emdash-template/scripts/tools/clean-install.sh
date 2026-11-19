#!/usr/bin/env bash
# Stand up a SECOND, independent site from this template's source in a NEW directory: copy the
# source (no runtime state), install from the lockfile, build, start, bootstrap.
#
#   tools/clean-install.sh <target-dir> <port>
#
# Preflight -- before anything is written:
#   • target must not exist, or be an empty directory (never a symlink); no resume into a used dir
#   • target must not be the source, inside the source, or an ancestor of it
#   • target must not sit inside another site/package (an ancestor with astro.config.mjs,
#     package.json or data/data.db) -- a typo would otherwise land a site in someone's tree
#   • the port must be free (a stale listener would answer for the new build: measured once)
# The copy never uses --delete: a fresh directory needs no deletion, and a used one is refused.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd -P)"
DEST_ARG="${1:?target dir}"
PORT="${2:-4361}"
die() { echo "!! $*" >&2; exit 1; }

# ── preflight ────────────────────────────────────────────────────────────────────────────────
[[ "$PORT" =~ ^[0-9]+$ ]] || die "port must be a number, got '$PORT'"
if [ -L "$DEST_ARG" ]; then die "target $DEST_ARG is a symlink; refusing"; fi
if [ -e "$DEST_ARG" ]; then
  [ -d "$DEST_ARG" ] || die "target $DEST_ARG exists and is not a directory"
  [ -z "$(ls -A "$DEST_ARG")" ] || die "target $DEST_ARG is not empty; clean-install only fills a new or empty directory (it never deletes)"
  DEST="$(cd "$DEST_ARG" && pwd -P)"
else
  parent="$(dirname "$DEST_ARG")"
  [ -d "$parent" ] || die "parent directory $parent does not exist"
  DEST="$(cd "$parent" && pwd -P)/$(basename "$DEST_ARG")"
fi
case "$DEST" in
  "$SRC") die "target is the source directory" ;;
  "$SRC"/*) die "target $DEST is inside the source $SRC" ;;
esac
case "$SRC" in
  "$DEST"/*) die "target $DEST is an ancestor of the source $SRC" ;;
esac
p="$(dirname "$DEST")"
while [ "$p" != "/" ] && [ -n "$p" ]; do
  for marker in astro.config.mjs package.json data/data.db; do
    [ -e "$p/$marker" ] && die "target is inside another project/site ($p has $marker); pick a directory of its own"
  done
  p="$(dirname "$p")"
done
if lsof -ti "tcp:$PORT" >/dev/null 2>&1; then
  die "port $PORT is already in use (pid $(lsof -ti "tcp:$PORT" | tr '\n' ' ')); stop it or pick another port"
fi
for tool in rsync pnpm node lsof; do command -v "$tool" >/dev/null || die "$tool not found"; done
echo "==> preflight ok: $SRC -> $DEST on :$PORT"

# ── mutation (only from here on) ─────────────────────────────────────────────────────────────
mkdir -p "$DEST"
echo "==> copying source (no node_modules/data/uploads/dist/.astro/evidence/backups/env/tokens)"
rsync -a \
  --exclude node_modules --exclude data --exclude uploads --exclude dist --exclude .astro --exclude evidence --exclude backups \
  --include '.env.example' --exclude '.env' --exclude '.env.*' --exclude '*.token' \
  --exclude '*.before-restore-*' --exclude '*.log' --exclude .git \
  "$SRC/" "$DEST/"
cd "$DEST"
# The whole output of each step stays in the target (install.log, build.log); the terminal shows its end, and a
# failure shows the last 40 lines and how to go on (second independent review of JA Restaurant 1.0.3: a build that
# failed on a font download showed only a stack tail, and the used target then refused a rerun).
step_failed() {
  tail -n 40 "$DEST/$2"
  die "$1 failed (whole log: $DEST/$2). The target now holds this copy: finish it in place (cd $DEST && $3, then start the server and run tools/bootstrap-site.sh as the README's built steps say), or remove $DEST and run clean-install again"
}
echo "==> pnpm install --frozen-lockfile (log: $DEST/install.log)"
pnpm install --frozen-lockfile --reporter=append-only > install.log 2>&1 || step_failed "pnpm install" install.log "pnpm install --frozen-lockfile"
tail -n 3 install.log
echo "==> astro build (log: $DEST/build.log; the build downloads the web fonts, so it needs network access)"
pnpm exec astro build > build.log 2>&1 || step_failed "astro build" build.log "pnpm exec astro build"
tail -n 5 build.log
mkdir -p data uploads
echo "==> starting on :$PORT (log: $DEST/server.log)"
# EmDash 1.0 refuses production setup without a site URL (SITE_URL_REQUIRED); the fleet sets one.
(HOST=127.0.0.1 PORT="$PORT" EMDASH_SITE_URL="${EMDASH_SITE_URL:-http://127.0.0.1:$PORT}" \
  nohup node ./dist/server/entry.mjs > server.log 2>&1 &)
sleep 3
tools/bootstrap-site.sh "http://127.0.0.1:$PORT" ./data
echo "==> clean site ready at http://127.0.0.1:$PORT"
