# STATUS — tracy-fresco (JA Fresco → EmDash)

**Owner decisions on this template (2026-11-18), the only ones:** keep the credit line "Designed by JoomlArt.com."; carry byte-identical visual tiles; have the lens read changed tiles; re-run the independent review. Every other "decision" in `DECISIONS.md` is a lead decision or an agent default, and the older entries that said "owner decision" were relabelled on 2026-11-22.

Version 0.1.0, **not released**. Road `contract`. Branch `feat/emdash-port-fresco`, commits local, nothing pushed. Publish from the last commit of the branch (`git log -1`). Current state: see the last section (pack-51: Fast Gate signed on `fg-58`, four full-scope runs `f51-*` closed, visual-review receipt written; the release cut (`tools/release-chain.mjs`, 16 gates) waits for the independent receipt).

## Runtime identity
Package `packages/cms/tracy-emdash-theme-fresco`, id `tracy-fresco`, EmDash 1.1.0, Astro 7.4.12. To resume: `<evidence-dir>/bin/stand.sh` rebuilds the Joomla source stand (docker `fr-web` + `fr-db`, `127.0.0.1:18080`, image `fresco-snap-php:8.3` from the Dockerfile in `source/REBUILD.md`); `python3 -m http.server 18090` in `source/snapshot` is the `--source-site`; `pnpm exec astro dev --port 4360 --host 127.0.0.1` then `tools/bootstrap-site.sh http://127.0.0.1:4360 ./data` is the site. Evidence (renders, tiles, QA runs) is in `<evidence-dir>`, outside the repository.

## Phases and gates (evidence under `<evidence-dir>`)
- P0–P2 done (`checkpoint.json`); P3/P5 built: Home, Menu, About, Gallery, Chiefs, Offer, Contact, Blog, Post, Search, 404; P4.5/P4.6 files written; docs gate passes.
- **Fast Gate, machine:** `visual-qa.mjs --scope fast-gate` → `status=pass`, 8 pages × 6 variants, 0 findings (last run `qa/fg-23`).
- **Fast Gate, review:** signed (`fast-gate.mjs verdict` pass on `fg-58`, pack-51); history of the reader rounds and resolutions in DECISIONS D24 and the sections below.
- **P7:** machine gates contracts, distribution, preflight, browser, routing pass on pack-51 (`chain-51/qa.1`); the four full-scope tiers are read (`f51-*`), the Opus layout pass ran once (pass, one low note), stand receipts and `visual-review` receipt are in `<evidence-dir>/reviews-final-51`; `independent` receipt and `release.mjs` follow.
- **Design system (tdsr):** slot contract `packages/design/tracy-ds-slot/templates/emdash-tracy-fresco.json` (`ready: true`), palette file, role scan clean (0 unresolved), flow 34 of 34 steps pass on the 15 featured systems (page match 100%), `contracts/0.1.0/design-system-measurement.json` written with the preview block (light and dark, 15 pages, 0 misses). The readiness check itself (`scripts/template-design-system-readiness.mjs`) needs a release folder and was not run.
- **Content map / slot roles:** `contracts/0.1.0/content-map.json` (1178 slots, label rules 0 failing), `node scripts/slot-roles/check.mjs` passes. `template-kit.json` and `content-coverage.json` sit beside it (the kit is built on pack-54, see the last section); the kit has no `approval`: the owner approves it.
- **Road rows:** `apps/tracy-web/src/lib/emdash-tool.js`, its test, `Dockerfile` copies and `template-profiles.json` (logos `dark`) added; the `quickstart-render-map.json` row, the release `tracy_setting.json` and the customization readiness check are NOT done (they need the release).
- Tests: `node --test tests/*.test.mjs` 508 pass; `astro check` 0 errors; `pnpm lint` clean; kit sync 7/7; Content API gate ok; `generate-docs --check` ok; slot roles ok.
- Locked dependencies: `@hono/node-server` 2.1.6 and `hono` 4.13.16 (`pnpm audit --prod`: no known vulnerabilities).
- Publication scan (`scripts/opensource/scan.mjs` with a bsdtar stand-in for unzip): 0 hits left in this package after the allow-list rows added to `public-tree.json`; 239 blocking hits remain in other packages of the tree (not touched here).
- Language policy: `node scripts/check-language-policy.mjs --base <origin/develop sha> --head <HEAD>` finds 1510 lines (UI words, questionnaire, kit fixtures); the reasoned `lines` rows are generated into `<evidence-dir>/language-policy-rows.json` (1281 rows) and added to `scripts/language-policy.json` in the last commit.
- Regression case `tests/regression/cases/REG-PR-739-emdash-fresco-0-1-0.json` (feat).
- `pnpm build:check`: see "Gate results" below.

