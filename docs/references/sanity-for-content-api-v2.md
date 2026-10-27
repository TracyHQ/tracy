---
description: Sanity Content Lake compared with Tracy's Content API v2 — identity, Portable Text with _key and patches by JSONMatch path, perspectives/Content Releases, _rev + ifRevisionID + transactions, Live/Listen/webhooks, schema deploy, limits, errors, Agent Actions/MCP/Functions/Canvas, Presentation + Content Source Maps + stega; ends with 14 additions labelled generic / CMS-only / do not copy.
sources:
  - docs/references/content-api-v1.md
  - docs/references/content-api-v2-vs-shopify-ucp.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-content-api/schema.json
---

# Sanity for Content API v2 — an agent edits content by schema, and content points back to where it is displayed

Research dated 25/09/2026, Sanity only (Shopify/UCP already have the
[19-topic table](content-api-v2-vs-shopify-ucp.md); the G/C/CMS labels there are not repeated).
Compared against the [v1 envelope](content-api-v1.md) and the [v2 plan](../../tasks/todo-content-api-v2.md)
(V2-1 `writable` + revision per content to drop `inspect` · V2-2 revision/`updatedAt`/ETag/flat
`page` · V2-3 `describe` + `view=pages` · V2-4 errors `{code, field, severity}` · V2-5 tools for the agent).

Sources are only sanity.io/docs, the changelog, technical blogs and github.com/sanity-io; every claim
carries a number `[Sn]` pointing into the **Sources** section at the end of the file. Wherever the
official docs cannot say, "unconfirmed" is written on the spot. Sanity is a multi-tenant SaaS (one
Content Lake for every customer, schema written code-first by developers); Tracy is one customer site
on the fleet, the schema is the quickstart's contract. That difference is the reason for the
**[do not copy]** labels at the end.

Quick reading guide: sections (b) and (i) are the two places that match `slotKey` directly; section
(h) is the closest pattern to "an agent edits content by schema"; section (d) answers the question of
the 5-minute signed cursor + whole-site snapshot.

## (a) Identity

| Sanity | Rule (source) | What Tracy v1 has |
|---|---|---|
| `_id` | Arbitrary string up to 128 characters `a-zA-Z0-9._-`, not starting with `-`, no two consecutive dots; **immutable** after creation; **every ID ever written is kept forever** until the dataset is deleted [S1] | opaque `id`, stable across slug changes, deleting and re-creating must yield a new ID (v1 §3) — equally immutable, but Sanity keeps deleted IDs, Tracy only forbids reuse |
| `drafts.<id>` | A draft is a **separate document** with the same `_id` under a prefix; publish "copies from the draft to the document without the `drafts.` prefix"; drafts "do not show on the API for unauthenticated users" [S2]. Sanity advises against creating IDs with the `drafts.`/`versions.` prefix yourself [S1] | v1 has no draft-as-record: `publication.valueSource` says which version the consumer is reading |
| IDs with a dot | "Any document ID containing a dot is considered private and has restricted accessibility" [S1] | no equivalent — Tracy checks permissions on every request per seat |
| `_type` | Type name in the schema; the Content Lake is schemaless, `_type` is a free string [S3] | `type` is a closed enum page/article/service/project/shared/generic |
| Reference | `{_type:"reference", _ref, _weak?, _strengthenOnPublish?}`; a strong reference "will not allow deletion of a document that any other document refers to"; deref with `->` in GROQ; `references(id)` searches backwards [S4] | one-way `relations[]{type, contentId}`, only targets the seat can read; no deletion constraint |
| Slug | The `slug` type stores `{_type:'slug', current}`; **uniqueness is only checked in Studio** (`isUnique`), per document type + field path; read by slug: `*[_type=="movie" && slug.current==$slug][0]` [S5] | `slug`/`url` are the current address, "not a join key" (v1 §3); v2 plan B3 adds `?slug=&type=&locale=` |

