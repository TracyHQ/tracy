#!/usr/bin/env bash
#
# tracy-updater - make this shard run the tags the master runs (spec section 5).
#
#   tracy-updater.sh [--dry-run]
#
# Started every 5 min by tracy-updater.timer, and at once by tracy-heartbeat.sh when the master's
# answer names tags this shard does not run.
#
# The master's answer is /var/lib/tracy/desired.json, kept whole by tracy-heartbeat.sh
# (docs/sre/hop-dong-cua-shard.md section 7): app_tag, dsh_tag, hold, reason, granted_until.
#
# NOTHING TO DO (one line said, exit 0) when:
#   - desired.json is missing or is not an object;
#   - the master's answer is older than 15 min: a heartbeat that cannot reach the master must not
#     leave an old order to be carried out later, after the master moved on;
#   - `hold` is anything but false (BUSY: K = 2 shards updating; PINNED at /ops; MIGRATION_AHEAD: a
#     migration head that would go backwards; TAG_UNKNOWN, whose tags are null) - read BEFORE the
#     tags, so a TAG_UNKNOWN answer is a hold and not a refusal;
#   - a desired tag is not an image tag (those strings reach docker and file names below);
#   - both tags already match: equal, never "newer" (spec 5);
#   - ANY update failed less than 60 min ago: a broken tag must not drain dsh for 20 minutes every
#     5 minutes. updater.json says ok=false, the heartbeat sends it as last_update.ok, and the
#     master grants this shard no slot meanwhile. The master shows the failure; a person pins or fixes;
#   - the master granted no update slot, or the slot has ended (granted_until, K = 2 at once).
#
# OTHERWISE, under flock (one updater at a time; tracy-heartbeat.sh never takes this lock):
#   1. docker login with /etc/tracy/registry.env, THIS shard's own pull credential (see REGISTRY);
#   2. docker pull tracy-host:<app tag>; sync-fleet-files.sh lifts /opt/tracy-fleet/{stack,dsh,lib,
#      provision,tools,webroot,web} out of it (W5 P4; spec 5 item 19). stack/ is flat, in the image
#      as on this machine (contract section 10);
#   3. shard-env-check.sh on tracy-web.env: a forbidden variable would fail the boot anyway;
#   4. web/IMAGE_TAGS changed: web/build.sh builds the missing site images BEFORE the new tracy-host
#      goes live, because the provision inside that image reads the new IMAGE_TAGS (amendment 4);
#   5. app tag differs: deploy-tracy-stack.sh --tag <app> --services postgres,tracy-web,tracy-host;
#   6. dsh tag differs: deploy-host-dsh.sh --tag <dsh> (drains customer work up to 1200 s);
#   7. nginx: nginx-shard.conf changed -> nginx -t first, then recreated; else `up -d --no-deps
#      nginx` (applies a changed compose.shard.yml, no-op otherwise); systemd units changed ->
#      installed;
#   8. old images pruned, docker logout, /var/lib/tracy/updater.json written.
# REGISTRY (/etc/tracy/registry.env, 0600, written by install-shard.sh; contract section 9):
#   REGISTRY_AUTH=ghcr (the default when the line is absent, so a file holding only the two GHCR
#     lines keeps working): GHCR_USER + GHCR_TOKEN (read:packages PAT), images under ghcr.io/tracyhq.
#   REGISTRY_AUTH=ecr: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (pull-only IAM user), AWS_REGION,
#     ECR_REGISTRY (<account>.dkr.ecr.<region>.amazonaws.com) and TRACY_IMAGE_PREFIX
#     (<ECR_REGISTRY>/lab3-image/tracy-ai). The login token comes from the aws-cli image, so the shard
#     needs no AWS CLI; the keys reach it through a 0600 --env-file, never an argv. An ECR token lives
#     12 h, and this script logs in on every run.
#   TRACY_IMAGE_PREFIX names the three repositories, <prefix>/tracy-{web,host,dsh}, either way.
#   docker keeps the login in $DOCKER_CONFIG when that is set (the d1 drop-in sets it), ~/.docker otherwise.
# The slot is checked once, at the start: a dsh drain may outlast it, and the master keeps a slot
# while the heartbeat reports `updating: true`.
# Both deploy scripts already pull, record the previous tag, wait for healthy, probe and roll back
# on their own; this script orders them and reports. SLA (G3 acceptance, amendment 9), counted from
# the master's new tag: app only <= 10 min, a dsh change <= 30 min; a web/IMAGE_TAGS change adds the
# site image builds on top.
#
# SECOND STACK ON ONE HOST (a trial shard co-hosted with the master; plan C). Every knob below is
# unset on a dedicated shard, and then nothing in this script differs from the steps above.
#   TRACY_WEB_ENV, TRACY_DSH_ENV, TRACY_REGISTRY_ENV, TRACY_STATE_DIR, TRACY_LOG_DIR, TRACY_FLEET_DIR,
#   TRACY_UPDATER_LOCK     the second stack's own files and directories (supported overrides, and
#                          what the tests use). TRACY_FLEET_DIR also holds the compose files.
#   TRACY_COMPOSE_PROJECT  compose project of the second stack's app services. Passed to
#                          deploy-tracy-stack.sh as `--project`, and to every nginx compose command
#                          as `-p`. NOT passed to deploy-host-dsh.sh: that one takes
#                          HOST_DSH_PROJECT, and a dsh whose host-dsh.cohost.yml carries its own
#                          `name:` needs neither.
#   TRACY_STACK_EXTRA_FILES  whitespace-separated compose files loaded after the shard's own, on the
#                          stack deploy AND on every nginx command: one file set for every `up`, so
#                          no config hash flips between them.
#   HOST_DSH_COMPOSE, HOST_DSH_CONTAINER, HOST_DSH_PROJECT  taken from this script's environment and
#                          handed on to deploy-host-dsh.sh as they are; HOST_DSH_ENV_FILE is always
#                          TRACY_DSH_ENV (the file whose DSH_IMAGE_TAG this script reads).
#   TRACY_SKIP_UNITS=1     do not install systemd units (their names carry no prefix: they would
#                          replace the master's own).
#   TRACY_PRUNE=0          do not prune old images (the master's rollback images share the host).
#   TRACY_SKIP_WEB_IMAGES=1  do not build site images from web/IMAGE_TAGS (the master owns them).
#
# THE WHOLE SCRIPT RUNS INSIDE main(), AND THAT IS LOAD-BEARING: step 2 replaces this very file.
# bash reads a function's body completely before running it, so the old copy finishes as it began.
set -euo pipefail

