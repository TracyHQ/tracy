#!/usr/bin/env bash
#
# fold — move one template demo into this host's demo farm, keeping every name the rest of Tracy
# dials (lib/demo-farm.sh says what the farm is and why).
#
#   fold.sh <label> [--root DIR] [--probe-host NAME]
#
# Only a DEMO (its lean marker, `apache/tracy-demo-limits.conf`, is there) on joomla or wordpress.
# A customer site, an EmDash site, or a label without the marker is refused before anything is read.
#
# The steps, and what holds if one fails:
#
#   0. the webroot holds no symlink leading out of it (Apache in the farm would follow it into
#      another demo's files) — refused, before anything is changed
#   1. the farm is up (tracy-demos-web, tracy-demos-db), and the demo's answers today are recorded:
#      `/` (a 200 with a title) and two pages it links to, through 127.0.0.1:<HOST_PORT>
#   2. its configuration is read while it serves; a new schema of the farm and a user granted on that
#      schema only are made
#   3. its vhost and pool are written, both configs are tested in a throwaway farm container, and
#      the farm takes them (re-created when its mounts change, otherwise a graceful reload) — files
#      only, no traffic yet
#   4. its own web container — the only writer — is STOPPED (no write can land after the dump), and
#      its database is dumped from `<label>-db-1` (tables, routines, triggers, events) into the farm
#      schema as the demo's user and compared table by table and object by object
#   5. its CMS config is pointed at the farm database and .htaccess php_value/php_flag lines become
#      .user.ini settings (farm-site.php, run as the demo inside the farm)
#   6. the farm answers the same pages the same way (code, redirect, <title>)
#   7. the switch: the compose becomes the forwarder (render-compose.sh), `up -d --remove-orphans`
#      (the db container goes, its volume stays), and the same pages answer the same way again; the
#      seconds the demo had no server (4 to here) are said
#   8. the marker `<private>/<label>/runtime` = farm
#
# A failure anywhere before 8 puts the demo back exactly as it was (config, .htaccess, compose, its
# web container started again) and takes it out of the farm again; the farm's other demos are touched
# only by the farm's reload or re-create. Run again after a failure, or after success (then it says so and changes nothing).
#
# Locks: the site's lifecycle lock (lib/site-lifecycle.sh, the one go-live/teardown hold) and the
# host's farm lock (one farm change at a time, farm-common.sh).
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
[ -n "$LABEL" ] || { echo "use: fold.sh <label> [--root DIR] [--probe-host NAME]" >&2; exit 2; }
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
  *) echo "!! $LABEL is ${PLATFORM:-of no recorded platform} — only Joomla and WordPress demos fold" >&2; exit 2 ;;
esac
tracy_is_demo_site "$SITE_DIR" || {
  echo "!! $LABEL is not a demo (no $TRACY_DEMO_LIMITS_CONF) — only template demos fold" >&2; exit 2; }

RUNTIME="$(tracy_site_runtime "$LABEL")"
if [ "$RUNTIME" = farm ]; then
  echo "==> $LABEL is already served by the demo farm — nothing to do"
  exit 0
fi

farm_lock

COMPOSE="$SITE_DIR/docker-compose.yml"
HOST_PORT="$(site_env_get HOST_PORT)"
[[ "$HOST_PORT" =~ ^[1-9][0-9]*$ ]] || { echo "!! $LABEL has no HOST_PORT in its .env" >&2; exit 1; }
export HOST_PORT
KEPT="$SITE_DIR/$TRACY_FARM_KEPT_COMPOSE"

# The switch happened and only the marker is missing (a run cut short after step 6): finish it.
if grep -q '^ *tracy.runtime: farm' "$COMPOSE" 2>/dev/null; then
  [ -f "$KEPT" ] && [ -f "$(tracy_demos_dir)/fpm/$LABEL.conf" ] || {
    echo "!! $LABEL runs a forwarder but its farm entry or kept compose is missing — see unfold.sh" >&2; exit 1; }
  printf 'farm\n' > "$SITE_DIR/.runtime.new" && mv "$SITE_DIR/.runtime.new" "$(tracy_site_runtime_file "$LABEL")"
  echo "==> $LABEL was already switched to the farm; marker written"
  exit 0
