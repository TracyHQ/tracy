#!/usr/bin/env bash
#
# check-server.sh — same job as `check-local.sh`, different list. Every failing check names EXACTLY
# ONE switch to turn on, not just "failed": whoever reruns it six months from now gets an
# instruction, not a stack trace to reverse-engineer.
#
# 🔒 WHY NOT REUSE `check-local.sh`. They check OPPOSITE things, not overlapping ones: local needs
# Docker Desktop with host networking and a fake dnsmasq for `.tracy.test`; a server needs real
# iptables, real public DNS, and `TRACY_EGRESS_FENCE=on`. One script checking both behind
# `if [ "$(uname)" = Darwin ]` is two scripts sharing a coat, and whichever half does not run today
# is the half that rots in silence.
#
# 🔒 IT DOES NOT BRING THE STACK UP, AND THAT IS A DECISION. The first version ended with
# `up -d --build`; measured 11/09 on the dev machine, both halves of that were wrong here. A server
# does NOT build — it pulls the images CI built. And an `up` not limited to services touches
# `tracy-dsh`/`tracy-docker-proxy`, which belong to a different project, `tracy-host-dsh`, on the
# same machine: `Conflict. The container name "/tracy-dsh" is already in use` — or worse, it grabs
# the dsh that serves every site. Bringing the stack up is `deploy-tracy-stack.sh`'s job; this file only READS.
set -euo pipefail

ENV_FILE="${ENV_FILE:-${TRACY_STACK_ENV_FILE:-/etc/tracy/tracy-web.env}}"
STACK_DIR="${STACK_DIR:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 🔒 A SECOND STACK ON THE SAME HOST (a trial shard next to the master). With none of these set every
# compose command below is byte for byte the one it always was (two `-f`, no `-p`), and the container
# names are the literals they always were.
#   --project / TRACY_COMPOSE_PROJECT  `docker compose -p <name>` on every compose call
#   TRACY_STACK_EXTRA_FILES            one more `-f` per entry, after the two base files
#   TRACY_POSTGRES_CONTAINER           the postgres container to query (default tracy-postgres-1)
#   HOST_DSH_CONTAINER                 the dsh container to inspect (default tracy-dsh)
PROJECT="${TRACY_COMPOSE_PROJECT:-}"
EXTRA_FILES_LIST="${TRACY_STACK_EXTRA_FILES:-}"
PG_CT="${TRACY_POSTGRES_CONTAINER:-tracy-postgres-1}"
DSH_CT="${HOST_DSH_CONTAINER:-tracy-dsh}"

# Docker's rule for a container name, ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$. Both names are spliced into
# `docker ps -f name=…`, `docker exec` and `grep -Fx`, so a value that is not a plain name is refused
# instead of being passed on.
valid_container_name() {
  case "$1" in
    '' | [!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789]* | *[!abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-]*) return 1 ;;
  esac
  return 0
}

# Compose's own rule for a project name, ^[a-z0-9][a-z0-9_-]*$: lowercase letters, digits, '-' and '_',
# the first one a letter or digit. The characters are spelled out and not given as a range, because a
# bracket range follows the locale; and a `case` pattern, unlike a `$(...)`, keeps a trailing newline.
valid_project_name() {
  case "$1" in
    '' | [!abcdefghijklmnopqrstuvwxyz0123456789]* | *[!abcdefghijklmnopqrstuvwxyz0123456789_-]*) return 1 ;;
  esac
  return 0
}

