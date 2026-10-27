#!/usr/bin/env bash
#
# host-dsh-init — bring up the ONE dsh this fleet host runs, and prove it answers.
#
#   host-dsh-init.sh <host> [--dry-run] [--force] [options]
#   host-dsh-init.sh s1 --image-tag 2026-10-15-a1b2c3d --tracy-origin https://s1.tracy.ai \
#     --actor-secret-file /root/s1-actor.secret --seat-secret-out /root/s1-seat.secret
#
# <host> is the fleet host label: prod1, dev, staging, or a shard such as s1 (a lower-case letter,
# then lower-case letters or digits, at most 16). It names the public hostname <host>-agent.tracy.ai
# and the tracy-web settings that pair with this dsh: HOST_<host>_DSH_ORIGIN and SEAT_<host>_SECRET
# in /etc/tracy/tracy-web.env, the second holding the MCP_SEAT_SECRET generated here.
#
# ## What it does, in order
#
#   1. /srv/tracy/host-dsh/home/{sessions,storages,dsh-passwords-data,workspace}, owned 33:33
#   2. /srv/tracy-sites made a SHARED mount, so a site attached later reaches a running dsh
#   3. /desk-home/dsh-passwords.env — five secrets generated, actor secret READ, model keys COPIED
#   4. /etc/tracy/host-dsh.env — the deployment knobs (see host-dsh.env.example)
#   5. docker compose up -d, then wait for the container to report healthy
#   6. one signed POST /gateway/seat/session against 127.0.0.1:51700 — the seat door, for real
#
# ## Idempotent, and it refuses rather than guesses
#
# Every step asks first. Run it twice and the second run creates nothing, prints the same
# summary, and re-runs the smoke test. The two files that hold identity — dsh-passwords.env and
# /etc/tracy/host-dsh.env — are NOT rewritten without --force: regenerating MCP_SEAT_SECRET on a
# host that is already serving sites breaks every seat mint until SEAT_<host>_SECRET in
# tracy-web.env is updated too, and nothing about that failure says "somebody re-ran the init script".
#
# ## Environment overrides
#
# Each has today's value as its default, so a plain run is unchanged.
#
#   HOST_SITES_ROOT      the sites root, default /srv/tracy-sites
#   HOST_DSH_HOME        the dsh home (/desk-home on the host), default /srv/tracy/host-dsh/home
#   HOST_DSH_ENV_FILE    the deployment env file, default /etc/tracy/host-dsh.env
#   HOST_DSH_GATEWAY     where the smoke test reaches the gateway, default http://127.0.0.1:51700
#   HOST_DSH_CONTAINER   the dsh container this script waits on and reads logs from, default
#                        tracy-dsh.
#
# A second, prefixed dsh on the same host (its compose file names its own container and publishes
# its own loopback port) is initialised by setting ALL FIVE of HOST_DSH_HOME, HOST_SITES_ROOT,
# HOST_DSH_ENV_FILE, HOST_DSH_GATEWAY and HOST_DSH_CONTAINER to its own values, and passing its
# --compose. Leave HOST_DSH_HOME or HOST_DSH_ENV_FILE at the default and this script keeps the
# FIRST dsh's dsh-passwords.env and host-dsh.env, hands out the first dsh's seat secret, and the
# new container mounts the first dsh's /desk-home: two gateways on one platform.db.
#
# ## --dry-run
#
# Prints every command it would run and changes nothing. It works on a laptop (macOS included):
# the root/Linux/docker preconditions are reported rather than enforced, so the script can be
# read by running it. That is the only reason it exists — it is not a way to preview a partial
# install.
set -euo pipefail

# The label and origin checks below use character ranges, and [a-z] means a to z only in the C
# locale (elsewhere it can take upper case too). Every byte this script prints passes through
# unchanged under C, the box-drawing characters of the banner included.
export LC_ALL=C

# ── Arguments ─────────────────────────────────────────────────────────────────────────────────
HOST=""
DRY_RUN=0
FORCE=0
IMAGE_TAG=""
TEMPLATE_LANE=""
ACTOR_SECRET_FILE=""
HOSTNAME_ARG=""
TRACY_ORIGIN_ARG=""
SEAT_SECRET_OUT=""
SEAT_SECRET=""
PASSWORDS_KEPT=0
COMPOSE_FILE=""
SITES_ROOT="${HOST_SITES_ROOT:-/srv/tracy-sites}"
DESK_HOME="${HOST_DSH_HOME:-/srv/tracy/host-dsh/home}"
ENV_FILE="${HOST_DSH_ENV_FILE:-/etc/tracy/host-dsh.env}"
PASSWORDS_ENV="$DESK_HOME/dsh-passwords.env"
DSH_CONTAINER="${HOST_DSH_CONTAINER:-tracy-dsh}"

