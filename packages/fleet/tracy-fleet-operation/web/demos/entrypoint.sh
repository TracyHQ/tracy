#!/usr/bin/env bash
# The demo farm's PID 2 (compose runs it under `init: true`): php-fpm and Apache side by side, and
# the container ends when either does, so its restart policy brings both back together.
set -euo pipefail
mkdir -p /run/tracy-demos /tmp/tracy-demos /run/tracy-demos-ready
# The ready marker's folder (scripts/provision/farm-common.sh `farm_mark_ready`): Apache's health vhost
# serves /tracy-ready from it. A fresh container is NOT ready until the switcher says so; a RESTARTED one
# (reboot, crash) keeps its marker, so the slot that served still serves.
chmod 0755 /run/tracy-demos-ready
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
# 🔒 A stop is a DRAIN, not a kill: the farm is re-created whenever a demo joins or leaves, and every
# other demo is being served at that moment. Apache first — SIGWINCH = graceful-stop: it closes its
# listeners at once and lets every request it already took finish (GracefulShutdownTimeout in
# apache-farm.conf bounds it) — and php-fpm only once Apache is gone — SIGQUIT = graceful: workers
# finish their request. The compose service's stop_grace_period outlasts both (lib/demo-farm.sh);
# and the switcher has already taken the slot out of every forwarder before it asks for this stop
# (provision/farm-common.sh `farm_switch`), so no new connection arrives while it drains.
drain() {
  trap '' TERM INT QUIT
  kill -WINCH "$web" 2>/dev/null || true
  wait "$web" 2>/dev/null || true
  kill -QUIT "$fpm" 2>/dev/null || true
  wait "$fpm" 2>/dev/null || true
  exit 0
}
# TERM is what compose's stop sends; INT and QUIT (the base image's own STOPSIGNAL) mean the same.
trap drain TERM INT QUIT
rc=0
wait -n "$fpm" "$web" || rc=$?
echo "tracy-demos: $( kill -0 "$fpm" 2>/dev/null && echo apache || echo php-fpm ) ended (exit $rc) — stopping the farm" >&2
kill -TERM "$web" "$fpm" 2>/dev/null || true
wait || true
exit 1
