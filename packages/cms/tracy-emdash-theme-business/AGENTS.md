# Tracy Business: instructions for agents

Read this file before installing or changing this package. It describes the installed
site, not the separate Tracy skill that converts a new HTML design into a template.
Product identity: Tracy Business / tracy-business / @tracy/emdash-theme-business.
Northgate is the supplied site content. Keep it without adding demo disclaimers.

## Rules

1. This is a standalone Astro SSR application with EmDash, not a Joomla template
   directory or a package that is necessarily uploadable through an existing CMS.
   Read docs/architecture.md before changing its structure.
2. Identify the target directory, origin, runtime and process owner before commands.
   Never stop another site's process or use an implicit localhost destination.
3. Follow README.md and tools' actual argument parsing for installation commands.
   Read docs/install.md first. Never run clean-install against an existing site.
4. Content belongs in EmDash. Edit through the admin or supported authenticated
   APIs; do not edit SQLite directly or replace the database to change a page.
   Read docs/content-api.md before automated writes.
5. Preserve editor drafts and revisions. PUT is not publication. Read liveData,
   detect drafts/revision conflicts and publish only the intended change.
6. Seed is an installation baseline, not the current site's source of truth.
   Never bootstrap with --force or use --force-all as routine maintenance.
7. Keep EN at root and every other locale under /<locale>, using native EmDash i18n
   and linked translations. Forty ship since 1.2.0. Do not install a competing
   translation plugin. Read docs/languages.md.
8. Use Tailwind semantic tokens and existing shadcn primitives. Keep storefront CSS
   out of EmDash admin and Tracy/dsh. Never edit generated dist output.
9. Keep source assets and supplied PDFs. Do not invent a download, business fact,
   legal paragraph, testimonial or translation. Read docs/content-rules.md.
10. Use the real Forms submission flow. Do not replace it with a cosmetic success
    message. SMTP credentials and recipients are deployment-specific.
11. Never ship runtime databases, uploads containing customer data, tokens, .env,
    backups or *.before-restore-* directories as template source. Read
    docs/checks-and-recovery.md before packaging, backup or restore.
12. Do not expose this file or docs through public/ or src/pages/. Documentation is
    for filesystem-access agents, not public website content.
13. Report separately: source changes, installed changes, tests actually run and
    unresolved limits. A local fixture pass is not a production acceptance result.

## Read the relevant document before work

Source-derived schema, baseline counts, dependency pins and route-file inventory:
docs/generated/inventory.md. Regenerate with `node tools/generate-docs.mjs` after
source changes. `node tools/generate-docs.mjs --check` is the read-only documentation
gate when validation is authorized. This does not overwrite authored guidance.

| Task | Document |
| --- | --- |
| Understand folders, rendering and plugin boundaries | docs/architecture.md |
| Install a new site or prepare runtime configuration | docs/install.md |
| Find collections, menus and content ownership | docs/content-model.md |
| Use admin/API safely, protect drafts | docs/content-api.md |
| Change layout, tokens, components or interaction | docs/design-system.md |
| Change a locale or add another | docs/languages.md |
| Apply owner decisions and handle missing assets | docs/content-rules.md |
| Acceptance, export, backups and recovery | docs/checks-and-recovery.md |

The executable definitions are template.config.json, astro.config.mjs, seed/ and
tools/. These documents explain their boundaries; they do not override the code.
Do not assume an example's IDs, origins or form IDs identify the installed site.
