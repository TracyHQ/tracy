# STATUS — tracy-diner (JA Diner → EmDash)

Version 0.1.1: release cut locally (not published) on 2026-11-13 from the release chain; every gate passes, `independent` signed by a fresh session on its own rebuild of the same artifact (D-K3); the source mirror was rebuilt and re-pinned (D-K2); the template kit is approved by the owner (D-K4, `contracts/0.1.1/template-kit.json`) and reads `todo kit-zip-missing` until a person attaches `template-kit-tracy-diner-0.1.1.zip` to the release. 0.1.0 is the published release.

## Next release (doc gaps from the 0.1.1 independent handover; they touch packed files, so 0.1.1 was not re-cut)
- G1: the recipient tools (`audit.mjs`, `admin-session.mjs`, `admin-roundtrip.mjs`, `forms-check.mjs`, `qa-browser.mjs`) need a Playwright Chromium (`pnpm exec playwright install chromium`); `README.md` / `docs/checks-and-recovery.md` do not say so.
- G2: `pnpm test` in the shipped package fails 7 of 451: those tests read `contracts/0.1.1` or need the repository checkout (`TRACY_CHECKOUT`); `README.md` must say they run only in the repository.
- G3: the release README (written by `tools/release.mjs`) runs `tools/bootstrap-site.sh` on the host, where `mint-admin.cjs` cannot load `better-sqlite3`; it works inside the container (`docker exec <container> tools/bootstrap-site.sh …`): say so in the release README template.

Below: the 0.1.0 state.

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
