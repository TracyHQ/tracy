#!/usr/bin/env bash
#
# Package `Tracy Cowork.app` — build, sign, and notarize when the papers are complete.
#
# WHY PACKAGE BY HAND. `@electron/packager` does not run on an isolated pnpm tree: it looks for
# `@electron-internal/extract-zip` from inside the `electron` directory and does not find it, because pnpm
# keeps transitive dependencies in `.pnpm/` rather than nesting them. Switching the whole workspace's
# `nodeLinker` to please one packaging tool is the wrong price. And here it is cheap: `src/main.js` uses
# only built-in modules, so "packaging" literally means three copy commands and one plist edit.
#
# Two modes, chosen at package time by TRACY_DESKTOP_ORIGIN:
#
#   REMOTE (default, https://cowork.tracy.ai): the origin is pinned into the bundle
#   (`Contents/Resources/app/origin`) and `main.js` reads it before the environment or any repo
#   file. The app then needs NO TCH checkout on the machine that runs it.
#       bash build/package.sh                                        # Tracy Cowork → cowork.tracy.ai
#       TRACY_DESKTOP_ORIGIN=https://cowork.tracy.site bash build/package.sh   # Tracy Cowork Dev
#   Three variants, by origin (build/update-channel.cjs): the production origin builds `Tracy Cowork`,
#   cowork.tracy.site builds `Tracy Cowork Dev` (`ai.tracy.cowork.dev`, dark icon), and ANY OTHER
#   origin (a stand, staging, a laptop) builds `Tracy Cowork Preview` (`ai.tracy.cowork.preview`,
#   version `<version>-preview.<sha7>`, ad-hoc signed, never updates itself) — so all three install
#   side by side with their own data. See the variant block below.
#       TRACY_DESKTOP_ORIGIN=http://tracy.test:8080 bash build/package.sh   # Tracy Cowork Preview
#
#   SELF-UPDATE: the two origins with a feed get a channel — cowork.tracy.ai `stable`,
#   cowork.tracy.site `dev` (build/update-channel.cjs) — written as `Contents/Resources/app-update.yml`
#   (electron-updater's own file, BEFORE signing so the signature seals it) and
#   `Contents/Resources/app/update-channel`. Any other origin, and LOCAL, never updates itself.
#
#   Test builds only (tasks/evidence/desktop-auto-update/) — except the version, which
#   `build/release.mjs prepare` also sets for a dev candidate (`X.Y.Z-dev.N`), and the feed, which it
#   always sets (the production one, or a stand's with `--feed` for a dry run):
#     TRACY_DESKTOP_VERSION=0.2.1        another version than package.json's (X.Y.Z or X.Y.Z-dev.N)
#     TRACY_DESKTOP_UPDATE_CHANNEL=dev   a channel for an origin that has none
#     TRACY_DESKTOP_UPDATE_FEED=<url>    another feed than the channel's own (build/update-channel.cjs
#                                        `feedFor`: stable update.tracy.ai, dev update.tracy.site)
#     TRACY_DESKTOP_TEST_NAME=Spike      `Tracy Cowork Spike` / `ai.tracy.cowork.spike`, so a test build
#                                        never replaces, or shares data with, an installed app
#     TRACY_DESKTOP_RELEASE_NOTES=<file> the notes the release froze, written as
#                                        `Contents/Resources/release-notes.txt` (release.mjs prepare sets it)
#     TRACY_DESKTOP_DOCS_ORIGIN=<url>    another docs host in `Contents/Resources/release-notes.json`
#                                        than the channel's own (update-channel.cjs `docsOriginFor`)
#
#   LOCAL (TRACY_DESKTOP_ORIGIN set but EMPTY): the app wraps the local dsh — it calls `run.sh`
#   in this repo, so the repo must stay where it is (stamped into `repo-path`). Deliberately: a
#   second copy of dsh inside the .app would drift from the repo without anyone noticing.
#       TRACY_DESKTOP_ORIGIN= bash build/package.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
# The arch of the Electron the app is built from: this machine's by default. `TRACY_DESKTOP_ARCH=x64`
# (or arm64) builds the other one into `dist/<arch>/`, so both archs of a release can be packaged
# on one Mac and handed to `build/release.sh` together (the one native module, the notification
# permission addon, is built per arch below: build/build-native.sh).
# `TRACY_DESKTOP_ARCH=universal` builds both, unsigned, merges them into one app that runs on either
# chip (build/make-universal.mjs) and signs THAT — the app the install dmg carries.
# TRACY_DESKTOP_DIST moves the `dist/` root (the universal build puts its two halves in a temp one).
ARCH="${TRACY_DESKTOP_ARCH:-}"
DIST="${TRACY_DESKTOP_DIST:-$PKG/dist}"
OUT="$DIST"
if [ -n "$ARCH" ]; then
  case "$ARCH" in arm64|x64|universal) ;; *) echo "package: TRACY_DESKTOP_ARCH must be arm64, x64 or universal, got: $ARCH" >&2; exit 2 ;; esac
  OUT="$DIST/$ARCH"
