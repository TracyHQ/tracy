#!/usr/bin/env bash
# site-mail-token.sh — the token a site's web container presents when it hands tracy-web a message.
#
#   TOKEN=$(tracy_site_mail_token "<label>")
#
#   token = hex(HMAC-SHA256(key = HOST_SECRET, msg = "site-mail:v1:" + label))
#
# Derived, never stored anywhere but the site's own .env (0600), and never minted at random: tracy-web
# recomputes it from the `hostSecret` of the site's host (config.hosts) and compares in constant
# time, so there is no token table to keep in step and nothing to leak but one site's right to ask.
# Contract: tasks/todo-mail-site-khach.md, the contract section. Changing the message prefix or the
# encoding here without changing tracy-web in the same pass makes every site's mail answer 401.
#
# HOST_SECRET comes from the environment (tracy-host runs every provision script with its own, the
# same value it verifies `/_host/*` calls with). A person running a script from a host shell gets it
# from /etc/tracy/hooks.env, the same file lib/relay-git-token.sh reads.
#
# openssl first, exactly the form lib/relay-git-token.sh signs with; python3 when openssl is absent
# (both are in the tracy-host image today: `ca-certificates` pulls openssl in). The test pins both
# paths to Node's createHmac. TRACY_HMAC_TOOL=openssl|python3 forces one, for that test.

TRACY_HOOKS_ENV="${TRACY_HOOKS_ENV:-/etc/tracy/hooks.env}"

tracy_site_mail_token() {
  local label="$1" secret="${HOST_SECRET:-}" tool="${TRACY_HMAC_TOOL:-}" token

  [ -n "$label" ] || { echo "tracy_site_mail_token needs a label" >&2; return 1; }
  if [ -z "$secret" ] && [ -f "$TRACY_HOOKS_ENV" ]; then
    # In a subshell: nothing else hooks.env sets leaks into the caller.
    # shellcheck disable=SC1090
    secret="$(. "$TRACY_HOOKS_ENV" >/dev/null 2>&1; printf '%s' "${HOST_SECRET:-}")"
  fi
  [ -n "$secret" ] || {
    echo "HOST_SECRET is not set (nor in $TRACY_HOOKS_ENV) — cannot derive the site-mail token" >&2
    return 1
  }

  if [ -z "$tool" ]; then
    if command -v openssl >/dev/null 2>&1; then tool=openssl; else tool=python3; fi
  fi
  case "$tool" in
    openssl)
      token="$(printf '%s' "site-mail:v1:$label" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/^.*= //')"
      ;;
    python3)
      # The key through the environment, not argv: argv is readable in `ps` by every process.
      token="$(TRACY_HMAC_KEY="$secret" python3 -c '
import hashlib, hmac, os, sys
print(hmac.new(os.environ["TRACY_HMAC_KEY"].encode(), ("site-mail:v1:" + sys.argv[1]).encode(), hashlib.sha256).hexdigest())
' "$label")"
      ;;
    *) echo "unknown TRACY_HMAC_TOOL: $tool" >&2; return 1 ;;
  esac

  # 64 lowercase hex or nothing: a tool that printed something else (another openssl output
  # format, an error on stdout) must not be written into .env as if it were a token.
  case "$token" in
    *[!0-9a-f]*|'') echo "could not derive the site-mail token with $tool" >&2; return 1 ;;
  esac
  [ "${#token}" -eq 64 ] || { echo "could not derive the site-mail token with $tool" >&2; return 1; }
  printf '%s' "$token"
}
