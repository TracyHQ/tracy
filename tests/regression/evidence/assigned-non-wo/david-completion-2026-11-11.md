# David issue implementation and verification

This continues PR 541 on 2026-11-11, from current develop 73b44d40d3 and the existing pipeline integration through
43d65d3d73. The delivery is incomplete: no new merge or deployment is claimed by this report.

## Implementation

- #544: collected owner website pages enter the grounded business reading, with bounded passages balanced across
  services, people, story and prices. Exact quoted service prices reach the profile. Existing immutable revisions stay unchanged.
- #545: original owner posts become brief facts. Article copy must cite exactly one original post consistently;
  surplus cards and detail pages cannot duplicate one post or invent an article from trade knowledge. Hidden article
  slots may be removed without the ordinary trade-content replacement rule resurrecting them.
- #548: documentary photo wishes reject generated or extended substitutes independently in P07; their fallback ladder
  uses permitted owner-photo alternatives and returns an unfilled frame rather than inventing a photograph.
- #546: reuse the existing social-network/icon validation from the parallel pipeline. Compact phone logos retain the
  business name, the active offcanvas logo is visible once in each mode, and customer menu routes take planned parents
  and written titles, with read-back and parent restoration before a rerun.
- #510: linked owner names that expand the middle of the same business name agree. Different brands and substituted
  words still require owner confirmation. The frozen dev name inputs reproduce the compatible expanded-name case.
- #547: readiness checks and recovery travel through the fenced failed-action update to the list and Details. A retry
  of an immutable blocked brief is refused before another daily allowance is reserved. The original attempt may still
  have reserved an allowance; this change does not silently rewrite past usage or refund the original attempt.
- #549: the dialog describes available and kept sources truthfully in all eight interface languages. Provider account
  and payment refusals are blocked in automatic plans, full customer research and source-only retry before a job is
  inserted. A later operator setup save acknowledges intervention and permits testing collection again. It is not a
  provider-health probe; saving an unrelated setting can also reopen the attempt.
- #508/#509: reuse the existing server-owned chain selection, durable action wait, verified handover and same-site retry
  authority. The client-send fallback remains for configurations that do not select the chain. Their full customer
  acceptance remains outstanding, including the original secondary symptoms of pending photo labels and preview loading.
- #536/#307/#392/#316: their source fixes already landed in PR 543; this line does not count them as newly deployed.

## Actual local checks

The earlier integrated focused run passed 635 cases, and an additional PostgreSQL integration run passed 136 cases.
After the payment and readiness follow-ups, the current payment-plan/request suites passed 23/23 and the selected
brand, action, runner and client suites passed 134/134, with zero skips. These selections overlap; they are not a
unique combined test count. Logs remain in the local session files until final evidence is recorded by the regression runner.

The full non-test gate sweep reached all 63 selected gates. It first found a missing verbatim template term in seven
translations and a stale site-tools host bundle. All three affected gates passed after the translations and generated
bundles were repaired. The separate boot-graph check passed: web has 58 entries and all seven declared Tracy plugins;
native has 75 entries and all 23 declared Tracy plugins. This does not accept a running customer site or its sign-in gate.

The browser measurement of the existing public site's DOM at 390 and 1440 pixels, in both modes, reproduced two
visible offcanvas logos and measured one after candidate CSS was injected into an isolated browser context. It did
not write the server or accept the final generated logo. Frozen input replay rejects 15 generated documentary frames
from the historical manifest and preserves the compatible owner-name decision. These are local mechanism results.

## Remaining gates and acceptance

Full build:check has not passed. Its first database was OOM-killed; a dedicated database then stopped on ENOSPC in the
shared Docker VM. The host publication suite also timed out under tracing. Only owned gate processes were stopped.
The dedicated disposable test database was recreated with bounded resources and test-only durability settings; the
23-case and 134-case runs above then passed. No borrowed container or shared volume was removed.

The public-tree scan at integration source 3a4c99bc7f still reports 107 baseline blockers. No public-clean verdict is
claimed. Historical PR 541 CI also reports English-policy violations in committed test logs; a forward source-language
check does not prove that every intermediate commit passes that separate history check.