fi
# One source: this package's package.json (the test override above aside).
VERSION="${TRACY_DESKTOP_VERSION:-$(node -p "require('$PKG/package.json').version")}"
# `X.Y.Z`, or `X.Y.Z-dev.N` for a dev candidate (checked against the channel below).
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-dev\.[0-9]+)?$' || {
  echo "package: version must be X.Y.Z or X.Y.Z-dev.N, got: $VERSION" >&2; exit 2; }
# `-` and not `:-`: set-but-empty is the LOCAL mode, unset is the default origin.
ORIGIN="${TRACY_DESKTOP_ORIGIN-https://cowork.tracy.ai}"
ORIGIN="${ORIGIN%/}"
if [ -n "$ORIGIN" ] && ! printf '%s' "$ORIGIN" | grep -Eq '^https?://[^/?#]+$'; then
  echo "package: TRACY_DESKTOP_ORIGIN must be an origin like https://cowork.tracy.ai, got: $ORIGIN" >&2
  exit 2
fi

# THREE VARIANTS, ONE PER FEED. The variant follows the origin's update channel (build/update-channel.cjs
# holds the production origin, so this file names none): the production origin is `Tracy Cowork` /
# `ai.tracy.cowork`, cowork.tracy.site is `Tracy Cowork Dev` / `ai.tracy.cowork.dev` with the brand's
# dark icon, and every other origin is `Tracy Cowork Preview` / `ai.tracy.cowork.preview`. Same name
# and bundle id would make two builds replace each other in /Applications and share one cookie jar
# and data folder (Electron keys userData by the app name). A Preview is never `Dev`: a Dev build
# follows the dev feed, and its first update would turn an app pinned to a stand into one pinned to
# cowork.tracy.site (council 09/10). LOCAL (empty origin) stays `Tracy Cowork Dev` as before.
# The origin goes in as an argument, never into the JS source (a quote in it would be code).
ORIGIN_CHANNEL="$(node -p "require(process.argv[1]).channelForOrigin(process.argv[2]) ?? ''" "$PKG/build/update-channel.cjs" "$ORIGIN")"
VARIANT=dev
if [ "$ORIGIN_CHANNEL" = stable ]; then VARIANT=stable
elif [ -n "$ORIGIN" ] && [ -z "$ORIGIN_CHANNEL" ] && [ -z "${TRACY_DESKTOP_TEST_NAME:-}" ]; then VARIANT=preview
fi
case "$VARIANT" in
  stable) NAME="Tracy Cowork";         BUNDLE_ID="ai.tracy.cowork";         ICON_SVG="$HERE/icon.svg" ;;
  dev)    NAME="Tracy Cowork Dev";     BUNDLE_ID="ai.tracy.cowork.dev";     ICON_SVG="$HERE/icon-dev.svg" ;;
  preview) NAME="Tracy Cowork Preview"; BUNDLE_ID="ai.tracy.cowork.preview"; ICON_SVG="$HERE/icon-dev.svg" ;;
esac
# `pnpm desktop:preview` asks for a Preview by name, so a forgotten origin stops here instead of
# quietly building the production app.
if [ -n "${TRACY_DESKTOP_VARIANT:-}" ] && [ "$TRACY_DESKTOP_VARIANT" != "$VARIANT" ]; then
  echo "package: asked for a $TRACY_DESKTOP_VARIANT build, but origin '${ORIGIN}' makes a $VARIANT one" >&2
  [ "$TRACY_DESKTOP_VARIANT" != preview ] || echo "package:   a Preview needs TRACY_DESKTOP_ORIGIN=<a stand or other non-feed origin>" >&2
  exit 2