DEFAULT_WEB_ENV=/etc/tracy/tracy-web.env
DEFAULT_FLEET_DIR=/opt/tracy-fleet
WEB_ENV="${TRACY_WEB_ENV:-$DEFAULT_WEB_ENV}"
DSH_ENV="${TRACY_DSH_ENV:-/etc/tracy/host-dsh.env}"
REGISTRY_ENV="${TRACY_REGISTRY_ENV:-/etc/tracy/registry.env}"
STATE_DIR="${TRACY_STATE_DIR:-/var/lib/tracy}"
LOG_DIR="${TRACY_LOG_DIR:-/var/log/tracy}"
FLEET_DIR="${TRACY_FLEET_DIR:-$DEFAULT_FLEET_DIR}"
LOCK_FILE="${TRACY_UPDATER_LOCK:-/run/lock/tracy-updater.lock}"
PROJECT="${TRACY_COMPOSE_PROJECT:-}"
EXTRA_FILES_LIST="${TRACY_STACK_EXTRA_FILES:-}"
SKIP_UNITS="${TRACY_SKIP_UNITS:-0}"
PRUNE="${TRACY_PRUNE:-1}"
SKIP_WEB_IMAGES="${TRACY_SKIP_WEB_IMAGES:-0}"
# Set from $REGISTRY_ENV by load_registry, before anything reads them.
REGISTRY_AUTH=ghcr
REGISTRY_HOST=ghcr.io
IMAGE_PREFIX=ghcr.io/tracyhq
WEB_IMAGE_REPO=ghcr.io/tracyhq/tracy-web
HOST_IMAGE_REPO=ghcr.io/tracyhq/tracy-host
DSH_IMAGE_REPO=ghcr.io/tracyhq/tracy-dsh
# The image that turns the pull key into a docker login token, pinned to one release.
AWS_CLI_IMAGE="${TRACY_AWS_CLI_IMAGE:-public.ecr.aws/aws-cli/aws-cli:2.17.0}"
ECR_REGISTRY_RE='^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$'
STALE_SECS=900
BACKOFF_SECS=3600
TAG_RE='^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
# The shard's own units, flat in /opt/tracy-fleet/stack (contract section 10, plus the backup pair).
SHARD_UNITS="tracy-heartbeat.service tracy-heartbeat.timer tracy-updater.service tracy-updater.timer tracy-backup-postgres.service tracy-backup-postgres.timer"
DRY_RUN=0
WANT_APP=""; WANT_DSH=""; CUR_APP=""; CUR_DSH=""; RUN_DIR=""; LOG=""

