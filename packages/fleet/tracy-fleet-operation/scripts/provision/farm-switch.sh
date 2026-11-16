#!/usr/bin/env bash
#
# farm-switch — move the demo farm's web to what this checkout says (a new DEMOS_IMAGE tag after a
# deploy, new limits), with no folded demo's request failing through a forwarder on the current config:
# the farm's compose and pools are written again, both configs are tested in a throwaway container, and
# the web is replaced blue/green (farm-common.sh `farm_switch`). A farm that is already on what the
# checkout renders only reloads; one of the kind that came before slots is replaced by slot `a`.
#
#   farm-switch.sh [--root DIR]
#
# FIRST MOVE OF A HOST THAT STILL RUNS THE PRE-SLOT FARM: run `farm-forwarders.sh --apply` BEFORE this.
# Forwarders on the old config keep sending new connections to the old container until it is gone — each
# demo then has a reset/502 window — while a forwarder on the current config is told by the old
# container's 410 on /tracy-ready to stop, and sees no gap at all. Forwarders first = ONE ~0.3 s gap per
# demo (the restart); this script then changes nothing a visitor can see. (docs/references/demo-farm.md)
#
# The deploy does NOT build the new farm image (it only warns when it is missing) and does not call
# this: until the new tracy-host serves, its scripts are the old ones. Run it after the deploy, inside
# tracy-host (`docker exec tracy-tracy-host-1 bash /opt/tracy-fleet/provision/farm-switch.sh`), or let
# the next fold/unfold/farm-refresh do it (they end in the same switch). Whichever runs first builds a
# missing farm image itself (minutes) — or dispatch `build-app-images` with `build_web_images=<host>`
# beforehand.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

ROOT="$TRACY_PRIVATE_ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    *) echo "use: farm-switch.sh [--root DIR]" >&2; exit 2 ;;
  esac
done
TRACY_PRIVATE_ROOT="$ROOT"

# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"
# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"
# shellcheck source=farm-common.sh
. "$HERE/farm-common.sh"

farm_lock
DIR="$(tracy_demos_dir)"
[ -f "$DIR/compose.yml" ] || { echo "==> no demo farm on this host — nothing to switch"; exit 0; }
farm_ensure_files
farm_render || { echo "!! the farm's files could not be written again — nothing was changed" >&2; exit 1; }
farm_config_test || { echo "!! the config test fails — the farm serves as before" >&2; exit 1; }
farm_apply >/dev/null
echo "==> the farm web is $(tracy_farm_web), on $(docker inspect -f '{{.Config.Image}}' "$(tracy_farm_web)")"
