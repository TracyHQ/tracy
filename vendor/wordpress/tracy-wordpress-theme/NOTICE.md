# NOTICE — whose code, what it depends on

## Code in this folder

Every markdown file, `scripts/`, `examples/`, and the test fixtures are **Tracy's**, written in the TCH repo (private).
No commercial software is bundled — unlike `joomlart-t4-skill`, which carries `t4-framework-for-joomla-6.zip`
"not to be redistributed"; this skill has no `assets/`, pulls nothing from the member area, and the Docker images
it uses are all public.

## Ported from `joomlart-t4-template@1.0.0-tracy.5`

Most scripts are ported from the `joomlart-t4-template` skill (private repo `JoomlArt-26/joomlart-template-plugin`,
Tracy's fork version `1.0.0-tracy.5`, tree at `vendor/joomla/joomlart-t4-skill/`). Each ported file carries the header
`// Ported from joomlart-t4-template@1.0.0-tracy.5 <original path> — WordPress changes: …`. List measured
with `grep -rl "Ported from joomlart-t4-template" scripts` (13/09/2026, 30 files):

```
scripts/checkpoint.mjs                 scripts/review/border-scan.mjs
scripts/content-contract.mjs           scripts/review/contrast-audit.mjs
scripts/design-contract.mjs            scripts/review/hover-scan.mjs
scripts/design-probe.mjs               scripts/review/leak-scan.mjs
scripts/ingest/from-html.mjs           scripts/review/mega-hover.mjs
scripts/ingest/from-url.mjs            scripts/review/probe.mjs
scripts/ingest/spec-pack.mjs           scripts/review/runtime.mjs
scripts/lib/html-bundle.mjs            scripts/review/seam-scan.mjs
scripts/make-design-spec.mjs           scripts/review/toggle-test.mjs
scripts/parse-html-bundle.mjs          scripts/verify-render.mjs
scripts/test/content-contract.test.mjs scripts/test/mega-hover.test.mjs
scripts/test/design-contract.test.mjs  scripts/test/reliability.test.mjs
scripts/test/html-bundle.test.mjs      scripts/test/review-runtime.test.mjs
scripts/test/ingest-adapters.test.mjs  scripts/test/spec-pack.test.mjs
scripts/test/make-design-spec.test.mjs scripts/test/verify-render.test.mjs
```

Written new for WordPress (no port header): `scripts/ingest/from-joomla.mjs`, `scripts/lib/joomla-inventory.mjs`,
`scripts/lib/html-to-blocks.mjs`, `scripts/shoot.mjs`, and the `from-joomla`, `html-to-blocks` tests.
The T4 skill is Tracy's code in a private JoomlArt-26 repo; porting it here brings along neither the T4
framework nor any JoomlArt file.

The references `references/*.md` were rewritten from the corresponding T4 packets, replacing Joomla facts
with WordPress facts measured on the Tracy Base wp7 run.

## Dependencies and licences

| Item | Licence | Note |
|---|---|---|
| WordPress core (images `wordpress:apache`, `wordpress:cli`) | GPL-2.0-or-later | runs on the stand; the generated theme carries `License: GPL-2.0-or-later` in `style.css` per WordPress theme rules |
| MariaDB (image `mariadb:11`) | GPL-2.0 | stand |
| `vendor/tracy/od-design-system` (152 OpenDesign design systems) | Apache-2.0 | token values in `styles/*.json` and the generated `theme.json`; its NOTICE is at `vendor/tracy/od-design-system/NOTICE` |
| `jsdom`, `playwright` (npm) | MIT, Apache-2.0 | the skill's `package.json` |
| Tracy Base content (text, j6 demo images) | Tracy's | per the `release-notes.md` of the `tracy-base/j6` release |
| Contact Form 7 (Q10, plugin in the quickstart — planned) | GPL-2.0-or-later | not bundled in the skill |

The `tracy-base` theme and the `tracy-base/wp7` quickstart are **public** surfaces (released on
`JoomlArt-Products/ja-products`): all text in them is English (root `CLAUDE.md`, "Public surfaces are
English"); this skill lives in a private repo.
