# Architecture

Read ../AGENTS.md. JA Essence is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and one stylesheet family, with PHP for hooks. Single language (English). The REST API
is WordPress core (`/wp-json/wp/v2/`); the theme adds no endpoint. The contact form on this site is
Contact Form 7's; the source theme's own `admin-post.php` handlers (inherited in `functions.php`,
reading option `tracy_contact_to`) are not used by any page here.

## Where the theme comes from

The theme is the `wp-ja-essence` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): the source theme `tracy` copied with
its text domain rewritten, the overlay `overlays/wp-ja-essence/` on top (15 templates, the header
and footer parts, 22 `wp-ja-essence/*` patterns plus its own `tracy/cards`, `inc/extra.php`, four
stylesheets, two scripts and the Jost and Noto Serif font files), and the generated files for its one
look: `theme.json` (presets from the overlay's `tokens.css`, plus the dark half from
`theme.overlay.json`), `styles/wp-ja-essence.json` and `inspirations.json`. `variations` is empty:
JA Essence is not a vendored catalogue design system; its tokens were **measured** on the running
source (docs/design-system.md). generated/inventory.md marks each file "Own: yes" (overlay) or "no"
(inherited from `tracy`).

The design comes from the JoomlArt JA Essence Joomla 6 quickstart (template `ja_essence` 1.3.1, built
on the **T4 framework**, so the source markup uses Bootstrap 5 and T4 class names). The overlay was
written from computed styles read off the running source at desktop and 390 px widths, light and
dark; no stylesheet, script or template file of the source was copied (docs/content-rules.md). The
theme's own class prefix is `je-*`; the seeder's section anchors keep the source's module ids
(`acm-<type>-<module id>`).

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | none | `post_content` of the page/post, block markup |
| Template | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor: it shadows the file. None exists on the seeded site at seed time |
| Template part | `parts/header.html`, `parts/footer.html` | **two `wp_template_part` rows already exist** on the seeded site (`header`, `footer`, written by the seeder) and shadow the files: edit the rows, or delete them to fall back to the files |
| Section pattern | `patterns/*.php`, registered as `wp-ja-essence/*` | inserted copies live in `post_content` |
| Navigation | menu blocks in the parts carry a `metadata.name` (`nav.mainmenu` in the header, twice, and `nav.category` in the footer) | `wp_navigation` posts `mainmenu` and `category` (docs/content-model.md) |
| Global styles | `theme.json`, `styles/wp-ja-essence.json` | a `wp_global_styles` row holding any Site Editor override (none at seed time) |
| Site identity | none | options `blogname` ("JA Essence"; `blogdescription` is empty), theme mod `custom_logo`, `show_on_front`, `page_on_front` |
| Page heading that differs from the page title | the `render_block_core/post-title` filter in `inc/extra.php` (block named `page.title`) | post meta `tracy_page_heading` |
| 404 page | `templates/404.html` holds its own words (see below) | the draft page `page-not-found` exists and option `wp_ja_essence_404_page` names it, but **the theme does not read it** |
| Retired-URL redirects | the must-use plugin `tracy-redirects.php` (not part of the theme) | option `wp_ja_essence_redirects`, named by option `tracy_redirects_option` |
| Joomla-style pager | the must-use plugin `tracy-joomla-pagination.php`, applied to a pager block that carries the class `tracy-joomla-pager` | none |
| Author pictures | the must-use plugin `tracy-author-avatars.php` | user meta `tracy_avatar` |
| Motion settings | `tracy_motion_effects()` in `functions.php` | option `tracy_motion`: **absent** on the seeded site, so no motion library loads |
| Contact form | none | the Contact Form 7 form post `contact` (id 65 on the build stand), called by a shortcode in the Contact page |

