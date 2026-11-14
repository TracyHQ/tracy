#!/usr/bin/env bash
#
# The demo farm, end to end, on a real Docker (rootless is fine):
#
#   1. build the farm image (web/build.sh demos) when it is not here yet
#   2. stand up a Joomla 6 demo and a WordPress demo the per-site way: render-compose.sh's fresh
#      shapes on the official images, lean marker on, `docker compose up`, the CMS installed
#   3. fold both (provision/fold.sh), then check through 127.0.0.1:<HOST_PORT> AND through the name
#      `<label>-web-1` from another container on `<label>_default`: pages and titles, `/index.php/…`,
#      the admin login page, .htaccess deny rules, a translated php_value, open_basedir, and that
#      neither demo reaches the other's files, database or vhost
#   4. docker stats of the per-site pairs before and of the farm + forwarders after
#   5. unfold the Joomla demo (provision/unfold.sh) and check it again on its own containers, while
#      the WordPress demo keeps answering from the farm; then unfold that one too
#
# Everything it made — containers, volumes, networks, the farm image if it built it, its temp
# dirs — is removed by the trap, pass or fail. Refuses to run beside a real farm on this machine.
#
#   bash packages/fleet/tracy-fleet-operation/test/e2e/demo-farm/run.sh [--keep-image]
#
# Prints a RAM table and `E2E PASS` at the end; exits non-zero at the first failed check.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$(cd "$HERE/../../.." && pwd)"
SCRIPTS="$PKG/scripts"
KEEP_IMAGE=0
[ "${1:-}" = --keep-image ] && KEEP_IMAGE=1

say() { printf '\n### %s\n' "$*"; }
fail() { echo "E2E FAIL: $*" >&2; exit 1; }
check() { # description, then a command that must succeed
  local what="$1"; shift
  # Output is dropped here so a predicate can read its whole pipe (no grep -q under pipefail).
  if "$@" >/dev/null; then echo "  ok  $what"; else fail "$what"; fi
}

if docker inspect tracy-demos-web >/dev/null 2>&1 || docker inspect tracy-demos-db >/dev/null 2>&1; then
  fail "a demo farm already runs on this machine — this test would take its names"
fi

T="$(mktemp -d /tmp/tracy-farm-e2e.XXXXXX)"
SUFFIX="$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
J="e2ej$SUFFIX"; W="e2ew$SUFFIX"
export TRACY_PRIVATE_ROOT="$T/srv" TRACY_SITES_ROOT="$T/sites" TRACY_WEB_ENV_FILE=/dev/null
export TRACY_DEMOS_MAIL_NETWORK="" FLEET_ZONE=tracy.test TRACY_FARM_VERIFY_TRIES=20
# The draft-site egress fence needs root's iptables; a rootless Docker here declares it off, as a dev
# machine does (provision.sh's TRACY_EGRESS_FENCE). The farm itself is never fenced (farm-common.sh).
export TRACY_EGRESS_FENCE=off
export TRACY_HEAVY_LOCK="$(mktemp -u /tmp/tracy-farm-e2e-heavy.XXXXXX)" TRACY_TUNNEL=none
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
mkdir -p "$TRACY_PRIVATE_ROOT" "$TRACY_SITES_ROOT"
FARM_IMAGE="$(sed -n 's/^[^#][^=]*=//p' "$PKG/web/DEMOS_IMAGE" | sed -n 1p)"
BUILT_IMAGE=0
VOLUMES_BEFORE="$(docker volume ls -q | sort)"

cleanup() {
  local rc=$?
  set +e
  say "cleanup"
  for label in "$J" "$W"; do
    [ -f "$T/srv/$label/docker-compose.yml" ] && ( cd "$T/srv/$label" && docker compose down -v --remove-orphans >/dev/null 2>&1 )
    docker rm -f "$label-web-1" "$label-db-1" >/dev/null 2>&1
    docker volume rm "${label}_db" >/dev/null 2>&1
    docker network rm "${label}_default" >/dev/null 2>&1
  done
  if [ -f "$T/srv/_demos/compose.yml" ]; then
    docker compose --project-directory "$T/srv/_demos" -f "$T/srv/_demos/compose.yml" down -v --remove-orphans >/dev/null 2>&1
  fi
  docker rm -f tracy-demos-web tracy-demos-db >/dev/null 2>&1
  docker volume rm tracy-demos_db tracy-demos_opcache >/dev/null 2>&1
  docker network rm tracy-demos-front tracy-demos-back >/dev/null 2>&1
  # Files the containers wrote belong to their users (sub-uids on a rootless docker): removed from inside.
  docker run --rm -v "$T:/t" --entrypoint sh mariadb:11 -c 'rm -rf /t/* /t/.[!.]*' >/dev/null 2>&1
  rm -rf "$T"
  rm -f "/var/lock/tracy-provision-$J.lock" "/var/lock/tracy-provision-$W.lock" "$TRACY_HEAVY_LOCK"
  if [ "$BUILT_IMAGE" = 1 ] && [ "$KEEP_IMAGE" = 0 ]; then docker image rm "$FARM_IMAGE" >/dev/null 2>&1; fi
  local left
  left="$(docker ps -a --format '{{.Names}}' | grep -E "^($J|$W)-|^tracy-demos-" || true)$(docker volume ls -q | grep -E "^($J|$W)_|^tracy-demos_" || true)$(docker network ls --format '{{.Name}}' | grep -E "^($J|$W)_|^tracy-demos-" || true)"
  left="$left$(comm -13 <(printf '%s\n' "$VOLUMES_BEFORE") <(docker volume ls -q | sort) | sed 's/^/ volume:/')"
  [ -z "$left" ] && echo "  cleanup complete: no container, volume (named or anonymous) or network of this run is left" || echo "  !! left behind: $left"
  exit "$rc"
}
trap cleanup EXIT

# ── 1. the farm image ───────────────────────────────────────────────────────────────────────────
say "farm image $FARM_IMAGE"
if ! docker image inspect "$FARM_IMAGE" >/dev/null 2>&1; then
  BUILT_IMAGE=1
  bash "$PKG/web/build.sh" demos | tail -n 3
