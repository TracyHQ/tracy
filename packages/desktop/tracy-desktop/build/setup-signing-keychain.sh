#!/usr/bin/env bash
#
# ONE TIME, AT THE iMac's SCREEN: move a copy of the Developer ID into its own keychain, so that
# build/unlock-signing.sh can open it later with nobody at the machine.
#
#   bash build/setup-signing-keychain.sh
#
# What it does:
#   1. makes a random password, kept in ~/TracyHQ/.infra/tracy-signing-keychain.pass (chmod 600);
#   2. creates ~/Library/Keychains/tracy-signing.keychain-db with it, never locking by itself;
#   3. exports the login keychain's identities as a .p12 — macOS asks "Allow" ON THE SCREEN, once per
#      key: that click is why this runs at the iMac, not over SSH;
#   4. keeps that .p12 and its password in ~/TracyHQ/.infra/ as the certificate's backup (there was
#      only one copy, in the login keychain);
#   5. imports it into the new keychain, lets codesign use the key without a dialog, and puts the
#      keychain FIRST on the user's search list.
# The login keychain is only read. Running it again stops when the signing keychain already exists.
set -euo pipefail
KEYCHAIN="$HOME/Library/Keychains/tracy-signing.keychain-db"
INFRA="$HOME/TracyHQ/.infra"
PASS_FILE="$INFRA/tracy-signing-keychain.pass"
P12="$INFRA/developer-id-backup.p12"
P12_PASS_FILE="$INFRA/developer-id-backup.p12.pass"
LOGIN="$HOME/Library/Keychains/login.keychain-db"

[ -e "$KEYCHAIN" ] && { echo "setup: $KEYCHAIN already exists — nothing to do" >&2; exit 1; }
security find-identity -v -p codesigning "$LOGIN" | grep -q 'Developer ID Application' \
  || { echo "setup: no Developer ID Application identity in $LOGIN" >&2; exit 1; }
mkdir -p "$INFRA"
umask 077

# Hex only, so it needs no quoting inside `security -i`. Not `tr < /dev/urandom | head`: under
# pipefail tr's SIGPIPE ended the script right after the first password (exit 141, 10/10/2026).
random() { openssl rand -hex 20; }
random > "$PASS_FILE"
random > "$P12_PASS_FILE"
PASS="$(cat "$PASS_FILE")"
P12_PASS="$(cat "$P12_PASS_FILE")"

# Passwords travel on stdin (`security -i`), never on argv.
printf 'create-keychain -p "%s" "%s"\n' "$PASS" "$KEYCHAIN" | security -i > /dev/null
security set-keychain-settings "$KEYCHAIN"   # no -t, no -l: it never locks by itself

echo "setup: exporting the login keychain's identities — click Allow on the screen for each key"
printf 'export -k "%s" -t identities -f pkcs12 -P "%s" -o "%s"\n' "$LOGIN" "$P12_PASS" "$P12" | security -i
[ -s "$P12" ] || { echo "setup: the export wrote nothing (Allow not clicked?)" >&2; exit 1; }

printf 'unlock-keychain -p "%s" "%s"\n' "$PASS" "$KEYCHAIN" | security -i > /dev/null
printf 'import "%s" -k "%s" -P "%s" -T /usr/bin/codesign\n' "$P12" "$KEYCHAIN" "$P12_PASS" | security -i
printf 'set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "%s" "%s"\n' "$PASS" "$KEYCHAIN" \
  | security -i > /dev/null

# Ours FIRST, then every keychain already on the list. The same certificate stays in the login
# keychain, and codesign without --keychain takes the first match: with login first it picked the
# locked copy over SSH and failed with errSecInternalComponent (measured 10/10/2026 on the iMac).
# The default keychain (where apps save new items) stays the login keychain.
LIST=("$KEYCHAIN")
while IFS= read -r k; do
  k="$(echo "$k" | tr -d ' "')"
  [ "$k" = "$KEYCHAIN" ] || LIST+=("$k")
done < <(security list-keychains -d user)
security list-keychains -d user -s "${LIST[@]}"

security find-identity -v -p codesigning "$KEYCHAIN"
echo "setup: done — check over SSH with: bash build/unlock-signing.sh && security find-identity -v -p codesigning $KEYCHAIN"
