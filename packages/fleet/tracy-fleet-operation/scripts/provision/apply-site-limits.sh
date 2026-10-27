#!/usr/bin/env bash
#
# apply-site-limits — put this host's resource caps on site containers that are ALREADY RUNNING,
# without recreating them.
#
#   apply-site-limits.sh [--apply] [--label <label>] [--root DIR]
#
# A dry run by default: for every site under the private root (or the one `--label` names) it
# prints each container's caps now and the caps this host gives a site, and changes nothing.
# `--apply` then runs, per container,
#
#   docker update --memory <m> --memory-swap <m> --cpus <c> --pids-limit <p> <label>-web-1
#
# (and the same on `<label>-db-1` for Joomla/WordPress). No restart, no recreate: the site keeps
# serving, and the cap holds from that second on.
#
# ## Why this exists beside render-compose.sh
#
# render-compose.sh writes the caps into every compose file it renders from 28/09/2026 on — every new
# site, and every re-render. A site running today keeps the container it was created with, and that
# container has no cap at all (measured on the stand: Memory=0 NanoCpus=0 PidsLimit=<none>). This is
# the step that closes the gap for them, with the SAME values: it sources render-compose.sh and asks
# `tracy_site_limits`, so the two cannot drift.
#
# ## How long it holds
#
# `docker update` writes the container's own HostConfig, so the caps survive `docker restart`, a
# daemon restart and a reboot. They do NOT survive a RECREATE (`docker compose up` after a compose
# change, `--force-recreate`, `enable-site-mail.sh`): a recreate builds the container from the compose
# file, and a file written before 28/09/2026 names no cap. Each line below says what the site's file
# holds; re-render the old ones (`render-compose.sh <label>`) so the next recreate keeps the caps.
#
# ## What it will not do
#
#   * cap a container it cannot tie to the site: `<label>-web-1` must carry compose's working_dir label
#     naming exactly this site's directory, or it is somebody else's and is left alone;
#   * lower a cap under memory the container is using NOW. The kernel meets a cap below live usage by
#     reclaiming, and past that by killing the biggest process in the container — an OOM kill on a
#     live site, caused by this script. A container using 90 % or more of its new cap is skipped and
#     named; run again when it is quieter, or raise the host's cap;
#   * guess a value: every cap comes from `tracy_site_limits` (the host's env, then
#     /etc/tracy/tracy-web.env, then the defaults), and a setting it refuses stops the run before any
#     container is looked at.
#
# Exit: 0 when every container found is capped (or would be, dry), 1 when an update failed, a
# container or site was skipped, or the host's settings are refused.
#
# ## Where to run it
#
#   on a fleet host:  /opt/tracy-fleet/provision/apply-site-limits.sh [--apply]
#   on a local stand: docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/apply-site-limits.sh [--apply]
#
# TRACY_DOCKER names the docker CLI (a test hands it a stub).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"

DOCKER="${TRACY_DOCKER:-docker}"
ROOT="$TRACY_PRIVATE_ROOT"; ONLY=""; APPLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --label) [ $# -ge 2 ] || { echo "--label needs a value" >&2; exit 2; }; ONLY="$2"; shift 2 ;;
    --root) [ $# -ge 2 ] || { echo "--root needs a value" >&2; exit 2; }; ROOT="$2"; shift 2 ;;
    *) echo "unknown argument: $1 — use: apply-site-limits.sh [--apply] [--label <label>] [--root DIR]" >&2; exit 2 ;;
  esac
done

