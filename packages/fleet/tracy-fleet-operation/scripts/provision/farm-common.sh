#!/usr/bin/env bash
#
# What fold.sh and unfold.sh both do to the host's demo farm. Sourced by those two only, after
# lib/roots.sh, render-compose.sh (which brings lib/site-runtime.sh and lib/demo-farm.sh) and
# lib/site-lifecycle.sh. Every function here works on LABEL, SITE_DIR, HOST_PORT, PLATFORM.

# `docker compose` on the farm's own project.
farm_compose() {
  local dir
  dir="$(tracy_demos_dir)"
  docker compose --project-directory "$dir" -f "$dir/compose.yml" "$@"
}

# SQL as the farm database's root, from stdin or -e.
farm_root_sql() {
  MYSQL_PWD="$FARM_DB_ROOT_PASSWORD" docker exec -i -e MYSQL_PWD "$TRACY_DEMOS_DB_CONTAINER" \
    mariadb -uroot --max-allowed-packet=256M "$@"
}

# Take the host-wide farm lock (fd 9): one fold or unfold at a time changes the farm, whichever demo.
farm_lock() {
  local dir
  dir="$(tracy_demos_dir)"
  mkdir -p "$dir"
  exec 9>"$dir/.farm.lock"
  if ! flock -w "${TRACY_FARM_LOCK_WAIT:-600}" 9; then
    echo "!! another fold or unfold has held the demo farm for ${TRACY_FARM_LOCK_WAIT:-600} s — nothing was changed" >&2
    exit "$TRACY_SITE_BUSY"
  fi
}

# The farm's own files: its .env (root password, created once), the forwarder config, its folders.
farm_ensure_files() {
  local dir
  dir="$(tracy_demos_dir)"
  mkdir -p "$dir/apache" "$dir/fpm" "$dir/exec"
  chmod 700 "$dir/fpm" "$dir/exec"
  if ! grep -qs '^FARM_DB_ROOT_PASSWORD=' "$dir/.env"; then
    ( umask 077; printf 'FARM_DB_ROOT_PASSWORD=%s\n' "$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32)" >> "$dir/.env" )
  fi
  chmod 600 "$dir/.env"
  FARM_DB_ROOT_PASSWORD="$(sed -n 's/^FARM_DB_ROOT_PASSWORD=//p' "$dir/.env" | sed -n 1p)"
  tracy_farm_forward_cfg > "$dir/.forward.haproxy.cfg.new"
  mv "$dir/.forward.haproxy.cfg.new" "$dir/forward.haproxy.cfg"
}

# Render the farm's compose from the members on disk.
# Every member's pool is written again with it: the compose names the farm IMAGE, and a new image may
# need new pool lines (r2: sockets farmhttp 0600, because its Apache is no longer www-data) — a farm
# re-created on the new image beside pools written for the old one would answer 503 for every demo
# not refreshed yet. A pool that cannot be rendered keeps its file, said.
farm_render() {
  local dir member
  dir="$(tracy_demos_dir)"
  while IFS= read -r member; do
    [ -n "$member" ] || continue
    if ( umask 077; tracy_farm_render_pool "$member" > "$dir/fpm/.$member.conf.new" ); then
      mv "$dir/fpm/.$member.conf.new" "$dir/fpm/$member.conf"
    else
      rm -f "$dir/fpm/.$member.conf.new"
      echo "!! the pool of $member could not be written again — it keeps the one it has" >&2
    fi
  done <<<"$(tracy_farm_members)"
  tracy_farm_render_compose > "$dir/.compose.yml.new" || { rm -f "$dir/.compose.yml.new"; return 1; }
  mv "$dir/.compose.yml.new" "$dir/compose.yml"
}

# Both configs as they are on disk now, tested in a throwaway container of the farm's own service
# (same image, same mounts) — so a broken vhost or pool never reaches the running farm, and a
# re-create of tracy-demos-web never starts from a config that has not passed.
farm_config_test() {
  farm_compose run --rm --no-deps -T --entrypoint sh demos-web -c \
    'mkdir -p /run/tracy-demos && php-fpm -t 2>&1 | tail -n 3 && apache2ctl -t 2>&1 | tail -n 3' >&2
}

