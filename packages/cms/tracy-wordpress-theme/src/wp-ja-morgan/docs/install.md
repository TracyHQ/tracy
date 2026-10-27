# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site: no
content comes with a theme, WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or the **quickstart** built from
this theme (a webroot archive and a database archive restored on a clean host; the files, hashes and
how it was verified are in the Tracy repository's `tasks/ja-morgan-wp7/release/`, nothing there has
been published). The tag `quickstart/ja-morgan/j6` is the Joomla **source**, not a WordPress package.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the build stand ran 7.1.2) |
| Requires PHP | 8.1 |
| Plugins | none required by the theme. Forms need a mail route on the host, not a plugin (docs/architecture.md); D-13 leaves open whether to add a form plugin |
| Table prefix | `tr_` on the build stand |
| Permalinks | `/%postname%/`: the source's nested paths rely on it |
| Registration | the source's registration is open, so the build stand and the quickstart ship `users_can_register` = 1 with `default_role` = `subscriber`; the `/j-pages/registration` form creates that account. With the setting off the page shows "Registration is closed on this site" and a Log in link (no form), the sign-in module drops its "Create an account" link, and a direct post answers `error-closed` |

## Theme alone

```sh
wp theme install wp-ja-morgan.zip --activate      # or Appearance > Themes > Add New > Upload
wp theme list --status=active                     # wp-ja-morgan
```

The zip holds one folder `wp-ja-morgan/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header, footer and sidebar from `parts/`. Their navigation blocks
carry no `ref` until a seeder or the Site Editor sets one, so each falls back to the newest
`wp_navigation` post or to a page list
(https://developer.wordpress.org/reference/classes/wp_navigation_fallback/). The pages the theme's
templates and hooks are made for (`smart-search` as a draft, the listing pages under
`/joomlart-content/`, the draft `page-not-found` recorded in `wp_ja_morgan_404_page`) do not exist
until they are created as docs/content-model.md describes. The theme alone is the look, not the
site.

Updates: `inc/update.php` answers for the stylesheet `wp-ja-morgan`. WordPress lists a newer version
only after the manifest it reads is published with a newer version (whether it is, is not known from
the theme files); otherwise install by hand with `wp theme install <newer wp-ja-morgan zip> --force`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # wp-ja-morgan
wp plugin list --status=active --fields=name,version
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # rows shadowing files
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # eight menus at seed time
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found
wp option get wp_ja_morgan_404_page && wp option get wp_ja_morgan_redirects --format=json
wp db size
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host. Never
run a `search-replace`, an import or a theme update against a site you have not identified.