Five complete local customer handovers, full native image acceptance, real CMS route/restore acceptance, the complete
local gate set, CI on the final head, dev deployment and post-merge acceptance remain required. The preexisting
five-business status file is historical evidence and must not be interpreted as current success. No issue is closed
by this report, and PR 541 must remain draft until its acceptance checklist is satisfied.


## Continuation on 2026-11-11

Integrated the parallel session through a75d745079 (setup-job proof, measured page-title ownership and terminal
failed-write retry) in merge 6041114cb8. The combined application suites passed 343/343 with no skips. An older
five-millisecond wall-clock assertion failed at 5.17 ms under load; it now checks first-microtask settlement and
absence of additional requests directly. Both independently changed checker contracts receive new versions:
site-plan-check/7 and site-pictures-check/4.

Newly assigned #550 was reproduced twice against real MariaDB: push settlement remembered a version absent from
the copy, and an older phantom pair caused a delete conflict on another article. Live-generated Joomla versions now
enter through the row merge instead of being seeded only into the base. Historical pairs are checked against copy
presence and record ownership, accounting for article/category number translations. Revision 2 forces one fresh
read/merge for older maps. All 19 push-settlement suites passed, with no skips, including later save/deletion and a
valid version pair whose article has another copy number. The broader sync-flow run is still pending.

The seven mechanism PASS receipts on b70dc5895c are committed in efb2f7968d. After integration, the backup-export
suite passed 30/30 on the dedicated PostgreSQL instance. The broad test run was stopped after a racing export test
failed; that isolated suite passed, but the full test gate has not passed. The separate rest group passed 374 interop
tests and 649 Tracy fork tests (eight skips and one todo), then failed 23 upstream fork tests on macOS, including
loopback binding and canonical temporary paths. These are not reported as a green full test run.

Fresh lint/typecheck/format, documentation links, source language and test-quality passed. The Turbo structure check
found the scanner binary downloaded into ignored scripts/opensource/.bin; this task's binary was preserved outside
the checkout, without changing task inputs or weakening the gate. The final non-test sweep and repeated structure
check are still pending. Historical English-policy findings remain in intermediate committed test logs. Publication
and complete customer acceptance remain open; nothing has merged or deployed from this continuation.


## Committed-head results

All eleven selected mechanism cases passed on d6c0af4bef213d076f264b737f8593d9b22f1a3a, including the seven issue
cases, Joomla history settlement and the three newly integrated setup/title/retry cases. The receipt is
`tests/regression/results/2026-11-11-d6c0af4be.jsonl`. These are local scripted mechanism results, not acceptance
of a deployed customer site.

The final non-test sweep passed all 63 selected gates. The separate Turbo structure/input check passed all 51 tasks,
without measuring their suites again. The previously recorded boot graphs passed independently. The full test gate
remains red/incomplete for the reasons above. Source and evidence were pushed to the existing draft PR 541; GitHub
now reports it mergeable. No develop merge, image deployment or post-merge test has happened.


## Delivery history and broader sync result

The full local shell/ID-map run completed 35 cases: 34 passed and one large-file interrupted-apply scenario failed
before its second deletion round could plan. The new revision-2 unchanged-live repair case passed. The failed
scenario is being rerun independently with its actual merge answer retained in the assertion; it is not accepted.
The current public-tree scan at d6c0af4bef again reports 107 blockers.

The history policy rejected three lines in older committed transcripts (an accented English word and a Chinese
build-status line). Their wording is normalized in this delivery. The complete original history is retained locally
on backup/david-issue-completion-before-consolidation. Delivery history is consolidated onto current develop so the
policy can judge clean contributions; mechanism receipts must be rerun on the consolidated commit before they can
serve as branch evidence. No source behavior is changed by that history operation. The two Linux validation runs on
the earlier delivery head were cancelled to avoid spending the lane on a superseded head.


## Consolidated delivery verification

