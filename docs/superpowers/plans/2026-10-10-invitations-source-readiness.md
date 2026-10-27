# Invitations Source Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ingest versioned synthetic sources, evaluate current conditions and invalidate approvals when a relevant source changes, while keeping content the user has edited.

**Architecture:** Extend the existing PostgreSQL sandbox; use the evaluator `evaluateEligibility`, lock `7243080` and the existing alias/suppression. A server-side fixture adapter provides a fenced snapshot, then changes; each page commits facts, cursor, decision and invalidation in the same transaction. Readiness and approval are two separate properties, rechecked against the database clock at the read/approve/simulate doors.

**Tech Stack:** Node.js ESM, Hono, PostgreSQL/pg, node:test; no new runtime dependency.

**Spec:** [Approved design](../specs/2026-10-10-invitations-source-readiness-design.md).

## Global Constraints

- “Reuse, do not write a second evaluator.” — `apps/tracy-web/src/invitations/eligibility.js`.
- “No live aMember/Sendy HTTP/credentials, Gmail messages/sender, schedule/quota/pilot, tracking pixel, auto regroup, change to the five-template copy, production, migration on the shared DB, reset/deletion of QA.”
- “Keep the `.test`/`.invalid` guard and the `sandbox-*` member ID.”
- “Source-check mode is switched on explicitly for a new synthetic campaign that has no recipients or drafts yet”; “there is no shortcut back to the old mode”.
- “Do not loosen the guard” of the 20-row local preview; the real snapshot is “only inspected read-only on the machine, in memory”.
- “Do not store raw rows/candidates, checksums or identities in Git/logs/reports.”
- “Cursor and page token are opaque”; “snapshot complete, then replay changes from the fence” before ready.
- “A valid observed negative must be recorded and blocked right inside the page-ingest transaction”.
- “Do not hold a SQL transaction while reading the adapter”; shared advisory lock `7243080`, campaign locks in a fixed ID order.
- “Positive/fresh facts coming back” do not revive an invalidated approval; customized text and attempts/messages stay unchanged.
- The fixture policy has the `synthetic:` prefix and is not a live policy. `invitations-v1`, 1 MiB body, at most 200 recipients/campaign stay unchanged.
- Code/comments/commits in English; docs in Vietnamese. One branch/one draft PR; do not modify the already-merged PR #1072.

## Review Focus

1. A page with a negative retried after a crash: the negative stays in effect, the cursor does not run past the data, observations are not duplicated (Task 2/3).
2. An A → B → A sequence, or a source expiring between two refreshes: the old approval does not revive even if the current fingerprint matches the original (Task 4).
3. The last snapshot page misses a subject that changed after the fence: changes must fill in the subject; a missing page does not become a tombstone (Task 3).
4. An alias appearing after approval or between two campaigns: the negative and the attempt guard cover the whole graph, without rewriting already-simulated history (Task 4/5).
5. GET and sync at the same time, or waiting on a lock past the deadline: the response does not combine new facts with an old approval; the clock is taken after the lock is held (Task 4/5).

## File map and shared decisions

Paths below are relative to the repo. Only Invitations code, the new migration and this stage's tests/evidence.

| File | Responsibility |
|---|---|
| `apps/tracy-web/src/invitations/source-contract.js` | Validate page/observation, normalize the aMember fixture contract and policy |
| `apps/tracy-web/src/invitations/source-fixtures.js` | Server-owned scenario registry, pure adapter with no network/env |
| `apps/tracy-web/src/invitations/source-store.js` | Observation/current/run/page/decision, page transaction |
| `apps/tracy-web/src/invitations/source-sync.js` | Snapshot → changes from the fence, run limits, resume/replay |
| `apps/tracy-web/src/invitations/source-approval.js` | Create decisions, dependency fingerprint, bind/invalidate approvals |
| `apps/tracy-web/src/invitations/source-routes.js` | New Ops doors, allowlisted DTOs, permissions and idempotency |
| `apps/tracy-web/src/invitations/route.js` | Wire source mode into import/generate/read/approve/simulate, keep legacy |
| `apps/tracy-web/src/db/migrations/085-invitations-synthetic-sources.sql` | New tables; develop `9ae6d2490` already used 084 for Ops CI, chose 085 after refresh |
| `apps/tracy-web/test/_invitations-source.mjs` | Builds campaign/fixture and transaction barriers for tests |
| `apps/tracy-web/test/invitations-source-{contract,store,sync,approval,routes}.test.mjs` | Tests that exercise the real behavior of each part, with a real DB where needed |
| `scripts/inspect-invitations-snapshot.mjs` | CLI that reads a snapshot, outputs only allowlisted aggregates |
| `scripts/test/inspect-invitations-snapshot.test.mjs` | Checks no rows/PII/checksum leak and no eligibility is inferred |
| `tasks/nhat-ky/2026-10-10-invitations-source-readiness.md` | Its own journal entry in the repo's format |

