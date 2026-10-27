---
description: How Payload CMS v3 does a content API — id/locale/blocks/Lexical, field-level access and /api/access, versions/drafts/document locking, select/depth/where, errors, MCP plugin — compared with Tracy's v1 envelope and v2 plan, with 14 proposals labelled generic / CMS-only / do not copy.
sources:
  - docs/references/content-api-v1.md
  - docs/references/content-api-v2-vs-shopify-ucp.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-content-api/schema.json
---

# Payload CMS v3 for Content API v2

Research dated 25/09/2026, Payload only (the other CMSs have their own documents). The 19-topic
G/C/CMS table in [`content-api-v2-vs-shopify-ucp.md`](content-api-v2-vs-shopify-ucp.md)
is **not repeated**; this document only adds what Payload has that the four Shopify/UCP sources do
not. The v1 envelope is in [`content-api-v1.md`](content-api-v1.md); the v2 plan is in
[`tasks/todo-content-api-v2.md`](../../tasks/todo-content-api-v2.md).
Lee (PO) reminds: content ≠ product — keep the CMS part (blocks with a position, `slotKey` pointing
to the place to edit, presentation-lock, translations in the same group, the editor is a seat).

Every claim carries a source number `[Pn]` (official) or `[Sn]` (secondary) in the Sources section at
the end of the file; what could not be confirmed is in the "Unconfirmed" section. Payload is
code-first, runs inside Next.js, on Mongo or Postgres/SQLite (Drizzle) — there is no "pre-installed
customer site" like Tracy's three CMSs, so every comparison below is a comparison of **API shape**,
not a proposal to add Payload as a fourth CMS.

## a. Identity

| Concept | Payload | Source |
|---|---|---|
| `id` | Each document has a DB-generated `id` (hex ObjectId on Mongo, serial/uuid on Postgres); always present in the response even when `select` drops every other field | [P8] |
| `slug` | **There is no `slug` field type**; it is a `text` field the dev declares, usually `unique: true` + `index: true`; lookup by slug = `find` with `where[slug][equals]=…&limit=1` (the docs recommend `limit: 1` to save a count pass) | [P14] [P9] |
| Localization | Enabled in the root config `localization: {locales, defaultLocale, fallback}`; **field-level** `localized: true`; the field is stored as an object keyed by locale. REST: `?locale=es`, `?fallback-locale=none\|null\|false` to turn off fallback, `?locale=all` (or `*`) returns an **object with every locale**. `filterAvailableLocales(req)` filters locales by tenant/user (affects only the Admin UI) | [P7] |
| Translations | **One document, many locales** — there is no "one record per translation" and no `translationGroupId`. With `localized: true` on `blocks`/`array`, each locale keeps **its own block array**, so the block `id` in `en` and in `vi` are unrelated | [P7] [P4] |
| Relationship | `relationship {relationTo}` — one or more collections (polymorphic returns `{relationTo, value}`); populated according to `depth` | [P1] [P10] |
| Join (v3) | `join {collection, on, maxDepth, defaultLimit, defaultSort, where}` — **virtual, read-only**, the reverse direction of a relationship; returns `{docs, hasNextPage, totalDocs?}`; REST `joins[field][limit\|where\|sort]`, `joins=false` turns them all off | [P11] |
| Globals | Single documents (header, footer, banner, site-wide strings); `GET/POST /api/globals/{slug}`; have versions/drafts; access `read`/`update`/`readVersions` | [P12] [P1] |
| Upload/media | A collection with `upload: {…}`; Payload adds `filename`, `mimeType`, `filesize`, `width`, `height`, `url`, `sizes[]` (per `imageSizes`), `focalPoint`; **`alt` is a field the dev adds**, not a default. Writing through REST is `multipart/form-data` with the JSON of the other fields in the `_payload` parameter. A field `upload {relationTo: 'media'}` points to an image | [P13] |

Comparison with v1: v1 has an opaque `id` that survives slug changes and a `translationGroupId` —
Payload's answer is "one document, many locales", so it needs no group; but the price is that blocks
are **not stable across locales**, which Tracy needs for "edit the hero heading in all three
languages".

## b. Blocks and Lexical — where `slotKey` fits

A **Blocks field** stores an array of objects; each element has `blockType` (the slug of the block
config, required), `id` (generated automatically), `blockName` (optional label, turned off with
`admin.disableBlockName`) and that block's fields. Blocks can nest inside block/array/group.
`blockReferences` declares a block once in `config.blocks` and then references it by slug in many
collections [P4].

**How durable a block `id` is** (measured on the code, not just the docs):

- Admin form: `row.id = row?.id || new ObjectId().toHexString()` — keeps the old id, only generates
  one for new rows [P17]. Copy/paste of a block in the admin **regenerates** every nested block and
  array id to avoid duplicates [P4].
- Server, on update: `getExistingRowDoc` finds the old row by `existingRow.id === incomingRow.id`,
  not found → `{}` (treated as a new row) [P18]. On Mongo sub-documents are `_id: false`, i.e. `id`
  is an ordinary field set by Payload/the admin, not a DB key [P19].
