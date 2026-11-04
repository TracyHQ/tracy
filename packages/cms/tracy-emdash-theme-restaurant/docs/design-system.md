# Design system

Read `../AGENTS.md`. Values come from the source site's stylesheet (`less/variables.less`) and are recorded in `src/styles/tokens.css`.

## Where things are

- `src/styles/tokens.css`: Tailwind 4 `@theme` tokens (`--color-*`, `--font-*`, `--radius: 0`, `--container-site: 1190px`, `--gutter: 25px`) and the dark block `html[data-theme="dark"]`.
- `src/styles/global.css`: `@import "tailwindcss"`, tokens, base layer, then component classes with prefix `rs-` (display type, wrap, button, header/nav, slideshow, offers, tabs, post card, article, sidebar, footer) and the two breakpoints (991, 575).
- `src/layouts/Base.astro`: the **only** importer of `global.css`.
- `src/components/ui/`: shadcn primitives (`components.json`); shadcn semantic tokens (`--color-primary`, `--color-card`, ...) are mapped onto the template tokens in `tokens.css`.
- Interactive code is inline scripts (no React islands in the views): theme resolve in `Base.astro`; mobile nav and theme toggle in `Header.astro`; slideshow and tabs in `Home.astro`.

## Tokens: roles first, template value as fallback

Each colour is `var(--ds-c-<role>, <template value>)`, and fonts `var(--ds-font-<role>, ...)`. With no design system worn the site looks as designed; a worn system (`data/ds-slot.css`, read per request by `src/lib/ds-slot.ts`, injected as `<style id="tracy-ds-slot">`) overrides the roles. A worn system sets `data-ds-worn`; `data-theme="dark"` is set server-side when its mode is dark. Add a new colour as a role with the template's own fallback; never a bare hex in a component rule.

## Light and dark

Light values come from the source (`less/variables.less`); dark values differ for bg, surface, fg, heading, meta, muted, lines, `accent-text`, `ink` and `ink-line` and are a decision. Accent, secondary, on-ink and logo ground are the same in both. Selector: `html[data-theme="dark"]`, key `tracy-restaurant-theme`; the Tailwind `dark:` variant is bound to it in `global.css`.

## Must not

- No reset or Tailwind outside the storefront: the EmDash admin (`/_emdash/admin`) and Tracy/dsh UI must never receive `global.css` or Tailwind preflight. Do not import `global.css` anywhere but `Base.astro`.
- Focus is one 1px outline that changes colour (`:focus-visible { outline: 1px solid var(--color-accent) }`); no `ring-*` halos or translucent box-shadow rings.
- Do not hard-code colours, or hide customer-page pieces by CSS (use the UI switches catalogue of the host repo).
- Do not copy webfont files from the source; fonts come from Astro's font pipeline (`src/fonts.json`).

## Workflow

Edit source, not `dist/`. `npm run dev` hot-reloads CSS and views. Changes to `astro.config.mjs`, `src/fonts.json` or `src/middleware.ts` need a server restart; a production change needs `astro build` and restarting `node dist/server/entry.mjs`. `data/ds-slot.css` needs neither.