say() { printf 'updater: %s\n' "$*"; }
read_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d '"'"'"'\r' || true; }
sha_of() { if [ -f "$1" ]; then openssl dgst -sha256 < "$1" | awk '{print $NF}'; else echo none; fi; }
units_sha() {
  local unit
  { for unit in $SHARD_UNITS; do cat "$FLEET_DIR/stack/$unit" 2>/dev/null || true; done; } | openssl dgst -sha256 | awk '{print $NF}'
}
is_tag() { printf '%s' "$1" | grep -E "$TAG_RE" >/dev/null; }
abs_path() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }

# iso_epoch <ISO 8601 UTC, as Date.prototype.toISOString writes it>: seconds since the epoch, or
# nothing. BSD date first (a Mac running the tests; GNU date refuses -j), then GNU date (the shard).
# Not the other way round: an old BSD date reads -d as "set the DST flag", not as a date.
iso_epoch() {
  local iso="${1%Z}"
  iso="${iso%%.*}"
  case "$iso" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]) ;; *) return 0 ;; esac
  date -j -u -f '%Y-%m-%dT%H:%M:%S' "$iso" +%s 2>/dev/null || date -u -d "${iso}Z" +%s 2>/dev/null || true
}

# Returns 0 when there is an update to make (WANT_* and CUR_* are set); 1 with one line said otherwise.
decide() {
  local desired="$STATE_DIR/desired.json" last="$STATE_DIR/updater.json" now received hold reason failed_at granted granted_epoch
  [ -f "$desired" ] || { say "no desired state yet - the master has not answered a heartbeat"; return 1; }
  jq -e 'type == "object"' "$desired" >/dev/null 2>&1 || { say "refusing: $desired is not a JSON object"; return 1; }
  now="$(date +%s)"
  received="$(jq -r '.received_at // 0' "$desired")"
  case "$received" in ''|*[!0-9]*) received=0 ;; esac
  if [ $((now - received)) -gt "$STALE_SECS" ]; then
    say "stale: the master's last answer is $((now - received)) s old - waiting for a fresh one"
    return 1
  fi
  # Before the tags: TAG_UNKNOWN holds with null tags, and that is an answer, not an error.
  # Anything but a literal false holds (a missing hold included).
  hold="$(jq -r 'if .hold == false then "false" else "true" end' "$desired")"
  if [ "$hold" != false ]; then
    reason="$(jq -r '.reason // "no reason given"' "$desired")"
    say "hold: $reason"
    return 1
  fi
  WANT_APP="$(jq -r '.app_tag // ""' "$desired")"
  WANT_DSH="$(jq -r '.dsh_tag // ""' "$desired")"
  if ! is_tag "$WANT_APP" || ! is_tag "$WANT_DSH"; then say "refusing: desired tags are not image tags"; return 1; fi
  CUR_APP="$(read_env "$WEB_ENV" APP_IMAGE_TAG)"
  CUR_DSH="$(read_env "$DSH_ENV" DSH_IMAGE_TAG)"
  if [ "$WANT_APP" = "$CUR_APP" ] && [ "$WANT_DSH" = "$CUR_DSH" ]; then
    say "up to date: app $CUR_APP, dsh $CUR_DSH"
    return 1
  fi
  # Any failed update of the last 60 min, whatever its target: the heartbeat reports it as
  # last_update.ok = false and the master grants no slot meanwhile (contract section 7).
  if [ -f "$last" ] && [ "$(jq -r '.ok' "$last" 2>/dev/null)" = false ]; then
    failed_at="$(jq -r '.finished_epoch // 0' "$last")"
    case "$failed_at" in ''|*[!0-9]*) failed_at=0 ;; esac
    if [ $((now - failed_at)) -lt "$BACKOFF_SECS" ]; then
      say "backing off: $(jq -r '(.app_tag // "?") + " / " + (.dsh_tag // "?")' "$last") failed $((now - failed_at)) s ago; next try after ${BACKOFF_SECS} s (the master grants no slot meanwhile), or pin the shard at /ops > Shards"
      return 1
    fi
  fi
  # The master's update slot (K = 2 shards at once, contract section 7): start only inside it.
  granted="$(jq -r '.granted_until // ""' "$desired")"
  granted_epoch="$(iso_epoch "$granted")"
  if [ -z "$granted_epoch" ]; then
    say "not granted: the master has given this shard no update slot (granted_until ${granted:-null})"
    return 1
  fi
  if [ "$now" -ge "$granted_epoch" ]; then
    say "not granted: the master's slot ended $((now - granted_epoch)) s ago - waiting for the next one"
    return 1
  fi
  return 0
}

