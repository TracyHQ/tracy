# Section 8 — ship the contract · Section 9 — release the pack + K6 pass 2

Read after `SKILL.md`, when you reach section 8 (single template: right after section 7; batch: per the batch schedule). The order of
the work and which path skips which step: `SKILL.md` section 2 (path table) + section 8. Variables are declared in sections 3 and 7 of
`SKILL.md` (`$P` = the `tch` profile folder, section 7 step 5); "section N" below means a section of `SKILL.md`. At each
**stop point** below: say which step you are at and what needs doing, then wait for a go (table in section 10).

## Section 8 — ship the contract

1. **Stop point:** commit + `tch` PR carrying the profile + journal entry (in the same PR as the pin of step 6 or separately:
   as the requester says).
2. `claude-cowork` cuts exactly version `"$COWORK_VER"` following precedent `422d70c` (0.19.1), in `"$CW_WT"`:
   - the version in `joomla/cowork/pkg_claudecowork.xml` and `joomla/cowork/com_claudecowork/claudecowork.xml`;
   - `joomla/update.xml`: add an `<update>` block for the new version (copy the previous version's block, change `version`,
     `description`, `infourl`, `downloadurl`);
   - `joomla/update.json`: `version`, `package`, `url` to the new version;
   - add `"$CID"` to the list in `joomla/cowork/tests/contracts.php` (the `foreach([…] as $id)` line
     right above `checkTrue("the package carries $id", …)`);
   - `cd "$CW_WT/joomla/cowork" && ./build.sh` then
     `docker run --rm -v "$PWD/../..":/w -w /w/joomla/cowork php:8.3-cli php tests/run.php` and
     `docker run --rm -e COWORK_TEST_READS=paged -v "$PWD/../..":/w -w /w/joomla/cowork php:8.3-cli php tests/run.php`
     → no errors.
3. **Stop point:** merge into `main` of `claude-cowork` + publish release `joomla-v$COWORK_VER`. Note for the
   requester: the new version becomes "latest" in `update.json` → every site with the plugin will be offered the update.
4. Check that the plugin version just released carries the right contract:
   `node "$QC/check-plugin-release.mjs" --version "$COWORK_VER" --contract-id "$CID" --profile "$P/$VER"`.
   Red because the version differs (e.g. someone else released the same number) → capture again with the real number (section 7 from step 4) + trial
   bind again, before pinning.
5. **Upload the files** (full path only; direct-capture path: the files are already on the release, go to step 6).
   tracy-dev prints a command that uploads **every file in one go** (`gh release upload … --clobber <every file>` from the site's
   `dist/`) — do not use that command as is: upload from `"$PACK"`, in two rounds (upload the files, then flip
   the switch `tracy_setting.json` last — section 9). Do not delete old files on the release, do not change the prerelease flag.
   The release does not exist → stop, report.
   - `cd "$PACK" && shasum -a 256 -c "$PACK_SHA"` → every line OK (the pack has not changed).
   - The webroot / database file names are read from the pack's `tracy_setting.json` (as in section 7 step 1):

     ```bash
     PACK_WEBROOT_FILE=$(node -p 'require(process.argv[1]).install.webroot.file' "$PACK/tracy_setting.json")
     PACK_DATABASE_FILE=$(node -p 'require(process.argv[1]).install.database.file' "$PACK/tracy_setting.json")
     ```

   - **Stop point — upload the files** (every file except `tracy_setting.json`):

     ```bash
     cd "$PACK" && gh release upload "$REL" -R JoomlArt-Products/joomlart-products --clobber \
       README.md SHA256SUMS VERIFICATION.json manifest.json "$PACK_DATABASE_FILE" "$PACK_WEBROOT_FILE"
     ```

   - Download and check: `gh release download "$REL" -R JoomlArt-Products/joomlart-products -D "$WORK/release-$VER" -p "$PACK_WEBROOT_FILE" -p "$PACK_DATABASE_FILE" -p SHA256SUMS -p manifest.json -p README.md -p VERIFICATION.json`
     → `cd "$WORK/release-$VER" && shasum -a 256 -c --ignore-missing "$PACK_SHA"` → 6 lines OK.
