# Step 9 repair acceptance evidence

## Scope

Changes cover the scripted write, native site-agent repair and its verification/Undo. They do not change upstream research, model assignments, the template contract or the native image-update service. Local integration evidence was collected on 2026-11-09 UTC (2026-11-10 in the operator timezone).

## Focused real-service checks

Three runs seeded the same actual Joomla default Home publication fault through the normal owner Apply door, then used the production repair orchestrator and the real Tracy site agent with the existing DeepSeek provider. All restored Home from HTTP 404 and Login/Registration from HTTP 500 to HTTP 200. Each used one session, one turn, two checks including the initial check, and no Undo. Durations were 105.042, 101.216 and 48.882 seconds. Tool calls were 6, 7 and 7, with zero recorded tool failures. The first run overlapped cleanup of an earlier diagnostic writer; the last did not. These measure availability repair, not business-site acceptance.

A real scripted-menu guard call read the native Home item with `home: 1`, refused unpublishing it and left Home available. The existing path-only guard had missed its stored `home` path.

## Five-business diagnostic campaign

All cases used the same published JA Boxing Joomla 6 kit, version 1.0.11. Cases ran sequentially with successive step-9 patches; this is not a controlled before/after benchmark and does not establish template-selection coverage.

| Business | Ops minutes | Planner minutes | Writer minutes | Step 9 minutes | Recorded USD | Visual acceptance |
|---|---:|---:|---:|---:|---:|---|
| Urban Boxer | 51.76 | 14.51 | 10.51 | 26.57 | 0.1972 | FAIL |
| Boxica | 37.48 | 12.84 | 9.84 | 14.77 | 0.1923 | FAIL |
| Central Padel Dubai | 38.67 | 10.67 | 11.01 | 16.91 | 0.1960 | FAIL |
| Zen Yoga | 25.08 | 6.17 | 7.00 | 11.87 | 0.0968 | FAIL |
| Dhyana Dubai | 28.99 | 11.35 | 9.51 | 8.05 | 0.1828 | FAIL |

Recorded USD excludes unknown research and native-repair costs. Research preceded the Ops build window. Parallel durations must not be summed as wall time. Scripted writes took 14.842–20.956 seconds; repair turns and checks account for the longer step-9 duration.

- Urban Boxer reproduced two questions waiting for photos/logo. They waited 1042.013 and 988.121 seconds until explicit operator cancellation; the waits overlapped. This was an assisted diagnostic run. The outer chain had allowed nearly two hours. The independent ten-minute turn limit was added afterward.
- Boxica reproduced a shared CTA consent refusal and a question waiting 452.202 seconds. The independent turn limit cancelled the turn without operator intervention. Later prompts explicitly leave consent-required changes blocked.
- Central Padel had overlapping page sessions writing the same article-image fields. A later owner-turns read exposed `SHARED_CHANGE/concurrent` and `CONTENT_CHANGED_AFTER`. Original responses retained only `BLOCKED`, so the later reasons do not prove every earlier refusal cause.
- The final Dhyana run used serial page repair: two closed turns, peak concurrency one, zero question calls and zero native API retry events. Earlier cases reached three simultaneous native turns.
- Real served-DOM checks matched each compact selector once, for a deeply nested logo and an inline CTA background. This does not prove that all native style/capture failures are resolved.

## Loss of verification and real Undo

Dhyana's second turn updated article-image fields with null values. Native writes returned success, but subsequent contract inspection returned `ok:false` with `JSON slot is missing`; unmeasured groups had no explicit failure rows. The earlier judgment did not Undo this loss of verification.

Two tests reproduce the gap: a writing turn must be reverted when a measured check group becomes unmeasured, and an unmeasured no-op must retain unresolved faults without a blind retry. Both failed before the final guard and passed after it.

The actual captured Dhyana checks and second-turn change ledger were replayed through the production check worker. It requested Undo. A separate focused diagnostic used that decision with the REAL owner Undo door: Undo returned `ok:true`, and real contract inspection changed from `ok:false` before Undo to `ok:true` afterward. Both inspection responses were HTTP 200. This is checker/Undo verification after the five-case batch, not another full WO run. The batch screenshots precede this diagnostic Undo.

## Visual review and limits

All 37 kept pages were captured and opened at desktop and mobile widths, 74 views in total. Every view returned HTTP 200, but all five sites failed visual acceptance. Remaining failures included Boxing logos/images on yoga/padel sites, demo headings, duplicated policy copy and weak content after incomplete research.

Brand/Picture doors were unassigned. The existing Flash model declares vision capability, but a real Ops pixel test returned `QUALITY_PRICE_UNKNOWN` because pinned quality-price validity expired on 2026-10-27. Manual image inspection does not count as a passed independent automated image-review stage. Remaining native failures include `LOOK_FAILED`, `STYLE_TARGET_NOT_FOUND`, consent refusals and absent template edit contracts.

The five full runs predate the final loss-of-verification guard. Tests and the focused real Undo validate that guard separately. Full business-site acceptance remains outside this patch's verified result.

## Reproducible checks

- `node --test --test-concurrency=1 apps/tracy-web/test/write-step-*.test.mjs apps/tracy-web/test/site-check-scoped-pages.test.mjs`: 717 tests, 714 passed, zero failed, three skipped after merging the latest base into the branch.
- `REG-PR-449-step-9b-site-agent-repair`: deterministic entry-point, target, verdict, time-limit and scoped-check coverage; PASS after integration on commit `6b82af34e1`, recorded in the regression results.
- Targeted Oxlint, Biome and whitespace checks passed. Broader local checks had dependency/profile limitations; the PR description records their current results separately.