**The path from URL to document.** Sanity has no route table in the Content Lake: URL → document is
the frontend's job, and the Presentation tool does the reverse with `defineDocuments({route:'/posts/:slug',
filter:'_type=="post" && slug.current==$slug'})` — "evaluates routes in order and uses the first
match"; no match selects no document [S6]. So Sanity **also** has to hand-write a route → document
map, like Tracy's `content-map.json` (table B7 says do not create a third map).

**Two kinds of i18n, both plain data, not a Content Lake feature** [S7]:

- *Document-level* — `@sanity/document-internationalization`: one document per language with a
  `language` field; a `translation.metadata` document holds `translations[]` with `_key` = language
  code and `value` = reference (optional `weakReferences`); read with
  `*[_type=="translation.metadata" && references(^._id)].translations[].value->` [S8]. This is exactly
  v1's `translationGroupId` (one confirmed group, each translation its own id), the only difference
  being that Tracy embeds the group id into the record instead of an intermediate document.
- *Field-level* — `sanity-plugin-internationalized-array`: the field is an array
  `[{_key, language, value}]` (from v5 the language code moved from `_key` to the `language` field);
  the reason for choosing an array over an object is the **attribute count**: adding a language does
  not add query paths, because of the limit of 1,000 attributes per document (section f) [S9].

Sanity itself says Portable Text suits document-level better than field-level [S7] — the same
conclusion as Tracy (a translation is separate content, in the same group).

## (b) Portable Text, `_key` and patches by path — where it matches `slotKey`

**Structure.** A block is `{_type:"block", _key, style, children:[{_type:"span", _key, text,
marks}], markDefs:[{_key, _type, ...}]}` [S10]. `_key` sits on the block, the span and the markDef.

**How stable `_key` is.** The form path docs say plainly: "This unique key is generated upon object
creation" and "uniquely identifies the object it refers to, and it's immutable throughout the
lifetime of the object"; addressing by index goes wrong when two people edit at the same time (Alice
reorders, Bob edits an item — if the patches arrive out of order Bob edits the wrong object),
addressing by key means "the order of the actions no longer matters" [S11]. In the array type: "each
item gets assigned a persistent and unique `_key`"; setting `_key` by hand in `initialValue` "will
not work" [S12]. Span: `_key` is "the only way to address a span in a patch" [S13]. The Mutation API
has `autoGenerateArrayKeys` to "add a `_key` attribute to array items, unique within the array" when
the client forgets [S14]. Uniqueness scope is **within the array**, not the whole document [S15 — secondary].

**Partial patches.** Patch kinds: `set` (shallow merge), `setIfMissing`, `unset` ("missing
attributes are ignored"), `insert` with `before`/`after`/`replace` into an array position,
`inc`/`dec`, `diffMatchPatch` (Google's diff-match-patch algorithm) [S16]. Paths are JSONMatch:
attribute `a.b.c`, index `arr[2]`, `arr[-1]`, slice `arr[2:]`, wildcard `[*]`, constraint
`friends[age > 35]`, key `some.array[key == "abc-123"]`, recursive `..`, union `[0, 1]`; **no
`&&`/`||` yet** — a comma is "or", chained brackets are "and" [S17]. Official examples include
`body[_type=="cta"].text` and `blocktext..[key="list-123"].items[0]` [S16]; the form `body[_key=="x"]`
appears in the Agent Actions docs (`people[_key=="someKey"].name`) [S18] and in the form path
`["pets", {_key:"m99vcit2pho"}, "name"]` [S11]. Specifically `body[_key=="x"].children[0].text` is in
no official example I read — derivable from the syntax, not confirmed by an example.

**`ifRevisionID`.** "patch mutations take an optional ifRevisionID parameter containing a document
revision ID (typically from the document's `_rev` attribute), and are only accepted if the given
revision ID matches the document's current revision ID"; mismatch → "rejected with a **409 Conflict**
HTTP status code, allowing the client to fetch the updated document and retry"; it also "guard
against submitting mutations based on outdated query results caused by the data store's eventual
consistency model" [S19].

**Compared with Tracy's `slotKey`.**

| Aspect | Sanity | Tracy v1 / v2 plan |
|---|---|---|
| Address unit | `(_id, JSONMatch path)` — the path is the **data structure** already in the document; an agent that reads the document has the path to write | `slotKey` — an opaque key looked up server-side by the binding, tied to the profile hash + permissions (v1 §3); v2 A2 requires every non-null `slotKey` to be applicable with the key as is |
| Stable key | `_key` immutable for the object's lifetime, generated at creation; addressing by key survives reordering | `blocks[].id` "stable within the page", `items[].id` stable (v1 §3) — same idea, but v1 does not yet say *who generates it* and *whether it is immutable across admin edits* ("do not call a test fixture verification that IDs are stable across admin edit", v1 §7) |
| Written value | any JSON at the path; `set` is a shallow merge; `insert` into an array by position | flat `changes{slotKey: value}` — scalar; no insert/unset/append (C3 repeater left open) |
| Editing long text | `diffMatchPatch` — send a diff, not the whole string | send the whole value; long bodies go through 413 + `links.firstBlock` |
| Optimistic lock | `ifRevisionID` **per document**, 409 | `expected_revision` per **contract** (v1) → V2-1 moves it to per content — the Sanity direction |
| Who checks structure | the Content Lake does **not** run the schema's validation rules (section g); only Agent Actions Patch/MCP are schema-aware | the Claude Cowork plugin checks against the contract (`maxCharacters`, allowed operations), the only "write rulebook" (v1 §3) |
| Points back to where it is displayed | Content Source Map + stega (section i) | `content-map.json` + `slotKey`; no path yet from the rendered page back to the key |

Conclusion: Sanity has no `slotKey` because **the path is the slotKey** — the document is a
self-describing JSON tree, every node is a write target. Tracy cannot drop `slotKey` (the write target
is an entity/column/selector of three different CMSes, v1 §4), but it can let `slotKey` carry **path
semantics** (additions §1, §2).

## (c) Query vs mutate

- **GROQ** reads; the Mutation API and Actions API write; GraphQL is read-only — "Mutations are not exposed
  through the GraphQL API but rather through our powerful Mutation API" [S20].
- **Perspectives** on the query endpoint (`perspective=`): `published` (drops every draft/version),
  `drafts` (formerly `previewDrafts`; treats every draft as published, deduplicates preferring the
  draft, with `_originalId`), `raw` (returns all three), and **release id** — one or many, stacked
  `perspective=release-a,release-b,release-c` = "as if `release-c` had been published, followed by
  `release-b` and finally `release-a`"; `published` is appended automatically [S21][S22]. The default
  changed from `raw` to `published` with API version `2025-02-19`; `versions.**` are not returned on
  older API versions [S22]. `useCdn` **must be false** for `drafts` and release previews [S23].
- **Content Releases** (19/02/2025, "Available for Enterprise plans") [S24]: a version in a release is a
  document `versions.<releaseId>.<docId>`; a release is `_.releases.<id>` with `releaseType`
  asap/scheduled/undecided and `intendedPublishAt`; actions create/edit/schedule/unschedule/publish/
  archive/unarchive/delete for releases, create/discard/replace/unpublish for versions; GROQ
  `sanity::partOfRelease()` [S25]. Layering order when viewing: Published → Draft → ASAP → Timed →
  Undecided; "each release can only contain one version of a document" [S26]. Limit of 1,000 versions
  and 100 MB per release [S27].
- **Tokens/permissions:** drafts and IDs with a dot need authentication [S1][S2]; Agent Actions "Only bearer tokens
  are allowed" [S28]; MCP "provide a personal token, which will share your role and permissions"
  [S29]. Permissions are a **role on the project** — no notion of per-field/slot permissions. Tracy: the
  caller is a seat, `writable` per seat on a field (V2-1) is something Sanity does not have.
- **CDN:** caches by URL including parameters; "Authenticated requests are cached. Caching is segmented
  for each unique authentication token"; recommends `useCdn: true` for reads from the browser [S30].
  Invalidation time after a mutation: the docs only say "we prioritize the cache invalidation queue"
  for the High Frequency CDN — the number of seconds is **unconfirmed**.

## (d) Revision, consistency, cache — compared with the 5-minute signed cursor + whole-site snapshot

| Sanity mechanism | Source | Tracy comparison |
|---|---|---|
| `_rev` per document, changes every transaction; system `_updatedAt`/`_createdAt` | [S19][S28] | v1: `revision` per content "is not by itself equivalent to expected_revision" (§3); V2-1 makes it equivalent — that is exactly `_rev` |
| `ifRevisionID` → 409 | [S19] | v1's 409 is `CONTENT_SNAPSHOT_EXPIRED` for the **cursor**; write conflicts are the Claude Cowork plugin's job. Sanity merges the two into one `_rev` |
| **Transaction**: "a group of one or more mutations are executed as a single unit"; "either all of the mutations succeed or they all fail"; many documents in one transaction; a self-assigned `transactionId` must be unique; every transaction goes into the history log | [S31][S14] | v1 apply is 1–1,500 atomic slots **within one contract/site** (C2); if v2 moves revisions to per content then "transaction across many contents" must be spelled out (addition §6) |
| `visibility`: `sync` (wait until queries see it), `async` (return on commit), `deferred` (bulk) | [S14] | Tracy's read → apply → read back is the acceptance; `sync` is the reasonable default, there is no declared equivalent |
| `dryRun`: "validated but not executed" | [S14] | C7 `apply {dry_run}` — Sanity has it built in at the API layer |
| **Listen API**: SSE `/data/listen/{dataset}`; events `welcome`/`mutation`/`channelError`/`disconnect`; `includeResult`, `includePreviousRevision`; `visibility=transaction\|query`; only the filter part of GROQ is used | [S32] | none; C5 proposes a "content changed" event |
| **GROQ-powered webhooks**: filter + projection (with `delta::`, `before()`, `after()`); create/update/delete; "Unpublishing a document fires the delete trigger"; **at-least-once**, header `idempotency-key`; retries 2 times 30 s apart; drafts/versions optional; headers `sanity-transaction-id`, `sanity-document-id` | [S33] | none |
| **Live Content API** (GA 17/03/2025): queries return `syncTags`; `/data/live/events/{dataset}` emits `message{id, tags}` when a tag expires, with `welcome`/`restart`/`error`/`goaway`; reconnect with `last-event-id`; keeps events for **15 minutes** on Free/Growth | [S34][S35][S36] | the 15-minute window ~ v1's 5-minute signed cursor, but the purpose is the opposite: Sanity says "what has changed", Tracy says "is this snapshot still valid" |
| **History API**: `/data/history/{dataset}/documents/{id}?revision=\|time=\|lastRevision=`; `/transactions[/{ids}]` with `fromTime`/`toTime`/`fromTransaction`/`authors`/`reverse`/`limit`/`excludeContent`/`effectFormat=mendoza`; NDJSON; kept 3 days Free / 90 Growth / 365 Enterprise; restore = fetch the version at `lastRevision` then `createOrReplace` with a write token | [S37][S38] | ADR 0021 §6: build no new undo. Sanity has no "undo" either — only history + writing the old version back as a new mutation |

**On the whole-site snapshot.** Sanity has no whole-dataset snapshot for readers: consistency is
**per document** (`_rev`) and **per query** (sync tag). The next page of a listing does not promise
the same snapshot — the official pagination guide recommends a cursor by `_id` (section f), i.e. it
accepts that a listing "promises no consistency between two pages" — exactly what V2-2 chose for flat
`page`. What Tracy keeps that Sanity does not have: `presentation-lock` relies on the whole-site
snapshot (Open question A3).

## (e) Schema and discovery — "what types/fields does the site have" in one call?

- The schema is **code** in Studio (`defineType`), the Content Lake does not know the schema: "The Content
  Lake is intentionally schemaless" [S3].
- `sanity schema extract` → `schema.json` (`groq-type-nodes` format); `sanity typegen generate`
  "overlay[s] the schema types over the GROQ query" to generate result types [S39][S40].
- **Schema in the cloud** — `sanity schemas deploy` "Deploys schema documents to workspace
  datasets", stored as a document `_.schemas.<workspaceName>` (or `.tag.<tag>`); the old form
  `sanity.workspace.schema.<ws>` is rejected; `sanity schemas list [--id]` to read; GA since Studio
  3.88.0 (06/05/2025); needed for Agent Actions, Canvas, Dashboard, Media Library [S41]. Agent
  Actions fails with 404 "No deployed Studio schema found for" when not deployed [S28].
- **GraphQL** `sanity graphql deploy` generates the schema from Studio, with **introspection** even when
  the playground is off; read-only [S20].
- MCP has `get_schema`, `list_workspace_schemas`, `deploy_schema` [S29].

Answer: **yes, one call** — `get_schema` (MCP) or read the document `_.schemas.<ws>` — but only after
a developer deploys the schema; the schema describes **types/fields**, not *pages* or *positions*. V2-3's
`describe()` (`types[]{type, count}`, `capabilities[]`, `locales`) is the equivalent document,
generated from the adapter instead of deployed by hand; Sanity has no per-type `count` in the schema
(it needs a GROQ `count()`).

## (f) Pagination and limits

- Sanity itself advises avoiding the slice `[0...100]`: "the most obvious way to do pagination isn't
  actually very performant" — cost is linear in the offset; it recommends the cursor
  `*[_type=="article" && _id > $lastId] | order(_id) [0...100]`, with a tiebreaker when sorting by a
  non-unique field; count with `count(*[_type=="article"])` ("watch out for large datasets") [S42].
- Limits [S27]: mutations 25 req/s, general API 500 req/s, 500 concurrent queries, 100 concurrent
  mutations; document 32 MB; mutation body 4 MB; query working set 500 MB; POST through the CDN
  307,200 bytes; a query runs at most 1 minute, a mutation 3 minutes; 1,000 attributes/document
  (Free/Growth, 8,000 Enterprise); 20 nesting levels; delete-by-query at most 10,000 documents [S14];
  listeners 1,000/5,000/10,000 by plan.
- No published query **response** size limit apart from the 500 MB working set — the equivalent of
  Tracy's 256 KiB is **unconfirmed**.

Comparison: v1 `limit` 1–100, 256 KiB/response, signed cursor; V2-2 flat `page`. Sanity chooses a
cursor by `_id` (unsigned, does not expire, promises no snapshot) — cheaper than a signed cursor but
loses "409 when the source changes". The 1,000-attribute limit is the architectural reason for the
array i18n (section a) — Tracy has no such limit, no need to copy.

## (g) Errors

- **Validation does not run at the API — confirmed:** "Schema validation rules only run in Sanity Studio.
  Mutations submitted through the API or client libraries are not checked against your validation
  rules" [S43]; "They do not run on the server ... the Content Lake accepts the write without
  checking your validation rules"; recommends "validate the data in your own code before making the
  API call", `sanity documents validate` after import, `typegen` for compile-time; "most API tools
  won't validate your input" except Agent Actions Patch and MCP [S3]. In Studio: `error` blocks
  publishing, `warning` does not [S43].
- **Mutation error shape:** the HTTP reference only lists 400/401/403/404 [S14]; the actual shape
  `{error:{type:"mutationError", description:"Mutation(s) failed with N error(s)", items:[{index,
  error:{type, description, ...}}]}}` with `type` such as `documentReferenceDoesNotExistError`,
  `insufficientPermissionsError` — seen only in **secondary sources** (sanity.io/answers) [S44]; there
  is no official reference page listing the codes, the full list of `type` values is **unconfirmed**.
- Agent Actions: 400 "Invalid request body"/"Only bearer tokens are allowed", 403 "Feature
  disabled.", 404 "No deployed Studio schema found for", 429 "Plan or Budget Limit reached." /
  "Rate limit exceeded. Please try again in 60 seconds."; a missing `imageInstructionField` is a **silent
  no-op** [S28][S45].

Comparison with V2-4: Sanity has `items[].index` (the error points at which mutation) but **no
`field`/path** in the error, and no `severity`. Tracy's `{code, field:{contentId, blockId, itemId,
key}, severity}` is richer — keep. The lesson worth copying is the reverse: because the API does not
check the schema, every check must be at the **write door** (the Claude Cowork plugin) — exactly where
Tracy has put it.

## (h) AI/agent — Agent Actions, MCP, Functions, Canvas

### Agent Actions (blog 22/05/2025; Prompt + Patch 28/05/2025) [S46][S47]

Five actions at `POST /{apiVersion}/agent/action/{generate|transform|translate|prompt|patch}/{dataset}`,
bearer token, apiVersion `vX`, `schemaId` required [S28][S48]:

| Action | What it does | Writes? |
|---|---|---|
| Generate | "Create brand new content" per instruction + schema | yes (draft) |
| Transform | "Transforms a source document into a new document", keeps the format; has `image-description` | yes |
| Translate | translates a document; `fromLanguage`/`toLanguage`, `languageFieldPath`, `protectedPhrases`, `styleGuide` | yes |
| Prompt | "Prompt the LLM for a response. Does not interact with documents beyond fetching content as context"; returns text/json | **no** |
| Patch | "Schema-aware patch API that validates the provided paths and values against the target schema"; **does not use an LLM**, billed like the normal API; `set`/`append`/`unset`/`mixed`; "prevents duplicate keys, and preserves existing object values during set operations" | yes |

**How it edits *part* of a document — `target`** [S49]:

- `path` is a string `"title"`, an array `["body","description"]`, or selection by key
  `array[_key="no"].title`; without `target`, "the document root as the target".
- `include`/`exclude` limit the children; "Setting either `include` or `exclude` will invalidate the
  other"; `types.include/exclude` filter by field type (`string`, `text`…); `maxPathDepth` defaults
  to **4** — "Agent Actions will traverse 4 levels deep, starting at the root of the document or the
  target you define".
- `operation`: `set` ("Overwrites and replaces"), `append` (appends to arrays/strings, **adds**
  numbers), `mixed` (default: set for non-arrays, append for arrays), `unset` (Patch only),
  `image-description` (Transform only).
- `conditionalPaths`: allows editing `readOnly`/`hidden` fields conditionally; by default actions
  respect the schema's readOnly/hidden [S28][S46].
- Fields can be hidden from AI by a schema option — the exact option name is **unconfirmed** (the
  Canvas docs use `options.canvasApp.exclude`; for Agent Actions I found no page naming it).

**Instruction** [S50]: `instruction` (Generate/Transform/Prompt) and `styleGuide` (Translate), at
most 2,000 characters after interpolation; `instructionParams` of four kinds `constant` / `field`
(reads one path of the document) / `document` (the whole document) / `groq` (a query result),
interpolating `$topic`. Schema-awareness: "Agent Actions know about your content model, which lets
them map content accurately to your documents and fields. However, you must deploy an up-to-date
schema version" [S48]. Whether fields' title/description are used as guidance: the docs say "rely
almost entirely on your instructions and your schema" — anything more detailed is **unconfirmed**.

**Where it writes** [S51][S47]: "Agent Actions never mutate a published document" — given a published
ID it "creates a draft first"; returns an `_id` of the form `drafts.<id>` so the caller knows;
`forcePublishedWrite: true` to write directly; a type with `liveEdit: true` defaults like
`forcePublishedWrite`; `targetDocument` `edit` / `create` (may pass `versions.<release>.<id>` to
create a version in a release) / `createIfNotExists` / `createOrReplace`; "Check the returned `_id` of
the response to confirm whether the action wrote to a draft, a published document, or a version".

**`noWrite` / `async`** [S28][S18]: `noWrite: true` — "documents aren't created or mutated", returns
the resulting document in memory ("previewing changes, or working with multiple requests before
making a final write"); `async: true` runs in the background, returns `{_id}`, "incompatible with
`noWrite: true`"; `temperature` defaults to 0.3. Each request costs AI credits per plan [S48].

### Sanity MCP server (remote `https://mcp.sanity.io`, GA 11/12/2025; the local `@sanity/mcp-server` is deprecated) [S29][S52][S53]

