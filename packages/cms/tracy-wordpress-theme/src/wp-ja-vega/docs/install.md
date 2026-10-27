# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site —
no content comes with a theme; WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or **the quickstart
`quickstart/ja-vega/wp7`** — a webroot archive plus a database dump that restore into the
complete JA Vega site.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the site was built on 7.1.2, the core version of the WordPress quickstarts released at the time) |
| Requires PHP | 8.1 (the site was built on 8.3) |
| Plugin | Contact Form 7 (`contact-form-7`, active). The `/contact` page carries its shortcode; without the plugin the shortcode prints as text and the rest of the page is unchanged |
| Table prefix | `tr_` (the build stand the quickstart is packed from) |
| Permalinks | `/%postname%/` — the source's paths (`/services/it-consultancy`, `/category-blog/<post>`) rely on it |
| Registration | `users_can_register` = 0, on purpose: the `/registration-form` page shows a "Log in" link, not a sign-up form (docs/content-rules.md, G68) |

## Theme alone

```sh
wp theme install wp-ja-vega.zip --activate       # or Appearance > Themes > Add New > Upload
wp plugin install contact-form-7 --activate      # only if you will build a contact page
wp theme list --status=active                    # wp-ja-vega
```

The zip holds one folder `wp-ja-vega/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).

A blank site shows the theme's header and footer from `parts/`. Their navigation blocks carry no
`ref` until a seeder or the Site Editor sets one, so each falls back to the newest `wp_navigation`
post or to a page list (https://developer.wordpress.org/reference/classes/wp_navigation_fallback/);
the two mega menus keep the links written in the part. The pages the theme's templates and hooks
are made for — `/smart-search` as a draft, the listing pages whose post query names a category,
the draft `page-not-found` recorded in `wp_ja_vega_404_page` — do not exist until they are created
as docs/content-model.md describes. The theme alone is the look, not the site.

Updates: `inc/update.php` answers for the stylesheet `wp-ja-vega` and reads
`wordpress/theme/wp-ja-vega/update.json`. WordPress lists a newer `wp-ja-vega` only after that
manifest is published with a newer version; until then, install a newer version with
`wp theme install <newer wp-ja-vega zip> --force`.

## Quickstart

The WordPress quickstart is released under the tag **`quickstart/ja-vega/wp7`** in
`JoomlArt-Products/ja-products` as the pair `<id>-webroot-<version>.tar.gz` (the webroot) and
`<id>-database-<version>.sql.gz` (the database, table prefix `tr_`), with `manifest.json`,
`SHA256SUMS`, `VERIFICATION.json` and a `README.md` whose "Restore by hand" section is the
authoritative command list. Version 1.1.2 was packed on 29/09/2026 and replaces the assets of the
existing, published release in place (Tracy offers the version its assets carry): `ja-vega-wp7-webroot-1.1.2.tar.gz` and
`ja-vega-wp7-database-1.1.2.sql.gz`, placeholder address `https://quickstart.invalid`,
administrator account `tracyagent`. Hashes are in that release, not here: this documentation ships
inside the archive it would describe. In
short: untar into the webroot, replace the four `{{DB_*}}` placeholders in `wp-config.php`, import
the SQL, then `wp search-replace '<placeholder url>' '<site url>' --all-tables --precise`,
`wp core verify-checksums`, set a password on the administrator account (no account ships with a
usable password), `wp rewrite flush`. The webroot carries Contact Form 7, active. Every member of
the webroot archive is owned by root with mode 0644 (files) or 0755 (folders), as the fleet
extracts it; the web server and wp-cli run as `www-data` and only read the files.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # wp-ja-vega
wp plugin list --status=active --fields=name,version     # contact-form-7
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # header, footer shadow the files
wp post list --post_type=wp_navigation --fields=ID,post_name,post_title                 # six menus
wp post list --post_type=page --post_status=draft --fields=ID,post_name                 # smart-search, page-not-found
wp option get wp_ja_vega_404_page && wp option get wp_ja_vega_redirects --format=json
wp db size
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host.
Never run a `search-replace`, an import or a theme update against a site you have not identified.
