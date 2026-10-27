---
description: Specification of the live content.json on a Tracy site — the common model, queries, identity, read permissions and revisions for the three CMSs; running through the content.read relay on all three CMSs since 28/09/2026 (with the v2 parts).
sources:
  - apps/tracy-web/src/lib/quickstart-capabilities.js
  - apps/tracy-web/src/lib/contracts.js
  - apps/tracy-web/src/brief/bindings.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/cms/tracy-emdash-theme-business/seed/personalize.json
  - packages/cms/tracy-content-api/describe-map.mjs
  - apps/tracy-web/src/sites/route.js
---

# Content API v1 — specification

**Status (28/09/2026): implemented.** `tracy-content/v1` is served through the relay's
`content.read` action (`apps/tracy-web/src/sites/route.js`) on all three CMSs: the Claude Cowork plugin for
Joomla ≥ 0.18.0, WordPress ≥ 0.14.0 (native ids from 0.18.2 / 0.14.2) and the EmDash Business reader.
The v2 parts also run: `describe` (answered by the relay, not a plugin parameter),
`view=pages`, `fields`, `version`/`ifVersion`/`changedSince`, `lockedBy`, `maxBytes`, `native`.
Shared schema and validator: [package `@tracy/content-api`](../../packages/cms/tracy-content-api/README.md).
Public English docs will be at tracy-web's `/docs/api` (since 11/10/2026 at `docs.tracy.ai/api/reference/`; the old `/docs/api` returns 302 there)
([API portal plan](../../tasks/todo-api-portal.md), step 2). The part below keeps the specification text verbatim
as written (25/09); the phrase "not implemented" in it is history, not the current status.

**PO decided 25/09/2026:** no new undo API, no new journal/receipt and no common revert standard.
Integration acceptance: read → write through the existing door (native permissions/revision) → read again. The existing undo
stays as is, regression-checked when code touches the related path; no existing test/gate is dropped.
Deployment rollback still belongs to the release plan. See ADR 0021 §6.

Per [ADR 0021](../adr/0021-one-content-api-for-three-cms.md).
All new routes/fields below are design, not yet claimed to exist on running sites.
The machine schema and P1 candidate fixtures are in the [shared package](../../packages/cms/tracy-content-api/README.md).
Survey, owners and reasons for adjustment: [P0](content-api-p0.md). HTTP runtime not implemented yet.
JSON uses camelCase following the existing reader; replacing the snake_case in the conversation sketch.

## 1. Read door

| Request | Result |
|---|---|
| `GET /content.json` | List of summaries, default limit 30 |
| `GET /content.json?type=page&locale=vi-VN&limit=30` | Filtered with AND |
| `GET /content.json?cursor=...` | Next page within the same snapshot and permissions |
| `GET /content.json?id=...` | One full content in contents, by opaque ID |
| `GET /content.json?id=...&blocksCursor=...` | Next page of a large block list |
| `GET /content.json?id=...&blockId=...` | One block occurrence and the data it needs |
| `GET /content.json?id=...&blockId=...&itemsCursor=...` | Next page of a large repeater |

V1 uses one endpoint to avoid clashing with a detail route by slug. Unknown query, wrong value,
id combined with a list cursor, filter differing from the cursor: 400. ID not existing or not readable: 404
with the same shape, not revealing existence. Not authenticated: 401. Source CMS error: 503, never returning
empty contents as success. Adapter does not support it yet: 501. No permission on the site: 403.

Proposed limits: limit 1–100, at most 256 KiB of uncompressed UTF-8 JSON per response. Summaries do not
embed body/blocks; detail carries the payload when it fits the budget. When it exceeds, return a reference with
`detailState: "partial"` + `links`, splitting blocks/items; a scalar that is too large returns 413
`CONTENT_FIELD_TOO_LARGE` with the field's identifier, without cutting the value. Settle the budget by benchmark
before release. Never return a dump download URL that goes around read permissions.

## 2. Envelope and example

The example fully illustrates one small content; IDs/hashes are shortened only for reading the doc.