usage() {
  cat <<'USAGE'
check-server.sh [--env-file <path>] [--stack-dir <path>] [--project <name>]

  --env-file   default $ENV_FILE, then $TRACY_STACK_ENV_FILE, then /etc/tracy/tracy-web.env
  --stack-dir  directory holding compose.yml + compose.server.yml
               (found on its own: beside this script on a host, or deploy/ in a checkout)
  --project    run every compose command as `docker compose -p <name>` (default $TRACY_COMPOSE_PROJECT;
               unset = no -p, compose reads `name:` from the file). For a second stack on this host.

Environment (for a second stack on this host; unset = the master's own values):
  TRACY_STACK_EXTRA_FILES   whitespace-separated compose files loaded after the two base files
  TRACY_POSTGRES_CONTAINER  postgres container to query (default tracy-postgres-1)
  HOST_DSH_CONTAINER        dsh container to inspect (default tracy-dsh)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="${2:?--env-file needs a value}"; shift ;;
    --stack-dir) STACK_DIR="${2:?--stack-dir needs a value}"; shift ;;
    --project)
      if [ $# -lt 2 ] || [ -z "$2" ]; then usage >&2; echo "--project needs a project name" >&2; exit 2; fi
      PROJECT="$2"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

# Before the first docker call: a name compose would refuse is a usage error (2), not a half-run check.
if [ -n "$PROJECT" ] && ! valid_project_name "$PROJECT"; then
  usage >&2
  echo "invalid project name '$PROJECT' (--project / TRACY_COMPOSE_PROJECT): lowercase letters, digits, '-' and '_' only, starting with a letter or digit" >&2
  exit 2
fi
for pair in "TRACY_POSTGRES_CONTAINER:$PG_CT" "HOST_DSH_CONTAINER:$DSH_CT"; do
  if ! valid_container_name "${pair#*:}"; then
    usage >&2
    echo "invalid container name '${pair#*:}' (${pair%%:*}): letters, digits, '_', '.' and '-' only, starting with a letter or digit" >&2
    exit 2
  fi
done

fail() {
  echo "✗ $1" >&2
  [ -n "${2:-}" ] && echo " switch to turn on: $2" >&2
  exit 1
}
ok() { echo "✓ $1"; }
note() { echo "• $1"; }

# Two layouts, one question — exactly as in `deploy-tracy-stack.sh`: on a live machine the action
# installs the script FLAT next to the two compose files (/opt/tracy-fleet/stack/); in a checkout it
# lives in `deploy/scripts/` and they sit one level up. Look for the file, don't guess the shape.
if [ -z "$STACK_DIR" ]; then
  if [ -f "$SCRIPT_DIR/compose.yml" ]; then STACK_DIR="$SCRIPT_DIR"; else STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; fi
fi
COMPOSE_FILE="$STACK_DIR/compose.yml"
SERVER_FILE="$STACK_DIR/compose.server.yml"
[ -f "$COMPOSE_FILE" ] || fail "no compose.yml in $STACK_DIR" "point --stack-dir at the directory holding compose.yml + compose.server.yml"
[ -f "$SERVER_FILE" ] || fail "no compose.server.yml in $STACK_DIR" "without it compose looks for a relative .env that does not exist on a server"
# TRACY_STACK_EXTRA_FILES: whitespace-separated, any whitespace (`set -f` so a `*` in a path is not a glob).
# Checked with the two base files, before the first docker call.
EXTRA_FILES=()
set -f
for extra in $EXTRA_FILES_LIST; do EXTRA_FILES+=("$extra"); done
set +f
for extra in ${EXTRA_FILES[@]+"${EXTRA_FILES[@]}"}; do
  [ -f "$extra" ] && [ -r "$extra" ] || fail "TRACY_STACK_EXTRA_FILES names $extra, which is missing or not readable" "point TRACY_STACK_EXTRA_FILES at readable compose files, or unset it"
done

# 🔒 ENV IN /etc, NOT deploy/.env — and this is where the first version of this very file was wrong.
# A live machine has no repo tree beside the compose files; the 51 keys live in a root-owned 0600
# file outside any checkout, and `compose.server.yml` `!override`s `env_file` to exactly that file.
[ -f "$ENV_FILE" ] || fail "no $ENV_FILE" \
  "this machine was never configured for the Tracy stack — write $ENV_FILE (chmod 600) from deploy/.env.example"
[ -r "$ENV_FILE" ] || fail "$ENV_FILE is not readable by the current user" "rerun with sudo — that file is root's 0600"

# Read the same way as `check-local.sh`: an end-of-line comment belongs to the LINE, not the
# VALUE, and `|| true` is what lets a MISSING key be reported instead of killing the script before it prints.
env_get() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' || true
}

