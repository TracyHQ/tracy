# Agent tool calling: bounded page search through the product harness

Local follow-up: [real daemon boot, local candidate deployment and Joomla/EmDash benchmarks](2026-10-30-agent-tool-calling-cross-cms.md).

Date: 2026-10-30. Branch: `perf/agent-tool-calling`. This iteration compares against the [lookup-corrected candidate](2026-10-30-agent-tool-calling-lookup-improvement.md), not against the original develop revision.

The remaining bottleneck was repeated inventory traversal: asking for four page titles made four `content.read` calls, each walking the same 401-page WordPress inventory in five backend reads. The new bounded OR query returns the union of matching pages from one walk. Measured work falls from **20 to 5 backend reads and 4 to 1 tool calls**, with all requested opaque IDs preserved.

## Implementation and scope

Use the existing action:

```json
{"action":"content.read","params":{"view":"pages","search":["Inventory 396","Inventory 397","Inventory 398","Inventory 399"]}}
```

The array accepts one to eight nonempty fragments, each at most 80 characters. It matches title, path, URL, opaque ID or native record, case-insensitively. A page matching several fragments appears once. Pagination preserves the complete query; existing locale selection and incomplete-source totals still apply. Invalid arrays, including arrays combined with `url` or `changedSince`, return `CONTENT_BAD_QUERY` before the relay.

Runtime changes are confined to the site-tools page-list view and its description, plus the rebuilt committed host bundle. There is no new CMS endpoint, shared cache, tool action or vendor edit. The production description is **7,714 characters versus 7,731** in the preceding candidate; existing size assertions were not raised. String search remains supported. This optimization saves repeated walks for multiple titles; a single title still costs five backend listing reads in this fixture.

## Product harness experiment

The test loads the actual built vendored `AgentLoop`, `ToolRuntime`, `ToolRegistry`, session store and projection, and applies the shipped Tracy `lib/index.js`. A scripted model isolates orchestration. The benchmark supplies real HTTP WordPress listing data through the production `walkListing` and `pagesDocument` functions. The relay boundary is injected, so this is not a complete deployed customer profile or a live host authorization test.

Twelve paired repeats alternate ordering: **24 tasks**, four target titles each. Both strategies run on the same candidate bundle: four supported string queries versus one array query. This comparison establishes strategy savings inside the real product loop, rather than a comparison between two deployed revisions.

| Measurement | Independent searches | OR search |
| --- | ---: | ---: |
| Verified tasks | 12/12 | 12/12 |
| Backend reads per task | 20 | 5 |
| Tool calls / persisted result events | 4 / 4 | 1 / 1 |
| Model adapter requests, including lifecycle follow-ups | 4 | 4 |
| Elapsed median | 463 ms | 395 ms |
| Elapsed p90 | 666 ms | 1,219 ms |

There is **no measured reduction in model requests**. Batch timing includes an initial 29.1-second outlier and a 1.25-second sample; all samples remain in the raw data. The lower median does not establish a tail-latency improvement. Timing includes loop/session setup and cleanup, not only CMS I/O. No artificial network delay was injected.

Four focused regression cases exercise scoped tool registration and signed relay identity, stable schemas across loop steps, logged results, string-query compatibility, pre-relay validation, seat refusal propagation, and existing read/write scheduling classifications. They do not certify the relay's cross-site fence, because that server is injected in this fixture.

## Actual model before/after experiment

A separate bounded DeepSeek driver uses each arm's production tool description and native executors against the same owned WordPress site. It lets the model choose calls naturally. It does not run the complete dsh profile; the product-loop experiment above covers that integration at library level.

There are **120 attempts**: five cohorts × twelve pairs × two arms, temperature zero, thinking disabled, maximum eight steps, balanced order, no retries. Baseline is the frozen lookup-corrected working tree; source and schema hashes are recorded. WordPress 7.1.4, component 0.18.37, 401 pages, real PHP/MySQL; no injected delay.

| Cohort | Verified before → after | Median elapsed, all attempts | p90 elapsed, all attempts |
| --- | --- | --- | --- |
| Four-title lookup | 11/12 → 11/12 | 3.944 s → 2.822 s | 6.405 s → 6.355 s |
| Single-title lookup | 3/12 → 1/12 | 0.964 s → 0.836 s | 9.559 s → 5.991 s |
| Known-URL control | 12/12 → 12/12 | 2.493 s → 2.602 s | 2.706 s → 2.898 s |
| Template replacement | 12/12 → 12/12 | 3.887 s → 3.885 s | 4.506 s → 5.150 s |
| Ordinary page replacement | 12/12 → 12/12 | 2.217 s → 2.253 s | 2.347 s → 2.970 s |

All **22 failures** are recorded `fetch failed` provider transport errors before any response/tool execution: ten baseline and twelve candidate. In particular, twenty affect the single-title cohort. Short failed requests lower its all-attempt medians; these numbers are not speedups. Overall verified success is **50/60 before versus 48/60 after**. This run therefore cannot establish overall reliability improvement or single-title non-inferiority. No failing attempt was rerun or removed.

