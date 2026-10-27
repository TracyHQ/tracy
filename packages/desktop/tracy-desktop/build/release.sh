#!/usr/bin/env bash
#
# Publish a signed, notarized `Tracy Cowork.app` (or `Tracy Cowork Dev.app`) to the update feed.
#
#   bash build/release.sh <out dir> <app> [<app>…]             # artifacts + channel file, local only
#   bash build/release.sh <out dir> <app> [<app>…] --upload    # … then upload them to the channel's bucket
#
# One run per release: give it every arch of that release (an arm64 and an x64 build of the same
# channel and version, and their universal merge) and it writes ONE channel file listing all of them —
# a second run for the other arch would replace the first's channel file and strand those clients.
#
# What each app becomes: an arm64 or x64 app → its ZIP, what electron-updater installs from (it picks
# the zip whose name says arm64 on Apple silicon, the other on Intel); the UNIVERSAL app (both archs in
# one binary, `TRACY_DESKTOP_ARCH=universal bash build/package.sh`) → THE DMG a person installs from,
# `<name>-<version>-universal.dmg`. Without a universal app, each arch app also gets a dmg of its own.
# Every dmg is itself signed, notarized and stapled (build/sign.sh), not only the app inside it.
#
# BUILD_ID (default: a UTC timestamp) names this exact build; RELEASE_DATE (default: now) is the
# channel file's `releaseDate`. The artifacts go into an immutable
# folder of their own, `desktop/<channel>/<version>/<build id>/`, and the channel file carries a
# `buildId:` line the release preflight (feat/desktop-release) reads back.
#
# Runs on the iMac, after `build/package.sh` (which signs and notarizes there). It does NOT build:
# it ships exactly the app it is given, after checking that app is what a client will accept.
#
# 🔒 Releasing is owner-authorized only — `--upload` only when Lee says so. The feed is
# per channel (build/update-channel.cjs `feedFor`): stable `https://update.tracy.ai/desktop` (bucket
# `tracy-releases`), dev `https://update.tracy.site/desktop` (bucket `tracy-releases-dev`); tracy-web
# streams the bucket there. `build/release.mjs prepare|publish` is the release path; this is the
# zip + dmg step it calls (and, with --upload, a hand upload).
#
# Order is the point (council 09/10): zip and dmg go up FIRST, the channel file LAST — a client
# reading the channel file must never be pointed at a file not uploaded yet.
#
# Upload uses the aws CLI against the S3-compatible store:
#   RELEASES_S3_ENDPOINT, RELEASES_S3_BUCKET (default: tracy-releases for stable, tracy-releases-dev for dev),
#   RELEASES_S3_ACCESS_KEY, RELEASES_S3_SECRET_KEY — a key that may WRITE that bucket, kept off the
#   tracy-web hosts (they only read).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
USAGE="usage: release.sh <out dir> <app> [<app>…] [--upload]"
OUT="${1:?$USAGE}"; shift
UPLOAD=""
APPS=()
for a in "$@"; do
  if [ "$a" = "--upload" ]; then UPLOAD=1; else APPS+=("$a"); fi
done
[ ${#APPS[@]} -gt 0 ] || { echo "$USAGE" >&2; exit 2; }
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
BUILD_ID="${BUILD_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
# RELEASE_DATE: `build/release.mjs prepare` passes the date it froze into the manifest, so this channel
# file and the frozen one carry the same date; a hand run takes now.
RELEASE_DATE="${RELEASE_DATE:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}"

CHANNEL=""; VERSION=""; SEEN_ARCHS=" "; ARTIFACTS=(); CHECKED_APPS=(); CHECKED_ARCHS=()
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

for APP in "${APPS[@]}"; do
  [ -d "$APP" ] || { echo "release: no app at $APP" >&2; exit 2; }
  APP="$(cd "$APP" && pwd)"
  RES="$APP/Contents/Resources"
  PLIST="$APP/Contents/Info.plist"
  C="$(cat "$RES/app/update-channel" 2>/dev/null || true)"
  [ -n "$C" ] || { echo "release: $APP has no update channel — only a stable or dev build can be released" >&2; exit 2; }
  [ -f "$RES/app-update.yml" ] || { echo "release: $APP has no app-update.yml" >&2; exit 2; }
  # The app's own package.json holds the full version (`X.Y.Z` or `X.Y.Z-dev.N`, what app.getVersion()
  # reports and the updater compares); Info.plist holds its numeric core (build/package.sh).
  V="$(node -p "require('$RES/app/package.json').version")"
  SHORT="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
  [ "$SHORT" = "${V%%-*}" ] || { echo "release: Info.plist says $SHORT, the app's package.json $V" >&2; exit 2; }
  [ -z "$CHANNEL" ] || [ "$C" = "$CHANNEL" ] || { echo "release: $APP is channel $C, the others $CHANNEL" >&2; exit 2; }
  [ -z "$VERSION" ] || [ "$V" = "$VERSION" ] || { echo "release: $APP is version $V, the others $VERSION" >&2; exit 2; }
  CHANNEL="$C"; VERSION="$V"
  ARCH="$(lipo -archs "$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")")"
  case "$ARCH" in arm64) ;; x86_64) ARCH=x64 ;; "x86_64 arm64"|"arm64 x86_64") ARCH=universal ;;
    *) echo "release: an app is arm64, x86_64 or both, got: $ARCH" >&2; exit 2 ;; esac
  case "$SEEN_ARCHS" in *" $ARCH "*) echo "release: two $ARCH apps given" >&2; exit 2 ;; esac
  SEEN_ARCHS="$SEEN_ARCHS$ARCH "

  # What a client accepts: Developer ID, valid deep, notarized and stapled.
  codesign --verify --deep --strict "$APP"
  # Read into a variable first: `codesign … | grep -q` under pipefail fails on a MATCH — grep exits
  # at the first hit, codesign dies of SIGPIPE, and the pipeline reports that (measured 09/10).
  SIGNATURE="$(codesign -dv --verbose=2 "$APP" 2>&1)"
  grep -q '^Authority=Developer ID Application: ' <<<"$SIGNATURE" || {
    echo "release: $APP is not signed with a Developer ID — Squirrel.Mac on the clients would refuse it" >&2; exit 2; }
  xcrun stapler validate "$APP" >/dev/null || { echo "release: $APP is not notarized and stapled" >&2; exit 2; }
  CHECKED_APPS+=("$APP"); CHECKED_ARCHS+=("$ARCH")