fi
docker image inspect "$FARM_IMAGE" >/dev/null

# ── 2. two demos, the per-site way ──────────────────────────────────────────────────────────────
free_port() {
  python3 -c 'import socket
for p in range(52500, 52999):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", p)); s.close(); print(p); break
    except OSError: pass'
}

stand_up() { # label platform image
  local label="$1" platform="$2" image="$3" port
  port="$(free_port)"
  mkdir -p "$T/srv/$label/apache" "$T/sites/$label/.webroot"
  : > "$T/srv/$label/network-isolated"
  {
    echo "HOST_PORT=$port"
    echo "PLATFORM=$platform"
    echo "DB_PASSWORD=$(head -c 18 /dev/urandom | base64 | tr -dc A-Za-z0-9)"
    echo "TRACY_MAIL_TOKEN=e2etoken$SUFFIX"
    echo "JOOMLA_ADMIN_PASSWORD=E2e-$(head -c 12 /dev/urandom | base64 | tr -dc A-Za-z0-9)"
  } > "$T/srv/$label/.env"
  chmod 600 "$T/srv/$label/.env"
  docker network create "${label}_default" >/dev/null
  ( set -e
    . "$SCRIPTS/lib/roots.sh"
    . "$SCRIPTS/lib/site-apache-conf.sh"
    . "$SCRIPTS/provision/render-compose.sh"
    printf 'LoadModule headers_module /usr/lib/apache2/modules/mod_headers.so\n' > "$T/srv/$label/apache/headers.load"
    tracy_write_apache_conf "$T/srv/$label" on
    tracy_write_demo_limits "$T/srv/$label" on
    SITE_DIR="$T/srv/$label" LABEL="$label" PLATFORM="$platform" WEB_IMAGE="$image" COMPOSE_FLAVOR=fresh \
      DB_NAME=site DB_SQL_MODE=NO_ENGINE_SUBSTITUTION TRACY_SITE_MEMORY=1g TRACY_SITE_DB_MEMORY=512m \
      tracy_render_compose )
  ( cd "$T/srv/$label" && docker compose up -d ) >/dev/null 2>&1
  echo "$port"
}

# curl the demo on this host: code<TAB>title (redirects not followed)
get() { # port path [host]
  curl -s -o "$T/body" -w '%{http_code}' --max-time 60 -H "X-Forwarded-Host: ${3:-x}" -H 'X-Forwarded-Proto: https' \
    "http://127.0.0.1:$1$2" || true
}
title() { python3 -c 'import re,sys,html; m=re.search(r"<title[^>]*>(.*?)</title>", open(sys.argv[1], errors="replace").read(), re.S|re.I); print(" ".join(html.unescape(m.group(1)).split()) if m else "")' "$T/body"; }
wait_for() { # port path host want-code seconds
  local i code
  for ((i = 0; i < $5; i += 3)); do
    code="$(get "$1" "$2" "$3")"
    [ "$code" = "$4" ] && return 0
    sleep 3
  done
  echo "  (last answer: $code)"; return 1
}

say "Joomla 6 demo $J (joomla:6-apache, fresh install) and WordPress demo $W (wordpress:php8.4-apache)"
JP="$(stand_up "$J" joomla joomla:6-apache)"
WP="$(stand_up "$W" wordpress wordpress:php8.4-apache)"
JH="$J.tracy.test"; WH="$W.tracy.test"
echo "  $J on 127.0.0.1:$JP, $W on 127.0.0.1:$WP"
check "Joomla installs itself and answers /" wait_for "$JP" / "$JH" 200 300
check "WordPress copies its core and answers the installer" wait_for "$WP" /wp-admin/install.php "$WH" 200 180

# WordPress: the install ceremony, over HTTP as a browser would, at its https address.
curl -s -o /dev/null --max-time 120 -H "X-Forwarded-Host: $WH" -H 'X-Forwarded-Proto: https' \
  --data-urlencode "weblog_title=Farm E2E" --data-urlencode "user_name=tracyagent" \
  --data-urlencode "admin_password=E2e-wp-$SUFFIX-pass" --data-urlencode "admin_password2=E2e-wp-$SUFFIX-pass" \
  --data-urlencode "pw_weak=1" --data-urlencode "admin_email=agent@tracy.test" --data-urlencode "blog_public=0" \
  "http://127.0.0.1:$WP/wp-admin/install.php?step=2"
check "WordPress is installed and answers / with 200" wait_for "$WP" / "$WH" 200 60

# Joomla: an article on the home page linking two pages, so fold compares more than `/`; and the
# .htaccess a provision puts there (htaccess.txt + Tracy's hardening) with one php_value line that
# mod_php honours and the farm must carry over; a dump file it must deny; a probe of PHP's view.
. "$SCRIPTS/lib/roots.sh"
. "$SCRIPTS/lib/site-runtime.sh"
. "$SCRIPTS/lib/webroot-htaccess.sh"
mkdir -p "$T/harden" && tracy_harden_htaccess "$T/harden" >/dev/null && HARDEN="$(cat "$T/harden/.htaccess")"
for label in "$J" "$W"; do
  tracy_site_web_exec "$label" -i -- sh -c '
    [ -f .htaccess ] || cp htaccess.txt .htaccess 2>/dev/null || : > .htaccess
    cat >> .htaccess
    printf "%s\n" "php_value upload_max_filesize 33M" >> .htaccess
    echo "-- a dump that must never be served" > secret.sql
    mkdir -p .git && echo "[core]" > .git/config
    cat > tracyprobe.php <<"PHP"
<?php
header("Content-Type: text/plain");
echo "upload_max_filesize=", ini_get("upload_max_filesize"), "\n";
echo "open_basedir=", ini_get("open_basedir"), "\n";
echo "label=", getenv("TRACY_MAIL_LABEL"), "\n";
echo "path_info=", $_SERVER["PATH_INFO"] ?? "", "\n";
echo "server_port=", $_SERVER["SERVER_PORT"] ?? "", "\n";
$other = $_GET["other"] ?? "";
if ($other !== "") { echo "other_readable=", (@file_get_contents($other) !== false ? "yes" : "no"), "\n"; }
PHP
  ' <<<"$HARDEN"
