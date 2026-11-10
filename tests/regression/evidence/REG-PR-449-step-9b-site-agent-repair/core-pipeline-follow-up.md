# WO core follow-up — 2026-11-10

This change covers native Step 9 repair settlement, repeated page reads, and the core portions of David's own-site issues #508 and #509. It does not change layout, styles or customer-facing strings.

## Causes reproduced and fixes

| Failure | Cause | Change | Verification |
|---|---|---|---|
| Repair continues after Stop while the old writer remains active | Stop acknowledgement was treated as sufficient without a terminal native turn record | Block later page/part/retry writers, judgement and Undo while the writer remains open; retain incomplete status on refused Stop or unreadable records | Refused Stop, acknowledged but unsettled Stop, missing cancellation support and failed post-Stop record reads |
| Native repair gets too little execution time | Comment quota, numbering and prompt acceptance consumed its turn deadline | Start the native execution deadline after prompt acceptance; retain the outer step deadline and include waiting in duration | Quota wait followed by a turn completing within its execution window |
| Site checks repeat the same HTML fetch | Independent groups fetched identical paths separately | Share exact-path promises within one check, including failures; create a new cache for every check | Shared reads, rejected reads and changed HTML after a write |
| Own-site JA Boxing bypasses the enabled chain (#508) | Own-site actions were excluded from the mode switch and always used client-send | Apply the existing template switch to new own-site actions; follow server actions without sending another chat brief | Real PostgreSQL action/runner tests and browser transport tests |
| Content writer refuses to proceed without reviews (#509) | Prompt and plan guide required at least one review even when frozen research contained none | Require verbatim reviews only when usable review evidence exists; otherwise explicitly continue from available facts | Empty evidence and preserved collected-review requirements |
| Own-site cannot explicitly retry a failed build (#509) | Build presses replayed the original action without a Retry identity | Accept retryOf through the existing action acceptance path; preserve revision, site/build, template and session; follow the replacement after completion | Real HTTP doors and PostgreSQL, idempotent replay and completed replacement |

The Retry door is POST /api/sites/from-business/:id/build with {"retryOf":"<failed-action-id>"}. Supplying a new selection is refused. The backend validates ownership; the shared acceptance path validates terminal failure and freezes the original build. This patch does not add a Retry control to the UI.

## Issue boundaries

- #508: the selection and transport mechanism is fixed. Full chain completion/quality acceptance still depends on the chain lifecycle work already open in #522. The existing demo runner can report completion after provision rather than after the actual chain verdict; this change does not duplicate that implementation.
- #509: empty-review content requirements and backend Retry are fixed. The customer-facing completion/retry presentation is outside this core change; the issue must remain open until those parts and the complete flow are accepted.
- #510: the historical failed revision was not available in the evidence reviewed. Current code intentionally uses a neutral identity when the name fact is held off the site. Recent local revisions had proper business-name facts. This explains a possible mechanism but does not prove why the reported run used it; no speculative name-hold bypass was added and this issue remains unresolved.
- David's sync issues #536/#307, import issue #392 and button contrast #316 are outside WO pipeline core and were not changed.

## Verification and measurement

The expanded focused suite passed 508 tests, with no skips, using a dedicated local PostgreSQL container. Later checks passed the 80 prompt/handoff/transport tests and both own-site HTTP door scenarios, including the completed replacement check. The final regression result files identify the branch commit they ran against. These are mechanism/integration tests with deterministic model and service doubles, not a fresh five-business model campaign.

A read-only HTTP measurement used the actual local Joomla CMS, the real reachable-pages and icon-glyphs groups, and the same 27 unique paths:

| Measurement | Before | After |
|---|---:|---:|
| HTTP reads | 30 | 27 |
| Unique paths | 27 | 27 |
| Elapsed milliseconds | 37,969 | 17,172 |
| Reachable-page findings | 12 | 12 |
| Overall verdict | red | red |

The fix eliminated three duplicate requests (10% fewer reads). This was one ordered sample, susceptible to cache and load effects; the duration is not a full-pipeline speed claim. Both runs preserved the existing site failures. An earlier probe reached the sign-in page and was rejected as invalid evidence.

## Local surface and image inspection

The borrowed QA web surface on port 36080 is not running this patch: its source revision is blank and its repair modules are mounted from an older worktree. Its public site route answered 502 during this session. The direct Joomla CMS on port 53000 answered 200 with the JA Boxing template title.

The current direct CMS Home was captured at 1440 and 390 pixels, and both images were opened and inspected. The Boxing logo, boxer image and “NO1 BOXING STUDIO since 2008” demo heading remain visible. These are observations of the borrowed old stand, not acceptance of this branch. The ordinary browser navigation timed out; the diagnostic captures blocked scripts and external requests, so they cannot prove interactive behavior or final font rendering. No customer site was changed for this inspection.

Local model configuration has not demonstrated a working independent image-review and image-generation path for this branch. Existing keys were reused for available probes; no replacement provider or credentials were invented. A fresh complete WO build and independent image review remain required before declaring product acceptance.

## Gate status and handoff

The lint gate passed all three stages after worktree dependency setup. Documentation links, frontmatter, language checks, plugin contracts and boot graph passed. The Add site client was rebuilt from this worktree and committed with its source.

The full build:check was attempted. Initial missing-submodule/dependency failures were repaired and their gates rerun. Broader checks found unrelated browser/network timeouts, a business-reading ledger-count mismatch and missing worktree plugin artifacts. The base commit's public-tree scan reported 105 blocking findings; no credentials or matched secret values are included here. These failures were not hidden by weakening gates or changing allow lists. This branch is not ready to merge while full gates and complete-flow acceptance remain unverified.

Overlapping work was checked before implementation: #296 owns broader agent-demo performance, #496 owns bench cancellation/image handover and #522 owns WO UI and chain lifecycle. Deploy tracy-web and the rebuilt Add site client together after the complete change passes acceptance.
