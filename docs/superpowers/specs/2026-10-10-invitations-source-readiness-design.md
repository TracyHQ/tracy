# Invitations: sources, versions and approval validity — synthetic stage

Date 10/10/2026. Status: **the user has agreed to the design and provided a snapshot for a local read-only check**.
Branch `codex/invitations-source-readiness`, from `origin/develop` at `64abd583a`.

## 1. Goal and permissions already granted

The user has agreed to continue: ingest sources → store versions → check conditions → invalidate
approval when a related source changes. This stage uses fake data to check transactions and race
errors, and does not open real sending. The user has allowed an additional trial run of the 07/10
snapshot: a read-only check on the local machine, in memory; importing real customers into the dev
database or Git is not yet allowed.

Desired result: an approval can never remain usable with source data that differs from the approved
version; a missing, expired or opted-out source must block, even if the operator has not pressed Apply.
No content the user edited is lost, and no email is regenerated or re-approved automatically when the
source recovers.

PR #1072 has been merged and accepted; the old branch is not reopened. Dev Gmail OAuth is connected to
the right CEO mailbox; the sender is still off. This work is not about implementing the sender, Gmail
sync or the aMember source API.

## 2. Existing foundation and choices

- `apps/tracy-web/src/invitations/eligibility.js` already has a pure evaluator, freshness/coverage,
  negative precedence, policy and an injected clock. **Reuse it**; do not write a second evaluator.
- `route.js` holds the campaign JSONB, revision, advisory transaction lock `7243080`, template version,
  draft hash, approval, simulation, alias and cross-campaign suppression.
- Migration `080-invitations-sandbox.sql` is for synthetic data only. `081-invitations-mailbox.sql`
  holds OAuth; this stage does not change the token or the Gmail configuration.
- The aMember source contract has a snapshot fence, a changes cursor, record version and tombstone;
  consent is `amember_only` only and does not contain Sendy. The CSV snapshot does not have all of these properties.

**Chosen:** extend the existing sandbox with an explicit synthetic source-check mode and a separate
source repository; do not build a new campaign engine. The fake adapter is server/test-side only, with
no permission to call the network or read secrets. This is a mechanism-checking step; it does not claim
a live source exists.

Two options not chosen: connecting live right away would depend on deployment/coverage/policy that are
not ready yet; doing only an in-memory helper cannot prove races, rollback or approval validity after a restart.

## 3. Scope and out of scope

In scope:

1. Adapter contract and shape/version/coverage checks, fixtures from the handed-over aMember contract.
2. PostgreSQL repository for immutable observations, current pointer, sync page/cursor and decision.
3. Wire the evaluator into approve/simulate for campaigns taking part in the source check.
4. Dependency fingerprint, invalidation, suppression and audit in the same transaction as the source.
5. Ops API with permissions/revision/idempotency, responding with the reasons facts are missing.
6. Unit, PostgreSQL concurrency/fault, regression and a local aggregate snapshot check.

Out of scope: real aMember or Sendy credentials/HTTP, PII persistence, Gmail messages/sender,
schedule/quota/pilot, tracking pixel, auto regroup, changing the five-template copy, production, migrations
on the shared DB, reset/delete of QA. There is no unsuppress or consent override button.

Do not set a 15-minute freshness as the live policy on our own. The fixture policy has a `synthetic:` version,
an explicit value supplied by the test/server fixture; it cannot be used to allow real customers.

## 4. Two separate kinds of data check

### 4.1 Synthetic, written to the DB

Keep the `.test`/`.invalid` guard and member ID `sandbox-*`; fake observations must be scoped to exactly those
identities. Do not use real emails/names/IDs as fixtures. For cases where the source capability is missing, the value
remains Unknown; a fake positive must be declared separately in the test scenario.

The existing QA campaign keeps the old sandbox mode so the accepted evidence is not changed. The source-check
mode is turned on explicitly for **new synthetic campaigns that have no recipients or drafts yet**; old campaigns
are not upgraded automatically. Once turned on there is no shortcut back to the old mode. Neither mode has a
real sender; in the future the legacy path must not be reused to open live sending.

### 4.2 The real 07/10 snapshot, read-only

After the user provides the right file, use the existing baseline parser/mapping to check it locally,
without sending the file to dev or aMember. Do not modify the original file, and do not store raw rows/candidates, checksums
or identities in Git/logs/reports. Return only total rows, error counts by code, groups, conflicts and negatives.
Do not output error rows verbatim. Missing date/coverage values stay missing, `eligibleNow:null`.

