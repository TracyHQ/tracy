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
  local image
  image="$(tracy_demos_image)" || return 1
  farm_image_ensure "$image" || return 1
  farm_compose run --rm --no-deps -T --entrypoint sh demos-web-a -c \
    'mkdir -p /run/tracy-demos && php-fpm -t 2>&1 | tail -n 3 && apache2ctl -t 2>&1 | tail -n 3' >&2
}

# Bring the farm up to what compose.yml says. A web slot that was given the same image, limits and
# mounts as compose.yml renders now is only asked to reload what changed inside (vhosts, pools:
# graceful, nothing dropped). Any other web — a member added or removed, a new image, a farm of the
# one-container kind that came before slots — is REPLACED by `farm_switch`, side by side, with no
# request of another demo failing through a forwarder on the current config.
farm_apply() {
  local image web want have
  image="$(tracy_demos_image)" || return 1
  farm_image_ensure "$image" || return 1
  farm_web_settle
  farm_compose up -d --no-build --pull never demos-db >&2 || return 1
  web="$(tracy_farm_web)"
  want="$(tracy_farm_web_hash)" || return 1
  have="$(docker inspect -f '{{index .Config.Labels "tracy.farm-config"}}' "$web" 2>/dev/null || true)"
  if [ "$web" != "$TRACY_DEMOS_WEB_CONTAINER" ] && [ "$have" = "$want" ] \
      && [ "$(docker inspect -f '{{.State.Running}}' "$web" 2>/dev/null)" = true ]; then
    farm_wait_web "$web" || return 1
    docker exec "$web" tracy-demos-reload >&2 || return 1
    farm_wait_web "$web"
    return
  fi
  farm_switch
}

# Containers of the farm web that exist: the legacy one (exact base name) and the two slots.
farm_web_names() {
  local c
  for c in "$TRACY_DEMOS_WEB_CONTAINER" "$TRACY_DEMOS_WEB_CONTAINER-a" "$TRACY_DEMOS_WEB_CONTAINER-b"; do
    docker inspect -f '{{.Name}}' "$c" >/dev/null 2>&1 && printf '%s\n' "$c"
  done
  return 0
}

# After a crash or a half-finished switch: exactly one web is the serving one (tracy_farm_web), and
# every other web container of the farm is a leftover — a new slot that never became ready, or an old
# one that was not removed. A leftover may still be READY and serving requests (a switch cut short after
# the new slot was marked ready, or after `.active-web` changed), so it is never just removed: it goes
# through the switch's own retire path — readiness withdrawn, every forwarder given time to take it out,
# its requests waited for, a graceful stop, then removed. Nothing is touched when there is at most one.
farm_web_settle() {
  local serving c
  [ "$(farm_web_names | grep -c .)" -gt 1 ] || return 0
  serving="$(tracy_farm_web)"
  while IFS= read -r c; do
    [ "$c" = "$serving" ] && continue
    echo "   the farm web $c is a leftover of a switch that did not finish — retired ($serving serves)" >&2
    farm_retire "$c"
  done <<<"$(farm_web_names)"
}

# The slot to start next: the one that is not serving. A pre-slot farm (one container, exact base name)
# or none at all → `a`.
farm_next_slot() {
  case "$(tracy_farm_web)" in
    "$TRACY_DEMOS_WEB_CONTAINER-a") printf '%s' "$TRACY_DEMOS_WEB_CONTAINER-b" ;;
    *) printf '%s' "$TRACY_DEMOS_WEB_CONTAINER-a" ;;
  esac
}

# The ready marker: a file Apache's health vhost (port 8080, /tracy-ready) serves. A forwarder on the
# current config sends new connections only to a farm web that answers 200 there.
FARM_READY_FILE=/run/tracy-demos-ready/ok
farm_mark_ready() { docker exec "$1" sh -c "mkdir -p /run/tracy-demos-ready && chmod 755 /run/tracy-demos-ready && : > $FARM_READY_FILE && chmod 644 $FARM_READY_FILE"; }
farm_is_ready() { docker exec "$1" test -f "$FARM_READY_FILE" >/dev/null 2>&1; }

