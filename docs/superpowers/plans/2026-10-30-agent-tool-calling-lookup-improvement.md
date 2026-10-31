# Agent tool calling: lookup correction and repeat benchmark

Date: 2026-10-30. Branch: `perf/agent-tool-calling`.

## Measured result

**Natural title lookup improves from 0/12 correct to 12/12 correct, and overall verified success improves from 36/48 (75%) to 48/48 (100%).** The new description makes the model select the existing title-search capability directly, with no additional model round trip. This is a measured correctness improvement; the follow-up does not establish a general latency saving.

| Actual-model cohort, 12 attempts per arm | Verified before → after | Task p50 before → after | Task p90 before → after | Total model requests before → after |
| --- | --- | --- | --- | --- |
| Template edit | 12/12 → 12/12 | 3.320 → 3.325 s (+0.14%) | 4.209 → 4.060 s | 31 → 35 |
| Ordinary page edit | 12/12 → 12/12 | 2.082 → 2.425 s (+16.46%) | 2.530 → 2.963 s | 24 → 24 |
| **Natural title lookup** | **0/12 → 12/12** | 1.933 → 2.095 s (+8.37%) | 2.022 → 2.429 s | **24 → 24** |
| Known URL lookup | 12/12 → 12/12 | 2.352 → 2.231 s (−5.14%) | 3.140 → 2.759 s | 24 → 24 |

All 12 baseline title attempts choose `content.list` and incorrectly return numeric post ID `404`. All 12 candidate title attempts choose `content.read {view:"pages", search:"Inventory 399"}` and return the expected opaque ID and path backed by actual tool evidence. Both use two model requests per task. The result-local recovery hint is covered by direct tests but is not exercised by these candidate model title runs, which take the correct first action.

The candidate spends approximately 162 ms more at the title-lookup median to produce a correct result. It reads five real component listing pages instead of one native title search, because host-side page search still filters after the existing full inventory walk. Per title attempt, model-facing output grows from 373 characters of incorrect-ID evidence to 482 characters of correct-ID evidence. This is not a context-size win against the failed baseline.

The ordinary-page control is slower despite the same one tool call, seven backend reads and two model requests per task. Tool-time p50 is 160.35 → 152.49 ms, while provider/model time is 1.690 → 2.035 s. The extra latency is not in the new page-list hint, which this control never uses. The template cohort also varies in model action selection and request counts. The evidence does not support attributing those changes to backend speed or declaring that the description change is latency-neutral for every task.

| Native cohort, 30 attempts per arm | Verified / Undo before → after | Reads per operation before → after | Task p50 before → after | Tool p50 before → after |
| --- | --- | --- | --- | --- |
| Template edit | 30/30 → 30/30 for both checks | 10 → 10 | 332.38 → 337.05 ms | 146.66 → 150.81 ms |
| Ordinary page edit | 30/30 → 30/30 for both checks | 7 → 7 | 291.08 → 292.55 ms | 103.67 → 109.04 ms |

All 120 native operations pass exact-content and real Undo verification. All 48 model-driven write operations also pass both checks. The deterministic backend optimization from the first iteration remains present in both arms. The new correction adds no native replacement reads and produces no further replacement speedup. Provider-independent timings fluctuate under local background load.

## Usage-priced cost

All recorded final requests fall in the published off-peak window. Estimated USD uses actual provider cache-hit, cache-miss and completion usage at $0.003 / $0.15 / $0.60 per million tokens respectively. Failed tasks are included and cached tokens are charged. These are estimates, not settled invoice amounts or infrastructure costs.

| Cohort, 12 attempts per arm | Baseline estimated model cost | Candidate estimated model cost |
| --- | --- | --- |
| Template edit | $0.002740 | $0.003092 |
| Ordinary page edit | $0.001821 | $0.001716 |
| Title lookup | $0.001534, zero successes | $0.001759, 12 successes |
| Known URL lookup | $0.001764 | $0.001789 |
| **All 48 attempts per arm** | **$0.007859** | **$0.008356** |
| **Cost per verified success, all failed-attempt spend included** | **$0.00021829** | **$0.00017409** |

Total estimated spend increases **6.34%**, while estimated cost per verified success decreases **20.25%** because the candidate solves the previously failed cohort. The 96-task comparison totals approximately **$0.016215** in model usage-priced cost. This is a quality-adjusted observation on this balanced four-cohort workload, not a production savings forecast. Provider caching and response variation remain uncontrolled; do not generalize the dollar ratio to a different task mix.