Do not push the whole snapshot through the local preview endpoint, which is limited to 20 rows; do not loosen that guard
to run the check. If a whole-file check tool is needed, the tool only calls the pure parser/helper and does not
import network/database modules or read env. Check the output beforehand so no PII leaks.

## 5. Source contract

The adapter is injected into the service and has `snapshotPage`, `changesPage`, `status`. It does not accept URLs or
facts declared by the browser; Ops HTTP only selects a fixture ID from a fixed server list.

- Each observation has a stable source namespace, subject identities, schema version, source
  version, provenance/evidence reference, asOf/checkedAt/validUntil and capability/coverage.
- Cursors and page tokens are opaque; do not decode them or fake ordering by string comparison.
- The aMember fixture adapter checks `schema_version=1.0`, a positive integer user ID, a matching customer ID,
  and a record version that is monotonic per the source contract; it keeps membership, consent and download provenance
  separate. Do not turn `has_active_membership` into a marketing basis or infer a Sendy scope.
- The snapshot goes through all pages until complete, then replays changes from the fence to a completed checkpoint
  before reporting the source as synced. Do not treat each 200 page as the whole source being ready.
- Null, unavailable, malformed or missing capability has a specific reason; do not coerce it to false.
- aMember's date-only expiry is not converted automatically to end-of-day UTC. In this stage the adapter only
  accepts a date/timezone conversion policy declared explicitly in the fixture; without a policy, membership is Unknown.
- Keep the identity namespace independent of key/connection; a reconnect does not create a new person. Do not
  change the recipient email automatically: a new observation creates a review/blocker, and the history of the old destination is kept intact.

Marketing basis and tracking basis are two separate facts. Missing tracking does not become marketing
denied; this stage has no tracking, so sending consent must not be used to open tracking later.

## 6. Storage and transactions

The new migration uses the existing runner, picks its number from develop at implementation time, and does not modify 080/081.
The logical entities below contain synthetic data only:

| Entity | Keys and data | Invariant |
|---|---|---|
| Source scope | namespace + coverage scope, current sync revision/status | Credentials are not part of the identity |
| Sync run/page | run ID, request key, input/next cursor, page digest, state | Same page/key with different payload gets 409; replay does not duplicate |
| Observation | source + subject + source version, allowlisted facts | Append-only; same version with different content is an error |
| Current facts | subject/source → observation ID, facts revision | Advances with the page commit, no partial page |
| Decision | recipient, facts/policy revision, state/reasons/validUntil | Not a permission to send; always re-check the clock |
| Invalidation audit | campaign/recipient/draft revision, reason codes | Does not record body/raw rows/token |

A failing/partial source keeps a pending blocker and does not record a fake last-success. A positive from a run
that has not completed does not create ready. A valid observed negative must be recorded and block immediately in the
page-receiving transaction, without waiting for the run to complete or for the operator to Apply. A broken page does not confirm
deletion; only an explicit tombstone makes a subject unavailable. Do not remove suppression because a
person is missing from a page or because the source now returns a positive.

All writes of facts, aliases/negatives, dependency invalidation and cursor are in the same transaction. Use the same
advisory lock as the current mutate, then lock the related campaigns in a fixed ID order. Do not hold an
SQL transaction while reading the adapter. If the transaction volume limit is exceeded, reject the whole
page and keep the source blocked; do not advance the cursor and defer invalidation for later.

The effect must cover all source-check campaigns linked to the identity, not only the campaign that started the
sync. Old aliases/suppression are read so no negative slips through; the content or attempts of the
old QA campaign are not modified. A rollback of any step leaves all cursor/facts/approval as they were.

## 7. Approval validity

Separate three concepts: draft content, recipient conditions, approval validity. The recipient state
is not used in place of the content hash. UI/API return readiness and the reason an approval cannot be used
separately, and do not report a fake saved or approved.

A new approval binds at least: draft revision + exact content hash, normalized destination,
identity set revision, dependency fingerprint and policy version. The facts revision is evidence
of what was checked; it is not by itself a reason to force a rewrite if only a timestamp/unrelated field changed.

- A field the content actually depends on changes → approval stale; keep the text the user edited,
  do not regenerate automatically. Track dependencies hidden in an optional paragraph too, not only usedFields.