# Take web $1 out of every forwarder's list. Returns 0 when something was withdrawn (the forwarders then
# need tracy_farm_down_wait seconds), 1 when there was nothing to withdraw (not running, or already unready).
#   a slot of this image: its marker goes, /tracy-ready answers 404;
#   a farm of the one-container kind that came before slots (no /run/tracy-demos-ready): its health vhost
#     answers /tracy-ready 403 (`Require all denied`), which a current-config forwarder accepts as "serves,
#     cannot say" (tracy_farm_forward_cfg); a `Redirect gone` makes it 410 — not accepted — and a graceful
#     reload (listeners kept) applies it.
farm_withdraw() {
  local w="$1"
  [ "$(docker inspect -f '{{.State.Running}}' "$w" 2>/dev/null)" = true ] || return 1
  if docker exec "$w" test -d /run/tracy-demos-ready >/dev/null 2>&1; then
    farm_is_ready "$w" || return 1
    docker exec "$w" rm -f "$FARM_READY_FILE" >/dev/null 2>&1
  else
    docker exec "$w" sh -c 'printf "Redirect gone /tracy-ready\n" > /etc/apache2/conf-enabled/zz-tracy-unready.conf && apache2ctl -t >/dev/null 2>&1 && apache2ctl graceful' >&2 || return 1
  fi
}

# Retire a farm web without failing anything it still serves: withdrawn from the forwarders, given
# tracy_farm_down_wait to be seen, waited for until idle, stopped (its entrypoint drains), removed.
farm_retire() {
  local w="$1"
  if farm_withdraw "$w"; then sleep "$(tracy_farm_down_wait)"; fi
  farm_web_quiet "$w"
  docker stop -t 45 "$w" >/dev/null 2>&1 || true
  # TRACY_FARM_KEEP_LOGS=<dir>: keep the retired web's own log (the e2e reads it when a probe saw a failure).
  [ -z "${TRACY_FARM_KEEP_LOGS:-}" ] || docker logs --timestamps "$w" > "$TRACY_FARM_KEEP_LOGS/$w.$(date +%s).log" 2>&1 || true
  docker rm -f "$w" >/dev/null 2>&1 || true
}