- Consequence: **the id is durable if the client sends back the same id**; an agent sending an array
  without `id` creates new rows.

**Editing one block in a document — the whole array must be sent.** `PATCH /api/{slug}/{id}` merges
at the **document field level**: `beforeValidate` takes the old value from `siblingDoc` when the
field is absent from data [P20]; `beforeChange` merges with
`deepMergeWithSourceArrays(siblingDoc, siblingData)` — arrays are taken whole from the source, not
merged element by element [P21]. There is no JSON Patch / op by `blockId` in REST or the Local API;
the community confirms "There isn't a PATCH operation that would give you the ability to partially
update arrays… you would need a custom endpoint" [S1]. So the path "read → edit one heading → write"
in Payload is: `findByID` → change `layout[i].heading` → send the **whole `layout`**.

**Lexical rich text** is stored as JSON `{root: {type: 'root', children: [...], direction, format,
indent, version}}`; a text node is `{type: 'text', text, format, mode, detail}` [P5].
`BlocksFeature({blocks, inlineBlocks})` allows blocks **inside** rich text: a node `{type: 'block',
version: 2, fields: {id, blockType, blockName, …}}` and `type: 'inlineBlock'` with the same shape
[P6]. Official converters: JSX (`RichText`), HTML (`convertLexicalToHTML`), Markdown/MDX, plaintext;
the reverse direction `convertHTMLToLexical` / `editor.parseEditorState` [P16]. Editing one node also
means sending back the field's **whole JSON**.

