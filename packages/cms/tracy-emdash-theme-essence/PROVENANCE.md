# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Essence" Joomla 6 quickstart `quickstart/ja-essence/j6` 1.0.10 (Joomla 6.1.1, template `ja_essence`), stood up locally from its webroot and database files; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder on 26/10/2026 (grant of Lee, owner of JoomlArt, for JoomlArt's templates and quickstart content in the Tracy repository, dated 26/10/2026, recorded in that repository's `docs/licensing.md`). This port is released under GPL-2.0-or-later (`LICENSE`) |
| Demo pictures (`seed/media/`) | the `images/joomlart/**` files of the same release, keyed by source path in `seed/media-map.json` | the same pictures JoomlArt ships in its own released quickstarts of this template (`DECISIONS.md` D13) |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React, Phosphor icons | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | Jost and Noto Serif from the local files `src/fonts/jost-*.woff2`, `src/fonts/noto-serif-*.woff2` (the files of the source's own Google Fonts request, v20 and v33, subsets latin, latin-ext, vietnamese); Be Vietnam Pro from `src/fonts/be-vietnam-pro-*.woff2` (the release's own files, used only on Vietnamese pages). Declared in `src/fonts.json`; notices in `src/fonts/OFL.txt` and `src/fonts/be-vietnam-pro-OFL.txt` | SIL Open Font License 1.1 |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
