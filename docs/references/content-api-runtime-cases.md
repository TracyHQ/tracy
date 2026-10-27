---
description: The Content API runtime acceptance cases for P2–P4; the Joomla status is in the P2 REPORT, not replaced by schema mocks.
sources:
  - packages/cms/tracy-content-api/validate.mjs
  - apps/tracy-web/src/sites/route.js
  - packages/cms/tracy-emdash-theme-business/src/middleware.ts
---

# Content API — runtime acceptance cases

The catalogue below applies per CMS; the Joomla status and evidence are in
[REPORT P2](../../tasks/evidence/content-api-p2/REPORT.md). WordPress/EmDash results are recorded by a separate session. The P1 test suite only accepts structure and
data invariants; no auth/cursor mock test may report a runtime pass. The acceptance tester records the
CMS/Claude Cowork plugin/template versions, the test site, requests/responses with credentials masked, the time and the measurements.
Never run on a customer site. This is mandatory before turning a capability on.

| ID | Real setup / action | Result that must be observed |
|---|---|---|
| A01 | No credential; a wrong/empty/revoked token; a token in the query | 401, with no distinguishable content/count/ETag; a query token is neither accepted nor reflected. |
| A02 | A seat on the wrong site, pending, revoked after page 1 | The relay returns 403 or 401 per the seat door; an old cursor does not reach data; no token in logs/tool output. |
| A03 | A principal with read only; a token missing a scope | Reads within the right scope; a missing scope gives 403; read opens no mutation right. |
| A04 | Draft/private/password-protected/scheduled/shared/media in a forbidden scope | Does not appear in summary/detail/relations/usages/total/unresolved; a hidden ID and a missing ID give the same 404/body. |
| A05 | Conditional request/ETag/cursor after revoke | Auth runs before any 304/cache lookup; `Cache-Control: private, no-store`; no shared cache. |
| A06 | Calling the GET alias directly and the read relay with a service principal/a user | Scope and principal are recorded correctly; a site token does not carry each person's rights by itself. EmDash 0.38's alias really goes through native auth. |
| Q01 | An unknown query, duplicate/array values, limit 0/101/NaN, id + list cursor, a changed filter | 400 CONTENT_BAD_QUERY; a wrong query is not ignored. |
| Q02 | A cursor with one byte changed, from another site/principal/filter/block or item owner | Refused; never decoded into a different request; the response does not reflect the token/cursor secret. |
| Q03 | A cursor expired after 5 minutes (candidate value), a snapshot cleaned up | 409 CONTENT_SNAPSHOT_EXPIRED, not silently moving to a new snapshot. |
| S01 | Scanning several pages; editing content through admin/API between page 1 and 2 | 409 before the next page; reading again from the start gets the new values/revision, nothing repeated/lost. |
| S02 | Changing ACLs, user groups, roles, token rights; reaching a publish/unpublish moment between two pages | The cursor is invalidated even though the content's updated_at did not change; no content leaks. |
| S03 | Editing a shared source/media/alt/assignment/translation | The revision/snapshot of every affected projection changes; the footer is still one source. |
| S04 | A concurrent update while a snapshot is created, and right between recheck and serialize | A consistent view inside a read transaction, or evidence of retry/conflict; never stitching two generations of data together. |
| S05 | CMS/DB timeout, unsupported reader, unsupported mapping | 503 for source errors, 501 for an adapter not supporting it yet; never a 200 with empty contents. A missing mapping uses permission-filtered unresolved. |
| I01 | Changing a title/slug/menu route, reordering blocks/items | The ID stays the same, URL/order current; IDs are never inferred from an index/slug. |
| I02 | Deleting then recreating the same slug/native ID; importing to another site | A new identity incarnation; never reusing the old ID or joining across sites. |
| I03 | A WP ordinary pattern vs a synced block; a Joomla assignment that does not render; EmDash chrome | Shared points to the right source; visibility is unknown without evidence; an assignment is never called rendered. |
| L01 | A translation with a draft; a shared locale; the same slug in two locales | Separate IDs, a group with evidence, values/locales not mixed; valueSource names published/draft/current from the right source. |
| B01 | Detail >256 KiB, a large block, a repeater over many pages | Partial + a next link/cursor; no body dump beyond permissions; reassembled in the right order, with complete data. |
| B02 | A single scalar exceeding the budget by itself | 413 CONTENT_FIELD_TOO_LARGE with the field key + opaque owner IDs; strings are not truncated, no XPath/DB path exposed. |
| R01 | A file/menu/page slug content.json already exists; a CMS installed in a subdirectory; an offline/cache plugin | Old resources are not taken over; the capability reports incompatibility, the alias is not public/cached HTML. |
| W01 | Snapshots before/after a read; read → inspect/native write → read again | A read does not adopt orphans or edit bindings/content. A write checks permissions and the new native revision; reading again confirms the right content, and the quickstart's design advice (ADR 0022) does not degrade. PO decided 25/09: no new undo is built; only regression-check the existing undo when code touches the related path, never dropping old tests/gates. |
| P01 | Small/large fixtures, list/detail/block/item | Record UTF-8 bytes, I/O time, source requests, model context, p50/p95. Compare with narrowInspect; settle the budget/expiry by measurement. |

Schema fixtures with synthetic draft/private/scheduled states only prove the **shape**.
Who may see which state belongs to cases A03–A06 and cannot be accepted from JSON.
