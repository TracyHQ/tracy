# Design system

Read ../AGENTS.md. Preserve the source design and provenance. Storefront Tailwind/reset stays outside the EmDash admin and Tracy/dsh UI: `src/styles/global.css` is imported only by `src/layouts/Base.astro`. Edit source, never `dist/`; a CSS or component change needs the Visual QA run again.

- Tokens: `src/styles/tokens.css` (`@theme` colours and fonts, the `--sec-pad` band padding and the `--h1-size`..`--h6-size` scale, with the source's breakpoints 1200/768). Every colour reads a Design-system role first (`var(--ds-c-<role>, <template value>)`), so a worn system changes the site and a site with none looks as designed. The light values are the source's (`@brand-primary #d93030`, `@brand-secondary #1b3060`, text `#777`, headings `#333`); the dark values are the source's own `darkmode.css` (page `#0f1320`, cards `#1a2032`, lines `#2a3247`).
- Theme switch: `html[data-theme="dark"]`, a click on `[data-theme-toggle]` saves the choice in `localStorage` (`tracy-morgan-theme`); `?theme=dark|light` wins for one load. `template.config.json` `qa.theme` declares the selector for the slot contract.
- Styles: `src/styles/global.css` (base, buttons, top bar, header, off-canvas menu, footer), `src/styles/blocks.css` (the page bands), `src/styles/pages/*.css` (blog, post, contact, search and the error page); class prefix `mg-`; no reset, no focus halos (focus is a 1 px outline).
- Fonts: `src/fonts.json` + `src/fonts/` (PT Root UI 400, 500, 700 and, for the Vietnamese range, Be Vietnam Pro; local files).
- Interactive parts are small scripts inside their components (off-canvas menu, theme switch, slideshow tabs, quote dots); there are no React islands in the storefront.
- Worn Design system: `SITE_DATA_DIR/ds-slot.css` is read by `src/lib/ds-slot.ts`.
