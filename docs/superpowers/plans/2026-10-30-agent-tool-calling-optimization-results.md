# Agent tool calling optimization — implementation evidence

Latest follow-up: [bounded multi-title search, real product-harness tests and repeat benchmark](2026-10-30-agent-tool-calling-batched-search.md). It reduces repeated inventory walks; provider transport failures limit overall latency/cost conclusions.

Follow-up: the detected lookup issue is addressed in the [lookup correction and repeat benchmark](2026-10-30-agent-tool-calling-lookup-improvement.md), which compares against this first optimized candidate.

Date: 2026-10-30. Branch: `perf/agent-tool-calling`.
Baseline: `76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e` from fetched `origin/develop`.
Candidate: the working tree; the paired engine report records its source hash.

A subsequent user-authorized experiment measured the same engines on real disposable WordPress/PHP/MySQL and made actual DeepSeek tool calls. See the [live before/after benchmark](2026-10-30-agent-tool-calling-live-benchmark.md). Its results supplement the fixture evidence below; the full cross-CMS acceptance matrix remains incomplete.

## Measured changes

Two native changes reduce work in the tool layer. These results establish mechanism improvements on disposable fixtures. They do not establish production cost, model-step or customer-latency improvements.

| Targeted operation | Before | After | What the measurement proves |
| --- | --- | --- | --- |
| WordPress replacement requiring wider template discovery | 34 backend reads | 19 backend reads | 44.1% fewer reads for the same exact stored change, model-facing receipt, target set and Undo |
| Ordinary WordPress page replacement, control cohort | 16 backend reads | 16 backend reads | No extra backend requests; no demonstrated speedup for this cohort |
| Find a title outside the returned inventory head, 400 pages per language | 23,927 result characters; target omitted | 1,067 result characters; correct target id | 95.5% smaller result for this retrieval. Search uses a title; a known URL already had a direct lookup |

The engine experiment runs two cohorts, seven repeats, two interleaved arms: **28 verified operations**. Each uses a fresh component, checks the complete persisted target text and all unrelated records, compares receipts across arms, and applies Undo to restore the original state. This is the real native replacement engine with an injected component, not a deployed CMS or a model simulation.

The recorded run injects 5 ms into each backend read. Template widening took 109.45 ms baseline versus 83.07 ms candidate at the median (24.1% lower). The ordinary-edit control took 47.70 ms versus 50.52 ms (5.9% higher). These are synthetic local timings under background load. Earlier repeats varied; use the deterministic request counts as the acceptance evidence, and do not extrapolate the timing to production.

The page retrieval comparison measures JSON characters, not tokenizer counts or dollars. It uses the existing tool executor and the same raw relay-shaped inventory. It does not reduce the relay's underlying CMS listing walk. It reduces the context sent back to the model and makes omitted rows recoverable without requesting the full inventory or guessing an unknown URL.

Raw paired evidence: [2026-10-30-agent-tool-calling-benchmark.json](2026-10-30-agent-tool-calling-benchmark.json).

## Runtime implementation

- `replace-wordpress.mjs`: keep at most 256 successful read responses in one locate attempt. Widening discovery reuses them. Refusals and transport failures are not cached. The cache is discarded before the next attempt or tool invocation. Each write still revalidates its target through the original door; writes and Undo keep their existing executor.
- `read-compact.mjs` and `site-call.mjs`: `content.read {view:"pages", search, offset, limit}` filters the model-facing rows by title, path, URL, id or native record. Queries return match totals, continuation offsets and a flag identifying incomplete upstream totals. Existing locale selection applies. Continuation retains search and locale; empty matches stay empty. Upstream truncation guidance remains available. `full:true` uses the existing raw-response path and its existing bounds.
- Query parameters are host-owned only for address lists. Ordinary content listings, URL lookup and `changedSince` retain their existing parameters. No CMS endpoint, write path or permission rule is added.
- No tool definition or always-present schema grows. A truncated result supplies query and continuation guidance where it is needed. Existing deferral, monotonic additions, scheduler barriers and exclusive browser operations remain in place.
- Rebuilt the committed `packages/tools/tracy-site-tools/lib/index.js`. Deployment still requires rebuilding the dsh image.

The new search is substring matching using JavaScript Unicode lowercasing. It is tested with title data in all eight interface languages; it is not a semantic cross-language search engine.

## Measurement implementation

`agent-turn-cost.mjs` now exposes its existing parser for reuse and adds:

- Per-action result characters, outer receipt outcome and failure category. A nested failed item no longer turns a successful batch into a top-level refusal. Protective refusals remain distinguishable from argument, targeting, contention, execution and uncertain-write failures; unknown codes stay unclassified.
- Separate `tracy_emdash` actions, cache-write usage and a model-usage completeness flag.
- Effective model/provider/reasoning configuration, tool names, serialized schema length and SHA-256 for each answered model step. Headers emitted without a turn number and resumed-session headers are handled before turn filtering. Full arguments and customer content are not added to the measurement output.
- Actual per-action character counts in the CLI table that previously advertised them but printed only call counts.

`tool-benchmark.mjs` consumes a manifest of independently verified paired tasks plus the existing session logs. It checks matching fixture/CMS/cache/preset/model routes, includes failed-task spend, and compares customer latency, result size, calls, steps and actual cost per success. A missing pair, verification, usage, settled cost, boundary matrix or sufficient sample prevents a winning verdict. Unknown dollars stay unknown. It does not launch model calls or infer prices from token totals.

It is an exploratory comparison tool. The caller supplies trusted verification and settled all-attempt cost evidence; it does not independently query invoices, join the WO ledger or certify the verifier. One benchmark task is one measured turn, including its internal retries; a workflow with retries across turns needs a task-level aggregation before using this report.