```json
{
  "schemaVersion": "tracy-content/v1",
  "view": "authenticated",
  "site": { "id": "site-demo", "name": "Example", "url": "https://example.invalid", "defaultLocale": "en-GB", "locales": ["en-GB"] },
  "provenance": { "quickstartTag": "tracy-business/j6", "quickstartVersion": "1.2.0", "contractId": "tracy-business/j6/1.2.0", "contractHash": "example-hash" },
  "snapshot": { "revision": "opaque-snapshot-1", "readAt": "2026-09-25T10:00:00Z" },
  "pagination": { "limit": 30, "nextCursor": null, "total": 1 },
  "completeness": { "scope": "mapped-content", "status": "partial", "unresolved": [{ "code": "UNMAPPED_CONTENT", "message": "Some content is not mapped." }] },
  "contents": [{
    "id": "content-01", "type": "page", "title": "Home", "slug": "home",
    "url": "https://example.invalid/", "locale": "en-GB", "translationGroupId": null,
    "summary": null, "bodyHtml": null, "tags": [],
    "publishedAt": null, "createdAt": null, "updatedAt": null, "revision": "opaque-content-1",
    "publication": { "status": "unknown", "valueSource": "unknown", "scheduledAt": null },
    "detailState": "complete", "fields": [],
    "blocks": [{
      "id": "block-01", "key": "block-01", "role": null, "position": 0,
      "sharedContentId": null, "visibility": "unknown",
      "fields": [{ "key": "heading", "type": "text", "value": "Welcome", "slotKey": null, "semanticKey": null }],
      "items": []
    }],
    "images": [], "relations": [], "links": { "self": "/content.json?id=content-01" }
  }]
}
```

`completeness` applies to the scope the caller may read; it does not list names/counts of hidden drafts. `total: null`
if it cannot be counted exactly. `provenance` may be null on an imported site and is not a copy of the customer's
data; v1 does not yet promise support for every imported site. A missing value is null; a list known to be empty
is `[]`. A summary drops the heavy fields and declares `detailState: "summary"`; never use an empty array in place
of data not yet loaded. A partial detail declares links for the missing part.

## 3. Dictionary and invariants

| Field | Rule |
|---|---|
| `type` | page/article/service/project/shared/generic; never infer service from the title alone |
| `id` | Opaque, per site, stable across slug changes; deleting and recreating must give a new ID |
| `slug`, `url` | Current address, may be null; not a join key |
| `locale` | BCP 47 from a verified locale mapping; null for language-neutral shared content |
| `translationGroupId` | Group confirmed by the CMS/binding; null without evidence |
| `revision` | Token for detecting changes, not by itself equivalent to the Claude Cowork plugin's expected_revision |
| `bodyHtml` | Value from a renderer/extractor with a source, never HTML written by the model to fill a gap |
| `fields[]` | key unique within its owner; type + matching JSON value; slotKey/semanticKey nullable |
| `blocks[]` | Occurrence ID stable within the page; position starts at 0; role nullable |
| `sharedContentId` | Points to shared content; never also embeds a source copy that could drift |
| `items[]` | Stable item ID; position; fields; contentId nullable; itemsPagination if not finished |
| `images[]` | id/src/alt/width/height/usages; unknown dimensions are null, never a fake 0 |
| `relations[]` | type + contentId; only targets the caller can read; a translation is a relation |
| `links` | Relative/same-origin links, generated by the adapter; never accepts an arbitrary URL from the caller |

An HTML reader does not execute arbitrary scripts/shortcodes to get data. A client displaying bodyHtml must
sanitize it separately. Never put users, tokens, form submissions, filesystem paths, XPath or raw DB IDs
in the common envelope. Slot bindings are looked up on the server side, tied to the profile hash and the current permissions.

Edit limits (maxCharacters, evidence, allowed operations) are still read through contract inspect; never
copy them into a second set of write rules in content.json. An unsupported field is not the same as a known readonly:
the adapter declares unresolved so the consumer can tell them apart.

## 4. Mapping the three CMSs

| Concept | Joomla | WordPress | EmDash |
|---|---|---|---|
| Page | Menu route + component + assignment in the map | Page + template + block/inventory | Route + record/template mapping |
| Block | Module/ACM or an article part with a mapping | Block/group; a pattern is only a source if not synced | Field group/record, per mapping |
| Shared | Module assigned to many pages | Template part/synced content | Shared record |
| List-style entry | Article/category and type mapping | Supported post/custom type | Record of a list-style type |
| Live value | Claude Cowork plugin reads the CMS after binding | Claude Cowork plugin reads the CMS after binding | Authenticated content API |
| Write target | Slot entity/column/selector | Slot entity/target | Entry/field and native revision |

Not every menu item is an article, not every WP pattern is a shared entity, not every
EmDash collection is a page. The adapter must prove the mapping for each fixture.

## 5. Snapshot, auth and cache

An opaque cursor must be tamper-proof and contain no credentials, bound to site + filters + identity/permissions +
snapshot; proposed expiry 5 minutes. Expired or data changed: 409 `CONTENT_SNAPSHOT_EXPIRED`, the caller
starts over. Never silently change the snapshot between pages. Repeater cursors follow the same rules.

