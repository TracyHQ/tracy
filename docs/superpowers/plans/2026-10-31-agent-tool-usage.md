# Agent tool usage and overlapping inventory reads on three CMSs

Date: 2026-10-31. Branch: `perf/agent-tool-calling`. Baseline: the locally deployed candidate from the [previous CMS experiment](2026-10-30-agent-tool-calling-cross-cms.md), rather than the original develop revision.

This iteration changes both the executor and the model-facing page-discovery guidance on WordPress, Joomla and EmDash. It measures them separately before comparing the combined behavior. The implementation stays in site-tools; the Content API reader, writer, seat door and vendored harness are unchanged.

## Implementation

`page-read-flights.mjs` shares an equivalent page-inventory request only while it is pending. `relayRaw` supplies a SHA256 key over exact relay credentials/origin, site route and target, workspace label, session and turn, preset, comment context, site generation and upstream parameters. Search, limit and offset have already been removed as host-owned view parameters, so each search shapes its own result from a private cloned answer. A known URL or changes-since query, a stopped call or a call without a session stays on its original path. Settled and rejected requests are removed; there is no inventory cache across completed calls. At 128 distinct pending entries, excess requests follow the ordinary path. Existing write generation invalidation separates requests that start across a write.

The tool description now gives all three CMSs direct URL/title page lookup, bounded multi-title search and detail reads only when fields are needed. EmDash retains its native collection/entry bridge without forcing describe before every page lookup. It also tells the agent to include a known locale in the first lookup, rather than walk all languages and retry. Existing description-size budgets remain intact; the generated `/ops/api` catalogue is regenerated from the same source. No global agent prompt or shared harness policy was added.

Page-map results also label the Content API ID namespace and distinguish the `id` field/column from the native CMS locator. This adds result-local interpretation guidance while retaining both identifiers and the existing `full:true` response. A Joomla natural-model run reproduced incorrect final numeric article IDs despite correct opaque IDs in tool evidence; that run is retained as a diagnostic.

## Measurement design

All runs load the actual built vendored AgentLoop, ToolRuntime and registry plus the shipped Tracy bundle. The relay is injected and forwards to real HTTP CMS readers in owned disposable containers. This is product-library integration with real CMS workloads, not a full authenticated customer relay deployment.

The native comparison uses eight balanced repeats for two tasks: four independent searches and one bounded OR search. A and D differ in executor revision; scripted calls isolate execution and cannot prove model selection. The natural-model experiment uses three repeats for three tasks (four titles, one title, one known URL), with four arms:

| Arm | Executor | Model-facing tool description |
| --- | --- | --- |
| A | Previous candidate | Previous candidate |
| B | Improved | Previous candidate |
| C | Previous candidate | Improved |
| D | Improved | Improved |

DeepSeek chooses its own actions and arguments from the natural request and actual product context. Each arm receives its recorded effective description; the benchmark does not prescribe the expected call sequence. The existing provider credential is read without printing or persisting it. Model route/settings, bundle/guide hashes, request hashes, usage, each HTTP status/duration and actual calls are retained. Order rotates across repeats. There are only three natural-model repeats per task/arm, so latency differences are descriptive, not statistical guarantees. Each measured task creates the same isolated AgentLoop fixture, including its startup overhead; absolute times do not represent a warmed authenticated customer session. Final measurements start after the broad regression suites finish, and CMS experiments run sequentially without a competing repository audit.

The driver verifies that every target's exact opaque ID and path reaches tool evidence and, for natural-model tasks, the final model answer. It compares stored content before and after each complete experiment. It preserves provider failures and unknown usage. This iteration performs reads; it does not claim fresh Joomla/EmDash write or Undo acceptance.

## Results

The final six experiments use the same frozen bundle pair and retain **96 scripted attempts and 108 natural-model attempts**. Every scripted attempt passed. The combined candidate D passed **27/27 natural tasks** across the three CMSs. Joomla guidance-only C failed two final answers despite correct tool evidence; these remain failures. All six stored-content comparisons passed.

Four independent searches, eight repeats per arm:

