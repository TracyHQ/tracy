# Invitations — plan for a real-customer campaign, HTML ZIP and custom fields

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development only if the user selects that method. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** The boss sees real customers in five groups, imports five HTML templates with images, configures fields and approves drafts on dev; no real mail is sent.

**Architecture:** Add the path `/api/ops/invitations/real` and its own tables, without loosening the sandbox. PostgreSQL holds content encrypted per row; the campaign key store and the expiry ledger live on a separate volume outside the PostgreSQL backup. Reuse CSV/identity/eligibility and the pure fingerprint; add an HTML renderer with a configurable field catalogue, immutable image versions and a content approval separate from send eligibility.

**Tech Stack:** Node >=22.19, Hono, PostgreSQL/pg, React 19 and `@tracy/ui`; PapaParse 5.5.3, parse5 7.3.0, css-tree 3.2.1, sharp 0.35.5 are already app dependencies. ZIP uses yauzl >=3.4.0, pinned to a specific version verified when doing Task 5, not the transitive 2.10.0. Node crypto AES-256-GCM/HMAC-SHA256; Node test, mounted React and browser acceptance.

**Spec:** [Settled design](../specs/2026-10-11-invitations-real-campaign-design.md).

## Status and authority to implement

- Scope approved 11/10/2026; the user allows implementation up to a merge into **develop** when review/tests pass.
- The plan was approved by the user in chat on 11/10/2026; start implementing directly, do not ask again for authority to implement.
- **Native** chosen: one person executes the tasks sequentially because they share a data contract, one independent reviewer agent at the end of the branch. No separate implementer/reviewer per task.
- One branch `codex/invitations-snapshot-review`, one Draft PR for code, journal, regression and evidence together. Do not push docs as a separate PR.
- The user asks for a progress report every 20 minutes, even when nothing has changed; this line of work's own schedule is on, do not turn back on the two PR1072/1120 monitors that are already complete.
- Fetched and merged `origin/develop` at `a1c5b998c` into the branch; no Invitations changes in the new upstream. Searching open PRs for `invitations` returned `[]` when planning; check again before coding.
- **Council: not consulted**, because no council skill/script was found at the previous check; no fake opinions created. The technical choices here are the planner's proposals per the [process when the council is missing](../../references/ask-the-council.md).

## Global Constraints

- Explicit local/dev only; staging/main/production do not open real campaigns. Do not read OAuth credentials, do not call aMember/Sendy/Gmail, do not send mail or modify Gmail connection state.
- Do not modify/delete the old QA sandbox; the original CSV file stays unchanged. Do not use real customers as test fixtures.
- CSV at most 10 MiB/file, batches of at most 1,000 rows, no limit on total customers/campaign; keep the 43 columns and empty cells, source 07/10/2026, five source groups without guessing. The current parser limits of 10,000 rows/file, 100 columns, 16 KiB/cell stay; the UI says clearly that files can be split, and does not advertise unlimited import in one request.
- Expected snapshot: 1,340 rows; groups 318/276/103/351/292; 42 suppressed and 1,298 recheck, `eligibleNow: null`. Measure again before the real import; if it differs, stop, do not force the data to match the numbers.
- Default retention **30 days from the first successful import**; configurable as an integer 1–365 days for new campaigns, explicit extension before expiry of no more than 365 days from the first import. View/edit/further imports do not extend automatically.
- ZIP <=10 MiB, expanded <=20 MiB, <=50 entries including metadata; HTML <=256 KiB; images <=2 MiB, <=20 million pixels; GIF <=100 frames and <=20 million pixels in total. PNG/JPEG/GIF, no SVG/fonts/video/separate CSS/nested ZIP.
- Only owner/admin see PII; developer sees aggregates. No PII in Git/logs/URLs/search params/browser persistence/evidence. DB/content/images must be encrypted; no plaintext fallback when a key is broken/missing.
- Decisions and TTL use PostgreSQL `clock_timestamp()`, taken after holding the lock, no JS clock in clock-shifted tests. The same `now` value is passed to the key store; restoring the DB does not restore the clock or the ledger outside the DB.
- Approving content is not approving sending. A `recheck` customer can have an approved content draft but still cannot be sent to. Suppressed always shows the reason; do not call the sandbox sender/simulator to try real customers.
- Code/comments/UI/API in English; docs in Vietnamese. The UI continues the real Ops whose document Tracy owns; do not build a new customer shell or a reset inside dsh.
- One Draft PR, update from develop before Ready, merge only when all five latest PR workflows are green on the exact head; do not modify runners/gates/timeouts/exclusions to get green. Clean up exactly the test resources owned, do not leave private test servers/DBs/Chrome running in the background after the check.

## Review Focus

1. **RF1 — restoring an old DB/lost key/expiry right at write time:** expired data cannot be read again, a request does not write new data after expiry; Task 1–2 check with a real DB and a key store still intact/tombstoned.
2. **RF2 — retry/error mid-batch/identity change:** do not publish a half-done import or duplicate people, conflicts are not silently merged; Task 3 checks transactions, multiple imports and two concurrent requests.
3. **RF3 — unknown/empty token/currently hidden condition:** do not guess values, do not run expressions; a value change that makes a section appear still drops approval and keeps the customized draft; Task 4, 6.
4. **RF4 — malicious ZIP/CSS/images and preview:** external resources are not called; budgets apply to actual bytes/frames, not to forged metadata; Task 5, 8 check the parser and browser network.
5. **RF5 — just-revoked permission, late tab/request:** no PII/image leaks and no mixing of campaigns/groups, no loss of unsaved edits; Task 7–8 check real admission, revision and request ordering.

## File map and shared contract

New backend in `apps/tracy-web/src/invitations/`: `real-keys.js` (keys/expiry outside the DB), `real-crypto.js` (envelope), `real-store.js` (transaction/schema), `real-retention.js`, `real-import.js`, `real-fields.js`, `real-render.js`, `real-zip.js`, `real-html.js`, `real-images.js`, `real-content.js`, `real-routes.js`.

