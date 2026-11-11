# WO repair diagnostic, 11 November 2026

Status at 09:06 UTC: the local Diner chain is still applying. This is diagnostic evidence, not local or dev acceptance. No deployment or merge was performed.

## Observed run

The frozen runtime serves source `a75d745079183ab7df69f965293a89e4b3819dc2`. Retry action `7ea0fda2-88aa-4b2a-acc1-beffa905e23c` uses revision `45352acd-93cf-473b-8eaf-5872864d8a28`; the business is Arabian Tea House and the template is Diner Joomla 6, version 1.0.8. This runtime does not yet include the subsequent planner brief view, post routing or alt capability changes.

| Preparation step | Duration | Reported cost, USD | Bench calls |
| --- | ---: | ---: | ---: |
| Kit | 1.753 seconds | 0 | 0 |
| Brand | 4.20 minutes | 0.0499 | 29 |
| Plan | 8.87 minutes | 0.1442 | 9 |
| Copy | 5.21 minutes | 0.0903 | 4 |
| Pictures | 6.56 minutes | 1.0922 | 2 |

Preparation took 927.277 seconds. Brand and plan overlapped, then copy and pictures overlapped; the durations must not be added as wall time. Exact combined bench cost was USD 1.376560353, excluding earlier research, reused provisioning and unreported native cost. Native token records lack `costUsd`, so native cost is unknown.

The setup opening seal completed successfully. The script checkpoint committed 23 files, and the first native opening seal matched that exact checkpoint. Native started with `unsealed_start:false` and `concurrent:false`. The first native commit contained one file; later successful CMS database updates produced zero file changes. A zero file count does not prove a repair had no effect.

## Confirmed reasons for slow repair and refusals

1. The contact picture alt fault supplied the correct `/index.php/contact` route. Native attempted to write an alt sentence into image-path slot `contact-1.16`; the contract rejected it with `SLOT_IMAGE_INVALID`. The published content map declares this as `contact-1`, column `image`, with no independent alt slot.
2. The rice-plate alt similarly targeted image slot `module-97.0` as text. It failed with `CONTRACT_RULE/not_text`, then a later repair failed with `SLOT_UNKNOWN`. The actual map stores its image in nested module parameters and declares no separate editable alt carrier.
3. Repair fallback metadata declared these unresolved targets writable. The new capability guard excludes these exact mapped unsupported targets before session creation, records `unsupported-alt-target`, and preserves their blocking QA failures. It does not create a write door or make these sites acceptable.
4. Other turns first supplied an unknown parameter or exceeded slot lengths, then successfully changed CMS content. The first native turn also changed the header logo and social links while its requested task was a contact picture alt. The pipeline later undid that turn. The exact checker finding that caused Undo is not yet available because the active pass writes its final report only when it returns.
5. Six completed native turns consumed 699.055 seconds, before subsequent turns and excluding checks, seals and Undo. The first turn had 35 model steps and 49 tool calls, with recorded model time 176.567 seconds and tool time 75.486 seconds. This is real execution, not evidence of a stalled queue.
6. Chain builds deliberately replace the generic 10/12 minute repair windows with the remaining two-hour chain deadline plus the 15 minute handover window. The long repair stage is consistent with that existing product contract. This change preserves those deadlines.

The planner retry took 526.100 seconds versus 528.716 seconds previously. Provider calls accounted for 519.971 seconds; measured inter-call gaps were 2.047 seconds. There is no demonstrated planner speedup. Omitting unused asset metadata from the planner's model input reduces payload, but a live comparison of the new brief view remains outstanding.

## Visual and resource limits

Desktop and mobile screenshots were captured and opened on actual rendered routes. The generated hero and new Emirati copy appeared, and later CMS repairs changed the introduction. The header returned to the JA Template logo after the automatic Undo. The contact heading still displayed Ja Diner, and contact/reservation retained template subtitles. These observations fail acceptance.

The observed web cgroup peak was 820,518,912 bytes. The native cgroup peak had reached 596,213,760 bytes by 09:04 UTC. Sampled counters showed zero OOM and zero OOM kills. These observations do not establish that all workloads avoid OOM. Docker disk remained constrained, so no duplicate full gate run was started alongside the paid build.

## Validation of the subsequent source changes

- Integrated planner, picture and brief pure suites: 237 passed, zero failures or skips, across 24 files.
- Picture CLI on a real scratch database: three passed, zero failures or skips. Its expected checker version is now `/4`.
- Repair and capability behavioral suites: 89 passed, zero failures or skips, including the full `runStepNine` wiring and failed handover preservation.
- The actual published Diner 1.0.8 kit and content map were probed locally: both affected image slots resolve to the explicit unsupported-alt diagnostic.

Full local five-business/five-template acceptance, the final exact-source gate set, a clean final image, recovery acceptance, merge and dev E2E remain outstanding. There are zero accepted local or dev sites in this diagnostic.
