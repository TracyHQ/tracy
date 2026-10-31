# Agent tool reader optimization and authenticated acceptance

Date: 2026-10-31. Branch: `perf/agent-tool-calling`. TCH base: `76e7f114f` plus the existing local optimization work. This implements the four follow-ups in [the preceding usage report](2026-10-31-agent-tool-usage.md). All execution is local; no production deployment or upstream release is claimed.

## Delivered scope

1. **Indexed address discovery on WordPress, Joomla and EmDash.** The authenticated relay retains a bounded complete page inventory and normalized address index. Repeated URL lookup reuses that projection after a fresh CMS snapshot check. A cold lookup still walks the inventory; this is not a new CMS-side indexed query endpoint.
2. **Fewer pagination and source reads.** Validated reuse removes repeated WordPress/Joomla tail-page requests. EmDash skips redundant native hydration only for collections whose current schema has no reference fields, after per-collection native byte-parity calibration.
3. **Broader agent acceptance.** Nine scenario families run through real streaming inference, shipped site-tools, vendored AgentLoop, real authenticated product middleware and actual CMS HTTP. Local tool guidance explains pagination, locale and ID usage. A targeted invalid-type recovery response helps the model discover pages across content types.
4. **Real edits and Undo on three CMSs.** Each owned fixture receives an actual write, a verification read and a restore through the product harness. Before/after content hashes establish that content changed and was restored.

## Why the changes improve the measured path

The earlier host executor already shared overlapping reads. Sequential searches still repeated full CMS inventory walks. `page-inventory.js` now keeps at most 64 authority/query scopes and 16 MiB of serialized rows plus index, with a 60-second TTL. It always authenticates and reads the current first CMS page before reusing a completed walk. Its key separates endpoint/token authority, principal, content scope and canonical query scope. Snapshot stamps include the inventory/content revision, site, provenance, completeness, first-page contents and pagination metadata.

Only complete, consistent walks enter the cache. Refusals, null replies, caps, mixed revisions and oversized inventories do not. Returned rows and indexes are independently cloned. Dynamic `changedSince` reads stay fresh. The address index narrows candidate positions; the final existing URL/query predicate still decides matches, preserving Joomla query semantics and ambiguity. A null backend reply now produces `CONTENT_SOURCE_UNAVAILABLE` rather than a false success.

Joomla routing can change outside the first page without changing the content-only revision. Owning component commit `02ef3cf5` therefore exposes `inventoryRevision`, hashing the complete listing before pagination, including routed URLs and lock metadata. Joomla reuse requires that capability. Older components continue ordinary full walks. The local Joomla fixture has this reader patch; the customer component has not been released.

EmDash's native GET appends `references` absent from list results. That made the earlier global list/GET equality test reject the fast path and hydrate almost every entry individually. The reader now examines current collection/reference metadata in the same transaction, calibrates per collection, and appends the exact empty-reference projection where valid. Collections with reference fields retain individual GETs. Draft hydration remains mandatory and fails closed when unavailable. A mismatch falls back only for the affected collection.

The EmDash semantic change originates at owning kit commit `0a06abf`; formatting and the final imported pin are `dbc142233ecff0fda0586e22e06b4b38e5d2d69e`. Identical reader/route files ship in the base, business and SaaS templates. No shared AgentLoop or global prompt policy changed.

## Before/after measurements

Each cell is a median of five warm sequential repetitions through the authenticated relay and real CMS. Both arms retain existing in-flight sharing. The WordPress/Joomla baseline disables only completed-inventory retention; both Joomla arms use the new fingerprint-capable component. EmDash before/after also brackets the owned runtime reader rebuild. These are small local samples collected sequentially, not interleaved production latency or p95 estimates.

| CMS | Task | Before ms | After ms | CMS HTTP reads before → after |
| --- | --- | ---: | ---: | ---: |
| WordPress | Independent titles | 213.6 | 136.6 | 5 → 1 |
| WordPress | Batch titles | 185.1 | 94.4 | 5 → 1 |
| WordPress | Known URL | 233.0 | 134.3 | 7 → 3 |
| WordPress | Detail | 95.9 | 91.5 | 1 → 1 |
| Joomla | Independent titles | 732.4 | 255.0 | 5 → 1 |
| Joomla | Batch titles | 699.4 | 217.0 | 5 → 1 |
| Joomla | Known URL | 828.5 | 329.4 | 6 → 2 |
| Joomla | Detail | 216.6 | 215.1 | 1 → 1 |
| EmDash | Independent titles | 799.3 | 489.8 | 1 → 1 |
| EmDash | Batch titles | 760.6 | 566.1 | 1 → 1 |
| EmDash | Known URL | 782.5 | 497.1 | 1 → 1 |
| EmDash | Detail | 760.0 | 418.3 | 1 → 1 |

WordPress/Joomla URL tasks include locale probing; WordPress also includes page classification reads. A universal one-read URL claim would be incorrect. EmDash uses explicit English scope; its large gain is behind the single relay HTTP request.

