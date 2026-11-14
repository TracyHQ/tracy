#!/usr/bin/env bash
#
# unfold — the exact reverse of fold.sh: a demo served by this host's demo farm goes back to its own
# `<label>-web-1` + `<label>-db-1` (lib/demo-farm.sh).
#
#   unfold.sh <label> [--root DIR] [--probe-host NAME]
#
#   1. what the demo answers through its forwarder today is recorded (the pages fold.sh compares)
#   2. its farm schema is dumped; its own database comes back up on the volume fold.sh kept (or a
#      fresh one), is emptied and loaded from that dump, and compared table by table
#   3. its CMS config gets back the values fold.sh found (origin.env). The farm is attached to the
#      demo's own network meanwhile, so `db` resolves there and the farm keeps serving it
#   4. the switch: the compose fold.sh kept comes back, `up -d --remove-orphans` (the forwarder
#      goes, the per-site web comes), the marker goes, .htaccess gets its php_value lines back,
#      and the same pages answer the same way
#   5. the farm lets go: its vhost, pool, mounts, schema and user, and the demo's FARM_* settings
#
# A failure before 4 leaves the demo in the farm exactly as it was. A run cut short after 4 is
# finished by running this again (the farm's leftovers of a label not marked `farm` are removed).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

TRACY_SCRIPT_ARGV=("$@")
LABEL=""; ROOT="$TRACY_PRIVATE_ROOT"; PROBE_HOST="${PROBE_HOST:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --probe-host) PROBE_HOST="$2"; shift 2 ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    *) [ -z "$LABEL" ] || { echo "one label at a time" >&2; exit 2; }; LABEL="$1"; shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "use: unfold.sh <label> [--root DIR] [--probe-host NAME]" >&2; exit 2; }
tracy_require_label "$LABEL"
TRACY_PRIVATE_ROOT="$ROOT"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no such site: $SITE_DIR" >&2; exit 2; }

# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"
# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"
# shellcheck source=farm-common.sh
. "$HERE/farm-common.sh"

lock_rc=0
tracy_site_lifecycle_lock "$ROOT" "$LABEL" || lock_rc=$?
if [ "$lock_rc" -eq "$TRACY_SITE_BUSY" ]; then
  echo "!! another lifecycle script of $LABEL is running — nothing was changed" >&2
  exit "$TRACY_SITE_BUSY"
elif [ "$lock_rc" -ne 0 ]; then
  exit 1
fi

PLATFORM="$(site_env_get PLATFORM)"
# An older site's .env names no platform: render-compose.sh's own reading (image, webroot) decides.
if [ -z "$PLATFORM" ]; then
  tracy_read_existing_compose
  PLATFORM="$(tracy_detect_platform 2>/dev/null || true)"
fi
case "$PLATFORM" in
  joomla|wordpress) ;;
  *) echo "!! $LABEL is ${PLATFORM:-of no recorded platform} — never in the demo farm" >&2; exit 2 ;;
esac
RUNTIME="$(tracy_site_runtime "$LABEL")"
farm_lock
farm_ensure_files

COMPOSE="$SITE_DIR/docker-compose.yml"
KEPT="$SITE_DIR/$TRACY_FARM_KEPT_COMPOSE"
FORWARDER="$SITE_DIR/farm/forwarder.compose.yml"
HOST_PORT="$(site_env_get HOST_PORT)"
export HOST_PORT
IDENT="$(site_env_get FARM_DB_NAME)"
FARM_DB_PASSWORD="$(site_env_get FARM_DB_PASSWORD)"

# The farm's part of a demo that is no longer marked `farm` (farm-common.sh, teardown shares it).
farm_let_go() { farm_release; }

if [ "$RUNTIME" = site ]; then
  if grep -q '^ *tracy.runtime: farm' "$COMPOSE" 2>/dev/null; then
    echo "!! $LABEL runs a forwarder but is not marked farm — run fold.sh $LABEL to finish its fold first" >&2
    exit 1
  fi
  if [ -f "$(tracy_demos_dir)/fpm/$LABEL.conf" ] || [ -n "$IDENT" ] || [ -d "$SITE_DIR/farm" ]; then
    farm_wait_db
    farm_let_go
    echo "==> $LABEL was already back on its own containers; the farm's leftovers of it are removed"
  else
    echo "==> $LABEL is not in the demo farm — nothing to do"
  fi
  exit 0
fi