# Bring the farm up to what compose.yml says (re-creating the web only when its mounts changed),
# wait for it, then reload what changed inside.
farm_apply() {
  local image
  image="$(tracy_demos_image)" || return 1
  farm_image_ensure "$image" || return 1
  farm_compose up -d --no-build --pull never >&2 || return 1
  farm_wait_web || return 1
  docker exec "$TRACY_DEMOS_WEB_CONTAINER" tracy-demos-reload >&2 || return 1
  farm_wait_web
}

# 🔒 THE FARM IS NOT IN TRACY-FLEET-EGRESS (bootstrap.sh's safety net #1). Every template demo is
# published, and a published site's subnet is out of the chain (go-live.sh `live`: it may send mail
# and reach out — the Cowork plugin's calls, site mail). The farm serves only such demos, so it is in
# the live state for good; a demo that must be a draft is unfolded first (go-live.sh refuses `draft`).

# The farm image on this host, built now when it is missing — the way a provision builds a missing
# site web image on the spot (lib/web-image.sh `tracy_web_image_build`): no registry holds the web
# images, each host builds its own (`web/build.sh demos`, DEMOS_IMAGE), and the first fold on a host
# must not wait for a person. Serialised on the same host lock as the site images; succeeds only
# when docker then has the image.
farm_image_ensure() {
  local image="$1" web lock
  docker image inspect "$image" >/dev/null 2>&1 && return 0
  if ! declare -F tracy_web_dir >/dev/null; then
    # shellcheck source=../lib/web-image.sh
    . "$(dirname "${BASH_SOURCE[0]}")/../lib/web-image.sh"
  fi
  if ! web="$(tracy_web_dir)" || [ ! -f "$web/build.sh" ] || [ ! -f "$web/demos.Dockerfile" ]; then
    echo "!! the farm image $image is not on this host and no web/build.sh is beside these scripts to build it" >&2
    return 1
  fi
  echo "   the farm image $image is not built on this host — building it now: bash $web/build.sh demos" >&2
  lock="${TRACY_WEB_IMAGE_BUILD_LOCK:-/var/lock/tracy-web-image-build.lock}"
  if command -v flock >/dev/null 2>&1 && { : >> "$lock"; } 2>/dev/null; then
    ( flock 9
      docker image inspect "$image" >/dev/null 2>&1 \
        || bash "$web/build.sh" demos 2>&1 | sed 's/^/   [farm image] /' >&2 ) 9>> "$lock" || true
  else
    bash "$web/build.sh" demos 2>&1 | sed 's/^/   [farm image] /' >&2 || true
  fi
  docker image inspect "$image" >/dev/null 2>&1 && return 0
  echo "!! the farm image $image could not be built here — see the [farm image] lines above" >&2
  return 1
}

farm_wait_web() {
  local i
  for ((i = 1; i <= 60; i++)); do
    if docker exec "$TRACY_DEMOS_WEB_CONTAINER" curl -fsS -o /dev/null "http://127.0.0.1:$TRACY_DEMOS_OWN_PORT/fpm-ping" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "!! $TRACY_DEMOS_WEB_CONTAINER did not answer its health check in 60 s" >&2
  docker logs --tail 20 "$TRACY_DEMOS_WEB_CONTAINER" 2>&1 | sed 's/^/   | /' >&2 || true
  return 1
}

# The server that STAYS UP (lib/db-ready.sh says why skip_networking is the question).
farm_wait_db() {
  local i answer
  for ((i = 1; i <= 90; i++)); do
    if answer="$(farm_root_sql -N -B -e 'SELECT CONCAT("skip_networking=", @@skip_networking + 0)' 2>&1)"; then
      case "$answer" in *skip_networking=0*) return 0 ;; esac
    fi
    sleep 2
  done
  echo "!! the farm database never became ready: $answer" >&2
  return 1
}

# Write (or remove) a member's three files.
farm_member_write() {
  local dir
  dir="$(tracy_demos_dir)"
  tracy_farm_render_vhost "$LABEL" "$HOST_PORT" > "$dir/apache/.$LABEL.conf.new" || return 1
  ( umask 077
    tracy_farm_render_pool "$LABEL" > "$dir/fpm/.$LABEL.conf.new" &&
    tracy_farm_render_exec_env "$LABEL" > "$dir/exec/.$LABEL.env.new" ) || {
      rm -f "$dir/apache/.$LABEL.conf.new" "$dir/fpm/.$LABEL.conf.new" "$dir/exec/.$LABEL.env.new"
      return 1
    }
  mv "$dir/apache/.$LABEL.conf.new" "$dir/apache/$LABEL.conf"
  mv "$dir/fpm/.$LABEL.conf.new" "$dir/fpm/$LABEL.conf"
  mv "$dir/exec/.$LABEL.env.new" "$dir/exec/$LABEL.env"
}

