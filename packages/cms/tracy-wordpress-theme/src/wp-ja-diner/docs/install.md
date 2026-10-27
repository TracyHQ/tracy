# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site: no content
comes with a theme, WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or a **WordPress quickstart** built
from this theme (a webroot archive and a database archive restored on a clean host). When these documents
were written (21/10/2026) **no WordPress quickstart of this theme had been built**: the packaging and
quickstart phases had not run (`tasks/ja-diner-wp7/STATUS.md` in the Tracy repository). The Joomla
quickstart 1.0.4 is the **source** of the port, not a WordPress package.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 (`style.css`) |
| Tested up to | WordPress 7.1 (the build stand ran 7.1.3) |
| Requires PHP | 8.1 |
| Plugins | none required by the theme. The forms need a mail route on the host (`wp_mail`), not a plugin; the Subscribe form collects nothing and needs a newsletter plugin to do so (G1). The build stand had Contact Form 7 active, which the rendered site does not use (docs/architecture.md) |
| Table prefix | `wp_` on the build stand |
| Permalinks | `/%postname%/`: the source's nested paths rely on it |
| Registration | the source accepts registrations, so the build stand sets `users_can_register` = 1 with `default_role` = `subscriber` (D-15); the `/j-pages/registration` form creates that account. With the setting off, the sign-in form drops its "Create an account" link and a direct post is refused |
| Date format | `date_format` = `j F Y` so that article dates read "10 September 2021" as in the source (D-22) |
| Front page | `show_on_front` = `page`, `page_on_front` = the page `front-page` |

## Theme alone

```sh
wp theme install wp-ja-diner.zip --activate     # or Appearance > Themes > Add New > Upload
wp theme list --status=active                   # wp-ja-diner
```

The zip holds one folder `wp-ja-diner/`; `style.css`, `theme.json` and `templates/index.html` are the
required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header and footer from `parts/`. Their Navigation blocks carry no `ref`
until a seeder or the Site Editor sets one, so each falls back to the newest `wp_navigation` post or to a
page list (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/). The pages the
theme's hooks are made for (the listing pages `our-blog`, `tagged-items`, `fetured-articles`,
`all-categories`; `smart-search` as a draft under `other-pages`; `j-pages/login`, `j-pages/registration`,
`password-reset`, `username-reminder-request`, `contact-us`), the category `our-blog` with its news
categories, and the media item the sidebar banner looks up (option `wp_ja_diner_blog_banner_image`) do
not exist until they are created as docs/content-model.md describes. The theme alone is the look, not the
site.

The site logo is not in the theme: set it with `wp option update site_logo <attachment id>` or Site
Editor > Site Logo (the build stand imports the source's `logo.png` as "JA Diner logo",
`tasks/ja-diner-wp7/tools/post-seed.sh`). A logo for dark backgrounds goes in `tracy_logo_dark`
(docs/design-system.md, D-34). The same script stores the article list pictures in post meta
`jd_intro_image`.

Updates: `inc/update.php` answers for the stylesheet `wp-ja-diner`. WordPress lists a newer version only
after the manifest it reads is published with a newer version (whether it is, is not known from the theme
files); otherwise install by hand with `wp theme install <newer wp-ja-diner zip> --force`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version        # wp-ja-diner
wp plugin list --fields=name,status,version
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # rows shadowing files
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # mainmenu, site-pages, usermenu
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found, privacy-policy
wp option get wp_ja_diner_redirects --format=json
wp db size
```

The build stand ran behind Docker on loopback (port 8682); a fleet site is reached through its host.
Never run a `search-replace`, an import or a theme update against a site you have not identified.