# The services of THIS STACK. `tracy-dsh` and `docker-proxy` are absent on purpose: see the note at the top.
SERVICES="postgres tracy-web tracy-host"
#
# 🔒 EVERY `docker compose` IN THIS SCRIPT GOES THROUGH `dc`. A call that built its own argument list
# would read another project's containers than the ones the deploy created. The flag list is never
# empty (it always holds the env file and both base files), so it is safe on bash 3.2 under `set -u`.
# `TRACY_STACK_ENV_FILE` is what `env_file` in compose.server.yml interpolates; absolute, because a
# relative `env_file` is read against the compose directory and not this shell's.
case "$ENV_FILE" in /*) ENV_FILE_ABS="$ENV_FILE" ;; *) ENV_FILE_ABS="$PWD/$ENV_FILE" ;; esac
COMPOSE_FLAGS=()
[ -z "$PROJECT" ] || COMPOSE_FLAGS+=(-p "$PROJECT")
COMPOSE_FLAGS+=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$SERVER_FILE")
for extra in ${EXTRA_FILES[@]+"${EXTRA_FILES[@]}"}; do COMPOSE_FLAGS+=(-f "$extra"); done
dc() {
  TRACY_STACK_ENV_FILE="$ENV_FILE_ABS" HOST_SECRET=unused-for-read-only-commands \
    docker compose "${COMPOSE_FLAGS[@]}" "$@" 2>/dev/null
}
WEB_CT="$(dc ps -q tracy-web 2>/dev/null | head -1 || true)"

echo "── preflight (server) ──"
note "env  : $ENV_FILE"
note "proj : ${PROJECT:-<from compose file>}"
note "stack: $STACK_DIR"
[ "${#EXTRA_FILES[@]}" -eq 0 ] || note "extra: ${EXTRA_FILES[*]}"

# ── 1: is this real Linux ──────────────────────────────────────────────────────────────────────
# `network_mode: host` only means what it says here. On Docker Desktop it is the namespace of the
# Linux VM — nobody's — and the stack comes up green, then answers 502 FLEET_REFUSED on the first site create.
[ "$(uname -s)" = "Linux" ] || fail "this is not Linux ($(uname -s))" \
  "run check-local.sh on a dev machine; this file is for a live machine"
ok "Linux — network_mode: host means what its name says"

# ── 2: is the egress fence in place ────────────────────────────────────────────────────────────
# `provision.sh` refuses to build a site when the chain is missing, and RIGHTLY: without it every site
# container reaches the Internet freely.
if [ "$(env_get TRACY_EGRESS_FENCE)" = "off" ]; then
  note "TRACY_EGRESS_FENCE=off — acceptable on a dev machine, NOT on a live machine"
elif iptables -L TRACY-FLEET-EGRESS -n >/dev/null 2>&1; then
  ok "chain TRACY-FLEET-EGRESS present"
else
  fail "chain TRACY-FLEET-EGRESS missing" \
    "run /opt/tracy-fleet/provision/bootstrap.sh on this machine (once), then rerun this script"
fi

# ── 3: the three disk roots ────────────────────────────────────────────────────────────────────
check_root() {
  local name="$1" value
  value="$(env_get "$name")"
  [ -n "$value" ] || fail "$name empty in $ENV_FILE" "set $name to an absolute path"
  case "$value" in
    /*) : ;;
    *) fail "$name=\"$value\" is not absolute" "change $name in $ENV_FILE to an absolute path" ;;
  esac
  [ -d "$value" ] || fail "$name=\"$value\" does not exist" "mkdir -p \"$value\""
  ok "$name=$value"
}
check_root TRACY_SITES_ROOT
check_root TRACY_PRIVATE_ROOT
check_root TRACY_DSH_HOME

# ── 4: is the dsh profile seeded ───────────────────────────────────────────────────────────────
TDH="$(env_get TRACY_DSH_HOME)"
[ -f "$TDH/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json" ] \
  || fail "TRACY_DSH_HOME=$TDH has no profile" \
       "seed it once: /opt/tracy-fleet/dsh/seed-profile.sh (runs directly on Linux, unlike macOS)"
ok "TRACY_DSH_HOME has a profile"

echo "── running stack ──"

# ── 5: this stack's three services are healthy ─────────────────────────────────────────────────
MISSING=""
for svc in $SERVICES; do
  health="$(dc ps --format json "$svc" 2>/dev/null | jq -r '.Health // empty' | sed -n 1p)"
  if [ "$health" = "healthy" ]; then ok "$svc: healthy"; else MISSING="$MISSING $svc(${health:-not running})"; fi
done
[ -z "$MISSING" ] || fail "not all three services healthy:$MISSING" \
  "bring the stack up with deploy-tracy-stack.sh --tag <tag> (this file does not up), then rerun"

# ── 6: 🔒 THREE LINES FROM INSIDE tracy-web — the QUIETEST failure of the whole stack ───────────
#
# `HOST_<name>_ORIGIN` and `HOST_<name>_DSH_ORIGIN` are called from INSIDE the tracy-web container, so
# they must be addresses that container can resolve — not addresses that work when typed on the host.
# Measured 11/09, both were wrong in a way no service reported:
#   * `HOST_dev_ORIGIN=http://127.0.0.1:51720` — 127.0.0.1 inside the container is itself. `fetch
#     failed`. It must be `host.docker.internal:51720` (tracy-host listens on 0.0.0.0 in the host namespace).
#   * `HOST_dev_DSH_ORIGIN` — dsh is in another project and publishes `127.0.0.1:51700`, i.e. LOOPBACK: no
#     container can reach it over a bridge. `compose.server.yml` joins tracy-web to dsh's network.
# Each healthcheck probes only ITS OWN port, so the whole stack reports healthy while site creation
# returns 502 FLEET_REFUSED and the seat door silently refuses. This check is the only thing that sees it.
probe_from_web() {
  local label="$1" url="$2"
  docker exec "$WEB_CT" node -e "
    fetch('$url', { signal: AbortSignal.timeout(5000) })
      .then(r => { console.log('$label', r.status); process.exit(0) })
      .catch(e => { console.log('$label FAIL', e.message); process.exit(1) })
  " 2>/dev/null
}
[ -n "$WEB_CT" ] || fail "no tracy-web container found" "docker compose${PROJECT:+ -p $PROJECT} ps tracy-web"
HOST_NAME_V="$(env_get HOST_NAME)"
TRACY_HOST_PORT_V="$(env_get TRACY_HOST_PORT)"; TRACY_HOST_PORT_V="${TRACY_HOST_PORT_V:-51720}"
for pair in "tracy-host:$(env_get "HOST_${HOST_NAME_V}_ORIGIN")/health" "dsh:$(env_get "HOST_${HOST_NAME_V}_DSH_ORIGIN")/"; do
  what="${pair%%:*}"; url="${pair#*:}"
  if probe_from_web "$what" "$url" >/dev/null; then
    ok "tracy-web → $what ($url) answers"
  else
    fail "tracy-web CANNOT reach $what at $url" \
      "change HOST_${HOST_NAME_V}_$( [ "$what" = dsh ] && echo DSH_ORIGIN || echo ORIGIN ) in $ENV_FILE to an address seen FROM INSIDE the container: host.docker.internal:$TRACY_HOST_PORT_V for tracy-host, the service name on dsh's network for dsh"
  fi
done

# ── 7: tracy-host answers on the HOST's loopback ───────────────────────────────────────────────
HEALTH_OUT="$(curl -sS --max-time 5 "http://127.0.0.1:$TRACY_HOST_PORT_V/health")"
echo "$HEALTH_OUT" | grep '"docker":true' >/dev/null \
  || fail "tracy-host answers but lacks docker:true ($HEALTH_OUT)" \
       "check the docker socket bind in compose.yml, and whether /var/run/docker.sock is reachable"
ok "tracy-host /health: $HEALTH_OUT"

# ── 7b: every site on this host must be REACHABLE from tracy-web ───────────────────────────────
#
# 🔒 `siteTarget` dials by CONTAINER NAME (`http://<label>-web-1/`), so it resolves only on a network
# tracy-web has joined. A `compose up` RE-creates the container and brings along only the networks the
# compose file names — and each site has its own network, which cannot be listed there.
# Miss one connect and that site answers "unknown site" while the stack reports fully healthy.
SITE_LABELS="$(docker exec -i "$(docker ps -qf "name=$PG_CT" | sed -n 1p)" \
  psql -U tracy -d tracy -At -c "select label from site where host = '$HOST_NAME_V'" 2>/dev/null || true)"
if [ -z "$SITE_LABELS" ]; then
  ok "no site in the registry for this host — nothing to connect"
else
  # 🔒 COUNT WHAT WAS PROBED, NOT WHAT IS NAMED IN THE REGISTRY — the previous version merged the two and failed open.
  # `|| continue` below skips any label with no container (right: the registry may still hold a row whose
  # container was cleaned up), but the success line printed `wc -w $SITE_LABELS`, i.e. the REGISTRY count. On a
  # machine with no site containers yet, the loop probed EXACTLY NONE and printed "75 sites reachable".
  # Measured 28/09 on a new host mid-migration: fresh stack, 0 site containers, the gate still green and
  # saying 75 — exactly the fail-open shape this repo refuses everywhere else.
  unreachable=""
  probed=0
  skipped=0
  for label in $SITE_LABELS; do
    if ! docker inspect "${label}-web-1" >/dev/null 2>&1; then
      skipped=$((skipped + 1))
      continue
    fi
    probed=$((probed + 1))
    # 🔒 ASK DOCKER FOR THE PORT, DON'T DIAL 80. An EmDash site is Astro SSR listening on **4321**, not 80 —
    # WordPress and Joomla listen on 80. The previous version hard-coded 80, so it called **every EmDash
    # site** unreachable while they answered HTTP 200 on their own port: measured 28/09, 18 sites red, all 18
    # `ECONNREFUSED` on :80 and `HTTP 200` on :4321. The container's own `ExposedPorts` is the answer
    # (`4321/tcp`, `80/tcp`), so no guessing by platform and no list to maintain.
    port="$(docker inspect "${label}-web-1" \
      --format '{{range $p, $_ := .Config.ExposedPorts}}{{$p}}{{break}}{{end}}' 2>/dev/null \
      | cut -d/ -f1)"
    [ -n "$port" ] || port=80
    # `redirect: manual` — and this is the whole of the first version's bug, not a detail. Three of
    # these sites carry a CUSTOMER domain (e.g. a customer's own `.com`), so a bare fetch of
    # the container gets a 301 to that domain, and `fetch` FOLLOWS it — out of the container, to a
    # name this network cannot reach — and reports `fetch failed`. The check then called three
    # perfectly healthy sites unreachable while they served 200 to the world. What is being asked
    # here is "does a TCP connection to this container succeed", and a redirect already answers yes.
    if ! docker exec "$WEB_CT" node -e "fetch('http://${label}-web-1:${port}/',{redirect:'manual'}).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
      unreachable="$unreachable ${label}:${port}"
    fi
  done
  in_book=$(echo "$SITE_LABELS" | wc -w | tr -d " ")
  if [ -n "$unreachable" ]; then
    fail "tracy-web CANNOT reach:$unreachable" \
      "deploy-tracy-stack.sh step 6b reconnects those networks — rerun it, or docker network connect <label>_default <tracy-web>"
  elif [ "$probed" = 0 ]; then
    # The registry says this host has sites but NONE has a container: the host is not serving what it accepted.
    # This is a real failure, not "nothing to check yet" — on a freshly migrated machine it means the
    # webroots and volumes moved over but nobody brought the sites up.
    fail "the registry lists $in_book sites on this host but NONE has a container — probed 0" \
      "bring the sites up on this machine (per site: docker compose up -d in \$TRACY_PRIVATE_ROOT/<label>), then rerun"
  else
    ok "every site probed from tracy-web is reachable ($probed/$in_book sites; $skipped skipped for having no container)"
  fi
fi

# ── 8: the SPAs — read WHAT IS IN THE IMAGE, and ask whether the route answers ─────────────────
# `check-local.sh` reads `dist/` in the repo tree because locally `dist/` IS what gets served. A server
# has no repo: `apps/tracy-web/Dockerfile` COPYs the `dist/` folders into `/opt/tracy-web/static/`. Same
# disease (a wrong `base` makes the page return 200 with a BLANK body), different place to look from.
#
# ⚠ DON'T READ WITH `curl` — `/ops` IS BEHIND A DOOR. The first version of this check `curl`ed both and
# went red for `/ops`, because it answers **302 to /login** for an unauthenticated call. That 302 is the
# RIGHT answer; what must be checked is the file in the image, plus the question "does this route exist".
check_spa_in_image() {
  local name="$1" dir="$2" prefix="$3" html strays
  html="$(docker exec "$WEB_CT" cat "/opt/tracy-web/static/$dir/index.html" 2>/dev/null || true)"
  [ -n "$html" ] || fail "$name is not in the image (/opt/tracy-web/static/$dir/index.html)" \
    "build-app-images' build job builds the dist folders before docker build — read its log"
  strays="$(echo "$html" | grep -oE '(src|href)="/[^"]*"' | grep -v "\"$prefix" || true)"
  [ -z "$strays" ] || fail "$name built with the wrong base — it requests $(echo "$strays" | sed -n 1p | cut -d'"' -f2)" \
    "the dist/ in the image was built before vite.config.ts had a base — rebuild the image"
  ok "$name is in the image, with base $prefix"
}
check_spa_in_image @tracy/harness-web ops /ops/
check_spa_in_image @tracy/design-page design-inspiration /design-inspiration/
check_spa_in_image @tracy/wo-find-page find /find/
# The documentation site (S5, 28/09): same COPY shape, served at the ROOT of its own host
# (DOCS_ORIGIN, tasks/todo-desktop-update-policy.md H6). Built for `base: '/'`, so "every asset under
# the prefix" proves nothing; the failure to catch is a stale build still asking for `/docs/…`.
DOCS_HTML="$(docker exec "$WEB_CT" cat /opt/tracy-web/static/docs/index.html 2>/dev/null || true)"
[ -n "$DOCS_HTML" ] || fail "@tracy/docs is not in the image (/opt/tracy-web/static/docs/index.html)" \
  "the build job of build-app-images builds the dist folders before docker build — read its log"
if echo "$DOCS_HTML" | grep -E '(src|href)="/docs/' >/dev/null; then
  fail "@tracy/docs was built against the old base /docs/ — the docs host would serve pages with no assets" \
    "rebuild the image from a commit whose apps/tracy-docs/astro.config.mjs says base: '/'"
fi
echo "$DOCS_HTML" | grep -E '(src|href)="/_astro/' >/dev/null || fail "@tracy/docs index.html names no /_astro/ asset" \
  "rebuild the image; the build did not produce the site Astro writes"
ok "@tracy/docs is in the image, built for the root of its own host"

WEB_PORT_V="$(env_get WEB_PORT)"; WEB_PORT_V="${WEB_PORT_V:-51710}"
# A route that does NOT exist answers 404. Anything else (200 for an open page, 302 to the sign-in door)
# proves the route is there — so the check asks exactly that, not which status code it must be.
for path in /ops/ /design-inspiration/ /docs/; do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$WEB_PORT_V$path" || echo 000)"
  case "$CODE" in
    404|000) fail "$path answered $CODE — route missing" "check that app.js mounts static for $path" ;;
    *) ok "$path answered $CODE — route present" ;;
  esac
done

# ── 9: 🔒 THE SEAT SECRET MUST MATCH WHAT DSH BAKED ────────────────────────────────────────────
#
# dsh's `entrypoint.sh` reads `MCP_SEAT_SECRET` EXACTLY ONCE — when it first writes
# `/desk-home/dsh-passwords.env` — and NEVER rewrites it. On a machine that has already run dsh, that
# file exists and has a value baked in. Set `SEAT_<host>_SECRET` to anything else and the seat door
# SILENTLY refuses every call, with no log line saying why.
SEAT_ENV="$(env_get "SEAT_${HOST_NAME_V}_SECRET")"
if docker ps --format '{{.Names}}' | grep -Fx "$DSH_CT" >/dev/null; then
  BAKED="$(docker exec "$DSH_CT" sh -c 'sed -n "s/^MCP_SEAT_SECRET=//p" /desk-home/dsh-passwords.env' 2>/dev/null | head -1 || true)"
  if [ -z "$BAKED" ]; then
    fail "dsh baked an EMPTY MCP_SEAT_SECRET — the seat door is wide open" \
      "set MCP_SEAT_SECRET in \$TRACY_DSH_HOME/dsh-passwords.env to the same value as SEAT_${HOST_NAME_V}_SECRET, then docker restart $DSH_CT"
  elif [ "$BAKED" != "$SEAT_ENV" ]; then
    fail "SEAT_${HOST_NAME_V}_SECRET in $ENV_FILE DIFFERS from the value dsh baked" \
      "set SEAT_${HOST_NAME_V}_SECRET to EXACTLY the value in \$TRACY_DSH_HOME/dsh-passwords.env (dsh does not re-read its env after the first run)"
  else
    ok "SEAT_${HOST_NAME_V}_SECRET matches the value dsh baked"
  fi
else
  note "$DSH_CT is not running — MCP_SEAT_SECRET not compared; run this script again once the stack is up"
fi

# ── 10: the model key — ASK THE CONTAINER, NOT THE ENV FILE ─────────────────────────────────────
#
# ⚠ The previous version read `MODEL_API_KEY` from `/etc/tracy/tracy-web.env` and printed "set (reaches
# tracy-dsh as DEEPSEEK_API_KEY)". That was TRUE on a laptop and FALSE on a live machine, because on a
# server `tracy-dsh` does NOT belong to this compose project — it belongs to `tracy-host-dsh`, which reads
# `/etc/tracy/host-dsh.env`. Measured 11/09: tracy-web's env file had the key, the dsh container did not,
# and this check printed a ✓. A gate that lies is worse than no gate.
if docker ps --format '{{.Names}}' | grep -Fx "$DSH_CT" >/dev/null; then
  if docker exec "$DSH_CT" sh -c 'test -n "${DEEPSEEK_API_KEY:-}"' 2>/dev/null; then
    ok "$DSH_CT has the model key in its environment (DEEPSEEK_API_KEY)"
  else
    note "$DSH_CT has NO DEEPSEEK_API_KEY — every agent chat turn will die with MISSING_CREDENTIAL"
    note "  set MODEL_API_KEY in /etc/tracy/host-dsh.env and run deploy-host-dsh.sh again (NOT tracy-web.env)"
  fi
else
  note "$DSH_CT is not running — could not ask whether it has the model key"
fi
# tracy-web reads ITS OWN key for the brand half of /design-inspiration; that key lives elsewhere.
[ -n "$(env_get MODEL_API_KEY)" ] \
  || note "MODEL_API_KEY empty in $ENV_FILE — the brand half of /design-inspiration answers 503"

# ── 11: the domain must resolve FOR REAL, and lead to THIS STACK ───────────────────────────────
# Unlike local: no dnsmasq here makes up answers. Resolving is only the first half — the second is
# whether it reaches this tracy-web. A wildcard record pointing at the wrong tunnel still resolves
# fine, and the new site gets an address nobody can reach while creation answers 202.
SD="$(env_get SITE_DOMAIN)"
PFX="$(env_get SITE_ADDRESS_PREFIX)"
PROBE="${PFX}checkserver.${SD}"
if ! getent hosts "$PROBE" >/dev/null 2>&1; then
  note "$PROBE does not resolve — needs a wildcard record (or one record per site) pointing at this machine"
else
  ok "*.$SD resolves (tried $PROBE)"
  # tracy-web answers 404 for a label with no site — that is the RIGHT answer, and it proves the
  # call went the whole way. A wrong tunnel/route answers 502/530 or times out.
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://$PROBE/" || echo 000)"
  # 🔒 ONE `curl` OUT TO THE INTERNET DOES NOT PROVE IT COMES BACK HERE. It goes through Cloudflare and
  # into whichever machine is CURRENTLY running the tunnel — possibly a different one entirely. Measured
  # 28/09 on a new host: this 404 came from the OLD host, and the gate printed "reaches this stack". So ask
  # first: does THIS machine run a tunnel client? If not, the 404 is someone else's, and say exactly that.
  TUNNEL_HERE=no
  if systemctl is-active --quiet cloudflared 2>/dev/null \
    || docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'cloudflared|tunnel' >/dev/null; then
    TUNNEL_HERE=yes
  fi
  case "$CODE" in
    404)
      if [ "$TUNNEL_HERE" = yes ]; then
        ok "https://$PROBE/ answered 404 — the path reaches this stack (no site by that name, as expected)"
      else
        note "https://$PROBE/ answered 404, BUT this machine runs no tunnel client — that answer came from another machine holding the tunnel and proves nothing about this stack"
      fi
      ;;
    000) note "https://$PROBE/ did not answer — the tunnel/route does not lead this domain to the machine yet" ;;
    *) note "https://$PROBE/ answered $CODE — expected 404; check that the tunnel ingress points *.$SD at port $WEB_PORT_V" ;;
  esac
fi

# ── 12: API host (`API_ORIGIN`) — only when env sets it ─────────────────────────────────────────
# The same tracy-web answers one more hostname, and there it opens only the allowlist
# (`/health`, `/v1/*`, `/`, `/docs/*`, `/.well-known/*`). Two questions in one pass: does the path
# get there (`/health` 200), and is the door CLOSED properly (`/login` must be 404 `NOT_ON_THIS_HOST`).
# A `/login` answering 200 here means the API hostname falls through to the cowork surface — i.e. the
# container's `API_ORIGIN` differs from DNS/tunnel — and the `/v1` door reads cookies like every other.
# With no `API_ORIGIN` this deployment has no API host, and there is nothing to check.
API_ORIGIN_V="$(env_get API_ORIGIN)"
if [ -z "$API_ORIGIN_V" ]; then
  note "API_ORIGIN empty — this deployment has no API host (not checked)"
else
  API_ORIGIN_V="${API_ORIGIN_V%/}"
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$API_ORIGIN_V/health" || echo 000)"
  [ "$CODE" = 200 ] || fail "$API_ORIGIN_V/health answered $CODE — the API host does not reach tracy-web" \
    "check DNS + tunnel ingress for the API_ORIGIN hostname point at port $WEB_PORT_V of this machine"
  ok "$API_ORIGIN_V/health answers 200"
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$API_ORIGIN_V/login" || echo 000)"
  [ "$CODE" = 404 ] || fail "$API_ORIGIN_V/login answered $CODE — expected 404 NOT_ON_THIS_HOST; the API host is open like the cowork surface" \
    "API_ORIGIN in $ENV_FILE must carry EXACTLY the hostname DNS/tunnel send here (tracy-web compares the Host header's hostname with API_ORIGIN), then restart tracy-web"
  ok "$API_ORIGIN_V/login answers 404 — the API host opens only its allowlist"
fi

# ── 13: docs host (`DOCS_ORIGIN`) — required: the image carries the docs site ───────────────────
# tasks/todo-desktop-update-policy.md H6. tracy-web refuses to start without DOCS_ORIGIN, so an empty
# value here means the container was started from another env file than this one. Four answers:
# the docs host serves its root (200) and refuses a Tracy door (404); the API host's root sends the
# reader there (302); the OpenAPI document answers on both hosts (200).
DOCS_ORIGIN_V="$(env_get DOCS_ORIGIN)"
[ -n "$DOCS_ORIGIN_V" ] || fail "DOCS_ORIGIN is empty in $ENV_FILE — tracy-web does not start without it" \
  "set DOCS_ORIGIN (e.g. https://docs.<zone>) as deploy/.env.example says, then restart tracy-web"
DOCS_ORIGIN_V="${DOCS_ORIGIN_V%/}"
http_code() { curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$1" || echo 000; }
CODE="$(http_code "$DOCS_ORIGIN_V/")"
[ "$CODE" = 200 ] || fail "$DOCS_ORIGIN_V/ answered $CODE — the docs host does not reach tracy-web" \
  "check DNS + tunnel ingress for the DOCS_ORIGIN hostname point at port $WEB_PORT_V of this machine"
ok "$DOCS_ORIGIN_V/ answers 200"
CODE="$(http_code "$DOCS_ORIGIN_V/login")"
[ "$CODE" = 404 ] || fail "$DOCS_ORIGIN_V/login answered $CODE — expected 404 NOT_ON_THIS_HOST" \
  "DOCS_ORIGIN in $ENV_FILE must carry the hostname DNS/tunnel send here, then restart tracy-web"
ok "$DOCS_ORIGIN_V/login answers 404 — the docs host opens only its allowlist"
CODE="$(http_code "$DOCS_ORIGIN_V/api/openapi.json")"
[ "$CODE" = 200 ] || fail "$DOCS_ORIGIN_V/api/openapi.json answered $CODE" "read docker logs of tracy-web"
ok "$DOCS_ORIGIN_V/api/openapi.json answers 200"
# The newest desktop changelog page as raw markdown (E3): `release.mjs publish` stable reads it from
# here before a feed moves (E8), so a docs host that serves it as HTML or not at all blocks a release.
# Only when the image carries one — an image built before E3 has none, and that is not this check's.
LATEST_MD="$(docker exec "$WEB_CT" ls /opt/tracy-web/static/docs/changelog/desktop/ 2>/dev/null \
  | grep -E '^[0-9]+\.[0-9]+\.md$' | sort -t. -k1,1n -k2,2n | tail -1 || true)"
if [ -n "$LATEST_MD" ]; then
  MD_URL="$DOCS_ORIGIN_V/changelog/desktop/$LATEST_MD"
  MD_ANSWER="$(curl -sS -o /dev/null -w '%{http_code} %{content_type}' --max-time 10 "$MD_URL" || echo 000)"
  case "$MD_ANSWER" in
    "200 text/markdown"*) ok "$MD_URL answers 200 text/markdown" ;;
    "200 "*) fail "$MD_URL answered $MD_ANSWER — expected text/markdown; publish stable reads this file" \
      "rebuild the image from a commit whose apps/tracy-web/src/docs/route.js maps .md to text/markdown" ;;
    *) fail "$MD_URL answered $MD_ANSWER — expected 200 text/markdown; publish stable reads this file" \
      "DOCS_ORIGIN in $ENV_FILE must be the docs host this tracy-web serves (DNS + tunnel), then restart tracy-web" ;;
  esac
else
  note "the image carries no changelog/desktop/<X.Y>.md — built before E3, no raw changelog to check"
fi
if [ -n "$API_ORIGIN_V" ]; then
  CODE="$(http_code "$API_ORIGIN_V/")"
  [ "$CODE" = 302 ] || fail "$API_ORIGIN_V/ answered $CODE — expected 302 to the docs host" "read docker logs of tracy-web"
  ok "$API_ORIGIN_V/ answers 302"
  CODE="$(http_code "$API_ORIGIN_V/docs/api/openapi.json")"
  [ "$CODE" = 200 ] || fail "$API_ORIGIN_V/docs/api/openapi.json answered $CODE — the published address must stay" \
    "read docker logs of tracy-web"
  ok "$API_ORIGIN_V/docs/api/openapi.json answers 200"
fi

echo
echo "All green — the server stack is running."