fi
if [ "$VARIANT" = preview ]; then
  # A Preview has no feed, so no update channel — a test channel needs a test name (below) instead.
  [ -z "${TRACY_DESKTOP_UPDATE_CHANNEL:-}" ] || {
    echo "package: a Preview never updates itself; set TRACY_DESKTOP_TEST_NAME for an updater test build" >&2; exit 2; }
  # `<version>-preview.<sha7>`: which commit a Preview came from, readable in About. Info.plist keeps
  # the numeric core (below). Outside a git checkout the plain version stays.
  SHA7="$(git -C "$PKG" rev-parse --short=7 HEAD 2>/dev/null || true)"
  [ -z "$SHA7" ] || [ -n "${TRACY_DESKTOP_VERSION:-}" ] || VERSION="$VERSION-preview.$SHA7"
fi
if [ -n "${TRACY_DESKTOP_TEST_NAME:-}" ]; then
  printf '%s' "$TRACY_DESKTOP_TEST_NAME" | grep -Eq '^[A-Za-z][A-Za-z0-9]{0,15}$' || {
    echo "package: TRACY_DESKTOP_TEST_NAME must be one plain word, got: $TRACY_DESKTOP_TEST_NAME" >&2; exit 2; }
  NAME="Tracy Cowork $TRACY_DESKTOP_TEST_NAME"
  BUNDLE_ID="ai.tracy.cowork.$(printf '%s' "$TRACY_DESKTOP_TEST_NAME" | tr '[:upper:]' '[:lower:]')"
fi
APP="$OUT/$NAME.app"
echo "package: building $NAME ($BUNDLE_ID) $VERSION"

# The update channel: from the origin, or the test override; empty = this build never updates itself.
CHANNEL="${TRACY_DESKTOP_UPDATE_CHANNEL:-$ORIGIN_CHANNEL}"
# A `-dev.N` version is a dev candidate: it never goes into a stable build, whose clients would
# otherwise rank it below the X.Y.Z they already run and never take it.
case "$VERSION" in *-dev.*) [ "$CHANNEL" != stable ] || {
  echo "package: $VERSION is a dev version; a stable build takes X.Y.Z only" >&2; exit 2; } ;; esac
# Info.plist takes numbers only: the short version is X.Y.Z, and a dev build's bundle version
# appends N (`0.3.0-dev.2` → `0.3.0.2`) so each candidate still reads as newer to macOS.
CORE_VERSION="${VERSION%%-*}"
BUNDLE_VERSION="$CORE_VERSION"
case "$VERSION" in *-dev.*) BUNDLE_VERSION="$CORE_VERSION.${VERSION##*-dev.}" ;; esac
# The channel's own feed (stable and dev live on different hosts and buckets), or the override.
UPDATE_FEED="${TRACY_DESKTOP_UPDATE_FEED:-}"
if [ -z "$UPDATE_FEED" ] && [ -n "$CHANNEL" ]; then
  UPDATE_FEED="$(node -p "require(process.argv[1]).feedFor(process.argv[2])" "$PKG/build/update-channel.cjs" "$CHANNEL")"
fi

# ── Signing, one place for both paths below ───────────────────────────────────────────────────────
# TRACY_DESKTOP_NO_SIGN=1: stop unsigned — for building on one machine and signing on the one that
# holds the certificate (`bash build/sign.sh <app>` there), and for the halves of a universal build.
sign_app() {
  if [ "${TRACY_DESKTOP_NO_SIGN:-}" = "1" ]; then
    echo "package: not signed (TRACY_DESKTOP_NO_SIGN=1) — run build/sign.sh on the machine with the certificate"
  elif [ "$VARIANT" = preview ]; then
    # Ad-hoc, always — even on the machine with the Developer ID: a Preview is for trying a change on
    # this Mac, and a Developer ID copy of an unreleased build is one nobody should be handed.
    codesign --force --deep --sign - "$APP"
    echo "package: ad-hoc signed (Preview) — runs on this Mac only, no notarization"
  else
    bash "$HERE/sign.sh" "$APP"
  fi
}

# Electron fuses (build/fuses.mjs): a packaged app never runs as plain Node, takes NODE_OPTIONS or opens
# an inspector, and encrypts its cookies. Flipped in the framework binary BEFORE signing (it rewrites the
# binary). Source runs use node_modules' Electron, which this never touches — `pnpm debug` keeps --inspect.
harden_app() { node "$HERE/fuses.mjs" flip "$APP"; }

