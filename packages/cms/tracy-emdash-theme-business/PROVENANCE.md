# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, images, PDFs | `vendor/joomla/html/tracy_business/` (TCH), Claude Design canvas export "Northgate Industrial", 34 pages EN/RU, 49 PNG, 9 PDF; hashes in `tasks/emdash-northgate/inventory/source-inventory.json` | Owner: Tracy/Lee. Released with the package under GPL-3.0-or-later (Lee, 2026-09-14 — `tasks/emdash-northgate/DECISIONS.md` D1). |
| Seed media (`seed/media/`) | copies of the source images/PDFs actually referenced, keyed by source path (`seed/media-map.json`, sha256 each) | same as above |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT (emdash-cms/emdash) |
| Astro, Tailwind, Radix, lucide, clsx, tailwind-merge, cva | npm, exact pins in `package.json` | MIT |
| shadcn/ui primitives | `src/components/ui/*.tsx`, imported once with `shadcn@4.21.0`; hashes in `src/components/ui/PROVENANCE.md` | MIT |
| Fonts | Archivo, Newsreader via Astro fonts API (Google Fonts provider, downloaded at build, served from the site) | SIL Open Font License 1.1 |
| `tools/mint-admin.cjs` | copy of `packages/fleet/tracy-fleet-operation/scripts/provision/emdash/mint-agent-admin.cjs` (TCH), default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill (`vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tools/`), kept byte-identical (`check-kit-sync.mjs`) | Tracy |
| `tools/forms.json`, `tools/build-seed.mjs`, `src/**` | written for this template | Tracy, GPL-3.0-or-later (`LICENSE`; Lee, 2026-09-14, D1) |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
