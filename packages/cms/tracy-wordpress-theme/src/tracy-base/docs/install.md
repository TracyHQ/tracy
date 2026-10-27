# Installation

Read ../AGENTS.md. Two ways in: **the theme alone** onto an existing WordPress (an empty site —
no content comes with a theme; WordPress keeps pages, menus and options in the database,
https://developer.wordpress.org/themes/patterns/starter-patterns/), or **the quickstart
`tracy-base/wp7`** — a webroot archive plus a database dump that restore into the complete
Tracy site.

## Pins

| | |
| --- | --- |
| Requires at least | WordPress 7.0 |
| Tested up to | WordPress 7.1 (the quickstart was built on 7.1) |
| Requires PHP | 8.1 (the quickstart was built on 8.3) |
| Plugin | Contact Form 7 (the quickstart ships 6.1.7, active). The contact page prints `[contact-form-7 id=… title="Contact"]`; without the plugin the shortcode prints as text |
| Table prefix | `tr_` in the quickstart |
| Permalinks | `/%postname%/` |

## Theme alone

```sh
wp theme install tracy-base.zip --activate      # or Appearance > Themes > Add New > Upload
wp plugin install contact-form-7 --activate
wp theme list --status=active                   # tracy-base
```

The zip holds one folder `tracy-base/`; `style.css`, `theme.json` and `templates/index.html` are
the required files (https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/).
The theme then updates itself: `inc/update.php` reads the release manifest in
`TracyHQ/claude-cowork` (`wordpress/theme/tracy-base/update.json`) about every six hours and
WordPress installs a newer version automatically. An empty site shows the header and footer from
`parts/` with no menu (the navigation blocks carry no `ref` until a seeder or the Site Editor sets
one — WordPress then falls back to the newest `wp_navigation` post,
https://developer.wordpress.org/reference/classes/wp_navigation_fallback/).

## Quickstart

Assets, consumed as a pair (`manifest.json` carries their sizes and sha256, `SHA256SUMS` too):

- `tracy-base-wp7-webroot-1.0.0.tar.gz` — the webroot, `wp-config.php` with `{{DB_NAME}}`
  `{{DB_USER}}` `{{DB_PASSWORD}}` `{{DB_HOST}}` placeholders and fresh salts
- `tracy-base-wp7-database-1.0.0.sql.gz` — the database, every address written as
  `https://quickstart.invalid`, every password blank

The release `README.md` is the authoritative command list; in short:

```sh
mkdir site && tar -xzf tracy-base-wp7-webroot-1.0.0.tar.gz -C site
# wp-config.php: replace the four {{DB_*}} placeholders, keep $table_prefix = 'tr_'
gunzip -c tracy-base-wp7-database-1.0.0.sql.gz | mysql your_database
cd site
wp search-replace 'https://quickstart.invalid' 'https://your-site.example' --all-tables --precise
wp core verify-checksums
wp user update tracyagent --user_pass='choose-a-password'   # no account ships with a usable password
wp rewrite flush
```

On the Tracy fleet the provisioner does the same through `provision/quickstart.py` (download,
sha256, member check), `provision.sh` (untar, import), `render_wp_config.py` (the four constants)
and `platform/wordpress.sh` (`wp search-replace`, reading the old address from `tr_options.home`).
The Claude Cowork plugin is **not** in the archive; the provisioner installs the current one.

## Identify a site before changing it

```sh
wp option get siteurl && wp option get home
wp theme list --status=active --fields=name,version      # tracy-base
wp plugin list --status=active --fields=name,version     # contact-form-7
wp post list --post_type=wp_template_part,wp_template --fields=ID,post_name,post_type   # header, footer shadow the files
wp post list --post_type=wp_navigation --fields=ID,post_name
wp option get tracy_base_redirects
```

A local build stand runs behind Docker on loopback; a fleet site is reached through its host.
Never run a `search-replace`, an import or a theme update against a site you have not identified.
