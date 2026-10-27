#!/usr/bin/env bash
# What `entrypoint.sh` turns an environment into — argv, and the two refusals.
#
# It runs on the HOST, not in the image: `DSH_ENTRYPOINT_DRY_RUN=1` prints the argv instead of
# exec'ing it and writes nothing, and `DSH_HOME` points at a fixture directory shaped like the
# image's own home. So the four failures this file pins are catchable without a 4 GB build:
#
#   1. arguments after the image name being swallowed (a command must run; a flag must be kept)
#   2. a space in DSH_TRUSTED_HOSTS reaching dsh, where it is a crash loop for every site on a host
#   3. a volume mounted over $DSH_HOME hiding the image's profile, which boots a white page
#   4. the composed launcher/app flags drifting
#   5. the validator's door being a different width from dsh's own `assertTrustedAuthority`
#
#   bash packages/fleet/tracy-fleet-operation/dsh/entrypoint.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRYPOINT="$HERE/entrypoint.sh"
FIXTURE="$(mktemp -d)"
trap 'rm -rf "$FIXTURE"' EXIT

mkdir -p "$FIXTURE/home/profiles/native/node_modules/@tracy/dsh-native-bundle"
echo '{}' > "$FIXTURE/home/profiles/native/package.json"
echo '{}' > "$FIXTURE/home/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"
mkdir -p "$FIXTURE/empty-home"

failures=0
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n     %s\n' "$1" "$2"; failures=$((failures + 1)); }

# Run the entrypoint in dry-run against the good fixture. Every variable it reads is set here, so a
# stray value in the tester's own environment cannot decide a result.
run() {
  local home="$1"; shift
  env -i PATH="$PATH" \
      DSH_ENTRYPOINT_DRY_RUN=1 \
      DSH_HOME="$home" \
      DSH_PORT="${DSH_PORT_T:-}" \
      DSH_TRUSTED_HOSTS="${DSH_TRUSTED_HOSTS_T:-}" \
      DSH_PATCH="${DSH_PATCH_T:-}" \
      sh "$ENTRYPOINT" "$@" 2>&1
}

expect_ok() {
  local name="$1" expected="$2"; shift 2
  local out status
  out="$(run "$FIXTURE/home" "$@")"; status=$?
  if [ "$status" -ne 0 ]; then fail "$name" "exit $status: $out"; return; fi
  local flat; flat="$(printf '%s' "$out" | tr '\n' ' ')"
  case "$flat" in
    *"$expected"*) pass "$name" ;;
    *) fail "$name" "expected to contain [$expected], got [$flat]" ;;
  esac
}

expect_exit2() {
  local name="$1" home="$2" expected="$3"; shift 3
  local out status
  out="$(run "$home" "$@")"; status=$?
  if [ "$status" -ne 2 ]; then fail "$name" "expected exit 2, got $status: $out"; return; fi
  case "$out" in
    *"$expected"*) pass "$name" ;;
    *) fail "$name" "expected message [$expected], got [$out]" ;;
  esac
}

echo "entrypoint.sh"

# 0. It has to be a shell script at all. `sh -n` catches the class of error that once shipped:
#    a backtick inside an unquoted heredoc parses fine, so this is necessary and not sufficient.
if sh -n "$ENTRYPOINT" && bash -n "$ENTRYPOINT"; then pass "parses under sh and bash"; else fail "parses under sh and bash" "syntax error"; fi

# 1. No arguments: the composed boot line, in launcher-flags-then-app-flags order.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T= DSH_PATCH_T= \
  expect_ok "no arguments boots the native profile on 51700" \
  "node /opt/dsh/apps/cli/lib/bin.js --profile native --no-open --port 51700 --trusted-host 127.0.0.1:51700 --trusted-host 127.0.0.1:8080"

# 2. A COMMAND replaces dsh. This is `docker run … tracy/dsh:dev id`, and until 06/09 it booted a
#    dsh instead — silently, because the script overwrote "$@" on its first line.
out="$(run "$FIXTURE/home" printf 'hello\n')"; status=$?
if [ "$status" -eq 0 ] && [ "$out" = "hello" ]; then
  pass "a command after the image name runs instead of dsh"
else
  fail "a command after the image name runs instead of dsh" "exit $status, output [$out]"
fi

# 3. A FLAG is kept, not swallowed: a `docker run` may pass extra dsh flags after the image name
#    (the lane era's `create-lane.sh`, deleted 2026-09-06, did exactly that).
DSH_PORT_T= DSH_TRUSTED_HOSTS_T= DSH_PATCH_T= \
  expect_ok "a flag after the image name is appended, not swallowed" \
  "--port 51700 --trusted-host 127.0.0.1:51700 --trusted-host 127.0.0.1:8080 --trusted-host lane.tracy.ai" \
  --trusted-host lane.tracy.ai

# 4. DSH_PORT reaches both the flag and the loopback entry.
DSH_PORT_T=51800 DSH_TRUSTED_HOSTS_T= DSH_PATCH_T= \
  expect_ok "DSH_PORT decides the port flag and its own loopback entry" \
  "--port 51800 --trusted-host 127.0.0.1:51800 --trusted-host 127.0.0.1:8080"

