#!/usr/bin/env bash
# Site-scoped durable address activation; the Python runner owns lock and recovery.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/../lib/roots.sh"
export TRACY_PRIVATE_ROOT TRACY_SITES_ROOT TRACY_COMPOSE_NAMES
exec python3 "$HERE/site-address.py" "$@"
