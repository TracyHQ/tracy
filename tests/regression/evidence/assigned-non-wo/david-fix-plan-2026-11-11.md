# David's Tracy issues: audit and implementation plan

Audit date: 2026-11-11. Repository: TracyHQ/tracy. Assignee: davidd-lgtm.

## Evidence and limits

Read all 13 currently open assigned issues, including their comments; fetched origin; compared relevant source on origin/develop (73b44d40d38d0c79fd793549e7bcd60d828b3585) with open PRs #541, #522 and #296. Checked merge #543 and recent develop image workflow results. This is a source and tracker audit. No customer site was changed, no runtime reproduction was performed, and no issue was closed. Successful image workflows do not prove which digest is serving dev or that an issue passes runtime acceptance. Estimates below are planning ranges for one engineer, not measured delivery commitments.

## Inventory

| Issue | Observed status | Remaining work |
| --- | --- | --- |
| #544 | Unresolved | Feed collected website content into grounded business reading and prices; measure research regressions |
| #545 | Unresolved | Enforce own-post provenance and remove surplus demo posts; prevent unsupported copy |
| #546 | Unresolved; three distinct symptoms | Trace social icon mismatch, phone-menu branding, ancestor breadcrumb/route residue |
| #547 | Confirmed missing failure mapping on develop | Carry readiness diagnostics, correct recovery action and prevent futile charged retry |
| #548 | Unresolved; generated-image provenance not yet established | Inspect manifests, enforce photo fallback ordering and truthful picture/copy pairing |
| #549 | Confirmed contradictory lead on develop | Render research plan accurately; classify provider payment failures and retry eligibility |
| #508 | Still unresolved on develop | Own-site entry still forces client-send and client-demo passes stepChain:false |
| #509 | Unresolved; partial reliability work in #541 | Truthful terminal state and actual same-site retry for both chain and legacy path |
| #510 | Unresolved; cause needs name-decision evidence | Trace nameHeld, selected name, frozen revision and label; preserve legitimate name withholding |
| #536 | Code merged in #543 | Verify deployed images and real Joomla/WordPress crossed-ID sync |
| #307 | Code merged in #543 | Verify stale-map healing without live fingerprint changes and orphan cleanup |
| #392 | Code merged in #543 | Verify real failed import and provisioning states/layout/retry |
| #316 | Code merged in #543 | Measure deployed controls, icons and focus in both modes and accepted accents |

## Existing work and ownership

- #541 remains draft and explicitly a WO source/evidence handoff. Its non-WO fixes landed separately as #543. Reuse reviewed WO reliability changes only after examining the exact delta against current develop; a three-dot diff can still display changes already landed through the isolated PR. Do not merge the draft wholesale or treat its local mechanism receipts as full runtime acceptance.
- #522 is the active WO UI/research/brief line. It changes build cards, failure rendering, research state, profile edits, brief revisions and site naming. #547/#549 and #510 must integrate with that owner rather than introduce a second model or competing screen.
- #296 is the active legacy agent-demo performance/cost line. #509 needs compatibility with its check plateau, budgets and stopping behavior. Do not duplicate its implementation.
- #484 tracks Add site step-chain wiring under Akemi; #508 is David's concrete reported failure at that boundary. Coordinate an explicit ownership handoff before implementing overlapping code. #486 tracks eventual retirement of agent-demo; keep the legacy path correct until that prerequisite is actually met.
- One accepted line of work uses one branch and PR. Keep existing active PR ownership; separate work only where it has a genuinely independent scope or must land first, with that reason stated. Do not open one competing PR per symptom.

## Sequence and exit criteria

