# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site: no
content comes with a theme, WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or a **quickstart** built from
this theme (a webroot archive and a database archive restored on a clean host). No quickstart of
this theme had been published when these documents were written; the Joomla source quickstart is
not a WordPress package.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the build stand ran 7.1.2) |
| Requires PHP | 8.1 |
| Plugins required by the theme | none |
| Plugins the seeded site runs | Contact Form 7 (6.1.7 on the build stand, active): the Contact page calls its form by shortcode; without it the page prints the shortcode text. Akismet and Hello Dolly are installed and inactive (WordPress defaults) |
| Must-use plugins the seeded site runs | `tracy-redirects`, `tracy-joomla-pagination`, `tracy-author-avatars`, in `wp-content/mu-plugins/`. They are **not in the theme zip**: the seeder copies them to the site. Without them the retired-URL redirects do not fire, listing pagers fall back to core's, and author pictures fall back to Gravatar |
| Table prefix | `tr_` on the build stand |
| Permalinks | `/%postname%/`: the source's nested paths rely on it |
| Category base | option `category_base` = `topic`. The source's `/category/<x>` pages are WordPress pages, and the default category base `category` would collide with them. The seeder does not write this option; a quickstart database carries it. On a site where it is left at the default, the paths under `/category/` can collide with core's category archives |
| Registration | `users_can_register` is `0` on the build stand; the source's registration form (about 15 fields) was not ported, the registration page keeps core's Log in link (docs/content-rules.md, D-41) |
| Site logo | theme mod `custom_logo` (attachment 52 on the build stand, a 132x40 picture) feeds the footer's `site-logo` block. The seeder does not write it; the build's own deploy script did. A site without it has no logo to print in the footer |

## Theme alone

```sh
wp theme install wp-ja-essence.zip --activate      # or Appearance > Themes > Add New > Upload
wp theme list --status=active                      # wp-ja-essence
```

The zip holds one folder `wp-ja-essence/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header and footer from `parts/`. Their navigation blocks carry no
`ref` until a seeder or the Site Editor sets one, so each falls back to the newest `wp_navigation`
post or to a page list
(https://developer.wordpress.org/reference/classes/wp_navigation_fallback/). The pages the theme's
templates and hooks are made for (the draft `smart-search` under `/pages/j-pages/`, the pages under
`/category/`, `/detail/` and `/pages/`) do not exist until they are created as docs/content-model.md
describes. The theme alone is the look, not the site.

Updates: `inc/update.php` answers for the stylesheet `wp-ja-essence`. WordPress lists a newer
version only after the manifest it reads is published with a newer version (whether it is, is not
known from the theme files); otherwise install by hand with
`wp theme install <newer wp-ja-essence zip> --force`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # wp-ja-essence
wp plugin list --fields=name,status,version              # contact-form-7 active; mu-plugins listed as must-use
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # two parts at seed time
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # mainmenu, category
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found
wp option get category_base && wp option get wp_ja_essence_redirects --format=json
wp db size
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host. Never
run a `search-replace`, an import or a theme update against a site you have not identified.
