# Installed template: agent instructions

DOCS_REQUIRED: Identify this template and its supported runtime from package/config.

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
