#!/usr/bin/env bash
#
# TCH sandbox: dsh 0.1.2-rc.1 + Tracy plugins + dsh-passwords.
#
#   ./run.sh              boot the `web` profile
#   ./run.sh desktop      boot the `desktop` profile
#
# Both profiles can run at once — they are independent plugin trees on different ports that
# share one $DSH_HOME, so sessions, credentials and settings are the same on either.
set -uo pipefail
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-web}"
# `shift` so the trailing "$@" holds only FORWARDED arguments. Without it dsh would also receive the
# profile name as a stray argument.
[ $# -gt 0 ] && shift
export DSH_HOME="$T/tch"

# ONE ENV FILE PER PROFILE, and not for tidiness.
#
# dsh-passwords declares its gateway port IN the env file (`MCP_GATEWAY_PORT`), not through a flag.
# Two profiles sharing one env file means two password gates both claiming 51711: the second dies
# with `EADDRINUSE` and exits, while its dsh keeps serving — so the browser still gets 401 and it
# looks like it works. `MCP_GATEWAY_UPSTREAM` must also point at that profile's own dsh port,
# or the password gate proxies to the other profile.
ENV_FILE="$T/.env.$PROFILE"
if [ ! -f "$ENV_FILE" ]; then
  ENV_FILE="$T/.env"
  # Env files hold secrets, so they are NOT in git; a fresh clone only has `.env`. Falling back to it
  # for a profile other than `web` recreates the port clash above, and the symptom is "desktop
  # runs but has no password gate" — looks like it works. Say so instead of leaving it to be discovered.
  if [ "$PROFILE" != "web" ]; then
    echo "run.sh: ⚠ no $T/.env.$PROFILE — sharing $T/.env with the web profile." >&2
    echo "run.sh:   Running both profiles at once with the same env file means the second one's" >&2
    echo "run.sh:   password gate does NOT come up. Create a separate one:" >&2
    echo "run.sh:     sed -e 's|^MCP_GATEWAY_PORT=.*|MCP_GATEWAY_PORT=<port+10>|' \\" >&2
    echo "run.sh:         -e 's|^MCP_GATEWAY_UPSTREAM=.*|MCP_GATEWAY_UPSTREAM=http://127.0.0.1:$( \\" >&2
    echo "run.sh:            awk '/id: webserver/{f=1} f&&/port:/{print \$2; exit}' tch/profiles/$PROFILE/cordis.patch.yml)|' \\" >&2
    echo "run.sh:         .env > .env.$PROFILE && chmod 600 .env.$PROFILE" >&2
  fi
fi
export DSH_PASSWORDS_ENV_FILE="$ENV_FILE"

# LOAD IT STRAIGHT INTO THE ENVIRONMENT, don't just point at the path.
#
# dsh-passwords reads `process.env` FIRST and dotenv second, and dotenv does NOT override existing
# variables. So setting DSH_PASSWORDS_ENV_FILE alone is not enough: if MCP_GATEWAY_PORT is already in
# the environment, the right file still loses. Measured 30/08: the desktop profile's gateway process had
# `DSH_PASSWORDS_ENV_FILE=.env.desktop` yet ran web's `MCP_GATEWAY_PORT=51711`, then found 51711 taken
# and skipped itself — desktop ran WITHOUT a password gate, and no log line said so.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DIR="$DSH_HOME/profiles/$PROFILE"
[ -d "$DIR" ] || { echo "run.sh: no profile '$PROFILE' — available: $(ls "$DSH_HOME/profiles" | grep -v node_modules | tr '\n' ' ')" >&2; exit 2; }

# The checked-out dsh, never whatever `dsh` resolves to on PATH. The globally installed CLI is
# 0.1.1-rc.2, a version these profiles are not built for: rc.2 has no ctx.locale.addLanguage,
# so `vi` would never reach the language picker and nothing would say why.
#
# ⚠ THE ORDER IN THE ERROR MESSAGE IS PART OF THE FIX: `pnpm dsh:build` FIRST, `pnpm install` SECOND.
# Since 06/09 `@deepseek-ai/dsh` is a workspace member built from source, and `lib/bin.js` does not exist
# yet when `pnpm install` links bins — so after a green `pnpm install` this shim is still missing. The
# reverse order is worse than wasted time: on an unbootstrapped tree, `vendor/tracy/dsh-passwords`'s
# `prepare` runs `tsc` against `@deepseek-ai/cordis`, which only has `lib/types/` AFTER `dsh:build` — so
# the install goes RED; and on an installed tree, a later `dsh:build` takes the root tree back and dsh dies
# at boot in `fs_ext.node`. The header of `scripts/build-dsh.mjs` explains why no root command can undo it.
DSH="$T/node_modules/.bin/dsh"
[ -x "$DSH" ] || { echo "run.sh: missing $DSH — run \`pnpm dsh:build && pnpm install\` first." >&2; exit 2; }
# The shim existing is not enough: the build behind it may belong to an older submodule commit
# (gitignored `lib/` survives every pin move). Measured 07/10: blank page, `@tracy/dsh-assistant:
# pending (waiting for service: chatLocal)`. Reasons in `scripts/lib/dsh-build-state.mjs`.
node "$T/scripts/check-dsh-build.mjs" || exit 2

# READ THE PORT FROM THE PATCH, DON'T RETYPE IT HERE.
#
# The profile's `cordis.patch.yml` declares `webserver.port`, and that patch WINS over `--port`.
# Retyping the number here creates a second source of truth: edit the patch, forget the script, and
# dsh listens on one port while `--trusted-host` declares another — container/browser look "Up" and
# every request is refused, with no error line saying why.
PORT="$(awk '/id: webserver/{f=1} f&&/port:/{print $2; exit}' "$DIR/cordis.patch.yml" 2>/dev/null)"
[ -n "$PORT" ] || { echo "run.sh: $DIR/cordis.patch.yml does not declare webserver.port" >&2; exit 2; }

# Preflight, because both failures below are SILENT or misleading.
#
# Busy port: a leftover dsh process still answers HTTP as if real, so `curl` looks successful
# while the instance just started has died of EADDRINUSE. Hit exactly that on 30/08.
GW_PRECHECK="$(awk -F= '/^MCP_GATEWAY_PORT=/{print $2; exit}' "$ENV_FILE" 2>/dev/null)"
for busy in "$PORT" ${GW_PRECHECK:-}; do
if lsof -nP -iTCP:"$busy" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "run.sh: port $busy is busy — $(lsof -nP -iTCP:"$busy" -sTCP:LISTEN -t | tr '\n' ' ')" >&2
  echo "run.sh: stop that process first; don't trust its HTTP responses." >&2
  exit 2
fi
done

# The profile's plugin tree is LINKED FROM THE WORKSPACE, not installed from a registry (06/09).
#
# This spot used to check whether the private registry was alive and whether `~/.npmrc` had a token. The
# registry is retired and `@tracy/*` plus the five forked plugins are workspace members of this repo, so
# the right check now is "does the profile's node_modules hold the right plugin tree" — and the cheapest
# way to make it right is to rebuild it on every run.
if ! node "$T/scripts/materialize-profile.mjs" "$PROFILE" >&2; then
  echo "run.sh: materializing profile '$PROFILE' failed — run \`pnpm dsh:build && pnpm install\` first." >&2
  exit 2
fi

# dsh-passwords' port, read from the env file in use — again the single source of truth.
GATEWAY="$(awk -F= '/^MCP_GATEWAY_PORT=/{print $2; exit}' "$ENV_FILE" 2>/dev/null)"

# `--trusted-host` is a CLOSED LIST: dsh refuses every other Host header. Users come through the
# password gate, so the Host they send carries the GATEWAY port, not the dsh port — without it every
# request through the gateway is refused while hitting the dsh port directly works.
TRUSTED=(--trusted-host "127.0.0.1:$PORT" --trusted-host "localhost:$PORT")
if [ -n "$GATEWAY" ]; then
  TRUSTED+=(--trusted-host "127.0.0.1:$GATEWAY" --trusted-host "localhost:$GATEWAY")
fi

# dsh's SIGN-IN TOKEN, WRITTEN TO A FILE — because the Electron window cannot read this stdout.
#
# alpha.1 adds a `dsh-auth-<host:port>` fence: only requests carrying that cookie get through, and the
# cookie is only granted when opening `/?token=<token>`. The token is RANDOM ON EVERY RUN, lives only
# in process memory, and dsh prints it exactly once.
#
# A person at the terminal can read that line. The Electron app cannot: it may REUSE a `./run.sh`
# session it did not spawn, so there is no stdout to read. A file is the only place both paths can
# reach. It is deleted before the run, so the file APPEARING means "dsh printed the token", not
# leftovers from a previous run.
#
# STILL MUST `exec`. main.js kills exactly the PID it spawned, so bash must BECOME dsh rather than
# stay the parent of a pipeline — otherwise quitting the app kills only bash and leaves an orphaned dsh
# holding the port, and the next launch dies with `EADDRINUSE`. Hence process substitution: stdout
# flows through the reader while the main process is still replaced by dsh.
TOKEN_FILE="$DIR/.launch-token"
rm -f "$TOKEN_FILE"
# `if`, NOT `case`: bash 3.2 reads the `)` ending a case branch as the closing paren of the
# process substitution itself, and fails with a syntax error as soon as the file loads.
exec > >(
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [ "${line#dsh web: }" != "$line" ] && [ "${line#*\?token=}" != "$line" ]; then
      token="${line#*\?token=}"
      # The line may carry a trailing "(LAN: …)"; cut at the first space.
      token="${token%% *}"
      (umask 077; printf '%s\n' "$token" > "$TOKEN_FILE")
    fi
  done
)

echo "run.sh: profile '$PROFILE' → dsh http://127.0.0.1:$PORT${GATEWAY:+, password gate http://127.0.0.1:$GATEWAY}"
# Forward arguments to dsh — that is how a dev overlay is turned on:
#
#   ./run.sh web --patch tch/patches/tracy-sidebar.yml
#
# 🔒 POSITION MATTERS: "$@" must come RIGHT AFTER --profile, BEFORE --no-open/--port/--trusted-host.
# `dsh` splits flags into two groups: the launcher's (--profile, --patch) and the profile app's (--port,
# --trusted-host). Once an app flag appears, everything after it belongs to the app, so a trailing
# `--patch` dies at once with `error: unknown option '--patch'`.
#
# A machine's own rows (a test webroot, a local path) live in `$DIR/cordis.local.yml`, which git
# ignores, so the committed profile carries no path of anyone's machine.
if [ -f "$DIR/cordis.local.yml" ]; then
  exec "$DSH" --profile "$PROFILE" --patch "$DIR/cordis.local.yml" "$@" --no-open --port "$PORT" "${TRUSTED[@]}"
fi
exec "$DSH" --profile "$PROFILE" "$@" --no-open --port "$PORT" "${TRUSTED[@]}"
