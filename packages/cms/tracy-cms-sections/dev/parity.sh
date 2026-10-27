#!/bin/sh
# Pixel parity: a design page rendered on its own (what the preview dialog shows) against the same
# page served by a CMS stand. Zero differing pixels is the bar.
#
#   dev/parity.sh <id> <url> [out-dir] [--artifact <landing|form|typography>]
#   dev/parity.sh brutalism http://127.0.0.1:8080/                              # the fixture (Home chip)
#   dev/parity.sh brutalism http://127.0.0.1:8089/landing/ /tmp/p --artifact landing   # the engine's landing (Landing chip)
#
# Needs headless Chrome and ImageMagick's `compare` (brew install imagemagick).
set -eu

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
ID="${1:?design system id}"
URL="${2:?url of the page on the stand}"
OUT="/tmp/tracy-parity"
KIND=""
shift 2
while [ $# -gt 0 ]; do
  case "$1" in
    --artifact) KIND="$2"; shift 2 ;;
    *) OUT="$1"; shift ;;
  esac
done
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W=1440
H=2400

mkdir -p "$OUT"
if [ -n "$KIND" ]; then
  REF="$OUT/$ID-$KIND-reference.html"
  node "$HERE/../scripts/artifact-body.mjs" "$ID" "$KIND" --doc > "$REF"
  TAG="$ID-$KIND"
else
  REF="$ROOT/vendor/tracy/od-design-system/systems/$ID/components.html"
  [ -f "$REF" ] || { echo "parity: no fixture for $ID" >&2; exit 2; }
  TAG="$ID"
fi

shot() {
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size="$W,$H" --screenshot="$2" "$1" 2>/dev/null
}

shot "file://$REF" "$OUT/$TAG-reference.png"
shot "$URL" "$OUT/$TAG-site.png"

# `compare -metric AE` prints the number of differing pixels on stderr.
diff="$(compare -metric AE "$OUT/$TAG-reference.png" "$OUT/$TAG-site.png" "$OUT/$TAG-diff.png" 2>&1 || true)"
echo "parity $TAG: $diff differing pixels of $((W * H)) — $OUT/$TAG-diff.png"
[ "$diff" = "0" ]
