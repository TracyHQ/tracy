---
description: Comparison of the Joomla, WordPress and EmDash protocols before integration; server permissions, identity, payload and the cases not yet accepted.
sources:
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/test/component.test.mjs
  - scripts/test/content-api-joomla-runtime.test.mjs
  - packages/cms/tracy-content-api/schema.json
  - packages/cms/tracy-content-api/validate.mjs
---

# Content API — integration comparison of 25/09/2026

Joomla owns the relay and the shared docs; the WP/EmDash adapters are not edited. Per
[spec v1](content-api-v1.md), [runtime cases](content-api-runtime-cases.md) and
[REPORT Joomla](../../tasks/evidence/content-api-p2/REPORT.md).
Added the firstBlock schema/validator at the PO's request in run 2; no public feed, push, release or deploy is turned on.

**The current status is in §WP handoff run 2 at the end of the document.** The earlier review tables are kept
as history; the old version's gaps on principal/S04/expiry/subdirectory have been superseded by the new handoff.

## Sources compared and status

- Joomla: Cowork `a70e5aca1327e2d6f38edf30e72f831fb2008b88` + an uncommitted patch in a scratch checkout, Claude Cowork plugin 0.17.4; Joomla 6.1.1/Business j6 1.2.0.
- WP: read in full [`tasks/evidence/content-api-wordpress/REPORT.md`](../../tasks/evidence/content-api-wordpress/REPORT.md),
  especially §7. Old handoff TCH `52d0f27e0`, Cowork `ef8e2f9` **not imported**. Source reviewed from
  object `28ab883654a31a07584c7387bd4dfef0a4e3087b` (on main `aa5f352`, Claude Cowork plugin 0.13.7),
  not taking in-progress uncommitted edits as the handoff. Waiting for the WP session to hand over the SHA after rebase
  and new evidence. The reported runtime is WP 7.1/Business wp7 1.1.0, candidate 0.13.5.
- EmDash: read in full `REPORT.md` and `IDENTITY.md` in a scratch checkout
  (`tasks/evidence/content-api-emdash/`). Local kit
  `cdf3f6a351579216cb9988dc57cb3ee7b8e2193a` on `74f08df`, not yet imported into the Joomla branch.
  Business 1.4.3, EmDash 0.38.0, Astro 7, Node 24.11.1; scalar reader on real Node SSR.
  The repeater identity experiment has been removed from the fixture; not pulled into the release path.

The WP/EmDash measurements below are evidence handed over by the owning sessions, not Joomla re-running them.
Support for every profile is not inferred from one fixture. WP 1.2.0 was not measured because the archive lacks
`tracy_site_identity`; S04 concurrent snapshot, real-wait expiry and subdirectory were still pending
in the handoff received. EmDash does not yet meet repeater, detail continuation or the Tracy seat relay.

## Compatibility table

| Protocol aspect | Joomla pilot | WP as reviewed | Integration condition |
|---|---|---|---|
| Native request | `action:content.read`, flat query `params` | `params:{query:{...},scope:...}` | WP accepts a flat query; authority in the server envelope, not in the agent's query |
| Success | v1 envelope directly | `{ok:true,status:200,content:envelope}` | Agree on the direct envelope; the relay currently refuses the wrapper with 501, never guessing/unwrapping to open permissions |
| Error | HTTP status and `{error:{code,message,...}}` | native wrapper `error` string, `body.error`, `status` | WP outputs the same error body/status; Tracy seat/policy errors remain the existing outer layer |
| Probe | A real read `content.read {limit:1}`, no inspect/adopt | Action exists but envelope/principal don't match yet | Version is not enough; only accept a checked protocol, no sample/public fallback |
| Principal | Relay HMAC site/email/role/policy/scope; Claude Cowork plugin adds a credential epoch; separate service GET | Constant `site-token` for GET/POST | WP must bind the cursor to the server seat principal; a site token is not a seat |
| Scope | Published mapped public-audience, with category/menu ACL and schedule | GET 950 published; editorial 1033 including 83 more drafts in the fixture | The relay chooses from server permissions. No editorial grant yet: keep published; no default editorial for owner/admin/developer |
| Revision | Authorized projection + referenced images + contract hash; content revision uses the snapshot | Scope-specific snapshot; per-content revision may not change when a shared footer changes | Native writes always take the fresh native revision. The dependency scope needs settling; never use the content revision as a write token |
| Cursor | Site/principal/filter/snapshot/absolute expiry 300s; supports cursor-only and refuses a different filter | Site/service principal/scope/filter/revision; continuation may extend 300s | WP fixes the principal; proposes the same absolute scan deadline. Runtime check after the new SHA |
| Stable ID | Registry incarnation, site UID independent of domain, explicit fork rekey | UID postmeta + site identity + `home` in the HMAC | Changing domain currently changes WP IDs. Proposal: remove domain from identity, keep explicit rekey for forks before integration |
| GET migration | No; opt-in CLI outside reads, native INSERT/DELETE triggers | No; explicit `content.identity`, insert hook after opt-in | WP lifecycle/concurrency/migration failures need checking; never turn on identity by probe |
| Payload | Block continuation, defer body if each scalar fits the budget; scalar too large gives 413 | Block request not in the reviewed source; body too large gives 413 | Do not change the schema to accept data. Block projection/body rules below |

