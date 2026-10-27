#!/bin/sh
set -eu

# Docker creates a named-volume mount as root even when the image directory is
# owned by node. Correct only persistent state, then run all application code
# as the unprivileged node user.
mkdir -p /data/dsh /data/dsh-passwords
chown -R node:node /data/dsh /data/dsh-passwords

exec su node -s /bin/sh -c '
set -eu
node /opt/dsh-passwords/dist/cli.js docker-init
node /opt/dsh-passwords/scripts/register-plugin.mjs
if ! node /opt/dsh-passwords/dist/cli.js patch; then
  echo "[dsh-passwords] dsh patch failed; refusing to start bundled mode." >&2
  exit 1
fi
echo "[dsh-passwords] dsh patch applied; starting dsh so it loads the patched web bundle."

# The plugin owns the gateway lifecycle. It first exchanges the alpha browser
# auth token for an authority-bound Cookie, then spawns the gateway with both
# that Cookie and DSH_GATEWAY_PARENT_PID. Starting a gateway here would occupy
# the port without either value, preventing the plugin from safely taking over.
exec dsh web --no-open
'
