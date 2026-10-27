// Task 10, Step 1: the contract gate. Every door a caller (dsh plugin, `/ops`, host, GitHub) has
// today keeps answering from `tracy-web` — this test is built to catch a dropped door, not to
// pass. The door list below is transcribed from TWO sources, read directly rather than copied
// from the plan or from another task's summary:
//
//   (a) `workers/cowork-web/src/worker.js:347-411` — every `if (url.pathname === ...)` /
//       `url.pathname.match(...)` line in that range, one [method, path] pair per branch;
//   (b) spec §4.4's "doors not for plugins but with other callers" paragraph — the doors other
//       callers (host's relay script, GitHub's webhook, `/ops`) reach directly, carried under the
//       exact same name.
//
// For each door: an unauthenticated request must land on a REAL handler — a 401, or another 4xx
// carrying a `code`. A door that is NOT registered does not answer 404 in this app: `app.js`
// mounts a dsh catch-all LAST (`workspace/route.js`'s `app.all('/*', …)`, ADR 0004 "dsh IS the
// shell") that claims every path no earlier route matched, and for a signed-out caller on any of
// these paths (none has a dot in its first segment, so none is ever mistaken for a site key) that
// catch-all answers a 302 to `/login` — measured directly for this test, not assumed. So the real
// failure signature here is "302 to /login", and a bare 404 with no `code` is equally suspect: the
// assertion below rejects both. See SPECIAL_CASES for the one door (`GET /invite/:token`) whose
// OWN correct behavior for a bad token is a 404 with a real page, and EXCLUDED_DOORS/
// KNOWN_MISSING_DOOR for the doors proven absent (a 302 to `/login`) on purpose.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { hostCall, hostJob } from '../src/host/client.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  // Only so `/fleet/git-token` and `/github/push` (spec §4.4's "doors not for plugins" group) reach
  // their own signature check instead of bailing early on `GITHUB_NOT_CONFIGURED` (503 — neither
  // 401 nor a 4xx, so it would not prove the door itself exists). Values are shape-only; nothing
  // here signs a real request.
  GITHUB_APP_ID: '900123',
  GITHUB_APP_PRIVATE_KEY: 'not-a-real-key',
  GITHUB_ORG: 'TracyHQ',
  GITHUB_WEBHOOK_SECRET: 'whsec-test-only'
}

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob }
  })
  const send = (method, path, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {})
      })
    )
  return { app, send }
}

