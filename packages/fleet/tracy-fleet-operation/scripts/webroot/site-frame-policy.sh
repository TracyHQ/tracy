#!/usr/bin/env bash
# Repair only Tracy's managed frame policy, under the existing publish/teardown lock.
set -euo pipefail
TRACY_SCRIPT_ARGV=("$@")
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="${1:?private root}" LABEL="${2:?site label}"
[[ "$LABEL" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || exit 2
source "$HERE/../lib/frame-policy.sh"
source "$HERE/../lib/site-lifecycle.sh"
POLICY="$(tracy_frame_ancestors)"
tracy_site_lifecycle_lock "$ROOT" "$LABEL"
node "$HERE/site-frame-policy.mjs" "$ROOT" "$LABEL" "$POLICY" "${TRACY_ORIGIN:-}"
