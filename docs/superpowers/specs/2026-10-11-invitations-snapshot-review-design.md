# Invitations — snapshot campaign for handover and preliminary review

Date: 11/10/2026. Branch: `codex/invitations-snapshot-review`.

Status: **old design, superseded by the
[real campaign spec](2026-10-11-invitations-real-campaign-design.md), awaiting user approval**.
The sections below only keep the history of the snapshot-only proposal; they are not current implementation instructions.
The user approved the functional scope in chat, changed the retention from 7 to 30 days on 11/10/2026 and asked to keep all
43 columns of the exact snapshot file provided. The design revised per these decisions is still awaiting approval.

Note on the new scope in chat on 11/10/2026: the user asked to import real customers without the
sandbox limits and wants to avoid having to change code just to change the retention policy or turn on sending later.
The snapshot-only architecture sections below are an old proposal, not approved; they need to be reconciled
with the real-campaign direction in draft state before planning the implementation. The 30-day
decision only replaces the retention period; it does not by itself approve the whole design or open sending permission.

## 1. Goal and permissions already granted

The user needs a preliminary handover to the boss while waiting for access to the aMember source: view
the 07/10/2026 snapshot list in the existing five groups, check people who are blocked/need further checking and
prepare content for review. No live source is needed for this.

Allowed: building a snapshot campaign on dev, importing the full list and the 43 columns of the exact file provided,
keeping the groups, protecting real data and retaining it for 30 days. Not allowed: sending email, opening a live
campaign, changing OAuth, connecting aMember/Sendy/Gmail or deploying to staging/production.

Only the file the user named is used for the real import. Do not look for similar lists,
do not import real-customer fixtures into tests/Git, do not modify the old QA campaign and do not change the original file.

## 2. Evidence and classification of work

### VERIFIED

- Fetched `origin/develop` successfully; the new branch starts from `d85654724c71c9159d9948f81107edf5d501de02`.
  The shared checkout is unchanged. Open Invitations PRs: none at the time of the check.
- PR #1120 accepted the synthetic source; it did not implement importing real customers.
- `invitations/route.js` only accepts `.test`/`.invalid`, member `sandbox-`, at most 200 people.
  The baseline inspection is local only, at most 20 rows over HTTP, and cannot be committed into a campaign.
- `csv.js` has a bounded parser and the mapping `nhom_gui → group_key`;
  `import.js` keeps the source group and unknown flags and does not assign new groups.
- The file the user provided still has 43 columns and 1,340 rows; this pass only printed the header and the total row count.
- Previous aggregate check: the five groups are 318/276/103/351/292 respectively; 42 suppressed and
  1,298 recheck; 1,319 empty internal flags are still unknown; `eligibleNow: null`.
- The real UI is in `packages/web/tracy-harness/src/invitations/`, not a new dsh plugin.
- Gmail has its own OAuth key; that key or the session secret must not be used to encrypt the snapshot.

### UNVERIFIED

- Not confirmed: whether the dev infrastructure already has a key store dedicated to snapshots, that store's backup policy,
  or whether the boss's current user has Ops owner/admin permission.
- No test, benchmark, migration, new UI or import results on dev for this stage yet.
- The user has settled on 30-day retention; enforcement on dev could not be checked because the feature does not exist yet.

This is an **architectural** change because it stores real PII for the first time and adds a campaign type and a data lifecycle;
it is not raising the sandbox limit or removing a validator.

Council per `docs/references/ask-the-council.md`: **not consulted**. The skill/plugin
`claude-council:ask` and the script `query-council.sh` were not found in the catalogue/plugin tree
checked. Per section 4 of the guide, this limitation is recorded; no council answer is faked.
The choices below are the agent's proposals, not the council's conclusions.

## 3. Options

1. **Proposed: a separate `snapshot_review` campaign type, on the same Invitations screen.** It has an encrypted store,
   a paginated list and review content; it has no ability to send or to turn into live.
   It costs extra schema/API but does not weaken the sandbox and does not wait for the live source.
2. Open the whole live intake/sender first: covers too many sources, consent and operations; not
   suited to the current preliminary handover output.
3. Hand over only a spreadsheet on the local machine: faster, but does not provide a campaign on dev to view
   and review together. Only a fallback option if the key infrastructure is not ready.

The option of loosening the sandbox or splitting the file into several batches to get past the fence is not chosen.

## 4. Campaign boundary

- The new campaign has the immutable type `snapshot_review`, snapshot date `2026-10-07`, label
  `Snapshot 07 Oct 2026 — review only`, `sendingEnabled: false`, `eligibleNow: null`.
