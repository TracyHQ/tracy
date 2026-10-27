# Design system

Read ../AGENTS.md. Preserve source design and third-party provenance. Storefront
Tailwind/reset stays outside the EmDash admin and any host UI. Edit source, not dist.

## Tokens and themes

- `src/styles/tokens.css`: role tokens `--k-bg --k-surface --k-elevated --k-text --k-heading --k-muted
  --k-border --k-primary --k-primary-ink --k-primary-hover --k-accent --k-grid --k-shadow --k-logo`
  (+ `--k-panel*` for the dark code/terminal panels), defined for three colour directions
  (`html[data-style="terminal|blueprint|signal"]`) × two themes (`html[data-theme="light|dark"]`), and
  mapped onto Tailwind/shadcn names (`--color-bg`, `--color-primary`, `--color-card`, …). Components use
  the role names only, so a direction or theme never needs component code.
- Theme selector: `html[data-theme]`. `src/layouts/Base.astro` sets the page's default (Blueprint light,
  Terminal and Signal dark) and an inline script restores `localStorage['kinetic-theme']` before first
  paint; the header toggle writes it. The direction comes from the page entry's `style`.
- Fonts: `src/fonts.json` (Space Grotesk headings, IBM Plex Sans body, JetBrains Mono labels), downloaded
  at build time by Astro Fonts and served by the site.

## Styles and components

- `src/styles/global.css`: imports Tailwind and the tokens, base element styles, and the shared patterns
  (`k-container k-section k-band k-grid-bg k-eyebrow k-h1 k-h2 k-h3 k-sub k-btn k-btn-primary k-btn-ghost
  k-btn-sm k-prompt k-card k-panel k-chip k-dot k-rule`). Imported only by `Base.astro`.
- Section components: `src/components/sections/*.astro` (scoped `<style>` for their own details).
- Chrome: `src/components/site/`; React islands in `src/components/islands/` (megamenu, drawer, theme toggle);
  shadcn primitives, if present, in `src/components/ui/` with their provenance.
- Icons: `src/components/Icon.astro` renders lucide icons by name, server-side.

## Admin isolation

The admin at `/_emdash/admin` is a separate application. Verify with
`curl -s <origin>/_emdash/admin/ | grep stylesheet`: it must not load the storefront stylesheet.

## Workflow and restarts

Edit `src/` and reload; the dev server hot-reloads components, views, styles and tokens. Restart the dev
server after changing `astro.config.mjs`, `src/fonts.json`, plugins, dependencies or `src/live.config.ts`.
A production site needs `pnpm build` and a process restart for any source change.
