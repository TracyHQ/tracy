---
description: The integration decision for WordPress and EmDash to implement identity, the permission envelope and block discovery; separating the settled protocol from the code being measured.
sources:
  - apps/tracy-web/src/sites/route.js
  - packages/cms/tracy-content-api/schema.json
  - packages/cms/tracy-content-api/validate.mjs
---

# Integration decision — 25/09/2026, within the scope set by Lee/PO

WP sources: TCH evidence `308f9c7ce`, IDENTITY-PROPOSAL/REGRESSION-profile-hash/REPORT;
the adapter is still `674c8862c2f5880fa34518692a402c167035f3a0`. Settled so the WP/EmDash sessions can keep coding,
not an acceptance or a dependency-release decision. This decision replaces the contradictory proposals
in the historical integration note. The [spec](content-api-v1.md) owns the detailed semantics.

## 1. Answers to the four WP questions

1. **Yes:** a domain-independent site seed; `content.identity` accepts `params:{newSite:true}` to fork.
   A domain/HTTPS/subdirectory/server move of the same site keeps the seed and every ID. A new provision from an
   archive, or a fork into another site, must issue a new seed before opening the reader. The caller is the provision/fork
   backend after checking the existing operation's permissions, or an operator with administrative authority;
   this action is not added to the agent's tool/relay allowlist. The service token authenticates the Claude Cowork plugin hop,
   it does not by itself prove the requester may provision/fork.
2. **Yes:** newSite rotates `site.id` and every ID depending on the site namespace; internal row UIDs are kept.
   It also rotates the cursor epoch/secret (or derives the secret from the new seed + the service credential with
   a separate purpose), invalidating pre-fork cursors. The site credential need not change to change content
   IDs. Ordinary opt-in/backfill does not rotate the seed. A fork needs a provisioning retry mechanism so that
   a retried operation does not issue a seed again; a MySQL lock and migration marker/error checks are
   a reasonable WP choice, needing fail/retry/concurrency tests before being advertised.
3. **No fail-closed installation marker in this round.** The Joomla seed lives in the reader DB table; WP's in the
   option `claude_cowork_content_site`; issued by the admin opt-in/provision operation, **both are cloned
   when the DB is copied**. In this protocol there is no trustworthy marker outside the DB issued by a control plane.
   DB host/DB name/prefix/ABSPATH can change on restore/move, and can also be cloned: a fork cannot be told
   apart from a restore. So no 501/auto-rekey is added from a location fingerprint or from that marker missing/
   differing. A manual DB copy carrying the same seed can create two sites with the same IDs: an accepted limit
   that must be written down; the operator must declare the fork and rekey. A truly missing seed/opt-in is still an
   uninitialised capability under the existing lifecycle, not evidence of a clone; a GET never mints/repairs by itself.
4. **Settled: a canonical top-level envelope + a flat query**, direct success/error, as in §2 below.
   WP changes upstream in the next identity round. The wrapper codec currently tried with 674c886 is only a
   fixture bridge for measuring permissions; it is not a new canonical form, nor a self-fallback that opens scope.

**Restore of the same site:** restore the seed + UIDs from the backup, keeping site/content IDs; do not call newSite.
Restoring a backup onto another hostname/server can still be the same site if the operation is confirmed
as a restore/move. **Restoring a backup to create an independent site:** that is a fork; call newSite before opening the reader.
Never classify the two from the hostname. Invalidate old cursors on restore with the adapter's existing credential/
cursor-epoch mechanism; do not change the seed just to expire cursors. Data/identity lost
from a backup is not promised to be recovered by guesswork. No new tombstone or undo system is needed or promised.

EmDash: requires a durable site seed with the same semantics; the native 0.38 patch on `_rowId` only proves the native
row lifecycle that was measured, not site fork/restore or reader item IDs. It needs an explicit parent namespace
(content/field/row UUID) and a v1 capture; repeaters are not on yet. Still missing: reuse of deleted UUIDs, changed UUIDs of
old rows, import/restore/bulk/nested and draft/live migration. Do not import the core patch or pin a dependency
before the packaging decision; the scalar reader does not depend on this experimental patch.