Modify composition/config: `apps/tracy-web/src/{app,server,config,cron}.js`. New migration `apps/tracy-web/src/db/migrations/090-invitations-real-campaign.sql`; before creating it, recheck the full filename on develop, do not modify already-merged migrations. Runtime dependency/lockfile in the app **and** root; volume in `deploy/compose.yml`, `deploy/compose.server.yml`, new variable names only in `deploy/.env.example` (do not read/modify env files holding secrets during the code round).

New frontend in `packages/web/tracy-harness/src/invitations/`: `RealCampaign.tsx`, `RealImportPanel.tsx`, `RealRecipients.tsx`, `RealFieldsPanel.tsx`, `RealContentPanel.tsx`, `RealReviewPanel.tsx`, `HtmlPreview.tsx`, `real-api.ts`, `real-state.ts`; `Invitations.tsx` only adds a campaign-type selector and hands off to the separate flow. Stories import the real component in `packages/dev/tracy-design/src/pages/ops/Invitations.stories.tsx`.

Contract types (JS runtime validation + TypeScript UI, no executable code passed):

```text
Envelope = {v:1, iv:string, tag:string, bytes:string}
Context = {campaignId:string, recordId:string, purpose:string, version:number}
Field = {key:string, label:string, source:{kind:'manual'}|{kind:'column',column:string},
         missing:'required'|'default'|'omit', defaultValue?:string}
Registry = {revision:number, fields:Field[], campaignValues:Record<string,string>,
            groupValues:Record<string,Record<string,string>>}
Rendered = {subject:string, html:string, bodyText:string, dependencyFields:string[],
            dependencyFingerprint:string, contentHash:string, assets:AssetRef[]}
AssetRef = {id:string, sha256:string, mediaType:string, width:number,height:number,frames:number}
CampaignView = {id:string,name:string,revision:number,sourceDate:string,
                firstImportedAt:string,expiresAt:string,counts:CampaignCounts,sendingEnabled:false}
CampaignCounts = {total:number,groups:[number,number,number,number,number],
                  suppressed:number,recheck:number}
Page<T> = {items:T[], nextCursor:string|null, total:number, revision:number}
RecipientSummary = {id:string,email:string,firstName:string,group:string,
                    state:'suppressed'|'recheck',contentStatus:string,reasons:string[]}
TemplateInput = {subject:string,html:string,text:string|null,assets:AssetRef[],version:number}
RecipientDetail = RecipientSummary & {rawSource:{headers:string[],values:string[]},
                  provenance:object,values:Record<string,string>,draft:DraftView|null}
DraftView = {revision:number,subject:string,html:string,bodyText:string,assets:AssetRef[],
             customized:boolean,contentApproved:boolean,staleReasons:string[]}
```

Raw source is `{headers:string[], values:string[]}` in exact column order, not turned into an object with a prototype. Recipient/customer/source/registry/templates/drafts/image data live in the envelope; metadata is only UUID, revision, time, group key and counts. Hashes/fingerprints involving PII are stored in the encrypted payload or HMACed with the campaign key; never a public email hash.

Test convention below: the blocks are **the main assertions after fixture setup**, not results already run. RED must be the missing behavior/interface, not a missing dependency or DB. The same command rerun at GREEN must give exit0, fail0 and skip0 for the new tests. For tasks with a DB, provide a separate DB's `TEST_DATABASE_URL` per the infrastructure before the command; do not write the DSN into the plan/log. Each task commit stages only the files under Files, after `git submodule update -- vendor/tracy/deepseek-harness`.

### Task 1: Key store outside the DB backup and encrypted envelope

**Files:** Create `real-keys.js`, `real-crypto.js`; tests `apps/tracy-web/test/invitations-real-keys.test.mjs`, `invitations-real-crypto.test.mjs`.

**Interfaces:**
- `createCampaignKeyStore({root}) -> {create,read,extend,revoke,sweep}`; every method is async, takes a UUID and an ISO `now`, never takes a path from the client. `create({campaignId,expiresAt,initialImportedAt,now})`; `read({campaignId,now}) -> {key:Buffer,indexKey:Buffer,expiresAt}`; `extend({campaignId,expiresAt,now})`; `revoke({campaignId,now})`; `sweep({now,limit}) -> {revoked:number}`.
- `seal({key,context,bytes:Uint8Array}) -> Envelope`; `open({key,context,envelope}) -> Buffer`; `identityKey({indexKey,kind,value}) -> string` (campaign-local, separate email/member namespaces).

- [x] Write tests `aad_and_campaign_isolation`, `tamper_and_missing_key_refuse`, `expiry_and_tombstone_survive_db_restore`, `path_and_symlink_refuse`; asserts that a different campaign/purpose/id/version does not decrypt, a missing/broken key does not create a replacement, an expired one cannot read/extend/create again with the same UUID.

```js
// aad_and_campaign_isolation; key and context are synthetic fixtures.
const envelope = seal({ key, context, bytes: Buffer.from('Synthetic recipient') })
assert.equal(open({ key, context, envelope }).toString(), 'Synthetic recipient')
assert.throws(() => open({ key, context: { ...context, version: context.version + 1 }, envelope }))
assert.throws(() => open({ key: otherCampaignKey, context, envelope }))
```

- [x] Run `node --test apps/tracy-web/test/invitations-real-{keys,crypto}.test.mjs`; confirm RED because the module/interface does not exist yet, not an incidental dependency error.
- [x] Implement AES-256-GCM with a random 12-byte IV, 16-byte tag; AAD is the full Context. Random 32-byte key per campaign and an index key distinct from the content key; no Gmail/session secret.
- [x] Implement the key store with a private directory (0700)/files (0600), allowlisted UUID names, no symlinks, atomic writes/fsync; a per-campaign exclusive lock for create/extend/revoke. The ledger keeps deadlines and tombstones, never restored from the DB. Read does not cache a key beyond the request; a missing ledger fails closed.
- [x] Rerun the tests to GREEN. Each test creates `mkdtemp` and cleans up only its own fixture directory; tests do not write keys/logs outside it.
- [x] `git submodule update -- vendor/tracy/deepseek-harness`; stage the four files explicitly and commit `feat(invitations): isolate real campaign encryption keys`.

