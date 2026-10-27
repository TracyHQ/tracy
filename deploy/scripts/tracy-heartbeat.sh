#!/usr/bin/env bash
#
# tracy-heartbeat - tell the master this shard is alive, what it runs and how full it is, and keep
# the master's answer for tracy-updater.sh. Every 60 s from tracy-heartbeat.timer (spec section 5).
#
#   tracy-heartbeat.sh [--dry-run]
#
# One run, at most ~25 s (curl timeouts below; the unit stops it at 50 s):
#   1. HOST_NAME, TRACY_ORIGIN, MASTER_ORIGIN, SHARD_SECRET, WEB_PORT, APP_IMAGE_TAG from
#      /etc/tracy/tracy-web.env; DSH_IMAGE_TAG from /etc/tracy/host-dsh.env.
#   2. GET /_shard/status of this shard's tracy-web over the VM's loopback, signed with SHARD_SECRET
#      and the method GET (W2; docs/sre/hop-dong-cua-shard.md sections 2 and 6):
#      {sites, releases_read_at, migration_head, accepting}. No answer: those four are sent as null.
#   3. /proc/meminfo, df, /proc/loadavg, the updater's marker and result, the last backup push.
#   4. POST <MASTER_ORIGIN>/api/shards/<name>/check, signed with SHARD_SECRET and the method POST
#      (W1). The body is contract section 7, field for field: what cannot be read is null, never
#      left out; last_update.web_images_missing is a boolean; last_backup is {at, ok}.
#   5. A 200 whose body is a real answer becomes /var/lib/tracy/desired.json: the WHOLE answer plus
#      received_at (contract section 7). A real answer is an object with a boolean hold, each tag an
#      image tag or null, both tags present unless it holds (TAG_UNKNOWN holds with null tags, and
#      is kept), granted_until a string or null. Anything else leaves desired.json as it was: a
#      Cloudflare error page answered 200 is not an order.
#   6. Tags differ, hold is false, the master granted an update slot (granted_until set), no update
#      running: `systemctl start --no-block tracy-updater.service`, so an app-only change lands
#      within its SLA (10 min) instead of waiting up to 5 min for the updater's own timer. The
#      updater itself checks that the slot has not ended.
#   Always records /var/lib/tracy/heartbeat.json {code, at, epoch}; check-shard.sh reads it.
#   A 403 names its `why` (contract section 2); `clock` means check chrony. The next beat, 60 s on,
#   is the retry; a shard silent for 3 min is the master's alarm.
#
# IT NEVER WAITS ON THE UPDATER and takes no lock the updater takes: "updating" is read from the
# updater's marker file and whether the PID in it is alive. A shard in the middle of a 20-minute dsh
# drain keeps reporting, which is how the master counts K = 2 updates at once and sees one hang.
#
# Overrides (all optional; with none set this is the plain dedicated-shard behaviour):
#   TRACY_WEB_ENV, TRACY_DSH_ENV, TRACY_STATE_DIR   the env files and the state directory. Supported
#                                                   for a second stack on one host (a trial shard
#                                                   co-hosted with the master), and used by the tests.
#   TRACY_COMPOSE_PROJECT   compose project of THIS shard's app stack, default `tracy`: the
#                           label filter that finds the running tracy-host container (source_commit).
#   TRACY_UPDATER_UNIT      the updater unit to start, default `tracy-updater.service`.
#   Test only: TRACY_MEMINFO, TRACY_LOADAVG, TRACY_STATUS_ORIGIN, TRACY_NO_KICK=1 (print "would
#   start" instead of calling systemctl).
#
# Exit 0 whatever the master answered (a missing heartbeat is the MASTER's alarm, spec 5); exit 1
# only when this VM is misconfigured. Prints no secret; the signature it prints in --dry-run is not one.
set -euo pipefail

