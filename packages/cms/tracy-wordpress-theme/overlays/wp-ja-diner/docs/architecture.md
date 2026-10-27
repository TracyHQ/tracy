# Architecture

Read ../AGENTS.md. JA Diner is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and the source template's own stylesheets, with PHP for hooks. Single language (English,
D-04). The REST API is WordPress core (`/wp-json/wp/v2/`); the theme adds no endpoint (its forms post
to core's `admin-post.php`).

## Where the theme comes from

The theme is the `wp-ja-diner` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): the source theme `tracy` copied with its
text domain rewritten, the overlay `overlays/wp-ja-diner/` on top, and the generated files for its one
look (`theme.json` and `styles/wp-ja-diner.json` from the overlay's measured `tokens.css`, the dark half
from `theme.overlay.json`, and `inspirations.json`). `variations` is empty in `theme.config.json`: JA
Diner is not a vendored catalogue design system. generated/inventory.md marks each file "Own: yes"
(overlay) or "no" (inherited from `tracy`).

The overlay holds 16 templates, 5 parts (`header`, `footer`, `sidebar`, `search-description`,
`search-form`), 29 pattern files (28 `wp-ja-diner/*` patterns, 17 of them `acm-*` sections, plus
`tracy/section-cta-final`), `inc/extra.php`, `inc/identity.php`, seven group files under `inc/groups/`,
the stylesheets and scripts under `assets/`, the bundled fonts and the template's own pictures
(`assets/img`).