- A separate store and API namespace, planned as `/api/ops/invitations/snapshots`, ahead of the dynamic sandbox route
  `/:id`. A snapshot ID is not a sandbox campaign ID; the sandbox route must not find it.
- Do not write sandbox/live identity aliases, source readiness, suppression or attempts.
  Do not create real invitation/unsubscribe URLs, attempts, messages, schedules or pilots.
- There is no promote/clone door into real sending. The later live stage must ingest and check the current
  source again, with its own permissions; a snapshot review mark has no value for sending.
- The feature is off by default; it is only turned on explicitly on local/dev with a valid key configuration. A missing key
  or data protection means refusing to import/read PII, with no plaintext fallback.

## 5. Ingestion and the five groups

- Import has two steps, preview → confirm commit. The preview is bound to the operator, digest, schema,
  mapping version, expiry and revision; a commit retry is idempotent and does not create a second campaign.
- Per the user's new request, keep all 43 columns of the exact snapshot file provided, including
  financial data, tax ID, address, website, occupation, notes and enrichment data.
  This scope does not allow looking for more data or uploading another customer file.
- Schema `snapshot-2026-10-07-v1` keeps the order and string values of the 43 checked headers. Store the full
  source data in the encrypted payload, separate from the normalized projection used for identity/group/flags.
  Blanks and the source's numeric/date strings are not retyped or filled in. No need to store an extra
  raw CSV copy duplicating the data; the original file on the machine stays intact.
- The server parses/checks limits/identity/group/flags itself against the correct header schema version, rejecting
  missing/extra/duplicate columns or wrong mappings. It does not trust state/counts sent by the client.
- Reuse the existing parser/import semantics through a suitable extraction; do not write a second eligibility
  engine. The original file does not change; name and full name are source data, the first name is not guessed.
- Keep the five baseline values as they are, mapped to five stable keys with the source labels. Do not compute
  new download/agency/business/personal windows and do not edit groups manually in this stage.
- Flags with a negative → `suppressed`; the rest → `recheck`. Empty is unknown, not false.
  A snapshot state is never `ready` or `eligible`.
- The preview must reconcile total rows/unique/group/state and report errors by code and row number, without putting
  emails into errors/logs. Invalid or conflicting rows stop the whole commit and are never dropped silently.
- 1,340/42/1,298 and the five group numbers are expectations for that exact file, not product result constants.
  Measure again before importing; if they differ, report and stop, and do not edit the data to match.

## 6. Storage and permissions

- New tables hold non-PII metadata and the ciphertext of all 43 source columns/recipients/content/review. AES-256-GCM,
  a new nonce on every write; the AAD binds the ciphertext to the deployment, campaign, payload type and revision.
- A random data key per campaign, kept in an authority store on a separate volume
  outside the PostgreSQL backup, outside the webroot and outside the image/Git. No OAuth/session secret is used.
  Key files and the folder are readable only by the service account; the API does not return keys.
- The authority holds the campaign ID, immutable expiry, completed revision and in-progress write state.
  DB and authority writes use a prepare/finalize protocol under an exclusive lock: on a crash, if the authority is
  missing, pending or the revision mismatches, PII read/write is closed. Mismatches are not auto-fixed with backup data.
- Restoring an old PostgreSQL must not restore read access: a newer authority must reject the old
  revision, and an expired/lost key is not recreated. The authority store is not restored from the DB backup.
  Recovery needs a manual reconcile procedure with an audit, not a skip button.
- Only Ops owner/admin read identities and edit/review content; developers see aggregates/metadata only.
  No accounts are created, no permissions raised and no public links shared for the boss in this task.
- Admin-only access does not replace encryption, expiry, API checks and backup protection. These
  fences are not lowered when moving from the six minimum columns to the full source data.
- Every new route keeps staff admission, Origin for writes, body limits, revision CAS, no-store;
  no PII in URLs, localStorage, audit, console, analytics, errors or evidence documents.
- Return only one page of at most 100 people; group/status/page via non-PII query. Search by identity
  uses a bounded request body, no email in the query string. Expired data must be removed from
  UI state and not shown again after a refresh/error.

## 7. Settled retention

**The user chose: 30 × 24 hours from the successful import commit**, not counted from the snapshot date.
This decision of 11/10/2026 replaces the previously chosen 7 days; it does not change the retention
or data of the old QA campaigns.

- Uncommitted preview: at most 15 minutes; the raw file is only in memory while reading, not stored on the server.
- Snapshot and draft content: share an immutable expiry; editing/reviewing/refreshing does not extend the TTL.
- At expiry, all PII read/edit doors are blocked immediately per the server clock; the UI only keeps aggregate metadata.
- A periodic job cleans up expired ciphertext/previews and destroys expired campaign keys; downtime does not reopen
  data because every request checks expiry and the authority. Deleting the key is crypto-erasure of
  the ciphertext still in the DB backup; it does not claim the backup bytes have been physically deleted.
