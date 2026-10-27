# Checks and recovery

Identify the site first (docs/install.md). Checks that need only the site:

| Check | Command |
| --- | --- |
| Theme active, version | `wp theme list --status=active` |
| Routes answer | `curl -s -o /dev/null -w '%{http_code}' <site>/` for `/`, `/about/`, `/donations/`, `/contact/`, `/pages/user/login-form/`; an unknown path answers 404 |
| Redirects | `wp option get wp_ja_impact_redirects --format=json` |
| Menus | `wp post list --post_type=wp_navigation --fields=ID,post_title` (six) |
| Contact form | `wp post list --post_type=wpcf7_contact_form` (the form "Contact") |
| Dark switch | load a page with cookie `tracy_theme=dark`: `<html data-theme="dark">` |
| PHP errors | `wp-content/debug.log` has no fatal from the theme |

Backup before a structural change: `wp db export backup.sql` and a copy of `wp-content/uploads`.
Restore: `wp db import backup.sql` and put the uploads back. The quickstart is the site as built, not
a rollback target for an edited site.

Theme updates: the theme has no update offer; install a newer zip over it
(`wp theme install <zip> --force`). The `header` and `footer` rows in the database keep the owner's
edits and shadow the new files; delete the row in the Site Editor (Clear customizations) to take the
new file.

Not verified here: outbound mail of the contact form (the build stand has no mail route).
