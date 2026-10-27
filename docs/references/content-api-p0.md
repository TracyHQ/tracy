---
description: Content API P0 evidence at develop b2a0990fe, the transport and snapshot limits, and the file-level plan for the Joomla pilot.
sources:
  - apps/tracy-web/src/lib/quickstart-capabilities.js
  - apps/tracy-web/src/lib/contracts.js
  - apps/tracy-web/src/brief/bindings.js
  - apps/tracy-web/src/sites/route.js
  - packages/tools/tracy-site-tools/src/host/site.mjs
  - packages/tools/tracy-site-tools/src/host/emdash.mjs
  - packages/cms/tracy-content-api/schema.json
  - packages/cms/tracy-emdash-theme-business/src/middleware.ts
---

# Content API — the P0 survey of 25/09/2026

Per [ADR 0021](../adr/0021-one-content-api-for-three-cms.md),
[spec v1](content-api-v1.md) and the [plan](../../tasks/todo-content-api-chung.md).
This is a code survey, not a measurement of a running `/content.json` endpoint.

## Baseline and cross-check

Checked three uncommitted documents still present in a scratch worktree, read
and copied them into a separate worktree, branch `codex/content-api-p0-p1`.
Nothing was written into the main checkout or the source documents' worktree. `git fetch origin develop` moved the
baseline from `c7f455c16` to `b2a0990fe`. The three added commits are `7aa838bc4`, `1424a9f3f`,
`b2a0990fe`: pinning the WordPress Claude Cowork plugin 0.13.3 then 0.13.4, and a test that translated menu URLs are not empty.
They do not change reader capabilities/bindings/narrowInspect, but they affect reading current URLs:
never use the anchor URLs in samples as the live permalinks of translations.

A note on the actual structure at baseline: `apps/tracy-web/src/quickstarts.json` still exists as a
fallback pin/provision copy; the catalogue customers choose from is owned by the release reader/DB. No catalogue
was added or edited in this round. Likewise, Business EmDash declares **0.38.0**, while the vendored core is still
**0.37.0**. Do not use the vendored 0.37 code to claim the 0.38 package's auth has been verified.

## The code matrix, owners and what is reused

| Area | Evidence read | Conclusion |
|---|---|---|
| Catalogue | `apps/tracy-web/src/ops/quickstarts.js`, `lib/contracts.js` (`readContracts`, `contractFor`) | Looks up release + version in the manifest; Joomla's `coworkContractVersion` and WP's `coworkMinVersion` are both read. A profile existing does not prove a site has bound it. |
| Capabilities | `lib/quickstart-capabilities.js` (`readJoomla`, `readWordPress`, `readEmDash`) | Values describing a release, with sources/hashes; `roleOf` infers roles for suggestions, not used as semantic binding or content type. The WP reader has no page–block relation yet. |
| Write mapping | `brief/bindings.js` (`declaredFor`, `resolveBindings`) | Only explicitly declared semantic slots or release-confirmed block–slot pairs; no fuzzy matching. Samples are not current values. |
| Inspect | `tracy-site-tools/src/host/site.mjs:1180` (`narrowInspect`) and the host `index.ts` after the relay | Filters after receiving the response; reduces context but not CMS I/O. It excludes translation slots so writes go to the source; a new reader must not use that exclusion to drop translations from read content. |
| Joomla Business | `tracy-joomla-quickstart/contracts/tracy-business/j6/1.2.0/content-map.json` | Recounted: 368 entities, 1,797 slots, 78 pages; `assignedModules` are candidates by assignment, ACL/schedule/layout still apply. There are shared modules and locale `*`. |
| WP Business | `tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/content-map.json` | 11 entities, 292 slots, no pages; combines the inventory with real bindings. `metadata.name` locates contract blocks, it does not prove every admin block has a durable ID. |
| EmDash Business | `seed/site-model.json`, `seed/personalize.json`, `src/lib/chrome.ts`, `src/live.config.ts` | Routes/types/records are input mapping; the chrome record is shared. Template 1.4.3, EmDash dependency 0.38.0 at baseline. The seed is not a live API. |