- Keep non-PII tombstones and aggregates for audit; there are no real suppressions/attempts to clean up.
- The TTL permission applies only to new data of this snapshot stage. Do not delete the old QA or the original CSV
  file in Downloads; do not automatically extend or restore expired campaigns.

## 8. UI and content review

- In Invitations, clearly separate Sandbox and Snapshot review; do not put real recipients into the
  sandbox editor, Setup or actions. Use the existing Ops components/tokens/layout.
- Overview shows the source date, import date, expiry date, totals and the five groups, blocked/recheck,
  a warning that the source has not been checked as current, and that sending is locked.
- Recipients filters by the five groups and state, with pagination. Shows full name/email/member ID and the snapshot
  reason; missing data is never shown as eligible.
- Per-person detail lets owner/admin see all 43 fields per the source header, including empty values;
  the list table still uses the main columns for readability. Do not return all 43 fields of all
  1,340 people just to draw one list page. Developers cannot read the source detail.
- Every source value is displayed as escaped text. Notes are not instructions for an agent;
  HTML, spreadsheet formulas and URLs are never executed, embedded or used to call out automatically.
- Content has five independent plain-text drafts with versions; do not write, or default to, the five real
  emails Sarah approved. Each group has a subject/body and a `Not reviewed`/`Reviewed` status.
- The first stage does not infer first names, has no personal tokens or functional links: group-level content
  is literal text, so the boss reviews the story first. Person names are still visible in Recipients.
  Personalization/bulk generation is a later stage, after name/template semantics are settled.
- `Reviewed` only confirms that exact version of the group-level content. Editing the subject/body drops the
  review mark; it grants no permission to send and is not the sender's `approved`.
- There is no Send, Run sandbox, Reply, source sync, schedule or tracking in snapshot review.
  Missing/expired/key error/403/409 must have real states; unsaved content is kept when a write fails.
- The unsaved guard uses the existing Ops procedure; do not open extra Chrome/background servers just for a demo.

## 9. Mandatory acceptance before the real import

1. A 1,340-row fake fixture with all 43 columns, the five group numbers and the corresponding 42/1,298:
   preview/commit/replay correct; reading back gives all headers/values/blanks as in the source; unknown does not become
   false; conflicts/invalid input write nothing partially. Fake data in every kind of sensitive field.
2. Real PostgreSQL in a privately owned test DB: CAS, retry, rollback, expiry, key missing/tamper,
   AAD copied between campaigns/deployments, prepare/finalize crash and restoring an old revision closes PII.
3. Ciphertext/DB/audit/errors contain no fake source names/emails/member IDs/bodies, financial data, addresses, tax IDs
   or notes in plaintext; only owner/admin permission sees the full source,
   developers do not see it through any detail/search/preview. Check that HTML/URL/formula values
   and fake instructions in notes are not executed and cause no external requests.
4. All sandbox/source/simulate/reply doors with a snapshot ID write no attempts/messages;
   no source/mail transport is called, including requests that deliberately fake state/approval/campaign type.
5. Real UI: all five groups, pagination/filter/count/reload, two competing tabs, 403/409/expiry,
   saving five independent drafts and content changes dropping the review; no send action or real links.
6. New regression, gates, review and exact-head CI per the repo procedure. Do not loosen gates/timeouts
   or use #1120's CI in place of this change; journal + SYSTEM + API reference updated in the same PR.
7. After an allowed dev deploy: check the authority store/backup/TTL using metadata that reveals no secrets;
   accept the fake fixture first. Only then import the exact file through an owner/admin session, read back
   aggregates and reconciliation samples in the browser, without recording PII in Git/evidence/chat.
8. Before/after comparison shows the old QA unchanged. Report implemented/tested/merged/deployed/imported separately;
   do not say a real campaign exists when only the code or a demo is complete.

## 10. Next gate

The user approves the design revised for all 43 columns, 30-day retention and the previously agreed campaign direction. Only then is the implementation plan written
and an execution approach chosen per the skill. No PR opened, no product code written, no keys created, no file
uploaded and no real people imported during the design phase.

References: [full-flow plan](../../../tasks/invitations-implementation-plan.md),
[snapshot check](../../../tasks/invitations-snapshot-2026-10-07-inspection.md),
[handover #1120](../../../tasks/invitations-source-readiness-handoff.md),
[SYSTEM](../../../SYSTEM.md), [council procedure](../../references/ask-the-council.md).
