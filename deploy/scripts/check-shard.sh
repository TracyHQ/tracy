#!/usr/bin/env bash
#
# check-shard - what a shard must hold that check-server.sh does not look at. Read-only.
#
#   check-shard.sh [--before-registration]
#
# check-server.sh still runs on a shard and still matters (the stack is healthy, the lines inside
# tracy-web reach tracy-host and dsh, the seat secret matches, dsh has its model key). Two of its
# answers mislead on a shard: step 11 calls a 404 "the route reaches this cluster" whenever a
# cloudflared runs here (check-server.sh:347-358), but *.<zone> is s0's on a shard, so that 404 is
# the master's; and step 13 reads the master's docs host. This file asks instead:
#
#   1  TRACY_DEPLOYMENT_ROLE=shard, and none of the forbidden variables (shard-env-check.sh)
#   2  nginx on 127.0.0.1:<TRACY_NGINX_PORT, default 80> answers with THIS shard's /api/config
#   3  https://<name>.<zone>/api/config, through Cloudflare and the tunnel, names THIS shard's origin
#   4  the master accepted a heartbeat in the last 180 s (--before-registration: a note, not red)
#   5  inbound firewall: TRACY-INPUT hooked into INPUT and open to tracy-web on 51720, or
#      FIREWALL_MODE=cloud said out loud
#   6  chrony is synchronised (the HMAC window is 120 s, apps/tracy-host/src/auth.js:22)
#   7  cloudflared (an active systemd unit OR a running container whose name matches cloudflared,
#      as check-server.sh:425-426 reads it) and the three timers are active
#
# Every check runs; exit 1 if any is red. Prints no secret.
#
# A second stack on one host (the co-hosted trial shard) points this at its own side:
#   TRACY_WEB_ENV        its tracy-web.env             (default /etc/tracy/tracy-web.env)
#   TRACY_INSTALL_ENV    its shard-install.env         (default /etc/tracy/shard-install.env)
#   TRACY_STATE_DIR      its state directory           (default /var/lib/tracy)
#   TRACY_NGINX_PORT     the loopback port its nginx publishes (default 80)
#   TRACY_UNIT_PREFIX    prefix of its three timer units, <prefix>heartbeat.timer,
#                        <prefix>updater.timer, <prefix>backup-postgres.timer (default tracy-)
#   TRACY_COMPOSE_PROJECT only names the nginx container in a fix hint (default tracy)
# Unset, every check is the one a master-style shard runs.
set -uo pipefail

WEB_ENV="${TRACY_WEB_ENV:-/etc/tracy/tracy-web.env}"
INSTALL_ENV="${TRACY_INSTALL_ENV:-/etc/tracy/shard-install.env}"
STATE_DIR="${TRACY_STATE_DIR:-/var/lib/tracy}"
NGINX_PORT="${TRACY_NGINX_PORT:-80}"
UNIT_PREFIX="${TRACY_UNIT_PREFIX:-tracy-}"
COMPOSE_PROJECT="${TRACY_COMPOSE_PROJECT:-tracy}"
STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BEFORE_REGISTRATION=0
FAILED=0

case "${1:-}" in
  '') ;;
  --before-registration) BEFORE_REGISTRATION=1 ;;
  -h|--help) sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "check-shard: unknown argument $1" >&2; exit 2 ;;
esac

# Both values are spliced into a URL and a unit name: refuse anything that is not a plain one.
case "$NGINX_PORT" in ''|*[!0-9]*) echo "check-shard: TRACY_NGINX_PORT must be a port number" >&2; exit 2 ;; esac
case "$UNIT_PREFIX" in ''|*[!A-Za-z0-9_.@-]*) echo "check-shard: TRACY_UNIT_PREFIX may hold letters, digits and _ . @ - only" >&2; exit 2 ;; esac