### Task 2: Schema, transactions and enforced retention

**Files:** Create migration `090-invitations-real-campaign.sql`, `real-store.js`, `real-retention.js`, test helper `apps/tracy-web/test/_invitations-real.mjs`; modify `config.js`, `server.js`, `cron.js`, `app.js`, `SYSTEM.md`, `deploy/compose.yml`, `deploy/compose.server.yml`, `deploy/.env.example`; tests `invitations-real-store.test.mjs`, `invitations-real-retention.test.mjs`, `config.test.mjs`.

**Interfaces:**
- `realTransaction({pool,keys,campaignId,expectedRevision,write},fn) -> Promise<result>`; callback `(db,{row,now,key,indexKey})`. Lock the row, take the DB clock **after** locking, check revision/expiry and recheck before commit. No network inside the transaction.
- `getRetention({db}) -> number`; `setRetention({db,days,actorId})`; `extendCampaign({pool,keys,campaignId,revision,expiresAt,actorId})`; `sweepRealCampaigns({pool,keys,limit=20}) -> {expired:number,purged:number}`.
- Config `invitationsReal = {enabled:boolean,keyRoot:string|null}` from the **secret-free path** variable `INVITATIONS_REAL_KEY_DIR`. Enabled only for valid local HTTP or the dev environment + exactly `https://cowork.tracy.site`, and a configured root; do not use the sandbox flag as authority for real imports.
- Test helper `withRealDb(fn)` uses `_db.mjs`, a temporary key root and `try/finally`, callback `{pool,keys}`; `seedRealCampaign({pool,keys,days=30}) -> {id,revision,expiresAt}` uses the DB clock and fake data. Do not run these helpers without `TEST_DATABASE_URL`; in the task's verification round a DB must be provided and skips are not accepted.

- [x] RED tests: a fresh migration creates the tables; default 30, settings 0/366/fraction rejected; changing the setting does not change old campaigns; expiry blocks read/write/images; extension only before the deadline and <=365 days from the first import; a DB rollback does not reopen revoked content (RF1).

```js
// retention_defaults_and_validation, inside withRealDb(({ pool, keys }) => ...).
assert.equal(await getRetention({ db: pool }), 30)
for (const days of [0, 366, 1.5]) {
  await assert.rejects(() => setRetention({ db: pool, days, actorId }))
}
const campaign = await seedRealCampaign({ pool, keys })
await keys.revoke({ campaignId: campaign.id, now: dbNow })
await assert.rejects(() => realTransaction({ pool, keys, campaignId: campaign.id, write: false }, () => {}))
```

- [x] Run `node --test apps/tracy-web/test/invitations-real-{store,retention}.test.mjs apps/tracy-web/test/config.test.mjs` on a separate PostgreSQL per the [test infrastructure](../../references/gates-ci-runners.md), using `_db.mjs`; do not connect to shared/dev/old DSNs. Record RED and the number of tests actually run. Rerun the exact command at GREEN; new tests skip0.
- [x] Create tables `invitations_real_setting`, `invitations_real_campaign`, `invitations_real_recipient`, `invitations_real_identity`, `invitations_real_import`, `invitations_real_template`, `invitations_real_asset`, `invitations_real_draft`, `invitations_real_audit`. A separate campaign revision; identities only as campaign-local HMACs. Recipient/raw/source/registry/name in the envelope, no plaintext PII. Audit uses actor account UUID/action/code, no email/body.
- [x] Implement transactions and expiry. Effective expiry = min(DB deadline, key-ledger deadline); restoring the DB does not create/recover keys. Extension writes the ledger under the lock, then the DB; a failure in between can only refuse early, never extend reads beyond the DB deadline. Revoke key/tombstone before purging the DB; keep non-PII counts. The ledger also sweeps UUIDs no longer in the DB to clean orphan keys after a crash/restore.
- [x] Wire a private named volume `invitations-real-keys` only into tracy-web, path `/var/lib/tracy/invitations-real-keys`, not into the image, the dsh host, R2 or the PostgreSQL backup. Compose provides config automatically only for the local profile; the server must enable the path on **dev** in a verified operations step, never enable staging/prod on its own. The service still starts when unconfigured; only the real doors report unavailable.
- [x] Cron uses the existing sweep, at most 20 campaigns/run, no new daemon; both read/write refuse expired data even if cron has not run. Update `SYSTEM.md` in the same task on the tables/key store/restore and the key-loss limitation.
- [x] Run GREEN store/retention/config, check the fixture dump has no canary name/email/body/image bytes; check the backup script only backs up PostgreSQL, not the vault. Commit explicitly `feat(invitations): persist expiring encrypted real campaigns`.

### Task 3: Atomic real import, reconciliation and pagination

**Files:** Create `real-import.js`; modify `import.js` only to re-export the existing pure identity normalizer if needed, without changing behavior, and `_invitations-real.mjs` to add `syntheticSnapshot() -> {csvBytes,headers,rows}` (synthetic 43-column fixture); tests `invitations-real-import.test.mjs`, `invitations-real-pagination.test.mjs`.

**Interfaces:**
- `previewRealImport({pool,keys,campaignId:null|string,csvBytes,name,sourceDate,mapping,actorId}) -> {previewId,digest,revision,counts,issues,expiresAt}`; encrypted payload, preview TTL 30 minutes, the preview's own key from Task 1; the digest is returned to the client and plaintext raw bytes are not stored.
- `commitRealImport({pool,keys,previewId,digest,revision,requestKey,actorId}) -> CampaignView`; the first confirming request itself creates the campaign if it does not exist; firstImportedAt and expiry are taken at DB commit, not the source date/preview date. Retry with the same actor/digest/requestKey returns the same result, a different payload with the same key =409.
- `listRealRecipients({pool,keys,campaignId,group,state,search,cursor,limit}) -> Page<RecipientSummary>`; limit 1–100, opaque cursor bound to campaign/revision. `readRealRecipient({pool,keys,campaignId,recipientId}) -> RecipientDetail` returns the raw row with all columns and source provenance.