done
JDB_PW="$(sed -n 's/^DB_PASSWORD=//p' "$T/srv/$J/.env")"
MYSQL_PWD="$JDB_PW" docker exec -i -e MYSQL_PWD "$J-db-1" mariadb -uroot site <<'SQL'
SET @now = NOW();
INSERT INTO tr_content (asset_id, title, alias, introtext, `fulltext`, state, catid, created, created_by, modified, modified_by, publish_up, featured, access, language, metakey, metadesc, metadata, attribs, urls, images, note, version, hits)
VALUES (0, 'Farm welcome', 'farm-welcome',
  '<p>Read <a href="/index.php/component/content/article/farm-welcome?catid=2&amp;Itemid=101">the welcome page</a> or <a href="/index.php/component/users/login?Itemid=101">sign in</a>.</p>',
  '', 1, 2, @now, 1, @now, 1, @now, 1, 1, '*', '', '', '{}', '{}', '{}', '{}', '', 1, 0);
SET @id = LAST_INSERT_ID();
INSERT INTO tr_content_frontpage (content_id, ordering) VALUES (@id, 1);
INSERT INTO tr_workflow_associations (item_id, stage_id, extension) VALUES (@id, 1, 'com_content.article');
SQL
check "the Joomla home page shows the article and its links" sh -c "[ \"\$(curl -s -H 'X-Forwarded-Host: $JH' http://127.0.0.1:$JP/ | grep -c 'Farm welcome')\" -ge 1 ]"

# What each demo answers before the farm: the pages the checks below compare against.
declare -A BEFORE
record() { # key port path host
  local code; code="$(get "$2" "$3" "$4")"; BEFORE["$1"]="$code	$(title)"
}
J_PAGES=(/ "/index.php/component/users/login?Itemid=101" "/index.php/component/content/article/farm-welcome?catid=2&Itemid=101" /administrator/)
W_PAGES=(/ "/?p=1" "/?page_id=2" /wp-login.php)
for p in "${J_PAGES[@]}"; do record "J$p" "$JP" "$p" "$JH"; done
for p in "${W_PAGES[@]}"; do record "W$p" "$WP" "$p" "$WH"; done
for k in "${!BEFORE[@]}"; do echo "  before $k → ${BEFORE[$k]}"; done | sort

# What a container holds in memory: the PSS of every process in it (shared pages split between
# their sharers, so one OPcache arena counts once), its anonymous part, and its shared memory, MiB.
# A privileged exec, for this measurement only: reading another uid's smaps needs ptrace rights.
# Not `docker stats`: on a rootless docker without a delegated memory controller it reports the
# daemon's whole cgroup for every container.
stats() { # names… → "name pss anon shmem" lines
  local c
  for c in "$@"; do
    docker exec --privileged -u 0 "$c" sh -c 'cat /proc/[0-9]*/smaps_rollup 2>/dev/null; true' \
      | awk -v n="$c" '/^Pss:/ { p += $2 } /^Pss_Anon:/ { a += $2 } /^Pss_Shmem:/ { s += $2 }
                       END { printf "%s %.1f %.1f %.1f\n", n, p / 1024, a / 1024, s / 1024 }'
  done
}
warm() { # port host → 20 requests on its pages
  local i
  for i in 1 2 3 4 5; do for p in "${@:3}"; do curl -s -o /dev/null -H "X-Forwarded-Host: $2" -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$1$p"; done; done
}
warm "$JP" "$JH" "${J_PAGES[@]}"; warm "$WP" "$WH" "${W_PAGES[@]}"
sleep 3
RAM_BEFORE="$(stats "$J-web-1" "$J-db-1" "$W-web-1" "$W-db-1")"

# A routine, a trigger and a MariaDB event in the Joomla demo's database: fold and unfold must carry
# all three (the copy is compared object by object as well as table by table).
MYSQL_PWD="$JDB_PW" docker exec -i -e MYSQL_PWD "$J-db-1" mariadb -uroot site <<'SQL'
CREATE TABLE tr_e2e_log (n INT);
CREATE TRIGGER tr_e2e_bump BEFORE INSERT ON tr_e2e_log FOR EACH ROW SET NEW.n = NEW.n + 1;
CREATE PROCEDURE tr_e2e_answer() SELECT 42;
CREATE EVENT tr_e2e_sweep ON SCHEDULE EVERY 1 DAY DO DELETE FROM tr_e2e_log WHERE n < 0;
CREATE VIEW tr_e2e_view AS SELECT n FROM tr_e2e_log;
CREATE TABLE tr_e2e_note (t TEXT);
INSERT INTO tr_e2e_note VALUES ('CREATE DEFINER=`writer`@`localhost` VIEW v AS SELECT 1 | /*!50013 DEFINER=`w`@`h` SQL SECURITY DEFINER */ | /*!50017 DEFINER=`w`@`h`*/ | /*!50117 DEFINER=`w`@`h`*/');
SQL
NOTE_SQL="SELECT MD5(t) FROM tr_e2e_note"
NOTE_MD5="$(MYSQL_PWD="$JDB_PW" docker exec -i -e MYSQL_PWD "$J-db-1" mariadb -uroot -N -B site -e "$NOTE_SQL")"
note_of() { tracy_site_db_exec "$1" mariadb -N -B -e "$NOTE_SQL" "$(tracy_site_db_name "$1")"; }
OBJECTS_SQL="SELECT CONCAT('routines ', (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE()), ' triggers ', (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()), ' events ', (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA = DATABASE()))"
objects_of() { # label → the counts in its active runtime's database
  tracy_site_db_exec "$1" mariadb -N -B -e "$OBJECTS_SQL" "$(tracy_site_db_name "$1")"
}
check "$J's own database holds one routine, one trigger, one event" [ "$(objects_of "$J")" = "routines 1 triggers 1 events 1" ]

