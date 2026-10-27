# Architecture

Read ../AGENTS.md. JA Nova is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json` and one stylesheet, with PHP for registration and hooks. It registers no block of its
own. Single language (English); the REST API is WordPress core (`/wp-json/wp/v2/`) with nothing
added by the theme.

## Where the theme comes from

The theme is the `wp-ja-nova` **target** of the `@tracy/wordpress-theme` generator
(`packages/cms/tracy-wordpress-theme` in the Tracy repository): every file of the source theme
`tracy` copied with its text domain rewritten, the overlay `overlays/wp-ja-nova/` on top (15
templates, the header, footer and share parts, 21 section patterns, `inc/extra.php`, one stylesheet,
two scripts, the Golos Text font of the 404 page and eight template pictures), and the generated
files for its one look: `styles/wp-ja-nova.json`, `inspirations.json`, and a `theme.json` whose
presets come from the overlay's `tokens.css`. JA Nova is not one of the vendored catalogue design
systems; its tokens were **measured** on the running source (docs/design-system.md).
generated/inventory.md marks each file "Own: yes" (overlay) or "no" (inherited from `tracy`).
Nothing in the installed theme is hand-edited on the site; the build is the source.

The overlay was written to render the same pages as the JoomlArt JA Nova Joomla 6 quickstart
(`quickstart/ja-nova/j6`, template `ja_nova` 1.2.1, T4 framework): lengths, colours and sizes were
read as computed style off the running Joomla site at 1440 and 390 px, light and dark. No
stylesheet, script or template file of the source was copied (docs/content-rules.md).

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body, its sections included | — | `post_content` of the page/post, block markup |
| Template (`page`, `single`, `front-page` …) | `templates/<name>.html` | a `wp_template` row when edited in the Site Editor — **shadows the file** (none at seed time) |
| Template part | `parts/header.html`, `parts/footer.html`, `parts/share.html` | `wp_template_part` rows `header` and `footer` — **present since the seed**, they shadow the files; `share` has no row |
| Section pattern | `patterns/acm-*.php`, registered as `wp-ja-nova/section-*` | inserted copies live in `post_content` |
| Synced pattern | — | none: the seed created no `wp_block` post |
| Navigation | — | `wp_navigation` posts `mainmenu` (header), `services` (service pages' side menu), `jcontent`, `jpages`, `users` (footer) |
| Contact form | — | Contact Form 7's `wpcf7_contact_form` post titled "Contact" |
| Global styles (Site Editor > Styles) | `theme.json` + `styles/wp-ja-nova.json` | `wp_global_styles` row holding any override |
| Site identity | — | options `blogname` ("ja_nova", the source's site name), `blogdescription`, `show_on_front`, `page_on_front` |
| Project fields (client, services, date, live link, budget) | the template `single-project` and the card filters of `inc/extra.php` | post meta `prj-client`, `prj-services`, `prj-date`, `prj-completed`, `prj-client-name`, `prj-budget` |
| 404 page text | the fallback text in `templates/404.html` | the draft page `page-not-found`, named by option `wp_ja_nova_404_page` |
| Retired-URL redirects | the hook in `inc/extra.php` | option `wp_ja_nova_redirects`, JSON rules |
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
   the Joomla paths survive as pages, nested where the source nests them: `/about-us-2/contact`,
   `/project/branding`). `inc/extra.php` adds answers of its own:
   - `/smart-search` (a **draft** page) is answered with the search view; the term is `?s=` or the
     source's `?q=`; an empty term shows the form and no results. `/?s=` works too.
   - `/category-blog/<post-slug>` and `/project/<category>/<post-slug>` answer with that post
     (status 200, no redirect) when the first part is a published listing page whose post query
     names a category the post is filed in directly; the post's canonical link stays `/<post-slug>/`.
   - The seeded redirect rules send the source's article menu addresses (`/blog-detail`,
     `/project/project-detail`) to their posts with a 301.
   - An attachment path (a picture's slug) answers 404, and WordPress's "guess the permalink" on a
     404 is off, so an unknown path is a 404 as on the source. A signed-out visitor of the
     `page-account` page (`/user-profile`) is sent to `/login-form` with a 303, as on the source.
2. The template hierarchy picks `templates/<name>.html`. The front page renders with
   `front-page.html`; a page's template comes from its `_wp_page_template` meta (the custom
   templates below) or falls back to `page.html`. A post filed under the `project` category tree
   renders with `single-project.html` (`single_template_hierarchy` in `inc/extra.php`), other posts
   with `single.html`.
3. The template's `core/template-part` blocks pull `header` and `footer` from their
   `wp_template_part` rows; `single`, `single-project` and `page-service` also pull `share` (the
   "Share this story" links) from its file.
4. `core/post-content` prints the page's blocks: sections (copies of `wp-ja-nova/section-*`
   patterns), listing queries, the Contact Form 7 shortcode on the contact page. Section blocks
   that the source draws as full-width rows around the article are printed before or after the
   page's main body column by `inc/extra.php` (the blocks stay in the page content, in order).
   `query_loop_block_query_vars` resolves the queries the patterns and pages name: a category by
   slug (`wpJaNovaCategory`, sub-categories included), the siblings of this page
   (`wpJaNovaSiblings`), posts of this post's categories (`wpJaNovaRelated`), posts carrying named
   tags with the tag list's title filter and page size (`wpJaNovaTags`).
5. `theme.json` (the `wp-ja-nova` presets) and the global-styles row become the `--wp--preset--*`
   variables; `assets/css/wp-ja-nova.css` is written against them and its own `--jn-*` colours.

Custom templates (theme.json `customTemplates`) used by this site: `page-landing` (sections, no page
title: `/about-us-2`, `/about-us-2/career`, `/services`, `/project`), `page-contact`
(`/about-us-2/contact`), `page-service` (the services menu beside the article: the seven service
pages), `page-login` (`/login-form`), `page-register` (`/registration-form`), `page-account`
(`/user-profile`), `single-project` (project posts; chosen by category, see step 2). Four more are
inherited from `tracy` and not used by this site: `landing`, `pricing`, `fixture`, `artifact`.

## PHP that runs on every request

- `functions.php` (source theme): the design-system reading of the `tracy` theme, the `?style=`
  preview, the `tracy_nav`/`tracy_hero` body classes, motion (`tracy_motion`), the source theme's
  own contact handler (`tracy_contact_to`; this site's contact page uses Contact Form 7 instead).
  Loads `inc/update.php`, `inc/motion-head.php` (the motion switch in the head) and `inc/extra.php`.
- `inc/extra.php` (overlay): the JA Nova stylesheet and scripts, the dark mode switch (in the head,
  blocking), the `wp-ja-nova` pattern category, editor styles, body classes (`jn-route-<slug>`,
  `jn-parent-<slug>`), the named queries above, the search page at `/smart-search`, posts at their
  listing paths, no attachment pages, the redirect rules of `wp_ja_nova_redirects`, the 404 page's
  own words, the account redirect, the sign-in form's words and links, project card fields and
  card excerpts cut as the source cuts them, the services side menu bound by name, Prev/Next in
  the source's list order, the shared call-to-action band on pages that carry none, the current
  menu entry of the post being read, the tag list's filter bar, the "Page N of M" counter beside
  the pager, and the default of `tracy_motion`. Every function carries the `wp_ja_nova_` prefix.
- `inc/update.php` (rendered by the package build from the shared updater, with this theme's
  `updateSlug`): hooks `update_themes_github.com` (from the `Update URI:` header) and answers only
  for the stylesheet `wp-ja-nova`, reading `wordpress/theme/wp-ja-nova/update.json` and caching it
  in a site transient. WordPress offers an update only once that manifest is published and names a
  newer version; until then, install a newer zip by hand (docs/checks-and-recovery.md).

## Scripts

`assets/js/wp-ja-nova-dark.js` (head, blocking): the three-state colour scheme. Deferred
`assets/js/wp-ja-nova.js`: the header drawer below 992px, the questions accordion, the pricing
tabs, the moving tag rows, the client-logo autoplay, the video dialog, the tag list's "Display #"
select and the focus of the sign-in field. Carousels step through the shared motion library.

## Plugins

- **Contact Form 7** (`contact-form-7`): the `/about-us-2/contact` form (Name, Email, Phone,
  Subject, Message, "Send your request") is its form "Contact", placed by a `core/shortcode` block.
  The seeder installs and activates it; activation also creates the plugin's own sample form
  "Contact form 1", which no page uses. Not bundled with the theme; without it the shortcode prints
  as text. Its mail needs an outbound mail route on the host.

## Theme layout

```
style.css          header: JA Nova, Version, Requires at least 7.0, Tested up to 7.1, Requires PHP 8.1, Text Domain wp-ja-nova, Update URI
theme.json         version 3: 16 colours, 3 font families, 8 sizes, 8 spaces, 1376px content and wide, settings.custom, styles.css (dark)
styles/            wp-ja-nova.json (the default look restated as a variation)
templates/         19 block templates, 15 of them JA Nova's own (see generated/inventory.md)
parts/             header.html, footer.html (shadowed by database rows on the seeded site), share.html
patterns/          40 patterns: 21 wp-ja-nova/section-* (own), 19 tracy/* (source library, not placed)
functions.php      source theme helpers and hooks; inc/*.php loaded from it
inc/               extra.php (JA Nova), update.php, motion-head.php
assets/css, js     stylesheets and scripts listed under "Enqueued assets" in generated/inventory.md
assets/fonts       Golos Text latin (woff2, the 404 page's font) and its licence
assets/img         icon-decor-1…4.png (heading decorations), ic-*.png (contact icons), placeholder.svg
readme.txt         the WordPress-format readme; AGENTS.md and docs/ are for agents
```
