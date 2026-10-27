---
description: Consolidated comparison table for Content API v2 — Shopify/UCP (19 topics) and six CMS content APIs Contentful · Sanity · Storyblok · WordPress · Payload · Directus (16 topics) plus a Codex review; each row says who does what, what Tracy v1 does, the v2 choice and a generic · commerce · CMS-only label; three PO decisions at the top.
sources:
  - docs/references/shopify-products-json-for-content-api-v2.md
  - docs/references/shopify-admin-api-product-edits-for-content-api-v2.md
  - docs/references/shopify-agent-tooling-for-content-api-v2.md
  - docs/references/ucp-for-content-api-v2.md
  - docs/references/contentful-for-content-api-v2.md
  - docs/references/sanity-for-content-api-v2.md
  - docs/references/storyblok-for-content-api-v2.md
  - docs/references/wordpress-rest-gutenberg-for-content-api-v2.md
  - docs/references/payload-for-content-api-v2.md
  - docs/references/directus-for-content-api-v2.md
  - tasks/evidence/content-api-v2/review-codex-gpt-6-astra-2026-09-25.md
  - apps/tracy-web/src/sites/route.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/tools/tracy-site-tools/src/host/surface.mjs
---

# Content API v2 — comparison of Shopify · UCP · Tracy v1

Merged from four research documents dated 25/09/2026 (each document has its own primary sources and
its own "unconfirmed" section; this table adds no new claim). Context: Lee (PO) wants the agent to
grasp the content map of every quickstart (Joomla · WordPress · EmDash) so it understands and edits
faster — "`content.json` as good as `products.json`". Lee reminded the same day: **product
(ecommerce) and content (CMS) differ a lot**, learn selectively.

Label on each row:

- **G** — catalog-generic: can be copied (discovery, id + slug, search/get, capability per adapter,
  per-record cache, errors with code + field).
- **C** — commerce-specific: **do not copy** (price/variant/inventory, cart/checkout/payment,
  public-by-default because the purpose is selling to strangers, permissions by app scope).
- **CMS** — content properties that Shopify/UCP have no model for: keep v1's (blocks with a position,
  `slotKey` pointing to the place to edit, presentation-lock, `translationGroupId`,
  draft/scheduled/password/ACL, the caller is a seat rather than a stranger, `revision`/snapshot).

Shared conclusion of the four documents: the hypothesis "content and product have the same shape" is
**right at the shell layer, wrong at the core layer** — copy *the way in*, do not copy *the commerce
core*, and we must *add* the CMS part that none of the four Shopify sources has.

## A. Three PO decisions

| # | Topic | Shopify | UCP | Tracy v1 | v2 choice | Label |
|---|---|---|---|---|---|---|
| A1 | **Who can read** | `products.json` public without a token, undocumented, the merchant cannot turn it off, gets scraped; a password page turns everything off | Permissionless but the merchant keeps the right to `profile_not_trusted` 403; signature optional for catalog; Shopify splits 3 tiers Anonymous / Signed / Token, rate limit by level of identification | Private: seat + toolset `code` + service credential; editor gets 403 even for reads; `no-store` | (a) keep private · (b) `view: public` published only, site without password · (c) public but requires agent identity (profile + RFC 9421 signature). Public-by-default is **C**: customer sites have drafts/forms/passwords, the reader is a seat | C / G |
| A2 | **Shared ID read ↔ write** | public `variants[].id` = Admin write id; metafield `namespace.key` is a read-write slot with the same name; `handle` can change with `redirectNewHandle` | `variant.id` = `item.id` at checkout; **no catalog write door** | `slotKey` from `content.read` = `changes` key (only sites with a contract); opaque id stable across slug changes | Shared conformance test: every non-null `slotKey` can be applied with the key as is; an adapter without a write target returns `null`; add `writable` per seat on the field | G |
| A3 | **Cache instead of snapshot** | No snapshot; `updated_at` at every level + weak ETag/304; webhooks do not guarantee order, reconcile by `updated_at` | **No `updated_at`/revision/ETag at record level**; cursor + `has_next_page`, `limit` is only a hint | `snapshot.revision` + cursor signed for 5 minutes + 409 when the source changes; EmDash ~2,000 calls/run; Joomla inspect 60–86 s | `revision` + `updatedAt` required in the summary; ETag/304 **after auth**; flat `page` for listing, signed cursor only for `blocksCursor`/`itemsCursor`; `expected_revision` per content instead of whole site. Trade-off: lose "one apply = one whole-site snapshot" that presentation-lock relies on | G |