# Reads REGISTRY_AUTH and TRACY_IMAGE_PREFIX from $REGISTRY_ENV (an unreadable file reads as the
# GHCR default; registry_login then says what is missing). Returns 1, with one line said, on a file
# whose registry lines contradict each other.
load_registry() {
  local auth prefix ecr
  auth="$(read_env "$REGISTRY_ENV" REGISTRY_AUTH)"
  prefix="$(read_env "$REGISTRY_ENV" TRACY_IMAGE_PREFIX)"
  case "${auth:-ghcr}" in
    ghcr)
      REGISTRY_AUTH=ghcr
      IMAGE_PREFIX="${prefix:-ghcr.io/tracyhq}"
      ;;
    ecr)
      REGISTRY_AUTH=ecr
      ecr="$(read_env "$REGISTRY_ENV" ECR_REGISTRY)"
      printf '%s' "$ecr" | grep -E "$ECR_REGISTRY_RE" >/dev/null \
        || { say "refusing: REGISTRY_AUTH=ecr needs ECR_REGISTRY=<account>.dkr.ecr.<region>.amazonaws.com in $REGISTRY_ENV"; return 1; }
      case "$prefix" in
        "$ecr"/?*) IMAGE_PREFIX="$prefix" ;;
        *) say "refusing: REGISTRY_AUTH=ecr needs TRACY_IMAGE_PREFIX=$ecr/<path> in $REGISTRY_ENV"; return 1 ;;
      esac
      ;;
    *) say "refusing: REGISTRY_AUTH in $REGISTRY_ENV is ghcr or ecr"; return 1 ;;
  esac
  IMAGE_PREFIX="${IMAGE_PREFIX%/}"
  REGISTRY_HOST="${IMAGE_PREFIX%%/*}"
  WEB_IMAGE_REPO="$IMAGE_PREFIX/tracy-web"
  HOST_IMAGE_REPO="$IMAGE_PREFIX/tracy-host"
  DSH_IMAGE_REPO="$IMAGE_PREFIX/tracy-dsh"
}