# The same character rule as attach-site.sh and enable-site-mail.sh: a name that passes every
# character test while meaning something else in a path is refused before a path is built from it.
label_ok() {
  case "$1" in
    .|..|.*|*/*|*[!A-Za-z0-9._-]*|'') return 1 ;;
  esac
  return 0
}
if [ -n "$ONLY" ] && ! label_ok "$ONLY"; then echo "not a site label: $ONLY" >&2; exit 2; fi
[ -d "$ROOT" ] || { echo "no private root at $ROOT — pass --root" >&2; exit 2; }
ROOT="$(cd "$ROOT" && pwd)"

# The cores DOCKER has — what `docker update --cpus` is checked against, and on Docker Desktop not
# the same number as the machine this script runs on.
host_cpus="$("$DOCKER" info --format '{{.NCPU}}' 2>/dev/null || true)"
[[ "$host_cpus" =~ ^[1-9][0-9]*$ ]] || { echo "could not ask docker how many cores it has — is the daemon up?" >&2; exit 1; }
export TRACY_HOST_CPUS="$host_cpus"

# This host's caps, once, before any container is looked at: the knobs are per host, the only
# per-site difference is EmDash's own web memory. A refused setting stops the run here.
if ! tracy_site_limits wordpress; then
  echo "!! this host's cap settings are refused (above) — nothing was changed" >&2
  exit 1
fi
[ -z "$SITE_LIMIT_NOTE" ] || echo "$SITE_LIMIT_NOTE" >&2
PHP_WEB_MEMORY="$SITE_LIMIT_WEB_MEMORY"
DB_MEMORY="$SITE_LIMIT_DB_MEMORY"
if ! tracy_site_limits emdash; then
  echo "!! this host's cap settings are refused (above) — nothing was changed" >&2
  exit 1
fi
EMDASH_WEB_MEMORY="$SITE_LIMIT_WEB_MEMORY"
CPUS="$SITE_LIMIT_CPUS"
PIDS="$SITE_LIMIT_PIDS"
echo "==> this host's caps: web ${PHP_WEB_MEMORY} (EmDash ${EMDASH_WEB_MEMORY}), database ${DB_MEMORY}, ${CPUS} cores and ${PIDS} processes each${APPLY:+ — applying}"

# MiB a container uses now as `docker stats` counts it (cache it can drop straight away left out), or
# nothing when docker cannot say.
usage_mib() {
  local u
  u="$("$DOCKER" stats --no-stream --format '{{.MemUsage}}' "$1" 2>/dev/null | head -1 || true)"
  u="${u%% /*}"
  awk -v u="$u" 'BEGIN {
    n = u + 0
    if (u ~ /GiB$/) n = n * 1024
    else if (u ~ /KiB$/) n = n / 1024
    else if (u ~ /MiB$/) n = n
    else if (u ~ /^[0-9.]+B$/) n = n / 1048576
    else exit 1
    printf "%d", n
  }' 2>/dev/null || true
}

# A cap as docker's HostConfig holds it, for the report: bytes → `1536m`, nano-cores → `2`, 0 → none.
show_memory() { if [ "${1:-0}" -gt 0 ] 2>/dev/null; then printf '%sm' "$(($1 / 1048576))"; else printf 'none'; fi; }
show_cpus() { awk -v n="${1:-0}" 'BEGIN { if (n + 0 > 0) printf "%g", n / 1e9; else printf "none" }'; }
show_pids() { case "${1:-}" in ''|0|-1|'<nil>'|'<no value>') printf 'none' ;; *) printf '%s' "$1" ;; esac; }

# What the site's compose file says a recreate will do with these caps.
#   $1 compose file   $2 memory cap this service gets
compose_keeps() {
  if awk -v m="$2" -v c="$CPUS" -v p="$PIDS" '
      { L[NR] = $0 }
      END {
        for (i = 1; i + 3 <= NR; i++)
          if (L[i] == "    mem_limit: " m && L[i + 1] == "    memswap_limit: " m && L[i + 2] == "    cpus: " c && L[i + 3] == "    pids_limit: " p) exit 0
        exit 1
      }' "$1"; then
    printf 'its compose file names the same caps, so a recreate keeps them'
  elif grep -q '^    mem_limit: ' "$1"; then
    printf 'its compose file names other caps, which a recreate would put back — re-render it: render-compose.sh %s' "$LABEL_NOW"
  else
    printf 'its compose file predates the caps, so a recreate drops them — re-render it: render-compose.sh %s' "$LABEL_NOW"
  fi
}

INSPECT='{{index .Config.Labels "com.docker.compose.project.working_dir"}}|{{.State.Running}}|{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.PidsLimit}}'
total=0; capped=0; already=0; skipped=0; failed=0

# One container of one site: report, and with --apply cap it.
#   $1 container name   $2 memory cap (`1536m`)   $3 site dir
cap_container() {
  local name="$1" memory="$2" site="$3" facts dir running mem swap nano pids used mib want_mem want_nano keep
  facts="$("$DOCKER" inspect --format "$INSPECT" "$name" 2>/dev/null || true)"
  if [ -z "$facts" ]; then
    echo "  $name: no such container — nothing to cap"
    return 0
  fi
  total=$((total + 1))
  IFS='|' read -r dir running mem swap nano pids <<<"$facts"
  if [ "$dir" != "$site" ]; then
    echo "  $name: SKIPPED — compose says it belongs to ${dir:-no project}, not $site; left alone"
    skipped=$((skipped + 1))
    return 0
  fi
  mib="$(tracy_memory_mib "$memory")"
  want_mem=$((mib * 1048576))
  want_nano="$(awk -v c="$CPUS" 'BEGIN { printf "%.0f", c * 1e9 }')"
  keep="$(compose_keeps "$site/docker-compose.yml" "$memory")"
  local now="memory $(show_memory "$mem"), swap $(show_memory "$swap"), cpus $(show_cpus "$nano"), pids $(show_pids "$pids")"
  local want="memory ${memory}, swap ${memory}, cpus ${CPUS}, pids ${PIDS}"
  if [ "$mem" = "$want_mem" ] && [ "$swap" = "$want_mem" ] && [ "$nano" = "$want_nano" ] && [ "$pids" = "$PIDS" ]; then
    echo "  $name: already capped ($want); $keep"
    already=$((already + 1))
    return 0
  fi
  if [ "$running" = true ]; then
    used="$(usage_mib "$name")"
    if [ -z "$used" ]; then
      echo "  $name: SKIPPED — docker could not say how much memory it uses now, and a cap below that kills a process in it"
      skipped=$((skipped + 1))
      return 0
    fi
    if [ $((used * 10)) -ge $((mib * 9)) ]; then
      echo "  $name: SKIPPED — it uses ${used} MiB now, 90 % or more of the ${memory} cap; the kernel would kill a process in it to fit. Run again when it is quieter, or raise the host's cap"
      skipped=$((skipped + 1))
      return 0
    fi
  fi
  if [ -z "$APPLY" ]; then
    echo "  $name: would cap — now $now; would be $want; $keep"
    return 0
  fi
  if ! "$DOCKER" update --memory "$memory" --memory-swap "$memory" --cpus "$CPUS" --pids-limit "$PIDS" "$name" >/dev/null; then
    echo "  $name: FAILED — docker update refused (its message is above); nothing changed on it" >&2
    failed=$((failed + 1))
    return 0
  fi
  # Read back from docker, not assumed from the command: the answer is what the container now holds.
  IFS='|' read -r dir running mem swap nano pids <<<"$("$DOCKER" inspect --format "$INSPECT" "$name" 2>/dev/null || true)"
  if [ "$mem" = "$want_mem" ] && [ "$swap" = "$want_mem" ] && [ "$nano" = "$want_nano" ] && [ "$pids" = "$PIDS" ]; then
    echo "  $name: capped — $want (was $now); $keep"
    capped=$((capped + 1))
  else
    echo "  $name: FAILED — docker took the update but the container reads memory $(show_memory "$mem"), cpus $(show_cpus "$nano"), pids $(show_pids "$pids")" >&2
    failed=$((failed + 1))
  fi
}

found=0
for dir in "$ROOT"/*/; do
  LABEL_NOW="$(basename "$dir")"
  [ -z "$ONLY" ] || [ "$LABEL_NOW" = "$ONLY" ] || continue
  label_ok "$LABEL_NOW" || continue
  site="$ROOT/$LABEL_NOW"
  [ -f "$site/docker-compose.yml" ] || continue
  found=$((found + 1))
  # Asked in a subshell, so one site's platform or image cannot leak into the next site's answer:
  # `tracy_detect_platform` returns whatever PLATFORM already holds.
  if ! platform="$(
    SITE_DIR="$site" LABEL="$LABEL_NOW" PLATFORM="" COMPOSE_FLAVOR=unused
    tracy_read_existing_compose
    tracy_detect_platform
  )"; then
    echo "$LABEL_NOW: SKIPPED — its platform cannot be told from its .env, compose file or webroot"
    skipped=$((skipped + 1))
    continue
  fi
  echo "$LABEL_NOW ($platform):"
  if [ "$platform" = emdash ]; then
    cap_container "$LABEL_NOW-web-1" "$EMDASH_WEB_MEMORY" "$site"
  else
    cap_container "$LABEL_NOW-web-1" "$PHP_WEB_MEMORY" "$site"
    cap_container "$LABEL_NOW-db-1" "$DB_MEMORY" "$site"
  fi
done

if [ -n "$ONLY" ] && [ "$found" = 0 ]; then
  echo "no site $ONLY under $ROOT (no docker-compose.yml there)" >&2
  exit 1
fi
[ -n "$APPLY" ] || echo "(dry run — nothing changed; --apply to cap the containers above)"
echo "==> $total container(s): $capped capped, $already already capped, $skipped skipped, $failed failed"
[ "$failed" = 0 ] && [ "$skipped" = 0 ]