1. Capture representative failing artifacts and identify deployed commits/digests. Independently finish acceptance of the four #543 fixes.
2. Correct blocked-build and research recovery semantics (#547, #549). These make subsequent diagnosis reliable and avoid charging for impossible retries.
3. Resolve naming and research inputs (#510, #544). Rebuild frozen revisions from verified inputs.
4. Enforce truthful posts, pictures and template output (#545, #548, #546). Capture an end-to-end run using the corrected inputs.
5. Finish entry routing and lifecycle/retry (#508, #509), reusing accepted #541 mechanisms. Wiring can be developed earlier, but enabling the route should follow a clean step-chain acceptance run.
6. Validate latest integrated branch locally, deploy through the repository's normal path, then repeat acceptance on dev and record evidence before closing issues.

## #547 — Blocked brief appears as an unexpected failure

Priority: P1. Estimate: 1–2 engineering days, including integration and mechanism tests.

Evidence: opportunity-row.ts DEMO_FAILURES has no BRIEF_NOT_READY entry. builds.js readinessRefusal already emits a structured readiness summary and different next steps. The reported action can still consume a daily build and offer an impossible retry.

Implementation:

1. Trace readinessRefusal through action creation, failure storage, list shaping and Details. Record where code, readiness checks or recovery information are discarded.
2. Add a shared structured failure representation using the existing model: code, blocked check IDs, recovery action and owner questions where relevant. Localize text from codes; do not render arbitrary backend next text as the only recovery contract.
3. For research failures such as labelled-share, show the blocking check and Research again. For missing owner answers, direct to the existing question/brief correction flow. Retry appears only when its preconditions can change successfully.
4. Reject known blocked input before reserving/consuming an accepted build allowance. Preserve transactional protection for concurrent requests; define how an accepted actual attempt is counted. Do not silently rewrite historical ledger entries.
5. Research completion must yield a fresh validated revision before a new build; it must not retry the old blocked frozen brief.

Acceptance: a brief with 1/54 photos labelled exposes the failed check, gives actionable recovery, starts no site/build worker, and consumes no accepted-build allowance. Double clicks remain safe. The same behavior works in list and Details, including after reload. Owner-answer readiness follows its own recovery. Add non-model API/model regression cases and browser checks; integrate with #522.

## #549 — Research again contradicts kept sources and retries HTTP 402

Priority: P1/P2. Estimate: 1–2 days.

Evidence: again.lead.scratch says nothing is reused; research-again.js explicitly keeps unavailable parts. Existing credentials can coexist with a source's previous HTTP_402, so availability cannot be inferred from key presence alone.

Implementation:

1. Use the server's actual run/kept plan for both explanation and execution. State that available sources are recollected and list what stays with its reason. Empty run, partial run and over-cap plans must all remain truthful.
2. Trace provider error normalization before deciding retryability. Payment/credential/configuration failure is an operator recovery; timeout, rate limit with a retry window and transient upstream failure may be retryable. Do not classify every 4xx identically.
3. Surface retry eligibility consistently in the source row, plan preview and server execution. A disabled customer button alone must not leave a chargeable server retry path.
4. Allow sources to become collectable again after provider configuration is repaired; do not permanently poison a source based on historical HTTP_402.

Acceptance: switched-off YouTube stays in the kept list with accurate lead text; TripAdvisor HTTP_402 exposes no futile seller retry; transient failure can recover; key repair restores availability; actual run matches its preview. Translate all changed copy in eight interface languages and rebuild both locale and consuming plugin bundles.

## #510 — Site uses a generic trade/country name

Priority: P1. Estimate: 1–2 days; final correction depends on artifact inspection.

Evidence: own-site state shows bestKnownName, but build labels derive from siteNameOf(revision.brief). held-name.mjs intentionally returns a neutral title when a name fact has onSite:false. Replacing this with bestKnownName everywhere would bypass an existing owner/conflict decision.

Implementation:

1. Recover the original opportunity, shared sources, chosen/held name fact and reasons, frozen research snapshot, revision business.name, home SEO title, action label and final site label.
2. Determine whether the name was incorrectly withheld, the revision was frozen before name resolution, an owner correction was lost, or the expected neutral result was shown without explanation. Treat these as alternatives until evidence chooses one.
3. Establish precedence in the existing identity helpers: explicit accepted owner choice/site label; otherwise resolved usable business identity; source domain fallback when no identity exists, subject to the name-withholding policy. Handle genuinely held names through existing owner questions; never print a name explicitly withheld by the owner or a verified conflict.
4. Freeze the resolved identity once for a build and use it consistently in brief/chat/site display/key derivation. Preserve failed-build labels and same-site retry identity. Existing sites must not be silently renamed.
5. Integrate #522/#519 site-name edits rather than add a second naming form or naming helper.

Acceptance matrix: agreed real name; name resolved late in research; no name/domain fallback; conflicting marks; explicit owner override; explicit withheld name; non-ASCII name; label collision; retry after a later profile change. Every accepted case has consistent brief/name/key; held-name cases stay protected and explain recovery.

## #544 — A complete website crawl produces an empty business reading

Priority: P1, upstream of most content issues. Estimate: 3–5 days.

Evidence: readBusiness accepts bio/posts/reviews; readingSourcesOf limits sources to 40 and each source to 1500 characters. A complete 82-page crawl does not enter this reading as page content. Exact reason the model's second output was empty remains unknown.

Implementation:

1. Preserve brief 2 and 3, source snapshots and crawl page text. Inspect model output and quote rejection reasons without logging credentials or private source content into public artifacts. Compare input coverage, not just output counts.
2. Trace where page text is stored, then supply bounded, deduplicated owner-page passages with stable references and URLs to the existing reading contract. Prioritize classes/services, coaches/team, about and price/membership pages; balance them with posts and reviews so one source type cannot crowd the others out.
3. Include page text, source allocation and prompt version in the existing input hash/version. Extend quote checking and allowed source kinds together; each accepted service/person/price must point to actual collected evidence.
4. Extend factual price extraction beyond food trades with amount, currency, period/unit, qualifiers and source quote. Reuse an existing compatible price model where possible. Distinguish not sought, unavailable source, no evidence found and actual evidence collected.
5. Add a coverage comparison after re-reading: a sudden empty result despite retained owner evidence triggers one bounded re-read or an explicit incomplete state. Do not merge stale facts blindly or promise old counts when the business has changed. Reuse only evidence revalidated against the current source snapshot.
6. Confirm profile projection, brief formation and planner see the new evidence. Keep Website Opportunities library changes independent of Tracy-specific host services.

Acceptance: an 82-page-like fixture containing real supported classes/coaches/prices produces those facts with correct refs, independent of review volume. A removed or expired offer is not resurrected. Test truncation, empty model JSON, quote mismatch, no configured model, budget cap and cancelled run. Real Portland re-research must account for each previously supported missing service/person and distinguish unsupported old data. Record research time/cost and missing coverage honestly.

## #545 — Surplus demo posts are invented in the business's voice

Priority: P1, content trust. Estimate: 2–4 days.

Implementation:

1. Read the original plan/copy/write report. Map all six articles to owner posts or template demo records; do not assume the planner prompt alone caused the failure.
2. Constrain own-post rows to explicit owner-post references. Generic trade knowledge must not satisfy an own-post role. Enforce uniqueness and capacity; make surplus demo article IDs explicit unpublish/hide operations.
3. Update plan checks, writer inputs and copy checks to reject unsourced own-post material even when the model follows the old preference to rewrite rather than hide. Retain neutral explanatory content only in roles that permit it.
4. Apply removal through existing CMS write doors and verify article state and category/menu output. No demo article may remain discoverable through another category or direct published route.
5. Trace the separate equipment claim. Make attributable assertions carry their supporting fact and reject unsupported expansions; reserve semantic review for claims code cannot reliably decide from references alone.

Acceptance: two owner posts plus six demo rows yields exactly the two permitted owner posts and no invented extras. Zero/one-post fixtures follow the step-chain policy without importing the legacy synthetic-post rule. Generic article titles and slugs do not survive published output. Exercise the CMS paths this shared mechanism affects, and visually read the final copy.

## #548 — Drawn pictures look like documentary photos of the business

Priority: P1, content trust. Estimate: 3–5 days.

Implementation:

1. Establish actual provenance first: read plan wishes, site-pictures manifest, selected asset IDs, drawing receipts, fallback traces and final write mapping. Re-encoded file hashes and appearance alone cannot prove that an image was generated.
2. Explain rejection of each relevant owner photo: bytes, dimensions, crop, sharpness, portrait classification, lettering/watermark or subject mismatch. The mural-lettering explanation is a hypothesis. If legitimate in-scene signage requires a policy change, propose it explicitly and adjust photo labels/checks together; retain current watermark protection meanwhile.
3. Enforce existing fallback ordering in code. any-real does not enter the drawer. Gallery exhausts permitted alternate photos, reuse and any-photo options before the ADR-permitted drawing fallback. No person frame is drawn.
4. Add an explicit semantic relationship between picture provenance and documentary claims: a drawing cannot fulfill a promise of the actual premises, team, equipment or event. Use a matching real photo; otherwise revise a permitted illustration role/copy or return the mismatch to the planner. A caption or alt tag alone does not repair a false section heading.
5. Because copy and pictures may run independently, place the relationship check where both final artifacts are available, before final acceptance. Preserve provenance through cropping, encoding, import and write reports.

Acceptance: with a usable owner-photo set, documentary gallery frames reference owner assets. any-real and person fixtures never call drawing. Forced fallback produces an explicit trace and cannot pass a mismatched 'our gym in photos' claim. Test a legitimate illustration case, insufficient photos, available alternate crops and final page/alt pairing. Inspect Home/About/Contact against actual source photos at 1440 and 390 pixels.

## #546 — Wrong social icon, duplicate phone logos, demo breadcrumbs

Priority: P1/P2. Estimate: 3–5 days across the three symptoms.

Social: compare planned network/fact with actual slot/icon mechanism and write report. Derive each supported network's icon through the existing kit mechanism, then check URL/network/icon after writing. A YouTube link must never retain Twitter's class. Unsupported icon replacement produces a clear finding or drops the unsupported row through the allowed plan path.

Phone branding: inspect the actual JA Boxing offcanvas DOM, light/dark image visibility and computed style. menuCssFor currently targets every brand img; confirm whether content:url changes intrinsic sizing/visibility and exposes both images. Prefer template profile small-logo settings; otherwise scope the existing fallback to the active template logo and preserve alternate-state behavior. Do not add a global hide rule that breaks every T3/T4 template. Verify the business name without drawing a new navigation layout.

Breadcrumbs/routes: inspect Joomla parent menu records, aliases, titles, paths and linked articles. Current route stage renames kept-page aliases. Define intended customer hierarchy from the plan and kit, then update only owned demo ancestors using supported plugin doors. Track ancestry changes in route reports and retry/restore behavior. If the plugin cannot safely move/rename a parent, record the missing capability and use a separate plugin-home change before enabling it. Clarify ADR coverage rather than citing decision 31 as an existing breadcrumb rule.

Acceptance: YouTube URL/label/icon agree on every footer; one correct active logo and business name at 390x844 in both modes; News breadcrumb and published address have customer-appropriate hierarchy and no Pages/J! Content/Category Blog residue. All kept links answer, rerun restores/reapplies routes idempotently, sibling alias collisions are safe, and unrelated menus/alternate logo mode remain correct.

## #508 — Own-site entry never chooses the enabled chain

Priority: P1. Estimate: 2–3 days, dependent on ownership coordination and clean chain acceptance.

Evidence: own-site.js still inserts AGENT_DEMO/CLIENT_DEMO; client-demo.js creates with stepChain:false. PR #541's current own-site delta concerns research recovery, not removal of these routing conditions.

Implementation:

1. Agree with #484/#522 owners where workflow is selected; use the existing step-chain switch and server-owned selection, not a client bypass flag.
2. Resolve workflow once before handing ownership to legacy chat. Store it in the receipt/action and freeze it on retry. Preserve flag-off, non-allowlisted template and quality-build behavior.
3. Let chat observe chain progress and terminal result. Ensure it cannot launch a second content writer on the same site.
4. Wire cancellation, reload and retry to the original action/site and chain identity; reuse accepted reliability pieces of #541 rather than copy a second progress implementation.

Acceptance matrix: enabled + JA Boxing enters chain and appears in ops; flag off remains legacy; non-allowlisted template remains legacy; quality retains its intended path; retry after flag change keeps original workflow; concurrent presses create one site; chat follows the same run.

## #509 — Failed fill claims completion and has no actual retry

Priority: P1. Estimate: 2–4 days; likely overlaps accepted #541/#522 work.

Implementation:

1. Track provisioning, content run, action, QA and screen state in the failed original build. Base-site readiness must not imply completed content. Inspect both legacy and chain paths after #508 changes.
2. Reuse #541 action-wait and truthful-chain-QA mechanisms after review. A missing terminal verification must not produce ready-to-edit. Define failed, still running, cancelled and needs-attention consistently in the shared view model.
3. Add or finish authorized same-site retry for the actual failing path. Reuse site key and frozen identity; accepted new attempts have their own timing/accounting. Gate duplicate presses and other active writers; preserve existing completed stages only where their input hashes remain valid.
4. Make UI retry and any existing chat restart tool invoke the same owner-checked server operation. If chat has no real restart capability, state that and direct the user to the working Retry; never claim a restart occurred.
5. Missing optional reviews must not block unrelated content writes. Remove the unsupported review-derived article or return it under the documented policy. Coordinate legacy check/budget semantics with #296.
6. Record the three secondary symptoms separately: photo-label polling, missing template preview and inaccurate research estimate. Bound pending labeling through the existing run lifecycle and show its true progress/failure; inspect image URL/loading fallback; base estimates on available measurements and omit fabricated precision.

Acceptance: inject fill failure after base creation; list, Details, chat and site progress all show the same failure and no completed banner. Retry succeeds on the same site and duplicate retry is safe. Reload, cancellation, stale worker, already-running run, terminal failed check and optional-source absence are covered. No rejected readiness retry consumes another accepted-build allowance. Include one real legacy build as well as the enabled chain.

## Acceptance still needed for #543's four merged fixes

Develop merge: 73b44d40d38d0c79fd793549e7bcd60d828b3585, merged 2026-11-10. GitHub build-app-images and build-dsh-image workflows succeeded for that SHA. Inspect deployment result and actual web/host/dsh image digests before runtime testing.

- #536: real Joomla and WordPress; create one record and push/sync, create two with crossed live ID allocation, push/sync twice, inspect references/counters and clean previews. Include a previously affected copy with IDs above two billion; high IDs retained safely are acceptable, unnecessary renumber-down is not a requirement.
- #307: delete a pushed parent on live, take deletion, confirm map removal and owned metadata cleanup; ensure kept-parent metadata remains. Test an old stale map while live fingerprint is unchanged, with no manual live edit to trigger healing.
- #392: provoke a real unsupported-PHP import and a provisioning failure; verify failed header/segments, unstarted stages, recovery spacing and working retry. Cover mobile/desktop and light/dark; check create and WordPress paths where shared header behavior applies.
- #316: measure computed deployed fill/text contrast at rest/hover (>=4.5:1) and icon/focus against adjacent colors (>=3:1), both modes, default and representative accepted accents. Inspect shared buttons and relevant host-native controls, disabled states separately, and the required one-pixel focus treatment. Do not enable an operator-disabled picker merely to ship this fix.

## Release and evidence checklist

- Before implementation: fetch latest origin/develop, inspect open PRs again, branch from that ref and preserve the current shared checkout. Read applicable runtime/UI/i18n/plugin/gate skills and nearest README before editing. Runtime observations use tch-dev and owned processes; starting a stand uses run-dev.
- Every issue gets a regression case with deterministic mechanism expectations and a branch PASS receipt. Real-model variability is recorded separately from mechanism tests. No fixtures alone count as real-site acceptance.
- Run relevant PostgreSQL/MariaDB suites with no unexpected database skips; focused planner/copy/picture/write/client suites; then required full repository gates. Rebuild committed lib/client.js and eight-language bundles when affected. Add English change journal entries for package/app changes; update SYSTEM.md for changed request/write/data movement.
- Merge current origin/develop before readying; rerun the checks affected by integration and all required merge gates. Follow pr-merge when committing/opening/merging. Do not relax a gate, add locale debt or broaden an allow list to force green.
- Real chain acceptance: new Portland revision and site, retain owner source/brief/plan/copy/pictures/write/check references, stage timing and actual available cost receipts; inspect desktop/mobile pages, phone menu, posts, breadcrumbs and all internal links. Force failure and prove same-site retry, then verify missing-source behavior on another business.
- Finish existing #541 five-business acceptance if its implementation is taken as the delivery line; the draft explicitly owes five WO/five sites and then dev acceptance. Do not replace that outstanding commitment with one clean fixture or one successful site.
- Record final commit and actual image digests; repeat on dev through authorized test accounts/sites. Run node tests/e2e-dev/run.mjs --env dev --tier smoke --cms w,j plus the uncovered issue-specific checks. Smoke success alone is insufficient.
- Close an issue only after its own expected behavior is demonstrated on the serving deployment and evidence identifies that version. Report remaining blocked acceptance separately.

## Indicative effort

The issue ranges overlap and must not be added mechanically. Plan roughly 12–20 engineering days for the nine unresolved issues plus 2–4 days of integrated runtime acceptance, assuming working model/provider access and no missing CMS plugin door. Budget 1–2 days for the four already-merged issues' verification; this can overlap artifact capture. Investigations of #544/#548/#510 and a cross-repo Joomla plugin change are the main uncertainty. Re-estimate after the first artifact review; do not represent these ranges as an agreed deadline.


## Continuation: newly assigned Joomla issue #550

The follow-up assignee query found #550 after the original inventory. Reproduce push settlement with differing
copy/live version rows under one ID; verify the remembered target actually exists. Then save another article and
delete the pushed article on live. Prevent phantom pairs by letting live-generated versions enter the copy through
the row merge. Repair existing version pairs against copy presence and translated record ownership before applying
the map. Bump the existing map repair revision to force a fresh merge even when live fingerprints match. Verify
that genuine version pairs survive article ID translation. The 19-case MariaDB push suite now passes; real shell sync
acceptance and the final regression receipt remain in progress. The source routing for #508 has also been reused
from the current development line; its full customer acceptance remains open.
