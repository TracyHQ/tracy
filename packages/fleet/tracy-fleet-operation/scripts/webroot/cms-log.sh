#!/usr/bin/env bash
# Read a CMS's own admin log after a cursor, inside the site's container, as its unprivileged user
# (tracy-host job `cms-log-pull`, apps/tracy-host/src/cms-log.js). SELECT only; the adapter prints
# one JSON line, the host maps it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../lib/roots.sh"
LABEL=''
PLATFORM=''
CURSOR=''
SINCE=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --cursor) CURSOR="$2"; shift 2 ;;
    # EmDash only: the publish-state mark of the last pull (apps/tracy-host/src/cms-log.js).
    --since) SINCE="$2"; shift 2 ;;
    *) exit 2 ;;
  esac
done
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || exit 2
[[ "$CURSOR" =~ ^[0-9A-Za-z_-]{0,100}$ ]] || exit 2
[[ -z "$SINCE" || "$SINCE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$ ]] || exit 2
# A demo folded into the demo farm (lib/site-runtime.sh): its PHP is its pool's in the farm, run as
# the demo itself, with its files at the farm docroot (TRACY_DOCROOT tells the readers).
. "$HERE/../lib/site-runtime.sh"
RUNTIME="$(tracy_site_runtime "$LABEL")" || exit 1
if [[ "$RUNTIME" == farm ]]; then
  DOCROOT="$(tracy_farm_docroot "$LABEL")"
  [[ "$PLATFORM" == joomla || "$PLATFORM" == wordpress ]] || { echo "platform mismatch: $PLATFORM"; exit 3; }
  tracy_site_web_exec "$LABEL" -- test -f "$DOCROOT/$([[ "$PLATFORM" == wordpress ]] && echo wp-load.php || echo configuration.php)" \
    || { echo "platform mismatch: $PLATFORM"; exit 3; }
  tracy_site_web_exec "$LABEL" -i -e TRACY_CMS_LOG_CURSOR="$CURSOR" -e TRACY_DOCROOT="$DOCROOT" -- php < "$HERE/cms-log-$PLATFORM.php"
  exit
fi
CONTAINER="$(docker compose -f "$(tracy_compose_file "$LABEL")" ps -q web)"
[[ -n "$CONTAINER" && "$CONTAINER" != *$'\n'* ]] || exit 1
# The platform the caller names must be the one the container's own files say: a mismatch reads
# nothing rather than running one CMS's reader against another's database.
if docker exec "$CONTAINER" test -f /var/www/html/wp-load.php; then
  [[ "$PLATFORM" == wordpress ]] || { echo "platform mismatch: wordpress"; exit 3; }
  docker exec -i -u www-data -e TRACY_CMS_LOG_CURSOR="$CURSOR" "$CONTAINER" php < "$HERE/cms-log-wordpress.php"
elif docker exec "$CONTAINER" test -f /var/www/html/configuration.php; then
  [[ "$PLATFORM" == joomla ]] || { echo "platform mismatch: joomla"; exit 3; }
  docker exec -i -u www-data -e TRACY_CMS_LOG_CURSOR="$CURSOR" "$CONTAINER" php < "$HERE/cms-log-joomla.php"
else
  [[ "$PLATFORM" == emdash ]] || { echo "platform mismatch: emdash"; exit 3; }
  # Keep experimental SQLite notices out of the job's final JSON protocol line.
  docker exec -i -u www-data -w /app -e TRACY_CMS_LOG_CURSOR="$CURSOR" \
    -e TRACY_CMS_LOG_SINCE="$SINCE" "$CONTAINER" \
    node --no-warnings --input-type=module - < "$HERE/cms-log-emdash.mjs"
fi
