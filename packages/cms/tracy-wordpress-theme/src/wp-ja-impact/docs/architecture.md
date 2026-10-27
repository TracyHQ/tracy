# Architecture

## Folders

| Path | What it is |
| --- | --- |
| `style.css`, `theme.json`, `styles/wp-ja-impact.json` | Theme header and the global styles, generated from the measured tokens |
| `templates/`, `parts/` | Block templates (24) and template parts (`header`, `footer`, `contact`) |
| `patterns/` | Block patterns: the theme's own `acm-*`, `ga-*`, `gb-*`, `gc-*` sections plus the shared `tracy/*` library |
| `assets/css/wp-ja-impact.css`, `assets/css/groups/*.css` | The look: base sheet, then one sheet per group of sections/pages (loaded in alphabetical order) |
| `assets/js/` | `wp-ja-impact-dark.js` (head, blocking), `wp-ja-impact.js` (drawer), `groups/*.js` (carousel steps, accordion, video dialog) |
| `assets/fonts/` | Readex Pro (latin, latin-ext), Font Awesome Free 6 solid and brands, with licences |
| `inc/extra.php`, `inc/groups/*.php` | Hooks: redirects, 404 words, search address, account forms, listing queries, single layouts |

## What is file and what is database

Files: templates, parts (until shadowed), patterns, CSS, JS, PHP. Database: pages, posts, media,
`wp_navigation` menus (six), the Contact Form 7 form "Contact", the `wp_template_part` rows `header`
and `footer`, options. A request is answered by WordPress's template hierarchy; a page chooses its
template through the post meta `_wp_page_template`.

## Request flow

`/` renders `front-page.html`; pages render `page.html` or their chosen template; posts render
`single.html` or, chosen by `inc/groups/gc.php`, `single-donation`, `single-event`,
`single-blog-detail`, `single-sidebar`. Redirect rules the seed recorded are served by the
must-use plugin `tracy-redirects`; the theme answers `/pages/j-page/smart-search/` itself.

## Plugins and must-use plugins

Contact Form 7 (`contact-form-7`) draws the contact form. The seeder installs must-use plugins
`tracy-author-avatars`, `tracy-joomla-pagination`, `tracy-post-meta` and `tracy-redirects`; they
live in `wp-content/mu-plugins/` and are part of the quickstart.

## Not here

No custom blocks, no custom post types, no widget areas. Sidebars are columns in templates.