WEB_ENV="${TRACY_WEB_ENV:-/etc/tracy/tracy-web.env}"
DSH_ENV="${TRACY_DSH_ENV:-/etc/tracy/host-dsh.env}"
STATE_DIR="${TRACY_STATE_DIR:-/var/lib/tracy}"
MEMINFO="${TRACY_MEMINFO:-/proc/meminfo}"
LOADAVG="${TRACY_LOADAVG:-/proc/loadavg}"
COMPOSE_PROJECT="${TRACY_COMPOSE_PROJECT:-tracy}"
UPDATER_UNIT="${TRACY_UPDATER_UNIT:-tracy-updater.service}"
STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAG_RE='^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
DRY_RUN=0
SHARD_SECRET=""

# Same reading as deploy-tracy-stack.sh:177: an inline comment and surrounding quotes are not part of the value.
read_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d '"'"'"'\r' || true; }
num_or_null() { case "${1:-}" in ''|*[!0-9.]*) echo null ;; *) echo "$1" ;; esac; }
json_or_null() { [ -f "$1" ] && jq -ce "$2" "$1" 2>/dev/null || echo null; }

# signed_curl <GET|POST> <origin> <path> <body file or ''> <max seconds> <out file> <Host header or ''> -> HTTP code
# The method is signed as well as sent (contract section 2): the two must be the same word.
signed_curl() {
  local method="$1" origin="$2" path="$3" body="$4" max="$5" out="$6" host="$7" headers line code
  local -a args=(-sS -o "$out" -w '%{http_code}' --max-time "$max")
  headers="$(SHARD_SECRET="$SHARD_SECRET" bash "$STACK_DIR/shard-sign.sh" --method "$method" "$path" ${body:+"$body"} 2>/dev/null)" || { echo 000; return 0; }
  while IFS= read -r line; do [ -z "$line" ] || args+=(-H "$line"); done <<<"$headers"
  [ -z "$host" ] || args+=(-H "Host: $host")
  [ -z "$body" ] || args+=(-X POST -H 'content-type: application/json' --data-binary "@$body")
  code="$(curl "${args[@]}" "$origin$path" 2>/dev/null || true)"
  printf '%s' "${code:-000}"
}

mem_available_mb() { [ -r "$MEMINFO" ] && awk '/^MemAvailable:/ {print int($2 / 1024)}' "$MEMINFO" || true; }
disk_free_mb() { local p=/var/lib/docker; [ -d "$p" ] || p=/; df -Pm "$p" 2>/dev/null | awk 'NR == 2 {print $4}' || true; }
load1() { [ -r "$LOADAVG" ] && awk '{print $1}' "$LOADAVG" || true; }
updater_version() { [ -f "$STACK_DIR/tracy-updater.sh" ] && openssl dgst -sha256 < "$STACK_DIR/tracy-updater.sh" | awk '{print substr($NF, 1, 12)}' || true; }

# The commit the running tracy-host image was built from (W5 P4 stamps TRACY_SOURCE_COMMIT).
# The compose project label is TRACY_COMPOSE_PROJECT (default `tracy`): a co-hosted second stack
# has its own project, and the master's tracy-host must not be read in its place.
source_commit() {
  command -v docker >/dev/null 2>&1 || return 0
  local cid
  cid="$(docker ps -q --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" --filter label=com.docker.compose.service=tracy-host 2>/dev/null | sed -n 1p || true)"
  [ -n "$cid" ] || return 0
  docker inspect "$cid" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^TRACY_SOURCE_COMMIT=//p' | sed -n 1p || true
}

# true only while the updater that wrote the marker is alive: a crashed run leaves a stale file.
updating() {
  local pid
  pid="$(jq -r '.pid // empty' "$STATE_DIR/updating.json" 2>/dev/null || true)"
  case "$pid" in ''|*[!0-9]*) echo false; return 0 ;; esac
  if kill -0 "$pid" 2>/dev/null; then echo true; else echo false; fi
}