The reader experiment verifies **150/150 task runs** across five tasks, five repetitions, two arms and three CMSs. Raw records retain the bundle hashes actually measured; later recovery and pagination-description changes belong to the separate streaming acceptance pass.

The stronger EmDash work-reduction evidence is [native parity](2026-10-31-agent-tool-reader-acceptance/emdash-native-parity.json): all 2,000 native entries require **2,027 → 119 source calls**, a 94.1% reduction. Before and after produce the identical serialized SHA256 `29f5b07788fff4c70367555c0565055b663fd7511fd4fc6a0c6716133c08926d`. HTTP-read counts alone would hide this bottleneck.

Raw reader records: [WordPress before](2026-10-31-agent-tool-reader-acceptance/wordpress-before.json), [after](2026-10-31-agent-tool-reader-acceptance/wordpress-after.json); [Joomla before](2026-10-31-agent-tool-reader-acceptance/joomla-before.json), [after](2026-10-31-agent-tool-reader-acceptance/joomla-after.json); [EmDash before](2026-10-31-agent-tool-reader-acceptance/emdash-before.json), [after](2026-10-31-agent-tool-reader-acceptance/emdash-after.json).

## Natural agent behavior and limits

Nine scenarios cover exact title, URL, missing page, ambiguity, continuation, details after discovery, native-ID correction, invalid-type recovery and another language. Each runs twice per CMS. Recovery scenarios deliberately seed the initial bad call, after which the real model chooses the repair; these are not spontaneous-error rates. The provider adapter consumes real DeepSeek SSE tool/text deltas and records request hashes, usage and chunk timings without storing credentials.

| CMS | Verified attempts | Exceptions |
| --- | ---: | --- |
| WordPress | 17/18 | One continuation planning miss |
| Joomla | 17/18 | One incomplete provider attempt |
| EmDash | 18/18 | None in the final pass |
| Total | 52/54 | Both exceptions retained |

The WordPress miss returned four valid IDs but ignored the requested inventory pagination and made seven calls, reading details instead. It remains a failed continuation acceptance. The Joomla exception has no provider status, completed timing, tool call or final response. It is an incomplete provider attempt, not evidence of a successful task or a diagnosed CMS error. The driver now records streaming exceptions and incomplete provider attempts explicitly; the original observation remains unchanged.

An earlier EmDash run exposed a genuine planning problem: after an invalid type, the model assumed `type:page`, missing a service titled General contracting. The new targeted `CONTENT_BAD_QUERY` hint recommends a page-map lookup across content types. It applies only when the error identifies a supplied type and there is no ID/cursor. Locale refusals and `full:true` retain their existing behavior. Final EmDash recovery attempts pass. Description budgets remain unchanged, with explicit `offset/limit` guidance for all three CMSs.

No natural-agent speed improvement is claimed from these acceptance passes: provider variation and concurrent verification affect timing. The earlier misses and adapter-development attempts are retained in their own directories. Final results are never replaced by a successful retry. See [summary](2026-10-31-agent-tool-reader-acceptance/streaming-summary.json), [WordPress runs](2026-10-31-agent-tool-reader-acceptance/wordpress-streaming/index.json), [Joomla runs](2026-10-31-agent-tool-reader-acceptance/joomla-streaming/index.json), and [EmDash runs](2026-10-31-agent-tool-reader-acceptance/emdash-streaming/index.json). Each index references one JSON file per attempt, including transcripts and provider observations.

## Actual writes and Undo

WordPress and Joomla perform the actual product edit, read the changed page, use the returned apply receipt with `apply.revert`, and read the original content again. EmDash uses the actual product `content.replace` and its returned native restore receipt, rather than inventing a component `apply.revert` operation. Its acceptance performs 11 real execs against only the owned container.

All three fixtures show an intermediate logical content hash change and an identical restored hash. EmDash hashes all content-row values while excluding expected revision/timestamp bookkeeping. These checks establish content restoration, not bit-identical database files. Evidence: [WordPress](2026-10-31-agent-tool-reader-acceptance/wordpress-edit-undo.json), [Joomla](2026-10-31-agent-tool-reader-acceptance/joomla-edit-undo.json), [EmDash](2026-10-31-agent-tool-reader-acceptance/emdash-edit-undo.json). Outsider access is refused with 403 before backend reads in authenticated acceptance.

## Validation and runtime provenance

- Current focused cache, content-version, shipped-harness, site-call, grammar and surface tests: **420/420**.
- Real PostgreSQL authenticated relay suite: **110/110**.
- Complete site-tools suite before the final narrow recovery/description additions: **4,322/4,322**; current focused tests cover those additions, including 12 harness cases.
- EmDash source projection tests: **7/7**. Content API kit: **48 pass, 3 skip, 0 fail** with `KIT_TEST_TEMPLATE=1`. Template reader synchronization: **all three pass**.
- Regression `REG-PR-926-compact-site-reads`: **PASS**, recorded against this branch's `76e7f114f` base.
- Broad selected gates: **63 pass**, including lint, 14 workspace TypeScript projects, bundle checks and real boot graphs (web 58/native 75). Command excludes repository-wide `tests` and `turbo-config`; this is not a full `build:check` pass. Standalone site-tools diagnostics remain the previously established 59 baseline diagnostics.