plan_steps() {
  if [ "$REGISTRY_AUTH" = ecr ]; then
    say "would: docker run --rm --env-file <0600 temp file: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION of $REGISTRY_ENV> $AWS_CLI_IMAGE ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY_HOST"
  else
    say "would: docker login $REGISTRY_HOST -u <GHCR_USER of $REGISTRY_ENV> --password-stdin"
  fi
  say "would: docker pull $HOST_IMAGE_REPO:$WANT_APP"
  say "would: sync-fleet-files.sh --from-image $HOST_IMAGE_REPO:$WANT_APP --dest $FLEET_DIR"
  say "would: shard-env-check.sh $WEB_ENV"
  if [ "$SKIP_WEB_IMAGES" = 1 ]; then
    say "would not: build site images from web/IMAGE_TAGS (TRACY_SKIP_WEB_IMAGES=1)"
  else
    say "would: web/build.sh, only if web/IMAGE_TAGS changed"
  fi
  [ "$WANT_APP" = "$CUR_APP" ] || say "would: deploy-tracy-stack.sh --tag $WANT_APP --services postgres,tracy-web,tracy-host${PROJECT:+ --project $PROJECT} (env file $WEB_ENV)"
  [ "$WANT_DSH" = "$CUR_DSH" ] || say "would: deploy-host-dsh.sh --tag $WANT_DSH (env file $DSH_ENV)"
  if [ "$SKIP_UNITS" = 1 ]; then
    say "would: nginx -t and recreate if nginx-shard.conf changed, else up -d --no-deps nginx; install no systemd unit (TRACY_SKIP_UNITS=1)"
  else
    say "would: nginx -t and recreate if nginx-shard.conf changed, else up -d --no-deps nginx; install changed systemd units"
  fi
  if [ "$PRUNE" = 0 ]; then
    say "would: docker logout, write $STATE_DIR/updater.json (no image is pruned: TRACY_PRUNE=0)"
  else
    say "would: prune old images, docker logout, write $STATE_DIR/updater.json"
  fi
}

registry_login() {
  local user token
  if [ "$REGISTRY_AUTH" = ecr ]; then ecr_login; return; fi
  user="$(read_env "$REGISTRY_ENV" GHCR_USER)"
  token="$(read_env "$REGISTRY_ENV" GHCR_TOKEN)"
  if [ -z "$user" ] || [ -z "$token" ]; then echo "updater: no GHCR_USER / GHCR_TOKEN in $REGISTRY_ENV"; return 1; fi
  # printf is a shell builtin: the token reaches docker on stdin, never in an argv `ps` can show.
  printf '%s' "$token" | docker login "$REGISTRY_HOST" -u "$user" --password-stdin >/dev/null
  echo "updater: logged in to $REGISTRY_HOST as $user"
}

# The pull key never enters an argv: printf (a builtin) writes it to a 0600 file only the aws-cli
# container reads (--env-file), and the token comes back on a pipe into `docker login`'s stdin.
ecr_login() {
  local key secret region keyfile
  key="$(read_env "$REGISTRY_ENV" AWS_ACCESS_KEY_ID)"
  secret="$(read_env "$REGISTRY_ENV" AWS_SECRET_ACCESS_KEY)"
  region="$(read_env "$REGISTRY_ENV" AWS_REGION)"
  if [ -z "$key" ] || [ -z "$secret" ] || [ -z "$region" ]; then
    echo "updater: no AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION in $REGISTRY_ENV"
    return 1
  fi
  keyfile="$(mktemp "${TMPDIR:-/tmp}/tracy-ecr-key.XXXXXX")"
  # Removed however this function ends; the trap then clears itself.
  trap 'rm -f "${keyfile:-}"; trap - RETURN' RETURN
  chmod 600 "$keyfile"
  printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\nAWS_REGION=%s\n' "$key" "$secret" "$region" > "$keyfile"
  docker run --rm --env-file "$keyfile" "$AWS_CLI_IMAGE" ecr get-login-password --region "$region" \
    | docker login --username AWS --password-stdin "$REGISTRY_HOST" >/dev/null || return 1
  echo "updater: logged in to $REGISTRY_HOST (ecr, $region)"
}

