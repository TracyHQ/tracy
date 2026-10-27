#!/usr/bin/env bash
# Read a fixed public subset inside the site's own container as its unprivileged user.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../lib/roots.sh"
LABEL=''
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --op) [[ "$2" == read ]] || exit 2; shift 2 ;;
    *) exit 2 ;;
  esac
done
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || exit 2
CONTAINER="$(docker compose -f "$(tracy_compose_file "$LABEL")" ps -q web)"
[[ -n "$CONTAINER" && "$CONTAINER" != *$'\n'* ]] || exit 1
# Both PHP platforms are detected from their own files, not from caller input.
if docker exec "$CONTAINER" test -f /var/www/html/wp-load.php; then
  docker exec -i -u www-data "$CONTAINER" php < "$HERE/settings-wordpress.php"
elif docker exec "$CONTAINER" test -f /var/www/html/configuration.php; then
  docker exec -i -u www-data "$CONTAINER" php < "$HERE/settings-joomla.php"
else
  # Keep experimental SQLite notices out of the job's final JSON protocol line.
  docker exec -i -u www-data -w /app "$CONTAINER" node --no-warnings --input-type=module - < "$HERE/settings-emdash.mjs"
fi
