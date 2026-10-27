#!/usr/bin/env bash
# Stock entrypoint for a quickstart package that ships none — copied to tools/docker-entrypoint.sh
# by quickstart-restore.sh#emdash_complete_source, and only when that path is empty.
#
# The two site directories are volumes mounted by the host as root; the site itself runs as
# www-data so its agent's `docker exec -u www-data` can write what the site writes. Hand them over,
# then drop privileges once. Under a non-root user (a local `docker run -u`) there is nothing to
# hand over, so just run.
set -euo pipefail
cd /app
mkdir -p data uploads
if [ "$(id -u)" = 0 ]; then
  chown -R www-data:www-data data uploads
  exec gosu www-data "$@"
fi
exec "$@"