950 and 1,033 need not be equal: different scopes can both be correct. However, a difference of 83 drafts is not enough
to prove ACL: WP needs to list the visibility kinds filtered (private/future/password-protected/attachment/
shared template) and prove that list, detail, count, unresolved and relations do not reveal forbidden records.
The source review found editorial includes private/future/password-protected, while attachment/
wp_template metadata is loaded separately; the graph and the real permissions need checking, never inferring permissions from the totals.

Joomla before run b0a40e0 hashed the DB broadly, which could reveal change signals outside the projection.
The 25/09 fix hashes the authorized projection and the referenced images; hidden article/module edits,
ACL labels and unrelated images do not change the revision. The media/translation API and permission cases
are recorded in REPORT P2. This narrows the implementation to keep non-leak semantics, without changing the
schema or loosening permissions. It still scans DB/images broadly: no claim of hiding timing, every ACL combination or
atomic filesystem. FirstBlock has a signed snapshot/cursor; runtime 400 and repeater are still not met.

## Server-owned permission envelope

The consumer only sends the action and a flat query. The relay checks the site fence, accepted seat and current policy
on every request; `content.read` needs the existing `code` toolset. No new write permission is granted.
`scope`, `principal`, `contentScope`, `contentPrincipal`, `query` in params give 400.
Top-level authority fields sent by the caller are not forwarded; the server rebuilds them:

```json
{"token":"<service credential>","action":"content.read","params":{"limit":1},"contentPrincipal":"seat:<server HMAC>","contentScope":"published"}
```

The HMAC uses `[siteKey,email,role,effectiveRolePolicy,contentScope]`. The Claude Cowork plugin authenticates the service
credential and then binds principal/scope into the cursor. This value distinguishes seats; it does not pretend to be a native
CMS user. A direct GET uses the service principal and a predefined scope, not accepting a URL scope.
Policy currently only has the content/code/site/lifecycle toolsets, with no separate editorial read grant.
Waiting for the PO to decide editorial permissions; keeping published is the pilot limit, never adding permissions from a role label.
Joomla refuses other scopes with 501. WP must accept this envelope before the relay turns on support for that adapter.

## WP identity: requirements before automatic opt-in

`content.identity` is currently an action with the site token, ahead of the Engine; there is no separate native admin
capability/Tracy seat check. The TCH relay does not allowlist this action and it must not be added to the read
probe. If it goes into provisioning, it must state clearly who may trigger it with admin/migration permissions;
never treat the site token as evidence that a user holds a seat.

The review found opt-in creates a site option and postmeta UIDs, fixes duplicate/missing UIDs; the hook only assigns UIDs
to new posts. No migration version/completion marker, lock/transaction or checking of every
`wpdb`/`add_option` error was seen; tests are needed for mid-way failure, re-running, concurrent runs, a broken option,
copy/import/delete/recreate. GET does not repair missing/duplicate UIDs; it reports unresolved. WP native hooks
do not cover direct SQL inserts the way Joomla triggers do: this difference must be written into the guarantees.

A proposal to agree on before import: a site-instance seed stable across domain changes, forks with explicit rekey;
URL goes into the revision when needed, not into the ID. Never change already-released IDs in place; this adapter
is not released but still needs a clear migration fixture and lifecycle plan. Do not edit WP ourselves.

## Three WP spec proposals

1. **Body over 256KiB:** the spec already has `id&blockId`, `itemsCursor` and partial. A block request can
   output the block part in a partial envelope and drop the unloaded body; no schema loosening needed. However
   the coverage and the correct `links.next` path must be defined; never mark the whole page `complete` or
   return null in place of a known body. A body scalar that itself exceeds the budget still gives 413 per B02. The spec has no body
   chunk/byte-range yet; the block endpoint does not by itself solve reading that scalar in full. Reading
   the whole body needs a separate protocol proposal with a real response and continuation semantics, approved by the PO.
   Joomla measured body 180073B + field 180000B split into 2 segments: each scalar fits the budget, unlike the case of a single body
   over 256KiB. The WP block request is still waiting for code/SHA and runtime; not accepted from the proposal.