The migration creates `invitations_source_scope`, `_run`, `_page`, `_observation`, `_current`, `_decision`, `_invalidation`.
Scope unique `(namespace,coverage_key)`, namespace `synthetic:invitations:v1`, coverage key `foundation-v1` stable across scenarios/connections.
Run unique `(campaign_id,actor,request_key)`, holding request digest, anchor clock, version base, phase, fence, cursor, scope revision, result/status.
Page unique `(run_id,phase,input_token)`; observation unique `(scope_id,source,subject_key,source_version)`.
Current unique `(scope_id,source,subject_key)` referencing an observation, with a monotonic facts revision.
Decision is append-only per campaign/recipient/facts revision/policy/checked_at. Invalidation is append-only with reason codes, no body.
Observations are never UPDATEd/DELETEd by the application; a trigger blocks updating/deleting observations so the invariant is testable. No FK cascade deletes history.
Every version/sequence from the API is a safe integer >= 1; opaque cursors are not compared lexically. Tombstones keep a version marker so an old upsert does not revive the subject.

### DTOs and signatures used across tasks

The typedefs/JSDoc live in `source-contract.js`; this is a new implementation contract, not an API already running.

```js
// Source = 'membership' | 'marketingBasis' | 'amember' | 'sendy' | 'tracy'
// Policy = { version: string, maxAgeMs: number, requiredSendyCoverage: string[] }
// Fact matches evaluateEligibility: status/value/sourceVersion/evidenceRefs/memberIds/asOf/checkedAt/validUntil.
// Observation = { source: Source, subjectKey: string, sourceVersion: number,
//   operation: 'upsert'|'delete', identities: string[], destination: string|null,
//   fact: Fact|null, personalization: Record<string,string|null>, evidenceRef: string }
// SourcePage = { schemaVersion:'1.0', namespace:string, coverageKey:string,
//   phase:'snapshot'|'changes', fenceCursor:string, inputToken:string|null,
//   nextToken:string|null, complete:boolean, coverage:Source[], observations:Observation[] }
// ScopeView = { scopeId:string, revision:number, status:'pending'|'ready'|'failed',
//   reasons:string[], fenceCursor:string|null, cursor:string|null, completedAt:string|null }
// Readiness = ReturnType<typeof evaluateEligibility> plus factsRevision, identityRevision,
//   dependencyFingerprint, trackingBasis:'unknown'.
// ApprovalBinding = { revision:number, contentHash:string, destination:string,
//   identityRevision:string, dependencyFingerprint:string, policyVersion:string,
//   factsRevision:number, validatedThrough:string, actor:string, createdAt:string }
```

Source mode stores `campaign.data.sourceCheck={scopeId,policyVersion,enabledAt}`. Namespace/policy/facts/clock are never accepted from the browser.
Registry `foundation-ready-v1` declares policy `{version:'synthetic:readiness-v1',maxAgeMs:600000,requiredSendyCoverage:['synthetic:list-a']}`;
these numbers serve technical tests only. The registry holds the fake identity `sandbox-amember-1`, email `friend@fixture.test`.
Change scenarios keep the same namespace/coverage; record versions are monotonic, and the run's data and anchor are kept so replay is stable.
The version base is taken greater than the largest version already stored in the scope when the run is created under the lock; the same source version is never reused with a new timestamp.
Faulty fixtures exist only in a test-injected registry; HTTP can only select allowlisted synthetic scenarios.