## 2. The permission envelope and editorial rights

Agent → Tracy (query only):

```json
{"action":"content.read","params":{"type":"page","limit":30}}
```

Tracy → the Claude Cowork plugin, after checking seat/site/policy on every request:

```json
{"token":"<service credential>","action":"content.read","params":{"type":"page","limit":30},"contentPrincipal":"seat:<64 lowercase hex HMAC>","contentScope":"published"}
```

Success: HTTP 200, **the tracy-content/v1 envelope directly**. Failure, for example:

```json
{"error":{"code":"CONTENT_ADAPTER_UNSUPPORTED","message":"Requested content capability is not supported"}}
```

HTTP statuses per the spec: 400/401/403/404/409/413/501/503. No ok/status/content/body wrapping.
The relay does not accept scope/principal in the query; top-level fields the agent sends itself are not forwarded but rebuilt
from the server's authority. The Claude Cowork plugin only trusts the authority after authenticating the service credential. A direct GET
does not accept authority from the URL; it uses a separate service principal + published. Unknown/old cowork → 501;
no fallback to GET/public/sample or retrying with broader rights.

Today content.read keeps the code policy: owner/admin/developer default to published, editor 403; narrowing
site/workspace policies are still re-checked. **No role gets editorial by itself from the content toolset**.
There is no editorial-read policy chosen/checked by the PO yet, so the relay issues no editorial. Once a separate grant
exists, it must be checked server-side per request and bind scope/policy into the cursor; the native editorial service
is only a technical control, never to be taken as a seat's right.

TCH's running codec for 674c886 converts flat → the native WP wrapper by the DB platform. When WP delivers the canonical
SHA, Joomla updates the codec/tests per the confirmed capability; never trying two request styles
or raising scope on error. Earlier runtime data still records the exact SHA/codec that ran.

## 3. Block discovery from 413

**Chosen: error.links.firstBlock**, no new index/sentinel. The error carries the snapshot of the same
consistent read; the URL only has a signed id/blockId/blocksCursor, no bodyHtml or credential:

```json
{"error":{"code":"CONTENT_FIELD_TOO_LARGE","message":"Body exceeds response budget","field":{"contentId":"c1","blockId":null,"itemId":null,"key":"bodyHtml"},"snapshot":{"revision":"r1","readAt":"2026-09-25T00:00:00Z"},"links":{"firstBlock":"https://site.example/content.json?id=c1&blockId=b1&blocksCursor=<opaque>"}}}
```

Each step keeps the same auth, site/principal/scope/owner/snapshot/expiry; a changed source/expiry → 409,
a different principal → 400, lost permission → 403 at the relay. The consumer checks the link belongs to the site's endpoint/custody,
passing the query through the existing relay; it never forwards a secret by itself to a URL a response suggests. The next block
also carries a cursor. The last block declares blocksPagination.nextCursor=null to end the block scan;
a partial links.next back to the content reads the missing part, never looping forever or calling the page complete.
A body too large by itself is still 413. With no blocks, firstBlock is not advertised.

The shared spec/schema/validator/tests were extended on purpose: 68 tests PASS; an old 413 without a link stays
valid. An adapter only advertises after runtime 400 section → 413 → firstBlock → all blocks, tamper/ACL/revoke/
expiry/source-change and a terminal scan. WP 674c886 currently lacks the discovery link and refuses blockId +
blocksCursor; it needs an upstream fix. Joomla/EmDash do not gain support from the schema tests alone.

## 4. The Claude Cowork plugin baseline and release regression — separate work

New WP evidence reproduced on fixture upgrades 0.13.5→0.13.6/0.13.7 and 0.13.6→0.13.7:
the profile hash changed at 44ae4d7 and then 9024a9f, inspect/apply got locked while the reader still ran. Baseline aa5f352
is enough to reproduce the adapter on the correspondingly bound fixture, **not enough to prove upgrading the Claude Cowork plugin is safe**.
Keep the release blocker for the Claude Cowork plugin owner; do not rebind customer sites, change the feed or fix the regression
in the Content API branch. Dev/prod/customer impact is not measured, so do not claim it happened.
