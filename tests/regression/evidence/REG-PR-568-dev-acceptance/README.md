# WO browser acceptance follow-up

Observed on the existing authenticated dev web surface; no dev host or SSH access was used. Full-site acceptance remains incomplete at this checkpoint.

## Deployed revision

The browser build endpoint reported `06f4ffa32145bd8fe353eddb68ea1b0ab7a8268a`, built at 2026-11-11T17:57:57Z. PR #568 changes were not deployed during these observations.

## Nightjar: failed acceptance

The independent WO chain ran for 15.86 minutes with $0.3783 of recorded chain spend. Research took 177.756 seconds and brief creation took 124.732 seconds; those durations are outside the chain total. The initial write completed. The final check or repair verification failed, and the action ended with `QA_NEEDS_REVIEW`.

| Chain step | Minutes | Recorded USD | Result |
| --- | ---: | ---: | --- |
| Base site | 0.82 | 0 | Done |
| Kit | 0.03 | 0 | Done |
| Brand | 8.01 | 0.0527 | Done |
| Plan | 9.34 | 0.0876 | Done |
| Pictures | 4.37 | 0.1767 | Done |
| Copy | 6.04 | 0.0613 | Done |
| Write/check/repair | 0.43 | 0 | Failed |

Brand/plan and pictures/copy ran in parallel; step durations must not be added to estimate elapsed time. Zero recorded write spend does not establish the number or cause of repair attempts.

Desktop and phone screenshots were opened and visually inspected after scrolling and waiting for lazy images. The site still showed the demo Three Broomsticks introduction, Hogsmeade address, opening hours and Pokey McKing chef. Its hero background was missing. The footer contained the researched business phone and some real coffee copy, so this was a partial write. After loading, there were no broken visible HTML image elements; that does not cover the missing CSS hero background. One stylesheet request returned 404.

### Reproduced template gap

The unchanged released Diner 1.0.8 content map assigns published modules 95 and 104 to Home. Their fields exist in `storedFields`, but the kit Home blocks omit them. The planner projection excludes `storedFields`. A replay keeping every Home kit block with no owners did not report the demo slots `block-95.13`, `block-95.14` or `block-104.1` through `unownedSlots`. The exact demo samples match the observed leftovers.

This establishes why the initial writer and closing ladder miss these blocks. It does not establish why repair failed: a replayed visible `demo-words` fault for Home is selected for repair normally. Historical first/final check reports and repair reports were already disposed and cannot be recovered from the existing browser endpoints. New bounded structural retention in this PR addresses future diagnosis only.

A fresh local Diner 1.0.9 candidate includes both missing blocks at desktop and phone widths. It remains unapproved due to outstanding coverage and visual review holds. No released artifact was modified or candidate silently selected.

## BXR London: first attempt interrupted, retry failed

A second independent WO uses the published JA Boxing Joomla 1.0.11 kit. Official business website and linked Instagram were researched. Research completed on its first attempt in 122.710 seconds with 258 saved items; the effective media view contained 242 photos and two videos. Source-photo screenshots were visually inspected; this is not a claim that every collected item was reviewed.

Brief generation took 131.967 seconds. All five brief sections were read, captured, marked reviewed and approved in the actual browser. The build was accepted at 2026-11-11T18:17:07.021Z. The chain began at 18:17:30.563Z; brand finished in 1.68 minutes with $0.0462 recorded. Planning took 11.68 minutes and $0.1192, exhausted its fix rounds with an R10b missing link decision on shared block 171 / link 171.6, and continued with its best version. Copy and pictures started together at 18:29:13.776Z. A separate develop deployment replaced the web build with `2fe9587367a85d38818d54ce295d073e0f8c6d54` and interrupted the chain at 18:33:45.275Z. The interrupted chain measured 16.25 minutes with a known subtotal of $0.1654; unfinished copy and picture charges are unknown. It never reached write or repair.

