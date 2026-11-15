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
# The farm web that serves now (the switcher's `.active-web`; the bare name before the first switch).
farm_web() { sed -n 1p "$T/srv/_demos/.active-web" 2>/dev/null || echo tracy-demos-web; }
check() { # description, then a command that must succeed
  local what="$1"; shift
  # Output is dropped here so a predicate can read its whole pipe (no grep -q under pipefail).
  if "$@" >/dev/null; then echo "  ok  $what"; else fail "$what"; fi
}

if docker ps -a --format '{{.Names}}' | grep -E '^tracy-demos-(web(-[ab])?|db)$' >/dev/null; then
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
    docker rm -fv "$label-web-1" "$label-db-1" "$label-oldfw" >/dev/null 2>&1
    docker volume rm "${label}_db" >/dev/null 2>&1
    docker network rm "${label}_default" >/dev/null 2>&1
  done
  if [ -f "$T/srv/_demos/compose.yml" ]; then
    docker compose --project-directory "$T/srv/_demos" -f "$T/srv/_demos/compose.yml" down -v --remove-orphans >/dev/null 2>&1
  fi
  docker rm -fv tracy-demos-web tracy-demos-web-a tracy-demos-web-b tracy-demos-db >/dev/null 2>&1
  docker volume rm tracy-demos_db tracy-demos_opcache >/dev/null 2>&1
  docker network rm tracy-demos-front tracy-demos-back >/dev/null 2>&1
  # Files the containers wrote belong to their users (sub-uids on a rootless docker): removed from inside.
  docker run --rm -v "$T:/t" --entrypoint sh mariadb:11 -c 'rm -rf /t/* /t/.[!.]*' >/dev/null 2>&1
  rm -rf "$T"
  rm -f "/var/lock/tracy-provision-$J.lock" "/var/lock/tracy-provision-$W.lock" "$TRACY_HEAVY_LOCK"
  if [ "$BUILT_IMAGE" = 1 ] && [ "$KEEP_IMAGE" = 0 ]; then docker image rm "$FARM_IMAGE" >/dev/null 2>&1; fi
  # Anonymous volumes this run's containers left (images that declare a VOLUME): the ones created since the
  # run began that no container uses. Never a volume that existed before, never one in use.
  local v
  for v in $(comm -13 <(printf '%s\n' "$VOLUMES_BEFORE") <(docker volume ls -q -f dangling=true | sort)); do
    case "$v" in *[!0-9a-f]*|"") ;; *) [ "${#v}" = 64 ] && docker volume rm "$v" >/dev/null 2>&1 ;; esac
  done
  local left
  left="$(docker ps -a --format '{{.Names}}' | grep -E "^($J|$W)-|^tracy-demos-" || true)$(docker volume ls -q | grep -E "^($J|$W)_|^tracy-demos_" || true)$(docker network ls --format '{{.Name}}' | grep -E "^($J|$W)_|^tracy-demos-" || true)"
  left="$left$(comm -13 <(printf '%s\n' "$VOLUMES_BEFORE") <(docker volume ls -q | sort) | sed 's/^/ volume:/')"
  [ ! -e "$T" ] || left="$left dir:$T"
  [ ! -e "$TRACY_HEAVY_LOCK" ] || left="$left tmp:$TRACY_HEAVY_LOCK"
  if [ -z "$left" ]; then
    echo "  cleanup complete: no container, volume (named or anonymous), network or temp dir of this run is left"
  else
    echo "  !! left behind: $left"
    [ "$rc" != 0 ] || rc=1
  fi
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
# Below the ephemeral range (32768-60999): the load probes open thousands of client sockets, and one of them
# holding a demo's port is an "address already in use" for the forwarder that must bind it.
free_port() {
  python3 -c 'import socket
for p in range(30500, 30999):
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

# `/` of the Joomla demo redirects to its landing page on the same host, as a multilingual Joomla
# sends `/` to `/en/`: fold must compare `/` as the redirect it is and the landing page behind it.
# The redirect has an EMPTY body (so no <title>), as WordPress's own redirects do: a baseline line
# ending in an empty title must verify equal.
tracy_site_web_exec "$J" -i -- sh -c 'cat > tracyredir.php <<"PHP"
<?php
http_response_code(301);
header("Location: https://" . $_SERVER["HTTP_X_FORWARDED_HOST"] . "/index.php");
PHP
printf "%s\n" "RewriteEngine On" "RewriteRule ^\$ /tracyredir.php [L]" | cat - .htaccess > .htaccess.new && mv .htaccess.new .htaccess'
check "the Joomla home page redirects to /index.php on its own host" sh -c "curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'X-Forwarded-Host: $JH' -H 'X-Forwarded-Proto: https' http://127.0.0.1:$JP/ | grep -E '^301 https?://[^/]+/index.php\$'"
check "the redirect has no title" sh -c "[ -z \"\$(curl -s -H 'X-Forwarded-Host: $JH' http://127.0.0.1:$JP/ | grep -i '<title')\" ]"
check "the landing page answers 200" [ "$(get "$JP" /index.php "$JH")" = 200 ]

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
check "nothing ran in $W's pool" sh -c "! docker exec $(farm_web) test -e /tmp/tracy-demos/$W/crossed"
check "the sockets belong to Apache's own user, 0600; workers run as www-data" sh -c \
  "docker exec $(farm_web) sh -c 'stat -c \"%U %a\" /run/tracy-demos/$W.sock /run/tracy-demos/_farm.sock' | sort -u | grep -x 'farmhttp 600' && [ \"\$(docker exec $(farm_web) sh -c 'ps -o user= -C apache2 | sort -u | grep -v root')\" = farmhttp ]"
check "a port no demo owns serves no demo (farm default port refuses)" sh -c \
  "[ \"\$(docker exec $(farm_web) curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/index.php)\" = 403 ]"

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
RAM_AFTER_BUSY="$(stats $(farm_web) tracy-demos-db "$J-web-1" "$W-web-1")"
echo "  waiting 25 s for the pools' idle timeout (20 s)"
sleep 25
RAM_AFTER_IDLE="$(stats $(farm_web) tracy-demos-db "$J-web-1" "$W-web-1")"
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
# The no-blip probe: clients ask folded demo $W through its forwarder's published port the whole time
# another demo's fold, unfold or farm-refresh changes the farm. Per set: PHP pages and static pages asked back to back (new connections by the hundred a second — the
# listener-close/backlog window of a stop), two 2 s PHP pages, one
# 25 s PHP page (a long request in flight across every switch). Every answer is recorded; the demo is
# fine only when each one is a 200: no 5xx, no reset (000), no timeout.
# Two sets run at once: through $W's forwarder as fold.sh made it (the CURRENT config: health-gated,
# one server per farm web) and through a forwarder left on the OLD config (one server, DNS-following,
# as every forwarder created before slots still is) — which is allowed to fail, in the documented old way.
tracy_site_web_exec "$W" -i -- sh -c 'cat > slow.php' <<'PHP'
<?php
sleep(2);
header("Content-Type: text/plain");
echo "slow-ok\n";
PHP
tracy_site_web_exec "$W" -i -- sh -c 'cat > slow25.php' <<'PHP'
<?php
sleep(25);
header("Content-Type: text/plain");
echo "slow25-ok\n";
PHP
# Static pages: Apache answers them alone, so six clients ask for hundreds of NEW connections a second —
# the ones that arrive in the instant a listener closes (a pause only keeps the client's own ephemeral
# ports from running out).
tracy_site_web_exec "$W" -i -- sh -c 'echo ok > ping.txt'
declare -A PROBE_PIDS
# Run a command with every output line stamped with the time, into $T/phase.log (shown when a probe failed):
# what the failures of a phase line up with.
timed() {
  local rc=0
  : > "$T/phase.log"
  { "$@" 2>&1 || rc=$?; } | while IFS= read -r l; do printf '%s %s\n' "$(date +%T.%N | cut -c1-12)" "$l"; done >> "$T/phase.log"
  return "$rc"
}
probe_start() { # set-name port host paths...
  local set="$1" port="$2" host="$3" path; shift 3
  rm -f "$T/probe-$set.stop" "$T/probe-$set.out" "$T/probe-$set.fail" "$T/probe-$set.died"
  : > "$T/probe-$set.out"
  PROBE_PIDS[$set]=""
  for path in "$@"; do
    ( set +e   # a curl that fails (reset, empty reply, timeout) is a RESULT to record, never an exit of this worker
      while [ ! -e "$T/probe-$set.stop" ]; do
        code="$(curl -s -o /dev/null -w '%{http_code} %{time_total} (connect %{time_connect}, first byte %{time_starttransfer})' --max-time 120 -H "X-Forwarded-Host: $host" "http://127.0.0.1:$port$path")"; rc=$?
        [ -n "$code" ] || code="000 - (no output)"
        if [ "$rc" != 0 ] && [ "${code%% *}" = 200 ]; then code="000 ${code#* }"; fi   # curl failed after a status: still a failure
        printf '%s\n' "${code%% *}" >> "$T/probe-$set.out"
        [ "$path" != /ping.txt ] || sleep 0.04
        [ "${code%% *}" = 200 ] || printf '%s %s rc=%s %s web=%s\n' "$(date +%T.%N)" "$path" "$rc" "$code" "$(farm_web)" >> "$T/probe-$set.fail"
      done
      exit 0 ) &
    PROBE_PIDS[$set]="${PROBE_PIDS[$set]} $!"
  done
  # The independent probe: raw TCP, eight clients, a static page, empty replies counted (tcp-probe.py).
  rm -f "$T/tcp-$set.out" "$T/tcp-$set.out.fail"
  python3 "$HERE/tcp-probe.py" "$port" "$host" /ping.txt "${TCP_CLIENTS:-8}" "$T/probe-$set.stop" "$T/tcp-$set.out" &
  PROBE_PIDS[$set]="${PROBE_PIDS[$set]} $!"
}
probe_stop() { # set-name -> PS_ASKED / PS_FAILED (curl workers and the raw TCP probe together); a worker that died is a failure.
  # NOT run in $(…): `wait` only sees the children of the shell that started them.
  local pid died=0
  : > "$T/probe-$1.stop"
  for pid in ${PROBE_PIDS[$1]}; do wait "$pid" || died=$((died + 1)); done
  [ ! -s "$T/probe-$1.fail" ] || sed "s/^/    failed request ($1): /" "$T/probe-$1.fail" >&2
  [ ! -s "$T/tcp-$1.out.fail" ] || sed "s/^/    failed raw TCP connection ($1): /" "$T/tcp-$1.out.fail" >&2
  local tcp_asked=0 tcp_failed=0
  [ ! -s "$T/tcp-$1.out" ] || read -r tcp_asked tcp_failed _ < "$T/tcp-$1.out"
  [ "$died" = 0 ] || echo "    $died probe worker(s) of $1 died — counted as failures" >&2
  PS_ASKED=$(( $(grep -c . "$T/probe-$1.out" || true) + tcp_asked ))
  PS_FAILED=$(( $(grep -vc '^200$' "$T/probe-$1.out" || true) + tcp_failed + died ))
}
NEW_PATHS=(/ / /ping.txt /ping.txt /ping.txt /ping.txt /ping.txt /ping.txt /slow.php /slow.php /slow25.php)
OLD_PATHS=(/ /ping.txt /ping.txt /ping.txt /ping.txt /slow.php /slow.php)
OLD_ASKED=0; OLD_FAILED=0
# What docker did while a phase ran (container and network events), and what the forwarder and the retired
# web logged: shown with any phase in which a probe failed.
export TRACY_FARM_KEEP_LOGS="$T/slotlogs"; mkdir -p "$TRACY_FARM_KEEP_LOGS"
EVENTS_PID=""
evidence_start() {
  [ -z "$EVENTS_PID" ] || { kill "$EVENTS_PID" 2>/dev/null; wait "$EVENTS_PID" 2>/dev/null || true; }
  rm -f "$T/events.log" "$TRACY_FARM_KEEP_LOGS"/*.log
  docker events --format '{{.TimeNano}} {{.Type}} {{.Action}} {{.Actor.Attributes.name}} {{.Actor.Attributes.container}}' > "$T/events.log" 2>/dev/null &
  EVENTS_PID=$!
}
evidence_show() { # since-epoch
  [ -z "$EVENTS_PID" ] || { kill "$EVENTS_PID" 2>/dev/null; wait "$EVENTS_PID" 2>/dev/null || true; EVENTS_PID=""; }
  echo "    evidence: docker events (container/network) during the phase:"
  awk '$2 == "container" && $3 ~ /^(create|start|die|kill|stop|destroy|restart)/ || $2 == "network" && $3 ~ /connect/ { t = $1 / 1e9; printf "      %s.%03d %s %s %s %s\n", strftime("%H:%M:%S", int(t)), (t - int(t)) * 1000, $2, $3, $4, $5 }' "$T/events.log" | grep -v "run-" | tail -60
  echo "    evidence: $W-web-1 (the current-config forwarder) log, state changes:"
  docker logs --timestamps --since "$1" "$W-web-1" 2>&1 | grep -E "DOWN|UP|IP changed|maintenance|no server" | sed 's/^/      /' | cut -c1-210 | tail -40
  local f
  for f in "$TRACY_FARM_KEEP_LOGS"/*.log; do
    [ -e "$f" ] || continue
    echo "    evidence: $(basename "$f") (tail):"; grep -vE '"(GET|POST) ' "$f" | tail -12 | sed 's/^/      /' | cut -c1-200
  done
}
probes_start() { # sets PROBE_T0
  PHASE_T0="$(date +%s)"; evidence_start
  echo "  probes start $(date +%T.%N)"
  probe_start new "$WP" "$WH" "${NEW_PATHS[@]}"
  probe_start old "$OLDP" "$WH" "${OLD_PATHS[@]}"
}
# E2E_PROBE_REPORT_ONLY=1 counts and reports without failing (to show what the old code does).
no_blip() {
  if [ "$PROBE_FAILED" = 0 ]; then echo "  ok  $1"
  elif [ "${E2E_PROBE_REPORT_ONLY:-0}" = 1 ]; then echo "  RED $1 ($PROBE_FAILED of $PROBE_ASKED)"; sed 's/^/    phase| /' "$T/phase.log" | tail -60; evidence_show "$PHASE_T0"
  else evidence_show "$PHASE_T0"; [ ! -s "$T/phase.log" ] || sed 's/^/    phase| /' "$T/phase.log" | grep -v "^ *phase| [0-9:.]* *$" | tail -80 >&2; fail "$1 ($PROBE_FAILED of $PROBE_ASKED)"; fi
}
probes_stop() { # name -> PROBE_ASKED/PROBE_FAILED (current-config forwarder), OLD_* totals (old-config forwarder)
  local old_asked old_failed
  probe_stop new; PROBE_ASKED=$PS_ASKED; PROBE_FAILED=$PS_FAILED
  probe_stop old; old_asked=$PS_ASKED; old_failed=$PS_FAILED
  echo "  probes end $(date +%T.%N)"
  OLD_ASKED=$((OLD_ASKED + old_asked)); OLD_FAILED=$((OLD_FAILED + old_failed))
  echo "  measured ($1): current-config forwarder $PROBE_ASKED asked, $PROBE_FAILED failed (curl + raw TCP; $(sort "$T/probe-new.out" | uniq -c | tr '\n' ' ')); old-config forwarder $old_asked asked, $old_failed failed"
}

say "install-shaped fold of $W, then of $J while $W is asked through a current-config and an old-config forwarder (provision.js foldDemo's argv)"
bash "$SCRIPTS/provision/fold.sh" "$W" --root "$T/srv"
# The old-config forwarder: what `tracy_farm_forward_cfg` rendered before web slots, started beside the farm.
OLDFW_IMAGE="$(bash -c ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/provision/render-compose.sh'; printf %s \"\$TRACY_DEMOS_FORWARD_IMAGE\"")"
cat > "$T/old-forward.cfg" <<'CFG'
global
    maxconn 256
    nbthread 1
defaults
    mode tcp
    timeout connect 5s
    timeout client 330s
    timeout server 330s
resolvers docker
    nameserver dns 127.0.0.11:53
    hold valid 2s
    hold other 2s
    hold refused 2s
    hold nx 2s
    hold timeout 2s
frontend demo
    bind :80
    default_backend farm
backend farm
    server farm "tracy-demos-web:${TRACY_DEMO_PORT}" resolvers docker init-addr last,libc,none
CFG
OLDP="$(free_port)"
docker run -d --name "$W-oldfw" --network tracy-demos-front -p "127.0.0.1:$OLDP:80" -e "TRACY_DEMO_PORT=$WP" \
  -v "$T/old-forward.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro" --entrypoint haproxy "$OLDFW_IMAGE" \
  -db -f /usr/local/etc/haproxy/haproxy.cfg >/dev/null
check "the old-config forwarder answers $W" wait_for "$OLDP" / "$WH" 200 30
check "$W's forwarder runs the current config (health-gated)" sh -c "docker exec '$W-web-1' grep -q 'http-check expect rstatus' /usr/local/etc/haproxy/haproxy.cfg"
check "the current-config forwarder answers $W (its server is ready)" wait_for "$WP" / "$WH" 200 30
DB_ID_BEFORE="$(docker inspect -f '{{.Id}} {{.State.StartedAt}}' tracy-demos-db)"
WEB_BEFORE="$(farm_web)"
probes_start
timed bash "$SCRIPTS/provision/fold.sh" "$J" --root "$T/srv"
probes_stop fold
check "the farm web was replaced by the other slot to mount $J ($WEB_BEFORE -> $(farm_web))" [ "$(farm_web)" != "$WEB_BEFORE" ]
check "only the serving slot is left, and it is ready" sh -c \
  "[ \"\$(docker ps -a --format '{{.Names}}' | grep -Ec '^tracy-demos-web(-[ab])?\$')\" = 1 ] && docker exec $(farm_web) test -f /run/tracy-demos-ready/ok"
check "the farm database was not re-created by it" [ "$(docker inspect -f '{{.Id}} {{.State.StartedAt}}' tracy-demos-db)" = "$DB_ID_BEFORE" ]
no_blip "$W: not one request failed while $J was folded in (no 5xx, no reset, no timeout; 25 s request in flight)"
check "$J and $W are marked farm again" sh -c "[ \"\$(cat '$T/srv/$J/runtime' '$T/srv/$W/runtime' | tr -d '\n')\" = farmfarm ]"
# A stop of the serving web is a DRAIN, whoever asks for it (the review's case: the image's inherited SIGQUIT
# was not trapped, a stop waited out 45 s and killed the container — exit 137 — and a request running in it
# got HTTP 000). A 25 s request is in flight when `docker stop` is asked directly, bypassing the switcher.
drain_check() { # when
SERVING="$(farm_web)"
# Let the pool's idle workers (pm.process_idle_timeout 20 s) and every straggler of the probes go first, so the
# request below meets an idle farm and what it measures is the stop.
sleep 25
echo "  idle before the request: $(docker exec "$SERVING" sh -c 'ps -eo args | grep -c "^php-fpm: pool"') php-fpm workers"
( curl -sS -o /dev/null -w '%{http_code} %{time_total} (connect %{time_connect}, first byte %{time_starttransfer})' --max-time 120 -H "X-Forwarded-Host: $WH" "http://127.0.0.1:$WP/slow25.php" > "$T/drain.code" 2> "$T/drain.err" ) &
DRAIN_PID=$!
sleep 4
echo "  before the stop: $(docker exec "$SERVING" sh -c 'ps -eo args | grep -c "^php-fpm: pool"') php-fpm workers, $(docker exec "$SERVING" sh -c 'awk "NR>1 && \$4==\"01\"" /proc/net/tcp | wc -l') established tcp connections in $SERVING"
STOP_T0=$(date +%s)
docker stop -t 45 "$SERVING" >/dev/null
STOP_SECS=$(( $(date +%s) - STOP_T0 ))
wait "$DRAIN_PID" || true
docker logs --tail 12 "$SERVING" 2>&1 | sed 's/^/    | /' | cut -c1-200
  docker logs --since 150s "$W-web-1" 2>&1 | grep -v "IP changed\|resolves again\|administratively" | tail -12 | sed 's/^/    fw| /' | cut -c1-220
echo "  measured: docker stop of $SERVING took ${STOP_SECS} s with a 25 s request running, exit code $(docker inspect -f '{{.State.ExitCode}}' "$SERVING"); the request answered $(cat "$T/drain.code") $(cat "$T/drain.err")"
check "$1: the request running in the stopped web finished with 200" [ "$(cut -d" " -f1 "$T/drain.code")" = 200 ]
check "$1: the stop drained: exit 0 (not 137), well under the 45 s grace period" sh -c "[ \"\$(docker inspect -f '{{.State.ExitCode}}' '$SERVING')\" = 0 ] && [ $STOP_SECS -lt 40 ]"
# The farm is down now; the next apply brings it back and leaves exactly one serving slot.
bash "$SCRIPTS/provision/farm-switch.sh" --root "$T/srv" >/dev/null 2>&1
check "$1: after a stopped web the next switch leaves one slot, serving and ready" sh -c \
  "[ \"\$(docker ps -a --format '{{.Names}}' | grep -Ec '^tracy-demos-web(-[ab])?\$')\" = 1 ] && docker exec $(farm_web) test -f /run/tracy-demos-ready/ok"
check "$1: $W answers again through its current-config forwarder" wait_for "$WP" / "$WH" 200 30
}
# The forwarders really follow the ready marker (an `http-check` haproxy ignores without `option httpchk`):
# a slot whose marker is gone gets no new connection — the forwarder answers at once that it has no server —
# and gets them again when the marker is back.
check "$W's forwarder logs no ignored http-check rule" sh -c "! docker logs '$W-web-1' 2>&1 | grep 'rules are ignored' >/dev/null"
docker exec "$(farm_web)" rm -f /run/tracy-demos-ready/ok
sleep "$(( $(bash -c ". '$SCRIPTS/lib/roots.sh'; . '$SCRIPTS/provision/render-compose.sh'; tracy_farm_down_wait") + 1 ))"
check "a farm web without its ready marker gets no new connection from a current-config forwarder" \
  sh -c "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 -H 'X-Forwarded-Host: $WH' 'http://127.0.0.1:$WP/ping.txt')\" != 200 ]"
docker exec "$(farm_web)" sh -c ": > /run/tracy-demos-ready/ok && chmod 644 /run/tracy-demos-ready/ok"
check "and gets them again when the marker is back" wait_for "$WP" /ping.txt "$WH" 200 20
drain_check "after the first switch"
[ "${E2E_DRAIN_ONLY:-0}" != 1 ] || { say "E2E DRAIN ONLY: PASS"; exit 0; }
say "unfold $J, fold it again, and move the farm to a new image tag, while $W is asked"
for ROUND in $(seq 1 "${E2E_PROBE_ROUNDS:-1}"); do
  probes_start
  timed bash "$SCRIPTS/provision/unfold.sh" "$J" --root "$T/srv" --probe-host "$JH"
  probes_stop unfold
  no_blip "$W: not one request failed while $J was unfolded (round $ROUND)"
  [ "${E2E_STOP_AFTER_UNFOLD:-0}" != 1 ] || { say "E2E STOP AFTER UNFOLD"; exit 0; }
  probes_start
  timed bash "$SCRIPTS/provision/fold.sh" "$J" --root "$T/srv"
  probes_stop refold
  no_blip "$W: not one request failed while $J was folded in again (round $ROUND)"
done
# A new farm image tag (the same image under a second name: the web is replaced for it).
NEW_TAG="$FARM_IMAGE-e2e2"
docker tag "$FARM_IMAGE" "$NEW_TAG"
probes_start
TRACY_DEMOS_IMAGE="$NEW_TAG" timed bash "$SCRIPTS/provision/farm-refresh.sh" "$J" --root "$T/srv"
probes_stop refresh
check "the farm web runs the new image tag" [ "$(docker inspect -f '{{.Config.Image}}' "$(farm_web)")" = "$NEW_TAG" ]
no_blip "$W: not one request failed while the farm moved to a new image tag"
# And back to the pinned tag through the explicit switch (what an operator runs after a deploy).
probes_start
timed bash "$SCRIPTS/provision/farm-switch.sh" --root "$T/srv"
probes_stop switch
check "the farm web is back on the pinned image" [ "$(docker inspect -f '{{.Config.Image}}' "$(farm_web)")" = "$FARM_IMAGE" ]
no_blip "$W: not one request failed while farm-switch.sh moved the farm back"
docker image rm "$NEW_TAG" >/dev/null 2>&1 || true
echo "  measured (all switches): the old-config forwarder was asked $OLD_ASKED times, $OLD_FAILED not 200 (allowed: it follows DNS as before slots)"
# The probe must be able to go RED: a farm web killed under load resets the connections it holds and refuses the
# ones that follow. If this phase does not count failures, every green above means nothing.
say "probe self-test: a farm web killed under load must turn the probe red"
probes_start
sleep 5
SELFTEST_WEB="$(farm_web)"
docker kill "$SELFTEST_WEB" >/dev/null
sleep 8
docker start "$SELFTEST_WEB" >/dev/null   # a rootless docker does not restart a killed container by policy
sleep 6
probes_stop selftest
check "the probe counted the reset ($PROBE_FAILED of $PROBE_ASKED not 200 after a docker kill)" [ "$PROBE_FAILED" -gt 0 ]
check "the farm web came back after the kill (restart policy)" wait_for "$WP" /ping.txt "$WH" 200 60
drain_check "after fold, unfold, re-fold, image tag and farm-switch"
# A rebuild-less crash: the serving slot is stopped by hand and a second, never-ready slot is left over —
# the next apply ends with exactly one serving slot.
SERVING="$(farm_web)"; OTHER="tracy-demos-web-b"; [ "$SERVING" != "$OTHER" ] || OTHER="tracy-demos-web-a"
docker run -d --name "$OTHER" --network tracy-demos-front --entrypoint sleep "$FARM_IMAGE" 600 >/dev/null
bash "$SCRIPTS/provision/farm-refresh.sh" "$J" --root "$T/srv" >/dev/null 2>&1
check "a leftover second web is gone after the next apply; one slot serves and is ready" sh -c \
  "[ \"\$(docker ps -a --format '{{.Names}}' | grep -Ec '^tracy-demos-web(-[ab])?\$')\" = 1 ] && docker exec $(farm_web) test -f /run/tracy-demos-ready/ok"
# ── a host whose forwarders are all on the OLD config (a pre-slot host): the migration order ────────────────
# docs/references/demo-farm.md: forwarders FIRST (each demo gets one short gap, at its own restart), then the
# farm (invisible). The other order gives every old-config forwarder a reset window at the switch AND the
# restart gap afterwards. Both are measured below with $W's own forwarder put back on the old config, as
# every forwarder of such a host is, and the raw TCP probe (8 clients, static page) on it.
FW_CFG="$T/srv/_demos/forward.haproxy.cfg"
tcp_only_start() { # name
  rm -f "$T/tcp-$1.stop" "$T/tcp-$1.out" "$T/tcp-$1.out.fail"
  python3 "$HERE/tcp-probe.py" "$WP" "$WH" /ping.txt 8 "$T/tcp-$1.stop" "$T/tcp-$1.out" &
  TCP_ONLY_PID=$!
}
tcp_only_stop() { # name -> TCP_ASKED / TCP_FAILED / TCP_WINDOW (seconds from the first to the last failure)
  : > "$T/tcp-$1.stop"; wait "$TCP_ONLY_PID" || true
  read -r TCP_ASKED TCP_FAILED TCP_WINDOW < "$T/tcp-$1.out"
  [ ! -s "$T/tcp-$1.out.fail" ] || { echo "    first failure $(head -1 "$T/tcp-$1.out.fail"), last $(tail -1 "$T/tcp-$1.out.fail")" ; }
}
put_forwarder_on_old_config() {
  cp "$T/old-forward.cfg" "$FW_CFG.tmp" && mv "$FW_CFG.tmp" "$FW_CFG"   # a new inode, as farm_ensure_files writes it
  docker restart -t 5 "$W-web-1" >/dev/null
  sleep 3
}
NEW_TAG2="$FARM_IMAGE-e2e3"; docker tag "$FARM_IMAGE" "$NEW_TAG2"
J_FW_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$J-web-1")"

say "migration, the documented order: $W's forwarder on the old config → forwarders first → then the farm"
put_forwarder_on_old_config
check "$W's forwarder runs the OLD config" sh -c "docker exec '$W-web-1' grep -q 'init-addr last' /usr/local/etc/haproxy/haproxy.cfg"
W_FW_STARTED="$(docker inspect -f '{{.State.StartedAt}}' "$W-web-1")"
check "farm-forwarders.sh without --apply names the old-config forwarder and changes nothing" sh -c \
  "bash '$SCRIPTS/provision/farm-forwarders.sh' --root '$T/srv' | grep '$W: its forwarder runs an older config' >/dev/null && [ \"\$(docker inspect -f '{{.State.StartedAt}}' '$W-web-1')\" = '$W_FW_STARTED' ]"
tcp_only_start step1
timed bash "$SCRIPTS/provision/farm-forwarders.sh" --root "$T/srv" --apply
sleep 2
tcp_only_stop step1
echo "  measured (migration step 1, farm-forwarders.sh --apply): the demo's own forwarder restart: $TCP_FAILED of $TCP_ASKED connections failed (8 clients retrying every ~10 ms) inside ONE window of $TCP_WINDOW s"
MIG_GAP_FAILED="$TCP_FAILED in $TCP_WINDOW s"
check "step 1: the gap is that one restart — every failure inside one window of at most 2 s ($TCP_FAILED failed over $TCP_WINDOW s)" python3 -c "import sys; sys.exit(0 if $TCP_WINDOW <= 2.0 else 1)"
check "farm-forwarders.sh --apply moved $W's forwarder to the current config" sh -c "docker exec '$W-web-1' grep -q 'http-check expect rstatus' /usr/local/etc/haproxy/haproxy.cfg"
check "the forwarder already on the current config was not restarted" [ "$(docker inspect -f '{{.State.StartedAt}}' "$J-web-1")" = "$J_FW_STARTED" ]
check "$W answers again through its forwarder" wait_for "$WP" / "$WH" 200 30
probes_start
TRACY_DEMOS_IMAGE="$NEW_TAG2" timed bash "$SCRIPTS/provision/farm-switch.sh" --root "$T/srv"
probes_stop migration-step2
no_blip "$W: step 2, the farm moves with every forwarder on the current config: not one request failed"

say "migration, the other order (NOT recommended): the farm first, $W's forwarder still on the old config"
put_forwarder_on_old_config
check "$W's forwarder runs the OLD config again" sh -c "docker exec '$W-web-1' grep -q 'init-addr last' /usr/local/etc/haproxy/haproxy.cfg"
tcp_only_start farmfirst
timed bash "$SCRIPTS/provision/farm-switch.sh" --root "$T/srv"
sleep 2
tcp_only_stop farmfirst
echo "  measured (farm first, old-config forwarder across the switch): $TCP_FAILED of $TCP_ASKED connections failed over $TCP_WINDOW s (documented: why this order is not recommended)"
FARMFIRST_FAILED="$TCP_FAILED over $TCP_WINDOW s"
tcp_only_start farmfirst2
timed bash "$SCRIPTS/provision/farm-forwarders.sh" --root "$T/srv" --apply
sleep 2
tcp_only_stop farmfirst2
echo "  measured (farm first, then the forwarder restart): $TCP_FAILED of $TCP_ASKED connections failed over $TCP_WINDOW s — a second gap"
echo "  MIGRATION SUMMARY: forwarders first = $MIG_GAP_FAILED failed connections in one restart gap and 0 at the switch; farm first = $FARMFIRST_FAILED at the switch plus $TCP_FAILED over $TCP_WINDOW s at the restart"
docker image rm "$NEW_TAG2" >/dev/null 2>&1 || true
check "the farm is back on the pinned image" sh -c "[ \"\$(docker inspect -f '{{.Config.Image}}' $(farm_web))\" = '$FARM_IMAGE' ]"
check "$J and $W answer from the farm after all of it" sh -c "[ \"\$(cat '$T/srv/$J/runtime' '$T/srv/$W/runtime' | tr -d '\n')\" = farmfarm ]"
check "$J: every page still answers as before (code + title)" pages_unchanged J
check "$W: every page still answers as before (code + title)" pages_unchanged W

check "the pools start no program (disable_functions, decision 5)" sh -c \
  "curl -s -H 'X-Forwarded-Host: $JH' 'http://127.0.0.1:$JP/tracyprobe.php' >/dev/null && docker exec $(farm_web) grep -q '^php_admin_value\[disable_functions\] = exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec,symlink,link' /etc/tracy-demos/fpm/$J.conf"
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
check "$J shows the change" sh -c "curl -s -H 'X-Forwarded-Host: $JH' http://127.0.0.1:$JP/index.php | grep 'Changed after the backup'"
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
  "[ \"\$(docker exec $(farm_web) curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$JP/)\" = 000 ]"
check "$W kept answering from the farm through the teardown" pages_unchanged W

say "E2E PASS"