# ── 3. fold ─────────────────────────────────────────────────────────────────────────────────────
say "fold $J"
bash "$SCRIPTS/provision/fold.sh" "$J" --root "$T/srv" --probe-host "$JH" | tee "$T/fold-j.out"
check "fold says how long $J had no server" grep -q 'was without a server for [0-9]* s' "$T/fold-j.out"
FOLD_GAP="$(sed -n 's/.*was without a server for \([0-9]*\) s.*/\1/p' "$T/fold-j.out")"
echo "  measured: $J had no server for $FOLD_GAP s during its fold"
check "the routine, trigger and event came along into the farm" [ "$(objects_of "$J")" = "routines 1 triggers 1 events 1" ]
check "a row holding definer text came along byte for byte, the view too" sh -c \
  "[ '$(note_of "$J")' = '$NOTE_MD5' ] && [ -n '$NOTE_MD5' ]"
check "the view answers in the farm, as the demo" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; tracy_site_db_exec '$J' mariadb -N -B -e 'SELECT COUNT(*) FROM tr_e2e_view' \"\$(tracy_site_db_name '$J')\" >/dev/null"
check "the trigger still fires in the farm" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; S=\$(tracy_site_db_name '$J'); tracy_site_db_exec '$J' mariadb -N -B -e 'INSERT INTO tr_e2e_log VALUES (1); SELECT MAX(n) FROM tr_e2e_log; CALL tr_e2e_answer();' \"\$S\" | tr '\\n' ' ' | grep '^2 42 '"

say "a link out of $W's webroot stops its fold"
tracy_site_web_exec "$W" -- ln -s "/site/$J/.webroot/configuration.php" leak.txt
check "fold of $W refuses it, by path, and changes nothing" sh -c \
  "! bash '$SCRIPTS/provision/fold.sh' '$W' --root '$T/srv' > '$T/fold-w.out' 2>&1 && grep -q 'leak.txt -> /site/$J/.webroot/configuration.php' '$T/fold-w.out'"
check "$W is still on its own containers, answering as before" sh -c \
  "[ ! -e '$T/srv/$W/runtime' ] && [ \"\$(docker inspect -f '{{.State.Running}}' $W-db-1)\" = true ]"
check "$W: / still answers 200" [ "$(get "$WP" / "$WH")" = 200 ]
tracy_site_web_exec "$W" -- rm -f leak.txt
# A chain: no single target names another demo, the end does.
tracy_site_web_exec "$W" -- sh -c "ln -s /site/$W/.webroot base && ln -s base/.. parent && ln -s parent/../$J/.webroot/configuration.php chain.txt"
check "fold of $W refuses a chain of links that ends in $J's webroot" sh -c \
  "! bash '$SCRIPTS/provision/fold.sh' '$W' --root '$T/srv' > '$T/fold-w2.out' 2>&1 && grep -q 'chain.txt -> parent/../$J/.webroot/configuration.php' '$T/fold-w2.out'"
tracy_site_web_exec "$W" -- rm -f base parent chain.txt
say "fold $W"
bash "$SCRIPTS/provision/fold.sh" "$W" --root "$T/srv"
check "a second fold of $J changes nothing" sh -c "bash '$SCRIPTS/provision/fold.sh' '$J' --root '$T/srv' | grep 'already served by the demo farm'"

check "$J is marked farm" [ "$(tracy_site_runtime "$J")" = farm ]
check "$W is marked farm" [ "$(tracy_site_runtime "$W")" = farm ]
check "$J-db-1 and $W-db-1 are gone" sh -c "! docker inspect $J-db-1 >/dev/null 2>&1 && ! docker inspect $W-db-1 >/dev/null 2>&1"
check "their database volumes are kept" sh -c "docker volume inspect ${J}_db >/dev/null && docker volume inspect ${W}_db >/dev/null"
check "$J-web-1 is the forwarder" [ "$(docker inspect -f '{{index .Config.Labels "tracy.runtime"}}' "$J-web-1")" = farm ]

same_as_before() { # key port path host
  local code; code="$(get "$2" "$3" "$4")"
  [ "$code	$(title)" = "${BEFORE[$1]}" ] || { echo "    $1: before [${BEFORE[$1]}] now [$code	$(title)]"; return 1; }
}
pages_unchanged() { # J|W
  local p ok=0
  if [ "$1" = J ]; then for p in "${J_PAGES[@]}"; do same_as_before "J$p" "$JP" "$p" "$JH" || ok=1; done
  else for p in "${W_PAGES[@]}"; do same_as_before "W$p" "$WP" "$p" "$WH" || ok=1; done; fi
  return $ok
}
probe() { curl -s -H "X-Forwarded-Host: $3" "http://127.0.0.1:$1$2"; }
php_checks() { # label port host other-label
  local out
  out="$(probe "$2" "/tracyprobe.php/some/path/info?other=/site/$4/.webroot/tracyprobe.php" "$3")"
  printf '%s\n' "$out" | sed 's/^/    /'
  printf '%s' "$out" | grep -x 'upload_max_filesize=33M' >/dev/null &&
  printf '%s' "$out" | grep -x 'path_info=/some/path/info' >/dev/null &&
  printf '%s' "$out" | grep -x "server_port=$2" >/dev/null
}

for D in J W; do
  if [ $D = J ]; then L="$J"; P="$JP"; H="$JH"; O="$W"; else L="$W"; P="$WP"; H="$WH"; O="$J"; fi
  say "$L through the farm"
  check "$L: every page answers as before (code + title), through 127.0.0.1:$P" pages_unchanged $D
  check "$L: a .sql dump is denied (403)" [ "$(get "$P" /secret.sql "$H")" = 403 ]
  check "$L: a .git directory is hidden (404)" [ "$(get "$P" /.git/config "$H")" = 404 ]
  check "$L: php_value carried over, PATH_INFO and SERVER_PORT as before" php_checks "$L" "$P" "$H" "$O"
  check "$L: open_basedir holds the demo to its own docroot" sh -c "curl -s -H 'X-Forwarded-Host: $H' 'http://127.0.0.1:$P/tracyprobe.php' | grep '^open_basedir=/site/$L/.webroot/:'"
  check "$L: it cannot read the other demo's files" sh -c "curl -s -H 'X-Forwarded-Host: $H' 'http://127.0.0.1:$P/tracyprobe.php?other=/site/$O/.webroot/tracyprobe.php' | grep -x 'other_readable=no'"
  check "$L: the pool's env is its own" sh -c "curl -s -H 'X-Forwarded-Host: $H' 'http://127.0.0.1:$P/tracyprobe.php' | grep -x 'label=$L'"
  check "$L: a request naming the other demo's host still gets $L" sh -c "curl -s -H 'X-Forwarded-Host: $O.tracy.test' -H 'Host: $O.tracy.test' 'http://127.0.0.1:$P/tracyprobe.php' | grep -x 'label=$L'"
  check "$L: reached by name $L-web-1 from another container on ${L}_default (SERVER_PORT 80)" sh -c \
    "docker run --rm --network ${L}_default --entrypoint curl $FARM_IMAGE -s -H 'X-Forwarded-Host: $H' http://$L-web-1/tracyprobe.php > '$T/byname' && grep -qx 'label=$L' '$T/byname' && grep -qx 'server_port=80' '$T/byname'"