fi

DB_NAME="$(sed -n 's/^ *MARIADB_DATABASE: *//p' "$COMPOSE" | tr -d '"' | sed -n 1p)"
DB_PASSWORD="$(site_env_get DB_PASSWORD)"
[ -n "$DB_NAME" ] && [ -n "$DB_PASSWORD" ] || { echo "!! $LABEL: no database name or password on record" >&2; exit 1; }
for c in "$LABEL-web-1" "$LABEL-db-1"; do
  [ "$(docker inspect -f '{{.State.Running}}' "$c" 2>/dev/null)" = true ] || {
    echo "!! $c is not running — a demo is folded from its running pair" >&2; exit 1; }
done

# 🔒 NO LINK OUT OF THE WEBROOT. In the farm every folded demo's webroot is mounted in one Apache,
# readable by its one user, and Apache follows symlinks (FollowSymLinks: the rewrite rules of every
# CMS .htaccess need it) without PHP's open_basedir — so a link in this webroot to another demo's
# file, named `x.txt`, would be served by Apache as this demo's. The farm's pools cannot make a link
# (disable_functions: symlink, link and the exec family, lib/demo-farm.sh); a link shipped before
# the fold is refused here, by path, before anything is changed — judged by where each link ENDS,
# followed link by link as the kernel would (farm_links.py: a chain whose targets each look harmless
# can still end in another demo; a dangling link or a loop counts as bad). A link that ends inside the
# webroot (or names it by the per-site docroot /var/www/html) is fine.
WEBROOT_DIR="$(tracy_webroot_dir "$LABEL")"
OUT_LINKS="$(python3 "$HERE/farm_links.py" "$WEBROOT_DIR" "$LABEL")" || { echo "!! the links in $WEBROOT_DIR could not be read — nothing was changed" >&2; exit 1; }
if [ -n "$OUT_LINKS" ]; then
  echo "!! $LABEL's webroot holds links that lead out of it — in the farm Apache would serve what they point at; nothing was changed:" >&2
  printf '%s\n' "$OUT_LINKS" | sed 's/^/   /' >&2
  echo "!! remove them (or make them copies) and fold again" >&2
  exit 2
fi

IDENT="$(tracy_farm_db_ident "$LABEL")"
FARM_DB_PASSWORD="$(site_env_get FARM_DB_PASSWORD)"
[ -n "$FARM_DB_PASSWORD" ] || FARM_DB_PASSWORD="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32)"