- [x] RED: 1,340 synthetic rows/43 columns including empty/unicode/literal formulas; groups 318/276/103/351/292 in the order of spec §3's table; suppressed42/recheck1298; retry does not increase total; a failing second batch gives 0 published; an additional import does not change expiry (RF2).
- [x] Additional RED: email/memberId collisions, contradictory group changes, conflicting raw values are not silently chosen; unknown internal does not become false. Searches containing an email do not go into query/log; page 101 is rejected; a cursor from another campaign/revision is rejected.

```js
// import_is_atomic_and_idempotent; commitInput comes from previewRealImport on syntheticSnapshot().
const campaign = await commitRealImport(commitInput)
assert.deepEqual(campaign.counts, { total: 1340, groups: [318, 276, 103, 351, 292], suppressed: 42, recheck: 1298 })
assert.equal(campaign.sendingEnabled, false)
assert.equal((await commitRealImport(commitInput)).id, campaign.id)
const page = await listRealRecipients({ pool, keys, campaignId: campaign.id, limit: 100 })
assert.equal(page.items.length, 100)
assert.equal(page.total, 1340)
```

- [x] Run RED then GREEN: `node --test apps/tracy-web/test/invitations-real-{import,pagination}.test.mjs`; after GREEN run `node --test apps/tracy-web/test/invitations-{csv,import,eligibility}.test.mjs`. Provide a separate real DB; do not count skips as PASS.
- [x] Use `parseCsv`, `normalizeBaselineRows`, `previewRows` and `BASELINE_MAPPING`; the catalogue keeps exactly the five `nhom_gui` values. Do not duplicate parser/identity/eligibility. Distinguish structural errors that block the import from unknown issues that need review; do not block the whole snapshot just because of a blank internal.
- [x] Store encrypted raw rows and normalized facts with provenance; stage in batches <=1,000, publish the whole import only in one transaction, unique HMAC identity/alias prevents duplicates. Conflicts show row number/code, never raw values in logs. Additional raw source does not overwrite drafts.
- [x] New campaign: lock the preview, take the DB clock, create a new UUID/key with the current retention, then insert campaign/rows/receipt in a transaction; do not reuse the preview key as the campaign key. A rollback error revokes the new key; a crash before the receipt is left for the Task2 orphan sweep. An existing campaign uses `realTransaction`; two requests with the same preview/requestKey must serialize and return the same receipt, never create two campaigns.
- [x] Search only via POST body; no SQL index on plaintext PII. Scan with server-side decryption in chunks of 100 rows, return at most 100; index metadata by campaign/group/state and cursor. Never return the whole campaign. Delete preview ciphertext/key when the TTL ends, keep the non-PII receipt for idempotency within the campaign's lifetime.
- [x] Run GREEN on a separate DB, including the old import/csv/eligibility; confirm two concurrent commits do not duplicate. Commit `feat(invitations): import real recipients without sandbox caps`.

### Task 4: Configurable field catalogue and renderer

**Files:** Create `real-fields.js`, `real-render.js`; tests `invitations-real-fields.test.mjs`, `invitations-real-render.test.mjs`; consume the helper `dependencyFingerprint` from `source-approval.js`, do not use the source binding that requires send-ready.

**Interfaces:**
- `validateRegistry({registry,headers}) -> Registry`; `resolveFields({registry,rawSource,group,recipientValues}) -> {values,presence,provenance}`.
- `inspectTokens({subject,html,text,registry}) -> {unknown:string[],dependencies:string[]}`.
- `renderRealTemplate({template:TemplateInput,registry,rawSource,group,recipientValues,destination,identities}) -> Rendered`; Task4 uses a fixed safe HTML fixture, parse5 to fill text/conditions. Task6 requires the Task5 sanitizer before any user input; the renderer is not a trusted door for unsanitized HTML. Do not import Task5 modules while they do not exist.

- [x] RED: `custom.opening_line` added at runtime without a deploy, customer beats group beats default; blank counts as missing, `required` refuses, `default` substitutes, `omit` only within the matching paragraph. Column mapping only for the chosen columns; raw source is not mutated (RF3).
- [x] RED: unknown tokens are listed for configuration; prototype keys/duplicates/reserved tokens/field URLs/code/eligibility overrides are rejected. Tokens in CSS/src/href/attribute structure are not allowed; customer `<script>` becomes escaped text. Missing first name = `there`, no guessing.

```js
// unknown_tokens_and_hidden_dependencies, with an explicitly registered manual field.
assert.deepEqual(inspectTokens({ subject: '', html: '{{custom.new_field}}', text: null, registry }).unknown, ['custom.new_field'])
const rendered = renderRealTemplate({ ...renderInput, template: { ...template,
  html: '<p data-if-present="custom.opening_line">{{custom.opening_line}}</p>' } })
assert.ok(rendered.dependencyFields.includes('custom.opening_line'))
assert.ok(!rendered.html.includes('data-if-present'))
assert.ok(!rendered.bodyText.includes('{{'))
```

- [x] Run RED then GREEN: `node --test apps/tracy-web/test/invitations-real-{fields,render}.test.mjs`; GREEN regression: `node --test apps/tracy-web/test/invitations-{render,source-approval}.test.mjs` with a separate DB for approval.
- [x] Implement the registry with the default set in the spec; custom namespace `custom.<key>`, ASCII key `[a-z][a-z0-9_]{0,63}`, label <=120 characters, value <=16 KiB, at most 100 custom fields to keep requests bounded. No expression/eval/helper template language.
- [x] Implement the token compiler and `data-if-present` with one registered field per section; record dependencies including currently hidden conditions. Text is generated from the resolved HTML; supplied text containing an omit token is refused, with a prompt to switch to auto-text. The system URL slot is a non-active placeholder; the footer cannot be removed by the field registry.
- [x] Render/hash covers subject/HTML/text/asset hashes/registry and dependency versions; use escaped text, check the subject has no control chars/newlines, <=998 bytes after rendering, HTML<=256KiB/text<=100KiB after rendering. Do not apply the sandbox's 200-char limit to real templates.
- [x] Run GREEN pure tests, old render/source-approval tests keep their semantics. Commit `feat(invitations): configure safe campaign personalization fields`.