# Every nginx compose command goes through here: one file set, one project, one env file, so the
# config hash of nginx is the same whichever command computed it. The shard's own file comes before
# TRACY_STACK_EXTRA_FILES, which may therefore override it. TRACY_STACK_ENV_FILE is what
# compose.server.yml interpolates into its `env_file` lines; unset on the master it reads the same
# /etc/tracy/tracy-web.env, which is what this passes on a dedicated shard.
shard_compose() {
  local host_secret extra
  local -a flags=()
  host_secret="$(read_env "$WEB_ENV" "HOST_$(read_env "$WEB_ENV" HOST_NAME)_SECRET")"
  [ -z "$PROJECT" ] || flags+=(-p "$PROJECT")
  flags+=(--env-file "$WEB_ENV" -f "$FLEET_DIR/stack/compose.yml" -f "$FLEET_DIR/stack/compose.server.yml" -f "$FLEET_DIR/stack/compose.shard.yml")
  set -f
  for extra in $EXTRA_FILES_LIST; do flags+=(-f "$extra"); done
  set +f
  TRACY_STACK_ENV_FILE="$(abs_path "$WEB_ENV")" HOST_SECRET="$host_secret" WEB_IMAGE="$WEB_IMAGE_REPO" HOST_IMAGE="$HOST_IMAGE_REPO" \
    docker compose "${flags[@]}" "$@"
}

# deploy-tracy-stack.sh with this stack's project, env file and extra compose files. On a dedicated
# shard the two compose commands it runs are the ones it always ran (no -p, the default env file).
deploy_stack() {
  local -a args=(--tag "$WANT_APP" --services postgres,tracy-web,tracy-host)
  local -a envs=("TRACY_STACK_ENV_FILE=$(abs_path "$WEB_ENV")" "TRACY_STACK_EXTRA_FILES=$EXTRA_FILES_LIST" "TRACY_IMAGE_PREFIX=$IMAGE_PREFIX")
  [ -z "$PROJECT" ] || args+=(--project "$PROJECT")
  [ "$FLEET_DIR" = "$DEFAULT_FLEET_DIR" ] || envs+=("TRACY_STACK_DIR=$FLEET_DIR/stack")
  env "${envs[@]}" "$FLEET_DIR/stack/deploy-tracy-stack.sh" "${args[@]}"
}

# deploy-host-dsh.sh with this stack's dsh env file and compose file. NOT given TRACY_COMPOSE_PROJECT:
# that is the app stack's project; HOST_DSH_PROJECT / HOST_DSH_CONTAINER, when set in this script's
# environment, reach it as they are.
deploy_dsh() {
  HOST_DSH_ENV_FILE="$(abs_path "$DSH_ENV")" HOST_DSH_COMPOSE="${HOST_DSH_COMPOSE:-$FLEET_DIR/dsh/host-dsh.yml}" \
    TRACY_IMAGE_PREFIX="$IMAGE_PREFIX" DSH_IMAGE="$DSH_IMAGE_REPO" "$FLEET_DIR/dsh/deploy-host-dsh.sh" --tag "$WANT_DSH"
}

# The same reading as build-app-images.yml:530-541: every image an IMAGE_TAGS line names that this
# host does not have. A new site whose line names one gets the upstream image, with no agent tools.
missing_web_images() {
  local line image
  [ -f "$FLEET_DIR/web/IMAGE_TAGS" ] || return 0
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    image="${line#*=}"
    docker image inspect "$image" >/dev/null 2>&1 || printf '%s\n' "$image"
  done < "$FLEET_DIR/web/IMAGE_TAGS"
}

