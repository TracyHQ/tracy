# Design system

Read ../AGENTS.md. The look is **tokens in theme.json**: 16 colours (`bg`, `surface`,
`surface-warm`, `fg`, `fg-2`, `muted`, `meta`, `border`, `border-soft`, `accent`, `accent-on`,
`accent-hover`, `accent-active`, `success`, `warn`, `danger`), 3 font families (`display` Space
Grotesk, `body` IBM Plex Sans, `mono` JetBrains Mono, all self-hosted in `assets/fonts/`), 8 font
sizes (`xs` … `xxxxl`), 8 spacing sizes (`1` … `12`), a 1240px content width and the
`settings.custom` scales (leading, tracking, section-y, radius, elevation, focus ring, motion, ease,
container). They become `--wp--preset--color--accent`, `--wp--preset--font-family--display` and so
on; the stylesheets under `assets/css/` are written against those variables.

The values are the `ja-kinetic` design system, measured on the running JoomlArt source (its CSS
outranks any library default) and generated into `theme.json` at build — for example light `bg`
`#FBFCFA`, `fg` `#46514B`, `accent` `#4D7C0F`. Source oddities are carried as they are, not
corrected: the olive focus ring in every direction and the lime hero glow.

## Style variations

One, `styles/ja-kinetic.json` — the default look restated as a variation, so the Site Editor can
return to it (https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/).
It carries `settings.custom.tracy.inspiration = "ja-kinetic"`. The source theme's `?style=<id>`
preview and `tracy_apply_inspiration()` exist in the code but this site has no second system to
switch to.

## The three directions: Terminal, Blueprint, Signal

The source ships three looks of the same home page. Here each is a **page attribute**, not a
variation: `inc/extra.php` writes `data-style="terminal|blueprint|signal"` on `<html>` from the
page's `wp_ja_kinetic_style` meta (Terminal when absent, and on every non-singular view), and the
direction's token block in the stylesheets (`html[data-style="blueprint"] …`) swaps the palette.

| Page | Direction | Default |
| --- | --- | --- |
| `/` and every other page | `terminal` | dark |
| `/home-menu/home-blueprint` | `blueprint` | light |
| `/home-menu/home-signal` | `signal` | dark |

The header and footer keep the Terminal values in every direction, as on the source. To give
another page a direction: `wp post meta update <id> wp_ja_kinetic_style blueprint`.

## Dark mode

**Two states — light and dark, no "auto"** — as the source's switch. The visitor's choice is kept
a year in the **`tracy_theme` cookie** (`light` or `dark`, `Path=/`, `SameSite=Lax`) and applied as
**`data-theme="light|dark"`** plus the class `t4-dark` on `<html>`. With no cookie the page's own
default applies: `data-theme-default` on `<html>`, from the page's `wp_ja_kinetic_theme_default`
meta — dark everywhere except the Blueprint page. Each colour preset carries both halves through
`light-dark()`, and `color-scheme` follows `data-theme` (theme.json `styles.css`).

`assets/js/wp-ja-kinetic-dark.js` runs in the head, blocking, so the attribute is on the root
before first paint; the header's toggle (`button.tracy-theme-toggle[data-tracy-theme-toggle]`, a
`core/html` block in the header part) flips light ⇄ dark and writes the cookie. WordPress core has
no colour-scheme mechanism of its own; this follows the Developer Blog's `color-scheme` + toggle
approach (https://developer.wordpress.org/news/2025/09/building-a-light-dark-toggle-with-the-interactivity-api/)
with a cookie instead of the Interactivity API store.

The block editor's canvas wears the same state: `inc/extra.php` (`wp_ja_kinetic_editor_canvas_theme()`)
puts the edited page's `data-style` and `data-theme-default` on the canvas root and loads the same
switch there, so a page visitors see dark is edited on a dark canvas (the Blueprint page on a light one).

To test dark mode: set `data-theme="dark"` on `<html>`, or click the toggle and reload — the cookie
must persist the state. A page cached for everyone is cached with the page's default; the
visitor's choice is applied client-side before paint.

## Layout: the body classes

The source theme's `layout.css` keys on `tracy-nav-<archetype>` and `tracy-hero-<archetype>`
(options `tracy_nav` / `tracy_hero`, defaults `top-left` and `split`).
`inc/item-ids.php` adds `item-<Itemid>` — the Joomla menu item id of the page — because the
source's per-page CSS is keyed on that class and was carried with it; renaming or re-parenting a
page does not change it.

## What not to edit by hand

`theme.json`, `styles/*.json`, `assets/css/*`, `patterns/`, `templates/`, `parts/`, `blocks/` and
`inc/` are **generated** (`node scripts/build.mjs --target wp-ja-kinetic` in `@tracy/wordpress-theme`,
from `src/tracy/` + `overlays/wp-ja-kinetic/`) and replaced whole by the next theme update. A
site-specific change goes through the Site Editor > Styles — it lands in the `wp_global_styles`
row and survives updates — or into a child theme. An edit made directly to the installed theme's
files is lost without notice. A change meant for every JA Kinetic site is a change to the overlay,
rebuilt and released.

Stylesheets, in load order: `tracy.css` (tokens → base rules), `layout.css`, `sections.css` (the
source theme), then `wp-ja-kinetic.css` (the chrome: header, footer, toggle, the 404 page's form),
`wp-ja-kinetic-sections.css` (the 20 own sections and the three directions),
`wp-ja-kinetic-article.css` (article and list views), `wp-ja-kinetic-finder-auth.css` (search and
the sign-in pages, with the Font Awesome faces); `tracy-motion.css` when motion is on. Scripts:
the dark switch (head), then deferred `wp-ja-kinetic-mega.js`, `-drawer.js`, `-auth-finder.js`,
`-back-to-top.js`, and `-contact.js` on the contact page only. The theme dequeues AcyMailing's own
module stylesheet; the form is drawn by `wp-ja-kinetic.css`.
