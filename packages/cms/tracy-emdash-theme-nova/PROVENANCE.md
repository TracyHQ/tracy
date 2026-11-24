# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Nova" Joomla 6 quickstart `quickstart/ja-nova/j6` 1.0.12 (Joomla 6.1.1, template `ja_nova`, T4), stood up locally from its webroot and database files; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © J.O.O.M Solutions Co., Ltd. (JoomlArt); released under GPL-2.0-or-later on 26/10/2026 (`docs/licensing.md`) |
| Demo pictures (`seed/media/`) | the `images/joomlart/**` files of the same release, keyed by source path in `seed/media-map.json`; decorative icons in `public/nova/` are files of the release's `templates/ja_nova/images/` | the same pictures JoomlArt ships in its own released quickstarts of this template |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React, Phosphor icons | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Golos Text 400/500/700 from the local files `src/fonts/golos-text-*.ttf` (the files of the source's own Google Fonts request, fetched 2026-11-24) | SIL OFL 1.1 (`src/fonts/OFL.txt`) |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
