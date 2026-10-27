# Design system

Read ../AGENTS.md. JA Fresco is **not** one of the vendored catalogue design systems (`variations`
is empty in `theme.config.json`). Its look was **measured** on the running source (computed styles
at 390, 768, 992 and 1440 px, `tasks/ja-fresco-wp7/design-contract.json`) and written into
`tokens.css`; each token there says whether it was measured, hand-set from a named measurement,
derived, or a fallback the source did not provide. Do not edit any file below by hand except the
Site Editor's Styles: the build regenerates them.

## Where each thing lives

| Layer | File | Edit by hand? |
| --- | --- | --- |
| Tokens | `tokens.css` (overlay source) | no: written by `theme-tokens.mjs` from the design contract |
| `theme.json` (colour presets, fonts `display`/`body`/`mono`, sizes) | generated from `tokens.css` and `theme.overlay.json` | no |
| The source's own theme layer | the `--jf-*` variables at the top of `assets/css/wp-ja-fresco.css`, one per source token, the source's value (D-09) | no |
| The look | `assets/css/wp-ja-fresco.css`, plus `assets/css/groups/{ga,gb,gc,gd,gd-auth}.css` | no: theme files, replaced by a theme update |
| Owner overrides | Site Editor > Styles (a `wp_global_styles` row) | yes |

Palette (measured on the source): page background `#0a0b0a`, surface `#1b1a1c`, body text
`rgba(255,255,255,.8)`, headings `#ffffff`, border `rgba(255,255,255,.07)`, accent `#e6c9a2`
(beige). Text on the accent is `#0a0b0a` (`--accent-on`), not the source's white: white on the
beige is 1.59:1 and fails WCAG AA (D-02, open). Success, warning and danger are fallbacks.

Type: Playfair Display for headings (display), Roboto for body, both shipped as `woff2` with their
OFL licences in `assets/fonts/`. Body 16 px on a 1.5 line. Corners are square (radius 0) on
buttons, inputs and cards, as on the source. Section rhythm: 128 px top padding at desktop.

## One look

The source has a single dark design: no `data-theme`, no dark stylesheet, no switch (D-01, open).
The base theme's colour-scheme wiring is kept (the `tracy_theme` cookie, `data-theme` on `<html>`,
`assets/js/wp-ja-fresco-dark.js` in the head, `?theme=dark|light` for one load), but both halves of
every colour preset carry the same value, so a state changes nothing visible and no toggle is
drawn. An owner who wants a light look has to design one; it is not derived.

## Header and page layouts

- One bar: logo left, main menu, the "Book Table" button. The button opens a dialog (the source's
  Bootstrap modal): close button, Escape or a click on the backdrop closes it; focus stays inside
  and returns to the button. Without JavaScript the link lands on the dialog through `:target`.
  Below 576 px the button is a calendar icon whose text stays as the accessible name.
- A top bar part (`parts/topbar.html`) sits above the header on every template but the 404.
- Below 992 px the menu is WordPress's navigation overlay, drawn as the source's off-canvas drawer
  with the logo in its head; a submenu stays folded until its caret is pressed. The source has two
  buttons opening the same list; the port has one (D-10, open).
- The desktop dropdown opens on hover or focus; Escape closes it.
- Body classes `jf-route-<slug>`, `jf-parent-<slug>` and `jf-layout-home` let the stylesheet tell
  pages apart; **renaming a page slug can change its look** (the home layout follows the slugs
  `home-2`, `home-3`, `about`, `gallery`, `chiefs`, `menu`, `offer` and the front page).
- A back-to-top button (50 px square, bottom right) shows after one screen of scrolling.

## Motion and interaction

- `tracy_motion` default: one effect, `carousel-step` (the source runs Owl carousels and no scroll
  reveal). Carousels step only when the visitor uses their controls.
- **No autoplay** (D-05, open): the source's gallery strip slides on its own; the motion library
  has no autoplay and the port does not fake one. The class `jf-autoplay` keeps the source's
  setting for a later switch.
- The text slider on `/home/home-3` stands still, centred and wrapped, where the source slides it
  sideways and cuts words at the screen edges (D-19, open).

## Rules for changes

- Colours by preset (`var(--wp--preset--color--...)`) or the `--jf-*` layer, never a raw hex in a
  new rule.
- No reset or framework in the page; the stylesheet answers to the source's class names.
- A new section: insert an existing pattern from the editor; do not edit `patterns/*.php` on a live
  site.