The local contribution-history check on dcace88107bb39cfdcc04200f0a493febc0f5cd4 inspected one commit and 432 changed
files with zero findings. All eleven selected mechanism regressions passed again on that consolidated commit;
`tests/regression/results/2026-11-11-dcace8810.jsonl` is the current branch evidence. Receipts on the earlier delivery
commits remain historical records, preserved with their original code on the backup branch.

The large-file interrupted-apply scenario passed independently (1/1, zero skips, 92 seconds) without a behavioral
source change; the added assertion now retains a failed merge answer. This does not turn the earlier 34/35 full run
into a full green run. The final source differences from the prior pushed delivery are three normalized transcript
lines, that diagnostic assertion and this report. The application and fleet implementation is identical.

The final delivery remains draft. Full Linux CI and real MariaDB integration must be rerun on its published head.
The local upstream fork failures, publication blockers and complete customer/deployed acceptance remain outstanding;
no issue is closed and no develop merge or deployment is claimed.


## Parallel planner input follow-up

Reused parallel commit 95c34e5220 as cherry-pick 8ed6c6b88f, preserving clean delivery history. It removes unused owner
photo metadata only from the model-visible planner brief, versions that view and refuses incompatible paid resumes;
all other steps retain the full frozen brief. Its integrated planner/control/store/worker/article selection passed
48/48 with no skips.

The new regression initially failed two approved-prompt hash checks. The earlier issue implementation had changed
the locked planner prompt. That change is removed: approved prompt bytes are restored, while the versioned article
and documentary-photo checks remain in code. The complete prompt/input selection then passed 11/11 with no skips.
The failed receipt on 8ed6c6b88f is retained honestly; a fresh committed-head receipt is required for the correction.


The corrected planner brief-view case and both article/documentary-photo cases passed on committed source
4d2495010c. The receipt `tests/regression/results/2026-11-11-4d2495010.jsonl` supersedes the earlier failed prompt
measurement. Selected lint/typecheck/format, Turbo structure and source-language checks passed after the planner
input integration; the vocabulary/test-quality tail is still being collected. Linux Tracy CI on 48e744973e was
cancelled because it predates the prompt correction. The separate live-sync workflow on that head is still useful
for unchanged fleet code and remains running. A final-head CI result is still required before readiness.


## Original-post routing integration

An independent check on clean c74af5fea4 reproduced three brief-route failures: the newly collected `fact.posts`
kind had no route-table row. Across all twenty brief suites, 163 tests passed and three failed. Reused parallel
commit 9120294336 as cherry-pick 3d83477e9f. Original post facts now route to existing article title, lead and date
roles; their evidence is preserved. The pictures CLI expectation also follows the already-versioned check/4 contract.

The combined brief, article and PostgreSQL-backed pictures CLI selection passed 173/173 across 22 files, with
zero skips. The scripted post-routing regression passed on committed source 3d83477e9f. The imported receipt had
attributed a dirty-tree PASS to c74af5fea4; it is corrected to FAIL with the independently reproduced baseline log.
Only the fresh committed-source receipt serves as proof of this fix. The five selected planner follow-up gates
previously described as collecting have all passed. Full final-head CI and customer/deployed acceptance remain owed.


## Final parallel repair integration and Linux sync proof

Reviewed and integrated parallel dfea38b5d3 and its committed-source receipts through 050cf77224. The exact mapped
unsupported alt targets no longer launch futile native repair turns. They remain blocking failures; this change
creates no missing write capability and does not accept the observed Diner site. Supported article, module HTML
and separate gallery alt targets retain the repair path. Independently exercised all twelve step-nine/record-alt
suites: 103/103 passed with no skips. Fresh post-routing and alt-capability regression receipts on f14fa3b3a3 are
committed beside their logs. All 63 non-test gates passed using the repository's Node 24.11.1; tests, Turbo input
tracing and the independently measured boot graph were explicitly excluded from that invocation.

GitHub Live Sync Integration run 42990304606 passed all 304 real MariaDB live-sync, live-push and live-write tests,
with zero failures or skips, in 1263 seconds. Its source is 48e744973e. A direct comparison confirms the fleet and
host implementation is unchanged in the current delivery. This is full Linux sync evidence, while final-head full
Tracy CI, complete customer acceptance and deployment remain separate requirements.