For the four-title cohort, the eleven completed tasks per arm all return the exact four opaque IDs and paths backed by tool results, without changing any content. Before: four calls and twenty reads. After: one call and five reads. Both arms use two model requests. Completed-task median is 3.987 s → 2.878 s, a descriptive 27.8% decrease. The model-facing result shrinks from **1,928 to 896 characters** per completed task. This is the measured benefit of this iteration; the controls do not support a general latency claim.

Known provider usage for the completed four-title tasks estimates $0.000395568 → $0.000234437 per completed task, about 40.7% lower. This is a conditional usage estimate, not cost per verified success across all attempts. The failed requests return no usage and may have unknown charges. Overall cost, cohort total cost and cost per verified success remain **unknown**, as does settled invoice cost. Published off-peak rates and cache-hit/miss tokens are recorded; failed transport is never priced as zero.

## Regression and write safety evidence

- Full site-tools suite: **4,309 passed**, zero failures/cancellations. After the harness fixture cleanup, its final four focused cases also passed separately. These overlapping runs are not added together as a unique test count.
- Focused existing boundary suites: **509 passed**, covering call memory, site context, relay origin, stopped writes, deploy holds/restarts, schema deferral and surface listeners.
- Compact-read regression script passed with **22 compact-read cases**, including OR deduplication/continuation and invalid-array refusal.
- A fresh native write control run executes **40 operations**, ten pairs each for template and page replacement. Every operation passes exact persisted content, unrelated-record integrity, receipt and Undo checks. Reads stay 10 → 10 for template replacement and 7 → 7 for page replacement. This iteration does not optimize writes.
- All **48 model-driven writes** pass content and Undo verification. The model sometimes chooses extra discovery calls, so write latency/backend work is not identical in every model attempt.
- Lint and committed-bundle gates pass; targeted formatting and oxlint pass. Package typecheck still reports the same 59 existing diagnostics as the preceding candidate, with no new diagnostic after ignoring shifted line numbers.

Full build acceptance is not claimed. The earlier full gate run had unrelated generated-path failures, and full daemon boot verification is blocked by the local missing `node-addon-require-builtin-darwin-arm64` dependency. The actual built AgentLoop/library integration does run and is tested above. Joomla, EmDash and full customer-profile deployment remain unmeasured. Activating the committed host bundle on a server requires rebuilding/deploying its dsh image.

## Evidence and reproduction

- [Summary with explicit unknown costs](2026-10-30-agent-tool-calling-batched-search/summary.json)
- [Real product-loop raw observations](2026-10-30-agent-tool-calling-batched-search/harness.json)
- [All 120 real-model attempts](2026-10-30-agent-tool-calling-batched-search/model.json)
- [All 40 native write/Undo operations](2026-10-30-agent-tool-calling-batched-search/native.json)
- [Sanitized environment and process provenance](2026-10-30-agent-tool-calling-batched-search/environment.json)
- [Frozen baseline metadata](2026-10-30-agent-tool-calling-batched-search/baseline-snapshot.json) and [reconstruction patch](2026-10-30-agent-tool-calling-batched-search/baseline-snapshot.patch)
- [Incremental runtime patch](2026-10-30-agent-tool-calling-batched-search/incremental-change.patch)
- [Validation record](2026-10-30-agent-tool-calling-batched-search/validation.txt)
- [Provider pricing snapshot](2026-10-30-agent-tool-calling-batched-search/provider-pricing.md)

`python3 docs/superpowers/plans/2026-10-30-agent-tool-calling-batched-search/summarize.py` regenerates the summary, validates cohort completeness and source hashes, and preserves transport failures as unpriced attempts. Percentiles use linear interpolation. The baseline patch reconstructs the four frozen modules from develop revision `76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e`; reconstructed hashes were checked.

Recreate an owned fixture with `scripts/measure/live-tool-calling-fixture.mjs`. Run `scripts/measure/page-search-harness-bench.mjs --config <private-config> --repeats 12 --out <directory>` for product-loop strategy comparison. Run `scripts/measure/live-tool-calling-bench.mjs --config <private-config> --baseline-dir <reconstructed-modules> --repeats 12 --out <directory>` for model comparison; add `--native-only --repeats 10` for write controls. A reconstructed baseline directory also needs `metadata.json` copied from the baseline snapshot. Credentials are external to the artifacts. Repeating paid model runs requires a configured provider credential in the driver's existing read-only credential source.

The owned fixture is removed after evidence capture. Borrowed WordPress/dsh services are preserved. The next bottleneck remains the five-read inventory traversal for one title; optimizing it requires measuring an indexed/server-side lookup with identical opaque IDs, locale behavior and permission enforcement before changing the CMS/relay boundary.
