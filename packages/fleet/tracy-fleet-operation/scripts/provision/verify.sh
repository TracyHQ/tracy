#!/usr/bin/env bash
#
# verify — is this site actually standing, and is it the version the hop aimed at?
#
# Run after every hop, not at the end of the chain. `core:update` calls checkSchema() and
# refuses to start when the database carries errors, so a hop that half-failed silently locks
# the next one; finding that out at the end means walking back an unknown number of steps.
#
# Four checks, and none of them is a matter of opinion:
#
#   version   what the site says it is, against what the hop aimed at
#   home      the front page answers 200 and is not empty
#   admin     /administrator answers 200
#   schema    maintenance:database reports nothing left to fix
#
# A check that could not run is a failure, exactly like a check that failed. The chain reads
# this to decide whether to continue, and "I could not look" is not evidence the site is fine.
#
# Usage:
#   verify.sh --label example-com --expect 6.1 [--root /srv/tracy] [--json]
set -euo pipefail

LABEL=""; EXPECT=""; ROOT="/srv/tracy"; AS_JSON=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --expect) EXPECT="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --json) AS_JSON=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$EXPECT" ] || { echo "need --label and --expect" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no site at $SITE_DIR" >&2; exit 1; }

PORT="$(sed -n 's/^HOST_PORT=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"

in_web() { ( cd "$SITE_DIR" && docker compose exec -T web sh -c "$1" ) 2>/dev/null; }

# ── version ─────────────────────────────────────────────────────────────────────────────
# From the site's own manifest, which is what Joomla itself reads. Not from
# joomlaupdate/healthcheck: the relay's own contract says that probe is unreliable and must
# not be used to derive the core version.
READING="$(in_web 'cd /var/www/html && php -r "\$x=@simplexml_load_file(\"administrator/manifests/files/joomla.xml\"); echo \$x ? (string)\$x->version : \"\";"' || true)"
READING="$(printf '%s' "$READING" | tr -d '\r\n ')"

# ── home and admin ──────────────────────────────────────────────────────────────────────
# Against the loopback port the stack binds to, so this works before the tunnel is in front
# of it. An empty body with a 200 is still a failure: a blank page is the classic shape of a
# Joomla site whose template broke during an upgrade.
#
# Retried, not asked once. A hop and a restore both end by recreating the web container, and
# for the first several seconds after that Apache is up but PHP-FPM is still warming, so the
# port answers with a connection reset or a 503. Asking once in that window reads a healthy
# site as down, which is worse than not asking: it stops a chain that should continue and
# triggers a restore that undoes a good hop. So a non-ok answer is retried until the site
# settles or the budget runs out; only then is it believed. A site that is genuinely broken
# stays non-ok through every retry and still fails, just later.
HTTP_SETTLE_SECS="${HTTP_SETTLE_SECS:-60}"   # how long to let the container come up
probe_once() { # path -> "ok" | "fail" | "unknown"  (a single look, no waiting)
  local path="$1" out code size
  [ -n "$PORT" ] || { echo unknown; return; }
  # X-Forwarded-Proto: https, because the site is real. A provisioned site runs with
  # force_ssl=2 and sits behind cloudflared, which terminates TLS and forwards the request
  # over plain http with this header set. Joomla reads the header and serves; without it,
  # force_ssl sees a bare http request on the loopback and answers 301 to https, which this
  # check would read as a down site and retry to no purpose, because the redirect is constant
  # and never becomes a 200. So the probe speaks to the site the way the tunnel does.
  out="$(curl -sS -o /tmp/verify-body.$$ -w '%{http_code}' --max-time 30 \
        -H 'X-Forwarded-Proto: https' \
        "http://127.0.0.1:$PORT$path" 2>/dev/null || true)"
  code="${out:-000}"
  size="$(wc -c < /tmp/verify-body.$$ 2>/dev/null || echo 0)"
  # A 200 that is Joomla's own fatal-fallback page is a broken site, not a standing one.
  # When the framework cannot boot, because libraries/ or its vendor tree is gone, or a core
  # file fatals, Joomla does not answer 500: it serves a small static "Environment Setup
  # Incomplete" page, or a nested "Error displaying the error page", and still returns 200. An
  # HTTP-code check reads that as up. It is exactly the half-upgraded shape this must catch, so
  # a 200 carrying one of those signatures is a failure.
  local fatal=""
  if [ "$code" = "200" ] && grep -qiE 'Environment Setup Incomplete|Error displaying the error page' \
        "/tmp/verify-body.$$" 2>/dev/null; then
    fatal=1
  fi
  rm -f "/tmp/verify-body.$$"
  if [ "$code" = "000" ]; then echo unknown
  elif [ -n "$fatal" ]; then echo fail
  elif [ "$code" = "200" ] && [ "$size" -gt 0 ]; then echo ok
  else echo fail; fi
}
http_status() { # path -> "ok" | "fail" | "unknown", after giving a warming container time
  local path="$1" state deadline
  deadline=$(( $(date +%s) + HTTP_SETTLE_SECS ))
  while :; do
    state="$(probe_once "$path")"
    [ "$state" = "ok" ] && { echo ok; return; }
    [ "$(date +%s)" -ge "$deadline" ] && { echo "$state"; return; }
    sleep 3
  done
}
HOME_STATUS="$(http_status /)"
ADMIN_STATUS="$(http_status /administrator/)"

# ── schema ──────────────────────────────────────────────────────────────────────────────
# The one core:update itself looks at. Its own output is carried through verbatim: whoever
# reads this is working out why a chain stopped, and a tidied-up message makes them guess.
SCHEMA_OUT="$(in_web 'cd /var/www/html && php cli/joomla.php maintenance:database 2>&1' || true)"
if [ -z "$SCHEMA_OUT" ]; then
  SCHEMA_STATUS="unknown"
elif printf '%s' "$SCHEMA_OUT" | grep -iE 'is not defined|command not found|no commands defined' >/dev/null; then
  # This Joomla is too old to carry the maintenance:database CLI command (4.3 and earlier).
  # That is not a schema failure and not a passed schema check: it is a check we could not
  # run on this version. Report it as such rather than reading the "not defined" message as
  # a clean bill of health. The next hop's own checkSchema() is the real gate anyway.
  SCHEMA_STATUS="na"
elif printf '%s' "$SCHEMA_OUT" | grep -iE 'error|errors found|cannot|failed' >/dev/null; then
  SCHEMA_STATUS="fail"
else
  SCHEMA_STATUS="ok"
fi

RESULT="$(python3 "$HERE/verify_report.py" \
  --reading "$READING" --expected "$EXPECT" \
  --home "$HOME_STATUS" --admin "$ADMIN_STATUS" \
  --schema "$SCHEMA_STATUS" --schema-detail "$(printf '%s' "$SCHEMA_OUT" | tail -c 2000)")" \
  && RC=0 || RC=$?

if [ -n "$AS_JSON" ]; then
  printf '%s\n' "$RESULT"
else
  printf '%s\n' "$RESULT" | python3 -c '
import json, sys
r = json.load(sys.stdin)
print("PASS" if r["passed"] else "FAIL")
for name, state in sorted(r["checks"].items()):
    print(f"  {state:8s} {name}")
for name, text in sorted(r.get("detail", {}).items()):
    print(f"  --- {name} ---"); print("  " + text.replace("\n", "\n  "))
'
fi
exit "$RC"
