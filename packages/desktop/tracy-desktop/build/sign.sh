#!/usr/bin/env bash
#
# Sign (and notarize, when the papers are present) a built `Tracy Cowork.app` — or a release dmg.
#
#   bash build/sign.sh "<path>/Tracy Cowork.app"
#   bash build/sign.sh "<path>/Tracy-Cowork-Dev-<version>-universal.dmg"
#
# A DMG is signed as one file with the Developer ID (no hardened runtime: it is not code), sent to
# Apple as it is, and stapled — Apple's path for a downloaded dmg: Gatekeeper judges the image before
# the app inside, and a stapled image opens offline too. A dmg is never signed ad-hoc: without a
# Developer ID this stops (`build/release.sh` makes a dmg only of Developer ID apps anyway).
#
# Split out of package.sh (07/10/2026) so the step can run on the machine that holds the Developer
# ID certificate on an app built anywhere. Notary papers: TRACY_NOTARY_ENV names an env
# file (default: <repo>/.env.apple-notary); see the Notarize section below.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="${1:?usage: sign.sh <path to .app or .dmg>}"
KIND=app
case "$APP" in *.dmg) KIND=dmg ;; esac
if [ "$KIND" = dmg ]; then
  [ -f "$APP" ] || { echo "sign: no dmg at $APP" >&2; exit 2; }
  APP="$(cd "$(dirname "$APP")" && pwd)/$(basename "$APP")"
else
  [ -d "$APP" ] || { echo "sign: no app at $APP" >&2; exit 2; }
  APP="$(cd "$APP" && pwd)"
fi
OUT="$(dirname "$APP")"
NAME="$(basename "$APP" .app)"
REPO_ROOT="$(cd "$HERE/../../../.." 2>/dev/null && pwd || echo "")"
# Notary papers: TRACY_NOTARY_ENV, else the checkout's .env.apple-notary, else the signing machine's
# ~/TracyHQ/.infra/apple-notary.env — release.mjs builds in a temporary worktree that has no
# .env.apple-notary, so the API key of an unattended release lives in the fixed place.
NOTARY_ENV="${TRACY_NOTARY_ENV:-$REPO_ROOT/.env.apple-notary}"
[ -n "${TRACY_NOTARY_ENV:-}" ] || [ -f "$NOTARY_ENV" ] || NOTARY_ENV="$HOME/TracyHQ/.infra/apple-notary.env"

# The Developer ID's own keychain, opened from its password file (no-op where there is none).
bash "$HERE/unlock-signing.sh"

# ── Sign ──────────────────────────────────────────────────────────────────────
#
# Developer ID if present, ad-hoc if not. The two differ in RANK, not in quality: ad-hoc is only
# enough for macOS to run the app on the very machine that built it; Developer ID + hardened runtime
# is a NECESSARY condition for notarizing, and without notarizing other machines still block it.
# `|| true`: with no Developer ID on the machine `grep` finds nothing, and under `pipefail` +
# `set -e` that ended the whole script right here without a word (measured 07/10).
# With the signing keychain present, the identity is looked up and used THERE only: the same
# certificate also sits in the login keychain, and a name both keychains answer is ambiguous to codesign.
SIGN_KEYCHAIN="${TRACY_SIGN_KEYCHAIN:-$HOME/Library/Keychains/tracy-signing.keychain-db}"
KEYCHAIN_ARGS=()
[ -f "$SIGN_KEYCHAIN" ] && KEYCHAIN_ARGS=(--keychain "$SIGN_KEYCHAIN")
IDENTITY="${TRACY_SIGN_IDENTITY:-$(security find-identity -v -p codesigning ${KEYCHAIN_ARGS[@]+"${KEYCHAIN_ARGS[1]}"} 2>/dev/null \
  | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"' || true)}"