Raw evidence:

- [Native operations](2026-10-30-agent-tool-calling-lookup-improvement/native.json)
- [Actual-model tasks and provider usage](2026-10-30-agent-tool-calling-lookup-improvement/model.json)
- [Computed comparison](2026-10-30-agent-tool-calling-lookup-improvement/summary.json)
- [Fixture/container/image identity](2026-10-30-agent-tool-calling-lookup-improvement/environment.json), loopback port 57509
- [Provider pricing snapshot](2026-10-30-agent-tool-calling-lookup-improvement/provider-pricing.md), captured from [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing.md) at approximately 14:50 UTC on 2026-10-30; model route documented as DeepSeek-V4.1-Flash-1017

## Bottleneck and implemented correction

The [first live experiment](2026-10-30-agent-tool-calling-live-benchmark.md) found a concrete correctness failure: all natural title lookups selected WordPress `content.list`, then returned the numeric post ID as a Content API ID. The host's new page search was absent from the initial tool description and only advertised after a truncated inventory response, so that model path never discovered it. The first experiment also showed that model latency dominates these small local backend operations; another speculative read cache would not resolve the lookup failure.

The follow-up changes the actual production tool contract in two places:

1. The page-map description now offers `content.read {view:"pages", search:"<title>"}` beside known-URL lookup and explicitly names its opaque Content API IDs. It retains describe, detail, locale and continuation guidance and passes the existing surface size budgets unchanged. The WordPress description grows from 7,715 to 7,731 characters, 16 characters or approximately 0.21%; no action or parameter-schema expansion is added.
2. A successful WordPress page listing keeps its existing numeric `items[].id`, labels the namespace `wordpress:post`, and supplies a result-local `contentIdLookup`. A single known page path gives an exact URL lookup; multiple matches retain every row and use the title query. This performs no hidden backend read. Refusals, non-page records, Joomla and EmDash native listings are unchanged. No IDs are synthesized or swapped, and writes keep their current revalidation/Apply/Undo executors.

The recovery hint matters if a model continues to choose the native record list despite the description. Its cost is paid only in that page-list answer; it is absent from unrelated model steps. A native record ID remains valid for `content.get` and `content.update`.

## Controlled comparison

The new baseline is the **previous optimized working tree**, frozen before this follow-up. It already includes the 16 → 10 template-discovery read reduction and host-side page search. The candidate adds the lookup correction above. This distinguishes the incremental improvement from the original commit comparison.

The four baseline modules and their SHA-256 hashes are recorded in [baseline-snapshot.json](2026-10-30-agent-tool-calling-lookup-improvement/baseline-snapshot.json). [baseline-snapshot.patch](2026-10-30-agent-tool-calling-lookup-improvement/baseline-snapshot.patch) reconstructs those modules from original commit `76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e`. Unchanged dependencies are shared. The driver loads each arm's own production description and schema, records both hashes and uses the same system/user prompts and model settings for both arms.

A new owned disposable WordPress 7.1.4 site with component 0.18.37 contains the same 401-page fixture and block theme. It runs on real PHP/MySQL with no injected delay. No customer database or content is cloned.

- Native: 30 pairs for template edits and 30 pairs for ordinary page edits, **120 operations**.
- Model: 12 pairs for each of the original four cohorts, **96 tasks**. Actual `deepseek-flash`, thinking disabled, temperature 0, eight-step bound, 1,200 output-token bound. AB/BA order alternates by pair; writes execute sequentially.
- Exact-content, unrelated-record and real Undo checks remain the same. Lookups must return a real opaque Content API ID and path backed by returned evidence; fast wrong answers count as failures.
- The fixture resets before each attempt and local call memory is fresh. Provider caching is uncontrolled and recorded, rather than labeled cold. There is no task-specific prompt coaching, removed failure cohort or favorable rerun selection.

The bounded driver uses production tool schemas/executors and real provider/component calls. It is not a full dsh customer-profile experiment. Queue, lease/authorization integration, complete audit history, cancellation and the cross-CMS matrix remain outside this experiment. Content-integrity hashes cover page/template IDs, types, titles and bodies, not the whole database. Timing includes the external verification snapshot and excludes reset/Undo; native API read counts exclude HTML requests and external SQL verification. Percentiles use linear interpolation and include failures.

## Reproduction

