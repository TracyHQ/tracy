#!/usr/bin/env bash
#
# deploy-host-dsh — put a built image on this host's dsh, prove it answers, or put the old one back.
#
#   deploy-host-dsh.sh --tag 2026-09-07-a1b2c3d
#   deploy-host-dsh.sh --tag 2026-09-07-a1b2c3d --dry-run
#   deploy-host-dsh.sh --rollback
#
# It is the whole of a deploy. CI calls it, and so can a person over SSH — the same script, so the
# hand-run path is the one CI exercises daily rather than a paragraph in a runbook that has drifted.
#
# ## Why a script and not steps in the workflow
#
# `.github/workflows/*` cannot be run or debugged anywhere but GitHub. Every gate in this repo that
# could live in a script does (`scripts/check-*.ts`, `check-changelog.mjs`), for the reason
# CLAUDE.md §6 states outright: a CI gate you can only debug by pushing is an expensive gate. A
# deploy is worse than a gate — the first time you want to read it line by line is the night it
# half-finished.
#
# ## What it does, in order
#
#   1. Preflight: env file (with a non-empty TRACY_SITE_DOMAIN), compose file, and the haproxy
#      config that must sit BESIDE the compose file. All of it, before anything is pulled or written.
#   2. `docker pull` the image. A tag that is not in the registry fails here, with nothing changed.
#   3. Record the running tag as DSH_IMAGE_TAG_PREVIOUS, write the new one.
#   4. `docker compose up -d`.
#   5. Wait for the container to report healthy — up to --timeout, default 300s. The compose
#      healthcheck has a 180s start_period because dsh composes its plugin graph at boot, and on a
#      cold host that is minutes.
#   6. Prove it answers, and prove it is the image that was asked for.
#   7. Any failure after step 3 puts the previous tag back and brings that up, then exits non-zero.
#   8. Once healthy — and on the same-tag "nothing to deploy" exit too — put the shipped
#      `tracy-access.php` into every WordPress site on the host (#677). Its failure exits non-zero
#      and leaves the healthy image in place.
#
# ## 🔒 THE CHECKS GO THROUGH DOCKER, NEVER THROUGH 127.0.0.1
#
# The published port is `127.0.0.1:51700` ON THE HOST. This script also runs inside the CI runner's
# container, where `127.0.0.1` is that container's own loopback and nothing is listening on it. A
# smoke test written the obvious way passes on a host and fails in CI — or worse, is "fixed" by
# publishing the port more widely, which puts dsh's gateway somewhere it was never meant to be
# (host-dsh.yml, "Two ports"). `docker inspect` for health and `docker exec` for the request both
# ask the daemon, so they give the same answer from either side.
set -euo pipefail

DEFAULT_COMPOSE_FILE=/opt/tracy-fleet/dsh/host-dsh.yml
DEFAULT_ENV_FILE=/etc/tracy/host-dsh.env
# One prefix names every Tracy image repository: GHCR by default, the ECR registry plus
# `lab3-image/tracy-ai` once a host pulls from there.
LEGACY_IMAGE_PREFIX=ghcr.io/tracyhq
DEFAULT_IMAGE_REPO="${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}/tracy-dsh"
DEFAULT_CONTAINER=tracy-dsh
COMPOSE_FILE="${HOST_DSH_COMPOSE:-$DEFAULT_COMPOSE_FILE}"
ENV_FILE="${HOST_DSH_ENV_FILE:-$DEFAULT_ENV_FILE}"
IMAGE_REPO="${DSH_IMAGE:-$DEFAULT_IMAGE_REPO}"
# The dsh container the health wait, the smoke test and the rollback ask about. A second dsh on the
# same host (a trial shard next to the master) has its own `container_name:`, and this is how its
# deploy looks at THAT one instead of the master's.
CONTAINER="${HOST_DSH_CONTAINER:-$DEFAULT_CONTAINER}"
# 🔒 A SECOND dsh ON THE SAME HOST: with no `--project` and no HOST_DSH_PROJECT every compose command
# below is byte for byte the one it always was (no `-p`; compose reads `name:` from the file), because
# the config hash of the master's dsh is derived from it and a moved hash recreates it.
# NOT `TRACY_COMPOSE_PROJECT`: that name belongs to the app stack (deploy-tracy-stack.sh). A second stack's
# updater sets it for ITS app project, and a dsh deploy that read it would run `-p <that project>`,
# override host-dsh.yml's own `name:` and collide with the container that is already there.
# Never COMPOSE_PROJECT_NAME either: it would travel through env_file into the container's environment.
PROJECT="${HOST_DSH_PROJECT:-}"
TAG=""
ROLLBACK=0
DRY_RUN=0
TIMEOUT=300
DRAIN_TIMEOUT="${HOST_DSH_DRAIN_TIMEOUT:-1200}"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }

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

# Docker's rule for a container name, ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$. It is spliced into `docker inspect`
# and `docker exec`, so a value that is not a plain name is refused instead of being passed on.
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

# 🔒 `die` MUST ROLL BACK ONCE THE HOST HAS BEEN CHANGED, AND `trap ... ERR` CANNOT DO IT.
#
# An explicit `exit` does NOT fire an ERR trap — only a command returning non-zero does. Every
# failure after the trap is armed goes through `die`, so for the whole dangerous half of this
# script the trap was decoration: it read as protection and never ran.
#
# Measured 08/09 on the dev box. A build whose bundle named a plugin the image did not carry
# crash-looped; the health wait reached `die "still starting after 300s"`; the script exited 1 with
# the tag file already naming the broken build, no rollback attempted, and dev down until it was
# put back BY HAND. The workflow log shows the timeout and no "rolling back" line — which is
# exactly what it looked like from outside: a deploy that failed safely. It had not.
ROLLBACK_ARMED=0
die() {
  printf 'error: %s\n' "$*" >&2
  if [ "$ROLLBACK_ARMED" = 1 ]; then
    ROLLBACK_ARMED=0
    rollback   # ends in exit 1
  fi
  exit 1
}