## B. Read shape

| # | Topic | Shopify | UCP | v1 | v2 | Label |
|---|---|---|---|---|---|---|
| B1 | Discovery | none | `/.well-known/ucp`: date-based `version`, `services[transport, endpoint, schema]`, reverse-domain `capabilities` + exact-version + `extends/requires`, `keys[]`; authority binding instead of a registry; forbids declaring "draft" | `schemaVersion`/`provenance`/`completeness` in the response | `?describe=1` **after auth** (the caller is a seat, no need for `/.well-known`): version, locales, types present, count per type, `capabilities` generated from adapter code (Joomla/WP/EmDash declare differently), schema link. **No `/.well-known/cms` in v2** (Lee, 25/09): well-known solves "a stranger finds the way into a domain", which Tracy does not have yet — tracy-web already knows the site's CMS/quickstart/Claude Cowork plugin before calling; `/.well-known/` on the customer site is served by the CMS (route clash, changes three Claude Cowork plugins); the name `cms` is not registered with IANA; UCP hosting requires `Cache-Control: public`, no auth — exposes the counts/capabilities of a private site (B6). Condition: the shape of `describe` is a standalone *document* (date-based version, reverse-domain `capabilities` + exact-version + `extends/requires`, `services[endpoint, schema]`), generated from the adapter — so that when A1 opens, the same document serves anonymously at `/.well-known/tracy-content` (counts filtered, add `keys[]` if signing RFC 9421), with no second version | G |
| B2 | Summary enough to decide | list embeds the whole product (250 ≈ 1.6 MB) | search returns the full product; lookup batch ≥10 ids | summary drops body/blocks | add `blockCount`/`imageCount`/`bodyBytes`/`revision` within the readable scope | G |
| B3 | Slug alongside id | detail by handle only | `product{id GID, handle}` | `?id=` only | `?slug=&type=&locale=` secondary lookup; consider a batch `lookup` of many ids | G |
| B4 | Blob + structure | raw `body_html` + `variants[]`; no page map | `description{plain\|html\|markdown}` + `variants[]`; no page/section | `bodyHtml` + `blocks[].fields[]{slotKey}` **with a position** | Keep `fields[]` as the source of truth; flat projection (`role: hero/footer`) is derived only, limited to roles with contract evidence | CMS |
| B5 | One shape | 4 shapes (list/detail/.js/GraphQL), `tags` sometimes an array, sometimes a string | one schema, ~130 published JSON Schemas | one envelope | Do not copy multiple shapes; consider publishing the schema like UCP | (C) |
| B6 | No leaks through a "convenient" door | serializer shared with admin → leaked `inventory_quantity` for 6 years | buyer context is a hint, grants no permission | deny-list in the validator | test "detail reveals no more than summary about existence" for every adapter | G |
| B7 | Site map | none (a product has no "page") | none; MCP **Resources** (uri, `lastModified`, subscribe) fit the shape "addressable page/block" better than Tools — UCP only uses Tools | `contract inspect` lists `pages`; `page.text {outline}` | `?view=pages`: route → occurrences on the same ID — **do not create a third map** beside `content-map.json`; consider exposing content as MCP Resources | CMS |
| B8 | Locale | Storefront `@inContext` | only a `context.language` hint | `locale` filter + `translationGroupId`, each translation its own id | keep v1 — UCP has no translation model | CMS |

## C. Write path

