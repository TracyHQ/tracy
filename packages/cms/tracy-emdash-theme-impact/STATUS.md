# STATUS — tracy-impact (JA Impact → EmDash)

Version 0.1.0, **not released**. Road `contract`. Branch `feat/emdash-port-impact`, commits local, nothing pushed. Template kit approval is the owner's and has not been asked for.

## Runtime identity
Package `packages/cms/tracy-emdash-theme-impact`, id `tracy-impact`, EmDash 1.1.0, Astro 7.4.12 (pins copied from `tracy-emdash-theme-fresco`). Source stand: `source/REBUILD.md` (docker `im-web` + `im-db`, `127.0.0.1:18090`, image `impact-php:8.3`, a static server on `source/snapshot` at `18091` serves the mirror). Dev site: `SITE_DATA_DIR=<dir>/data npx astro dev --port 4380`, then `tools/bootstrap-site.sh http://127.0.0.1:4380 <dir>/data`. Evidence and work files are outside the repo (`/home/agent/out/impact/`).

## Phases and gates
- **P0** done: `DECISIONS.md` D1–D18, scaffold from the kit (`scripts/new-template.sh`), stack copied from Fresco, `check-emdash-kit-sync` level (9 templates, 139 identical files).
- **P1** done: stand up, model dumped (`joomla-dump --capture`, `from-joomla`), crawl `source/snapshot` (git-ignored, 273 files, `source/snapshot-SHA256SUMS` committed), `inventory/` (`source-inventory.json`, `routes.json`, `assets.json`, `visual-contract.md`, `content-gaps.md`). The P1 `render-source.mjs` pass was NOT run (the pages were measured with `perf/probe.mjs` / `perf/dom.mjs` / `perf/sections.mjs`).
- **P2** done: `ingest/shape-model.mjs` + `ingest/rebuild-seed.sh` → `seed/seed.json` valid (13 collections, 83 entries, 84 images), `seed/field-map.json`, `seed/plugin-matrix.md`, docs (`docs/*.md`, `node tools/generate-docs.mjs --check` passes).
- **P3** pilot built: header, footer and the Home, measured against the source (1440 px total 8718 vs 8734; 768 and 390 not yet matched, see below). Fast Gate NOT run.
- **P4/P4.5/P4.6**: `seed/questions.json` (name, languages, address and hotline, e-mail; 22 languages), `seed/personalize.json` (identity, replace, copy, rewrite, facts, labels, forms, terms), `tests/lang2-printed-words.test.mjs` (derives the printed fields from the stamps in the components and fails when a rule stops covering one; it has a negative control). The logo is `BrandLogo` with `logo_dark`; under a worn design system the demo logo is drawn through a mask in the on-ink colour. Personalize `--dry-run` runs against the dev site and plans the identity rules; a model-written run was NOT tried (no model key).
- **P5** see the last section.
- **P6–P8** NOT done.

## Not done yet (next commands)
1. Page families merge and measure (see the last section); then `ingest/build-contract.mjs` PAGES/RULES for each page (`node ingest/build-contract.mjs --site <origin>` after `rm qa.contract.json && node tools/qa-contract.mjs init source/snapshot qa.contract.json --config template.config.json`), then `node tools/fast-gate.mjs plan`.
2. Tablet and phone of the Home: section heights at 768 are within ±10% except the events band (+68), the blog band (−170) and the link columns; at 390 within ±8% except the link columns (+196), the blog masonry (+150).
3. Slot contract `packages/design/tracy-ds-slot/templates/emdash-tracy-impact.json` is a DRAFT with `ready: false`: it needs `flow.mjs --cms emdash` on a clean install, `contracts/0.1.0/design-system-measurement.json`, then `ready: true`. The CSS needs `ds-keep` comments on the literals over photographs (run `node scripts/template-design-system-readiness.mjs` on the release copy).
4. P8: `tools/release-chain.mjs`, content map and coverage (`packages/cms/tracy-quickstart-tools/content-coverage/emdash-audit.mjs`), template kit (`contracts/0.1.0/template-kit.json`, byte-identical with the json inside the kit zip), `road-precheck.mjs --tag tracy-impact/emdash-0.x --stage release`, Road rows (`apps/tracy-web/src/lib/emdash-tool.js`, `template-profiles.json`, `quickstart-render-map.json`, Dockerfile copies), `scripts/ci/plan-ci.mjs` group, `scripts/language-policy.json` rows for the 22-language questionnaire, `scripts/opensource/public-tree.json`.

## Open questions for the owner
- D12: the source draws no dark-mode switch although its Tracy slot contract (`joomla-ja-impact.json`) says the switch stays shown; the port draws none and follows the OS. Add a header switch?
- D14: the Contact map is a link, not an embed.
- D16: the source's `Animals` category is called Blog; its sidebar's `Children` list is not ported.