| CMS | HTTP reads before → after | Median before → after | Change |
| --- | --- | --- | --- |
| wordpress | 20 → 5 | 284.3 → 263.4 ms | -7.4% |
| joomla | 20 → 5 | 1100.3 → 903.1 ms | -17.9% |
| emdash | 4 → 1 | 3778.2 → 1058.8 ms | -72.0% |

The EmDash case reduces 8,108 native source calls to 2,027. WordPress and Joomla each reduce four five-request inventory walks to one. This proves less repeated work for overlapping equivalent reads; it does not make an individual inventory walk cheaper.

The already-batched control deliberately has no repeated inventory to remove:

| CMS | Batch median before → after | Change |
| --- | --- | --- |
| wordpress | 249.4 → 242.6 ms | -2.7% |
| joomla | 824.1 → 855.3 ms | +3.8% |
| emdash | 1031.5 → 1009.1 ms | -2.2% |

Joomla remains 3.8% slower in the batch control. Its relay median shifts from 742.6 to 768.9 ms, while the median time outside that relay shifts from 89.2 to 91.5 ms. These separate medians are not additive. The trace supports backend variation plus a small host overhead; it does not support a universal latency win. The earlier Joomla slowdown under competing audit load was not an isolated measurement. This balanced revision improves the independent-search case by 17.9%, while explicitly retaining the slower control.

Natural-model results, nine tasks per arm (three tasks × three repeats). Medians and token totals include failures:

| CMS | Arm | Correct final ID/path | Median task time | Tool calls, total | Known prompt tokens, total |
| --- | --- | --- | --- | --- | --- |
| wordpress | A | 9/9 | 2.320 s | 9 | 133,737 |
| wordpress | B | 9/9 | 2.301 s | 9 | 134,065 |
| wordpress | C | 9/9 | 2.504 s | 9 | 133,637 |
| wordpress | D | 9/9 | 2.167 s | 9 | 133,971 |
| joomla | A | 9/9 | 3.306 s | 9 | 135,792 |
| joomla | B | 9/9 | 3.127 s | 9 | 136,146 |
| joomla | C | 7/9 | 3.299 s | 9 | 135,802 |
| joomla | D | 9/9 | 3.180 s | 9 | 136,092 |
| emdash | A | 9/9 | 7.781 s | 23 | 307,972 |
| emdash | B | 9/9 | 6.602 s | 24 | 346,249 |
| emdash | C | 9/9 | 2.984 s | 9 | 129,051 |
| emdash | D | 9/9 | 2.971 s | 9 | 129,338 |

On EmDash, combined candidate D reduces the median from 7.781 to 2.971 seconds (61.8% lower), model requests from 32 to 18, and known prompt tokens by 58.0%. The four-title task changes from a 9.483 s median to 3.418 s. Each C/D natural task uses one page inventory with the requested locale. C also improves substantially without the new executor: the agent guidance is the main measured improvement for these serial natural tasks.

WordPress and Joomla already usually select a single batch in the baseline. Their final model-time changes are small relative to provider variation, and prompt-token totals do not improve. No general agent speed or cost reduction is claimed for those CMSs. Both still benefit when the agent sends overlapping independent inventory reads.

The two Joomla C failures are known-URL tasks: the model returns article ID `65` as the Content ID even though the exact opaque ID is present in tool evidence. Candidate B/D label the ID namespace locally and both pass 9/9 in this run. The baseline A also passes 9/9, so this small experiment is evidence of the failure mode and candidate behavior, not a reliability guarantee. Provider pricing is not established; token totals are not settled cost.

## Diagnostic runs retained

An initial adapter probe falsely answered unrelated product doors with `{ok:true}`. That enabled a nonexistent demo lifecycle and caused extra calls after an otherwise correct answer. It is retained as a diagnostic, not a valid customer-latency result. The fixture now explicitly refuses unavailable doors and says `AGENT_DEMO_NOT_GRANTED` for the unrelated demo workflow.

