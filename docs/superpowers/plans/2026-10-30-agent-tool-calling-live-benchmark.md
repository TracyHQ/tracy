# Agent tool calling: real WordPress before/after benchmark

Follow-up: the detected lookup issue is addressed in the [lookup correction and repeat benchmark](2026-10-30-agent-tool-calling-lookup-improvement.md), which compares against this first optimized candidate.

Date: 2026-10-30. Branch: `perf/agent-tool-calling`.

## Result

**The WordPress discovery optimization really removes backend work: 16 → 10 reads per template edit (37.5% fewer), with all 120 native operations passing exact-content verification and Undo.** The live local timing gain is much smaller than the earlier synthetic-delay fixture suggested. The new inventory search does not improve natural title lookup in this model experiment: both arms fail all six attempts because the model chooses a numeric-ID listing instead of the opaque Content API inventory.

The real-model template cohort has a better median but a worse p90. The complete result does **not** establish an end-to-end win or satisfy rollout acceptance.

## Native engine comparison on real WordPress

Each cell summarizes 30 attempts. Wall-clock values include independent content snapshot verification; tool-only values exclude that snapshot.

| Cohort | Verified / Undo before → after | Backend reads per operation before → after | Task p50 before → after | Task p90 before → after | Tool p50 before → after |
| --- | --- | --- | --- | --- | --- |
| Template wording edit requiring wider discovery | 30/30 → 30/30 for both checks | 16 → 10 (**−37.5%**) | 296.97 → 285.80 ms (**−3.76%**) | 484.96 → 349.25 ms | 124.39 → 116.43 ms |
| Ordinary page edit, control | 30/30 → 30/30 for both checks | 7 → 7 | 265.87 → 263.43 ms (−0.92%) | 408.21 → 426.72 ms | 93.21 → 90.80 ms |

Template discovery makes 480 → 300 backend reads across each arm's 30 edits. Candidate is faster in 21/30 template pairs, with median paired elapsed difference −7.7 ms. The ordinary-edit control is faster in only 13/30 pairs, with median paired difference +1.5 ms; its slightly lower arm median is not evidence of a consistent improvement. Paired differences and differences between arm medians are different statistics.

These counts differ from the earlier 34 → 19 synthetic fixture because the real site has a different discovery graph. The two measurements demonstrate the same mechanism; the synthetic 24.1% timing gain does not transfer to this real local backend.

## Actual-model comparison

Each arm has six attempts per cohort. Both arms use actual `deepseek-flash` provider calls, not simulated model answers. The provider returns `deepseek-flash` in its response; the captured provider documentation maps that route to DeepSeek-V4.1-Flash-1017.

| Cohort | Verified before → after | Task p50 before → after | Task p90 before → after | Model requests, total before → after | Backend reads, total before → after |
| --- | --- | --- | --- | --- | --- |
| Template wording edit | 6/6 → 6/6 | 2.704 → 2.184 s (**−19.26%**) | 3.686 → 5.272 s (**+43.01%**) | 15 → 14 | 114 → 72 |
| Ordinary page edit, control | 6/6 → 6/6 | 1.971 → 1.997 s (+1.30%) | 3.530 → 2.471 s | 13 → 12 | 48 → 42 |
| Natural title lookup | **0/6 → 0/6** | 1.803 → 1.828 s | 1.941 → 3.387 s | 12 → 12 | 6 → 6 |
| Known URL lookup, control | 6/6 → 6/6 | 1.999 → 2.143 s (+7.19%) | 2.082 → 2.209 s | 12 → 12 | 36 → 36 |

All 24 model-driven write operations pass exact-content verification and real Undo. Overall verified task success is unchanged at **18/24 per arm (75%)**, including the failed title cohort. All 12 title attempts call `content.list` and return `{"id":"404","path":"/?page_id=404"}`. That numeric post ID is not the expected opaque content ID. The new `content.read {view:"pages", search:...}` capability is never selected, so this cohort shows a discovery/contract gap and supplies no evidence of a model-context saving from the new search.