The Claude Cowork plugin was read **read-only** at the checkout `TracyHQ/claude-cowork`, HEAD
`963ad2f4e271fa6475136c5fa5501a3e68e9004e`, a clean checkout at survey time:

- Joomla `joomla/cowork/pkg_claudecowork.xml`: 0.17.4; the Business pin in TCH: 0.17.2
  (do not take Apple's newest version in place of Business's). `lib/QuickstartContract.php`
  `inspect()` resolves bindings, reads `currentValue`, returns a revision from the rows under the lock.
  `inspect()` also calls `adoptOrphans()` when a language job exists: **never call that function as is from a
  pure-GET reader**. Split out a non-writing resolver, reporting unresolved when bindings need recovery.
- WordPress `wordpress/cowork/claude-cowork/claude-cowork.php`: 0.13.4, matching the new TCH pin.
  `lib/QuickstartContract.php` `inspect()`/`inspectClean()`/`revision()` read rows and hash the content
  managed by the contract; not a whole-site revision. `lib/Engine.php` has content listing;
  `NavigationLinks.php`/`MultilingualHooks.php` serve the current language links.
- EmDash: the template part belongs to TCH; the kit/tools belong to
  `JoomlArt-Products/tracy-emdash-template`, pinned at `65d980e` in IMPORT-NOTE. Edit the kit upstream
  and pull; do not edit a private vendored copy in TCH. `tools/seed-apply.mjs` distinguishes `item.data`
  with a draft overlay from `liveData`, `_rev`; the agent uses `host/emdash.mjs` + a runner in the container.
  The template no longer has middleware blocking MCP (ADR 0022); undo is personalize's journal, not a general transaction rollback.

## The request path and authentication

**Existing:** Joomla POST `index.php?option=com_claudecowork&task=api.exec&format=json`
(with an administrator door); the system plugin `plg_system_claudecoworkapi` catches it before the router.
WordPress POST `wp-admin/admin-ajax.php?action=claude_cowork`, the hook including nopriv.
Both `Token::check` compare the site's configured token with `hash_equals`, disabled when unconfigured;
the credential is in the **body**, not an existing Bearer GET. This token carries no per-seat identity/permissions.

TCH `tracy_site` → `host/index.ts:relay` → `/api/sites/:key/apply` → `sites/route.js`
`conversationSite` + `requireGrant` + policy/toolset → the server-side component token → the Claude Cowork plugin.
This door has an action allowlist and no content-feed action; it is not just a matter of adding a URL to the consumer.
`content.contract` currently uses the `code` toolset, and does not switch to read for every seat by itself.

**The option chosen for the pilot (not implemented yet):** keep the existing credential and the existing seat path.
Add a read-only action `content.read` with an initial policy no broader than inspect; the relay calls the reader
on the site. `/content.json` is a GET alias of the same reader, not a separate dump endpoint. The header
`Authorization: Bearer <site cowork token>` uses the site token itself, minting no new kind of
credential; a native reader must support this header before the capability is advertised. The agent never receives the token;
the relay checks the current seat every time and uses no permission cache. A direct token is the site's service principal,
**never to be described as a user seat**; every cursor binds the real principal. If per-seat direct
GET is needed, it requires a bridge/assertion approved by the protocol owner before release;
never treat a header the caller sends itself as ACL evidence.

Joomla catches the **exact pathname** in the system plugin before menu routing, WordPress an exact-path hook
before the canonical redirect. Static files, menu aliases, page slugs/rewrites of `content.json` must be preflighted;
a collision → capability unsupported, reported plainly, never taking over an old URL. Subdirectory installs, query
arrays/duplicates and cache/offline plugins must have real tests. The PHP reader must never
execute arbitrary shortcode/plugin directives to obtain a body.