## Lead decisions applied (2026-11-19)
Accent colour kept, text on it dark ink (D13, measured 12.43:1; badge text on the source's green 7.95:1); menu items rewritten like Restaurant's (dish names and descriptions by `copy` itemFields, section titles by `rewrite`, prices stay); no Blog item in the header menu (D20); 404 keeps header and footer like Diner and Restaurant (D16).

## Not done
1. Full-scope visual review of the four tiers and the Opus layout pass; the signed Fast Gate verdict; receipts.
2. `tools/release-chain.mjs` (pack, clean install, `qa.mjs` with reviews, `release.mjs` with all 16 gates), the release folder, customization readiness, Design System readiness on the release.
3. Running the regression case on a stand of the release.
4. Known visual differences accepted by decision: see DECISIONS (D6, D11, D13, D16, D21–D26, D32–D34, D37–D40); footer spacing below 992 px matches the source since D38; testimonial arrows match the source ink box since D40 (glyph shape within 2 px).

## Next command
```
cd packages/cms/tracy-emdash-theme-fresco
# stand + site up (see Runtime identity), then
node ingest/build-contract.mjs --site http://127.0.0.1:4360
node tools/visual-qa.mjs --contract qa.contract.json --site http://127.0.0.1:4360 --source-site http://127.0.0.1:18090 --out <run> --scope fast-gate
# readers (perf/lens-groups.mjs briefs), closers, qa-notes merge per stage, then
node tools/fast-gate.mjs verdict <run> --contract qa.contract.json
node tools/visual-qa.mjs ... --scope full --fast-gate <run>      # four tiers, then readers per tier
node tools/release-chain.mjs --pack <new-dir> --target <new-clean-dir> --port <n> --source source/snapshot --reviews <receipts-dir> --out <chain-dir> -- --visual --source-site http://127.0.0.1:18090 --visual-fast-gate <run>
```

## State at the seventh time limit (2026-11-22)

Local commits only, nothing pushed. **The release is not cut and the Fast Gate verdict is not signed.** The final pack candidate is the pack of `chain-40` (clean install port 4420, contract revision 22, machine gates contracts, distribution, preflight, browser, routing pass); the Fast Gate runs `fg-39` to `fg-48` all pass the machine check.

**Lead decision 22/11 (D31):** a reader's notes are what the reader returned; the lead records a reader's final message verbatim as its note file with a `recorded-by:` line; an auto-mode-flagged report is dropped and its tiles get a fresh reader. Done for several groups (files with `recorded-by:` in the evidence folder `qa/fg-4x/notes/`; dropped reports in `notes-dropped/`).

**Real differences found by readers and fixed from source measurements this run (D30, D32):** 404 body line, menu section spacing and dish wrapping, About title gap, blog lead card ground and edge, post picture gaps and quote tone, article banner picture (the source's banner is `blogs/food/detail/item-1.jpg`), testimonial arrow tone, size and offset, Next chevron, chip ground, pagination, 390 menu heading and bar spacing, 390 copyright position, top bar address gap, section intro tone. Decided differences stay contract exceptions (`ingest/accepted-differences.json`, now with D32 for the byline gap kept for audit rule R8).

**Where the gate stands:** after fg-47 the closers left 12 notes reopened: testimonial arrows (2 to 3 px vertical offset, since set to 1 px), 390 copyright position (8 to 9 px, since set to 24 px margin), Next chevron weight and height (since redrawn at 14 px), and four "not checked" wrap notes on the Multi Column menu list that closers could not locate on a tile. fg-48 (on chain-40) re-read the 29 changed shots; its readers and closers were running at the time limit. Verdict unsigned: `node tools/fast-gate.mjs verdict <run>` once the open count is 0.

**Not done:** signed verdict, the four full tiers, the Opus layout pass, `visual-review` and `independent` receipts for the final pack, `release.mjs`, `design-system-roles.json`, `tracy_setting.json`, readiness checks. Build check: the red tests are not this branch's (five test files from PHP `dom`/`mbstring` and the Find cache, and `turbo-config` on the gitleaks binary).

## Next command
```
cd packages/cms/tracy-emdash-theme-fresco
node tools/generate-docs.mjs && node tools/release-chain.mjs --pack <new> --target <new-clean> --port <n> --source <snapshot folder> --reviews <receipts-dir> --out <chain-dir>
node tools/visual-qa.mjs --contract qa.contract.json --site http://127.0.0.1:<n> --source-site http://127.0.0.1:18090 --out <run> --scope fast-gate
node perf/carry-notes.mjs <old-run> <run>; node tools/qa-notes.mjs merge <run> --stage <id>; node perf/accepted-notes.mjs <run>; node perf/missing-brief.mjs <run> 26
```

## Eighth time limit (fg-48 on pack-40)

- fg-48 readers reported; the w1 and w4 reports were flagged by auto mode, so w1's files were moved to `<evidence-dir>/qa/fg-48/notes-dropped/` and `missing-1.md` and `missing-4.md` still need fresh readers.
- New real notes on fg-48 not yet answered: home 768 menu button icon size (about 20 px vs 10 px), 768 Private Event arrows weight; the rest match D22, D27, D32.
- The Fast Gate verdict is NOT signed, so the four tiers, Opus pass, receipts and `release.mjs` have not run. No release is cut.

## Ninth time limit (fg-49, fg-50 on pack-42)

- Measured and fixed: header menu icon 12.25 by 14 px (source 12 by 14), testimonial arrow ink 33.5 by 29 px and 390 offset. Decided or measured equal: D33 (Private Event arrows, Blackened Fish Sandwich wrap, menu wraps), D34 (share row, caret D6, second toggle D21, licence line D25, 404 footer, gallery tick).
- What auto mode flagged in a dropped report: the harness log gives only the category `Undermining Oversight` and withholds the report text; the dropped w1 files held an empty Notes table and an all-`clean` Seen table (26 `clean` verdicts) that the reader had written itself. New readers return their text as the final message and the lead records it verbatim (D31); readers cannot write their own files here (writes were denied).
- fg-49 closed out: 455 closed, 1 reopened (testimonial arrows at 390, since fixed). fg-50 (pack-42, port 4422, chain-42) has open count 0 and 14 changed shots to read (four briefs).
- Helper: `<evidence-dir>/bin/combine-close.py <run> <base-run>` rebuilds `<lens>-close.md` from the base run plus the run's `-close-*.md` files (latest wins).

## Tenth state (pack-44, fg-51 signed, tier 1 read)

- **Fast Gate verdict SIGNED** on `fg-51` (pack-44, clean install port 4424, contract revision 24, chain-44; machine gates contracts, distribution, preflight, browser, routing pass). Evidence in `<evidence-dir>/qa/fg-51`. Any later contract or page change makes the verdict stale (`visual-qa --scope full --fast-gate` says so) and needs a new fast-gate run with `perf/carry-notes.mjs`.
- **Full scope, machine side:** all four stages (`light-desktop`, `light-responsive`, `dark-desktop`, `dark-responsive`) run with 0 findings and 0 unclassified on pack-44 (`<evidence-dir>/qa/full-ld3`, `full-light-responsive`, `full-dark-desktop`, `full-dark-responsive`). The first run found 10 unclassified Search result titles; fixed by the rule `search-result-title` (D35, contract revision 24).
- **Full scope, readers (tier 1, light desktop, run `full-ld3`):** groups l1, l2, l3, l4 read all 84 tiles. Notes recorded verbatim for l1, l3, l4; l2's five blocks were returned (all clean) but are not yet written to `qa/full-ld3/notes/` and `color-l3.md` is not written either. Group 3 returned REAL differences from the source on pages the Fast Gate never covered (the Fast Gate pages are home, menu, about, gallery, offer, blog, post, not-found):
  - en-contact: form placeholders (site Name / Email / Phone, source "Your name" / "Email address" / "Your phone" and "Write a comment" in the message box; the source sets them with a script, the Forms plugin form needs `placeholder` values); an extra row of three social icons (seed `contact.socials`) the source capture does not show; the Send button sits flush under the message box where the source leaves about 32 px.
  - en-search: the contract shoots `/search?q=food` (results) while the source tile is the Smart Search landing page (title band reads "Smart Search" with a sub-title, empty field, a Search button with a magnifier icon, an "Advanced Search" button and help lines).
  Decide each (fix from the source measurement, or a DECISIONS entry plus contract exception), rebuild contract and pack, re-sign the Fast Gate, then re-read tier 1 changed tiles.
- **Still to do after tier 1 is clean:** tiers 2–4 readers (machine runs already pass), Opus layout pass once, `visual-review` and `independent` receipts on the final pack, `release.mjs` with all 16 gates, `design-system-roles.json`, `tracy_setting.json`, customization and Design System readiness, format/inventory/language checks.
- **How the readers work here:** readers cannot write files (the permission classifier denies it); each returns its blocks as the final message, and the lead writes them verbatim with `recorded-by:`. Use a new tag per run so carried files are not hit (`Write` fails on an existing file: `fg-50/notes` holds carried copies). `<evidence-dir>/bin/combine-close.py <run> <base-run>` rebuilds `<lens>-close.md` (base run plus the run's `-close-*.md`, latest wins); never overwrite the combined file from the new files alone.

## Eleventh state (pack-47, Fast Gate re-signed)

- **Fast Gate verdict SIGNED** on `fg-54` (pack-47, clean install port 4427, contract revision 27, chain-47; machine gates contracts, distribution, preflight, browser, routing pass). Nine shots changed against `fg-53` (blog and post in four tiers, the source menu tile) and were read by fresh readers; the one real note (menu rows 1 px) was measured and closed by the layout lens as sub-pixel rounding; the post share row closed by exception (D34). Evidence in `<evidence-dir>/qa/fg-54`.
- Full-scope machine run on pack-47 (`<evidence-dir>/qa/full-p47`): 17 pages, 102 axes, 0 findings, all four stages pass. Notes carried from `full-all1` by pixel identity; readers for changed or unread tiles, then closers for the seven contact/search notes fixed by D36–D38.
- Pack-46 is superseded: receipts and release use pack-47.
- **Full-scope read on pack-47 closed** (`<evidence-dir>/qa/full-p47`): all four tiers, 17 pages, every tile opened by a reader; 0 open, 0 reopened after the closers and the coordinator's exceptions (D37 Advanced Search, magnifier and finder help paragraphs; D34 share row). Stand receipts for pack-47 are in `<evidence-dir>/reviews-final-47`. Next: Opus layout pass, `visual-review` and `independent` receipts, `release.mjs`.

## Twelfth state (pack-48)

- **Independent review of pack-47 said "not pass"** (process still to come, plus real findings): accepted-difference patterns too broad (a real contact defect had been closed under D11), three stale reasons, empty sitemap, `[LEE]` flags. Fixed in this branch (D39): patterns now name the decided difference, the D27 footer-gap and wrap-width entries are removed, the share-row reason follows D34; the stale contact, footer and Search-state notes were closed by their lens on the current tile, not by a pattern. Sitemap emptiness is kit-wide (no collection opts in) and is left for the kit; D21, D22, D25, D32–D34 and D38 remain agent defaults waiting for the owner's acceptance.
- **pack-48** (clean install port 4428, contract revision 28): machine gates contracts, distribution, preflight, browser, routing pass (`chain-48/qa.5`); Fast Gate **signed on `fg-55`** (0 tiles re-read); four full-scope stage runs `f48-<stage>` closed (3 source tiles that flickered were re-read); eight stand receipts and the `visual-review` receipt written in `<evidence-dir>/reviews-final-48`. Opus layout pass: pass (one low byline note, D32), run on pack-47 tiles that are pixel-identical to pack-48's.
- Next: second independent review of pack-48, `independent` receipt, chain `--from qa` with `--visual --visual-fast-gate fg-55`, `release.mjs`, `design-system-roles.json`, `tracy_setting.json`, readiness.

## Thirteenth state (pack-49)

- The second independent review (pack-48) again said "not pass": patterns still closed made-up defects on the same subjects, N-581d4d (Search card padding, 16 px at 768 and 390) was a real difference closed under D21, and five lens-reopened Search notes were closed by the coordinator's exceptions. Fixed in pack-49: exception patterns anchored to the decided difference (a self-test of 44 made-up defects was reported as 'none match'; the third review measured 35 still matching, see the next section), Search card padding matches the source (D40), README pointers. **Owner decisions still open:** acceptance of the agent decisions D21, D22, D25, D32–D34, D38–D40; whether the Joomla finder help text of the Search page (D38) may stay an exception, or the page must draw text that EmDash search cannot honour; whether the post share discs (D34) stay as static discs, become links, or go.
- **pack-49** (clean install port 4429, contract revision 29): machine gates pass (`chain-49/qa.1`); Fast Gate **signed on `fg-56`**; four full-scope runs `f49-<stage>` closed; eight stand receipts and the `visual-review` receipt in `<evidence-dir>/reviews-final-49`; third independent review running.

## Fourteenth state (pack-52)

- The third and fourth independent reviews (pack-49, pack-51) said "not pass" for one package defect: the exception patterns of the contract still closed 35 of 44 and 43 of 50 made-up defects, so the self-test claimed in D40 and the pack-49 section was wrong. Rewritten again with a page scope (`pages`), tested against 42 made-up sentences (all examples of both reviews included): 0 match, 13 decided-difference sentences match. Everything else the fourth review checked was clean (completeness, editability, shipped files, 24 crawled pages, every sampled closing row on the decided subject).
- Still owner decisions: acceptance of the agent decisions D21, D22, D25, D32–D34, D38–D40; the help text and magnifier extension of D37/D38; the post share discs (D34); the coordinator closing a lens-reopened Search note by exception (the lead's rule: match the source, a Joomla-only control becomes a reasoned exception; the skill says only the lens closes).

## Fifteenth state (pack-53)

- The fifth independent review (pack-52) still found the wording-based exception patterns closing plainly written defects (26 of 75 made-up, after two rewrites); the self-test bank claimed in the fourteenth section was not shipped and could not be reproduced. The patterns are gone: the contract's lens-note exceptions now name note ids (D40), 20 Search notes (Advanced Search, magnifier, finder help text; D37, D38), one landing-state note (D37), one typo-and-wrap note (D22; its 'Fruit Platc' is a misreading, both sites print Fruit Plate). Everything else the review checked was clean.
- Owner decisions still open are those listed in the previous two sections.

## Sixteenth state (pack-54: release folder cut, not published)

- The sixth independent review (pack-54) passed on its merits: exceptions are 22 named note ids, every sampled closing on its decided subject. Its receipt, the eight stand receipts and the `visual-review` receipt are in `<evidence-dir>/reviews-final-54`. Acceptance of `chain-54/qa.5`: **all 16 gates pass** (machine gates, visual via the signed Fast Gate `fg-60` and the four runs `f54-*`, nine receipts).
- `release.mjs` produced `<evidence-dir>/chain-54/release.1` (quickstart zip, state archive, manifest, VERIFICATION, SHA256SUMS, `tracy_site_pages.json`, `tracy_site_question.json`) and `design-system-roles.json` (role scan clean) was added beside them. Nothing is published; the draft `gh release create` command is at the end of `chain-54/logs/6-07-release.log` for a person to run.
- Box-only: the release step needs the `sqlite3` command line, which is not installed here; a stand-in built on the package's `better-sqlite3` (`<evidence-dir>/shim/sqlite3`) ran it. The routing gate failed twice on the first QA runs only because a restarted server lost `EMDASH_SITE_URL`; the passing run used the fresh routing observations (`qa.3`) with the passing visual run (`qa.2`), joined as `reuse-hybrid`.
- **Not done, and cannot be before publishing:** `tracy_setting.json` (`scripts/tracy-setting.mjs write` reads the published release) and the Customization and Design System readiness checks (`apps/tracy-web/scripts/template-readiness-local.mjs` reads the release through `gh`). The regression case keeps its placeholder PR number until a PR exists.
- Still owner decisions: acceptance of the agent decisions D21, D22, D25, D32–D34, D38–D40; the magnifier and help-text extension of D37/D38; the coordinator closing five Search notes a lens had reopened under the lead's rule; the post share discs (D34).

## Seventeenth state (kit rebuilt from pack-54; labels corrected)

- **Template kit** (`contracts/0.1.0/template-kit.json`, tool template-kit 3.1.4): captured on a clean install of pack-54 (`template-kit/cli.mjs build --full`, 7 pages, 32 blocks, 70 images), packed with `cli.mjs pack`; approval **none** (the owner approves; nothing was approved here). The 16 `errors` of the kit are the ones EmDash cannot answer (6 blocks never shown so their links are unread, no free head HTML entity, no contact entity, no menu blocks, no item lists, no menu item entity, faces of 16 pictures not model-checked) and are the same as in the earlier kit; all 22 self-check counters are 0, so `reach-accepts.json` has nothing to explain. Looks: 7 of 7 pages and 28 of 28 shown blocks have a current look (22 carried from the earlier kit by identical image sha256, 13 written fresh for the shots that changed). The road step (`templateKitStep` with the content map, release assets as for a published release) answers `todo / kit-not-approved`, not `kit-incomplete`; with no kit zip among the release assets it answers `kit-zip-missing` until a person attaches `template-kit-tracy-fresco-0.1.0.zip` (`<evidence-dir>/kit-54/`, sha256 `15a1e486…`).
- Labels: only the four rules of 2026-11-18 are owner decisions; D6, D9–D11, D13, D20, D28, D31, D36, D37 were relabelled (see the note at the top of `DECISIONS.md`). One comment in the shipped `ingest/build-contract.mjs` still says "differences the owner already decided"; changing it needs a new pack, so pack-54 was left as released.
- **Release folder, native run:** the first cut (`chain-54/release.1`) joined routing observations of `qa.3` with the visual run `qa.2`. Both read `http://127.0.0.1:4434`, the clean install of pack-54 (`chain-54/logs/1-04-clean-install.log`; its `src`, `seed`, `tools`, `ingest`, `public` are identical to pack-54's), and carry pack-54's `artifactHash` `e136ea01…` and contract hash `ba07ceec…`, as does every receipt in `reviews-final-54` and `VERIFICATION.json`; `visual.json` itself names the origin, not the hash. To remove the join, `qa.7` re-ran every gate natively on pack-54 (visual stage included, Fast Gate `fg-60`): acceptance pass, 16 of 16. The final folder is `chain-54/release.3` (no `reusedFrom` on any gate), with `design-system-roles.json` (role scan clean) and the kit zip beside it. `release.1` and `release.2` are superseded.

## Eighteenth state (pack-55: share links, owner acceptance, kit approved, release cut natively)

- **Owner decisions (hano-xbt, 2026-11-22):** D41 accepts every listed difference (D6, D7, D11, D12, D13, D16, D17, D18, D20, D21, D22, D25, D30, D32, D33, D35, D37, D38, D40, including the magnifier and help-text exception); D42 makes the post share row real share links (X carries the title, Facebook and LinkedIn take an address only; new tab, `rel="noopener"`, accessible name, no third-party script, same 36 px discs); D45 approves the kit. D43 (badge ring ink) and D44 (tags block drawn visibly; its heading reads "Tags:" where the source reads "Tags in:") are lead decisions the owner has not accepted.
- **pack-55** (clean install port 4435, artifact hash `c4f44d70…`, contract `ba07ceec…`): Fast Gate `fg-61` signed (site tiles pixel-identical to pack-54, only source tiles re-read; three notes N-d40de7, N-560c11, N-5759ef closed by their lens after D43 and D44), four full-scope runs `f55-*` closed, eight stand receipts, `visual-review` and `independent` (pass) in `<evidence-dir>/reviews-final-55`.
- **Release folder `<evidence-dir>/chain-55/release.1`:** `qa.mjs` with `--visual` run natively on pack-55 and `release.mjs` with the real `sqlite3` (installed from the distro package for this step and removed again afterwards): 16 of 16 gates pass, no `reusedFrom`, `design-system-roles.json` (role scan clean) and the approved kit zip beside it.
- **Kit:** approved by hano-xbt (D45), road step `done / kit-approved`; zip `template-kit-tracy-fresco-0.1.0.zip` sha256 `c2d19904e228b627ed1dbe0b7fcb016fc76cb88cce0171f8e4be1996d99631ca`.
- Still not done: `tracy_setting.json` and the Customization and Design System readiness checks (they read the published release), the regression case's real PR number.

## Nineteenth state (pack-57: lint and format gates green for Fresco; final release folder)

- `pnpm build:check` (2026-11-23) was red on three gates. **Fresco's own:** `lint` (two unused variables, one in the shipped `ingest/shape-model.mjs`, one in `perf/rel.mjs`; then three files the formatter wanted changed) and `turbo-config` (the suites read the git-ignored `.astro` and `uploads` folders that only this package had locally; removed, not re-run). `oxlint`, typecheck and `format:check` were run again afterwards for the package and pass. **Not this branch's:** the failing tests are `copy-verify`, `website-opportunities-dubai-ranking`, the Joomla `capture-contract`, `content-coverage-code-projection`, `content-coverage-inline-markup` and `template-kit-inline-markup-sidecar` suites, the WordPress `identity`, `render`, `wp-contact-mail`, `wp-ja-morgan` and `wp-ja-nova` suites, and fleet `joomla-contract-fetch`; none of those files is changed by this branch's commits and none mentions Fresco; several fail because PHP's `dom` and `mbstring` are missing on this machine.
- Each shipped-file fix needed a new pack. pack-55 (share links, kit approved) → pack-56 (one unused variable) → pack-57 (formatting only). Every site tile is pixel-identical across the three; the Fast Gates `fg-62` and `fg-63` re-read only flickered source tiles; D46 records the source tile that draws "Fruit Platc" where its markup reads "Fruit Plate". The template kit (captured on pack-55, 70 images, `imagesSha256` `aa181ec3…`) is unchanged by those two packs and its approval (D45) holds.
- **Final release folder:** `<evidence-dir>/chain-57/release.1` (pack-57, artifact hash `f8d7b9d4…`, contract `ba07ceec…`), `qa.mjs` with `--visual` and `release.mjs` run natively with the real `sqlite3` (installed from the distro package for the run, removed again afterwards). `chain-55/release.1` and `chain-56/release.1` are earlier cuts of the same site and are superseded.

## Twentieth state (merged with origin/develop, ready for the PR)

- `origin/develop` (311 commits ahead) was merged in with a merge commit. Conflicts were all "both sides add a theme to the same list" (develop added JA Essence, this branch JA Fresco): kept both in `apps/tracy-web/Dockerfile`, `turbo.json` and `apps/tracy-web/turbo.json`, `emdash-tool.js` and its test, `scripts/check-emdash-kit-sync.ts`, `scripts/check-tests.ts`, `docs/references/vocabulary.md`; `scripts/language-policy.json` and `scripts/opensource/public-tree.json` were merged as JSON (union of both sides' entries, then formatted); `docs/README.md` was regenerated with `pnpm docs:index`.
- The theme package is byte-identical after the merge in everything the pack ships (only this `STATUS.md` differs from the tree pack-57 was cut from), so the release folder `chain-57/release.1`, the contracts and the approved kit still match; develop changed nothing the pack depends on.
- The regression case is `tests/regression/cases/REG-PR-739-emdash-fresco-0-1-0.json`.
- `check-all --skip boot-graph` after the merge: every gate passes except two. `turbo-config` names only the git-ignored local binary `scripts/opensource/.bin/gitleaks` (this machine). `tests` fails in twelve files, none changed by this branch: WordPress `wp-contact-mail`, `wp-ja-nova`, `identity`, `wp-ja-morgan`, `render`; Joomla `capture-contract` (PHP `dom` and `mbstring` are missing here); quickstart-tools `content-coverage-code-projection`, `content-coverage-inline-markup`, `template-kit-inline-markup-sidecar`; fleet `joomla-contract-fetch`; web `website-opportunities-dubai-ranking`, `copy-verify`.

## Twenty-first state (pack-58: about description sanitised; release folder re-cut)

- Review finding: the about intro description (`features_intro/about-intro.desc`) was printed with `set:html` unsanitised. It now goes through `aboutDesc()` (`src/lib/about-desc.ts`, the shared `cleanHtml` allowlist); `tests/set-html-safe.test.mjs` proves the payloads inert and scans every `set:html` in `src`. The only seed change is the dropped `class="list-special"` on the description's list (no CSS uses it).
- **pack-58** (clean install port 4438, artifact hash `48b11a7e…`, contract `ba07ceec…` unchanged). Fast Gate `fg-64`: all 426 tiles byte-identical to pack-57's `fg-63`, readings carried. Four full-scope runs `f58-*`: every site tile byte-identical to `f57-*`; 13 source tiles of four source shots flickered and were re-read (three notes, D22 and D46, closed by their lens). Nine stand receipts, `visual-review` and `independent` (Opus, pass), 16/16 gates, no `reusedFrom`.
- **Final release folder:** `<evidence-dir>/chain-58/release.1` (replaces `chain-57/release.1`); it holds `design-system-roles.json` and the approved kit zip (sha256 `c2d19904…`, unchanged).
- **Kit:** re-captured on a clean install of pack-58: 70 images, `imagesSha256` `aa181ec3…` = the approved one, so the approval (D45) holds and `contracts/0.1.0/template-kit.json` is unchanged.
- The regression case grades each of its expectations through `tests/regression/scripts/REG-PR-739-emdash-fresco-0-1-0.mjs`.

## Twenty-second state (pack-62: every road pre-check finding fixed; release folder re-cut; pre-check CLEAR)

- The Road to live pre-check of `chain-58/release.1` blocked. TCQR ABOUT-2, LANG-2, PAGE-5, PAGE-8 and TDSR DEF-1, TEXT-1 were fixed in the package (D47-D51). Re-measuring 0.1.0 with the current tools then exposed TDSR CON-1, CON-2, IDENT-2, EMPTY-1, ICON-1, BORDER-1, FORM-1 and MODE-2; they are fixed at their roots in D52-D56 (the same eight results appeared on pack-58, so none was caused by an earlier cut).
- Re-cuts: pack-59 and pack-60 (independent reviews failed on a shipped test that read a repo-only file and on a PAGE-8 decision that overstated what the rule does), pack-61 (a field-fill fallback), pack-62 (the TDSR roles). Without a design system pack-62 draws the same pixels as pack-61 except the 1 px ring of the current pagination page on `/blog` (D54).
- **Release folder:** `<evidence-dir>/chain-62/release.1` (pack-62, artifact hash `463d30f5…`, contract `ba07ceec…`), 16/16 gates, `design-system-roles.json`, the approved kit zip (sha256 `c2d19904…`) and `tracy_setting.json`. **Kit:** re-captured on a clean install of pack-62, `imagesSha256` `aa181ec3…` = the approved one, so the approval (D45) holds. The measurement of 0.1.0 (15 systems, the Add site preview under Moxie and one dark system, both schemes) was taken from this release's zip and state and is committed.
- **Pre-check on pack-62: CLEAR: 0 blocker(s), 0 worth-fixing, 0 pending.**
- Known and not part of this cut: the mobile menu panel prints the demo logo whatever the customer's own (`Header.astro`, also in pack-61).
