# Architecture

Read ../AGENTS.md. Tracy Base is a WordPress block theme: HTML templates made of blocks, styled
by `theme.json`, with PHP only for registration and hooks. Single language; the REST API is
WordPress core (`/wp-json/wp/v2/`) with nothing added by the theme.

## Where the theme comes from

The theme is the `tracy-base` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): every file of the source theme
`tracy` copied with its text domain rewritten, the overlay `overlays/tracy-base/` on top (its own
templates, the header and footer, 21 section patterns, the mega-menu block, `inc/extra.php`,
`inc/update.php`, `assets/css/tracy-base.css`, `assets/js/`), and the generated files for its two
design systems — `styles/apple.json`, `styles/airbnb.json`, `inspirations.json`, and a
`theme.json` whose presets are the `apple` system's. generated/inventory.md marks each file
"Own: yes" (overlay) or "no" (inherited from `tracy`). Nothing in the installed theme is
hand-written for this site; the build is the source.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | — | `post_content` of the page/post, block markup |
| Template (`page`, `single`, `front-page` …) | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor — **shadows the file** (none at seed time) |
| Template part | `parts/header.html`, `parts/footer.html` | `wp_template_part` rows `header` and `footer` — **present since the seed**, they shadow the files |
| Section pattern | `patterns/section-*.php`, registered from its header | inserted copies live in `post_content`; a synced pattern would be a `wp_block` post (none seeded) |
| Navigation | — | six `wp_navigation` posts; each `core/navigation` block points at one by `ref` |
| Global styles (Site Editor > Styles) | `theme.json` + `styles/apple.json`, `styles/airbnb.json` | `wp_global_styles` row holding the chosen variation and overrides |
| Site identity | — | options `blogname`, `blogdescription`, `site_logo`, `show_on_front=page`, `page_on_front` |
| Retired-URL redirects | the hook in `inc/extra.php` | option `tracy_base_redirects`, JSON rules |
| Contact form | — | `wpcf7_contact_form` post `contact` (Contact Form 7) |

WordPress behaviour these rows rely on: templates and parts —
https://developer.wordpress.org/themes/templates/templates/ and
https://developer.wordpress.org/themes/templates/template-parts/; the hierarchy that picks one —
https://developer.wordpress.org/themes/templates/template-hierarchy/; patterns —
https://developer.wordpress.org/themes/patterns/registering-patterns/; the navigation fallback
when a block has no `ref` — https://developer.wordpress.org/reference/classes/wp_navigation_fallback/;
theme.json — https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/;
custom templates — https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/.

## How a request is answered

1. WordPress resolves the URL to a page, post, archive, search or 404 (`/%postname%/` permalinks;
   nested pages such as `/company/about` are parent/child pages, so the Joomla paths survive).
2. The template hierarchy picks `templates/<name>.html`. The front page (`page_on_front`) renders
   with `front-page.html` — post content only, no page head, so its sections run edge to edge.
   A page may name a custom template in its `_wp_page_template` meta: the seeder set
   `page-landing` for the Joomla landing layouts (`/resources/home-variation`, `/resources/home-2`),
   `page-onepage` for `/resources/home-onepage`, `page-no-sidebar` and `page-sidebar-left` for
   the sidebar layouts. `landing`, `fixture`, `artifact` and `pricing` come from the source theme
   and no seeded page uses them; the source asked for `page-account`, which does not exist, so
   `/account/profile` renders with the default `page` template. Joomla category views
   (`/services`, `/company/team`, `/resources/blog`, the three magazine sections) were seeded as
   **pages carrying Query Loop blocks**, not as WordPress category archives; the `category`,
   `tag`, `date`, `author`, `search` and `home` templates serve WordPress's own archive URLs.
3. The template's `core/template-part` blocks pull `header` and `footer` from their
   `wp_template_part` rows.
4. `core/post-content` prints the page's blocks: the sections (copies of `tracy-base/section-*`
   and `tracy/section-*` patterns), the Contact Form 7 shortcode on the contact page, Query Loops
   on archives (`templates/archive|category|tag|date|author|search|home|index.html` all insert
   `tracy/cards`).
5. `theme.json` (the `apple` presets), the active variation and the global-styles row become the
   `--wp--preset--*` variables; `assets/css/tracy.css`, `layout.css`, `sections.css` (source) and
   `tracy-base.css`, `sections-extra.css` (overlay) are written against them.

## PHP that runs on every request

- `functions.php` (source theme): reads the site's design system from global styles
  (`tracy_site_inspiration()`), the `?style=<id>` preview and its `tracy_style` cookie, the
  `tracy_nav`/`tracy_hero` body classes, the motion effects (`tracy_motion` option), and the source
  theme's own contact wiring for the `tracy/section-contact` pattern (`tracy_contact_to`,
  `admin-post` handler). Enqueues `tracy`, `tracy-layout`, `tracy-sections`, `tracy-motion`.
- `inc/extra.php` (overlay): enqueues `tracy-base` and `sections-extra` styles, the dark-mode
  switch `tracy-base-dark.js` (in the head, blocking, so the attribute is set before first paint)
  and `tracy-base-mega.js`; registers the `tracy-base/mega-menu` block and the `tracy-base`
  pattern category; sets the body classes `tracy-nav-top-left` and `tracy-hero-split` (the
  `apple` archetype's overlay nav and cover hero would paint hero text in the background colour
  on this site's photo-less heroes); adds `tracy-base.css` to the editor; and on `template_redirect`
  answers a 404 with a 301 when the path matches a rule in `tracy_base_redirects`.
- `inc/update.php` (overlay): about every six hours reads
  `https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/tracy-base/update.json`
  and lets WordPress auto-update the theme when a newer version is listed (`Update URI:` in
  `style.css` is what routes the check to this code).

## Blocks

`tracy-base/mega-menu` (`blocks/mega-menu/`, `render.php`, attribute `label`): a trigger button
and a full-width panel whose columns are inner blocks edited in place. The header part uses it
three times (Service, Resources, Company). Open on pointer intent, focus or click; close on
leave, Escape, outside click or focus leaving; one open at a time. Everything else is core blocks.

## Theme layout

```
style.css          header: Tracy Base, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain tracy-base, Update URI
theme.json         version 3: 16 colours, 3 font families, 8 sizes, 8 spaces, 1024px content, settings.custom, styles.css (dark)
styles/            apple.json (the default look restated as a variation), airbnb.json
templates/         20 block templates (see generated/inventory.md)
parts/             header.html, footer.html — shadowed by database rows on the seeded site
patterns/          37 patterns: 21 tracy-base/section-* (own), 16 tracy/* (source library)
blocks/mega-menu/  block.json, render.php, editor.js
functions.php      source theme helpers and hooks; inc/extra.php, inc/update.php, inc/motion-head.php
assets/css, js     stylesheets and scripts listed under "Enqueued assets" in generated/inventory.md
inspirations.json  the two design systems' names, nav and hero archetypes
readme.txt         the WordPress-format readme; AGENTS.md and docs/ are for agents
```
