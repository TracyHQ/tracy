# Architecture

Read ../AGENTS.md. JA Restaurant is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and the source template's own stylesheets, with PHP for hooks. Single language
(English). The REST API is WordPress core (`/wp-json/wp/v2/`); the theme adds no endpoint (its forms
post to core's `admin-post.php`).

## Where the theme comes from

The theme is the `wp-ja-restaurant` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): the source theme `tracy` copied with its
text domain rewritten, the overlay `overlays/wp-ja-restaurant/` on top, and the generated files for its
one look (`theme.json` and `styles/wp-ja-restaurant.json` from the overlay's measured `tokens.css`, plus
the dark half from `theme.overlay.json`; `inspirations.json`). `variations` is empty in
`theme.config.json`: JA Restaurant is not a vendored catalogue design system. generated/inventory.md
marks each file "Own: yes" (overlay) or "no" (inherited from `tracy`).

The overlay holds 16 templates, 5 parts (`header`, `footer`, `sidebar`, `search-description`,
`search-form`), 35 `wp-ja-restaurant/*` patterns (22 of them `acm-*` sections), `inc/extra.php`,
`inc/identity.php`, four page-group files `inc/groups/{account,blog,content,pages}.php`, the stylesheets
and scripts under `assets/`, the fonts and the template's own pictures (`assets/img`).