usage() {
  # The intro is every header line up to the first `# ## ` heading, minus that heading and the
  # blank line before it.
  sed -n '3,/^# ## /p' "$0" | sed '$d' | sed '$d' | sed 's/^# \{0,1\}//'
  cat <<'USAGE'

Options:
  --dry-run              print what would happen, change nothing (runs on a laptop)
  --force                overwrite dsh-passwords.env and the env file if they exist
  --image-tag <tag>      DSH_IMAGE_TAG; defaults to the value already in the env file
  --template-lane <name> running Tracy lane container to copy MCP_TRACY_ACTOR_SECRET and
                         .credentials.yaml from (required on a host that has neither yet)
  --actor-secret-file <path>
                         file holding MCP_TRACY_ACTOR_SECRET, for a host with no lane to copy
                         from. A FILE, never a flag value — see the note beside step 3.
  --hostname <fqdn>      public hostname; default <host>-agent.tracy.ai
  --tracy-origin <url>   MCP_TRACY_ORIGIN: the tracy-web this dsh sends people to and calls.
                         A bare https origin. Default https://cowork.tracy.ai (production);
                         dev passes https://cowork.tracy.site, a shard its own https://sN.tracy.ai
  --seat-secret-out <path>
                         write this host's MCP_SEAT_SECRET to <path> (0600, absolute path) instead
                         of printing it — for an installer that puts it into SEAT_<host>_SECRET of
                         /etc/tracy/tracy-web.env. A re-run that keeps dsh-passwords.env writes the
                         same value again. The caller owns the directory of <path>: it must exist.
  --compose <path>       host-dsh.yml; default: next to this script

Environment (defaults in brackets):
  HOST_SITES_ROOT [/srv/tracy-sites]  HOST_DSH_HOME [/srv/tracy/host-dsh/home]
  HOST_DSH_ENV_FILE [/etc/tracy/host-dsh.env]
  HOST_DSH_GATEWAY [http://127.0.0.1:51700]  HOST_DSH_CONTAINER [tracy-dsh]
  A second, prefixed dsh on the same host needs ALL FIVE set to its own values, plus its --compose;
  with HOST_DSH_HOME or HOST_DSH_ENV_FILE left at the default this keeps the first dsh's files.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --image-tag) IMAGE_TAG="${2:?--image-tag needs a value}"; shift ;;
    --template-lane) TEMPLATE_LANE="${2:?--template-lane needs a value}"; shift ;;
    --actor-secret-file) ACTOR_SECRET_FILE="${2:?--actor-secret-file needs a value}"; shift ;;
    --hostname) HOSTNAME_ARG="${2:?--hostname needs a value}"; shift ;;
    --tracy-origin) TRACY_ORIGIN_ARG="${2:?--tracy-origin needs a value}"; shift ;;
    --seat-secret-out) SEAT_SECRET_OUT="${2:?--seat-secret-out needs a value}"; shift ;;
    --compose) COMPOSE_FILE="${2:?--compose needs a value}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) [ -z "$HOST" ] || { echo "one host at a time: $HOST and $1" >&2; exit 2; }; HOST="$1" ;;
  esac
  shift
done

[ -n "$HOST" ] || { usage >&2; exit 2; }
# The label is an identifier in three places at once: the names tracy-web reads for this host
# (HOST_<label>_ORIGIN, HOST_<label>_DSH_ORIGIN, SEAT_<label>_SECRET — readHosts in
# apps/tracy-web/src/config.js), the shard name of the shard beta, and the DNS label of
# <label>-agent.tracy.ai. One rule fits all three: a lower-case letter, then lower-case letters or
# digits, at most 16. It is meant to be the same rule as SHARD_NAME in
# apps/tracy-web/src/lib/shard-shapes.js, which the master and the shard installer will check as
# well. Neither is on develop yet (shard-shapes.js arrives with W1, the installer with W3/W4): until
# they land, only this script holds the rule, and test/host-dsh-init.test.mjs compares it with
# SHARD_NAME once that file exists. Change the three together.
if ! [[ "$HOST" =~ ^[a-z][a-z0-9]{0,15}$ ]]; then
  echo "invalid host label: '$HOST' (a lower-case letter, then lower-case letters or digits, at most 16)" >&2
  exit 2
fi

TRACY_ORIGIN="${TRACY_ORIGIN_ARG:-https://cowork.tracy.ai}"
# A bare https origin: dsh appends paths to it (`${MCP_TRACY_ORIGIN}/api/sites/…`), so a trailing
# slash or a path is a door that answers 404 to every plugin call from a container that is healthy.
if ! [[ "$TRACY_ORIGIN" =~ ^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$ ]]; then
  echo "invalid --tracy-origin: '$TRACY_ORIGIN' (a bare https origin such as https://s1.tracy.ai — no path, no trailing slash)" >&2
  exit 2