After the rollout completed, the supported build API accepted a retry at 18:36:18.379Z. The retry retains the original approved brief and existing site. It reruns brand and plan rather than claiming to resume completed model work. A private observer receipt failed after the first request was accepted; repeating exactly the persisted idempotency key recovered the same action and acceptance timestamp, without creating another action. The frontend Try again dispatch correction remains undeployed, so this backend retry is a disclosed browser API intervention, not a successful test of that button.

The retry ended at write with `QA_NEEDS_REVIEW`, updated 2026-11-11T19:10:34.914Z. Its chain took 34.12 minutes, including 14.65 minutes in write/check/repair. Kit took 0.03 minutes; brand 2.03 minutes / $0.0442; plan 10.87 minutes / $0.1069; copy 8.37 minutes / $0.0852; pictures 8.55 minutes / $0.6706. The recorded write charge is unknown, so total spend is unknown with a known subtotal of $0.9069. No completed or accepted BXR site is claimed.

### Actual repair trace

The native session URL was opened in a dedicated browser tab, returned HTTP 200 and showed the actual conversation and site:

https://cowork.tracy.site/bxr-london.tracy.site/s/session-cd7bbfac-93da-476b-9835-8bd5bb026b1b

Terminal native evidence deduplicates four sessions, six started and completed turns, 88 steps, 398.748 seconds in model calls and 73.926 seconds in tools. Nine distinct failed tool calls occurred:

| Code | Calls | Observed cause |
| --- | ---: | --- |
| CONFIRM_FIRST | 3 | Two generic module 161 background writes and one shared header/footer colour change required customer confirmation. |
| INSPECT_FIRST | 2 | Contract apply had no valid inspection in that conversation. |
| SLOT_IMAGE_INVALID | 1 | Article 15.5 required aspect 2.3311; the supplied image was 1.0244, beyond tolerance 0.02. |
| REVISION_STALE | 1 | Content had changed since the supplied revision. |
| SLOT_NOT_CONTENT | 1 | Article 16.7 was given markup or control characters. |
| AGENT_DEMO_NOT_GRANTED | 1 | The repair session attempted a demo tool outside its grant. |

The shared colour change originated from real unreadable-text findings on the privacy page, with observed contact-link contrast ratios 4.28, 3.10 and 3.48. This was not an arbitrary style change. The background refusal and the article image geometry refusal are separate targets and causes. Initial native `BASELINE_PENDING` was an isolated session authorization read without a populated gateway workspace baseline; the server repair establishes that baseline itself. It is not evidence of a WO readiness deadlock.

The new step 9b hint resolves an exact image only when page, kit and native map identify one target. It uses the native receiver's fit and precise contract write route, while preserving fresh revision checks, consent refusals and frames that cannot hide. Module 161.2 has native aspect 1.5 and minimum width 2160, distinct from its kit presentation aspect 2.813. That artifact discrepancy is verified; the missing initial write report prevents claiming it caused the original background residue. All 115 focused step 9 tests passed without skips, and the formal picture contract regression passed on `ecb74aa5d3`. The later controlled real-model picture replay passed; see [the scoped receipt](controlled-picture-repair.md). It is not full-site acceptance.

## Local verification checkpoint

Seven formal mechanism regressions passed on branch commit `98ac25f147811a578c56ce8b649751ee720f175e`. After merging current develop, a focused PostgreSQL and structural diagnostic run passed 78 tests with zero failures or skips on `0d250c6b171ea4e84302b4a87c05e6d853d7a125`. Full gates are being rerun with bounded concurrency. The full-tree publication scan returned 108 blocking findings, none in files changed by this PR; publication cleanliness is not claimed. Raw finding values are not included here.

## Planner missing-child-link regression

The published Boxing 1.0.11 social block contains the named missing link. A separate synthetic plan, built from the passing full checker fixture, reproduced R10b when its parent social list was explicitly hidden but that child hide was omitted. Expanding only hides already implied by the parent decision restored all checkable rules. Visible missing links still fail. The actual BXR plan is not available through the browser, so this does not prove that its missing link was in a hidden list.