The design comes from the JoomlArt JA Restaurant Joomla 6 quickstart 1.0.6 (template `ja_restaurant`
2.1.2 on the **T3 framework**). Unlike earlier JA ports, the stylesheets are **the source template's own
compiled sheets**, carried rule for rule (D-10): `css/bootstrap.css`, `template.css`, `megamenu.css`,
`off-canvas.css` and the `acm/*/css/style.css` files became `assets/css/source/*.css`, every colour
rewritten as `light-dark(<source>, <derived dark>)`, `url()` pointed at `assets/img`. They were written by
`tasks/ja-restaurant-wp7/tools/port-css.mjs` in the Tracy repository and are never edited by hand. The
parts and patterns therefore keep the source's class names (`t3-*`, `acm-*`, `ja-*`, Bootstrap 3 grid);
`jr-*` and `jm-*` classes are this theme's own. `assets/css/wp-ja-restaurant.css` only adapts what
WordPress's block markup does differently.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | none | `post_content`, block markup |
| Template | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor: it shadows the file (none on the build stand) |
| Template part | `parts/*.html` | `wp_template_part` rows `header` and `footer` exist on the build stand (the seeder wrote them to set the navigation `ref`); they shadow the files. Check with `wp post list --post_type=wp_template_part` |
| Section pattern | `patterns/*.php`, registered as `wp-ja-restaurant/*` | inserted copies live in `post_content` |
| Navigation | the header's two Navigation blocks named `nav.mainmenu` (desktop bar and phone side panel) | `wp_navigation` posts `mainmenu` and `usermenu` |
| Global styles | `theme.json`, `styles/wp-ja-restaurant.json` | the `wp_global_styles` row `wp-global-styles-wp-ja-restaurant` |
| Site identity | none | `blogname` ("JA Restaurant"), `blogdescription` (empty: the source has no tagline), `site_logo`, `tracy_logo_dark`, `show_on_front` = `page`, `page_on_front` (the page `homepage`) |
| Footer address, hours, phone, copyright | `parts/footer.html` | the `footer` template-part row once one exists |
| Header opening hours line | `parts/header.html` (`header.open-time`) | the `header` template-part row |
| 404 text | `patterns/part-404.php` (the source's `error.php`: "404", "Page not found", a line, "Home Page") | none (see "Inert hooks" below) |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_restaurant_redirects` (JSON rules) |
| Motion settings | the default in `inc/extra.php` | option `tracy_motion` when the owner saves one |

WordPress behaviour these rows rely on: templates and parts
(https://developer.wordpress.org/themes/templates/templates/,
https://developer.wordpress.org/themes/templates/template-parts/), the template hierarchy
(https://developer.wordpress.org/themes/templates/template-hierarchy/), patterns
(https://developer.wordpress.org/themes/patterns/registering-patterns/), the navigation fallback when a
block has no `ref` (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/), theme.json
(https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/), custom
templates (https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/).

## How a request is answered

1. WordPress resolves the URL (`/%postname%/` permalinks). The Joomla menu paths survive as nested pages
   (`/explore/j-pages/login`, `/menu/simple-menu`, `/contact/contact-us`); articles live at `/<slug>/`.
   `inc/extra.php` and `inc/groups/*.php` add answers of their own:
   - `/explore/j-pages/smart-search` and `/smart-search` are the draft page `smart-search` answered with
     the search view; the term is `?s=` or the source's `?q=`; an empty term shows the form and no
     results. The header search form posts there. Search lists posts only (`inc/groups/blog.php`), as
     the source's finder does.
   - `/gallery/18-sample-album-1` (the source's album address) answers 200 with the post `sample-album-1`,
     using the rule recorded in `wp_ja_restaurant_redirects` (S-13); its canonical address stays
     `/sample-album-1/`.
   - A signed-out visitor who opens `/your-profile`, `/explore/j-pages/user-profile` (any page on the
     `page-account` template), `/submit-an-article`, `/template-settings` or `/site-settings` is sent to
     `/explore/j-pages/login/` with 303 (D-16); after the four routes other than the user profile the
     Login page shows "Please login first" once (a five-minute cookie `jm_login_first`).
   - An attachment path answers 404, and WordPress's "guess the permalink" on a 404 is off.
   - The redirect rules apply only when WordPress would answer 404 (`/homepage` → `/`, 301).
2. The template hierarchy picks `templates/<name>.html`. Six custom templates are declared for pages in
   `theme.json`: `page-landing`, `page-account`, `page-login`, `page-register`, `page-password`,
   `page-contact` (plus the source theme's own `landing`, `fixture`, `artifact`, `pricing`, which this
   site does not use). Pages with no assigned template use `page.html`.
3. Page templates pull `header` and `footer` around `core/post-content`. The archive, category, tag,
   home, index, search and single templates also pull `sidebar`. The 404 template is the `part-404`
   pattern alone, with no header or footer, as the source's `error.php`.
4. `core/post-content` prints the page's sections (copies of `wp-ja-restaurant/acm-*`). Several pages are
   completed at render time (docs/content-model.md, "Pages the theme completes").
5. `theme.json` and the global-styles row become the `--wp--preset--*` variables; the source sheets read
   them through `var(--ds-c-<role>, <template colour>)`, so a design system worn through Tracy recolours
   the site and, without one, the template's own colour shows.

## PHP that runs on every request

- `functions.php` (source theme `tracy`): design-system reading, `?style=` preview, motion, and it loads
  `inc/update.php`, `inc/variations.php`, `inc/asset-version.php`, `inc/brand-logo.php` (the dark-mode logo
  `tracy_logo_dark`, the site name as text where no logo is set), `inc/role-reads.php` (editors see plain
  colours where the palette reads a design-system role), `inc/motion-head.php` and `inc/extra.php`.
- `inc/extra.php` (overlay): `inc/identity.php` (the `{site.title}` and `{year}` tokens of the header,
  footer and copyright line); the stylesheets in the source's load order (fonts, icons, `source/bootstrap`,
  `template`, `megamenu`, `off-canvas`, every `source/acm-*.css`, then `wp-ja-restaurant.css` and
  `groups/*.css`); the body-font preload; the dark-mode script (head, blocking) and the main script plus
  `assets/js/groups/*.js` (deferred); the pattern category `wp-ja-restaurant` ("WP Restaurant"); excerpt
  support for pages; body classes `tracy-nav-top-left`, `tracy-hero-split`, `jm-route-<slug>`,
  `jm-parent-<slug>`; no guessed permalinks; attachment paths as 404; the redirect rules; the search view
  and its menu link; the current-menu-item marking; the album route; the full-size hero pictures; the
  back-to-top button; the icon tint filter; social-link labels; the default of `tracy_motion` (one
  effect, `carousel-step`). Every function carries the `wp_ja_restaurant_` prefix.
- `inc/groups/*.php`, loaded by a glob at the end of `extra.php`:
  `account.php` (guest redirects, the register, reminder and contact handlers, the account and contact
  patterns swapped into their pages, the masthead description constant), `blog.php` (listing pages, the
  single article's details and navigation, search results, the sidebar's categories and "most read"),
  `content.php` (`wptexturize` off, the sidebar Login module and its links), `pages.php` (Featured
  Articles and All Categories lists, the About Us button, the home news categories).
- `inc/update.php`: asks `https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/wp-ja-restaurant/update.json`
  for a newer version. Whether that manifest is published is not known from the files; until it is,
  install a newer zip by hand (docs/checks-and-recovery.md).

### Inert hooks

`extra.php` and `groups/account.php` were forked from the JA Morgan port and keep hooks that look for
names or classes no file or page of this site carries (checked by grep over the theme and the build
stand's pages, 20/10/2026): `404.body` (with option `wp_ja_restaurant_404_page` and the draft page
`page-not-found`, which therefore do not reach the 404 screen), `page.title` (with post meta
`tracy_page_heading`), `single.masthead`, `search.masthead`,
`jm-fulltext-image`, `jm-head-info`, `jm-quick-contact`, `jm-page-title`, `tagspopular`, `jmOrder`. They
do nothing here; do not rely on them.

## Blocks and plugins

The theme registers seven server-rendered blocks, all in the "theme" category:
`wp-ja-restaurant/blog-item`, `blog-categories`, `blog-mostread`, `blog-article-info`, `blog-pagenav`,
`blog-search-results` (`inc/groups/blog.php`) and `category-cards` (`inc/groups/pages.php`).

No plugin is required. The contact form (`/contact/contact-us`), registration and username reminder post
to `admin-post.php` (`jm_contact`, `jm_register`, `jm_remind`, each with a nonce); WordPress core sends the
mail through `wp_mail` (contact mail goes to `tracy_contact_to` only, at most five an hour per client address),
so the host needs an outbound mail route. The password reset form posts to core's lost-password screen.
The Subscribe box draws the source's AcyMailing form and sends nothing (D-07).

The build stand also runs Contact Form 7 (active, two forms) and three must-use plugins the seeder
installs (`tracy-joomla-pagination`, `tracy-more-articles`, `tracy-redirects`). The stored Contact Us page
holds a `[contact-form-7 id="25"]` shortcode, but the theme strips it and prints its own `contact-form`
pattern, so Contact Form 7 draws nothing on the rendered page (measured: the page's only contact `<form>`
posts to `admin-post.php`).

## Theme layout

```
style.css         header: WP Restaurant, Version 1.0.0, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-restaurant
theme.json        generated: presets from tokens.css, the dark half from theme.overlay.json, customTemplates
styles/           wp-ja-restaurant.json (the one look, generated)
templates/        the overlay's 16 block templates plus the source theme's (see generated/inventory.md)
parts/            header, footer, sidebar, search-description, search-form
patterns/         wp-ja-restaurant/* (35); the tracy/* ones are inherited and not used by this site
functions.php     source theme helpers; inc/*.php loaded from it
inc/              extra.php, identity.php, groups/{account,blog,content,pages}.php, brand-logo.php, update.php, ...
assets/css        source/*.css (generated, D-10), wp-ja-restaurant.css, fonts.css, icons.css, groups/{about,account,article,blog,home,menus}.css
assets/js         wp-ja-restaurant.js (menu, off-canvas, tabs), wp-ja-restaurant-dark.js (dark switch), groups/{about,account,home,menus}.js
assets/fonts      Teko, Noticia Text, Roboto Mono, Saira Extra Condensed (OFL), Font Awesome 4.6.3, Ionicons 2.0.0
assets/img        the template's own pictures (logo, decor, arrows) and placeholder.svg
readme.txt        the WordPress-format readme; AGENTS.md and docs/ are for agents
```
