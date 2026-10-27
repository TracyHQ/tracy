# Architecture

Read ../AGENTS.md. JA Kinetic is a WordPress block theme: HTML templates made of blocks, styled
by `theme.json`, with PHP for registration, hooks and the theme's own blocks. Single language; the
REST API is WordPress core (`/wp-json/wp/v2/`) with nothing added by the theme.

## Where the theme comes from

The theme is the `wp-ja-kinetic` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): every file of the source theme
`tracy` copied with its text domain rewritten, the overlay `overlays/wp-ja-kinetic/` on top (its
own templates, the header and footer, 20 section patterns, 29 blocks, `inc/*.php`, the stylesheets
and scripts under `assets/`, six panel images and five font files), and the generated files for
its one design system — `styles/ja-kinetic.json`, `inspirations.json`, and a `theme.json` whose
presets are the `ja-kinetic` system's. generated/inventory.md marks each file "Own: yes" (overlay)
or "no" (inherited from `tracy`). Nothing in the installed theme is hand-edited on the site; the
build is the source.

The overlay was written to render the same pages as the JoomlArt JA Kinetic Joomla 6 quickstart
(`quickstart/ja-kinetic/j6`): its markup, class names and CSS values were measured on the running
Joomla site. That is why many blocks exist only to draw one source view (the blog ledger, the
authors directory, the sign-in cards).

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | — | `post_content` of the page/post, block markup |
| Template (`page`, `single`, `front-page` …) | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor — **shadows the file** (none at seed time) |
| Template part | `parts/header.html`, `parts/footer.html` | `wp_template_part` rows `header` and `footer` — **present since the seed**, they shadow the files |
| Section pattern | `patterns/section-*.php`, registered from its header | inserted copies live in `post_content` |
| Synced pattern | — | `wp_block` posts `wp-ja-kinetic-cta-blog` and `wp-ja-kinetic-cta-article` (the CTA band of the blog and article views) |
| Navigation | — | five `wp_navigation` posts: the footer's three columns point at `footer-product`, `footer-dev`, `footer-company` by `ref`; `mainmenu` and `legal` are seeded but not referenced — the header's drawer is an **inline** navigation inside the `header` row, no `ref` |
| Global styles (Site Editor > Styles) | `theme.json` + `styles/ja-kinetic.json` | `wp_global_styles` row holding any override |
| Site identity | — | options `blogname` ("Kinetic"), `blogdescription` ("observability, reimagined"), `show_on_front=page`, `page_on_front` |
| Per-page view, direction, light/dark default, bylines | the hooks in `inc/*.php` that read them | post meta `wp_ja_kinetic_*` written by the port's post-seed step (docs/content-model.md) |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_kinetic_redirects`, JSON rules |
| Newsletter subscribers | — | AcyMailing's own tables (the plugin's) |

WordPress behaviour these rows rely on: templates and parts —
https://developer.wordpress.org/themes/templates/templates/ and
https://developer.wordpress.org/themes/templates/template-parts/; the hierarchy that picks one —
https://developer.wordpress.org/themes/templates/template-hierarchy/; patterns —
https://developer.wordpress.org/themes/patterns/registering-patterns/; synced patterns —
https://wordpress.org/documentation/article/reusable-blocks/; the navigation fallback when a block
has no `ref` — https://developer.wordpress.org/reference/classes/wp_navigation_fallback/;
theme.json — https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/;
custom templates — https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/.

## How a request is answered

1. WordPress resolves the URL to a page, post, archive, search or 404 (`/%postname%/` permalinks;
   the Joomla paths survive as nested pages — `/product/blog`, `/company/about`, `/pages/login`).
2. The template hierarchy picks `templates/<name>.html`. The front page renders with
   `front-page.html`. A page's template comes from its `_wp_page_template` meta, **or** — when the
   post-seed step set one — from `wp_ja_kinetic_page_template`, which `inc/list-pages.php` puts in
   front of the hierarchy (`page-article`, `page-tags`, `page-categories`, `page-archive`,
   `page-authors`). A page carrying `wp_ja_kinetic_list` (`category:<slug>`, `author:<slug>`,
   `search`) has its main query turned into that archive by `inc/list-pages.php`, so the Joomla list
   views keep their own addresses (`/product/blog` is the `field-notes-from-the-on-call` category,
   `/pages/engineering` the `engineering` category, `/pages/author` one author).
3. The template's `core/template-part` blocks pull `header` and `footer` from their
   `wp_template_part` rows.