The production normalization now uses the writer's shared pure row selection to close only these proven missing hides, including whole-plan and fix-round answers. No URL or visible hide decision is invented, and the checker remains strict. Focused validation passed 108 tests without skips, and the formal planner regression passed on `4b0b84e726`. The full-tree gate run started on an earlier head and observed a transient import violation during implementation; the final module-graph retest passed after the pure helper moved to `lib/`.

## Current develop integration

Develop `5737e84dae68e3ac8cc05aeb7e1c156685f708ee` (PR #569) was merged into this branch as `caa9bbe6cf`. That includes the existing native article unpublish, hide-capability and created-page body fixes. After integration, 115 step 9 tests passed without skips. A separate 84-test writer integration selection passed without skips, covering article drops, closing, hides, created legal pages, refusals, text fallback and repair turns. These selections overlap and are not 199 unique tests.

The picture and planner formal regressions passed again on `59359d1abd`. Read-only lint and all 14 typechecks passed. Formatting initially rejected two new regression case arrays; those were formatted, and the whole format check then passed. The selected self-contained, plugin identity, plugin contracts, language, vocabulary and test-quality gates passed. This is targeted verification, not a full `build:check` pass. The earlier full run was stopped after Docker storage exhaustion caused MariaDB initialization failures; its incomplete result remains recorded.

The final BXR desktop home and phone boxing-class screenshots were also opened. Their researched pictures are not always appropriate for their captions: a shower is shown for a boxing class, and a resort photo appears under the gym gallery. Successful image loading does not establish semantic quality. A previously flagged footer logo decoded successfully after lazy loading and returned HTTP 200; it is not a confirmed broken image.

## WordPress full-flow failure and fact-budget fix

Comptoir 102 was researched from its own website and linked social profile, with source pictures opened and reviewed. The first brief withheld its real name because another social display name disagreed. A new unbuilt card reused the research snapshot; the normal name-confirmation control and explicit preapproval fact switch confirmed the official name. All five brief sections were read and approved. The published JA Diner WordPress 1.0.4 build started only after develop `5737e84dae68` answered consistently after deployment.

The accepted build failed before writing content: the QA corpus contained 498,344 characters against a 400,000 limit, with 596 research segments. That primary refusal repeated six times. Nine other failed calls cascaded from the missing baseline or unavailable readiness, including the refused question tool. The native turn took 250.171 seconds with 33 steps, 162.064 seconds of model time, 77.536 seconds of tools and 23,819 decode tokens. The action ended after 395.068 seconds with `AGENT_DEMO_ENDED_UNCHECKED`, zero QA rounds, zero repairs and zero placed pictures. Settlement followed native completion by 133.072 seconds; the temporary building state was delayed settlement, not a permanently stuck action.

The real build session was opened and verified:

https://cowork.tracy.site/comptoir-102.tracy.site/s/wo-demo-edd227e2-c080-45f3-bb14-a3a8628a1401

`briefOf` had serialized the frozen photo catalogue into business prose. Its identifiers, hashes, dimensions and detection labels consumed 162,409 characters in the actual revision. The fix excludes this catalogue only from agent QA fact/prose text. Original assets, frozen research and testimonials remain unchanged, as does the complete-evidence limit. Applying that exact removal to the observed corpus predicts 335,935 characters with the same 596 research segments. This is an exact size-delta calculation, not a new deployed full-corpus replay: closed-action and owner read endpoints do not expose the full frozen raw research.

Twelve focused fact-budget/withheld tests passed without skips. The tests retain late research and review evidence, reject metadata-only invented facts, preserve the frozen input and continue rejecting genuinely oversized content. Its formal regression passed on `939d84723b`.

Bu Qtair was a separate researched case. The site source and collected pictures were opened and reviewed, but its brief had insufficient qualifying usable photos, labelled share and offering coverage. Its attempted build correctly failed readiness in 16.488 seconds before provisioning or a native model turn. No quality gate was overridden and no accepted site is claimed. The next independent OneLife case has passed its explicit brief readiness checks; full browser acceptance is still pending.

## Readability target fix and controlled replay limits

The target fidelity change preserves complete measured paths, clean words and ownership through the checker and repair. It merges repeated width/theme observations only for the same verified element, keeps equal email nodes separate and rejects ambiguous, changed or oversized identities. A new 135-test step 9/fact-budget selection passed without failures or skips. Separate real-browser host tests passed 12/12, and native consent cases passed 4/4. The new formal target regression passed on `2a39089b0f`.

The subsequent real hero attempt did not pass readability acceptance. It delivered the correct target, but encountered native browser loading failures and a separate harness write error. Its controlled side effect was preserved in a backup and removed through normal full-site restore. See [the complete negative receipt](controlled-readability-attempt.md). No full WO or complete-site success is claimed from these local fixtures.

## OneLife baseline deadline failure and existing pipeline integration

OneLife D3 completed research in 164.722 seconds and brief creation in 128.641 seconds. Its explicit readiness checks passed with 100 usable photos, 100 of 103 labelled photos and seven of nine offerings covered. Actual collected photo contact sheets and all five brief sections were read before approval. The normal UI started one published JA Diner WordPress 1.0.4 build on develop `5737e84dae68` with approved revision `834ad4e1-b87d-44bb-8244-bb44a89149f6`.

The build action `c0121ce8-3dc1-4445-9722-9db577265573` failed with `QA_NEEDS_REVIEW` after 772.748 seconds. The native turn ran for 765.181 seconds, with 27 steps, 93.432 seconds of model time, 649.242 seconds of tools and 8,650 decode tokens. The initial QA baseline never completed; no content was written, and QA recorded zero rounds and zero repairs. The exact baseline attempt count is not exposed by the owner serializer. The native turn ended naturally 33.248 seconds after the action failed.

The first causal QA boundary was `DEMO_QA_DEADLINE`; the final wait returned `DEMO_BASELINE_UNAVAILABLE`. Two earlier calls returned `COWORK_WEB_UNREACHABLE`, including a 209.652-second timeout. Later action-closed reads are consequences. This run did not hit the fact-evidence size limit. Public desktop 1440 and phone 390 screenshots were opened and showed untouched Harry / Three Broomsticks / Hogsmeade template content. The site is not accepted.

- Site: https://one-life.tracy.site/
- Ops: https://cowork.tracy.site/ops/wo?open=adb38fd8-6738-4488-ac77-2f30e323487a
- Actual session: https://cowork.tracy.site/one-life.tracy.site/s/wo-demo-c0121ce8-3dc1-4445-9722-9db577265573

Source inspection confirms a deadline contract defect. Initial capture has no baseline yet, so `woDemoQa` allocates 45 seconds for pages plus 90 seconds for inventory routes, and waits 175 seconds. The host hard timer included only pages plus a 15-second margin, aborting after 60 seconds and discarding the baseline. The separately allocated route time never reached that timer. This explains a reproduced premature QA boundary; it does not identify which actual page or host queue consumed the available time.

This branch integrates the existing scoped deadline implementation from PR #296, head `145792df18fabc003d929839294c4e314bd879c4`. Its host source is reused unchanged; tests additionally cover the actual initial-capture payload. The deadline is now 150 seconds, below the unchanged 175-second web and 180-second native transports. Individual phase budgets, caps, queue accounting and caller cancellation remain intact; partial baselines still cannot pass. Eight focused deadline tests and 113 adjacent host tests passed without skips. These are mechanism tests, not a successful dev retry.

The 209.652-second wait is consistent with the native loop checking its 30-second waiting window only after an awaited status request, which itself can reach a 180-second transport timeout. Requests for the same action are serialized by the existing PostgreSQL advisory lock. The trace does not expose exact host queue occupancy, so no host queue duration is invented.