# ── rollback: everything below that changed something says so here ──────────────────────────────
DONE=0; STEP="start"
CHANGED_ENV=0; CHANGED_SCHEMA=0; CHANGED_CONFIG=0; CHANGED_HTACCESS=0
CHANGED_MEMBER=0; CHANGED_SWITCH=0; MADE_FARM_DIR=0; WEB_STOPPED=0
rollback() {
  local rc=$?
  [ "$DONE" = 1 ] && return 0
  set +e
  echo "!! fold of $LABEL failed at: $STEP — putting it back as it was" >&2
  if [ "$CHANGED_SWITCH" = 1 ]; then
    cp "$KEPT" "$COMPOSE"
    ( cd "$SITE_DIR" && docker compose up -d --remove-orphans ) >&2
    for _ in $(seq 1 60); do
      [ "$(docker inspect -f '{{.State.Running}}' "$LABEL-web-1" 2>/dev/null)" = true ] && break; sleep 1
    done
    WEB_STOPPED=0
  fi
  # Config and .htaccess back FIRST, from inside the farm while it still mounts the demo (its own
  # container is stopped): when that container starts again it reads its own settings at once.
  if [ "$CHANGED_CONFIG" = 1 ] || [ "$CHANGED_HTACCESS" = 1 ]; then
    if [ "$WEB_STOPPED" = 1 ] && [ "$CHANGED_MEMBER" = 1 ]; then
      [ "$CHANGED_CONFIG" = 1 ] && restore_config farm >&2
      [ "$CHANGED_HTACCESS" = 1 ] && farm_member_php -- htaccess-unfarm >&2
    else
      [ "$CHANGED_CONFIG" = 1 ] && restore_config site >&2
      [ "$CHANGED_HTACCESS" = 1 ] && tracy_site_web_exec "$LABEL" -i -- php -- htaccess-unfarm < "$HERE/farm-site.php" >&2
    fi
  fi
  if [ "$WEB_STOPPED" = 1 ]; then
    docker start "$LABEL-web-1" >/dev/null
    echo "!! $LABEL-web-1 serves again ($(( $(date +%s) - STOPPED_AT )) s without it)" >&2
  fi
  if [ "$CHANGED_MEMBER" = 1 ]; then
    farm_member_remove
    farm_render && farm_apply >/dev/null
  fi
  if [ "$CHANGED_SCHEMA" = 1 ]; then
    farm_root_sql -e "DROP DATABASE IF EXISTS \`$IDENT\`; DROP USER IF EXISTS '$IDENT'@'%';" >&2
  fi
  if [ "$CHANGED_ENV" = 1 ]; then
    site_env_set FARM_DB_NAME; site_env_set FARM_DB_USER; site_env_set FARM_DB_PASSWORD
  fi
  [ "$MADE_FARM_DIR" = 1 ] && rm -rf "$SITE_DIR/farm"
  echo "!! $LABEL is back on its own containers; nothing of it is left in the farm" >&2
  exit "$rc"
}
trap rollback EXIT

# The demo's original settings, as FARM_SET_ lines config-set reads (origin.env, step 2).
origin_env() { sed -n 's/^\([A-Za-z_]*\)=/\1=/p' "$SITE_DIR/farm/origin.env"; }
restore_config() { # farm|site — where the php runs
  local args=() line
  while IFS= read -r line; do args+=(-e "FARM_SET_$line"); done < <(origin_env)
  if [ "$1" = farm ]; then farm_member_php "${args[@]}" -- config-set "$PLATFORM"
  else tracy_site_web_exec "$LABEL" -i "${args[@]}" -- php -- config-set "$PLATFORM" < "$HERE/farm-site.php"; fi
}
# Routines, triggers and events of a schema, counted by kind (what the copy must carry besides tables).
OBJECTS_SQL="SELECT CONCAT('routines ', (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()), ' triggers ', (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()), ' events ', (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()))"
TABLES_SQL="SELECT CONCAT(table_name, ' ', table_rows IS NOT NULL) FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name"
farm_user_sql() { MYSQL_PWD="$FARM_DB_PASSWORD" docker exec -i -e MYSQL_PWD "$TRACY_DEMOS_DB_CONTAINER" mariadb "-u$IDENT" "$@"; }

# ── 1. the farm, and what the demo answers today ────────────────────────────────────────────────
STEP="starting the demo farm"
echo "==> $LABEL ($PLATFORM, port $HOST_PORT) → the demo farm"
farm_ensure_files
farm_render
farm_apply
farm_wait_db

STEP="recording what $LABEL answers today"
PROBE_HOST="$(farm_probe_host)"
echo "==> probing as $PROBE_HOST"
farm_baseline site

# ── 2. what the demo is configured with, read while it serves ──────────────────────────────────
STEP="reading $LABEL's configuration"
[ -d "$SITE_DIR/farm" ] || { mkdir -m 700 "$SITE_DIR/farm"; MADE_FARM_DIR=1; }
ORIGIN="$(tracy_site_web_exec "$LABEL" -i -- php -- config-get "$PLATFORM" < "$HERE/farm-site.php")"
FORM="$(printf '%s\n' "$ORIGIN" | sed -n 's/^form=//p')"
( umask 077; printf '%s\n' "$ORIGIN" | grep -v '^form=' > "$SITE_DIR/farm/origin.env" )
{
  printf 'PLATFORM=%s\nDB_NAME=%s\nFORM=%s\n' "$PLATFORM" "$DB_NAME" "${FORM:-literal}"
} > "$SITE_DIR/farm/meta.env"
CHARSET="$(tracy_site_db_exec "$LABEL" mariadb -N -B -e \
  "SELECT CONCAT(DEFAULT_CHARACTER_SET_NAME, ' ', DEFAULT_COLLATION_NAME) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '$DB_NAME'")"