- Tools (≈40): documents `create_documents`, `patch_documents` ("using `@sanity/client patch()`
  operations"), `get_document`, `publish_documents`, `unpublish_documents`, `discard_drafts`,
  `create_version`, `version_discard`; query `query_documents`, `semantic_search`; schema
  `get_schema`, `list_workspace_schemas`, `deploy_schema`, `deploy_studio`; release
  `create_release`, `list_releases`; asset/image `generate_image`, `transform_image`, upload; project/
  dataset/CORS; `run_sanity_cli`, `search_docs`, `read_docs`, `list_sanity_rules`, `whoami`.
- **It writes**, but: "Edits are saved to the draft or release version; published content is never
  modified directly." With releases: "create the version first, then patch the returned version ID".
- **Confirm/undo:** no confirmation step and no undo in the tools; the fallback is
  `discard_drafts` (delete the draft, keep the published) and `unpublish_documents`. From v2.33.0
  (16/09/2026) `publish_documents` accepts `ids[]{id, ifRevisionId}` → turned into the Actions API's
  `ifDraftRevisionId` "so publishing fails if the draft changed since the caller read it";
  `create_documents` keeps each document's result on partial failure [S53]. Versions 2.27/2.28
  (08/2026) note "safer document patching", "explicit release IDs" — entry names only, details could
  not be read.
- Auth: OAuth by default or a personal token that "share your role and permissions". Credits are only
  charged for `generate_image`, `transform_image`, `create_version` with `instruction`.

### Functions / Blueprints [S54][S55]

A Blueprint "describes when and where your function should trigger"; `defineDocumentFunction({name,
event:{on:['publish'|'create'|'update'|'delete'], filter:<GROQ>, projection:'{_id}'}})`; Node
24; default timeout 10 s (1–900 s), RAM 1–10 GB; limits of 200 runs/document/30 s, 4,000 runs/
project/30 s, **recursion 16 rounds**. An official example calls Agent Actions Translate from a
function, and prevents loops with the filter itself: "It makes sure that the function only runs when the language is set
to English ... This stops the new document from triggering the same function and creating a
recursive loop".

### Canvas [S56][S57]

"A familiar writing tool that understands your content structure, so content can flow directly into
the right Studio fields with a single click"; needs a deployed schema; `options.canvasApp {exclude,
purpose}` on every type/field to hide a field or describe its purpose for the mapping. Whether it
writes to draft or published is **unconfirmed**.

### Actions API (different from Agent Actions) [S58]

`POST /data/actions/{dataset}` "Execute one or more actions in a single transaction":
`sanity.action.document.{create, edit (patch one specific version), publish, unpublish, delete}`,
`document.version.{create, discard, replace, unpublish}`, `release.*`; `publish` has
`ifDraftRevisionId`/`ifPublishedRevisionId` "to optimistically lock"; `transactionId`, `dryRun`.
This is a write door with draft/publish semantics, unlike the purely document-level Mutation API.

### Overall reading for Tracy

Sanity separates three layers clearly: (1) **schema-aware Patch without an LLM** — checks path + value
against the schema, blocks duplicate keys; (2) **an LLM edits by `target`** — the model may only write
within the scoped path/depth/field types, elsewhere "keeping everything else exactly as it was";
(3) **every write goes to a draft** — a person publishes later, with a separate optimistic lock for the
publish step. Tracy today merges (1) and (2) into one `apply {changes}` and has no (3); C7 is
measuring `dry_run` vs direct write + revert.

## (i) Presentation vs content — Content Source Maps, stega, overlays, `resolve`

- **Content Source Maps** [S59]: `resultSourceMap=true` on a query returns `resultSourceMap
  {documents:[{_id,_type}], paths:["$['lastName']", ...], mappings:{"$[0]['authorName']":
  {source:{document:0, path:0, type:"documentValue"}, type:"value"}}}` — each value in the result
  → (document index, path index). Only API ≥ `2021-03-25`; supports attribute/element/slice/filter/
  array-postfix/projection/dereference traversal and `lower()`, `upper()`, `pt::text()`, `string()`
  partially; `select()`/conditional projection only for string/number; `coalesce()` is not on the
  list. Examples use array indices; the client uses `resultSourceMap: 'withKeyArraySelector'` to "use
  stable `_key`-based selectors for array items instead of numeric indices, which prevents overlays
  from breaking when array items are reordered" [S60].
- **Stega** [S61]: the client `stega:{enabled, studioUrl, filter, logger}` appends to **every string**
  a sequence of invisible characters: four zero-width characters (U+200B, U+200C, U+200D, U+FEFF) as a
  base-4 alphabet, encoding JSON `{"origin":"sanity.io","href":"<studio intent URL>"}`, a URL of the form
  `{baseUrl}/{workspace}/intent/edit/mode=presentation;id={id};type={type};path={path}` (+
  `perspective`, `projectId`, `dataset`); a marker of four U+200B comes first; **≈800 invisible
  characters per string**. Skipped automatically: dates, URLs, `slug.current`, keys starting with `_`,
  paths ending in `Id`, `meta`/`seo`/`openGraph`, paths containing "type", 39 forbidden field names
  (`color`, `email`, `href`, `url`, `path`…); `filter(value, sourcePath, resultPath, sourceDocument,
  filterDefault)` to decide yourself; `stegaClean()` strips it; from v5.5.0 `<VisualEditing/>` strips it
  on copy and Studio strips it on paste.
- **Overlays** [S62]: `enableVisualEditing()` "scans text nodes using a regex pattern and decodes
  the metadata"; for non-string values (images, numbers, booleans) uses `data-sanity` from
  `createDataAttribute({id, type, path, baseUrl, workspace?, tool?})` →
  `"id=post-123;type=post;path=mainImage;base=https%3A%2F%2F…"`; `data-sanity-edit-target` widens the
  click area; `data-sanity-edit-group` groups several fields, "computes the common ancestor path across all
  child fields". Array drag and drop: attribute **unconfirmed**.
- **Presentation tool** [S6][S63]: a Studio plugin renders the frontend in an iframe; `resolve` consists of
  `defineDocuments` (URL → document, in section a) and `defineLocations({select:{title, slug},
  resolve:(doc)=>({locations:[{title, href}]})})` (document → the URLs where it appears);
  `previewMode.enable/disable` (draft-mode cookie via a secret), `allowOrigins` for postMessage.
  Preview reads `drafts` or a release stack and then is "hydrated with live updates via Loaders" [S23].

**Compared with Tracy's "map pointing to the place to edit".** Sanity solves the same problem in **two
directions**: the *content → display location* direction is `defineLocations` (hand-written, returns
URLs); the *display location → content* direction is CSM + stega/data attributes (automatic, returns
`id;type;path`). Tracy has direction one (`content-map.json`, `?view=pages` B7: route → occurrence)
and not direction two. Core difference: Sanity can do it because **the frontend renders from the JSON
itself**, so every string on the page knows its source; Tracy's customer sites are rendered by the CMS
(PHP/Astro), and slot text carries no address after passing through the theme. Addition §3 discusses
how to compensate.

## Could not be confirmed (officially)

- An official example for the path `body[_key=="x"].children[0].text` (only derived from the syntax + the example
  `people[_key=="someKey"].name`).
- The list of `error.items[].error.type` of the Mutation API; the error shape was only seen on sanity.io/answers.
- CDN invalidation time after a mutation (seconds); the byte limit of a query response.
- The name of the schema option that hides a field from Agent Actions; whether Agent Actions read a
  field's `title`/`description`.
- Whether Canvas maps into draft or published; the array drag-and-drop attribute of overlays.
- The GA date of Agent Actions (blog 22/05/2025, Prompt/Patch 28/05/2025; "GA September 2025" only
  seen in search results, the corresponding changelog page could not be opened).
- Details of "safer document patching" v2.27.0 and "explicit release IDs" v2.28.0 of MCP (names only).

## Additions for Tracy's v2 plan

Each bullet: what Sanity does → whether Tracy has it → proposal + trade-off → label. Does not decide for the PO.

1. **Patch by path instead of flat `changes` — v2 plan does NOT have it yet.** Sanity: `set/unset/insert/
   diffMatchPatch` at a JSONMatch path, immutable `_key` as the address; the Patch action checks path + value
   against the schema, blocks duplicate keys. Tracy: `changes{slotKey: value}` only has scalar `set`
   semantics; C3 repeater left open. Proposal: keep `slotKey` as an opaque key **but** add an `op` on each change
   (`set` default, `unset`, `insert{before|after: itemId}`, `append`) — exactly four ops, not full
   JSONMatch; the Claude Cowork plugin today only accepts `set`, an adapter that does not implement it yet returns `SLOT_OP_UNSUPPORTED`. Trade-off:
   changes the contract of three Claude Cowork plugins (upstream owner), and C3 must settle on op-based (Sanity is op-based). **[generic]**
2. **Immutable `_key` is an invariant declared in the interface, not a verbal promise.** Sanity: "generated
   upon object creation ... immutable throughout the lifetime of the object". v1: `blocks[].id` "stable
   within the page", `items[].id` "stable", but §7 says plainly it has not been verified across admin edits. Proposal:
   V2-1 conformance test adds the case "admin reorders blocks → `blockId`/`itemId` unchanged, `position`
   changes"; an adapter that cannot prove it sets `itemId` = null instead of an index. Trade-off: Joomla module
   order/WP blocks have no natural key — the adapter must generate and **store** the key (Sanity solves it with
   `autoGenerateArrayKeys` at the write door). **[CMS-only]**
3. **Content Source Map / stega — v2 plan does NOT have it yet.** Sanity: every value in the result points back to
   `(_id, path)`; stega stuffs the address into the displayed string (~800 invisible characters), overlays read it back from
   the DOM. Tracy: `content-map.json` + `?view=pages` only have the content → page direction. Proposal at two levels:
   (a) cheap — `content.read` returns a CSM-style `sourceMap` (`mappings{"$.contents[i].blocks[j].fields[k].value":
   {slotKey, contentId}}`) so that a "screenshot/DOM → slot" tool can be built later without changing the envelope;
   (b) expensive — the Claude Cowork plugin embeds `data-tracy-slot="<slotKey>"` when rendering slot text (no stega:
   invisible strings end up in SEO/clipboard/customer copies, Sanity had to patch the clipboard in v5.5.0). Trade-off:
   (b) touches the themes of three CMSes and presentation-lock; (a) is only metadata. **[CMS-only]**
4. **Agent Actions' `target` — scoping what the LLM may write — v2 plan does NOT have it yet.** Sanity: `target
   {path, include, exclude, types, maxPathDepth=4, operation}` + `conditionalPaths`; the model only edits
   within the area, the rest stays "exactly as it was". Tracy: `writable` (V2-1) says *which* fields the seat can
   write, but site-tools has no way to tell the agent "you may only edit these slots in this turn". Proposal:
   `next.args.allowedSlotKeys[]` in the `content.read` answer (V2-5 JIT), the Claude Cowork plugin refuses with
   `SLOT_OUT_OF_TARGET` when an apply touches something outside the list — this is discipline for the model, not permissions. Trade-off:
   one more error code and one parameter; no server-side LLM needed. **[generic]**
5. **`noWrite`/`dryRun` return the resulting document.** Sanity: Agent Actions `noWrite` returns the document
   in memory, Mutation `dryRun` "validated but not executed". Tracy: C7 is still being measured. Proposal: if the
   PO chooses `apply {dry_run}`, return the **`contents[]` envelope after applying** (not a separate diff) so the
   agent reads back exactly the `content.read` shape, the three calls remain read → dry-run → apply. Trade-off:
   the Claude Cowork plugin must render the after-apply value without writing — Joomla/WP can at the entity layer, EmDash at the
   record layer. **[generic]**
6. **Transaction across many contents — v2 plan does NOT say yet.** Sanity: one request = one atomic transaction,
   many documents, a self-assigned unique `transactionId`, `ifRevisionID` **per document** within the same
   transaction. Tracy v1: atomic per contract; if V2-1 moves `expected_revision` to per content then an
   apply touching two pages must carry **two** revisions. Proposal: `apply {items:[{contentId,
   expected_revision, changes}], request_id}` atomic as a whole; 409 lists which `field.contentId` mismatched.
   Trade-off: lose "one apply = one whole-site snapshot" (Open question A3) — Sanity does not have this either,
   so presentation-lock must prove itself with a per-entity fingerprint. **[generic]**
7. **Perspectives — [do not copy] in v2.** Sanity: `published`/`drafts`/`raw`/release stack on
   queries. Tracy: `contentScope: published`, `publication.valueSource`. Customer sites on the fleet have no
   draft-as-record shared across the three CMSes (WP has revisions/drafts, Joomla state, EmDash `data` overlay). Proposal:
   keep `contentScope` as a **permission** (the `editorial` seat — Out of scope), do not add a perspective
   parameter; record that when the draft scope opens, `describe()` must declare `capabilities` containing
   `ai.tracy.content.scope.draft` so the agent knows. **[do not copy]**
8. **Content Releases — [do not copy].** Enterprise-only, needs `versions.<release>.<id>` as a separate
   document and a publish door with its own optimistic lock. Customer sites have no "release" — they have `publication.
   scheduledAt`. What is worth learning is the **two-key** structure `ifDraftRevisionId`/`ifPublishedRevisionId`
   at the publish step: if Tracy later has a publish step separate from apply, the optimistic lock must be per *version*
   rather than per content. **[do not copy]**
9. **Write to draft by default, a person publishes later.** Sanity: Agent Actions and MCP "never modify
   published content directly", return `drafts.<id>` so the caller knows. Tracy: apply writes directly,
   `evidence` is the only confirmation (C7). Proposal: do not change the default (C7 is being measured), but **apply returns
   which version was written** (`writtenTo: published|draft|current`, same enum as `valueSource`) so the agent and the
   transcript do not guess — Sanity says exactly this: "Check the returned `_id`". Trade-off: one
   extra field in the receipt, no behaviour change. **[CMS-only]**
10. **Validation is not at the API → the write door is where checking happens.** Sanity admits the Content Lake does not run
    rules; the consequence is three separate layers (schema-aware Patch, `sanity documents validate`, Functions).
    Tracy puts the checks in the Claude Cowork plugin (`maxCharacters`, allowed ops) — the right place. Proposal: should V2-4 declare
    `severity` with exactly Sanity's two levels (`error` blocks, `warning` does not) instead of
    `recoverable|unrecoverable`? — **no**: Tracy's `recoverable` answers "what does the agent do next",
    while `error/warning` answers "can it be published"; keep Tracy's, write the reason into the spec so that people
    later do not switch to Sanity's. **[generic]**
11. **"Changed" events instead of asking again.** Sanity: GROQ webhooks (at-least-once, `idempotency-key`,
    retry 2×30 s), Listen SSE, Live sync tags kept for 15 minutes. Tracy: C5 proposes a "content
    changed" event for caching; V2-2 ETag/304. Proposal: keep ETag/304 (cheap, no long connection); if events are
    added, copy **three** properties of Sanity's webhooks — at-least-once, idempotency key, transaction
    id in a header — and not SSE. Trade-off: the Claude Cowork plugins of three CMSes must emit events, EmDash is easy,
    WP/Joomla via admin hooks. **[generic]**
12. **Cursor by `_id` for listings, unsigned, non-expiring.** Sanity recommends
    `_id > $lastId | order(_id)`, and says plainly that offset is linear. Tracy V2-2 chose flat `page`
    for listings (like Shopify). Proposal: keep `page` (an agent understands "page 2" better than "after id X"), but write
    in the spec that adapters are allowed to **implement** `page` with a keyset on the internal `id` to avoid
    scanning a snapshot — that is what EmDash needs (the "do not scan 10,000 rows" step). **[generic]**
13. **`describe()` = Sanity's schema deploy, generated automatically.** Sanity must `schemas deploy` by hand and
    Agent Actions die with 404 when the schema is stale; MCP `get_schema` is one call. Tracy V2-3 generates it from the adapter —
    a real advantage. Proposal: add to `describe()` two things Sanity has that table B1 does not list yet: the **list of
    ops** per capability (`set` / `unset` / `insert` — per §1) and a **`maxPathDepth` equivalent**
    (block → item → field, whether repeaters are nested), so the agent does not try ops the adapter does not have yet. **[generic]**
14. **History/revert: Sanity has no undo either.** Restore = read the old version from History then
    `createOrReplace`; kept 3/90/365 days by plan; MCP has no undo tool, only `discard_drafts`.
    Tracy ADR 0021 §6 "build no new undo" matches Sanity's practice. Proposal: add nothing;
    write in the v2 spec the sentence "fallback = apply again the old value the agent read, `evidence` records the reason",
    and `content.read` keeps the old `revision` in the transcript as evidence. **[generic]**

In short, what v2 **does not have yet** that Sanity points out: ops on changes (§1), verified immutable keys (§2),
source map/the DOM → slot direction (§3), scoping for the LLM (§4), multi-content transactions with a revision
per content (§6), a receipt that says which version was written (§9). Perspectives and Releases are specific to multi-tenant
SaaS with draft-as-record — do not copy.

## Sources

### Official (sanity.io/docs, changelog, blog, github.com/sanity-io)

- [S1] Document IDs — https://www.sanity.io/docs/ids
- [S2] Drafts — https://www.sanity.io/docs/content-lake/drafts
- [S3] Schema validation and the Content Lake — https://www.sanity.io/docs/content-lake/schema-validation-and-the-content-lake
- [S4] Reference type — https://www.sanity.io/docs/content-lake/reference-type
- [S5] Slug type — https://www.sanity.io/docs/studio/slug-type
- [S6] Configuring the Presentation Tool — https://www.sanity.io/docs/visual-editing/configuring-the-presentation-tool
- [S7] Localization — https://www.sanity.io/docs/studio/localization
- [S8] @sanity/document-internationalization — https://github.com/sanity-io/plugins/tree/main/plugins/@sanity/document-internationalization
- [S9] sanity-plugin-internationalized-array — https://github.com/sanity-io/plugins/tree/main/plugins/sanity-plugin-internationalized-array
- [S10] Block type — https://www.sanity.io/docs/block-type
- [S11] How form paths work — https://www.sanity.io/docs/studio/how-form-paths-work
- [S12] Array type — https://www.sanity.io/docs/studio/array-type
- [S13] Span type — https://www.sanity.io/docs/studio/span-type
- [S14] Mutation API reference — https://www.sanity.io/docs/http-reference/mutation
- [S16] Patches — https://www.sanity.io/docs/content-lake/http-patches
- [S17] JSONMatch — https://www.sanity.io/docs/json-match
- [S18] Agent Actions patterns — https://www.sanity.io/docs/agent-actions/agent-action-cheatsheet
- [S19] Transactions — https://www.sanity.io/docs/content-lake/transactions
- [S20] GraphQL — https://www.sanity.io/docs/graphql
- [S21] Perspectives — https://www.sanity.io/docs/content-lake/perspectives
- [S22] Changelog "Content Releases APIs and new perspective defaults" (24/02/2025) — https://www.sanity.io/docs/changelog/676aaa9d-2da6-44fb-abe5-580f28047c10
- [S23] Presenting and previewing content — https://www.sanity.io/docs/content-lake/presenting-and-previewing-content
- [S24] Changelog "Introducing Content Releases" (19/02/2025) — https://www.sanity.io/docs/changelog/e215973b-784d-46a8-9f5d-6ffac4dc9ace
- [S25] Content Releases API — https://www.sanity.io/docs/apis-and-sdks/content-releases-api
- [S26] Content Releases user guide — https://www.sanity.io/docs/user-guides/content-releases
- [S27] Technical limits — https://www.sanity.io/docs/technical-limits
- [S28] Agent Actions HTTP reference — https://www.sanity.io/docs/http-reference/agent-actions
- [S29] Sanity MCP server — https://www.sanity.io/docs/compute-and-ai/mcp-server
- [S30] API CDN — https://www.sanity.io/docs/content-lake/api-cdn
- [S31] Transactions (definition, atomic) — https://www.sanity.io/docs/transactions
- [S32] Listen API — https://www.sanity.io/docs/listening
- [S33] GROQ-powered webhooks — https://www.sanity.io/docs/webhooks
- [S34] Live Content API — https://www.sanity.io/docs/live-content-api
- [S35] Live events HTTP reference — https://www.sanity.io/docs/http-reference/live
- [S36] Blog "The Live Content API is now Generally Available" (17/03/2025) — https://www.sanity.io/blog/the-live-content-api-is-now-generally-available
- [S37] History API reference — https://www.sanity.io/docs/http-reference/history
- [S38] Find and restore deleted documents — https://www.sanity.io/docs/developer-guides/find-and-restore-deleted-documents
- [S39] CLI schema commands — https://www.sanity.io/docs/cli-schema
- [S40] Sanity TypeGen — https://www.sanity.io/docs/apis-and-sdks/sanity-typegen
- [S41] Schema deployment — https://www.sanity.io/docs/apis-and-sdks/schema-deployment
- [S42] Paginating with GROQ — https://www.sanity.io/docs/paginating-with-groq
- [S43] Validation — https://www.sanity.io/docs/validation
- [S45] Troubleshoot Agent Actions — https://www.sanity.io/docs/agent-actions/troubleshooting
- [S46] Blog "Agent Actions: AI building blocks for structured content" (22/05/2025) — https://www.sanity.io/blog/agent-actions-ai-building-blocks-for-structured-content
- [S47] Changelog "New Agent Actions, updates to mutation defaults…" (28/05/2025) — https://www.sanity.io/docs/changelog/45b74899-8911-4fb9-ba1e-9431fc6fcf0d
- [S48] Agent Actions introduction — https://www.sanity.io/docs/agent-actions/introduction
- [S49] Targets and paths — https://www.sanity.io/docs/agent-actions/targets-paths
- [S50] Creating instructions — https://www.sanity.io/docs/agent-actions/instructions
- [S51] Operations — https://www.sanity.io/docs/agent-actions/operations
- [S52] sanity-mcp-server (local, deprecated) — https://github.com/sanity-io/sanity-mcp-server
- [S53] MCP server changelog (GA 11/12/2025; v2.33.0 16/09/2026) — https://www.sanity.io/docs/ai/mcp-server/changelog · https://www.sanity.io/docs/changelog/8a101423-c103-4375-b495-a47dd8934b78
- [S54] Functions introduction — https://www.sanity.io/docs/compute-and-ai/functions-introduction
- [S55] Functions cheat sheet — https://www.sanity.io/docs/functions/functions-cheatsheet
- [S56] Canvas — https://www.sanity.io/docs/canvas
- [S57] Configure Canvas — https://www.sanity.io/docs/canvas/configure-canvas
- [S58] Actions API reference — https://www.sanity.io/docs/http-reference/actions
- [S59] Content Source Maps — https://www.sanity.io/docs/visual-editing/content-source-maps
- [S60] Client setup and stega — https://www.sanity.io/docs/visual-editing/visual-editing-client-stega
- [S61] Stega — https://www.sanity.io/docs/stega
- [S62] Overlays and click-to-edit — https://www.sanity.io/docs/visual-editing/visual-editing-overlays
- [S63] Presentation tool — https://www.sanity.io/docs/presentation
- Patch quick start — https://www.sanity.io/docs/agent-actions/patch-quickstart
- Query API reference — https://www.sanity.io/docs/http-reference/query
- History experience — https://www.sanity.io/docs/user-guides/history-experience
- Machine-oriented index of the docs — https://www.sanity.io/docs/llms.txt

### Secondary (not used as primary evidence)

- [S15] "Is the _key of an array item unique across the document type?" — https://www.sanity.io/answers/is-the-key-of-an-array-item-unique-across-the-document-type
- [S44] `mutationError`/`items[]` error shape — https://www.sanity.io/answers/error-migrating-data-with-cli-due-to-non-existent-document-reference · https://www.sanity.io/answers/issue-with-updating-a-boolean-value-in-a-mutation-resulting-in-a-----error-
- "Agent Actions GA September 2025" — only seen in search results, the changelog page could not be opened.
