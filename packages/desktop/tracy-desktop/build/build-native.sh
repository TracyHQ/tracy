#!/usr/bin/env bash
#
# Build the notification permission addon (native/notify-permission/, read by src/notify-permission.js)
# for the app, macOS only.
#
#   bash build/build-native.sh <arm64|x64|universal> [out file]
#
# Default out: src/native/notify-permission.node — where package.sh's `cp -R src` takes it into the
# app, and where a run from source finds it. Gitignored: built, never committed.
#
# NO node-gyp, NO Electron headers, NO new dependency: the addon is plain N-API, whose ABI is the
# same in Node and in Electron, so `clang++` with the headers of the Node that runs this script
# builds it. It links against nothing of Node's (`-undefined dynamic_lookup`): the N-API symbols are
# found in the process that loads it — Electron's main process in the app.
#
# One arch per app half: package.sh builds the arch it packages, and the universal merge
# (build/make-universal.mjs) joins the two halves' addons with lipo like every other Mach-O.
# build/sign.sh step 1 signs it (it signs every `.node`).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
ARCH="${1:?usage: build-native.sh <arm64|x64|universal> [out file]}"
OUT="${2:-$PKG/src/native/notify-permission.node}"
case "$ARCH" in
  arm64) ARCH_FLAGS=(-arch arm64) ;;
  x64) ARCH_FLAGS=(-arch x86_64) ;;
  universal) ARCH_FLAGS=(-arch arm64 -arch x86_64) ;;
  *) echo "build-native: arch must be arm64, x64 or universal, got: $ARCH" >&2; exit 2 ;;
esac
[ "$(uname -s)" = Darwin ] || { echo "build-native: macOS only" >&2; exit 2; }
NODE_INCLUDE="$(node -p "require('node:path').join(process.execPath, '..', '..', 'include', 'node')")"
[ -f "$NODE_INCLUDE/node_api.h" ] || { echo "build-native: no node_api.h in $NODE_INCLUDE" >&2; exit 2; }
mkdir -p "$(dirname "$OUT")"
# Matches Electron 44's own minimum macOS.
clang++ -std=c++17 -ObjC++ -fobjc-arc -O2 -Wall -Werror \
  -mmacosx-version-min=12.0 "${ARCH_FLAGS[@]}" \
  -I "$NODE_INCLUDE" \
  -bundle -undefined dynamic_lookup \
  -framework Foundation -framework UserNotifications \
  -o "$OUT" "$PKG/native/notify-permission/notify_permission.mm"
echo "build-native: $OUT ($(lipo -archs "$OUT"))"
