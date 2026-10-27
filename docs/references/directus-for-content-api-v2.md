---
description: Directus's Content API (v11 → v12, measured 25/09/2026) compared with Tracy's Content API v1 and v2 plan — identity, M2A page builder, per-field permissions, revision/versioning, discovery (/permissions/me, permission-scoped OpenAPI), query, errors, MCP/AI/Visual Editor, presentation vs content; does not decide on behalf of the PO.
sources:
  - docs/references/content-api-v1.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-content-api/schema.json
---

# Directus for Content API v2

Research 25/09/2026, Directus only (other CMSes have their own documents). Supplements
[the 19-topic Shopify · UCP table](content-api-v2-vs-shopify-ucp.md) and
[the v2 plan](../../tasks/todo-content-api-v2.md); **does not repeat** those two documents. Compared against
[the v1 envelope](content-api-v1.md): `contents[]` page/article/…, `blocks[].fields[]{slotKey}`, opaque
HMAC id, `translationGroupId`, signed cursor, 256 KiB.

Every claim has a URL in the [Sources](#sources) section; what could not be confirmed is listed in its own section. Only
primary sources are used: `directus.com/docs` (moved entirely from `docs.directus.io`, 301), repos
`directus/directus`, `directus/docs`, `directus/mcp`, GitHub release notes.

## 0. Version — "v11" is already the past

- Latest release when measured: **v12.4.1 (23/09/2026)**; v12.0.0 came out 10/06/2026; v11 stopped at
  v11.17.4 (30/04/2026) [R1].
- Milestones per the changelog [R2]: Policies (v11.0, 08/2024) · Visual Editor beta (v11.6, 04/2025) ·
  built-in MCP server (**v11.12**, 09/2025) · AI Assistant in Studio (**v11.14**, 12/2025) ·
  Visual Editor field permission checks + version selection (v11.15–11.16, 02–03/2026) · global Draft
  version (v11.16) · WYSIWYG switched TinyMCE → Tiptap (v12.2, 07/2026) · inactive collection returns
  `COLLECTION_INACTIVE` (v12.4, 09/2026).
- **v12 changed licence** BUSL-1.1 → MSCL-1.0-GPL: SSO, *custom permission rules on policies*, self-hosted
  LLM and AI Translations need a licence; after the 30-day grace period GraphQL/WebSocket/**MCP** are
  turned off and non-admins cannot log in [R3]. For Tracy this is a fact about *the reliability of the learning
  source*, not a technical risk (Tracy does not run Directus).
- v12.0 changed versioning semantics: `?version=main` → `?version=published`; a published item in
  a collection with versioning enabled **is locked**, every edit must go through Draft [R3][R4].

## (a) Identity

| Concept | Directus | Source |
|---|---|---|
| Primary key | 4 kinds: auto-increment int, bigint, UUID, manually entered string; cannot be changed after the collection is created | [D1] |
| System fields | `date_created` · `date_updated` · `user_created` · `user_updated` · `sort` · `status`, optional when creating a collection | [D1] |
| Singleton | flag `meta.singleton`; the API **drops the id segment**: `GET /items/<coll>` and `PATCH /items/<coll>` return one object instead of an array — exactly Tracy's "shared content" (header/footer/settings) | [D1][D2] |
| Translations | three parts: a `languages` collection + a `<coll>_translations` junction + an O2M alias field; "all translated text is stored in the junction collection"; `POST /utils/translations/generate` builds the whole set | [D3][D4][D5] |
| O2M / M2M | O2M is a virtual field, creates no column; M2M via a junction holding two keys | [D3] |
| **M2A** | "one collection can be related to any item in any collection"; the junction holds `collection` + `item` (+ `sort` if declared); the interface is named **Builder (M2A)**, type `alias` | [D3][D6] |
| Files | `directus_files`, UUID id; an image field in an item is just a UUID (`"image": "12e02b82-…"`); a file still referenced by an item cannot be deleted unless the FK is `SET NULL`/`CASCADE` | [D7][T1] |

How to query translations (Astro tutorial, [D5]):

```js
readItems('posts', {
  fields: ['slug', { translations: ['*', 'languages_code'] }],
  deep: { translations: { _filter: { languages_code: { _eq: lang } } } },
})
```

Missing translation → `translations: []`, **no fallback** to the default language; the frontend handles it itself
(`t?.title`). Compared with Tracy: v1's `translationGroupId` is equivalent to the junction's *parent key* `posts_id`
— Directus has no separate id for a "translation group", the group is the parent item; each translation is
a junction row with its own id (like v1's "each translation has its own id").

## (b) Page builder with M2A

Official tutorial [T1] (`pages` ↔ `block_hero` · `block_richtext` · `block_cardgroup`):

- A `blocks` field of type Builder (M2A) on `pages`, declaring **Sort Field** `sort` in Advanced mode;
  Directus creates a **hidden** junction (default name `pages_blocks`, changeable in Advanced mode).
- Junction row: `{id, pages_id, sort, collection, item}` — `id` is the **durable row id** of the
  *occurrence* on the page, `item` is the id of the actual block, `collection` says which kind the block is.
- Query: `fields: ['*', { blocks: ['*', { item: { block_hero: ['*'], … } }] }]`; the REST
  equivalent is `fields=*,blocks.*,blocks.item:block_hero.*` (the collection-scoped syntax
  `field.item:collection.subfield`) [D8][D9].
- **Editing one block = `PATCH /items/block_hero/<item-id>` with exactly the changed fields** — not sending the whole
  page; PATCH is a partial update [D2]. Reordering = PATCH `sort` on the junction row (or
  `POST /utils/sort/<coll>` with `item`/`to`) [D10]. Reuse: "Add Existing" attaches *the same* block
  item to another page → two junction rows, one item [T1] — exactly v1's `sharedContentId` model.
- Nested writes via PATCH page also work: `blocks: {create:[…], update:[{id,…}], delete:[…]}` [D9]
  — i.e. both paths (per block, per page) exist, the agent picks.
- Permissions: Read must be opened on **each** block collection, otherwise `item` comes back empty (the tutorial mentions this in
  "Check Your Permissions") [T1] — a silent failure like "forbidden field → `null`" in (c).

Compared with Tracy: `blocks[].id` (occurrence, "stable within the page") ≈ junction row id;
`blocks[].position` ≈ `sort`; `fields[].slotKey` ≈ the pair `(collection, item, field)`. Directus
does not need `slotKey` because **write address = read address** (same collection/id/field); Tracy needs
`slotKey` because the read address (envelope) and the write address (Claude Cowork plugin/contract) are two coordinate systems.

**WYSIWYG / Block Editor:** WYSIWYG stores HTML (Tiptap since v12.2, TinyMCE before — unfamiliar HTML gets
normalised on the first edit [R3]); Block Editor stores **JSON** ("create and edit content using
blocks"); Repeater stores a "JSON array of objects" [D6]. For the API, a Block Editor field is *one
JSON scalar* — PATCH overwrites the whole field, there is no address to each block inside (unlike M2A).
The concrete JSON shape (Editor.js `{time, version, blocks[]{id,type,data}}`) is not found in the Directus
docs — see the unconfirmed section.

## (c) Read vs write, permissions

- **The v11 model:** Permission = collection × action (`create` `read` `update` `delete`
  `share`) inside a **Policy**; a policy is attached to a role or directly to a user, **additively** ("each
  policy can add to existing permissions, but not take them away"). Each permission has: an item
  rule (filter), a **field allow-list** (`fields`, CSV, `*` = all), `validation` (a filter rule
  on the payload), `presets` (default values on create/update). Field rules are unioned across
  policies; item rules are combined with OR; the IP allow-list subtracts [D11][D12].
- Public = a separate policy, off by default [D11].
- **Read-forbidden field — two behaviours, confirmed in the code:**
  - `fields=*` or not declared → the forbidden field **is dropped from the response** ("only fields you have
    permission to see will be returned … `null` if not allowed in the given context") [D11].
  - Naming the forbidden field **explicitly** in `fields[]` → **403 `FORBIDDEN`**, message
    `You don't have permission to access field "x" in collection "y" or it does not exist.`
    (`api/src/permissions/modules/process-ast/utils/validate-path/create-error.ts`) [S1]. Note
    the phrase "or it does not exist" — deliberately not revealing whether the field exists (like v1 §1 "404
    with the same shape").
- **Write-forbidden field → 403 `FORBIDDEN`, not silently skipped**, checked *before* presets and
  validation (`process-payload.ts`: `notAllowed = difference(fieldsUsed, fieldsAllowed)` →
  `createFieldsForbiddenError`) [S2].
- `/collections` and `/fields` for non-admins return a **filtered list** by read permission (not
  403) — `fetchAllowedCollections`, `allowedFieldsInCollection` [S3][S4]; only
  a forbidden `GET /fields/<coll>/<field>` → 403 [S4].
- `fields[]` projection: `*`, `*.*`, dot-notation, M2A scope `item:collection`, `backlink=false`
  to avoid loops; `deep[<rel>][_filter|_sort|_limit…]` applies a query to nested relations; `alias` fetches the same
  relation twice with different filters [D8].

## (d) Revision / consistency / cache

| Mechanism | What it has | Source |
|---|---|---|
| **Activity** | `directus_activity`: `action` (create/update/delete/login/comment…), `user`, `timestamp`, `ip`, `user_agent`, `collection`, `item`, `origin`, `revisions[]`; `GET /activity` | [D13] |
| **Revisions** | `directus_revisions`: `data` = "copy of item state at time of update", `delta` = only the changed fields, `parent` for relational updates, `version`; `GET /revisions`; **revert** = `POST /utils/revert/<revision>` ("Revert an item to its state at the given revision") | [D14][D10] |
| On/off per collection | `meta.accountability: 'all' \| 'activity' \| null` | [D15][S5] |
| **Content Versioning** | per collection `meta.versioning`; `directus_versions` `{id, key, name, collection, item, hash, delta, date_*, user_*}`; since v11.16 **every item has a global Draft**; `?version=<key>` on `/items`; `POST /versions/:id/save` (merges delta), `/compare` → `{outdated, mainHash, current, main}`, `/promote` needs **`mainHash`** + `fields[]` to publish partially | [D4][D16] |
| Comparison on publish | a comparison modal, accept/reject **per field**; required is only checked at publish (a draft can be saved incomplete) | [D4] |
| `date_updated`/`user_updated` | optional system fields; in versioning since v11.12 they reflect the real edit, not the promote | [D1][R5] |
| Cache | `CACHE_ENABLED=false` by default; `CACHE_TTL=5m`; `CACHE_AUTO_PURGE=false` — when on, it **purges the data cache on any mutation** (ignore list `directus_activity,directus_presets`); the cache key hashes `{version, path, query, user, share?, ip?}` → **per user**; `CACHE_STATUS_HEADER` HIT/MISS | [D17][S6] |
| **ETag / 304** | **none**: the cache middleware only returns JSON or skips, does not read `If-None-Match`; the cache docs do not mention ETag (only `Last-Modified` for `/assets`) | [S7][D17] |
| Flows | Event Hook trigger `items.create/update/delete` per collection — **Filter** (blocking, modifies/blocks the payload) or **Action** (non-blocking); Webhook trigger `/flows/trigger/:id`; Schedule; Manual (a button in Studio, with confirm + form) | [D18] |

**Optimistic lock on items: none.** `PATCH /items/<coll>/<id>` does not accept `If-Match`,
has no `expected_revision`; the items/errors docs have no conflict code; searching issues for "optimistic
locking", "etag if-none-match", "concurrent update conflict" in `directus/directus` → 0
results [S8]. That means **last-write-wins** at the item door. **But** versioning's `promote` door is
a real optimistic check: `verifyHash()` hashes the main item (`objectHash(mainItem)`), mismatch →
`VersionHashMismatchError` [S9]. So Directus only guards against overwrites on *publish*, not on *edit*.

**Whole-site snapshot: none.** `/schema/snapshot` is the **schema** (collection/field/relation,
"not content data"), admin-only, with a `hash` for `diff`/`apply` [D19]. There is no "read
transaction" or snapshot-bound cursor; `offset/page` is free → listing promises no consistency between two
pages — matching option A3 of the v2 plan.

## (e) Schema / discovery — the focus

| Door | Returns | Permission |
|---|---|---|
| `GET /collections` | `{collection, meta{icon, note, display_template, hidden, singleton, translations, archive_field, sort_field, accountability, versioning, preview_url, item_duplication_fields, group…}, schema}` | filtered by read [D15][S3] |
| `GET /fields[/<coll>]` | `{collection, field, type, schema{data_type, is_nullable, max_length, is_primary_key, foreign_key_table…}, meta{interface, options, display, readonly, hidden, required, validation, validation_message, conditions, special, note…}}` | filtered by read [D20][S4] |
| `GET /relations` | relations (M2O/O2M/M2M/M2A) | — |
| **`GET /server/specs/oas`** | OpenAPI "for the current project" — **generated according to the calling user's permissions**: `if (this.accountability && this.accountability.admin !== true)` → `fetchAllowedFieldMap({action:'read'})` + `reduceSchema`; each path/method exists only when `hasPermission` for collection × action; has a schema per field, relation refs | [D21][S10] |
| **`GET /permissions/me`** | one entry per collection with at least one permission; each action `{access: 'none' \| 'partial' \| 'full', fields?, presets?}` — `partial` when the permission has a filter; `fields` is the union of policies, collapsed to `['*']` when there is a wildcard | [D22][S11] |
| `GET /permissions/me/<coll>/<id>` | `{update:{access, fields?, presets?}, delete:{access}, share:{access}}` **for exactly that item** (runs `validateAccess` with `primaryKeys=[id]`); a singleton with no item yet → treated as `create`; keeps the shape even for a non-existent item ("use the get items endpoint" to check existence) | [D22][S12] |
| `/schema/snapshot` · `/diff` · `/apply` | schema with `hash`, `force` skips checks; export csv/json/xml/yaml | admin-only [D19] |
| `GET /server/info` | project info, flags `mcp_enabled`, `mcp_oauth_*`, AI settings | [D21][S13] |

**How many calls does "what does the site have and what can I write" cost?** With Directus: **1 call** `/permissions/me`
returns *which collections, which fields I can write, with what defaults*; **1 call** `/server/specs/oas` (or
`/collections` + `/fields` = 2) returns *what exists*. For a specific item: 1 more call
`/permissions/me/<coll>/<id>`. No door returns the **values** at the same time — reading the item is the third
call. The v2 plan merges these three into one `content.read` (`writable` next to `value`) — deeper than
Directus on this point; where Directus is better is the **per-action shape** (`access` + `fields` +
`presets`) instead of one boolean.

## (f) Query / pagination / limits

- `limit` (default `QUERY_LIMIT_DEFAULT=100`, ceiling `QUERY_LIMIT_MAX=-1` = unlimited) ·
  `offset` · `page` (1-based) · `sort=-date_created,author.name` · `search` (every
  string/text field) · `filter` JSON [D8][D23].
- Operators: `_eq _neq _lt _lte _gt _gte _in _nin _null _nnull _contains _icontains _ncontains
  _starts_with _ends_with _between _empty _regex` (validation) `_intersects`; logic
  `_and/_or`; relations by nesting objects (`{author:{name:{_eq}}}`), O2M/M2M `_some/_none`; variables
  `$CURRENT_USER`, `$CURRENT_ROLE`, `$NOW(-1 year)`; functions `year()/month()/count()/json(field,
  path)` [D24].
- `meta=total_count,filter_count`; `aggregate[count|sum|avg|min|max|countDistinct]`;
  `groupBy` [D8].
- `export=csv|json|xml|yaml` on every `/items` GET; `POST /utils/export/<coll>` writes to a file
  (`EXPORT_BATCH_SIZE=5000`) [D8][D10][D23].
- Other ceilings: `MAX_PAYLOAD_SIZE=1mb`, `MAX_RELATIONAL_DEPTH=10`, `MAX_BATCH_MUTATION=Infinity`,
  rate limiting off by default (`RATE_LIMITER_POINTS=50`/`DURATION=1`) [D23]. There is no per-response
  byte budget like Tracy's 256 KiB — Directus leaves the client to limit itself with `fields`/`limit`.

## (g) Errors

Shape: `{"errors":[{"message":"…","extensions":{"code":"…", …}}]}`, several errors per response
[D25]. Codes and extra fields:

| Code | HTTP | `extensions` adds |
|---|---|---|
| `FAILED_VALIDATION` | 400 | `field`, `path`, `type` (+ `valid`/`invalid`/`substring` depending on the rule) |
| `INVALID_PAYLOAD` | 400 | `reason` |
| `INVALID_QUERY` | 400 | `reason` |
| `RECORD_NOT_UNIQUE` · `NOT_NULL_VIOLATION` · `INVALID_FOREIGN_KEY` · `VALUE_OUT_OF_RANGE` · `VALUE_TOO_LONG` | 400 | `collection`, `field`, `value` (errors from DB constraints) |
| `FORBIDDEN` | 403 | (the message has the field/collection name; permission and non-existence **deliberately share a code**) |
| `COLLECTION_INACTIVE` | 403 | v12.4 |
| `ROUTE_NOT_FOUND` | 404 | |
| `TOKEN_EXPIRED` | 401 | |
| `VERSION_HASH_MISMATCH` (`VersionHashMismatchError`) | — | current `mainHash` [S9] |

No `severity`, no `next`. `field` is present on validation and constraint errors, **not** on
`FORBIDDEN` (only inside the message) — exactly what plan V2-4 wants to avoid (regex on the message).

## (h) AI / agent

**Built-in MCP server** (v11.12+, endpoint `<directus>/mcp`) [D26][D27][R5]:

- Enabled in *Settings → AI → Model Context Protocol*; settings stored in `directus_settings`:
  `mcp_enabled`, `mcp_allow_deletes` (**off by default**), `mcp_system_prompt_enabled` (on by
  default), `mcp_system_prompt` (admin override), `mcp_prompts_collection`, `mcp_oauth_*` [S13][D27].
- Auth: a static token of a dedicated user, or OAuth 2.1 (DCR/CIMD, env `MCP_OAUTH_*`);
  **"operates through your existing Directus permissions"**, "no permission bypass" [D26][D28].
- Tools (default mode): `system-prompt` ("The AI is instructed to call this tool first"),
  `items` (one CRUD tool, read/update not split), `schema`, `collections`, `fields`,
  `relations`, `files`, `assets`, `flows`, `operations`, `trigger-flow`, `folders`. **Registry**
  mode: three root tools `search` · `execute` · `schema` [D29]. Writes exist, and write **directly**;
  confirmation is the MCP client's job ("Do not enable auto-approval for MCP operations") [D28]; undo
  = revisions/`/utils/revert`, there is no undo tool [D28][D10].
- The old `@directus/content-mcp` (repo `directus/mcp`, local Node) has split tools:
  `read-items` `create-item` `update-item` `delete-item` `read-fields` `update-field`
  `read-files` `import-file` `trigger-flow` `upsert-comment` `markdown-tool` `get-prompts`…;
  env `DISABLE_TOOLS`, `MCP_SYSTEM_PROMPT(_ENABLED)`, a prompts collection with mustache
  `{{var}}`; the sample system prompt requires "confirm with the user before delete", "if not 95% sure, ask"
  [G1].

**AI Assistant in Studio** (v11.14+): providers OpenAI/Anthropic/Google/OpenAI-compatible;
"operates with your existing Directus role and access policies"; **"all tools require approval
by default"**, configurable per tool; has an "Ask User Tool" (v11.16); `ai_system_prompt` set by the admin;
conversations stored locally, not on the server [D30][R6][S13].

**Visual Editor** (v11.6+, field permission checks since v11.16 with `@directus/visual-editing` v2) [D31][D32][R6]:

- The frontend attaches `data-directus="collection:posts;item:12;fields:title;mode:popover"` (generated with
  `setAttr({collection, item, fields?, mode?})`); `apply({directusUrl, elements?, onSaved?,
  customClass?})`; mode `drawer|modal|popover`; **one element = one item**; **does not create new
  items**; an element without enough permission → "remain inert".
- Studio: enabled in Settings → Modules, declare `visual_editor_urls`; needs
  `CONTENT_SECURITY_POLICY_DIRECTIVES__FRAME_SRC` and recommends `CACHE_AUTO_PURGE=true`; a URL with
  `{{$version}}` → a Published/Draft/version dropdown.
- Limits stated outright: "Only existing items with declared editable fields can be modified";
  "Layout and template structure changes are not supported" [D32].

**Live Preview:** a URL per collection with `{{id}}`/`{{slug}}`/`{{$version}}`, reloads on save;
a token goes through the query if needed [D33].

## (i) Presentation vs content

- Directus **has no template layer**: it is only data + Studio; rendering is the frontend's job
  (tutorial: "Maps all the possible `page.pages_blocks.collection` names to your page block
  components") [T1]. The M2A page builder = **content and layout in the same place**: order (`sort`), kind
  (`collection`) and value (`item.*`) are all data writable by anyone with `update` on the
  junction + block collection.
- The Visual Editor points **at item/field**, not at template: `data-directus` only carries
  `collection/item/fields`. Consequence: Directus's "presentation lock" can only be done through
  **permissions** (no `update` granted on junction/`sort`/`collection`, only granted on the block's
  text fields) — that is a presentation-lock enforced at the ACL layer, not at the contract layer.
- For Tracy: presentation-lock seals *template + structure*, while text slots stay open; mapped to
  Directus = `update` only on `block_*.{headline, content}`, `none` on `pages_blocks` and
  `pages.blocks`. This way of saying "lock = the set of writable fields" is exactly what `/permissions/me` exposes
  — and what V2-1's `writable` wants to say with one boolean.

## Additions to Tracy's v2 plan

Each bullet: what Directus does → whether v1/the v2 plan has it → proposal + trade-off. Label **[generic]** copyable
for content in general · **[CMS-only]** meaningful only for a CMS with blocks/templates · **[do not
copy]**. Does not decide on behalf of the PO.

1. **`/permissions/me` is the source of `writable`** **[generic]** — Directus returns per collection ×
   action `{access: none|partial|full, fields[], presets}` in one call, separate from the data.
   Plan V2-1 has `fields[].writable: true|false|null` next to the value but does not yet say its *source* in the
   adapter. Proposal: the adapter computes `writable` from an internal function shaped like `/permissions/me`
   (seat × content-type × field → access), and `describe()` (V2-3) exposes **that same table** under
   `capabilities`/`writable` per type, so `writable` on a field and the permission table in `describe`
   are one source. Trade-off: `partial` (filter-based permission) does not map to a boolean — Tracy currently
   has no per-item permissions, so `null` keeps the meaning "the adapter does not know yet", not used for partial.
2. **Permissions for exactly one item: `/permissions/me/<coll>/<id>`** **[generic]** — Directus returns
   `update/delete/share` for one item, even a non-existent one (not revealing existence). v1 has "404
   with the same shape"; v2 has no door yet to ask permissions by id. Proposal: **add no endpoint**;
   `content.read?id=` is already where `writable` per field is returned, which is enough. Record it as conformance test B6
   ("detail reveals no more about existence than summary").
3. **Permission-generated OpenAPI = `describe()`** **[generic]** — `/server/specs/oas` reduces the schema
   by `fetchAllowedFieldMap`, a path/method exists only with permission. Plan V2-3 has `describe` with
   `capabilities` "generated from adapter code", not yet saying *per seat*. Proposal: `describe` **filters by
   principal** (types/fields the seat cannot read are not listed), and has `services[].schema` pointing to the JSON
   Schema of `content.read` — keeping the document independent as in B1. Trade-off: two seats see two different
   `describe`s → caching of `describe` must be per principal (same ETag key as V2-2).
4. **Two behaviours for a forbidden field — choose and write it into the spec** **[generic]** — Directus: not declared
   → dropped/`null`; named explicitly → 403 with the message "or it does not exist". v1 says "forbidden field
   → unresolved", not yet distinguishing a default read vs an explicit projection. Proposal: when v2 has
   `fields[]` projection (bullet 5), specify it like Directus: by default **drop**, named explicitly
   **403 `CONTENT_FORBIDDEN` with `error.field`**, the message not revealing existence. Writing a forbidden field:
   Directus 403s before validation — v2's `SLOT_NOT_WRITABLE` should also be checked **before** `SLOT_TOO_LONG`.
5. **`fields[]` projection + `deep`** **[generic]** — Directus lets the client pick fields, scoped
   by collection in M2A, and nested queries (`deep`). v1 has `summary/complete/partial` decided by the server
   by budget, no client-chosen projection. Proposal: add `fields=` (a list of
   content-level keys + `blocks.fields`) as a *means* to avoid hitting 256 KiB instead of fragmenting into
   partial; keep `detailState` for when it is not declared. Trade-off: one more dimension for the signed cursor
   (already bound to filters) and for ETag; `deep` is not needed yet.
6. **M2A block = a row with a durable id + `sort` + `collection`, edited by PATCHing the row** **[CMS-only]** —
   Directus edits a block with a small PATCH to exactly the row, without sending the page. v1 already has
   `blocks[].id` (occurrence) + `position` + `sharedContentId`, and applies by `slotKey` — an equivalent
   shape. What v2 does not yet say: **whether the occurrence `id` is stable across reordering** (Directus:
   yes, because it is a row id; `sort` is a separate column). Proposal: write the invariant "changing `position` does not change
   `blocks[].id`" into §3 and a conformance test; the Joomla/WP adapters prove it on a fixture.
7. **`sort` is writable data, but Tracy does NOT open it** **[do not copy]** — in Directus block
   order/kind is content; in Tracy it is presentation (C6, presentation-lock). State it clearly in
   `describe`: `blocks[].position` readonly, so the agent does not propose "swap two sections".
8. **`data-directus` = a map of "content points to where it is displayed"** **[CMS-only]** — Directus attaches
   `(collection,item,fields)` to an element; permission check → inert element. v1 has `slotKey` (where to
   edit) but not the reverse direction: from **where it is displayed** (selector/element) back to `slotKey`. Plan
   B7 `view=pages` goes from route → occurrence, not yet to the element. Proposal: do **not** build click-to-edit
   in v2; only consider `blocks[].anchor` (an id/selector emitted by the template, already in the contract
   `content-map.json` as a selector for Joomla) so that `view=pages` can return "where this block is on the
   page" for an agent reading a screenshot. Trade-off: a selector is physical — v1 §3 forbids putting XPath/selectors
   into the envelope; if done, it must be an anonymous id emitted by the template, not a real selector. Ask the PO.
9. **Per-item Content Versioning (global Draft + promote with `mainHash`)** **[generic, but
   deferred]** — Directus keeps a `delta` per item, publishing has per-field comparison and an **optimistic check
   on promote**. v1 §6/ADR 0021 §6: build no new undo/journal; per-content `expected_revision`
   (V2-1) is already an optimistic check on *edit* — Tracy is stronger than Directus here (Directus has no
   lock on PATCH item). Proposal: do not copy versioning; only copy the **idea** "a content's revision =
   hash of the current state" (Directus `objectHash(mainItem)`) as a valid way for the adapter to
   generate `contents[].revision` without a revision table — the WP/Joomla Claude Cowork plugin has no
   `directus_revisions`. Trade-off: a value-based hash does not distinguish two edits back to the same value
   (harmless for the drift check).
10. **Required `date_updated` — in Directus it is only optional too** **[generic]** — the system field
    `date_updated` is *optional* when creating a collection; many collections lack it. Plan V2-2 makes
    `updatedAt` required in summary. Noted: Joomla `modified`/WP `post_modified` exist; does an EmDash
    record have `updatedAt`? — the adapter must prove it; if missing, the spec allows `updatedAt: null` +
    `revision` required instead of requiring both. No plan change, only a question for the adapter.
11. **No ETag/304, per-user cache, global purge on mutation** **[generic]** — Directus
    has no 304; `CACHE_AUTO_PURGE` clears the whole data cache when any collection changes. Plan V2-2
    has an ETag by `(site, principal, scope, query, snapshot.revision)` and 304 after auth — better than
    Directus. Copyable lesson: **the cache key includes `user`** (Directus hashes `user` into the key) — the plan already
    has `principal`; and "whole site on mutation" invalidation is acceptable for small sites —
    letting the adapter do it coarsely first (C5 "content changed event" → clear everything), refine later.
12. **Errors have `field` on validation/constraint, not on FORBIDDEN; no `severity`/`next`**
    **[generic]** — plan V2-4 `{code, field, severity}` + `next` is already better than Directus. Copy one
    detail: Directus **merges "no permission" and "does not exist" into one code** for a field
    (`FORBIDDEN … or it does not exist`). v2 has `SLOT_NOT_WRITABLE` and `SLOT_UNKNOWN` separate —
    consider: for a seat without enough permission, `SLOT_UNKNOWN` reveals "the slot exists" through the difference in codes.
    Proposal: when the principal has no read permission on the slot, return `SLOT_UNKNOWN` (not
    `SLOT_NOT_WRITABLE`). Ask the PO because it touches the semantics of `severity`.
13. **MCP: admin-set system prompt + `allow_deletes` off by default + "the first tool to call
    is system-prompt"** **[generic]** — Directus puts guidance for the agent into **data**
    (settings), not into tool code; Tracy V2-5 is pulling site-tools into the adapter and putting JIT
    guidance into `next`. Proposal: `describe()` carries a `guidance` field (short text, emitted by the
    quickstart/contract, approved by the PO) — replacing the 1,785 characters of tool description; customers may not edit it
    in v2 (Directus lets the admin edit because the admin owns the instance; in Tracy the owner is the quickstart). Trade-off:
    one more prose location that must pass `check-language`.
14. **One CRUD `items` tool instead of four tools** **[generic]** — the built-in MCP merges CRUD into one
    `items` tool + a registry mode `search/execute/schema` when there are many tools. Matches direction D1 (≤ 12
    actions/surface); noted that Directus chose **grouping by resource**, not by verb. No plan change.
15. **Studio = confirm, API = direct write** **[generic]** — AI Assistant "all tools require
    approval by default"; MCP leaves approval to the client; API/PATCH does not confirm. Consistent with Tracy's C7
    (measured `dry_run` vs direct write + revert). One added fact: Directus has no `dry_run`; it
    relies on **revisions + `/utils/revert`** as undo — i.e. "write directly, undo with native
    revisions" is the path Directus chose, like ADR 0021 §6.

## Could not be confirmed

- The concrete JSON shape of the Block Editor (Editor.js `{time, version, blocks[]}`): the docs only say
  "JSON"; the interface's README in the repo returns 404 at the guessed path.
- Versioning with nested M2A/O2M relations: the `versions.ts` code "traverses nested structures", but
  no docs/issue states the limits clearly; no issue found (0 results).
- How `/relations` is filtered for non-admins — code not read.
- Retention/prune for `directus_revisions` — not found in the API/config docs read.
- The docs pages `guides/content/revisions` and `guides/ai/mcp/tools` detailing each tool's parameters
  (does the `items` tool accept `query` with `fields/filter/limit`?) — the tools page only has a table of names, no
  parameters.
- The official list of "which tools need approval" in the AI Assistant by default — only the sentence
  "all tools require approval by default".

## Sources

**Official — docs `directus.com/docs`**

- [D1] Collections — https://directus.com/docs/guides/data-model/collections
- [D2] Items API — https://directus.com/docs/api/items
- [D3] Relationships — https://directus.com/docs/guides/data-model/relationships
- [D4] Content Versioning — https://directus.com/docs/guides/content/content-versioning
- [D5] Multilingual content (Astro) — https://directus.com/docs/frameworks/astro/multilingual-content
- [D6] Interfaces — https://directus.com/docs/guides/data-model/interfaces
- [D7] Files — https://directus.com/docs/guides/files
- [D8] Query parameters — https://directus.com/docs/guides/connect/query-parameters
- [D9] Relational data (query + nested writes) — https://directus.com/docs/guides/connect/relations
- [D10] Utilities API (`/utils/revert`, `/utils/sort`, `/utils/export`, `/utils/translations/generate`) — https://directus.com/docs/api/utilities
- [D11] Access control — https://directus.com/docs/guides/auth/access-control
- [D12] Permissions API — https://directus.com/docs/api/permissions
- [D13] Activity API — https://directus.com/docs/api/activity
- [D14] Revisions API — https://directus.com/docs/api/revisions
- [D15] Collections API — https://directus.com/docs/api/collections
- [D16] Versions API — https://directus.com/docs/api/versions
- [D17] Cache config — https://directus.com/docs/configuration/cache
- [D18] Flow triggers — https://directus.com/docs/guides/flows/triggers
- [D19] Schema API — https://directus.com/docs/api/schema
- [D20] Fields API — https://directus.com/docs/api/fields
- [D21] Server API (`/server/specs/oas`, `/server/info`) — https://directus.com/docs/api/server
- [D22] `/permissions/me` — https://directus.com/docs/api/permissions
- [D23] Security & limits — https://directus.com/docs/configuration/security-limits
- [D24] Filter rules — https://directus.com/docs/guides/connect/filter-rules
- [D25] Errors — https://directus.com/docs/guides/connect/errors
- [D26] MCP overview — https://directus.com/docs/guides/ai/mcp
- [D27] MCP installation (settings, OAuth) — https://directus.com/docs/guides/ai/mcp/installation
- [D28] MCP security — https://directus.com/docs/guides/ai/mcp/security
- [D29] MCP tools — https://directus.com/docs/guides/ai/mcp/tools
- [D30] AI Assistant — https://directus.com/docs/guides/ai/assistant
- [D31] Visual editing frontend library — https://directus.com/docs/guides/content/visual-editor/frontend-library
- [D32] Visual Editor studio module — https://directus.com/docs/guides/content/visual-editor/studio-module
- [D33] Live Preview — https://directus.com/docs/guides/content/live-preview
- [T1] Tutorial "Create Reusable Blocks with Many-to-Any Relationships" — https://directus.com/docs/tutorials/getting-started/create-reusable-blocks-with-many-to-any-relationships (markdown source: `directus/docs` `content/tutorials/2.projects/create-reusable-blocks-with-many-to-any-relationships.md`)

**Official — code and releases `github.com/directus`**

- [R1] Releases — https://github.com/directus/directus/releases (v12.4.1 23/09/2026 … v11.17.4 30/04/2026)
- [R2] Changelog — https://directus.com/docs/releases/changelog
- [R3] Breaking changes v12 — https://directus.com/docs/releases/breaking-changes/version-12
- [R4] Release v12.0.0 — https://github.com/directus/directus/releases/tag/v12.0.0
- [R5] Release v11.12.0 (MCP, #25578) — https://github.com/directus/directus/releases/tag/v11.12.0 · PR https://github.com/directus/directus/pull/25578
- [R6] Release v11.16.0 (global Draft, Visual Editor field permissions, AI Assistant Ask User) — https://github.com/directus/directus/releases/tag/v11.16.0
- [S1] `api/src/permissions/modules/process-ast/utils/validate-path/create-error.ts` — https://github.com/directus/directus/blob/main/api/src/permissions/modules/process-ast/utils/validate-path/create-error.ts
- [S2] `api/src/permissions/modules/process-payload/process-payload.ts` — https://github.com/directus/directus/blob/main/api/src/permissions/modules/process-payload/process-payload.ts
- [S3] `api/src/services/collections.ts` — https://github.com/directus/directus/blob/main/api/src/services/collections.ts
- [S4] `api/src/services/fields.ts` — https://github.com/directus/directus/blob/main/api/src/services/fields.ts
- [S5] `packages/types/src/collection.ts` (`accountability`, `versioning`, `singleton`) — https://github.com/directus/directus/blob/main/packages/types/src/collection.ts
- [S6] `api/src/utils/get-cache-key.ts` — https://github.com/directus/directus/blob/main/api/src/utils/get-cache-key.ts
- [S7] `api/src/middleware/cache.ts` — https://github.com/directus/directus/blob/main/api/src/middleware/cache.ts
- [S8] Issue search in `directus/directus`: "optimistic locking", "etag if-none-match", "concurrent update conflict revision" → 0 results (gh search, 25/09/2026)
- [S9] `api/src/services/versions.ts` (`verifyHash`, `VersionHashMismatchError`, `objectHash`) — https://github.com/directus/directus/blob/main/api/src/services/versions.ts
- [S10] `api/src/services/specifications.ts` (permission-scoped OpenAPI) — https://github.com/directus/directus/blob/main/api/src/services/specifications.ts
- [S11] `api/src/permissions/modules/fetch-accountability-collection-access/fetch-accountability-collection-access.ts` — https://github.com/directus/directus/blob/main/api/src/permissions/modules/fetch-accountability-collection-access/fetch-accountability-collection-access.ts
- [S12] `api/src/services/permissions.ts` (`getItemPermissions`) — https://github.com/directus/directus/blob/main/api/src/services/permissions.ts
- [S13] `packages/types/src/settings.ts` (`mcp_*`, `ai_*`, `visual_editor_urls`) — https://github.com/directus/directus/blob/main/packages/types/src/settings.ts
- [G1] `directus/mcp` README (local Content MCP, tool table, `MCP_SYSTEM_PROMPT`, prompts collection) — https://github.com/directus/mcp

**Secondary** — not used; every claim above comes from official docs/code/releases. Summaries generated by
the fetch tool were re-checked against code citations (S*) where there were two possible readings.
