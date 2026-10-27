# Package architecture

Start at ../AGENTS.md. Tracy Business ships source for a complete EmDash-powered
Astro server application. Installing it provisions an application plus CMS storage;
it is not equivalent to copying a Joomla /templates directory.

```text
AGENTS.md                    Installed-site agent instructions
docs/                        Operational and architecture documentation
README.md                    Command-oriented runbook
PROVENANCE.md                Sources and third-party notices
template.config.json         Product identity, locales, forms and tool policy
artifact.json                Generated artifact metadata and baseline hashes
package.json                 Exact dependency pins and scripts
pnpm-lock.yaml               Standalone dependency lock
astro.config.mjs             SSR adapter, CMS integration and plugins
.env.example                 Environment variable names, never real secrets
src/pages/[...path].astro     Storefront route dispatcher
src/layouts/Base.astro        Shared HTML head and site chrome
src/views/                   Page-family presentation
src/components/site/         Header, footer, breadcrumbs and shared markup
src/components/islands/      Client-interactive React components
src/components/ui/           Committed shadcn primitives
src/components/kit/          Marketing-kit presentation
src/styles/                  Tailwind tokens and storefront styles
src/lib/                     Content/chrome, locale and metadata helpers
src/plugins/                 Local plugin implementation, where applicable
src/live.config.ts           Live collection configuration
seed/                        Initial schema, content and media mappings/assets
tools/                       Installation, import, backup and audit tooling
tests/                       Tool safety and regression fixtures
```

## Runtime, not distributable customer state

node_modules/ contains installed dependencies. dist/ is generated client/server
output. data/ contains CMS database and tool receipts; uploads/ contains uploaded
media. Their locations depend on runtime configuration. Environment files, tokens,
evidence, backups and before-restore copies are not reusable template content.

## Request flow

Astro and the EmDash integration serve the application. The storefront catch-all
selects locale and page family, reads published CMS content, renders a view and
wraps it in Base.astro. Admin/API routes belong to EmDash, not the catch-all.
React islands handle selected interactions; the whole site is not a React SPA.

The CMS owns entries, drafts, publication, translation links, media and submissions.
The template owns presentation, route conventions and its content model. Core
i18n/search/metadata are distinct from installed Forms, Audit Log and SMTP plugins.
Use astro.config.mjs and the lockfile for exact installed versions and registration.

Do not copy Joomla concepts such as module positions, T4 layouts, PHP overrides,
com_claudecowork actions or T4 cache commands into this application. Their nearest
equivalents here are Astro components/layouts, CMS collections/menus and native APIs.

## Provenance stamps (Tracy preview only)

Tracy's comment picker needs to know which entry and field printed an element. EmDash
runs no Claude Cowork plugin, so the views print it themselves: `src/lib/stamps.ts`
turns an entry into `data-tracy-src="emdash:<collection>:<entry id>:<slug> field:<key>"`
(`field:<repeater>.<subfield>` in a repeater row, `block:<repeater>` on the row), and
`PageOwner.astro` puts `<template data-tracy-owner="emdash:…">` first in `<main>`. They
render only when the request carries `X-Tracy-Preview: pick`, which Tracy's site proxy
sets after verifying a preview ticket and strips from browsers; the middleware then
marks the answer `Cache-Control: private, no-store`. Every other request gets the page
without a single stamp. A view that prints a new field should stamp it the same way;
menus and taxonomy labels carry none (the Content API does not project them).

React islands redraw their DOM on hydration, so a stamp in the server HTML alone would
vanish: the Astro side passes stamps as a `marks` prop built with `islandMarks()`, and
the island spreads them on its own elements (`{...p.marks?.title}`). `islandMarks()`
returns `{}` on an ordinary request, so no island gets a new prop there. The mega panel
stamps its site-chrome titles and the recent projects/posts it lists; the phone drawer
its site-chrome labels and the quote button; the language menu nothing (its names are
template words from `src/lib/locale-words.ts`, its links are routes).

Keep stamps off an element with no `class` of its own inside a component that has a
`<style>` block: Astro then merges its scoped class into the spread object, which fails on
the frozen empty object an ordinary request gets (measured in Tracy Base's `SampleFrame.astro`;
`Topbar.astro`, the only such component here, stamps classed elements only).
