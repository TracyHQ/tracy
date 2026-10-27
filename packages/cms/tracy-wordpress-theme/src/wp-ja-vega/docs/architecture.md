# Architecture

Read ../AGENTS.md. JA Vega is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json`, with PHP for registration, hooks and the theme's one block. Single language (English);
the REST API is WordPress core (`/wp-json/wp/v2/`) with nothing added by the theme.

## Where the theme comes from

The theme is the `wp-ja-vega` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): every file of the source theme
`tracy` copied with its text domain rewritten, the overlay `overlays/wp-ja-vega/` on top (12
templates, the header and footer, 13 section patterns plus its own `tracy/cards`, the `mega-menu`
block, `inc/extra.php`, one stylesheet, two scripts and the Inter Tight font files), and the
generated files for its one look: `styles/wp-ja-vega.json`, `inspirations.json`, and a `theme.json`
whose presets come from the overlay's `tokens.css`. JA Vega is not one of the vendored catalogue
design systems; its tokens were **measured** on the running source (docs/design-system.md).
generated/inventory.md marks each file "Own: yes" (overlay) or "no" (inherited from
`tracy`). Nothing in the installed theme is hand-edited on the site; the build is the source.

The overlay was written to render the same pages as the JoomlArt JA Vega Joomla 6 quickstart
(`quickstart/ja-vega/j6`, template `ja_vega` 1.2.1): lengths, colours and sizes were read as
computed style off the running Joomla site at 1440 and 390 px. No stylesheet, script or template
file of the source was copied (docs/content-rules.md).

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | — | `post_content` of the page/post, block markup |
| Template (`page`, `single`, `front-page` …) | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor — **shadows the file** (none at seed time) |
| Template part | `parts/header.html`, `parts/footer.html` | `wp_template_part` rows `header` and `footer` — **present since the seed**, they shadow the files |
| Section pattern | `patterns/acm-*.php`, registered as `wp-ja-vega/section-*` | inserted copies live in `post_content` |
| Synced pattern | — | none: the seed created no `wp_block` post |
| Navigation | — | six `wp_navigation` posts: `mainmenu`, `industry-focus` (header), `solutions`, `join-us`, `explore`, `resources` (footer) |
| Contact form | — | Contact Form 7's `wpcf7_contact_form` post titled "Contact" |
| Global styles (Site Editor > Styles) | `theme.json` + `styles/wp-ja-vega.json` | `wp_global_styles` row holding any override |
| Site identity | — | options `blogname` ("JA Vega"), `blogdescription`, `custom_logo`, `show_on_front`, `page_on_front` |
| Masthead heading that differs from the page title | the filter in `inc/extra.php` | post meta `tracy_page_heading` |
| 404 page text | the fallback text in `templates/404.html` | the draft page `page-not-found`, named by option `wp_ja_vega_404_page` |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_vega_redirects`, JSON rules |
| Motion settings | the default in `inc/extra.php` | option `tracy_motion` when the owner saves one (none at seed time) |

WordPress behaviour these rows rely on: templates and parts —
https://developer.wordpress.org/themes/templates/templates/ and
https://developer.wordpress.org/themes/templates/template-parts/; the hierarchy that picks one —
https://developer.wordpress.org/themes/templates/template-hierarchy/; patterns —
https://developer.wordpress.org/themes/patterns/registering-patterns/; the navigation fallback when
a block has no `ref` — https://developer.wordpress.org/reference/classes/wp_navigation_fallback/;
theme.json — https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/;
custom templates — https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/.

## How a request is answered

1. WordPress resolves the URL to a page, post, archive, search or 404 (`/%postname%/` permalinks;
   the Joomla paths survive as pages, nested where the source nests them: `/services/it-consultancy`,
   `/portfolio/cloud-services`). `inc/extra.php` adds three answers of its own:
   - `/smart-search` (a **draft** page) is answered with the search view; the term is `?s=` or the
     source's `?q=`; an empty term shows the form and no results. `/?s=` works too.
   - `/category-blog/<post-slug>` and `/portfolio/<category>/<post-slug>` answer with that post
     (status 200, no redirect) when the first part is a published listing page whose post query
     names a category the post is filed in directly; the post's canonical link stays `/<post-slug>/`.
   - An attachment path (a picture's slug) answers 404, and WordPress's "guess the permalink" on a
     404 is off, so an unknown path is a 404 as on the source.
2. The template hierarchy picks `templates/<name>.html`. The front page renders with
   `front-page.html`; a page's template comes from its `_wp_page_template` meta (the four custom
   templates below) or falls back to `page.html`.
3. The template's `core/template-part` blocks pull `header` and `footer` from their
   `wp_template_part` rows. The header part is drawn over the masthead on most templates
   (`jv-header--overlap`) and as a solid bar on `single`, `page-article` and `page-service`.
