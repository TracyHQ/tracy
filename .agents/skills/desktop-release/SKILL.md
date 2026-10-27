---
name: desktop-release
description: Release the Tracy Cowork desktop app (macOS) — build a stable/dev/preview candidate, check it before writing the update feed, accept it, and hotfix the shell. Use when asked to ship an app build, build/sign/notarize the desktop app, or urgently fix a released Electron shell.
---

# Releasing the desktop app

This skill is the order of work. The release runbook of your installation holds the reasons, the signing identity and the
failure table; read it before step 1.

**Hard stop:** write `stable-mac.yml` and the `desktop-v*` tag only when a maintainer says "release stable" in this session.
The `dev` and `preview` channels you may take to the end yourself.

## Steps

1. **Pick the kind of build and the sha.** Stable: a sha on `origin/main`. Dev: a sha on `origin/develop`, the app pointed at the
   dev origin. Preview: any other origin, no feed. Put kind + sha + version (`packages/desktop/tracy-desktop/package.json`) in the
   first sentence of your report.
   *Done when:* the version is higher than the one on the channel's feed.
2. **Server first.** Run the door-contract check (`build/check-server-contract.mjs <origin>`) against the variant's origin.
   *Done when:* every door PASSes. A FAIL → stop and say which door; the shell never ships ahead of the server.
3. **Build on a Mac from a clean checkout of the sha.** The login keychain must be unlocked in the session that signs. Sign with
   Developer ID, notarize (keychain profile, also needs the unlocked keychain) and staple; a feed build without signature or
   notarization stops here. By default three apps are built — arm64, x64 and a **universal** one merged from the two — as
   `…-arm64.zip`, `…-x64.zip` (updates) and **one** `…-universal.dmg` (first install); `--arch` is only for a quick one-chip try.
   *Done when:* for **each** artifact, `spctl -a -vvv` on the app inside says `Notarized Developer ID` with your Team ID, and
   `lipo -archs` shows the right chips (universal dmg: `x86_64 arm64`).
4. **Upload candidate + manifest** to `desktop/<variant>/<version>/<build-id>/`, with release notes gathered by
   `build/collect-release-notes.mjs` and frozen — that is `release:prepare`.
   Notes are refused when they contain non-English text or third-party names (`build/third-party-names.mjs`): rewrite them as what
   the user sees, never loosen the list to get through.
5. **Accept** the candidate against the runbook's acceptance list and keep the evidence with the release.
   *Done when:* every item has a measured result; nothing is "probably fine".
6. **Check before writing the feed:** that is `release:publish` (it runs `build/release-preflight.mjs` on the candidate downloaded
   back from the store, one `signature <file>` line per artifact). Run it on macOS: another OS cannot open the app, and against the
   real store that is a FAIL.
   *Done when:* every line PASSes; any "not checked" line is explained in the report.
7. **Write the feed** (dev: yourself; stable: see the hard stop) — the yml is written once, last, and read back through its public
   URL; stable adds the tag.

## Shell hotfix

`fix/desktop-…` → PR → `main` → a patch release → merge back into `develop`. A broken build is replaced by a higher patch; the feed
only ever moves up.