Comparison with v1/v2: Tracy's `slotKey` points to **one slot** so that `apply {changes{slotKey:
value}}` needs no array; Payload only has the address `(<field>, index, id)` and requires sending the
array. This is where Tracy goes **deeper** than Payload, and it should be kept. Conversely, Payload
has two things v1 does not yet have: `blockName` (a label set by a person, equivalent to `role` but
typed by the editor) and blocks **inside** rich text (v1 only has a flat `bodyHtml` + `blocks[]`
outside the body).

## c. Read vs write, permissions

- **Collection access** `{create, read, update, delete, admin, unlock, readVersions}` — each function
  returns a `boolean` **or** a `Where`; a `Where` on `read` filters results, on `update` limits which
  documents can be written [P2]. Canonical example: anonymous visitors only read `_status: published`
  through a `Where` [P22].
- **Field access** `{read, create, update}` — **boolean only**, "does not support returning Query
  constraints". `read` false → "the entire property is omitted from the resulting document" (dropped
  entirely, not `null`). `create` false → "any passed values will be discarded". `update` false →
  "the operation will **not** throw an error however the field will be omitted from the update
  operation and the value will remain unchanged" [P3]. So **writing to a forbidden field is silent**,
  no error — the same class of "false green" error that TCH's CLAUDE.md hates.
- What is returned to the client: `depth` (default 1, ceiling `maxDepth` 10 in the root config,
  `maxDepth` per field) [P23] [P24]; `select` include/exclude, `select[group][number]=true`, `id`
  always present; `select` runs **in the DB**, so `beforeRead`/`afterRead` hooks "may not receive the
  full doc" [P8]; `populate` overrides the target collection's `defaultPopulate`
  (`populate[pages][text]=true`) [P8]; `draft=true` returns the latest version instead of the
  published one [P22]; `showHiddenFields` for `hidden` fields [P15].
- `overrideAccess`: the docs on `main` (25/09/2026) say the Local API "respect Access Control by
  default", `overrideAccess` "defaults to `false`"; `user` not passed = evaluated as anonymous [P15].
  ⚠ Older docs say the default is `true` — see "Unconfirmed".
- REST, Local API, GraphQL share **the same access set**; GraphQL has "feature parity" except upload
  (REST-only); introspection is off in production by default (`disableIntrospectionInProduction:
  true`) [P25].
- **`GET /api/access`** returns "what a logged in user can and can't do": `{canAccessAdmin,
  collections: {pages: {create: {permission}, read, update, delete, fields: {title: {create, read,
  update}}}}, globals}`; per-document `GET /api/{slug}/access/:id`, per-global
  `GET /api/globals/{slug}/access` [P26]. Types: `Permission = {permission: boolean, where?: Where}`,
  `FieldPermissions = {create?, read?, update?, fields?, blocks?}` — nested down to **each block
  type** [P27]. Limitation: in the access operation `id/data/doc` are `undefined`, and "Where queries
  returned from access control functions will not be run — we'll assume the user does not have
  access" [P28], so `where` is only a **hint**, not a verdict for a specific document.

## d. Revision, consistency, cache

- **Versions**: enabled with `versions: true|{maxPerDoc (100), drafts}` (globals: `max`); stored in
  the collection `_{slug}_versions`, document `{id, parent, version (a full copy of the document),
  autosave, latest?, snapshot?, publishedLocale?, createdAt, updatedAt}` [P29] [P30]. REST:
  `GET /api/{slug}/versions`, `GET …/versions/:id`, `POST …/versions/:id` (restore); globals
  `GET/POST /api/globals/{slug}/versions[/:id]`; Local `findVersions`/`findVersionByID`/
  `restoreVersion` (+ `…Global…`); access `readVersions` [P29].
- **Drafts**: `_status` is `draft`\|`published` (the Admin also shows a "Changed" label when there is
  a draft newer than the published version); `update {draft: true}` writes **only to the versions
  table, the main collection does not change**; publish = sending `_status: 'published'`; `validate`
  defaults to `false` (drafts can be saved half-done); `localizeStatus` → `_status` per locale,
  "publishing in one locale leaves the other locales' statuses untouched";
  `publishAllLocales`/`unpublishAllLocales`/`publishSpecificLocale` are update parameters
  [P22] [P7] [P31].
- **Autosave**: `{interval: 800, showSaveDraftButton}`; "Payload smartly only creates **one**
  autosave version, and then updates that specific version" [P32].
- **Scheduled publish**: `versions.drafts.schedulePublish: true` — "you need to make sure your
  Payload app is set up to process Jobs" (the `payload-jobs` queue) [P22].
- **`updatedAt`/`createdAt`** are automatic (turned off with `timestamps: false`) [P24].
- **Optimistic lock: none.** No `ifRevision`, `If-Match`, ETag or "expected version" parameter was
  found in the REST/Local docs, in the args of `updateByID` [P1] [P15] [P31] or in the MCP plugin's
  `updateDocument` tool [P33]. Negative evidence — see "Unconfirmed".
- **Document locking** (v3): `lockDocuments: {duration: 300}` is **on** by default; locks when a user
  opens the edit view in the Admin; other users get three choices "View in Read-Only", "Take over"
  (notifying the person editing), "Return to Dashboard"; it expires by itself after `duration`
  without interaction [P34]. Stored in the hidden collection `payload-locked-documents` `{document
  (polymorphic), globalSlug, user, updatedAt}` [P35]; checked by `checkDocumentLockStatus` — someone
  else's unexpired lock → `throw new Locked(…)` **HTTP 423**, the lock is deleted after each
  successful operation [P36] [P37]. ⚠ **`overrideLock` defaults to `true`** in both the Local API and
  REST: "By default, document locks are ignored" — for the API to respect locks you must send
  `overrideLock: false` [P15] [P34]. Compared with WP: `_edit_lock` is post meta only the Admin reads,
  REST does not check it (not re-verified in this document); compared with Tracy: presentation-lock
  seals the *template*, it is not a concurrency lock — two different problems, Payload only has the
  second.
- **Trash** (soft delete, v3): `trash: true` adds `deletedAt`; `find` hides it by default,
  `trash=true` includes it; restore/permanent delete through the Admin; governed by the `delete`
  access (receives `data.deletedAt` to tell trash from permanent delete); a document in the trash
  cannot restore a version [P38].
- **Whole-site snapshot: none.** Versions are per document/global; a transaction covers only one
  operation (`initTransaction`/`commitTransaction` in `updateByID`) [P31]; there is no endpoint that
  reads "the whole site at one revision". Confirmed across all the REST/versions docs [P1] [P29].

## e. Schema and discovery

- Code-first config (`payload.config.ts`). `payload generate:types` reads the config →
  `payload-types.ts`: an interface per collection/global, **one top-level interface per block**
  (`interfaceName` only overrides the name), `generateInputTypes: true` generates a `Post`/`PostInput`
  pair "reflecting the asymmetry between reading and writing"; `typescript.schema` extends the JSON
  Schema [P39]. `generate:importmap` is for Admin components (`app/(payload)/admin/importMap.js`),
  unrelated to the API [P40].
- REST has **no OpenAPI in core**; community: `payload-openapi`/`payload-swagger` (teunmooij),
  `@seshuk/payload-plugin-openapi` (OpenAPI 3.0–3.2, Scalar/Swagger UI), `payload-oapi` [S2] [S3].
- GraphQL generates `find`/`findByID`/`count`/`create`/`update`/`delete`/`version*` per collection,
  `findOne`/`update` per global; introspection is off in production by default [P25].
- `/api/access` returns **permissions**, not **schema** (no field names, types, block list). To learn
  "what collections/fields the site has and what I can write" through REST needs two sources:
  types/config at build time + `/api/access` at runtime. A single runtime call exists only in the
  **MCP plugin**: `getConfigInfo` (which slugs exist) + `getCollectionSchema`/`getGlobalSchema`
  (shape) — still two tools, and the results are already filtered by access [P41].
- Official SDK `@payloadcms/sdk` (`find`, `findByID`, `count`, `update`, `findVersions`,
  `restoreVersion`, `findGlobal`, `me`…, `draft` on `find`/`findByID`);
  `X-Payload-HTTP-Method-Override: GET` to POST a long query [P42].

## f. Query, pagination, limits

- `where` in `qs` syntax (`where[title][equals]=x`, arbitrarily nested `and`/`or`, dot-notation
  through relationships `artists.featured`); operators `equals, not_equals, greater_than(_equal),
  less_than(_equal), like, contains, in, not_in, all (Mongo), exists, near, within, intersects`
  [P43]. There is no documentation on filtering **inside** blocks/arrays beyond ordinary
  dot-notation.
- `sort` (`-createdAt`), `limit` (default 10), `page`; response `{docs, totalDocs, limit,
  totalPages, page, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage}`;
  `pagination=false` skips counting, `limit=0` returns everything and turns pagination off by itself
  [P9]. `GET /api/{slug}/count` → `{totalDocs}` [P1]. **There is no `maxLimit`** in the root config or
  the collection (only `admin.pagination.defaultLimit/limits` for the List View) [P24] [P23] — a
  client asking for `limit=0` gets the whole table.
- `select` reduces bytes by field (including fields within a group; for blocks it switches the whole
  `blocks` field on/off or by `select[layout][<blockSlug>][field]` — the nested-by-block syntax could
  not be quoted, see "Unconfirmed"); `depth` ceiling 10; `defaultMaxTextLength` 40,000 characters
  for text fields [P8] [P23].
- Pagination is **offset** (`page`), no cursor, no ETag, no "same snapshot" between two pages.

## g. Errors

- Every REST error: `{errors: [{name, message, data}]}`; status = `err.status || 500`; production
  hides messages that are not `isPublic` as `"Something went wrong."`, only `config.debug` includes
  the `stack`; the `afterError` hook can modify the response/status [P44] [P45].
- `ValidationError` = **400**, `data: {collection?, global?, errors: [{message, path, label?}]}`;
  the combined message "The following fields are invalid: <label or path>…" [P46]. Uses **`path`**
  (not `field`); the path format for a field inside a block (e.g. `layout.0.heading`) could not be
  quoted.
- `APIError(message, status = 500, data, isPublic)` is the base class; `Locked` = 423 [P47] [P37].
  401/403/404 are separate classes in `packages/payload/src/errors/`, each file not quoted here.
- No `severity`, no `next`/next-step hint — the same two gaps C1 recorded for Shopify.

## h. AI and agent

- **Official: `@payloadcms/plugin-mcp`** (RFC #14318 opened 23/10/2025 by @kendelljoseph, Payload
  team) [S4]; docs: Streamable HTTP at `/api/mcp` (+ stdio `payload-mcp`), JSON-RPC 2.0; built-in
  tools `getConfigInfo, getCollectionSchema, findDocuments, createDocuments, updateDocument,
  deleteDocuments, getUploadInstructions, getGlobalSchema, findGlobal, updateGlobal`, opt-in auth
  tools (`login, auth, forgotPassword, resetPassword, unlock, verify`); on/off per collection and per
  operation (`{find: true, create: false}`); auth `Authorization: <collectionSlug> API-Key <key>`,
  the API key collection by default is **forbidden** from Admin/REST/GraphQL; "Access controls are
  also enforced at the Payload level"; `overrideAccess=true` dev only;
  `defineTool/defineCollectionTool/definePrompt`, `resources`, `hooks.afterToolCall`,
  `overrideGetAuthorizedMCP` [P41]. npm lists the latest version as 3.88.0 (from search; the npm page
  blocks fetches) [S5].
- `updateDocument`: args `{slug, id?, data, draft, locale, where?, overrideLock, select, populate,
  returning, publishAllLocales, unpublishAllLocales, trash, …}`; calls `payload.update` with the API
  key's `overrideAccess`; annotation **destructive, non-idempotent**; **no dry-run, no confirm, no
  undo** [P33]. In the RFC, a user reported "accidental mass updates" and proposed "enable versions
  by default for any create/update via MCP" — Payload's undo is versions, not something MCP provides
  [S4].
- Community: `@ai-stack/payloadcms` (ashbuilds/payload-ai) — generation/translation/proofreading/
  images/voice in the Admin, tried with v3.38; it is an editing assistant, **not** a write door for
  outside agents [S6]. There is no `@payloadcms/plugin-ai` [S6].
- Enterprise: "AI framework" = auto-embedding/RAG in the existing DB, read-only, following access
  control, requires booking a demo [P48]; **Visual Editor** "Point, click, edit" on the real site —
  **"Coming Soon"**, enterprise [P49]; multi-player editing is enterprise [S7]. No "Payload AI SDK"
  found.
- **Live Preview**: `admin.livePreview {url (string or a function of document/locale/tenant),
  collections, globals, breakpoints}`; the Admin sends `window.postMessage` on every field change;
  `useLivePreview` (client) / `RefreshRouteOnSave` (server) on the front-end; **preview only**, the
  docs do not mention click-to-edit [P50].

## i. Presentation vs content

- Payload has **no template layer**: the front-end is Next.js written by the dev; each `blockType` is
  mapped by hand to a React component. **A block is both content and presentation** —
  adding/removing/reordering blocks in `layout` changes the page layout, through the same PATCH as
  changing a line of text [P4] [P5].
- Consequence for presentation-lock: Payload has no mechanism to lock **structure** (number of
  blocks, `blockType`, order) while still allowing **values** to be edited — field access `update:
  false` on `blocks` blocks the whole array, and because the array is replaced whole, there is no
  place to say "only the heading may change". To get what Tracy calls presentation-lock in Payload
  you would have to write a `beforeChange` hook comparing `blockType`/`id`/order with the old version
  — exactly what Tracy's Claude Cowork plugin does today with `presentation-lock` + fingerprint.
- `admin.livePreview` is preview; `admin.preview` only generates a URL; the "click here → edit that
  field" map (Visual Editor) is enterprise and not released yet. A block's position on the page in
  Payload is its **index in the array** — exactly v1's `position`, but with no `slotKey` for single
  writes.

## Additions to Tracy's v2 plan

Each bullet: what Payload does → whether v1/the v2 plan already has it → proposal + trade-off. Labels
**[generic]** copyable · **[CMS-only]** a content property, keep/add · **[do not copy]**. Does not
decide on the PO's behalf.

1. **Field-level access → `writable`** [generic]. Payload returns `/api/access
   …fields.<name>.update.permission` per user, nested down to each block type. v2 V2-1 already has
   `fields[].writable: true|false|null` per seat but only at the **field** level; not yet at the
   **block** level ("can this seat change this whole block") or the **content** level ("does this
   page have `update`"). Proposal: add `writable` to `contents[]` and `blocks[]`, inheritance rule
   content → block → field, field `null` when the block is `false`. Trade-off: the three adapters
   must compute three tiers; if an adapter only knows the field tier, the upper tiers are `null`, not
   inferred.
2. **`/api/access` ≈ the permissions part of `describe`** [generic]. Payload separates "what I may
   do" (`/api/access`) from "what exists" (types/`getCollectionSchema`). V2-3 `describe` currently
   has `types[]{type, count}` + `capabilities[]`, no permissions. Proposal: `describe` adds
   `permissions: {types: {<type>: {read, update}}}` per seat, without returning `where` (Payload also
   "assume no access" when a `where` would be needed). Trade-off: `describe` depends on the principal
   → the ETag of `describe` must be tied to the principal, as V2-2 already does for `read`.
3. **Writing to a forbidden field is silent in Payload — Tracy does the opposite** [generic]. Payload
   `update: false` → ignored, no error; Tracy V2-4 already has `SLOT_NOT_WRITABLE`. Keep: a clear
   error, `severity: unrecoverable`. Add a conformance test: "applying to a slot with `writable:
   false` → 4xx, not 200 with the old value".
4. **`select` (projection by field)** [generic]. Payload `select[field]=true`, `id` always present,
   reduces bytes in the DB. v1 has `summary`/`complete`/`partial` (three fixed levels) and V2-2 adds
   `blockCount/imageCount/bodyBytes`; there is no arbitrary projection yet. Proposal:
   `?fields=title,slug,blocks.fields.key` in include-only form for listings, not for detail (detail
   already has `blockId`/cursor). Trade-off: one more axis in the signed cursor and the ETag; the
   Joomla adapter reading SQL cannot easily project by field → returning everything and cutting at
   the relay is acceptable (Payload cuts in the DB, Tracy cuts at the relay).
5. **Versions per document** [CMS-only]. Payload `_{slug}_versions` + `GET …/versions`, `POST
   …/versions/:id` restore, `maxPerDoc`. v1 has an opaque `revision` and ADR 0021 §6 forbids a new
   undo/journal. Proposal: do **not** add a versions endpoint (per §6); but a content's `revision`
   should be the **CMS's native revision** if the CMS has one (WP `post_modified`/revision id, Joomla
   `#__ucm_history`, EmDash version) so that `apply.expected_revision` and "view history in the CMS
   admin" point to the same number. Trade-off: opacity is still needed (the id does not expose the
   raw DB id) — an HMAC of the native revision, not a whole-site hash.
