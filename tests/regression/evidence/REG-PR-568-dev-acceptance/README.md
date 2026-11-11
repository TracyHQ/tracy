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

The new step 9b hint resolves an exact image only when page, kit and native map identify one target. It uses the native receiver's fit and precise contract write route, while preserving fresh revision checks, consent refusals and frames that cannot hide. Module 161.2 has native aspect 1.5 and minimum width 2160, distinct from its kit presentation aspect 2.813. That artifact discrepancy is verified; the missing initial write report prevents claiming it caused the original background residue. All 115 focused step 9 tests passed without skips, and the formal picture contract regression passed on `ecb74aa5d3`. Actual model replay of the new hint remains pending at this checkpoint.

## Local verification checkpoint

Seven formal mechanism regressions passed on branch commit `98ac25f147811a578c56ce8b649751ee720f175e`. After merging current develop, a focused PostgreSQL and structural diagnostic run passed 78 tests with zero failures or skips on `0d250c6b171ea4e84302b4a87c05e6d853d7a125`. Full gates are being rerun with bounded concurrency. The full-tree publication scan returned 108 blocking findings, none in files changed by this PR; publication cleanliness is not claimed. Raw finding values are not included here.

## Planner missing-child-link regression

The published Boxing 1.0.11 social block contains the named missing link. A separate synthetic plan, built from the passing full checker fixture, reproduced R10b when its parent social list was explicitly hidden but that child hide was omitted. Expanding only hides already implied by the parent decision restored all checkable rules. Visible missing links still fail. The actual BXR plan is not available through the browser, so this does not prove that its missing link was in a hidden list.

The production normalization now uses the writer's shared pure row selection to close only these proven missing hides, including whole-plan and fix-round answers. No URL or visible hide decision is invented, and the checker remains strict. Focused validation passed 108 tests without skips, and the formal planner regression passed on `4b0b84e726`. The full-tree gate run started on an earlier head and observed a transient import violation during implementation; the final module-graph retest passed after the pure helper moved to `lib/`.