# Prints $1 so a shell reads it back as the same single word: as it stands when it holds only safe
# characters, otherwise inside single quotes. Used for the rollback command, which is meant to be pasted.
shquote() {
  case "$1" in
    '' | *[!A-Za-z0-9_./:@%+=,-]*) printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")" ;;
    *) printf '%s' "$1" ;;
  esac
}

# The command that puts the previous image back, for the last line of a deploy. With every value at its
# default it is `$0 --rollback`, byte for byte what this line always printed. Any value that is not the
# default is repeated, because a rollback typed from this line must act on the dsh that was just deployed:
# the same project, container, env file, compose file and image repository — not the master's. Values are
# shell-quoted so the line can be pasted as it stands.
rollback_command() {
  local cmd=""
  [ "$CONTAINER" = "$DEFAULT_CONTAINER" ] || cmd="HOST_DSH_CONTAINER=$(shquote "$CONTAINER") "
  cmd="$cmd$0 --rollback"
  [ -z "$PROJECT" ] || cmd="$cmd --project $(shquote "$PROJECT")"
  [ "$ENV_FILE_ABS" = "$DEFAULT_ENV_FILE" ] || cmd="$cmd --env-file $(shquote "$ENV_FILE_ABS")"
  [ "$COMPOSE_FILE" = "$DEFAULT_COMPOSE_FILE" ] || cmd="$cmd --compose $(shquote "$COMPOSE_FILE")"
  # Compared with the GHCR name, not the prefix default: a line pasted later, in a shell without
  # TRACY_IMAGE_PREFIX, must still name the repository this deploy used.
  [ "$IMAGE_REPO" = ghcr.io/tracyhq/tracy-dsh ] || cmd="$cmd --image $(shquote "$IMAGE_REPO")"
  printf '%s' "$cmd"
}

# A usage error ends with 2 and has touched nothing: it runs before the first docker call.
usage_error() {
  usage >&2
  printf 'error: %s\n' "$*" >&2
  exit 2
}

usage() {
  cat <<'USAGE'
deploy-host-dsh.sh --tag <image tag> [options]
deploy-host-dsh.sh --rollback [options]

  --tag <tag>       image tag to deploy, e.g. 2026-09-07-a1b2c3d
  --rollback        redeploy DSH_IMAGE_TAG_PREVIOUS from the env file
  --image <repo>    image repository (default $TRACY_IMAGE_PREFIX/tracy-dsh, prefix default
                    ghcr.io/tracyhq; or $DSH_IMAGE)
  --env-file <path> default /etc/tracy/host-dsh.env
  --compose <path>  default /opt/tracy-fleet/dsh/host-dsh.yml
  --project <name>  run every compose command as `docker compose -p <name>` (default
                    $HOST_DSH_PROJECT; unset = no -p, compose reads `name:` from the file).
                    For a second dsh on this host. Not $TRACY_COMPOSE_PROJECT: that is the app stack's.
  --no-pull         the image is already on this host (loaded by hand); assert instead of pull
  --timeout <secs>  how long to wait for healthy (default 300)
  --drain-timeout <secs>
                    how long to wait for running customer work (imports, chat turns,
                    builds) before replacing dsh
                    (default 1200, or $HOST_DSH_DRAIN_TIMEOUT; 0 = do not wait)
  --dry-run         say what would happen, change nothing

Environment:
  HOST_DSH_COMPOSE      default for --compose
  HOST_DSH_ENV_FILE     default for --env-file. Every compose command also sees it (made absolute),
                        because host-dsh.yml interpolates its env_file from this variable and not
                        from --env-file: that is how a second dsh gets its own environment.
  HOST_DSH_CONTAINER    the dsh container to health-check, smoke-test and roll back
                        (default tracy-dsh; a second dsh names its own)
  HOST_DSH_PROJECT      default for --project
A second dsh (--project or HOST_DSH_CONTAINER) must also name its own env file: with the master's
default it is refused (exit 2).
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag needs a value}"; shift ;;
    --no-pull) NO_PULL=1 ;;
    --rollback) ROLLBACK=1 ;;
    --image) IMAGE_REPO="${2:?--image needs a value}"; shift ;;
    --env-file) ENV_FILE="${2:?--env-file needs a value}"; shift ;;
    --compose) COMPOSE_FILE="${2:?--compose needs a value}"; shift ;;
    --project) { [ $# -ge 2 ] && [ -n "$2" ]; } || usage_error "--project needs a project name"; PROJECT="$2"; shift ;;
    --timeout) TIMEOUT="${2:?--timeout needs a value}"; shift ;;
    --drain-timeout) DRAIN_TIMEOUT="${2:?--drain-timeout needs a value}"; shift ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
  shift
done

# ── 1. Preflight ────────────────────────────────────────────────────────────────────────────────
#
# All of it before anything is pulled or written. A deploy that stops halfway through because a
# file was missing leaves a host whose env file names a tag it never brought up.
#
# A project or container name docker would refuse is a usage error, and it is checked before the first
# docker call.
[ -z "$PROJECT" ] || valid_project_name "$PROJECT" \
  || usage_error "invalid project name '$PROJECT' (--project / HOST_DSH_PROJECT): lowercase letters, digits, '-' and '_' only, starting with a letter or digit"
