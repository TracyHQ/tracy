#!/bin/sh
# tracy/dsh entrypoint — the ONE thing the image reads from its environment.
#
# The image is identical on every fleet host and on this dev machine; what differs is a port, a
# list of hostnames a browser will use, and a handful of secrets. Those arrive here, as
# environment variables, and nowhere else — a baked CMD carrying a host's addresses would make the
# image a per-host artifact, which is the thing one image per fleet exists to stop being.
#
#   DSH_PORT               dsh's own port INSIDE the container (default 51700). Not the front
#                          door: dsh-passwords listens on 8080 and proxies to it.
#   DSH_TRUSTED_HOSTS      comma-separated `host[:port]` values a browser will send in Host/Origin.
#                          127.0.0.1:$DSH_PORT and 127.0.0.1:8080 are always added. Entries are
#                          trimmed and validated here — see the block that does it for why.
#   DSH_PASSWORDS_ENV_FILE the gateway's configuration (default /desk-home/dsh-passwords.env).
#                          Generated with fresh secrets when absent — see below.
#   DSH_PATCH              an extra cordis patch layer, applied above the profile's own.
#   DSH_HOME               the harness home (default /desk-home). Read here only to find the
#                          profile the guard below checks; dsh reads it on its own.
#
# A home-level layer needs no variable at all: dsh reads `$DSH_HOME/cordis.patch.yml` (that is
# `/desk-home/cordis.patch.yml`) over every profile's layer, which is how lanes have always
# carried their per-container rows. `DSH_PATCH` is for a file mounted anywhere else.
#
# `DSH_ENTRYPOINT_DRY_RUN=1` prints the argv it would exec and exits 0, without writing anything.
# `entrypoint.test.sh` next to this file drives it that way.
set -eu

DSH_HOME="${DSH_HOME:-/desk-home}"
DSH_PORT="${DSH_PORT:-51700}"
DSH_PASSWORDS_ENV_FILE="${DSH_PASSWORDS_ENV_FILE:-$DSH_HOME/dsh-passwords.env}"
export DSH_PASSWORDS_ENV_FILE

# ── A command after the image name is a COMMAND, not something to swallow ─────────────────────
#
# `docker run … tracy/dsh:dev id` must run `id`, and `… tracy/dsh:dev sh` must open a shell —
# those are the first two things anybody types when a container misbehaves. Until 06/09 this
# script began by overwriting "$@", so both booted a dsh instead, in silence.
#
# The other half matters more on the fleet: the lane era's `create-lane.sh` (deleted 2026-09-06)
# passed extra dsh flags AFTER the image name (`docker run … "$IMAGE" dsh web --trusted-host …`),
# and any `docker run` written by hand still can. An argument list that starts with
# a flag is therefore read as "boot, with these as well" rather than as a command — the four
# `--trusted-host` values in that line would otherwise vanish, the container would report Up, and
# every browser arriving under a real hostname would be refused by ONE dsh serving every site.
#
# An EMPTY first argument is neither, and is refused rather than passed on. `docker run … "" foo`
# reaches `node` as a real empty argv entry, where dsh reads it as a positional it cannot name;
# the shape almost always means a shell variable that was meant to hold something expanded to
# nothing, and a container that boots anyway hides which one.
if [ "$#" -gt 0 ] && [ -z "$1" ]; then
  echo "[entrypoint] the first argument is an empty string — neither a command nor a dsh flag" >&2
  echo "[entrypoint] usually an unset shell variable in the caller's docker run line" >&2
  exit 2
fi
if [ "$#" -gt 0 ]; then
  case "$1" in
    -*) : ;;          # a flag: fall through and append to the composed launcher arguments
    *) exec "$@" ;;   # a command: it replaces dsh entirely
  esac
fi