EmDash GET `/content.json` → an integration reader → the native content API authenticated with a PAT,
`content:read` and the current native permissions. The agent goes through the runner in the container, the PAT outside tool
output. Native REST `/_emdash/api/content/<collection>/<id>?locale=...`; MCP has `content_list`,
`content_get`, `content_translations`. **This alias does not exist yet, nor an auth bridge for it.**
The vendored 0.37 `astro/middleware/auth.ts` mainly guards `/_emdash/api`; routes outside the prefix do not automatically
get scope checks. So the initialization/auth middleware of **0.38** must be confirmed at P4,
registering a native API route with auth or calling the official auth itself in the integration, then aliasing to
the same reader; never trust an empty `locals.user` to mean public. No new REST write is opened.

## IDs and revisions: what can be proven, what is missing

| Case | Existing source | The pilot's approach and what may not be promised yet |
|---|---|---|
| Content ID | Joomla/WP bindings store native IDs; EmDash REST ULIDs (live collections use slugs instead) | An opaque UUID registry per site + source identity; raw DB IDs never exposed. A slug change keeps the registry. Delete/recreate needs a tombstone/new incarnation; a DB ID or slug hash is not enough. |
| Block/item ID | Joomla entities and selectors in the profile; WP metadata.name for sealed blocks; EmDash records/groups | An occurrence registry per page + binding key. Repeaters/ordinary WP blocks without durable keys need explicit mapping/registry; reordering must be tested; never use an index or title as an ID. No new registry persistence yet. |
| Admin edits | The Joomla/WP contract digest reads governed values; EmDash `_rev` | A per-content token hashing values + related metadata; an admin edit outside a slot must change it too. The contract hash does not cover the whole CMS. |
| Shared | Joomla module assignments, WP template parts/synced blocks, EmDash chrome records | One source and many occurrences; an ordinary copied pattern is not shared. Editing the source must change the snapshot of every occurrence, without duplicating fields. |
| Schedule/ACL | Joomla publish_up/down, viewlevels/assets; WP status/password/schedule/caps; EmDash status/revisions/locale/scopes | Reaching a publish time or revoking rights can change results without any content row changing. The revision includes the permission projection and schedule transition times; rechecked on every request. Not just `updated_at`. |
| Locale | Joomla bindings/multilingual-map and `*`; WP Polylang/editions; EmDash locale + translation mapping | Normalise tags with evidence; `*` becomes null only for language-neutral entities. Never merge en/en-GB arbitrarily; never infer a translation group from near-identical slugs. |

Joomla's `ChangeStamp.php` says plainly it only stamps through the Claude Cowork plugin, missing admin edits; WP stamps through many hooks
but coalesces per second and does not prove ACL/schedule coverage; EmDash's `_rev` is only per entry.
**No source has proven a whole-site snapshot for the Content API.**

P2 chose to try a **private materialized read snapshot**: take the readable set inside a read transaction
suited to the CMS, store the projection + revision; a signed cursor binds site/principal/filter/snapshot/expiry.
Before each page, re-read permissions and the fingerprint of related sources in a consistent view; changed data,
shared sources, ACL, media or crossing a schedule mark → 409. Merely keeping an old snapshot and continuing to serve it after
an admin edit does not meet the spec. I/O must be measured because a whole-scope fingerprint can be expensive; if
no-repeat/no-loss cannot be proven, the pagination capability is not released. Never hold a DB transaction across
requests, and never use this mechanism to promise identical write transactions/undo across the three CMSs.

## The contract's home

The ADR index keeps the decision authority over **the cross-repo protocol at `tracy-docs`**. P1 chose a home for
**the candidate executable schema**: `packages/cms/tracy-content-api` in TCH, without changing the ownership rule.
The JSON Schema is the source of the shape; a JS validator reads that same file and adds invariants. No extra
dependency is needed; it follows the plain-validator convention of `brief/schema.mjs` and `questions-schema.mjs`.

Before the P2 release: record the owner/protocol decision in tracy-docs; pin the commit + SHA-256 of the schema,
validator and fixtures into the Cowork/kit CI through a versioned release artifact (no live GitHub
dependency, no three hand-made copies). The PHP producer runs the Node corpus in CI; no Node is needed in
customer requests. If governance picks another home, **move** the source and keep one canonical source, no fork.
This round has not released an artifact, nor edited another repo or a released profile.