read -r CS COLL <<<"$CHARSET"
[[ "$CS$COLL" =~ ^[A-Za-z0-9_]+$ ]] || { echo "!! cannot read the character set of $DB_NAME" >&2; exit 1; }

# The pool's own additions: a WordPress whose wp-config.php reads WORDPRESS_* at runtime gets them
# from the pool, with the farm's database — and the rest of what its compose gave the container.
: > "$SITE_DIR/farm/pool.env"
if [ "$FORM" = env ]; then
  sed -n 's/^ *\(WORDPRESS_[A-Z_]*\): *"\{0,1\}\([^"]*\)"\{0,1\} *$/\1=\2/p' "$COMPOSE" \
    | grep -v '^WORDPRESS_DB_\(HOST\|USER\|PASSWORD\|NAME\)=' > "$SITE_DIR/farm/pool.env" || true
  printf 'WORDPRESS_DB_HOST=%s\nWORDPRESS_DB_USER=%s\nWORDPRESS_DB_PASSWORD=%s\nWORDPRESS_DB_NAME=%s\n' \
    "$TRACY_DEMOS_DB_HOST" "$IDENT" "$FARM_DB_PASSWORD" "$IDENT" >> "$SITE_DIR/farm/pool.env"
  chmod 600 "$SITE_DIR/farm/pool.env"
fi

