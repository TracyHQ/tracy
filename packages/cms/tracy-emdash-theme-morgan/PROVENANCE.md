# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, layout | JoomlArt "JA Morgan" Joomla 6 quickstart `quickstart/ja-morgan/j6` 1.0.9 (webroot `ja-morgan-j6-webroot-1.0.9.tar.gz` sha256 `bb239ec0968ffdee4346a707d432e7ee03f564ba1ac094135887950fba4faf2a`, database `ja-morgan-j6-database-1.0.9.sql.gz` sha256 `2070ab56e006aa8f6b41788811c15ac63b601afd8a786ba25742251290871180`, both matching the release's `tracy_setting.json`), stood up locally; page list, sizes and colours measured from the rendered site (`qa.contract.json`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). Released under GPL-2.0-or-later by the copyright holder (`docs/licensing.md` at the repository root) |
| Demo photographs (`seed/media/`) | the `images/joomlart/**` and `templates/ja_morgan/images/bg-404.jpg` files of the same release, keyed by source path in `seed/media-map.json` | the same photographs JoomlArt ships in its own released quickstarts of this template |
| Source mirror (not shipped) | `source/snapshot`; `source/snapshot-SHA256SUMS` lists every file's sha256 | reference only |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, React | npm, exact pins in `package.json` and `pnpm-lock.yaml` | MIT |
| Fonts | PT Root UI (400, 500, 700), the face of the source template, from the three `.woff` files of `templates/ja_morgan/fonts/ptrootui` of the quickstart, copied to `src/fonts/` (declared in `src/fonts.json`, `provider: local`); for the Vietnamese range the source's own stylesheet serves Be Vietnam Pro (400, 600, 700, `.woff2`, licence notice `src/fonts/be-vietnam-pro-OFL.txt`) | PT Root UI and Be Vietnam Pro: SIL OFL 1.1 (notices `src/fonts/pt-root-ui-OFL.txt`, copied from the WordPress 1.1.16 webroot of the same template, and `src/fonts/be-vietnam-pro-OFL.txt`) |
| `tools/mint-admin.cjs` | copy of the Tracy fleet script `mint-agent-admin.cjs`, default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill | Tracy |
| `tools/forms.json`, `src/**`, `ingest/**`, `seed/questions.json` | written for this template; the 22-language questionnaire is the one of the sibling Business template, translated by Claude, not by a native speaker | Tracy, GPL-2.0-or-later |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