### Task 5: Safe ZIP, HTML/CSS and managed images

**Files:** Create `real-zip.js`, `real-html.js`, `real-images.js`; modify `apps/tracy-web/package.json`, `apps/tracy-web/pnpm-lock.yaml`, `pnpm-lock.yaml`; tests `invitations-real-zip.test.mjs`, `invitations-real-html.test.mjs`, `invitations-real-images.test.mjs`.

**Interfaces:**
- `readTemplateZip({bytes,registry}) -> Promise<{html:string,text:string|null,images:{path:string,bytes:Buffer,mediaType:string,sha256:string,width:number,height:number,frames:number}[],warnings:string[]}>`.
- `sanitizeEmailHtml({html,imagePaths,registry}) -> {html:string,assetReferences:string[],warnings:string[],dependencies:string[]}`; `decodeEmailImage({bytes}) -> Promise<{bytes,mediaType,width,height,frames,sha256}>`.

- [x] RED matrix: the spec's exact byte/entry/pixel/frame boundaries, forged size/CRC, expansion bomb, symlink/traversal/backslash/absolute paths, Unicode/case-normalized filename collision, encrypted/nested ZIP, missing/external image, duplicate index.html, supported root/wrapper layouts (RF4).
- [x] RED sanitizer: event/script/form/iframe/meta/base/SVG/namespace-confusion/unknown tags; CSS `url`, escaped `@import`, font-face/expression; anchors remain safe stored links but cannot navigate the preview; tokens cannot manufacture a resource/attribute.

```js
// archive_budgets_and_html_no_external_resources; bytes are generated synthetic ZIP fixtures.
await assert.rejects(() => readTemplateZip({ bytes: Buffer.alloc(10 * 1024 * 1024 + 1), registry }))
await assert.rejects(() => readTemplateZip({ bytes: traversalZip, registry }))
const clean = sanitizeEmailHtml({ html: '<p onclick="alert(1)">Hello</p><script>alert(1)</script>', imagePaths: [], registry })
assert.ok(!/onclick|<script/i.test(clean.html))
assert.ok(clean.warnings.length > 0)
assert.equal(sanitizeEmailHtml({ html: clean.html, imagePaths: [], registry }).html, clean.html)
```

- [x] Run RED then GREEN: `node --test apps/tracy-web/test/invitations-real-{zip,html,images}.test.mjs`; all adversarial fixtures actually run, not just a source grep.
- [x] Bounded dependency resolution: `pnpm view yauzl version engines license --json`, check the npmjs version returned is >=3.4.0 and the advisories for that exact version; if fine, `pnpm --dir apps/tracy-web add --save-exact yauzl@<verified-version>`. Record the actual version in evidence/plan and lock both app/root before committing; do not take the transitive 2.10.0, do not lower the floor on your own if no suitable version exists. Lazy entries + bounded streaming inflate, actual bytes and CRC validation, no filesystem extraction. Only reported `.DS_Store`/`__MACOSX/` ignored; unknown content reports an error. Do not touch vendor.
- [x] Parse via parse5, serialize allowlisted email tags (`html/head/body/title/style/table/thead/tbody/tfoot/tr/td/th/div/span/p/br/hr/h1..h6/a/img/ul/ol/li/strong/em/b/i/u/blockquote`). HTML attributes only layout/title/alt/class plus validated data-if-present/managed image references; unsafe tag subtrees removed with warnings. CSS parse via css-tree, reject Raw/resource-bearing values; at-rules only accept `@media` with bounded literal min/max-width and inner rules under the same allowlist, no import/font-face. Allow literal email typography/spacing/border/table styles; unknown styling removed with warnings, not silently preserved.
- [x] Sharp validates magic and bounds before decode; PNG/JPEG re-encode stripping metadata, animated GIF preserve frames under total-pixel/frame budget, bounded worker/concurrency1. Hash **stored** image bytes; no external fetch, no data URL, no trailing executable/polyglot content retained. Handle animation/version failure as import error, not silently turn GIF static.
- [x] Run GREEN including sanitizer double-parse stability and adversarial library fixtures generated from synthetic bytes. Commit `feat(invitations): validate HTML template archives and image assets`.

### Task 6: Template versions, drafts and content approval

**Files:** Create `real-content.js`; tests `invitations-real-content.test.mjs`, `invitations-real-approval.test.mjs`.

**Interfaces:**
- `previewRealTemplate({pool,keys,campaignId,group,subject,zipBytes,revision,requestKey,actorId}) -> {uploadId,warnings:string[],unknownTokens:string[],preview:{html:string,text:string|null,assets:AssetRef[]}}`; encrypted staged upload TTL30min, not yet an active version; this preview shows the sanitized template and does not fill in fake customer data. Viewing with a specific customer uses `previewRealContent`.
- `saveRealTemplate({pool,keys,campaignId,uploadId,revision,requestKey,actorId}) -> {revision,templateVersion}`; `updateRealFields({pool,keys,campaignId,registry,revision,actorId})`.
- `readRealFields({pool,keys,campaignId}) -> Registry`; `readRealTemplate({pool,keys,campaignId,group}) -> TemplateInput|null`.
- `editRealTemplate({pool,keys,campaignId,group,subject,html,text,assetIds,revision,requestKey,actorId}) -> {revision,templateVersion}`; the same sanitizer, editing HTML creates no external images/links.
- `updateRealRecipientValues({pool,keys,campaignId,recipientId,values,revision,actorId}) -> {revision}`; only registered manual custom fields, does not modify source columns/system values.
- `previewRealContent({pool,keys,campaignId,group,recipientId,revision}) -> Rendered`; read/render only, does not create drafts or approvals.
- `generateRealDrafts({pool,keys,campaignId,group,cursor,limit,replaceExisting,revision,actorId}) -> {revision,created,kept,nextCursor}`; bounded <=100, explicit replacement only for the selected group/recipients.
- `saveRealDraft({pool,keys,campaignId,recipientId,subject,html,text,revision,draftRevision,actorId}) -> {revision,draftRevision}`; `approveRealDraft({pool,keys,campaignId,recipientId,revision,draftRevision,actorId}) -> {revision,contentApproved:true,sendingEnabled:false}`.

