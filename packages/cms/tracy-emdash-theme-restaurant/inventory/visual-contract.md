# Visual contract (P1) — JA Restaurant

Source: Joomla/T3 template JA Restaurant j6 1.0.6, measured on the local stand at 1440 and 390 wide
(`inventory/measured-home-1440.json`, `measured-home-390.json`, computed styles). Source variables:
`templates/ja_restaurant/less/variables.less` (`L:<n>` below = line in that file). Tokens live in
`src/styles/tokens.css`, rules in `src/styles/global.css` (class prefix `rs-`).

## Colour tokens (light = source, dark = decision)

Dark values are **not in the source**: the source `html[data-theme]` changes no colour (`inventory/content-gaps.md` G-11).
The dark palette is a derived decision (DECISIONS D8, owner review `[LEE]`).

| Token | Light | Provenance of the light value | Dark (D8) |
|---|---|---|---|
| `--color-bg` | `#f4f2e7` | `@body-bg` L:81; measured `heroSection.backgroundColor` | `#1d1a17` |
| `--color-surface` | `#ffffff` | measured `offItem` / `tabsBox` backgroundColor | `#26221e` |
| `--color-fg` | `#3a352f` | `@text-color` L:82; measured `rgb(58,53,47)` | `#e9e3d4` |
| `--color-heading` | `#333333` | `@gray-dark` L:17; measured `heroH1.color` | `#f4f2e7` |
| `--color-meta` | `#555555` | `@gray` L:18; measured `artMeta.color` | `#aaa392` |
| `--color-muted` | `#6b655c` | template choice, no source line found | `#b4ad9c` |
| `--color-line`, `--color-line-soft` | `#d9d4c3`, `#e6e1d0` | template choice, no source line found | `#3d3730`, `#332e28` |
| `--color-accent` | `#d24a24` | `@brand-primary` L:27; measured `featBtn.backgroundColor` | same |
| `--color-accent-hover` | `#b93d1b` | source rule is `darken(@link-color, 15%)` L:90; the hex is not recorded as computed from it | same |
| `--color-accent-text` | `#bc4220` | template choice (text-on-cream contrast); no source line | `#f08a68` |
| `--color-secondary` | `#ffd33d` | `@brand-secondary` L:28; measured `navActive.color` | same |
| `--color-ink` | `#3a352f` | `@navbar-default-bg` L:327; measured `footer.backgroundColor` | `#2b2622` |
| `--color-on-ink` / soft | `#fff` / `rgba(255,255,255,.8)` | `@navbar-default-color` L:326; measured `sidebarLink.color` | same |
| `--color-ink-line` | `rgba(255,255,255,.22)` | source border is `#615e59` (L:328); the alpha form is the template's | `.16` alpha |
| `--color-destructive` | `#d9534f` | `@brand-danger` L:31 | same |
| `--color-logo-ground` | `#f4f2e7` | cream plate behind the logo, both themes | same |

Every colour reads `var(--ds-c-<role>, <value>)` first (see `docs/design-system.md`).

## Type scale (measured, 1440 unless noted)

| Role | Font | Size / line-height | Letter-spacing | Weight | Case |
|---|---|---|---|---|---|
| Display h1/h2 (`.rs-display`; hero, offers, tabs, page title) | Teko | 58px / 63.8px (page header 58/58) | 6px | 300 | upper |
| Display at 390 | Teko | 46px / 50.6px; section title 36px / 39.6px | 3px; section title 6px | 300 | upper |
| Slide title | Teko | 100px / 100px (390: 22px / 28.6px as implemented) | normal | 700 | upper |
| Body | Noticia Text | 16px / 30px | normal | 400 (hero intro 300) | none |
| Item/dish/article title | Noticia Text | 22px / 28.6px (offer h3: 22px / 30px) | normal | 700 | none |
| Dish price | Noticia Text | 22px / 41.25px, colour `#d24a24` | normal | 700 | none |
| Article meta | Noticia Text | 13px / 24.4px, `#555` | normal | 400 | none |
| Nav link | Roboto Mono | 14px / 30px | normal | 400 | upper |
| Top bar | Roboto Mono | 11px / 50px (container 16px) | normal | 400 | upper |
| Button | Roboto Mono | 14px / 30px | 1px | 700 | upper |
| Sidebar module title | Roboto Mono | 14px / 18.2px | 2px | 500 | upper |
| Footer text | Noticia Text | 14px / 26.25px | normal | 400 | none |

Source families: Teko L:95/115, Noticia Text L:96, Roboto Mono L:99. Source defect `"Teko)"` is G-1.
Fonts load through Astro's font pipeline (D10), `src/fonts.json`.

## Spacing and grid

- Container 1190px, side padding 25px (`.rs-wrap`; measured `header` 1190 wide, padding 25).
- Top bar 50px; logo 178x110 (390: 78x50); header bottom padding 50px.
- Nav: `.rs-nav` 104px = 10px padding + 84px inner (`nav` measured 84; source `@navbar-height` 80 L:320); nav links padding 25px 15px.
- Section padding: hero 210px top / 180px bottom; offers and menu tabs 180px; 60px at max-width 991px.
- Menu tabs box padding 120px 200px (measured `tabsBox`); sidebar module padding 50px (`sidebarMod`); main body padding 30px 25px (`mainbody`).
- Slideshow 720px high at 1440; 390:195 aspect ratio at 991 and below.

## Breakpoints

`global.css` uses `max-width: 991px` (nav collapses, grids go single column, display type shrinks) and
`max-width: 575px` (post card stacks). The source is measured only at 1440 and 390; that 991 and 575 are the
source's own Bootstrap/T3 breakpoints is **open** (not verified in the files read). `prefers-reduced-motion` stops the slide fade and auto-advance.

## Theme hook

`html[data-theme="dark"]`; absent attribute = light. localStorage key `tracy-restaurant-theme`
(`tracy-restaurant-theme@<id>` while a design system is worn). Resolved before first paint by an inline script in
`src/layouts/Base.astro` (`?theme=` > saved > OS preference); the header button `[data-theme-toggle]` flips it.

## Interactions: source -> implemented

| Source | Implemented |
|---|---|
| Dropdown main nav (T3 mega/dropdown) | `.rs-sub` shown by CSS on `li:hover` and `li:focus-within`; three levels in markup (`Header.astro`) |
| Mobile nav | not off-canvas: a button (`.rs-nav-toggle`, `aria-expanded`) opens an in-flow `.rs-mobile-nav` panel under the bar at <=991px; Escape closes it |
| Owl-carousel slideshow | fade slides (`.rs-slide`, 0.6s), numbered buttons, auto-advance every 6s unless reduced motion; inline script in `Home.astro` |
| Menu tabs | `role=tablist/tab/tabpanel`, click switches `aria-selected` and `hidden`; no arrow-key handling |
| Dark mode | none in source; added (D8) |

## Component map

Static Astro (no script): `Header` (markup), `Footer`, `Masthead`, `Sidebar`, `BrandLogo`, `Prose*`, views.
Inline script: header (mobile nav, theme toggle), `Home.astro` (slideshow, tabs), `Base.astro` (theme resolve, frame-height message). No React island is used by the views.

## Home page: built vs not built (P5)

Built: top bar, logo, nav, slideshow, welcome hero, special offers, discover-our-menu tabs, featured posts list, sidebar (categories + first testimonial), footer.
Not built yet (P5): features collage (`features_intro/features-intro`), subscribe form (needs Forms plugin, P4/P5), gallery strip, OpenTable, Happy hours, statistics, team, timeline, other page families (page, gallery, menu pages, login/account).