# farm-site.php run as the demo in the farm, in its docroot, with its pool environment — what
# `tracy_site_web_exec` does once the marker says farm, for fold/unfold while it does not. The
# member's files must be written and the farm applied (its folders mounted) first.
#   farm_member_php [-e K=V]... -- VERB [PLATFORM]
farm_member_php() {
  local envs=()
  while [ "$#" -gt 0 ] && [ "$1" != -- ]; do envs+=("$1"); shift; done
  shift
  docker exec -i -u www-data -w "$(tracy_farm_docroot "$LABEL")" --env-file "$(tracy_farm_exec_env_file "$LABEL")" \
    ${envs[@]+"${envs[@]}"} "$TRACY_DEMOS_WEB_CONTAINER" php -- "$@" < "$HERE/farm-site.php"
}

# The definer clauses a dump writes as statement syntax — routines, triggers, views, events — dropped,
# never text inside a row: lib/strip-definers.sed says which. Imported as the demo's own user (fold)
# or a server's root (unfold), each object then runs as its importer.
farm_strip_definers() {
  sed -E -f "$(dirname "${BASH_SOURCE[0]}")/../lib/strip-definers.sed"
}

# ── a demo taken out of the farm's traffic, for unfold's copy ─────────────────────────────────────
# Its forwarder stopped (unfold.sh) blocks new requests from outside, but a request already inside the
# farm keeps running and may write after the dump starts. So: its vhost goes (an Apache graceful
# restart: in-flight requests finish, every other demo keeps serving), then each PHP worker of its
# pool is asked to quit after its current request (SIGQUIT to that pool's workers only — never an FPM
# reload, whose 10 s process_control_timeout would cut other demos' long requests), and the copy waits
# until none is left: every write that started has committed or failed before the dump.
farm_pool_workers() { # → the number of PHP workers of LABEL's pool now
  docker exec "$TRACY_DEMOS_WEB_CONTAINER" sh -c '
    n=0
    for f in /proc/[0-9]*/cmdline; do
      t="$(tr "\0" " " < "$f" 2>/dev/null)" || continue
      case "$t" in "php-fpm: pool $1"|"php-fpm: pool $1 "*) n=$((n + 1)) ;; esac
    done
    echo "$n"' sh "$LABEL"
}
farm_vhost_out() {
  local dir
  dir="$(tracy_demos_dir)"
  [ -f "$dir/apache/$LABEL.conf" ] || return 0
  mv "$dir/apache/$LABEL.conf" "$dir/apache/.$LABEL.conf.held"
  docker exec "$TRACY_DEMOS_WEB_CONTAINER" sh -c 'apache2ctl -t >/dev/null 2>&1 && apache2ctl graceful' >&2
}
farm_vhost_in() {
  local dir
  dir="$(tracy_demos_dir)"
  [ -f "$dir/apache/.$LABEL.conf.held" ] || return 0
  mv "$dir/apache/.$LABEL.conf.held" "$dir/apache/$LABEL.conf"
  docker exec "$TRACY_DEMOS_WEB_CONTAINER" sh -c 'apache2ctl -t >/dev/null 2>&1 && apache2ctl graceful' >&2
}
# Wait until no worker of LABEL's pool runs a request; 1 when one still runs after TRACY_FARM_DRAIN_WAIT
# seconds (default 120: a request may legitimately take minutes to write). Busy or idle is the pool's
# own answer (pm.status_path, farm-pool-status.php — the status request itself not counted). An IDLE
# worker cannot write, and no request can reach it any more (vhost gone, forwarder stopped), so it is
# left alone: killing one only makes FPM start another (measured: the pool stayed at two workers).
# A pool rendered before it had a status path gets the slow road: each worker asked to quit after its
# request (SIGQUIT, this pool only), then waited for until the last one is gone (its idle timeout).
farm_pool_drain() {
  local waited=0 left answer limit="${TRACY_FARM_DRAIN_WAIT:-120}" asked=0
  while :; do
    if answer="$(docker exec -i -u 0 "$TRACY_DEMOS_WEB_CONTAINER" php -n -- "/run/tracy-demos/$LABEL.sock" \
        < "$(dirname "${BASH_SOURCE[0]}")/farm-pool-status.php" 2>/dev/null)" && [[ "$answer" =~ ^busy=([0-9]+)\  ]]; then
      if [ "${BASH_REMATCH[1]}" = 0 ]; then
        echo "==> no request of $LABEL runs in the farm any more (${waited} s)"
        return 0
      fi
    else
      [ "$asked" = 1 ] || { farm_pool_signal QUIT; asked=1; }
      left="$(farm_pool_workers)"
      [ "$left" = 0 ] && { echo "==> $LABEL's PHP workers in the farm have all finished (${waited} s)"; return 0; }
    fi
    [ "$waited" -ge "$limit" ] && { echo "!! a request of $LABEL still runs in the farm after ${limit} s" >&2; return 1; }
    sleep 1; waited=$((waited + 1))
  done
}

