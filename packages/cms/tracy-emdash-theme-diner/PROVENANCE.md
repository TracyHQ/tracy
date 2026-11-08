# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Diner" Joomla 6 quickstart `quickstart/ja-diner/j6` 1.0.5, stood up locally; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder on 26/10/2026 (grant of Lee, owner of JoomlArt, for JoomlArt's templates and quickstart content in the Tracy repository, dated 26/10/2026, recorded in that repository's `docs/licensing.md`). This port is released under GPL-2.0-or-later (`LICENSE`) |
| Demo photographs (`seed/media/`) | the `images/joomlart/**` files of the same release (also shipped in JoomlArt's WordPress release `quickstart/ja-diner/wp7`, 1.0.5), keyed by source path in `seed/media-map.json` | the same photographs JoomlArt ships in its own released quickstarts of this template (`DECISIONS.md` D12) |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React, Phosphor icons | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Work Sans via the Astro fonts API (Google provider: build-time download, served from the site); Eczar from the local files `src/fonts/eczar-latin.woff2` and `src/fonts/eczar-latin-ext.woff2`. Both are declared in `src/fonts.json` | SIL Open Font License 1.1 |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template; the 22-language questionnaire was translated by Claude, not by a native speaker | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