WordPress behaviour these rows rely on: templates and parts
(https://developer.wordpress.org/themes/templates/templates/,
https://developer.wordpress.org/themes/templates/template-parts/), the template hierarchy
(https://developer.wordpress.org/themes/templates/template-hierarchy/), patterns
(https://developer.wordpress.org/themes/patterns/registering-patterns/), the navigation fallback
when a block has no `ref` (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/),
theme.json
(https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/),
custom templates (https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/),
must-use plugins (https://developer.wordpress.org/advanced-administration/plugins/mu-plugins/).

## How a request is answered

1. WordPress resolves the URL to a page, post, archive, search or 404 (`/%postname%/` permalinks,
   category base `topic`). The Joomla paths survive as pages, nested where the source nests them
   (`/home/home-2`, `/category/category-style-1`, `/detail/layout-1`, `/pages/user/login-form`);
   `/home/home-3` is the front page `/` (a redirect rule). `inc/extra.php` adds two answers of its own:
   - `/pages/j-pages/smart-search` (a **draft** page) is answered with the theme's search view; the
     term is `?s=` or the source's `?q=`; an empty term shows the form and no results, as the
     source's smart search does. The source's `com_finder` is mapped to WordPress's own search:
     there is no separate index.
   - `/category/category-style-3/vintage-inspired-martini-cocktail-glasses` answers with the post
     `vintage-inspired-martini-and-cocktail-glasses` (status 200, no redirect, no canonical
     redirect), the one article route the source's single view is measured at; the post's
     canonical link stays `/<post-slug>/`.
2. Article posts are answered at `/<post-slug>/`. A page whose path equals a retired Joomla address
   and that does not exist is redirected by the rules in `wp_ja_essence_redirects`, only when
   WordPress would answer 404 (docs/content-model.md).
3. The template hierarchy picks `templates/<name>.html`. `theme.json` declares ten custom templates:
   the source theme's four (`landing`, `fixture`, `artifact`, `pricing`, design pages this site does
   not use) and the overlay's six, declared in `theme.overlay.json`: `page-landing`, `page-contact`,
   `page-login`, `page-register`, `page-account`, `page-article`. `page-no-sidebar` ships in
   `templates/` but is **not** declared there; the seeder still assigns it (docs/content-model.md
   lists the assignment per page; `wp eval` over `_wp_page_template` shows the live one).
4. Templates pull the `header` and `footer` parts; `404.html` has none, as the source's error page
   has none. `core/post-content` prints the page's blocks: sections (copies of `wp-ja-essence/*`
   patterns). `query_loop_block_query_vars` resolves two named queries (below).
5. `theme.json` and the global-styles row become the `--wp--preset--*` variables; the stylesheets
   under `assets/css/` are written against them.

## PHP that runs on every request

- `functions.php` (source theme `tracy`): design-system reading, the `?style=` preview, the `tracy_nav` and
  `tracy_hero` body classes, motion, and it loads `inc/update.php`, `inc/variations.php`,
  `inc/asset-version.php` and, last, `inc/extra.php`. `inc/motion-head.php` is required only when
  `tracy_motion` lists an effect.
- `inc/extra.php` (overlay): the stylesheet family (`wp-ja-essence.css` then `je-home.css`,
  `je-category.css`, `je-detail.css`, each after the shared one; design pages `fixture` and
  `artifact` take none of them), the dark-mode script (in the head, blocking) and the drawer
  script (deferred); the pattern category `wp-ja-essence`; editor styles; the body classes
  `tracy-nav-top-left` and `tracy-hero-split` (restated after the source theme's filter, so no
  catalogue archetype can change the header) and `je-slug-<page slug>` (listing variants differ per
  page by type size and card layout); the named queries; the search view; the article route; the
  page heading filter; and the share-link filter that replaces the token `__JE_PERMALINK__` in
  post content with the page's own URL. Every function carries the `wp_ja_essence_` prefix.
- Named queries: a query block with `wpJaEssenceCategory` ("health,design", comma separated slugs)
  is resolved to those categories and their sub-categories at render time, unless the owner set a
  tax query in the editor, which wins; a query block with `wpJaEssenceOthers: true` excludes the
  post being read ("More reading").
- `inc/update.php` (rendered by the package build from the shared updater with this theme's
  `updateSlug` `wp-ja-essence`): answers only for that stylesheet. WordPress offers an update only
  once the manifest it reads is published and names a newer version; until then, install a newer
  zip by hand (docs/checks-and-recovery.md). Whether that manifest is published for this theme is
  not known from the files.

## Blocks and plugins

The theme registers no block of its own. The contact form is Contact Form 7's (a shortcode in the
Contact page, mail through the plugin and `wp_mail`, so the host needs an outbound mail route). The
header and footer social links are `core/social-link` blocks pointing at `#`; the section social
card (`social.*`) draws the same services as buttons.

## Theme layout

```
style.css         header: JA Essence, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-essence
theme.json        generated: presets from tokens.css, the dark half from theme.overlay.json, customTemplates
styles/           wp-ja-essence.json (generated, the one look)
templates/        the overlay's 15 block templates plus four of the source theme's (artifact, fixture, landing, pricing; unused here)
parts/            header.html, footer.html
patterns/         wp-ja-essence/* (22) and tracy/cards; the rest (17) are inherited from tracy
functions.php     source theme helpers; inc/*.php loaded from it
inc/              extra.php, update.php, variations.php, asset-version.php, motion-head.php
assets/css        wp-ja-essence.css, je-home.css, je-category.css, je-detail.css, plus the source theme's layout.css, sections.css, tracy.css, tracy-motion.css, fixture-page.css
assets/js         wp-ja-essence.js (header drawer), wp-ja-essence-dark.js (dark switch), plus the source theme's tracy.js, tracy-motion.js, tracy-preview.js
assets/fonts      Jost (400, 500, 600, 700) and Noto Serif (400, 700), woff2
assets/img        placeholder.svg: the picture a freshly inserted section shows until one is chosen
readme.txt        the WordPress-format readme; AGENTS.md and docs/ are for agents
```