done
say "one demo's PHP cannot reach another demo's PHP-FPM socket"
# The socket gap: FPM takes PHP_ADMIN_VALUE from whoever connects, so a demo whose PHP could open
# another demo's pool socket could run that demo's scripts as that pool, with any ini it likes.
# $W gets a marker script; $J's PHP (served by the farm) sends a FastCGI request for it to $W's
# socket — through stream_socket_client and through curl's CURLOPT_UNIX_SOCKET_PATH.
tracy_site_web_exec "$W" -i -- sh -c 'cat > tracymarker.php' <<PHP
<?php
file_put_contents('/tmp/tracy-demos/$W/crossed', 'ran');
echo 'RAN-AS-B';
PHP
tracy_site_web_exec "$J" -i -- sh -c 'cat > tracycross.php' <<PHP
<?php
header('Content-Type: text/plain');
\$sock = '/run/tracy-demos/$W.sock';
\$rec = static fn(int \$t, string \$b): string => pack('CCnnCx', 1, \$t, 1, strlen(\$b), 0) . \$b;
\$pair = static fn(string \$k, string \$v): string => chr(strlen(\$k)) . chr(strlen(\$v)) . \$k . \$v;
\$params = \$pair('SCRIPT_FILENAME', '/site/$W/.webroot/tracymarker.php') . \$pair('REQUEST_METHOD', 'GET')
  . \$pair('PHP_ADMIN_VALUE', 'open_basedir=/');
\$req = \$rec(1, pack('nCx5', 1, 0)) . \$rec(4, \$params) . \$rec(4, '') . \$rec(5, '');
\$s = @stream_socket_client('unix://' . \$sock, \$errno, \$err, 3);
if (\$s) { fwrite(\$s, \$req); stream_set_timeout(\$s, 5); \$out = (string) stream_get_contents(\$s); fclose(\$s);
  echo 'stream=connected', str_contains(\$out, 'RAN-AS-B') ? ' ran' : ' no-run', "\n"; }
else { echo 'stream=refused ', \$errno, ' ', \$err, "\n"; }
if (function_exists('curl_init')) {
  \$c = curl_init('http://localhost/');
  curl_setopt_array(\$c, [CURLOPT_UNIX_SOCKET_PATH => \$sock, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 3]);
  curl_exec(\$c);
  echo 'curl=', curl_errno(\$c) === 7 ? 'refused' : 'connected', ' ', curl_errno(\$c), ' ', curl_error(\$c), "\n";
} else { echo "curl=absent\n"; }
PHP
curl -s -H "X-Forwarded-Host: $JH" "http://127.0.0.1:$JP/tracycross.php" > "$T/cross.out" || true
sed 's/^/    /' "$T/cross.out"
check "$J's PHP cannot open $W's FPM socket (stream_socket_client)" grep -q '^stream=refused' "$T/cross.out"
check "$J's PHP cannot open $W's FPM socket (curl CURLOPT_UNIX_SOCKET_PATH)" grep -Eq '^curl=(refused|absent)' "$T/cross.out"
# What an upload does: PHP (www-data) writes a file into the webroot, then Apache — now its own user,
# in the www-data group — serves it as a static file.
tracy_site_web_exec "$J" -i -- sh -c 'cat > tracyupload.php' <<'PHP'
<?php
@mkdir(__DIR__ . '/images/e2e', 0755, true);
echo file_put_contents(__DIR__ . '/images/e2e/upload.txt', "uploaded-by-php\n") ? "written\n" : "failed\n";
PHP
check "$J: PHP in the farm writes an upload into its webroot (www-data)" sh -c \
  "curl -s -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/tracyupload.php' | grep -x written"
check "$J: Apache (farmhttp) serves the uploaded file" sh -c \
  "curl -s -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/images/e2e/upload.txt' | grep -x uploaded-by-php"
check "nothing ran in $W's pool" sh -c "! docker exec tracy-demos-web test -e /tmp/tracy-demos/$W/crossed"
check "the sockets belong to Apache's own user, 0600; workers run as www-data" sh -c \
  "docker exec tracy-demos-web sh -c 'stat -c \"%U %a\" /run/tracy-demos/$W.sock /run/tracy-demos/_farm.sock' | sort -u | grep -x 'farmhttp 600' && [ \"\$(docker exec tracy-demos-web sh -c 'ps -o user= -C apache2 | sort -u | grep -v root')\" = farmhttp ]"
check "a port no demo owns serves no demo (farm default port refuses)" sh -c \
  "[ \"\$(docker exec tracy-demos-web curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/index.php)\" = 403 ]"

say "database isolation"
WUSER="$(sed -n 's/^FARM_DB_USER=//p' "$T/srv/$W/.env")"; WPASS="$(sed -n 's/^FARM_DB_PASSWORD=//p' "$T/srv/$W/.env")"
JSCHEMA="$(sed -n 's/^FARM_DB_NAME=//p' "$T/srv/$J/.env")"
check "$W's database user cannot read $J's schema" sh -c \
  "! MYSQL_PWD='$WPASS' docker exec -e MYSQL_PWD tracy-demos-db mariadb -u'$WUSER' -N -e 'SELECT COUNT(*) FROM \`$JSCHEMA\`.tr_content' 2>/dev/null"