The adapter must prove the snapshot through a read transaction, a materialized read snapshot, or a generation
with full invalidation (admin, API, shared content, publish schedule, ACL, media). Not only
hooks on agent operations. If there is no mechanism meeting this criterion yet, the corresponding phase is not accepted.

V1 is private, no-store. Every request rechecks permissions, including cursor/conditional requests. No 304
before auth. The Content API revision is for reading; a mutation still takes the fresh native revision through the write
door, with that door's own drift check and conflict handling.

## 6. Version and errors

Adding an optional field with the same meaning may happen in v1; changing a meaning, type or required field needs a new
version. Consumers ignore unknown optional fields and refuse an unsupported major. Errors have the form
`{"error":{"code":"CONTENT_SNAPSHOT_EXPIRED","message":"Restart the content listing."}}`.

Must check: list/detail IDs and values match; no duplicate IDs; every reference valid within scope;
no repeated/lost records when scanning a snapshot; edits/ACL/schedule changes in between invalidate the cursor;
no leaks through count/unresolved/relations; oversized detail is not silently truncated.

## 7. Settling the P1 candidate shape (not released)

The single machine source is [schema.json](../../packages/cms/tracy-content-api/schema.json),
[validator](../../packages/cms/tracy-content-api/validate.mjs) and the corpus in the same package. The detailed choices
below make the proposal concrete; they do not turn the transport design into a running API.

- `summary` requires the common metadata, publication and links.self; drops bodyHtml/tags/fields/blocks/
  images/relations. `complete` requires those fields (nullable scalars, empty arrays if known).
  `partial` has links.next; it only sends the loaded payload, blocksPagination/itemsPagination share the
  pagination shape. Position is a non-negative number within the owner; continuation keeps absolute order.
- `publication` requires `{status, valueSource, scheduledAt}`. Status: published/draft/scheduled/
  private/archived/unknown. ValueSource: published/draft/current/unknown. ScheduledAt nullable
  RFC 3339. Reason for adding it: EmDash privileged `data` can overlay a draft on the published version; the old timestamps
  are not enough to tell which version the consumer is reading. The adapter must declare the real source, not choose per model.
- Field types: text/html/url/image have a string or null; number has a finite number or null;
  boolean has a boolean or null; json is any finite JSON. An `image` value is a source URL/string
  provided by the mapping; media metadata/usage is separate in images, never inferring a media ID.
- Media usage: `{contentId, blockId, itemId}`; the latter two IDs nullable. Relation type:
  translation/related/parent/child. A translation needs two different locales and a confirmed group.
- A shared occurrence has empty fields/items and sharedContentId pointing to a source of type shared, never
  embedding a copy itself. Opaque IDs do not encode a raw DB ID, selector or write target.
- Locale is canonical BCP 47 within site.locales; null means no own locale yet or a shared
  source. Joomla's `*` version maps to null only after the shared meaning is confirmed. Unknown visibility is
  the string `unknown`; an unknown dimension is null, not 0. Unknown enums are refused.
- Standard error codes: CONTENT_BAD_QUERY (400), CONTENT_UNAUTHENTICATED (401), CONTENT_FORBIDDEN
  (403), CONTENT_NOT_FOUND (404), CONTENT_SNAPSHOT_EXPIRED (409), CONTENT_FIELD_TOO_LARGE
  (413), CONTENT_ADAPTER_UNSUPPORTED (501), CONTENT_SOURCE_UNAVAILABLE (503). Field-too-large
  has `error.field: {contentId, blockId, itemId, key}`; no physical selector. Validator error codes such as
  CONTENT_SCHEMA_INVALID/CONTENT_REFERENCE_INVALID are internal conformance errors,
  not a new set of HTTP statuses.
- `validateContent` checks one response, byte budget, shape, uniqueness, locale, same-origin links.
  `validateContentGraph` checks a scope the adapter has authenticated and that gathers all referenced targets,
  including detail when media usage points to a block/item. It does not require a reference to be within one pagination page;
  the scope may include readable targets outside the filter. A passed-in scope does not by itself prove ACL.
  If not all are gathered, the graph must not be claimed verified. Auth/cursor/filter/snapshot are only accepted
  in the [runtime cases](content-api-runtime-cases.md).
- Consumers drop unknown optional fields, but a known enum/type/version that is wrong must be refused. The schema is not yet
  released, so the shape decisions above do not break backward compatibility; replacing a required field after
  release must follow the version rules in §6. The 256 KiB/100 limits and 5-minute expiry still need a benchmark.

