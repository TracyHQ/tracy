#!/usr/bin/env bash
# Bootstrap probe works even when this container has no Node.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo '{"status":"blocked","capability":"node","scope":"current execution environment","next":"Continue intake/design analysis; make the skill resources and Node available in the authorized build environment."}'
  exit 2
fi
exec node "$SCRIPT_DIR/preflight.mjs" "$@"
