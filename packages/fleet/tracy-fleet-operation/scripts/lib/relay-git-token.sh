#!/usr/bin/env bash
# relay-git-token.sh — ask tracy-web for a short-lived, one-repo GitHub token.
#
# Why asked for and not stored: a deploy key or a PAT on this host is a credential that outlives
# every run and covers every future repository somebody adds it to. tracy-web mints a token scoped
# to ONE repo, contents-only, for one hour (ADR 0049/0050) — so a compromised fleet leaks an hour
# of access to one customer, not a permanent key to all of them.
#
# 🔒 The other reason it beats a deploy key, measured 2026-08-17: deploy keys are per repository and
# do not survive a repository being recreated. `rebuild-proposal.sh` cloned over SSH and answered
# "Repository not found" on a repo that had been recreated under its label — the first push through
# the proposal lane died there, silently, in a log nobody was tailing.
#
# ONE signing path for every caller: the body names this host (`HOST_NAME`), is signed with this
# host's own `HOST_SECRET`, and goes to `$TRACY_WEB_ORIGIN/fleet/git-token`. The Worker-era form
# (`FLEET_RELAY_SECRET` from /etc/tracy/hooks.env, sent to seats.tracy.ai, no `host` in the body)
# is gone: that file does not exist in the tracy-host container, and the door answers it
# BAD_SIGNATURE. Two forms, one per kind of caller:
#
#   ANSWER=$(tracy_relay_git_token_for_site "<siteKey>" "<label>")   →   "Org/repo <token>"
#       The site record chooses the repo (push-site-folder.sh): a script that guesses a repo name
#       guesses wrong the day a label and its repo drift apart. Returns 3 when the door answers
#       NO_REPO — a site without a repo is skipped, not a failure.
#
#   TOKEN=$(tracy_relay_git_token_shared "Org/repo")
#       Tracy's own shared repo, no site behind it (sync-brands.sh). No site record can vouch for
#       it, so the door's closed `fleetSharedRepos` list does instead.
#
# `label` travels with every site key because the site key itself is read from the site folder's
# `.tracy/site.json`, which the site's agent can edit: the door refuses a key whose site record
# does not name this host and this label (REPO_NOT_YOURS).
#
# Prints on stdout; every diagnostic goes to stderr so `$(...)` stays clean. The token is never
# written to disk and never placed in argv: callers hand it to git through a credential helper
# that reads it from the environment.

TRACY_WEB_ORIGIN="${TRACY_WEB_ORIGIN:-https://cowork.tracy.ai}"
TRACY_HOOKS_ENV="${TRACY_HOOKS_ENV:-/etc/tracy/hooks.env}"

# _tracy_relay_env — load this host's name and secret. Called before a body is built, because the
# body names the host.
_tracy_relay_env() {
  # Read here rather than inherited: the script must behave the same whether a person runs it or
  # the hook Claude Cowork plugin does. Inside the tracy-host container the file is absent and
  # HOST_SECRET/HOST_NAME come from the environment instead.
  # shellcheck disable=SC1090
  if [ -f "$TRACY_HOOKS_ENV" ]; then . "$TRACY_HOOKS_ENV"; fi
  [ -n "${HOST_SECRET:-}" ] || {
    echo "HOST_SECRET is not set (environment or $TRACY_HOOKS_ENV)" >&2
    return 1
  }
}

# _tracy_relay_ask <json-body> — sign, send, and print "<code> <repo> <token>" (each "-" when
# absent). Returns 1 only when the door could not be reached.
_tracy_relay_ask() {
  local body="$1" signature answer

  signature=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$HOST_SECRET" -hex | sed 's/^.*= //')
  # The signature is an HMAC of the body, not the secret, so argv is fine for it; the body carries
  # no secret either.
  answer=$(curl -sS --max-time 20 -X POST "$TRACY_WEB_ORIGIN/fleet/git-token" \
    -H "x-tracy-signature: $signature" -H 'content-type: application/json' -d "$body") || {
    echo "!! could not reach $TRACY_WEB_ORIGIN" >&2
    return 1
  }
  # One line, three fields: the token never passes through a here-string (bash < 5.1 writes those
  # to a temp file) or a file of any kind.
  printf '%s' "$answer" | python3 -c '
import json, sys
try:
    a = json.load(sys.stdin)
except Exception:
    a = {}
if not isinstance(a, dict):
    a = {}
f = lambda k: str(a.get(k) or "-")
print(f("code"), f("repo"), f("token"))
'
}

tracy_relay_git_token_for_site() {
  local site_key="$1" label="$2" reply code rest repo token
  [ -n "$site_key" ] && [ -n "$label" ] || {
    echo "tracy_relay_git_token_for_site needs a siteKey and a label" >&2
    return 1
  }
  _tracy_relay_env || return 1
  reply=$(_tracy_relay_ask "$(printf '{"siteKey":"%s","label":"%s","host":"%s"}' \
    "$site_key" "$label" "${HOST_NAME:-}")") || return 1
  code=${reply%% *}
  rest=${reply#* }
  repo=${rest%% *}
  token=${rest#* }
  if [ "$code" = "NO_REPO" ]; then
    echo "the site record has no repo for $site_key" >&2
    return 3
  fi
  [ "$repo" != "-" ] && [ "$token" != "-" ] || {
    echo "!! no token: $code" >&2
    return 1
  }
  printf '%s %s' "$repo" "$token"
}

tracy_relay_git_token_shared() {
  local repo="$1" reply code token
  [ -n "$repo" ] || {
    echo "tracy_relay_git_token_shared needs a repo" >&2
    return 1
  }
  _tracy_relay_env || return 1
  reply=$(_tracy_relay_ask "$(printf '{"repo":"%s","host":"%s"}' "$repo" "${HOST_NAME:-}")") || return 1
  code=${reply%% *}
  token=${reply##* }
  [ "$token" != "-" ] || {
    echo "!! no token: $code" >&2
    return 1
  }
  printf '%s' "$token"
}
