# JA Diner: instructions for agents

Read this before changing anything. It describes the **installed WordPress site and its theme**,
not the Tracy skill (`tracy-wordpress-theme`) that produced them.

Theme **WP Diner**, slug and text domain `wp-ja-diner`, version 1.0.0 (`style.css`). Requires
WordPress 7.0 and PHP 8.1; built on WordPress 7.1.3. The site is "JA Diner", a restaurant demo,
ported from the JoomlArt JA Diner Joomla 6 (T3) quickstart 1.0.4 so that it renders the same pages.
No plugin is required by the theme (docs/install.md).

## Rules

1. A WordPress **block theme**: templates, parts and patterns are files under
   `wp-content/themes/wp-ja-diner/`; the site's words are database rows (docs/architecture.md).
2. Identify the target first: `wp option get siteurl`, `wp theme list --status=active` (expect
   `wp-ja-diner`), the webroot, the process owner. Never assume a localhost stand.
3. Words are edited **through WordPress** (editor, `wp post update`, REST) as block markup: page and
   post content; menus are `wp_navigation` posts by slug (`mainmenu` = header bar, `site-pages` = the
   phone side panel, `usermenu` unused); site name in `blogname`; logos in `site_logo` and
   `tracy_logo_dark`; redirects in option `wp_ja_diner_redirects`. Opening hours, address, phone and
   copyright are in the footer template part (docs/content-model.md).
4. **Do not edit generated files**: `theme.json`, `styles/*.json`, `inspirations.json`, and above all
   `assets/css/source/*.css` (the source template's compiled sheets, written by a port tool with dark
   companions, D-10). Every theme file is replaced whole by the next update; overrides go in the Site
   Editor (database rows) or a child theme.
5. A section is a pattern `wp-ja-diner/acm-*` (Patterns > WP Diner). Inserted, it is a **copy** owned
   by the page. Locate its blocks by `metadata.name` (`<type>.<field>[.<n>]`), never by position.
6. Behaviour hangs on **slugs and paths**, not blocks: the listing pages `our-blog`, `tagged-items`,
   `fetured-articles` (sic), `all-categories`; the draft `smart-search`; the four Content pages under
   `/content/` (D-36, 301 from `/joomla-content/*`); `j-pages/login`, `j-pages/registration`,
   `password-reset`, `username-reminder-request`, `contact-us`. Read docs/content-model.md before
   renaming, moving or publishing a page.
7. Dark mode: the source has none; the dark palette is derived (D-03). Cookie `tracy_theme` holds the
   choice, applied as `html[data-theme="light|dark"]`; no attribute = auto, the OS decides.
8. The Subscribe form only draws (G1: core has no mailing list). Contact, registration and reminder
   forms post to `admin-post.php` handlers in `inc/groups/account.php` and mail through `wp_mail`: the
   host needs a mail route.
9. Do not fabricate business facts, people, prices, addresses or images. All of it is demonstration
   data until the owner replaces it; a gap is recorded, not filled (docs/content-rules.md).
10. Back up before a structural change (`wp db export`, `wp-content/uploads`). The theme gets no update
    offer until its manifest is published; install a newer zip by hand (docs/checks-and-recovery.md).
11. Report separately: file changes, database changes, checks run, what could not be verified.

## Read the relevant document before work

| Task | Document |
| --- | --- |
| Folders, file vs database, how a request is answered | docs/architecture.md |
| Install the theme, identify a site | docs/install.md |
| Where each kind of text lives; sections; menus; options; redirects | docs/content-model.md |
| Owner decisions, demo data, provenance, open gaps | docs/content-rules.md |
| Tokens, source stylesheets, fonts, dark mode, logos, what not to edit | docs/design-system.md |
| Checks by command, backup, restore, theme updates, known limits | docs/checks-and-recovery.md |

docs/generated/inventory.md (from the theme's **files**, by `generate-docs.mjs`) lists templates,
parts, patterns, assets and options; it is not a live inventory of this database.
