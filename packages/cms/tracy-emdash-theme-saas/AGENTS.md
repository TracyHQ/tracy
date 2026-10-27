# Installed template: agent instructions

This is **Tracy SaaS** (`template.config.json` id `tracy-saas`), Tracy's EmDash template for a
SaaS/product site: three home variants (Terminal, Blueprint, Signal), feature, pricing, company and
landing pages composed from editable sections, and a blog with categories, tags, authors, archive and
search. Demo content is "Helix", a fictional observability product, in English. The design was ported
from the JA Kinetic Joomla 6 quickstart 1.0.0 (see docs/content-rules.md for what that means for release).

Runtime: EmDash 1.1.0 on Astro 7.0.0 with the `@astrojs/node` standalone adapter, SQLite storage, Node
>= 22.16 (built and tested on 24.11.1), pnpm with the committed `pnpm-lock.yaml`. It is a standalone pnpm
project: install inside this directory.

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