Final documentation links (525 files), formatting, syntax, lint and whitespace checks pass. Biome reports existing class-order warnings outside this change. The artifact secret scan flags 20 generic-key matches in model prose containing Content API IDs; each value is also present in its tool evidence. These are reviewed false positives, recorded in [artifact scan review](2026-10-31-agent-tool-reader-acceptance/artifact-scan-review.json), without changing scanner rules.

Logs are stored beside this report as `focused-tests.txt`, `authenticated-relay-tests.txt`, `site-tools-tests.txt`, `emdash-kit-tests.txt`, `template-kit-sync.txt`, `regression.txt` and `selected-gates.txt`.

The owning Joomla reader protocol tests pass. A broader upstream PHP-suite attempt ran out of its 512 MiB allowance; no full upstream-suite pass is claimed. The kit template tests require `KIT_TEST_TEMPLATE=1`; the unconfigured kit itself is not a bootstrapped site. Invalid adapter probes and the earlier overly narrow read/write assertion are retained as diagnostic attempts, excluded from accepted counts. No publication-readiness claim is made: the earlier baseline publication scan had 49 existing findings.

The final built bundle SHA256 is `34fe0a9d32f2e5eb79c5c369ee574c2da17c5e6f1db225876b83a939876a9614`. It is loaded in owned container `tracy-agent-tools-local`, password gate **http://127.0.0.1:61588**, direct dsh 61587, Docker VM PID 27783. Gateway login returns 302, the gated page 200, graph has 74 entries and all three script batches load. The first refresh probe ran before a launch token was available; after startup completed, access was refreshed from the actual dynamic port bindings and the gate check passed. See [local deployment](2026-10-31-agent-tool-reader-acceptance/local-deployment.json). A fresh [browser smoke](2026-10-31-agent-tool-reader-acceptance/local-browser.json) observes the same 74-entry graph, an editable chat input and no page errors.

Only the owned candidate was restarted. Its base image is unchanged; the bundle is copied into its writable layer. CMS fixtures and scratch PostgreSQL are isolated owned containers. Borrowed services are not restarted or modified. Relay measurements instantiate the real `buildApp` and middleware in-process with a real migrated scratch database and actual CMS HTTP; they do not exercise an externally listening tracy-web socket or UI-driven edit/Undo. The local dsh gate smoke is a separate runtime check.

## Reproduction

Private fixture configs and database URLs remain outside the repository. Each driver validates loopback origins and owned fixture naming. Set `TEST_DATABASE_URL` to the owned test PostgreSQL; the relay helper creates and drops a random scratch database. Prepare each CMS through normal bootstrap/identity setup. Joomla needs the fingerprint-capable reader for cache reuse. EmDash must run the rebuilt source reader; native MCP acceptance also needs its existing root-owned `/run/tracy-agent.token`.

```sh
node scripts/measure/agent-tool-reader-acceptance.mjs --platform wordpress --config <private-config> --phase before --repeats 5 --out <directory>
node scripts/measure/agent-tool-reader-acceptance.mjs --platform wordpress --config <private-config> --phase after --repeats 5 --out <directory>
node scripts/measure/agent-tool-streaming-acceptance.mjs --platform wordpress --config <private-config> --repeats 2 --out <directory>
node scripts/measure/agent-tool-edit-undo-acceptance.mjs --platform wordpress --config <private-config> --out <directory>
node scripts/measure/agent-tool-emdash-undo-acceptance.mjs --config <private-config> --out <directory>
node tests/regression/run.mjs --no-codex --id REG-PR-926-compact-site-reads
KIT_TEST_TEMPLATE=1 node --test vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tests/content-api*.test.mjs
```

Repeat reader/streaming commands for Joomla and EmDash. Use the component edit/Undo driver for Joomla and the dedicated native restore driver for EmDash. For source before/after, freeze the old source reader before rebuilding the owned runtime; merely toggling relay retention does not reconstruct the old EmDash implementation. The streaming driver currently reads its provider credential privately from borrowed `tracy-dsh`; it does not modify that service.

## Remaining measured opportunities

- Improve agent pagination obedience: one WordPress attempt still chooses unnecessary detail reads. Expand bounded continuation acceptance before changing any shared harness policy.
- Diagnose provider interruption and add bounded recovery only with explicit duplicate-call/write semantics. The current driver exposes incomplete attempts instead of silently counting them as passes.
- Optimize cold complete-inventory projection. Current validation still reads a fresh head, and a cold miss walks the full inventory; native CMS indexed lookup would need separate contracts and benchmarks.
- Release/adopt Joomla's complete inventory fingerprint through its owning component workflow. Older installations remain correct with full walks and receive no completed-inventory reuse benefit.
- Measure larger sites and interleaved runs under representative load before asserting production tail-latency or settled-cost gains.
