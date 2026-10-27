# Plan 2/5 — Seat ledger, site book, GitHub, workspaces, mail: move `seat-registry` + `cowork-web` into `tracy-web`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every door that dsh plugins, `/ops`, the host, and GitHub call today (spec §4.4 + the "doors not for
plugins" section) answers from `tracy-web` on Postgres, **with the same signature and the same shape** — Plan 1's temporary resolver
is replaced by the `site` table, and real roles replace `role: 'owner'` for everyone.

**Architecture:** Each domain is one folder with `store.js` (SQL) + `route.js` (Hono). Handlers are **moved as-is**
from `workers/seat-registry/src/index.js` and `workers/cowork-web/src/worker.js`, changing exactly four things:
(1) `env.X` → `config`, (2) `authenticateSeat`/`sessionEmail`+actor assertion → `viewer(c)` reading
`tracy_sess`, (3) `seats.js` (PostgREST) → `store.js` (SQL), (4) KV/DO → columns/tables. Tests run on
real Postgres (`TEST_DATABASE_URL`); each test file rebuilds the schema.

**Tech Stack:** as in Plan 1. No new dependencies (OAuth calls `fetch` directly; SigV4 by hand like `artifacts.js`).

**Spec:** [`../specs/2026-09-09-tracy-web-host-design.md`](../specs/2026-09-09-tracy-web-host-design.md) §4.3, §4.4, §4.7, §7, §8, §13.1–13.2.

## Global Constraints

- Every constraint of Plan 1 (Node 24, pnpm corepack, English ESM, no cross-domain imports — guarded by the `module-graph` test).
- **The `/api/*` signatures do not change** — the table in spec §4.4 is the contract; the snapshot test in Task 10 checks each line against `workers/cowork-web/src/worker.js:347-411`.
- **Not moved**: Shopify (`handleShopify*`, `handleContent*`, `handleTheme*`, `handleBornStore*`, `handleStoreContent*`), `/git/token`, `/auth/link/*` (`handleLinkBrowser/Poll/Exchange/Approve`), proposals (`handleTeamMerge`, `handleApproveProposal`, `handleRetireProposal`, `publishProposal`, `publishTryOn`), `/workspaces/:id/{mcp,credentials}` (`handle*WorkspaceMcp*`, `handle*WorkspaceCredential*`), `/api/workspaces`, `/me/workspaces*` (SPA). Every other `seat-registry` handler **is** in this plan — Task 10 lists and counts them.
- Column names stay **exactly** as in `workers/seat-registry/schema.sql` in every table moved over, **except** the keys: `seat_site.id/seat_id/granted_by text` → `seat(site_key, account_id, granted_by uuid)`; so Plan 5 T1 is a tested **mapping** pass, not a rename.
- Every refusal keeps **its exact code** (`SEAT_NOT_AUTHORIZED`, `TAKEN`, `INVALID_LABEL`+`reason`, `ALREADY_PROVISIONED`, `KEY_NOT_YOURS`, …) — plugins read them and have text for each code.
- Postgres for tests: `docker compose -f deploy/compose.yml up -d postgres`, `TEST_DATABASE_URL=postgres://tracy:tracy@127.0.0.1:5433/tracy`.

---

## File map

```
apps/tracy-web/src/
  db/migrations/002-book.sql        site · seat · site_role_policy · invite · staff · job · audit · workspace · seat_workspace · workspace_site · workspace_role_policy · merge_ledger · identity
  lib/http.js                       json(c, body, status) · viewer(c, config) · normalizeSiteKey · refusal helpers
  lib/team-invite.js                moved from workers/shared/team-invite.js (sign/verify invite tokens)
  lib/rate.js                       overLimit(store, bucket, limit) on the rate_bucket table
  seats/store.js                    accountByEmail · grantFor · seatsOfSite · sitesOfAccount · grantSite · declineGrant · setGrantRole · revokeGrant · ownersOf · displayNamesFor · acceptGrant · requestSiteJoin · approveSiteJoinRequest · revokeAllGrants · rolePolicy · writeRolePolicy
  seats/route.js                    /api/sites (GET) · /api/team · /api/team/invite · /api/sites/:key/seats/:grant · /api/sites/:key/{accept,leave} · /invite/:token · /<label>/team · /<label>/join · /me/sites/:key/join-request
  seats/roles.js                    moved permissionsFor/roleOf/actingAdmin from index.js + registry.js roleFor/tierFor
  sites/store.js                    siteByKey · siteByLabel · createSite · setHost · setAddress · setRepo · setState · jobs (put/get) · audit
  sites/route.js                    /api/sites (POST) · /api/sites/:key/* (provision, jobs, agent, apply, component-credential, changes, releases, release, moment, file-diff, restore, artifacts/*, viewing-session, DELETE) · /api/site · /sites/:key/address (internal)
  sites/artifacts.js                moved from seat-registry/src/artifacts.js (SigV4, presign) — configured from config.artifacts
  sites/label.js                    (Plan 1) — add labelPrefix
  host/client.js                    hostCall(config, hostName, path, body) — HMAC ts+nonce (Plan 3 verify) · hostJob(...)
  github/app.js                     moved from seat-registry/src/github.js
  github/route.js                   POST /sites/:key/repo (internal, called from sites) · /fleet/git-token · /github/push
  github/store.js                   merge_ledger
  workspaces/store.js               workspaceById/ByName · createWorkspace · workspaceGrantFor · grantWorkspace · seatsOfWorkspace · sitesOfWorkspace · workspaceOfSite · declareSiteWorkspace · acceptWorkspaceGrant · revoke/setRole · tracyAdminWorkspace · tracyAdminRoleOf
  workspaces/route.js               /workspaces/:id/seats[/:grant] · /workspaces/:id (GET/PATCH) · /workspaces (POST) · /me/team/{invite,accept} · /tracy-admin/{overview,whoami,members,sites} · /sites/:key/workspace
  identity/oauth.js                 Google · GitHub code flow, state in oauth_state
  identity/route.js                 (Plan 1) + /signin/:provider, /signin/:provider/callback, /auth/me.defaultSite
  mail/emails.js                    moved from workers/mail/src/emails.js (6 templates kept, 2 biz templates not moved)
  cron.js                           sweepOtp hourly · sweepSessions daily (Plan 4 adds guest_quota)
```

