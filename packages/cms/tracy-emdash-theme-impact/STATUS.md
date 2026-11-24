# STATUS — tracy-impact (JA Impact → EmDash)

Version 0.1.0, **not released (nothing uploaded), kit not approved**. Branch `feat/emdash-port-impact`, commits local, nothing pushed. The local release folder passes **all 16 gates** (`VERIFICATION.json`), the Road pre-check is **CLEAR** (0 blockers, 4 worth-fixing), the Fast Gate verdict is signed, the full-scope visual review is closed. The template kit is built and **waits for the owner** (`approval: null`).

## Where things are (outside the repo, `/home/agent/out/impact/`)
`chain/release.1` the release folder (quickstart zip, state tarball, kit zip, `design-system-roles.json`, `tracy_setting.json`, `SHA256SUMS`, `VERIFICATION.json`); `chain/qa.*` the QA runs; `qa/fg-17` the signed Fast Gate run (verdict `FAST-GATE.md`); `stages/<tier>` the four full-scope tier runs the `visual-review` receipt names; `reviews/` the ten receipts and their evidence; `evidence/` forms, editability, recovery, security, fonts, build, independent report; `kit24/` the kit; `tdsr/` the design-system flow; `lens*/` reader notes.

## Phases and gates
- **Fast Gate:** machine pass on the final build (fg-17, 9 pages x 4 tiers, 0 findings). Review rounds fg-12, fg-15, fg-16, fg-17: Sonnet readers opened every tile (11 groups of 36); fixes in DECISIONS D32 (round 4), D33, D34; the final round's 25 notes were all decided (none changed), each closed by the lens that opened it; `fast-gate.mjs verdict` = pass.
- **Full scope:** `qa.mjs --visual` (66 axes, 4 tiers, reused shots) passes; 14 Sonnet readers + 9 Opus (`claude-opus-5-5`) layout readers opened every tile; 26 notes decided in D35 and closed; one run per tier for the receipt.
- **Receipts (10):** build, security, visual-review, font-review, viewing-contexts, editability, forms, recovery, clean-install, independent: all `pass` in the final `qa.mjs` run. Editability, forms, recovery and security were run on a second clean install of the same pack (`siteB`, port 4411), not on the release's own site, so the release state holds no test data. `independent` is a separate subagent session that saw only the closed package; its 10 doc gaps were fixed in the package (verify command, audit arguments, round-trip id, background server, smtp test, README title, sender domain, LICENSE name, repo-only references).
- **Design system:** `flow.mjs` 64/64, preview measured, palette, roles file.
- **Content coverage:** measured on the final clean install, 0 blocking holes, `contentMapSha256` equals the map's.
- **Kit:** 95 blocks, 202 images, 131 looks (21 of the looks of changed shots carry the text of the same shot's earlier version), `kit-sections-check` 0, **13 errors**, json byte-identical to the zip (sha256 `18a40d779e29a7870c4f3d36f32f8ce004f757b798cf7faee9ae94a045237869`).
- **Repo wiring** (Road rows, render map, Dockerfile copies, CI group, language policy, public-tree) done; the language check passes; package tests 516/516.

## Kit gap list for the owner (13 errors)
Inherent to EmDash (the same kinds as Fresco's approved kit): 1 block never shown (the off-canvas menu), no free head HTML entity (2), no contact entity, no menu blocks (2), no item lists, no menu-item entity, no page shows one article, the theme's fixed words, faces of 62 pictures not model-checked. **Specific to this template (2):** the pagination link "2" of the Donations and Events lists uses `?page=2`; the kit's pagination rule only knows `?start=`: `packages/cms/tracy-quickstart-tools/template-kit/lib/link-label-reasons.mjs` line 73 (`resultPage` reads only the `start` parameter) and lines 89-98 (`paginationLink`) would need to treat `page` like `start`. Essence's pager is also `?page=` and passes only because its demo has one result page. The kit tool was not changed. (The three footer links are now fields with their own label and address slots and no longer an error.)

## Not done / not verified
- `tracy-setting.mjs check <tag>` needs a published release and `gh` authentication: not run; the same validator (`parseSetting`) passes on the local folder's `tracy_setting.json`.
- The Customization and Design System readiness checks of /ops (they read the published release); a model-written personalize run (no model key); the regression case and the PR.
- Pre-check worth-fixing: PAGE-5 (social glyphs, D26), PAGE-8 (Help & FAQs page record, D27), IDENT-1 (logo under every system at 390 px), FORM-1 (search and contact fields keep the template fill).
- Open design differences recorded as decisions, reopenable by the owner (D30-D35): the event article's 2x2 icon blocks and Register button, Home tablet arrangement, textures, sidebar paddings, related-card heights.
- **NEEDS DECISION (owner): LICENSE.** The package `LICENSE` carries the Fresco port's grant sentence (copyright holder released the quickstart and this port under GPL-2.0-or-later on 26/10/2026); only the template name was changed. Confirm that the same grant covers JA Impact before release.