# A real answer of the master (contract section 7): an object with a boolean hold, each tag an image
# tag or null, both tags present unless it holds (TAG_UNKNOWN: hold true, null tags), and
# granted_until an ISO string or null.
valid_answer() {
  jq -e --arg re "$TAG_RE" '
    def tag_or_null: . == null or (type == "string" and test($re));
    type == "object"
    and (.hold | type == "boolean")
    and (.app_tag | tag_or_null) and (.dsh_tag | tag_or_null)
    and (.hold or ((.app_tag | type == "string") and (.dsh_tag | type == "string")))
    and (.granted_until == null or (.granted_until | type == "string"))' "$1" >/dev/null 2>&1
}

record() {
  jq -nc --arg code "$1" --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --argjson epoch "$(date +%s)" \
    '{code: $code, at: $at, epoch: $epoch}' > "$STATE_DIR/heartbeat.json.tmp"
  mv -f "$STATE_DIR/heartbeat.json.tmp" "$STATE_DIR/heartbeat.json"
}

# kick_updater <running app tag> <running dsh tag>
# Only inside a slot the master granted (granted_until set); tracy-updater.sh checks it has not ended.
kick_updater() {
  jq -e --arg app "$1" --arg dsh "$2" \
    '(.hold | not) and (.granted_until != null) and (.app_tag != $app or .dsh_tag != $dsh)' \
    "$STATE_DIR/desired.json" >/dev/null 2>&1 || return 0
  [ "$(updating)" = false ] || return 0
  if [ "${TRACY_NO_KICK:-0}" = 1 ]; then echo "tracy-heartbeat: would start $UPDATER_UNIT (TRACY_NO_KICK=1)"; return 0; fi
  if systemctl start --no-block --no-ask-password "$UPDATER_UNIT" >/dev/null 2>&1; then
    echo "tracy-heartbeat: started $UPDATER_UNIT"
  fi
}