---

### Task 1: Migration 002 — the whole book

**Files:**
- Create: `apps/tracy-web/src/db/migrations/002-book.sql`, `apps/tracy-web/test/_db.mjs` (helper that rebuilds the schema), `apps/tracy-web/test/book-schema.test.mjs`

**Interfaces:**
- Produces: `test/_db.mjs` exports `freshPool()` → `{ pool, close }` that has run `drop schema public cascade; create schema public` and then `migrate()`. Every DB test uses it.

- [ ] **Step 1: Read `workers/seat-registry/schema.sql`** — all of it, in one pass. Write down the columns of `seat`, `seat_site`, `workspace`, `seat_workspace`, `seat_workspace_site`, `site_role_policy`, `workspace_role_policy`, `token_issue`, `apply_audit`, and the trigger `seat_site_keep_one_owner` (move the trigger body as-is).

- [ ] **Step 2: Red test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freshPool } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
test('002 creates the book, and keep_one_owner refuses to strip the last owner', { skip: url ? false : 'set TEST_DATABASE_URL' }, async () => {
  const { pool, close } = await freshPool()
  try {
    const { rows } = await pool.query("select table_name from information_schema.tables where table_schema='public' order by 1")
    const names = rows.map((r) => r.table_name)
    for (const t of ['account', 'identity', 'site', 'seat', 'site_role_policy', 'invite', 'staff', 'job', 'audit', 'workspace', 'seat_workspace', 'workspace_site', 'workspace_role_policy', 'merge_ledger', 'rate_bucket']) assert.ok(names.includes(t), t)
    const a = (await pool.query("insert into account (email) values ('o@x.y') returning id")).rows[0].id
    await pool.query("insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000000', 'local', 'wordpress')")
    await pool.query("insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now())", [a])
    await assert.rejects(pool.query("update seat set role = 'editor' where site_key = 'x.y'"), /owner/)
  } finally { await close() }
})
```

- [ ] **Step 3: `test/_db.mjs`**

```js
import { createPool, migrate } from '../src/db/index.js'
export async function freshPool() {
  const pool = createPool(process.env.TEST_DATABASE_URL)
  await pool.query('drop schema public cascade; create schema public')
  await migrate(pool)
  return { pool, close: () => pool.end() }
}
```

- [ ] **Step 4: `002-book.sql`** — write it in full, no abbreviation:

```sql
-- The seat book and the site book. Column names follow workers/seat-registry/schema.sql so the
-- one-time export (Plan 5) is pg_dump + rename, not a mapping.

