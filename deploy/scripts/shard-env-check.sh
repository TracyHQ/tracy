#!/usr/bin/env bash
#
# shard-env-check - refuse a tracy-web env file that is wrong for a shard.
#
#   shard-env-check.sh /etc/tracy/tracy-web.env                   # exit 0 clean, 1 refused, 2 usage
#   shard-env-check.sh /etc/tracy/d1/tracy-web.env --forbidden-only   # skip the required-variable half
#   shard-env-check.sh --list                                     # forbidden names and prefixes, one per line
#
# Two halves, both reported by variable NAME only (a value is never printed):
#   1. FORBIDDEN: variables only the master may hold (spec section 6 with the 15/10 amendment, and
#      section 9 of the shard interface contract v1.1). The reason for each name is in
#      deploy/shard.env.example, block FORBIDDEN; scripts/test/shard-env-template.test.mjs keeps the
#      two lists equal. GITHUB_APP_* is not forbidden: every shard has its own GitHub App.
#   2. REQUIRED: what a shard must carry, absent or empty is refused. SESSION_SECRET must also differ
#      from the master's, which this script cannot know; it checks presence and length only.
#      --forbidden-only skips this half, for an env written before the shard code exists (phase g1).
#
# A name counts as set when its line assigns a non-empty value: compose's env_file keeps everything
# after `=` on a line whose value is empty, so `KEY=   # note` reaches the container as "# note"
# (deploy/.env.example:7-10). Where a name is assigned twice, the last line wins, as in compose.
set -euo pipefail
# [a-z] below must mean a to z, not a locale's collation range (which can take capitals in).
export LC_ALL=C

FORBIDDEN_NAMES="DEMO_HOST DEMO_HOSTS DISCORD_LINK_SECRET WO_PLACES_INGEST_SECRET BADGE_URL API_ORIGIN CLOUDFLARE_TOKEN CLOUDFLARE_ACCOUNT CLOUDFLARE_TUNNEL CLOUDFLARE_DNS_TOKEN CLOUDFLARE_DNS_ZONE_ID TRACY_CF_API_TOKEN TRACY_CF_ACCOUNT_ID TRACY_TUNNEL_ID SHARDS SHARD_ADOPT_ALLOW"
FORBIDDEN_PREFIXES="DEMO_JOOMLART_ JOOMLART_SSO_ GITHUB_OAUTH_ GOOGLE_OAUTH_ CS_TELEGRAM_ CLOUDFLARE_SAAS_"
# The master's row of each shard, SHARD_<name>_<FIELD>, <name> being the contract's shard name
# (section 1). A shard's own SHARD_SECRET and SHARD_MAX_SITES do not match: capitals follow SHARD_.
SHARD_ROW_RE='^SHARD_[a-z][a-z0-9]{0,15}_'
SHARD_NAME_RE='^[a-z][a-z0-9]{0,15}$'
REQUIRED_NAMES="TRACY_DEPLOYMENT_ROLE MASTER_ORIGIN SHARD_SECRET SESSION_SECRET SESSION_DOMAIN HOST_NAME SESSION_COOKIE_NAME TRACY_TUNNEL"

is_forbidden() {
  local key="$1" name prefix
  for name in $FORBIDDEN_NAMES; do [ "$key" != "$name" ] || return 0; done
  for prefix in $FORBIDDEN_PREFIXES; do case "$key" in "$prefix"*) return 0 ;; esac; done
  [[ "$key" =~ $SHARD_ROW_RE ]] && return 0
  return 1
}

is_required() {
  local key="$1" name
  for name in $REQUIRED_NAMES; do [ "$key" != "$name" ] || return 0; done
  return 1
}

if [ "${1:-}" = --list ]; then
  printf '%s\n' $FORBIDDEN_NAMES
  for prefix in $FORBIDDEN_PREFIXES; do printf '%s*\n' "$prefix"; done
  echo 'SHARD_<name>_*'
  exit 0
fi

