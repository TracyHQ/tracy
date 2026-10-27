#!/usr/bin/env bash
# Run flow D cases on ONE site with bench's run3.mjs, from the runner farm (HERE = runner/: its own cookie.txt and
# sites-v6.json), with the D snapshot store. One site at a time per CMS; never while site creation is being timed.
#   ./run-d.sh <label> <P0|P1|all|ID,ID,…> [out-name] [more run3 args…]
#   ./run-d.sh benchwpapply01 P0                  → out-benchwpapply01-base/  (+ out-benchwpapply01-base.log)
#   ./run-d.sh benchwpapply01 M-D-second-language smoke --timeout-min 15
# The case list comes from cases-d-<cms>.json (build-suite.mjs) and the tiers of tc/cases/*.mjs.
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
label="${1:?label}" pick="${2:?P0|P1|all|ids}" name="${3:-base}"
shift $(( $# >= 3 ? 3 : $# ))
cms=$(docker exec tracy-postgres-1 psql -U tracy -d tracy -Atc "select platform from site where label='$label'")
case "$cms" in wordpress | joomla | emdash) ;; *) echo "$label: not in the site book (platform '$cms')" >&2; exit 1 ;; esac
suite="$D/cases-d-$cms.json"
[ -f "$suite" ] || { echo "no $suite: run build-suite.mjs $cms $label first" >&2; exit 1; }
[ -s "$D/runner/cookie.txt" ] || { echo "no runner/cookie.txt: run ./mint-cookie.sh" >&2; exit 1; }
[ -d "${BENCH_SNAP:-$HOME/tracy-bench-snap-apply}/$label" ] || { echo "no snapshot of $label in ${BENCH_SNAP:-$HOME/tracy-bench-snap-apply}: run runner/snap.sh save first" >&2; exit 1; }
ids=$(cd "$D" && node --input-type=module -e "
import { readFileSync } from 'node:fs'
import { loadAll } from '../../tc/lib.mjs'
const suite = JSON.parse(readFileSync('$suite', 'utf8'))
if (!suite.sites['$label']) { console.error('$label is not in cases-d-$cms.json'); process.exit(1) }
const pick = '$pick'
const tier = Object.fromEntries((await loadAll()).cases.map((c) => [c.id, c.tier]))
const all = suite.cases.map((c) => c.id)
const want = pick === 'all' ? all : /^P[01]\$/.test(pick) ? all.filter((id) => tier[id] === pick) : pick.split(',')
const unknown = want.filter((id) => !all.includes(id))
if (unknown.length) { console.error('not in the suite: ' + unknown.join(',')); process.exit(1) }
console.log(want.join(','))")
out="$D/out-$label-$name"
mkdir -p "$out"
echo "$label ($cms): $(echo "$ids" | tr ',' '\n' | wc -l | tr -d ' ') cases → $out"
# NODE_OPTIONS, not command-line flags: run3 spawns `node runner/trace.mjs <case>` and snap.sh spawns `node -e`; only
# NODE_OPTIONS reaches them (with flags alone trace.mjs's main block never runs and no trace.json is written).
# The lock dir stays in the farm; set RESTORE_LOCK=1 RESTORE_LOCK_DIR=… yourself to share bench/.locks with other runners.
cd "$D"
NODE_OPTIONS="--preserve-symlinks --preserve-symlinks-main" BENCH_SNAP="${BENCH_SNAP:-$HOME/tracy-bench-snap-apply}" \
  node runner/run3.mjs "$label" "$out" "$ids" --suite "../cases-d-$cms.json" --timeout-min 12 --trace "$@" 2>&1 | tee "$out.log"
