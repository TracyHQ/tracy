# Architecture

Read ../AGENTS.md. JA Morgan is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and one stylesheet family, with PHP for hooks. Single language (English). The REST API
is WordPress core (`/wp-json/wp/v2/`); the theme adds no endpoint (its forms post to core's
`admin-post.php`).

## Where the theme comes from

The theme is the `wp-ja-morgan` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): the source theme `tracy` copied with
its text domain rewritten, the overlay `overlays/wp-ja-morgan/` on top (11 templates, the header,
footer and sidebar parts, 26 `wp-ja-morgan/*` patterns plus its own `tracy/cards`, `inc/extra.php`
with three page-group files, three page-group stylesheets, two scripts, PT Root UI, Ionicons and
Font Awesome font files), and the generated files for its one look: `theme.json` (presets from the
overlay's `tokens.css`, plus the dark half from `theme.overlay.json`) and `inspirations.json`.
`variations` is empty: JA Morgan is not a vendored catalogue design system; its tokens were
**measured** on the running source (docs/design-system.md). generated/inventory.md marks each file
"Own: yes" (overlay) or "no" (inherited from `tracy`).

The design comes from the JoomlArt JA Morgan Joomla 6 quickstart (`quickstart/ja-morgan/j6`,
template `ja_morgan`, built on the **T3 framework**, so the source markup uses T3 class names). The
overlay was written from computed styles read off the running source at 1440 and 390 px, light and
dark; no stylesheet, script or template file of the source was copied (docs/content-rules.md). The
patterns keep the source's class names (`t3-*`, `acm-*`, `container`); `jm-*` is this theme's own.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | none | `post_content` of the page/post, block markup |
| Template | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor: it shadows the file |
| Template part | `parts/header.html`, `footer.html`, `sidebar.html` | `wp_template_part` rows when edited in the Site Editor: they shadow the files. Whether the seeded site already has such rows is not established by these files; check with `wp post list --post_type=wp_template_part` |
| Section pattern | `patterns/*.php`, registered as `wp-ja-morgan/*` | inserted copies live in `post_content` |
| Navigation | menu blocks in the parts carry a `metadata.name` (`nav.mainmenu`, `nav.joomla-pages`, `nav.navigate`, `nav.services`, `nav.support`, `nav.careers`, `nav.terms-privacy`) | `wp_navigation` posts, one per Joomla menu type of the spec (docs/content-model.md) |
| Global styles | `theme.json` | a `wp_global_styles` row holding any Site Editor override |
| Site identity | none | options `blogname` ("Morgan"), `blogdescription`, `custom_logo`, `show_on_front`, `page_on_front` |
| Masthead heading that differs from the page title | the `page.title` filter in `inc/extra.php` | post meta `tracy_page_heading` |
| Masthead description | constant text in `inc/groups/account.php` (all pages) and `inc/groups/home.php` (about-us, services-page) | the page's own excerpt, when written |
| 404 page text | none: `templates/404.html` holds no words, the heading and text are the draft page's content | the draft page `page-not-found`, named by option `wp_ja_morgan_404_page` |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_morgan_redirects` (JSON rules) |
| Read counts for "News & Update." | the query filter in `inc/extra.php` | post meta `hits`, a snapshot of the source's counter |
| Motion settings | the default in `inc/extra.php` | option `tracy_motion` when the owner saves one |

WordPress behaviour these rows rely on: templates and parts
(https://developer.wordpress.org/themes/templates/templates/,
https://developer.wordpress.org/themes/templates/template-parts/), the template hierarchy
(https://developer.wordpress.org/themes/templates/template-hierarchy/), patterns
(https://developer.wordpress.org/themes/patterns/registering-patterns/), the navigation fallback
when a block has no `ref` (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/),
theme.json
(https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/),
custom templates (https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/).

## How a request is answered

1. WordPress resolves the URL to a page, post, archive, search or 404 (`/%postname%/` permalinks;
   the Joomla paths survive as pages, nested where the source nests them: `/home/home-style-1`,
   `/joomlart-content/category-blog`, `/j-pages/login`). `inc/extra.php` adds answers of its own:
   - `/other-pages/smart-search` and `/smart-search` (a **draft** page) are answered with the
     search view; the term is `?s=` or the source's `?q=`; an empty term shows the form and no
     results, as the source's smart search does. The header search form posts to
     `/other-pages/smart-search/`. The source's smart search (Joomla `com_finder`) is mapped to
     WordPress's own search: there is no separate index.
   - `/joomlart-content/single-article` answers with the article the source opens there (status
     200, no redirect) using the seeded rule in `wp_ja_morgan_redirects`; the post's canonical link
     stays `/<post-slug>/`.
   - An attachment path (a picture's slug) answers 404, and WordPress's "guess the permalink" on a
     404 is off, so an unknown path is a 404 as on the source.
   - A signed-out visitor who opens `/your-profile`, `/j-pages/profile` or `/j-pages/edit-profile`
     (or any page using the `page-account` template) is sent to `/j-pages/login/` with 303, as the
     source does.
   - Four listing routes under `/joomlart-content/` (`featured-articles`, `tagged-items`,
     `list-of-all-tags`, `list-all-categories`) have their page content replaced at render time by
     a theme pattern (`b-*`); see docs/content-model.md.
2. The template hierarchy picks `templates/<name>.html`. The theme declares three custom templates
   (`page-landing`, `page-masthead`, `page-masthead-sidebar`) in `theme.json`. The overlay also
   ships `page-account`, `page-contact` and `page-password`, which are **not** declared there:
   how a page reaches them is not established by the files (the spec's page-map names them per
   route); read `_wp_page_template` in post meta on the site to see what is assigned.
3. Templates pull `header`, `footer` (and `sidebar` on the masthead-with-sidebar and single views).
   The 404 template has no header or footer, as the source's `error.php` has none (D-23).
4. `core/post-content` prints the page's blocks: sections (copies of `wp-ja-morgan/*` patterns).
   `query_loop_block_query_vars` resolves two named queries in the sidebar and the latest-articles
   section (`jmOrder: "hits"`, `jmOrder: "latest"`, docs/content-model.md).
5. `theme.json` and the global-styles row become the `--wp--preset--*` variables; the stylesheets
   under `assets/css/` are written against them.

## PHP that runs on every request

- `functions.php` (source theme `tracy`): design-system reading, `?style=` preview, the
  `tracy_nav`/`tracy_hero` body classes, motion, and it loads `inc/update.php`,
  `inc/motion-head.php` and `inc/extra.php`.
- `inc/extra.php` (overlay): the stylesheet and font preload; the group stylesheets
  (`assets/css/groups/*.css`, each enqueued after the shared one); the dark-mode script (in the
  head, blocking) and the main script; the pattern category `wp-ja-morgan`; excerpt support for
  pages; body classes `jm-route-<slug>` and `jm-parent-<slug>` (the header, colours and layouts
  key on them); no guessed permalinks; attachment paths as 404; the redirect rules; the 404 body;
  the search view; the article route; the masthead heading; the article masthead picture; the
  "News & Update.", "Categories." and "Tags." sidebar lists; and the default of `tracy_motion`
  (one effect, `carousel-step`). Every function carries the `wp_ja_morgan_` prefix.
- `inc/groups/*.php` (overlay, loaded by a glob at the end of `extra.php`, one file per page
  group): `account.php` (login redirect, the register/remind/contact form handlers, the four
  account patterns, the masthead description, the search page's masthead picture, the header info row), `content.php` (listing routes,
  hits line, wptexturize off, Login module hidden on the tag list, tag cards, truncation), `home.php` (about-us and services-page
  masthead description, latest-article intro).
- `inc/update.php` (rendered by the package build from the shared updater with this theme's
  `updateSlug` `wp-ja-morgan`): answers only for that stylesheet. WordPress offers an update only
  once the manifest it reads is published and names a newer version; until then, install a newer
  zip by hand (docs/checks-and-recovery.md). Whether that manifest is published for this theme is
  not known from the files.

## Blocks and plugins

The theme registers no block of its own. Contact forms are plain HTML in patterns: `/contact-us`
posts to `admin-post.php` (`jm_contact`, `jm_register`, `jm_remind`, each with a nonce) and
WordPress core sends the mail through `wp_mail`, so the host needs an outbound mail route. The
home-style-1 and -2 "Quick Contact" form posts to `admin-post.php` (`jm_quick_contact`) the same way and
answers in place when JavaScript runs (D-13); a stored copy of the form in a page is swapped for the live
one (fresh nonce) when the page is printed.

## Theme layout

```
style.css         header: JA Morgan, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-morgan
theme.json        generated: presets from tokens.css, the dark half from theme.overlay.json, customTemplates
templates/        the overlay's 11 block templates plus the source theme's (see generated/inventory.md)
parts/            header.html, footer.html, sidebar.html
patterns/         wp-ja-morgan/* (26) and tracy/cards; the rest are inherited from tracy
functions.php     source theme helpers; inc/*.php loaded from it
inc/              extra.php, groups/{account,content,home}.php, update.php, motion-head.php
assets/css        wp-ja-morgan.css, groups/{account,content,home}.css
assets/js         wp-ja-morgan.js (off-canvas, slideshow tabs, menus), wp-ja-morgan-dark.js (dark switch)
assets/fonts      PT Root UI (3 weights), Ionicons, Font Awesome 4.5 and their licences
assets/img        placeholder.svg: the picture a freshly inserted section shows until one is chosen
readme.txt        the WordPress-format readme; AGENTS.md and docs/ are for agents
```