There is no generator from sample to live endpoint. The three CMS fixtures have a source/hash/JSON
pointer manifest; every graph edge and synthetic ID is spelled out. Never call fixture tests a verification of
IDs stable across admin edits, draft read permissions, signed cursors or rollback.

## Joomla pilot P2 integration (not released)

The cross-repo protocol is being added at TracyHQ/tracy-docs `systems/content-api-v1.md`;
TCH still owns the single schema/validator. The consumer sends `content.read` with `params` through
`POST /api/sites/:key/apply`; a successful response is the envelope directly. An old Claude Cowork plugin/unsupported
shape returns 501, with no fallback to the contract sample. Seat/policy errors remain the existing Tracy codes.

Joomla GET `/content.json` uses a Bearer service token; the relay sends the token in the body together with
the `contentPrincipal` computed by Tracy, never accepting a principal chosen by the caller. Seat/policy is
checked on every request; the service credential does not replace seat permissions. Cache private/no-store.

The pilot supports mapped public-audience page/article/shared, summary/detail/filter, block
continuation. There is not yet stable repeater item mapping, item continuation, remote media fingerprint or
render proof. Those items are declared unresolved. Metadata that cannot be segmented to fit the budget returns 413;
there is no silent truncation. The common semantics are not changed, nor is it claimed that the CMSs share a transaction.

Runtime details, SQL stress compared with API lifecycle, limits and regressions:
[REPORT P2](../../tasks/evidence/content-api-p2/REPORT.md). The PO decision not to build a new undo
still applies; read → native write with permissions/revision → read again is the integration acceptance path.

A consumer of partial detail must merge the attributes present across segments. Joomla may defer
`bodyHtml` to the last segment so that body and field with the same value do not double a response past 256 KiB;
absent means not yet loaded, not turned into null/empty. This uses the existing P1 schema.

Comparison before WP/EmDash integration is in the [integration note](content-api-integration.md): the Claude Cowork plugin
must accept the principal/scope the relay builds from server permissions, never the agent's query authority.
Policy has no editorial grant yet, so the pilot relay sends `contentScope: published`; this does not
grant any extra draft read permission to any seat. The WP wrapper/service principal and the EmDash scalar PAT
are not yet considered an accepted seat relay protocol. The proposals on domain identity, expiry, block
projection are recorded separately in the note; the schema/validator are not changed and full capability is not turned on.

## Addendum: block discovery when the body exceeds the budget (25/09, before adapters apply it)

At Lee's request, **`error.links.firstBlock`** was chosen, without adding a `blockId=first` sentinel.
The 413 error for `field.key=bodyHtml` may carry `error.snapshot` (revision/readAt of the same consistent
read) and an absolute link to the first readable block. The link only contains `id`, `blockId`,
`blocksCursor`; no credentials, scope or principal. The signed cursor binds site, principal,
scope/filter, content owner, block position, snapshot and expiry. The URL grants no permission: the
next request still checks auth/seat/ACL; a different principal gives 400, a changed source or expiry gives 409, a lost seat gives 403 at the relay.
The relay consumer takes the query from the link and calls `content.read` again, never sending credentials to another URL.

An adapter only advertises the link if it can serve `id&blockId&blocksCursor` under the constraints above.
The block scan keeps absolute position and `blocksPagination` has total/nextCursor; the next link still
binds the same snapshot, never using a bare blockId string as proof of a consistent scan. At the last block,
nextCursor=null ends the **block scan**; partial still has links.next back to the content to read the unloaded part.
The consumer does not loop back to the content by itself once the scan has ended: the body can still give 413. Never claim to get the whole
body or a complete page from all blocks alone. If there is no readable block, keep the 413 without a link.

The schema/validator add shape/invariants for the optional error link and snapshot; the old 413 remains valid.
The shared tests prove the shape, the owner query and that the URL carries no authority/credential; **they do not prove
the signature, same-origin custody, auth or runtime snapshot**. Acceptance before advertising:
a new 400-section page → 413 → discover the first block → all 400 blocks under one snapshot; edits/ACL/revoke/
expiry mid-scan are refused; no loop at the end; a single block that is too large still gives 413. WP 674c886 does not yet meet this
added contract (blockId+blocksCursor currently gives 400), Joomla/EmDash have not implemented it. The old block chain is never silently
accepted as this capability. This is a requested common change, not a fix just for Joomla.

The canonical Claude Cowork plugin request for the next implementation was settled in the
[integration decision](content-api-integration-decision.md): flat query params, server authority
in top-level contentPrincipal/contentScope, direct success/error. The WP 674c886 codec is a measured
fixture bridge and does not change the canonical decision. Identity/restore/fork and DB copy limits are in
the same note; never use hostname/path traces to infer a clone or return 501.
