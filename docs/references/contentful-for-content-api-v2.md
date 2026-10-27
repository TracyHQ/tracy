---
description: Contentful (headless CMS SaaS) read from the official docs on 25–26/09/2026 — identity, Rich Text AST, CDA/CPA/CMA, sys.version + JSON Patch, Sync API, Content Source Maps, AI Actions/MCP — compared with Tracy's Content API v1 and v2 plan; 14 additional bullets labelled generic/CMS-only/do not copy; does not decide on the PO's behalf.
sources:
  - docs/references/content-api-v1.md
  - docs/references/content-api-v2-vs-shopify-ucp.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-content-api/schema.json
  - packages/tools/tracy-site-tools/src/host/surface.mjs
---

# Contentful — a reference point for Content API v2

Context: after the four Shopify/UCP documents (25/09), Lee (PO) wanted to look at a source *closer
to the nature of content than of product*. This document covers only **Contentful** (Sanity and
Storyblok are written by another session). The focus is on what a product API **does not have**:
locale at the field level, Rich Text as a JSON AST, two read doors (published/draft) with separate
tokens, `sys.version` as an optimistic lock on each entry, JSON Patch, the Sync API, per-entry
snapshots, and **Content Source Maps** — display strings that carry a pointer back to
(entry, field, locale).

Conventions: every claim has a URL in the "Sources" section (numbered `[n]`); "**unconfirmed**" =
could not be read on a primary source in this session, no guessing. The 19-topic G/C/CMS table in
[`content-api-v2-vs-shopify-ucp.md`](content-api-v2-vs-shopify-ucp.md) is **not
repeated**; only what Contentful adds is stated. Tracy terminology: the v1 envelope in
[`content-api-v1.md`](content-api-v1.md) (`contents[].blocks[].fields[]{slotKey}`, opaque id,
`translationGroupId`, 5-minute signed cursor, 256 KiB), the plan in
[`tasks/todo-content-api-v2.md`](../../tasks/todo-content-api-v2.md) (V2-1…V2-5).

Context note: Contentful is a **multi-tenant SaaS** (space → environment → entry), and since 2026
it belongs to Salesforce (banner on the help center [22]). Many things below exist because they
serve strangers through a CDN; Tracy's customer sites on the fleet have seats, have the Claude
Cowork plugin, and have no CDN — the label **[do not copy]** is used for exactly that.

## (a) Identity and addressing

- **`sys.id` is the key; slug is just a field.** An entry is addressed by `sys.id` in all three
  APIs; there is no notion of a system slug. Going from a URL to an entry is a **query by field**:
  `entries?content_type=<id>&fields.slug=<slug>` — the search parameters page states the equality
  operator "querying an entry by an ID value instead of retrieving the Entry directly, which
  allows you to include resolved links" [9]; "it is recommended to use the equality search
  operator when searching for slugs". Slug uniqueness is a **`unique` validation** on the field,
  checked **at publish time**: "Validates that there are no other entries that have the same field
  value at the time of publication" [38]. `sys.id` cannot be changed ("You can't update any of the
  sys property fields, including sys.id"), can be chosen at creation, `^[a-zA-Z0-9-_.]{1,64}$` [1].
