# STATUS — tracy-restaurant (JA Restaurant → EmDash)

End of coordinator session 6 (P8 finished). Version 1.0.2 (design-system ready from 1.0.1; the Chefs category label no longer links to a 404; 1.0.0 is published) is packed (artifact hash `fefd0ce5…`, cycle 9: kit self-checks D73, final review D74, review findings D75) and its release folder is built (all 16 gates pass in its `VERIFICATION.json`, the visual-review gate after the eighth cycle with 0 open and 0 LEE in every tier; the differences the shipped 1.0.1 already had are deferred to 1.0.3 under D71 / G-22); 1.0.2 is not published (D65, D70, D71, D72, `perf/visual-review-1.0.2.md`).

## Gates
| Phase | State | Evidence |
|---|---|---|
| P0–P5 | recorded again in the checkpoint on the P8 inputs (P3 on the Fast Gate of the final build) | `checkpoint.json` (local, not committed), `DECISIONS.md`, `docs/`, `seed/` |
| P6 | skipped on purpose: skill changes go upstream as a separate PR from `perf/skill-findings.md` | — |
| P7 | closed; re-run on the final package: all 16 gates pass | `evidence/s6-qa5/report.json` (`qa.mjs --artifact --reviews`: `gates: status=pass pass=16`), receipts `evidence/s6-reviews2/` |
| P8 | package, clean install from the pack, content-api gate, release folder, independent handover | below |

`checkpoint.mjs complete` refuses P7 while P6 is open (`P6 is not complete (not recorded); verify it first`) and has no not-applicable record, so P6, P7 and P8 are not in `checkpoint.json`.

## What exists
Routes: 12 pages and 4 lists plus details, 20 contract pages, 8 layouts. Seed: 21 collections, 84 entries, 66 images, menu `primary`, taxonomies `category` and `tag`. The front page record is `pages/home` (DECISIONS D49). Runtime identity: package `packages/cms/tracy-emdash-theme-restaurant`, id `tracy-restaurant`, label `JA Restaurant`, version 1.0.0, EmDash 1.1.0, Astro 7.3.3, English only. `source/snapshot` (22 MB) is git-ignored: rebuild per `source/REBUILD.md`.

## P8 in short
- Session 5 packed and handed over; session 6 closed the open items: Add-site pictures (D52), the 113 role items (D53), the licence (D54), the language-policy set, the real `zip`/`sqlite3` release run, a `tracy-web` image build and a second handover.
- Chain on the final pack: docs check, `artifact.json`, pack, clean install from the pack, Fast Gate (pass, 48 axes, all site shots pixel-identical), four full-tier stage runs (pass, 0 to review), `qa.mjs --artifact --reviews`: `gates: status=pass pass=16`, content-api gate, `release.mjs` in a throw-away Docker container with the real tools.
- Independent handover: a fresh Sonnet 5.5 session received only the pack (before its 10 documentation gaps were fixed in the README, install and check docs; the fixes are documentation only and are in the final pack, which was not handed over a third time): tests 376/376, all tool steps pass.
- Release prep folder and steps: kept outside the repository (hashes in its `SHA256SUMS`), with the language-policy patch and the overlap list with the Coffee PR (#312).

## Open
- The `language-policy` check needs the exact-line rows of `scripts/language-policy.json` on the base first: the same change is in this tree and as a separate patch (1177 rows, all in this template; customer-facing locale data plus kit-owned copies).
- Design-system measurement: done for 1.0.1 and 1.0.2 (`contracts/1.0.2/design-system-measurement.json`, slot contract `templates/emdash-tracy-restaurant.json`, `ready: true`, DECISIONS D62); the checker grades the 1.0.1 release files A, 46 of 46. 1.0.0 was measured too (`contracts/1.0.0/`) and did not pass: its stylesheets did not read the type and shape tokens.
- Checkpoint left at 8/11 (SF-47): P6 skipped on purpose, P7 and P8 cannot be recorded without it.
- The 22-language questionnaire is Claude-translated. `source/REBUILD.md` was run end to end on 2026-11-09 (D64): a rebuilt mirror differs from the first one in its HTML (per-load tokens), so the manifest and the contract's source hashes were re-pinned to it. Mail delivery was proven to a sandbox mailbox only. The Dockerfile and entrypoint of the template were not built into an image (the `tracy-web` image was).
