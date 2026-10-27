# Design system

DOCS_REQUIRED: Name the root variation and the shipped style variations, the dark-mode hook
and its storage, the stylesheets and scripts the theme enqueues, and the body classes that
select the navigation and hero layout.

Read ../AGENTS.md. The look is **tokens in theme.json**: a palette, font families, font sizes,
spacing sizes and layout sizes become `--wp--preset--*` CSS variables, and the theme's
stylesheets are written against those variables with no literal colour. A style variation
(`styles/<id>.json`) is a theme.json fragment that swaps the token values; the Site Editor
lists them under Styles (https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/).

## What not to edit by hand

`theme.json`, `styles/*.json`, `assets/css/*` and the pattern and template files are
**generated** and replaced whole by the next theme update. A site-specific change goes through
the Site Editor > Styles — it lands in the `wp_global_styles` row and survives updates — or into
a child theme. An edit made directly to the installed theme's files is lost without notice.

## Switching the look

- Site Editor > Styles > Browse styles: pick a variation; WordPress writes it to global styles.
- By command: `wp eval 'tracy_apply_inspiration("<id>");'` writes the same row without a login.
- Preview without writing: any URL with `?style=<id>` renders in that variation for this
  visitor (kept a day in the `tracy_style` cookie, `?style=` with no value forgets it). Nothing
  is written; the page is marked not cacheable while a preview is active.

## Dark mode

Three states — light, dark, auto — kept in a cookie and applied as `data-theme` on `<html>`
(auto = no attribute, the stylesheet follows `prefers-color-scheme`). The dark values are the
palette restated under `html[data-theme="dark"]` and under the media query for the auto state,
inside theme.json's `styles.css`. The switch script runs in the head so the attribute is set
before first paint. WordPress core has no colour-scheme mechanism of its own; this follows the
Developer Blog approach (`color-scheme` + a toggle,
https://developer.wordpress.org/news/2025/09/building-a-light-dark-mode-toggle/).

To test dark mode: set `data-theme="dark"` on `<html>` (the scanners in docs/checks-and-recovery.md
do that), or click the toggle and reload — the cookie must persist the state.
