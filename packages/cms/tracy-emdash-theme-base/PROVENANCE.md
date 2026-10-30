# Provenance — what this template is made of

| Part | Source | License / status |
|---|---|---|
| Design, copy, images | `vendor/joomla/html/tracy_base/` (TCH): snapshot of the Joomla 6 site "Tracy Base" (template `tracy`, theme `base` = OpenDesign "apple"), taken 2026-09-15 from the local `tracy-base-cleanup` stand — 83 rendered pages, the database export (`data/*.json`), 34 referenced images, the 12 marketing sample documents, the template's SCSS/ACM sources; hashes in `SNAPSHOT.json` and `tasks/emdash-tracy-base/inventory/source-inventory.json` | Owner: Tracy (the Joomla site is Tracy's own product, "Tracy Base"; demo studio copy and stock demo images shipped with it). **Released** under GPL-3.0-or-later, like Tracy Business: Lee decided on 2026-09-16 and the quickstart went out as `tracy-base/emdash-0.x` 0.1.0 on JoomlArt-Products/joomlart-products (`tasks/emdash-tracy-base/DECISIONS.md` D30). |
| Seed media (`seed/media/`) | copies of the source images actually referenced, keyed by source path (`seed/media-map.json`, sha256 each) | same as above |
| Marketing samples (`public/marketing/`) | `media/tracy-marketing/*-{light,dark}.html` of the source, byte-identical, with its `LICENSE` and `NOTICE` | as stated in `public/marketing/LICENSE` |
| Design tokens | `templates/tracy/css/styles/base.css` of the source = `vendor/tracy/od-design-system/systems/apple/tokens.css` (OpenDesign) | see `vendor/tracy/od-design-system/LICENSE` |
| EmDash | `emdash@1.1.0` and `@emdash-cms/*` from npm | MIT (emdash-cms/emdash) |
| Astro, Tailwind, Radix, lucide, clsx, tailwind-merge, cva, htmlparser2 | npm, exact pins in `package.json` | MIT |
| shadcn/ui primitives | `src/components/ui/*.tsx`, imported once with `shadcn@4.21.0` for Tracy Business and copied unchanged; hashes in `src/components/ui/PROVENANCE.md` | MIT |
| Fonts | none bundled: the system UI stack (SF Pro on Apple platforms), as the source declares | — |
| `tools/mint-admin.cjs` | copy of `packages/fleet/tracy-fleet-operation/scripts/provision/emdash/mint-agent-admin.cjs` (TCH), default DB path changed | Tracy |
| `tools/*` (generic) | kit of the `tracy-emdash-template` skill, kept byte-identical (`check-kit-sync.mjs`) | Tracy |
| `tools/build-seed.mjs`, `tools/forms.json`, `tools/personalize.mjs` (from Tracy Business), `seed/*.json`, `src/**` | written for this template | Tracy |

No customer data, submissions, tokens or database files are part of the package (`.gitignore`).