# The schema and its user, empty: granted on that schema only — everything a dump of a CMS can
# carry there (tables, views, routines, triggers, events), nothing beyond it.
STEP="making $LABEL's farm schema"
CHANGED_SCHEMA=1
farm_root_sql <<SQL
DROP DATABASE IF EXISTS \`$IDENT\`;
CREATE DATABASE \`$IDENT\` CHARACTER SET $CS COLLATE $COLL;
CREATE USER IF NOT EXISTS '$IDENT'@'%' IDENTIFIED BY '$FARM_DB_PASSWORD';
ALTER USER '$IDENT'@'%' IDENTIFIED BY '$FARM_DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$IDENT\`.* TO '$IDENT'@'%';
FLUSH PRIVILEGES;
SQL
CHANGED_ENV=1
site_env_set FARM_DB_NAME "$IDENT"
site_env_set FARM_DB_USER "$IDENT"
site_env_set FARM_DB_PASSWORD "$FARM_DB_PASSWORD"

# ── 3. the farm takes the demo's files (not yet its traffic) ────────────────────────────────────
STEP="adding $LABEL to the farm"
CHANGED_MEMBER=1
farm_member_write
farm_render
farm_config_test
farm_apply

# ── 4. no write is lost: the demo stops serving, then its database is copied ───────────────────
# 🔒 STOPPED BEFORE THE DUMP. A write that lands between the dump and the switch would exist only in
# the database left behind. So the demo's own web container — the only writer — is stopped (its
# database keeps running) and stays stopped until the forwarder takes its port: the blip is the copy,
# the config rewrite, the farm check and the switch, measured and said below. Any failure before the
# switch starts it again with its own settings (rollback).
STEP="stopping $LABEL-web-1 for the copy"
STOPPED_AT="$(date +%s)"
WEB_STOPPED=1
docker stop -t 10 "$LABEL-web-1" >/dev/null

STEP="copying the database"
# Imported AS the demo's own user (its grants are the whole of what the dump may do); definers are
# dropped (farm_strip_definers). Routines, triggers AND events go with the tables.
tracy_site_db_exec "$LABEL" mariadb-dump --single-transaction --quick --hex-blob --routines --triggers --events \
    --default-character-set=utf8mb4 --max-allowed-packet=256M "$DB_NAME" \
  | farm_strip_definers \
  | farm_user_sql --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$IDENT"
WANT="$(tracy_site_db_exec "$LABEL" mariadb -N -B -e "$TABLES_SQL; $OBJECTS_SQL" "$DB_NAME")"
GOT="$(farm_user_sql -N -B -e "$TABLES_SQL; $OBJECTS_SQL" "$IDENT")"
[ "$WANT" = "$GOT" ] || { echo "!! the farm copy of $DB_NAME does not have the same tables, routines, triggers and events" >&2; exit 1; }
echo "==> database copied: $(printf '%s\n' "$WANT" | sed '$d' | grep -c '[01]$') tables, $(printf '%s\n' "$WANT" | tail -n 1) in farm schema $IDENT"

# ── 5. the CMS config, and .htaccess — rewritten from inside the farm ──────────────────────────
STEP="pointing the CMS at the farm database"
if [ "$FORM" != env ]; then
  set_args=()
  if [ "$PLATFORM" = joomla ]; then
    set_args+=(-e "FARM_SET_host=$TRACY_DEMOS_DB_HOST" -e "FARM_SET_user=$IDENT" -e "FARM_SET_password=$FARM_DB_PASSWORD" -e "FARM_SET_db=$IDENT")
    # Its log and tmp folders, where they name the per-site container's docroot: the farm's docroot
    # path is mounted in the per-site container too (render-compose.sh), so both runtimes can write.
    for key in log_path tmp_path; do
      value="$(sed -n "s/^$key=//p" "$SITE_DIR/farm/origin.env")"
      case "$value" in
        /var/www/html|/var/www/html/*) set_args+=(-e "FARM_SET_$key=$(tracy_farm_docroot "$LABEL")${value#/var/www/html}") ;;
      esac
    done
  else
    set_args+=(-e "FARM_SET_DB_HOST=$TRACY_DEMOS_DB_HOST" -e "FARM_SET_DB_USER=$IDENT" -e "FARM_SET_DB_PASSWORD=$FARM_DB_PASSWORD" -e "FARM_SET_DB_NAME=$IDENT")
  fi
  CHANGED_CONFIG=1
  farm_member_php "${set_args[@]}" -- config-set "$PLATFORM"
fi
CHANGED_HTACCESS=1
farm_member_php -- htaccess-farm
docker exec "$TRACY_DEMOS_WEB_CONTAINER" tracy-demos-reload >/dev/null

# ── 6. the farm answers as the demo did ─────────────────────────────────────────────────────────
STEP="checking the farm answers as $LABEL did"
farm_verify farm
echo "==> the farm answers $(printf '%s' "$BASELINE" | grep -c .) pages of $LABEL exactly as its own container did"

# ── 7. the switch ───────────────────────────────────────────────────────────────────────────────
STEP="switching $LABEL to its forwarder"
cp "$COMPOSE" "$KEPT"
tracy_read_existing_compose
WEB_IMAGE="${CURRENT_WEB_IMAGE:?}"
CHANGED_SWITCH=1
TRACY_COMPOSE_RUNTIME=farm tracy_render_compose
( cd "$SITE_DIR" && docker compose up -d --remove-orphans ) >&2
farm_verify site
echo "==> $LABEL was without a server for $(( $(date +%s) - STOPPED_AT )) s (copy, config, check, switch)"

# ── 8. the marker ───────────────────────────────────────────────────────────────────────────────
STEP="writing the runtime marker"
printf 'farm\n' > "$SITE_DIR/.runtime.new"
mv "$SITE_DIR/.runtime.new" "$(tracy_site_runtime_file "$LABEL")"
DONE=1
echo "==> $LABEL is served by the demo farm (schema $IDENT, forwarder $LABEL-web-1 → $TRACY_DEMOS_WEB_CONTAINER:$HOST_PORT)"
