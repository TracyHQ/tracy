# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Restaurant" Joomla 6 quickstart `quickstart/ja-restaurant/j6` 1.0.6, stood up locally; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder on 26/10/2026 (grant of Lee, owner of JoomlArt, for JoomlArt's templates and quickstart content in the Tracy repository, dated 26/10/2026, recorded in that repository's `docs/licensing.md`; the template's `templateDetails.xml` said GNU/GPLv3 before, the grant settles it). This port is released under GPL-2.0-or-later (`LICENSE`) |
| Demo photographs (`seed/media/`) | the `images/joomlart/**` files of the same release (also shipped in JoomlArt's WordPress release of the template), keyed by source path in `seed/media-map.json` with sha256 each | the same photographs JoomlArt ships in its own released quickstarts of this template |
| Source mirror (not shipped) | `source/snapshot` rebuilt per `source/REBUILD.md`; `source/snapshot-SHA256SUMS` lists every file's sha256 (`sha256sum -c` from inside `source/snapshot/`) | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React, Phosphor icons | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Teko, Noticia Text and the other families of `src/fonts.json` via the Astro fonts API (build-time download from Google Fonts, served from the site) | SIL Open Font License 1.1 |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill, kept byte-identical (`check-kit-sync.mjs`) | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template; the 22-language questionnaire was translated by Claude, not by a native speaker | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