4. `core/post-content` prints the page's blocks — sections (copies of `wp-ja-kinetic/section-*`
   patterns), the theme's own blocks (contact form, sign-in cards, search, blog views), and on the
   blog/article views the synced CTA band.
5. `theme.json` (the `ja-kinetic` presets) and the global-styles row become the `--wp--preset--*`
   variables; the stylesheets under `assets/css/` are written against them. `inc/extra.php` writes
   `data-style` (direction) and `data-theme-default` on `<html>` from the page's meta
   (docs/design-system.md).

## PHP that runs on every request

- `functions.php` (source theme): the design-system reading of the `tracy` theme, the `?style=`
  preview, the `tracy_nav`/`tracy_hero` body classes, motion (`tracy_motion`), the source theme's
  own contact handler (not used by this site's contact page). Loads `inc/*.php`.
- `inc/extra.php` (overlay): what this target adds — the chrome stylesheets, the light/dark switch
  (in the head, blocking), the mega menu, the `wp-ja-kinetic` pattern category, the registration of
  the 29 blocks under `blocks/`, the direction attributes on `<html>`, the contact form handler
  (`template_redirect` on the `page-contact` page, mail to the recipient `inc/contact.php` reads:
  option `tracy_contact_to`, else the site's public contact mailbox, else `admin_email`; the page never prints it), the
  sign-in / register / password flows (`login_url`, `register_url`, `lostpassword_url` point at the
  pages using the `page-login`, `page-register`, `page-password` templates), the toolbar hidden for
  accounts that
  cannot edit, the document titles, and the redirect rules of `wp_ja_kinetic_redirects`.
- `inc/owner-text.php`: words the source keeps editable in its admin, kept editable here too, so no
  template carries them.
- `inc/list-pages.php`: the source's list views at the source's own addresses, and the page
  templates the seeder does not choose.
- `inc/item-ids.php`: the `item-<Itemid>` body class the source's per-page CSS is keyed on, and the
  author, excerpt and term filters that go with it.
- `inc/blog-dynamic.php`: the live parts of `/product/blog` and `/pages/engineering` that a static
  block template cannot express (ordering, avatars, archive titles).
- `inc/tag-parity.php`: the same element tree as the Joomla source, tag names included.
- `inc/update.php`: about every six hours reads
  `https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/wp-ja-kinetic/update.json`
  and lets WordPress auto-update the theme when a newer version is listed (`Update URI:` in
  `style.css` routes the check to this code). No such manifest was published when this theme was
  built, so the check finds nothing until one is.

## Blocks

29 blocks under `blocks/`, all `wp-ja-kinetic/*`, each a `block.json` + `render.php`; the list with
attributes is in generated/inventory.md. The ones an editor meets: `mega-menu` (the header's Home,
Product, Company and Pages panels — a trigger and a panel whose columns are inner blocks),
`kinetic-contact-form`, `kinetic-auth-login`, `kinetic-auth-register`, `kinetic-auth-password`,
`kinetic-auth-account`, `kinetic-auth-notice`, `kinetic-search-form`, `kinetic-search-results`,
`kinetic-pagination`. The rest draw one part of a blog, author, category or article view from the
query and post meta, and have no settings worth editing.

## Plugins

- **AcyMailing** (`acymailing`, 11.0.5 on the build stand) — the footer's and the 404 page's
  newsletter form is its `acymailing/subscription-form` block. Not bundled; without it the block
  is unregistered and renders nothing. Delivering its mail needs an outbound mail route.
- No form plugin: the contact form is the theme's own block.

## Theme layout

```
style.css          header: JA Kinetic, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-kinetic, Update URI
theme.json         version 3: 16 colours, 3 font families, 8 sizes, 8 spaces, 1240px content, settings.custom, styles.css (dark)
styles/            ja-kinetic.json (the default look restated as a variation)
templates/         30 block templates (see generated/inventory.md)
parts/             header.html, footer.html — shadowed by database rows on the seeded site
patterns/          37 patterns: 20 wp-ja-kinetic/section-* (own), 17 tracy/* (source library)
blocks/            29 wp-ja-kinetic/* blocks
functions.php      source theme helpers and hooks; inc/*.php loaded from it
assets/css, js     stylesheets and scripts listed under "Enqueued assets" in generated/inventory.md
assets/fonts       IBM Plex Sans, Space Grotesk, JetBrains Mono, Font Awesome 4.7 and 5 (readme.txt)
assets/images      the hero and KineticQL panel images, one per direction
readme.txt         the WordPress-format readme; AGENTS.md and docs/ are for agents
```
