# Design system

Read ../AGENTS.md. Preserve the source design and provenance (`PROVENANCE.md`). Storefront Tailwind/reset stays outside the EmDash admin and Tracy/dsh UI: `src/styles/global.css` is imported only by `src/layouts/Base.astro`. Edit source, never `dist/`; a CSS or component change shows in `astro dev` at once, a built site needs `pnpm build` and a restart.

- Tokens: `src/styles/tokens.css` (`@theme` colours, fonts, the module colours green/yellow/red/cyan and the dark `--dm-*` palette). Every colour reads a Design-system role first (`var(--ds-c-..., <template value>)`), so a worn system changes the site and an unworn one leaves it exactly as designed.
- Styles: `src/styles/global.css` (base, buttons, shared parts), `src/styles/blocks/*.css` (chrome, hero, features, carousels, bands), `src/styles/pages/*.css` (posts, projects, pages); class prefix `nv-`; no reset, focus is a 1 px outline, never a halo.
- Theme: light and dark, selected by `html[data-theme="dark"]` (`@custom-variant dark` in `global.css`). `Base.astro` resolves it before first paint from `?theme=`, then the visitor's choice in `localStorage` key `tracy-nova-theme`, then the OS preference; the switch is `src/components/site/ThemeToggle.astro`.
- Fonts: `src/fonts.json` + `src/fonts/` (Golos Text 400/500/700, local files, OFL notice in `src/fonts/OFL.txt`).
- Components: Astro components in `src/components/blocks` and `src/components/site`; `components.json` is the shadcn configuration but `src/components/ui/` holds no primitives. Interactive parts are small scripts inside their components (off-canvas menu, carousels in `src/lib/carousel-client.ts`, newsletter in `src/lib/newsletter-client.ts`, theme toggle); React is registered in `astro.config.mjs` but the storefront views use no React islands.
- Worn Design system: `SITE_DATA_DIR/ds-slot.css` is read per request by `src/lib/ds-slot.ts` and injected by `Base.astro`; no rebuild is needed to switch systems.