Template tool-time p50 is 236.03 → 188.87 ms; model-time p50 is 2,250.13 → 1,782.23 ms. Model time dominates. A deterministic backend read reduction cannot explain the entire 521 ms difference in task medians: model behavior, extra requests, cache state and provider latency also vary. Candidate is faster in 4/6 template pairs; its worse p90 prevents a broad latency claim. The fewer model calls in the ordinary-edit control also show that small changes in step count should not be attributed automatically to the runtime optimization.

## Usage and estimated model cost

All final requests fall in the published off-peak window. USD per million tokens: cache hit $0.003, cache miss $0.15, output $0.60. Costs below are **calculated from actual provider usage and published rates**, not settled invoice amounts. Cached tokens are charged. Every attempt, including all failed title lookups, is included. Infrastructure costs are excluded.

| Cohort, six attempts per arm | Baseline estimated model cost | Candidate estimated model cost | Observed change |
| --- | --- | --- | --- |
| Template edit | $0.001323 | $0.001235 | −6.68% |
| Ordinary page edit | $0.001029 | $0.000932 | −9.47% |
| Title lookup, all failed | $0.000767 | $0.000767 | 0% |
| Known URL lookup | $0.000804 | $0.000822 | +2.34% |
| **All 24 attempts** | **$0.003923** | **$0.003756** | **−4.26%** |

Including failed-attempt spend, estimated model cost per verified success is $0.00021793 → $0.00020865. Per-success cost for the title cohort is undefined because it has zero successes. With only six pairs and uncontrolled provider caching, the 4.26% observed cost difference is not evidence of a durable causal saving.

The final 48-task experiment totals approximately **$0.007678** in usage-priced model cost. The 16 recorded diagnostic/pilot tasks add approximately **$0.003831**, for **$0.011509** across the retained model-run artifacts. Pilot costs assume off-peak prices based on their observed execution window because those early requests lack timestamps. This is an estimate of recorded requests, not an account-wide spend reconciliation. Settled billed cost remains unknown.

## Experiment design

This experiment compares baseline `76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e` with the uncommitted candidate engines. Only the three changed engine modules are swapped; unchanged dependencies are shared. This isolates those changes and does not compare two complete deployed images.

The disposable site runs real WordPress 7.1.4, Claude Cowork component 0.18.37, PHP and MariaDB. It contains 401 published pages and a small block theme. No artificial backend delay is injected. The component was copied read-only from an installed plugin; customer content and databases were not copied. Every write and reset targets the explicitly owned temporary site on loopback. Owned containers and their volumes are removed after the experiment.

- **Native experiment:** two wording-edit cohorts, 30 paired repetitions each, 120 operations. The real replacement executors make HTTP calls to WordPress/PHP/MySQL.
- **Model experiment:** four task cohorts, six paired repetitions each, 48 tasks. Actual `deepseek-flash` API requests use the production `tracy_site` schema and description, temperature 0, thinking disabled, maximum eight model steps and 1,200 output tokens per request. Both arms receive identical task prompts and schemas. The bounded driver dispatches real native executors; it does not run the full dsh customer profile, preset or skills.
- **Order:** AB then BA, alternating by pair; all tasks execute sequentially against one fixture. Each task resets content and gets fresh local call memory. Provider prompt caching remains shared and uncontrolled; actual cache-hit/miss usage is preserved. These are not independent cold-cache cohorts.
- **Independent verification:** compare stored content records after each task. Writes must produce the exact expected text, preserve existing unrelated content rows and return a successful tool result. The template edit must create exactly one override with the full expected template bytes. Real `apply.revert` must restore the original content-record hash. Lookups must return the exact opaque Content API ID and path, backed by tool evidence, with no content-record change. Numeric WordPress IDs fail the lookup verifier.
- **Timing:** measured execution includes the final independent SQL content snapshot and excludes fixture reset and Undo. Tool time excludes that external snapshot. Both arms use the same procedure. These are local benchmark task times, not production customer latency. Native backend counters include only component API calls; rendered HTML fetches and verification SQL are outside that counter.

The content-record hash covers IDs, types, titles and bodies for pages, template overrides and template parts. It excludes revision records, audit history and other database tables. Passing Undo demonstrates restoration of this content snapshot, not byte-for-byte database equivalence.

## Evidence and reproduction

