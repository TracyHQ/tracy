# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Fresco" Joomla 6 quickstart `quickstart/ja-fresco/j6` 1.0.4 (installer zip sha256 `224c8dc881a8752328b6d6400851dd449e755f06757225c2abf67786e9ec40dc`), stood up locally; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder (Restaurant D54, `docs/licensing.md` at the repository root) |
| Demo photographs (`seed/media/`) | the `images/joomlart/**` files of the same release (also shipped in JoomlArt's WordPress release `quickstart/ja-fresco/wp7`, 1.0.1), keyed by source path in `seed/media-map.json` | the same photographs JoomlArt ships in its own released quickstarts of this template |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Playfair Display (headings) and Roboto (text), each as the Latin and Vietnamese unicode-range file Google Fonts serves, from the local files `src/fonts/*.woff2` (declared in `src/fonts.json`, `provider: local`). The Joomla quickstart loads both families from Google Fonts and ships no Playfair file, so the files are the Latin and Vietnamese files Google Fonts serves for that same request (`css?family=Roboto:400,500,700|Playfair Display:400,500,700`, fetched 2026-11-22; the WordPress release's older files set Roboto about 3 percent wider than the Joomla site draws it, DECISIONS D29); the licence notices are `src/fonts/playfair-display-OFL.txt` and `src/fonts/roboto-OFL.txt` | SIL Open Font License 1.1 |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template; the 22-language questionnaire was translated by Claude, not by a native speaker | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
