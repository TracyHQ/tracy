# Architecture

Read ../AGENTS.md. JA Fresco is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and one stylesheet family, with PHP for hooks. Single language (English). The REST API
is WordPress core (`/wp-json/wp/v2/`); the theme adds no endpoint. Its sign-in and registration
forms post to core's `wp-login.php`; the contact form is Contact Form 7's.

## Where the theme comes from

The theme is the `wp-ja-fresco` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): the source theme `tracy` copied with
its text domain rewritten, the overlay `overlays/wp-ja-fresco/` on top (18 templates, the `topbar`,
`header`, `footer` and `related` parts, 25 `wp-ja-fresco/*` patterns plus its own `tracy/cards`,
`inc/extra.php`, `inc/identity.php` and two page-group files, five page-group stylesheets, two
scripts, the Playfair Display and Roboto font files), and the generated files for its one look:
`theme.json` (presets from the overlay's `tokens.css`, plus `theme.overlay.json`) and
`inspirations.json`. `variations` is empty: JA Fresco is not a vendored catalogue design system;
its tokens were **measured** on the running source (docs/design-system.md). generated/inventory.md
marks each file "Own: yes" (overlay) or "no" (inherited from `tracy`).

The design comes from the JoomlArt JA Fresco Joomla 6 quickstart (`quickstart/ja-fresco/j6`,
template `ja_fresco`, built on the **T4 framework**, so the source markup uses T4 and Bootstrap 5
class names). The overlay was written from computed styles read off the running source at 390, 768,
992 and 1440 px; no stylesheet, script or template file of the source was copied
(docs/content-rules.md). The patterns keep the source's class names (`t4-*`, `acm-*`, `container`);
`jf-*` is this theme's own.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | none | `post_content` of the page/post, block markup |
| Template | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor: it shadows the file |
| Template part | `parts/topbar.html`, `header.html`, `footer.html`, `related.html` | `wp_template_part` rows: the seeded site **has** rows `header` and `footer`, which shadow the files (`wp post list --post_type=wp_template_part`) |
| Section pattern | `patterns/*.php`, registered as `wp-ja-fresco/*` | inserted copies live in `post_content` |
| Navigation | menu blocks named `nav.mainmenu` (header) and `nav.about` (footer) | `wp_navigation` posts, one per Joomla menu type of the spec (docs/content-model.md) |
| Global styles | `theme.json` | a `wp_global_styles` row holding any Site Editor override |
| Site identity | the footer token `{site.title}` (`inc/identity.php`) | options `blogname` ("fresco"), `blogdescription`, `site_logo`, `show_on_front`, `page_on_front` |
| Masthead heading that differs from the page title | the `page.title` filter in `inc/extra.php` | post meta `tracy_page_heading` |
| 404 page text | none: the words are the draft page's content | the draft page `page-not-found`, named by option `wp_ja_fresco_404_page` |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_fresco_redirects` (JSON rules) |
| Author grid | the block `wp-ja-fresco/authors` (`inc/groups/gc.php`) | user meta `author_order`, `job_title`, `author_social` |
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
   the Joomla paths survive as pages, nested where the source nests them: `/home/home-2`,
   `/pages/j-content/category-blog`, `/pages/users/login-form`). `inc/extra.php` adds answers of
   its own:
   - `/pages/j-pages/smart-search` (a **draft** page) is answered with the search view; the term is
     `?s=` or the source's `?q=`; an empty term shows the form and no results, as the source's
     smart search (Joomla `com_finder`) does. There is no separate index. `templates/search.html`
     takes the masthead from that draft page (`render_block_context` and the global post swapped
     for the masthead block only).
   - `/pages/j-content/blog-detail` answers with the article the source opens there (status 200, no
     redirect), using the seeded rule in `wp_ja_fresco_redirects`; the post's canonical link stays
     `/<post-slug>/`.
   - `/pages/j-content/category-blog/<post-slug>` answers with that post (200): the source opens an
     article of a category blog under the blog's path.
   - An attachment path (a picture's slug) answers 404, and WordPress's "guess the permalink" on a
     404 is off, so an unknown path is a 404 as on the source.
   - A signed-out visitor who opens `/pages/users/profile` is sent to `/pages/users/login-form/`
     with 303, as the source does.
2. The template hierarchy picks `templates/<name>.html`. Seven custom templates are declared in
   `theme.json` (`page-landing`, `page-masthead`, `page-masthead-article`, `page-contact`,
   `page-login`, `page-register`, `page-account`); a page uses one through its `_wp_page_template`
   meta. `page-author-listing` is picked by the hierarchy for the page with slug `author-listing`.
3. Templates pull `topbar`, `header` and `footer`; `single` also pulls `related`.
4. `core/post-content` prints the page's blocks: sections (copies of `wp-ja-fresco/*` patterns).
   `query_loop_block_query_vars` resolves the "Related Posts" query (`jfRelated: true`: posts that
   share a tag with the article, newest first).
5. `theme.json` and the global-styles row become the `--wp--preset--*` variables; the stylesheets
   under `assets/css/` are written against them.

## PHP that runs on every request

- `functions.php` (source theme `tracy`): design-system reading, `?style=` preview, the
  `tracy_nav`/`tracy_hero` body classes, motion, and it loads `inc/update.php`,
  `inc/motion-head.php` and `inc/extra.php`.
- `inc/extra.php` (overlay): the stylesheet and font preload; the group stylesheets
  (`assets/css/groups/*.css`, each enqueued after the shared one); the colour-scheme script (in the
  head, blocking) and the main script; the pattern category `wp-ja-fresco`; body classes
  `jf-route-<slug>`, `jf-parent-<slug>` and `jf-layout-home`; no guessed permalinks; attachment
  paths as 404; the redirect rules; the 404 body; the search view; the article routes; the masthead
  heading and the article masthead picture; the related-posts query; the profile redirect; one
  `h1` per page; the back-to-top button; the social-link names; the `&` after each title of the
  text slider; and the default of `tracy_motion` (one effect, `carousel-step`). Every function
  carries the `wp_ja_fresco_` prefix.
- `inc/identity.php`: the one identity token `{site.title}` and its filling.
- `inc/groups/*.php` (loaded by a glob at the end of `extra.php`, one file per page group):
  `gc.php` (the author grid block and the pager's "Page N of M" line beside the pager), `gd.php`
  (the sign-in and registration forms on the `page-login` and `page-register` templates).
- `inc/update.php` (rendered by the package build from the shared updater with this theme's
  `updateSlug` `wp-ja-fresco`): answers only for that stylesheet. WordPress offers an update only
  once the manifest it reads is published and names a newer version; until then, install a newer
  zip by hand (docs/checks-and-recovery.md). Whether that manifest is published for this theme is
  not known from the files.

## Blocks and plugins

The theme registers one block, `wp-ja-fresco/authors` (server-rendered author grid). The contact
form is a Contact Form 7 form inside the Contact page's content (`page-contact` template); without
the plugin active its shortcode prints as text. Sign-in and registration post to `wp-login.php`;
WordPress mails the new account's password, so the host needs an outbound mail route.

## Theme layout

```
style.css         header: WP Fresco, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-fresco
theme.json        generated: presets from tokens.css, theme.overlay.json, customTemplates
templates/        the overlay's 18 block templates plus the source theme's (see generated/inventory.md)
parts/            topbar.html, header.html, footer.html, related.html
patterns/         wp-ja-fresco/* (25) and tracy/cards; the rest are inherited from tracy
functions.php     source theme helpers; inc/*.php loaded from it
inc/              extra.php, identity.php, groups/{gc,gd}.php, update.php, motion-head.php
assets/css        wp-ja-fresco.css, groups/{ga,gb,gc,gd,gd-auth}.css
assets/js         wp-ja-fresco.js (Book Table dialog, drawer, dropdown, back to top, search tips toggle), wp-ja-fresco-dark.js (colour scheme)
assets/fonts      Playfair Display, Roboto and their licences
assets/img        placeholder.svg: the picture a freshly inserted section shows until one is chosen
readme.txt        the WordPress-format readme; AGENTS.md and docs/ are for agents
```
