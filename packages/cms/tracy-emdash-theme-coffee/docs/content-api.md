# Safe admin and API changes

Read ../AGENTS.md first. The admin (`/_emdash/admin`) is the normal way to edit. Automated writes
go through the Admin API with the resident agent's token (`data/tracy-agent.token`, mode 600):

```
Authorization: Bearer <token>
X-EmDash-Request: 1
```

Measured on EmDash 0.37:

| Step | Route | Note |
|---|---|---|
| Read | `GET /_emdash/api/content/<collection>/<slug or id>?locale=en` | envelope `{ success, data: { item, _rev } }`; `item.data` overlays the draft, `item.liveData` is what visitors see |
| Change | `PUT /_emdash/api/content/<collection>/<id>?locale=en` `{ data, _rev }` | **writes a draft**; fields not sent are kept (merge) |
| Publish | `POST /_emdash/api/content/<collection>/<id>/publish?locale=en` `{}` | required after PUT for a visitor to see the change |
| Media | `POST /media/upload-url` → `PUT <uploadUrl>` → `POST /media/<id>/confirm` → `PUT /media/<id> { alt }` | the importer's path (`tools/seed-apply.mjs media`) |
| Forms | `POST /_emdash/api/plugins/emdash-forms/<route>` | JSON only; submissions: `submissions/list` `{ formId }` |

## Safe write sequence

1. `GET` the entry; keep `_rev`.
2. Compare `liveData` with `data`: a difference means an editor has an **unpublished draft** — stop
   and report rather than publishing their draft with yours.
3. `PUT` only the fields you change, with `_rev`; a 409 means someone else wrote first — re-read.
4. `POST …/publish`.
5. Prove it on the public page, not through the API (the API shows the draft as if live).

`tools/seed-apply.mjs` and `tools/personalize.mjs` follow this sequence and keep receipts
(`data/seed-receipts.json`, `data/personalize-receipts.json`): an entry an editor changed since the
receipt is left alone and reported; `--force` (conflicts only) and `--force-all` are explicit,
never routine.

Never edit `data/data.db` directly and never replace it to change content; `tools/restore.sh`
exists for recovery, not editing.

## Tracy's Content API

The image builds Tracy's read-only Content API in (`tools/content-api/`,
`TRACY_CONTENT_API_SCALARS`, Dockerfile default 1; ENV so a rebuild in the container keeps
it). It reads `seed/content-api-map.json` (every collection: page, service, article,
shared or generic, with its public URL pattern; `site` is the chrome) and the field kinds
of `seed/site-model.json`. That model is derived from `seed/seed.json` by the kit's
`tools/from-emdash-seed.mjs`; `tests/site-model-from-seed.test.mjs` turns red when the
seed moves without it. Menus, references and formatted dates are not projected.
`node tools/content-api-gate.mjs` checks the whole chain; `tools/release.mjs` runs it.
