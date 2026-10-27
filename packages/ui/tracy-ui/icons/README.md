# `icons/` — SVG sources of the brand and UI marks

Copied from tracy-desk (`packages/ui/icons/`) on 2026-09-07, together with the generated
components under `src/components/icons/` and the generator in `scripts/`.

| Group | Origin |
|---|---|
| `platforms/light/` | Simple Icons (MIT) — CMS, commerce and social marks. EmDash has no SVG here: its official mark (gradients, MIT, Cloudflare) is hand-written in `src/components/icons/platforms/emdash/light.tsx` so each drawing gets its own gradient ids, and the generator keeps it as a manual dir |
| `platforms/dark/` | **derived**, never edited by hand: `node scripts/icons-platform-dark.mjs` flips near-black and grey fills to white (Ghost, Medium, Notion …) and keeps saturated brand colours; `--check` says whether it is current |
| `providers/`, `models/` | Cherry Studio upstream (`@cherrystudio/ui`), AI vendor and model logos, light and dark sides |
| `general/` | Cherry Studio upstream, UI glyphs |

Regenerate after adding or editing an SVG:

```
pnpm --filter @tracy/ui icons:platform-dark                 # platforms only: refresh dark/ from light/
pnpm --filter @tracy/ui icons:generate --type=platforms   # or providers · models · icons
```

The generator scripts came from tracy-desk as CommonJS; this package is `type: module`, so each carries
an ESM shim (`__dirname`, `require`, the main-module check) at the top.

Generated files carry a "do not edit" header; edit the SVG, not the `.tsx`.

## Importing

- Bench, Storybook, any app with a tree-shaking bundler: `import { Wordpress } from '@tracy/ui/icons'`.
- **A dsh plugin bundled with esbuild: one module per mark** —
  `import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'` (also `providers/*`, `models/*`).
  The package declares no `sideEffects`, so esbuild keeps every module the barrel touches: measured
  07/09, the barrel would put 11 MB of paths into a plugin's `lib/client.js`. Declaring `sideEffects`
  instead re-shapes the bundle of every plugin that uses `@tracy/ui` — a change for its own lane.