- [x] RED: five independent templates; a retry versions once; same filename/changed bytes => new version; old draft assets immutable; default regenerate keeps custom text and reports stale; explicit replace drops approval.
- [x] RED: a change to registry/default/group/customer/source/hidden-condition dependencies drops approval; an unrelated field does not cause other drafts to be overwritten; customized HTML/text stays intact. Content of recheck can be reviewed, send remains false; suppressed does not become ready (RF3).

```js
// content_approval_is_not_send_approval_and_custom_text_survives.
const approval = await approveRealDraft(approvalInput)
assert.equal(approval.contentApproved, true)
assert.equal(approval.sendingEnabled, false)
await updateRealRecipientValues({ ...fieldInput, revision: approval.revision,
  values: { 'custom.opening_line': 'New synthetic opening' } })
const after = await readRealRecipient(recipientInput)
assert.equal(after.draft.contentApproved, false)
assert.equal(after.draft.html, customizedHtml)
assert.equal(after.draft.bodyText, customizedText)
```

- [x] Run RED then GREEN: `node --test apps/tracy-web/test/invitations-real-{content,approval}.test.mjs`; GREEN regression: `node --test apps/tracy-web/test/invitations-{content,sandbox,source-approval}.test.mjs`. Separate DB, all invalidation assertions actually run.
- [x] Store registry/templates/assets/drafts encrypted, each row with UUID + campaign + version AAD. Asset bytes are shared per campaign/version, no 1340 copies of an image. Staged ZIP expiry does not extend the campaign deadline; image references from another campaign/unknown version are refused.
- [x] Approval is `contentApproval={draftRevision,contentHash,dependencyFingerprint,registryRevision,templateVersion,assetHashes,actorId,at}`; do not reuse `bindSourceApproval`, which requires eligibility ready. Read computes the effective status when dependencies change; mutation stores the invalidation reason and keeps draft content. Do not build a second eligibility engine.
- [x] Run GREEN DB tests and old source/sandbox/content, audit contains no content/PII. Commit `feat(invitations): version real drafts and invalidate content approvals`.

### Task 7: Real API, permissions and resource reads

**Files:** Create `real-routes.js`; modify `app.js` (mount **before** the sandbox), `server.js` dependency injection if not already in Task2; tests `invitations-real-routes.test.mjs`, `invitations-real-ops.test.mjs`.

**Interfaces:** `invitationsRealRoutes({pool,config,admit,keys}) -> Hono`; takes no mail/fetcher/live source adapter.

```text
GET  /real                         aggregate + availability, owner/admin also get name
GET  /real/settings                owner/admin
POST /real/settings                {days}
POST /real/imports/preview          bounded binary CSV; fixed metadata header, no PII in URL
POST /real/imports/commit           {previewId,digest,revision,requestKey}
GET  /real/campaigns/:id            CampaignView, no recipients/drafts array
POST /real/campaigns/:id/recipients/query {group,state,search,cursor,limit}
GET  /real/campaigns/:id/recipients/:rid
POST /real/campaigns/:id/extend      {revision,expiresAt,confirm:true}
GET  /real/campaigns/:id/fields
POST /real/campaigns/:id/fields      {revision,registry}
POST /real/campaigns/:id/recipients/:rid/fields {revision,values}
GET  /real/campaigns/:id/templates/:group
POST /real/campaigns/:id/templates/preview  bounded binary ZIP
POST /real/campaigns/:id/templates/commit   {uploadId,revision,requestKey}
POST /real/campaigns/:id/templates/edit     {group,subject,html,text,assetIds,revision,requestKey}
POST /real/campaigns/:id/content-preview    {group,recipientId,revision}
POST /real/campaigns/:id/generate    {group,cursor,limit,replaceExisting,revision}
POST /real/campaigns/:id/recipients/:rid/draft
POST /real/campaigns/:id/recipients/:rid/approve
GET  /real/campaigns/:id/assets/:assetId     bytes after auth + expiry + campaign/version checks
```

Upload metadata is sent in the JSON header `x-invitations-input`, bounded to 4KiB; it holds the campaign name/subject/group, so the header is not logged and no query string is used. CSV/ZIP body stream limited to 10MiB; JSON input limited to 1MiB. Header/body are data, not instructions; errors record a closed code, metadata is not echoed. GET asset cache `no-store`, `nosniff`, media type checked, no public URL.

- [x] RED real admission: no session401, outsider403, developer only aggregates, revoked owner403, CSRF cross-origin/missing Origin403 for mutations; disabled/production closed; IDs/asset versions of another campaign 404; missing key503/expired410 with no partial PII (RF5).
- [x] RED sender routes `/send`/`simulate` in real are always unavailable, no fallback to the sandbox dynamic `/:id`. Mail/fetch canary throws if touched. Errors/logs do not echo CSV/template/customer metadata.

```js
// asset_acl_and_real_sender_closed, using the composed app and real synthetic sessions.
const assetPath = `/api/ops/invitations/real/campaigns/${campaignId}/assets/${assetId}`
assert.equal((await app.request(assetPath)).status, 401)
assert.equal((await app.request(assetPath, { headers: developerHeaders })).status, 403)
assert.equal((await app.request(assetPath, { headers: ownerHeaders })).headers.get('cache-control'), 'no-store')
for (const action of ['send', 'simulate']) {
  assert.equal((await app.request(`/api/ops/invitations/real/campaigns/${campaignId}/${action}`,
    { method: 'POST', headers: ownerMutationHeaders })).status, 404)
}
assert.equal(outboundCalls.length, 0)
```