6. **No optimistic lock in Payload; Tracy has `expected_revision`** [generic]. Payload relies on
   document locking (people) rather than revisions (machines); MCP `updateDocument` overwrites
   unconditionally. Keep `expected_revision` per content (V2-1). Addition: apply returns `409` with
   `current_revision` so the agent re-reads exactly one content, not the site.
7. **Document locking** [CMS-only, to consider]. Payload locks per (document, user, 300 s), the API
   ignores it by default, 423 when enforced. Tracy has no concurrency lock between an **agent seat**
   and **a person in the CMS admin**. Minimal proposal: `content.read` returns `lockedBy: {kind:
   'admin-user'|'seat', until}` when the CMS has a lock (WP `_edit_lock`, Joomla `checked_out`),
   `null` when unknown; apply does **not** respect the lock by itself (Payload doesn't either), it is
   only so the agent can tell the customer. Trade-off: one more nullable field and one sentence in
   site-tools; no extra Claude Cowork plugin call.
8. **Block ids are durable only when the client sends them back** [CMS-only]. Payload: missing `id` →
   new row; copy/paste → new id. v1 promises a "stable occurrence ID within the page" from the adapter
   side. Keep v1 (Tracy goes deeper); add to the conformance test: "editing the value of one slot does
   not change `blocks[].id` of other blocks" — Payload cannot keep this invariant through PATCH,
   Tracy must be able to prove it.
9. **Editing one block without sending the whole array** [CMS-only]. Payload requires sending the
   whole `layout`; Tracy's `slotKey` is its main advantage over Payload and also over MCP
   `updateDocument`. Do not copy; write this into `describe.capabilities`
   (`ai.tracy.content.slot-write`) so the agent knows it does not need to re-read the array.
10. **Blocks inside rich text** [CMS-only, not done]. Payload has `type: 'block'` nodes in Lexical
    with `fields.id`/`blockType`. v1 only has a flat `bodyHtml`; WP Gutenberg also has blocks in the
    body. Proposal: do **not** extend the schema in v2; record in Open questions: whether `bodyHtml`
    needs child `blocks[]` (occurrences within the body), and what the `slotKey` is for a block in
    the body. Trade-off: if not done, "edit the CTA in an article" still goes through the whole
    `bodyHtml`.
11. **`locale=all` and one document with many locales** [do not copy]. Payload folds locales into one
    document; Tracy has one content per translation + `translationGroupId` (all three CMSs use
    separate records: WP Polylang, Joomla associations, EmDash). Keep v1. One small thing can be
    copied: `?locale=all` for **listings** so one call sees the whole translation group — v2 already
    has `translationGroupId` + `relations[type: translation]`, which is enough.
12. **`_status` + `draft=true` + scheduled** [CMS-only, already have]. v1 `publication {status,
    valueSource, scheduledAt}` already covers all three (`valueSource: draft` ≈ Payload
    `draft=true`). One word to add: Payload has `changed` (published but with a newer draft) — the v1
    status enum does not; proposal: add `changed` **only if** WP (`post_status` + autosave/revision)
    or EmDash can prove it, otherwise keep `published` + `valueSource: draft`.
13. **Errors with `path`, no `severity`** [generic, already have]. Payload
    `ValidationError.data.errors[]{message, path}`; V2-4 `{code, field: {contentId, blockId, itemId,
    key}, severity}` already goes deeper (structured path + severity). One point to copy: Payload
    groups **many** field errors in one response; V2-4 should declare `errors[]` (an array) for
    multi-slot apply, not a single `error` — the spec currently says singular.
14. **MCP tools separate schema from data** [generic]. Payload MCP: `getConfigInfo` →
    `getCollectionSchema` → `findDocuments` → `updateDocument`, one job per tool, per-operation
    toggles, an `afterToolCall` hook. V2-5 already goes the way of ≤ 12 actions/surface + `next:
    {tool, args}`. Copy: per-operation toggles per seat reflected in `describe.capabilities` (an
    `editor` seat does not see `slot-write`), and a hook that writes a transcript after each tool
    (Tracy already has `tasks/evidence/`, make it a mechanism). Do not copy: dev-only
    `overrideAccess` — Tracy has no mode that bypasses seats.

**The v2 plan does not have it, Payload does** (summary for the PO): `writable` at the block/content
level (1); permissions in `describe` (2); projection by field (4); native revision instead of an
opaque whole-site hash (5); `lockedBy` (7); plural `errors[]` (13); blocks in the body (10, for
later).

## Unconfirmed

- The Local API's default `overrideAccess`: the `main` docs say `false`; the Payload 2.x/3.0 docs
  say `true`. No changelog found saying in which version it changed — before citing, measure on the
  specific Payload version.
- Whether the server generates an `id` for block rows sent through the API without an `id` (the
  admin does; Mongo `_id: false`; the Drizzle transform: no `ObjectId`/`randomUUID` found through
  code search).
- The nested `select` syntax by block slug (`select[layout][<blockSlug>][field]`) — the docs only
  have group/array examples.
- The `path` format of `ValidationError` for a field inside a block/array (`layout.0.heading`?).
- Whether `POST …/versions/:id` (restore) creates a new version or overwrites — the docs only say
  "restore".
- The absence of an optimistic lock is **negative evidence** (not found in the REST/Local docs,
  `updateByID.ts`, `updateTool.ts`); `packages/payload/src` has not been fully scanned.
- `@payloadcms/plugin-mcp` npm version/release date (npm page 403; the number 3.88.0 comes from
  search results).
- Whether `payload-openapi`/`payload-swagger` are compatible with Payload 3 (README read only
  through search).
- This document was written on a local checkout behind `origin/develop`;
  `docs/references/content-api-v1.md` and `packages/cms/tracy-content-api/schema.json` in `sources:`
  exist on `origin/develop` but not locally — the `doc-frontmatter` gate is red on this machine until
  `git pull`, as noted at the end of the Shopify/UCP comparison table.

## Sources

### Official (payloadcms.com/docs, github.com/payloadcms/payload)

- [P1] https://payloadcms.com/docs/rest-api/overview — collection/global/preferences endpoints, query params, count.
- [P2] https://payloadcms.com/docs/access-control/collections — collection access, boolean or Where.
- [P3] https://payloadcms.com/docs/access-control/fields — field access boolean only; read omits; update is silent.
- [P4] https://payloadcms.com/docs/fields/blocks — `blockType`/`id`/`blockName`, nested, `blockReferences`, paste regenerates ids.
- [P5] https://payloadcms.com/docs/rich-text/overview — Lexical JSON `root`, `BlocksFeature`.
- [P6] https://raw.githubusercontent.com/payloadcms/payload/main/docs/rich-text/blocks.mdx — `block`/`inlineBlock` node `{type, version: 2, fields{id, blockType, blockName}}`.
- [P7] https://payloadcms.com/docs/configuration/localization — `locale`, `fallback-locale`, `locale=all`, localized blocks are separate sets, `localizeStatus`.
- [P8] https://payloadcms.com/docs/queries/select — include/exclude, `id` always present, hook caveat, `populate`/`defaultPopulate`.
- [P9] https://payloadcms.com/docs/queries/pagination — response shape, `limit=0`, `pagination=false`, `limit: 1`.
- [P10] https://payloadcms.com/docs/fields/overview — field types, `access`, `hidden`, `virtual`, `unique`, `index`, `admin.readOnly` does not affect the API.
- [P11] https://payloadcms.com/docs/fields/join — virtual read-only join, `joins[...]`.
- [P12] https://payloadcms.com/docs/configuration/globals — Globals, endpoints, versions, access.
- [P13] https://payloadcms.com/docs/upload/overview — auto-added fields, `_payload` multipart, `alt` declared by the dev.
- [P14] https://payloadcms.com/docs/queries/pagination — (`limit: 1` for slug) and [P10] (`unique`/`index`).
- [P15] https://raw.githubusercontent.com/payloadcms/payload/main/docs/local-api/overview.mdx — `overrideAccess` (`main` docs: default `false`), `user`, `showHiddenFields`, `overrideLock` default `true`.
- [P16] https://raw.githubusercontent.com/payloadcms/payload/main/docs/rich-text/converters.mdx — JSX/HTML/Markdown/plaintext, `convertHTMLToLexical`.
- [P17] https://raw.githubusercontent.com/payloadcms/payload/main/packages/ui/src/forms/fieldSchemasToFormState/addFieldStatePromise.ts — `row.id = row?.id || new ObjectId().toHexString()`.
- [P18] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/fields/hooks/beforeChange/getExistingRowDoc.ts — matches rows by `id`, not found → `{}`.
- [P19] https://raw.githubusercontent.com/payloadcms/payload/main/packages/db-mongodb/src/models/buildSchema.ts — array `{_id: false, id: false}`, blocks `{_id: false, discriminatorKey: 'blockType'}`.
- [P20] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/fields/hooks/beforeValidate/promise.ts — `siblingDoc` fallback when data lacks the field; `row.blockType || rowSiblingDoc.blockType`.
- [P21] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/fields/hooks/beforeChange/promise.ts — `deepMergeWithSourceArrays(siblingDoc, siblingData)`.
- [P22] https://raw.githubusercontent.com/payloadcms/payload/main/docs/versions/drafts.mdx — `_status`, `draft: true` writes only versions, `validate`, `schedulePublish` needs Jobs, Where `_status`.
- [P23] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/config/defaults.ts — `defaultDepth ?? 1`, `maxDepth ?? 10`, `defaultMaxTextLength ?? 40000`, `routes.api ?? '/api'`.
- [P24] https://raw.githubusercontent.com/payloadcms/payload/main/docs/configuration/collections.mdx — `admin.pagination.defaultLimit/limits`, `defaultPopulate`, `lockDocuments`, `trash`, `timestamps`, `admin.livePreview/preview`.
- [P25] https://payloadcms.com/docs/graphql/overview — `/api/graphql`, generated operations, access parity, `disableIntrospectionInProduction`.
- [P26] https://raw.githubusercontent.com/payloadcms/payload/main/docs/authentication/operations.mdx — `GET /api/access`, JSON example, `/api/{slug}/access/:id`, `/api/globals/{slug}/access`, `me`.
- [P27] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/auth/types.ts — `Permissions`, `CollectionPermission`, `FieldPermissions{blocks?, fields?}`, `Permission{permission, where?}`.
- [P28] https://raw.githubusercontent.com/payloadcms/payload/main/docs/access-control/overview.mdx — access operation: `id/data/doc` undefined, Where not run.
- [P29] https://payloadcms.com/docs/versions/overview and the raw mdx — `_{slug}_versions`, `maxPerDoc` 100, endpoints, `readVersions`.
- [P30] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/versions/types.ts — `TypeWithVersion{id, parent, version, latest?, snapshot?, publishedLocale?, createdAt, updatedAt}`.
- [P31] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/collections/operations/updateByID.ts and …/operations/utilities/update.ts — order `checkDocumentLockStatus` → `beforeValidate` → `beforeChange` → `db.updateOne`/`saveVersion` → `afterRead` → `afterChange`; args `draft`, `autosave`, `publishAllLocales`, `overrideLock`; transaction per operation.
- [P32] https://payloadcms.com/docs/versions/autosave — `interval` 800 ms, one autosave version updated in place.
- [P33] https://raw.githubusercontent.com/payloadcms/payload/main/packages/plugin-mcp/src/mcp/builtin/collections/updateTool.ts — `updateDocument` tool args, `overrideAccess` per API key, destructive/non-idempotent annotation, no dry-run.
- [P34] https://payloadcms.com/docs/admin/locked-documents — `lockDocuments{duration: 300}`, three choices, API errors when enforced, `overrideLock` default `true`.
- [P35] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/locked-documents/config.ts — slug `payload-locked-documents`, fields `document`/`globalSlug`/`user`.
- [P36] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/utilities/checkDocumentLockStatus.ts — finds the lock, `throw new Locked(...)`, deletes the lock after the operation.
- [P37] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/errors/Locked.ts — `httpStatus.LOCKED` 423.
- [P38] https://payloadcms.com/docs/trash/overview — `trash: true`, `deletedAt`, `trash=true`, `delete` access, no version restore while in the trash.
- [P39] https://raw.githubusercontent.com/payloadcms/payload/main/docs/typescript/generating-types.mdx — `generate:types`, top-level block interfaces, `generateInputTypes`, `typescript.schema`.
- [P40] https://raw.githubusercontent.com/payloadcms/payload/main/docs/custom-components/overview.mdx — import map, `generate:importmap`.
- [P41] https://payloadcms.com/docs/plugins/mcp and https://raw.githubusercontent.com/payloadcms/payload/main/docs/plugins/mcp.mdx — tool list, auth header, `/api/mcp`, stdio, dev-only `overrideAccess`, custom tools/prompts/resources, `hooks.afterToolCall`.
- [P42] https://raw.githubusercontent.com/payloadcms/payload/main/docs/rest-api/overview.mdx — `@payloadcms/sdk`, custom endpoints, `X-Payload-HTTP-Method-Override`.
- [P43] https://payloadcms.com/docs/queries/overview — operators, `qs-esm`, dot-notation, `and`/`or`.
- [P44] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/utilities/routeError.ts — status `err.status || 500`, `formatErrors`, `isErrorPublic`, `debug` stack, `afterError`.
- [P45] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/utilities/formatErrors.ts — `errors: [{name, data, message}]`.
- [P46] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/errors/ValidationError.ts — 400, `data{collection?, global?, errors[]{message, path, label?}}`.
- [P47] https://raw.githubusercontent.com/payloadcms/payload/main/packages/payload/src/errors/APIError.ts — `(message, status = 500, data, isPublic)`.
- [P48] https://payloadcms.com/enterprise/ai-framework — auto-embedding/RAG, enterprise.
- [P49] https://payloadcms.com/enterprise/visual-editor — "Coming Soon", point-click-edit, enterprise.
- [P50] https://payloadcms.com/docs/live-preview/overview — `admin.livePreview`, `postMessage`, preview only.

### Secondary

- [S1] https://payloadcms.com/community-help/github/question-about-array-field-put-rest-api — "There isn't a PATCH operation that would give you the ability to partially update arrays… custom endpoint" (Community Help, not docs).
- [S2] https://github.com/teunmooij/payload-tools — `payload-openapi`, `payload-swagger`.
- [S3] https://github.com/maximseshuk/payload-plugin-openapi — OpenAPI 3.0/3.1/3.2, Scalar/Swagger UI; https://github.com/payloadcms/payload/discussions/2432 (OpenAPI discussion, none in core).
- [S4] https://github.com/payloadcms/payload/discussions/14318 — RFC MCP Plugin, 23/10/2025, @kendelljoseph; the "accidental mass updates" comment.
- [S5] https://www.npmjs.com/package/@payloadcms/plugin-mcp — 3.88.0 according to search results (the page returns 403 on fetch).
- [S6] https://github.com/ashbuilds/payload-ai and https://www.npmjs.com/package/@ai-stack/payloadcms — community AI plugins.
- [S7] https://payloadcms.com/enterprise/multi-player-editing — marketing page, not docs.
- [S8] https://github.com/payloadcms/payload/issues/8418, https://github.com/payloadcms/payload/issues/8778 — issues about `payload-locked-documents`/`duration` (context, not used for claims).