New HTTP under `/api/ops/invitations`:

| Method/path | Input | Output/permissions |
|---|---|---|
| `POST /:id/source-check` | `{revision,fixtureSetId:'foundation-v1'}` | Campaign detail; Owner/Admin, empty campaign, one-way switch-on |
| `POST /:id/sources/sync` | `{revision,fixtureId,requestKey}` | `{runId,status,scope,campaignRevision}`; Owner/Admin, same-origin |
| `GET /:id/sources` | No body | `{scope,decisions,invalidations}` Owner/Admin; Developer only `{status,counts,reasons}` |

Request key is 1–80 characters `[A-Za-z0-9_-]`. Same key/input replays the result; different input returns `409 source_request_conflict`.
Retrying a pending/failed run with the same key resumes from committed pages, without rewriting a fake positive. Another run on a scope that has a pending run returns `409 source_sync_busy`.
A run failed because of an expired cursor is terminal and lets a new key start a snapshot; retrying a run already replaced by a newer run returns `409 source_run_superseded`.
A stale initial revision returns `409 stale_revision`; replay of an existing key is checked for actor/campaign/digest before the current revision.
One HTTP call processes at most 16 pages or 10 seconds; hitting the limit returns pending, and the same key continues a bounded amount.
Each page <= 200 observations, <= 1 MiB, <= 32 identities/observation, each fact string <= 16 KiB; exceeding a cap rejects the whole page.
An invalidation transaction covers at most 100 campaigns/20,000 recipients to fit the existing caps; exceeding the cap returns blocked and does not advance the cursor.

## Preparation before Task 1

- [x] Refresh from `origin/develop`, look for code/open PRs with the same goal before implementation; if someone is building the same part, report and stop the overlapping part. Read the journal on the fresh tree. Before bootstrap/DB/container, read the infrastructure docs; if migration 084 collides, pick the next free number and record the decision.
- [x] Prepare a separate small-resource DB after checking container/port/label; record PID/container ID in a scratch ledger. Do not use the old DSN 55451. Run tests in bounded batches, do not build the full app/Chrome until needed; node:test timeout and a process-level watchdog for the whole batch.

## Task 1: Fixture contract and snapshot inspection tool

**Files:** create `source-contract.js`, `source-fixtures.js`, test `invitations-source-contract.test.mjs`, CLI/test script in the file map.

**Interfaces:**
- `validateSourcePage(page:unknown):SourcePage`; errors are only `{code}`, no data interpolation.
- `normalizeAmemberFixture({document,meta,datePolicy}):Observation[]`; `user_id=N`, `customer_id=amember:N`, internal identity `sandbox-amember-N`.
- `getSourceFixture(id:string,{anchor:string,versionBase:number}):{policy:Policy,namespace:string,coverageKey:string,snapshotPage,changesPage,status}`; `snapshotPage({pageToken:string|null}):Promise<SourcePage>`, `changesPage({cursor:string}):Promise<SourcePage>`, `status():Promise<{ready:boolean,coverage:Source[]}>` only read server fixtures.
- `inspectSnapshot(csvBytes:Uint8Array):AggregateInspection`; the CLI takes exactly one file and returns aggregates without identities/checksum/candidates.

- [x] Write RED tests: wrong schema, ID mismatch, null facts, version larger than a safe integer, synthetic guard, page over cap, date-only without policy. Check `consent.scope='amember_only'` does not produce Sendy clear/marketing allowed. The fixture's explicit UTC date policy turns inclusive expiry into exclusive; a missing policy returns membership Unknown.
  Minimum assertions: `assert.throws(() => validateSourcePage(badSchema), {code:'source_schema_invalid'})`; `assert.equal(membershipWithoutDatePolicy.fact.status,'unknown')`; `assert.equal(amemberOnly.some(o => o.source === 'sendy'),false)`. The only date policy in this stage is `{timeZone:'UTC',expiry:'exclusive-next-day'}`, `2026-10-10` → `2026-10-11T00:00:00.000Z` in an explicit fixture.
