# Installed template: agent instructions

Template `tracy-restaurant` ("JA Restaurant", npm `@tracy/emdash-theme-restaurant` 1.0.1): a port of the Joomla/T3 template JA Restaurant j6 1.0.6. Runtime: EmDash 1.1.0, Astro 7.3.3 (SSR, Node standalone adapter), Tailwind 4.3.3, Node >= 22.16, SQLite in `data/` and media in `uploads/`. One locale (`en`). Every page family of the source is built (Home, Blog and category lists, post detail, Chefs, Gallery with albums, About us, Our History, Menu in four styles, Offers, Phone Reservation, Contact, Search, Tagged Items, 404).

Read docs/architecture.md before changing the application. Use docs/install.md for
an empty-target install and docs/content-api.md before touching CMS state. Identify
the exact target origin, data directory and process owner; preserve other sites.

Authored guidance lives in docs/*.md. Source inventory lives in
docs/generated/inventory.md and is regenerated with node tools/generate-docs.mjs.
It is not a live database inventory. The generator does not overwrite this file.

| Work | Read first |
| --- | --- |
| Structure and routes | docs/architecture.md |
| Install and authentication | docs/install.md |
| Collections and menus | docs/content-model.md |
| Safe edits and publication | docs/content-api.md |
| Components and styling | docs/design-system.md |
| Locales and translations | docs/languages.md |
| Owner decisions and missing material | docs/content-rules.md |
| Acceptance, export and recovery | docs/checks-and-recovery.md |

Use supported CMS APIs for content, retain drafts and revision checks, and publish
only the intended edit. Seed is a baseline, not authority over an editor's site.
Keep storefront CSS isolated from admin/host UI. Keep runtime data and secrets out
of source distributions, and these instructions outside public/ and src/pages/.
