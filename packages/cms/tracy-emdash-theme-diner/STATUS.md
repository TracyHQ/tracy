# STATUS — tracy-diner (JA Diner → EmDash)

Version 0.1.0, release-ready. All eleven phases are recorded in `checkpoint.json` (a local file, not committed). P6 is recorded with `perf/skill-findings.md` as its evidence because the checkpoint refuses P7 while P6 is unrecorded; its content (skill changes go upstream later) was not done.

## Final state
- `qa.mjs --browser --visual --visual-fast-gate <run> --artifact <pack> --reviews <dir>` on the final build: `gates: status=pass pass=16`, with ten review receipts. The evidence folders are local and not committed.
- The release was cut from a fresh clean install of the pack, not from the QA site, which holds test submissions.
- Tracy's road checks on that release (with a local `tracy_setting.json` and `design-system-roles.json`, which no kit tool writes): customization question readiness 0 fail (25 pass, 5 live-only); design-system readiness 0 fail (46 pass); built-site check pass, also with `/our-blog,/reservation` unticked. Decisions D-P8-1…6 are in `DECISIONS.md`; skill findings D-38…D-46 in `perf/skill-findings.md`.
- Tests `node --test tests/*.test.mjs` pass; `astro check` 0 errors, 0 warnings, 0 hints.

## What exists
Routes: home, blog list with categories and search, About, Offers, Reservation, Contact and the article pages. One language (English). Runtime identity: package `packages/cms/tracy-emdash-theme-diner`, id `tracy-diner`, label `JA Diner`, EmDash 1.1.0, Astro 7.3.3. `source/snapshot` is git-ignored; `source/snapshot-SHA256SUMS` lists every file of it.

## Not done / for the owner
- Cutting the GitHub release (`tracy-diner/emdash-0.x`) and `scripts/tracy-setting.mjs write` happen after the merge.
- `source/REBUILD.md` (how to rebuild the git-ignored `source/snapshot` from the pinned JA Diner Joomla 6 quickstart 1.0.5) was not written.
- The kit manifest (`vendor/emdash/tracy-emdash-skill/.../kit-manifest.json`) needs a `tools/release.mjs` exception for this template, like the Restaurant one, until the kit takes the page rule.
- Lens notes of the final tiers were carried from P7 by pixel identity (D-P8-5), not re-read.
- The independent recipient got a pack that differed from the final one only in documentation; its 7 gaps were fixed afterwards.
- Search page: results state kept (D-P8-6). Mail sandbox is not production deliverability.
- Built-site check `--set blank` was not run (it needs a site built from blank answers).
- The 22-language questionnaire is Claude-translated, not reviewed by native speakers.