- [x] Write RED CLI tests with a fake fixture: counts/group/flag correct; blank internal stays Unknown; parser errors are code only; output has no sentinel email/member/name/checksum/raw value; `eligibleNow === null`.
- [x] Run `node --test --test-timeout=30000 apps/tracy-web/test/invitations-source-contract.test.mjs scripts/test/inspect-invitations-snapshot.test.mjs`; Expected: FAIL for missing exports/new module, not failing because of environment dependencies.
- [x] Implement the signatures. The validator allowlists nested facts and does not spread the raw document; the registry does not import Gmail/network/env. The CLI uses the existing parser/mapping and does not modify the preview endpoint.
- [x] Rerun the same command; Expected: PASS, fail=0, skip=0. Run the CLI on the user's file in memory, compare with the [evidence](../../../tasks/invitations-snapshot-2026-10-07-inspection.md).
- [x] Commit exactly the Task 1 files: `feat(invitations): validate synthetic source pages and inspect snapshot safely`.

## Task 2: Versioned storage and the single-page transaction

**Files:** migration 085, `source-store.js`, test `invitations-source-store.test.mjs`, helper `_invitations-source.mjs`.

**Interfaces:**
- `beginSourceRun({pool,campaignId,actor,revision,fixtureId,requestKey,requestDigest}):Promise<Run>`.
- `applySourcePage({pool,runId,page,onFactsChanged}):Promise<{replayed:boolean,scope:ScopeView}>`.
- Callback `onFactsChanged({db,scopeId,previous,current,affectedCampaigns,now}):Promise<void>` runs INSIDE the transaction; by default the test callback does nothing, Task 4 wires the evaluator.
- `readSourceState(db,scopeId,subjectKeys):Promise<{scope:ScopeView,current:Observation[],factsRevision:number}>`.

- [x] Write RED tests using `fileDb()`: migration from zero; observations append-only; same version different payload 409; an old upsert does not roll current back; a delete marker is not overwritten by an old upsert; page replay does not increase the revision.
- [x] Write the Review Focus 1 fault test: the callback throws after inserting the observation and before the cursor → roll back all of observation/current/page/cursor; the retry succeeds with exactly one copy. The same request key with a different actor/campaign does not expose someone else's result.
  Test `source page rollback retains current facts and cursor`: `assert.deepEqual(afterFailure,beforePage)`; after retry `assert.equal(observationCount,1)`, `assert.equal(pageCount,1)`; after replay `assert.equal(replayed,true)`, revision does not increase.
- [x] Run `node --test --test-timeout=60000 --test-concurrency=1 apps/tracy-web/test/invitations-source-store.test.mjs` with a separate DB; Expected: FAIL for missing new tables/functions, DB setup succeeds.
- [x] Implement: acquire the advisory lock, then scope/campaign rows by ID; read `clock_timestamp()` after the lock; bounded transaction timeout/lock timeout. The page checks digest, observations, suppression and the callback in the same transaction before advancing the cursor. `previous/current` are `Observation` arrays, `affectedCampaigns` are the locked campaign rows. Fact `sourceVersion` is converted to a string from the numeric observation version to match the evaluator; identityRevision is a hash of the sorted linked identities. No adapter I/O inside the transaction.
- [x] Rerun the command; Expected: PASS, fail=0, skip=0; close the pool with hooks. Check the current insert FK and that the namespace key contains no key/connection ID.
- [x] Commit exactly the Task 2 files: `feat(invitations): persist versioned synthetic observations atomically`.

## Task 3: Snapshot fence, changes, failure and resume

**Files:** `source-sync.js`, fixture scenarios, test `invitations-source-sync.test.mjs`.

