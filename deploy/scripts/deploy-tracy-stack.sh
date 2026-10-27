#!/usr/bin/env bash
#
# deploy-tracy-stack — put a built pair of app images on this host, prove they answer, or put the
# previous pair back.
#
#   deploy-tracy-stack.sh --tag 2026-09-11-a1b2c3d
#   deploy-tracy-stack.sh --tag 2026-09-11-a1b2c3d --dry-run
#   deploy-tracy-stack.sh --rollback
#
# It is the whole of a deploy. CI calls it through `.github/actions/deploy-tracy-stack`, and so can
# a person over SSH — the same script, so the hand-run path is the one CI exercises daily instead
# of a runbook paragraph that has quietly drifted.
#
# ## Why a script and not steps in the workflow
#
# The same reason `deploy-host-dsh.sh` gives, and it has not stopped being true: a `.github/`
# workflow can be run and read nowhere but GitHub, and the first night you want to read a deploy
# line by line is the night it half-finished. Everything that touches the host is here.
#
# ## What it does, in order
#
#   1. Preflight: docker, compose v2, both compose files, the env file. All of it before anything
#      is pulled or written.
#   2. Resolve `HOST_SECRET` out of `HOST_<HOST_NAME>_SECRET` (see the block on it below).
#   3. `docker compose pull` the three services. A tag the registry does not have fails here, with
#      the host exactly as it was.
#   3b. When tracy-host is about to be replaced, wait (bounded) for the jobs it is running — a
#      provision killed mid-way is a customer's failed site (see the block at that step).
#   4. Record the running tag as APP_IMAGE_TAG_PREVIOUS, write the new one.
#   5. `docker compose up -d` — the three services this stack owns, named explicitly.
#   6. Wait for all three to report healthy, up to --timeout. Not a `sleep`: a fixed number is
#      either a slow deploy or a flaky one, and which of the two it is changes with the machine.
#   7. Prove they answer, from the host's own loopback, and prove the containers run the images
#      that were asked for.
#   8. Any failure after step 4 puts the previous tag back and brings that up, then exits non-zero.
#
# ## 🔒 THREE SERVICES, NAMED — NOT A BARE `up -d`
#
# `deploy/compose.yml` describes a WHOLE machine, laptop included: it also carries `tracy-dsh` and
# `docker-proxy` with fixed `container_name:`s. On a fleet host those two are already running, and
# they belong to a DIFFERENT compose project — `tracy-host-dsh`, from
# `/opt/tracy-fleet/dsh/host-dsh.yml`, deployed by `build-dsh-image.yml`. Project `tracy` cannot
# see them (different labels), so a bare `up -d` tries to CREATE `tracy-dsh` and dies on
# `Conflict. The container name "/tracy-dsh" is already in use` — after having pulled, written the
# tag, and started postgres. Worse would be it succeeding: one image build's dsh replaced by
# another's, restarting every agent session on the box, from a workflow that never built it.
#
# So the list is explicit and short, and it is the list of things THIS workflow builds plus the
# database they need. `minio` and `dns` are the other half of the same idea, and they stay out by
# simply not passing `--profile local`.
#
# ## 🔒 THE CHECKS RUN INSIDE `tracy-host`, WHICH IS THE HOST'S OWN LOOPBACK
#
# This script runs inside the CI runner's container, where `127.0.0.1` is that container's
# loopback and nothing is listening on it — a smoke test written the obvious way passes by hand on
# the host and fails in CI. `tracy-host` runs `network_mode: host`, so `127.0.0.1` INSIDE it is
# the machine's real loopback: the same address `curl` would use over SSH, the same one
# `deploy/scripts/check-server.sh` probes. Both doors are asked from there — `:51720` is
# tracy-host's own, and `:51710` is the port tracy-web publishes on that loopback, so reaching it
# from there proves the publish as well as the process.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# On a host the two compose files are installed side by side; in a checkout they are one level up
# from this script. Both are the same question — "where do the compose files live" — so it is one
# flag, and it defaults to the directory this script was run from if that has them.
STACK_DIR="${TRACY_STACK_DIR:-}"
# The master's own env file. A second stack must name another one, and the guard below refuses a
# `--project` that does not: it would otherwise deploy the master's whole environment under a new name.
DEFAULT_ENV_FILE=/etc/tracy/tracy-web.env
ENV_FILE="${TRACY_STACK_ENV_FILE:-$DEFAULT_ENV_FILE}"
# One prefix names every Tracy image repository (`<prefix>/tracy-web`, `<prefix>/tracy-host`):
# GHCR by default, the ECR registry plus `lab3-image/tracy-ai` once a host pulls from there.
# Each line stands alone (a test evaluates them one by one).
LEGACY_IMAGE_PREFIX=ghcr.io/tracyhq
WEB_IMAGE_REPO="${WEB_IMAGE:-${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}/tracy-web}"
HOST_IMAGE_REPO="${HOST_IMAGE:-${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}/tracy-host}"
# 🔒 A SECOND STACK ON THE SAME HOST (a trial shard next to the master) IS TOLD APART BY TWO THINGS THE
# MASTER NEVER SETS, and with neither set every compose command below is byte for byte the one it
# always was — same files, no `-p` — because the config hash of every master service is derived from
# it, and a moved hash recreates the master's containers at the next deploy.
#   --project / TRACY_COMPOSE_PROJECT   -> `docker compose -p <name>` (the compose file's `name: tracy`
#                                          would otherwise point a copy of it at the MASTER project)
#   TRACY_STACK_EXTRA_FILES             -> one more `-f` per entry, after the two base files
# Never COMPOSE_PROJECT_NAME: `env_file` would carry it into tracy-host, which hands its environment
# to provisioning, and every site's own `docker compose up` would take that project name.
PROJECT="${TRACY_COMPOSE_PROJECT:-}"
EXTRA_FILES_LIST="${TRACY_STACK_EXTRA_FILES:-}"
# The services this stack owns. See the block above for why this is a list and not `up -d`.
SERVICES=(postgres tracy-web tracy-host)
# What `--services` may name. A DEMO-ONLY host (tracy-fleet-01, `DEMO_HOSTS`) runs `tracy-host` and
# nothing else: the tracy-web that dials it lives on another machine. Deploying the full list there
# would start a second postgres and a second tracy-web nobody asked for (tracy-web depends on
# postgres; tracy-host depends on nothing, so `up -d tracy-host` alone is a complete stack).
KNOWN_SERVICES=" postgres tracy-web tracy-host "
has_service() { case " ${SERVICES[*]} " in *" $1 "*) return 0 ;; esac; return 1; }
TAG=""
ROLLBACK=0
DRY_RUN=0
NO_PULL=0
TIMEOUT=300
DRAIN_TIMEOUT="${TRACY_HOST_DRAIN_TIMEOUT:-600}"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }

