# STATUS — tracy-morgan (JA Morgan → EmDash)

Version 0.1.0, unreleased. Nothing was pushed. Session 2 ended at its time limit (see "Where it stopped").

## Phase table
- P0–P2 done: stand, scaffold, DECISIONS D1–D19, seed (`ingest/rebuild-seed.sh`), content map `contracts/0.1.0/content-map.json` (837 slots, 0 failing label rules).
- P3–P5 done: nine pages, contract revision 32 (44 rules), every page family (Home, About, Services, Contact, Blog, Post, Search, 404).
- P7 done on the final render: Fast Gate `qa/fg-32` signed (verdict pass, 7 pages, 42 axes, 0 open notes); full visual tiers read on the final contract; forms + mail (Mailpit), admin round trip, recovery pass on the clean install of pack-4 (`p7c4/`); independent verifier built pack-3 on its own port and found 6 doc gaps, all fixed in pack-4's docs.
- P8 partly: kit built on a clean install (`kit2/`, 77 blocks, 162 images, `kit-sections-check` = 0 problems on 30 pages), `contracts/0.1.0/template-kit.json` shipped without an `approval` (the owner approves); design-system slot files written and measured (`templates/emdash-tracy-morgan.json` ready true, palette, `contracts/0.1.0/design-system-measurement.json`: the 15 featured systems pass ROLE-1, SCREEN-1, CON-1, UNDO-1, FONT-1, IDENT-1, MODE-1, MODE-2).

## Where it stopped
The release chain ran to the `qa` step on pack-4 (`chain-4/`): routing, browser, contracts, distribution, preflight pass and nine of the ten receipts are current (`reviews-4/`). **The `visual-review` receipt is not valid**: the final stage runs (`qa/s-*`, one per stage on the QA site) have three open notes, all the same finding. On phones (390) the site footer prints all six link columns where the source shows only the Social block (en-about, en-post, en-services, en-blog and en-contact, about 650 px taller); fix it, then re-run Fast Gate, the four tiers and the receipt. Not reached: the release step (`release.mjs`), content coverage (last, on a clean install of the released state), the render-map and profile rows, `tracy_setting.json`, the readiness check on release files, the road pre-check.

## Lead decisions of session 2 (recorded in DECISIONS.md)
D6 Home = Home Style 1 (WP 1.1.16 database cited), D8 PT Root UI shipped with its OFL text from the WP webroot, D13 and D16 kept as written.

## Known differences left on purpose (for the next session)
- The end of an article: the source shows the tag chips first and a filled Next button on the left; the site puts an outlined Next link on the right above the tags. One reader noted it, the layout lens closed it after a recorded skip.
- The blog and search title bands are a 500 px block with left-flush text as in the source; their font sizes stay the contract's (60/38 and 18 px); the source's tablet sizes (45 px) were not copied.
- The DS-slot preview rules (TPL-1, CON-2, BTN-1, PREV-1, IDENT-2, FONT-2) are not measured.
- `tracy_setting.json`, the render-map and profile rows need the released tag; the exact Fresco-shaped rows are listed in the last report.

## Evidence (outside the repo, `/home/agent/out/morgan/`)
`qa/fg-32` (Fast Gate), `qa/h-fin` and `qa/s-*` (final visual runs on the QA site), `chain-4/` (release chain), `pack-4/`, `reviews-4/` (ten receipts), `p7c4/`, `evid-4/`, `indep/report.md`, `kit2/`, `ds-slot3/`.

## Honest notes about method
- Lens notes were written by the readers themselves; three readers once wrote files with a script and were asked to retype them by hand (`fg-28`, since superseded).
- Receipts name the coding agent as reviewer: no person has signed anything. The kit has no approval.
- `release.mjs` needs the `sqlite3` CLI; the box has none, so a Node shim (`shim/sqlite3`) was used outside the repo.

## Last state
- Branch `feat/emdash-port-morgan`, local commits only; last template commit is the kit/inventory/artifact commit plus a docs commit.
- Next commands (from this folder, `PATH=/home/agent/out/morgan/shim:$PATH`): fix the phone footer in `src/components/site/Footer.astro`/`global.css`; `ingest/build-contract.mjs --site <dev site>`; `tools/fast-gate.mjs verdict`; four visual stage runs with readers; `tools/release-chain.mjs --from docs ...`; then the release, content coverage last, `scripts/road-precheck.mjs --stage release`.
- The pack-4 QA site holds test submissions and a Mailpit SMTP setting; cut the release from the fresh clean install (`chain5-site`) as Diner did, not from the QA site.