# ── The profile has to still be there ─────────────────────────────────────────────────────────
#
# Everything this image is — the profile, its node_modules, settings.yaml — lives under
# `$DSH_HOME`, and every fleet script written for the LANE image mounted a volume over the whole of
# it (`create-lane.sh`, deleted 2026-09-06: `-v "$HOME_DIR:/desk-home"`; `host-dsh.yml` still does,
# which is why `host-dsh-init.sh` seeds the profile first). Do that here and the image's own home is
# hidden: dsh boots, answers HTTP 200, and serves an EMPTY client graph — a white page with no
# error line anywhere, the failure `CLAUDE.md` §3 names as the most expensive one in this repo.
#
# So: say it out loud, before booting, naming the mount.
for required in "$DSH_HOME/profiles/native/package.json" \
                "$DSH_HOME/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"; do
  if [ ! -f "$required" ]; then
    echo "[entrypoint] $required is missing." >&2
    echo "[entrypoint] The image carries its whole profile under $DSH_HOME, so a volume mounted over" >&2
    echo "[entrypoint] $DSH_HOME hides it and dsh would boot an EMPTY client graph — HTTP 200, white" >&2
    echo "[entrypoint] page, no error. Mount the subdirectories that hold DATA instead:" >&2
    echo "[entrypoint]   -v <vol>:$DSH_HOME/sessions -v <vol>:$DSH_HOME/storages -v <vol>:$DSH_HOME/dsh-passwords-data" >&2
    exit 2
  fi
done

# ── The gateway's configuration ───────────────────────────────────────────────────────────────
#
# WRITTEN ONLY WHEN ABSENT. A mounted file is a deployment's answer and is never edited here; a
# missing one means nobody has answered yet, and the honest default is a lane that belongs to no
# site with its own fresh secrets. Overwriting an existing file would rotate the database
# encryption key under a database that is still there — which reads as data loss, not as config.
if [ "${DSH_ENTRYPOINT_DRY_RUN:-}" != "1" ] && [ ! -f "$DSH_PASSWORDS_ENV_FILE" ]; then
  mkdir -p "$(dirname "$DSH_PASSWORDS_ENV_FILE")" "$DSH_HOME/dsh-passwords-data"
  # Node, not openssl: node is the one binary this image is guaranteed to have.
  secret() { node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'; }
  # The umask is scoped to the write, not to the process that follows: this file holds four
  # secrets and must be owner-only, while dsh's own files (sessions, a site folder on a shared
  # mount) are read by the site container's own user and must not inherit 077.
  (umask 077; cat > "$DSH_PASSWORDS_ENV_FILE" <<EOF
# Generated by the image entrypoint on first boot. Mount your own file over this path to decide
# these values yourself; this one is never rewritten once it exists.
SETUP_KEY=$(secret)
MCP_JWT_SECRET=$(secret)
MCP_INTERNAL_SECRET=$(secret)
MCP_DB_ENC_KEY=$(secret)
MCP_DB_PATH=$DSH_HOME/dsh-passwords-data/platform.db
MCP_GATEWAY_AUTO_TLS=0
MCP_GATEWAY_HOST=0.0.0.0
MCP_GATEWAY_PORT=8080
MCP_GATEWAY_TRUSTED_PROXIES=*
# THE SIDEBAR'S WEBSOCKETS. dsh-passwords 2.7.7 (ADR 0027) has no WebSocket allowlist any more:
# the admin account upgrades every path the plugins declare, and a seat reaches only what the Tracy
# policy opens to it (\`/sidebar/ws/fs-watch\` and \`/agent-opens\` with a session it holds, hook H6).
# This line is a second fence on the two terminal paths: an \`owner:\` rule answers 403 to a seat
# before any policy runs, so a later mistake in the policy still cannot open a shell to a seat.
MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals
# The seat door. Empty here means the password door stays open, which is what a machine with no
# seat book (a dev cluster) needs; the fleet mounts a file that fills these in.
#
# Backticks in this template are escaped: the heredoc expands configured values and generated
# secrets, but comments must remain literal. The first-boot test checks both behaviors.
MCP_SEAT_SECRET=${MCP_SEAT_SECRET:-}
MCP_TRACY_ORIGIN=${MCP_TRACY_ORIGIN:-}
# Where the seat doors answer. Empty = MCP_TRACY_ORIGIN, which is the right answer since 16/09/2026:
# \`apps/tracy-web\` serves \`/auth/link/*\`, \`/auth/otp/*\` and \`/sites/:key/seats\` itself, and the
# Cloudflare Worker that used to (\`seats.tracy.ai\`, hardcoded in dsh-passwords) is gone. Set it only
# when the network forces another address, e.g. a host reaching tracy-web over loopback.
MCP_TRACY_SEATS_ORIGIN=${MCP_TRACY_SEATS_ORIGIN:-}
MCP_TRACY_ACTOR_SECRET=${MCP_TRACY_ACTOR_SECRET:-}
# EMPTY, and deliberately: this dsh serves every site on the host and belongs to none of them.
# dsh-passwords opens the Tracy door on origin + actor secret alone, and sends anyone without a
# session to MCP_TRACY_ORIGIN, where cowork-web knows which site they are heading for.
MCP_TRACY_SITE_KEY=${MCP_TRACY_SITE_KEY:-}
MCP_TRACY_SITE_LABEL=${MCP_TRACY_SITE_LABEL:-}
EOF
  )
  echo "[entrypoint] wrote a fresh gateway configuration at $DSH_PASSWORDS_ENV_FILE" >&2
  echo "[entrypoint] the first-run setup key is in that file — read it with: docker exec <container> grep '^SETUP_KEY=' $DSH_PASSWORDS_ENV_FILE" >&2
fi

# ── The creation workspaces' root ─────────────────────────────────────────────────────────────
#
# One folder per signed-in account, made by the seat door on that account's first visit to `/new/`
# (`vendor/tracy/dsh-passwords/src/tracy/seat-home.ts` — the door `mkdir`s the account's folder, but
# refuses when the ROOT is missing, and tracy-web then answers "workspace unavailable"). The root
# is the operator's, so it is made here, once, on every boot: idempotent, and on a volume mounted
# over $DSH_HOME it survives an image upgrade with every personal folder inside it. Named by
# tracy-web's `ONBOARDING_HOME` (default `/desk-home/onboarding`); the two must agree.
if [ "${DSH_ENTRYPOINT_DRY_RUN:-}" != "1" ]; then
  mkdir -p "$DSH_HOME/onboarding"
fi

# ── The launcher's arguments ──────────────────────────────────────────────────────────────────
#
# Composed into two word lists rather than with `set --`, because "$@" already holds the caller's
# own arguments and must survive to the end. Every value that goes into them is either a literal or
# a value validated below as carrying no whitespace, which is what makes the unquoted expansion at
# the `exec` safe.
launcher="--profile native"
app="--no-open --port $DSH_PORT"

if [ -n "${DSH_PATCH:-}" ]; then
  [ -f "$DSH_PATCH" ] || { echo "[entrypoint] DSH_PATCH=$DSH_PATCH does not exist" >&2; exit 2; }
  case "$DSH_PATCH" in
    *[[:space:]]*)
      echo "[entrypoint] DSH_PATCH must not contain whitespace: $DSH_PATCH" >&2
      exit 2
      ;;
  esac
  launcher="$launcher --patch $DSH_PATCH"