# Established connections of demos to the farm web $1 (its demo listeners, from /proc/net/tcp*; the
# health port 8080 not counted): a request running, or a keep-alive connection not yet closed (2 s).
farm_web_connections() {
  docker exec "$1" sh -c '
    ports="$(sed -n "s/^Listen //p" /etc/tracy-demos/apache/*.conf 2>/dev/null | while read -r p; do printf "%04X\n" "$p"; done)"
    cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk -v ports="$ports" '"'"'
      BEGIN { n = split(ports, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") want[a[i]] = 1 }
      NR > 1 && $4 == "01" { split($2, l, ":"); if (l[2] in want) c++ }
      END { print c + 0 }'"'"'' 2>/dev/null
}

# Wait until no demo connection is left in web $1 (any image: a pre-slot farm has no drain of its own),
# for at most TRACY_FARM_SWITCH_DRAIN seconds (default 40: it covers a 25 s request; forwarders on the old config keep opening connections to the slot until it is gone, so a busy host waits all of it).
farm_web_quiet() {
  local c="$1" waited=0 limit="${TRACY_FARM_SWITCH_DRAIN:-40}" n quiet=0
  while [ "$waited" -lt "$limit" ]; do
    n="$(farm_web_connections "$c" || echo 0)"
    if [ "${n:-0}" = 0 ]; then
      quiet=$((quiet + 1)); [ "$quiet" -ge 2 ] && return 0
    else
      quiet=0
    fi
    sleep 1; waited=$((waited + 1))
  done
  echo "   $c still has ${n:-?} connection(s) after ${limit} s — stopping it anyway (a request that long, or a forwarder on the old config still sending it new ones: farm-forwarders.sh)" >&2
}

# Replace the serving farm web by a new slot built from compose.yml, with nothing failing at the
# forwarders:
#   1. the next slot starts beside the serving one (its mounts are the new members');
#   2. it is waited for until healthy, then marked READY — a slot that never gets there is removed and
#      the serving one is left exactly as it was (marker intact), the switch fails loudly;
#   3. `.active-web` names it (every exec goes there from now);
#   3b. every forwarder gets tracy_farm_up_wait seconds to start using it;
#   4. the old one's marker goes; every forwarder has taken it out after tracy_farm_down_wait seconds;
#   5. the old one is waited for until no request runs in it, then stopped (its entrypoint drains) and removed.
farm_switch() {
  local old new image
  image="$(tracy_demos_image)" || return 1
  old="$(tracy_farm_web)"
  new="$(farm_next_slot)"
  docker rm -f "$new" >/dev/null 2>&1 || true
  docker inspect -f '{{.Name}}' "$old" >/dev/null 2>&1 || old=""
  echo "   the farm web: starting $new${old:+ beside $old}" >&2
  if ! farm_compose up -d --no-deps --no-build --pull never "demos-web-${new##*-}" >&2 || ! farm_wait_web "$new"; then
    echo "!! $new did not come up — $old${old:+ is left serving}" >&2
    docker rm -f "$new" >/dev/null 2>&1 || true
    return 1
  fi
  if ! farm_mark_ready "$new"; then
    echo "!! $new could not be marked ready — $old${old:+ is left serving}" >&2
    farm_retire "$new"
    return 1
  fi
  printf '%s\n' "$new" > "$(tracy_demos_dir)/.active-web.new" && mv "$(tracy_demos_dir)/.active-web.new" "$(tracy_demos_dir)/.active-web"
  if [ -z "$old" ]; then farm_web_settle; return 0; fi
  # The forwarders must be USING the new slot before the old one is withdrawn: otherwise there is a moment
  # with no server at all (e2e: the old slot went down 71 ms before the new one came up).
  sleep "$(tracy_farm_up_wait)"
  farm_retire "$old"
  echo "   the farm web: $new serves, $old is gone" >&2
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
    echo "!! the farm image $image is not on this host and no web/build.sh is beside these scripts to build it (run this from the tracy-host container: docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/…)" >&2
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
  local i tries="${TRACY_FARM_WAIT_TRIES:-60}" web="${1:-$(tracy_farm_web)}"
  for ((i = 1; i <= tries; i++)); do
    if docker exec "$web" curl -fsS -o /dev/null "http://127.0.0.1:$TRACY_DEMOS_OWN_PORT/fpm-ping" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "!! $web did not answer its health check in ${tries} s" >&2
  docker logs --tail 20 "$web" 2>&1 | sed 's/^/   | /' >&2 || true
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
    ${envs[@]+"${envs[@]}"} "$(tracy_farm_web)" php -- "$@" < "$HERE/farm-site.php"
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
  docker exec "$(tracy_farm_web)" sh -c '
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
  docker exec "$(tracy_farm_web)" sh -c 'apache2ctl -t >/dev/null 2>&1 && apache2ctl graceful' >&2
}
farm_vhost_in() {
  local dir
  dir="$(tracy_demos_dir)"
  [ -f "$dir/apache/.$LABEL.conf.held" ] || return 0
  mv "$dir/apache/.$LABEL.conf.held" "$dir/apache/$LABEL.conf"
  docker exec "$(tracy_farm_web)" sh -c 'apache2ctl -t >/dev/null 2>&1 && apache2ctl graceful' >&2
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
    if answer="$(docker exec -i -u 0 "$(tracy_farm_web)" php -n -- "/run/tracy-demos/$LABEL.sock" \
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
  docker exec "$(tracy_farm_web)" sh -c '
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
  docker network disconnect "${LABEL}_default" "$(tracy_farm_web)" >/dev/null 2>&1 || true
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
    farm) raw="$(docker exec "$(tracy_farm_web)" curl "${args[@]}" "http://127.0.0.1:$HOST_PORT$path" || true)" ;;
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

# The paths fold and unfold compare, one per line: `/` itself; when `/` redirects to a page on the
# probe host (a multilingual site sending `/` to `/en/`), that landing page after at most 3 hops;
# then two internal pages linked from the landing page (or from `/`). Returns 1, with the reason on
# stderr, for a redirect to another host, a loop, more than 3 hops, or a landing page that is not a 200.
farm_probe_paths() {
  local path="/" hops=0 raw tail code loc body next seen="/" landing=""
  while :; do
    raw="$(curl -s -o - -w '\n__TRACY_PROBE__ %{http_code} %{redirect_url}' --max-time 60 \
      -H "X-Forwarded-Host: $PROBE_HOST" -H "X-Forwarded-Proto: https" \
      "http://127.0.0.1:$HOST_PORT$path" || true)"
    tail="${raw##*$'\n'__TRACY_PROBE__ }"
    body="${raw%$'\n'__TRACY_PROBE__*}"
    code="${tail%% *}"; loc="${tail#* }"; [ "$loc" != "$tail" ] || loc=""
    case "$code" in
      301|302|303|307|308) ;;
      *) break ;;
    esac
    # curl's redirect_url resolves a relative Location against the request: http://127.0.0.1:<HOST_PORT>/…
    next="$(printf '%s' "$loc" | PROBE_HOST="$PROBE_HOST" HOST_PORT="$HOST_PORT" python3 -c '
import os, sys
from urllib.parse import urlsplit
try:
    u = urlsplit(sys.stdin.read().strip())
    host, port = (u.hostname or "").lower(), u.port
except ValueError:
    sys.exit(1)
if u.scheme not in ("", "http", "https") or u.username is not None or u.password is not None:
    sys.exit(1)
if host and host != os.environ["PROBE_HOST"].lower() and not (host == "127.0.0.1" and str(port) == os.environ["HOST_PORT"]):
    sys.exit(1)
path = u.path or "/"
if not path.startswith("/"):
    sys.exit(1)
print(path + ("?" + u.query if u.query else ""))
')" || { echo "!! $LABEL: $path redirects to [$loc], which is not a page on $PROBE_HOST" >&2; return 1; }
    hops=$((hops + 1))
    if [ "$hops" -gt 3 ]; then echo "!! $LABEL: / redirects more than 3 times (last: $loc)" >&2; return 1; fi
    case "
$seen
" in *"
$next
"*) echo "!! $LABEL: / redirects in a loop (back to $next)" >&2; return 1 ;; esac
    seen="$seen
$next"
    path="$next"; landing="$next"
  done
  if [ -n "$landing" ]; then
    if [ "$code" != 200 ]; then
      echo "!! $LABEL: / lands on $landing, which answers $code, not 200" >&2; return 1
    fi
  fi
  printf '/\n'
  [ -z "$landing" ] || printf '%s\n' "$landing"
  printf '%s' "$body" | PROBE_HOST="$PROBE_HOST" SELF="${landing:-/}" python3 -c '
import os, re, sys
from urllib.parse import urlsplit
host = os.environ["PROBE_HOST"]
seen, out = {"/", os.environ["SELF"]}, []
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
  local where="$1" line path want got tries=0 bad
  while :; do
    bad=""
    # Split by parameter expansion, not `IFS=<tab> read`: tab is IFS whitespace, so read would drop the
    # trailing tab of a line whose title is empty (every redirect) and never equal what farm_probe prints.
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      path="${line%%$'\t'*}"; want="${line#*$'\t'}"
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

# The answers of the paths, from WHERE, as BASELINE lines. `/` is a 200 with a title, or a redirect
# to a page on the same host (kept as the redirect it is) whose landing page is one.
farm_baseline() {
  local where="$1" paths path answer
  paths="$(farm_probe_paths)" || return 1
  BASELINE=""
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    answer="$(farm_probe "$where" "$path")"
    BASELINE="$BASELINE$path	$answer
"
  done <<<"$paths"
  local first land
  first="$(printf '%s' "$BASELINE" | sed -n 1p)"
  land="$(printf '%s' "$BASELINE" | sed -n 2p)"
  case "$(printf '%s' "$first" | cut -f2)" in
    200) ;;
    301|302|303|307|308)
      # `/` is a redirect (farm_probe_paths followed it): the landing page is what must answer.
      if [ "$(printf '%s' "$land" | cut -f2)" != 200 ] || [ -z "$(printf '%s' "$land" | cut -f4)" ]; then
        echo "!! $LABEL: / redirects, but its landing page does not answer 200 with a title ($land)" >&2
        return 1
      fi ;;
    *) echo "!! $LABEL does not answer / with 200 today ($first) — nothing to compare the move against" >&2
       return 1 ;;
  esac
  printf '%s' "$BASELINE" | sed 's/^/   baseline /' >&2
}