ok() { printf 'ok    %s\n' "$*"; }
note() { printf 'note  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; [ -z "${2:-}" ] || printf '      fix: %s\n' "$2" >&2; FAILED=1; }
read_env() { grep -m1 "^$2=" "$1" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' | tr -d '"'"'"'\r' || true; }
names_origin() { printf '%s' "$1" | grep -F "\"origin\":\"$ORIGIN\"" >/dev/null; }

[ -r "$WEB_ENV" ] || { fail "cannot read $WEB_ENV" "run it as root on the shard"; exit 1; }
ORIGIN="$(read_env "$WEB_ENV" TRACY_ORIGIN)"
FQDN="${ORIGIN#https://}"
FIREWALL_MODE="$(read_env "$INSTALL_ENV" FIREWALL_MODE)"; FIREWALL_MODE="${FIREWALL_MODE:-iptables}"
echo "-- check-shard: $ORIGIN --"

# 1
if [ "$(read_env "$WEB_ENV" TRACY_DEPLOYMENT_ROLE)" = shard ]; then ok "TRACY_DEPLOYMENT_ROLE=shard"
else fail "TRACY_DEPLOYMENT_ROLE is not shard in $WEB_ENV" "set it, then $STACK_DIR/deploy-tracy-stack.sh --tag <running tag> --no-pull"; fi
# --forbidden-only: this line is about forbidden names. The required half (a variable that is
# missing or wrong) is shard-env-check.sh's other answer; the role line above covers the one that
# matters most here, and install-shard.sh runs the full check before it writes the file.
if bash "$STACK_DIR/shard-env-check.sh" "$WEB_ENV" --forbidden-only >/dev/null 2>&1; then ok "no forbidden variable in $WEB_ENV"
else fail "$WEB_ENV holds a forbidden variable" "$STACK_DIR/shard-env-check.sh $WEB_ENV --forbidden-only names them"; fi

# 2
if names_origin "$(curl -sS --max-time 5 -H "Host: $FQDN" "http://127.0.0.1:$NGINX_PORT/api/config" 2>/dev/null || true)"; then
  ok "nginx on 127.0.0.1:$NGINX_PORT reaches this shard's tracy-web"
else
  fail "nginx on 127.0.0.1:$NGINX_PORT does not answer this shard's /api/config" \
    "docker logs ${COMPOSE_PROJECT}-nginx-1; docker compose ... -f compose.shard.yml up -d --no-deps nginx"
fi

# 3
if names_origin "$(curl -sS --max-time 10 "$ORIGIN/api/config" 2>/dev/null || true)"; then
  ok "$ORIGIN/api/config, through Cloudflare and the tunnel, comes from this shard"
else
  fail "$ORIGIN/api/config does not come from this shard" \
    "DNS $FQDN must be a proxied CNAME to this shard's tunnel, and the tunnel's one ingress rule the catch-all -> http://127.0.0.1:$NGINX_PORT (W6)"
fi

# 4
hb_code="$(jq -r '.code // empty' "$STATE_DIR/heartbeat.json" 2>/dev/null || true)"
hb_epoch="$(jq -r '.epoch // 0' "$STATE_DIR/heartbeat.json" 2>/dev/null || echo 0)"
case "$hb_epoch" in ''|*[!0-9]*) hb_epoch=0 ;; esac
age=$(( $(date +%s) - hb_epoch ))
if [ "$hb_code" = 200 ] && [ "$age" -le 180 ]; then ok "the master accepted a heartbeat ${age}s ago"
elif [ "$BEFORE_REGISTRATION" = 1 ]; then note "heartbeat: the master answered ${hb_code:-nothing yet} - expected until /ops > Shards > Add"
else fail "the master has not accepted a heartbeat in 180 s (last answer ${hb_code:-none}, ${age}s ago)" \
  "journalctl -u ${UNIT_PREFIX}heartbeat -n 20; is this shard in /ops > Shards with this SHARD_SECRET?"; fi

# 5
if [ "$FIREWALL_MODE" = cloud ]; then
  note "FIREWALL_MODE=cloud: inbound rules are the provider's; confirm only tcp/22 is open"
elif iptables -C INPUT -j TRACY-INPUT 2>/dev/null && iptables -S TRACY-INPUT 2>/dev/null | grep -- '--dport 51720' >/dev/null; then
  ok "TRACY-INPUT is hooked into INPUT and lets tracy-web reach tracy-host"
else
  fail "no TRACY-INPUT chain in INPUT" "install-shard.sh step 6 writes it; then netfilter-persistent save"
fi

# 6
if chronyc tracking 2>/dev/null | grep -E '^Leap status +: Normal' >/dev/null; then
  ok "chrony synchronised ($(chronyc tracking 2>/dev/null | sed -n 's/^System time *: //p'))"
else
  fail "chrony is not synchronised" "systemctl status chrony; chronyc sources"
fi

# 7 - the tunnel client is a systemd unit on a plain shard and may be a container on a co-hosted one:
# either counts, the same two readings check-server.sh:425-426 takes.
if systemctl is-active --quiet cloudflared.service 2>/dev/null; then ok "cloudflared.service active"
elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'cloudflared' >/dev/null; then
  ok "cloudflared runs as a container"
else
  fail "cloudflared is neither an active cloudflared.service nor a running container" \
    "systemctl enable --now cloudflared.service (or start the tunnel container)"
fi
for unit in "${UNIT_PREFIX}heartbeat.timer" "${UNIT_PREFIX}updater.timer" "${UNIT_PREFIX}backup-postgres.timer"; do
  if systemctl is-active --quiet "$unit" 2>/dev/null; then ok "$unit active"
  else fail "$unit is not active" "systemctl enable --now $unit"; fi
done

echo
if [ "$FAILED" = 0 ]; then echo "check-shard: all green"; exit 0; fi
echo "check-shard: red - read the FAIL lines above" >&2
exit 1