build_web_images_if_changed() {
  if [ "$SKIP_WEB_IMAGES" = 1 ]; then
    echo "updater: site images are not built here (TRACY_SKIP_WEB_IMAGES=1)"
    return 0
  fi
  if [ "$(sha_of "$FLEET_DIR/web/IMAGE_TAGS")" != "$(cat "$RUN_DIR/web-before")" ]; then
    echo "updater: web/IMAGE_TAGS changed - building the site images this host is missing (web/build.sh)"
    # Never fails the update: Joomla's image needs vendor/joomla/joomlart-t4-skill from a checkout
    # (web/build.sh context_for), which the tracy-host image does not carry yet (W5 follow-up).
    bash "$FLEET_DIR/web/build.sh" || echo "updater: web/build.sh reported failures; the missing images are listed in updater.json"
  fi
  missing_web_images > "$RUN_DIR/web-missing" || true
}

apply_nginx() {
  if [ "$(sha_of "$FLEET_DIR/stack/nginx-shard.conf")" != "$(cat "$RUN_DIR/nginx-before")" ]; then
    echo "updater: nginx-shard.conf changed - testing it before nginx serves it"
    if ! shard_compose run --rm --no-deps -T nginx nginx -t; then
      echo "updater: the new nginx-shard.conf fails nginx -t; the previous file is put back and nginx keeps serving"
      [ ! -f "$RUN_DIR/nginx-shard.conf.before" ] || install -m 0644 "$RUN_DIR/nginx-shard.conf.before" "$FLEET_DIR/stack/nginx-shard.conf"
      return 1
    fi
    shard_compose up -d --no-deps --force-recreate nginx
  else
    shard_compose up -d --no-deps nginx
  fi
}

apply_units() {
  local unit
  if [ "$SKIP_UNITS" = 1 ]; then
    echo "updater: systemd units are not installed here (TRACY_SKIP_UNITS=1)"
    return 0
  fi
  [ "$(units_sha)" != "$(cat "$RUN_DIR/units-before")" ] || return 0
  echo "updater: systemd units changed - installing them"
  for unit in $SHARD_UNITS; do install -m 0644 "$FLEET_DIR/stack/$unit" /etc/systemd/system/; done
  systemctl daemon-reload
}

prune_images() {
  if [ "$PRUNE" = 0 ]; then
    echo "updater: old images are not pruned here (TRACY_PRUNE=0)"
    return 0
  fi
  bash "$FLEET_DIR/stack/prune-old-images.sh" --repo "$WEB_IMAGE_REPO" --repo "$HOST_IMAGE_REPO" --keep-env "$WEB_ENV:APP_IMAGE_TAG" || true
  bash "$FLEET_DIR/stack/prune-old-images.sh" --repo "$DSH_IMAGE_REPO" --keep-env "$DSH_ENV:DSH_IMAGE_TAG" || true
}

# Runs in a pipeline (| tee), i.e. a subshell: it reports through files in $RUN_DIR, not variables.
run_steps() {
  set -e
  echo "updater: app ${CUR_APP:-<none>} -> $WANT_APP, dsh ${CUR_DSH:-<none>} -> $WANT_DSH"
  registry_login
  echo "updater: docker pull $HOST_IMAGE_REPO:$WANT_APP"
  docker pull -q "$HOST_IMAGE_REPO:$WANT_APP"
  sha_of "$FLEET_DIR/web/IMAGE_TAGS" > "$RUN_DIR/web-before"
  sha_of "$FLEET_DIR/stack/nginx-shard.conf" > "$RUN_DIR/nginx-before"
  [ ! -f "$FLEET_DIR/stack/nginx-shard.conf" ] || cp -p "$FLEET_DIR/stack/nginx-shard.conf" "$RUN_DIR/nginx-shard.conf.before"
  units_sha > "$RUN_DIR/units-before"
  bash "$FLEET_DIR/stack/sync-fleet-files.sh" --from-image "$HOST_IMAGE_REPO:$WANT_APP" --dest "$FLEET_DIR"
  bash "$FLEET_DIR/stack/shard-env-check.sh" "$WEB_ENV"
  build_web_images_if_changed
  if [ "$WANT_APP" != "$CUR_APP" ]; then
    deploy_stack
  fi
  if [ "$WANT_DSH" != "$CUR_DSH" ]; then
    deploy_dsh
  fi
  apply_nginx
  apply_units
  prune_images
}