# 5. The list everybody writes: spaces after the commas, and a trailing comma.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com, b.example.com:8080,' DSH_PATCH_T= \
  expect_ok "spaces and a trailing comma are trimmed away" \
  "--trusted-host a.example.com --trusted-host b.example.com:8080"

# 6. A malformed authority is refused HERE, by name. dsh refuses it too, but three levels down a
#    cordis stack and after the container has already been declared Up.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='https://a.example.com' DSH_PATCH_T= \
  expect_exit2 "a URL is not an authority, and is named as the entry it came from" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com/agent' DSH_PATCH_T= \
  expect_exit2 "a path is not an authority" "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:' DSH_PATCH_T= \
  expect_exit2 "an empty port is not an authority" "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:http' DSH_PATCH_T= \
  expect_exit2 "a non-numeric port is not an authority" "$FIXTURE/home" 'is not a bare host[:port] authority'

# 6b. The validator's door must be the SAME WIDTH as dsh's `assertTrustedAuthority`, in both
#     directions. Narrower refuses a deployment that is legal; wider hands dsh the crash loop back.

#     Bracketed IPv6 is what dsh's own spec file lists as valid (`[::1]`, `[::1]:3080`), and this
#     validator used to refuse it.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='[::1]:8080' DSH_PATCH_T= \
  expect_ok "a bracketed IPv6 authority with a port is kept" "--trusted-host [::1]:8080"

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='[2001:db8::1]' DSH_PATCH_T= \
  expect_ok "a bracketed IPv6 authority with no port is kept" "--trusted-host [2001:db8::1]"

#     …and the brackets must not be optional, because dsh refuses the unbracketed spelling.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='::1' DSH_PATCH_T= \
  expect_exit2 "an UNbracketed IPv6 literal is refused, as dsh refuses it" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='[::1' DSH_PATCH_T= \
  expect_exit2 "an unclosed bracket is refused" "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='[::1]x' DSH_PATCH_T= \
  expect_exit2 "trailing text after the closing bracket is refused" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='[example.com]' DSH_PATCH_T= \
  expect_exit2 "brackets around a NAME are not an IPv6 literal" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

#     A port above 65535 does not survive WHATWG parsing, so dsh refuses it — and until 06/09 this
#     validator let it through to exactly the boot-time crash loop it exists to prevent.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:999999' DSH_PATCH_T= \
  expect_exit2 "a port above 65535 is refused here, not by dsh at boot" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:65536' DSH_PATCH_T= \
  expect_exit2 "the port bound is exact: 65536 is out" "$FIXTURE/home" 'is not a bare host[:port] authority'

DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:65535' DSH_PATCH_T= \
  expect_ok "the port bound is exact: 65535 is in" "--trusted-host a.example.com:65535"

#     `:0080` re-serializes to `:80`, which would silently WIDEN an exact-port grant.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T='a.example.com:0080' DSH_PATCH_T= \
  expect_exit2 "a zero-padded port is refused rather than quietly widened" \
  "$FIXTURE/home" 'is not a bare host[:port] authority'

# 6c. An empty first argument is neither a command nor a flag, and saying so beats booting a
#     container that hides which shell variable was unset.
expect_exit2 "an empty first argument is refused by name" "$FIXTURE/home" 'is an empty string' "" foo

# 7. A volume over $DSH_HOME hides the image's own profile. Booting anyway serves a white page.
DSH_PORT_T= DSH_TRUSTED_HOSTS_T= DSH_PATCH_T= \
  expect_exit2 "a home with no profile refuses to boot, naming the mount" \
  "$FIXTURE/empty-home" 'a volume mounted over'

# 8. DSH_PATCH becomes a launcher flag, and only when the file is really there.
: > "$FIXTURE/extra.yml"
DSH_PORT_T= DSH_TRUSTED_HOSTS_T= DSH_PATCH_T="$FIXTURE/extra.yml" \
  expect_ok "DSH_PATCH is a launcher flag, before the app flags" \
  "--profile native --patch $FIXTURE/extra.yml --no-open"

DSH_PORT_T= DSH_TRUSTED_HOSTS_T= DSH_PATCH_T="$FIXTURE/not-here.yml" \
  expect_exit2 "a DSH_PATCH that does not exist is refused" "$FIXTURE/home" 'does not exist'

# 9. Dry-run writes nothing at all — the secrets file is a side effect no test may have.
if [ -e "$FIXTURE/home/dsh-passwords.env" ]; then
  fail "dry-run writes nothing" "the gateway env file was created"
else
  pass "dry-run writes nothing"
fi

