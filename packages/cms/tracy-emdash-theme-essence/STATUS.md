# STATUS — tracy-essence

**Phase reached: P3 done — Fast Gate verdict PASS (checkpoint 4/11) in session 2; P4 partly (importer idempotent), P4.5 started.** Sessions: 1 (P0–P1), 2 (P2, P3, part of P4/P4.5/P4.6, page families written ahead of P5). Evidence is under `/home/agent/out/essence/` and `evidence/` (git-ignored); the source stand was removed after use (rebuild: `source/REBUILD.md`).

| Item | State | Evidence |
|---|---|---|
| P0–P2 | done, checkpoint recorded | `checkpoint.json`, `DECISIONS.md` D1–D22 |
| Runtime | `astro dev` on `:4360` with data in `/home/agent/out/essence/site1`; `tools/bootstrap-site.sh` seeds it (`/home/agent/out/essence/scripts/site-up.sh <data> <port>` wipes, starts, bootstraps). Rerun of bootstrap: 242 × `same`, 0 changes (P4: running twice = no change) | `site1.bootstrap.log` |
| Front end | all page families written: Home, lists (grid / stack / sidebar, tag, author), article (3 layouts, video, gallery), Authors, Contact, Search, 404, sidebar, newsletter, two forms (`contact-en`, `subscribe-en`) | `astro check`: 0 errors |
| Contract | `ingest/build-contract.mjs` + `ingest/contract-pages/post.json` (family fragments; one file per family): 3 pages today (Home, article, 404), 29 rules × 6 variants | `qa.contract.json` revision 10 |
| Fast Gate (machine) | `visual-qa --scope fast-gate`: 4 tiers pass, 0 findings, 1 cited exception (strip pill over a photo in dark, D21) | `evidence/fg-p3-12/VISUAL.md` |
| Lens rounds | round 1 (fg-p3-8): 8 reader agents (Sonnet) → 26 notes, all fixed or decided; confirmation 1 (fg-p3-9): 9 notes → fixed; confirmation 2 (fg-p3-10): 4 → fixed/decided (D22); fg-p3-11: 5 notes (footer at 768, pagination wrap at 390) → fixed; final confirmation fg-p3-12: 9 readers, 0 notes, `qa-notes merge` 0 open in all four tiers, `fast-gate verdict` = pass (`evidence/fg-p3-12/FAST-GATE.md`). Readers are Sonnet 5.5; the Opus layout lens is due at P7. Several reader reports reached me under a harness security warning (one reader first tried to write its notes file from a script and was blocked, then wrote it by hand); the notes files hold only what the Notes tables say | `evidence/fg-p3-*/notes/` |
| Docs | `node tools/generate-docs.mjs --check` passes; `docs/design-system.md`, `content-api.md`, `architecture.md`, `languages.md`, `install.md`, `checks-and-recovery.md` authored | — |
| P4.5 | `seed/personalize.json` written (identity: brand name + copyright; replace; copy; facts; brand.logoDark); `node tools/personalize.mjs … --dry-run --json`: no errors; `personalize-gate` exit 0; `seed/content-api-map.json` done, `content-api-gate` passes. `seed/questions.json` is the kit's (21-language questionnaire) | — |
| P4.6 | footer/header logo spots through `BrandLogo`, `brand-when-*` rules, template icon only behind `templateIconWanted`, copyright from `{year}`/`{name}` done; NOT done: `tests/brand.test.mjs` run on this tree is green but `tracy_site_pages.json` (`release.mjs --site-pages`) not yet run | — |

**Not started:** P5 contract rows for the other families (Category ×3 list styles, Authors, Contact, Search, tag, author, article layouts type-1/type-2, video, gallery) and their Fast Gate cases (`fast-gate.mjs plan --changed`); P6; P7 full tiers + Opus layout lens; P8 package/clean install/release chain; Tracy's road checks (D38/D40 of Diner: `scripts/template-customization-question-readiness*.mjs`, design-system slot contract + measurement + `design-system-roles.json`, `template-profiles.json` row); release wiring (`turbo.json` ×5, `docs/README.md` via `pnpm docs:index`, `docs/references/vocabulary.md`, `apps/tracy-web/test/emdash-*.test.mjs` template lists); the translations of `src/lib/ui-words.ts` (D17); Opus layout lens at P7.

**Next commands** (from this folder):
1. `/home/agent/out/essence/scripts/site-up.sh /home/agent/out/essence/site1 4360` (after `ingest/rebuild-seed.sh` if the seed changed), and the source mirror: `cd /home/agent/out/essence/snapshot && python3 -I -m http.server 18217 --bind 127.0.0.1`.
2. P5: one `ingest/contract-pages/<family>.json` per remaining family (model: `post.json`), `node ingest/build-contract.mjs --site http://127.0.0.1:4360`, `node tools/fast-gate.mjs plan --contract qa.contract.json --changed <files>`, then `visual-qa.mjs --scope fast-gate`, lens rounds (≤64 tiles per reader, Sonnet; brief files in `/home/agent/out/essence/briefs/`).
3. P4.6/P8: `node tools/release.mjs … --site-pages`, `node scripts/template-customization-question-readiness.mjs` (repo root) on a release build.

## Owner questions (batched)
- `[LEE]` D14: Be Vietnam Pro ships (behind `:lang(vi)`) because Jost has no Vietnamese letters; keep, or accept the LANG-2 finding?
- `[LEE]` D15/D16: the source's per-menu-item list layouts are reduced to three list styles; the Home "Features Lead" strips are driven by `home_lead` / `featured` fields; confirm the reduction.
- `[LEE]` D18: the template icon (accent square, white E) because the source's favicon is Joomla's logo.
- The `follow-me` / header social links are `#` in the source: drawn as plain glyphs, no link, until a customer gives addresses.
