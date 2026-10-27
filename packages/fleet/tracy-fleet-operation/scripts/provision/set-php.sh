#!/usr/bin/env bash
#
# set-php — put the site on the PHP a hop needs, and say why that one.
#
# The mechanical half is set-web-image.sh, which takes an image and decides nothing. This is
# the half that decides, and the decision is not "the target's minimum".
#
# `core:update` runs on the code that is there and produces the code that comes next, in one
# container, on one PHP. So the hop runs on a PHP BOTH majors support: too low and the updater
# refuses, because it checks the target's php_minimum before it starts; too high and the site
# that is still running breaks before the update begins. Measured against the real chain,
# every hop overlaps in exactly one PHP:
#
#     3.10 -> 4.4   8.0        4.4 -> 5.4   8.2        5.4 -> 6.1   8.3
#
# The table and its evidence are in php_matrix.py.
#
# Usage:
#   set-php.sh --label example-com --from 5.4.8 --to 6.1.3 [--root /srv/tracy] [--dry-run]
set -euo pipefail

LABEL=""; FROM=""; TO=""; ROOT="/srv/tracy"; DRY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --to) TO="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$FROM" ] && [ -n "$TO" ] || {
  echo "need --label, --from and --to" >&2; exit 2; }

HERE="$(cd "$(dirname "$0")" && pwd)"

# Refused rather than guessed. The caller's next move is to snapshot and start an upgrade, and
# a hop the update server will not serve is cheapest to find out about here.
PHP="$(python3 "$HERE/php_matrix.py" --from "$FROM" --to "$TO")"
IMAGE="$(python3 "$HERE/php_matrix.py" --from "$FROM" --to "$TO" --image)"

# The matrix answers with the upstream tag, because the question it answers is about PHP. Since
# Plan 3 the web container is also the agent's shell, so the site has to land on OUR image for that
# PHP — same PHP, plus git/rg/less/jq. A hop onto the bare upstream tag would leave the site serving
# perfectly and its agent without a grep, for as long as the hop lasts (which for a site stuck
# mid-chain is not a short time). web/IMAGE_TAGS says which image that is, and says so out loud
# when nothing has been built for this PHP.
#
# STRICT, because what is at stake here is the PHP version itself: this script exists to move a
# site onto one exact PHP, and a resolver that substituted a different image would defeat the one
# job it has. A hop that cannot be built is refused, and the fix is thirty seconds long
# (`bash web/build.sh`) with the person who can run it standing right here.
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"
export TRACY_WEB_IMAGE_STRICT=1
IMAGE="$(tracy_web_image joomla "$IMAGE")"

echo "==> Joomla $FROM -> $TO runs on PHP $PHP ($IMAGE)"
[ -n "$DRY" ] && exit 0

"$HERE/set-web-image.sh" --label "$LABEL" --root "$ROOT" --image "$IMAGE"
