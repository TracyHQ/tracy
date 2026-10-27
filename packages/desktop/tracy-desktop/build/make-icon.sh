#!/usr/bin/env bash
#
# icon.svg → icon.icns, using only tools macOS ships with (`sips`, `iconutil`).
#
# No dependency added for a job that runs for a few seconds and changes every few months. `sips` reads
# SVG since macOS 13; if it ever stops reading it, the error shows up right here rather than producing
# an empty icon.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SET="$HERE/icon.iconset"
SVG="${1:-$HERE/icon.svg}"
ICNS="${2:-$HERE/icon.icns}"

[ -f "$SVG" ] || { echo "make-icon: missing $SVG" >&2; exit 2; }
command -v iconutil >/dev/null || { echo "make-icon: needs macOS (iconutil)" >&2; exit 2; }

rm -rf "$SET"; mkdir -p "$SET"

# The size set macOS requires. With one size missing the Dock falls back to the nearest one and the icon blurs.
for size in 16 32 128 256 512; do
  sips -s format png -Z "$size"            "$SVG" --out "$SET/icon_${size}x${size}.png"     >/dev/null
  sips -s format png -Z "$((size * 2))"    "$SVG" --out "$SET/icon_${size}x${size}@2x.png"  >/dev/null
done

iconutil -c icns "$SET" -o "$ICNS"
rm -rf "$SET"
echo "make-icon: $ICNS ($(du -h "$ICNS" | cut -f1))"