# Send SIG to every worker of LABEL's pool, and to no other process.
farm_pool_signal() {
  docker exec "$TRACY_DEMOS_WEB_CONTAINER" sh -c '
    for f in /proc/[0-9]*/cmdline; do
      t="$(tr "\0" " " < "$f" 2>/dev/null)" || continue
      case "$t" in "php-fpm: pool $2"|"php-fpm: pool $2 "*) p="${f#/proc/}"; kill -"$1" "${p%/cmdline}" 2>/dev/null ;; esac
    done' sh "$1" "$LABEL"
}

farm_member_remove() {
  local dir
  dir="$(tracy_demos_dir)"
  rm -f "$dir/apache/$LABEL.conf" "$dir/fpm/$LABEL.conf" "$dir/exec/$LABEL.env"
}

# Everything the farm holds of LABEL, let go: its network attachment, vhost + pool + exec env (the
# farm re-rendered without its mounts and re-applied), its schema and user (IDENT), the FARM_DB_*
# lines of its .env and its `farm/` folder. Nothing of another demo is touched beyond the farm's
# re-apply. Shared by unfold.sh (after the demo is home) and farm-release.sh (teardown).
farm_release() {
  docker network disconnect "${LABEL}_default" "$TRACY_DEMOS_WEB_CONTAINER" >/dev/null 2>&1 || true
  if [ -f "$(tracy_demos_dir)/fpm/$LABEL.conf" ]; then
    farm_member_remove
    farm_render
    farm_apply >/dev/null
  fi
  [ -z "$IDENT" ] || farm_root_sql -e "DROP DATABASE IF EXISTS \`$IDENT\`; DROP USER IF EXISTS '$IDENT'@'%';"
  site_env_set FARM_DB_NAME; site_env_set FARM_DB_USER; site_env_set FARM_DB_PASSWORD
  rm -rf "$SITE_DIR/farm"
}

# One value of the site's .env; set or drop one (the file stays 600).
site_env_get() { sed -n "s/^$1=//p" "$SITE_DIR/.env" 2>/dev/null | sed -n 1p; }
site_env_set() {
  local tmp="$SITE_DIR/.env.farm-new"
  ( umask 077; { grep -v "^$1=" "$SITE_DIR/.env" || true; [ "$#" -lt 2 ] || printf '%s=%s\n' "$1" "$2"; } > "$tmp" )
  mv "$tmp" "$SITE_DIR/.env"
  chmod 600 "$SITE_DIR/.env"
}

# The hostname a probe says it is asking for: what the site answers to in the world. A WordPress
# site redirects any other host to its `home`, so its own address is read from its database.
# PROBE_HOST overrides.
farm_probe_host() {
  if [ -n "${PROBE_HOST:-}" ]; then printf '%s' "$PROBE_HOST"; return 0; fi
  local home=""
  if [ "$PLATFORM" = wordpress ]; then
    home="$(tracy_site_db_exec "$LABEL" mariadb -N -B -e "
      SELECT CONCAT('SELECT option_value FROM \`', table_name, '\` WHERE option_name = ''home'' INTO @h')
        FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name LIKE '%options' ORDER BY LENGTH(table_name) LIMIT 1
        INTO @q; PREPARE s FROM @q; EXECUTE s; SELECT @h;" "$(tracy_site_db_name "$LABEL")" 2>/dev/null | tail -n 1)" || home=""
    home="${home#*://}"; home="${home%%/*}"
  fi
  printf '%s' "${home:-$LABEL.${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}}"
}

