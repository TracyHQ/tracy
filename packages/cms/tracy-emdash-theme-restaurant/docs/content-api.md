# Content API and publication

Entry points on the pinned CMS (emdash 1.1.0): the admin (`/_emdash/admin`), the REST API
(`/_emdash/api/content/<collection>/<slug-or-id>?locale=<l>`, `.../<id>/publish?locale=<l>`) and the native MCP endpoint
`/_emdash/api/mcp` (discover its tools and schemas on the target; do not invent names). REST calls carry
`Authorization: Bearer <data/tracy-agent.token>` and the header `X-EmDash-Request: 1` (without it a write is
`CSRF_REJECTED`). The token is the resident agent's, scoped to that site; it is installation state, never logged or shipped.

Identity: REST `GET` by slug returns `data.item.id`, the ULID that admin URLs and the publish route use. In the Astro live
collections the entry id is the slug and the ULID is `entry.data.id` — the opposite; keep them apart. `liveData` is the
published baseline, `item.data` may overlay a draft, `_rev` takes part in conflict detection. A PUT writes a draft; only
the publish call changes the public page.

Read ../AGENTS.md. Confirm origin and locale, read published state and any draft,
make the smallest change, reject concurrent revisions and explicitly publish only
when requested. Do not port Joomla API actions or perform routine content edits
through SQL. Document seed receipt/adopt/conflict behavior without automatic force.

## Tracy's Content API and provenance stamps

`seed/content-api-map.json` has one row per collection of `seed/site-model.json` (21): `pages` is type `page` and `posts`
type `article` (neither carries a URL pattern: the router decides, `src/pages/[...path].astro`); the section collections
(`slideshow`, `hero`, `features_intro`, `menu`, `tabs`, `testimonials`, `statistics`, `teams`, `timeline`, `opentime`,
`opentable`, `happyhours`, `masthead`, `banner`, `category_info`, `contact`, `reservation`, `subscribe`) are `generic`; the
`chrome` entry is the shared header/footer entry. `tools/content-api-gate.mjs` refuses a collection without a row. The image
builds the reader on `TRACY_CONTENT_API_SCALARS` (the Dockerfile sets it to 1): it reads entry scalars, not rich blocks.

Provenance stamps (`src/lib/stamps.ts`, `PageOwner.astro`, the `Prose*` renderers) mark which entry and field printed an
element, only on a request carrying `X-Tracy-Preview: pick` (set by Tracy's proxy after it verified a ticket). Views stamp
titles, descriptions, section fields, repeater rows and Portable Text blocks. Deliberately unstamped: menus (derived from
the menu structure, not a field), template words from `ui-words.ts` (not content), formatted dates (computed from a value),
the image census elements of carousels' clones, and derived counts. The stamp format is shared with the other platforms: do
not change it here alone.

Where each entry is served: `pages` and `posts` carry `urlField: "path"`, a data field holding the entry's own public path
(`/explore/j-pages/<slug>`, `/<category>/<slug>`: not a function of the slug, so `urlPattern` stays null). A page record
also lists the section entries its view prints in `sections` (`{collection, entry}`), and the four list routes
(`/blog`, `/gallery`, smart search, tagged items) have a `pages` record of view `list`, so every section entry reaches a
page. Tracy's picture inventory therefore resolves all picture bindings (Apply also personalizes the words, as for the other templates, with `seed/personalize.json` and the answers to `seed/questions.json`; a picture is placed only where a page and field are bound) (`tests/picture-bindings.test.mjs`) and "Apply"
in Add site places demo pictures. The router is unchanged and the paths are the same as before, so no redirect is needed.
`ingest/bind-paths.mjs` writes these fields into `seed/site-model.json`; the sitewide chrome and the Subscribe box are not
listed. A new route or a view that prints another section entry is a change to that script's table and a seed rebuild.