6. Tracy pins, in `"$TCH_WT"`: the two `quickstarts.json` (`apps/tracy-web/src/` and
   `packages/fleet/tracy-fleet-operation/scripts/provision/`, identical byte for byte) + the two
   `design-templates.json` (same two places), fields following precedent `632ffc631`:
   - `quickstarts.json` entry `"$REL"`: `version`; `webroot` and `database` (`file`, `bytes`, `sha256` taken from
     `"$PACK"`, `githubAssetId`, `url`); `cowork` (`file` `pkg_claudecowork-<X>.zip`, `version`, `bytes`,
     `sha256`, `url` of release `joomla-v<X>` of `TracyHQ/claude-cowork`, `contractFiles` = sha256 of the three profile
     files, `contractVersions` + `alsoCarries` if the plugin still carries an old contract version of the template); `contract` =
     `"$CID"`.
   - Only moving the plugin (contract unchanged, e.g. a `joomla-v<X>` version that only adds fixes): **do not type by hand** —
     `node scripts/pin-joomla-cowork.mjs --tag joomla-v<X> --dry-run`, then drop `--dry-run`. The script reads the release,
     downloads the zip, checks every profile the pin records, then writes exactly the five `cowork` values in both `quickstarts.json`.
   - `githubAssetId` (a number) of the webroot + database is read from the release, filtered by the exact file name — full path:
     `W="$PACK_WEBROOT_FILE" D="$PACK_DATABASE_FILE"` (step 5); direct-capture path (skips step 5):
     `W="$REL_WEBROOT" D="$REL_DATABASE"` (`SKILL.md` section 2):

     ```bash
     gh api "repos/JoomlArt-Products/joomlart-products/releases/tags/$(node -p 'encodeURIComponent(process.argv[1])' "$REL")" \
       --jq '.assets[] | "\(.id) \(.size) \(.name)"' | awk -v w="$W" -v d="$D" '$3 == w || $3 == d'
     ```

     `size` must equal the `bytes` of the file in `"$PACK"`.
   - `design-templates.json` (if the template has an entry): `base.version`, `template.version`, `contractProfile`,
     `contractFiles`, `coworkMinVersion`, `activation.id`.

   Single gates: `pnpm exec tsx scripts/check-all.ts --only contracts --only design-templates --only quickstart-overrides --only joomla-multilingual --only joomla-demo-trim`.
7. **Stop point:** `tch` PR into `develop` → merge → Tracy dev is rebuilt.

Note on `quickstarts.json`: `CLAUDE.md` and ADR 0017 say `quickstarts.json` was removed, but both files
are still tracked by git and `apps/tracy-web/src/lib/contracts.js` still reads them — step 6 follows the actual code.

## Section 9 — release the pack + K6 pass 2 (after Tracy dev has pinned)

Steps 1–4 are full path only: the file upload was done in section 8 step 5; here you flip the switch and run the checks after
it. The direct-capture path skips steps 1–4 and goes straight to step 5. Batch: this whole section follows the batch schedule.

1. Note for the requester before flipping the switch: the `joomlart-products` release is shared by dev + production — flipping
   the switch changes the template card on both; if production has not pinned yet, sites created on production get no contract.
2. **Stop point — flip the switch:**
   `cd "$PACK" && gh release upload "$REL" -R JoomlArt-Products/joomlart-products --clobber tracy_setting.json`.
3. K2+K3 pass 2: `node "$QC/check-release-fields.mjs" --contract "$P/$VER" --release "$REL"`.
4. `joomlart-products`: if the template's `product.yaml` still has `github_release_url` pointing at the installer
   (`…/quickstart/<slug>/j6/<…>-quickstart.zip`) → change exactly that line to `…/quickstart/<slug>/j6/tracy_setting.json`
   in `"$JAP"`, `make check` → exit 0 → **stop point:** `joomlart-products` PR (do not merge it yourself).
   Before editing: create the template's own branch (the section 3a worktree is still detached):
   `git -C "$JAP" switch -c "chore/$SLUG-quickstart-$(echo "$VER" | tr . -)"`.
5. **K6 pass 2 — stop point asking permission** (both paths, single template; never create a site on Tracy dev without
   approval): on Tracy dev `cowork.tracy.site`, **Add site** from the template card as a customer would → the site finishes building, Claude
   Cowork is the pinned version, one content slot can be edited through chat → delete it (**My Sites → Delete site**; the host answers 404).
   Never on production.
