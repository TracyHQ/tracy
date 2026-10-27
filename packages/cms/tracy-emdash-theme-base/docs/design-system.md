# Design system

Read ../AGENTS.md first. The design is the OpenDesign "apple" language as the source Joomla theme
implements it; every value below is measured on the source and recorded in
`tasks/emdash-tracy-base/visual-contract.md` (TCH).

## Tokens — `src/styles/tokens.css`

Tailwind v4 `@theme` tokens, light on `:root`, dark under `html[data-theme="dark"]`:

- surfaces `--color-bg` (#fff / #000), `--color-surface` (#f5f5f7 / #1d1d1f), `--color-surface-warm`;
- text `--color-fg`, `--color-fg-2`, `--color-fg-muted`, `--color-fg-meta`; lines `--color-line`,
  `--color-line-soft`;
- the single accent `--color-accent` (#0071e3 / #2997ff) with `-on`, `-hover`, `-active`, `-tint`;
  `--color-success/warn/danger`; the black "scene" pair;
- shadcn semantic names mapped onto those (`--color-primary` = accent, `--color-muted` = surface…);
- type scale 12/14/17/21/28/40/56/80, body 1.47, display tracking −0.015em; radii 8/12/18/32 and the
  980px capsule; ring/raised/focus shadows; container 1024 + gutters 22/18/16; band rhythm 100/64/40.

Use the Tailwind names (`text-fg-muted`, `bg-surface`, `border-line-soft`, `text-accent`,
`bg-accent`, `text-accent-on`, `rounded-[12px]`). Do not add colours in components.

## Shared classes — `src/styles/global.css`

`.wrap` (container), `.band` (vertical rhythm), `.eyebrow`, `.eyebrow-badge`, headings `.h-hero
.h-page .h-article .h-section .h-card .h-card-sm`, `.lead`, `.section-head[--left]`, buttons `.btn
.btn-primary .btn-secondary .btn-ghost .btn-on-accent .btn-sm .btn-xs`, `.card`, `.chip`,
`.chip-outline`, `.meta`, `.photo-frame`, grids `.grid-3 .grid-4 .card-grid`, `.prose-article`,
`.band-accent` (+ `.on-accent-muted/-soft`), `.nav-link`, `.footer-title/-link`, `.sketch`.
`global.css` is imported by `src/layouts/Base.astro` only; the admin never receives it.

## Theme

`html[data-theme="dark"]`, restored before first paint from `localStorage['tracy-base-theme']`, the
OS preference when nothing is stored, or `?theme=dark|light` for one framed load. The toggle
(`[data-tracy-theme-toggle]`) lives in `Header.astro` and the one-page header.

## Fonts

None bundled: `-apple-system, BlinkMacSystemFont, "SF Pro Text", … , sans-serif` — the source's own
stack. `src/fonts.json` is empty but wired, for a design that names a webfont.

## Components and interaction

Section components are Astro (`src/components/sections/`), driven by fields; React islands only
where the page needs script: `MegaMenu` (Radix popover, hover + click, Escape closes), `MobileNav`
(drawer under `lg`), `Carousel` (scroll-snap), `Tabs` (`role=tablist`). FAQ uses `<details>`.
Images go through `Photo.astro` (`photo-frame`, cover) or `BodyImage.astro` inside Portable Text.

## Changing the look

Change a token, not a component, for colour/spacing; add a variant prop to a section component
rather than copying it; keep every page inside `.wrap` and every band on `.band`. Re-run
`tools/shoot.mjs` at 1440/390 × light/dark and compare with `evidence/` before calling it done.
