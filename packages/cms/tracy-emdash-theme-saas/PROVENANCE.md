# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design (layout, colour tokens, type scale, interactions) | JA Kinetic Joomla 6 quickstart 1.0.0 by JoomlArt (`ja-kinetic-j6-quickstart-1.0.0.zip`, sha256 `e08d46fd9f246236b80cd1e8f39aaf57a1d55ce6b34f80599731a9910402ce36`) | © JoomlArt (J.O.O.M Solutions Co., Ltd.). **Released under GPL-2.0-or-later** by the copyright holder on 26/10/2026 (Lee, owner of JoomlArt; grant recorded with the repository's licensing table, `docs/licensing.md`). Before that the template's layout files said "Copyrighted Commercial Software" and its `templateDetails.xml` said GNU/GPLv3; the grant settles both for this package. Values were measured on the rendered site; no PHP, CSS, JS or SVG of the template is included. |
| Demo content (sections, menus, 240 posts, legal text) | the quickstart database, read-only (`joomla-dump.mjs`, `ingest/joomla-extra.mjs`) → `seed/site-model.json` | same as above |
| Seed media (`seed/media/`) | copies of the quickstart images actually referenced, keyed by path (`seed/media-map.json`) | JoomlArt's own quickstart images, GPL-2.0-or-later under the same grant |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT |
| Astro, Tailwind, Radix, lucide, clsx, tailwind-merge, cva, React | npm, exact pins in `package.json` | MIT / ISC (lucide) |
| Fonts | Space Grotesk, IBM Plex Sans, JetBrains Mono via Astro fonts (Google Fonts provider, downloaded at build, served from the site) | SIL Open Font License 1.1 |
| `tools/*`, `contract/*`, `ingest/{detect-source,from-url,from-wp-spec}.mjs`, `tests/*` | kit of the `tracy-emdash-template` skill 1.5.0 | Tracy |
| `tools/mint-admin.cjs` | kit copy of Tracy's fleet provisioner | Tracy |
| `ingest/{normalize-joomla-model,joomla-extra,finish-seed,html-to-portable-text}.mjs`, `seed/compile.config.json`, `tools/forms.json`, `src/**` | written for this template | Tracy, GPL-2.0-or-later with the rest of the package (`LICENSE`) |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