The publication scan of current develop 73b44d40d3 reports the same 107 blockers as the earlier delivery d6c0af4bef:
45 secret-rule hits, 43 emails, one IP, seven machine paths, ten phone numbers and one submodule. Comparing exact
blocking records while ignoring shifted line numbers found zero added or removed blockers. Raw scanner details
remain private. No allow list was broadened, and this is not a clean-publication verdict. A final-source scan is
running to measure the subsequent routing and capability changes.

The parallel real Diner run still uses a75d745079. Its diagnostic explicitly records demo text, a reverted header
logo and unsupported contact-picture alt repairs, with zero accepted local or dev sites. It cannot prove acceptance
of this later source. PR 541 remains draft; no develop merge, deployment or post-merge acceptance has occurred.


## Research wording and current preview probe

The smaller #509 research-duration symptom remained in two English strings and all seven translations. Removed
the fixed ten-minute sentence from both source descriptions in every interface language. Existing elapsed-time,
source and photo progress are retained. Updated exactly those two source fingerprints and rebuilt add-site plus
both locale bundles. No new timing estimate or provider call is introduced.

The read-only dev catalogue currently supplies JA Boxing home preview URLs. Both actual image requests returned
HTTP 200 and image/png: desktop 1440 by 3600 pixels (1271112 bytes), mobile 780 by 7200 pixels (973772 bytes).
This verifies current asset delivery, not the original browser symptom or post-merge acceptance. The borrowed
local stand has null image/shot fields for this template; missing stand metadata is not proof that dev lacks them.
Photo labelling already has a five-minute overdue boundary in picture-label-runs.js. Its reported four-and-a-half
minute run is within that boundary; no arbitrary shorter timeout was introduced to hide incomplete labels.

The final-source scanner on f14fa3b3a3 found the 107 inherited blockers plus seven machine paths in this task's new
baseline diagnostic log. Those checkout prefixes are now removed from the transcript while preserving errors,
line numbers and stack frames; no scanner policy is changed. A new committed-source scan must verify the result.


## Full Linux CI findings and source-scope recovery

Manual Tracy CI run 42991181876 on c74af5fea4 failed the checks and tests-2 rows. It caught a real undefined
onlySource reference in shared Resume, missing successful setup receipts in the chain-build fixture, provider
account-refusal expectations that still assumed a daily retry, original-post routing gaps, and unfilled source
template lines newly exposed as post facts. The older run was cancelled after its completed failure logs were
collected; it cannot serve as final-head evidence.

Resume now reads the original place job's source scope under the place lock, applies the provider-account fence
before queueing, and reuses that paused source job after an operator setup repair. The integration test proves
blocked resumes queue nothing, repaired resumes retain their job and scope, exactly one additional provider
collection occurs, and the customer's request completes. Full shared resume tests also pass.

The seven selected research, shared-state, source-card, chain-build and domain suites passed 145 of 145 tests,
with zero failures or skips. A further four business-reading, brief-fact, routing and sub-trade suites passed
42 of 42, with zero failures or skips. These selections overlap earlier evidence. Original source post text
remains in the research profile; the builder's fact value and excerpt omit only unfilled template lines, using
the existing content-pool placeholder rule. The regression still requires every remaining post word to come
from the owner.

The site-tools generated host bundle was rebuilt with dependency paths relative to the installation, removing
checkout-specific paths without changing the build gate. The two research strings and all seven translations
no longer promise a fixed ten-minute duration. Full local and final-head Linux gate results remain separate
from these focused passes; no customer site, develop deployment or post-merge test is accepted here.

On committed source aa4177bd9a, provider-payment-retry, post-fact-routing and wo-alt-repair-capability all
returned PASS with committed-source receipts. The latest non-test sweep passed all 63 selected gates,
including lint/typecheck/format, source language and generated bundles. Tests, Turbo tracing and boot graph
were explicitly excluded from that sweep; it is not a full build:check pass.