FILE="${1:-}"
FORBIDDEN_ONLY=0
case "${2:-}" in
  "") ;;
  --forbidden-only) FORBIDDEN_ONLY=1 ;;
  *) FILE="" ;;
esac
[ -n "$FILE" ] && [ -r "$FILE" ] || {
  echo "usage: shard-env-check.sh <env file> [--forbidden-only] | --list" >&2
  exit 2
}

# strip_quotes VALUE: remove one pair of matching surrounding quotes.
strip_quotes() {
  local v="$1"
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  printf '%s' "$v"
}

forbidden_found=""
for name in $REQUIRED_NAMES; do printf -v "REQ_$name" '%s' ""; done

while IFS= read -r line || [ -n "$line" ]; do
  [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue
  key="${BASH_REMATCH[2]}"
  value="${BASH_REMATCH[3]}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  value="$(strip_quotes "$value")"
  if is_required "$key"; then
    printf -v "REQ_$key" '%s' "$value"
    continue
  fi
  [ -n "$value" ] || continue
  is_forbidden "$key" || continue
  # The one harmless value of a forbidden family: the customer-service bot switched off.
  if [ "$key" = CS_TELEGRAM_MODE ] && [ "$value" = off ]; then continue; fi
  case " $forbidden_found " in *" $key "*) ;; *) forbidden_found="$forbidden_found $key" ;; esac
done < "$FILE"

# What is wrong with the required half, by name: missing (absent or empty) and wrong (value refused).
missing=""
wrong=""
if [ "$FORBIDDEN_ONLY" -eq 0 ]; then
  for name in $REQUIRED_NAMES; do
    eval "current=\${REQ_$name}"
    [ -n "$current" ] || missing="$missing $name"
  done
  if [ -n "$REQ_TRACY_DEPLOYMENT_ROLE" ] && [ "$REQ_TRACY_DEPLOYMENT_ROLE" != shard ]; then wrong="$wrong TRACY_DEPLOYMENT_ROLE"; fi
  if [ -n "$REQ_SHARD_SECRET" ] && ! [[ "$REQ_SHARD_SECRET" =~ ^[0-9a-f]{64}$ ]]; then wrong="$wrong SHARD_SECRET"; fi
  if [ -n "$REQ_SESSION_SECRET" ] && [ "${#REQ_SESSION_SECRET}" -lt 32 ]; then wrong="$wrong SESSION_SECRET"; fi
  if [ -n "$REQ_TRACY_TUNNEL" ] && [ "$REQ_TRACY_TUNNEL" != catch-all ]; then wrong="$wrong TRACY_TUNNEL"; fi
  if [ -n "$REQ_HOST_NAME" ] && ! [[ "$REQ_HOST_NAME" =~ $SHARD_NAME_RE ]]; then wrong="$wrong HOST_NAME"; fi
  if [ -n "$REQ_SESSION_COOKIE_NAME" ] && [ -n "$REQ_HOST_NAME" ] \
    && [ "$REQ_SESSION_COOKIE_NAME" != "tracy_sess_$REQ_HOST_NAME" ]; then
    wrong="$wrong SESSION_COOKIE_NAME"
  fi
fi

if [ -n "$forbidden_found" ] || [ -n "$missing" ] || [ -n "$wrong" ]; then
  [ -z "$forbidden_found" ] || echo "shard-env-check: $FILE sets variables a shard must not hold:$forbidden_found" >&2
  [ -z "$missing" ] || echo "shard-env-check: $FILE lacks variables a shard must set (absent or empty):$missing" >&2
  [ -z "$wrong" ] || echo "shard-env-check: $FILE sets variables to a value a shard cannot use:$wrong" >&2
  echo "shard-env-check: reasons and valid shapes are in shard.env.example; fix those lines, then redeploy" >&2
  exit 1
fi
if [ "$FORBIDDEN_ONLY" -eq 1 ]; then
  echo "shard-env-check: $FILE holds none of the forbidden variables (required half skipped)"
else
  echo "shard-env-check: $FILE holds none of the forbidden variables and every required one"
fi
