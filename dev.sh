#!/usr/bin/env bash
#
# Start both dev surfaces and open the browser.
#
#   ./dev.sh              start whatever is not running, open the browser
#   ./dev.sh --restart    stop and start everything again (only THIS REPO's processes)
#   ./dev.sh --no-open    don't open the browser
#   ./dev.sh web          web profile only
#
# THE DEFAULT IS `web native`, NOT `web desktop`. The Electron app declares `PROFILE = 'native'`
# (`packages/desktop/tracy-desktop/src/main.js`) since 01/09, and a default list still pointing at
# `desktop` meant `./dev.sh` started exactly the lane the app does NOT use; the app then found 51731
# silent and spawned its own lane — two dsh instances, two session stores, signing in on one and
# measuring on the other. `desktop` can still be named; it is just no longer the default.
#
# THE DEFAULT IS TO REUSE, NOT TO RESTART.
#
# Several agent sessions may run `./run.sh` on one machine, and killing another session's process
# happened several times on 30/08 — each time someone lost the surface they were measuring. If a
# port already answers, the script treats it as a valid session and reuses it. To load new code into
# memory, say so explicitly with `--restart`.
set -uo pipefail
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$T"

RESTART=0
OPEN=1
PROFILES="web native"
for arg in "$@"; do
  case "$arg" in
    --restart) RESTART=1 ;;
    --no-open) OPEN=0 ;;
    web|desktop|native) PROFILES="$arg" ;;
    *) echo "dev.sh: unknown argument '$arg' — usage: [web|desktop|native] [--restart] [--no-open]" >&2; exit 2 ;;
  esac
done

# Each profile's plugin tree is LINKED FROM THE WORKSPACE, not installed from a registry (06/09).
#
# This spot used to check two things: whether the private registry answered and whether `~/.npmrc`
# had a token — because `@tracy/*` and the `-tracy.N` versions existed nowhere else. Both went away
# with the registry: those packages are now workspace members of this repo. `materialize-profile.mjs`
# links them into `tch/profiles/<profile>/node_modules`, exactly what the image's Dockerfile fills with COPY.
#
# Runs EVERY TIME, not only when something is missing: a new plugin in the bundle only shows up here,
# and the symptom of skipping it is HALF A UI with no error at all.
if ! node "$T/scripts/materialize-profile.mjs" $PROFILES >&2; then
  echo "dev.sh: materializing the profiles failed — run \`pnpm dsh:build && pnpm install\` first." >&2
  exit 2
fi

LOGDIR="${TMPDIR:-/tmp}/tch-dev"
mkdir -p "$LOGDIR"

# Read the password-gate port from the profile's own env file — the same source of truth run.sh uses.
gateway_port() {
  local file="$T/.env.$1"
  [ -f "$file" ] || file="$T/.env"
  awk -F= '/^MCP_GATEWAY_PORT=/{print $2; exit}' "$file" 2>/dev/null
}

# Only kill processes whose cmdline names this repo's profile. No pkill by program name:
# it would also hit other repos' processes on the same machine.
stop_profile() {
  local profile="$1" gw
  gw="$(gateway_port "$profile")"
  local dsh_pid gw_pid
  dsh_pid="$(pgrep -f "dsh/lib/bin.js --profile $profile" | head -1)"
  gw_pid="$(lsof -nP -iTCP:"$gw" -sTCP:LISTEN -t 2>/dev/null | head -1)"
  [ -n "$gw_pid" ] && kill "$gw_pid" 2>/dev/null
  [ -n "$dsh_pid" ] && kill "$dsh_pid" 2>/dev/null
  sleep 2
}

for profile in $PROFILES; do
  GW="$(gateway_port "$profile")"
  [ -n "$GW" ] || { echo "dev.sh: could not read MCP_GATEWAY_PORT for '$profile'" >&2; exit 2; }

  if [ "$RESTART" = 1 ]; then
    echo "dev.sh: [$profile] stopping the old instance"
    stop_profile "$profile"
  fi

  if curl -sf -m 2 -o /dev/null "http://127.0.0.1:$GW/" 2>/dev/null; then
    OWNER="$(lsof -nP -iTCP:"$GW" -sTCP:LISTEN -t 2>/dev/null | head -1)"
    echo "dev.sh: [$profile] already running on $GW (pid $OWNER) — reusing it, not restarting"
    continue
  fi

  echo "dev.sh: [$profile] starting → log $LOGDIR/$profile.log"
  ./run.sh "$profile" > "$LOGDIR/$profile.log" 2>&1 &
  for _ in $(seq 1 180); do
    curl -sf -m 2 -o /dev/null "http://127.0.0.1:$GW/" 2>/dev/null && break
    sleep 1
  done
  if ! curl -sf -m 2 -o /dev/null "http://127.0.0.1:$GW/" 2>/dev/null; then
    echo "dev.sh: [$profile] did not come up within 180s — see $LOGDIR/$profile.log" >&2
    tail -20 "$LOGDIR/$profile.log" >&2
    exit 1
  fi
done

# Electron app: it reuses the running `native` session and reads the launch token itself, so here we
# only avoid opening two windows. The profile name here must match `PROFILE` in `main.js` — off by one
# letter and the app opens and builds a second lane of its own.
if [[ "$PROFILES" == *native* ]]; then
  if pgrep -f "tracy-desktop" >/dev/null 2>&1; then
    echo "dev.sh: [app] Tracy Cowork window already open — skipping"
  else
    echo "dev.sh: [app] opening Tracy Cowork"
    ( cd packages/desktop/tracy-desktop && pnpm start > "$LOGDIR/app.log" 2>&1 & )
  fi
fi

# Open the browser WITH the launch token.
#
# alpha.1 only grants the `dsh-auth-<host:port>` cookie when opening `/?token=…`; without it the page
# returns 401 and looks broken. The cookie lives 30 days, so it costs one visit per browser.
if [ "$OPEN" = 1 ] && [[ "$PROFILES" == *web* ]]; then
  GW="$(gateway_port web)"
  TOKEN_FILE="$T/tch/profiles/web/.launch-token"
  URL="http://127.0.0.1:$GW/"
  [ -f "$TOKEN_FILE" ] && URL="$URL?token=$(cat "$TOKEN_FILE")"
  echo "dev.sh: opening $URL"
  open "$URL" 2>/dev/null || echo "dev.sh: open manually: $URL"
fi

echo
echo "dev.sh: done."
for profile in $PROFILES; do
  echo "  $profile → password gate http://127.0.0.1:$(gateway_port "$profile")"
done
echo "  sign in with the account in data/platform.db (admin)"
