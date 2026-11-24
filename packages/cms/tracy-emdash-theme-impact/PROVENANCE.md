# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Impact" Joomla 6 quickstart `quickstart/ja-impact/j6` 1.0.6 (`ja-impact-j6-webroot-1.0.6.tar.gz` sha256 `9cb9ac3cb54e2717e866131aa24d1f34a8a0ebc9c845736feda00602efcaf679`, `ja-impact-j6-database-1.0.6.sql.gz` sha256 `a8e0ae5f7bd6c76c554426afcb7f94822685ac5c1a02dcfcb0f50eb4cee382a4`), stood up locally; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder (Restaurant D54, `docs/licensing.md` at the repository root) |
| Demo photographs (`seed/media/`) | the `images/joomlart/**` files of the same release (also shipped in JoomlArt's WordPress release `quickstart/ja-impact/wp7`, 1.0.11), keyed by source path in `seed/media-map.json` | the same photographs JoomlArt ships in its own released quickstarts of this template |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Readex Pro, one variable file per subset (Latin, Latin Extended, Vietnamese) as Google Fonts serves them for the request the Joomla quickstart makes (`src/fonts/readex-pro-*.woff2`, declared in `src/fonts.json`, `provider: local`; SIL OFL, notice in `src/fonts/readex-pro-OFL.txt`); Font Awesome Free glyph fonts `fa-solid-900.woff2` and `fa-brands-400.woff2` copied from the WordPress port of the same template (SIL OFL 1.1 for the fonts, notice in `src/fonts/font-awesome-LICENSE.txt`) | OFL |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template; the 22-language questionnaire was translated by Claude, not by a native speaker | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