**Interfaces:**
- Consume the Task 1 adapter, Task 2 `beginSourceRun/applySourcePage`.
- `syncSourceFixture({pool,campaignId,actor,revision,fixtureId,requestKey,onFactsChanged}):Promise<{runId,status,scope,campaignRevision}>`.
- `getSourceHealth(db,scopeId):Promise<ScopeView>`; status is ready only when the snapshot is complete, the changes checkpoint is complete and coverage spans all five sources.

- [x] Write RED: multiple snapshot pages, replay changes from the fence; source status unavailable, expired cursor, missing page, looping token, sequence going backwards/duplicate with different payload; never set a fake completedAt. Pending after 16 pages/10 seconds, the same key resumes with the old anchor.
- [x] Write the Review Focus 3 test: a subject changes version/is deleted between snapshot pages, only changes restore the correct state; a subject absent from a page is not deleted. A valid negative on page 1 takes effect before page 2 fails; a partial positive is not ready.
  Test `source snapshot requires replay from its fence`: `assert.equal(beforeCatchup.scope.status,'pending')`; `assert.equal(afterCatchup.current[0].sourceVersion,newVersion)`; `assert.equal(afterCatchup.scope.status,'ready')`. Test `partial negative survives a later failed page`: suppression count 1, completedAt null, failed run not ready.
- [x] Run `node --test --test-timeout=60000 --test-concurrency=1 apps/tracy-web/test/invitations-source-sync.test.mjs`; Expected: FAIL because the orchestrator does not exist yet, Task 2 store tests still PASS.
- [x] Implement the state machine snapshot → catchup → ready; a refresh on an already-completed scope starts changes from the committed cursor, with no needless re-snapshot. Validate opaque tokens by equality/checkpoint, no lexical ordering. A failure records sanitized run/scope state under the lock and keeps committed pages; an expired cursor requires a new snapshot but keeps old negatives/history. The in-progress run is separate from the checkpoint; only a completed checkpoint proves coverage, a partial positive does not open ready.
- [x] Rerun the same command and the store test; Expected: PASS, fail=0, skip=0. After closing/reopening the pool, current/run/page/cursor are still correct.
- [x] Commit Task 3: `feat(invitations): replay fenced source snapshots with bounded resume`.

## Task 4: Source-dependent decisions and approvals

**Files:** `source-approval.js`, test `invitations-source-approval.test.mjs`; modify `render.js` only if a test proves a missing dependency (it already returns dependencyFields).

**Interfaces:**
- `evaluateSourceRecipient({db,scopeId,recipient,policy,now}):Promise<Readiness>` calls `evaluateEligibility`, adds a pending/failed scope blocker, reads the existing suppression graph.
- `dependencyFingerprint({fields,personalization,destination,identities,policyVersion}):string`; canonical sort; absent and present are distinguished, timestamps/versions that do not affect content are dropped.
- `bindSourceApproval({draft,readiness,destination,actor,now}):ApprovalBinding`.
- `approvalStatus({draft,readiness,destination,now}):{effective:boolean,reasons:string[]}`.
- `invalidateSourceApprovals({db,scopeId,previous,current,affectedCampaigns,now}):Promise<void>` is the Task 2 callback.

- [x] Write RED: full facts ready; missing marketing/Sendy/timezone/coverage/freshness blocked; tracking Unknown kept separate. Template dependencies `first_name`/`group` and the pure renderer's optional `last_template`/`cms` are all fingerprinted; a missing optional → does cause stale. A change to an unused field/timestamp-only stays effective while validity is continuous.
- [x] Write Review Focus 2: an approval whose old validUntil has passed, then a fresh refresh → stale; A→B→A does not restore; negative→positive does not unsuppress; text/draft revision/attempts/messages do not change on invalidation.
  Add `continuous identical refresh extends validation without reapproval`: a refresh with the same dependencies before the old deadline extends validatedThrough to the new deadline; past the old deadline but not past the new one is still effective. Changing actor/createdAt/content binding in a refresh is an error; a refresh arriving after the stored deadline must invalidate.
