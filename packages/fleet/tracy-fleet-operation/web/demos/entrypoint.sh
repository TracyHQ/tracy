#!/usr/bin/env bash
# The demo farm's PID 2 (compose runs it under `init: true`): php-fpm and Apache side by side, and
# the container ends when either does, so its restart policy brings both back together.
set -euo pipefail
mkdir -p /run/tracy-demos /tmp/tracy-demos
# The pool sockets' folder: Apache's user may enter it, no PHP worker (www-data) may (demos.Dockerfile).
chown root:farmhttp /run/tracy-demos
chown www-data:www-data /tmp/tracy-demos
chmod 0750 /run/tracy-demos
# Every pool's own temp/session directory (open_basedir lets a pool reach /tmp only through it).
for pool in /etc/tracy-demos/fpm/*.conf; do
  [ -e "$pool" ] || continue
  label="$(basename "$pool" .conf)"
  install -d -o www-data -g www-data -m 0700 "/tmp/tracy-demos/$label"
done
php-fpm -t
apache2ctl -t
# Debian's envvars is written for `sh` without -u; apache2 itself expects the dirs apache2ctl makes.
set +u
. /etc/apache2/envvars
set -u
mkdir -p "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR" "$APACHE_LOG_DIR"
chown "$APACHE_RUN_USER" "$APACHE_LOCK_DIR"
php-fpm --nodaemonize &
fpm=$!
apache2 -DFOREGROUND &
web=$!
trap 'kill -TERM "$web" "$fpm" 2>/dev/null; wait' TERM INT
wait -n "$fpm" "$web"
rc=$?
echo "tracy-demos: $( kill -0 "$fpm" 2>/dev/null && echo apache || echo php-fpm ) ended (exit $rc) — stopping the farm" >&2
kill -TERM "$web" "$fpm" 2>/dev/null || true
wait || true
exit 1