The benchmark driver now supports `--baseline-dir`, allowing an uncommitted previous candidate to be frozen and compared without making a commit or discarding existing work. It loads `surface.mjs` per arm, so the description correction is actually measured. The report checks that native/model experiments use the same two engine/surface snapshots.

Prepare a directory containing the four baseline modules and `metadata.json` matching the baseline snapshot artifact. To reconstruct it, check out the original commit in a temporary directory, apply `baseline-snapshot.patch`, copy the four host modules into the baseline directory, then copy `baseline-snapshot.json` there as `metadata.json`.

```sh
node scripts/measure/live-tool-calling-fixture.mjs \
  --plugin-container <read-only-installed-plugin-container> \
  --config /tmp/tracy-tool-iteration-owned.json
node scripts/measure/live-tool-calling-bench.mjs \
  --config /tmp/tracy-tool-iteration-owned.json \
  --baseline-dir <frozen-baseline-directory> \
  --native-only --repeats 30 --out /tmp/tracy-tool-iteration-native
node scripts/measure/live-tool-calling-bench.mjs \
  --config /tmp/tracy-tool-iteration-owned.json \
  --baseline-dir <frozen-baseline-directory> \
  --repeats 12 --out /tmp/tracy-tool-iteration-model
node scripts/measure/live-tool-calling-report.mjs \
  /tmp/tracy-tool-iteration-native/raw.json \
  /tmp/tracy-tool-iteration-model/raw.json \
  /tmp/tracy-tool-iteration-summary.json
node scripts/measure/live-tool-calling-fixture.mjs \
  --cleanup --config /tmp/tracy-tool-iteration-owned.json
```

The driver obtains the configured DeepSeek credential read-only from the existing `tracy-dsh` container, keeps it in memory and sends requests to the official provider endpoint. It does not restart or benchmark that container's deployed image. The private fixture config and provider credential are excluded from evidence artifacts.

## Validation

- Surface and compact-read tests: **55 passed**. Native IDs remain intact, query recovery does not add a hidden read, ambiguous/empty matches stay explicit, unrelated platforms and refusals are unchanged, and existing tool-description budgets still pass.
- Site-call and replacement integration tests: **535 passed**. Metrics/report tests: **14 passed**. The compact-read regression script passes with 20 compact-read checks and the rebuilt committed bundle assertions.
- Package build and targeted oxlint/format checks pass. The repository lint gate passes all three stages, including its 14 selected TypeScript projects; it emits 542 existing Biome warnings without errors. The bundle gate confirms 23 packages / 32 builds match source. The doc-link gate checks 519 files without broken links, with its configured public-export exclusions.
- The separate site-tools package typecheck still reports **59 diagnostics**, exactly the same diagnostic messages as the previous candidate after normalizing source positions. That package is not among the repository lint gate's selected projects, so the green repository lint gate does not imply this standalone check is green.
- Boot-graph validation fails before dsh starts because the local install lacks the `node-addon-require-builtin-darwin-arm64` native binding. No borrowed process was stopped. No full-repository gate pass or deployment is claimed.
- The stored reconstruction patch reproduces all four frozen baseline source hashes. Candidate engine/surface hashes stay unchanged throughout native and model measurements.

Detailed check disposition: [validation.txt](2026-10-30-agent-tool-calling-lookup-improvement/validation.txt).

## Decision and remaining bottleneck

Keep the lookup correction: it removes the reproduced ID error in this sample while retaining numeric IDs for native record operations. The 16-character description increase is small and stays within existing budgets. The benchmark supports better verified task completion and a lower usage-priced cost per verified success on this workload. It does not support a claim that all tasks become faster or cheaper.

The remaining measured lookup bottleneck is the five-page Content API inventory walk before host-side filtering. A later optimization could push supported filtering into the authenticated reader and relay, with explicit capability checks, pagination completeness, language/ambiguity behavior and old-component recovery. That is a separate implementation boundary; this follow-up does not invent an unsupported CMS search parameter or reuse stale inventory across writes. Full dsh and cross-CMS acceptance remain pending.

Final artifact validation confirms all **216 operations** form complete pairs (120 native and 96 model), fixture-reset hashes are identical, and every required Undo passes. Report negative checks reject incomplete pairs, missing usage and wrong frozen-baseline hashes. Exact fixture/provider credentials are absent from evidence. The owned containers, volumes, network and private fixture config have been removed; borrowed processes remain running.
