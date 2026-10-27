# Design system

Read ../AGENTS.md. JA Essence is **not** one of the vendored catalogue design systems
(`variations` is empty in `theme.config.json`; `inspirations.json` lists one entry, `wp-ja-essence`,
category "Measured"). Its look was **measured** on the running source (computed styles, light and
dark, desktop and 390 px, `tasks/ja-essence-wp7/design-contract.json`) and written into
`tokens.css`: 56 tokens, 30 measured, 1 derived and 25 taken from the `apple` design system as a
fallback (the list is at the end of `tokens.css` in the build sources). Do not edit any file below
by hand except the Site Editor's Styles: the build regenerates them.

## Where each thing lives

| Layer | File | Edit by hand? |
| --- | --- | --- |
| Tokens | `tokens.css` (overlay source) | no: written by `theme-tokens.mjs` from the design contract |
| `theme.json` (16 colour presets, fonts `display`/`body`/`mono`, 8 sizes) and `styles/wp-ja-essence.json` | generated from `tokens.css` and `theme.overlay.json` | no |
| Dark half of the colours | `theme.overlay.json` `styles.css` (`light-dark()` presets) | no: change the source and rebuild |
| The look | `assets/css/wp-ja-essence.css`, plus `assets/css/je-home.css`, `je-category.css`, `je-detail.css` | no: theme files, replaced by a theme update |
| Owner overrides | Site Editor > Styles (a `wp_global_styles` row; none at seed time) | yes |

Palette (measured on the source; light / dark): page background `#f8f8ff` / `#11151f`, surface
`#ffffff` / `#1a2130`, footer band `#ffffff` / `#161b27`, body text `rgba(37,36,36,0.7)` /
`#c2c9d6`, headings `#212529` / `#eef1f6`, muted `#6c757d` / `#8c97a8`, border `rgba(0,0,0,0.125)` /
`#2b3548`, accent `#4d6bff` in both, accent hover and active `#1a3eed` / `#7d93ff`, text on the
accent `#ffffff` (4.32:1, kept for parity: D-03). The dark half is the source's `--dm-*` block read
back as computed style.

Type: Jost (400, 500, 600, 700) for headings and interface, Noto Serif (400, 700) for body text,
both self-hosted as woff2 in `assets/fonts/`. A page in Vietnamese (`html:lang(vi)`) draws everything set in Jost in Be Vietnam Pro instead (400, 600, 700, self-hosted): Jost has no Vietnamese letters. Every Jost rule reads the slot `var(--je-font-display, Jost)` or the display preset, and the `html:lang(vi)` rule in `wp-ja-essence.css` sets both; a new rule that names Jost directly would miss it (the theme test refuses one). Noto Serif adds its vietnamese cut by `unicode-range`. Body 16 px on a 24 px line; headings h1 to h6 are
40/32/24/18/16/14 px at desktop and step down with the viewport (h1 28/32/38/40, h2 24/28/32 across
the Bootstrap breakpoints; D-01, slice 11 of the build). The `theme.json` size presets run 12, 14,
16, 16, 18, 24, 32, 40 px. Container 1164 px with 18 px gutters, Bootstrap 5 steps 540/720/960/1164
drawn by the stylesheet's `.je-container` and `.je-header__inner`; the generated `theme.json` layout
sizes (`contentSize`, `wideSize`) are both 1164 px. Radii 4, 8, 16 px and a pill. Icons: social
service glyphs from core's social-link block and a few drawn inline SVGs (theme toggle, search); no
icon font ships.

## Header looks

There is one `parts/header.html`; two looks are chosen by body classes (D-51), from 768 px up:

| Page | Look |
| --- | --- |
| `.home` (the front page `/`) and pages using the `page-landing` template | two rows: social links, site title and Subscribe button on top; menu, theme toggle and search below |
| every other page, from 768 px up | one row grid: the site title small on the left, the menu centred, theme toggle, search, Subscribe; the social links and the hamburger are hidden |

The theme restates `tracy-nav-top-left` and `tracy-hero-split` on `<body>` after the source theme's
filter, so a catalogue style (`?style=`) cannot float the header or recolour the hero. The hamburger button
(always visible on the front page and landing pages, below 768 px elsewhere) opens the off-canvas
drawer, a panel from the right edge with a "Sidebar Menu" band, the theme toggle, a close button and the main menu; Escape,
the close button or a click outside closes it (`assets/js/wp-ja-essence.js`). The page's slug is
a body class `je-slug-<slug>`: type sizes and one listing layout (`category-blog`) key on it, so
**renaming a page slug changes its look**.

## Dark mode

Three states can be saved in the cookie `tracy_theme` (`light`, `dark`, `auto`; one year). Light and dark
are `data-theme` on `<html>`; **auto is no attribute**, and the stylesheet then follows the OS
(`prefers-color-scheme`). `assets/js/wp-ja-essence-dark.js` runs in the head, blocking, so a visitor
who chose dark never sees a light frame; each click on a header toggle (`data-tracy-theme-toggle`,
one in the bar and one in the drawer) flips what the page shows, light to dark and back, as the
source's `darkmode.js` does (from auto it goes to the opposite of the OS setting, so the first click
always changes the page; a click saves `light` or `dark`, never `auto`, which stays readable for a
choice saved by 1.0.0). `?theme=dark|light` on the address
wins for that load only and is never saved. Every colour preset carries both halves with CSS
`light-dark()` (`theme.overlay.json`). The source keeps its choice in a cookie it reads back only
when the OS setting changes, so a visitor who picked dark could see light again after a reload; this
switch reads its cookie on every load (the source behaviour is recorded as a source flaw).

## Motion and interaction

- No motion effect is switched on: option `tracy_motion` is absent, so neither the motion
  stylesheet nor the motion library loads (`tracy_motion_effects()` returns an empty list). To turn
  one on, store `{"effects":[...]}` in `tracy_motion`; do not hand-edit the library.
- The lead slider and the category slides are CSS rows (`overflow-x: auto`, scroll-snap) the
  visitor scrolls (touch swipe needs no script); `assets/js/wp-ja-essence.js` adds previous / next
  buttons and one dot per page (3 cards visible from 992px, 2 below, 1 below 576px; no autoplay),
  and nothing is drawn when every card is already visible. A gallery article's pictures
  (`.jes-gallery`) become a slider with arrows and thumbnails in the hero place; without the script
  they follow the text.
- Menus: below 992px the default layout has a one-row 80px header with the hamburger, from 992px the
  menu is a 123px bar. A desktop submenu opens on hover, on keyboard focus, and on a tap of its
  parent or of its 24px chevron (a tap outside or Escape closes it). The drawer's submenus drill
  down: choosing a parent replaces the list with its children under a back row, three levels deep.
- Header: the main menu is core's navigation block with nested submenus; the "Pages" panel prints
  its second level as columns by CSS (D-52); the drawer is described above.

## Rules for changes

- Colours by preset (`var(--wp--preset--color--...)`), never a raw hex in a new rule.
- No reset or framework in the page; the stylesheets answer to this theme's `je-*` classes.
- A new section: insert an existing pattern from the editor; do not edit `patterns/*.php` on a live
  site.
- `wptexturize` stays on core's default for pages and posts (it is switched off only on the
  design pages `fixture` and `artifact`, which this site does not use).