fi

# ── Trusted hosts ─────────────────────────────────────────────────────────────────────────────
#
# These are the addresses a BROWSER will send, so they are a fact about the deployment: the
# published host:port on a dev machine, the customer-facing name on the fleet. The two loopback
# entries are always present because they are true inside every container: dsh's own port, and the
# gateway that proxies to it.
#
# 🔒 EVERY ENTRY IS TRIMMED AND CHECKED HERE, and that is not politeness. dsh refuses a malformed
# authority at boot — loudly, which is right — but the refusal arrives as a `cause` three levels
# under a cordis stack:
#     client-connection: trustedHosts entry " b.example.com" is not a bare host[:port] authority
# and the container exits 1. The list that produces it is the one everybody writes:
# `DSH_TRUSTED_HOSTS=a-agent.tracy.ai, b-agent.tracy.ai`. One space, and every site on the host is
# in a crash loop. Measured 06/09.
#
# The shape this mirrors is `assertTrustedAuthority` in
# `vendor/tracy/deepseek-harness/packages/client/connection/src/api-request-trust.ts`: an entry is valid
# when `new URL("http://" + entry)` parses AND re-serializes to the entry itself. Three
# consequences that a first reading of "host[:port]" misses, each pinned by a test below:
#
#   * `[::1]` and `[::1]:8080` are VALID — bracketed IPv6 is the canonical spelling dsh's own
#     test file names (`api-request-trust.host.spec.ts`), and until 06/09 this validator refused
#     what dsh accepts, which is the worse direction for a gate to be wrong in.
#   * a port above 65535 is INVALID — WHATWG parsing throws on it. Left through, it landed back in
#     the exact crash loop this validator exists to stop, just from a different bad input.
#   * a zero-padded port is INVALID — `:0080` re-serializes to `:80`, silently BROADENING an
#     exact-port grant, so dsh refuses it as a typo rather than guessing.
#
# One place it is deliberately WIDER than dsh: a non-canonical IPv6 spelling
# (`[0:0:0:0:0:0:0:1]`, which WHATWG compresses to `[::1]`) passes here and is then refused by
# dsh. Compressing IPv6 in POSIX sh is not worth the lines; letting a bad IPv6 through to a clear
# refusal costs a boot, whereas refusing a GOOD one costs a deployment that cannot be expressed.
# Port `:0` is the one narrowing: dsh's parser takes it, but no browser ever sends `Host: h:0`, so
# an entry written that way can only ever be a mistake and is better named here.
port_valid() {
  case "$1" in
    '' | *[!0-9]* | 0*) return 1 ;;   # empty, non-numeric, or zero-padded (`0`, `0080`)
  esac
  [ "${#1}" -le 5 ] || return 1       # bound the length BEFORE `test -le`, which overflows on huge digit strings
  [ "$1" -le 65535 ] || return 1
  return 0
}

