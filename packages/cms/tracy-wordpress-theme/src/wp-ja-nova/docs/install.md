# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site —
no content comes with a theme; WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or **the quickstart
`quickstart/ja-nova/wp7`** — a webroot archive plus a database dump that restore into the
complete JA Nova site.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the site was built on 7.1.2) |
| Requires PHP | 8.1 (the site was built on 8.3) |
| Plugin | Contact Form 7 (`contact-form-7`, active). The `/about-us-2/contact` page carries its shortcode; without the plugin the shortcode prints as text and the rest of the page is unchanged |
| Permalinks | `/%postname%/` — the source's paths (`/about-us-2/contact`, `/category-blog/<post>`, `/project/<category>/<post>`) rely on it |
| Registration | `users_can_register` = 1 with `default_role` = subscriber (data of the quickstart; the theme never turns it on). Off: `/registration-form` says registration is closed (docs/content-rules.md) |

## Theme alone

```sh
wp theme install wp-ja-nova.zip --activate       # or Appearance > Themes > Add New > Upload
wp plugin install contact-form-7 --activate      # only if you will build a contact page
wp theme list --status=active                    # wp-ja-nova
```

The zip holds one folder `wp-ja-nova/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header and footer from `parts/`. Their navigation blocks carry no
`ref` until a seeder or the Site Editor sets one, so each falls back to the newest `wp_navigation`
post or to a page list (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/).
The pages the theme's templates and hooks are made for — `/smart-search` as a draft, the listing
pages whose post query names a category, the draft `page-not-found` recorded in
`wp_ja_nova_404_page`, the `services` menu of the service pages — do not exist until they are
created as docs/content-model.md describes. The theme alone is the look, not the site.

Updates: `inc/update.php` answers for the stylesheet `wp-ja-nova` and reads
`wordpress/theme/wp-ja-nova/update.json`. WordPress lists a newer `wp-ja-nova` only after that
manifest is published with a newer version; until then, install a newer version with
`wp theme install <newer wp-ja-nova zip> --force`.

## Quickstart

The WordPress quickstart is to be released under the tag **`quickstart/ja-nova/wp7`** in
`JoomlArt-Products/ja-products` as the pair `<id>-webroot-<version>.tar.gz` (the webroot) and
`<id>-database-<version>.sql.gz` (the database), with `manifest.json`, `SHA256SUMS`,
`VERIFICATION.json` and a `README.md` whose "Restore by hand" section is the authoritative command
list. The pack is assembled next to this theme's zip (version 1.1.2) and restored on a clean stand
before it is offered; the release's own README, not this file, names its version, hashes,
placeholder address and administrator account. In
short: untar into the webroot, fill the database placeholders in `wp-config.php`, import the SQL,
then `wp search-replace '<placeholder url>' '<site url>' --all-tables --precise`,
`wp core verify-checksums`, set a password on the administrator account, `wp rewrite flush`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # wp-ja-nova
wp plugin list --status=active --fields=name,version     # contact-form-7
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # header, footer shadow the files
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # mainmenu, services, jcontent, jpages, users
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found
wp option get wp_ja_nova_404_page && wp option get wp_ja_nova_redirects --format=json
wp db size
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host.
Never run a `search-replace`, an import or a theme update against a site you have not identified.