- **Locale at the field level** ("Field-level - A built-in localization pattern … multiple locale
  fields within an entry"): the value is `fields.title["en-US"]`; there is a fallback locale ("when
  it is empty, you would like to have France-French content take its place"); a locale can be
  enabled *per field* ("page title to be localized but the event date … same value") [10]. The
  docs also describe **entry-level localization** as a *pattern* built by the user (a content type
  "Article - Global" with a localized reference field pointing to "Article - Local" per locale)
  with the drawbacks "No fallback behavior" and "Governance limitations" [10]. There is no system
  "translation group"; the translation group **is the entry itself** (one `sys.id`, many locales).
- **Link** between entries: `{"sys":{"type":"Link","linkType":"Entry","id":…}}`; the CDA resolves
  links against **published**, the CPA against **draft**; an unresolvable link does **not** appear
  in `includes` but becomes a `notResolvable` error in the response's `errors[]` [11]. `include=1`
  by default, at most `include=10`; an item already in `items` is not repeated in `includes` [11].
  The reverse direction: `links_to_entry=<id>` (which entries point to this entry) [9].
- **Cross-space references**: a `ResourceLink` field type on the content type; the CMA has a
  separate endpoint to create/update them [12]. Content Source Maps do not support cross-space yet
  [16].
- An **environment** is a copy of the whole space (sandbox); an **environment alias** (`master` +
  up to 2 custom on plans that have them) is a pointer that changes target [7][13]. For Tracy this
  is the "whole-site branch" model — see (d).

## (b) Content structure — Rich Text is an AST with no node keys

- Rich Text returns "pure JSON rather than HTML", "a JSON array of nodes that follows the
  format of an abstract syntax tree": `nodeType: document → paragraph → text`, each node has
  `data`, `content[]` or `value` + `marks[]`; an embedded entry/asset is a node with
  `data.target.sys{id, linkType}` — "a reference with no data — yet" [14].
- **Nodes have no id/key — confirmed from the source code.** `interface Node { readonly nodeType:
  string; data: NodeData }`, `Text { value; marks }` — no `id`/`key` anywhere [15].
  "Custom node types and marks are not allowed" [14]. Consequence: the address of a passage in Rich
  Text can only be an **index** (`content/0/content/1`), which does not survive edits.
- **Partial entry edit: CMA `PATCH …/entries/:id`** with `Content-Type:
  application/json-patch+json` (RFC 6902), `X-Contentful-Version` **required**; example path
  `/fields/title/en-US` [3]. "JSON Patch cannot perform operations on non-existing fields… The
  accepted workaround is to pass the entire sub-object to the top-most existing field, including
  locale and initial value" [2]. PUT replaces the whole body: "Contentful doesn't merge changes"
  [1]. The docs only give an `op: "add"` example; the SDK declares all six RFC 6902 ops (`add|
  remove|replace|move|copy|test`, `lib/common-types.ts`) — whether the server accepts all six:
  unconfirmed [52]. A path going **into** Rich Text (`/fields/body/en-US/content/0/…`) — the docs
  only give field-level examples; **unconfirmed**, and even if accepted the path is positional
  because nodes have no id (their own CSM reader addresses text nodes by the pointer
  `${path}/content/${i}/value` — proving it can be *read* by pointer, not proving PATCH accepts it)
  [49].
- Modular content ("sections") = an array of Links in a reference field, "an ordered list of
  related items" [11]; the annotation `Contentful:AggregateComponent` marks that field as "page
  components" [38]. Limits: 1,000 links across the whole entry, 50 fields/content type, Short text
  256 characters, Long text 50,000, Rich Text 200,000 characters / 1 MB, entry 2 MB [5][39].

## (c) Delivery vs Management

- Three (four) APIs, **same `sys.id`**: CDA `cdn.contentful.com` (published), CPA
  `preview.contentful.com` ("same behaviour and parameters as the CDA, but delivers the latest
  drafts"), CMA `api.contentful.com`, GraphQL (`preview: true` to read drafts) [17][11]. The CPA
  uses a **separate token**: "Your production access tokens will not work with the Preview API …
  helps prevent accidentally leaking unpublished content" [17].
- **Same `sys.*` names, different meaning per API** — official table: CDA `createdAt` = CMA
  `firstPublishedAt`, CDA `updatedAt` = CMA `publishedAt`; CPA `createdAt/updatedAt` = the actual
  creation/edit time [17]. This is exactly the kind of trap behind v1's `publication.valueSource`.
- **Version state**: `sys.version`, `sys.publishedVersion`, `sys.publishedCounter`,
  `firstPublishedAt`, `publishedAt`, `updatedAt`, `createdBy/updatedBy/publishedBy`; publish =
  `PUT …/entries/:id/published` with `X-Contentful-Version` [1][40]. The CDA only has published:
  `sys.revision` = number of publishes [19]. Locale-based publishing (Premium): publish each locale
  separately, state in `sys.fieldStatus` [2].
- **Permissions**: a custom role has "Content permissions … enable a role to do specific actions
  with specific entries, content types, **fields**, tags and locales" through Allow/Deny rules
  [18]. In the API, a policy has a **`paths`** constraint limiting *update* to field and locale:
  `{paths: [{doc:'fields.total.en-US'}, {doc:'fields.%.de-DE'}, {doc:'fields.pi.%'}]}` —
  "There are no paths constraints for the create action" [41]. So **field-level × locale-level
  for writes** is real and applies only to update. CDA/CPA tokens belong to the space and carry no
  user role; to hide a field from delivery, set `omitted`/`disabled` on the content type [38].
- Default roles see only `master`; a custom role can be granted specific environments, and "content
  and media rules will apply only in the master environment or the master alias, and not in
  sandbox environments" [13].

## (d) Revision, consistency, cache, sync, snapshot

- **Optimistic lock per entry**: every PUT/PATCH/publish needs `X-Contentful-Version`; wrong or
  missing → `409 Conflict`, `sys.id: "VersionMismatch"` ("you didn't specify the current version
  of the object or specified an outdated version") [4][3]. Errors have `sys{type:"Error", id}`,
  `message`, and `details` for input errors [4].
- **ETag/304 on every API**: "Every API response (both single resources and searches) includes an
  ETag header … If-None-Match … 304 Not Modified" [6]. Rate limits do not count requests that hit
  the CDN cache; CDA 55 req/s (free) / 78 (paid), CPA 14/20, CMA 7/10 **per second per space**;
  429 with `X-Contentful-RateLimit-Reset` and `X-Contentful-RateLimit-Second-Limit` [5][19].
  The CMA's hourly limit — unconfirmed.
- **Sync API** (CDA/CPA): `sync?initial=true[&type=Entry|Asset|Deletion|DeletedEntry|
  DeletedAsset][&content_type=]`; the response has `nextPageUrl` (more pages) or `nextSyncUrl`
  (done, keep for next time) containing an opaque `sync_token`; deletions return
  `DeletedEntry`/`DeletedAsset` without content; "If a client loses the nextSyncUrl, the client
  should delete its local content and perform an initial synchronization again"; initial filters
  "persist across subsequent syncs"; always returns **every locale** [20]. `limit`: the concept
  page says "maximum of 1000", the endpoint page says "Max is 100, default is 100" — **two primary
  sources contradict each other**, and limit "is then encoded in the synchronization token" [20].
  **CDA only**: "The Preview API does not implement the Sync API" [17]; not on GraphQL [42]; CSM is
  not generated for Sync [27]. Whether the sync token expires — unconfirmed.
- **No point-in-time snapshot of the whole space.** The closest things: (1) Sync = incremental,
  not point-in-time; (2) **environment** = a copy of the whole space as a sandbox/branch, with an
  alias to switch target [7][13]; (3) **per-entry snapshot**: "Contentful produces a snapshot of an
  entry each time it is published or republished"; `GET /entries/Y/snapshots`, `GET
  …/snapshots/Z` return `{sys{type:"Snapshot", snapshotType:"publish", createdAt, createdBy},
  snapshot{sys, fields}}`, **only on `master`**; content types also have snapshots [21][8]. The API
  has only two GETs; restoring ("individual fields or the entire entry", compared at the field
  level) is a **web app** feature — there is no restore endpoint [21][43].
- **Webhook**: topic `ContentManagement.<Type>.<action>` with Entry: create, save, auto_save
  (every 5 s while typing), archive, unarchive, publish, unpublish, delete; wildcard `Entry.*`;
  AND filters on `sys.id`, environment, content type, creator/editor; a filter on a non-existent
  property → false (an `Asset.publish` webhook gets swallowed by a content type filter); headers
  `X-Contentful-Topic`, **`X-Contentful-Idempotency-Key`** (SHA-256 of the event); 3 retries within
  ~1 minute on 429/5xx, 30 s timeout; delete/unpublish send a `DeletedEntry` tombstone [23][44].

## (e) Schema / discovery

- **Content types are on the CDA** (no CMA needed): `GET cdn.contentful.com/spaces/:s/environments/
  :e/content_types[/:id]` [24]. The CMA content type page is very long (28 KB) with `fields[]{id,
  name, type, required, localized, validations, items, linkType}` — the field names were read, but
  verbatim examples of each validation: not extracted in this session.
- The **editor interface** is a separate resource (a widget per field) [25]; Content Source Maps
  use `editorInterfaces` itself to decide which strings get encoded (see (i)).
- GraphQL has a schema generated from content types, introspection through GraphiQL [26].
- MCP has `list_content_types`/`get_content_type` (see (h)).

## (f) Query, pagination, limits

- Flat `skip`/`limit`, default 100/page ("retrieves the next 100 resources by … changing
  the skip"); should be paired with `order` for stability [17]. **New cursor pagination**:
  `entries?pageNext={cursor}` / `pagePrev=`, the response has `pages.next`; "All query parameters
  used in the initial request apart from limit are locked and encoded in the cursor token";
  **`total` is absent** when using a cursor [17]. So Contentful went from flat → cursor, the
  opposite direction of v2's proposal A3 (cursor → flat `page`) — but their reason is large
  datasets on a CDN, not snapshots.
- `select=sys.id,fields.productName`: at most **100 properties, 2 levels deep** (`fields.x.en-US`
  is invalid; for one locale combine with `locale=`); "only the content linked to a field you
  select will be returned" [9]. The Content Source Maps docs warn that a `select` that drops `sys`
  breaks CSM [27].
- `include` 0–10 [11]; `links_to_entry` [9]; full-text `query=` matches every field in every
  locale, phrase search with double quotes; `limit` default 100, **max 1,000** (400 if more),
  `skip` has no ceiling stated in the docs [9]. Sizes: request 1 MB, **response 7 MB**, URI 7,600
  characters [5].
- GraphQL: "up to 11000 entities in one request"; cost = the number of entries/assets that **could**
  be returned (rich text `links` count at the field's max, default 1,000); header
  `X-Contentful-Graphql-Query-Cost`; errors `TOO_COMPLEX_QUERY`, `QUERY_TOO_BIG` [19].

## (g) Validation and errors

- Common shape: `sys.type: "Error"`, `sys.id` = code (`BadRequest`, `InvalidQuery`,
  `AccessTokenInvalid`, `AccessDenied`, `NotFound`, `VersionMismatch`, `ValidationFailed`,
  `UnknownField`, `InvalidEntry`, `RateLimitExceeded`, `ServerError`, `Hibernated`), `message`,
  and `details` "structured data that indicates more precisely what was wrong with the input"
  [4]. The accompanying HTTP code is fixed (422 for the three validation codes).
- `details.errors[]{name, path[]}`: the docs print no example; the closest evidence is a response
  pasted by a user in an issue on the official SDK: `{"name": "notResolvable", "link": {…},
  "path": ["fields","recommendations","en-GB",5]}` with `"message": "Validation error"` [45];
  the SDK passes `details`/`requestId` through unchanged and sets `error.name = sys.id` [46].
  `value`/`details` on each item — unconfirmed. Worth copying: **`path` is an array that goes all
  the way to the index within an array, locale included** — exactly the shape of v1's
  `error.field{contentId, blockId, itemId, key}`.
- Validations exist on the content type: `linkContentType, in, linkMimetypeGroup, size, range,
  regexp, prohibitRegexp, unique, dateRange, assetImageDimensions, assetFileSize,
  enabledNodeTypes, enabledMarks`, `nodes` per node; "existing entries will not be validated until
  they are re-published" [38].
- Bulk actions have `validate` alongside `publish`/`unpublish` (a "check first, write later" step
  at the level of a set of entries; ≤ 200 items, ≤ 5 running jobs, async status) [28]; its error
  shape — unconfirmed.

## (h) AI / agent

- **AI Actions** are a CMA resource: create (instruction template + variables + model), publish,
  then `POST …/ai/actions/:id/invoke` with `variables[]{id, value}` → `201` `AiActionInvocation`
  with `status: "SCHEDULED"`, poll `GET …/invocations/:id` → `status: "COMPLETED"`, `result:
  {type:"text", content, metadata{invocationResult{modelId, outputFormat, wordCount}}}`,
  `outputFormat` `RichText | Markdown | PlainText` [29][30]. **Returns text, does not write the
  entry** — there is no "apply" endpoint; the MCP README says plainly "invocation generates content
  but doesn't write to the environment" [34]. Input variables: `Text` (`in`, `strict`), `Locale`
  (Target/Source — "AI output will be written to this locale"), `MediaReference`, `Reference`
  (Link + `entityPaths` as a JSON Pointer such as `/fields/title`), `StandardInput` [47]. "AI
  actions run on entire fields only, not a selection of text"; the editor has "Entry-level" and
  **"Field-level AI Actions"**; undo in the editor is the back button or reloading the page
  [31][32]. **Bulk runs have a review before applying**: ≤ 200 entries, view the diff,
  approve/decline/adjust each one, **detects stale entries** when someone edits in the meantime,
  applies to the environment or a Release, kept for 7 days [48]. Limits: 20 actions/space, 20
  invocations/minute, 10 variables [5].
- **MCP server** (remote OAuth 2.1 + local PAT): tools by domain — Entries
  (`search_entries`, `semantic_search`, `get_entry`, `create_entry`, `update_entry`,
  `publish_entry`, …, `get_entry_snapshot`, `resolve_entry_references`), Content Types, Assets
  (two-phase upload), Releases (`validate_release`, `publish_release`), Locales, AI Actions,
  Taxonomy, Editor Interfaces. The remote server has an **allow-list per space/environment by tool
  group, read-only or read/write**, on top of the user permission layer; the local server = the
  PAT's permissions [33]. **There is no JSON Patch tool.** `update_entry` (source code
  `tools/entries/updateEntry.ts` [53]): `version` required "as returned by get_entry … The update
  is rejected if this does not match"; internally it is get → compare `sys.version` (mismatch →
  "Version conflict … Re-fetch the entry with get_entry and retry") → **top-level field merge**
  `{...existing.fields, ...args.fields}` → **PUT the whole entry** [34]. `append_entry_field` is the
  only tool that edits *below* a field (appends to an array field, dedupes by `sys.id`). Search
  results are wrapped by `summarizeData → {items (≤ 10 by default), total, showing, remaining,
  message: "To see more entries, please ask me to retrieve the next page."}`; `publish_entry` has
  `dryRun`; `PROTECTED_ENVIRONMENTS` blocks writes/deletes; the `get_initial_context` guidance:
  "Before updating any item, fetch it first to get the current `sys.version`", "Ask when
  ambiguous" [34]. A general confirm for every write — none (only `cancel_scheduled_release` is
  two-phase).
- Undo: per-entry snapshot on publish [21]; Releases (group entries/assets, validate then
  publish); Scheduled actions (publish/unpublish on a schedule) [33][28].

## (i) Presentation vs content — strings that carry a pointer back to the place to edit

- **Content Source Maps (CSM)**: "our APIs return source maps for certain visual fields that
  have links to the correct field in Contentful. The Live Preview SDK then transforms these …
  to hidden metadata into the results of your queries" using **steganography** — "embeds the
  metadata into invisible Unicode characters incorporated into the existing text strings" [16].
  Only on **CPA/GraphQL preview** ("only be generated for preview content"), **Premium** plan,
  launched for Live Preview on 13/09/2024 [16][27][35].
- **Raw shape** (GraphQL, under `extensions.contentSourceMaps`): `version`, `spaces[]`,
  `environments[]`, `fields[]`, `locales[]`, `entries[]{space, environment, id}`, `assets[]`,
  `mappings{"/data/post/title": {source:{entry:0, field:0, locale:0}}}` — the key is a JSON Pointer
  into the response, the value is **indexes into the lookup tables** [27]. CPA:
  `sys.contentSourceMapsLookup{fieldTypes, editorInterfaces}` +
  `sys.contentSourceMaps.mappings{"/fields/title": {source:{fieldType, editorInterface}}}` [27].
  The SDK's `encodeGraphQLResponse`/`encodeCPAResponse` turns the map into hidden characters;
  server-side it is split out with `splitEncoding(text) → {cleaned, encoded}` from
  `@contentful/content-source-maps`, a package that depends on **`@vercel/stega ^1.1.0`** +
  `json-pointer` [27][36][49]. Enabled with CPA `?includeContentSourceMaps=true` or contentful.js
  `createClient({host:"preview.contentful.com", includeContentSourceMaps:true})` (≥ 10.11.0),
  GraphQL directive `@contentSourceMaps` + `preview: true` [27].
- **Which fields are encoded**: Short text (single line widget only), Long text (single/multiple
  line), **Rich Text (including embedded references and assets)**, Short text lists, asset
  title/description (used as `alt`); **not**: URL, ISO date, Dropdown/Radio, Slug, Markdown,
  cross-space [16]. The decision is based on the **editor interface** (widget), not just the field
  type: source code `SUPPORTED_WIDGETS = ['singleLine','tagEditor','listInput','checkbox',
  'richTextEditor','multipleLine']`, `encodeField` only handles `Symbol`, `Text`, `RichText`,
  `Array` (string items) [49]. **In Rich Text, every text leaf is encoded but the pointer is still
  the field's**: `richText.ts` maps each `…/content/i/value` to the field-level source; the decoded
  payload is `{origin:'contentful.com', href: …/entries/<id>/?focusedField=<field>&focusedLocale=
  <locale>, contentful:{editorInterface, fieldType}}` — there is no passage address [49]. The
  overlay can wrap exactly the `<p>` tag (the SDK finds the stega node in the DOM), but a click
  still opens the **field** [50].
- **Manual tagging** (Live Preview inspector mode, no Premium needed): attributes
  `data-contentful-entry-id` (or `-asset-id`), `data-contentful-field-id`,
  `data-contentful-locale` (optional), `data-contentful-space`/`-environment` for cross-space;
  helper `ContentfulLivePreview.getProps({entryId, fieldId, locale})`;
  `openEntryInEditor({fieldId, entryId, locale})` [27][36]. The smallest unit is the **field**;
  there is no attribute for a passage within Rich Text (consistent with (b): nodes have no id).
- Live updates: `useContentfulLiveUpdates(originalData, {query|locale})`, needs `sys.id` in the
  data; a `postMessage` channel with `app.contentful.com`, messages `SUBSCRIBED`, `ENTRY_UPDATED`,
  `ENTRY_SAVED`, **`TAGGED_FIELD_CLICKED`** (a click on the page → the editor opens the right
  field) [36][50].
- **Experiences/Studio = layout is content**: "Experiences are queried through the Contentful
  APIs as entries", required fields `title`, `slug`, `componentTree (Object)`, `dataSource
  (Object: key → Link)`, `unboundValues (Object)` [37][51]. So their presentation is also a JSON
  entry — equivalent to Tracy's presentation-lock but **open** for writes; CSM does not tag Object
  fields (inference — unconfirmed).

## Additions to Tracy's v2 plan

Each bullet: what Contentful does → whether v1/the v2 plan has it → proposal + trade-off. Labels:
**[generic]** copyable · **[CMS-only]** true to the nature of content, should have · **[do not
copy]** specific to multi-tenant SaaS. Does not decide on the PO's behalf.

1. **Back-pointer from display strings (CSM/stega)** — Contentful embeds (entry, field, locale)
   into the string itself with hidden characters, only on preview, decided by widget [16][27]. v1
   has `slotKey` in the envelope but the **reverse path** (from the rendered page → slot) is
   `content.find` grepping files [surface.mjs]. The v2 plan **does not have it yet**. Proposal:
   do **not** encode stega into customer site HTML (it changes the bytes of the public page,
   breaks SEO/diff, and Contentful also only does it on preview); instead have `view=pages` (V2-3)
   return a **detached source map** — `mappings{"<css selector | block position>": {contentId,
   blockId, key}}` like the raw `extensions.contentSourceMaps`, so the agent and a later Visual
   Editor use the same map. Trade-off: the adapter must prove the selector is stable across three
   CMSs (Joomla module position, WP block index, EmDash field). **[CMS-only]**
2. **Lookup tables + indexes instead of repeated strings** — CSM writes `entries[]`, `fields[]`,
   `locales[]` once and then `mappings` points by number [27]. v1 repeats `slotKey`/`locale` on
   every field. With a 256 KiB budget and LLM tokens, a `describe`/`view=pages` section using
   lookup tables would be smaller. Trade-off: the consumer has to join; the validator adds a
   valid-index invariant. **[generic]**
3. **Optimistic lock per entry, required, the same header on every write door** —
   `X-Contentful-Version` on PUT/PATCH/publish, 409 `VersionMismatch` [3][4]. Plan V2-1 already has
   `expected_revision` per content instead of for the whole contract — **matches**. Addition:
   Contentful **requires** the version (there is no "leave it empty and the system fills it in"
   path); v1 today has `INSPECT_FIRST` auto-fill [surface.mjs]. Proposal: keep auto-fill for the
   old Claude Cowork plugin, but the v2 conformance test requires the adapter to **reject** an
   apply without a revision when `writable: true`. Trade-off: one more 409 round for an agent that
   reads for a long time. **[generic]**
4. **Path-based patch (RFC 6902) instead of flat `changes`** — the CMA accepts JSON Patch with path
   `/fields/<id>/<locale>`; unsetting a sub-object requires sending the whole object [3]. v1's
   `changes{slotKey: value}` is flat; the v2 plan **does not have** op-based writes yet (C3
   repeater left open). Proposal: do **not** copy RFC 6902 as is (Tracy has no JSON document to
   point into); but when doing C3, an "op + path" model (`insert before/after itemId`, `unset`)
   fits better than declarative. Trade-off: two write shapes (flat scalar + op for lists).
   **[generic]**
5. **No node keys in Rich Text → index-based addresses are not durable** — [14][15]. v1 already
   chose `blocks[].id` as a "stable occurrence ID within the page" and durable `items[].id`
   [content-api-v1 §3] — **stronger than Contentful**. Keep it; and do **not** let `bodyHtml` be a
   write target by offset. Contentful confirms the boundary: editing *inside* rich text = sending
   the whole field. Proposal: `SLOT_NOT_WRITABLE` for `type: html` fields unless the adapter can
   split out blocks. **[CMS-only]**
6. **Same name, different meaning: `createdAt/updatedAt` change meaning per API** — [17]. v1
   already has `publication.valueSource` for exactly this reason. Addition for V2-2 (`updatedAt`
   required in the summary): the spec must say **which version `updatedAt` belongs to** (draft or
   published) or return both `publishedAt` + `updatedAt` like the CMA. Trade-off: one more
   required field. **[CMS-only]**
7. **Draft/published are two doors with two tokens, same id** — CPA/CDA [17]. v1: `contentScope:
   published` built by the relay, no seat is granted draft access [content-api-v1 §Joomla pilot P2 integration].
   The v2 plan leaves `editorial` out of scope. Noted: Contentful separates them by **token**, not
   by parameter — a leaked preview token = exposed drafts. Tracy separating by seat + a
   server-computed scope is stronger; keep it. **[do not copy]** (per-space tokens are a SaaS
   thing).
8. **ETag on every response, searches included** — [6]. Plan V2-2 already has ETag/304 after auth
   for `content.read` — **matches**. Addition: Contentful computes the ETag from the **response
   content** ("changes depending on the content of the response"), not from a snapshot. Proposal:
   the relay's ETag = a hash of the envelope already filtered by principal (naturally "different
   principal → different ETag"), instead of the tuple (site, principal, scope, query, revision).
   Trade-off: the envelope has to be rendered before knowing it is a 304 — saves bytes, not Claude
   Cowork plugin seconds. **[generic]**
9. **Sync API: incremental by token, deletions are separate records, lose the token and start over**
   — [20]. v1/the v2 plan have no sync (per-record cache + a "content changed" event in C5).
   Proposal: do **not** build a Sync endpoint in v2 (the agent keeps no long-lived copy;
   conversations are short), but copy two rules: explicit `DeletedEntry` (a v2 listing by
   `updatedAt >` must also list deletions) and "lost token → start over", which already exists as
   `CONTENT_SNAPSHOT_EXPIRED`. **[generic]**, the endpoint part **[do not copy]**.
10. **Per-entry snapshot on publish, restore per field** — [21]. ADR 0021 §6: build no new undo —
    keep it. Noted for C7: Contentful has no dry-run for PUT entry; their "preview" is the CPA
    (reading drafts) + snapshots to roll back. No further proposal. **[do not copy]** (there is
    already a PO decision).
11. **Environment = whole-space branch, alias to switch target** — [7][13]. Tracy:
    presentation-lock + quickstart release + "fork" (integration decision). Do not copy
    environments (a customer site is one real DB); but if A3 drops "one apply = one whole-site
    snapshot", environments are evidence that even a large SaaS does **not** promise a whole-space
    snapshot on the ordinary read door — they move it to a branch. **[do not copy]**, used as an
    argument for Open question A3.
12. **Field-level and locale-level in roles** — Allow/Deny by entry, content type, field, tag,
    locale [18]. Plan V2-1 has `fields[].writable` per seat — **matches**, and Contentful confirms
    that field+locale granularity is something a real CMS needs. Proposal: `writable` also takes
    locale into account (a `vi` translator seat does not write `en`). Trade-off: the Joomla/WP
    adapters must map the policy per edition. **[CMS-only]**
13. **`select` 2 levels deep, at most 100 properties; the cursor locks the whole query** —
    [9][17]. v1 has no projection; plan D1 has a token budget + `truncated`. Proposal: `fields=`
    for `content.read` (top-level field names only, not into blocks) like `select`; and for V2-2,
    the "cursor locks the filter" rule v1 already has. Contentful drops `total` when using a
    cursor — v1 already gives `total: null`. **[generic]**
14. **MCP: allow-list by tool group × read-only/read-write, set on the server, not the client** —
    [33]. Plan V2-5 has a ceiling of ≤ 12 actions/surface. Addition: tool permissions are set
    **on the relay per seat** (Tracy already does this with toolsets), independent of the tool
    description. There is no "confirm before every write" in the Contentful MCP (only one
    two-phase tool) — the same conclusion as C7: do not require confirming every write.
    **[generic]**
15. **AI generation separated from writing; bulk writes have a diff + stale detection** — an AI
    Action returns text, does not write [34]; a bulk run shows the diff, approves each entry, and
    **detects stale** entries when someone edits in the meantime [48]. This is an empirical answer
    to Open question C7: Contentful chose "generate → person/agent applies → optimistic lock at
    apply time", no dry-run on PUT. For Tracy: `apply {dry_run}` returning a diff (already
    proposed in C7) + `expected_revision` per content (V2-1) is the right pair; `stale` is exactly
    the per-content 409. Trade-off: a dry-run costs one Claude Cowork plugin turn. **[generic]**
16. **Webhooks carry `X-Contentful-Idempotency-Key` = SHA-256 of the event** — [44]. Plan C4 (TTL
    for `request_id`, no body comparison) does not yet say what key the "content changed" event
    (C5) carries. Proposal: Tracy's event carries `idempotencyKey` = hash(site, contentId,
    revision) so caches/agents can drop duplicates. **[generic]**

**The v2 plan DOES NOT YET have** (collected from above): (1) a detached source map for
`view=pages`; (2) lookup tables + indexes; (4) op + path for repeaters; (6) the meaning of
`updatedAt`; (12) `writable` per locale; (13) a `fields=` projection; (16) an idempotency key on
events. **Already has/matches**: (3) revision per content, (8) ETag, (9) expired → start over,
(14) tool ceiling, (15) dry-run + stale = C7 + V2-1. **Do not copy**: (7) preview token, (10)
snapshot/undo, (11) environment.

## Unconfirmed (so readers do not cite it by mistake)

- How a JSON Patch path going into Rich Text is accepted/validated (the docs only give field-level
  examples).
- A `details.errors[]` example **on the docs pages** (only from issue #131 of the official SDK);
  `value`/`details` on each item; the error shape of bulk `validate`.
- The CMA's hourly limit (the docs only give per-second); the `skip` ceiling; whether the CMA
  honours `If-Match`.
- Whether the Sync token expires; whether Sync is scoped per environment (the page says "Sync
  contains content from all environments").
- Whether the MCP's `update_entry` is PUT or PATCH; `sys.archivedVersion`.
- Whether CSM tags Object/JSON fields; runtime node ids in Rich Text beyond the type definitions.
- A REST endpoint to restore a snapshot (not found; the web app does it).

## Sources (primary sources only, read 25–26/09/2026)

1. <https://www.contentful.com/developers/docs/references/content-management-api/> (CMA overview)
2. <https://www.contentful.com/developers/docs/references/content-management-api/entries/get-an-entry>
3. <https://www.contentful.com/developers/docs/references/content-management-api/entries/patch-an-entry>
4. <https://www.contentful.com/developers/docs/references/errors/>
5. <https://www.contentful.com/developers/docs/technical-limits/>
6. <https://www.contentful.com/developers/docs/references/http-details/>
7. <https://www.contentful.com/developers/docs/references/content-management-api/environments>
   and <https://www.contentful.com/developers/docs/references/content-management-api/environment-aliases>
8. <https://www.contentful.com/developers/docs/references/content-management-api/snapshots/get-all-snapshots-of-an-entry>
9. <https://www.contentful.com/developers/docs/references/content-delivery-api/search-parameters>
10. <https://www.contentful.com/developers/docs/concepts/locales/>
11. <https://www.contentful.com/developers/docs/concepts/links/>
12. <https://www.contentful.com/developers/docs/references/content-management-api/cross-space-references>
13. <https://www.contentful.com/developers/docs/concepts/multiple-environments/>
14. <https://www.contentful.com/developers/docs/concepts/rich-text/>
15. <https://github.com/contentful/rich-text> (root README and `packages/rich-text-types`)
16. <https://www.contentful.com/developers/docs/tools/vercel/content-source-maps-with-vercel/>
17. <https://www.contentful.com/developers/docs/references/content-preview-api/> (with the `sys.*`
    per-API table and the cursor pagination section on the CDA/CPA overview page)
18. <https://www.contentful.com/help/roles/space-roles-and-permissions/content-permissions/>
19. <https://www.contentful.com/developers/docs/references/content-delivery-api/overview>
    and <https://www.contentful.com/developers/docs/references/graphql/overview>
20. <https://www.contentful.com/developers/docs/references/content-delivery-api/synchronization>
21. <https://www.contentful.com/help/faq/versioning/>
22. <https://www.contentful.com/help/> (banner "Contentful is now officially part of Salesforce")
23. <https://www.contentful.com/developers/docs/webhooks/> and
    <https://www.contentful.com/developers/docs/webhooks/filters/>
24. <https://www.contentful.com/developers/docs/references/content-delivery-api/content-types/get-a-content-type>
25. <https://www.contentful.com/developers/docs/references/content-management-api/editor-interface>
26. <https://www.contentful.com/developers/docs/references/graphql/exploring-the-schema-with-graphiql>
27. <https://www.contentful.com/developers/docs/tutorials/preview/inspector-mode/>
28. <https://www.contentful.com/developers/docs/references/content-management-api/bulk-actions>
29. <https://www.contentful.com/developers/docs/references/content-management-api/ai-actions/invoke-an-ai-action>
30. <https://www.contentful.com/developers/docs/references/content-management-api/ai-actions/get-an-ai-action-invocation>
31. <https://www.contentful.com/help/ai-automations/ai-actions/ai-actions-in-entry-editor/>
32. <https://www.contentful.com/help/ai-automations/ai-actions/>
33. <https://www.contentful.com/developers/docs/tools/mcp-server/>
34. <https://github.com/contentful/contentful-mcp-server> (README)
35. <https://www.contentful.com/developers/changelog/improved-inspector-mode-for-live-preview-via-content-source-maps/>
36. <https://github.com/contentful/live-preview> (README)
37. <https://www.contentful.com/developers/docs/experiences/>
38. <https://www.contentful.com/developers/docs/references/content-management-api/content-types>
39. <https://www.contentful.com/developers/docs/concepts/data-model/>
40. <https://www.contentful.com/developers/docs/references/content-management-api/entries/publish-an-entry>
41. <https://www.contentful.com/developers/docs/tutorials/general/roles-via-api/>
42. <https://github.com/contentful/contentful.js> (README, Sync section)
43. <https://www.contentful.com/help/content-and-entries/versions/>
44. <https://www.contentful.com/developers/docs/extensibility/webhooks/content-events/>,
    <https://www.contentful.com/developers/docs/extensibility/webhooks/filters/>,
    <https://www.contentful.com/developers/docs/webhooks/headers/>
45. <https://github.com/contentful/contentful-management.js/issues/131> (issue on the official
    repo; response pasted by a user — weaker evidence than the docs)
46. <https://github.com/contentful/contentful-sdk-core/blob/master/src/error-handler.ts>
47. <https://www.contentful.com/developers/docs/references/content-management-api/ai-actions>
48. <https://www.contentful.com/help/ai-automations/ai-actions/run-ai-actions-in-bulk/>
49. <https://github.com/contentful/live-preview/blob/main/packages/content-source-maps/package.json>
    and `…/content-source-maps/README.md`
50. <https://github.com/contentful/live-preview/blob/main/packages/live-preview-sdk/src/messages.ts>
51. <https://www.contentful.com/developers/docs/experiences/data-structures/>
52. <https://github.com/contentful/contentful-management.js> (`lib/common-types.ts` `OpPatch`,
    `lib/adapters/REST/endpoints/entry.ts`)
53. <https://github.com/contentful/contentful-mcp-server> — `packages/mcp-tools/src/tools/entries/
    updateEntry.ts`, `appendEntryField.ts`, `src/utils/summarizer.ts`, `src/context/instructions.ts`
54. <https://github.com/contentful/contentful.js/blob/master/docs/ADRs/2024-01-01-content-source-maps.md>

Secondary sources: not used. How it was read: contentful.com returns 429 for plain fetches, so the
pages were rendered with headless Chrome (`chrome-watch`) and the text extracted; GitHub was read
raw.

Note for whoever commits: written on a local checkout behind `origin/develop`; `sources:` points to
files that exist on `origin/develop` (`content-api-v1.md`, `schema.json` are not yet on this
machine). Run `pnpm docs:index` before opening a PR.