# 10. The generated gateway configuration names the sidebar's WebSocket paths.
#
# dsh-passwords refuses to upgrade a third-party WebSocket path that is on no allowlist — 404,
# socket destroyed, and the browser sees only close code 1006. Unset, that is every `/sidebar/ws/*`
# route. Measured 06/09 on the dev cluster on the Terminal tab (gone with sidebar 0.21; the
# agent-opens channel is the one left); this test is what keeps the line from being dropped
# again in a tidy-up.
ENV_FIXTURE="$FIXTURE/gateway-env"
mkdir -p "$ENV_FIXTURE/profiles/native/node_modules/@tracy/dsh-native-bundle"
echo '{}' > "$ENV_FIXTURE/profiles/native/package.json"
echo '{}' > "$ENV_FIXTURE/profiles/native/node_modules/@tracy/dsh-native-bundle/package.json"
# Not a dry run: exercise configuration generation and the final launcher with a private Node
# stub. Neither real secrets nor a real harness are needed; stderr must contain only boot notes.
mkdir -p "$ENV_FIXTURE/bin"
cat > "$ENV_FIXTURE/bin/node" <<'NODE'
#!/bin/sh
if [ "${1:-}" = '-e' ]; then
  printf '%064d' 0
else
  printf 'launcher reached\n'
fi
NODE
chmod 755 "$ENV_FIXTURE/bin/node"
env -i PATH="$ENV_FIXTURE/bin:$PATH" DSH_HOME="$ENV_FIXTURE" \
    DSH_PASSWORDS_ENV_FILE="$ENV_FIXTURE/dsh-passwords.env" \
    MCP_TRACY_ORIGIN='https://fixture.example.test' MCP_SEAT_SECRET='fixture-seat-only' \
    sh "$ENTRYPOINT" >"$ENV_FIXTURE/boot.out" 2>"$ENV_FIXTURE/boot.err"
status=$?
if [ "$status" -eq 0 ] && [ "$(cat "$ENV_FIXTURE/boot.out")" = 'launcher reached' ] && \
    [ "$(grep -c '^\[entrypoint\]' "$ENV_FIXTURE/boot.err")" -eq 2 ] && \
    [ "$(wc -l < "$ENV_FIXTURE/boot.err" | tr -d ' ')" -eq 2 ]; then
  pass "first boot writes configuration without executing its comments"
else
  fail "first boot writes configuration without executing its comments" \
    "unexpected startup status or output (fixture log withheld)"
fi
if grep -Fq '# policy opens to it (`/sidebar/ws/fs-watch` and `/agent-opens`' "$ENV_FIXTURE/dsh-passwords.env" && \
    grep -q '^MCP_TRACY_ORIGIN=https://fixture.example.test$' "$ENV_FIXTURE/dsh-passwords.env" && \
    grep -q '^MCP_SEAT_SECRET=fixture-seat-only$' "$ENV_FIXTURE/dsh-passwords.env" && \
    grep -Fq "MCP_DB_PATH=$ENV_FIXTURE/dsh-passwords-data/platform.db" "$ENV_FIXTURE/dsh-passwords.env" && \
    [ "$(grep -Ec '^(SETUP_KEY|MCP_JWT_SECRET|MCP_INTERNAL_SECRET|MCP_DB_ENC_KEY)=0{64}$' "$ENV_FIXTURE/dsh-passwords.env")" -eq 4 ] && \
    [ -n "$(find "$ENV_FIXTURE/dsh-passwords.env" -perm 600)" ]; then
  pass "first boot preserves literal comments, configured values and private generated secrets"
else
  fail "first boot preserves literal comments, configured values and private generated secrets" \
    "generated configuration or permissions differ (values withheld)"
fi
cp "$ENV_FIXTURE/dsh-passwords.env" "$ENV_FIXTURE/original.env"
env -i PATH="$ENV_FIXTURE/bin:$PATH" DSH_HOME="$ENV_FIXTURE" \
    DSH_PASSWORDS_ENV_FILE="$ENV_FIXTURE/dsh-passwords.env" \
    MCP_TRACY_ORIGIN='https://changed.example.test' \
    sh "$ENTRYPOINT" >"$ENV_FIXTURE/restart.out" 2>"$ENV_FIXTURE/restart.err"
if [ "$?" -eq 0 ] && cmp -s "$ENV_FIXTURE/original.env" "$ENV_FIXTURE/dsh-passwords.env" && \
    [ ! -s "$ENV_FIXTURE/restart.err" ]; then
  pass "a later boot leaves gateway configuration unchanged"
else
  fail "a later boot leaves gateway configuration unchanged" "existing configuration was changed or boot failed"
fi
if grep -q '^MCP_GATEWAY_SSH_ENDPOINTS=owner:ws:/sidebar/ws/terminal,owner:ws:/sidebar/ws/agent-terminals$' \
    "$ENV_FIXTURE/dsh-passwords.env" 2>/dev/null && \
    ! grep -q '^MCP_GATEWAY_WS_ADMIN_ALLOWLIST=' "$ENV_FIXTURE/dsh-passwords.env" 2>/dev/null; then
  pass "the gateway config keeps both terminal paths owner-only, with no 2.6.6 allowlist"
else
  fail "the gateway config keeps both terminal paths owner-only, with no 2.6.6 allowlist" \
    "MCP_GATEWAY_SSH_ENDPOINTS is missing or MCP_GATEWAY_WS_ADMIN_ALLOWLIST is still written"
fi

if [ "$failures" -ne 0 ]; then
  printf '\n%d failing\n' "$failures"
  exit 1
fi
printf '\nall passing\n'
