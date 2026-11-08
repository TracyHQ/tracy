#!/usr/bin/env bash
set -euo pipefail
cd /app
mkdir -p data uploads
if [ "$(id -u)" = 0 ]; then
  # Only this site's mounted state, not the host's shared site root.
  chown -R www-data:www-data data uploads
  exec gosu www-data "$@"
fi
exec "$@"