[ -f "$KEPT" ] || { echo "!! $LABEL has no $TRACY_FARM_KEPT_COMPOSE — the compose it came from is unknown" >&2; exit 1; }
[ -f "$SITE_DIR/farm/origin.env" ] || { echo "!! $LABEL has no farm/origin.env — its own settings are unknown" >&2; exit 1; }
DB_NAME="$(sed -n 's/^ *MARIADB_DATABASE: *//p' "$KEPT" | tr -d '"' | sed -n 1p)"
DB_PASSWORD="$(site_env_get DB_PASSWORD)"
FORM="$(sed -n 's/^FORM=//p' "$SITE_DIR/farm/meta.env" 2>/dev/null)"
[ -n "$DB_NAME" ] && [ -n "$DB_PASSWORD" ] && [ -n "$IDENT" ] && [ -n "$FARM_DB_PASSWORD" ] || {
  echo "!! $LABEL: database names or passwords missing on record" >&2; exit 1; }

DONE=0; STEP="start"; CHANGED_COMPOSE=0; CHANGED_NET=0; CHANGED_CONFIG=0; SWITCHED=0; FWD_STOPPED=0; VHOST_OUT=0
rollback() {
  local rc=$?
  [ "$DONE" = 1 ] && return 0
  set +e
  echo "!! unfold of $LABEL failed at: $STEP — leaving it in the farm as it was" >&2
  if [ "$SWITCHED" = 1 ]; then
    tracy_site_web_exec "$LABEL" -i -- php -- htaccess-farm < "$HERE/farm-site.php" >&2
    printf 'farm\n' > "$SITE_DIR/.runtime.new" && mv "$SITE_DIR/.runtime.new" "$(tracy_site_runtime_file "$LABEL")"
  fi
  if [ "$CHANGED_COMPOSE" = 1 ]; then
    cp "$FORWARDER" "$COMPOSE"
    ( cd "$SITE_DIR" && docker compose up -d --remove-orphans ) >&2
  fi
  if [ "$CHANGED_CONFIG" = 1 ]; then
    local args=() line
    while IFS= read -r line; do args+=(-e "FARM_SET_$line"); done < "$SITE_DIR/farm/farmside.env"
    tracy_site_web_exec "$LABEL" -i "${args[@]}" -- php -- config-set "$PLATFORM" < "$HERE/farm-site.php" >&2
  fi
  [ "$CHANGED_NET" = 1 ] && docker network disconnect "${LABEL}_default" "$TRACY_DEMOS_WEB_CONTAINER" >/dev/null 2>&1
  [ "$VHOST_OUT" = 1 ] && farm_vhost_in
  if [ "$FWD_STOPPED" = 1 ] && [ "$CHANGED_COMPOSE" = 0 ]; then
    docker start "$LABEL-web-1" >/dev/null
    echo "!! $LABEL-web-1 forwards again ($(( $(date +%s) - STOPPED_AT )) s without it)" >&2
  fi
  rm -f "$SITE_DIR/farm/unfold.sql" "$SITE_DIR/farm/farmside.env"
  echo "!! $LABEL is still served by the demo farm" >&2
  exit "$rc"
}
trap rollback EXIT

# ── 1. what it answers today ────────────────────────────────────────────────────────────────────
STEP="recording what $LABEL answers through the farm"
echo "==> $LABEL ← the demo farm"
farm_wait_web
farm_wait_db
PROBE_HOST="$(farm_probe_host)"
echo "==> probing as $PROBE_HOST"
farm_baseline site

# ── 2. the database comes home ──────────────────────────────────────────────────────────────────
# 🔒 OUT OF THE FARM BEFORE THE DUMP. A write between the dump and the switch would stay behind in the
# farm schema, which is dropped at the end. So the demo's forwarder — its only door, the farm vhost
# answers nothing else for it — is stopped first; the farm and every other demo in it keep serving.
# It stays stopped until its own containers take the port; a failure before that starts it again.
STEP="taking $LABEL out of the farm for the copy"
STOPPED_AT="$(date +%s)"
FWD_STOPPED=1
docker stop -t 5 "$LABEL-web-1" >/dev/null
# …and a request already inside the farm finishes before the dump (farm-common.sh `farm_pool_drain`).
STEP="waiting for $LABEL's requests in the farm to finish"
VHOST_OUT=1
farm_vhost_out
farm_pool_drain
STEP="dumping the farm schema"
( umask 077
  tracy_site_db_exec "$LABEL" mariadb-dump --single-transaction --quick --hex-blob --routines --triggers --events \
    --default-character-set=utf8mb4 --max-allowed-packet=256M "$IDENT" > "$SITE_DIR/farm/unfold.sql" )
