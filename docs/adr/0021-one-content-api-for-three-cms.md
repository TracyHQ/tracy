# 0021 — One Content API for Joomla, WordPress and EmDash

- **Date:** 25/09/2026.
- **Status:** direction agreed with Lee; the v1 spec and the rollout schedule are proposals for review, not implemented.
- **Status update (28/09/2026):** implemented. `tracy-content/v1` runs through the relay's `content.read`
  (`apps/tracy-web/src/sites/route.js`) on all three CMSes — Claude Cowork plugin Joomla
  ≥ 0.18.0, WordPress ≥ 0.14.0 (native ids from 0.18.2 / 0.14.2), the EmDash Business reader — together with the v2
  parts: `describe` (answered by the relay), `view=pages`, `fields`, `version`/`ifVersion`/`changedSince`,
  `lockedBy`, `maxBytes`, `native`. Shared schema: `packages/cms/tracy-content-api`; public documentation
  coming at `/docs/api` ([plan](../../tasks/todo-api-portal.md)). The original status line above is
  kept as history.
- **Requested by:** Lee; recorded by Codex from the session comparing `products.json` with the Tracy quickstarts.
- **Complements:** [ADR 0016](0016-two-layer-source-contract.md); does not replace the source contract.
- **Related:** [ADR 0017](0017-github-release-is-quickstart-source-of-truth.md),
  [ADR 0022](0022-quickstart-contract-is-advice.md) (supersedes ADR 0020).
- **Spec:** [Content API v1](../references/content-api-v1.md).
- **Execution:** [Content API plan](../../tasks/todo-content-api-chung.md).

## 1. Problem and goal

Lee wants every Tracy site to have a JSON door like a product catalog: a machine can read structured
content, from an index down to one specific object, without crawling each HTML page or loading the whole
site into the agent's context. The agreed name is `/content.json`.

This is an endpoint that reads from the CMS, not a hand-copied file. It describes a site's CURRENT content.
Being able to read a field does not mean being allowed to edit it. Write rights still belong to the CMS's write door and
contract. The goal is to unify how content is read, not to replace the storage model of the three platforms.

## 2. Evidence at develop c7f455c16

Survey of code and JSON on 25/09; the new endpoint has not been measured on a real site.

| Component | Already there | Gap for this goal |
|---|---|---|
| `apps/tracy-web/src/ops/quickstarts.js` | List, detail and capabilities of a release, with a guard | It describes a release, not the live content of a customer site |
| `apps/tracy-web/src/lib/quickstart-capabilities.js` | Shared reader, adapters for three platforms, source/hash/unresolved | WordPress does not yet emit page–block relations; not a Content API yet |
| Joomla Business j6/1.2.0 | Map has 368 entities, 1,797 slots, 78 page records | Assignment does not prove a block is actually displayed |
| WordPress Business wp7/1.2.0 | Map has 11 entities, 292 slots; 8 pages and 3 options | No pages array in the map; inventory/binding must be stitched together |
| EmDash Business | `seed/site-model.json`, `seed/personalize.json` | Model/seed is a template copy; live reads must go through an authorised API |
| `tracy-site-tools/src/host/site.mjs` | `narrowInspect`: large answers become an index; filter by page/entity/type | Filters after receiving the Claude Cowork plugin response; does not yet prove reduced source I/O |
| `apps/tracy-web/src/brief/bindings.js` | Does not infer write targets from matching names | The two Business maps surveyed have 0 `semanticKey` |

Figures for one profile do not represent every quickstart or all CMS content. WordPress 1.2.0
being in the repo does not mean the currently selected release has moved to 1.2.0.

## 3. Decision

### 3.1 Four objects, four responsibilities

| Object | Responsibility | Source of truth |
|---|---|---|
| Quickstart catalog | Which versions exist, which artifact to install | GitHub release + setting; ADR 0017 |
| `site-model.json` | Describes the source used when building the site | Adapter/compiler per ADR 0016 |
| `content-map` and contract | Locates editable fields, limits, presentation protection | Released profile and the binding inside the site |
| `/content.json` | Current content the caller is allowed to read | The running CMS, through the adapter |

No new hand-copied quickstart catalog. `sample` in the map is not taken as the current value.
The Content API cache is only a read copy with a revision/timestamp, not a second source of content.

### 3.2 One read interface, adapters per platform and quickstart

The envelope and field meanings are shared by the three CMSes. The adapter is responsible for resolving the real entity,
language, relations, read rights and revision. Quickstart-specific rules are versioned data,
not a branch hardcoded by customer name in the shared reader.

ACM, block markup and collections are not forced into the same storage structure. Nor is every object
required to have every field: a page has blocks, an article may only have a body, shared content has no URL.
Platform-specific information needed for diagnosis lives in the internal mapping; the generic consumer is not required to understand the CMS.

### 3.3 The model is a graph; a tree is only a presentation

`contents[]` holds independent units: page, article, service, project, shared or generic.
A page contains block occurrences; an occurrence references shared content by ID.
A footer used on ten pages has only one source content. Order belongs to the occurrence in the page, not
to the shared content. Articles/services are listed by reference, not embedded recursively in full.