if [ "$KIND" = dmg ]; then
  [ -n "$IDENTITY" ] || { echo "sign: a dmg is signed with a Developer ID only, and this machine has none" >&2; exit 2; }
  echo "sign: dmg — signing with $IDENTITY"
  codesign --force --timestamp ${KEYCHAIN_ARGS[@]+"${KEYCHAIN_ARGS[@]}"} --sign "$IDENTITY" "$APP"
  codesign --verify --strict --verbose=1 "$APP" && echo "sign: dmg signature valid"
elif [ -n "$IDENTITY" ]; then
  echo "sign: signing with $IDENTITY"

  # SIGN FROM THE INSIDE OUT, AND "INSIDE" MEANS EVERY MACH-O ONE BY ONE.
  #
  # Signing a bundle does NOT sign the binaries nested inside it — it only seals what is already
  # signed. The first version signed only `*.framework` and `*.app` and sent it off, and Apple returned
  # Invalid with exactly six forgotten things: four `.dylib` in `Electron Framework/Libraries`, Squirrel's
  # `ShipIt`, and `chrome_crashpad_handler`. They sit in no child bundle, so no loop over
  # `*.framework`/`*.app` reached them.
  #
  # `--deep` does not save it either and Apple advises against it: it signs in the wrong order and
  # skips child bundles' entitlements.
  sign() { codesign --force --timestamp --options runtime ${KEYCHAIN_ARGS[@]+"${KEYCHAIN_ARGS[@]}"} "$@"; }

  # 1. Libraries and loose binaries — deepest, no entitlements (they are not processes).
  while IFS= read -r -d '' f; do
    case "$(file -b "$f" 2>/dev/null)" in Mach-O*) sign --sign "$IDENTITY" "$f" ;; esac
  done < <(find "$APP/Contents" -type f \( -name "*.dylib" -o -name "*.so" -o -name "*.node" \) -print0 2>/dev/null)

  # 2. Executables OUTSIDE every child bundle (ShipIt, chrome_crashpad_handler). Filter out
  #    those that are already a bundle's main executable — the bundle is signed in a later step.
  while IFS= read -r -d '' f; do
    case "$f" in
      */Contents/MacOS/*) continue ;;
      */Versions/A/[A-Z]*) [ -x "$f" ] && [ ! -d "$f" ] && case "$(basename "$f")" in
          Mantle|Squirrel|ReactiveObjC|"Electron Framework") continue ;; esac ;;
    esac
    case "$(file -b "$f" 2>/dev/null)" in Mach-O*) sign --sign "$IDENTITY" "$f" ;; esac
  done < <(find "$APP/Contents" -type f -perm -111 ! -name "*.dylib" -print0 2>/dev/null)

  # 3. Helper .app — these are real processes and need entitlements.
  while IFS= read -r -d '' inner; do
    sign --entitlements "$HERE/entitlements.plist" --sign "$IDENTITY" "$inner"
  done < <(find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.app" -print0 2>/dev/null)

  # 4. Framework bundles — seal what step 1 just signed.
  while IFS= read -r -d '' inner; do
    sign --sign "$IDENTITY" "$inner"
  done < <(find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.framework" -print0 2>/dev/null)

  # 5. The app itself.
  sign --entitlements "$HERE/entitlements.plist" --sign "$IDENTITY" "$APP"

  # Check with the very check Apple uses, not a bare `--verify`: `--deep --strict` goes down into
  # every nested binary, exactly where the loops above might still miss something.
  codesign --verify --deep --strict --verbose=1 "$APP" && echo "sign: signature valid (deep)"
else
  echo "sign: ⚠ no Developer ID certificate — signing ad-hoc, the app runs only on this machine" >&2
  codesign --force --deep --sign - "$APP" 2>/dev/null || true
fi

# ── Notarize ──────────────────────────────────────────────────────────────────
#
# RUNS WHEN THE PAPERS ARE THERE, SKIPS WHEN NOT — and says what is missing. Without notarizing,
# Gatekeeper on OTHER machines still blocks the app even with a Developer ID signature. On the machine
# that built it there is no visible difference, so this is exactly the gap that only shows when the app
# is handed to someone else.
#
# Two methods, and neither puts a secret on the command line:
#   A. App Store Connect API key: TRACY_NOTARY_KEY (.p8 path) + TRACY_NOTARY_KEY_ID + TRACY_NOTARY_ISSUER
#   B. Keychain profile:          TRACY_NOTARY_PROFILE (default `tracy-notary`), stored once per machine:
#        xcrun notarytool store-credentials tracy-notary --apple-id <APPLE_ID> --team-id <APPLE_TEAM_ID>
#      (it prompts for the app-specific password, so the password never lands in argv or shell history).
#
# 🔒 NEVER `--password` ON THE COMMAND LINE. Until 09/10/2026 method B passed the app-specific
# password as an argument, and any `ps` on the signing machine during the minutes notarytool waits printed
# it (seen 09/10 during the auto-update spike). The profile lives in the login keychain, so the SSH
# session that signs must unlock it anyway — the same unlock the certificate already needs.
#
# Read the notary credentials from disk, never from a runbook: an older runbook named an API key
# that did not match the one actually installed. They load by themselves when the repo has the
# file, so packaging depends on no other repo and nobody has to remember a manual `source`.
# The file is in `.gitignore` (`.env.*`) — it carries the Apple ID's app-specific password.
if [ -f "$NOTARY_ENV" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$NOTARY_ENV"
  set +a
fi

notarize_args=()
if [ -n "${TRACY_NOTARY_KEY:-}" ] && [ -n "${TRACY_NOTARY_KEY_ID:-}" ] && [ -n "${TRACY_NOTARY_ISSUER:-}" ]; then
  notarize_args=(--key "$TRACY_NOTARY_KEY" --key-id "$TRACY_NOTARY_KEY_ID" --issuer "$TRACY_NOTARY_ISSUER")
elif [ -n "$IDENTITY" ]; then
  # `history` is the cheapest call that proves the profile exists AND its credentials still work.
  NOTARY_PROFILE="${TRACY_NOTARY_PROFILE:-tracy-notary}"
  if PROFILE_CHECK="$(xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" 2>&1)"; then
    notarize_args=(--keychain-profile "$NOTARY_PROFILE")
  else
    # Say WHY: missing, locked keychain and rejected credentials all end here and need different fixes.
    echo "sign: keychain profile '$NOTARY_PROFILE' does not work: $(printf '%s' "$PROFILE_CHECK" | head -3 | tr '\n' ' ')" >&2
    echo "sign:   store it once on this machine: xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id ${APPLE_ID:-<APPLE_ID>} --team-id ${APPLE_TEAM_ID:-<APPLE_TEAM_ID>}" >&2
  fi
fi

if [ ${#notarize_args[@]} -gt 0 ] && [ -n "$IDENTITY" ]; then
  # An app goes to Apple zipped; a dmg goes as it is.
  ZIP="$APP"
  [ "$KIND" = dmg ] || { ZIP="$OUT/$NAME.zip"; ditto -c -k --keepParent "$APP" "$ZIP"; }
  echo "sign: sending to Apple for notarization (takes a few minutes)…"
  xcrun notarytool submit "$ZIP" "${notarize_args[@]}" --wait
  # Staple onto the app itself: without stapling, every launch has to ask Apple, and when offline
  # it blocks.
  xcrun stapler staple "$APP"
  xcrun stapler validate "$APP" && echo "sign: notarized and stapled"
  [ "$KIND" = dmg ] || rm -f "$ZIP"
else
  echo "sign: ⏭ skipping notarization — the papers are incomplete." >&2
  echo "sign:   Method A: TRACY_NOTARY_KEY=<path to .p8> TRACY_NOTARY_KEY_ID=<id> TRACY_NOTARY_ISSUER=<uuid>" >&2
  echo "sign:   Method B: xcrun notarytool store-credentials tracy-notary --apple-id <APPLE_ID> --team-id <APPLE_TEAM_ID>" >&2
  echo "sign:   Without notarization the app runs on this machine, but Gatekeeper blocks it on OTHER machines." >&2
fi
