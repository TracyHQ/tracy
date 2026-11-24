# STATUS — tracy-impact (JA Impact → EmDash)

Version 0.1.0, **not released, not approved**. Branch `feat/emdash-port-impact`, commits local, nothing pushed. Road: the release folder passes `road-precheck.mjs --stage release` (**CLEAR: 0 blockers**, 4 worth-fixing, listed below). The template kit is built and **waits for the owner's approval** (`approval: null`; nothing was approved here). The full Fast Gate review, the full visual tiers and the review receipts are **NOT done**.

## Runtime identity
Package `packages/cms/tracy-emdash-theme-impact`, id `tracy-impact`, EmDash 1.1.0, Astro 7.4.12. Source stand: `source/REBUILD.md`. Evidence and work files outside the repo: `/home/agent/out/impact/` (`chain/` the release chain run and `chain/release.1` the release folder; `kit12/` the kit; `tdsr/` the design-system flow; `preview/`; `looks/`; `coverage/`; `lens/` round 3 reader notes).

## Done this run (after the previous status)
- **Kit gate:** `ingest/kit-sections-check.mjs` reports 168 sections with slots on 37 pages, **0 not a block**. The Home events strip was not a block because the three unclassed Home sections were found by `nth-child` and the stamped DOM has a `<template>` owner mark as first child of `main` (the selector was off by one): each now has its own class (`im-home-events`, `im-home-connect`, `im-home-latest`); the strip also prints its own heading words (DECISIONS D29).
- **Kit:** 95 blocks, 202 images, 131 looks current (101 written by Sonnet agents, 84 carried by identical image sha256), `seed/slot-limits.json` (35 limits measured on a clean install with `perf/slot-limits.mjs`), `coverage.parts` all 0. `contracts/0.1.0/template-kit.json` is byte-identical to the json in `template-kit-tracy-impact-0.1.0.zip` (sha256 `1c8fa85badbc452356b4b95214ede89807abb8e162274475f59d89bc9d6266b2`).
- **Content coverage:** measured on a clean install of the final template (`emdash-audit.mjs --fit --write`), 0 blocking holes, 112 accepted with reasons, `contentMapSha256` equals the map's.
- **Design system:** slot contract `emdash-tracy-impact.json` `ready: true`; `flow.mjs` **64/64 PASS** on the 15 featured systems; `design-system-measurement.json` with the preview block (`preview-check.mjs`, light and dark, 10 pages); `templates/palette/emdash-tracy-impact.json`; `design-system-roles.json` (0 unresolved; 43 kept with reasons) ships in the release folder.
- **Release chain** (`tools/release-chain.mjs`, sqlite3 from a throwaway Docker container `im-sqlite`, removed): docs, artifact, pack, clean-install, qa (contracts, distribution, preflight, browser 66/66, routing pass), content-api, release. `tracy_setting.json` was composed with `settingFrom` of `scripts/tracy-setting.mjs` from the release's `SHA256SUMS` (the script's `write` command needs a published tag).
- **Repo wiring** as Fresco #739: `emdash-tool.js` + test, `quickstart-render-map.json` row (generated from the sections the kit read), Dockerfile copies, `plan-ci.mjs` group + `standalone:impact` part in `check-tests.ts`, `language-policy.json` rows (the language check passes), `public-tree.json` rows, docs and vocabulary lines.
- **Fast Gate round 3 notes (95):** fixed or decided, see DECISIONS D30. Not signed.

## NOT done / not verified
- **Fast Gate review not signed.** Open: tablet and phone differences of the Home (helpline gap, fund cards clamp, Raise/Goal row, centred event cards, newsletter line), event article icon blocks as cards, Events list card padding, grain textures. The machine Fast Gate passed on an earlier build (`qa/fg-11`); after the fixes of D30 and the colour-role changes it was **not re-run**, no lens notes were merged, no verdict signed.
- **Full-scope visual tiers, the Opus layout lens, and the ten review receipts** (`build`, `security`, `visual-review`, `font-review`, `viewing-contexts`, `editability`, `forms`, `recovery`, `clean-install`, `independent`) were **not run**: in the release's `VERIFICATION.json` these gates are `pending`. `release.mjs` ran with the pending gates.
- Worth-fixing in the pre-check: TCQR PAGE-5 (social glyph list, D26), PAGE-8 (Help & FAQs page record, D27), TDSR IDENT-1 (logo under every system at 390 px), FORM-1 (search and contact fields keep the template fill).
- A model-written personalize run (no model key); `tracy-setting.mjs check` (needs a published release); the Customization and Design System readiness checks of /ops (they read the published release); the regression case (`tests/regression/cases/`: none written; a `feat` PR may say `Regression: none`), the PR itself.

## Kit gap list for the owner (16 errors in `template-kit.json`, approval is yours)
Inherent to EmDash, the same kinds as Fresco's approved kit: 1 block never shown (the off-canvas menu, its links unread), no free head HTML entity (2), no contact entity, no menu blocks (2), no item lists, no menu-item entity, no page shows one article, site fixed texts come from the theme's files, faces of 62 pictures not model-checked. **Specific to this template (5 link labels):** the footer links "About us", "Blog", "Help & FAQs" are lines of a text slot (`Label | /path`), so no label slot names them; the pagination link "2" on Donations and Events uses `?page=2`, which the kit's pagination rule (`?start=`) does not recognise. Fixing them needs a template model change (footer link rows as fields) or a kit rule for `?page=`; not done.

## Release folder
`/home/agent/out/impact/chain/release.1`: quickstart zip, state tarball, kit zip, `design-system-roles.json`, `tracy_setting.json`, `SHA256SUMS` (every file listed and verified), `VERIFICATION.json`. Not uploaded anywhere.

## Owner decisions applied (lead answers, D19–D21)
No dark-mode switch (OS), Contact map stays a link, the blog category is `Animals` and the `Children` list is kept.