CHARSET="$(tracy_site_db_exec "$LABEL" mariadb -N -B -e \
  "SELECT CONCAT(DEFAULT_CHARACTER_SET_NAME, ' ', DEFAULT_COLLATION_NAME) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()" "$IDENT")"
read -r CS COLL <<<"$CHARSET"
[[ "$CS$COLL" =~ ^[A-Za-z0-9_]+$ ]] || { echo "!! cannot read the character set of $IDENT" >&2; exit 1; }

STEP="starting $LABEL's own database"
cp "$COMPOSE" "$FORWARDER"
CHANGED_COMPOSE=1
cp "$KEPT" "$COMPOSE"
( cd "$SITE_DIR" && docker compose up -d db ) >&2
# shellcheck source=../lib/db-ready.sh
. "$HERE/../lib/db-ready.sh"
TRACY_DB_RUNTIME=site tracy_db_wait_ready "$SITE_DIR" "$DB_PASSWORD"
STEP="loading $LABEL's own database"
own_db() { MYSQL_PWD="$DB_PASSWORD" docker exec -i -e MYSQL_PWD "$LABEL-db-1" mariadb -uroot --max-allowed-packet=256M "$@"; }
own_db -e "DROP DATABASE IF EXISTS \`$DB_NAME\`; CREATE DATABASE \`$DB_NAME\` CHARACTER SET $CS COLLATE $COLL;"
farm_strip_definers < "$SITE_DIR/farm/unfold.sql" \
  | own_db --init-command="SET FOREIGN_KEY_CHECKS=0" "$DB_NAME"
TABLES_SQL="SELECT CONCAT(table_name, ' ', table_rows IS NOT NULL) FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
OBJECTS_SQL="SELECT CONCAT('routines ', (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()), ' triggers ', (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()), ' events ', (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()))"
WANT="$(tracy_site_db_exec "$LABEL" mariadb -N -B -e "$TABLES_SQL; $OBJECTS_SQL" "$IDENT")"
GOT="$(own_db -N -B -e "$TABLES_SQL; $OBJECTS_SQL" "$DB_NAME")"
[ "$WANT" = "$GOT" ] || { echo "!! $LABEL's own database does not have the farm schema's tables, routines, triggers and events" >&2; exit 1; }
echo "==> database copied back: $(printf '%s\n' "$WANT" | grep -c '[01]$') tables, $(printf '%s\n' "$WANT" | tail -n 1) in $DB_NAME"

# ── 3. the CMS config ───────────────────────────────────────────────────────────────────────────
STEP="pointing the CMS back at its own database"
# The vhost back for the farm's own check of the demo on its own database; the forwarder stays
# stopped, so nothing from outside reaches it before the switch.
farm_vhost_in
VHOST_OUT=0
docker network connect "${LABEL}_default" "$TRACY_DEMOS_WEB_CONTAINER" 2>/dev/null && CHANGED_NET=1 || true
if [ "$FORM" != env ]; then
  ( umask 077; tracy_site_web_exec "$LABEL" -i -- php -- config-get "$PLATFORM" < "$HERE/farm-site.php" \
      | grep -v '^form=' > "$SITE_DIR/farm/farmside.env" )
  set_args=()
  while IFS= read -r line; do set_args+=(-e "FARM_SET_$line"); done < "$SITE_DIR/farm/origin.env"
  CHANGED_CONFIG=1
  tracy_site_web_exec "$LABEL" -i "${set_args[@]}" -- php -- config-set "$PLATFORM" < "$HERE/farm-site.php"
  farm_verify farm
fi

# ── 4. the switch ───────────────────────────────────────────────────────────────────────────────
STEP="switching $LABEL back to its own containers"
SWITCHED=1
( cd "$SITE_DIR" && docker compose up -d --remove-orphans ) >&2
rm -f "$(tracy_site_runtime_file "$LABEL")"
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Running}}' "$LABEL-web-1" 2>/dev/null)" = true ] && break; sleep 1
done
tracy_site_web_exec "$LABEL" -i -- php -- htaccess-unfarm < "$HERE/farm-site.php"
farm_verify site
echo "==> $LABEL was without a server for $(( $(date +%s) - STOPPED_AT )) s (copy, config, check, switch)"
DONE=1
trap - EXIT

# ── 5. the farm lets go ─────────────────────────────────────────────────────────────────────────
STEP="removing $LABEL from the farm"
farm_let_go
echo "==> $LABEL is back on $LABEL-web-1 + $LABEL-db-1; the farm holds nothing of it"
