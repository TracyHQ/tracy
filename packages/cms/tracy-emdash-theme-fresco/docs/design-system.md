# Design system

Read ../AGENTS.md. Preserve the source design and provenance. Storefront Tailwind/reset stays outside the EmDash admin and Tracy/dsh UI: `src/styles/global.css` is imported only by `src/layouts/Base.astro`. Edit source, never `dist/`; a CSS or component change shows in `astro dev` at once, a built site needs `pnpm build` and a restart.

- Tokens: `src/styles/tokens.css` (`@theme` colours, fonts, the `--gutter-*` and `--h1-size`..`--h6-size` scale with the source's breakpoints 1420/992/576). Every colour reads a Design-system role first (`var(--ds-c-…, <template value>)`), so a worn system changes the site and an unworn one leaves it exactly as designed. The page is near-black only; `data-theme="dark"` mirrors the system/QA state without changing the look.
- Styles: `src/styles/global.css` (base, header, footer, Book Table dialog, shared parts), `src/styles/blocks/*.css` (one per block), `src/styles/pages/*.css` (page families); class prefix `fr-`; no reset, no focus halos (focus is a 1 px outline).
- Fonts: `src/fonts.json` + `src/fonts/` (Playfair Display, Roboto; local files with the Latin and Vietnamese ranges).
- Interactive parts are small inline scripts inside their components (off-canvas menu, Book Table dialog, testimonials, gallery lightboxes, video facade); there are no React islands in the storefront.
- Worn Design system: `SITE_DATA_DIR/ds-slot.css` is read by `src/lib/ds-slot.ts`.