| # | Topic | Shopify | UCP | v1 | v2 | Label |
|---|---|---|---|---|---|---|
| C1 | Structured errors | `userErrors {field, message, code}` (36 `productSet` codes); system errors in `errors[].extensions.code` | **two tiers**: JSON-RPC error for transport vs a successful result `ucp.status:"error"` + `messages[]{code, path JSONPath, severity}`; does not use `isError` | machine codes only in tracy-web; slot errors are text, `refusalNext` regex | Claude Cowork plugin returns `{code, field:{contentId,blockId,key}, severity}`; `refusalNext` switches on `code`; keep `next` (Tracy has it, neither Shopify nor UCP does) | G |
| C2 | Atomic + partial | `productSet` all-or-nothing; bulk has `allowPartialUpdates` | cart PUT the whole cart | 1–1,500 slots/apply, transaction | keep atomic; if partial, the receipt lists the slots written, `userErrors[]` per slot | G |
| C3 | Repeater | declarative (send the whole list, missing = delete) | — | no list semantics yet | declarative vs op-based by `itemId` — needs PO | G |
| C4 | Idempotency | `@idempotent(key)` 24 h, `productSet` not yet | key **is signed** + SHA-256 body check; same key different body → 409 | `request_id` deterministic hash, no declared TTL | declare a TTL for keeping `request_id` in the Claude Cowork plugin; consider body checking like UCP — **must ask PO** because of ADR 0021 §6 | G |
| C5 | Undo | no version history; append-only `events` | — | §6: build no new undo | keep §6; add a "content changed" event so caches invalidate themselves | G |
| C6 | Data ≠ presentation | product via Admin; sections in `templates/*.json` + `write_themes` | — | slot text via the Claude Cowork plugin; presentation-lock | do not open a presentation write door in the Content API | CMS |
| C7 | Confirm before write | Sidekick does not write by itself — fills the form, a person Saves | checkout state machine, a step that needs a person = `continue_url` | apply directly, `evidence` is the only confirmation | measure two paths: direct write + `apply.revert` vs `apply {dry_run}` returning a diff; do not require confirmation on every write | G |
| C8 | Transport to the Claude Cowork plugin | Bearer/token | relay signs RFC 9421 (ES256), `UCP-Agent` header | token in the body (Joomla/WP), Bearer PAT (EmDash) | consider a relay signing RFC 9421 to the Claude Cowork plugin instead of the token in the body; **keep the relay, not permissionless** | G |

## D. Tools for the agent

| # | Topic | Shopify | UCP | v1 | v2 | Label |
|---|---|---|---|---|---|---|
| D1 | Tool ceiling | 0–20 clear, 50+ breaks; 20 tools/app, 512-character description, ≤ 4,000 tokens/answer | tools bundled by domain (`catalog{…}`), `structuredContent` + `outputSchema` required | one `tracy_site` but 28+ actions; `content.contract` description 1,785 characters | ≤ ~12 actions/surface; JIT guidance in the **answer** (`next: {tool,args}` beside `slotKey`); token budget/answer + `truncated`; `outputSchema` for `content.read` | G |
| D2 | Drop inspect | Resource Links, progressive disclosure | search → get → lookup separate | read → inspect (10–80 s) → apply | `content.read` returns `slotKey` + revision enough to apply; inspect only for slots outside the map; separate `list/get/lookup` | CMS |
| D3 | Measurement | calibrated judge (Kappa 0.61/0.69), refusal accuracy 86 % | published conformance suite | table of 9 questions × 3 CMS scored by hand | keep the table as ground truth; automatic judge on transcripts; shared conformance test for the three adapters | G |

## Do not copy (C)

Public-by-default · `variants/price/inventory/availability` · cart/checkout/payment/order ·
buyer context · multiple shapes · permissions by app scope (Tracy is a seat on the site) · ACP-style static feed.

## E. Six CMS content APIs — Contentful · Sanity · Storyblok · WordPress · Payload · Directus (26/09)

Lee (26/09): learn from CMS content APIs rather than from Shopify. Six research files + a Codex review
converge on the rows below; the "Who" column lists the CMSes that confirm independently — a row with
≥ 2 CMSes is a conclusion, a row with 1 CMS is a suggestion. Labels as above; plus **[v1 better]** =
Tracy v1 is already stronger than that CMS, keep.

