# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site —
no content comes with a theme; WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or **the quickstart
`quickstart/ja-kinetic/wp7`** — a webroot archive plus a database dump that restore into the
complete Kinetic site.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the site was built on 7.1) |
| Requires PHP | 8.1 (the site was built on 8.3) |
| Plugin | AcyMailing (`acymailing`; the build stand ran 11.0.5, active). The footer and the 404 page carry its `acymailing/subscription-form` block; without the plugin that block renders nothing and the rest of the page is unchanged |
| Table prefix | `tr_` (the quickstart's database, and the build stand it was packed from) |
| Permalinks | `/%postname%/` |
| Registration | `users_can_register` = 1, `default_role` = `subscriber` — the Register page works only while registration is open |

## Theme alone

```sh
wp theme install wp-ja-kinetic.zip --activate    # or Appearance > Themes > Add New > Upload
wp plugin install acymailing --activate
wp theme list --status=active                    # wp-ja-kinetic
```

The zip holds one folder `wp-ja-kinetic/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).
Measured on a blank WordPress 7.1: the zip installs, activates and the front page answers 200.

A blank site shows the theme's header and footer from `parts/` with no footer menus (their
navigation blocks carry no `ref` until a seeder or the Site Editor sets one — WordPress then falls
back to the newest `wp_navigation` post,
https://developer.wordpress.org/reference/classes/wp_navigation_fallback/). The pages the theme's
templates are made for — sign in, register, password, account, contact, the blog and list views —
do not exist until they are created with those templates and the post meta described in
docs/content-model.md. The theme alone is the look, not the site.

The theme updates itself once a release manifest is published: `inc/update.php` reads
`wordpress/theme/wp-ja-kinetic/update.json` in `TracyHQ/claude-cowork` about every six hours and
WordPress installs a newer version automatically. No manifest had been published when this theme
was built.

## Quickstart

The WordPress quickstart is released under the tag **`quickstart/ja-kinetic/wp7`** in
`JoomlArt-Products/ja-products`, version **1.0.0**, as the pair
`ja-kinetic-wp7-webroot-1.0.0.tar.gz` (the webroot) and `ja-kinetic-wp7-database-1.0.0.sql.gz`
(the database, table prefix `tr_`), with `manifest.json`, `SHA256SUMS`, `VERIFICATION.json` and a
`README.md` whose "Restore by hand" section is the authoritative command list. In short: untar into
the webroot, replace the four `{{DB_*}}` placeholders in `wp-config.php`, import the SQL, then
`wp search-replace '<placeholder url>' '<site url>' --all-tables --precise`,
`wp core verify-checksums`, set a password on the administrator `tracyadmin` (no account ships with
a usable password), `wp rewrite flush`. The webroot carries AcyMailing, active.

Hashes, sizes and content counts are in that release's `manifest.json` and `SHA256SUMS`, not here.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # wp-ja-kinetic
wp plugin list --status=active --fields=name,version     # acymailing
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # header, footer shadow the files
wp post list --post_type=wp_navigation,wp_block --fields=ID,post_name,post_type
wp option get wp_ja_kinetic_redirects --format=json
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host.
Never run a `search-replace`, an import or a theme update against a site you have not identified.
