#!/usr/bin/env bash
# add-site.sh <label> <host-port> — bring one more site up while tracy-dsh keeps running.
# Mirrors what provision.sh will do on the fleet: site folder, web+db containers, WordPress
# install. Nothing touches the dsh container: /site is the parent directory, so the new folder
# is visible there the moment it exists.
set -euo pipefail
LABEL="${1:?label}"; PORT="${2:?host port}"
: "${TRACY_SITES_ROOT:?export TRACY_SITES_ROOT=<repo>/tch/sites first}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../../.." && pwd)"
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || { echo "label must match ^[a-z0-9][a-z0-9-]{0,62}$" >&2; exit 2; }
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT >= 1024 && PORT <= 65535)) || { echo "host port must be an integer 1024-65535, got \"$PORT\"" >&2; exit 2; }
echo "==> site folder"
mkdir -p "$TRACY_SITES_ROOT/$LABEL/.webroot"
node "$REPO/packages/fleet/tracy-fleet-operation/scripts/provision/ensure-site-folder.mjs" \
  "$TRACY_SITES_ROOT/$LABEL" "$LABEL.local" wordpress "$TRACY_SITES_ROOT/$LABEL/.webroot"
# The compose project name is the label, so a label already taken by SOMETHING ELSE would have
# this script adopt that project's containers and volumes. Re-running for a site this script made
# is fine and stays idempotent; the tell is whether the project owns a `<label>-web-1` container.
# (`docker compose ls --format` takes only table|json on this version, so `--quiet` is the list.)
if docker compose ls --all --quiet | grep -x "$LABEL" >/dev/null; then
  docker ps -a --format '{{.Names}}' | grep -x "$LABEL-web-1" >/dev/null || {
    echo "a compose project named \"$LABEL\" already exists and is not a site of this script (no container $LABEL-web-1) — pick another label" >&2
    exit 2
  }
fi
echo "==> containers"
TRACY_SITES_ROOT="$TRACY_SITES_ROOT" LABEL="$LABEL" PORT="$PORT" \
  docker compose -p "$LABEL" -f "$HERE/site.yml" up -d
echo "==> waiting for wordpress"
# WordPress unpacks into the empty .webroot on first boot and MariaDB comes up behind it; neither
# has a probe worth trusting here, so the install is retried. It must fail LOUDLY when it never
# lands: a silent fall-through left the caller with running containers and no site.
INSTALL=""
for _ in $(seq 1 60); do
  if docker exec -u www-data -w /var/www/html "$LABEL-web-1" wp core is-installed >/dev/null 2>&1; then
    INSTALL="already installed"; break
  fi
  if docker exec -u www-data -w /var/www/html "$LABEL-web-1" wp core install \
      --url="http://127.0.0.1:$PORT" --title="$LABEL" --admin_user=admin --admin_password=admin \
      --admin_email=admin@example.com --skip-email >/dev/null 2>&1; then
    INSTALL="installed"; break
  fi
  sleep 3
done
[ -n "$INSTALL" ] || { echo "wordpress install did not complete after 180s" >&2; exit 1; }
echo "$INSTALL"
docker exec -u www-data -w "/site/$LABEL" "$LABEL-web-1" bash -c 'pwd && ls AGENTS.md'
echo "==> done: http://127.0.0.1:$PORT (admin/admin); in dsh, add workspace /site/$LABEL"