fi
if [ -n "$SEAT_SECRET_OUT" ]; then
  case "$SEAT_SECRET_OUT" in
    /*) ;;
    *) echo "--seat-secret-out needs an absolute path: '$SEAT_SECRET_OUT'" >&2; exit 2 ;;
  esac
  # The write below truncates its target to the one secret line, so it must not be a file that
  # holds something else: not this host's env files, and not the tracy-web.env the secret is for.
  for PROTECTED in "$PASSWORDS_ENV" "$ENV_FILE" /etc/tracy/tracy-web.env; do
    if [ "$SEAT_SECRET_OUT" = "$PROTECTED" ] || [ "$SEAT_SECRET_OUT" -ef "$PROTECTED" ]; then
      echo "--seat-secret-out would overwrite $PROTECTED with one line: pick a file of its own" >&2
      exit 2
    fi
  done
  # The caller owns the folder: checked here, before any step writes, because a missing one would
  # otherwise end the run at step 3a, after dsh-passwords.env is written and the banner is hidden.
  [ -d "$(dirname "$SEAT_SECRET_OUT")" ] \
    || { echo "--seat-secret-out: no such directory: $(dirname "$SEAT_SECRET_OUT")" >&2; exit 2; }
  [ ! -d "$SEAT_SECRET_OUT" ] \
    || { echo "--seat-secret-out: $SEAT_SECRET_OUT is a directory" >&2; exit 2; }
  [ ! -L "$SEAT_SECRET_OUT" ] \
    || { echo "--seat-secret-out: $SEAT_SECRET_OUT is a symlink; the secret is not written through one" >&2; exit 2; }
fi
# The container name lands in `docker inspect`/`docker logs` commands, one of them run through
# `sh -c`: hold it to what docker itself accepts as a container name.
if ! [[ "$DSH_CONTAINER" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo "invalid HOST_DSH_CONTAINER: '$DSH_CONTAINER' (letters, digits, _ . - only, starting with a letter or digit)" >&2
  exit 2
fi
# The smoke test appends /gateway/seat/session to this: a trailing slash makes `//gateway/…`, a 404
# that ends the run with exit 1 after the host has already been changed.
GATEWAY="${HOST_DSH_GATEWAY:-http://127.0.0.1:51700}"
if ! [[ "$GATEWAY" =~ ^https?://[^/]+$ ]]; then
  echo "invalid HOST_DSH_GATEWAY: '$GATEWAY' (http://host:port, no path, no trailing slash)" >&2
  exit 2
fi

# 3. Where the actor secret comes from, decided BEFORE anything runs. The secret is read, never
# generated, and the read happens at step 3 — after steps 1 and 2 have created folders, a mount and
# an fstab line. A run that cannot get one must stop here, not there. Only a run that will write
# dsh-passwords.env needs a source: a kept file already holds the secret.
if [ ! -f "$PASSWORDS_ENV" ] || [ "$FORCE" = 1 ]; then
  if [ -z "$ACTOR_SECRET_FILE" ] && [ -z "$TEMPLATE_LANE" ]; then
    echo "no source for MCP_TRACY_ACTOR_SECRET: $PASSWORDS_ENV will be written, so pass --actor-secret-file <path> holding the MCP_TRACY_ACTOR_SECRET of the tracy-web at $TRACY_ORIGIN, or --template-lane <a running Tracy lane on this host>. Do NOT generate one: that tracy-web would refuse every call this dsh signs." >&2
    exit 2
  fi
  if [ -n "$ACTOR_SECRET_FILE" ]; then
    if ! [ -f "$ACTOR_SECRET_FILE" ] || ! [ -r "$ACTOR_SECRET_FILE" ]; then
      echo "--actor-secret-file: no readable file: $ACTOR_SECRET_FILE" >&2
      exit 2
    fi
    # A readable file can still hold nothing: step 3 would die on it after steps 1 and 2 changed
    # the host (or, for spaces and tabs, write a blank secret). Empty, or only whitespace and
    # quotes (step 3 strips the quotes), is refused here, in a dry run too. What counts as a good
    # secret beyond that is not this script's call: tracy-web only compares the value.
    if [ -z "$(tr -d '[:space:]"' < "$ACTOR_SECRET_FILE")" ]; then
      echo "--actor-secret-file: $ACTOR_SECRET_FILE holds no secret (empty, or only whitespace)" >&2
      exit 2
    fi
  fi
fi

# The label rule above admits no `_`, so the label is already a DNS label.
AGENT_HOSTNAME="${HOSTNAME_ARG:-$HOST-agent.tracy.ai}"
[ -n "$COMPOSE_FILE" ] || COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/host-dsh.yml"

say() { printf '==> %s\n' "$*"; }
warn() { printf '!!  %s\n' "$*" >&2; }
die() { printf '!!  %s\n' "$*" >&2; exit 1; }

# Every mutation goes through `run`, so --dry-run is one branch rather than a branch per step.
# Anything that only READS is called directly; a dry run may read the host it is describing.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

# Same, for the shell pipelines that cannot be an argv (redirections, heredocs).
run_sh() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] sh -c %s\n' "$1"
    return 0
  fi
  sh -c "$1"
}

# ── 0. Preconditions ──────────────────────────────────────────────────────────────────────────
#
# Reported, then enforced — in that order, so a dry run on a laptop still tells the truth about
# the laptop instead of dying on line one.
say "host $HOST · hostname $AGENT_HOSTNAME · tracy origin $TRACY_ORIGIN · compose $COMPOSE_FILE"
[ -n "$TRACY_ORIGIN_ARG" ] || warn "no --tracy-origin: MCP_TRACY_ORIGIN defaults to $TRACY_ORIGIN, production's tracy-web. Any other host (dev, staging, a shard) passes its own."
[ -f "$COMPOSE_FILE" ] || die "no compose file at $COMPOSE_FILE"
# The proxy's rules are a file next to the compose file, mounted by a RELATIVE path. Shipped
# without it, `docker compose up` creates a DIRECTORY at that path, haproxy fails to parse it,
# and the first thing anyone notices is an agent whose every command fails — so it is checked
# here, where the message can say what is missing.
PROXY_CFG="$(dirname "$COMPOSE_FILE")/docker-proxy.haproxy.cfg"
[ -f "$PROXY_CFG" ] || die "no docker-proxy.haproxy.cfg next to $COMPOSE_FILE — the two files ship together"

PRECONDITIONS_OK=1
[ "$(uname -s)" = Linux ] || { warn "not Linux — the bind mounts and /etc/tracy are Linux-only"; PRECONDITIONS_OK=0; }
[ "$(id -u)" = 0 ] || { warn "not root — creating /srv and /etc/tracy needs it"; PRECONDITIONS_OK=0; }
command -v docker >/dev/null 2>&1 || { warn "no docker on PATH"; PRECONDITIONS_OK=0; }
command -v openssl >/dev/null 2>&1 || { warn "no openssl on PATH — the secrets are generated with it"; PRECONDITIONS_OK=0; }
docker compose version >/dev/null 2>&1 || { warn "no 'docker compose' (v2) — the v1 'docker-compose' will not read this file"; PRECONDITIONS_OK=0; }

if [ "$PRECONDITIONS_OK" != 1 ]; then
  if [ "$DRY_RUN" = 1 ]; then
    say "dry run: continuing anyway, and everything below is a description, not a plan that ran"
  else
    die "preconditions not met — see above (add --dry-run to read the plan on this machine)"
  fi
fi

# ── 1. /desk-home ─────────────────────────────────────────────────────────────────────────────
#
# uid 33 (www-data) is what the image runs as. Owned by root, this container comes up and then
# fails to write a session, which surfaces to the user as a chat that forgets everything.
say "1. /desk-home at $DESK_HOME"
for d in sessions storages dsh-passwords-data workspace; do
  if [ -d "$DESK_HOME/$d" ]; then
    printf '    exists: %s\n' "$DESK_HOME/$d"
  else
    run mkdir -p "$DESK_HOME/$d"
  fi
done
run chown -R 33:33 "$DESK_HOME"
run chmod 750 "$DESK_HOME"

# ── 2. /srv/tracy-sites, shared ───────────────────────────────────────────────────────────────
#
# The compose file takes this bind `rshared`, and docker REFUSES to start the container when the
# source is not already a shared mount ("path … is mounted on / but it is not a shared mount").
# The same three lines are in provision/attach-site.sh — they are here because a fresh host runs
# this script before it ever provisions a site.
say "2. shared mount at $SITES_ROOT"
run mkdir -p "$SITES_ROOT"
if mountpoint -q "$SITES_ROOT" 2>/dev/null; then
  printf '    already a mount point: %s\n' "$SITES_ROOT"
else
  run mount --bind "$SITES_ROOT" "$SITES_ROOT"
fi
run mount --make-rshared "$SITES_ROOT"
# The fstab line carries `shared` as well as `bind`: without it the first site attached after a
# reboot is invisible to a dsh that is already running, and nothing logs that.
if [ -f /etc/fstab ] && awk -v t="$SITES_ROOT" '$1 !~ /^#/ && $2 == t { found = 1 } END { exit !found }' /etc/fstab; then
  printf '    fstab already names %s\n' "$SITES_ROOT"
else
  run_sh "printf '%s %s none bind,shared 0 0\\n' '$SITES_ROOT' '$SITES_ROOT' >> /etc/fstab"
fi

# ── 3. dsh-passwords.env ──────────────────────────────────────────────────────────────────────
#
# Five secrets are GENERATED here, and the actor secret is READ, never generated:
#
#   generated — SETUP_KEY, MCP_JWT_SECRET, MCP_INTERNAL_SECRET, MCP_DB_ENC_KEY, MCP_SEAT_SECRET.
#     Leaking one host's key must not open another's. MCP_SEAT_SECRET is the one tracy-web has to
#     learn, as SEAT_<host>_SECRET: step 3a writes it to --seat-secret-out, or the banner prints it.
#   read — MCP_TRACY_ACTOR_SECRET must equal MCP_TRACY_ACTOR_SECRET in the tracy-web.env of the
#     tracy-web at --tracy-origin (apps/tracy-web/src/lanes/route.js, the actor-check door). Two
#     places nobody edits together: when they drift, every agent write answers NOT_SIGNED_IN while
#     every healthcheck stays green (the dev machine, 10-17/09/2026). A generated one is that drift.
#     .credentials.yaml is the model key store, copied from a lane when there is one (step 3b).
#
# 🔒 MCP_TRACY_SITE_KEY AND MCP_TRACY_SITE_LABEL ARE EMPTY, ON PURPOSE. This dsh serves every
# site on the host, so it belongs to none of them; the folders a seat may touch arrive in each
# grant from tracy-web (`folders: ['/site/<label>']`) rather than being derived from a site the
# container thinks it is. The gateway needs a build carrying ffa0ee5b for that to work: before
# it, `tracyDoorOpen` also demanded a site key, so a host dsh fell through to /gateway/login —
# the door the seat secret has already turned into a 404 — and had no way in at all.
#
# This file is also what stops the image's entrypoint from generating one of its own. That
# fallback exists for a dev cluster and writes fresh secrets with no actor secret in them, which
# on a fleet host means every login fails silently. Write ours first, and it is never touched.
say "3. $PASSWORDS_ENV"
if [ -f "$PASSWORDS_ENV" ] && [ "$FORCE" != 1 ]; then
  PASSWORDS_KEPT=1
  say "    exists — keeping it (re-run with --force to regenerate, which invalidates SEAT_${HOST}_SECRET)"
  if [ -r "$PASSWORDS_ENV" ]; then
    KEPT_ORIGIN="$(grep -m1 '^MCP_TRACY_ORIGIN=' "$PASSWORDS_ENV" | cut -d= -f2- | tr -d '"\r' || true)"
    [ "$KEPT_ORIGIN" = "$TRACY_ORIGIN" ] \
      || warn "$PASSWORDS_ENV keeps MCP_TRACY_ORIGIN=${KEPT_ORIGIN:-<empty>}, not $TRACY_ORIGIN; nothing in it is rewritten without --force, which also regenerates every secret"
  else
    warn "cannot read $PASSWORDS_ENV to compare its MCP_TRACY_ORIGIN with $TRACY_ORIGIN (run as root)"
  fi
else
  [ -f "$PASSWORDS_ENV" ] && warn "--force: overwriting $PASSWORDS_ENV; SEAT_${HOST}_SECRET in tracy-web.env must change in the same sitting"

  gen() { if [ "$DRY_RUN" = 1 ]; then echo '<openssl rand -hex 32>'; else openssl rand -hex 32; fi; }

  # 🔒 A BRAND-NEW HOST HAS NO LANE TO COPY FROM, AND THAT IS THE NORMAL CASE. The value comes from
  # the tracy-web.env of the same deployment, handed over as a FILE AND NOT A FLAG VALUE:
  # `--actor-secret <value>` would put it into argv, where `ps` shows it to every user on the box
  # and the shell writes it to history. Land it as a 0600 file; it is read and then left alone, and
  # deleting it is the caller's job.
  ACTOR=""
  if [ -n "$ACTOR_SECRET_FILE" ] && [ "$DRY_RUN" != 1 ]; then
    [ -f "$ACTOR_SECRET_FILE" ] || die "--actor-secret-file: no such file: $ACTOR_SECRET_FILE"
    ACTOR="$(tr -d '"\r\n' < "$ACTOR_SECRET_FILE")"
    [ -n "$(printf '%s' "$ACTOR" | tr -d '[:space:]')" ] || die "--actor-secret-file: $ACTOR_SECRET_FILE is empty"
    say "    actor secret read from $ACTOR_SECRET_FILE (not from a lane on this host)"
  fi
  if [ -z "$ACTOR" ] && [ -n "$TEMPLATE_LANE" ] && [ "$DRY_RUN" != 1 ]; then
    # Read it out of the running lane; do not go looking on disk for a path that differs between
    # hosts (/dsh-home vs /home-alpha, measured 01/09).
    ACTOR="$(docker exec "$TEMPLATE_LANE" sh -c 'grep -m1 "^MCP_TRACY_ACTOR_SECRET=" /desk-home/dsh-passwords.env | cut -d= -f2-' 2>/dev/null | tr -d '"\r' || true)"
  fi
  if [ -z "$ACTOR" ] && [ "$DRY_RUN" != 1 ]; then
    die "no MCP_TRACY_ACTOR_SECRET: pass --actor-secret-file <path> holding the MCP_TRACY_ACTOR_SECRET of the tracy-web at $TRACY_ORIGIN, or --template-lane <a running Tracy lane on this host>. Do NOT generate one: that tracy-web would refuse every call this dsh signs."
  fi
  [ -n "$ACTOR" ] || ACTOR="<copied from --template-lane>"
  SEAT_SECRET="$(gen)"

  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] write %s (0600, owner 33:33) with SETUP_KEY, MCP_JWT_SECRET,\n' "$PASSWORDS_ENV"
    printf '              MCP_INTERNAL_SECRET, MCP_DB_ENC_KEY, MCP_SEAT_SECRET generated;\n'
    printf '              MCP_TRACY_SITE_KEY and MCP_TRACY_SITE_LABEL empty; actor secret %s\n' \
      "$([ -n "$ACTOR_SECRET_FILE" ] && echo "read from $ACTOR_SECRET_FILE" || echo 'copied from --template-lane')"
    printf '              MCP_TRACY_ORIGIN=%s\n' "$TRACY_ORIGIN"
  else
    umask 077
    cat > "$PASSWORDS_ENV" <<ENV
SETUP_KEY=$(gen)
MCP_JWT_SECRET=$(gen)
MCP_DB_PATH=/desk-home/dsh-passwords-data/platform.db
MCP_GATEWAY_AUTO_TLS=0
MCP_GATEWAY_HOST=0.0.0.0
MCP_GATEWAY_PORT=8080
# The gateway port is published on the host's loopback only (host-dsh.yml). Its callers are
# proxies on this machine: tracy-web over the Docker network (HOST_<host>_DSH_ORIGIN) and the
# tunnel where one is set. No browser connects to it directly.
MCP_GATEWAY_TRUSTED_PROXIES=*
# THE SIDEBAR'S WEBSOCKETS. dsh-passwords 2.7.7 (ADR 0027) has no WebSocket allowlist any more:
# the admin account upgrades every path the plugins declare, and a seat reaches only what the Tracy
# policy opens to it (fs-watch and agent-opens with a session it holds). This line is a second fence
# on the two terminal paths: an owner rule answers 403 to a seat before any policy runs.
#
# (No backticks and no literal dollar sign in this heredoc: it is unquoted so that the generator runs.)
MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals
MCP_INTERNAL_SECRET=$(gen)
MCP_DB_ENC_KEY=$(gen)
# NEW, and only for this host. It must equal SEAT_${HOST}_SECRET in the tracy-web.env of the
# tracy-web at $TRACY_ORIGIN.
MCP_SEAT_SECRET=$SEAT_SECRET

# ── Tracy's door (TCH ADR 0001) ───────────────────────────────────────────────────────────────
# The tracy-web this dsh sends people to and calls (--tracy-origin).
MCP_TRACY_ORIGIN=$TRACY_ORIGIN
# EMPTY: this dsh serves every site on the host, so it is the lane of none of them. Folders come
# from each seat grant, not from a site the container believes it is.
MCP_TRACY_SITE_KEY=
MCP_TRACY_SITE_LABEL=
MCP_TRACY_ACTOR_SECRET=$ACTOR
ENV
    chmod 600 "$PASSWORDS_ENV"
    chown 33:33 "$PASSWORDS_ENV"
  fi

  say "    written"
  if [ -n "$SEAT_SECRET_OUT" ]; then
    say "    MCP_SEAT_SECRET for host '$HOST' goes to $SEAT_SECRET_OUT (step 3a), not to this terminal"
  else
    cat <<BANNER

  ┌───────────────────────────────────────────────────────────────────────────────────────────
  │ MCP_SEAT_SECRET for host '$HOST' — printed ONCE, it is not shown again:
  │
  │   $SEAT_SECRET
  │
  │ Put the SAME value in /etc/tracy/tracy-web.env as SEAT_${HOST}_SECRET, then restart tracy-web.
  │ tracy-web signs every seat mint for this host with it (readHosts in apps/tracy-web/src/config.js);
  │ a mismatch is a 403 on every mint, and nothing in the error says which key signed.
  └───────────────────────────────────────────────────────────────────────────────────────────

BANNER
  fi
fi

# ── 3a. The seat secret, for whoever writes tracy-web.env ─────────────────────────────────────
#
# tracy-web signs every seat mint for this host with SEAT_<host>_SECRET, and it must equal
# MCP_SEAT_SECRET above. An installer cannot take it off the banner — a terminal log is the wrong
# place for it — so it asks for a file: 0600, from the value just generated or, on a re-run that
# kept dsh-passwords.env, from that file, so the same run twice writes the same file. The caller
# owns the directory of the path: this step creates the file, never the folder around it.
if [ -n "$SEAT_SECRET_OUT" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] write %s (0600) with MCP_SEAT_SECRET %s\n' "$SEAT_SECRET_OUT" \
      "$([ -n "$SEAT_SECRET" ] && echo 'generated above' || echo "read from $PASSWORDS_ENV")"
  else
    OUT_VALUE="$SEAT_SECRET"
    [ -n "$OUT_VALUE" ] || OUT_VALUE="$(grep -m1 '^MCP_SEAT_SECRET=' "$PASSWORDS_ENV" | cut -d= -f2- | tr -d '"\r' || true)"
    [ -n "$OUT_VALUE" ] || die "no MCP_SEAT_SECRET in $PASSWORDS_ENV to write to $SEAT_SECRET_OUT"
    # Never write the secret into a file that already exists: `umask` only governs files it creates,
    # so an old 0644 file would hold the secret at 0644 until a chmod, and a symlink put there since
    # the argument check would carry it to wherever it points. A temporary file in the same folder,
    # created 0600, then renamed over the target (a rename replaces a symlink; it does not follow it).
    [ ! -L "$SEAT_SECRET_OUT" ] || die "--seat-secret-out: $SEAT_SECRET_OUT is a symlink; the secret is not written through one"
    # From mktemp to the rename the temporary file holds the secret, so every way out of the script
    # (a failed command, `die`, Ctrl-C, a kill) removes it. The script has no other trap, so this
    # one is cleared after the rename. INT and TERM only `exit`, which runs the EXIT trap: a handler
    # that did the `rm` and returned would let the script carry on after the interrupt.
    OUT_TMP=""
    trap '[ -z "$OUT_TMP" ] || rm -f "$OUT_TMP"' EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    OUT_TMP="$(umask 077; mktemp "$SEAT_SECRET_OUT.XXXXXX")" || die "cannot create a temporary file beside $SEAT_SECRET_OUT"
    printf '%s\n' "$OUT_VALUE" > "$OUT_TMP" || die "cannot write $OUT_TMP"
    chmod 600 "$OUT_TMP" || die "cannot set the mode of $OUT_TMP"
    mv -f "$OUT_TMP" "$SEAT_SECRET_OUT" || die "cannot move $OUT_TMP to $SEAT_SECRET_OUT"
    trap - EXIT INT TERM
    unset OUT_VALUE OUT_TMP
    say "    MCP_SEAT_SECRET written to $SEAT_SECRET_OUT (0600)"
  fi
fi

# ── 3b. Model keys ────────────────────────────────────────────────────────────────────────────
#
# 🔒 mode 0600 IS REQUIRED. dsh-credentials-local refuses to boot on a file readable beyond its
# owner ("/desk-home/.credentials.yaml is readable beyond its owner (mode 644)") and the
# container goes into a crash loop that reads, from outside, as a 502 from the hostname.
say "3b. model keys at $DESK_HOME/.credentials.yaml"
if [ -f "$DESK_HOME/.credentials.yaml" ]; then
  say "    exists — keeping it"
elif [ -n "$TEMPLATE_LANE" ]; then
  TPL_HOME=""
  if [ "$DRY_RUN" != 1 ]; then
    TPL_HOME="$(docker inspect "$TEMPLATE_LANE" --format '{{range .Mounts}}{{if eq .Destination "/desk-home"}}{{.Source}}{{end}}{{end}}' 2>/dev/null || true)"
    [ -n "$TPL_HOME" ] || die "cannot read the /desk-home mount of $TEMPLATE_LANE"
  else
    TPL_HOME='<docker inspect --format {{.Mounts}} '"$TEMPLATE_LANE"'>'
  fi
  if [ "$DRY_RUN" = 1 ] || [ -f "$TPL_HOME/.credentials.yaml" ]; then
    # cp -a keeps the mode; the chmod is the safety line, because the way this has broken before
    # was a rewrite that created a new file under the umask.
    run cp -a "$TPL_HOME/.credentials.yaml" "$DESK_HOME/.credentials.yaml"
    run chmod 600 "$DESK_HOME/.credentials.yaml"
    run chown 33:33 "$DESK_HOME/.credentials.yaml"
  else
    warn "$TEMPLATE_LANE has no .credentials.yaml — this dsh will come up and then die on the first answer (MISSING_CREDENTIAL)"
  fi
else
  warn "no --template-lane and no .credentials.yaml — this dsh will come up and then die on the first answer (MISSING_CREDENTIAL)"
fi

# ── 4. /etc/tracy/host-dsh.env ────────────────────────────────────────────────────────────────
say "4. $ENV_FILE"
if [ -z "$IMAGE_TAG" ] && [ -f "$ENV_FILE" ]; then
  IMAGE_TAG="$(sed -n 's/^DSH_IMAGE_TAG=//p' "$ENV_FILE" | sed -n 1p)"
  [ -z "$IMAGE_TAG" ] || printf '    keeping DSH_IMAGE_TAG=%s from the existing file\n' "$IMAGE_TAG"
fi
[ -n "$IMAGE_TAG" ] || IMAGE_TAG="<--image-tag>"

# The image is built on the host — there is no registry for it — but the BUILD no longer takes a
# docker gid (06/09: baking one made the image a per-host artifact). It is printed anyway, because
# it is the value `group_add:` needs on any fallback that goes back to the raw socket; this compose
# file does not, since dsh reaches the daemon through the proxy.
DOCKER_GID="$(stat -c %g /var/run/docker.sock 2>/dev/null || true)"
[ -n "$DOCKER_GID" ] || DOCKER_GID="<no docker socket on this machine>"
say "    docker socket gid (only for a raw-socket fallback's group_add): $DOCKER_GID"

if [ -f "$ENV_FILE" ] && [ "$FORCE" != 1 ]; then
  say "    exists — keeping it (re-run with --force to rewrite)"
else
  run mkdir -p "$(dirname "$ENV_FILE")"
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] write %s (0600) with DSH_IMAGE_TAG=%s, HOST_AGENT_HOSTNAME=%s\n' \
      "$ENV_FILE" "$IMAGE_TAG" "$AGENT_HOSTNAME"
  else
    umask 077
    cat > "$ENV_FILE" <<ENV
# Written by host-dsh-init.sh for fleet host '$HOST'. See dsh/host-dsh.env.example for what each
# name means and what deliberately is not here.
DSH_IMAGE_TAG=$IMAGE_TAG
HOST_AGENT_HOSTNAME=$AGENT_HOSTNAME
HOST_SITES_ROOT=$SITES_ROOT
HOST_DSH_HOME=$DESK_HOME
ENV
    chmod 600 "$ENV_FILE"
  fi
fi

# ── 5. Up ─────────────────────────────────────────────────────────────────────────────────────
# ── The profile, before anything is brought up ────────────────────────────────────────────────
#
# 🔒 THE ENTRYPOINT SAID THIS STEP WAS HERE, AND IT WAS NOT. Its refusal message names
# "host-dsh-init.sh seeds the profile first" as the reason a whole-/desk-home mount is allowed at
# all — but no such step existed, in any branch. The result, measured on a fresh host 07/09:
# tracy-dsh crash-loops with `exit 2` and `/desk-home/profiles/native/package.json is missing`,
# because the bind mount hides the profile the image carries. Nothing else on the host says why.
say "4b. seeding the profile from the image"
SEED_SCRIPT="$(cd "$(dirname "$0")" && pwd)/seed-profile.sh"
if [ "$DRY_RUN" = 1 ]; then
  say "    [dry-run] $SEED_SCRIPT ${DSH_IMAGE:-${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}/tracy-dsh}:$IMAGE_TAG $DESK_HOME"
else
  [ -x "$SEED_SCRIPT" ] || die "no executable $SEED_SCRIPT beside this script; without it dsh cannot boot"
  "$SEED_SCRIPT" "${DSH_IMAGE:-${TRACY_IMAGE_PREFIX:-ghcr.io/tracyhq}/tracy-dsh}:$IMAGE_TAG" "$DESK_HOME"
fi

say "5. docker compose up"
run docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

say "    waiting for $DSH_CONTAINER to report healthy (start_period is 180s; a cold host takes minutes)"
if [ "$DRY_RUN" = 1 ]; then
  printf '    [dry-run] poll: docker inspect -f {{.State.Health.Status}} %s, up to 300s\n' "$DSH_CONTAINER"
else
  HEALTH=unknown
  WAITED=0
  while [ "$WAITED" -lt 300 ]; do
    HEALTH="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$DSH_CONTAINER" 2>/dev/null || echo missing)"
    [ "$HEALTH" = healthy ] && break
    sleep 5
    WAITED=$((WAITED + 5))
  done
  printf '    health after %ss: %s\n' "$WAITED" "$HEALTH"
  [ "$HEALTH" = healthy ] || warn "not healthy — read 'docker logs $DSH_CONTAINER' before going on; the smoke test below will say the same thing louder"
fi

say "    the gateway's own words:"
# grep -c rather than grep alone would hide the lines; the point is to read them. `|| true`
# because an empty match must not end a run that has already changed the host.
run_sh "docker logs $DSH_CONTAINER 2>&1 | grep -iE 'gateway|listening|seat' | tail -8 || true"

# ── 6. The smoke test that actually proves something ──────────────────────────────────────────
#
# One signed call at 127.0.0.1:51700, the way ban-do-fleet.md §5 step 5 does it. This skips
# tracy-web and every proxy in front of the gateway: 200 {"ok":true,…} means the container
# is done being the suspect, and anything that breaks after this breaks above it.
#
# The signing string must match vendor/tracy/dsh-passwords/src/tracy/seat.ts byte for byte:
#     <timestamp>\n<nonce>\nPOST\n<path>\n<sha256hex(body)>
say "6. signed POST /gateway/seat/session against $GATEWAY"
SMOKE_FOLDERS='[]'
if [ -d "$SITES_ROOT" ]; then
  FIRST_SITE="$(find "$SITES_ROOT" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; 2>/dev/null | sort | head -1 || true)"
  [ -z "$FIRST_SITE" ] || SMOKE_FOLDERS="[\"/site/$FIRST_SITE\"]"
fi
say "    folders: $SMOKE_FOLDERS"

if [ "$DRY_RUN" = 1 ]; then
  cat <<'SMOKE'
    [dry-run] S=$(grep -m1 '^MCP_SEAT_SECRET=' "$PASSWORDS_ENV" | cut -d= -f2-)
    [dry-run] BODY='{"role":"editor","email":"host-dsh-init@tracy.ai","folders":<folders>}'
    [dry-run] TS=$(( $(date +%s) * 1000 )); N=$(openssl rand -hex 16)
    [dry-run] BH=$(printf '%s' "$BODY" | openssl dgst -sha256 | awk '{print $NF}')
    [dry-run] SIG=$(printf '%s\n%s\nPOST\n/gateway/seat/session\n%s' "$TS" "$N" "$BH" | openssl dgst -sha256 -hmac "$S" | awk '{print $NF}')
SMOKE
  # Not in the quoted heredoc above: the gateway is a variable (HOST_DSH_GATEWAY).
  printf '    [dry-run] curl -sS -w %s -X POST %s/gateway/seat/session ... -d "$BODY"\n' "'\\n%{http_code}\\n'" "$GATEWAY"
else
  SECRET="$(grep -m1 '^MCP_SEAT_SECRET=' "$PASSWORDS_ENV" | cut -d= -f2- | tr -d '"')"
  [ -n "$SECRET" ] || die "no MCP_SEAT_SECRET in $PASSWORDS_ENV"
  SMOKE_PATH=/gateway/seat/session
  SMOKE_BODY="{\"role\":\"editor\",\"email\":\"host-dsh-init@tracy.ai\",\"folders\":$SMOKE_FOLDERS}"
  # Seconds x 1000, never `%3N`: uutils date (newer Ubuntu) ignores the width and prints
  # nanoseconds, so the gateway answers `403 stale`. The 60 s window needs no finer resolution.
  TS="$(( $(date +%s) * 1000 ))"
  NONCE="$(openssl rand -hex 16)"
  BODY_HASH="$(printf '%s' "$SMOKE_BODY" | openssl dgst -sha256 | awk '{print $NF}')"
  SIG="$(printf '%s\n%s\nPOST\n%s\n%s' "$TS" "$NONCE" "$SMOKE_PATH" "$BODY_HASH" \
    | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')"
  RESPONSE="$(curl -sS -w '\n%{http_code}' -X POST "$GATEWAY$SMOKE_PATH" \
    -H 'content-type: application/json' \
    -H "x-seat-timestamp: $TS" -H "x-seat-nonce: $NONCE" -H "x-seat-signature: $SIG" \
    -d "$SMOKE_BODY" || true)"
  CODE="$(printf '%s' "$RESPONSE" | tail -1)"
  # `sed '$d'` and not `head -n -1`: the latter is a GNU extension, and this script is also
  # read on a laptop.
  printf '    %s\n' "$(printf '%s' "$RESPONSE" | sed '$d' | { head -c 400; cat >/dev/null; })"
  printf '    HTTP %s\n' "$CODE"
  if [ "$CODE" = 200 ]; then
    say "    seat door answers. The container is out of the picture for anything that breaks next."
  else
    warn "the seat door did not mint. 403 = the signature or MCP_SEAT_SECRET; 404 = the door is not configured (a missing key means the door does not exist, not that it is ajar); 000 = nothing is listening at $GATEWAY."
    exit 1
  fi
fi

# A kept dsh-passwords.env means this run read no actor secret and printed no banner.
if [ "$PASSWORDS_KEPT" = 1 ]; then
  SEAT_NOTE="MCP_SEAT_SECRET: the value already in $PASSWORDS_ENV, or the --seat-secret-out file"
  ACTOR_NOTE="the value already in $PASSWORDS_ENV"
else
  SEAT_NOTE="MCP_SEAT_SECRET: the banner above, or the --seat-secret-out file"
  ACTOR_NOTE="the same value this script read"
fi

cat <<NEXT

==> done. What is NOT done here, on purpose:

  · /etc/tracy/tracy-web.env of the tracy-web at $TRACY_ORIGIN:
      HOST_${HOST}_DSH_ORIGIN=http://${DSH_CONTAINER}:8080
      SEAT_${HOST}_SECRET=<$SEAT_NOTE>
      MCP_TRACY_ACTOR_SECRET=<$ACTOR_NOTE>
    then restart tracy-web. It does not boot without the first two (readHosts, config.js).
  · TRACY_SITE_DOMAIN and MODEL_API_KEY in $ENV_FILE if this run wrote it: deploy-host-dsh.sh
    refuses to deploy without the first, and the agent is mute without the second.
NEXT
