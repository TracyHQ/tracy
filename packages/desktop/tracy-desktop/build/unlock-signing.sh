#!/usr/bin/env bash
#
# Unlock the signing keychain so a release runs with nobody at the iMac (Lee, 10/10/2026: releases
# are started from a phone). The Developer ID lives in its own keychain, `tracy-signing.keychain-db`,
# whose password sits in a file only `lee` reads; the login keychain is never touched.
#
#   bash build/unlock-signing.sh
#
# Exit 0: unlocked, or no signing keychain on this machine (then signing uses whatever the search
# list holds, as before). Exit 1: the keychain is there but would not unlock — say why and stop.
# One-time setup, at the iMac's screen: build/setup-signing-keychain.sh.
set -euo pipefail
KEYCHAIN="${TRACY_SIGN_KEYCHAIN:-$HOME/Library/Keychains/tracy-signing.keychain-db}"
PASS_FILE="${TRACY_SIGN_KEYCHAIN_PASS:-$HOME/TracyHQ/.infra/tracy-signing-keychain.pass}"

[ -f "$KEYCHAIN" ] || exit 0
[ -f "$PASS_FILE" ] || { echo "unlock-signing: $KEYCHAIN exists but $PASS_FILE does not" >&2; exit 1; }
case "$(stat -f '%Lp' "$PASS_FILE")" in
  600 | 400) ;;
  *) echo "unlock-signing: $PASS_FILE is readable by others — chmod 600 it first" >&2; exit 1 ;;
esac

# The password goes to `security` on stdin, never on its command line: `ps` would print argv.
# setup-signing-keychain.sh makes it from hex digits only, so it needs no quoting beyond "".
PASS="$(tr -d '\n' < "$PASS_FILE")"
# `security -i` exits non-zero when the unlock fails (measured: 51 on a wrong password). Never probe a
# locked keychain with another command instead: in a session with a screen it waits on a dialog.
if ! WHY="$(printf 'unlock-keychain -p "%s" "%s"\n' "$PASS" "$KEYCHAIN" | security -i 2>&1)"; then
  echo "unlock-signing: $KEYCHAIN did not unlock — is $PASS_FILE its password? ${WHY%%$'\n'*}" >&2
  exit 1
fi
