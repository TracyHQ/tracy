#!/usr/bin/env bash
#
# farm-forwarders — OPT-IN, ONE-TIME migration: restart every folded demo's forwarder (`<label>-web-1`,
# haproxy) that still runs an older config, so it runs the one this checkout renders
# (lib/demo-farm.sh `tracy_farm_forward_cfg`: health-gated, slot-aware).
#
#   farm-forwarders.sh [--root DIR]           list the forwarders that run an older config (changes nothing)
#   farm-forwarders.sh [--root DIR] --apply   restart them, one at a time
#
# ORDER ON A HOST THAT STILL RUNS THE PRE-SLOT FARM: this FIRST (`--apply`), then `farm-switch.sh`. A
# current-config forwarder works in front of the pre-slot farm; the old-config ones do not follow the
# switch. Visitor impact: one gap of ~0.3 s per demo, at its own restart (a request landing in it gets a
# 502 from cloudflared); the switch afterwards is invisible. Farm first would give each demo a reset
# window at the switch AND this gap afterwards. (docs/references/demo-farm.md)
#
# 🔒 NOT run by fold, unfold, deploy or the updater, and it must not be. A forwarder (`haproxy -db`) reads
# its config once, so moving it means a restart, and a restart is a gap of ~0.3 s in which that demo's
# published port refuses connections (measured: a local restart took 0.281 s) — cloudflared dials that
# port and does not retry, so a visitor in the gap sees a 502. Every forwarder gets the new config WITHOUT
# any gap at its own next re-create, which fold/unfold do while that demo is down anyway; until then it
# keeps working on the old config: it follows Docker's DNS to the farm web as before, so for it a farm
# switch behaves as it always did (a ~1 s outage), and it is not worse for sharing the host with
# new-config forwarders. Run --apply only when that is worth a sub-second gap per demo, at a quiet hour;
# it restarts one forwarder at a time and waits for each, and leaves a current one untouched.
#
# Takes the host's farm lock. Exit 1 when a forwarder did not come back on the new config.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

ROOT="$TRACY_PRIVATE_ROOT"; DRY=1
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --apply) DRY=0; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "use: farm-forwarders.sh [--root DIR] [--apply]" >&2; exit 2 ;;
  esac
done
TRACY_PRIVATE_ROOT="$ROOT"

# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"
# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"
# shellcheck source=farm-common.sh
. "$HERE/farm-common.sh"

CFG_IN_FORWARDER=/usr/local/etc/haproxy/haproxy.cfg
farm_lock
if [ "$DRY" = 0 ]; then farm_ensure_files; fi
CFG="$(tracy_demos_dir)/forward.haproxy.cfg"
[ -f "$CFG" ] || { echo "!! no $CFG — no farm on this host" >&2; exit 1; }
WANT="$(tracy_farm_forward_cfg)"

stale=0; moved=0; failed=0
while IFS= read -r label; do
  [ -n "$label" ] || continue
  name="${label}-web-1"
  docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null | grep -x true >/dev/null || { echo "   $label: no running forwarder $name — left alone"; continue; }
  if [ "$(docker exec "$name" cat "$CFG_IN_FORWARDER" 2>/dev/null)" = "$WANT" ]; then continue; fi
  stale=$((stale + 1))
  if [ "$DRY" = 1 ]; then echo "   $label: its forwarder runs an older config (--apply would restart $name, a gap of ~0.3 s)"; continue; fi
  docker restart -t 5 "$name" >/dev/null
  ok=0
  for _ in $(seq 1 20); do
    if [ "$(docker exec "$name" cat "$CFG_IN_FORWARDER" 2>/dev/null)" = "$WANT" ] \
       && docker inspect -f '{{.State.Running}}' "$name" | grep -x true >/dev/null; then ok=1; break; fi
    sleep 0.5
  done
  if [ "$ok" = 1 ]; then moved=$((moved + 1)); echo "   $label: forwarder restarted on the current config"
  else failed=$((failed + 1)); echo "!! $label: $name did not come back on the current config" >&2; fi
done <<<"$(tracy_farm_members)"

if [ "$DRY" = 1 ]; then echo "==> $stale forwarder(s) run an older config"; exit 0; fi
echo "==> $moved of $stale forwarder(s) moved to the current config, $failed failed"
[ "$failed" = 0 ]
