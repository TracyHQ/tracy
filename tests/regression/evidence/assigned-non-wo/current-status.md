# PR 541 verification status

Status recorded on 2026-11-10 after runtime source 7716f077fb. Acceptance is incomplete. PR 541 remains draft; nothing from this line has been merged or deployed to dev.

## Actual five-business result

| Business | Distinct WO | Base site | Accepted customer site | Last evidence |
| --- | --- | --- | --- | --- |
| Urban Boxer | Yes | Created | No | Planning passed; copy interrupted, four Copy check failures. Old action completed before content. |
| Boxica | Yes | Created | No | Latest action failed; browser showed template demo content. |
| FitRepublik | Yes | Created | No | Planning passed with five skips; brand input failed and copy was interrupted. Browser showed template demo content. |
| SEVEN | Yes | Not created | No | Build refused BRIEF_NOT_READY. Recovery stored 100 images and 14 videos; research was cancelled after repeat OOMs, without publishing that partial snapshot. |
| Embody Fitness | Yes | Created | No | Content preparation failed during database/DNS interruption; browser navigation timed out. |

Totals: five businesses, five distinct WO records, four created bases, zero accepted customer handovers and zero completed dev E2E runs. These are not five finished sites. JA Boxing was explicitly selected because it is the only template enabled for this chain; the recommender classified two businesses differently.

## Recorded model measurements

| Business / step | Elapsed | Recorded cost in USD | Limitation |
| --- | --- | --- | --- |
| Urban / planner | 10m17s | 0.092109336 | Passed plan checker; this is only the planner. |
| Urban / writer | 20m32s | About 0.0623 | Interrupted; one answered call out of three, four Copy check failures. |
| FitRepublik / planner | 18m16s | About 0.0740 | Completed with five checker skips; not a site acceptance result. |

No final billed total is claimed. Interrupted calls and provider balance changes do not reconcile to complete per-site ledgers. Other step costs and final site durations are unavailable.

## Verified changes

Four assigned non-WO issues (#536, #307, #392, #316) have fixes and targeted regression evidence in this one PR. The pipeline integrates existing WO reliability changes, the durable content-action wait, retry clocks, verified full-backup recovery, startup DB recovery, transient media retries and bounded native image measurement. Latest develop 949fc1ef23 was merged cleanly.

Fresh selected results include 64 non-test gates, four map browser cases, 62 PostgreSQL media/research cases, 46 startup cases and 13 image/crop cases. Other focused suite totals overlap and must not be added to these as unique coverage. The native measurement mechanism receipt passed on 7716f077fb; its bounded synthetic benchmark reduced peak RSS, but the real stand still OOMed afterward.

## Remaining acceptance limits

- Full tests/Turbo tracing did not pass. The latest incoming business-reading suite failed its database migration with SQLSTATE 53100 before assertions.
- The shared local Docker VM has 8 GB RAM and a nearly full 58.4 GB disk. Repeat owned-web OOMs persist under a 2 GB cap even with a 768 MB heap and serial native measurement. No borrowed service was stopped or global cleanup performed.
- Existing DeepSeek Flash passed the actual image-reading preflight. Available configuration cannot provide the required independent picture looker, independent brand reviewer or image drawer. No alias or false capability metadata was used.
- Full native image acceptance, actual broken-site backup restore, final content checks, desktop/mobile review and owner follow-up tasks remain unverified. Page repairs stay serial to protect the site-wide Undo boundary, differing from the artifact's three-page concurrency.
- The publication scan still has 107 baseline blockers at the previously recorded scan source. No clean publication verdict is claimed.

The repeat research was cancelled through the normal authenticated API. Owned web and DSH were restored; the local web at the owned stand's port 36980 reports runtime commit 7716f077fb. Its complete earlier image plus exact committed source deltas is a derived runtime, not a clean full native build. Detailed chronology, receipts and logs are alongside this report.