// [method, path] — transcribed from `workers/cowork-web/src/worker.js:347-411`, in the order the
// lines appear there. Placeholders (`example.com`, a hex-looking id, a token) never resolve to a
// real row — every door below is expected to refuse on AUTHENTICATION before it would ever look
// one up, so the placeholder's shape only has to satisfy each route's own path pattern.
const DOORS_FROM_WORKER_347_411 = [
  ['GET', '/api/sites'], // :347
  ['POST', '/api/sites'], // :348
  // :349 `GET /api/workspaces` — EXCLUDED, see below (spec §4.4: "Dropped: `/api/workspaces` (only the retired SPA)").
  ['GET', '/api/team'], // :353
  ['POST', '/api/team/invite'], // :354
  ['PATCH', '/api/sites/example.com/seats/00000000-0000-0000-0000-000000000000'], // :355-357
  ['DELETE', '/api/sites/example.com/seats/00000000-0000-0000-0000-000000000000'], // :355-357
  // :360-361 `GET /invite/:token` — SPECIAL_CASE, see below (a made-up token legitimately 404s).
  ['GET', '/api/sites/example.com/viewing-session'], // :364-365
  ['GET', '/api/sites/example.com/jobs/abcdef123456'], // :366-367
  ['GET', '/api/sites/example.com/changes'], // :371-373
  // :371-375 `/releases` and `/release` were renamed `/backups` and `/backup` on 03/10/2026 (ADR 0024):
  // no caller outside this repo used them yet (`docs/references/api-changelog.md`).
  ['GET', '/api/sites/example.com/backups'],
  ['POST', '/api/sites/example.com/backup'],
  ['POST', '/api/sites/example.com/moment'], // :376-377
  ['POST', '/api/sites/example.com/apply'], // :381-382
  ['PUT', '/api/sites/example.com/component-credential'], // :383-385
  ['GET', '/api/sites/example.com/file-diff'], // :386-387
  ['POST', '/api/sites/example.com/restore'], // :388-389
  ['POST', '/api/sites/example.com/leave'], // :392-393
  ['DELETE', '/api/sites/example.com'], // :394-395
  ['POST', '/api/sites/example.com/artifacts/begin'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/part'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/finish'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/abort'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/put'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/fetch'], // :398-402
  ['POST', '/api/sites/example.com/artifacts/delete'], // :398-402
  ['POST', '/api/sites/example.com/accept'], // :404-405
  ['POST', '/api/sites/example.com/provision'], // :406-407
  ['POST', '/api/sites/example.com/agent'], // :408-409
  // :410 `POST /auth/signout` — SPECIAL_CASE, see below (always 200, by design, no cookie needed).
  ['POST', '/api/site'] // :411
]

// [method, path] — transcribed from spec §4.4's "doors not for plugins but with other callers"
// paragraph: `POST /fleet/git-token`, `POST /github/push`,
// `/tracy-admin/{overview,whoami,members,sites}`, `/me/team/{invite,accept}`,
// `/workspaces/:id/seats[/:id]`.
const DOORS_FROM_SPEC_4_4_OTHER_CALLERS = [
  ['POST', '/fleet/git-token'],
  ['POST', '/github/push'],
  ['GET', '/tracy-admin/overview'],
  ['GET', '/tracy-admin/whoami'],
  ['GET', '/tracy-admin/members'],
  ['POST', '/tracy-admin/members'],
  // `/tracy-admin/sites` — KNOWN_MISSING, see below.
  // `/me/team/invite`, `/me/team/accept` — EXCLUDED, see below.
  ['GET', '/workspaces/00000000-0000-0000-0000-000000000000/seats'],
  ['POST', '/workspaces/00000000-0000-0000-0000-000000000000/seats'],
  ['PATCH', '/workspaces/00000000-0000-0000-0000-000000000000/seats/00000000-0000-0000-0000-000000000001'],
  ['DELETE', '/workspaces/00000000-0000-0000-0000-000000000000/seats/00000000-0000-0000-0000-000000000001']
]

/**
 * Doors named by one of the two sources above that do NOT exist in `tracy-web` on purpose — each
 * with the reason and where that decision is recorded, so an absence here reads as a citation, not
 * a silent gap. A door landing in this list without also being asserted-404 below would be exactly
 * the kind of thing this test exists to prevent, so `EXCLUDED_DOORS` below is verified, not just
 * declared.
 */
const EXCLUDED_DOORS = [
  {
    method: 'GET',
    path: '/api/workspaces',
    reason: 'spec §4.4: "Bỏ: `/api/workspaces` (chỉ SPA đã nghỉ)" — the retired SPA was its only caller.'
  },
  {
    method: 'POST',
    path: '/me/team/invite',
    reason:
      'Same `handleTeamInvite` this app already carries as `POST /api/team/invite` (seats/route.js) — ' +
      'task-8-report.md: "I did not duplicate it under the Worker\'s alternate URL shape."'
  },
  {
    method: 'POST',
    path: '/me/team/accept',
    reason:
      'Same `handleTeamAccept` this app already carries as `GET /invite/:token` (seats/route.js) — ' +
      'task-8-report.md: "I did not duplicate it under the Worker\'s alternate URL shape."'
  }
]

/**
 * The one door spec §4.4 names that is genuinely absent, not merely renamed — the Task 10 brief's
 * own "one door known missing and deliberately deferred". `workspaces/route.js`'s own "NOT PORTED,
 * WITH REASON" module docstring: needs live fleet tunnel ingress and a KV-style health cache this
 * app has no equivalent of yet; deferred to Plan 3/4 per the coordinator's Fix Round 2 ruling.
 * Asserted below (a 302 to `/login` — the dsh catch-all's own signature, see the file header) so a
 * future fix is required to touch THIS test, not merely to remember to.
 */
const KNOWN_MISSING_DOOR = { method: 'GET', path: '/tracy-admin/sites' }

/** True for a response that landed on a real API handler rather than falling through to the dsh
 *  catch-all: a 401, or another 4xx whose body carries a non-empty `code`. Never true for a 3xx
 *  (the catch-all's own redirect-to-`/login` signature, measured directly — see the file header)
 *  or for a bare 404/other status with no `code`. */
async function answeredByARealHandler(res) {
  if (res.status === 401) return true
  if (res.status < 400 || res.status >= 500) return false
  const body = await res
    .clone()
    .json()
    .catch(() => null)
  return Boolean(body && typeof body.code === 'string' && body.code !== '')
}

test(
  'every door from worker.js:347-411 and spec §4.4\'s "cửa không cho plugin" group reaches a real handler unauthenticated (401, or a 4xx carrying `code` — never the dsh catch-all\'s 302)',
  opts,
  async () => {
    const { pool } = db
    const { send } = harness(pool)
    const doors = [...DOORS_FROM_WORKER_347_411, ...DOORS_FROM_SPEC_4_4_OTHER_CALLERS]
    for (const [method, path] of doors) {
      const res = await send(method, path)
      assert.ok(
        await answeredByARealHandler(res),
        `${method} ${path} answered ${res.status}` +
          (res.status >= 300 && res.status < 400 ? ` → ${res.headers.get('location')}` : '') +
          ' — expected 401 or a 4xx carrying `code`. A 3xx here means the door fell through to the dsh catch-all (missing).'
      )
    }
  }
)

test(
  'EXCLUDED_DOORS actually are absent — a citation whose door quietly reappeared (or never existed to begin with) is a stale note, not a fact',
  opts,
  async () => {
    const { pool } = db
    const { send } = harness(pool)
    for (const { method, path, reason } of EXCLUDED_DOORS) {
      const res = await send(method, path)
      assert.equal(
        res.status,
        302,
        `${method} ${path} is listed as excluded (${reason}) but answered ${res.status}, not the dsh catch-all's 302`
      )
      assert.equal(
        res.headers.get('location'),
        '/login',
        `${method} ${path}: expected the catch-all's redirect to /login`
      )
    }
  }
)

test(
  'KNOWN_MISSING_DOOR (`/tracy-admin/sites`) is still absent — closing it means updating this test, not silently leaving it stale',
  opts,
  async () => {
    const { pool } = db
    const { send } = harness(pool)
    const res = await send(KNOWN_MISSING_DOOR.method, KNOWN_MISSING_DOOR.path)
    assert.equal(
      res.status,
      302,
      `${KNOWN_MISSING_DOOR.method} ${KNOWN_MISSING_DOOR.path} is no longer the dsh catch-all's 302 — Plan 3/4 built it; update workspaces/route.js's docstring and move this door out of KNOWN_MISSING_DOOR`
    )
    assert.equal(res.headers.get('location'), '/login')
  }
)

// ── SPECIAL_CASES — two doors whose CORRECT unauthenticated behavior is not "401 or 4xx" ─────────
//
// `GET /invite/:token` answers 404 for a token that does not verify — that is the door's own
// business logic (`seats/route.js`: `invalidInvitePage()`), not a routing miss: a route this app
// never registered would answer the dsh catch-all's 302 to `/login` instead (proven above, and
// `/invite/` has no dot in its first segment so it is never mistaken for a site key either), never
// a 404. A 404 carrying this door's own page text is therefore proof the route exists, not doubt
// about it.
//
// `POST /auth/signout` always answers 200 — ported verbatim from the Worker's own `signOut`
// (`workers/cowork-web/src/worker.js:2169`), which clears cookies unconditionally and never checks
// whether one was there to begin with. Asserting 401 here would be asserting a refusal the door
// was never designed to give.
test(
  "SPECIAL_CASES: GET /invite/:token (a real 404 page, not the catch-all's 302) and POST /auth/signout (always 200)",
  opts,
  async () => {
    const { pool } = db
    const { send } = harness(pool)

    const inviteRes = await send('GET', '/invite/not-a-real-token')
    assert.equal(
      inviteRes.status,
      404,
      'GET /invite/:token: expected its own 404 page, not the dsh catch-all'
    )
    const inviteBody = await inviteRes.text()
    assert.ok(
      inviteBody.includes('This invitation link is not valid'),
      'GET /invite/:token did not render its own invalid-invite page'
    )

    const signoutRes = await send('POST', '/auth/signout')
    assert.equal(signoutRes.status, 200)
    assert.deepEqual(await signoutRes.json(), { ok: true })
  }
)