The raw artifacts contain source hashes, schema hash, fixture versions/image digests, per-request provider usage and IDs, task outcomes, call arguments, timings and content hashes. They contain only synthetic fixture data; private site tokens and provider credentials are excluded.

- [Runtime identity and container/image provenance](2026-10-30-agent-tool-calling-live-benchmark/environment.json); the temporary site answered on loopback port 56956
- [Native raw measurements](2026-10-30-agent-tool-calling-live-benchmark/native.json)
- [Actual-model raw measurements](2026-10-30-agent-tool-calling-live-benchmark/model.json)
- [Computed comparison](2026-10-30-agent-tool-calling-live-benchmark/summary.json)
- [Published pricing snapshot](2026-10-30-agent-tool-calling-live-benchmark/provider-pricing.md), fetched on 2026-10-30 at approximately 14:50 UTC from [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing.md)
- [Pilot diagnostics](2026-10-30-agent-tool-calling-live-benchmark/pilots.json), excluded from final cohort statistics

Run from the checkout root with Docker, the local WordPress/MariaDB images and an installed plugin source available:

```sh
node scripts/measure/live-tool-calling-fixture.mjs \
  --plugin-container <read-only-installed-plugin-container> \
  --config /tmp/tracy-tool-bench-owned.json
node scripts/measure/live-tool-calling-bench.mjs \
  --native-only --repeats 30 --out /tmp/tracy-native-live-final
node scripts/measure/live-tool-calling-bench.mjs \
  --repeats 6 --out /tmp/tracy-model-live-final
node scripts/measure/live-tool-calling-report.mjs \
  /tmp/tracy-native-live-final/raw.json \
  /tmp/tracy-model-live-final/raw.json \
  /tmp/tracy-live-summary.json
node scripts/measure/live-tool-calling-fixture.mjs \
  --cleanup --config /tmp/tracy-tool-bench-owned.json
```

Both benchmark commands use the private default fixture config above and support `--config` and `--baseline-ref`. The model driver reads the configured DeepSeek key from the existing `tracy-dsh` container into memory without printing it. It uses the provider's official endpoint. The source container supplies credentials only; its deployed engine is not the measured candidate. Native mode currently also checks that key, but sends no model requests. Keep write runs sequential.

The fixture helper initializes Content API identity before measurement. Early pilot runs exposed missing identity initialization and an unsupported driver action; those are setup diagnostics, excluded from the frozen comparison. A second prepared pilot exposed the natural title lookup's numeric-ID failure before the final prompts and method were frozen. No task was removed because of that failure.

## Limits and decision

This is a focused WordPress experiment. Joomla, EmDash, the full dsh scheduler/preset/skill loop, production network/queue waits, authorization/lease/history integration, revocation and cancellation remain outside its scope. Existing replacement revalidation and Undo paths are exercised, but this run does not certify the plan's full boundary matrix or its 216-run cross-CMS acceptance requirement.

Six model pairs per cohort provide exploratory evidence. Median and p90 use linear interpolation across all attempts, including failures; tail estimates at this sample size are descriptive. Background load and nondeterministic provider behavior can affect timings despite temperature 0. No statistical significance or production dollar-saving claim follows from this run.

The evidence supports retaining the per-locate read snapshot as a targeted backend efficiency improvement. It does not support declaring the full tool-calling plan complete. The next change should make the correct page-inventory lookup discoverable and prevent a numeric native ID from being mistaken for an opaque Content API ID, then rerun the same natural lookup cohort. After that, expand the paired sample and measure the full dsh workflow and other CMSs before making a customer-latency or cost claim.

Validation: all 168 frozen operations are present in complete baseline/candidate pairs; engine and schema hashes match across the native and model experiments. The report checks provider token accounting and off-peak timestamps and includes failures. Negative validation confirmed that incomplete pairs and missing provider usage are rejected. Fixture reset hashes are identical across all frozen operations; every required Undo passed. Evidence artifacts were checked for exact fixture/provider credentials before publication in this checkout. The three measurement scripts pass targeted formatting and oxlint checks; `git diff --check` passes. `pnpm docs:check-links` checks 518 files with no broken links (its configured internal/public-export exclusions remain in effect). Earlier whole-repository gate failures remain documented in the implementation evidence; this benchmark is not a green full-repository gate or a deployment.
