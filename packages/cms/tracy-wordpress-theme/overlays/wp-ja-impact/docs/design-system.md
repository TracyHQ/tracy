# Design system

- **Tokens**: measured on the running source, carried by `theme.json` (generated from
  `tokens.css` of the build): navy `#1d3677` (headings, header band, footer), green `#0cb76d`
  (buttons, hover), warm band `#fff9ef`, card surface `#fbfbfb`, border `#e9ecef`, text `#495057`,
  radius 8 px, container 1376 px (Bootstrap steps 540/720/960/1140/1376).
- **Type**: Readex Pro for body, headings and menu; body 16 px / 1.6; headings 500, h1 72 px,
  h2 40, h3 28, h4 24, h5 18, h6 16, smaller below 1200 and 992 px (as the source), letter-spacing
  fixed per level.
- **Dark mode**: every colour preset carries both halves through `light-dark()`
  (`theme.overlay.json` `styles.css`; dark = the source's `--dm-*` block). Three states kept in the
  cookie `tracy_theme`: `light`, `dark`, `auto`; `data-theme` on `<html>`, absent = auto (the OS
  decides). The head script `assets/js/wp-ja-impact-dark.js` sets it before the first paint; the
  header button cycles light, dark, auto. `?theme=dark|light` wins for one load and is not saved.
  The navy bands stay navy in dark, as the source's do.
- **Motion**: the carousels step with the motion library's `carousel-step` effect (default of the
  option `tracy_motion`; saving `{"effects":[]}` turns it off). The icon-card carousel, the
  accordion, the video dialog and the 404 digits have their own small scripts/animations;
  `prefers-reduced-motion` is honoured for the animations.
- **Do not edit by hand**: `theme.json`, `styles/`, `templates/`, `parts/`, `patterns/`, `assets/`,
  `inc/` (replaced by the next build). Tokens change in the build's `tokens.css`; page-level
  overrides go in the Site Editor.
- White text on the green button and orange tags is 2.6:1, as the source draws it (decision D-03).
