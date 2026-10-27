#!/usr/bin/env bash
#
# prove-restore — the run that closes ticket 01, as one command.
#
# snapshot.sh and restore.sh are written and tested, but nothing has put them in front of a
# real clone, and the acceptance criterion for them is not "the tests pass". It is:
#
#   break a clone three different ways, put it back each time, and know how long that takes
#   on the largest database we have.
#
# The timing is not decoration. A hop takes a snapshot before it starts, so the number this
# prints is paid on every hop of every upgrade: three times for a Joomla 3 site. If it is
# fifteen minutes, the chain is a different product from the one we think we are building.
#
# THIS DELIBERATELY BREAKS THE CLONE IT IS POINTED AT. It takes a snapshot first and puts the
# site back, but a run that dies halfway leaves it broken, so point it at a clone you are
# willing to lose. It refuses to start without the flag that says so.
#
# Usage, on the fleet host:
#   tools/prove-restore.sh --site joomlart.com --label joomlart-com --i-will-break-this-clone
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
# Sourced before the defaults below: TRACY_PRIVATE_ROOT is where a site's private half lives (.env,
# work/, compose.yml) and tracy_webroot_dir() is where its SERVED files live — two roots since Plan
# 3 Task 2, and lib/roots.sh is the only place that split is named.
. "$HERE/../lib/roots.sh"

SITE=""; LABEL=""; ROOT="$TRACY_PRIVATE_ROOT"; CONSENT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --i-will-break-this-clone) CONSENT=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SITE" ] && [ -n "$LABEL" ] || { echo "need --site and --label" >&2; exit 2; }
[ -n "$CONSENT" ] || {
  echo "this breaks the clone on purpose; pass --i-will-break-this-clone" >&2; exit 2; }

# `$HERE` is provision/ itself — this script sits next to what it verifies, no longer in tools/.
P="$HERE"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no site at $SITE_DIR" >&2; exit 1; }

TAG="prove-$(date -u +%Y%m%dT%H%M%SZ)"
say() { printf '\n=== %s\n' "$1"; }
secs() { local s=$1 e=$2; echo $(( e - s )); }

DB_SIZE="$(du -sh "$SITE_DIR" 2>/dev/null | cut -f1 || echo '?')"
say "clone $LABEL, on disk $DB_SIZE"

# ── 1. snapshot, timed ──────────────────────────────────────────────────────────────────
say "1/5  snapshot"
t0=$(date +%s); "$P/snapshot.sh" --site "$SITE" --label "$LABEL" --root "$ROOT" --tag "$TAG"; t1=$(date +%s)
SNAP_SECS=$(secs "$t0" "$t1")

VERSION="$( ( cd "$SITE_DIR" && docker compose exec -T web sh -c \
  'cd /var/www/html && php -r "\$x=@simplexml_load_file(\"administrator/manifests/files/joomla.xml\"); echo \$x?(string)\$x->version:\"\";"' ) 2>/dev/null | tr -d '\r\n ' )"
LINE="$(printf '%s' "$VERSION" | cut -d. -f1,2)"
say "site reports Joomla ${VERSION:-unknown}"

# ── 2. break it: files ──────────────────────────────────────────────────────────────────
say "2/5  removing webroot/libraries"
rm -rf "$(tracy_webroot_dir "$LABEL")/libraries"
# Restart the web container before asking. Removing files under a running Apache does not
# break the site: opcache holds the compiled PHP and the process keeps open handles to files
# that no longer exist, so the site serves 200 from memory until it is restarted. Asking
# without the restart tests nothing, and reads "still up" as "the break did not take". The
# restart makes the missing tree real, which is the state a half-failed hop actually leaves.
( cd "$SITE_DIR" && docker compose restart web >/dev/null 2>&1 ) || true
BROKEN_HOME="$( "$P/verify.sh" --label "$LABEL" --root "$ROOT" --expect "$LINE" --json 2>/dev/null | grep -c '"passed": false' || true )"
[ "$BROKEN_HOME" = "1" ] && echo "    verify correctly says FAIL" || echo "    !! verify did not notice the break"

# ── 3. restore, timed ───────────────────────────────────────────────────────────────────
say "3/5  restore"
t0=$(date +%s); "$P/restore.sh" --site "$SITE" --label "$LABEL" --root "$ROOT" --tag "$TAG"; t1=$(date +%s)
RESTORE_SECS=$(secs "$t0" "$t1")
sleep 5
"$P/verify.sh" --label "$LABEL" --root "$ROOT" --expect "$LINE" || {
  echo "!! the site did not come back; STOP and read the snapshot in R2 under $SITE/snapshot/$TAG" >&2
  exit 1; }

# ── 4. break it: database ───────────────────────────────────────────────────────────────
say "4/5  dropping a table, then restoring again"
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" | sed -n 1p)"
PREFIX="$( ( cd "$SITE_DIR" && docker compose exec -T web sh -c \
  'cd /var/www/html && php -r "include \"configuration.php\"; \$c=new JConfig(); echo \$c->dbprefix;"' ) 2>/dev/null | tr -d '\r\n ' )"
( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" joomla \
    -e "DROP TABLE IF EXISTS \`${PREFIX}extensions\`" ) || true
t0=$(date +%s); "$P/restore.sh" --site "$SITE" --label "$LABEL" --root "$ROOT" --tag "$TAG"; t1=$(date +%s)
RESTORE2_SECS=$(secs "$t0" "$t1")
sleep 5
"$P/verify.sh" --label "$LABEL" --root "$ROOT" --expect "$LINE" || {
  echo "!! the database did not come back" >&2; exit 1; }

# ── 5. twice in a row is the same ───────────────────────────────────────────────────────
say "5/5  restoring again with nothing broken"
"$P/restore.sh" --site "$SITE" --label "$LABEL" --root "$ROOT" --tag "$TAG" >/dev/null
sleep 5
"$P/verify.sh" --label "$LABEL" --root "$ROOT" --expect "$LINE" || {
  echo "!! restoring a healthy site broke it" >&2; exit 1; }

cat <<REPORT

=== ticket 01, measured on $LABEL ===
  on disk                 $DB_SIZE
  joomla                  ${VERSION:-unknown}
  snapshot                ${SNAP_SECS}s
  restore after file loss ${RESTORE_SECS}s
  restore after table loss ${RESTORE2_SECS}s
  restore is idempotent   yes

A hop pays the snapshot number once, so a Joomla 3 site pays it three times.
Put these into 08-J6-Upgrade/issues/04 before building the hop.

The snapshot is still in R2 at $SITE/snapshot/$TAG; prune-snapshots.sh will not
touch it while it is the newest.
REPORT