Images have metadata and usages; repeated lists have their own item IDs. Relations must have an explicit type and target.
V1 does not claim every block in the map is displayed to every customer: visibility can be unknown.

### 3.4 IDs, slugs and semantics

A content ID is an opaque string, stable within a site across title/slug changes and content edits. The ID is
tied to a binding or a durable source identity; it is not generated from array order, label or URL. Fork/import
to another site does not promise to keep IDs; identity is always the pair site ID + content ID.

Each translation has its own ID; a translation group links them. A slot key keeps its identity in
the bound contract. A semantic key is a verified mapping per profile/version; it is not inferred from a label.
A missing mapping means null + unresolved, not a plausible-looking key that leads to a wrong write.

### 3.5 Readable content is broader than editable content

The adapter lists readable content within the scope it supports, including parts with no write slot. The response
declares coverage and what is not yet supported. A map with 292 slots is not called the whole WordPress site.

Slot metadata in the authenticated view helps the agent find the write door; it does not grant write rights. Before every
mutation the Claude Cowork plugin's inspect/rights/revision checks still apply. EmDash must not be advertised as having a
presentation-lock or transaction rollback equivalent to Joomla just because the read responses look alike.

### 3.6 Authenticated reads first, public later

Proposed v1 rollout: `/content.json` authenticated through the site's existing mechanism, read-only. No new
token/sign-in and no token passed in the URL. A public version is not turned on just because of the Gymshark example.

If opened publicly in a later round: only published content, within its schedule, under the correct ACL; exclude drafts, protected
content, form data, user information, secrets and the physical mapping. Relations, counts,
image usages and caches must also be filtered by the same rights. Authenticated responses do not use a shared
cache. Revoking a seat must block detail, old cursors and cache hits.

### 3.7 Partial reads and consistency

The default list is small, supports summary/detail, filtering by type/language and querying by ID. Limit
both the number of elements and the number of bytes. A truncated item must carry a flag plus a path to read further, never silently cut a string.

A cursor is bound to the site, the caller/permission scope, the filter and the revision snapshot; if data changes between
pages, the old cursor is refused so the reader starts again. Do not promise a consistent snapshot if the adapter
only has a per-record hash. Until full invalidation is proven, do not turn on a paginated
scan advertised as a consistent snapshot.

Distinguish schema version, quickstart version, contract hash, content revision and read time.
Do not use one record's `updated_at` as the revision of the whole site. An ETag only represents a response in the same
permission scope; private views start with `Cache-Control: private, no-store`.

### 3.8 Ownership and operating path

The API spec spanning TCH and the Claude Cowork plugin in the Cowork repo must be synchronised with the owner of cross-repo
protocols before release (rule in the ADR index). During drafting, the spec in TCH
is a proposal; the enforced schema must have a single home, not three independently copied validators.

Intended path: Joomla/WordPress put the reader in the native Claude Cowork plugin, EmDash in the template's
integration; `/content.json` on the site origin leads to the authenticated reader. The agent calls through Tracy's existing
transport. Phase 0 must confirm routing, auth and the upstream owner before coding, especially
a Joomla site with a `content.json` menu alias or a WordPress rewrite on the same path.

## 4. Order and scope

Schema + fixtures for three CMSes → Joomla pilot → WordPress + EmDash → agent consumer → rollout.
The summary reader reuses existing logic where the meaning matches, but does not silently change the shape of the current capabilities
endpoint. Released contract profiles stay immutable; mapping is extended through an extension with a
base hash or a new profile version, depending on what the Claude Cowork plugin supports.

Out of scope: a shared write API, CMS migration, building new themes, raising agent rights, a default public
feed, making semanticKey a condition that stops old sites working. Do not add this work to the beta on our own.

## 5. Trade-offs and rejected options

- **Three separate JSONs:** fast for the first adapter, but every agent/consumer must learn three systems.
- **Publish only the content-map:** lacks live values and ignores content outside the set of editable slots.
- **One full dump per call:** easy to start, but costly in I/O and context; the narrowInspect lesson already exists.
- **Crawl HTML:** useful for verifying display, not enough to identify content or edit rights.
- **Unify the write doors too:** out of scope and hides differences in control/undo between platforms.

Cost accepted: one versioned schema, three adapters, quickstart mapping and rights/
revision tests. Benefit: consumers read one interface; new content does not require the agent to guess where it is stored.

## 6. PO decision on undo — 25/09/2026

Lee, as PO, settled: the Content API does not build an additional undo, journal or receipt system to
undo changes, and does not unify the undo mechanisms of the three CMSes. Integration acceptance is reading the live content correctly
→ writing through the existing door with native rights/revision checks → reading back to confirm the result.

Keep the existing undo mechanisms as they are. Undo regression checks are only required when a change touches the write path,
receipt/journal/revert or a shared dependency that can affect them. Do not delete tests or
lower existing gates; do not require a new end-to-end undo flow across all three adapters as a condition
for completing the Content API. Deployment rollback in P6 still stays, distinct from undoing customer content.
This decision only changes the scope of the Content API; it does not remove the undo capability of the Tracy product.

