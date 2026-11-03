#!/usr/bin/env bash
# Bring a site from "empty database" to "seeded, media in place, forms bound, agent token minted",
# or reconcile an existing one -- WITHOUT overwriting what editors did. Run from the template
# directory (or any copy of it) against a site that is already serving.
#
#   tools/bootstrap-site.sh [site-origin] [data-dir] [--config template.config.json] [--seed seed]
#     site-origin  default http://127.0.0.1:4360 · data-dir default ./data
#
# What happens, each step idempotent:
#   1. first-run seed (only when the site says needsSetup): `emdash seed` applies seed.json with content
#   2. tools/mint-admin.cjs (only when no token file yet)
#   3. seed-apply schema → content → media → forms → status
# Content written by step 1 is recognised by `content` (live == seed) and ADOPTED without a write.
# Anything else untracked, editor-changed or mid-draft is reported and left alone; this script
# never passes --force. Exit 3 = finished with entries that need a human decision.
set -euo pipefail
SITE="${1:-http://127.0.0.1:4360}"
DATA="${2:-./data}"
CONFIG="template.config.json"
SEED="seed"
for ((i = 3; i <= $#; i++)); do
  j=$((i + 1))
  case "${!i}" in --config) CONFIG="${!j}" ;; --seed) SEED="${!j}" ;; esac
done
TOKEN="$DATA/tracy-agent.token"
cd "$(dirname "$0")/.."
[ -f "$CONFIG" ] || { echo "!! no $CONFIG (template identity: title/tagline/locales/form bindings)" >&2; exit 1; }
TITLE="$(node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(c.site?.title||c.label||'Site')" "$CONFIG")"
TAGLINE="$(node -e "const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(c.site?.tagline||'')" "$CONFIG")"

echo "==> waiting for $SITE"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$SITE/_emdash/api/setup/status"; then break; fi
  sleep 2
done
status="$(curl -fsS "$SITE/_emdash/api/setup/status")"
case "$status" in
  *'"needsSetup":true'*)
    if [ -f "$DATA/data.db" ] && [ -x node_modules/.bin/emdash ]; then
      echo "==> first-run seed (schema + content) through the CLI: title=\"$TITLE\""
      # EmDash 1.0's POST /setup seeds within a per-request query budget, and every pass re-checks
      # what earlier passes created, so a seed of this size never finishes there (measured 29/09:
      # 2720 items, 33 passes, progress stalled near 717). The CLI runs the same engine (`applySeed`)
      # with no budget, straight into the site's database; mint-admin.cjs below closes the wizard.
      # Identity then comes from the seed's settings, so it must be the config's.
      node -e 'const [s,t,g]=process.argv.slice(1);const x=JSON.parse(require("fs").readFileSync(s,"utf8")).settings||{};if((x.title||"")!==t||(x.tagline||"")!==g){console.error(`!! ${s} settings say "${x.title}" / "${x.tagline}", template.config.json says "${t}" / "${g}"`);process.exit(1)}' "$SEED/seed.json" "$TITLE" "$TAGLINE"
      node_modules/.bin/emdash seed "$SEED/seed.json" --database "$DATA/data.db" --uploads-dir ./uploads --on-conflict skip
    else
      # No local database (a remote site): the setup route, posted again while it answers
      # `seedComplete:false` (items already created are skipped).
      echo "==> first-run setup (seed with content): title=\"$TITLE\""
      body="$(node -e 'const [t,g]=process.argv.slice(1);process.stdout.write(JSON.stringify({title:t,tagline:g,includeContent:true}))' "$TITLE" "$TAGLINE")"
      for pass in $(seq 1 200); do
        answer="$(curl -fsS -X POST "$SITE/_emdash/api/setup" -H 'content-type: application/json' -H 'X-EmDash-Request: 1' --data-binary "$body")"
        case "$answer" in
          *'"seedComplete":false'*) printf '    seed pass %s: %s\n' "$pass" "$(printf '%s' "$answer" | grep -o '"seedProgress":{[^}]*}')" ;;
          *) printf '%s\n' "${answer:0:300}"; break ;;
        esac
      done
      case "$answer" in
        *'"seedComplete":false'*) echo "!! setup seed still incomplete after $pass passes" >&2; exit 1 ;;
      esac
    fi
    ;;
  *) echo "==> setup already complete; reconciling without --force (editor content is kept)" ;;
esac

if [ ! -s "$TOKEN" ]; then
  echo "==> minting the agent admin + token"
  out="$(EMDASH_DB="$DATA/data.db" TRACY_OWNER_EMAIL="${TRACY_OWNER_EMAIL:-}" TRACY_OWNER_NAME="${TRACY_OWNER_NAME:-}" node tools/mint-admin.cjs)"
  case "$out" in
    TRACY_EMDASH_PAT=ec_pat_*) printf '%s\n' "${out#TRACY_EMDASH_PAT=}" > "$TOKEN"; chmod 600 "$TOKEN"; echo "    token saved to $TOKEN" ;;
    *) echo "!! mint failed: ${out:0:160}" >&2; exit 1 ;;
  esac
fi

common=(--site "$SITE" --token-file "$TOKEN" --receipts "$DATA/seed-receipts.json" --config "$CONFIG" --seed "$SEED")
rc=0
echo "==> schema";  node tools/seed-apply.mjs schema  "${common[@]}" || rc=$?
echo "==> content"; node tools/seed-apply.mjs content "${common[@]}" || rc=$?
echo "==> media";   node tools/seed-apply.mjs media   "${common[@]}" || rc=$?
echo "==> forms";   node tools/seed-apply.mjs forms   "${common[@]}" || rc=$?
echo "==> status";  node tools/seed-apply.mjs status  "${common[@]}"
if [ "$rc" = 3 ]; then
  echo "!! finished with entries that need a decision (see receipts.runs / the 'conflict' lines above)." >&2
  echo "   Review them; 'seed-apply adopt' claims untouched entries, '--force' overwrites -- neither runs by itself." >&2
fi
exit "$rc"