- [x] Run RED then GREEN: `node --test apps/tracy-web/test/invitations-real-{routes,ops}.test.mjs`; GREEN regression: `node --test apps/tracy-web/test/invitations-{ops,sandbox,gmail}.test.mjs apps/tracy-web/test/{module-graph,cookie-ledger}.test.mjs` on a separate DB, without loosening old guards.
- [x] Mount the sibling real router at the composition root before the existing invitations wildcard. Use the same Ops admission and role model, every request re-reads permissions; no new cookie/secret. Binary+JSON write guards share the origin policy but do not loosen the sandbox guard.
- [x] Bind service methods from Tasks2–6; every campaign write has expectedRevision (settings use their own lock, a new import has no campaign revision yet), reads decrypt only after auth/expiry; `GET` has no side effect creating drafts/approvals. Registry/session failures fail closed, the UI gets codes with a next step.
- [x] Run GREEN real Ops integration, `invitations-ops`, `invitations-sandbox`, `invitations-gmail`, `module-graph`, cookie/mounted route regression. Commit `feat(invitations): expose protected real campaign review APIs`.

### Task 8: Import UI, field editor, preview and review

**Files:** New/modified frontend and story as in the map; tests `packages/web/tracy-harness/test/invitations-real-state.test.mjs`, `invitations-real-flow.test.mjs`; browser test `packages/web/tracy-harness/test/e2e/invitations-real-preview.test.mjs`.

**Interfaces:** `realRequest<T>({path,method,body,signal})`; `uploadReal<T>({path,bytes,metadata,signal})`; `RealCampaign({campaignId,onLeave})`; panels use `CampaignView`, `Page<T>`, `Registry`, `Rendered` from the shared contract. `HtmlPreview({html,assets,campaignId,viewport:'desktop'|'mobile'})`; `real-state.ts` holds query generation/dirty/revision, no persistent browser store.

Pure state: `RealState={campaignId:string,group:string,queryId:number,recipients:RecipientSummary[],cursor:string|null,dirty:boolean}`; `beginRealQuery(state,{campaignId,group}) -> {state:RealState,token:{campaignId,group,queryId}}`; `acceptRealQuery(state,token,page) -> RealState` only accepts a response matching all three keys. API/types in `real-api.ts`; the editor keeps its own version outside the query state and does not overwrite dirty when a query returns.

- [x] RED mounted UI: choosing real does not change the sandbox; import preview/count/errors/confirm; filter by five groups/100-per-page/43-field details; content is not enabled before import; developer renders no PII; expiry immediately clears PII from the view/in-memory cache.
- [x] RED edit fields without a deploy, unknown tokens have a configuration path, required/default/omit are clear; save/reload five independent ZIPs, customize a draft, stale approval keeps text; Cancel navigation/Back/reload keeps the draft; a save error does not reset dirty (RF3/RF5).
- [x] RED request ordering: a late response for campaignA/group2 does not write into campaignB/group1; changing filters resets the cursor; 409 does not overwrite the editor; duplicate click/save disabled while pending; preview does not activate a template by itself.

```js
// late_response_cannot_cross_campaigns; initialState and pageA contain synthetic data only.
const a = beginRealQuery(initialState, { campaignId: 'campaign-a', group: 'group_2' })
const b = beginRealQuery(a.state, { campaignId: 'campaign-b', group: 'group_1' })
assert.deepEqual(acceptRealQuery(b.state, a.token, pageA), b.state)
assert.equal(b.state.cursor, null)
// isolated_preview_has_no_outbound_requests, in the browser test after upload/preview.
assert.deepEqual(externalRequests, [])
assert.equal(scriptExecutions, 0)
assert.equal(navigationsOutsideStand, 0)
```

- [x] Run RED then GREEN: `node --test packages/web/tracy-harness/test/invitations-real-{state,flow}.test.mjs`; browser: `node --test packages/web/tracy-harness/test/e2e/invitations-real-preview.test.mjs`. The browser test uses a private cache and an owned stand, closes the browser/context itself in finally; a missing browser/stand is a blocker, never skip or fake network assertions.
- [x] Use `@tracy/ui` and the existing Ops layout, add a clear real/sandbox selector. The overview distinguishes sourceDate/importAt/expiry, content-approved/send-disabled and 42 blocked/1298 recheck. The file picker/upload does not paste CSV into the 1MiB JSON; do not upload automatically before the preview is confirmed.
- [x] HTML iframe `sandbox=""`, CSP `default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`, no script/same-origin permission/popups. The parent fetches assets with auth after a preview is selected, data images are created only in RAM from managed bytes, replacing verified managed refs; drop href/target/action/meta refresh in the preview. Clear managed-image bytes/srcDoc on campaign change/expiry/unmount; no localStorage/IndexedDB/ServiceWorker PII.
- [x] The browser test feeds a malicious synthetic ZIP through the owned stand's real API, recording request host names without payloads: 0 third-party network, 0 navigation/script/form; managed images show correctly, desktop/mobile do not overflow; when the owner loses permission, no further assets load (RF4/RF5). Look at it for real in light/dark/empty/expired/error; Storybook imports the real component + play assertions, no separate mock copy that drifts.
- [x] Run GREEN mounted/pure/browser suites, build the harness and the related design checks. Do not bring utilities/reset into dsh. Commit `feat(invitations): review real recipients and HTML campaign content in Ops`.

Build: `pnpm --filter @tracy/harness-web build` and `pnpm typecheck`, expected exit0. Browser/mounted tests must import the real component, not only helpers.

### Task 9: Acceptance, regression, PR, merge and dev handoff

**Files:** Update `SYSTEM.md` if anything is still missing; create `tasks/invitations-real-campaign-handoff.md`, `tasks/evidence/invitations-real-campaign/2026-10-11-validation.md`, `tasks/nhat-ky/2026-10-11-invitations-real-campaign.md`; regression ID takes the **real PR number**, case and script/result per `tests/regression/README.md`. Tick the plan according to reality, never record an expected PASS.

