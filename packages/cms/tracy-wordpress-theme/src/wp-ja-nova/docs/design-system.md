# Design system

Read ../AGENTS.md. The look is **tokens in theme.json**: 16 colours (`bg`, `surface`,
`surface-warm`, `fg`, `fg-2`, `muted`, `meta`, `border`, `border-soft`, `accent`, `accent-on`,
`accent-hover`, `accent-active`, `success`, `warn`, `danger`), 3 font families (`display`, `body`,
`mono`), 8 font sizes, 8 spacing sizes, a 1376px content and wide width, and the
`settings.custom` scales (leading, tracking, section-y 128/64/32px, radius 16px, elevation, focus
ring, motion, ease, container). They become `--wp--preset--color--accent`,
`--wp--preset--font-family--body` and so on; `assets/css/wp-ja-nova.css` is written against those
variables and its own `--jn-*` colours.

## Where the values come from

JA Nova is **not** a catalogue design system. Its tokens were measured on the running JoomlArt
source as computed style and written to the overlay's `tokens.css` (the build's `rootTokens`);
`theme.json` is generated from that file. 31 of the 56 tokens are measured — for example `bg`
`#ffffff`, `fg` `#131515b3`, `fg-2` (headings) `#333333`, `surface` `#f7f7f7`, `accent`
`#5e48db`, `accent-hover` `#3014cc`, the footer band `surface-warm` `#212529`, radius 16px,
section spacing 128px (32px on a phone), container 1376px with 16px gutters. The other 25 had no
measuring rule and take the values of the OpenDesign `apple` system (`muted`, `meta`,
`border-soft`, `success`, `warn`, `danger`, the mono family, `text-xs`, the leading scale, the pill
radius, the elevations, the focus ring, the motion durations and ease, the tablet section spacing
and gutter). They are stand-ins, not measurements; `tokens.css` in the build sources lists each
token's origin.

The colours the palette has no row for (heading, text, muted, surfaces, lines, link and hover,
card text, tints, the accent colours of headings: purple, green, red, yellow, cyan, orange) are
declared once at the top of `assets/css/wp-ja-nova.css` as `--jn-*`, each with its light and dark
value through `light-dark()`.

## Typography

Golos Text for body, headings and menu, as the source template sets it (ja_nova 1.2.3,
`etc/site/default.json`): body 16px, headings weight 700 on the scale h1–h6 = 40/32/28/24/20/16px at
1200px and wider. Below 1200, 768 and 576px the source sheet shrinks h1–h4 step by step (390px:
28/24/22/18px; h5 and h6 keep 20 and 16px); `assets/css/wp-ja-nova.css` declares the same steps as
`--jn-h1…h6`. Labels the source sizes from the heading scale (its `.h3`/`.h4` spans, module titles)
use the same variables. The font ships with the theme (`assets/fonts/`, latin subset, variable
400–700, SIL OFL 1.1); no page asks Google for it.

## Style variations

One, `styles/wp-ja-nova.json` — the default look restated as a variation, so the Site Editor can
return to it (https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/).
No vendored design system ships with this theme (`variations: []` in its build configuration), so
the source theme's `?style=<id>` preview and `tracy_apply_inspiration()` exist in the code but have
no second look to switch to.

## Dark mode

**Light or dark, flipped on every click.** The toggle flips whichever theme the page shows, so the first
click always changes the page. The visitor's choice is kept a year in the **`tracy_theme` cookie** (`light`,
`dark`; an old `auto` is still read) and applied as **`data-theme="light|dark"`** on `<html>`. **Auto** (no choice
saved) is resolved by the head script to the operating system's current setting, so the attribute is set on every load
(the hand-written dark rules are keyed on it); only where no script runs does the stylesheet follow `prefers-color-scheme`
by itself, which is also what a first visit gets. Colours carry both halves through `light-dark()`, and
`color-scheme` is `light dark`, narrowed to one by `data-theme`. The dark half is the source's own
dark stylesheet, read back as computed style (page `#14171c`, raised surfaces `#1e232b`, text
`#c2c9d2`, headings `#eef1f6`, link `#9d8cff`); where the source's dark mode leaves a light-mode
colour on a dark ground (the phone drawer's items, the tag list's row rules, the 404 button text)
the theme uses the dark colour instead (docs/content-rules.md).

`assets/js/wp-ja-nova-dark.js` runs in the head, blocking, so the attribute is on the root before
first paint; the header's toggle (`.jn-theme-toggle`, in the header part) cycles the states, writes
the cookie and updates its label. WordPress core has no colour-scheme mechanism of its own; this
follows the Developer Blog's `color-scheme` + toggle approach
(https://developer.wordpress.org/news/2025/09/building-a-light-dark-toggle-with-the-interactivity-api/)
with a cookie instead of the Interactivity API store.

To test dark mode: set `data-theme="dark"` on `<html>`, or click the toggle and reload — the cookie
must persist the state. A page cached for everyone is cached without the attribute; the visitor's
choice is applied client-side before paint.

## Motion

Measured on the source: no scroll-in reveal and no entrance animation; two carousels that step —
the client logos on their own every 5 s, the team from its two arrows — and two moving tag rows on
the front page. Here the carousels are the shared Tracy motion library (`assets/js/tracy-motion.js`,
`tracy-motion.css`, the head switch in `inc/motion-head.php`), driven by option **`tracy_motion`**,
whose default (`inc/extra.php`) is `carousel-step` alone; the logo autoplay and the moving tag rows
are `assets/js/wp-ja-nova.js`, which leaves them still for a visitor who asks for reduced motion.
To turn the library's motion off: `wp option update tracy_motion '{"effects":[]}'`;
`wp option delete tracy_motion` returns to the default. Which blocks move is markup: the motion
classes on each block (docs/content-model.md).

## Layout: the body classes

The source theme's `layout.css` keys on `tracy-nav-<archetype>` and `tracy-hero-<archetype>`; this
theme's configuration sets `top-left` and `split`, so the header stays one bar as on the source.
`inc/extra.php` adds `jn-route-<page slug>` and `jn-parent-<parent slug>` on pages; the listing
layouts are keyed on them (docs/content-model.md). Below 992px the header menu becomes a drawer
(`.jn-drawer-toggle`); a submenu opens in place inside it from its chevron.

## What not to edit by hand

`theme.json`, `styles/*.json`, `inspirations.json`, `assets/css/*`, `assets/js/*`, `patterns/`,
`templates/`, `parts/` and `inc/` are **generated** (`node scripts/build.mjs --target wp-ja-nova`
in `@tracy/wordpress-theme`, from `src/tracy/` + `overlays/wp-ja-nova/`) and replaced whole by the
next theme update. A site-specific change goes through the Site Editor > Styles — it lands in the
`wp_global_styles` row and survives updates — or into a child theme. An edit made directly to the
installed theme's files is lost without notice. A change meant for every JA Nova site is a change
to the overlay, rebuilt and released.

Stylesheets, in load order: `tracy.css` (tokens → base rules), `layout.css`, `sections.css` (the
source theme), then `wp-ja-nova.css` (everything JA Nova draws: header, drawer, footer, the 21
sections, listings, pager, tag list, contact, sign-in, 404, the Bootstrap classes of the sample
pages' content); `tracy-motion.css` when motion is on (by default). `wp-ja-nova.css` is also loaded
in the editor. Scripts: the dark switch (head, blocking), then deferred `wp-ja-nova.js`,
`tracy-motion.js` and `tracy-preview.js` (the source theme's; inert outside the Tracy preview
frame), and `tracy.js` at the end of the page. The source theme's `fixture-page.css` loads only on
its design pages, which this site does not use.