2. **Unresolved per request:** fits the existing completeness if the query/projection scope is stated clearly;
   never use detail numbers as a site total, never count sources hidden by ACL. This clarification does not
   permit dropping the adapter's stable unresolved or editing the validator.
3. **`<name>:url`, `lang::slot`:** these are WP's physical key conventions and need an adapter appendix. Shared keys are
   opaque; never infer semanticKey, write-target binding or edit permission from a similar-looking name. Native
   writes only use bindings confirmed by inspect.

## EmDash: preparing integration with limited capability

| Item | Handed-over evidence | Limits to keep |
|---|---|---|
| Reader | Scalar text/number/boolean/url, shared/translation; 80 details through the validator on SSR; since 27/09 adds long text (`prose`): a string = one `text` field, Portable Text = one `text` field per block, key `<field>.<_key>` | Business opt-in `TRACY_CONTENT_API_SCALARS=1`, off by default; Base has no runtime reader yet |
| Native auth | Alias rewrite through native middleware; PAT content:read 200, media:read 403, revoke 401 | A service PAT does not replace a Tracy seat; no relay principal/scope mapping yet |
| Snapshot | SQLite transaction + reauth; race 3 asserts; expiry wait 300.5s on the candidate before the final chrome binding | Postgres/D1 501; no claim for every backend/media/menu snapshot |
| Native write | Read → PUT `_rev` → read draft → publish → read; stale 409/read-only 403 | Only fixture scalars, not every role/ownership/host tool |
| Entry ID | Native ID+createdAt/site key; slug/publish keep the ID, recreate gives a new one | The site key must be stable; explicit fork semantics needed before rollout |
| Repeater | Admin autosave gives new rows a new UUID; duplicate copies the UUID, beforeSave dropped | identity FAIL; no temporary item IDs output, full capability not turned on |
| Payload/transport | Scalar over budget 413, aggregate detail 501; alias has collision handling | No detail continuation, subpath/proxy/fleet yet; never treat 501 as a full read |
| Cost | 2,027 native handler calls/scan + 40 alias collision lookups | Narrow source I/O not met; never use a small payload to claim the source reads little |

Proposed priority: a native widget assigning a UUID before submit + server validation, an explicit draft/live migration
with revision; parent-qualified ID/copy/restore/import need a decision and tests. This is a proposal
of the EmDash session, not implemented/accepted by the PO. Forking core is not required and the experimental
plugin is not imported. The scalar scope can be integrated separately once transport/authority have been
checked; never advertise repeater/media/rich text/menu or that all three CMSs are fully supported.

## Shared files Joomla keeps the right to edit

TCH: `apps/tracy-web/src/sites/route.js`, `apps/tracy-web/test/component.test.mjs`,
`packages/tools/tracy-site-tools/src/host/{index.ts,site.mjs,site-context.mjs}` and related tests;
generated `site-tools/lib/index.js`, `site-tabs/lib/index.js`; Joomla runtime runner and helpers;
ADR 0021, spec/P0/runtime-cases/integration, docs index, the Content API task and the journal.
The shared schema/validator are read-only, not edited for Joomla. Do not edit `host/wordpress.mjs` or
`host/emdash.mjs`, the other sessions' transport bundles.

Cowork: only `joomla/cowork/` (EngineFactory, JoomlaContentReader, QuickstartContract, ContentReader,
ContentIdentity, plugin route, CLI, README and the PHP test runner). Do not edit `wordpress/cowork/`.
Protocol owner: `systems/content-api-v1.md` in the docs repo (a scratch checkout at the time) and that repo's index.
Every adapter integration must wait for a new handoff SHA, never taking another session's in-progress changes.

## WP handoff run 2 — supersedes the WP status in the earlier review table

Verified the chain `aa5f352` → `28ab883` → `7df1efe` →
`674c8862c2f5880fa34518692a402c167035f3a0`; the diff across the whole range touches only 11 files in wordpress/cowork,
2563 lines added/1 removed. TCH evidence `3058f95f97d8237115684177768ae63f4bec06e1` on foundation,
25 task/evidence files; not just cherry-picking the last README commit, not importing the release baseline
into the Joomla worktree. The Claude Cowork plugin mounts exactly the handed-over WP worktree to measure integration.

The WP principal has been fixed to a relay-provided `seat:*`; S04 has 5 controlled interleaving cases, real expiry 290/
305 seconds and subdirectory have PASSED per the new REPORT. Cache is still NOT RUN, persistent object cache
gives 501 per the source; page-cache running before WP has not been accepted. Profile 1.2.0 is still not measured.

