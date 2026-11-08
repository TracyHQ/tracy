# Architecture

Template `tracy-diner` (label "JA Diner", `template.config.json`): a port of the Joomla/T3 template JA Diner j6 1.0.5 to
EmDash 1.1.0 on Astro 7.3.3, Tailwind 4.3.3, shadcn 4.21.0 (`package.json`). Read `../AGENTS.md` first. This is an
EmDash/Astro application, not a Joomla template, and not a universal upload ZIP.

## Runtime and storage

- `astro.config.mjs`: `output: 'server'`, adapter `@astrojs/node` (`standalone`); start with `node ./dist/server/entry.mjs`.
- Source, build output and CMS state are three different things. Source: `src/`, `seed/`, `tools/`. Build output: `dist/`, `.astro/`
  (ignored). CMS state: SQLite at `./data/data.db` and media in `./uploads` (served at `/_emdash/api/media/file/<key>`);
  both are ignored and created at first boot.
- One locale (`en`), the default never prefixed (`src/lib/i18n.ts`). `src/middleware.ts` redirects a trailing slash to the bare path.

## Routing

- `src/pages/[...path].astro` is the only router: `/` renders `src/views/Home.astro`, a `pages` entry renders `Page.astro`, a `posts`
  entry renders `Post.astro`, `/our-blog` renders `BlogList.astro`; anything else answers 404 with chrome (`NotFound.astro`).
  `src/pages/404.astro` answers the literal `/404`.
- Every view is wrapped by `src/layouts/Base.astro`, the only place `src/styles/global.css` (Tailwind) is imported; the admin
  at `/_emdash/admin` never loads it.

## Where the pieces come from

- Content is entries in the collections of `seed/seed.json` (compiled from `seed/site-model.json`, see `docs/content-model.md`);
  the header menu is the `primary` menu; the footer columns are `modules` entries.
- Which section entries a page prints is code (`DECISIONS.md` D5).
