# JA Restaurant: instructions for agents

Read this before changing anything. It describes the **installed WordPress site and its theme**,
not the Tracy skill (`tracy-wordpress-theme`) that produced them.

Theme **WP Restaurant**, slug and text domain `wp-ja-restaurant`, version 1.0.0 (`style.css`). Requires
WordPress 7.0 and PHP 8.1; built on WordPress 7.1.3. The site is "JA Restaurant" (the demo restaurant
"RES Bar & Restaurant"), ported from the JoomlArt JA Restaurant Joomla 6 (T3) quickstart 1.0.6 so it
renders the same pages. No plugin is required by the theme (docs/install.md).

## Rules

1. This is a WordPress **block theme**: templates, parts and patterns are files under
   `wp-content/themes/wp-ja-restaurant/`; the site's words are rows in the database (docs/architecture.md).
2. Identify the target first: `wp option get siteurl`, `wp theme list --status=active` (expect
   `wp-ja-restaurant`), the webroot and the process owner. Never assume a localhost stand.
3. Words are edited **through WordPress** (editor, `wp post update`, REST) as block markup: page and post
   content; menus are `wp_navigation` posts (`mainmenu` is read by the header's two Navigation blocks
   named `nav.mainmenu`); site name in `blogname`; logos in `site_logo` and `tracy_logo_dark`; redirects in
   option `wp_ja_restaurant_redirects`. Header and footer text are template parts (docs/content-model.md).
4. **Do not edit generated files**: `theme.json`, `styles/*.json`, `inspirations.json`, and above all
   `assets/css/source/*.css` (the source template's own sheets carried rule for rule with dark
   companions by a port tool, D-10). Every theme file is replaced whole by the next update; overrides go
   in the Site Editor (database rows) or a child theme.
5. A section is a pattern `wp-ja-restaurant/acm-*` (Patterns > WP Restaurant). Inserted, it is a
   **copy** owned by the page. Locate its blocks by `metadata.name` (`<type>.<field>[.<n>]`), never by
   position (docs/content-model.md).
6. Some behaviour hangs on **slugs and options**, not blocks: the listing pages (`blog`, `gallery`,
   `tagged-items`, `featured-articles`, `all-categories`), the draft `smart-search` page, the draft
   `page-not-found` named by `wp_ja_restaurant_404_page`, the paths of the account and contact pages.
   Read docs/content-model.md before renaming, moving or publishing a page.
7. Dark mode: the source has none; the dark palette is derived (D-03). The `tracy_theme` cookie holds
   the choice, applied as `html[data-theme="light|dark"]`; no attribute = auto, the OS decides.
8. The Subscribe box delivers nothing (no mailing list in core, D-07). The contact, registration and
   reminder forms post to the theme's `admin-post.php` handlers and send through `wp_mail`: they need a
   mail route on the host.
9. Do not fabricate business facts, people, prices, addresses or images. Everything on the site is
   demonstration data until the owner replaces it; a gap is recorded, not filled (docs/content-rules.md,
   open decisions D-02, D-03, D-07, D-08, D-09, D-10).
10. Back up before a structural change (`wp db export`, `wp-content/uploads`). The theme gets no update
    offer until its manifest is published; install a newer zip by hand (docs/checks-and-recovery.md).
11. Report separately: file changes, database changes, checks run, what could not be verified.

## Read the relevant document before work

| Task | Document |
| --- | --- |
| Folders, what is file vs database, how a request is answered | docs/architecture.md |
| Install the theme, identify a site | docs/install.md |
| Where every kind of text lives; sections; menus; options; redirects | docs/content-model.md |
| Owner decisions, demo data, provenance, open gaps | docs/content-rules.md |
| Tokens, generated stylesheets, dark mode, logos, what not to edit | docs/design-system.md |
| Checks by command, backup, restore, theme updates, known limits | docs/checks-and-recovery.md |

docs/generated/inventory.md (written by `generate-docs.mjs` of the skill from the theme's **files**)
lists templates, parts, patterns, assets and options; it is not a live inventory of this database.