## 7. Definition of done

Three real fixture sites answer the same read questions for the same content meaning; list/detail match CMS values;
changing a slug keeps the ID; an admin edit changes the revision; an old cursor is refused; the footer is not duplicated;
translations do not mix; no data leaks without rights; the quickstart's design advice (ADR 0022) is not weakened. The integration read →
native write → read back passes; undo regression checks per the scope of impact in §6.

Measure separately bytes/request, I/O time, number of source requests and the size fed to the model. The Gymshark
catalog load time is not an SLA for Tracy and not the time a model takes to understand the content.

## 7. P0–P1 results and adjustments 25/09/2026

Lee assigned the P0–P1 code in this round; no adapter/deploy. The general direction in §3 is unchanged.
The [P0 report](../references/content-api-p0.md) compares develop `b2a0990fe` and the upstream Claude Cowork plugin,
and spells out that the POST token is not yet GET auth, Joomla inspect has side effects, and revision is not yet a snapshot.

TCH `packages/cms/tracy-content-api` is chosen as **the single home of the candidate schema/validator**;
the authority over cross-repo protocols stays with tracy-docs, which must be synchronised before an adapter release.
No claim is made that the spec has been approved by the maintainers of the three repos. PHP producers share the corpus in
CI, no validator copied per CMS. Auth bridge/cursor/materialized snapshot are P2–P4 designs,
not yet verified at runtime.

Three technical adjustments to the spec: references are checked against the gathered authorized scope (not just one
page); `publication` is added so a draft overlay is not passed off as a published value; partials have
explicit continuation. The P1 fixtures are extracted from profile/seed, not live captures. Since there is no snapshot
implementation yet, the P0 gate becomes **state the evidence and the runtime blockers**, without requiring the P1 schema
to prove adapters not yet assigned. The P2–P4 runtime gates stay and must not be dropped.

## Addendum Joomla P2 pilot — 25/09/2026

Does not replace the PO decision in §6: the Content API does not build new undo/journal/receipt. Read → write through
the native door with rights/revision → read back is the integration acceptance; the old revert is only regression-checked
because resolver/transport in the same code area have changed.

The candidate implementation lives upstream in Cowork, not as a patch to TCH's vendor tree. `readMapping()` is separated from
`inspect()` and runs in a read transaction; a broken binding returns an error, no adopt/repair. The site/identity
registry is only installed by an opt-in CLI, INSERT/DELETE triggers share a transaction with the native row.
Importing into another site must rekey explicitly. GET does not backfill or write the registry.

The Joomla pilot uses the public CMS audience of the bound entities, but the transport still needs a credential.
The relay keeps the `code` policy and the current seat; the HMAC principal is bound to site/person/role/effective policy,
and the Claude Cowork plugin additionally binds a credential epoch. This is not a new read-only token scope or a new editor right.

The snapshot uses InnoDB repeatable-read for the DB, a broad fingerprint including ACL/binding/associations and
time-based visibility. Scanning `images/` before/after detects byte changes within the read window,
without creating a DB+filesystem transaction. Each page rescans the source; the linear cost must be measured, not
advertised as constant-cost paging. A 300-second cursor is a pilot candidate, not yet a production SLO.

Block occurrences by page/source UID; physical fields by slot key. A positional slot XPath is not treated
as a durable item identity. Repeaters and out-of-scope media remain unresolved; the P1 schema is not changed
to hide what is missing. Evidence and pass level per case: [REPORT P2](../../tasks/evidence/content-api-p2/REPORT.md).

## Addendum integration per Lee,25/09/2026

- Site identity does not use the hostname: a domain move keeps site/content IDs; fork/new site gets a different seed.
  WP674c886 does not yet pass domain move; upstream is required to do an explicit migration/rekey, not to change GET.
- The content-toolset⇒editorial proposal is not accepted. The relay uses the existing code right, scope published;
  editorial rights need a separate server decision, not inferred by the agent or a native service token.
- Chose optional `error.links.firstBlock` + error.snapshot to discover blocks on body413, instead
  of the sentinel blockId=first. The shared spec/tests come before implementation; a signed continuation must
  keep auth/site/principal/scope/owner/snapshot/expiry. Body still returns 413 if a scalar alone exceeds the budget.
  The consumer ends a block scan on nextCursor=null, and does not loop links.next back to body forever.
  This schema/validator change comes from the PO's shared integration requirement, not loosened to accept only
  Joomla or a WP blockId chain without a snapshot. Capability discovery is not advertised yet.
- The relay codec per CMS is decided by the platform server: consumers see a shared shape, the native WP wrapper
  is normalised at the relay. The three native Claude Cowork plugins are not required to share an internal envelope.

The release0.13.7 regression profile is recorded separately; having rebased main is not used as evidence
of release safety; customer sites are not rebound. These decisions do not permit push/release/deploy.
