# Design system

Read ../AGENTS.md. The look is **tokens in theme.json**: 16 colours (`bg`, `surface`,
`surface-warm`, `fg`, `fg-2`, `muted`, `meta`, `border`, `border-soft`, `accent`, `accent-on`,
`accent-hover`, `accent-active`, `success`, `warn`, `danger`), 3 font families (`display` and
`body` Inter Tight, self-hosted in `assets/fonts/`; `mono` a system monospace stack), 8 font sizes
(`xs` 14px … `xxxxl` 58px), 8 spacing sizes (`1` 4px … `12` 48px), a 1320px content and wide width,
and the `settings.custom` scales (leading, tracking, section-y 128/64/32px, radius 8px, elevation,
focus ring, motion, ease, container). They become `--wp--preset--color--accent`,
`--wp--preset--font-family--body` and so on; the stylesheets under `assets/css/` are written
against those variables.

## Where the values come from

JA Vega is **not** a catalogue design system. Its tokens were measured on the running JoomlArt
source as computed style and written to the overlay's `tokens.css` (the build's `rootTokens`);
`theme.json` is generated from that file. 40 of the 56 tokens are measured — for example `bg`
`#ffffff`, `fg` `#757575`, `fg-2` (headings) `#050505`, `accent` `#1d4ed8`, `border` `#ced4da`,
the footer band `surface-warm` `#121316`, `h1` 58px. The other 16 had no measuring rule and take
the values of the OpenDesign `apple` system: `meta`, `border-soft`, `accent-hover`,
`accent-active`, `success`, `warn`, `danger`, the mono family, the pill radius, three elevations,
the focus ring, the fast motion duration, the tablet section spacing and the tablet gutter. They are
stand-ins, not measurements; `tokens.css` in the build sources lists each token's origin.

A few colours the palette has no row for are declared once at the top of
`assets/css/wp-ja-vega.css` (`--jv-*`, each with its light and dark value). The header, the footer
and the dark bands (masthead, call-to-action panels) are dark in both modes, as on the source; the
source's decorative background pictures are drawn as gradients of the measured colours.

## Style variations

One, `styles/wp-ja-vega.json` — the default look restated as a variation, so the Site Editor can
return to it (https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/).
It carries `settings.custom.tracy.inspiration = "wp-ja-vega"`. No vendored design system ships with
this theme (`variations: []` in its build configuration), so the source theme's `?style=<id>`
preview and `tracy_apply_inspiration()` exist in the code but have no second look to switch to.

## Dark mode

**Light or dark; a click flips what is showing (1.1.6).** The visitor's choice is kept a year in the **`tracy_theme`
cookie** (`light`, `dark` or `auto`; `Path=/`, `SameSite=Lax`, `Secure` over HTTPS) and applied as
**`data-theme="light|dark"`** on `<html>`. **No attribute = auto**: the operating system decides
through `prefers-color-scheme`, which is also what a first visit gets, as on the source. An old `auto` cookie is still read and behaves like no cookie. Each
colour preset except `success`, `warn` and `danger` carries both halves through `light-dark()`,
and `color-scheme` is `light dark`, narrowed to one by `data-theme` (theme.json `styles.css`). The
dark half is the source's own dark stylesheet, read back as computed style: `bg` `#0f141c`,
`surface` `#161d28`, `border` `#2a323d`, text `#c7ccd4`, headings `#f1f3f6`, muted `#8b94a3`,
`accent` `#3b8bff`, hover `#5fa0ff`; the footer band stays `#121316`.

