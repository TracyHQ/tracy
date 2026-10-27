#!/usr/bin/env bash
# End-to-end test of the export package's installer.php, in Docker.
#
# For each platform it builds a Tracy-style source site (prefix tr_, the site's address pinned on
# *.tracy.site, Tracy's sign-in plugin present), dumps it with the flags site-backup.sh uses, packs
# it with export-package.py, then installs the ZIP on a plain php:X-apache with an empty MariaDB,
# driving installer.php with curl the way its page does. What it checks is listed in the report.
#
# Usage (from the repo root or anywhere):
#   packages/fleet/tracy-fleet-operation/test/e2e/export-installer/run.sh [wordpress|joomla|all] [PHP versions...]
#   default: all 8.3 8.1 7.4. The first non-7.4 version runs the full scenario (refusals, a second
#   browser, a kill after a commit), the next the time-limit one, 7.4 the age-limit one.
#   ONLY=full|cut|plain|faults|code runs one scenario on every version given; TRACE_OUT=<file> keeps the
#   time-limit scenario's import trace.
# Takes about 30 minutes for `all` on a laptop. Not part of `pnpm test`: it pulls Docker images.
# Needs: docker, curl, python3, git. Every container, volume, network and image it creates is
# labelled with the run id and removed on exit, failure included; base images it had to pull are
# removed too. Exit status 0 only when every check passed.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../../.." && pwd)"
LIB="$PKG/scripts/lib"
ACCESS="$PKG/scripts/provision/access"
RENDER_WP_CONFIG="$PKG/scripts/provision/render_wp_config.py"

