# Installation

DOCS_REQUIRED: Give the pins from style.css (Requires at least, Tested up to, Requires PHP),
the plugins the site needs and why, the quickstart the site restores from and its exact
restore commands, and how to identify a site before modifying it.

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty
site — no content comes with a theme; WordPress keeps pages, menus and options in the
database, https://developer.wordpress.org/themes/patterns/starter-patterns/), or **the
quickstart** — a webroot archive plus a database dump that restore into a complete site.

## Theme alone

```sh
wp theme install <theme>.zip --activate      # or Appearance > Themes > Add New > Upload
wp theme list --status=active
```

The zip holds one folder named by the slug; `style.css`, `theme.json` and `templates/index.html`
are the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).
Activate the plugins listed below before seeding content that references them.

## Quickstart

The pair `<id>-webroot-<version>.tar.gz` + `<id>-database-<version>.sql.gz` ships with
`manifest.json`, `SHA256SUMS`, `VERIFICATION.json` and a `README.md` whose "Restore by hand"
section is the authoritative command list. In short: untar into the webroot, replace the four
`{{DB_*}}` placeholders in `wp-config.php`, import the SQL, then
`wp search-replace '<placeholder url>' '<site url>' --all-tables --precise`,
`wp core verify-checksums`, set the admin password (none ships), `wp rewrite flush`.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version
wp plugin list --status=active --fields=name,version
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # what shadows the theme's files
wp db size
```

Local stands run behind Docker on loopback; a fleet site is reached through its host. Never
run a `search-replace`, an import or a theme update against a site you have not identified.