if [ "$ARCH" = universal ]; then
  # Two halves, unsigned, in a temp dist: a signature differs between the archs and the merge refuses
  # files that differ; the merged binaries need a signature of their own anyway (sign_app below).
  PARTS="$(mktemp -d)"
  trap 'rm -rf "$PARTS"' EXIT
  for PART in arm64 x64; do
    TRACY_DESKTOP_ARCH="$PART" TRACY_DESKTOP_DIST="$PARTS" TRACY_DESKTOP_NO_SIGN=1 bash "$HERE/package.sh"
  done
  mkdir -p "$OUT"; rm -rf "$APP"
  node "$HERE/make-universal.mjs" "$PARTS/arm64/$NAME.app" "$PARTS/x64/$NAME.app" "$APP"
  echo "package: universal = $(lipo -archs "$APP/Contents/MacOS/$NAME")"
  # The halves were hardened already; this re-checks both slices of the merged binary.
  harden_app
  sign_app
  echo "package: $APP ($(du -sh "$APP" | cut -f1))"
  exit 0
fi

# The template is Electron's OWN release zip, unpacked with `ditto`, not node_modules' copy.
# Measured 07/10/2026: `node_modules/electron/dist/Electron.app` had every framework symlink turned
# into a real file or folder (`Versions/Current`, `Electron Framework`, `Resources`), and codesign
# refuses such a framework ("bundle format is ambiguous") — the app could be ad-hoc signed but never
# Developer ID signed. `@electron/get` returns the zip from Electron's cache (downloads it if absent).
[ -d "$PKG/node_modules/electron" ] || { echo "package: no electron in node_modules — run \`pnpm install\` first" >&2; exit 2; }
ELECTRON_ZIP="$(cd "$PKG" && TRACY_DESKTOP_ARCH="$ARCH" node -e "
  const get = require(require.resolve('@electron/get', { paths: [require.resolve('electron')] }))
  get.downloadArtifact({ version: require('electron/package.json').version, platform: 'darwin',
    arch: process.env.TRACY_DESKTOP_ARCH || process.arch, artifactName: 'electron' }).then((p) => console.log(p), (e) => { console.error(e.message); process.exit(1) })
")"
UNPACK="$(mktemp -d)"
trap 'rm -rf "$UNPACK"' EXIT
ditto -x -k "$ELECTRON_ZIP" "$UNPACK"
TEMPLATE="$UNPACK/Electron.app"
[ -L "$TEMPLATE/Contents/Frameworks/Electron Framework.framework/Versions/Current" ] || {
  echo "package: $ELECTRON_ZIP unpacked without framework symlinks — codesign would refuse it" >&2; exit 2; }

# ALWAYS rebuild the icon, not only when missing. `icon.icns` is generated from `icon.svg` and is not in
# git; a stale .icns left on disk would silently be packed into the app after someone edits the svg.
bash "$HERE/make-icon.sh" "$ICON_SVG" "$UNPACK/icon.icns"

# Only THIS variant's app is replaced: the production and the Dev build sit side by side in dist/.
mkdir -p "$OUT"; rm -rf "$APP"
ditto "$TEMPLATE" "$APP"

# The Dock reads the process name from the binary's name, not from Info.plist.
mv "$APP/Contents/MacOS/Electron" "$APP/Contents/MacOS/$NAME"

# Electron's default icon must be REPLACED, not added beside: left in place, Finder may still pick the
# old one depending on its cache.
rm -f "$APP/Contents/Resources/electron.icns"
cp "$UNPACK/icon.icns" "$APP/Contents/Resources/tracy-cowork.icns"

# `default_app.asar` is Electron's welcome screen — while it is there Electron runs it instead of
# our app.
rm -f "$APP/Contents/Resources/default_app.asar"
mkdir -p "$APP/Contents/Resources/app"
# dsh's window shell, bundled from shell/ and the dsh submodule into src/generated/ — built here so a
# packaged app always carries the shell of the dsh this checkout pins, never one left on disk.
node "$PKG/build/build-shell.mjs"
# The notification permission addon (src/notify-permission.js), for this half's arch only: a universal
# build merges the two halves' addons with lipo (build/make-universal.mjs), and build/sign.sh step 1
# signs it like every `.node`. Built fresh every time, so no addon of another arch is ever packaged.
bash "$HERE/build-native.sh" "${ARCH:-$(node -p process.arch)}"
cp -R "$PKG/src" "$APP/Contents/Resources/app/src"
cat > "$APP/Contents/Resources/app/package.json" <<JSON
{
  "name": "tracy-cowork",
  "productName": "$NAME",
  "version": "$VERSION",
  "main": "src/main.js"
}
JSON