## Reproduce

Run from the checkout root with dependencies installed:

```sh
node scripts/measure/wordpress-discovery-bench.mjs \
  --baseline-ref 76e7f114fa4ce6ac2e1b5b9d1c3ff9857c90c14e
node --test packages/tools/tracy-site-tools/test/read-compact.test.mjs
node --test packages/tools/tracy-site-tools/test/replace-wordpress.test.mjs \
  packages/tools/tracy-site-tools/test/replace-road.test.mjs
node --test scripts/test/agent-turn-cost.test.mjs scripts/test/tool-benchmark.test.mjs
node tests/regression/scripts/REG-PR-926-compact-site-reads.mjs
```

The engine benchmark compares the baseline engine against the working-tree engine with shared current dependencies. It records that limitation and source/fixture hashes. It uses no model, paid provider or borrowed customer site. Use `--delay-ms 0` to remove the synthetic read delay; wall-clock values remain descriptive.

For real task logs:

```sh
node scripts/measure/tool-benchmark.mjs manifest.json report.json
```

Minimal manifest structure (the single pair shown is intentionally insufficient for acceptance):

```json
{
  "schemaVersion": 1,
  "minimumPairs": 12,
  "boundariesVerified": false,
  "baseline": { "revision": "<commit>", "image": "<digest>" },
  "candidate": { "revision": "<commit>", "image": "<digest>" },
  "runs": [
    {
      "pair": "footer-wp-cold-repeat-1",
      "arm": "baseline",
      "cms": "wp",
      "fixture": "<snapshot revision>",
      "cache": "cold",
      "sessionFile": "baseline/session.v4.jsonl",
      "turn": 1,
      "costUsd": null,
      "verification": { "success": true, "evidence": "<independent verification artifact>" }
    },
    {
      "pair": "footer-wp-cold-repeat-1",
      "arm": "candidate",
      "cms": "wp",
      "fixture": "<snapshot revision>",
      "cache": "cold",
      "sessionFile": "candidate/session.v4.jsonl",
      "turn": 1,
      "costUsd": null,
      "verification": { "success": true, "evidence": "<independent verification artifact>" }
    }
  ]
}
```

Keep each repeated task's cache conditions and fixture identical across arms, include every failed attempt's settled spend, and preserve the verification artifact. Do not set `boundariesVerified` until the prescribed fault matrix has run.

## Validation and current limits

- WordPress replacement and orchestration tests: **189 passed**. These include stale-target revalidation, partial writes, lost answers, ambiguity, body guards and Undo.
- Compact-read tests: **18 passed**; page continuation enumerates every selected-language row exactly once, preserves upstream truncation and keeps ordinary listing parameters intact.
- Schema budgets, surface registration, existing deferral, call memory and scheduler classifications: **515 passed**.
- Measurement and paired-report tests: **14 passed**; mismatched models, unknown costs, missing verification/pairs, unfinished tasks and quality regressions cannot prove a win.
- Existing compact-read regression script: **all checks passed**. Both relevant existing regression cases were extended. No branch-commit PASS is claimed while this remains an uncommitted working tree.
- The broad site-tools run initially reported 4,217 passed and four files unable to load `jpeg-js`. After `pnpm install --frozen-lockfile`, all **85 tests** in those four files passed. No lockfile change was required.
- Package typecheck is not green: 59 diagnostics remain. Before dependency repair, the original baseline and candidate each produced the same 60 diagnostics after normalizing line numbers. The final candidate adds no diagnostic relative to that baseline. Existing errors include `call-memory.mjs`, `check-pages.mjs`, `replace-wordpress.mjs` and `sweep-resolve.mjs`; none comes from the new snapshot/query logic.
- Full `pnpm build:check` was attempted; its lint stage failed on existing type/dependency problems outside this change. The later full-repository tracing stage was stopped after that failure; remaining gates did not complete. The owned temporary database was cleaned up. This is not an acceptance pass. The separate Turbo structure check also reports 93 issues involving ignored generated/static inputs. No ready PR or deployment is claimed.

The local historical inventory contained 77 mixed-workload turns from an older running image. That identifies areas to inspect, not a controlled baseline. The local machine did not have disposable running Joomla and EmDash fixtures for the three-CMS task matrix. The 216 real-model runs, actual billed savings, p90 customer latency, full revocation/cancellation matrix and production rollout remain unverified.

## Disposition of the original plan

| Work package | Implemented in this branch | Remaining acceptance work |
| --- | --- | --- |
| P0 | Reusable parser; action outcomes/sizes; schema/model provenance; conservative paired report; historical inventory | Complete retry/queue/network telemetry; ledger joins; independently verified real task matrix and route prices |
| P1 | Two targeted native reductions; exact data and continuation recovery; tests and measured fixture evidence | Paired customer-task cost and latency acceptance across CMSs |
| P2 | Existing platform-specific schemas and deferral retained and tested; query/continuation guidance loaded with the result, without prefix growth | Dedicated action-help/capability metadata and model retrieval experiments; no measured justification to change deferral yet |
| P3 | Existing bounded `content.replace` workflow improved internally and tested through write/revalidation/verification/Undo | A second workflow, if traces show a benefit; no additional model-round-trip reduction claimed |
| P4 | Existing Monid adapter and WO ledger retained | Optional provider comparison when an equivalent paid route and an actual demand gap are available |
| P5 | Fleet prohibition retained | Optional isolated-runtime design and experiment; current privileged runtime remains unsuitable |

The concrete reduction is real: fewer backend requests in template discovery and a much smaller targeted page result. The full plan's end-to-end cost/latency targets are still unproven and must not be marked complete from these fixture results.
