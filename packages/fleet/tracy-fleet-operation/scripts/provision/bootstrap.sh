#!/usr/bin/env bash
#
# bootstrap — set up a fleet host from a blank machine. Run ONCE, as root. Idempotent.
#
# ## Origin, and why this file came into the repo late
#
# The original lived at `/opt/tracy-fleet/bootstrap.sh` on the production fleet host and was in
# NO repo. It came here on 08/09/2026 after the dev machine was set up without running it, and three
# things broke in three different ways on the same day (missing `node`, missing egress chain, missing
# `iptables-persistent`). Three symptoms, one cause: this step was skipped because nobody could see it.
#
# ⚠ The 08/09 copy on that host still had a final block setting up `fleet-edge` + traefik + htpasswd.
# That block belongs to the one-dsh-per-site era that ADR 0014 dropped; it was NOT carried over. The
# rest is unchanged, ports and REJECT style included — drifting from the running copy would create
# two systems to compare.
set -euo pipefail

echo "== 1. Docker + compose plugin =="
if ! command -v docker >/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
docker --version

echo "== 2. Fleet runtime =="
# 🔒 THESE FOUR ARE NOT THERE BY DEFAULT. On the old host someone installed them by hand, declared
# nowhere, so a new host looks identical until the first file edit.
#
# `node` hurts the most, and in TWO ways: `lib/webroot-zones.cjs` (the core-zone gate — without it
# the webroot dies SILENTLY), and `provision/ensure-site-folder.mjs`, where `provision.sh` **exits 1
# AFTER the containers are up**, leaving a half-built site. Measured 08/09 on the dev machine.
apt-get install -y -qq git python3 ca-certificates
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "== 3. Safety net #1 (network layer): block outbound SMTP from FLEET containers =="
# Docker honours DOCKER-USER for traffic forwarded from containers.
#
# 🔒 SCOPED TO THE FLEET'S NETWORKS, no host-wide rule. A fleet host may be running someone else's
# things; this script may only reach its own containers. The customer's site copy is what needs
# blocking — a template with injected code must not turn this machine into a mail sender.
#
# Each site is a compose project with its own network, CREATED AFTER bootstrap. So `provision.sh`
# attaches the network of the site it just built to this chain: each site enrols itself in the net,
# nobody has to remember for it. An empty chain here is CORRECT — it is referenced from the first
# provision onwards.
iptables -N TRACY-FLEET-EGRESS 2>/dev/null || true
for port in 25 465 587; do
  iptables -C TRACY-FLEET-EGRESS -p tcp --dport "$port" -j REJECT 2>/dev/null ||
    iptables -A TRACY-FLEET-EGRESS -p tcp --dport "$port" -j REJECT
done
# Survives reboots. Without this package the rules live only in memory, and one reboot removes the
# net from EVERY draft site without a word.
if ! dpkg -s iptables-persistent >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent
fi
netfilter-persistent save >/dev/null

echo "== 3b. Shared fleet network =="
# 🔒 ON A DEMO-ONLY MACHINE NOBODY CREATES THIS NETWORK FOR YOU. Every site compose declares
# `tracy_tracy` as an EXTERNAL network (`render-compose.sh`), and on a full fleet host it is created
# by `deploy/compose.yml` when tracy-web + dns come up. A host running only tracy-host has neither
# service, so compose creates nothing, and the first provision dies at `network tracy_tracy declared
# as external, but could not be found` — after the site folder and port were already allocated.
# Measured 23/09/2026 on a demo-only fleet host, on that machine's first demo.
#
# The range comes from the host's own `TRACY_NETWORK_PREFIX` (the same variable compose reads),
# defaulting like compose.
TRACY_NETWORK_PREFIX="${TRACY_NETWORK_PREFIX:-$(grep -m1 '^TRACY_NETWORK_PREFIX=' /etc/tracy/tracy-web.env 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'\r' || true)}"
TRACY_NETWORK_PREFIX="${TRACY_NETWORK_PREFIX:-172.30.0}"
if docker network inspect tracy_tracy >/dev/null 2>&1; then
  echo "   tracy_tracy already exists ($(docker network inspect tracy_tracy --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'))"
else
  docker network create tracy_tracy --subnet "${TRACY_NETWORK_PREFIX}.0/24" >/dev/null
  echo "   tracy_tracy created (${TRACY_NETWORK_PREFIX}.0/24)"
fi

echo "== 4. Check the runtime — STOP if anything is missing, never report success =="
# A bootstrap that reports done on a host without the full runtime is the surest way for the
# failure to surface late, once there are customers.
missing=""
for cmd in docker git python3 node; do
  command -v "$cmd" >/dev/null || missing="$missing $cmd"
done
if [ -n "$missing" ]; then
  echo "!! missing runtime:$missing — the fleet would fail silently, not loudly. Stopping." >&2
  exit 1
fi
printf '   docker %s\n   git %s\n   python3 %s\n   node %s\n' \
  "$(docker --version | awk '{print $3}' | tr -d ,)" "$(git --version | awk '{print $3}')" \
  "$(python3 --version | awk '{print $2}')" "$(node --version)"

echo "== 5. What remains, which bootstrap does NOT do for you =="
cat <<'NEXT'
   a) rsync the repo's scripts/ + web/ + dsh/ into /opt/tracy-fleet/
   b) bash /opt/tracy-fleet/web/build.sh          # web image — BEFORE the first site
   c) /etc/tracy/hooks.env: FLEET_RELAY_SECRET + the four TRACY_MIGRATE_S3_*  (chmod 600)
   d) systemctl enable --now tracy-hooks          # unit in scripts/hooks/
   e) Cloudflare tunnel (remote-managed, token), then tracy-dsh — see dsh/HOST-DSH.md
   Step by step, with acceptance checks: tasks/plan-production-may-moi.md
NEXT