A second pilot revealed that abbreviated search guidance sometimes made the model choose `content.list`. The initial focused driver refused that supported read, so those failures mix guidance behavior with a benchmark limitation. The final driver allows existing WordPress/Joomla `content.list`, `content.get` and `info` reads through the real CMS. The guide restores an explicit title-search argument example. No pilot failure is relabeled as a pass; final comparisons are separate files and keep their own failures.

A further EmDash model probe reproduced a real regression in the proposed guide: omitting the known English locale caused an all-language page walk followed by a retry, with 21 HTTP reads and about 22–23 seconds for the four-title task. A sentence saying to use a known locale was still ignored in the next probe. The final EmDash example puts `locale:"<requested>"` directly in the call arguments, rather than hard-coding a site language. A separate one-arm development probe then returned all three targets/tasks correctly in one inventory read each; it is not included in the balanced comparison. The slow attempts remain in `diagnostic-emdash-missing-locale.json`; the accepted experiments use a separate frozen guide and bundle.

Earlier timing probes overlapped broad regression work or used a preceding bundle/fixture revision. They remain diagnostic observations and are excluded from final timing claims. The previous Joomla slowdown is a descriptive observation under competing load; overlapping independent walks can hide work through concurrency, so fewer reads alone does not explain its critical path. Final request-level traces below establish what this revision actually changes.

## Verification and local deployment

The complete site-tools suite passes **4,322/4,322 tests**, with no failures, skips or cancellations. The compact regression passes all steps, including 23 read-compaction cases, 11 product-loop cases and four flight-isolation cases. Test quality passes. The selected gate run passed 62 other gates, including bundle checks and real dsh boot (web 58 entries, native 75). Its lint failure was formatting of new JSON artifacts; after formatting, lint passed all three stages separately. This covers all 63 selected gates; it is not an unqualified full-repository pass.

The broad command explicitly excluded `turbo-config` and the repository-wide `tests` gate. Standalone site-tools typecheck still reports the same 59 existing diagnostics; no unrelated package repair is included. The publication scan of committed baseline `76e7f114fa4c` still has 49 blocking findings (eight secret, 32 email, eight phone, one submodule), so publication readiness is not claimed. Pinned gitleaks 8.28.0 finds no leaks in the new benchmark artifact directory. Both previously suspended owned scans were resumed and completed. See [validation evidence](2026-10-31-agent-tool-usage/validation.json).

All owned WordPress, Joomla and EmDash benchmark containers, their networks and private fixture configs/data have been removed; the local candidate remains running. See [cleanup evidence](2026-10-31-agent-tool-usage/cleanup.json).

The final bundle is running in owned container `tracy-agent-tools-local` through its password gate at **http://127.0.0.1:56341** (direct dsh: 56340; Docker VM PID 96793). The bundle SHA256 is `ea6f4236ca2aba7325e9871f2a032752ed5aaec29c1d26fdfbb1eca37e8952d9`, matching the measured candidate and working tree. Login returns 302, the gated page returns 200, all three script batches load, and Playwright observes 74 entries, an editable chat input and no page errors. The fresh account has no customer site or model provider configured.

Only this owned container was restarted. Docker reassigned its dynamic host ports, so the private access file was refreshed from actual bindings. The headless base image also lacked an OS Documents directory for first-use workspace creation; the supported `workspace-controller.documentsDirectory` setting now points to `/desk-home/Documents` in this container's local overlay. No repository or vendor workspace code changed.

The local image tag `tracy/dsh:agent-tools-local` was also rebuilt as `sha256:4a225a9fe37600df08583e7f8222c4341c9e9e41343c3d743a7953d472705a52`. The running container retains its original base image and receives the new bundle in its writable layer; these are recorded separately in deployment evidence. No production deployment or borrowed-service restart occurred.

## Evidence and reproduction

