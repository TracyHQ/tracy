#!/usr/bin/env bash
#
# Make one EXISTING site ready for the strict access plugins (P0). Idempotent: run it again and it
# changes nothing that is already right. Runs ON the host, as root (or the stand's own user locally).
#
#   secure-site-access.sh <label>
#
# Steps, in an order where the site never stops answering tracy-web:
#   1. a key, if the site has none (issue-site-access-key.sh; an existing key is kept);
#   2. tracy-web joins `<label>_default` with the alias `tracy-web` BEFORE the site leaves the shared
#      network, so the proxy and the mail URL work on both sides of the recreate;
#   3. the marker `<private dir>/network-isolated`, then a re-render (render-compose.sh), which drops
#      the shared network, points mail at `tracy-web`, and mounts the key directory read-only;
#   4. `docker compose up -d --force-recreate web`;
#   5. proof: the container reads `/run/tracy-access/key.json`, is not on the shared network, and
#      answers tracy-web by name; then `.site-access/<label>/ready.json` records kid and time.
# A failed proof exits non-zero and leaves the state file unwritten: the site is NOT ready, and the
# resync tools will not give it the strict plugin. Rollback: delete the marker, re-render, recreate.
#
# Upgrading the plugin itself is a separate, deliberate step: tools/resync-access-plugin.sh and
# tools/resync-joomla-access-plugin.sh, only for sites on the rollout list.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"
# shellcheck source=../lib/site-network.sh
. "$HERE/../lib/site-network.sh"

[ $# -eq 1 ] || { echo "use: secure-site-access.sh <label>" >&2; exit 2; }
LABEL="$1"
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || { echo "secure-site-access: not a site label: $LABEL" >&2; exit 2; }
SITE_DIR="$(tracy_private_dir "$LABEL")"
[ -d "$SITE_DIR" ] || { echo "secure-site-access: no site at $SITE_DIR" >&2; exit 1; }
say() { echo "secure-site-access: $LABEL: $*"; }

say "key: $(bash "$HERE/issue-site-access-key.sh" "$LABEL")"
tracy_join_site_network "$LABEL"
say "tracy-web joined ${LABEL}_default as tracy-web"

[ -f "$SITE_DIR/network-isolated" ] || : > "$SITE_DIR/network-isolated"
bash "$HERE/../provision/render-compose.sh" "$LABEL" --root "$TRACY_PRIVATE_ROOT" ${TRACY_RENDER_ARGS:-}
( cd "$SITE_DIR" && docker compose up -d --force-recreate web )

web="${LABEL}-web-1"
docker exec "$web" test -r /run/tracy-access/key.json || { say "NOT READY: the container cannot read its key"; exit 1; }
if tracy_site_on_shared_network "$LABEL"; then say "NOT READY: still on ${TRACY_SITE_NETWORK:-tracy_tracy}"; exit 1; fi
port=80
grep -q '4321' "$SITE_DIR/docker-compose.yml" && port=4321
code=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  code="$(docker exec "$(tracy_web_container)" node -e "fetch('http://${web}:${port}/',{redirect:'manual'}).then(r=>console.log(r.status)).catch(()=>console.log(0))" 2>/dev/null || echo 0)"
  [ "$code" != 0 ] && break
  sleep 3
done
[ "$code" != 0 ] || { say "NOT READY: tracy-web cannot reach $web:$port"; exit 1; }
kid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["kid"])' "$TRACY_PRIVATE_ROOT/.site-access/$LABEL/key.json")"
printf '{"v":1,"kid":"%s","isolated":true,"at":"%s"}\n' "$kid" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TRACY_PRIVATE_ROOT/.site-access/$LABEL/ready.json"
say "ready (kid $kid, tracy-web → $web:$port answered $code)"