REPO_ROOT="$(cd "$PKG/../../.." && pwd)"
if [ -n "$ORIGIN" ]; then
  # REMOTE: pin the origin. No `repo-path` — a packaged app with an origin must not depend on a
  # checkout, and a stale stamp would only send the next diagnosis looking in the wrong place.
  printf '%s\n' "$ORIGIN" > "$APP/Contents/Resources/app/origin"
  echo "package: pinned origin = $ORIGIN"
  if [ -n "$CHANNEL" ]; then
    node -e "process.stdout.write(require('$PKG/build/update-channel.cjs').appUpdateYml({ channel: process.argv[1], url: process.argv[2] }))" \
      "$CHANNEL" "$UPDATE_FEED" > "$APP/Contents/Resources/app-update.yml"
    printf '%s\n' "$CHANNEL" > "$APP/Contents/Resources/app/update-channel"
    echo "package: self-update on, channel $CHANNEL, feed $UPDATE_FEED"
    # The build's own notes and where its changelog page is (build/release-notes-page.mjs), sealed by the
    # signature like app-update.yml: `release-notes.json` always, `release-notes.txt` when a release
    # hands its frozen notes in (build/release.mjs prepare); a hand build has none to show.
    node "$HERE/release-notes-page.mjs" bundle "$APP/Contents/Resources" --version "$VERSION" --channel "$CHANNEL" \
      ${TRACY_DESKTOP_RELEASE_NOTES:+--notes-file "$TRACY_DESKTOP_RELEASE_NOTES"} \
      ${TRACY_DESKTOP_DOCS_ORIGIN:+--docs-origin "$TRACY_DESKTOP_DOCS_ORIGIN"}
    if [ -n "${TRACY_DESKTOP_RELEASE_NOTES:-}" ]; then echo "package: release notes from $TRACY_DESKTOP_RELEASE_NOTES"
    else echo "package: no release notes (a hand build)"; fi
  else
    echo "package: self-update off (no feed for $ORIGIN)"
  fi
else
  # LOCAL: stamp the repo root. The app calls `run.sh` in the repo, and from inside the `.app` no
  # relative path finds it: four levels up from `Contents/Resources/app/src` is the `.app/` itself.
  # Written here, at package time, while the path is still known for certain.
  printf '%s\n' "$REPO_ROOT" > "$APP/Contents/Resources/app/repo-path"
  echo "package: local dsh mode, repo = $REPO_ROOT"
fi

# Info.plist: change key by key with PlistBuddy rather than sed over the whole file — a plist is structured
# XML, and one missed sed leaves a file Finder refuses to open with a meaningless message.
PLIST="$APP/Contents/Info.plist"
plist() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PLIST"; }
plist CFBundleName               "$NAME"
plist CFBundleDisplayName        "$NAME"
plist CFBundleExecutable         "$NAME"
plist CFBundleIdentifier         "$BUNDLE_ID"
plist CFBundleIconFile           tracy-cowork.icns
plist CFBundleShortVersionString "$CORE_VERSION"
plist CFBundleVersion            "$BUNDLE_VERSION"
# Voice input (the chat box's microphone, `@tracy/dsh-chat-input` `VoiceInput.tsx`): macOS asks for
# the microphone in these words. A hardened app without them (and without the audio-input
# entitlement, `entitlements.plist`) is refused the microphone with no prompt at all. Added, not
# set: Electron's own Info.plist may or may not carry the key.
/usr/libexec/PlistBuddy -c "Delete :NSMicrophoneUsageDescription" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSMicrophoneUsageDescription string Tracy uses the microphone only while you dictate a message." "$PLIST"
# Website Opportunities' "Use my location" asks for the position once, in these words (entitlement: entitlements.plist).
for key in NSLocationUsageDescription NSLocationWhenInUseUsageDescription; do
  /usr/libexec/PlistBuddy -c "Delete :$key" "$PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :$key string Tracy uses your location only to find restaurants near you when you ask." "$PLIST"
done

harden_app
# ── Sign + notarize: build/sign.sh (runs standalone on the machine with the certificate) ─────
sign_app


echo "package: $APP ($(du -sh "$APP" | cut -f1))"
echo "package: open with  open '$APP'"
echo "package: add to Dock  drag the app into the Dock, or run it then right-click the icon → Options → Keep in Dock"
