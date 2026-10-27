# Content API and publication

Read ../AGENTS.md. Confirm origin and locale, read published state and any draft,
make the smallest change, reject concurrent revisions and publish only when requested.
Do not port Joomla API actions or perform routine content edits through SQL.

## Entry points (EmDash 0.37)

| Entry point | Use |
| --- | --- |
| `/_emdash/admin` | Editors: forms per collection, menus, taxonomies, media, form submissions |
| REST `/_emdash/api/...` | Automation. Header `Authorization: Bearer <PAT>` and `X-EmDash-Request: 1` |
| MCP `POST /_emdash/api/mcp` | JSON-RPC over SSE, same token |

Tokens are Personal Access Tokens (`ec_pat_…`). The agent token minted by bootstrap has admin scope and
lives in `data/tracy-agent.token`; it is installation state, never copied into source or logs.

## Identity and publication rules

- Read: `GET /_emdash/api/content/<collection>/<id-or-slug>?locale=en` returns `{item, _rev}`. `item.data`
  overlays the current draft; `item.liveData` is what the public site shows.
- Write: `PUT …/<id>?locale=en` with `{data, _rev}` writes a **draft** and merges the given fields. A stale
  `_rev` is rejected — re-read and retry, never overwrite blindly.
- Publish: `POST …/<id>/publish?locale=en` is required for the public page to change. Proof of an edit is
  the public page, not the REST read (which overlays the draft).
- In templates, `entry.id` of a live-collection entry is the slug; the database id is `entry.data.id`.
- Slug caveat measured on 0.37: a slug equal to an API sub-route (for example `authors`) is shadowed by
  that route on `GET /content/<collection>/<slug>`; use the database id for such entries.
- Media: `POST /media/upload-url` → `PUT <uploadUrl>` → `POST /media/<id>/confirm`. SVG is not an allowed
  upload type.
- Datetime fields must be ISO 8601 on every write.

## Seed receipts (`tools/seed-apply.mjs`)

The seed is a baseline. `seed-apply` records what it wrote in `data/seed-receipts.json` and reconciles:
unchanged → `same`; seed changed and site untouched → `update` (+ publish); editor changed → `editor`
(kept); both changed → `conflict`, exit 3, nothing written. An entry without a receipt is adopted only
when its live content equals the seed. `--force` resolves conflicts in favour of the seed and is never
passed automatically; `--force-all` also resets editor changes. `--dry-run` shows the plan.

Changing a field's storage type (for example text → Portable Text) is refused by the schema API when the
column type changes; on a site with editor content that is a migration, not a seed-apply run.