WHICH="${1:-all}"
shift || true
VERSIONS=("$@")
[[ ${#VERSIONS[@]} -gt 0 ]] || VERSIONS=(8.3 8.1 7.4)

RUN="tie2e$(date +%s)$$"
LABEL="tracy-e2e=$RUN"
NET="$RUN-net"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/tracy-installer-e2e.XXXXXX")"
PULLED=()
FAILS=0
PASSES=0

BASE_IMAGES=(mariadb:11 wordpress:6-php8.3-apache wordpress:cli-php8.3 joomla:5-apache)

cleanup() {
  local rc=$?
  set +e
  docker ps -aq --filter "label=$LABEL" | xargs -r docker rm -fv >/dev/null 2>&1
  docker volume ls -q --filter "label=$LABEL" | xargs -r docker volume rm -f >/dev/null 2>&1
  docker network ls -q --filter "label=$LABEL" | xargs -r docker network rm >/dev/null 2>&1
  docker images -q --filter "label=$LABEL" | sort -u | xargs -r docker rmi -f >/dev/null 2>&1
  for image in ${PULLED[@]+"${PULLED[@]}"}; do docker rmi "$image" >/dev/null 2>&1; done
  # Files written by containers into the bind-mounted source folders belong to their users.
  chmod -R u+rwX "$WORK" 2>/dev/null
  rm -rf "$WORK"
  exit "$rc"
}
trap cleanup EXIT INT TERM

say() { printf '\n==> %s\n' "$*"; }
pass() { PASSES=$((PASSES + 1)); printf '  PASS  %s\n' "$*"; }
fail() { FAILS=$((FAILS + 1)); printf '  FAIL  %s\n' "$*"; }
check() { # description command...
  local what="$1"; shift
  if "$@"; then pass "$what"; else fail "$what"; fi
}

need_image() {
  if ! docker image inspect "$1" >/dev/null 2>&1; then
    docker pull -q "$1" >/dev/null
    PULLED+=("$1")
  fi
}

wait_db() { # container root-password
  local i
  for i in $(seq 1 90); do
    if docker exec "$1" mariadb -uroot -p"$2" -e 'SELECT 1' >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "database $1 did not start" >&2
  return 1
}

start_db() { # name database user password
  docker run -d --name "$1" --network "$NET" --label "$LABEL" \
    -e MARIADB_ROOT_PASSWORD=rootpw -e MARIADB_DATABASE="$2" -e MARIADB_USER="$3" -e MARIADB_PASSWORD="$4" \
    mariadb:11 >/dev/null
  wait_db "$1" rootpw
}

sql() { # container database statements (client commands such as DELIMITER work)
  printf '%s\n' "$3" | docker exec -i "$1" mariadb -uroot -prootpw "$2"
}

http_port() { docker port "$1" 80/tcp | sed -n 's/.*://; 1p'; }

# ── the target ─────────────────────────────────────────────────────────────────────────────────

build_target_image() { # php version
  local dir="$WORK/image-$1"
  mkdir -p "$dir"
  cat > "$dir/Dockerfile" <<EOF
FROM php:$1-apache
RUN docker-php-ext-install mysqli >/dev/null \\
 && a2enmod rewrite >/dev/null \\
 && sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf
EOF
  docker build -q --label "$LABEL" -t "$RUN-php:$1" "$dir" >/dev/null
}

TARGET=""
TDB=""
TPORT=""
HOST="shop.example.test"
NEW="http://$HOST"

# start_target <php version> <name> [docker run -e ... options]
start_target() {
  local version="$1" name="$2"; shift 2
  TARGET="$RUN-$name"
  TDB="$RUN-$name-db"
  start_db "$TDB" site siteuser sitepw
  docker run -d --name "$TARGET" --network "$NET" --label "$LABEL" -p 127.0.0.1::80 "$@" "$RUN-php:$version" >/dev/null
  TPORT="$(http_port "$TARGET")"
  local i
  for i in $(seq 1 30); do
    curl -s -o /dev/null "http://127.0.0.1:$TPORT/" && break
    sleep 1
  done
}

# Unpacks the ZIP the way a hosting file manager does, owned by the web server's user: the ZIP was
# uploaded into the web folder and unpacked there, so it is there too, as UPLOADED.
# Named as Tracy names a download (`downloadName`): label, backup, and 64 random bits.
UPLOADED="shop-e2e-backup-v1-$(python3 -c 'import secrets; print(secrets.token_hex(8))').zip"
unpack_into_target() { # zip
  local dir="$WORK/unpack-$TARGET"
  rm -rf "$dir"; mkdir -p "$dir"
  python3 -c 'import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' "$1" "$dir"
  cp "$1" "$dir/$UPLOADED"
  docker exec "$TARGET" sh -c 'rm -rf /var/www/html/* /var/www/html/.[!.]* 2>/dev/null; true'
  docker cp "$dir/." "$TARGET:/var/www/html/" >/dev/null
  docker exec "$TARGET" chown -R www-data:www-data /var/www/html
  rm -rf "$dir"
}

tcurl() { curl -sS --connect-to "$HOST:80:127.0.0.1:$TPORT" --max-time 120 "$@"; }

LAST_STATUS=""
LAST_BODY=""
# The browser a request comes from: its cookie jar. A run belongs to the browser that began it.
JAR=""
new_browser() { JAR="$(mktemp "$WORK/jar.XXXXXX")"; }
# post <field=value>... — one request to installer.php from $JAR; status and body land in LAST_*.
post() {
  local args=() kv
  for kv in "$@"; do args+=(--data-urlencode "$kv"); done
  LAST_BODY="$(tcurl -o - -w '\n%{http_code}' -b "$JAR" -c "$JAR" "${args[@]}" "$NEW/installer.php" || true)"
  LAST_STATUS="${LAST_BODY##*$'\n'}"
  LAST_BODY="${LAST_BODY%$'\n'*}"
}

json() { # field — from LAST_BODY; empty when it is not JSON or has no such field
  python3 -c 'import json,sys
try: v=json.loads(sys.stdin.read())
except Exception: sys.exit(0)
v=v.get(sys.argv[1]) if isinstance(v,dict) else None
print("" if v is None else (json.dumps(v) if isinstance(v,(dict,list,bool)) else v))' "$1" <<<"$LAST_BODY"
}

CUTS=0
BUSY=0
STEPS=0
DONE_HTML=""
# Drives the steps until done, as the page's own loop does: a cut request (not JSON) or a busy one
# is retried, anything else that is not ok stops.
drive() {
  CUTS=0; BUSY=0; STEPS=0; DONE_HTML=""
  local tries=0
  while (( tries < 400 )); do
    tries=$((tries + 1))
    post action=step
    STEPS=$((STEPS + 1))
    if [[ "$(json ok)" == true ]]; then
      if [[ "$(json done)" == true ]]; then DONE_HTML="$(json html)"; DONE_FAILED="$(json failed)"; return 0; fi
      continue
    fi
    if [[ "$(json busy)" == true ]]; then BUSY=$((BUSY + 1)); sleep 1; continue; fi
    if [[ -z "$(json ok)" ]]; then
      CUTS=$((CUTS + 1))
      # ON_CUT names a function that looks at the folder as the killed request left it.
      if [[ -n "${ON_CUT:-}" ]]; then "$ON_CUT"; fi
      sleep 0.5; continue
    fi
    echo "    installer stopped: $LAST_STATUS $LAST_BODY" >&2
    return 1
  done
  echo "    installer did not finish in $tries requests" >&2
  return 1
}

post_begin() {
  post action=begin "db_host=$TDB" db_name=site db_user=siteuser db_password=sitepw "address=$NEW" confirm=1
}

# ── sources ────────────────────────────────────────────────────────────────────────────────────

WP_OLD="https://shop-e2e.tracy.site"
WP_OLD_HOST="shop-e2e.tracy.site"
J_OLD="https://lantern-e2e.tracy.site"
J_OLD_HOST="lantern-e2e.tracy.site"
ADMIN_PASSWORD='E2e-admin-pass-1234'
# Rows in the WordPress bulk table: enough that importing them takes PHP over a 1-second CPU limit.
BULK_ROWS=250000
ADMIN_EMAIL='owner@example.com'
# The install code Tracy would make for the export: the package holds only its hash.
INSTALL_CODE='615204'

# Packs a source: git archive of the webroot (as the history is), the dump with site-backup.sh's
# flags, a point.json, then export-package.py. Prints nothing; leaves $WORK/<platform>.zip.
pack_source() { # platform label webroot db-container database
  local platform="$1" label="$2" webroot="$3" db="$4" database="$5"
  local work="$WORK/export-$platform"
  mkdir -p "$work"
  ( cd "$webroot" && git init -q && git -c user.email=e2e@example.com -c user.name=e2e add -A \
      && git -c user.email=e2e@example.com -c user.name=e2e commit -qm backup \
      && git archive --format=tar HEAD > "$work/archive.tar" )
  docker exec -e MYSQL_PWD=rootpw "$db" mariadb-dump -uroot --single-transaction --quick --routines --triggers --events \
    --max-allowed-packet=256M "$database" | gzip -6 > "$work/db.sql.gz"
  gzip -dc "$work/db.sql.gz" | tail -c 200 | grep 'Dump completed' >/dev/null
  python3 - "$work" <<'EOF'
import hashlib, json, os, sys, time
work = sys.argv[1]
dump = os.path.join(work, "db.sql.gz")
raw = open(dump, "rb").read()
json.dump({"version": 2, "title": "Before the move", "at": int(time.time()), "sha": "0" * 40,
           "database": {"ok": True, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()},
           "facts": {"kind": "mysql"}}, open(os.path.join(work, "point.json"), "w"))
EOF
  TRACY_EXPORT_INSTALL_CODE="$INSTALL_CODE" \
    python3 "$LIB/export-package.py" "$work" "$platform" "$label" "$work/point.json" 2147483648 | tail -1 > "$work/answer.json"
  python3 -c 'import json,sys; a=json.load(open(sys.argv[1])); sys.exit(0 if a.get("ok") else 1)' "$work/answer.json" \
    || { cat "$work/answer.json" >&2; return 1; }
  mv "$work/package.zip" "$WORK/$platform.zip"
  rm -rf "$work"
}

payload_of() { # zip
  python3 -c 'import sys,zipfile
print(next(m.split("/")[0] for m in zipfile.ZipFile(sys.argv[1]).namelist() if "/" in m))' "$1"
}

build_wordpress_source() {
  say "WordPress source: prefix tr_, WP_HOME $WP_OLD, Tracy sign-in plugin"
  local root="$WORK/wp-src" db="$RUN-wpsrc-db" web="$RUN-wpsrc"
  mkdir -p "$root"
  start_db "$db" tracy tracy tracypw
  docker run -d --name "$web" --network "$NET" --label "$LABEL" -p 127.0.0.1::80 -v "$root:/var/www/html" \
    -e WORDPRESS_DB_HOST="$db" -e WORDPRESS_DB_USER=tracy -e WORDPRESS_DB_PASSWORD=tracypw \
    -e WORDPRESS_DB_NAME=tracy -e WORDPRESS_TABLE_PREFIX=tr_ wordpress:6-php8.3-apache >/dev/null
  local i
  for i in $(seq 1 60); do [[ -f "$root/wp-config.php" && -f "$root/wp-settings.php" ]] && break; sleep 1; done
  # The address pinned in wp-config.php the way provisioning does it.
  python3 "$RENDER_WP_CONFIG" --source "$root/wp-config.php" --out "$root/wp-config.php.new" \
    --db-host "$db" --db-user tracy --db-password tracypw --db-name tracy --site-url "$WP_OLD" --table-prefix tr_ >/dev/null
  mv "$root/wp-config.php.new" "$root/wp-config.php"
  wp() {
    docker run --rm -i --network "$NET" --label "$LABEL" --user 33:33 -v "$root:/var/www/html" \
      -e WORDPRESS_DB_HOST="$db" -e WORDPRESS_DB_USER=tracy -e WORDPRESS_DB_PASSWORD=tracypw \
      -e WORDPRESS_DB_NAME=tracy -e WORDPRESS_TABLE_PREFIX=tr_ -e HOME=/tmp wordpress:cli-php8.3 wp "$@"
  }
  wp core install --url="$WP_OLD" --title='Shop' --admin_user=owner --admin_password="$ADMIN_PASSWORD" \
    --admin_email="$ADMIN_EMAIL" --skip-email >/dev/null
  wp rewrite structure '/%postname%/' >/dev/null
  cat > "$root/.htaccess" <<'EOF'
# BEGIN WordPress
<IfModule mod_rewrite.c>
RewriteEngine On
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
</IfModule>
# END WordPress
EOF
  wp post create --post_type=post --post_status=publish --post_name=moving-day --post_title='Moving day' \
    --post_content="<p>Read <a href=\"$WP_OLD/about/\">about us</a>.</p><p><img src=\"$WP_OLD/wp-content/uploads/logo.png\" alt=\"\"></p>" >/dev/null
  wp option update widget_text --format=json \
    "{\"2\":{\"title\":\"Tiếng Việt ✓ – €\",\"text\":\"Write to us: $WP_OLD/contact/\"},\"_multiwidget\":1}" >/dev/null
  wp option add tracy_e2e_json "{\"url\":\"https:\\/\\/$WP_OLD_HOST\\/shop\\/\"}" >/dev/null
  wp option add tracy_e2e_mixed --format=json \
    "{\"blob\":\"{\\\"u\\\":\\\"https:\\\\/\\\\/$WP_OLD_HOST\\\\/x\\\"}\",\"plain\":\"$WP_OLD/y\"}" >/dev/null
  # A table without a primary key, a trigger, a procedure, and enough rows for many statements.
  sql "$db" tracy "
    CREATE TABLE e2e_noprefix (id INT PRIMARY KEY, v TEXT) ENGINE=InnoDB;
    INSERT INTO e2e_noprefix VALUES (1, 'see $WP_OLD/np');
    CREATE TABLE tr_e2e_log (note TEXT) ENGINE=InnoDB;
    INSERT INTO tr_e2e_log VALUES ('seen at $WP_OLD/log'), ('nothing here');
    CREATE TABLE tr_e2e_bulk (id INT AUTO_INCREMENT PRIMARY KEY, body LONGTEXT) ENGINE=InnoDB;
    INSERT INTO tr_e2e_bulk (body) SELECT CONCAT(REPEAT(MD5(seq), 24), ' $WP_OLD/p/', seq) FROM seq_1_to_$BULK_ROWS;
    CREATE TRIGGER tr_e2e_touch BEFORE INSERT ON tr_e2e_log FOR EACH ROW SET NEW.note = CONCAT(NEW.note, '');
    DELIMITER //
    CREATE PROCEDURE tr_e2e_count() BEGIN DECLARE n INT; SELECT COUNT(*) INTO n FROM tr_e2e_bulk; SELECT n; END//
    DELIMITER ;"
  mkdir -p "$root/wp-content/mu-plugins"
  cp "$ACCESS/wordpress/tracy-access.php" "$root/wp-content/mu-plugins/tracy-access.php"
  WP_SRC="$web"
  WP_SRC_PORT="$(http_port "$web")"

  # Control: on the source, Tracy's headers alone do sign in — so the same request failing on the
  # installed site means the plugin is gone, not that the request is wrong.
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' --connect-to "$WP_OLD_HOST:443:127.0.0.1:$WP_SRC_PORT" \
    -H "Host: $WP_OLD_HOST" -H 'X-Forwarded-Proto: https' -H "X-Tracy-Email: $ADMIN_EMAIL" -H 'X-Tracy-Tier: editor' \
    "http://127.0.0.1:$WP_SRC_PORT/wp-admin/")"
  check "source: X-Tracy-Email + X-Tracy-Tier: editor signs in on the source (control, got $status)" test "$status" = 200

  pack_source wordpress shop-e2e "$root" "$db" tracy
  docker rm -fv "$web" "$db" >/dev/null
}

build_joomla_source() {
  say "Joomla source: prefix tr_, live_site $J_OLD, force_ssl 2, behind_loadbalancer 1, mailer none, tracyaccess on"
  local root="$WORK/j-src" db="$RUN-jsrc-db" web="$RUN-jsrc"
  mkdir -p "$root"
  start_db "$db" tracy tracy tracypw
  docker run -d --name "$web" --network "$NET" --label "$LABEL" -p 127.0.0.1::80 -v "$root:/var/www/html" \
    -e JOOMLA_DB_HOST="$db" -e JOOMLA_DB_USER=tracy -e JOOMLA_DB_PASSWORD=tracypw -e JOOMLA_DB_NAME=tracy \
    -e JOOMLA_DB_PREFIX=tr_ -e JOOMLA_SITE_NAME=Lantern -e JOOMLA_ADMIN_USER='Site Owner' \
    -e JOOMLA_ADMIN_USERNAME=owner -e JOOMLA_ADMIN_PASSWORD="$ADMIN_PASSWORD" -e JOOMLA_ADMIN_EMAIL="$ADMIN_EMAIL" \
    joomla:5-apache >/dev/null
  local i
  for i in $(seq 1 180); do
    [[ -f "$root/configuration.php" && ! -d "$root/installation" ]] && break
    sleep 1
  done
  [[ -f "$root/configuration.php" ]] || { docker logs "$web" | tail -20 >&2; return 1; }
  sleep 2
  python3 - "$root/configuration.php" "$J_OLD" <<'EOF'
import os, re, sys
path, old = sys.argv[1], sys.argv[2]
src = open(path).read()
def put(name, value):
    global src
    literal = value if isinstance(value, int) else "'" + value + "'"
    src, n = re.subn(r"(public \$" + name + r" = )[^;]*;", lambda m: m.group(1) + str(literal) + ";", src)
    if n == 0:
        # Absent from the file (Joomla 5 writes no behind_loadbalancer): appended inside the class,
        # as render_configuration.py does.
        src, n = re.subn(r"\n(\}\s*)$", lambda m: "\n\tpublic $" + name + " = " + str(literal) + ";\n" + m.group(1), src, count=1)
    assert n == 1, name
put("live_site", old)
put("force_ssl", 2)
put("behind_loadbalancer", 1)
put("mailer", "none")
put("sef_rewrite", 1)
put("tmp_path", "/srv/tracy/sites/lantern/webroot/tmp")
put("log_path", "/srv/tracy/sites/lantern/webroot/administrator/logs")
os.chmod(path, 0o644)  # Joomla's installer leaves it read-only
open(path, "w").write(src)
EOF
  [[ -f "$root/htaccess.txt" ]] || { echo "the Joomla image has no htaccess.txt" >&2; return 1; }
  # Tracy's sign-in plugin, files and an enabled row, as a clone carries it.
  mkdir -p "$root/plugins/system/tracyaccess"
  cp -R "$ACCESS/joomla/plg_system_tracyaccess/." "$root/plugins/system/tracyaccess/"
  local now; now="$(date -u '+%Y-%m-%d %H:%M:%S')"
  sql "$db" tracy "
    INSERT INTO tr_extensions (package_id,name,type,element,folder,client_id,enabled,access,protected,locked,manifest_cache,params,custom_data,ordering,state)
      VALUES (0,'plg_system_tracyaccess','plugin','tracyaccess','system',0,1,1,0,0,'{}','{}','',0,0);
    INSERT INTO tr_content (asset_id,title,alias,introtext,\`fulltext\`,state,catid,created,created_by,modified,modified_by,publish_up,images,urls,attribs,metakey,metadesc,access,metadata,featured,language,note,version,hits,ordering)
      VALUES (0,'Moving day','moving-day','<p>See <a href=\"$J_OLD/about\">about</a> and <img src=\"$J_OLD/images/logo.png\" alt=\"\"></p>','',1,2,'$now',(SELECT id FROM tr_users LIMIT 1),'$now',0,'$now','{}',
        '{\"urla\":\"https:\\\\/\\\\/$J_OLD_HOST\\\\/shop\",\"urlatext\":\"\",\"targeta\":\"\",\"urlb\":false,\"urlbtext\":\"\",\"targetb\":\"\",\"urlc\":false,\"urlctext\":\"\",\"targetc\":\"\"}',
        '{}','','',1,'{}',1,'*','',1,0,0);
    CREATE TABLE e2e_noprefix (id INT PRIMARY KEY, v TEXT) ENGINE=InnoDB;
    INSERT INTO e2e_noprefix VALUES (1, 'see $J_OLD/np');
    INSERT INTO tr_content_frontpage (content_id,ordering) SELECT MAX(id),1 FROM tr_content;
    INSERT INTO tr_workflow_associations (item_id,stage_id,extension) SELECT MAX(id),1,'com_content.article' FROM tr_content;"
  J_ARTICLE="$(docker exec "$db" mariadb -uroot -prootpw -N tracy -e 'SELECT MAX(id) FROM tr_content')"

  # Control, as for WordPress: on the source, Tracy's headers alone open an administrator session.
  local port page
  port="$(http_port "$web")"
  page="$(curl -s --connect-to "$J_OLD_HOST:80:127.0.0.1:$port" -H 'X-Forwarded-Proto: https' -H "X-Tracy-Email: $ADMIN_EMAIL" -H 'X-Tracy-Tier: editor' \
    "http://$J_OLD_HOST/administrator/index.php")"
  check "source: X-Tracy-Email + X-Tracy-Tier: editor signs in on the source (control)" \
    bash -c '[[ "$1" == *"task=logout"* || "$1" == *"com_cpanel"* ]] && [[ "$1" != *"form-login"* ]]' _ "$page"
  pack_source joomla lantern-e2e "$root" "$db" tracy
  docker rm -fv "$web" "$db" >/dev/null
}

# ── checks shared by every install ─────────────────────────────────────────────────────────────

no_old_host() { # body old-host
  ! grep -qi "$2" <<<"$1"
}

page_ok() { # path old-host [cookie jar] — 200 without following redirects, no old host in the body
  local out status body
  out="$(tcurl -o - -w '\n%{http_code} %{redirect_url}' ${3:+-b "$3"} "$NEW$1")"
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
  check "GET $1 answers 200 on the new address (got $status)" test "${status%% *}" = 200
  check "GET $1 holds no trace of $2" no_old_host "$body" "$2"
}

page_follow_ok() { # path old-host — redirects followed: ends 200 on the new address, no old host in the body
  local out status url body
  out="$(tcurl -L -o - -w '\n%{http_code} %{url_effective}' "$NEW$1")"
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
  url="${status#* }"
  check "GET $1 ends 200 on the new address (got ${status%% *} at $url)" \
    bash -c '[[ "$1" == 200 && "$2" == "$3"/* ]]' _ "${status%% *}" "$url" "$NEW"
  check "GET $1 holds no trace of $2" no_old_host "$body" "$2"
}

installer_files_gone() { # payload
  local left
  left="$(docker exec "$TARGET" sh -c "cd /var/www/html && ls -d installer.php installer-state.php installer-state.tmp.php $UPLOADED $1 2>/dev/null; true")"
  [[ -z "$left" ]] || { echo "    left behind: $left" >&2; return 1; }
}

payload_closed() { # payload — every payload file answers 403 or 404 when fetched directly
  local name status bad=0
  for name in webroot.tar db.sql.gz manifest.json tracy_setting.json SHA256SUMS .htaccess index.html ""; do
    status="$(tcurl -o /dev/null -w '%{http_code}' "$NEW/$1/$name")"
    if [[ "$status" != 403 && "$status" != 404 ]]; then echo "    $1/$name answered $status" >&2; bad=1; fi
  done
  # Nor does the folder's listing give the payload's name away.
  if tcurl "$NEW/" | grep tracy-package- >/dev/null; then echo "    / names the payload folder" >&2; bad=1; fi
  return "$bad"
}

refusals_before_install() { # payload platform old-address
  check "payload files cannot be downloaded (403/404), and / does not name the payload folder" payload_closed "$1"

  # A database that already holds one of the package's tables.
  local clash; clash=$([[ "$2" == wordpress ]] && echo tr_options || echo tr_content)
  sql "$TDB" site "CREATE TABLE $clash (id INT PRIMARY KEY)"
  post_begin
  if [[ "$(json ok)" == true ]]; then post action=step; fi
  check "a database that holds $clash is refused (got $LAST_STATUS: $(json error | cut -c1-90))" \
    bash -c '[[ "$1" == 422 && ( "$2" == *"$3"* || "$2" == *"already has tables"* ) ]]' _ "$LAST_STATUS" "$(json error)" "$clash"
  sql "$TDB" site "DROP TABLE $clash"
  # A table the dump creates outside the prefix: only the scan of the whole dump can see it.
  sql "$TDB" site "CREATE TABLE e2e_noprefix (id INT PRIMARY KEY)"
  post_begin
  if [[ "$(json ok)" == true ]]; then post action=step; fi
  check "a database that holds e2e_noprefix (no prefix, created by the dump) is refused (got $LAST_STATUS: $(json error | cut -c1-90))" \
    bash -c '[[ "$1" == 422 && "$2" == *e2e_noprefix* ]]' _ "$LAST_STATUS" "$(json error)"
  sql "$TDB" site "DROP TABLE e2e_noprefix"
  # A table of someone else's in the same database: allowed, and never touched by the replace.
  sql "$TDB" site "CREATE TABLE other_app (id INT PRIMARY KEY, v TEXT); INSERT INTO other_app VALUES (1, 'kept $3/z')"
  check "nothing was written into the folder by the refused attempt" \
    bash -c '! docker exec "$1" test -e /var/www/html/wp-settings.php -o -e /var/www/html/libraries' _ "$TARGET"
  check "the refused attempt left no state, so it can start again" \
    bash -c '! docker exec "$1" test -e /var/www/html/installer-state.php' _ "$TARGET"
}

# Another browser (its own cookie jar) tries to join the run in progress, by POST and by GET.
foreign_refused() {
  local owner="$JAR" page
  new_browser
  post action=step
  check "a second browser cannot continue the run in progress (got $LAST_STATUS: $(json error | cut -c1-60))" \
    bash -c '[[ "$1" == 409 && "$2" == true ]]' _ "$LAST_STATUS" "$(json foreign)"
  post_begin
  check "a second browser cannot start over the run in progress (got $LAST_STATUS)" \
    bash -c '[[ "$1" == 409 && "$2" == true ]]' _ "$LAST_STATUS" "$(json foreign)"
  page="$(tcurl -b "$JAR" "$NEW/installer.php")"
  check "the page tells a second browser that an installation is in progress, with no form" \
    bash -c '[[ "$1" == *"An installation is in progress here"* && "$1" != *"name=\"db_password\""* ]]' _ "$page"
  rm -f "$JAR"
  JAR="$owner"
}

install() { # begin then drive to done
  post_begin
  [[ "$(json ok)" == true ]] || { echo "    begin refused: $LAST_STATUS $LAST_BODY" >&2; return 1; }
  drive
}

second_run_refused() { # zip
  local status
  status="$(tcurl -o /dev/null -w '%{http_code}' "$NEW/installer.php")"
  check "installer.php is gone after the install (GET answers $status)" test "$status" = 404
  # Someone puts the installer back over the installed site: it must not run twice.
  python3 -c 'import sys,zipfile; open(sys.argv[2],"wb").write(zipfile.ZipFile(sys.argv[1]).read("installer.php"))' "$1" "$WORK/installer-again.php"
  docker cp "$WORK/installer-again.php" "$TARGET:/var/www/html/installer.php" >/dev/null
  docker exec "$TARGET" chown www-data:www-data /var/www/html/installer.php
  new_browser
  post_begin
  check "a second run on the installed site is refused (got $LAST_STATUS: $(json error | cut -c1-70))" \
    bash -c '[[ "$1" == 422 && "$2" == *"already installed"* ]]' _ "$LAST_STATUS" "$(json error)"
  docker exec "$TARGET" rm -f /var/www/html/installer.php /var/www/html/installer-state.php
}

wp_checks() {
  local jar="$WORK/wp-jar-$TARGET"
  page_ok / "$WP_OLD_HOST"
  page_ok /moving-day/ "$WP_OLD_HOST"
  check "the post links to the new address" bash -c 'curl -s --connect-to "$1:80:127.0.0.1:$2" "$3/moving-day/" | grep "$3/about/" >/dev/null' _ "$HOST" "$TPORT" "$NEW"
  # Sign in as the owner with the Tracy password.
  tcurl -o /dev/null -c "$jar" -b 'wordpress_test_cookie=WP%20Cookie%20check' \
    --data-urlencode log=owner --data-urlencode "pwd=$ADMIN_PASSWORD" --data-urlencode testcookie=1 \
    --data-urlencode "redirect_to=$NEW/wp-admin/" "$NEW/wp-login.php"
  local admin; admin="$(tcurl -o - -w '\n%{http_code}' -b "$jar" "$NEW/wp-admin/")"
  check "admin sign-in works and /wp-admin/ answers 200 (got ${admin##*$'\n'})" \
    bash -c '[[ "$1" == 200 && "$2" == *"Dashboard"* ]]' _ "${admin##*$'\n'}" "${admin%$'\n'*}"
  check "the admin page holds no trace of $WP_OLD_HOST" no_old_host "${admin%$'\n'*}" "$WP_OLD_HOST"
  rm -f "$jar"
  # Tracy's headers without a cookie: no session on the installed site.
  local status
  status="$(tcurl -o /dev/null -w '%{http_code}' -H "X-Tracy-Email: $ADMIN_EMAIL" -H 'X-Tracy-Tier: editor' "$NEW/wp-admin/")"
  check "X-Tracy-Email + X-Tracy-Tier: editor without a cookie does not sign in (got $status)" test "$status" = 302
  check "tracy-access.php is not on the installed site" \
    bash -c '! docker exec "$1" test -e /var/www/html/wp-content/mu-plugins/tracy-access.php' _ "$TARGET"
  # The database, read back with PHP's own unserialize.
  local verdict
  verdict="$(docker exec -i "$TARGET" php -d display_errors=stderr -- "$TDB" "$NEW" "$WP_OLD_HOST" "$BULK_ROWS" < "$HERE/wp-check.php")"
  local line
  while IFS=$'\t' read -r flag what; do
    [[ -n "$flag" ]] || continue
    if [[ "$flag" == PASS ]]; then pass "$what"; else fail "$what"; fi
  done <<<"$verdict"
}

joomla_checks() {
  page_ok / "$J_OLD_HOST"
  page_follow_ok "/index.php?option=com_content&view=article&id=$J_ARTICLE&catid=2" "$J_OLD_HOST"
  local jar="$WORK/j-jar-$TARGET" page token
  page="$(tcurl -c "$jar" -b "$jar" "$NEW/administrator/index.php")"
  token="$(grep -oE 'name="[0-9a-f]{32}" value="1"' <<<"$page" | sed -nE '1s/name="([0-9a-f]+)".*/\1/p')"
  tcurl -o /dev/null -c "$jar" -b "$jar" --data-urlencode username=owner --data-urlencode "passwd=$ADMIN_PASSWORD" \
    --data-urlencode option=com_login --data-urlencode task=login --data-urlencode return=aW5kZXgucGhw \
    --data-urlencode "$token=1" "$NEW/administrator/index.php"
  local admin; admin="$(tcurl -o - -w '\n%{http_code}' -b "$jar" "$NEW/administrator/index.php")"
  check "admin sign-in works and /administrator/ answers 200 (got ${admin##*$'\n'})" \
    bash -c '[[ "$1" == 200 && "$2" == *"task=logout"* || "$1" == 200 && "$2" == *"com_cpanel"* ]] && [[ "$2" != *"form-login"* ]]' _ "${admin##*$'\n'}" "${admin%$'\n'*}"
  check "the admin page holds no trace of $J_OLD_HOST" no_old_host "${admin%$'\n'*}" "$J_OLD_HOST"
  rm -f "$jar"
  page="$(tcurl -H "X-Tracy-Email: $ADMIN_EMAIL" -H 'X-Tracy-Tier: editor' "$NEW/administrator/index.php")"
  check "X-Tracy-Email + X-Tracy-Tier: editor without a cookie does not sign in (login form shown)" \
    bash -c '[[ "$1" == *"form-login"* && "$1" != *"task=logout"* ]]' _ "$page"
  local verdict
  verdict="$(docker exec -i "$TARGET" php -d display_errors=stderr -- "$TDB" "$NEW" "$J_OLD_HOST" < "$HERE/joomla-check.php")"
  while IFS=$'\t' read -r flag what; do
    [[ -n "$flag" ]] || continue
    if [[ "$flag" == PASS ]]; then pass "$what"; else fail "$what"; fi
  done <<<"$verdict"
}

done_page_checks() { # platform
  local head="${DONE_HTML%%<details>*}" details="" admin=/wp-admin/
  [[ "$DONE_HTML" == *"<details>"* ]] && details="${DONE_HTML#*<details>}"
  [[ "$1" == joomla ]] && admin=/administrator/
  check "the done page says the site is installed, with buttons to the site and its admin area" \
    bash -c '[[ "$1" == *"Your site is installed"* && "$1" == *"href=\"$2/\">Open the site</a>"* && "$1" == *"href=\"$2$3\">Open the admin area</a>"* ]]' _ "$head" "$NEW" "$admin"
  check "Details says the backup point and that later changes are not included" \
    bash -c '[[ "$1" == *"backup point"* && "$1" == *"not in it"* ]]' _ "$details"
  check "Details lists the old address replaced and no count of 0" \
    bash -c '[[ "$1" == *"$2"*"replaced by"*"database values"* && "$3" != *"could not be read: 0"* && "$3" != *" 0 serialized"* ]]' _ "$details" "$(old_of "$1")" "$DONE_HTML"
  if [[ "$1" == joomla ]]; then
    check "what asks the customer to act (Force HTTPS) is outside Details; the other changes are inside" \
      bash -c '[[ "$1" == *"Force HTTPS is off"* && "$2" != *"Force HTTPS"* && "$2" == *"\$tmp_path and \$log_path"* && "$2" == *"Tracy Access"* && "$1" != *"\$tmp_path"* ]]' _ "$head" "$details"
  else
    check "the WordPress changes are inside Details and nothing asks the customer to act" \
      bash -c '[[ "$1" == *"wp-config.php"* && "$2" != *"class=\"todo\""* ]]' _ "$details" "$head"
  fi
  check "every installer file was deleted (failed list: ${DONE_FAILED:-[]})" test "${DONE_FAILED:-[]}" = '[]'
}

# ── scenarios ──────────────────────────────────────────────────────────────────────────────────

other_app_untouched() { # old-address
  local v; v="$(docker exec "$TDB" mariadb -uroot -prootpw -N site -e 'SELECT v FROM other_app WHERE id=1')"
  check "a table of someone else's in the same database is untouched by the replace ($v)" test "$v" = "kept $1/z"
}

noprefix_replaced() { # old-host — the dump's own table outside the prefix was imported and replaced
  local v; v="$(docker exec "$TDB" mariadb -uroot -prootpw -N site -e 'SELECT v FROM e2e_noprefix WHERE id=1')"
  check "the dump's table outside the prefix was imported and holds the new address ($v)" test "$v" = "see $NEW/np"
}

old_of() { [[ "$1" == wordpress ]] && echo "$WP_OLD" || echo "$J_OLD"; }
old_host_of() { [[ "$1" == wordpress ]] && echo "$WP_OLD_HOST" || echo "$J_OLD_HOST"; }

# The full scenario: refusals, a second browser, a write killed after the server applied it and
# before the checkpoint, every check, a second run.
scenario_full() { # platform php-version zip
  local platform="$1" version="$2" zip="$3" payload
  payload="$(payload_of "$zip")"
  say "$platform on PHP $version: refusals, a second browser, a kill after a commit, every check"
  start_target "$version" "${platform:0:2}full${version//./}" -e TRACY_INSTALLER_TEST_FAULT=after-commit:40
  unpack_into_target "$zip"
  new_browser
  refusals_before_install "$payload" "$platform" "$(old_of "$platform")"
  new_browser
  post_begin
  if [[ "$(json ok)" == true ]]; then
    foreign_refused
    if drive; then
      pass "the install finished ($STEPS requests)"
      check "a request was killed after a write and before its checkpoint, and the next one resumed ($CUTS cut)" test "$CUTS" -ge 1
      done_page_checks "$platform"
      check "installer.php, the state file and the payload are deleted" installer_files_gone "$payload"
      if [[ "$platform" == wordpress ]]; then wp_checks; else joomla_checks; fi
      other_app_untouched "$(old_of "$platform")"
      noprefix_replaced
      second_run_refused "$zip"
    else
      fail "the install finished"
    fi
  else
    fail "the install began ($LAST_STATUS $LAST_BODY)"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null
}

# A host with a 1-second max_execution_time and a 64 MB memory limit; the installer's own budget is
# lifted so PHP itself kills requests in the middle of the work.
scenario_cut() { # platform php-version zip
  local platform="$1" version="$2" zip="$3" payload
  payload="$(payload_of "$zip")"
  say "$platform on PHP $version: requests killed by max_execution_time=1, memory_limit=64M"
  start_target "$version" "${platform:0:2}cut${version//./}" -e TRACY_INSTALLER_TEST_BUDGET=60 -e TRACY_INSTALLER_TEST_TRACE=/tmp/import-trace.log
  docker exec "$TARGET" sh -c 'printf "max_execution_time=1\nmemory_limit=64M\nlog_errors=1\nerror_log=/tmp/php-errors.log\n" > /usr/local/etc/php/conf.d/zz-e2e.ini && apachectl -k graceful' >/dev/null 2>&1
  sleep 2
  unpack_into_target "$zip"
  new_browser
  if install; then
    pass "the install finished ($STEPS requests)"
    check "requests were killed by the time limit and the next ones resumed ($CUTS cut)" test "$CUTS" -ge 1
    # Where each kill landed, as the installer's shutdown handler logs it.
    local phases
    phases="$(docker exec "$TARGET" sh -c 'grep -h "Tracy installer: stopped during" /tmp/php-errors.log 2>/dev/null' | sed -nE 's/.*stopped during ([a-z ]+):.*/\1/p' | tr '\n' ' ')"
    check "PHP killed requests at the time limit, during: ${phases:-nothing}" test -n "$phases"
    docker exec "$TARGET" sh -c 'cat /tmp/php-errors.log 2>/dev/null' | sed 's/^/    php: /'
    [[ -n "${TRACE_OUT:-}" ]] && docker cp "$TARGET:/tmp/import-trace.log" "$TRACE_OUT" >/dev/null 2>&1
    if [[ "$platform" == wordpress ]]; then
      check "a kill by the time limit landed in the database import, and it resumed" bash -c '[[ " $1" == *" import "* ]]' _ "$phases"
    fi
    done_page_checks "$platform"
    check "installer.php, the state file and the payload are deleted" installer_files_gone "$payload"
    if [[ "$platform" == wordpress ]]; then wp_checks; else joomla_checks; fi
  else
    fail "the install finished"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null
}

# The age limit (lowered to 30 s for the test), then a plain install with a second request sent
# while the first holds the lock, finishing after the limit has passed.
scenario_plain() { # platform php-version zip
  local platform="$1" version="$2" zip="$3" payload page unpacked
  payload="$(payload_of "$zip")"
  say "$platform on PHP $version: an expired installer, a plain install, and a concurrent request"
  start_target "$version" "${platform:0:2}plain${version//./}" -e TRACY_INSTALLER_TEST_BUDGET=8 -e TRACY_INSTALLER_TEST_MAX_AGE=30
  unpack_into_target "$zip"
  sleep 33
  new_browser
  page="$(tcurl -b "$JAR" "$NEW/installer.php")"
  check "an installer unpacked over the age limit shows the refusal and no form" \
    bash -c '[[ "$1" == *"was unpacked more than"* && "$1" == *"Upload the ZIP again"* && "$1" != *"name=\"db_password\""* ]]' _ "$page"
  post_begin
  check "an installer unpacked over the age limit refuses to begin (got $LAST_STATUS: $(json error | cut -c1-60))" \
    bash -c '[[ "$1" == 422 && "$2" == *"was unpacked more than"* ]] && ! docker exec "$3" test -e /var/www/html/installer-state.php' _ "$LAST_STATUS" "$(json error)" "$TARGET"

  # Unpacked again, as the refusal says: a fresh start.
  unpack_into_target "$zip"
  unpacked=$SECONDS
  post_begin
  if [[ "$platform" == joomla && "$(json ok)" != true ]]; then
    # Joomla 5 needs PHP 8.1: refused before anything is written.
    check "Joomla 5 on PHP $version is refused before anything is written ($(json error | cut -c1-80))" \
      bash -c '[[ "$1" == 422 && "$2" == *PHP* ]] && ! docker exec "$3" test -e /var/www/html/libraries' _ "$LAST_STATUS" "$(json error)" "$TARGET"
    docker rm -fv "$TARGET" "$TDB" >/dev/null
    return
  fi
  check "after a fresh unpack the installation begins (got $LAST_STATUS)" test "$(json ok)" = true
  ( post action=step ) &
  local first=$!
  sleep 2
  post action=step
  check "a second request while one is working is answered 409 busy (got $LAST_STATUS)" \
    bash -c '[[ "$1" == 409 && "$2" == true ]]' _ "$LAST_STATUS" "$(json busy)"
  wait "$first" || true
  # Past the age limit before the rest of the run: a run already begun goes on.
  local wait_more=$(( 32 - (SECONDS - unpacked) ))
  (( wait_more > 0 )) && sleep "$wait_more"
  if drive; then
    pass "the install finished after the age limit had passed ($STEPS requests)"
    done_page_checks "$platform"
    check "installer.php, the state file and the payload are deleted" installer_files_gone "$payload"
    if [[ "$platform" == wordpress ]]; then wp_checks; else joomla_checks; fi
  else
    fail "the install finished"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null
}

# A file the installer writes in passing, as a killed request leaves it: it must exist (or the
# check proves nothing), hold what it should, and answer a direct GET without that content.
TEMPS_SEEN=""
TEMPS_LEAKED=""
probe_temps() {
  local rel content body
  for rel in installer-state.tmp.php "$PAYLOAD/$CONFIG_NAME.tracy-tmp.php"; do
    content="$(docker exec "$TARGET" sh -c "cat '/var/www/html/$rel' 2>/dev/null" || true)"
    [[ -n "$content" ]] || continue
    body="$(tcurl "$NEW/$rel" || true)"
    TEMPS_SEEN+="$rel"
    if [[ "$content" == *sitepw* ]]; then TEMPS_SEEN+="(with the password)"; fi
    TEMPS_SEEN+=" "
    if [[ "$body" == *sitepw* || "$body" == *tracy-placeholder* || "$body" == *DB_NAME* || "$body" == *JConfig* ]]; then
      TEMPS_LEAKED+="$rel "
    fi
  done
}

fault_fired() { # point — the installer's own marker that the kill happened
  docker exec "$TARGET" sh -c "ls /tmp/tracy-installer-fault-$1-* >/dev/null 2>&1"
}

# Kill points the installer's test hook offers around every file it writes: after the state's
# temporary copy, after the configuration file's temporary copy (configure and credentials), and
# after the credentials are renamed into place but before the checkpoint. Also: the uploaded ZIP is
# gone once the installer is opened.
scenario_faults() { # platform php-version zip
  local platform="$1" version="$2" zip="$3" status body
  PAYLOAD="$(payload_of "$zip")"
  CONFIG_NAME=$([[ "$platform" == wordpress ]] && echo wp-config.php || echo configuration.php)
  say "$platform on PHP $version: kills around every temporary file and after the credentials rename; the uploaded ZIP"
  start_target "$version" "${platform:0:2}faults${version//./}" \
    -e TRACY_INSTALLER_TEST_FAULT=state-temp,config-temp,credentials-temp,credentials-renamed
  unpack_into_target "$zip"

  status="$(tcurl -o /dev/null -w '%{http_code}' "$NEW/$UPLOADED")"
  check "control: before the installer is opened, the uploaded ZIP downloads (got $status)" test "$status" = 200
  tcurl -o /dev/null "$NEW/installer.php"
  status="$(tcurl -o /dev/null -w '%{http_code}' "$NEW/$UPLOADED")"
  check "after the installer is first opened, the uploaded ZIP answers 404 (got $status)" test "$status" = 404

  new_browser
  TEMPS_SEEN=""; TEMPS_LEAKED=""
  post_begin
  check "the first request was killed after writing the state's temporary copy" fault_fired state-temp
  probe_temps
  check "the state's temporary copy was there with the password, and a GET on it does not return it (seen: ${TEMPS_SEEN:-none}; leaked: ${TEMPS_LEAKED:-none})" \
    bash -c '[[ "$1" == *"installer-state.tmp.php(with the password)"* && -z "$2" ]]' _ "$TEMPS_SEEN" "$TEMPS_LEAKED"
  post_begin
  check "the next request begins and removes the leftover (got $LAST_STATUS)" \
    bash -c '[[ "$1" == true ]] && ! docker exec "$2" test -e /var/www/html/installer-state.tmp.php' _ "$(json ok)" "$TARGET"

  TEMPS_SEEN=""; TEMPS_LEAKED=""
  ON_CUT=probe_temps
  if drive; then
    ON_CUT=""
    pass "the install finished ($STEPS requests, $CUTS cut)"
    check "killed after the configuration file's temporary copy (configure), after the credentials' copy, and after the credentials were renamed into place" \
      bash -c 'for p in config-temp credentials-temp credentials-renamed; do docker exec "$1" sh -c "ls /tmp/tracy-installer-fault-$p-* >/dev/null 2>&1" || exit 1; done' _ "$TARGET"
    check "the configuration file's temporary copy was there with the password, and a GET on it does not return it (seen: ${TEMPS_SEEN:-none}; leaked: ${TEMPS_LEAKED:-none})" \
      bash -c '[[ "$1" == *"$3.tracy-tmp.php(with the password)"* && -z "$2" ]]' _ "$TEMPS_SEEN" "$TEMPS_LEAKED" "$CONFIG_NAME"
    done_page_checks "$platform"
    check "installer files, leftovers and the uploaded ZIP are deleted" installer_files_gone "$PAYLOAD"
    page_ok / "$(old_host_of "$platform")"
    if [[ "$platform" == wordpress ]]; then wp_checks; else joomla_checks; fi
  else
    ON_CUT=""
    fail "the install finished"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null
}

# The test harness's one way to make a Docker database "another server": the installer's own
# TRACY_INSTALLER_TREAT_AS_REMOTE, edited in the unpacked file before any request reads it. It can
# only add the code requirement for the hosts it names; a package never ships it set.
treat_as_remote() { # host
  docker exec "$TARGET" sed -i "s/define('TRACY_INSTALLER_TREAT_AS_REMOTE', '');/define('TRACY_INSTALLER_TREAT_AS_REMOTE', '$1');/" /var/www/html/installer.php
  docker exec "$TARGET" grep -q "define('TRACY_INSTALLER_TREAT_AS_REMOTE', '$1');" /var/www/html/installer.php
}

# How many connections the target database has seen; each read is one more (this client's own).
connections() {
  docker exec "$TDB" mariadb -uroot -prootpw -N -e "SHOW GLOBAL STATUS LIKE 'Connections'" | awk '{print $2}'
}

begin_with() { # db-host [code]
  post action=begin "db_host=$1" db_name=site db_user=siteuser db_password=sitepw "address=$NEW" confirm=1 "install_code=${2:-}"
}

nothing_written() {
  ! docker exec "$TARGET" sh -c 'test -e /var/www/html/installer-state.php -o -e /var/www/html/wp-settings.php -o -e /var/www/html/libraries' \
    && [[ "$(docker exec "$TDB" mariadb -uroot -prootpw -N site -e 'SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')" == 0 ]]
}

# The install code: a database on "another server" (the harness's override) asks for it before any
# connection; five wrong codes lock that path for this unpack; a database on the private network
# goes on without it. Then, on a fresh target, the right code installs.
scenario_code() { # platform php-version zip
  local platform="$1" version="$2" zip="$3" before after ip page
  say "$platform on PHP $version: the install code for a database on another server"
  start_target "$version" "${platform:0:2}code${version//./}"
  unpack_into_target "$zip"
  # Before any request: the image runs OPcache, which keeps a compiled installer.php for up to two
  # seconds after an edit (`opcache.revalidate_freq`).
  check "the harness marks the database host as another server" treat_as_remote "$TDB"
  page="$(tcurl "$NEW/installer.php")"
  check "the form does not ask for a code up front (the code row is hidden)" \
    bash -c '[[ "$1" == *"<div id=\"code-row\" hidden>"* ]]' _ "$page"
  new_browser

  before="$(connections)"
  begin_with "$TDB"
  after="$(connections)"
  check "a remote database without a code is refused, asking for it (got $LAST_STATUS, needCode $(json needCode))" \
    bash -c '[[ "$1" == 422 && "$2" == true ]]' _ "$LAST_STATUS" "$(json needCode)"
  check "the refusal says where the code is: the email from Tracy and the Tracy path, with a help link on the page" \
    bash -c '[[ "$1" == *"the email from Tracy with your install code, sent when you downloaded the ZIP"* && "$1" == *"My Sites, the … menu of the site ("*", Export site as ZIP"* && "$2" == *"https://tracy.ai/help"* && "$2" == *"Can'"'"'t find the code?"* ]]' _ "$(json error)" "$page"
  check "no connection was made to that host before the code (connections $before → $after: only this probe)" \
    test "$after" -eq $((before + 1))
  check "nothing was written: no state, no site files, no tables" nothing_written

  local k answers=""
  before="$(connections)"
  for k in 1 2 3 4; do
    begin_with "$TDB" "00000$k"
    answers+="$(json error | grep -oE '[0-9] tr(y|ies) left' || echo "?") / "
  done
  check "four wrong codes count down (${answers})" test "$answers" = "4 tries left / 3 tries left / 2 tries left / 1 try left / "
  begin_with "$TDB" 000009
  check "the fifth wrong code locks the remote path (got $LAST_STATUS, codeLocked $(json codeLocked))" \
    bash -c '[[ "$1" == 422 && "$2" == true ]]' _ "$LAST_STATUS" "$(json codeLocked)"
  begin_with "$TDB" "$INSTALL_CODE"
  check "locked, even the right code is refused: unpack again (got $(json error | cut -c1-70))" \
    bash -c '[[ "$1" == true && "$2" == *"Upload the ZIP again"* ]]' _ "$(json codeLocked)" "$(json error)"
  after="$(connections)"
  check "still no connection to that host (connections $before → $after)" test "$after" -eq $((before + 1))
  check "and still nothing written" nothing_written

  # The same database by its private address: not "another server", no code, and it installs.
  ip="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$TDB")"
  begin_with "$ip"
  check "while locked, a database on the private network ($ip) begins with no code asked (got $LAST_STATUS)" \
    bash -c '[[ "$1" == true && -z "$2" ]]' _ "$(json ok)" "$(json needCode)"
  if drive; then
    pass "the local install finished ($STEPS requests)"
    page_ok / "$(old_host_of "$platform")"
  else
    fail "the local install finished"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null

  say "$platform on PHP $version: the right install code"
  start_target "$version" "${platform:0:2}code2${version//./}"
  unpack_into_target "$zip"
  treat_as_remote "$TDB"
  new_browser
  begin_with "$TDB" 111111
  check "a wrong code first ($(json error | grep -oE '[0-9] tr(y|ies) left'))" test "$(json needCode)" = true
  begin_with "$TDB" "${INSTALL_CODE:0:3} ${INSTALL_CODE:3}"
  check "the right code (typed with a space) begins the install (got $LAST_STATUS)" test "$(json ok)" = true
  if drive; then
    pass "the install with the code finished ($STEPS requests)"
    done_page_checks "$platform"
    check "installer files and the code's files are deleted" installer_files_gone "$(payload_of "$zip")"
    if [[ "$platform" == wordpress ]]; then wp_checks; else joomla_checks; fi
    local config
    config=$([[ "$platform" == wordpress ]] && echo wp-config.php || echo configuration.php)
    check "the site's configuration keeps the database host as typed ($TDB), not the address the installer pinned" \
      docker exec "$TARGET" grep -q "'$TDB'" "/var/www/html/$config"
  else
    fail "the install with the code finished"
  fi
  docker rm -fv "$TARGET" "$TDB" >/dev/null
}

run_platform() { # platform zip
  local i=0 version
  if [[ -n "${ONLY:-}" ]]; then
    # ONLY=full|cut|plain|faults|code runs that one scenario on every version given.
    for version in "${VERSIONS[@]}"; do "scenario_$ONLY" "$1" "$version" "$2"; done
    return
  fi
  for version in "${VERSIONS[@]}"; do
    case "$version" in
      7.4) scenario_plain "$1" "$version" "$2" ;;
      *) if (( i % 2 == 0 )); then scenario_full "$1" "$version" "$2"; else scenario_cut "$1" "$version" "$2"; fi
         i=$((i + 1)) ;;
    esac
  done
}

# ── main ───────────────────────────────────────────────────────────────────────────────────────

say "run $RUN: images and network"
docker network create --label "$LABEL" "$NET" >/dev/null
for image in "${BASE_IMAGES[@]}"; do need_image "$image"; done
for version in "${VERSIONS[@]}"; do need_image "php:$version-apache"; build_target_image "$version"; done

if [[ "$WHICH" == all || "$WHICH" == wordpress ]]; then
  build_wordpress_source
  run_platform wordpress "$WORK/wordpress.zip"
fi
if [[ "$WHICH" == all || "$WHICH" == joomla ]]; then
  build_joomla_source
  run_platform joomla "$WORK/joomla.zip"
fi

say "$PASSES passed, $FAILS failed"
(( FAILS == 0 ))
