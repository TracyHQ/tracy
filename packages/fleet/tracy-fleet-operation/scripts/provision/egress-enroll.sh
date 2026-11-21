#!/usr/bin/env bash
#
# egress-enroll — put every site network behind TRACY-FLEET-EGRESS, and make it survive a reboot.
# Runs ON THE HOST as root, from tracy-egress-enroll.timer (installed by bootstrap.sh): at boot and
# every 5 minutes. Idempotent; prints one line per network it had to add.
#
# 🔒 WHY THE HOST HAS TO DO THIS, NOT provision.sh. provision.sh enrols a new site's network live and
# used to end with `netfilter-persistent save >/dev/null 2>&1 || true`. Since 11/09 provision runs
# INSIDE the tracy-host container, which has the iptables binary and NET_ADMIN but no
# netfilter-persistent — so the save failed every time, silently. /etc/iptables/rules.v4 stayed at
# whatever bootstrap or a hand run last wrote, and a reboot dropped every site made since from the
# fence: measured 21/11/2026, 12 production and 20 dev site networks unfenced after a kernel reboot.
# The container cannot write the host's rules file, so the host persists, on a timer, and a reboot
# is caught within 90 s instead of never.
#
# Site networks are the subnets provision.sh allocates: ${TRACY_SITE_SUBNET_PREFIX:-10.240}.N.0/24.
set -uo pipefail
PREFIX="${TRACY_SITE_SUBNET_PREFIX:-10.240}"
iptables -L TRACY-FLEET-EGRESS -n >/dev/null 2>&1 || {
  echo "!! chain TRACY-FLEET-EGRESS missing — run /opt/tracy-fleet/provision/bootstrap.sh" >&2
  exit 1
}
added=0
for net in $(docker network ls -q); do
  for subnet in $(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$net" 2>/dev/null); do
    case "$subnet" in "$PREFIX".*) ;; *) continue ;; esac
    iptables -C DOCKER-USER -s "$subnet" -j TRACY-FLEET-EGRESS 2>/dev/null && continue
    if iptables -I DOCKER-USER -s "$subnet" -j TRACY-FLEET-EGRESS; then
      added=$((added + 1))
      echo "enrolled $subnet ($(docker network inspect -f '{{.Name}}' "$net" 2>/dev/null))"
    else
      echo "!! could not enrol $subnet" >&2
      exit 1
    fi
  done
done
if [ "$added" -gt 0 ]; then
  netfilter-persistent save >/dev/null || { echo "!! netfilter-persistent save failed — $added network(s) fenced until the next reboot only" >&2; exit 1; }
  echo "saved ($added added)"
fi
exit 0