valid_container_name "$CONTAINER" \
  || usage_error "invalid container name '$CONTAINER' (HOST_DSH_CONTAINER): letters, digits, '_', '.' and '-' only, starting with a letter or digit"
# host-dsh.yml interpolates its `env_file` from HOST_DSH_ENV_FILE, so compose is handed the file this run
# was given (absolute: a relative `env_file` is read against the compose directory, not this shell's). On
# the master it is the literal host-dsh.yml falls back to, and the config hash does not move.
case "$ENV_FILE" in /*) ENV_FILE_ABS="$ENV_FILE" ;; *) ENV_FILE_ABS="$PWD/$ENV_FILE" ;; esac
# 🔒 A SECOND dsh NAMES ITS OWN ENV FILE. A project or container name with the master's default env file
# would bring up a dsh named for the second stack that runs on the master's model key, seat secret and
# paths — and the smoke test would still pass.
SECOND_DSH=0
{ [ -z "$PROJECT" ] && [ "$CONTAINER" = "$DEFAULT_CONTAINER" ]; } || SECOND_DSH=1
if [ "$SECOND_DSH" = 1 ]; then
  if [ "$ENV_FILE_ABS" = "$DEFAULT_ENV_FILE" ]; then
    usage_error "--project / HOST_DSH_PROJECT / HOST_DSH_CONTAINER is set but the env file is still the master's $DEFAULT_ENV_FILE — pass --env-file (or HOST_DSH_ENV_FILE) for the second dsh's own file"
  fi
fi

# 🔒 EVERY `docker compose` THIS SCRIPT RUNS GOES THROUGH `dsh_compose`: the `up`, the config-hash
# comparison and the `ps -q` behind it. A call that built its own argument list would compute another
# hash, or act on another project, than the one `up` created. The list is never empty (it always holds
# the env file and the compose file), so it is safe on bash 3.2 under `set -u`.
COMPOSE_FLAGS=()
[ -z "$PROJECT" ] || COMPOSE_FLAGS+=(-p "$PROJECT")
COMPOSE_FLAGS+=(--env-file "$ENV_FILE" -f "$COMPOSE_FILE")
dsh_compose() { HOST_DSH_ENV_FILE="$ENV_FILE_ABS" DSH_IMAGE="$IMAGE_REPO" docker compose "${COMPOSE_FLAGS[@]}" "$@"; }

command -v docker >/dev/null || die "no docker on PATH"
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"

[ -f "$COMPOSE_FILE" ] || die "no compose file at $COMPOSE_FILE — ship packages/fleet/tracy-fleet-operation/dsh/ to /opt/tracy-fleet/dsh/ first"

# The compose file mounts ./docker-proxy.haproxy.cfg by a path relative to ITSELF. Missing, compose
# creates an empty DIRECTORY there and haproxy starts with no rules — the socket proxy is the whole
# boundary between one site and another, so this is checked, not assumed.
PROXY_CFG="$(dirname "$COMPOSE_FILE")/docker-proxy.haproxy.cfg"
[ -f "$PROXY_CFG" ] || die "no $PROXY_CFG beside the compose file — compose would create an empty directory there and haproxy would start with no rules"

[ -f "$ENV_FILE" ] || die "no $ENV_FILE — this host has never been initialised; run host-dsh-init.sh <host> first"

read_env() { grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r' || true; }

# 🔒 NO SITE DOMAIN, NO DEPLOY. site-tools recognises a site's own https origin
# (`https://<label>.<TRACY_SITE_DOMAIN>/`) only from this variable; without it `page.text` and
# `page.look` refuse every fleet page as REDIRECTED_OFF_SITE while the container reports healthy.
# Measured 24/09 on the dev host after #306: the env file had no domain and the agent was blind.
# Read from the FILE, not this process's environment: the file is what the container receives.
# The value is never printed.
#
# Checked STRICTER than read_env parses, because compose parses differently: `KEY= # todo` is empty
# to compose (inline comment), a later duplicate line overrides an earlier one, compose also
# accepts `KEY: value` as a declaration, and a bare `KEY` line (no `=`) unsets it. So: exactly one
# line may mention the key, bare, with `=` or with `:`; it must be a plain `TRACY_SITE_DOMAIN=`
# line, and its value — once one pair of surrounding quotes is removed — must be a bare hostname. Anything else is refused, not guessed at.
SITE_DOMAIN_MISSING="no usable TRACY_SITE_DOMAIN in $ENV_FILE — set exactly one line TRACY_SITE_DOMAIN=<domain>, the public site domain (the same value as SITE_DOMAIN in tracy-web.env), with no comment on that line; without it page.text and page.look refuse every fleet https page"
SITE_DOMAIN_LINES="$(grep -cE '^[[:space:]]*(export[[:space:]]+)?TRACY_SITE_DOMAIN[[:space:]]*(=|:|$)' "$ENV_FILE" 2>/dev/null || true)"
[ "$SITE_DOMAIN_LINES" = 1 ] || die "$SITE_DOMAIN_MISSING (found ${SITE_DOMAIN_LINES:-0} lines naming it)"
SITE_DOMAIN_VALUE="$(grep -m1 '^TRACY_SITE_DOMAIN=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r' || true)"
case "$SITE_DOMAIN_VALUE" in
  \"*\") SITE_DOMAIN_VALUE="${SITE_DOMAIN_VALUE#\"}"; SITE_DOMAIN_VALUE="${SITE_DOMAIN_VALUE%\"}" ;;
  \'*\') SITE_DOMAIN_VALUE="${SITE_DOMAIN_VALUE#\'}"; SITE_DOMAIN_VALUE="${SITE_DOMAIN_VALUE%\'}" ;;
esac
printf '%s' "$SITE_DOMAIN_VALUE" | grep -xE '[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?' >/dev/null || die "$SITE_DOMAIN_MISSING"
unset SITE_DOMAIN_VALUE SITE_DOMAIN_LINES SITE_DOMAIN_MISSING

CURRENT_TAG="$(read_env DSH_IMAGE_TAG)"
PREVIOUS_TAG="$(read_env DSH_IMAGE_TAG_PREVIOUS)"

if [ "$ROLLBACK" = 1 ]; then
  [ -z "$TAG" ] || die "--rollback and --tag are two different requests; pass one"
  [ -n "$PREVIOUS_TAG" ] || die "no DSH_IMAGE_TAG_PREVIOUS in $ENV_FILE — nothing to roll back to. Deploy a known-good tag with --tag."
  TAG="$PREVIOUS_TAG"
  say "rolling back: $CURRENT_TAG -> $TAG"
fi

[ -n "$TAG" ] || { usage >&2; die "--tag is required"; }
IMAGE="$IMAGE_REPO:$TAG"

say "host      : $(hostname)"
say "image     : $IMAGE"
say "running   : ${CURRENT_TAG:-<none>}"
say "env file  : $ENV_FILE"
say "project   : ${PROJECT:-<from compose file>}"
say "compose   : $COMPOSE_FILE"

if [ "$CURRENT_TAG" = "$TAG" ] && [ "$ROLLBACK" != 1 ]; then
  # Not an error, and not a no-op either: `up -d` still re-applies a changed compose file or a
  # changed proxy config, which is a real reason to run this on an unchanged tag.
  say "note: this tag is already the one named in the env file; continuing so compose can re-apply"
fi

# ── The access mu-plugin, onto every WordPress site — the last step of every deploy (#677) ──────
#
# provision copies `provision/access/wordpress/tracy-access.php` into a WordPress site only when the
# site is created, so a deploy that shipped a new one changed no existing site. The file mints admin
# sessions from a request header: a fix to it has to land at the deploy that ships it. So every
# deploy that ends healthy — a new image, a rollback, and the same-tag "nothing to deploy" exit,
# which is what most deploys are — ends with `tools/resync-access-plugin.sh`, which writes only
# where the bytes differ. Header of that script: what it refuses and why.
#
# 🔒 IT RUNS THROUGH THE DAEMON, IN A THROWAWAY CONTAINER OF THE IMAGE JUST DEPLOYED — for the same
# reason as the checks below. This script runs inside the deploy runner's container, which sees
# /opt/tracy-fleet and /etc/tracy (and on some hosts /srv/tracy) but NOT the sites root: run there,
# the resync would find no site and report success. The daemon mounts the HOST's paths at the same
# names, so it reaches the sites from either side; `--mount` (not `-v`) so a sites root that does
# not exist is an error instead of an empty directory. /run/lock is the host's, so a deploy and a
# hand run take the same lock.
#
# 🔒 P0: from tracy-access 0.4.0 the tool touches only sites that are READY (an access key and a
# readiness record of its kid, under `$PRIVATE_ROOT/.site-access/<label>/`) AND listed in
# `$PRIVATE_ROOT/.site-access/rollout.list`; every other site is "held" and keeps the plugin it has. So
# a normal deploy never pushes the strict plugin onto a site that cannot verify it, and a canary is
# one line in that file. No private root mounted → nothing is upgraded.
#
# Its failure fails the deploy WITHOUT rolling the image back: the image is healthy, and an older
# image would not undo what was written. The message names the sites and the command to rerun.
FLEET_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ACCESS_RESYNC="$FLEET_DIR/tools/resync-access-plugin.sh"
# The Joomla half: the Claude Cowork package carries the old, header-trusting plg_system_tracyaccess
# and its self-update puts it back over the signed one, so every deploy replaces it again on the
# same ready-and-listed (or born strict, provision/strict-site-access.sh) sites.
JOOMLA_ACCESS_RESYNC="$FLEET_DIR/tools/resync-joomla-access-plugin.sh"
SITES_ROOT="$(read_env HOST_SITES_ROOT)"
SITES_ROOT="${SITES_ROOT:-/srv/tracy-sites}"
# Where each site's webroot repo lives (`<root>/<label>/webroot-baseline.git`, lib/roots.sh), so the
# copy leaves an outside commit of its own in the site's history (plan site changes §6, Q2). A host
# whose root is elsewhere names it here; one where it does not exist gets the copy with no commit,
# as before.
PRIVATE_ROOT="$(read_env HOST_PRIVATE_ROOT)"
PRIVATE_ROOT="${PRIVATE_ROOT:-/srv/tracy}"

resync_access() {
  local tool
  for tool in "$ACCESS_RESYNC" "$JOOMLA_ACCESS_RESYNC"; do
    [ -x "$tool" ] || { printf 'error: no executable %s — ship packages/fleet/tracy-fleet-operation/scripts/tools/ to %s/tools/\n' "$tool" "$FLEET_DIR" >&2; return 1; }
  done
  say
  say "==> tracy-access.php onto every ready, rollout-listed WordPress site under $SITES_ROOT"
  local private=()
  if [ -d "$PRIVATE_ROOT" ]; then
    private=(--mount "type=bind,source=$PRIVATE_ROOT,target=$PRIVATE_ROOT" -e "TRACY_PRIVATE_ROOT=$PRIVATE_ROOT")
  else
    say "note: no $PRIVATE_ROOT (HOST_PRIVATE_ROOT) — the copies get no commit in the sites' history"
  fi
  docker run --rm --pull never --network none --user 0:0 --entrypoint bash \
    --mount "type=bind,source=$FLEET_DIR,target=$FLEET_DIR,readonly" \
    --mount "type=bind,source=$SITES_ROOT,target=$SITES_ROOT" \
    --mount "type=bind,source=/run/lock,target=/run/lock" \
    ${private[@]+"${private[@]}"} \
    -e "TRACY_SITES_ROOT=$SITES_ROOT" \
    -e "TRACY_DEPLOY_TAG=$TAG" \
    "$IMAGE" "$ACCESS_RESYNC" || return 1
  say "==> plg_system_tracyaccess onto every ready, rollout-listed Joomla site under $SITES_ROOT"
  docker run --rm --pull never --network none --user 0:0 --entrypoint bash \
    --mount "type=bind,source=$FLEET_DIR,target=$FLEET_DIR,readonly" \
    --mount "type=bind,source=$SITES_ROOT,target=$SITES_ROOT" \
    ${private[@]+"${private[@]}"} \
    -e "TRACY_SITES_ROOT=$SITES_ROOT" \
    "$IMAGE" "$JOOMLA_ACCESS_RESYNC" \
    || { printf 'error: the Joomla access resync failed: on the host, %s [<label>]\n' "$JOOMLA_ACCESS_RESYNC" >&2; return 1; }
}

# resync_or_fail <what stands> — the access resync, or a visible failure that says what it left.
resync_or_fail() {
  resync_access && return 0
  printf 'error: tracy-access.php did not reach every WordPress site on this host — see the lines above\n' >&2
  printf 'error: %s\n' "$1" >&2
  printf 'error: fix what is named, then on the host: %s [<label>]\n' "$ACCESS_RESYNC" >&2
  [ -z "${GITHUB_ACTIONS:-}" ] || echo "::error::tracy-access.php resync failed on $(hostname); $1"
  exit 1
}

if [ "$DRY_RUN" = 1 ]; then
  say
  say "--dry-run: would pull $IMAGE, write DSH_IMAGE_TAG=$TAG (keeping ${CURRENT_TAG:-<none>} as previous), and compose up -d"
  say "--dry-run: then, once healthy (or if nothing needs deploying), resync tracy-access.php from $FLEET_DIR/provision/access/wordpress/ into every WordPress site under $SITES_ROOT ($ACCESS_RESYNC, in a throwaway container of $IMAGE)"
  exit 0
fi

# ── The three things a deploy does to a host, and the way back ─────────────────────────────────
#
# Declared together and BEFORE the first step that changes anything, because `trap ... ERR` stores
# a NAME: arm it above the definition and a failure calls a function that does not exist yet, which
# is a rollback that silently is not one.

# Rewritten through a temp file and moved into place: a deploy interrupted mid-write must not leave
# the file that names this host's image half-written.
write_tag() {
  local new="$1" prev="$2" tmp
  # Redeploying the tag that is already running must not make it its own rollback target: that
  # would erase the only record of the build before it. Keep the previous one instead.
  [ "$prev" != "$new" ] || prev="$PREVIOUS_TAG"
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  grep -vE '^(DSH_IMAGE_TAG|DSH_IMAGE_TAG_PREVIOUS)=' "$ENV_FILE" > "$tmp"
  printf 'DSH_IMAGE_TAG=%s\n' "$new" >> "$tmp"
  [ -z "$prev" ] || printf 'DSH_IMAGE_TAG_PREVIOUS=%s\n' "$prev" >> "$tmp"
  chmod --reference="$ENV_FILE" "$tmp" 2>/dev/null || chmod 0644 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

compose_up() {
  dsh_compose up -d
}

rollback() {
  # Disarm first: a failing command INSIDE rollback would otherwise re-enter it through the ERR
  # trap, and a recovery that loops is worse than one that stops and says so.
  trap - ERR
  ROLLBACK_ARMED=0
  warn "deploy failed on $TAG"
  if [ -z "$CURRENT_TAG" ]; then
    warn "no previous tag — this host had never been deployed to, so there is nothing to put back."
    warn "the container is left as it is; read: docker logs $CONTAINER"
    exit 1
  fi
  warn "putting $CURRENT_TAG back"
  # 🔒 THE IMAGE MUST ALREADY BE ON THIS DISK, AND ROLLBACK MUST NOT TRY TO FETCH IT.
  #
  # This host holds no registry credentials on purpose — CI logs in, deploys, and logs out — so a
  # `docker pull` inside rollback answers `denied` and the rollback dies at its first step. Measured
  # 08/09 on the dev box: a deploy failed on a boot error, `--rollback` was run by hand, and it got
  # `error from registry: denied` while the previous image sat in the local cache the whole time.
  #
  # So: refuse EARLY and say what to do, rather than proceed and fail halfway. `image inspect` is a
  # local read — no network, no credentials.
  if ! adopt_local_image "$IMAGE_REPO:$CURRENT_TAG"; then
    warn "the previous image ($CURRENT_TAG) is not on this host and rollback cannot fetch it —"
    warn "this machine holds no registry token by design. Log in and pull it by hand:"
    warn "  docker login ${IMAGE_REPO%%/*} && docker pull $IMAGE_REPO:$CURRENT_TAG"
    warn "then run this script again with --rollback."
    exit 1
  fi
  write_tag "$CURRENT_TAG" "$PREVIOUS_TAG"
  # The profile belongs to an IMAGE, so putting the tag back without re-seeding leaves the old
  # container running the NEW build's plugins — a mismatch neither `docker inspect` nor the health
  # check can see.
  "$SEED" "$IMAGE_REPO:$CURRENT_TAG" "$DESK_HOME_DIR" || warn "could not re-seed the previous profile"
  if compose_up; then
    warn "rolled back to $CURRENT_TAG"
  else
    warn "ROLLBACK ALSO FAILED — this host is serving nothing. docker logs $CONTAINER"
  fi
  exit 1
}

# ── 2. Pull ─────────────────────────────────────────────────────────────────────────────────────
#
# Before touching the env file: a tag that does not exist, or credentials that do not work, fails
# here with the host exactly as it was.
say
if [ "${NO_PULL:-0}" = 1 ]; then
  # `--no-pull`: the image is already on this machine, put there some other way — today that means
  # `docker save | ssh … docker load` from the box that built it, which is how a host without GHCR
  # credentials gets an image at all (prod1, 09/09/2026: the read token was removed because the only
  # one available carried `repo` scope, i.e. write access to the whole repository from a machine
  # that runs customers' agent shells).
  #
  # 🔒 THE SAFETY THE PULL BOUGHT IS KEPT, NOT DROPPED. A pull failed loudly on a tag that does not
  # exist, with the host untouched; this asks the same question of the local store. What it cannot
  # do is notice that the local image is STALE for that tag — so use it only right after loading.
  say "==> --no-pull: expecting $IMAGE to be here already"
  adopt_local_image "$IMAGE" || {
    echo "!! --no-pull but $IMAGE is not on this host. Load it first:" >&2
    echo "   ssh <builder> \"docker save $IMAGE\" | docker load" >&2
    exit 1
  }
else
  say "==> docker pull $IMAGE"
  docker pull "$IMAGE"
fi

# ── 2b. Nothing to do? ─────────────────────────────────────────────────────────────────────────
#
# Since 15/09 `build-dsh-image.yml` deploys on EVERY push to its branch — the build is skipped when
# the image context did not change, and the deploy then asks for the tag the host already runs. The
# steps below were written for a NEW image: they wait up to --drain-timeout for running customer
# imports, re-seed the profile, and rewrite the env file. On an unchanged image all three are cost
# with no effect, and the drain is the expensive one — it can hold a deploy for twenty minutes, and
# a queued deploy holds this workflow's concurrency group.
#
# So this stops HERE when, and only when, all three hold:
#   1. the env file already names this tag;
#   2. the running dsh container is the image just pulled — compared by image ID, not tag, so a tag
#      re-pushed with different bytes (a forced rebuild) still deploys;
#   3. every service in the compose project carries the config hash compose would give it now — so a
#      changed host-dsh.yml, proxy config or env file still goes through `up -d` below.
# Any doubt (a missing container, an unreadable label) falls through to the full deploy.
if [ "$CURRENT_TAG" = "$TAG" ] && [ "$ROLLBACK" != 1 ]; then
  want_id="$(docker image inspect "$IMAGE" --format '{{.Id}}' 2>/dev/null || true)"
  have_id="$(docker inspect "$CONTAINER" --format '{{.Image}}' 2>/dev/null || true)"
  unchanged=1
  [ -n "$want_id" ] && [ "$want_id" = "$have_id" ] || unchanged=0
  if [ "$unchanged" = 1 ]; then
    while read -r service hash; do
      [ -n "$service" ] || continue
      # `|| true` on both: under `set -e` a failing substitution in an assignment ends the script,
      # and "any doubt falls through to the full deploy" has to include a compose that errors.
      cid="$( { dsh_compose ps -q "$service" 2>/dev/null || true; } | sed -n 1p)"
      label=""
      [ -z "$cid" ] || label="$(docker inspect "$cid" --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' 2>/dev/null || true)"
      [ -n "$label" ] && [ "$label" = "$hash" ] || { unchanged=0; say "    $service: compose config changed — deploying"; break; }
    done < <(dsh_compose config --hash '*' 2>/dev/null || echo "")
  fi
  if [ "$unchanged" = 1 ]; then
    state="$(docker inspect "$CONTAINER" --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo missing)"
    case "$state" in
      running/healthy|running/starting)
        say
        say "==> $IMAGE is already running here with this compose config ($state) — nothing to deploy"
        say "    no drain, no re-seed, no restart; env file left as it is (previous: ${PREVIOUS_TAG:-<none>})"
        # The fleet files may have changed even when the image did not: this is the deploy that
        # ships most tracy-access.php changes.
        resync_or_fail "the running image was not touched"
        exit 0 ;;
      *) say "    $CONTAINER is $state — deploying anyway" ;;
    esac
  fi
fi

# ── 3. The plugins, out of the image and onto the mount that hides them ────────────────────────
#
# 🔒 A DEPLOY THAT SKIPS THIS PULLS A NEW IMAGE AND CHANGES NOTHING ANYBODY SEES. host-dsh.yml
# mounts the host's /desk-home over the container's, and the profile — every Tracy plugin — lives
# under that path inside the image. Without re-seeding, `docker inspect` reports the new image, the
# health check passes, the deploy is green, and every seat keeps running the previous build's
# plugins. See the header of seed-profile.sh.
#
# ⚠ IT RUNS BEFORE THE ENV FILE IS TOUCHED, and that ordering was bought with a real failure.
# It used to run after, and on 07/09 the seed died (the runner could not see /srv/tracy) with the
# tag ALREADY rewritten and the rollback trap not yet armed: /etc/tracy/host-dsh.env named a build
# the machine had never run. Nothing here needs the tag written, so nothing writes it until the
# work that can still fail cheaply is done.
SEED="$(dirname "$0")/seed-profile.sh"
[ -x "$SEED" ] || die "no executable $SEED beside this script — the deploy would leave the old plugins in place and report success"
DESK_HOME_DIR="$(read_env HOST_DSH_HOME)"
DESK_HOME_DIR="${DESK_HOME_DIR:-/srv/tracy/host-dsh/home}"

# ── 2b. Drain: wait for long customer work before replacing the process it lives in ─────────────
#
# 🔒 ONE dsh SERVES EVERY SITE, AND AN IMPORT LIVES IN ITS MEMORY FOR TENS OF MINUTES (issue #83).
# Measured 14/09: a deploy for an unrelated PR recreated tracy-dsh mid-import; the customer got
# "Tracy restarted" and a site row the workspace picker could not open. Long work holds a lease file
# under $DSH_HOME/leases and refreshes it every 30s (the lease helper in `@tracy/core`, first
# written for imports in `tracy-add-site`); we write $DSH_HOME/draining so no NEW long work starts,
# then wait for the fresh leases to end. Since #295 chat turns and Build jobs hold the same lease as
# imports, each lease names its `kind`, and the wait reports them counted by kind.
#
# It never fails the deploy and never waits silently: on timeout it deploys anyway, names every
# piece of work it is about to cut off, and records them in $DSH_HOME/cut-by-deploy.json so the
# people it belonged to are told once dsh is back. Before the seed, because the seed rewrites plugin
# files under the running process. `--drain-timeout 0` skips the wait (the draining file is still
# honoured).
LEASE_DIR="$DESK_HOME_DIR/leases"
DRAIN_FILE="$DESK_HOME_DIR/draining"
CUT_FILE="$DESK_HOME_DIR/cut-by-deploy.json"
LEASE_STALE_SECS=120
# How often the wait looks again. Only a test has a reason to change it.
DRAIN_POLL_SECS="${HOST_DSH_DRAIN_POLL_SECS:-15}"

# A file's mtime in epoch seconds: GNU stat on the hosts, BSD stat where the tests run on a Mac.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }

# One line per fresh lease: the lease file's own JSON, one object on one line (lease.ts writes it
# with JSON.stringify, so it never spans lines).
fresh_leases() {
  [ -d "$LEASE_DIR" ] || return 0
  local now f age
  now="$(date +%s)"
  for f in "$LEASE_DIR"/*.json; do
    [ -e "$f" ] || continue
    age=$(( now - $(mtime "$f") ))
    # A lease with no heartbeat for two minutes belongs to a process that already died.
    [ "$age" -le "$LEASE_STALE_SECS" ] && printf '%s\n' "$(tr -d '\n' < "$f" 2>/dev/null)"
  done
  return 0
}

# "chat 1, import 2" — the fresh leases counted by their `kind`. A lease without one (written
# before kinds existed) counts as `work`.
by_kind() {
  printf '%s\n' "$1" \
    | awk '{ if (match($0, /"kind":"[^"]*"/)) print substr($0, RSTART + 8, RLENGTH - 9); else if (NF) print "work" }' \
    | sort | uniq -c | awk '{ printf "%s%s %s", (NR > 1 ? ", " : ""), $2, $1 } END { print "" }'
}

# 🔒 WHAT A DEPLOY CUT OFF IS WRITTEN DOWN, NOT ONLY LOGGED (#295). An Actions log is read by the
# person who deployed; the person whose chat turn stopped is somebody else, and they are told from
# this file once dsh is back. It is a JSON array of deploy records, newest last:
#   [{"at":"<ISO time>","tag":"<image tag>","work":[<each cut lease, as its own JSON>]}]
# Appended, not replaced: two deploys can cut work before anybody reads it, and the reader removes
# what it has reported. Written through a temp file and `mv`, because dsh may read it at any moment.
record_cut() {
  local record old tmp
  record="{\"at\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"tag\":\"$TAG\",\"work\":[$(printf '%s\n' "$1" | paste -sd, -)]}"
  old=""
  [ -f "$CUT_FILE" ] && old="$(tr -d '\n' < "$CUT_FILE" 2>/dev/null || true)"
  tmp="$CUT_FILE.$$.tmp"
  if [[ "$old" == \[*\] ]] && [ "$old" != "[]" ]; then
    printf '%s,%s]' "${old%]}" "$record" > "$tmp"
  else
    printf '[%s]' "$record" > "$tmp"
  fi
  mv -f "$tmp" "$CUT_FILE" || warn "could not write $CUT_FILE — the people whose work was cut off will not be told"
}

say
say "==> draining: waiting up to ${DRAIN_TIMEOUT}s for running customer work"
mkdir -p "$DESK_HOME_DIR" && touch "$DRAIN_FILE" || warn "could not write $DRAIN_FILE — new long work may start during the wait"
# Removed however this script ends. A file left behind by a killed deploy expires on its own (1h).
trap 'rm -f "$DRAIN_FILE"' EXIT
drain_deadline=$(( $(date +%s) + DRAIN_TIMEOUT ))
while :; do
  running="$(fresh_leases)"
  [ -n "$running" ] || { say "    nothing running"; break; }
  if [ "$(date +%s)" -ge "$drain_deadline" ]; then
    cut="$(printf '%s\n' "$running" | grep -c .)"
    warn "drain timed out after ${DRAIN_TIMEOUT}s — deploying anyway, which CUTS OFF $cut piece(s) of work ($(by_kind "$running")):"
    printf '%s\n' "$running" | sed 's/^/    /' >&2
    record_cut "$running"
    say "    cut off: $cut ($(by_kind "$running")), recorded in $CUT_FILE"
    [ -z "${GITHUB_ACTIONS:-}" ] || echo "::warning::deploy cut off $cut piece(s) of running customer work ($(by_kind "$running")) after ${DRAIN_TIMEOUT}s: $(printf '%s' "$running" | tr '\n' ' ')"
    break
  fi
  say "    still running: $(by_kind "$running") ($(( drain_deadline - $(date +%s) ))s left)"
  printf '%s\n' "$running" | sed 's/^/      /'
  sleep "$DRAIN_POLL_SECS"
done

say
say "==> seeding the profile from $IMAGE"
"$SEED" "$IMAGE" "$DESK_HOME_DIR"
# The site agent's notes store, dsh's own (host-dsh-init.sh step 2): a host initialised before it
# existed gets it here, on its next deploy (#210). Idempotent; it only ever creates or fixes ownership.
install -d -m 0700 -o 33 -g 33 "$SITES_ROOT/.site-notes" \
  || warn "could not make $SITES_ROOT/.site-notes dsh's — site notes are not kept on this host"

# ── 4. From here on the host is changed, so from here on there is a way back ───────────────────
say
if [ "$TAG" = "$CURRENT_TAG" ]; then say "==> DSH_IMAGE_TAG=$TAG (already this tag; rollback target stays ${PREVIOUS_TAG:-<none>})"; else say "==> DSH_IMAGE_TAG=$TAG (previous: ${CURRENT_TAG:-<none>})"; fi
trap 'rollback' ERR
ROLLBACK_ARMED=1
write_tag "$TAG" "$CURRENT_TAG"


# ── 5. Up ───────────────────────────────────────────────────────────────────────────────────────
say
say "==> docker compose up -d"
compose_up

# ── 6. Wait for healthy ─────────────────────────────────────────────────────────────────────────
#
# The health state, not the process state. `running` means the container did not exit; dsh spends
# its first minutes composing a plugin graph and is not serving anybody yet, which is why
# host-dsh.yml gives the check a 180s start_period.
say
say "==> waiting up to ${TIMEOUT}s for $CONTAINER to report healthy"
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  state="$(docker inspect "$CONTAINER" --format '{{.State.Status}}/{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' 2>/dev/null || echo 'missing/none')"
  case "$state" in
    running/healthy) say "    $state"; break ;;
    running/none)    say "    $state — no healthcheck defined; falling through to the smoke test"; break ;;
    exited/*|dead/*|missing/*) docker logs --tail 40 "$CONTAINER" 2>&1 || true; die "container is $state" ;;
  esac
  [ "$(date +%s)" -lt "$deadline" ] || { docker logs --tail 40 "$CONTAINER" 2>&1 || true; die "still $state after ${TIMEOUT}s"; }
  sleep 5
done

# ── 7. Prove it answers, and prove it is the image that was asked for ──────────────────────────
#
# Healthy is the container's own opinion; these two are ours. The first is the request a Worker
# makes — through the gateway, which is the seat door. Under 500 is the pass, for the reason
# host-dsh.yml states: an unauthenticated GET is a redirect or a 401 depending on which doors are
# open, and all of them mean "up and answering".
say
say "==> smoke: the gateway answers"
docker exec "$CONTAINER" node -e \
  'fetch("http://127.0.0.1:8080/").then(r=>{console.log("    HTTP",r.status);process.exit(r.status<500?0:1)}).catch(e=>{console.error("   ",e.message);process.exit(1)})'

# The second closes the gap between "what we meant to deploy" and "what is running". An env file
# can name a tag that a failed `up` never brought up; the container cannot lie about its own image.
say "==> the running container is the image that was deployed"
RUNNING_IMAGE="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
[ "$RUNNING_IMAGE" = "$IMAGE" ] || die "container runs $RUNNING_IMAGE, deployed $IMAGE"
say "    $RUNNING_IMAGE"

# Version stamps, from inside. Empty on an image built before these were added — a note, not a
# failure, because an old image is a legitimate thing to roll back to.
SRC="$(docker exec "$CONTAINER" printenv TRACY_SOURCE_COMMIT 2>/dev/null || true)"
DSHC="$(docker exec "$CONTAINER" printenv TRACY_DSH_COMMIT 2>/dev/null || true)"
if [ -n "$SRC$DSHC" ]; then
  say "    repo commit ${SRC:-?}, dsh commit ${DSHC:-?}"
else
  say "    (this image carries no commit stamp — built before they were added)"
fi

trap - ERR
ROLLBACK_ARMED=0

# ── 8. The access mu-plugin (see "The access mu-plugin" above) ─────────────────────────────────
# Disarmed first: the image is healthy, and its rollback would not undo a written site.
resync_or_fail "$IMAGE is up and healthy and was NOT rolled back"

say
say "deployed $IMAGE on $(hostname)"
say "roll back with: $(rollback_command)"
