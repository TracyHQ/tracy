#!/usr/bin/env bash
#
# farm-refresh — a folded demo's farm entry, written again from what is on disk now, and taken by
# the farm. What a per-site container got by `apache2ctl -k graceful` (a rewritten tracy-noindex.conf)
# or by being re-created (a new access key folder to mount), a demo in the demo farm gets here.
#
#   farm-refresh.sh <label> [--root DIR]
#
# Re-written: the demo's vhost (its tracy-noindex.conf is included from its own folder, and the
# `<Directory>` fix in it is said again for the farm's docroot — lib/demo-farm.sh), its pool and exec
# environment (mail token, access key file), and the farm's compose (a key folder that exists now is
# mounted). Then both configs are tested in a throwaway farm container BEFORE the running farm sees
# them; a config that fails puts every file back as it was and changes nothing that serves. Then the
# farm takes them: a graceful reload, or a re-create when the mounts changed (~1 s for every folded
# demo — the price lib/demo-farm.sh names).
#
# Nothing else of any demo is touched, and a label that is not in the farm is said and left alone
# (exit 0): callers run this for a demo marked `farm` (lib/site-runtime.sh) and need not ask twice.
# Takes the host's farm lock, NOT the site's lifecycle lock: go-live.sh and the access-key tools
# call it while they hold that one.
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
[ -n "$LABEL" ] || { echo "use: farm-refresh.sh <label> [--root DIR]" >&2; exit 2; }
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

RUNTIME="$(tracy_site_runtime "$LABEL")"
if [ "$RUNTIME" != farm ]; then
  echo "==> $LABEL is not served by the demo farm — nothing to refresh"
  exit 0
fi
HOST_PORT="$(site_env_get HOST_PORT)"
[[ "$HOST_PORT" =~ ^[1-9][0-9]*$ ]] || { echo "!! $LABEL has no HOST_PORT in its .env" >&2; exit 1; }
export HOST_PORT

farm_lock
farm_ensure_files
DIR="$(tracy_demos_dir)"
[ -f "$DIR/fpm/$LABEL.conf" ] || { echo "!! $LABEL is marked farm but has no pool in $DIR — see unfold.sh" >&2; exit 1; }

# What serves now, kept until the new files have passed.
KEEP="$(mktemp -d "$DIR/.refresh-$LABEL.XXXXXX")"
cp -p "$DIR/apache/$LABEL.conf" "$KEEP/vhost" 2>/dev/null || true
cp -p "$DIR/fpm/$LABEL.conf" "$KEEP/pool"
cp -p "$DIR/exec/$LABEL.env" "$KEEP/exec" 2>/dev/null || true
cp -p "$DIR/compose.yml" "$KEEP/compose"
put_back() {
  [ ! -f "$KEEP/vhost" ] || cp -p "$KEEP/vhost" "$DIR/apache/$LABEL.conf"
  cp -p "$KEEP/pool" "$DIR/fpm/$LABEL.conf"
  [ ! -f "$KEEP/exec" ] || cp -p "$KEEP/exec" "$DIR/exec/$LABEL.env"
  cp -p "$KEEP/compose" "$DIR/compose.yml"
}
trap 'rm -rf "$KEEP"' EXIT

if ! farm_member_write || ! farm_render; then
  put_back
  echo "!! $LABEL: its farm entry could not be written — the farm serves it as before" >&2
  exit 1
fi
if ! farm_config_test; then
  put_back
  echo "!! $LABEL: the new vhost or pool fails the config test — the farm serves it as before" >&2
  exit 1
fi
if ! farm_apply >/dev/null; then
  put_back
  farm_apply >/dev/null || true
  echo "!! $LABEL: the farm did not take the new entry — the previous one is back" >&2
  exit 1
fi
echo "==> $LABEL: its farm vhost, pool and mounts are what its files say now"