- [x] Write Review Focus 4/5: a new alias bridge invalidates all related source-checked campaigns; simulation history stays unchanged; when the DB clock after the lock passes the deadline, approve is blocked even if the transaction started before the deadline.
  Test `expired approval cannot revive after refresh or A B A changes`: `assert.equal(afterRecovery.draft.approved,false)`, `assert.equal(afterRecovery.draft.bodyText,customText)`, `assert.deepEqual(afterRecovery.attempts,before.attempts)`; timestamp-only fresh update `assert.equal(approvalStatus(fresh).effective,true)`.
- [x] Run `node --test --test-timeout=60000 --test-concurrency=1 apps/tracy-web/test/invitations-source-approval.test.mjs`; Expected: FAIL because the new module/binding does not exist yet.
- [x] Implement an allowlisted dependency snapshot on the draft; approval does not bind only the facts revision. A refresh with the same dependencies, full coverage and no gap is extended by validatedThrough/factsRevision evidence, keeping actor/createdAt/content binding; a gap makes it permanently stale until an explicit approve. Invalidation increases the campaign revision exactly once per page with a significant change and records an audit reason. A new source identity/email only adds an alias/review blocker, it does not change the recipient's destination. Auto refresh does not regenerate the body; an explicit re-approve has a new binding.
- [x] Rerun the command together with the eligibility/render tests; Expected: PASS, fail=0, skip=0. The read projection returns effective=false at an expired clock; mutation/sync stores stale so it cannot revive.
- [x] Commit Task 4: `feat(invitations): bind approvals to current source dependencies`.

## Task 5: Wire the Ops API and prove races with PostgreSQL

**Files:** `source-routes.js`, modify `route.js`, tests `invitations-source-routes.test.mjs`, barrier helper.

**Interfaces:**
- `invitationsSourceRoutes({pool,config,admit}):Hono`; reuse the current route's admission/body validation through a small helper, do not fork the protection policy.
- Source-checked recipient detail adds `readiness` and `approvalStatus`; `draft.approved` in the response reflects the effective status. Keep stored historical data and invalidated approvals separate.
- `candidateFromRecipient(recipient):Candidate` in `source-approval.js` turns lifecycle state into an evaluator candidate, keeping `sourceCandidate={state,needsReview,negativeAssertions}` from import for source mode; it does not turn conflict/unknown into clear.
- Existing route callbacks consume the Task 4 evaluator/binding; legacy without `sourceCheck` keeps the old behavior.

- [x] Write RED HTTP: source-check only on new/empty campaigns; the mode cannot be switched off; owner/admin have full permissions, developer only aggregates; wrong Origin 403; unknown fixture/facts/URL/clock/policy fields 400; a cross-campaign run does not replay; stale revision and request conflict 409.
- [x] Write RED workflow: a source-mode import is not ready yet; a sync with full new facts is ready; generate snapshots dependencies, customize keeps provenance; a source change removes approval but keeps the text; stale approve/simulate 409 without writing an attempt; STOP and the duplicate guard still apply. Saving a draft still removes the current approval.
- [x] Write real concurrency with two pool clients/barriers and observe the lock waiter (no sleeping to guess): sync holds the lock → approve waits → sync commits → approve with the old revision 409; approve holds the lock → sync waits → approve commits → sync commits → approval ineffective, text intact. GET uses a consistent snapshot so it never returns new facts with an old approval effective. A 5-second watchdog releases barriers on failure, every client is released in finally.
  Required test names: `source sync before approve rejects stale campaign revision`, `source sync after approve invalidates before commit`, `source read cannot combine different fact and approval snapshots`. Assertions respectively `status === 409`, `draft.approved === false`, and every GET returns a tuple belonging to the state before or after the transaction, never a mixed tuple.