# Compose's own rule for a project name, ^[a-z0-9][a-z0-9_-]*$: lowercase letters, digits, '-' and '_',
# the first one a letter or digit. The characters are spelled out and not given as a range, because a
# bracket range follows the locale; and a `case` pattern, unlike a `$(...)`, keeps a trailing newline.
valid_project_name() {
  case "$1" in
    '' | [!abcdefghijklmnopqrstuvwxyz0123456789]* | *[!abcdefghijklmnopqrstuvwxyz0123456789_-]*) return 1 ;;
  esac
  return 0
}

# Prints $1 so a shell reads it back as the same single word: as it stands when it holds only safe
# characters, otherwise inside single quotes. Used for the rollback command, which is meant to be pasted.
shquote() {
  case "$1" in
    '' | *[!A-Za-z0-9_./:@%+=,-]*) printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *) printf '%s' "$1" ;;
  esac
}

# The command that puts the previous pair back, for the last line of a deploy. With every value at its default
# it is `$0 --rollback`, byte for byte what this line always printed. Any value that is not the default is
# repeated, because a rollback typed from this line must act on the stack that was just deployed: the same
# project, env file, compose directory, overlays and services — not the master's. Values are shell-quoted
# so the line can be pasted as it stands. (Uses only variables, so a test can run this function alone.)
rollback_command() {
  local cmd="" dir
  [ "${#EXTRA_FILES[@]}" -eq 0 ] || cmd="TRACY_STACK_EXTRA_FILES=$(shquote "${EXTRA_FILES[*]}") "
  cmd="$cmd$0 --rollback"
  [ -z "$PROJECT" ] || cmd="$cmd --project $(shquote "$PROJECT")"
  [ "$ENV_FILE_ABS" = "$DEFAULT_ENV_FILE" ] || cmd="$cmd --env-file $(shquote "$ENV_FILE_ABS")"
  if [ "$STACK_DIR_EXPLICIT" = 1 ]; then
    case "$STACK_DIR" in /*) dir="$STACK_DIR" ;; *) dir="$PWD/$STACK_DIR" ;; esac
    cmd="$cmd --stack-dir $(shquote "$dir")"
  fi
  # Compared with the GHCR names, not the prefix default: a line pasted later, in a shell without
  # TRACY_IMAGE_PREFIX, must still name the repositories this deploy used.
  [ "$WEB_IMAGE_REPO" = ghcr.io/tracyhq/tracy-web ] || cmd="$cmd --web-image $(shquote "$WEB_IMAGE_REPO")"
  [ "$HOST_IMAGE_REPO" = ghcr.io/tracyhq/tracy-host ] || cmd="$cmd --host-image $(shquote "$HOST_IMAGE_REPO")"
  [ "$(IFS=,; printf '%s' "${SERVICES[*]}")" = postgres,tracy-web,tracy-host ] \
    || cmd="$cmd --services $(IFS=,; printf '%s' "${SERVICES[*]}")"
  printf '%s' "$cmd"
}

# 🔒 `die` MUST ROLL BACK ONCE THE HOST HAS BEEN CHANGED, AND `trap ... ERR` CANNOT DO IT ALONE.
# An explicit `exit` does not fire an ERR trap — only a command returning non-zero does — so every
# failure routed through `die` would skip a rollback that reads like protection and never runs.
# `deploy-host-dsh.sh` learned this on 08/09 by leaving the dev box down; the shape is copied
# deliberately rather than reinvented.
ROLLBACK_ARMED=0
die() {
  printf 'error: %s\n' "$*" >&2
  if [ "$ROLLBACK_ARMED" = 1 ]; then
    ROLLBACK_ARMED=0
    rollback   # ends in exit 1
  fi
  exit 1
}

# A usage error ends with 2 and has touched nothing: it runs before the first docker call.
usage_error() {
  usage >&2
  printf 'error: %s\n' "$*" >&2
  exit 2
}

usage() {
  cat <<'USAGE'
deploy-tracy-stack.sh --tag <image tag> [options]
deploy-tracy-stack.sh --rollback [options]

  --tag <tag>         image tag to deploy, e.g. 2026-09-11-a1b2c3d (BOTH app images carry it)
  --rollback          redeploy APP_IMAGE_TAG_PREVIOUS from the env file
  --web-image <repo>  default $TRACY_IMAGE_PREFIX/tracy-web (prefix default ghcr.io/tracyhq), or $WEB_IMAGE
  --host-image <repo> default $TRACY_IMAGE_PREFIX/tracy-host, or $HOST_IMAGE
  --env-file <path>   default /etc/tracy/tracy-web.env
  --stack-dir <path>  directory holding compose.yml + compose.server.yml
  --project <name>    run every compose command as `docker compose -p <name>` (default $TRACY_COMPOSE_PROJECT;
                      unset = no -p, compose reads `name:` from the file). For a second stack on this host.
  --timeout <secs>    how long to wait for all three to report healthy (default 300)
  --drain-timeout <secs>
                      how long to wait for tracy-host's running jobs before replacing it
                      (default 600, or $TRACY_HOST_DRAIN_TIMEOUT; 0 = do not wait)
  --no-pull           use the images already on this host (see the note at the pull step)
  --services <list>   comma-separated subset of postgres,tracy-web,tracy-host to deploy
                      (default all three; a demo-only host passes tracy-host)
  --dry-run           say what would happen, change nothing

Environment:
  TRACY_STACK_EXTRA_FILES  whitespace-separated compose files loaded after the two base files
                           (one more -f each, on every compose command); unset = none
  TRACY_STACK_ENV_FILE     default for --env-file; every compose command also sees it (absolute), so the
                           env_file lines of compose.server.yml follow the file this run was given
A --project run must also name its own env file: with the master's default it is refused (exit 2).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag needs a value}"; shift ;;
    --rollback) ROLLBACK=1 ;;
    --web-image) WEB_IMAGE_REPO="${2:?--web-image needs a value}"; shift ;;
    --host-image) HOST_IMAGE_REPO="${2:?--host-image needs a value}"; shift ;;
    --env-file) ENV_FILE="${2:?--env-file needs a value}"; shift ;;
    --stack-dir) STACK_DIR="${2:?--stack-dir needs a value}"; shift ;;
    --project) { [ $# -ge 2 ] && [ -n "$2" ]; } || usage_error "--project needs a project name"; PROJECT="$2"; shift ;;
    --timeout) TIMEOUT="${2:?--timeout needs a value}"; shift ;;
    --drain-timeout) DRAIN_TIMEOUT="${2:?--drain-timeout needs a value}"; shift ;;
    --no-pull) NO_PULL=1 ;;
    --services) IFS=',' read -r -a SERVICES <<<"${2:?--services needs a value}"; shift ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
  shift
done

# `TRACY_STACK_ENV_FILE` (what `env_file` in compose.server.yml interpolates) must be absolute: a relative
# `env_file` is read against the compose directory, not this shell's. An absolute path is passed through
# untouched, so on the master the string compose sees is exactly the literal it used to find there.
case "$ENV_FILE" in /*) ENV_FILE_ABS="$ENV_FILE" ;; *) ENV_FILE_ABS="$PWD/$ENV_FILE" ;; esac
# Whether the stack directory was named (flag or TRACY_STACK_DIR) and not found next to this script:
# only a named one is worth repeating in the rollback command.
STACK_DIR_EXPLICIT=0
[ -z "$STACK_DIR" ] || STACK_DIR_EXPLICIT=1

# ── 1. Preflight ────────────────────────────────────────────────────────────────────────────────
# Before the first docker call: a name compose would refuse is a usage error, not a half-run deploy.
[ -z "$PROJECT" ] || valid_project_name "$PROJECT" \
  || usage_error "invalid project name '$PROJECT' (--project / TRACY_COMPOSE_PROJECT): lowercase letters, digits, '-' and '_' only, starting with a letter or digit"
# 🔒 A SECOND STACK NAMES ITS OWN ENV FILE. `--project` with the master's default env file would bring up
# containers named for the new project that run on the master's secrets, its HOSTS and its ports — and
# the smoke test would still pass, because it asks the container what it was given.
if [ -n "$PROJECT" ] && [ "$ENV_FILE_ABS" = "$DEFAULT_ENV_FILE" ]; then
  usage_error "--project / TRACY_COMPOSE_PROJECT is set but the env file is still the master's $DEFAULT_ENV_FILE — pass --env-file (or TRACY_STACK_ENV_FILE) for the second stack's own file"
fi
[ "${#SERVICES[@]}" -gt 0 ] || die "--services names nothing"
for svc in "${SERVICES[@]}"; do
  case "$KNOWN_SERVICES" in *" $svc "*) ;; *) die "--services: unknown service '$svc' (known:$KNOWN_SERVICES)" ;; esac
done
# tracy-host is the one every shape keeps: it is what provisions sites, and its /health is the proof
# below that the deploy took. tracy-web without its postgres would wait on a dependency forever.
has_service tracy-host || die "--services must include tracy-host"
case "$DRAIN_TIMEOUT" in ''|*[!0-9]*) die "--drain-timeout takes a number of seconds, not '$DRAIN_TIMEOUT'" ;; esac
if has_service tracy-web && ! has_service postgres; then die "--services: tracy-web needs postgres"; fi

command -v docker >/dev/null || die "no docker on PATH"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"

# Default STACK_DIR last, so an explicit flag or env var still wins: a checkout has the files at
# `deploy/`, a host at wherever the action installed them.
if [ -z "$STACK_DIR" ]; then
  # Two layouts, one question. On a host the action installs this script FLAT beside the two
  # compose files (/opt/tracy-fleet/stack/); in a checkout it lives in `deploy/scripts/` and they
  # live one level up. Look for the file rather than assume the shape.
  if [ -f "$SCRIPT_DIR/compose.yml" ]; then
    STACK_DIR="$SCRIPT_DIR"
  else
    STACK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
  fi
fi
COMPOSE_FILE="$STACK_DIR/compose.yml"
SERVER_FILE="$STACK_DIR/compose.server.yml"
[ -f "$COMPOSE_FILE" ] || die "no compose.yml in $STACK_DIR — ship deploy/compose.yml there first"
[ -f "$SERVER_FILE" ] || die "no compose.server.yml in $STACK_DIR — without it compose looks for a relative .env that does not exist on a server, and tracy-host gets an empty HOST_SECRET"
[ -f "$ENV_FILE" ] || die "no $ENV_FILE — this host has never been configured for the Tracy stack"
# TRACY_STACK_EXTRA_FILES: whitespace-separated, any whitespace (`set -f` so a `*` in a path is not a glob).
# Checked here, with the two base files, so a typo stops the deploy before anything is pulled or written —
# compose itself would fail later, after the host had been changed.
EXTRA_FILES=()
set -f
for extra in $EXTRA_FILES_LIST; do EXTRA_FILES+=("$extra"); done
set +f
for extra in ${EXTRA_FILES[@]+"${EXTRA_FILES[@]}"}; do
  [ -f "$extra" ] && [ -r "$extra" ] || die "TRACY_STACK_EXTRA_FILES names $extra, which is missing or not readable"
done

read_env() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d '"'"'"'\r' || true; }

# ── 2. The one variable compose cannot spell ───────────────────────────────────────────────────
#
# The env file names a host's secret per host — `HOST_dev_SECRET`, `HOST_local_SECRET` — because a
# machine may hold more than one. Compose interpolation does not nest, so `compose.yml` has to
# write a literal (`${HOST_local_SECRET}`) and is right only on a host called `local`. Anywhere
# else the variable is unset, `apps/tracy-host/src/config.js` reads it with `need()`, and the
# container exits at boot saying a key is missing without saying which host it looked under.
# A shell can do what compose cannot, so it does it here, once, by name.
HOST_NAME_V="$(read_env HOST_NAME)"
[ -n "$HOST_NAME_V" ] || die "no HOST_NAME in $ENV_FILE — every other name below is derived from it"
HOST_SECRET="$(read_env "HOST_${HOST_NAME_V}_SECRET")"
[ -n "$HOST_SECRET" ] || die "no HOST_${HOST_NAME_V}_SECRET in $ENV_FILE (HOST_NAME=$HOST_NAME_V) — tracy-host would not boot"
export HOST_SECRET

TRACY_ORIGIN_V="$(read_env TRACY_ORIGIN)"
! has_service tracy-web || [ -n "$TRACY_ORIGIN_V" ] || die "no TRACY_ORIGIN in $ENV_FILE — the verification below has nothing to compare /api/config against"

# The two doors probed at the end. Read rather than written literally, and defaulted to the same
# values compose defaults to — Tracy's own block, 517xx, clear of the 52000-52999 pool
# `provision.sh` hands sites from. They used to be the literals 8080 and 8090; 8090 sat inside
# that pool, so the control plane's own port was one a new site could be given.
WEB_PORT_V="$(read_env WEB_PORT)"; WEB_PORT_V="${WEB_PORT_V:-51710}"
TRACY_HOST_PORT_V="$(read_env TRACY_HOST_PORT)"; TRACY_HOST_PORT_V="${TRACY_HOST_PORT_V:-51720}"

# 🔒 THE ADDRESS tracy-web DIALS MUST NAME THE PORT tracy-host LISTENS ON. Two values, two files,
# and nothing before this line compared them — which is how A1 in
# `tasks/deploy-len-production-main-v2.md` cost an afternoon: a `HOST_<name>_ORIGIN` that named a
# port nothing answered on produced `502 FLEET_REFUSED` while every healthcheck stayed green,
# because each one probes only its own port.
#
# It earns its place twice over on the deploy that moved these ports into Tracy's own 517xx block:
# an existing host whose env file still says `:8090` would otherwise come back up with tracy-host
# on 51720, tracy-web dialling 8090, and no red anywhere. Refuse, and say which line to edit.
# Only when tracy-web runs HERE: on a demo-only host the tracy-web that dials this tracy-host lives
# on another machine, with its own env file, and its own deploy checks its own address.
HOST_ORIGIN_V="$(read_env "HOST_${HOST_NAME_V}_ORIGIN")"
! has_service tracy-web || [ -n "$HOST_ORIGIN_V" ] || die "no HOST_${HOST_NAME_V}_ORIGIN in $ENV_FILE — tracy-web would have no address for tracy-host"
HOST_ORIGIN_HOST="$(printf '%s' "$HOST_ORIGIN_V" | sed -nE 's#^[a-z]+://([^/:]+).*$#\1#p')"
HOST_ORIGIN_PORT="$(printf '%s' "$HOST_ORIGIN_V" | sed -nE 's#^[a-z]+://[^/:]+:([0-9]+).*$#\1#p')"
# Only a DIRECT dial is checkable. `https://prod1-agent.tracy.ai/_host` is a legitimate value —
# tracy-web reaching tracy-host through the tunnel, where the port on the wire is 443 and the one
# tracy-host binds is nobody's business. Checking that shape would refuse a working deploy, which
# is worse than not checking it: a gate that cries wolf gets a `--skip` and then never speaks again.
has_service tracy-web || HOST_ORIGIN_HOST=""
case "$HOST_ORIGIN_HOST" in
  127.0.0.1 | localhost | host.docker.internal | tracy-host)
    [ "${HOST_ORIGIN_PORT:-}" = "$TRACY_HOST_PORT_V" ] || die \
      "HOST_${HOST_NAME_V}_ORIGIN is $HOST_ORIGIN_V, naming port ${HOST_ORIGIN_PORT:-<none>} — but tracy-host listens on $TRACY_HOST_PORT_V.
   Edit $ENV_FILE: HOST_${HOST_NAME_V}_ORIGIN=http://host.docker.internal:$TRACY_HOST_PORT_V
   (or pin the old port back with TRACY_HOST_PORT=${HOST_ORIGIN_PORT:-8090} — but check it is not
   inside the 52000-52999 pool provision.sh hands sites from, and that nothing else holds it).
   Left alone this deploy comes up with every healthcheck green and every site creation answering
   502 FLEET_REFUSED, because each healthcheck only ever probes its own port."
    ;;
esac

CURRENT_TAG="$(read_env APP_IMAGE_TAG)"
PREVIOUS_TAG="$(read_env APP_IMAGE_TAG_PREVIOUS)"

if [ "$ROLLBACK" = 1 ]; then
  [ -z "$TAG" ] || die "--rollback and --tag are two different requests; pass one"
  [ -n "$PREVIOUS_TAG" ] || die "no APP_IMAGE_TAG_PREVIOUS in $ENV_FILE — nothing to roll back to. Deploy a known-good tag with --tag."
  TAG="$PREVIOUS_TAG"
  say "rolling back: ${CURRENT_TAG:-<none>} -> $TAG"
fi

[ -n "$TAG" ] || { usage >&2; die "--tag is required"; }
WEB_IMAGE_FULL="$WEB_IMAGE_REPO:$TAG"
HOST_IMAGE_FULL="$HOST_IMAGE_REPO:$TAG"

say "host       : $(hostname) (HOST_NAME=$HOST_NAME_V)"
say "web image  : $WEB_IMAGE_FULL"
say "host image : $HOST_IMAGE_FULL"
say "running    : ${CURRENT_TAG:-<none>}"
say "env file   : $ENV_FILE"
say "project    : ${PROJECT:-<from compose file>}"
say "stack dir  : $STACK_DIR"
[ "${#EXTRA_FILES[@]}" -eq 0 ] || say "extra files: ${EXTRA_FILES[*]}"
say "services   : ${SERVICES[*]}"

if [ "$DRY_RUN" = 1 ]; then
  say
  PULL_WORDS="pull ${SERVICES[*]} at $TAG, then "
  [ "$NO_PULL" = 0 ] || PULL_WORDS="use the images already here, "
  say "--dry-run: would ${PULL_WORDS}write APP_IMAGE_TAG=$TAG (keeping ${CURRENT_TAG:-<none>} as previous), and compose up -d ${SERVICES[*]}"
  exit 0
fi

# `WEB_IMAGE`/`HOST_IMAGE`/`APP_IMAGE_TAG` reach compose through the SHELL, which outranks
# `--env-file` (measured 11/09 — a value in the env file loses to an exported one). The env file
# still records the tag, for a hand-run rollback that has no CI to tell it what was deployed.
#
# 🔒 EVERY `docker compose` THIS SCRIPT RUNS GOES THROUGH HERE. A call that built its own argument
# list would compute another config hash, or act on another project, than the one `up` created — the
# exact failure the project and extra-file knobs exist to prevent. The list is built once, and is
# never empty (it always holds the env file and both base files), so it is safe on bash 3.2 under
# `set -u`. `TRACY_STACK_ENV_FILE` is what `env_file` in compose.server.yml interpolates (ENV_FILE_ABS,
# made absolute right after the arguments are parsed).
COMPOSE_FLAGS=()
[ -z "$PROJECT" ] || COMPOSE_FLAGS+=(-p "$PROJECT")
COMPOSE_FLAGS+=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$SERVER_FILE")
for extra in ${EXTRA_FILES[@]+"${EXTRA_FILES[@]}"}; do COMPOSE_FLAGS+=(-f "$extra"); done
compose() {
  TRACY_STACK_ENV_FILE="$ENV_FILE_ABS" WEB_IMAGE="$WEB_IMAGE_REPO" HOST_IMAGE="$HOST_IMAGE_REPO" APP_IMAGE_TAG="$1" \
    docker compose "${COMPOSE_FLAGS[@]}" "${@:2}"
}

# A host that moved registry (GHCR -> ECR) still holds its earlier builds under the GHCR name only,
# and a local lookup by the new name would call them missing. When `<repo>:<tag>` is absent but the
# same image name and tag exist under ghcr.io/tracyhq, tag it under the new name (a local alias, no
# pull) and say so. Returns non-zero when neither is present.
adopt_local_image() {
  local ref="$1" legacy
  docker image inspect "$ref" >/dev/null 2>&1 && return 0
  legacy="$LEGACY_IMAGE_PREFIX/${ref##*/}"
  [ "$legacy" != "$ref" ] || return 1
  docker image inspect "$legacy" >/dev/null 2>&1 || return 1
  docker tag "$legacy" "$ref" || return 1
  say "==> $ref was not on this host; tagged it from $legacy"
}

