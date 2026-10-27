#!/usr/bin/env bash
#
# set-web-image — change which image supplies PHP for a site, and nothing else.
#
# The image the web container runs is the site's PHP version. provision.sh writes it from the
# platform file (joomla:5-apache); an upgrade has to move it, because Joomla 6 will not start
# under PHP 8.2, and a restore has to move it back, because Joomla 5 was not snapshotted under
# PHP 8.4.
#
# Deliberately dumb: it takes the image it is given and does not decide anything. Choosing the
# right PHP for a target Joomla version is a different job, with its own evidence, and it lives
# in set-php.sh.
#
# The webroot and the database volume are untouched. Only the web service is recreated.
#
# Usage:
#   set-web-image.sh --label example-com --image joomla:php8.4-apache [--root /srv/tracy]
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"

LABEL=""; IMAGE=""; ROOT="/srv/tracy"; NO_START=""
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --no-start) NO_START=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$LABEL" ] && [ -n "$IMAGE" ] || { echo "need --label and --image" >&2; exit 2; }

# An image reference reaches a shell and a compose file. Keep it to what a registry reference
# can legally be, so neither has to guess what the rest of the line means.
case "$IMAGE" in
  *[!A-Za-z0-9./:_-]*|"") echo "unusable image reference: $IMAGE" >&2; exit 2 ;;
esac

_tracy_web_image_require_supported_php "$IMAGE" || exit 1

SITE_DIR="$ROOT/$LABEL"
COMPOSE="$SITE_DIR/docker-compose.yml"
[ -f "$COMPOSE" ] || { echo "no compose file at $COMPOSE" >&2; exit 1; }

CURRENT="$(sed -n 's/^ *image: *//p' "$COMPOSE" | grep -v '^mariadb' | head -1 || true)"
if [ "$CURRENT" = "$IMAGE" ]; then
  echo "==> $LABEL already on $IMAGE"
  exit 0
fi

echo "==> $LABEL: $CURRENT -> $IMAGE"
# Only the web service's line. The database image is on its own line above and must not move:
# a MariaDB swap under a live volume is a different and much more dangerous operation.
python3 - "$COMPOSE" "$IMAGE" <<'PYEOF'
import re, sys
path, image = sys.argv[1], sys.argv[2]
text = open(path).read()
# The web service is the one whose image is not the database's. Rewrite that line only.
lines = text.splitlines(keepends=True)
done = False
for i, line in enumerate(lines):
    m = re.match(r"^(\s*image:\s*)(\S+)\s*$", line)
    if m and not m.group(2).startswith("mariadb"):
        lines[i] = f"{m.group(1)}{image}\n"
        done = True
        break
if not done:
    sys.exit("no web image line found in compose file")
open(path, "w").write("".join(lines))
PYEOF

[ -n "$NO_START" ] && { echo "==> compose updated, not started"; exit 0; }
( cd "$SITE_DIR" && docker compose up -d --force-recreate web )
echo "==> $LABEL now on $IMAGE"