done
has() { case "$SEEN_ARCHS" in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
if has universal && ! { has arm64 && has x64; }; then
  echo "release: a universal app ships with both arch apps — their zips are what each Mac updates from" >&2; exit 2
fi

name() { node --input-type=module -e "import { artifactName } from '$HERE/release-feed.mjs'; process.stdout.write(artifactName({ channel: '$CHANNEL', version: '$VERSION', arch: '$ARCH', ext: '$1' }))"; }
dmg() {
  rm -f "$2"
  rm -rf "$STAGE/dmg" && mkdir "$STAGE/dmg"
  ditto "$1" "$STAGE/dmg/$(basename "$1")"
  ln -s /Applications "$STAGE/dmg/Applications"
  hdiutil create -quiet -volname "$(basename "$1" .app)" -srcfolder "$STAGE/dmg" -ov -format UDZO "$2"
  # The image itself: Developer ID, notarized, stapled (build/sign.sh) — Gatekeeper judges it before
  # the app inside. Then checked as a client's Mac will: anything less stops the release here.
  bash "$HERE/sign.sh" "$2"
  local verdict
  verdict="$(spctl -a -t open --context context:primary-signature -vv "$2" 2>&1 || true)"
  grep -q '^source=Notarized Developer ID$' <<<"$verdict" || {
    echo "release: $2 is not a notarized Developer ID image: $verdict" >&2; exit 2; }
  xcrun stapler validate "$2" >/dev/null || { echo "release: $2 has no stapled ticket" >&2; exit 2; }
  ARTIFACTS+=("$2")
}
for i in "${!CHECKED_APPS[@]}"; do
  APP="${CHECKED_APPS[$i]}"; ARCH="${CHECKED_ARCHS[$i]}"
  if [ "$ARCH" = universal ]; then dmg "$APP" "$OUT/$(name dmg)"; continue; fi
  ZIP="$OUT/$(name zip)"
  rm -f "$ZIP"
  # `--sequesterRsrc --keepParent`: what electron-builder does, and what Squirrel.Mac unpacks.
  ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
  ARTIFACTS+=("$ZIP")
  has universal || dmg "$APP" "$OUT/$(name dmg)"
done

FOLDER="$CHANNEL/$VERSION/$BUILD_ID"
RELEASE_DATE="$RELEASE_DATE" BUILD_ID="$BUILD_ID" RELEASE_FOLDER="$FOLDER" \
  node "$HERE/release-feed.mjs" "$VERSION" "${ARTIFACTS[@]}" > "$OUT/$CHANNEL-mac.yml"
echo "release: $OUT/$CHANNEL-mac.yml"
cat "$OUT/$CHANNEL-mac.yml"

[ -n "$UPLOAD" ] || { echo "release: local only (pass --upload to publish)"; exit 0; }

: "${RELEASES_S3_ENDPOINT:?}" "${RELEASES_S3_ACCESS_KEY:?}" "${RELEASES_S3_SECRET_KEY:?}"
DEFAULT_BUCKET=tracy-releases
[ "$CHANNEL" != dev ] || DEFAULT_BUCKET=tracy-releases-dev
BUCKET="${RELEASES_S3_BUCKET:-$DEFAULT_BUCKET}"
s3() {
  AWS_ACCESS_KEY_ID="$RELEASES_S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$RELEASES_S3_SECRET_KEY" AWS_DEFAULT_REGION=auto \
    aws --endpoint-url "$RELEASES_S3_ENDPOINT" s3 cp "$@"
}
for f in "${ARTIFACTS[@]}"; do s3 "$f" "s3://$BUCKET/desktop/$FOLDER/$(basename "$f")"; done
s3 "$OUT/$CHANNEL-mac.yml" "s3://$BUCKET/desktop/$CHANNEL-mac.yml" --content-type 'text/yaml'
echo "release: published $CHANNEL $VERSION (${SEEN_ARCHS# }) as build $BUILD_ID"