# Rewritten through a temp file and moved into place: a deploy interrupted mid-write must not
# leave the file that names this host's images half-written. 0600 preserved — it holds 51 secrets.
write_tag() {
  local new="$1" prev="$2" tmp
  # Redeploying the tag that is already running (since 15/09 the app workflow deploys a content tag
  # on every push, and it is usually unchanged) must not make it its own rollback target: that would
  # erase the only record of the build before it. Keep the previous one instead.
  [ "$prev" != "$new" ] || prev="$PREVIOUS_TAG"
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  grep -vE '^(APP_IMAGE_TAG|APP_IMAGE_TAG_PREVIOUS)=' "$ENV_FILE" > "$tmp"
  printf 'APP_IMAGE_TAG=%s\n' "$new" >> "$tmp"
  [ -z "$prev" ] || printf 'APP_IMAGE_TAG_PREVIOUS=%s\n' "$prev" >> "$tmp"
  chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 0600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

rollback() {
  # Disarm first: a failing command inside rollback would re-enter it through the ERR trap, and a
  # recovery that loops is worse than one that stops and says so.
  trap - ERR
  ROLLBACK_ARMED=0
  warn "deploy failed on $TAG"
  if [ -z "$CURRENT_TAG" ]; then
    warn "no previous tag — this host had never run this stack, so there is nothing to put back."
    warn "the containers are left as they are; read: docker compose${PROJECT:+ -p $PROJECT} -f $COMPOSE_FILE logs"
    exit 1
  fi
  # 🔒 ROLLBACK MUST NOT PULL. A fleet host holds no registry credential by design — CI logs in,
  # deploys, and logs out — so a `docker pull` here answers `denied` and the rollback dies at its
  # first step while the previous image sits in the local cache. `image inspect` is a local read.
  local missing=""
  ! has_service tracy-web || adopt_local_image "$WEB_IMAGE_REPO:$CURRENT_TAG" || missing="$missing $WEB_IMAGE_REPO:$CURRENT_TAG"
  adopt_local_image "$HOST_IMAGE_REPO:$CURRENT_TAG" || missing="$missing $HOST_IMAGE_REPO:$CURRENT_TAG"
  if [ -n "$missing" ]; then
    warn "the previous images are not on this host and rollback cannot fetch them —"
    warn "this machine holds no registry token by design. Pull them by hand:"
    warn "  docker login ${HOST_IMAGE_REPO%%/*} &&$(printf ' docker pull %s &&' $missing) true"
    warn "then run this script again with --rollback."
    exit 1
  fi
  warn "putting $CURRENT_TAG back"
  write_tag "$CURRENT_TAG" "$PREVIOUS_TAG"
  if compose "$CURRENT_TAG" up -d "${SERVICES[@]}"; then
    warn "rolled back to $CURRENT_TAG"
  else
    warn "ROLLBACK ALSO FAILED — this host is serving nothing. docker compose${PROJECT:+ -p $PROJECT} -f $COMPOSE_FILE logs"
  fi
  exit 1
}

# ── 3. Pull ─────────────────────────────────────────────────────────────────────────────────────
#
# Before touching the env file: a tag that does not exist, or credentials that do not work, fails
# here with the host exactly as it was.
say
if [ "$NO_PULL" = 1 ]; then
  # 🔒 THIS HOST HOLDS NO REGISTRY CREDENTIAL, BY DESIGN — CI logs in, deploys, and logs out. So a
  # person on the box redeploying the tag that is ALREADY RUNNING (after editing the env file, or
  # after a compose override changed) meets `error from registry: denied` and gets nothing done,
  # while the images sit in the local cache. Measured 11/09, doing exactly that.
  #
  # Same local `image inspect` check `rollback` uses, and for the same reason: refusing here, by
  # name, beats an `up -d` that pulls implicitly and fails halfway. This flag is spelled out on the
  # command line rather than inferred from a failed pull — falling back silently would serve a
  # stale image the day someone re-pushes a tag, and say nothing about it.
  say "==> --no-pull: using the images already on this host"
  missing=""
  ! has_service tracy-web || adopt_local_image "$WEB_IMAGE_FULL" || missing="$missing $WEB_IMAGE_FULL"
  adopt_local_image "$HOST_IMAGE_FULL" || missing="$missing $HOST_IMAGE_FULL"
  [ -z "$missing" ] || die "--no-pull, but this host does not have:$missing"
else
  say "==> docker compose pull ${SERVICES[*]}"
  compose "$TAG" pull "${SERVICES[@]}"
fi

# ── 3b. Drain: let tracy-host finish its jobs before `up -d` replaces it ─────────────────────────
#
# 🔒 A REPLACED tracy-host TAKES EVERY JOB IT IS RUNNING WITH IT. `provision.sh`, `teardown.sh` and
# the webroot scripts are children of the container, so `up -d` with a new image kills them mid-way,
# and the next boot marks each one failed (`orphanJobs`, apps/tracy-host/src/jobs.js: "tracy-host
# restarted before this job finished"). The customer who pressed Build reads "Your site could not be
# finished". Measured 24/09/2026 on dev: an EmDash Business site died at "site network …" while
# deploy-dev replaced tracy-host (02:31 UTC) for a merge that had nothing to do with it; the same
# build, the same code, stands the site up in 49 s when nothing restarts it.
#
# The shape of deploy-host-dsh.sh's drain (§2b there): only when tracy-host is about to be replaced
# (a new image, or a changed compose config — the same test that script uses), bounded by
# --drain-timeout, never fails the deploy, and on timeout names every job it is about to cut off.
# BEFORE step 4, so the host is exactly as it was while this waits. Jobs are named by their opaque id
# only: a job's label and step carry the site's label, and an Actions log is not the place for it.
#
# 🔒 AND NO NEW JOB STARTS WHILE IT WAITS (#295). Before the first look this writes a `draining`
# marker into the jobs volume (`draining` in apps/tracy-host/src/jobs.js); tracy-host refuses a new
# provision with 503 HOST_UPDATING while it is fresh, and tracy-web tells the customer to press again
# in a few minutes. Without it a site pressed between the last look and `up -d` was killed by the
# replace. The marker carries its own end (the drain timeout plus fifteen minutes for `up` and the
# health wait), is removed when this script ends however it ends, and the new tracy-host removes it
# at boot, since by then the container it protected is gone.
host_replaced() {
  local cid want have want_hash have_hash
  # `|| true` throughout: under `set -e` a failing substitution ends the script, and any doubt here
  # must fall through to "replaced", which only costs a wait.
  cid="$( { compose "$TAG" ps -q tracy-host 2>/dev/null || true; } | sed -n 1p)"
  [ -n "$cid" ] || return 1   # no tracy-host running: nothing it is running can be cut off
  HOST_CID="$cid"
  want="$(docker image inspect "$HOST_IMAGE_FULL" --format '{{.Id}}' 2>/dev/null || true)"
  have="$(docker inspect "$cid" --format '{{.Image}}' 2>/dev/null || true)"
  { [ -n "$want" ] && [ "$want" = "$have" ]; } || return 0
  want_hash="$( { compose "$TAG" config --hash tracy-host 2>/dev/null || true; } | awk '$1 == "tracy-host" { print $2 }')"
  have_hash="$(docker inspect "$cid" --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' 2>/dev/null || true)"
  { [ -n "$want_hash" ] && [ "$want_hash" = "$have_hash" ]; } || return 0
  return 1
}

# One line per job the running tracy-host still has queued or running: "<id> <state>". Read inside
# the container, where the job files are (the `tracy-host-jobs` volume); node is what it ships.
host_jobs() {
  docker exec "$HOST_CID" node -e 'const fs=require("fs"),d="/var/lib/tracy-host/jobs";let f=[];try{f=fs.readdirSync(d)}catch{}for(const n of f){if(!n.endsWith(".json"))continue;let j;try{j=JSON.parse(fs.readFileSync(d+"/"+n,"utf8"))}catch{continue}if(j.state==="queued"||j.state==="running")console.log(`${j.id??n.slice(0,-5)} ${j.state}`)}' 2>/dev/null || true
}

# The marker lives in the volume, so any tracy-host container can write or remove it; `sh` because
# the job listing above is the only `node -e` this script sends, and keeping it the only one keeps
# the two apart in a log. Best effort both ways: a marker that could not be written costs the old
# gap back, never the deploy.
HOST_JOBS_DIR=/var/lib/tracy-host/jobs
set_host_draining() {
  local until_ms=$(( ($(date +%s) + DRAIN_TIMEOUT + 900) * 1000 ))
  docker exec "$HOST_CID" sh -c 'mkdir -p "$1" && printf "{\"until\":%s}" "$2" > "$1/draining.tmp" && mv -f "$1/draining.tmp" "$1/draining"' \
    sh "$HOST_JOBS_DIR" "$until_ms" >/dev/null 2>&1 \
    || warn "could not write the draining marker — a site pressed during the wait may still be cut off"
}
clear_host_draining() {
  local cid
  cid="$( { compose "$TAG" ps -q tracy-host 2>/dev/null || true; } | sed -n 1p)"
  [ -n "$cid" ] || return 0
  docker exec "$cid" sh -c 'rm -f "$1/draining"' sh "$HOST_JOBS_DIR" >/dev/null 2>&1 || true
}

HOST_CID=""
if host_replaced; then
  say
  say "==> draining tracy-host: waiting up to ${DRAIN_TIMEOUT}s for the jobs it is running"
  set_host_draining
  trap 'clear_host_draining' EXIT
  drain_deadline=$(( $(date +%s) + DRAIN_TIMEOUT ))
  while :; do
    running="$(host_jobs)"
    [ -n "$running" ] || { say "    nothing running"; break; }
    if [ "$(date +%s)" -ge "$drain_deadline" ]; then
      warn "drain timed out after ${DRAIN_TIMEOUT}s — replacing tracy-host anyway, which CUTS OFF:"
      printf '%s\n' "$running" | sed 's/^/    /' >&2
      [ -z "${GITHUB_ACTIONS:-}" ] || echo "::warning::deploy cut off tracy-host jobs after ${DRAIN_TIMEOUT}s: $(printf '%s' "$running" | tr '\n' ' ')"
      break
    fi
    say "    still running ($(( drain_deadline - $(date +%s) ))s left): $(printf '%s' "$running" | tr '\n' ' ')"
    sleep 10
  done
fi

# ── 4. From here on the host is changed, so from here on there is a way back ───────────────────
say
if [ "$TAG" = "$CURRENT_TAG" ]; then say "==> APP_IMAGE_TAG=$TAG (already this tag; rollback target stays ${PREVIOUS_TAG:-<none>})"; else say "==> APP_IMAGE_TAG=$TAG (previous: ${CURRENT_TAG:-<none>})"; fi
trap 'rollback' ERR
ROLLBACK_ARMED=1
write_tag "$TAG" "$CURRENT_TAG"

# ── 5. Up ───────────────────────────────────────────────────────────────────────────────────────
say
say "==> docker compose up -d ${SERVICES[*]}"
compose "$TAG" up -d "${SERVICES[@]}"

# ── 6. Wait for healthy ────────────────────────────────────────────────────────────────────────
#
# The health state, not the process state: `running` only means the container has not exited yet.
# All three carry a healthcheck in compose.yml, so all three are waited on — postgres included,
# because tracy-web answering while its database is still starting is the shape that turns a green
# deploy into a 500 five seconds later.
say
say "==> waiting up to ${TIMEOUT}s for ${SERVICES[*]} to report healthy"
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  pending=""
  for svc in "${SERVICES[@]}"; do
    cid="$(compose "$TAG" ps -q "$svc" 2>/dev/null | sed -n 1p)"
    if [ -z "$cid" ]; then pending="$pending $svc(no container)"; continue; fi
    state="$(docker inspect "$cid" --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
    case "$state" in
      running/healthy) ;;
      # A service with no healthcheck cannot be waited on, only observed. Say so rather than
      # count it as a pass in silence — the alternative reads identical to a real green.
      running/none) say "    $svc: running, no healthcheck defined — not proof of anything" ;;
      exited/*|dead/*) docker logs --tail 40 "$cid" 2>&1 || true; die "$svc is $state" ;;
      *) pending="$pending $svc($state)" ;;
    esac
  done
  [ -n "$pending" ] || { say "    all healthy"; break; }
  if [ "$(date +%s)" -ge "$deadline" ]; then
    for svc in "${SERVICES[@]}"; do
      say "--- $svc ---"; compose "$TAG" logs --tail 40 "$svc" 2>&1 || true
    done
    die "still waiting after ${TIMEOUT}s:$pending"
  fi
  sleep 5
done

# ── 6b. Re-join every site network tracy-web has to dial ───────────────────────────────────────
#
# 🔒 A `docker network connect` DOES NOT SURVIVE A REDEPLOY, AND THE FAILURE IS SILENT.
# `sites/resolver.js`'s `siteTarget` dials a site on this host by CONTAINER NAME
# (`http://<label>-web-1/`), which only resolves on a network tracy-web has joined. Sites created
# by `render-compose.sh` before P0 join the stack's own `tracy` network; isolated sites (P0, every new
# site and every one tools/secure-site-access.sh moved) sit on their own `<label>_default`, as do the
# fifteen carried over
# from the seven-Worker architecture (11/09) each sit on their own `<label>_default`, and tracy-web
# was attached to them by hand.
#
# `compose up` RECREATES the container, and a recreated container carries only the networks the
# compose file names. So without this loop, the next deploy takes every carried-over customer site
# off the air — with a green deploy, a healthy tracy-web, and an `unknown site` page as the only
# symptom. The networks cannot be listed in `compose.server.yml` either: there is one per site, and
# the set changes every time a site is created or torn down.
#
# So it is computed, every deploy, from the book itself — the same source `siteTarget` reads.
# A site whose network is missing is NAMED and the deploy FAILS: a customer site that tracy-web
# cannot reach is not a warning.
if has_service tracy-web; then
say
say "==> re-joining the site networks tracy-web dials by container name"
WEB_CID="$(compose "$TAG" ps -q tracy-web | sed -n 1p)"
[ -n "$WEB_CID" ] || die "no tracy-web container to attach networks to"
PG_CID="$(compose "$TAG" ps -q postgres | sed -n 1p)"
SITE_LABELS="$(docker exec -i "$PG_CID" psql -U tracy -d tracy -At \
  -c "select label from site where host = '$HOST_NAME_V'" 2>/dev/null || true)"
JOINED="$(docker inspect "$WEB_CID" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
missing=""
for label in $SITE_LABELS; do
  # A site on the stack's own `tracy` network needs nothing — that one is in the compose file.
  docker inspect "${label}-web-1" >/dev/null 2>&1 || continue
  net="$(docker inspect "${label}-web-1" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')"
  case " $net " in *" tracy_tracy "*) continue ;; esac
  own="${label}_default"
  docker network inspect "$own" >/dev/null 2>&1 || { missing="$missing $label(no $own)"; continue; }
  case " $JOINED " in
    *" $own "*) ;;
    # The alias is how an isolated site (P0, render-compose.sh `network-isolated`) posts its mail
    # back: `http://tracy-web:8080/_site-mail` on its own network, the only one it is on.
    *) docker network connect --alias tracy-web "$own" "$WEB_CID" && say "    joined $own" ;;
  esac
done
[ -z "$missing" ] || die "tracy-web cannot be attached to:$missing — those sites would answer 'unknown site'"
# If you ever add a reachability PROBE here, use `redirect: 'manual'`: a site carrying a
# customer domain 301s a bare fetch to that domain, `fetch` follows it off this network, and a
# healthy site reads as unreachable. check-server.sh carries the same note and the same reason.
say "    every site on this host is reachable by container name"
fi

# ── 7. Prove they answer, from the host's own loopback ─────────────────────────────────────────
#
# Both requests are made from inside `tracy-host`, which runs `network_mode: host` — see the block
# at the top of this file for why that, and not this script's own 127.0.0.1.
probe() { compose "$TAG" exec -T tracy-host curl -fsS --max-time 10 "$1"; }

if has_service tracy-web; then
say
say "==> smoke: tracy-web /api/config"
CONFIG_JSON="$(probe "http://127.0.0.1:$WEB_PORT_V/api/config")" || die "GET http://127.0.0.1:$WEB_PORT_V/api/config failed from the host's loopback"
say "    $CONFIG_JSON"
# Compared against the env file rather than a literal: the same script deploys production, and a
# hardcoded dev address would pass there while proving the opposite of what it claims.
printf '%s' "$CONFIG_JSON" | grep -F "\"origin\":\"$TRACY_ORIGIN_V\"" >/dev/null \
  || die "/api/config does not name origin $TRACY_ORIGIN_V (TRACY_ORIGIN in $ENV_FILE) — the app booted with a different environment than the one on disk"
say "    origin: $TRACY_ORIGIN_V"
fi

say "==> smoke: tracy-host /health"
HEALTH_JSON="$(probe "http://127.0.0.1:$TRACY_HOST_PORT_V/health")" || die "GET http://127.0.0.1:$TRACY_HOST_PORT_V/health failed from the host's loopback"
say "    $HEALTH_JSON"
# `docker:true` is the one claim that separates "the process is up" from "it can do its job": the
# socket bind, and the CLI reaching a daemon that answers. Without it every provision press fails.
printf '%s' "$HEALTH_JSON" | grep -F '"docker":true' >/dev/null \
  || die "tracy-host answers but reports docker:false — check the /var/run/docker.sock bind in compose.yml"

# ── 8. The containers run the images that were asked for ───────────────────────────────────────
#
# An env file can name a tag a failed `up` never brought up; a container cannot lie about its own
# image. This closes the gap between "what we meant to deploy" and "what is running".
say
say "==> the running containers are the images that were deployed"
check_image() {
  local svc="$1" want="$2" cid running
  cid="$(compose "$TAG" ps -q "$svc" | sed -n 1p)"
  running="$(docker inspect "$cid" --format '{{.Config.Image}}')"
  [ "$running" = "$want" ] || die "$svc runs $running, deployed $want"
  say "    $svc: $running"
}
! has_service tracy-web || check_image tracy-web "$WEB_IMAGE_FULL"
check_image tracy-host "$HOST_IMAGE_FULL"

trap - ERR
ROLLBACK_ARMED=0
say
say "deployed $TAG on $(hostname)"
say "roll back with: $(rollback_command)"