`assets/js/wp-ja-vega-dark.js` runs in the head, blocking, so the attribute is on the root before
first paint; the header's toggle (`button.jv-theme-toggle[data-tracy-theme-toggle]`, in a
`core/html` block of the header part) flips the page that is showing (so the first click always changes it, on a phone too), writes the
cookie and updates its `aria-label`, `aria-pressed` and icon. WordPress core has no colour-scheme mechanism of its own; this follows the
Developer Blog's `color-scheme` + toggle approach
(https://developer.wordpress.org/news/2025/09/building-a-light-dark-toggle-with-the-interactivity-api/)
with a cookie instead of the Interactivity API store.

**`?theme=dark` or `?theme=light` on the address** (1.1.4) renders that theme for that page view:
it wins over the stored choice and over the OS, is set by the same head script so there is no
flash, and is never written to the cookie — drop the parameter and the stored choice (or auto)
is back. Tracy's Design inspiration preview switches demos this way; the Joomla source (ja_vega
1.2.5) behaves the same. Any other value is ignored.

To test dark mode: set `data-theme="dark"` on `<html>`, or click the toggle and reload — the cookie
must persist the state. A page cached for everyone is cached without the attribute; the visitor's
choice is applied client-side before paint.

## Motion

The source animates sections as they scroll in, runs three carousels and pulses the video button.
Here that is the shared Tracy motion library (`assets/js/tracy-motion.js`, `tracy-motion.css`,
the head switch in `inc/motion-head.php`), driven by option **`tracy_motion`**. The theme supplies
its default (`inc/extra.php`): `reveal` at `bold` intensity, only at 992px and wider (the source's
animation library is off below 992px); `carousel-step` (the hero, team and success-stories
carousels step on click, swipe or arrow keys, no autoplay); `pulse` (the video button's rings).
Nothing is animated for a visitor who asks for reduced motion. To turn all motion off:
`wp option update tracy_motion '{"effects":[]}'`; `wp option delete tracy_motion` returns to the
default. Which blocks move is markup: the motion classes on each block (docs/content-model.md).

## Layout: the body classes

The source theme's `layout.css` keys on `tracy-nav-<archetype>` and `tracy-hero-<archetype>`.
`inc/extra.php` always sets `tracy-nav-top-left` and `tracy-hero-split`, whatever the options
`tracy_nav` / `tracy_hero` say, so the header stays one bar as on the source. It also adds
`jv-route-<page slug>` and `jv-parent-<parent slug>` on pages; the listing layouts are keyed on
them (docs/content-model.md). Below 992px the header menu becomes a drawer
(`.jv-drawer-toggle`) drawn as the source's off-canvas: the page slides 300px to the left under a
dark veil, a 300px black panel shows the site logo (a second `site-logo` block in the header part,
hidden from 992px), the items in the source's order and a white close cross. A mega item's caret
slides the menu out and the item's first link list in, under a "‹ <item>" back button, as the
source's off-canvas drills into a sub-menu; the level stays open when the drawer closes.

## What not to edit by hand

`theme.json`, `styles/*.json`, `inspirations.json`, `assets/css/*`, `assets/js/*`, `patterns/`,
`templates/`, `parts/`, `blocks/` and `inc/` are **generated** (`node scripts/build.mjs --target
wp-ja-vega` in `@tracy/wordpress-theme`, from `src/tracy/` + `overlays/wp-ja-vega/`) and replaced
whole by the next theme update. A site-specific change goes through the Site Editor > Styles — it
lands in the `wp_global_styles` row and survives updates — or into a child theme. An edit made
directly to the installed theme's files is lost without notice. A change meant for every JA Vega
site is a change to the overlay, rebuilt and released.

Stylesheets, in load order: `tracy.css` (tokens → base rules), `layout.css`, `sections.css` (the
source theme), then `wp-ja-vega.css` (everything JA Vega draws: header, mega menus, drawer,
footer, the 13 sections, listings, contact, 404, the Bootstrap classes of the sample pages'
content); `tracy-motion.css` when motion is on (by default). `wp-ja-vega.css` is also loaded in the
editor. Scripts: the dark switch (head, blocking), then deferred `wp-ja-vega.js` (mega menus,
drawer, video dialog, back-to-top, service-question accordion), `tracy-motion.js` and
`tracy-preview.js` (the source theme's; inert outside the Tracy preview frame), and `tracy.js` at
the end of the page. The font file
`inter-tight-latin.woff2` is preloaded. The source theme's `fixture-page.css` loads only on its
design pages, which this site does not use.