mark_updating() {
  jq -nc --argjson pid "$$" --arg app "$WANT_APP" --arg dsh "$WANT_DSH" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{pid: $pid, app_tag: $app, dsh_tag: $dsh, started_at: $at}' > "$STATE_DIR/updating.json.tmp"
  mv -f "$STATE_DIR/updating.json.tmp" "$STATE_DIR/updating.json"
}

# write_result <true|false>
write_result() {
  local tail missing
  # The deploy scripts print no secret (they never echo an env file); control characters are cut
  # so the tail is safe in JSON and in the master's /ops page.
  tail="$(tail -n 40 "$LOG" 2>/dev/null | tr -d '\000-\010\013-\037' | tail -c 4000 || true)"
  missing="$(jq -Rsc 'split("\n") | map(select(. != ""))' < "$RUN_DIR/web-missing" 2>/dev/null || echo '[]')"
  # The names of contract section 7's last_update; the heartbeat sends web_images_missing as a boolean.
  jq -nc --arg app "$WANT_APP" --arg dsh "$WANT_DSH" --argjson ok "$1" \
    --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson epoch "$(date +%s)" --arg tail "$tail" --argjson missing "$missing" \
    '{app_tag: $app, dsh_tag: $dsh, ok: $ok, finished_at: $at, finished_epoch: $epoch, log_tail: $tail, web_images_missing: $missing}' \
    > "$STATE_DIR/updater.json.tmp"
  mv -f "$STATE_DIR/updater.json.tmp" "$STATE_DIR/updater.json"
}

finish() {
  rm -f "$STATE_DIR/updating.json"
  docker logout "$REGISTRY_HOST" >/dev/null 2>&1 || true
  [ -z "$RUN_DIR" ] || rm -rf "$RUN_DIR"
}

main() {
  case "${1:-}" in
    '') ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; return 0 ;;
    *) echo "tracy-updater: unknown argument $1" >&2; return 2 ;;
  esac
  command -v jq >/dev/null || { echo "tracy-updater: jq is required" >&2; return 1; }
  [ -r "$WEB_ENV" ] || { echo "tracy-updater: cannot read $WEB_ENV" >&2; return 1; }
  load_registry || return 1
  decide || return 0
  say "update: app ${CUR_APP:-<none>} -> $WANT_APP, dsh ${CUR_DSH:-<none>} -> $WANT_DSH"
  if [ "$DRY_RUN" = 1 ]; then plan_steps; return 0; fi

  mkdir -p "$STATE_DIR" "$LOG_DIR"
  chmod 700 "$STATE_DIR" "$LOG_DIR"
  exec 9>"$LOCK_FILE"
  flock -w 30 9 || { say "another updater run holds $LOCK_FILE - leaving it to that run"; return 0; }
  RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tracy-updater.XXXXXX")"
  LOG="$LOG_DIR/updater-$(date -u +%Y%m%dT%H%M%SZ).log"
  ( umask 077; : > "$LOG" )
  : > "$RUN_DIR/web-missing"
  trap finish EXIT
  mark_updating

  local status
  set +e
  run_steps 2>&1 | tee -a "$LOG"
  status="${PIPESTATUS[0]}"
  set -e
  if [ "$status" = 0 ]; then
    write_result true
    say "done: app $WANT_APP, dsh $WANT_DSH (log $LOG)"
  else
    write_result false
    say "FAILED (exit $status); the deploy scripts rolled back what they had changed; backing off ${BACKOFF_SECS} s, reported to the master as last_update.ok=false; log $LOG"
  fi
  { ls -1t "$LOG_DIR"/updater-*.log 2>/dev/null || true; } | tail -n +21 | while IFS= read -r old; do rm -f "$old"; done
  return "$status"
}

# TRACY_UPDATER_NO_MAIN=1: define the functions and stop, so a test can call one alone.
[ "${TRACY_UPDATER_NO_MAIN:-0}" = 1 ] || { main "$@"; exit $?; }