- [x] Run `node --test --test-timeout=90000 --test-concurrency=1 apps/tracy-web/test/invitations-source-routes.test.mjs`; Expected: FAIL because the new route is not mounted yet, no DB skip.
- [x] Implement the API per the shared DTOs. Sync fetches outside the transaction; mutation clock after the lock; GET detail and campaign list/Developer counts compute effective approvals inside a consistent-snapshot transaction. Simulate in source mode preflights every draft that was ever approved and has no attempt, including already-stale approvals, before inserting, so a 409 leaves no partial attempts. Import/alias/STOP also call invalidation for affected source-checked campaigns in the same transaction; do not modify legacy QA campaigns/history.
- [x] Rerun the test and `node --test --test-timeout=120000 --test-concurrency=1 apps/tracy-web/test/invitations-*.test.mjs packages/web/tracy-harness/test/invitations-flow.test.mjs packages/web/tracy-harness/test/navigation-guard.test.mjs`; Expected: PASS, fail=0, skip=0 for the related suites with their own full DB/browser dependencies.
- [x] Commit Task 5: `feat(invitations): enforce source readiness at approval and simulation doors`.

## Task 6: Regression, evidence, review and draft PR

**Files:** the journal entry in the file map, `tasks/invitations-source-readiness-handoff.md`, regression case/result with an ID from the real PR number; update plan checkboxes.

**Interfaces:** consume all of Task 1–5. Do not change gates/runners and do not waive tests.

- [x] Review the whole branch with an independent reviewer after implementation/tests are done; fix every finding affecting conditions/approval/rollback/PII via RED→GREEN, record the remaining minors.
- [x] Run `pnpm build:check` through separate dependencies bootstrapped with the correct submodule; Expected: exit 0, every gate ran. If local macOS has environment/vendor failures: investigate per systematic-debugging, record them clearly and verify the same head on Linux; do not mark PASS for anything that did not pass. Linux `38044284351` on `e6f81467f` SUCCESS on all seven rows; after the develop metadata refresh `bc43740e5` at `c4076b627`, 56 non-test gates, 538 related and SaaS 372 PASS, regression 45/45 with no skip. CI on the final PR head is still a separate gate before merge.
- [x] Write the journal and handoff: contract/status scope, test counts/skips, concurrency in both orders, snapshot aggregates, synthetic PASS and live NOT RUN; sending stays off. There are no new UI controls yet, so record API acceptance; do not claim acceptance of the live source UI.
- [x] Push a separate branch and open exactly one draft PR per `pr-merge`, attach it to the chat; take the real number, then create the case `invitations-source-readiness` with `tests/regression/create.mjs`. The case runs the source-store/sync/approval/routes tests, `run.needs:['postgres']`, every expect tied to a specific test name and a bounded timeout.
- [x] Run `node tests/regression/run.mjs --no-codex --id <real id>`; Expected: PASS on the branch commit, commit case/result/evidence/journal in the same PR. Do not guess the PR number or use the results of PR #1072.
- [x] Run final regression/related checks if code changed; clean up only this run's DB/container/processes after all tests have stopped, verify no test PIDs remain. Report results and limitations. Keep Draft; Ready/merge/deploy belong to the next handoff step, under the right permissions and repo requirements.

## Plan self-review

Spec §1–4 → Task 1 and source mode in Task 5; §5 → Task 1/3; §6 → Task 2/3/4;
§7 → Task 4/5; §8 → Task 5; §9 → tests in Task 1–5 and regression in Task 6; §10 → Task 6.
All five Review Focus items have an owning test. `onFactsChanged` uses the same shape in store/sync/approval;
`Readiness` and `ApprovalBinding` keep their names across API/evaluator, the clock is supplied by the DB after the lock.
The new paths are recorded as an implementation contract, not as evidence that the endpoints exist.

The real snapshot result is complete, [aggregates only](../../../tasks/invitations-snapshot-2026-10-07-inspection.md).
Current product state: Task 1–5 are implemented and verified with real PostgreSQL/API;
the related run after fixing two Important findings from the independent review: 441 PASS, 0 FAIL, 0 SKIP.
Task 6 has full Linux, a regression case carrying the real PR number and evidence in the same PR #1120.
The user has allowed Ready/merge to develop once the conditions are met; CI on the head after refresh and dev deploy/acceptance
must be checked separately, not inferred from Linux before the refresh. Live remains out of scope.
Executed directly in the session, one independent reviewer at the end of the branch; no second-round reviewer.