- [x] Set up an owned stand and a new DB per the infrastructure; a separate test keys volume, fake source/customer/email `.test`, a fail-if-called transport. Do not use real credentials or import the real snapshot onto the stand. Clean up exactly your own sessions/containers/volumes when done.
- [x] End-to-end synthetic acceptance 1,340×43, two-batch import/retry/rollback; five ZIPs/images/unknown custom fields/mapping; save/reload/drafts/approval invalidation; role revoke/search pagination/asset ACL/expiry/extension/DB restore after revoke. Keep the QA fixtures created, do not clean data in the old QA campaign.
- [x] Run every gate of `pnpm build:check` in the worktree per the current docs (boot-graph can now be materialized; do not apply the old instruction that required modifying the shared checkout). DB-backed tests actually run with 0 skip for the real/related/regression parts. Full suites with old skips must list the exact reasons; do not take a DB-less green as evidence. Mac vendor upstream red cannot be waived; manual full Linux 38144047006 all 7 actual Buildcheck SUCCESS on 22dfc723f. After refresh 39d113e66: 56 non-test gates PASS, 113 feature/1435 impact PASS 0 skip; final-head PR CI still has to pass.
- [x] Whole-feature verification command: `node --test apps/tracy-web/test/invitations-real-*.test.mjs packages/web/tracy-harness/test/invitations-real-*.test.mjs`, then the Task8 browser command; expected fail0/skip0, with a real DB/stand. `pnpm build:check` must exit0, without modifying gates or using a DB-less environment to dodge tests.
- [x] Independent reviewer for the whole branch after implementation per the requesting-code-review skill; handle Important via RED→GREEN, record deferred minors clearly. Use systematic-debugging if any test/CI/UI error is red; do not loosen assertions/gates to pass.
- [ ] When the local gates are sufficient, open **one Draft PR** into develop, attach it to the chat; take the number to create the case `REG-PR-<n>-invitations-real-campaign`, run it to PASS on a stand at the branch's commit, commit result/evidence/journal in the same PR. Description has Before/After/Why/Verified/Regression, check the two local scripts.
- [x] Run `node tests/regression/run.mjs --no-codex --id REG-PR-1207-invitations-real-campaign` through the owned DB wrapper; the acceptance opens/closes its own HTTP stand, so no unused external stand is passed (Ruling22). Clean tree 8c7469648 PASS 74s, 71 PASS/0 FAIL/0 SKIP/0 TODO. The case/script asserts import total 1340/43 columns/5 groups, sendingEnabled false, approved→stale keeps custom text, asset denied on revoke/expiry and outbound 0; not just checking that source code contains keywords. The description/regression scripts use the real PR payload per the README/skill at the Ready step.
- [ ] Fetch/merge the latest develop before Ready, read the new journal, recheck upstream impact and tests. Ready only when all six pr-merge conditions hold, git is clean/fully pushed, no planned commits remain; authorization to merge develop already exists, do not ask again.
- [ ] Watch **the five latest workflows on the exact final head**; do not take Draft-skipped/old-head/manual baselines as evidence. If Auto Merge Develop is on, let the bot merge; only if it does not apply run the two `check-pr-merge.mjs` passes exactly and `gh pr merge --merge --match-head-commit`, never merge by hand in parallel with the bot.
- [ ] Verify the merge commit, then build-app-images/deploy-dev at the right commit; do not push status docs to the merged branch. Dev vault/config readiness must be complete before import; missing permissions/config → report a specific blocker, do not bypass login or read secrets to get around it.
- [ ] Synthetic dev acceptance through a real admin session, check no outbound, read back five groups/custom fields/HTML/images/draft/approval; keep the new QA campaign. Only after that read exactly the CSV snapshot provided, reconcile aggregates, import into **one real campaign** kept for 30 days; if the snapshot/permissions differ from expectations, stop and ask, do not swap the file/pick people yourself.
- [ ] Hand off four states separately: code/merge, dev deployment, synthetic acceptance, real import. Give the campaign ID/link and expiry date, aggregate counts, what is not done (live source/sender/CID email-client verification). Do not say the system can send. Report progress every 20 minutes as the user asked, turn off the dedicated schedule once handoff is complete; do not turn on the PAUSED monitors 1072/1120.

## Plan self-review

- Spec §2–3 → Task3/7/8/9; §4.1–4.2 → Task5/6/8; §4.3 → Task4/6/8; §5–6 → Task1/2/7/9; §7 → global no-send and Task7/9; §8 → acceptance Task9.
- RF1–5 each have RED/GREEN tests in the responsible task, plus browser network and restore tests, not just source grep.
- Tasks1–8 are complete per the ledger/commits. The feature+HTTP+browser suite after review fixes 113 PASS/0 FAIL/0 SKIP; independent reviewer 0 Critical/7 Important/0 Minor, all seven Important have RED→GREEN. Final clock-shift 400: 19 files/152 PASS/0 FAIL/0 SKIP/0 excluded. Full-gates retry finished 56/57 gates, only vendor upstream 22 FAIL on Mac; Task9 still waits for full Linux proof after the develop refresh, regression/PR/CI and deploy/acceptance/import. A docs commit is not authority to import right away.
- Two limitations to report at handoff: the preview does not guarantee every email client looks the same; losing the key/vault means PII cannot be recovered from a DB backup. The snapshot still does not prove current eligibility, even when content is approved.
- Refresh develop f804a7785 (#1166/#1170) merged without conflict and bootstrapped per the new root lock; 113 feature/HTTP/browser + 1223 upstream-impact PASS 0 FAIL 0 SKIP, 56 non-test gates PASS. A fresh DB applied all three 090 full filenames and 091 auth after an assertion correction RED→GREEN; clock 400 on the modified files 7 PASS 0 skip. Full Linux proof/PR-owned regression/release still pending; do not rerun full Mac to repeat the vendor error already cross-checked.
- Manual full Linux 38138513217 on a0d97959c FAILED: 6/7 Buildcheck SUCCESS,
  E2E 318 PASS/1 FAIL/0 SKIP in the new browser test waiting for the saved template of groups 2–5. Running it alone and
  comparing delay/CPU has not reproduced it; only test-only diagnostics added, no production fix
  or root-cause conclusion yet. No Draft PR/merge/deploy/import yet; full Linux proof still required.
- Continued 12/10: full Linux 38144047006/attempt 1 exact 22dfc723f all 7 actual Buildcheck SUCCESS,
  E2E 319 PASS 0 skip. One Draft PR 1207 opened/attached; merge refresh 39d113e66 into 8c7469648,
  113 feature/1435 impact/56 non-test gates/clock 7/regression 71 PASS 0 skip. Cause of the old Linux
  timeout still unidentified; diagnostic-only is not a fix. No final-head PR CI/merge/deploy/import yet.