# One request to the demo, as `code<TAB>location<TAB>title`:
#   site  127.0.0.1:<HOST_PORT> on this host — the per-site container, or the forwarder once folded
#   farm  the farm's listener for this demo, from inside the farm
# Redirects are NOT followed: a redirect is compared as one (code and Location).
farm_probe() {
  local where="$1" path="$2" raw
  local args=(-s -o - -w '\n__TRACY_PROBE__ %{http_code} %{redirect_url}' --max-time 60
    -H "X-Forwarded-Host: $PROBE_HOST" -H "X-Forwarded-Proto: https")
  case "$where" in
    site) raw="$(curl "${args[@]}" "http://127.0.0.1:$HOST_PORT$path" || true)" ;;
    farm) raw="$(docker exec "$TRACY_DEMOS_WEB_CONTAINER" curl "${args[@]}" "http://127.0.0.1:$HOST_PORT$path" || true)" ;;
  esac
  printf '%s' "$raw" | python3 -c '
import html, re, sys
raw = sys.stdin.read()
body, _, tail = raw.rpartition("\n__TRACY_PROBE__ ")
code, _, loc = tail.strip().partition(" ")
m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
title = " ".join(html.unescape(m.group(1)).split()) if m else ""
print("%s\t%s\t%s" % (code or "000", loc.strip(), title))
'
}

# Two internal pages linked from the home page (plus `/` itself): what fold and unfold compare.
farm_probe_paths() {
  local raw
  raw="$(curl -s --max-time 60 -H "X-Forwarded-Host: $PROBE_HOST" -H "X-Forwarded-Proto: https" \
    "http://127.0.0.1:$HOST_PORT/" || true)"
  printf '/\n'
  printf '%s' "$raw" | PROBE_HOST="$PROBE_HOST" python3 -c '
import os, re, sys
from urllib.parse import urlsplit
host = os.environ["PROBE_HOST"]
seen, out = {"/"}, []
skip = re.compile(r"^/(administrator|wp-admin|wp-login|wp-json|feed|xmlrpc)|\.(css|js|png|jpe?g|gif|svg|ico|webp|woff2?|ttf|xml|pdf|zip)$", re.I)
for href in re.findall(r"<a\s[^>]*href=[\"\x27]([^\"\x27#]+)", sys.stdin.read(), re.I):
    u = urlsplit(href.strip())
    if u.scheme and u.scheme not in ("http", "https"):
        continue
    if u.netloc and u.netloc.split(":")[0] not in (host, "localhost", "127.0.0.1"):
        continue
    path = u.path or "/"
    target = path + ("?" + u.query if u.query else "")
    if not path.startswith("/") or skip.search(path) or target in seen:
        continue
    seen.add(target)
    out.append(target)
    if len(out) == 2:
        break
print("\n".join(out))
'
}

# Compare the answers recorded in BASELINE (one `path<TAB>code<TAB>location<TAB>title` per line) with
# what WHERE answers now. Retries for a while: a farm just reloaded, a forwarder just started.
farm_verify() {
  local where="$1" path want got tries=0 bad
  while :; do
    bad=""
    while IFS=$'\t' read -r path want; do
      [ -n "$path" ] || continue
      got="$(farm_probe "$where" "$path")"
      if [ "$got" != "$want" ]; then bad="$bad
   $path: was [$want], now [$got]"; fi
    done <<<"$BASELINE"
    [ -z "$bad" ] && return 0
    tries=$((tries + 1))
    if [ "$tries" -ge "${TRACY_FARM_VERIFY_TRIES:-15}" ]; then
      echo "!! $LABEL answers differently through $where:$bad" >&2
      return 1
    fi
    sleep 2
  done
}

# The answers of the paths, from WHERE, as BASELINE lines. `/` must be a 200 with a title.
farm_baseline() {
  local where="$1" paths path answer
  paths="$(farm_probe_paths)"
  BASELINE=""
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    answer="$(farm_probe "$where" "$path")"
    BASELINE="$BASELINE$path	$answer
"
  done <<<"$paths"
  case "$(printf '%s' "$BASELINE" | sed -n 1p | cut -f2)" in
    200) ;;
    *) echo "!! $LABEL does not answer / with 200 today ($(printf '%s' "$BASELINE" | sed -n 1p)) — nothing to compare the move against" >&2
       return 1 ;;
  esac
  printf '%s' "$BASELINE" | sed 's/^/   baseline /' >&2
}