4. `core/post-content` prints the page's blocks: sections (copies of `wp-ja-vega/section-*`
   patterns), listing queries, the Contact Form 7 shortcode on the contact page.
   `query_loop_block_query_vars` resolves the queries the patterns and templates name by category
   slug (`wpJaVegaCategory`, sub-categories included), by "siblings of this page"
   (`wpJaVegaSiblings`, the service template's "Other Services") or by "this post's categories"
   (`wpJaVegaRelated`, the article template's "Continue Reading"), and offsets a category blog's
   "More Articles …" list by the cards query's page (`tracyMore`; an empty list prints nothing). Portfolio cards print the post
   meta `jv_client`, `jv_date`, `jv_type` through Block Bindings.
5. `theme.json` (the `wp-ja-vega` presets) and the global-styles row become the `--wp--preset--*`
   variables; the stylesheets under `assets/css/` are written against them.

Custom templates (theme.json `customTemplates`): `page-landing` (masthead and sections: `/about-us`),
`page-contact` (`/contact`), `page-service` (centred title, "Other Services": the six
`/services/*` pages), `page-article` (category and date, centred title, the article;
"Continue Reading": posts of the article's own categories: the Blogs post answered at
`/blog-detail`). Four more are inherited from `tracy` and not used by this site:
`landing`, `pricing`, `fixture`, `artifact`.

## PHP that runs on every request

- `functions.php` (source theme): the design-system reading of the `tracy` theme, the `?style=`
  preview, the `tracy_nav`/`tracy_hero` body classes, motion (`tracy_motion`), the source theme's
  own contact handler (`tracy_contact_to`; this site's contact page uses Contact Form 7 instead).
  Loads `inc/update.php`, `inc/motion-head.php` (the motion switch in the head) and `inc/extra.php`.
- `inc/extra.php` (overlay): the JA Vega stylesheet and font preload, the dark mode switch (in the
  head, blocking), the main script, the `mega-menu` block and the `wp-ja-vega` pattern category,
  excerpt support for pages (the masthead prints the page excerpt), body classes, the category-slug
  queries, the "More Articles …" offset, the listing pager's end cells and "Page N of M" box, post tags in
  the source's order, the post meta `jv_client`/`jv_date`/`jv_type`, the search page at `/smart-search`, posts at
  their listing paths and at a single view's own address (`/blog-detail`), no attachment pages,
  the redirect rules of `wp_ja_vega_redirects`, the 404 page's own words, the masthead heading
  from `tracy_page_heading` (and `tracy_page_heading_guest` for a visitor who is not signed in), and
  the default of `tracy_motion`. Every function carries the
  `wp_ja_vega_` prefix.
- `inc/update.php` (rendered by the package build from the shared updater, with this theme's
  `updateSlug`): hooks `update_themes_github.com` (from the `Update URI:` header) and answers only
  for the stylesheet `wp-ja-vega` (`TRACY_UPDATE_SLUG = 'wp-ja-vega'`), reading
  `wordpress/theme/wp-ja-vega/update.json` and caching it in the site transient
  `wp_ja_vega_theme_update`. WordPress offers an update only once that manifest is published and
  names a newer version; until then, install a newer zip by hand (docs/checks-and-recovery.md).

## Blocks

One block, `wp-ja-vega/mega-menu` (`block.json` + `render.php` + an editor script): a header item
that is a link (`label`, `url`) and opens a wide panel whose columns are its inner blocks. It opens
on hover, on focus of its caret button or on a click, closes on Escape or a click outside. On a
phone its caret drills into the menu drawer as the source's off-canvas does: the menu slides out and
the item's first link list slides in under a back button (added by `assets/js/wp-ja-vega.js`, in the
item's own words); the panel's other columns belong to the desktop band. The header carries two: **Our Services** (`/services`)
and **Portfolio** (`/portfolio`).

## Plugins

- **Contact Form 7** (`contact-form-7`): the `/contact` form (Name, Email, Subject, Message, "Send
  Email") is its form "Contact", placed by a `core/shortcode` block. The seeder installs and
  activates it. Not bundled with the theme; without it the shortcode prints as text. Its mail
  needs an outbound mail route on the host.
- No newsletter plugin: the source's AcyMailing sign-up module was not ported (docs/content-rules.md).

## Theme layout

```
style.css          header: JA Vega, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-vega, Update URI
theme.json         version 3: 16 colours, 3 font families, 8 sizes, 8 spaces, 1320px content and wide, settings.custom, styles.css (dark)
styles/            wp-ja-vega.json (the default look restated as a variation)
templates/         16 block templates, 12 of them JA Vega's own (see generated/inventory.md)
parts/             header.html, footer.html — shadowed by database rows on the seeded site
patterns/          32 patterns: 13 wp-ja-vega/section-* and tracy/cards (own), 18 tracy/* (source library)
blocks/            mega-menu
functions.php      source theme helpers and hooks; inc/*.php loaded from it
inc/               extra.php (JA Vega), update.php, motion-head.php
assets/css, js     stylesheets and scripts listed under "Enqueued assets" in generated/inventory.md
assets/fonts       Inter Tight latin and latin-ext (woff2) and its licence
assets/img         hero-placeholder.svg: the picture a freshly inserted section shows until one is chosen
readme.txt         the WordPress-format readme; AGENTS.md and docs/ are for agents
```
