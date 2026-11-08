# Design system

Values come from the source site's stylesheet (`templates/ja_diner/less/variables.less`) and are recorded in
`src/styles/tokens.css`.

## Where things are

- `src/styles/tokens.css`: Tailwind 4 `@theme` tokens (`--font-display`, `--font-body`, `--color-*`, `--radius: 0`) and
  the dark block `html[data-theme="dark"]`. shadcn semantic tokens (`--color-primary`, `--color-card`, ...) are mapped
  onto the template tokens there.
- `src/styles/global.css`: Tailwind import, tokens, base layer and the shared component classes (prefix `dn-`); it
  imports the per-family sheets `src/styles/pages/{about,blog,contact,offers,reservation,search}.css`.
- `src/layouts/Base.astro`: the page shell and the importer of the styles; it reads the design-system slot and resolves
  the theme before first paint.
- `src/components/site/`: the Astro components (Header, Footer, Subscribe, cards, prose renderers). `src/components/ui/`
  is empty: no shadcn primitive is installed (`components.json` is kept for the tooling).
- Interactive code is inline scripts (no React islands in the views).
- Fonts: `src/fonts.json` declares Work Sans (Google provider, 400/600/700, latin + latin-ext) and Eczar (local provider,
  `src/fonts/eczar-latin.woff2` and `eczar-latin-ext.woff2`); `astro.config.mjs` feeds them to Astro's fonts API. Eczar
  is declared by the source design but never loaded by the source (`DECISIONS.md` D7).

## Tokens: roles first, template value as fallback

Each colour in `tokens.css` is `var(--ds-c-<role>, <template value>)`, and fonts `var(--ds-font-<role>, ...)`. The
page stylesheets read the tokens, not hex values. With no design system worn, the fallbacks apply and the site is
identical to the template. A worn system is the file `data/ds-slot.css` (written by Tracy; read per request by
`src/lib/ds-slot.ts`, no rebuild needed), injected as `<style id="tracy-ds-slot">`; it sets the `--ds-*` properties and
the site changes. A worn system sets `data-ds-worn` on `<html>`; `data-theme="dark"` is set server-side when its mode is
dark. A file without the generated header is ignored, and only a Google Fonts stylesheet address from the file is
accepted. Add a new colour as a role with the template's own fallback; never a bare hex in a component rule.

## Light and dark

Light values come from the source; the dark values are not in the source and are derived from the same warm paper and
terracotta (`DECISIONS.md`). Selector: `html[data-theme="dark"]`; storage key `tracy-diner-theme` (with a worn system,
`tracy-diner-theme@<id>`); the Tailwind `dark:` variant is bound to the selector in `global.css`.

## Must not

- No reset or Tailwind outside the storefront: the EmDash admin (`/_emdash/admin`) and Tracy/dsh UI must never receive
  `global.css` or Tailwind preflight.
- Focus is one 1px outline that changes colour; no `ring-*` halos or translucent box-shadow rings.
- Do not hard-code colours, or hide customer-page pieces by CSS (use the UI switches catalogue of the host repo).
- Do not copy webfont files from the source; fonts come from Astro's font pipeline (`src/fonts.json`).

## Workflow

Edit source, not `dist/`. `pnpm exec astro dev` hot-reloads CSS and views. Changes to `astro.config.mjs`,
`src/fonts.json` or `src/middleware.ts` need a server restart; a production change needs `pnpm build` and restarting
`node dist/server/entry.mjs`. `data/ds-slot.css` needs neither.