- Destination, identity or policy changes → approval stale, needs review again; do not move the approval
  to the new email.
- Negative/expired/unknown/incomplete → the decision is blocked. An approval that lost validity does not come
  back to life when positive/fresh facts return; it must be approved again explicitly.
- An unused field changes, policy and identity unchanged, data still valid → update the observation
  without forcing a pointless regenerate/re-approval.
- Read/approve/simulate all evaluate against the current DB clock; they do not rely on a stored ready flag. When the source
  refreshes after an expiry window since the approval, record the invalidation even if nobody opened the screen in that window.
- Competing approval and source sync are serialized: if the sync comes first, an approve using the old revision gets
  409; if the approve comes first, the next sync invalidates exactly that approval before committing.
- Simulated attempts/snapshots are always immutable. Sync does not modify messages or change the historical state
  to unsent in order to rerun. Simulation still checks the duplicate guard and never calls Gmail.

## 8. API, permissions and limits

The prefix stays `/api/ops/invitations`. The new contract uses `invitations-v1`, errors `{code}` as in the existing
route; do not replace the whole old envelope just for this stage.

| Proposed operation | Permissions and input | Result |
|---|---|---|
| Turn on source-check for a new campaign | Owner/Admin, same-origin, campaign revision | Synthetic source-check mode, cannot be turned off |
| Run a source fixture | Owner/Admin, fixture ID from a server allowlist, request key, expected revision | Run ID + revision/result; does not accept arbitrary facts/URLs |
| Read health/changes | Owner/Admin within the campaign | Scope/version/status, reason codes and effects; no secrets |
| Read aggregate health | Developer | Counts/status only, no recipients/identities/evidence containing PII |
| Existing approve/simulate | Keep the current guards, add readiness/dependency checks | 409 when stale/blocked, no text lost |

Exact paths and DTOs will be settled in the implementation plan after the design is approved; do not call
them endpoints that already exist. Fake sync is a bounded, deliberately triggered operation; no daemon/cron
or endless background run is added. Keep the current body/recipient caps; choose the payload page cap with a bounded test,
reject before materialization/hashing when exceeded, and do not truncate negatives or provenance.

## 9. Acceptance for the stage

1. Malformed contract, identity mismatch, date/time without a policy, null/unknown → blocked with
   an error code, no PII in errors/logs.
2. Multi-page snapshot + changes from the fence; replay; old cursor; same key with different payload; failed page
   or crash → no person lost, no duplicates, no fake last-success.
3. A negative on a valid page while the run has not completed still blocks; a late positive does not unsuppress.
4. Reloading the DB keeps the observation/version, cursor, decision and approval invalidation.
5. Complete synthetic facts → ready; missing Sendy/marketing or expired → not ready. Unknown tracking
   is still shown separately, not mixed with sending consent.
6. Changing a used/unused/optional field from missing to present has the right effect. A changed email/identity keeps
   the old recipient and attempt; the approval does not move.
7. Real PostgreSQL, a barrier controlling the two sync/approve transactions in both orders; do not
   conclude anything about concurrency from sequential unit tests.
8. Direct HTTP: Owner/Admin/Developer, wrong Origin, another campaign, stale revision, request
   key conflict; there is no browser door that submits arbitrary positive facts.
9. Existing Invitations suites and the old QA do not change behavior; the Gmail token/env is not read by the fake
   adapter. Every fixture send stays simulated, no network to Gmail.
10. The 07/10 snapshot (when the file is available) reports only aggregates and missing facts; it does not claim a live eligible count.

The test DB belongs to the run alone and does not borrow dev/QA/aMember. Each command has a timeout, its own log and records the
owning PID/container; when finished, verify it has stopped, and do not leave CPU-hungry tests behind like in the previous run.

## 10. Handover conditions

Separate PASS unit/DB/API from NOT RUN live. One branch/one draft PR for this stage, including implementation,
regression and journal; do not push to the merged PR #1072. Before Ready, refresh develop, review and run the
repo's gates. Merge/deploy or using real data needs exactly the allowed scope, not inferred from the
design approval. The live policies still open remain blocked and do not stop building the fake technical flow.

Self-review of the design: no credentials/customers recorded in the document; the read-only snapshot is kept clearly distinct from the DB fixture;
no promise of live coverage from OAuth; paths not yet implemented are recorded correctly as proposals. The next step
is to settle the detailed task/TDD plan according to the approved design.