main() {
  case "${1:-}" in
    '') ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; return 0 ;;
    *) echo "tracy-heartbeat: unknown argument $1" >&2; return 2 ;;
  esac
  # `work` is NOT local: the EXIT trap reads it after this function has returned (set -u).
  local tool name origin master web_port app_tag dsh_tag code status why
  for tool in curl jq openssl; do command -v "$tool" >/dev/null || { echo "tracy-heartbeat: $tool is required" >&2; return 1; }; done
  [ -r "$WEB_ENV" ] || { echo "tracy-heartbeat: cannot read $WEB_ENV" >&2; return 1; }
  name="$(read_env "$WEB_ENV" HOST_NAME)"
  origin="$(read_env "$WEB_ENV" TRACY_ORIGIN)"
  master="$(read_env "$WEB_ENV" MASTER_ORIGIN)"; master="${master%/}"
  SHARD_SECRET="$(read_env "$WEB_ENV" SHARD_SECRET)"
  web_port="$(read_env "$WEB_ENV" WEB_PORT)"; web_port="${web_port:-51710}"
  if [ -z "$name" ] || [ -z "$master" ] || [ -z "$SHARD_SECRET" ]; then
    echo "tracy-heartbeat: $WEB_ENV needs HOST_NAME, MASTER_ORIGIN and SHARD_SECRET" >&2
    return 1
  fi
  case "$master" in https://*|http://127.0.0.1:*) ;; *) echo "tracy-heartbeat: MASTER_ORIGIN must be https:// (got $master)" >&2; return 1 ;; esac
  app_tag="$(read_env "$WEB_ENV" APP_IMAGE_TAG)"
  dsh_tag="$(read_env "$DSH_ENV" DSH_IMAGE_TAG)"
  work="$(mktemp -d "${TMPDIR:-/tmp}/tracy-heartbeat.XXXXXX")"
  trap 'rm -rf "$work"' EXIT

  code="$(signed_curl GET "${TRACY_STATUS_ORIGIN:-http://127.0.0.1:$web_port}" /_shard/status '' 5 "$work/status" "${origin#*://}")"
  status=null
  if [ "$code" = 200 ]; then
    # select(): a body that is not an object yields nothing, so json_or_null prints one `null`.
    status="$(json_or_null "$work/status" 'select(type == "object") | {sites, releases_read_at, migration_head, accepting}')"
  fi

  # Contract section 7, in its order. Fields are read with `.key`, never `.key // null`: jq's `//`
  # also replaces false, and `accepting: false` / `ok: false` must reach the master as false.
  jq -nc \
    --arg app_tag "$app_tag" --arg dsh_tag "$dsh_tag" --arg source_commit "$(source_commit)" \
    --arg updater_version "$(updater_version)" --argjson status "$status" \
    --argjson mem "$(num_or_null "$(mem_available_mb)")" --argjson disk "$(num_or_null "$(disk_free_mb)")" \
    --argjson load "$(num_or_null "$(load1)")" --argjson updating "$(updating)" \
    --argjson last "$(json_or_null "$STATE_DIR/updater.json" 'select(type == "object") | {app_tag, dsh_tag, ok, finished_at, log_tail, web_images_missing: ((.web_images_missing // []) | if type == "array" then length > 0 else . == true end)}')" \
    --argjson backup "$(json_or_null "$STATE_DIR/backup-r2.json" 'select(type == "object") | {at: .finished_at, ok}')" \
    '($status // {}) as $s
     | {app_tag: (if $app_tag == "" then null else $app_tag end),
        dsh_tag: (if $dsh_tag == "" then null else $dsh_tag end),
        source_commit: (if $source_commit == "" then null else $source_commit end),
        updater_version: $updater_version,
        sites: $s.sites, mem_available_mb: $mem, disk_free_mb: $disk, load1: $load,
        releases_read_at: $s.releases_read_at, migration_head: $s.migration_head, accepting: $s.accepting,
        updating: $updating, last_update: $last, last_backup: $backup}' > "$work/body"

  if [ "$DRY_RUN" = 1 ]; then
    echo "tracy-heartbeat (dry run): /_shard/status answered $code; would POST $master/api/shards/$name/check with:"
    jq . "$work/body"
    SHARD_SECRET="$SHARD_SECRET" bash "$STACK_DIR/shard-sign.sh" --method POST "/api/shards/$name/check" "$work/body" | sed 's/^/  /'
    return 0
  fi

  code="$(signed_curl POST "$master" "/api/shards/$name/check" "$work/body" 15 "$work/answer" '')"
  mkdir -p "$STATE_DIR"
  record "$code"
  if [ "$code" = 200 ] && valid_answer "$work/answer"; then
    # The whole answer, as the master sent it, plus when it came (contract section 7).
    jq -c --argjson now "$(date +%s)" '. + {received_at: $now}' "$work/answer" > "$STATE_DIR/desired.json.tmp"
    mv -f "$STATE_DIR/desired.json.tmp" "$STATE_DIR/desired.json"
    echo "tracy-heartbeat: master 200; runs app ${app_tag:-<none>} dsh ${dsh_tag:-<none>}; master wants $(jq -r '(.app_tag // "<none>") + " / " + (.dsh_tag // "<none>") + (if .hold then " (hold: " + (.reason // "no reason") + ")" else "" end) + (if .granted_until then " (slot until " + .granted_until + ")" else "" end)' "$STATE_DIR/desired.json")"
    kick_updater "$app_tag" "$dsh_tag"
  else
    why="$(jq -r '.why // empty' "$work/answer" 2>/dev/null || true)"
    echo "tracy-heartbeat: master answered $code${why:+ (why: $why)}$( [ "$code" != 200 ] || echo ' with a body that is not an answer'); desired state left as it was"
  fi
  return 0
}

main "$@"; exit $?
