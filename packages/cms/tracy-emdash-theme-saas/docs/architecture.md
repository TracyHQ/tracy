# Architecture

Read ../AGENTS.md. generated/inventory.md lists discovered route source files and
declared dependencies, not all effective URLs or active plugins. Dynamic routes are
explained below; the runtime route audit is `tools/audit.mjs` (see checks-and-recovery.md).

This is an EmDash/Astro application, not a Joomla PHP template or a universal upload ZIP.

## Runtime

- `astro.config.mjs`: `output: 'server'`, `@astrojs/node` in `standalone` mode, one locale (`en`),
  Astro Fonts from `src/fonts.json`, Tailwind 4 through `@tailwindcss/vite`.
- EmDash integration: SQLite at `${SITE_DATA_DIR:-./data}/data.db`, local media storage in `./uploads`
  served from `/_emdash/api/media/file/<storageKey>`. Both directories are created at startup.
- Plugins registered in `astro.config.mjs`: `@emdash-cms/plugin-audit-log`, `@emdash-cms/plugin-forms`
  (honeypot spam protection), `emdash-smtp`, and the local `tracy-hreflang` plugin
  (`src/lib/hreflang.ts` descriptor, `src/lib/hreflang-plugin.ts` entrypoint) which emits the
  alternates computed by the layout.
- `src/live.config.ts` declares the EmDash live collection; content is read from the database per request.
- `src/middleware.ts` redirects a trailing slash to the bare path (301), except under `/_emdash/`.

## Route dispatch

One catch-all, `src/pages/[...path].astro`:

1. Composed pages: the `pages` collection is searched for an entry whose **`path` field** equals the
   request path (`src/lib/sections.ts` → `loadPageByPath`). Its `view` field picks the view:
   `category` → `src/views/Blog.astro`, `search` → `Search.astro`, `date` → `Archive.astro`,
   `author` → `Authors.astro`; `/product/all-categories` and `/pages/tags` → `Terms.astro`;
   `/pages/helixql` → `Article.astro` (the page's own body); a page with no sections → `Legal.astro`;
   everything else → `Sections.astro`, which renders the entry's ordered `sections`.
2. Blog shapes without a page entry: `/product/blog/<slug>` (post), `/product/blog/category/<term>`,
   `/product/blog/tag/<term>`, `/product/authors/<author-slug>`.
3. Anything else: `src/views/NotFound.astro` with status 404. `src/pages/404.astro` serves the literal
   `/404` URL, which Astro claims before the catch-all.

Adding a composed page therefore needs no code: create a `pages` entry with a new `path` and its sections.

## Layout, views, components

- `src/layouts/Base.astro`: the only importer of `src/styles/global.css`; sets `data-style` (colour
  direction) and `data-theme` on `<html>`, restores the visitor's theme before paint, builds the EmDash
  page context (canonical, robots, Open Graph) and the hreflang alternates, renders Header and Footer.
- `src/lib/chrome.ts`: header/footer data per request (five menus, `header_cta`, `social`,
  `footerlegal`, `newsletter`).
- `src/views/`: one file per page family (see above).
- `src/components/sections/`: one component per section collection; `registry.ts` maps collection →
  component. Props: `data`, `index`, `style`.
- `src/components/site/`: header, megamenu, drawer, footer. `src/components/islands/`: React islands
  (interactive menus, theme toggle). `src/components/Icon.astro`: named icons (lucide) rendered server-side.

## Source, build output and state

| Kind | Where | In a source distribution |
| --- | --- | --- |
| Source | `src/`, `astro.config.mjs`, `package.json`, `pnpm-lock.yaml`, `seed/`, `tools/`, `ingest/`, `contract/`, `docs/` | yes |
| Build output | `dist/`, `.astro/` | no — rebuilt |
| CMS and media state | `data/` (SQLite, receipts, agent token), `uploads/` | never |
