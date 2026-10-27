# Design system

Read ../AGENTS.md. The look is **tokens in theme.json**: 16 colours (`bg`, `surface`,
`surface-warm`, `fg`, `fg-2`, `muted`, `meta`, `border`, `border-soft`, `accent`, `accent-on`,
`accent-hover`, `accent-active`, `success`, `warn`, `danger`), 3 font families (`display`,
`body`, `mono`), 8 font sizes (`xs` … `xxxxl`), 8 spacing sizes (`1` … `12`), a 1024px content
width and the `settings.custom` scales (leading, tracking, section-y, radius, elevation, focus
ring, motion, ease, container). They become `--wp--preset--color--accent`,
`--wp--preset--font-family--display`, `--wp--custom--section-y--desktop` and so on; the
stylesheets under `assets/css/` are written against those variables with no literal colour.

The default values are the OpenDesign **`apple`** design system — measured token for token
against the Joomla source's "Base" look (accent `#0071e3`, text `#1d1d1f`, surface `#f5f5f7`,
body 17px, SF Pro) — generated into `theme.json` at build; no token was hand-written.

## Style variations

Two, in `styles/` (https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/):

| Id | What it is |
| --- | --- |
| `apple` | the default look restated as a variation, so the Site Editor can return to it |
| `airbnb` | the OpenDesign `airbnb` system: Airbnb Cereal type, `#ff385c` accent, slightly larger radii |

Each carries `settings.custom.tracy.inspiration = <id>`, which is how the theme knows which
system a site wears (`tracy_site_inspiration()` reads the merged global styles).

- Site Editor > Styles > Browse styles: pick one; WordPress writes the `wp_global_styles` row.
- By command, no login: `wp eval 'tracy_apply_inspiration("airbnb");'`. It also records the
  system's `tracy_nav`/`tracy_hero` options — which `inc/extra.php` then overrides for the body
  classes (below).
- Preview without writing: any URL with `?style=airbnb` renders in that variation for this
  visitor, kept a day in the `tracy_style` cookie; `?style=` with no value forgets it. Nothing is
  written, and the page is marked not cacheable while a preview is active.

## Layout archetypes: the body classes

`layout.css` (source theme) keys on `tracy-nav-<archetype>` and `tracy-hero-<archetype>`. The
`apple` system declares nav `overlay` and hero `cover` (a header floating over a full-bleed photo,
hero text painted in the background colour). Tracy Base has no such photo, so `inc/extra.php`
pins the body to **`tracy-nav-top-left`** (a bar, as the Joomla source) and **`tracy-hero-split`**
— measured: without the pin the home hero rendered white-on-white in light and black-on-black in
dark. Switching variation does not change these classes.

## Dark mode

Three states — light, dark, auto — kept a year in the **`tracy_theme` cookie** and applied as
**`data-theme="light|dark"` on `<html>`**; auto is the attribute's absence, and the stylesheet
then follows `prefers-color-scheme`. The dark values are the 16 colour presets restated in
`theme.json`'s `styles.css` under `html[data-theme="dark"]` and, for the auto state, under
`@media (prefers-color-scheme: dark) { html:not([data-theme]) … }`; `color-scheme: light dark`
on `html` lets form controls follow. The values are the Joomla source's dark hook mapped token
for token (`bg #000000`, `surface #1d1d1f`, `fg #f8f8f8`, `accent #2997ff` …). It is **one set**: the
variations carry no dark values of their own, so a site wearing `airbnb` still gets these dark
colours — the light accent changes, the dark one does not.

`assets/js/tracy-base-dark.js` runs in the head, blocking, so the attribute is on the root
before first paint; the header's toggle (`[data-tracy-theme-toggle]`, a `core/html` block in the
header part) cycles light → dark → auto on click and updates its `aria-label`,
`aria-pressed` and `data-theme-state`. WordPress core has no colour-scheme mechanism of its own;
this follows the Developer Blog's `color-scheme` + toggle approach
(https://developer.wordpress.org/news/2025/09/building-a-light-dark-toggle-with-the-interactivity-api/)
with a cookie instead of the Interactivity API store.

To test dark mode: set `data-theme="dark"` on `<html>` (the scanners in docs/checks-and-recovery.md
do that), or click the toggle and reload — the cookie must persist the state (`toggle-test.mjs`).
A page cached for everyone (a caching plugin) is cached in the auto state, which is correct: the
attribute is set client-side.

## What not to edit by hand

`theme.json`, `styles/*.json`, `assets/css/*`, `patterns/`, `templates/`, `parts/` and `inc/` are
**generated** (`node scripts/build.mjs --target tracy-base` in `@tracy/wordpress-theme`, from
`src/tracy/` + `overlays/tracy-base/`) and replaced whole by the next theme update. A
site-specific change goes through the Site Editor > Styles — it lands in the `wp_global_styles`
row and survives updates — or into a child theme. An edit made directly to the installed theme's
files is lost without notice. A change meant for every Tracy Base site is a change to the overlay,
rebuilt and released.

Stylesheets, in load order: `tracy.css` (tokens → base rules), `layout.css` (archetypes),
`sections.css` (the library sections), `tracy-base.css` (header bar, mega panel, footer columns,
toggle), `sections-extra.css` (the 21 own sections); `tracy-motion.css` when motion is on;
`tracy-base.css` is also the editor stylesheet. The design pages (`fixture`, `artifact` templates,
unused here) load their own system's stylesheet and none of these.