| # | Topic | Who | What they do | v1 / v2 plan | v2 choice | Label |
|---|---|---|---|---|---|---|
| E1 | **No CMS has a whole-site snapshot** | 6/6 + Codex | Consistency per document (`_rev`, `sys.version`, `modified_gmt`), per query (Sanity sync tag), or a site-level counter (`cv`) | v1 signed cursor tied to a whole-site snapshot | Listing/`describe` use a **cheap site-level counter** (`site.contentVersion` increases on every apply, `cv`-style); `contents[].revision` for `expected_revision`; signed cursor only for continuation. Codex: also keep a separate `presentationRevision` | G |
| E2 | **Read address = write address** | Sanity (`_key` + path), Directus (row id + `sort`); WP/Payload/Storyblok/Contentful **do not** (editing one block = sending the whole page, block id not committed to be stable) | Sanity `_key` "immutable throughout the lifetime"; Directus PATCH row | v1 `slotKey` + stable HMAC `blocks[].id` | **Keep — v1 is in the good group.** Add invariants to conformance: "changing `position` does not change `blocks[].id`", "applying one slot does not change other blocks' ids" | [v1 better] |
| E3 | **`writable` from a seat × type × field permission table, computed by the server** | Directus `/permissions/me`, Payload `/api/access`, Contentful role field×locale, Storyblok field permission, Codex | Separates "what may I do" from "what exists"; deny wins; field forbidden for writing → **403 before validation** (Directus), not silently skipped (Payload does the opposite — do not copy) | v2 plan V2-1 `writable` on the field | `writable` at **content → block → field** (inherited, `null` when the upper level does not know); computed at the **relay**; `describe.permissions` is **the same table**; also takes **locale** into account (a seat translating `vi` does not write `en`); WP only has per-record permissions → `writable` for the whole page, do not fake field-level | G |
| E4 | **`describe` = schema + permissions + guidance, filtered by seat** | Storyblok `/components`, Directus OpenAPI by permission + `mcp_system_prompt`, Payload `getCollectionSchema`, Sanity schema deploy, WP Abilities `outputSchema` with `title/description` | One call returns every block kind/field type/translatable/min-max | v2 plan V2-3 only `types[]{type,count}` + capabilities | Add **`blockKinds[]{kind, fields[]{key,type,translatable,writable}}`** generated from `content-map.json`/`template.config.json` — **this is the "quickstart content map" Lee wants**; `permissions`; short `guidance` issued by the quickstart (replaces the 1,785-character tool description); `i18n{mode, locales, fallback}`; the `scope` in force; list of ops + depth; **filtered by principal** (cache per principal) | G |
| E5 | **Map from content → where it is displayed** | Sanity CSM/stega, Storyblok `data-blok-uid`, Directus `data-directus`, Contentful CSM; Codex | Three ways, one idea: from an element on the page back to `(id, path)` for click-to-edit; Sanity/Contentful only in preview, Sanity had to patch the clipboard because of stega | v1 only the content → page direction; `content.find` greps files | **No stega in public HTML** (4/4 agree). Two levels: (a) cheap — **anonymous** `sourceMap`/`anchor` in `content.read`/`view=pages` (v1 §3 forbids real selectors); (b) expensive — the theme emits `data-tracy-block` when rendering **with a seat** (touches three themes + gate `cms-sections`). Ask PO | CMS |
| E6 | **Ops per change, transactions across many contents, revision per content** | Sanity (`set/unset/insert`, one request = one transaction, `ifRevisionID` per document), Contentful JSON Patch + required `X-Contentful-Version`, Codex | Precondition per write target inside one atomic transaction | v1 `changes{slotKey}` only `set`; `expected_revision` for the whole contract | `apply {items:[{contentId, expected_revision, changes}]}` atomic, 409 lists the mismatched `contentId` + `current_revision`; add `op` (`set` default, `unset`, `insert{before/after itemId}`, `append`) — a Claude Cowork plugin that does not implement it yet returns `SLOT_OP_UNSUPPORTED`; C3 repeater → **op-based** (3/3 sources); conformance: the adapter **refuses** an apply missing a revision when `writable: true` | G |
| E7 | **Scope the model, write to draft by default, receipt says which version was written** | Sanity Agent Actions `target{path,include,exclude,maxPathDepth}` + "never modify published directly" + "check the returned `_id`" | Discipline for the LLM, not permissions | none yet | `next.args.allowedSlotKeys[]` + `SLOT_OUT_OF_TARGET`; receipt `writtenTo: published\|draft\|current`; direct write stays the default (C7 being measured) | G |
| E8 | **Nobody has confirm/undo at the API layer** | Sanity, Payload, Directus, Storyblok, WP, Contentful (6/6) | Write directly; confirmation belongs to the client/Studio; undo = native revisions + revert (Directus `/utils/revert`, WP revisions cannot restore via REST) | ADR 0021 §6 | **§6 stands.** `dry_run` if chosen: return the **envelope after applying** (Sanity `noWrite`), do not use WP autosave as dry-run (it creates a real revision); Contentful bulk = diff + approve + **stale detection** = `dry_run` + 409 per content | G |
| E9 | **Lock held by the person who has it open** | WP `_edit_lock` + Presence API #549 (24/09/2026: "an agent can edit a post you have open, and neither of you knows"), Payload document locking 300 s (`overrideLock` default true), Joomla `checked_out` | Locks are heuristics, the API ignores them | none yet | `content.read` returns nullable `lockedBy{kind, until}`; apply returns `SLOT_LOCKED_BY_USER` `recoverable` + `next: ask the customer`; **do not** give the agent a flag to bypass the lock | G |
| E10 | **Errors for many slots at once, structured `field`, no existence leak** | WP `data.params{field}`, Payload `errors[]{path}`, Directus `extensions{code, field}` + "FORBIDDEN … or it does not exist", Contentful `details.errors[]{path}` | Gather every field error in one response; a seat without permission → same code as "does not exist" | v2 plan V2-4 singular `error` | plural `errors[]`, validate everything before writing; `SLOT_NOT_WRITABLE` checked **before** `SLOT_TOO_LONG`; a seat without permission to read the slot → `SLOT_UNKNOWN` (no leak) — ask PO because it touches `severity`; add `RATE_LIMITED` + `retryAfter`, `REVISION_STALE` recoverable + `next: content.read`. Keep Tracy's `severity recoverable\|unrecoverable`, **do not** switch to Sanity's `error/warning` (a different question) | G |
| E11 | **Projection by field** | WP nested `_fields`, Payload `select`, Directus `fields[]` + `deep`, Contentful `select` 2 levels, Storyblok `excluding_fields`; Codex | Reduce bytes for the LLM, replaces partial fragmentation | v1 only `summary/complete/partial` | include-only `fields=` for listing (`contents.blocks.fields.key,value,slotKey`); cut at the relay if the adapter cannot project (Joomla SQL); signed cursor + ETag include the projection; validator accepts envelopes missing fields per the projection; forbidden fields: **dropped** by default, named explicitly → 403 `CONTENT_FORBIDDEN` with no leak | G |
| E12 | **Incremental cache** | WP `modified_after` + `orderby=modified`, Contentful Sync API (tombstone `DeletedEntry`), Sanity keyset `_id > $lastId` (rejects offset), Storyblok `cv` | `updatedAt` per record + explicit deletions | v2 plan V2-2 non-null `updatedAt` | `updatedAfter=` for listing (lists deletions too); adapters may **implement `page` with keyset** (EmDash needs it); `updatedAt` must say **of which version** (draft/published — Contentful changes the meaning by API); EmDash proves it has `updatedAt`, otherwise `null` + required `revision` (Directus is optional too); "content changed" event carries `idempotencyKey = hash(site, contentId, revision)` at-least-once; **do not** build a Sync endpoint | G |
| E13 | **Translations: separate entity + group** | Storyblok folder-level (`group_id`/`alternates`), Contentful field-level + fallback, Payload `locale=all` one document, WP Polylang **free has no REST** (only Pro does) | Two models; all three Tracy CMSes use separate entities | v1 `translationGroupId` = `group_id` | Keep; add `contents[].alternates[]{locale, id}` in the summary (cheap) and `describe.i18n`; WP gets the group from Polylang PHP in the Claude Cowork plugin, **not** from REST; Codex: `requestedLocale/resolvedLocale/inherited` when there is a fallback | CMS |
| E14 | **Shared content with per-instance overrides** | WP pattern overrides (`wp:block {ref, content:{name:{attr}}}`), Contentful/Sanity reference | One visible piece of text has **two write targets**: source vs override | v1 `sharedContentId`, occurrence does not embed a copy | `view=pages` occurrence carries `overrides:[key]`; apply takes `scope: instance\|source` + an occurrence target precise enough to identify the instance; **not declared → 400 `SLOT_SCOPE_REQUIRED`**, do not default to editing the source (defaulting to the source would change every page) | CMS |
| E15 | **Block Bindings are WP's native `slotKey`** (6.5→); **Abilities API** (6.9, Tracy ships 7.1) | WP | `metadata.bindings` → post meta with `auth_callback` + `revisions_enabled`; ability = tool with schema + `permission_callback` + readonly/destructive/idempotent annotations; `mcp-adapter` 3 meta-tools; `Automattic/wordpress-mcp` archived | separate Claude Cowork plugin via `admin-ajax` + token in the body | `describe` declares `slot.native: block-bindings\|metadata-name`; `next`/capabilities carry `annotations`; **WP v2 reader**: path **B** (keep the Claude Cowork plugin, transport Abilities API + application password — drop `admin-ajax nopriv` + token body, keep check-then-write in one request and the hash-lock) instead of A (pure REST: loses the door for editing one block, +2–3 calls/apply, rewrite the theme's 292 slots) — **measure one ability `tracy/content-read` on dev WP 7.1 before Lee chooses** | CMS |
| E16 | **Presentation-lock is a deliberate difference** | Storyblok (none, feature request open), Directus ("layout changes not supported", ACL only), Payload (block = layout builder, cannot be locked), WP (template is a post type behind `edit_theme_options`, Tracy's lock only **detects after the fact** via hash) | No CMS locks the structure while allowing values to be edited | v1 presentation-lock | Keep; `describe` declares `ai.tracy.content.presentation: locked` + readonly `blocks[].position` so the agent does not propose "swap two sections"; `SLOT_NOT_WRITABLE` for fields of `type: html` unless the adapter can split the block (Contentful: editing inside rich text = sending the whole field) | CMS |

**Do not copy from CMSes:** perspectives/releases/environment/branch (needs draft-as-record, which
customer sites do not have), per-space preview tokens, Rich Text JSON instead of `bodyHtml`, writable
`sort`, `_uid` as block id, versions endpoint/new undo (§6), stega in public HTML, Sync endpoint, multiple spaces.

**Codex additions (merged into E1/E3/E5/E6/E13):** the relay computes `writable`; 304 is the wrong
transport (POST) → cache in JSON; separate `presentationRevision`; an EmDash runtime harness must be
built; budget enforced by the adapter; baseline 3 questions × 3 CMS.

## Proposed order for v2 (Lee decides) — revised 26/09 per Codex + six CMSes

1. **Minimal V2-3** — `describe` with `capabilities` + write-target contract per adapter +
   `blockKinds` (E4): version negotiation first, because the three adapters upgrade out of step and
   `describe`/`view` are currently blocked by the relay allowlist (`route.js:2200`).
2. **V2-1 + core of V2-4** — three-level `writable` computed by the relay (E3), `constraints`,
   `apply {items[]}` with a revision per content + `op` (E6), `errors[]` + `lockedBy` (E9, E10). Read →
   write → read back on the three adapters; separate EmDash write target (`tracy_emdash`).
3. **V2-2** — `site.contentVersion` (E1), `updatedAfter=`, `fields=` (E11, E12), cache in JSON;
   `page` only when a measurement proves it.
4. **Full V2-3** — `view=pages` with `overrides`/`alternates`/anonymous `anchor` (E5, E13, E14).
5. **V2-5** — JIT `next` + `allowedSlotKeys` (E7), `annotations`/`tier`, token budget.
6. **A1** — public/agent identity: later, not blocking.

**Lee settled on 26/09/2026 per the recommendation:** A3 keeps two revisions (content + presentation) ·
E5 anchor at level (a), anonymous in the envelope · E10 `SLOT_UNKNOWN` for seats lacking permission ·
E15 leans to path B for WP, final choice after the measurements · C3 op-based. Full table:
`tasks/todo-content-api-v2.md` §Decisions.

## Technical notes for the committer

- The four source documents and this document were written on a local checkout 234 commits behind
  `origin/develop`, so `doc-links`/`doc-frontmatter` are red locally for the links to ADR 0021,
  `content-api-v1.md`, `content-api-integration-decision.md`; on `origin/develop` they exist. Run
  `pnpm docs:index` before opening a PR (`docs/README.md` is GENERATED).
- Gate `doc-frontmatter` requires every `sources:` entry to be a real path in the repo; external
  source URLs are in the "Sources" section at the end of each research document.