The design comes from the JoomlArt JA Diner Joomla 6 quickstart 1.0.4 (template `ja_diner` on the
**T3 framework**, Bootstrap 3 grid). The base stylesheets are **the source template's own compiled
sheets**, carried rule for rule (D-10): `bootstrap.css`, `template.css`, `megamenu.css` and
`off-canvas.css` became `assets/css/source/*.css`, every colour rewritten as
`light-dark(<source>, <derived dark>)`, `url()` pointed at `assets/img`. They were written by
`tasks/ja-diner-wp7/tools/port-css.mjs` in the Tracy repository and are never edited by hand. Parts and
patterns therefore keep the source's class names (`t3-*`, `acm-*`, `ja-*`, Bootstrap 3 grid); `jd-*`
classes are this theme's own. `assets/css/wp-ja-diner.css` and `assets/css/groups/*.css` only adapt what
WordPress's block markup does differently; `assets/css/base.css` is a 598-byte file that cancels the
global flow gap so the source's margins decide.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | none | `post_content`, block markup |
| Template | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor: it shadows the file (none on the build stand) |
| Template part | `parts/*.html` | `wp_template_part` rows `header` and `footer` exist on the build stand (the seeder wrote them to set the navigation `ref`); they shadow the files. Check with `wp post list --post_type=wp_template_part` |
| Section pattern | `patterns/*.php`, registered as `wp-ja-diner/*` | inserted copies live in `post_content` |
| Navigation | the header's two Navigation blocks: `nav.mainmenu` (desktop bar) and `nav.site-pages` (phone side panel) | `wp_navigation` posts `mainmenu`, `site-pages` and `usermenu`; the `header` row holds their `ref` |
| Global styles | `theme.json`, `styles/wp-ja-diner.json` | the `wp_global_styles` row `wp-global-styles-wp-ja-diner` |
| Site identity | none | `blogname` ("ja-diner" on the build stand), `blogdescription` (empty: the source has no tagline), `site_logo`, `tracy_logo_dark` (unset), `show_on_front` = `page`, `page_on_front` (the page `front-page`) |
| Footer location, hours, contact, copyright | `parts/footer.html` (`footer.location`, `footer.hours`, `footer.contact`, `footer.copyright`) | the `footer` template-part row |
| 404 text | `patterns/part-404.php` ("404", "Page not found", a line, a list of pages) | none (see "Inert hooks") |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_diner_redirects` (rules `from`, `to`, `status`) |
| Motion settings | the default in `inc/extra.php` | option `tracy_motion` when the owner saves one |
| Article list picture | none | post meta `jd_intro_image` (an attachment id), written by `tasks/ja-diner-wp7/tools/post-seed.sh` |

WordPress behaviour these rows rely on: templates and parts
(https://developer.wordpress.org/themes/templates/templates/,
https://developer.wordpress.org/themes/templates/template-parts/), the template hierarchy
(https://developer.wordpress.org/themes/templates/template-hierarchy/), patterns
(https://developer.wordpress.org/themes/patterns/registering-patterns/), the navigation fallback when a
block has no `ref` (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/), theme.json
(https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/), custom
templates (https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/).

## How a request is answered

1. WordPress resolves the URL (`/%postname%/` permalinks). The Joomla menu paths survive as pages
   (`/about-us`, `/j-pages/login`, `/other-pages/error-page`, `/home/home-red`); articles live at
   `/<slug>/`. `inc/extra.php` and `inc/groups/*.php` add answers of their own:
   - `/other-pages/smart-search` and `/smart-search` are the draft page `smart-search` answered with the
     search view; the term is `?s=` or the source's `?q=`; an empty term shows the form and no results.
     The header search form posts there. Search lists posts only (`inc/groups/blog.php`), as the source's
     finder does.
   - The four Content pages live under `/content/` (D-36): `all-categories`, `fetured-articles` (sic, the
     source's spelling), `tagged-items`, `typography`. `/joomla-content/*` answers 301 to them.
   - The source's address of an article (`/our-blog/10-restaurant-news/3-cocktail-bar-alchemist-set-to-open-at-mediacity-in-salford-quays`)
     answers 200 with the post, using the rule recorded in `wp_ja_diner_redirects`; its canonical address
     stays `/<slug>/`.
   - A signed-out visitor who opens `/your-profile`, `/j-pages/user-profile`, `/j-pages/edit-user-profile`
     (any page on the `page-account` template), `/submit-an-article`, `/template-settings` or
     `/site-settings` is sent to `/j-pages/login/` with 303 (D-16); after `/your-profile` and the three
     other routes the Login page shows "Please login first" once (a five-minute cookie `jm_login_first`).
   - An attachment path answers 404, and WordPress's "guess the permalink" on a 404 is off.
   - The redirect rules apply only when WordPress would answer 404.
2. The template hierarchy picks `templates/<name>.html`. Six custom templates are declared for pages in
   `theme.json`: `page-landing`, `page-account`, `page-login`, `page-register`, `page-password`,
   `page-contact` (plus the source theme's own `landing`, `fixture`, `artifact`, `pricing`, which this
   site does not use). Pages with no assigned template use `page.html`; the front page uses
   `front-page.html`.
3. Page templates pull `header` and `footer` around `core/post-content`. The archive, category, tag,
   home, index, search and single templates also pull `sidebar` (search also `search-form`). The 404
   template is the `part-404` pattern alone, with no header or footer, as the source's `error.php`.
4. `core/post-content` prints the page's sections (copies of `wp-ja-diner/acm-*`). Several pages are
   completed at render time (docs/content-model.md, "Pages the theme completes").
5. `theme.json` and the global-styles row become the `--wp--preset--*` variables; the source sheets read
   them through `var(--ds-c-<role>, <template colour>)`, so a design system worn through Tracy recolours
   the site and, without one, the template's own colour shows.

## PHP that runs on every request

- `functions.php` (source theme `tracy`): design-system reading, `?style=` preview, motion, and it loads
  `inc/update.php`, `inc/variations.php`, `inc/asset-version.php`, `inc/brand-logo.php` (the dark-mode
  logo `tracy_logo_dark`, the site name as text where no logo is set), `inc/role-reads.php`,
  `inc/motion-head.php` and `inc/extra.php`.
- `inc/extra.php` (overlay): loads `inc/identity.php` (the `{site.title}` and `{year}` tokens of the
  header, footer and copyright line); enqueues the stylesheets (`base`, `fonts`, `icons`, the four
  `source/*` sheets in the source's load order, then `wp-ja-diner.css` and `groups/*.css`), the dark-mode
  script (head, blocking) and the main script plus `assets/js/groups/*.js` (deferred); preloads the body
  font; registers the pattern category `wp-ja-diner` ("WP Diner"); sets body classes `tracy-nav-top-left`,
  `tracy-hero-split`, `jm-route-<slug>`, `jm-parent-<slug>`; turns off guessed permalinks; answers
  attachment paths with 404; applies the redirect rules; serves the search view and the article route;
  marks the current menu item; draws the back-to-top button and the icon tint filter; names social links;
  sets the default of `tracy_motion` (one effect, `carousel-step`). Every function carries the
  `wp_ja_diner_` prefix. At its end it loads `inc/groups/*.php` by a glob:
  - `account.php`: guest redirects, the register, reminder and contact handlers
    (`admin_post_jm_register`, `jm_remind`, `jm_contact`, each with a nonce), the account and contact
    patterns swapped into their pages, the article frame, the masthead description constant;
  - `blog.php`: listing pages, the single article's details and navigation, search results, the sidebar
    (banner, Categories, Login, Latest News), the six blocks below;
  - `chrome.php`: current-item marking for the header menu (Home on the front page, Our Blog for articles
    and categories, Tagged Items for tags, Smart Search for search) and the group-flow clean-up;
  - `content.php`: `wptexturize` off, the sign-in form links;
  - `g1.php`: the body class `jd-theme-<colour>` on `/home/home-{red,pink,green,blue}`;
  - `home.php`: the "News & Events" cards (newest posts with a picture; the list picture from
    `jd_intro_image`, else the featured image);
  - `pages.php`: the About Us button style, the categories module, article fixes, quote authors.
- `inc/update.php`: asks `https://raw.githubusercontent.com/TracyHQ/claude-cowork/main/wordpress/theme/wp-ja-diner/update.json`
  for a newer version. Whether that manifest is published is not known from the files; until it is,
  install a newer zip by hand (docs/checks-and-recovery.md).

### Inert hooks

`extra.php` and `groups/account.php` were forked from earlier JoomlArt ports and keep hooks that look
for names that no template, part, pattern or stored page of this site carries (checked by grep over the
theme files and, with `wp eval`, over `post_content` on the build stand, 21/10/2026): the group named
`404.body` (with option `wp_ja_diner_404_page` = the draft page `page-not-found`, which therefore never
reaches the 404 screen), `single.masthead`, `search.masthead`, the `page.title` heading override (post
meta `tracy_page_heading`, set on one page, is not printed), `jm-fulltext-image`, `jm-head-info` (page
`home-style-2`), `jm-quick-contact` (the `jm_quick_contact` handler), `tagspopular`, `jmOrder` and
`jmCategory` query orders (no `hits` meta exists), the page `list-of-all-tags` and the `gallery`
category routes in `chrome.php`. They do nothing here; do not rely on them.

## Blocks and plugins

The theme registers six server-rendered blocks, all in the "theme" category, all in
`inc/groups/blog.php`: `wp-ja-diner/blog-sidebar`, `blog-item`, `blog-article-info`, `blog-pagenav`,
`blog-search-results` and `blog-body` (the list body of the four listing pages, attribute `view`).

No plugin is required. The contact form (`/contact-us`), registration and username reminder post to
`admin-post.php`; WordPress core sends the mail through `wp_mail` (contact mail goes to `tracy_contact_to`
only, at most five an hour per client address), so the host needs an outbound mail route. The password
reset form posts to core's lost-password screen. The Subscribe form draws the source's AcyMailing field
and button and sends nothing (G1).

The build stand also runs Contact Form 7 (active, two forms) and three must-use plugins the seeder
installs (`tracy-joomla-pagination`, `tracy-more-articles`, `tracy-redirects`). The stored Contact Us
page holds a `[contact-form-7 id="39" title="Contact"]` shortcode, but the theme strips it and prints
its own `contact-form` pattern, so Contact Form 7 draws nothing there (measured: the page's contact
`<form id="contact-form">` posts to `admin-post.php`).

## Theme layout

```
style.css         header: WP Diner, Version 1.0.0, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-diner
theme.json        generated: presets from tokens.css, the dark half from theme.overlay.json, customTemplates
styles/           wp-ja-diner.json (the one look, generated)
templates/        the overlay's 16 block templates plus the source theme's (see generated/inventory.md)
parts/            header, footer, sidebar, search-description, search-form
patterns/         wp-ja-diner/* (30 registered); the tracy/* ones are inherited and not used by this site
functions.php     source theme helpers; inc/*.php loaded from it
inc/              extra.php, identity.php, groups/{account,blog,chrome,content,g1,home,pages}.php, brand-logo.php, update.php, ...
assets/css        source/{bootstrap,template,megamenu,off-canvas}.css (generated, D-10), base.css, wp-ja-diner.css, fonts.css, icons.css, groups/{about,account,article,blog,g1,g2,g3,home,menus}.css
assets/js         wp-ja-diner.js (menu, off-canvas, tabs, back-to-top), wp-ja-diner-dark.js (dark switch), groups/{about,account,blog,menus}.js
assets/fonts      Work Sans, Eczar (OFL), Font Awesome 4.6.3, Ionicons 2.0.0
assets/img        the template's own pictures (logo, decor, arrows, masthead) and placeholder.svg
readme.txt        the WordPress-format readme; AGENTS.md and docs/ are for agents
```
