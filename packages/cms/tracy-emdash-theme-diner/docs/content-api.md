# Content API and publication

Entry points on the pinned CMS (emdash 1.1.0): the admin (`/_emdash/admin`), the REST API
(`/_emdash/api/content/<collection>/<slug-or-id>?locale=<l>`, `.../<id>/publish?locale=<l>`) and the native MCP endpoint
`/_emdash/api/mcp` (discover its tools and schemas on the target; do not invent names). REST calls carry
`Authorization: Bearer <data/tracy-agent.token>` and the header `X-EmDash-Request: 1` (without it a write is
`CSRF_REJECTED`). The token is the resident agent's, scoped to that site; it is installation state, never logged or shipped.

Identity: REST `GET` by slug returns `data.item.id`, the ULID that admin URLs and the publish route use. In the Astro live
collections the entry id is the slug and the ULID is `entry.data.id`: the opposite; keep them apart. `liveData` is the
published baseline, `item.data` may overlay a draft, `_rev` takes part in conflict detection. A PUT writes a draft; only
the publish call changes the public page.

Workflow: confirm origin and locale (`en` only), read the published state and any draft, make the smallest change,
reject concurrent revisions and publish explicitly, only when requested. Routine content edits never go through SQL.
Seed receipts: `tools/seed-apply.mjs` records what it wrote in `data/seed-receipts.json`. A rerun keeps what an editor changed and exits 3 when seed and editor both changed an entry; `seed-apply.mjs adopt` claims entries whose live data already equals the seed, without writing; `--force` is explicit and never automatic.

## Tracy's Content API and provenance stamps

`seed/content-api-map.json` has one row per collection of the model (14): `pages` is type `page` and `posts` type
`article` (neither has a URL pattern: the router decides, `src/pages/[...path].astro`); `chrome` is type `shared` (the
header/footer entry); the others (`slideshow`, `features_intro`, `container_tabs`, `menu`, `happyhours`, `teams`,
`modules`, `masthead`, `category_info`, `contact`, `reservation`) are `generic`. `tools/content-api-gate.mjs` refuses a
collection without a row. The image builds the reader on `TRACY_CONTENT_API_SCALARS` (the Dockerfile sets it to 1): it
reads entry scalars, not rich blocks.

Provenance stamps (`src/lib/stamps.ts`, `src/components/site/PageOwner.astro`, the `Prose*` components) mark which entry
and field printed an element, only on a request carrying `X-Tracy-Preview: pick` (set by Tracy's proxy after it verified
a ticket). Views stamp titles, descriptions, section fields, repeater rows and Portable Text blocks. Deliberately
unstamped: menus (derived from the menu structure, not a field), template words from `ui-words.ts` (not content),
formatted dates (computed from a value) and derived counts. The stamp format is shared with the other platforms: do not
change it here alone.

Where each entry is served: `pages` and `posts` carry `urlField: "path"`, a data field holding the entry's own public
path (`/<category>/<slug>` for a post: not a function of the slug, so `urlPattern` stays null). `ingest/bind-paths.mjs`
writes these fields into `seed/site-model.json`; a new route or a view that prints another section entry is a change to
that script's table and a seed rebuild.