- [Validated summary](2026-10-31-agent-tool-usage/summary.json) and [summary generator](2026-10-31-agent-tool-usage/summarize.py).
- Scripted raw measurements: [WordPress](2026-10-31-agent-tool-usage/wordpress-native.json), [Joomla](2026-10-31-agent-tool-usage/joomla-native.json), [EmDash](2026-10-31-agent-tool-usage/emdash-native.json).
- Natural-model raw measurements, including failures: [WordPress](2026-10-31-agent-tool-usage/wordpress-model.json), [Joomla](2026-10-31-agent-tool-usage/joomla-model.json), [EmDash](2026-10-31-agent-tool-usage/emdash-model.json).
- [Effective descriptions and parameter schemas](2026-10-31-agent-tool-usage/guidance.json), [baseline provenance](2026-10-31-agent-tool-usage/baseline.json), and [incremental runtime patch](2026-10-31-agent-tool-usage/incremental.patch). Reversing that patch reconstructs the preceding runtime sources; the rebuilt baseline matches SHA256 `14d19374f19b9719db99a811fd1a04c168ce943fd3f0a621802a7e72d51a23a8` exactly.
- [Diagnostic run inventory](2026-10-31-agent-tool-usage/diagnostics.json), [fixture portability correction](2026-10-31-agent-tool-usage/fixture-portability.json), [local deployment](2026-10-31-agent-tool-usage/local-deployment.json), and [browser observation](2026-10-31-agent-tool-usage/local-browser.json).

The full package command initially exposed a test-only path error: the fixture resolved the vendored harness from cwd. It now resolves the same modules relative to its own file and passes 11 tests from both repository and package directories. The benchmark ran from the repository root, where both forms resolve identical modules; no measured bundle, description, adapter behavior or task changed. The recorded fixture hash remains the actual measurement hash, and the later portability correction has its own provenance. JSON files are formatted for repository checks; their parsed observations are unchanged.

Run `scripts/measure/agent-tool-usage-bench.mjs --platform wordpress|joomla|emdash --config <private-config> --baseline <frozen-bundle> --baseline-catalogue <frozen-catalogue> --repeats 3 --out <directory>` for natural-model measurements. Add `--native --repeats 8` for scripted execution measurements. The frozen bundle must resolve the same workspace dependencies as the candidate. The script accepts only owned fixture container names and loopback origins; it never executes writes. Prepare the CMS through its normal bootstrap, identity and, for Joomla, derived-contract setup before measuring. Private configs contain the token and remain outside the repository.

`python3 docs/superpowers/plans/2026-10-31-agent-tool-usage/summarize.py` validates full task/arm/repeat counts and content integrity, then regenerates the summary without removing failed attempts. Percentiles use linear interpolation. Known provider tokens are reported; no settled-cost or model-independence claim is made.

## Remaining improvements, ordered by measured scope

1. **Address lookup at the reader, for all three CMSs.** A known URL still walks the inventory in this focused relay, then selects the page. Add an indexed path/URL door only after checking the real authenticated route and CMS contracts. Acceptance: the same opaque ID, locale, alternate and refusal behavior, with no full inventory walk; benchmark title, URL, ambiguity and missing-page cases separately.
2. **Joomla pagination and EmDash source fan-out.** Joomla currently needs five HTTP reads per inventory on this fixture. EmDash's English inventory expands into 2,027 native source calls behind one HTTP read. These dominate the remaining CMS path. Investigate bounded batch/index support in each owning CMS repository, retain cap/truncation semantics, and compare source calls and tail latency before changing pins. WordPress's five-page walk needs the same pagination measurement.
3. **Agent interpretation and action choice.** Expand natural-model tasks beyond these three read cases: ambiguous titles, other languages, empty results, continuation, details after discovery, correction of native IDs and recovery after a refusal. Include the actual authenticated seat/preset and streaming provider adapter. Keep exact-ID/path success, calls, known tokens and failures together; model latency alone cannot establish tool quality.
4. **Writes and Undo acceptance.** Run product-harness edit and revert scenarios on owned fixtures for all three CMSs before claiming a complete agent-task improvement. Verify per-site isolation and stored content after revert. No writer, global harness or vendor change is included in this iteration.

These are follow-up scopes, not claims that this read-only experiment has already accepted them.

## Follow-up implementation

The four follow-up scopes above are implemented and measured in [authenticated reader optimization and acceptance](2026-10-31-agent-tool-reader-acceptance.md). That report supersedes this report's local ports and bundle hash, retains failures, and distinguishes warm inventory reuse from cold CMS indexing.
