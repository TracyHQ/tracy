# Safe admin and API changes

Read ../AGENTS.md. Use the EmDash admin for interactive edits or the supported
authenticated API/MCP interface for automation. The native MCP endpoint is
/_emdash/api/mcp; discover the available tools and schemas on the target version.
Do not invent tool names or treat Joomla's Cowork API as compatible.

## Safe write sequence

1. Confirm exact origin, collection, locale, entry identity and token permissions.
2. Read the entry and its publication/draft state. Preserve the current revision.
3. If another editor has a draft or the revision changed, stop with a conflict;
   never silently merge an entire draft into published content.
4. Construct the smallest intended change using the correct published baseline.
5. Submit through the supported revision-aware operation. Explicitly publish only
   if publication is intended and the conflict checks still permit it.
6. When verification is authorized, check the public page and record the result.

REST on the pinned 0.37: `GET|PUT /_emdash/api/content/<collection>/<slug-or-id>?locale=<l>`
and `POST /_emdash/api/content/<collection>/<id>/publish?locale=<l>`, with
`Authorization: Bearer <data/tracy-agent.token>` and the header `X-EmDash-Request: 1`
(without it every write is `CSRF_REJECTED`). `GET` by slug returns `data.item.id`, the ULID
that admin URLs (`/_emdash/admin/content/<collection>/<id>?locale=<l>`) and the
publish route use. Privileged REST `item.data` can overlay a draft; `liveData` is the
published baseline and `_rev` participates in conflict detection. PUT creates/updates
a draft rather than automatically publishing. In the Astro *live collections* the
entry id is the slug and the ULID sits in `entry.data.id` — the opposite of REST; keep
the two apart. Revisit these assumptions when upgrading the CMS instead of copying
them indefinitely.

The importer implements receipt/resume, adopt and conflicts. Exit 3 requires a
decision, not an automatic force retry. Adopt only equal content; --force resolves
conflicts intentionally and --force-all is a broad destructive reset, not upkeep.

Keep PATs secret and narrowly scoped. data/tracy-agent.token is installation state,
not a distributable credential. Never log its contents. The setup helper's initial
credential bootstrap is not permission to use SQL for ordinary edits. Do not
promise global undo: use recorded targeted reversions or a coordinated backup.
