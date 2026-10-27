# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site: no content
comes with a theme, WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or a **WordPress quickstart** built
from this theme (a webroot archive and a database archive restored on a clean host). When these documents
were written (20/10/2026) **no WordPress quickstart of this theme had been built**: the packaging and
quickstart phases had not run (`tasks/ja-restaurant-wp7/STATUS.md` in the Tracy repository). The tag
`quickstart/ja-restaurant/j6` 1.0.6 is the Joomla **source**, not a WordPress package.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 (`style.css`) |
| Tested up to | WordPress 7.1 (the build stand ran 7.1.3) |
| Requires PHP | 8.1 |
| Plugins | none required by the theme. The forms need a mail route on the host (`wp_mail`), not a plugin; the Subscribe box needs a newsletter plugin to collect addresses (D-07, open). The build stand had Contact Form 7 active, which the rendered site does not use (docs/architecture.md) |
| Table prefix | `wp_` on the build stand |
| Permalinks | `/%postname%/`: the source's nested paths rely on it |
| Registration | the source accepts registrations, so the build stand sets `users_can_register` = 1 with `default_role` = `subscriber` (D-15); the `/explore/j-pages/registration` form creates that account. With the setting off, the sign-in module drops its "Create an account" link and a direct post is refused |
| Front page | `show_on_front` = `page`, `page_on_front` = the page `homepage` |

## Theme alone

```sh
wp theme install wp-ja-restaurant.zip --activate     # or Appearance > Themes > Add New > Upload
wp theme list --status=active                        # wp-ja-restaurant
```

The zip holds one folder `wp-ja-restaurant/`; `style.css`, `theme.json` and `templates/index.html` are the
required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header and footer from `parts/`. Their Navigation blocks carry no `ref`
until a seeder or the Site Editor sets one, so each falls back to the newest `wp_navigation` post or to a
page list (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/). The pages the
theme's hooks are made for (the listing pages `blog`, `gallery`, `tagged-items`, `featured-articles`,
`all-categories`; `smart-search` as a draft under `explore/j-pages`; `explore/j-pages/login`; the contact
and account pages at their paths), the news categories under `restaurant`, and the media items the theme
looks up by file name (`banner-1`) do not exist until they are created as docs/content-model.md
describes. The theme alone is the look, not the site.

The site logo is not in the theme: set it with `wp option update site_logo <attachment id>` or Site
Editor > Site Logo (the build stand imports the source's `logo.png` as "JA Restaurant logo",
`tasks/ja-restaurant-wp7/tools/post-seed.sh`). A logo for dark backgrounds goes in `tracy_logo_dark`
(docs/design-system.md).

Updates: `inc/update.php` answers for the stylesheet `wp-ja-restaurant`. WordPress lists a newer version
only after the manifest it reads is published with a newer version (whether it is, is not known from the
theme files); otherwise install by hand with `wp theme install <newer wp-ja-restaurant zip> --force`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version        # wp-ja-restaurant
wp plugin list --fields=name,status,version
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # rows shadowing files
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # mainmenu, usermenu
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found
wp option get wp_ja_restaurant_redirects --format=json
wp db size
```

The build stand ran behind Docker on loopback; a fleet site is reached through its host. Never run a
`search-replace`, an import or a theme update against a site you have not identified.