## The Joomla pilot: a file-level plan

| Repo / file | Next step |
|---|---|
| tracy-docs: a new protocol ADR (numbered by that repo's index) | Takes the candidate schema, the read/service-principal policy, version responsibility and the artifact pin; does not claim a TCH ADR number. |
| Cowork, new `joomla/cowork/lib/ContentReader.php` | A live projection, a side-effect-free resolver; ID registry, locale, shared, content state; uses the currentValue extractor once split out of the mutating inspect. |
| Cowork `lib/QuickstartContract.php`, `ContentSlots.php`, `ContractAccess.php` | Split out non-writing reads, keeping write guards intact; do not copy the whole inspect and filter afterwards. Never call adoptOrphans in a GET. |
| Cowork `com_claudecowork/administrator/src/Service/EngineFactory.php`, `lib/Engine.php` | Wire `content.read`, capability/version; the same reader as GET, a server-side token. Test method/auth/error/no-store before the body. |
| Cowork `plg_system_claudecoworkapi/src/Extension/ClaudeCoworkApi.php`, `lib/Door.php` | The exact alias `/content.json`, Bearer using the configured token; collision/subdirectory/offline, no query token. Never swallow exceptions into HTML or an empty 200. |
| Cowork, a new store/migration next to `JoomlaContractStore.php` | ID registry/tombstones and separate snapshots; nothing more written into released bindings/profile hashes. A versioned migration; reads never repair content data by themselves. |
| Cowork, new `tests/content-reader.php` + `tests/run.php` | Try a real CMS/DB: admin edits, ACL, schedules, shared, ID reorder/delete, cursor races; run the P1 corpus. |
| TCH `apps/tracy-web/src/sites/route.js`, `sites/pair-component.js` | The read relay, policy and version/capability probe; 501 for an old Claude Cowork plugin; re-check the seat on every page, never broader than inspect's rights. |
| TCH `packages/tools/tracy-site-tools/src/host/site.mjs`, `index.ts`, tests | Allowlist/transport reads with the right scope; the summary→detail consumer in P5, without changing narrowInspect/write doors now. |
| TCH, a new quickstart mapping extension | Quickstart mapping with a base hash or a new profile version; only after the Claude Cowork plugin supports it. Never edit 1.2.0 in place. |
| Cowork package manifests/build + TCH provision pins | Release the Claude Cowork plugin before the consumer; checksum pins, canary and rollout are a separate P6, not part of this round. |

New file paths are **file proposals**, not implying they already exist. P2 must re-run native apply/revert
and the old Claude Cowork plugin's structural refusals before accepting the Joomla adapter. WordPress joins inventory/editions and the block graph;
EmDash adds the integration in the template and the shared part in the upstream kit, against the same corpus.

## Measurements kept for the adapters

The [runtime acceptance](content-api-runtime-cases.md) list is pending, not mocked to go green.
P0 settled what is missing and how to test it; do not call this proof that snapshots/auth work.
The P1 fixtures extract existing profiles/seeds (hashes and JSON pointers in `test/fixtures/sources.json`),
the rest synthetic. There are no three new live captures yet; they are mandatory outputs of P2/P3/P4.

## Cross-check with the Joomla P2 implementation

The P2 candidate chose a pure-read `QuickstartContract::readMapping()`, a separately installed registry/trigger,
InnoDB repeatable-read and a broad per-request fingerprint. Native inspect is not used to read the feed,
and vendor code in TCH is not edited. Cowork owns the reader/alias/identity; Tracy keeps the relay/policy/tool.
The protocol owner tracy-docs receives the integration note; the P1 schema stays as is.

What lacks evidence must not be inferred from the P0 design: item identity, complete media scope,
third-party cache extensions, source cost in production. See [REPORT P2](../../tasks/evidence/content-api-p2/REPORT.md).