check "$W's database user sees only its own schema" sh -c \
  "[ \"\$(MYSQL_PWD='$WPASS' docker exec -e MYSQL_PWD tracy-demos-db mariadb -u'$WUSER' -N -e 'SHOW DATABASES' | grep -vx information_schema)\" = '$(sed -n 's/^FARM_DB_NAME=//p' "$T/srv/$W/.env")' ]"
check "tracy_site_db_exec reaches $J's farm schema as $J" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; tracy_site_db_exec '$J' mariadb -N -e 'SELECT title FROM tr_content WHERE alias=\"farm-welcome\"' '$JSCHEMA' | grep -x 'Farm welcome'"
check "tracy_site_web_exec runs as $J in the farm, in its docroot" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; [ \"\$(tracy_site_web_exec '$J' -- sh -c 'echo \$(id -un) \$(pwd) \$TRACY_MAIL_LABEL')\" = 'www-data /site/$J/.webroot $J' ]"
check "tracy_site_web_exec refuses root in the farm" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; ! tracy_site_web_exec '$J' -u root -- true 2>/dev/null"

# ── 4. RAM ──────────────────────────────────────────────────────────────────────────────────────
say "RAM"
warm "$JP" "$JH" "${J_PAGES[@]}"; warm "$WP" "$WH" "${W_PAGES[@]}"
sleep 3
RAM_AFTER_BUSY="$(stats tracy-demos-web tracy-demos-db "$J-web-1" "$W-web-1")"
echo "  waiting 25 s for the pools' idle timeout (20 s)"
sleep 25
RAM_AFTER_IDLE="$(stats tracy-demos-web tracy-demos-db "$J-web-1" "$W-web-1")"
sum() { awk '{ p += $2; a += $3; s += $4 } END { printf "PSS %.1f MiB (anon %.1f, shmem %.1f)", p, a, s }'; }
{
  echo "  name PSS anon shmem (MiB, summed over the container's processes)"
  echo "  per-site pairs, warm:"; printf '%s\n' "$RAM_BEFORE" | sed 's/^/    /'
  echo "    total $(printf '%s\n' "$RAM_BEFORE" | sum)"
  echo "  farm + forwarders, right after the same requests:"; printf '%s\n' "$RAM_AFTER_BUSY" | sed 's/^/    /'
  echo "    total $(printf '%s\n' "$RAM_AFTER_BUSY" | sum)"
  echo "  farm + forwarders, pools idle:"; printf '%s\n' "$RAM_AFTER_IDLE" | sed 's/^/    /'
  echo "    total $(printf '%s\n' "$RAM_AFTER_IDLE" | sum)"
} | tee "$T/ram.txt"
[ -n "${E2E_RAM_OUT:-}" ] && cp "$T/ram.txt" "$E2E_RAM_OUT"

# ── 5. unfold ───────────────────────────────────────────────────────────────────────────────────
say "unfold $J"
# A write already running in the farm when unfold starts (sleep, then INSERT) must not be lost: unfold
# waits for it before the dump. Started a second ahead; its row must be in the restored database.
tracy_site_web_exec "$J" -i -- sh -c 'cat > slowwrite.php' <<'PHP'
<?php
require __DIR__ . '/configuration.php';
$c = new JConfig();
sleep(8);
$m = new mysqli($c->host, $c->user, $c->password, $c->db);
$m->query('INSERT INTO tr_e2e_log VALUES (500)');
echo "wrote\n";
PHP
( curl -s --max-time 30 -H "X-Forwarded-Host: $JH" "http://127.0.0.1:$JP/slowwrite.php" > "$T/slow.out" 2>&1 || true ) &
SLOW_PID=$!
sleep 1
bash "$SCRIPTS/provision/unfold.sh" "$J" --root "$T/srv" --probe-host "$JH" | tee "$T/unfold-j.out"
wait "$SLOW_PID" || true
check "the write that was running when unfold started is in $J's own database" sh -c \
  "[ \"\$(MYSQL_PWD='$JDB_PW' docker exec -e MYSQL_PWD $J-db-1 mariadb -uroot -N -B site -e 'SELECT COUNT(*) FROM tr_e2e_log WHERE n = 501')\" = 1 ]"
check "unfold waited for $J's running PHP before the dump" grep -q "no request of $J runs in the farm any more" "$T/unfold-j.out"
check "the row holding definer text came home byte for byte" sh -c "[ '$(note_of "$J")' = '$NOTE_MD5' ]"
echo "  measured: $J had no server for $(sed -n 's/.*was without a server for \([0-9]*\) s.*/\1/p' "$T/unfold-j.out") s during its unfold"
check "$J is no longer marked" [ "$(tracy_site_runtime "$J")" = site ]
check "$J-web-1 and $J-db-1 are its own again" sh -c \
  "docker inspect -f '{{.Config.Image}}' $J-web-1 | grep '^joomla:6-apache' && [ \"\$(docker inspect -f '{{.State.Running}}' $J-db-1)\" = true ]"
check "$J: every page answers as before, from its own containers" pages_unchanged J
check "$J: php_value back in .htaccess, PATH_INFO as before" php_checks "$J" "$JP" "$JH" "$W"
check "$J: a .sql dump is denied (403)" [ "$(get "$JP" /secret.sql "$JH")" = 403 ]
check "the routine, trigger and event came home with the unfold" [ "$(objects_of "$J")" = "routines 1 triggers 1 events 1" ]
check "$J: configuration.php names its own database again" bash -c \
  ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/lib/site-runtime.sh'; tracy_site_web_exec '$J' -- grep -q \"public \\\$host = 'db';\" configuration.php"
check "the farm holds nothing of $J" sh -c \
  "[ ! -e '$T/srv/_demos/fpm/$J.conf' ] && ! grep -q '$J' '$T/srv/_demos/compose.yml' && ! grep -q '^FARM_DB' '$T/srv/$J/.env' && [ ! -d '$T/srv/$J/farm' ]"
check "$J's schema is gone from the farm" sh -c \
  "! MYSQL_PWD=\"\$(sed -n 's/^FARM_DB_ROOT_PASSWORD=//p' '$T/srv/_demos/.env')\" docker exec -e MYSQL_PWD tracy-demos-db mariadb -uroot -N -e 'SHOW DATABASES' | grep -x '$JSCHEMA'"
check "$W still answers from the farm, unchanged" pages_unchanged W

say "unfold $W"
bash "$SCRIPTS/provision/unfold.sh" "$W" --root "$T/srv"
check "$W: every page answers as before, from its own containers" pages_unchanged W
check "$W-web-1 runs WordPress again" sh -c "docker inspect -f '{{.Config.Image}}' $W-web-1 | grep '^wordpress:php8.4-apache'"
check "a second unfold of $W changes nothing" sh -c "bash '$SCRIPTS/provision/unfold.sh' '$W' --root '$T/srv' | grep 'not in the demo farm'"

# ── 6. part 2a: a folded demo's life through the real doors ─────────────────────────────────────
# Both demos folded again exactly as tracy-host's install ends (`provision.js` foldDemo: `fold.sh
# <label> --root <root>`, nothing else), then — on the Joomla one, through the real scripts — a frame
# policy change, a backup and a Restore everything, the content identity pass, a refused set-php,
# and the teardown, while the WordPress demo keeps answering from the farm.
say "install-shaped fold of $W, then of $J while $W is asked every 0.2 s (provision.js foldDemo's argv)"
bash "$SCRIPTS/provision/fold.sh" "$W" --root "$T/srv"
( while [ ! -e "$T/stop-probe" ]; do
    printf '%s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H "X-Forwarded-Host: $WH" "http://127.0.0.1:$WP/")" >> "$T/w-during-j"
    sleep 0.2
  done ) &
PROBE_PID=$!
bash "$SCRIPTS/provision/fold.sh" "$J" --root "$T/srv"
: > "$T/stop-probe"; wait "$PROBE_PID"
W_ASKED="$(grep -c . "$T/w-during-j")"; W_MISSED="$(grep -vc '^200$' "$T/w-during-j" || true)"
echo "  measured: $W was asked $W_ASKED times during $J's fold, $W_MISSED not answered 200 (the farm re-created to mount $J)"
check "$W was not interrupted beyond the farm's re-create to mount $J (at most ~3 s of probes)" [ "$W_MISSED" -le 15 ]
check "$J and $W are marked farm again" sh -c "[ \"\$(cat '$T/srv/$J/runtime' '$T/srv/$W/runtime' | tr -d '\n')\" = farmfarm ]"
check "the pools start no program (disable_functions, decision 5)" sh -c \
  "curl -s -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/tracyprobe.php' >/dev/null && docker exec tracy-demos-web grep -q '^php_admin_value\[disable_functions\] = exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec,symlink,link' /etc/tracy-demos/fpm/$J.conf"
tracy_site_web_exec "$J" -i -- sh -c 'cat > tracyexec.php' <<'PHP'
<?php
header("Content-Type: text/plain");
echo "exec=", function_exists("exec") ? "yes" : "no", " proc_open=", function_exists("proc_open") ? "yes" : "no",
  " symlink=", function_exists("symlink") ? "yes" : "no", " link=", function_exists("link") ? "yes" : "no", "\n";
try { symlink("/site/other/.webroot/configuration.php", "leak.txt"); } catch (Throwable $e) { }
echo "made=", is_link("leak.txt") ? "yes" : "no", "\n";
PHP
check "$J: PHP served by the farm cannot start a program nor make a link" sh -c \
  "curl -s -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/tracyexec.php' > '$T/exec.out'; grep -qx 'exec=no proc_open=no symlink=no link=no' '$T/exec.out' && grep -qx 'made=no' '$T/exec.out'"
check "$J: every page still answers as before (code + title)" pages_unchanged J

say "go-live of $J, as tracy-web's demo flow asks right after the install ({op: live, domains: []})"
# A rootless Docker maps the container's www-data to a sub-uid this user cannot write as; tracy-host
# runs as root on a host. The webroot is opened to this user (inside a container, as its root) so the
# host-side steps (the Joomla mail switch, the file half of a restore) can run here; the farm still
# serves it as www-data.
docker run --rm -v "$T/sites/$J/.webroot:/w" --entrypoint chmod mariadb:11 -R a+rwX /w
check "$J: noindex is on before go-live" sh -c \
  "curl -s -D - -o /dev/null -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/' | grep -i '^x-robots-tag: noindex'"
GOLIVE_OUT="$(bash "$SCRIPTS/provision/go-live.sh" --label "$J" --op live --root "$T/srv" 2>&1)" || { printf '%s\n' "$GOLIVE_OUT" | tail -15; fail "go-live of $J"; }
printf '%s\n' "$GOLIVE_OUT" | grep -E '^(==>|TRACY_RESULT)' | sed 's/^/    /'
printf '%s\n' "$GOLIVE_OUT" > "$T/golive.out"
check "go-live answers its receipt" grep -qx "TRACY_RESULT go_live=live label=$J platform=joomla" "$T/golive.out"
check "$J: the noindex header is gone through 127.0.0.1:$JP" sh -c \
  "! curl -s -D - -o /dev/null -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/' | grep -i '^x-robots-tag'"
check "$W: still noindexed (its own vhost)" sh -c \
  "curl -s -D - -o /dev/null -H 'X-Forwarded-Host: $WH' 'http://127.0.0.1:$WP/' | grep -i '^x-robots-tag: noindex'"
check "go-live --op draft of $J is refused, naming unfold" sh -c \
  "! bash '$SCRIPTS/provision/go-live.sh' --label '$J' --op draft --root '$T/srv' > '$T/draft.out' 2>&1 && grep -q 'unfold it first' '$T/draft.out'"
check "$J: pages unchanged after go-live" pages_unchanged J

say "frame policy of $J (webroot/site-frame-policy.mjs)"
FRAME_ORIGIN="https://panel.tracy.test:39129"
FRAME_POLICY="'self' https://*.tracy.test https://tracy.test http://127.0.0.1:* http://localhost:* $FRAME_ORIGIN"
FRAME_SAID="$(node "$SCRIPTS/webroot/site-frame-policy.mjs" "$T/srv" "$J" "$FRAME_POLICY" "$FRAME_ORIGIN")"
echo "  $FRAME_SAID"
check "the policy change is applied (state updated)" sh -c "printf '%s' '$FRAME_SAID' | grep '\"state\":\"updated\"'"
check "$J: the farm sends the new frame-ancestors through 127.0.0.1:$JP" sh -c \
  "curl -s -D - -o /dev/null -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/' | tr -d '\r' | grep -i '^content-security-policy: frame-ancestors' | grep -F '$FRAME_ORIGIN'"
check "$W: its own frame-ancestors are untouched" sh -c \
  "! curl -s -D - -o /dev/null -H 'X-Forwarded-Host: $WH' 'http://127.0.0.1:$WP/' | grep -F '$FRAME_ORIGIN'"
check "$J: the policy change kept every page" pages_unchanged J

say "backup and Restore everything of $J (webroot/webroot-backup.sh)"
bash "$SCRIPTS/webroot/webroot-git.sh" --label "$J" --op ensure >/dev/null
INITIAL="$(bash "$SCRIPTS/webroot/webroot-backup.sh" --label "$J" --op initial-backup | tail -1)"
echo "  initial backup: ${INITIAL:0:200}"
check "the initial backup holds the farm schema's dump" sh -c "printf '%s' '$INITIAL' | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d[\"database\"][\"ok\"] else 1)'"
tracy_site_db_exec "$J" mariadb "$JSCHEMA" -e "UPDATE tr_content SET title='Changed after the backup' WHERE alias='farm-welcome'"
check "$J shows the change" sh -c "curl -s -H 'X-Forwarded-Host: $JH' http://127.0.0.1:$JP/ | grep 'Changed after the backup'"
RESTORED="$(bash "$SCRIPTS/webroot/webroot-backup.sh" --label "$J" --op restore-everything --version 1 | tail -1)"
echo "  restore: ${RESTORED:0:300}"
check "Restore everything answers ok" sh -c "printf '%s' '$RESTORED' | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin)[\"ok\"] else 1)'"
check "$J: the change is gone and every page answers as before" pages_unchanged J
FARM_ROOT_PW="$(sed -n 's/^FARM_DB_ROOT_PASSWORD=//p' "$T/srv/_demos/.env")"
farm_schemas() { MYSQL_PWD="$FARM_ROOT_PW" docker exec -e MYSQL_PWD tracy-demos-db mariadb -uroot -N -e 'SHOW DATABASES' | grep '^d_' | sort | tr '\n' ' '; }
WSCHEMA="$(sed -n 's/^FARM_DB_NAME=//p' "$T/srv/$W/.env")"; JSCHEMA="$(sed -n 's/^FARM_DB_NAME=//p' "$T/srv/$J/.env")"
check "no scratch or trash schema was made on the farm server" sh -c "[ \"$(farm_schemas)\" = \"$(printf '%s\n' "$JSCHEMA" "$WSCHEMA" | sort | tr '\n' ' ')\" ]"
check "$W kept answering through the restore" pages_unchanged W

say "content identity of $J (tracy-host content-identity.js, the farm road)"
CI_OUT="$(cd "$PKG/../../../apps/tracy-host" && node --input-type=module -e "
  import { joomlaExecArgs } from './src/content-identity.js'
  import { execFileSync } from 'node:child_process'
  import { readFileSync } from 'node:fs'
  const args = await joomlaExecArgs({ label: '$J', siteDir: '$T/srv/$J', config: { privateRoot: '$T/srv' }, name: 'content-identity' })
  process.stdout.write(execFileSync('bash', args, { input: readFileSync('$SCRIPTS/provision/joomla-content-identity.php') }))
" 2>&1)" || true
printf '%s\n' "$CI_OUT" | sed 's/^/    /'
check "the identity script ran in the farm as $J and named its outcome" sh -c "printf '%s' '$CI_OUT' | grep '^TRACY_RESULT content_reader='"

say "an operation that changes the runtime is refused (set-php)"
check "set-php.sh refuses $J, naming unfold, and $J still answers" sh -c \
  "! bash '$SCRIPTS/provision/set-php.sh' --label '$J' --from 5.1 --to 5.2 --root '$T/srv' 2>'$T/refused' && grep -q 'unfold it first' '$T/refused'"
check "$J: still answering as before" pages_unchanged J

say "teardown of $J (provision/teardown.sh)"
docker run --rm -v "$T/sites/$J:/s" --entrypoint chown mariadb:11 -R 0:0 /s
mkdir -p "$T/jobs" "$T/hooks"
JOBS_DIR="$T/jobs" HOOK_LOG_DIR="$T/hooks" CF_CONFIG="$T/no-cloudflared.yml" \
  bash "$SCRIPTS/provision/teardown.sh" --label "$J" --root "$T/srv" > "$T/teardown.out" 2>&1 || { tail -20 "$T/teardown.out"; fail "teardown of $J"; }
tail -n 4 "$T/teardown.out" | sed 's/^/    /'
check "$J is gone: private dir, site folder, containers, volume" sh -c \
  "[ ! -e '$T/srv/$J' ] && [ ! -e '$T/sites/$J' ] && ! docker inspect $J-web-1 >/dev/null 2>&1 && ! docker volume inspect ${J}_db >/dev/null 2>&1"
check "the farm holds no vhost, pool or mount of $J" sh -c \
  "[ ! -e '$T/srv/_demos/fpm/$J.conf' ] && [ ! -e '$T/srv/_demos/apache/$J.conf' ] && ! grep -q '$J' '$T/srv/_demos/compose.yml'"
check "$J's schema and database user are gone from the farm" sh -c \
  "[ -z \"\$(MYSQL_PWD='$FARM_ROOT_PW' docker exec -e MYSQL_PWD tracy-demos-db mariadb -uroot -N -e \"SELECT 1 FROM mysql.user WHERE user='$JSCHEMA' UNION ALL SELECT 1 FROM information_schema.schemata WHERE schema_name='$JSCHEMA'\")\" ]"
check "port $JP is no longer a farm listener" sh -c \
  "[ \"\$(docker exec tracy-demos-web curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$JP/)\" = 000 ]"
check "$W kept answering from the farm through the teardown" pages_unchanged W

say "E2E PASS"