trusted_valid() {
  case "$1" in
    '['*)
      # A bracketed IPv6 authority: `[` <hex/colons/dots> `]` with an optional `:port`.
      _rest=${1#"["}
      case "$_rest" in
        *']'*) : ;;
        *) return 1 ;;
      esac
      _literal=${_rest%%]*}
      _rest=${_rest#*]}
      case "$_literal" in
        '' | *[!0-9A-Fa-f:.]*) return 1 ;;
      esac
      case "$_literal" in
        *:*) : ;;                     # an IPv6 literal always carries a colon; `[example.com]` does not
        *) return 1 ;;
      esac
      case "$_rest" in
        '') return 0 ;;
        :*) port_valid "${_rest#:}" || return 1 ;;
        *) return 1 ;;                # anything after the closing bracket that is not a port
      esac
      return 0
      ;;
  esac
  case "$1" in
    '' | *[!A-Za-z0-9.:_-]* | :* | *:) return 1 ;;
    *:*:*) return 1 ;;
  esac
  case "$1" in
    *:*) port_valid "${1##*:}" || return 1 ;;
  esac
  return 0
}

trusted="127.0.0.1:${DSH_PORT},127.0.0.1:8080,${DSH_TRUSTED_HOSTS:-}"
old_ifs=$IFS
IFS=','
for entry in $trusted; do
  IFS=$old_ifs
  host=$(printf '%s' "$entry" | tr -d '[:space:]')
  # An `if`, not `[ … ] && …`: under `set -e` a bare test that answers "no" ends the script, and
  # the empty entry this list always has when DSH_TRUSTED_HOSTS is unset would end it every time.
  if [ -n "$host" ]; then
    if trusted_valid "$host"; then
      app="$app --trusted-host $host"
    else
      echo "[entrypoint] DSH_TRUSTED_HOSTS entry $(printf '%s' "$entry" | sed 's/^/"/; s/$/"/') is not a bare host[:port] authority" >&2
      echo "[entrypoint] Write it as a comma-separated list of authorities, e.g. a.example.com,b.example.com:8080" >&2
      exit 2
    fi
  fi
  IFS=','
done
IFS=$old_ifs

# `$launcher` and `$app` are deliberately unquoted: they are word lists this script built itself,
# out of literals and values it has just validated as carrying no whitespace. The caller's own
# arguments stay in "$@" and keep their quoting, and they come LAST so a flag passed on the command
# line wins over the composed default.
#
# `set -f` because word splitting is wanted here and PATHNAME EXPANSION is not: a bracketed IPv6
# authority (`[::1]:8080`) is also a glob pattern, and an unquoted one would be rewritten by any
# file in the working directory (`/site`) that happened to match. Nothing below this line globs.
set -f
# shellcheck disable=SC2086
if [ "${DSH_ENTRYPOINT_DRY_RUN:-}" = "1" ]; then
  printf '%s\n' node /opt/dsh/apps/cli/lib/bin.js $launcher $app "$@"
  exit 0
fi

# shellcheck disable=SC2086
exec node /opt/dsh/apps/cli/lib/bin.js $launcher $app "$@"
