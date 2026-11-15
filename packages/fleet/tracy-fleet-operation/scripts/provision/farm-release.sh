#!/usr/bin/env bash
#
# farm-release — the demo farm lets go of one folded demo that is being DELETED (teardown.sh), not
# brought home (that is unfold.sh, which copies its database back first).
#
#   farm-release.sh <label> [--root DIR]
#
# Removed, in this order: its vhost, pool and exec environment (the farm re-rendered without its
# mounts, tested, re-applied), its schema and its database user, the FARM_DB_* lines of its .env, its
# `farm/` folder and its runtime marker. What is left is the demo's own compose project — the
# forwarder `<label>-web-1` and the kept `<label>_db` volume — which teardown.sh then removes as it
# removes any site. No other demo is touched beyond the farm's re-apply; the farm is never stopped.
#
# A label that holds nothing in the farm is said and left alone (exit 0). Takes the host's farm lock,
# not the site's lifecycle lock (teardown.sh holds that one while it calls this).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

LABEL=""; ROOT="$TRACY_PRIVATE_ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    *) [ -z "$LABEL" ] || { echo "one label at a time" >&2; exit 2; }; LABEL="$1"; shift ;;
  esac
done
[ -n "$LABEL" ] || { echo "use: farm-release.sh <label> [--root DIR]" >&2; exit 2; }
tracy_require_label "$LABEL"
TRACY_PRIVATE_ROOT="$ROOT"
SITE_DIR="$ROOT/$LABEL"
[ -d "$SITE_DIR" ] || { echo "no such site: $SITE_DIR" >&2; exit 2; }

# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"
# shellcheck source=../lib/site-lifecycle.sh
. "$HERE/../lib/site-lifecycle.sh"
# shellcheck source=farm-common.sh
. "$HERE/farm-common.sh"

# A marker this cannot read stops here: guessing "not in the farm" would leave its schema behind.
tracy_site_runtime "$LABEL" >/dev/null
IDENT="$(site_env_get FARM_DB_NAME)"
if [ ! -f "$(tracy_demos_dir)/fpm/$LABEL.conf" ] && [ -z "$IDENT" ] && [ ! -d "$SITE_DIR/farm" ] \
   && [ ! -e "$(tracy_site_runtime_file "$LABEL")" ]; then
  echo "==> $LABEL holds nothing in the demo farm — nothing to release"
  exit 0
fi
farm_lock
farm_ensure_files
[ -z "$IDENT" ] || farm_wait_db
farm_release
rm -f "$(tracy_site_runtime_file "$LABEL")"
echo "==> the demo farm holds nothing of $LABEL any more (vhost, pool, schema ${IDENT:-none}, user, mounts)"
