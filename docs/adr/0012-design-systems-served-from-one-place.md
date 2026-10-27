# ADR 0012 — The 152 design systems are served from ONE place: the public page's static files

- **Date**: 2026-09-08
- **Status**: binding
- **Decided by**: Lee ("when I want to add more layouts, or fine-tune one or more design
  systems, I only want to do it in one place" — 07/09 23:5x; "ok do it")
- **Partly supersedes**: [ADR 0011](0011-public-design-inspiration-page.md) §Consequences, the item "Assets
  of the 152 systems" — the copy in the image is no longer the serving source.

## Context

By 07/09 the 152-design-system library had **two serving copies**, both cut from `vendor/tracy/od-design-system`:
one in the lane image (`/opt/tracy/design-systems`, the host plugin reads the files), the other the static files of
`cowork-web` (the public page, copied at build time). Two different release paths (image + update-lane
on every lane · Worker deploy), so one design system fix was three tasks and the two copies could drift. The Brutalism bug
of 07/09 (yellow button with white text · prices poured into the number cell of the component table) showed the cost: one bug visible
on one chip, once fixed, had to go through three release paths.

## Decision

1. **The only place serving the library at run time is `cowork-web`'s static files** under
   `cowork.tracy.ai/design-inspiration/`: `data/manifest.json` (`vendorCommit`), `data/catalog.json`
   (with `library: {url, commit}`), `systems/<id>/{components.html, tokens.css, DESIGN.md, slots.json,
   system/artifacts/<kind>.html, artifact-slots/<kind>.json}`. Public, open to every origin, cached
   for one year when the address carries `?v=<commit>`, the manifest always revalidated.
2. **The host plugin on a lane reads the library over HTTP** (`libraryUrl`, defaulting to the address above), with a disk cache
   `$DSH_HOME/design-library/<commit>/`, re-asking for the manifest every minute while the tab is open: once the Worker is deployed,
   a running lane sees the new version without a restart. The catalog the host returns carries `library` so **the browser
   loads the 152 systems' files directly** from the page; the customer's `brand:<host>` stays on the lane.
3. **Six artifacts + the typography specimen are prebuilt during `build-assets`** by the brand engine, with the cell map
   measured on that same document — the page and the lane are the same bytes; the lane host now only builds artifacts for
   the customer's brand.
4. **The copy in the image is a fallback**, not a source: with `libraryUrl: false`, or offline with no
   cache yet, the host reads `/opt/tracy/design-catalog.json` as before. That link in the Dockerfile is kept and its
   role stated.
5. **The process for fixing a design system**: edit in `vendor/tracy/od-design-system` (or the engine
   `vendor/tracy/od-brand-engine`, or `build-assets`) → `pnpm design:ship` (build-assets → deploy
   `cowork-web` → re-read the manifest). No image build, no update-lane, no plugin release.

## Consequences

- Still has to go through the lane: the text-fill rules (`fill.mjs`, the plugin client) and the engine for the customer's brand — a release of
  plugin + bundle + update-lane. The two CMSs' theme zips (152 style variations) are still in the image, because the `theme` stage
  installs the zip into the webroot; when the vendor is edited, the two gates `joomla-template`/`wordpress-theme` catch the drift.
- `vendorCommit` is the last commit touching `vendor/tracy/od-design-system`, `vendor/tracy/od-brand-engine`,
  `build-assets.mjs` or `library-brand.mjs` — a change to any of those is a new library.
- The page's assets are larger (49 MB, 2 743 files): engine artifacts replace upstream's 6 KB skeleton.
  Cloudflare assets uploads the changed part, not the whole set again.
- Local dev: `libraryUrl` points to `http://localhost:5178/design-inspiration` (the page package's vite dev),
  `libraryCache` into the session's scratchpad.
- Code: `library-remote.mjs` (host), `library-url.mjs` (client + page), `library-ids.mjs`
  (site-build), `libraryHeaders` (cowork-web). Plan: `tasks/todo-thu-vien-mot-cho.md`.
