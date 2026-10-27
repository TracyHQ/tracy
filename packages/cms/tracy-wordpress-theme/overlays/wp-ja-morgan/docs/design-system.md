# Design system

Read ../AGENTS.md. JA Morgan is **not** one of the vendored catalogue design systems
(`variations` is empty in `theme.config.json`). Its look was **measured** on the running source
(computed styles at 1440 and 390 px, light and dark, `tasks/ja-morgan-wp7/design-contract.json`,
D-05) and written into `tokens.css`; a value the source did not provide comes from the `apple`
design system (56 tokens: 33 measured, 23 fallback). Do not edit any file below by hand except the
Site Editor's Styles: the build regenerates them.

## Where each thing lives

| Layer | File | Edit by hand? |
| --- | --- | --- |
| Tokens | `tokens.css` (overlay source) | no: written by `theme-tokens.mjs` from the design contract |
| `theme.json` (16 colour presets, fonts `display`/`body`/`mono`, 8 sizes) | generated from `tokens.css` and `theme.overlay.json` | no |
| Dark half of the colours | `theme.overlay.json` `styles.css` (light-dark() presets) | no: change the source and rebuild |
| The look | `assets/css/wp-ja-morgan.css`, plus `assets/css/groups/{account,content,home}.css` | no: theme files, replaced by a theme update |
| Owner overrides | Site Editor > Styles (a `wp_global_styles` row) | yes |

Palette (measured on the source; light / dark): accent `#d93030` / `#e0463f` (source variable
`--ja-accent`), navy `#1b3060` / `#6f8fd6`, page background `#ffffff` / `#0f1320`, body text
`#777777` / `#a7b0c2`, headings `#333333` / `#f2f4f8`, border `#eaeaea` / `#2a3247`, surface
`#f6f7fb` / `#1a2032`, footer band `#111111` in both. Button text and section kickers stay
`#d93030` in dark, while links use the dark accent (two different reds on purpose, D-12).

Type: PT Root UI (400, 500, 700) for body and headings. Headings h1 to h6 are 60/36/24/20/16/13 px
at weight 500, body 16 px on a 25 px line; hero title 60 px at 700, masthead title 60 px at 600
(36 px at 390). Section rhythm: 150 px top and bottom at 1440, 60 px at 390. Container 1260 px with
15 px gutters (Bootstrap 3 steps 750/970/1260 at 768/992/1200) is drawn by the stylesheet's
`.container`; the generated `theme.json` layout sizes are `contentSize` and `wideSize` of 1024 px,
which the patterns' `.container` groups do not use. Icons: Ionicons (`ion-*`) and Font Awesome 4.5,
shipped as fonts.

## Header variants (home styles)

The source has four T3 styles. The header, palette and layout key on the body class
`jm-route-<page slug>`, so **renaming a home page slug changes its look**:

| Page | Header and palette (from `assets/css/groups/*.css`, measured on the source) |
| --- | --- |
| `home-style-1` (and other pages) | white bar 90 px high with the top bar (address, phone, social links); red accent |
| `home-style-2` | top bar 42 px with border; a logo row that also shows the info block "Call Us / Email Us / Open Hours" (`header.info`, hidden everywhere else and on phones); navy menu bar over the hero; accent green `#21c674`, secondary `#1e375c` |
| `home-style-3` | no top bar; transparent header over the hero with white text, full-width container; accent gold `#c5b48f`, secondary `#67615c` |
| `home-style-4` | no top bar; transparent header over the hero with white text; accent green `#21c674`, secondary `#333399`, body text `#aaaaaa` |
| `/` (front page) | no top bar |

On styles 3 and 4 the hero gives the header's height back as padding (340 px top). The four styles
are the same `parts/header.html`; only CSS and one PHP filter (the info block) differ.

## Dark mode

The page is light or dark and a click flips whichever is showing, as the source's toggle does. The
choice is kept in the cookie `tracy_theme` (one year). Light and dark are `data-theme` on `<html>`;
**no attribute** (no cookie yet, or an old `auto` cookie) follows the OS (`prefers-color-scheme`), so
the first click from there picks the opposite of what the OS shows and always changes the page.
`assets/js/wp-ja-morgan-dark.js` runs in the head, blocking, so a visitor who chose dark never sees a
light frame; the toggle (`data-tracy-theme-toggle`, 36 x 40 px, also on phones) labels itself from what
the page shows. `?theme=dark|light` wins for that load and is never saved. Every colour preset carries
both halves with CSS `light-dark()` (`theme.overlay.json`). The source keeps its choice in
`localStorage`; the cookie is Tracy's convention so previews and pages agree (D-11, 1.1.5: two states,
not three).

## Motion and interaction

- `tracy_motion` default: one effect, `carousel-step` (the source runs Owl carousels and no scroll
  reveal). Carousels: slideshow, feature cards, both testimonial styles; they step only when the
  visitor uses the arrows, dots or slide tabs.
- **No autoplay** (D-15, open): the source's testimonials style-2 autoplays with a fade; the motion
  library has no autoplay, and the port does not fake one. Number counters print their final
  values; the source counts up from 0 over about two seconds (S-43, a measurement artefact).
- Header: the Home dropdown opens on hover or focus; Escape closes it; on phones a submenu stays
  folded until its caret is pressed. The red header button opens the off-canvas "Sidebar" panel
  (the Joomla Pages menu); Escape, the close button or a click outside closes it and focus returns
  to the button.
- Mobile menu in dark mode: dark panel, not the source's white (D-24, open).

## Rules for changes

- Colours by preset (`var(--wp--preset--color--...)`), never a raw hex in a new rule.
- No reset or framework in the page; the stylesheet answers to the source's class names.
- A new section: insert an existing pattern from the editor; do not edit `patterns/*.php` on a live
  site.
- `wptexturize` is off (`inc/groups/content.php`): quotes and dashes typed later are printed
  straight, as the source prints them. Turn it on only deliberately, since text already on the site
  would then read differently.
