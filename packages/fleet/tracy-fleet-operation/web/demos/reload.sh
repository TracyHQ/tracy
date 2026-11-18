#!/usr/bin/env bash
# Pick up added, changed or removed demo vhosts and pools without dropping a request: both configs
# are tested first, and a refusal changes nothing that is running (scripts/lib/demo-farm.sh).
set -euo pipefail
for pool in /etc/tracy-demos/fpm/*.conf; do
  [ -e "$pool" ] || continue
  install -d -o www-data -g www-data -m 0700 "/tmp/tracy-demos/$(basename "$pool" .conf)"
done
php-fpm -t 2>&1 | grep -v 'test is successful' >&2 || true
php-fpm -t >/dev/null 2>&1 || { echo "tracy-demos: php-fpm refuses the new pools — nothing reloaded" >&2; exit 1; }
apache2ctl -t >/dev/null 2>&1 || { apache2ctl -t >&2 || true; echo "tracy-demos: apache refuses the new vhosts — nothing reloaded" >&2; exit 1; }
# USR2 = php-fpm re-reads its pools gracefully (running requests finish).
kill -USR2 "$(cat /run/php-fpm.pid)"
apache2ctl graceful