The relay now has a native codec **by the platform in the server DB**, not by agent: WP uses
`params:{query,scope,principal}` and unwraps the known envelope/error; Joomla keeps the old protocol.
The consumer still only sends a flat query and accepts no authority. The wrapper difference no longer requires WP to change its
native API; every consumer still receives the same v1 envelope. Old/unknown native responses still give 501.

### Current permissions and the decision not to widen them

Source: `apps/tracy-web/src/seats/roles.js`, `effectiveRolePolicy`, APPLY_RULES in route.js.

| Default seat | content | code | site | lifecycle | Existing read doors | Content API relay |
|---|---|---|---|---|---|---|
| owner | yes | yes | yes | yes | contract inspect/code, db.dump/site | published |
| admin | yes | yes | yes | no | contract inspect/code, db.dump/site | published |
| developer | yes | yes | no | no | contract inspect/code; no db.dump | published |
| editor | yes | no | no | no | no contract inspect/db.dump | 403 |
| not accepted/revoked/other site | — | — | — | — | no grant | 403 |

The current site/workspace policy may narrow the roles; a role missing from an existing policy has no
permissions, and owner keeps all per the existing rule. Technical DB read/inspect permissions do not by themselves turn into
editorial Content API. The WP proposal content⇒editorial is not applied; published is not opened to editor
to make the API uniform. There is no path for the agent to choose the scope. Reading through the native service token is still
the server's permission, never used to prove every seat may see draft/private/password-protected.

### Shared site identity per Lee's decision

Same site changing domain: **the site/content ID must be kept**. Fork/new site: assign a new site-instance seed.
Hostname is only URL/location, not identity. Joomla's registry/site seed currently fits, with explicit
`--new-site` for forks. WP needs to remove home from the HMAC, explicitly rekey the seed on fork/provision; keep the entity uid
on a domain move, and the version migration must state clearly that it does not run on GET. WP 674c886 still **FAILS**
the domain move requirement; a test where the ID changes when home changes must not be called PASS under the new common semantics.
EmDash native ID+createdAt/site key does not depend on hostname, but the fork/migration key lifecycle is not yet
measured: requires an explicit site seed stable across domains, rekeyed on fork; the experimental repeater patch is not imported.

### Large pages and snapshot

Chose error.links.firstBlock per the [spec addendum](content-api-v1.md); schema/tests updated before the
adapters. WP's independent blockId has been measured, but the current blockId chain does not sign the snapshot and does not discover the
first block from 413. WP needs to add a signed blocksCursor and termination metadata before advertising
block discovery. Reading a block with 200 is not enough to prove a multi-request scan under the same snapshot.

## Next implementation decision — update for WP 308f9c7ce and EmDash native identity

The [decision note](content-api-integration-decision.md) is the official answer to the four WP questions,
superseding the earlier common-codec proposal: canonical top-level contentPrincipal/contentScope, flat params,
direct envelope. The WP 674c886 codec in TCH is currently only a measured fixture bridge; wait for the new SHA and then
switch by confirmed capability, with no fallback trying other permissions. Never use host/path traces to
tell clone/restore apart or to return 501. A domain move keeps the ID; newSite assigns a new namespace with authority.

Read EmDash `native-identity/REPORT.md`: the core/editor 0.38 patch on 8975a850 keeps `_rowId` through
admin add/autosave/reorder/publish; a duplicate entry gets a new UUID in a native transaction; REST
missing/duplicate ID gives 400, stale_rev 409. Native 59/browser 1/Tracy 95/reader 16 and scalar 24 are EmDash session
evidence, not Joomla re-running them. The FAIL conclusion of the old beforeSave experiment does not represent
the new patch. However the reader is still REPEATER_IDENTITY_UNSUPPORTED: repeater v1 not captured yet,
packaging/dependency not settled; capability is not turned on from native tests. Restore/import/bulk/nested,
reuse of deleted UUIDs, uniqueness across fields/entries and draft/live migration still need settling/measuring.


Joomla P2 b0a40e0, revision/discovery run: the relay principal is bound to site, account, role,
**the seat's own effective permissions** and scope, without hashing the whole policy table of other roles.
Changing another role's permissions must not invalidate the current seat's cursor. Every request still checks
permissions from the server. This internal change does not change the canonical envelope; a cursor held from before
the principal computation changed may be refused and must start over. WP/EmDash need not change their
adapters for the internal hash; the other sessions' fixtures were not re-run in this Joomla run.