create table identity (
  provider text not null,            -- google | github
  subject text not null,
  account_id uuid not null references account(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);
alter table account add column display_name text, add column avatar_url text, add column language text;

create table site (
  site_key text primary key,
  label text not null unique,
  host text not null,
  platform text,                     -- joomla | wordpress | emdash
  origin text,                       -- fleet_born | migrated   (KV state:.origin)
  publish text not null default 'draft',   -- draft | published  (KV state:.publish)
  plan text,                         -- KV state:.plan
  prefix_aware boolean not null default true,   -- KV prefix:<label>
  guest_open boolean not null default false,    -- KV guest:<label>
  address text,                      -- https://<label>.<zone>/ once published
  port int,                          -- host loopback port of the site (from provision)
  repo text,                         -- TracyHQ/<label>
  repo_creator text,
  attached boolean not null default false,      -- KV attached:<label>
  created_by uuid references account(id),
  created_at timestamptz not null default now()
);

create table seat (
  site_key text not null references site(site_key) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer','editor')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  accepted_at timestamptz,
  requested_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  workspace_id uuid,
  primary key (site_key, account_id)
);
-- A site never loses its last living owner. Body copied from schema.sql `seat_site_keep_one_owner`.
create or replace function seat_keep_one_owner() returns trigger language plpgsql as $$
begin
  if (old.role = 'owner') and (new.role <> 'owner' or new.revoked_at is not null) then
    if not exists (select 1 from seat s where s.site_key = old.site_key and s.role = 'owner' and s.revoked_at is null and (s.account_id <> old.account_id)) then
      raise exception 'site % must keep one owner', old.site_key using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger seat_keep_one_owner before update on seat for each row execute function seat_keep_one_owner();

create table site_role_policy (
  site_key text primary key references site(site_key) on delete cascade,
  policy jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table site_role_policy_history (
  id bigserial primary key, site_key text not null, policy jsonb not null, updated_by uuid, updated_at timestamptz not null default now()
);

create table invite (
  token_hash text primary key,
  email text not null,
  role text not null,
  site_keys text[] not null default '{}',
  workspace_id uuid,
  invited_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table staff (
  account_id uuid primary key references account(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer'))
);

create table job (
  id text primary key,
  site_key text not null,
  host text not null,
  kind text not null,                -- provision | webroot-* | teardown | go-live
  state text not null default 'queued',
  step text,
  detail jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index job_site on job(site_key, created_at desc);

create table audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text,
  action text not null,
  site_key text,
  detail jsonb
);

create table workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);
create table seat_workspace (
  workspace_id uuid not null references workspace(id) on delete cascade,
  account_id uuid not null references account(id) on delete cascade,
  role text not null check (role in ('owner','admin','developer')),
  granted_by uuid, granted_at timestamptz not null default now(),
  accepted_at timestamptz, requested_at timestamptz, declined_at timestamptz, revoked_at timestamptz,
  primary key (workspace_id, account_id)
);
create table workspace_site (
  workspace_id uuid not null references workspace(id) on delete cascade,
  site_key text not null references site(site_key) on delete cascade,
  primary key (workspace_id, site_key)
);
create table workspace_role_policy (
  workspace_id uuid primary key references workspace(id) on delete cascade,
  policy jsonb not null, updated_by uuid, updated_at timestamptz not null default now()
);

create table merge_ledger (
  site_key text not null, sha text not null, at timestamptz not null default now(), primary key (site_key, sha)
);

create table rate_bucket (
  bucket text not null, window_start timestamptz not null, count int not null default 0, primary key (bucket, window_start)
);
```

- [ ] **Step 5: PASS → Commit** — `feat(web): migration 002 — the whole book, column names from schema.sql`

---

### Task 2: `lib/http.js`, `lib/rate.js`, `seats/roles.js` — three things every route uses

**Files:**
- Create: `apps/tracy-web/src/lib/http.js`, `apps/tracy-web/src/lib/rate.js`, `apps/tracy-web/src/seats/roles.js`, `apps/tracy-web/test/http.test.mjs`, `apps/tracy-web/test/roles.test.mjs`

**Interfaces:**
```ts
// lib/http.js
json(c, body, status = 200): Response                  // content-type application/json; charset=utf-8
viewer(c, config): Promise<string|null>                 // email from tracy_sess
requireViewer(c, config): Promise<string|Response>      // null → json({code:'NOT_SIGNED_IN'},401)
normalizeSiteKey(raw): string                           // moved verbatim from index.js:221
// lib/rate.js
overLimit(pool, bucket, limitPerHour, now = Date.now()): Promise<boolean>   // rate_bucket per hour
// seats/roles.js — moved as-is from index.js (actingAdmin, roleOf, permissionsFor) + registry.js (tierFor, roleFor made pure)
actingAdmin(grant): boolean; permissionsFor(role, policy): object; ROLES
```

- [ ] **Step 1: Red test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSiteKey } from '../src/lib/http.js'
// `workers/seat-registry/src/index.js` exports nothing, so the witness is a copy of its
// `normalizeSiteKey` (index.js:221-240), pasted here verbatim with a comment naming the source line.
function legacy(raw) { /* paste index.js:221-240 body here */ }
test('normalizeSiteKey answers exactly what the seat book answers', () => {
  for (const raw of ['HTTPS://WWW.JoomlArt.com/', 'x.y', 'bad key', 'a..b', 'wpdemo.localhost']) assert.equal(normalizeSiteKey(raw), legacy(raw))
})
```
⚠ `index.js` does not `export` anything — so the sample code above copies the function into the test under the name `legacy` (noting the source line numbers) rather than `import`ing it. Second test: `overLimit` on Postgres — 3 calls with limit 2 → the 3rd is `true`; in a different hour → `false`.

- [ ] **Step 2: FAIL → Step 3: write the three files** (`http.js` 40 lines; `rate.js` one `insert … on conflict do update set count = rate_bucket.count + 1 returning count`; `roles.js` moves the function bodies as-is, dropping the `env` parameter).

- [ ] **Step 4: PASS → Commit** — `feat(web): http helpers, an hourly rate bucket in Postgres, and the role rules ported`

---

### Task 3: `seats/store.js` — the seat ledger in SQL

**Files:**
- Create: `apps/tracy-web/src/seats/store.js`, `apps/tracy-web/test/seats-store.test.mjs`

**Interfaces** (every function takes `pool` first; the returned shape is the **same** as the function of the same name in `seats.js` — read each function there before writing):
```ts
accountByEmail(pool, email) → { id, email, display_name, avatar_url } | null
ensureAccount(pool, email) → { id }
grantFor(pool, accountId, siteKey) → seat row | null          // accepted, not revoked
seatsOfSite(pool, siteKey) → rows with { seat: { email, display_name } }   // like the old seatsOfSite
sitesOfAccount(pool, accountId) → rows                          // like sitesOfSeat
ownersOf(pool, siteKey) → account rows
grantSite(pool, { siteKey, accountId, role, grantedBy, activate, requested }) → row   // upsert; activate → accepted_at=now()
acceptGrant / declineGrant (pool, siteKey, accountId)
setGrantRole(pool, siteKey, accountId, role) ; revokeGrant(pool, siteKey, accountId) ; revokeAllGrants(pool, accountId)
requestSiteJoin(pool, siteKey, accountId) ; approveSiteJoinRequest(pool, siteKey, accountId, role, by)
displayNamesFor(pool, accountIds) → { [id]: name }
rolePolicy(pool, siteKey) ; writeRolePolicy(pool, siteKey, policy, by)  (writes history)
```

- [ ] **Step 1: Red test — one test per function, on `freshPool()`**; for example:
```js
test('grantSite upserts; a second owner can be demoted but the last cannot', async () => {
  const { pool, close } = await freshPool()
  try {
    await pool.query("insert into site (site_key,label,host) values ('x.y','x-y-1','local')")
    const a = await ensureAccount(pool, 'a@x.y'); const b = await ensureAccount(pool, 'b@x.y')
    await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id, activate: true })
    await grantSite(pool, { siteKey: 'x.y', accountId: b.id, role: 'owner', grantedBy: a.id, activate: true })
    await setGrantRole(pool, 'x.y', b.id, 'editor')
    await assert.rejects(setGrantRole(pool, 'x.y', a.id, 'editor'))
    assert.equal((await grantFor(pool, b.id, 'x.y')).role, 'editor')
    assert.equal(await grantFor(pool, b.id, 'nope'), null)
  } finally { await close() }
})
```
Write the same way for: accept/decline/revoke/leave (revoke = set `revoked_at`), `requestSiteJoin` → `requested_at`, `approveSiteJoinRequest` → `accepted_at` + role, `seatsOfSite` returns no revoked rows, `sitesOfAccount` returns `status` the way `handleMySites` computes it (`accepted|requested|pending`).

- [ ] **Step 2: FAIL → Step 3: write `store.js`** — hand-written SQL, `$1…` parameters, no string concatenation. `SeatStoreRejected`: wrap error `23514` as `{ code: 'LAST_OWNER' }` so the route returns 409 as before.

- [ ] **Step 4: PASS → Commit** — `feat(web): the seat store in SQL, one test per verb`

---

### Task 4: `seats/route.js` + `lib/team-invite.js` + `mail/emails.js` — a site's team

**Files:**
- Create: `apps/tracy-web/src/seats/route.js`, `apps/tracy-web/src/lib/team-invite.js`, `apps/tracy-web/src/mail/emails.js`, `apps/tracy-web/test/seats-route.test.mjs`, `apps/tracy-web/test/team-invite.test.mjs`
- Modify: `apps/tracy-web/src/app.js` (mount `seatsRoutes` before `workspaceRoutes`)

**Interfaces:**
```ts
seatsRoutes({ pool, config, mail, sites, now }) → Hono
   GET  /api/sites                      → { addressPrefix, sites: [{ siteKey, platform, role, status, workspaceId, inviterName, grantedBy, grantedAt, requestedAt, copyUrl, agent }] }   // moved from apiSites + handleMySites; `agent` = '/' when site.attached
   GET  /api/team                       → moved from apiTeam → handleRoster (roster of every site the viewer is admin of)
   POST /api/team/invite                → moved from apiTeamInvite → handleTeamInvite (N sites, one token, one email)
   PATCH|DELETE /api/sites/:key/seats/:grant → moved from apiSeatGrant → handleSetRole / handleRosterRevoke
   POST /api/sites/:key/accept · /leave → moved from apiAcceptInvitation / apiSiteLeave → acceptGrant / handleLeave
   POST /me/sites/:key/join-request     → moved from handleSiteJoinRequest (do plugins call it via /api? check `grep join-request packages/` — if nobody calls it the door still exists, used by /<label>/join)
   GET  /invite/:token                  → moved from cowork-web inviteLink + handleTeamAccept: right email → flip the row, "accepted" page; wrong email → wrongAccountPage
   GET/POST /:label/team · /:label/join → moved from workers/cowork/src/index.js (`serve(request, env, label, siteKey)` :56 is the team page; `serveJoinRequest` :310) — label has no dot and ≠ 'api'
signTeamInvite/verifyTeamInvite         → moved verbatim from workers/shared/team-invite.js (secret = config.sessionSecret, prefix `team-invite:` kept)
emails.js                               → moves all 8 templates of workers/mail/src/emails.js (:197 signupCode, :219 magicLinkCode, :239 inviteMail, :265 removalCodeMail, :295 addedToWorkspace, :412 joinRequestMail, :505 tracyTeamInviteMail, :533 teamInviteMail) — each template has a caller in this plan (grep after moving; any template nobody calls is deleted with a note)
```

- [ ] **Step 1: Red test for the invite token** — equivalent to the old version:
```js
import { signTeamInvite, verifyTeamInvite } from '../src/lib/team-invite.js'
import { signTeamInvite as legacySign, verifyTeamInvite as legacyVerify } from '../../../workers/shared/team-invite.js'
test('a token signed here verifies there, and the reverse', async () => {
  const payload = { email: 'a@x.y', role: 'editor', siteKeys: ['x.y', 'z.w'] }
  const ours = await signTeamInvite(payload, 'k'); const theirs = await legacySign(payload, 'k')
  assert.deepEqual(await legacyVerify(ours, 'k'), payload); assert.deepEqual(await verifyTeamInvite(theirs, 'k'), payload)
})
```
(read the real function signature in `shared/team-invite.js` first; fix the test parameters to match.)

- [ ] **Step 2: Red test for the route** — build the app with `freshPool()`, mint a cookie with `mintSession`, and walk one whole flow:
```js
test('owner invites an editor over two sites; the editor accepts by link; My Sites shows both; owner revokes one', async () => {
  const { pool, close } = await freshPool()
  try {
    const app = buildApp({ config, identity: pgIdentityStore(pool), mail, pool, sites: hostsResolver(config) })  // Plan 1's resolver — `dbSitesResolver` only exists from Task 6
    // seed: two sites + owner seat (direct SQL)
    // POST /api/team/invite {email:'e@x.y', role:'editor', siteKeys:[...]} with the owner cookie → 200, sent[0] contains the link /invite/<token>
    // GET /invite/<token> with e@x.y's cookie → 200; GET /api/sites with cookie e → 2 rows status accepted role editor
    // DELETE /api/sites/x.y/seats/<grantId> with the owner cookie → 200; GET /api/sites (e) → 1 row
    // GET /api/team (e) → 403 (not admin)
  } finally { await close() }
})
```
Also write: `/api/sites` when not signed in → 401 `NOT_SIGNED_IN`; a new account → `{ sites: [] }` 200 (spec: "deliberate", so that Add site shows).

- [ ] **Step 3: FAIL → Step 4: move the handlers.** For each handler: open the source line (table in Task 10), copy the body, change the four things (top of file). `:grant` in `/seats/:grant`: it used to be the `id` of the `seat_site` row; the new key is `(site_key, account_id)` → `:grant` = `account_id`, and the `/api/team` roster returns **`id = account_id`** for each seat — `packages/core/tracy-core/src/site-tabs/TeamView.tsx:124` sends `seat.id`, the plugin does not change.

- [ ] **Step 5: PASS → Commit** — `feat(web): a site's team — roster, invitations by link, roles, leaving — on Postgres`

---

### Task 5: `host/client.js` — call `tracy-host` with a ts+nonce signature

**Files:**
- Create: `apps/tracy-web/src/host/client.js`, `apps/tracy-web/test/host-client.test.mjs`

**Interfaces:**
```ts
hostCall(config, hostName, path, payload = {}, { fetchImpl = fetch } = {}) → { ok, status, body }
   // POST `${config.hosts.get(hostName).origin}/_host${path}`   ← `origin` = tracy-host; `dshOrigin` is the seat door, not used here, headers x-host-timestamp/x-host-nonce/x-host-signature,
   // signature = hmacHex(hostSecret, `${ts}\n${nonce}\nPOST\n/_host${path}\n${sha256Hex(body)}`) — same canonical string as the seat door
hostJob(config, hostName, jobId) → { ok, status, body }      // GET /_host/jobs/:id, same signature (body '')
```
Plan 3 writes the symmetric verifier; the test here checks the signature with `signSeatCall` (Task 4 of Plan 1) on the same input — because it is the same canonical string.

- [ ] Red test → write → PASS → Commit — `feat(web): the host client — one signed call, the seat door's canonical string`

---

### Task 6: `sites/` — the site book and every `/api/sites/:key/*` door

**Files:**
- Create: `apps/tracy-web/src/sites/store.js`, `apps/tracy-web/src/sites/route.js`, `apps/tracy-web/src/sites/artifacts.js`, `apps/tracy-web/src/sites/resolver.js` (replaces the Plan 1 version), `apps/tracy-web/test/sites-store.test.mjs`, `apps/tracy-web/test/sites-route.test.mjs`, `apps/tracy-web/test/artifacts.test.mjs`
- Modify: `apps/tracy-web/src/sites/label.js` (add `labelPrefix`), `apps/tracy-web/src/server.js` (use `dbSitesResolver`)

**Interfaces:**
```ts
// store.js
siteByKey(pool, key) · siteByLabel(pool, label) · createSite(pool, { siteKey, label, host, platform, origin, createdBy }) · setHost · setPort · setAddress(pool, key, { address, publish }) · setRepo · setAttached · setGuestOpen · deleteSite
putJob(pool, { id, siteKey, host, kind }) · updateJob(pool, id, fields) · jobById(pool, id) · audit(pool, { actor, action, siteKey, detail })
// resolver.js (replaces Plan 1)
dbSitesResolver(pool, config) → { hostOf(siteKey) [reads site.host], dshOf, labelOf, siteScope, siteOf(siteKey) }
siteTarget(site, config) → URL   // DEFINED HERE (Plan 4 reuses it): site.host === config.hostName ? `http://${site.label}-web-1/` : `https://${site.label}.${site.host}-sites.${config.siteDomain}/`
   // `<label>-web-1` is reachable because render-compose.sh (Plan 3 T2) puts EVERY site on the external network `tracy_tracy` — unconditionally, both local and server. The site publishes `127.0.0.1:<port>` so host-gateway CANNOT reach it; measured 09/09 (render-compose.sh:198).
// route.js — one source handler per line:
POST /api/sites                       apiCreateSite (worker.js:1665) + handleCreateSite (index.js:1101) + handleProvision (1212): book → hostCall('/provision', instruction) → job
GET  /api/sites/:key/jobs/:id         apiSiteJob (worker.js:1831) + handleProvisionJob (index.js:1499): hostJob → when done: setPort, setAddress(draft, local: `http://<label>.<SITE_DOMAIN>:<tracy-web port>`), custody (ensureComponentCustody **worker.js:1763** — dials `siteTarget`, not address), repo (Task 7), attach (ensureSiteAttached **worker.js:1970** → hostCall('/attach'))
POST /api/sites/:key/provision        apiSiteProvision (3048) — import branch (webrootKey/dbKey)
POST /api/sites/:key/agent            apiSiteAgent (2022) + handleAttachSite (7615): hostCall('/attach') → setAttached
POST /api/sites/:key/apply            apiSiteApply (2970) + handleApply (2334)
PUT  /api/sites/:key/component-credential   apiSiteComponentCredential (3009) + handleSetComponentCredential (2116)
GET  /api/sites/:key/changes|releases · POST release|moment · GET file-diff · POST restore   apiSiteData (2742), apiSiteRelease (2801), apiSiteMoment (2940), apiSiteFileDiff (2893), apiSiteRestore (2914) → handleSiteJob (1391) → hostCall('/site', { kind: 'webroot-…' })
POST /api/sites/:key/artifacts/:step  apiSiteArtifact (3102) + handleArtifact (1585) — artifacts.js
GET  /api/sites/:key/viewing-session  apiViewingSession (1616) + handleCoworkSession (1477)
POST /api/site                        apiPickSite (1502)
DELETE /api/sites/:key                apiSiteDelete (2856) + handleTeardown (7923) → hostCall('/teardown')
POST /sites/:key/address (internal)   handlePublish (472) branch 'draft'|'live'|'state-read' — DNS/ingress via hostCall('/address') only when site.host ≠ local (Plan 3)
```
Drop from `handleProvision`: `accessAud/accessTeamDomain`. Keep `gitToken/gitRepo` (Task 7 supplies them).

- [ ] **Step 1: Red test `artifacts.test.mjs`** — the SigV4 signature is equivalent to `workers/seat-registry/src/artifacts.js` `presign(store, { method, key, query, expiresIn })` (:89): that function calls `Date.now()` internally, so the test **pins `Date.now`** (`const real = Date.now; Date.now = () => 1_700_000_000_000; try {…} finally { Date.now = real }`) and compares **the whole URL**; the new version also takes an optional `now` so the test doesn't have to pin.

- [ ] **Step 2: Red test `sites-route.test.mjs`** — a fake host via a `fetchImpl` that records calls:
```js
test('POST /api/sites: a bad label is refused with its reason; a good one claims the name and starts a provision on the default host', async () => {
  // reserved label 'api' → 400 { code:'INVALID_LABEL', reason:'reserved' }
  // 'lantern' → 202 { siteKey:'lantern.localhost', jobId }; fake host saw POST /_host/provision with { label:'lantern', platform:'wordpress', fresh:true, ownerEmail, siteKey }
  // second POST 'lantern' → 409 TAKEN
})
test('job poll: done → address set to <label>.localhost, attach called, row says agent "/"', ...)
test('artifacts: begin returns a key under sites/<labelPrefix>/; part with a foreign key → 403 KEY_NOT_YOURS', ...)
test('DELETE /api/sites/:key by an editor → 403; by the owner → host /teardown called and the row is gone', ...)
```

- [ ] **Step 3: FAIL → Step 4: move.** `fleetHostForNewSite` → `config.defaultHost`. `fleetHostOfRecord` → `site.host`. KV `host:`/`attached:`/`state:` → columns. `SEAT_CACHE job:` → table `job` (job owner = `site_key`). `overLimit` → `lib/rate.js`. `dshUp` (probe cache `lane:`) → `site.attached`.

- [ ] **Step 5: PASS. Replace the resolver in `server.js`; Plan 1's `proxy` test stays green because `hostOf` now reads the DB — seed a `site` row in that test.**

- [ ] **Step 6: Commit** — `feat(web): the site book — create, provision, jobs, apply, webroot doors, artifacts, teardown`

---

### Task 7: `github/` — auto-created repo, hourly tokens, police

**Files:**
- Create: `apps/tracy-web/src/github/app.js`, `apps/tracy-web/src/github/route.js`, `apps/tracy-web/src/github/store.js`, `apps/tracy-web/test/github.test.mjs`
- Modify: `apps/tracy-web/src/config.js` (add `github: { appId, privateKey, org, webhookSecret } | null` — empty = off), `apps/tracy-web/src/sites/route.js` (call `createRepoFor` when the job is done and supply `gitToken` at provision)

**Interfaces:**
```ts
// app.js — moved verbatim from seat-registry/src/github.js (TOKEN_PERMISSIONS, CREATE_PERMISSIONS, installationIdFor, mintTokenFor, createSiteRepo, ensureRepoWebhook, revokeAtGitHub, hostRepoMissing, ownsRepo), env → config.github
// route.js
createRepoFor(pool, config, { siteKey, label, email }) → { repo } | { code }        // moved from handleCreateRepo (7686) + wireFleetRepo (~700-740): create TracyHQ/<label>, police webhook → `${config.origin}/github/push`, setRepo
POST /fleet/git-token                  // moved from handleFleetGitToken (1003) — signed with HOST_SECRET_<host> (the host calls it), FLEET_SHARED_REPOS kept
POST /github/push                      // moved from handleGithubPushPolice (1820) — merge_ledger
```
⚠ The second webhook of `wireFleetRepo` points to `FLEET_HOOK_URL = hooks.tracy.ai/github` (DO, Desk) — **not moved**.

- [ ] Test: `mintTokenFor` with a fake `fetchImpl` returning installation + token; `createRepoFor` creates and then writes `site.repo`; `/github/push` with a wrong signature → 401, correct → 200 and `merge_ledger` has a row when the SHA is named; empty config → every door returns `{ code: 'GITHUB_NOT_CONFIGURED' }` 503 and `createRepoFor` returns `{ code: 'NOT_CONFIGURED' }` while **the job is still done** (spec §13.1).
- [ ] Commit — `feat(web): GitHub carried whole — repo per site, one-hour tokens for the host, the push police`

---

### Task 8: `workspaces/` — agencies and the Tracy team

**Files:**
- Create: `apps/tracy-web/src/workspaces/store.js`, `apps/tracy-web/src/workspaces/route.js`, `apps/tracy-web/test/workspaces.test.mjs`

**Interfaces:** move from `seats.js` the functions `workspaceById/ByName, createWorkspace, updateWorkspace, workspaceGrantFor, grantWorkspace, acceptWorkspaceGrant, declineWorkspaceGrant, setWorkspaceGrantRole, revokeWorkspaceGrant, workspaceOfSite, declareSiteWorkspace, undeclareSiteWorkspace, sitesOfWorkspace, seatsOfWorkspace, ownersOfWorkspace, tracyAdminWorkspace, tracyAdminRoleOf, workspaceRolePolicy/write`; the route moves `handleWorkspaceRoster (4921), handleWorkspaceRosterRevoke (5123), handleWorkspaceSetRole (5169), handlePatchWorkspace (5224), handleCreateWorkspace (7142), handleDeclareSiteWorkspace (5499), handleSiteWorkspaceRead (5046), handleJoinRequest (5074), handleWorkspaceDecision (7341), handleWorkspaceLeave (7395), handleTracyAdminMembers (5626), handleTracyAdminAddMember (5672), handleTracyAdminRemovalCode (5867), handleTracyAdminRemoveMember (5928), handleTracyAdminOverview (6037), handleTracyAdminSites (6160), /me/team/{invite,accept} (8522)`. Do `seats/route.js` `handleCreateRepo` and `apiTeam` call `workspaceGrantFor` through **an exported function of `workspaces/store.js`? — NO (cross import)**: `seats/route.js` receives `workspaces` via `deps` from `app.js` (dependency injection), and the graph test stays green.

- [ ] Test: an agency owner creates a workspace → declares a site into the workspace → invites a workspace admin → that admin can change roles on the site (via `/api/sites/:key/seats/:grant`); `tracy-admin/whoami` returns `staff` for an account in the `tracy_admin` workspace, 403 for anyone else.
- [ ] Commit — `feat(web): workspaces — an agency's grant on its sites, and Tracy's own team`

---

### Task 9: OAuth Google/GitHub + `defaultSite` + cron

**Files:**
- Create: `apps/tracy-web/src/identity/oauth.js`, `apps/tracy-web/src/cron.js`, `apps/tracy-web/test/oauth.test.mjs`
- Modify: `apps/tracy-web/src/identity/route.js`, `apps/tracy-web/src/config.js` (`oauth: { google?: {id,secret}, github?: {id,secret} }`), `apps/tracy-web/src/server.js` (start cron)

**Interfaces:**
```ts
authorizeUrl(provider, config, state) → string
   google: https://accounts.google.com/o/oauth2/v2/auth?client_id&redirect_uri=${origin}/signin/google/callback&response_type=code&scope=openid%20email&state
   github: https://github.com/login/oauth/authorize?client_id&redirect_uri=${origin}/signin/github/callback&scope=user:email&state
exchangeCode(provider, config, code, { fetchImpl }) → { email, subject }
   google: POST https://oauth2.googleapis.com/token → id_token → decode payload.email (signature verified? — NOT needed: the token comes straight from Google over TLS, the same stance as Supabase); github: POST https://github.com/login/oauth/access_token (Accept: application/json) → GET https://api.github.com/user/emails → primary verified
GET /signin/:provider → 302 authorizeUrl, state stored in oauth_state (next, 10 minutes)
GET /signin/:provider/callback → exchange → identity upsert (provider, subject) → account by email (create if missing) → cookie → 302 next
GET /auth/me → { email, defaultSite }: defaultSite = first site in sitesOfAccount(accepted) or null
cron.js: start(pool, config) — setInterval 1h: delete expired otp_code/oauth_state + `delete from rate_bucket where window_start < now() - interval '2 days'` (replaces the guest_quota sweep); daily at 03:17 (machine time): for each host call /gateway/seat/sweep (the real body is at **worker.js:899-960**, `scheduled()` :321 only calls `gcGuestVisitors`) — both after pg_try_advisory_lock(7_243_002)
GET / (no siteKey, with session) → 302 `/<defaultSite>/`; no session → 302 `/${config.guestSiteKey}/` when set, otherwise `/login` (replaces Plan 1 T8's 404; moved from `worker.js:776` and `openSite` :1154)
```

- [ ] Test: `authorizeUrl` has the right parameters; callback with a fake `fetchImpl` → cookie set, `identity` has a row, two callbacks with the same subject don't create two accounts; unknown state → 400; `/auth/me` with one seat → `defaultSite` = that site.
- [ ] Commit — `feat(web): sign in with Google or GitHub, straight to the provider; defaultSite; the sweeps`

---

### Task 10: Contract — route snapshot, count of moved handlers, gates green

**Files:**
- Create: `apps/tracy-web/test/contract.test.mjs`, `apps/tracy-web/test/ported.test.mjs`
- Modify: `tasks/nhat-ky-main.md`

- [ ] **Step 1: `contract.test.mjs`** — the `[method, path]` list copied **from** `workers/cowork-web/src/worker.js:347-411` (read it again, do not copy from the spec) + the "doors not for plugins" section of spec §4.4; for each pair send a request **without a cookie** to the new app and assert it returns **401 or a 4xx with a `code`**, not 404 — i.e. the door exists. Any door that returns 404 was missed.

- [ ] **Step 2: `ported.test.mjs`** — read `workers/seat-registry/src/index.js`, take every `async function handleX(`, minus the **not moved** list (Global Constraints), and assert each remaining name appears in a `// ported: handleX` comment in `apps/tracy-web/src/**` — a cheap way to keep a handler from being silently forgotten. This test is **deleted in Plan 5** together with `workers/`.

- [ ] **Step 3:** `pnpm lint && pnpm test:workers && pnpm build:check` green. Journal: entry "seat ledger/site book runs on `tracy-web`; `workers/` still deploys as before until Plan 5". Commit — `feat(web): the contract tests — every door plugins call exists, every handler kept is accounted for`

---

### Task 11: Addresses and domain names — in one place, in both `apps/` and plugins

**Why (Lucas, 09/09):** *"hardcoding the production domain makes dev/local hard and error-prone — bring it into one place."*
Measured 09/09 in `packages/*/src` (not counting the retired SPA and the design bench): `tracy-add-site` (`wizard.tsx`,
`import.ts`, `site-label.mjs`, `fork-url.mjs`), `tracy-i18n/preference.ts` (**`Domain=.tracy.ai`** for the language
cookie — wrong right away on local), `tracy-site-tools/host`, `tracy-settings`, `tracy-tab-link/dsh-url.ts`,
`tracy-harness/App.tsx`, `tracy-desktop/main.js` (`https://cowork.tracy.ai`). Plus in the Worker: `session.js`
`Domain=.tracy.ai`, `fleet-bar` badge `https://tracy.ai/dashboard/badge.js`, `shared/urls.js` `LOGIN_ORIGIN`,
`fleet.js` zone, `HOST_ORG='TracyHQ'` — each of these Plans 1–4 already put into `config.js` when moving them; this task guards against
them coming back, and finishes the plugin side.

**Files:**
- Create: `apps/tracy-web/src/public/config-door.js` (`GET /api/config`), `packages/core/tracy-core/src/config/index.mjs` (+ test), `scripts/check-origins.ts` (rewritten — see below)
- Modify: the plugin files listed above; `apps/tracy-web/src/config.js` (`badgeUrl`, `hostOrg`, `siteDomainAliases`)

**Interfaces:**
```ts
GET /api/config (public, cache 60s) → { origin, siteDomain, siteDomainAliases, cookieDomain, badgeUrl, hostOrg }
// @tracy/core/config — once per page, plugins use it instead of literals:
tracyConfig(): Promise<Config>       // fetch('/api/config') via dshUrl? NO — this door is at the root like /auth/me (dsh-url.ts lists four root paths; add a fifth)
```
Replace according to the table (one commit per file, `pnpm --filter <package> build` so `lib/client.js` is updated — RULE #3):

| File | Literal | Replace with |
|---|---|---|
| `tracy-i18n/src/preference.ts` | `Domain=.tracy.ai` | `cookieDomain` from config; empty → don't write `Domain` |
| `tracy-add-site/src/client/site-label.mjs` `fork-url.mjs` | `tracy.ai` in the refusal rules | a `zone` parameter, the caller passes `siteDomain` (keep the parity test with the server-side `site-label.js` — the server also takes `zone`) |
| `tracy-add-site/src/client/{wizard,import}.ts(x)` | `.tracy.ai` in display strings/URLs | `siteDomain`, `origin` |
| `tracy-site-tools/src/host/index.ts`, `tracy-settings`, `tracy-tab-link/dsh-url.ts`, `tracy-harness/App.tsx` | as above | as above (explanatory comments stay) |
| `tracy-desktop/src/main.js` | `https://cowork.tracy.ai` | env `TRACY_DESKTOP_ORIGIN` (already in `.env.native.example`) with that default — the desktop is a client machine, a production default is correct |

**The `check-origins.ts` gate rewritten**, scanning `apps/*/src` + `packages/*/src` (except `dev/tracy-design`, `web/tracy-frontend` — deleted in Plan 5): a literal matching `tracy\.ai|TracyHQ|cowork\.|hooks\.|seats\.` outside `config.js`, `*.example`, tests, and comments → red, with file name and line. There is no "declared with a reason" list any more — the only place to declare a reason is `deploy/.env.example`.

- [ ] Test `tracyConfig()` with a fake `fetch`; test the gate on a bait file with a literal → red, without → green.
- [ ] Commit — `feat(config): one door and one env for every address — no production domain left in code`
