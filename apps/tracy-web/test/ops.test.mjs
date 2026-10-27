// `/ops` — Tracy's own operations surface, ported from `workers/harness`. Three outcomes, not
// two (see `src/ops/admit.js`'s own docstring): no session -> sign-in redirect; a session that
// holds no accepted seat in the `tracy_admin` workspace -> 403 with no body; staff -> served.
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { mintSession } from '../src/lib/session.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/** A throwaway `static/ops` fixture — a build the SPA never has to run for this test to prove
 * the file server + `index.html` fallback work. Removed by the caller when done. */
function fixtureStaticDir() {
  const dir = mktempOps()
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Tracy harness</title>')
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ops")')
  return dir
}
function mktempOps() {
  return mkdtempSync(join(tmpdir(), 'tracy-ops-'))
}

function harness(pool, { staticDir } = {}) {
  const sent = []
  const mail = {
    send: async (m) => {
      sent.push(m)
    }
  }
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail,
    sites: dbSitesResolver(pool, config),
    ...(staticDir ? { opsStaticDir: staticDir } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' })
    )
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { app, sent, config, cookieFor, get, send }
}

/** Seed the `tracy_admin` workspace directly — same helper `workspaces.test.mjs` uses, this task
 * has no door of its own that mints one (`POST /workspaces` never accepts `kind`). */
async function seedTracyAdmin(pool, ownerEmail, role = 'owner') {
  const owner = (
    await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [ownerEmail]
    )
  ).rows[0].id
  const workspaceId = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [workspaceId, owner, role]
  )
  return { workspaceId, ownerId: owner }
}

/** A PENDING Tracy-staff grant — the row `POST /tracy-admin/members` would leave, and the one
 * `/ops/invite/:token` exists to turn into an accepted one. */
async function seedPendingGrant(pool, workspaceId, granterId, email, role = 'developer') {
  const account = (
    await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by) values ($1, $2, $3, $4)`,
    [workspaceId, account, role, granterId]
  )
  return account
}

async function acceptedAtFor(pool, workspaceId, email) {
  const { rows } = await pool.query(
    `select sw.accepted_at from seat_workspace sw join account a on a.id = sw.account_id
      where sw.workspace_id = $1 and a.email = $2`,
    [workspaceId, email]
  )
  return rows[0]?.accepted_at ?? null
}

test('GET /ops with no session redirects to the one sign-in door, with next=', opts, async () => {
  const { pool } = db
  const { get } = harness(pool)
  const res = await get('/ops')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login?next=%2Fops')
  await res.body?.cancel()
})

test(
  'GET /ops with a session that holds no staff seat is refused 403, no body — never a hint the surface exists',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    const res = await get('/ops', await cookieFor('nobody@x.y'))
    assert.equal(res.status, 403)
    const text = await res.text()
    assert.equal(text, '')
    // A 403 that also carried a `location` header would be a redirect wearing the wrong status —
    // the security property this door exists for is that "not staff" and "no such page" read
    // identically from outside.
    assert.equal(res.headers.get('location'), null)
  }
)

test('GET /ops for staff serves the built SPA (index.html), and /ops/assets/* too', opts, async () => {
  const { pool } = db
  const staticDir = fixtureStaticDir()
  try {
    await seedTracyAdmin(pool, 'owner@tracy.test')
    const { get, cookieFor } = harness(pool, { staticDir })
    const cookie = await cookieFor('owner@tracy.test')

    const page = await get('/ops', cookie)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Tracy harness/)

    const asset = await get('/ops/assets/app.js', cookie)
    assert.equal(asset.status, 200)
    assert.match(await asset.text(), /console\.log/)

    // The shell routes on the address in the browser (App.tsx), so every page address — a root
    // screen, a cms screen with its query, an unknown path — is the same index.html, never a 404
    // and never a second html file (cms.html went with the second entry, 19/09).
    for (const path of [
      '/ops/whatever',
      '/ops/widget',
      '/ops/cms',
      '/ops/cms/catalog?env=main&cms=wordpress'
    ]) {
      const deep = await get(path, cookie)
      assert.equal(deep.status, 200, path)
      assert.match(await deep.text(), /Tracy harness/, path)
    }
  } finally {
    rmSync(staticDir, { recursive: true, force: true })
  }
})

test(
  'GET /ops for staff with no built SPA (no static/ops in this checkout) is a styled 503, never a bare 404',
  opts,
  async () => {
    const { pool } = db
    // Deliberately never created — the exact shape of a checkout where the Dockerfile's own
    // `COPY packages/web/tracy-harness/dist …` step has never run (chrome-acceptance.md).
    const missingStaticDir = join(tmpdir(), `tracy-ops-missing-${Date.now()}`)
    await seedTracyAdmin(pool, 'owner@tracy.test')
    const { get, cookieFor } = harness(pool, { staticDir: missingStaticDir })
    const cookie = await cookieFor('owner@tracy.test')

    const res = await get('/ops', cookie)
    // A bare 404 here would read as "you are not allowed" to a viewer `admit()` already let
    // through as staff — the opposite of the truth.
    assert.equal(res.status, 503)
    const body = await res.text()
    assert.match(body, /not built/i)
    assert.match(body, /<html/i)
    assert.doesNotMatch(body, /^$/)
  }
)

test(
  '/ops/healthz answers 200 with no door — an uptime probe is not a reason to publish who is allowed in',
  opts,
  async () => {
    const { pool } = db
    const { get } = harness(pool)
    const res = await get('/ops/healthz')
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok\n')
  }
)

test(
  'GET /api/ops/team lists the tracy_admin roster for staff, and is refused the same way as any other /ops door',
  opts,
  async () => {
    const { pool } = db
    await seedTracyAdmin(pool, 'owner@tracy.test')
    const { get, cookieFor } = harness(pool)

    const asOwner = await get('/api/ops/team', await cookieFor('owner@tracy.test'))
    assert.equal(asOwner.status, 200)
    const body = await asOwner.json()
    assert.equal(body.viewer.email, 'owner@tracy.test')
    assert.ok(body.members.some((m) => m.email === 'owner@tracy.test' && m.role === 'owner'))

    const asStranger = await get('/api/ops/team', await cookieFor('stranger@x.y'))
    assert.equal(asStranger.status, 403)
    assert.equal(await asStranger.text(), '')

    const signedOut = await get('/api/ops/team')
    assert.equal(signedOut.status, 302)
    assert.equal(signedOut.headers.get('location'), '/login?next=%2Fapi%2Fops%2Fteam')
  }
)

test(
  'POST /api/ops/team adds a member to the tracy_admin roster (relayed onto /tracy-admin/members, same book)',
  opts,
  async () => {
    const { pool } = db
    await seedTracyAdmin(pool, 'owner@tracy.test')
    const { send, sent, cookieFor } = harness(pool)
    const res = await send('POST', '/api/ops/team', await cookieFor('owner@tracy.test'), {
      email: 'new@tracy.test',
      role: 'developer'
    })
    assert.equal(res.status, 201)
    const body = await res.json()
    assert.equal(body.member.email, 'new@tracy.test')
    assert.equal(body.member.role, 'developer')
    assert.equal(sent.length, 1)

    const { rows } = await pool.query(
      `select role from seat_workspace sw join account a on a.id = sw.account_id where a.email = $1`,
      ['new@tracy.test']
    )
    assert.equal(rows[0].role, 'developer')
  }
)

test(
  "GET /ops/invite/:token accepts the CALLER's own pending grant while signed in — the token itself is never read",
  opts,
  async () => {
    const { pool } = db
    const { workspaceId, ownerId } = await seedTracyAdmin(pool, 'owner@tracy.test')
    await seedPendingGrant(pool, workspaceId, ownerId, 'newbie@tracy.test')
    const { get, cookieFor } = harness(pool)

    const res = await get('/ops/invite/anything-at-all', await cookieFor('newbie@tracy.test'))
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), '/ops')
    await res.body?.cancel()

    assert.ok(await acceptedAtFor(pool, workspaceId, 'newbie@tracy.test'))
  }
)

test(
  'GET /ops/invite/:token cannot accept a grant pending for a DIFFERENT address, whatever token is presented',
  opts,
  async () => {
    const { pool } = db
    const { workspaceId, ownerId } = await seedTracyAdmin(pool, 'owner@tracy.test')
    await seedPendingGrant(pool, workspaceId, ownerId, 'newbie@tracy.test')
    const { get, cookieFor } = harness(pool)

    // Two different kinds of "not newbie", both signed in, both trying every token shape that
    // might plausibly matter if the token WERE read: an existing staff member (already
    // accepted, so `acceptWorkspaceGrant` has nothing pending of THEIRS to accept) and a
    // total stranger with no account at all (nothing to accept, full stop). Neither reaches
    // newbie's row — acceptance is keyed to the caller's OWN account, never to the URL.
    for (const email of ['owner@tracy.test', 'stranger@x.y']) {
      for (const token of ['newbie@tracy.test', 'anything-else', String(ownerId)]) {
        const res = await get(`/ops/invite/${encodeURIComponent(token)}`, await cookieFor(email))
        assert.equal(res.status, 410)
        assert.match(await res.text(), /not open for this address/)
      }
    }

    // newbie's own row is untouched — still pending, not accepted by anybody else's visit.
    assert.equal(await acceptedAtFor(pool, workspaceId, 'newbie@tracy.test'), null)
  }
)

test('host inventory is staff-only and reports a missing host channel explicitly', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'inventory@tracy.test')
  const { get, cookieFor } = harness(pool)
  assert.equal((await get('/api/host-agents')).status, 302)
  assert.equal((await get('/api/host-agents', await cookieFor('stranger@example.test'))).status, 403)
  const result = await get('/api/host-agents', await cookieFor('inventory@tracy.test'))
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('cache-control'), 'no-store')
  const body = await result.json()
  assert.equal(body.hosts.length, 1)
  assert.equal(body.hosts[0].host, 'local')
  assert.equal(body.hosts[0].ok, false)
})

// ── `GET /api/ops/me` — who the rail draws in its footer ──────────────────────────────────────
//
// The same three outcomes as every other door here, because it IS the same door: `admit()`. What
// makes it worth its own route is the alternative — the rail learning the viewer from
// `/api/ops/team`, a relay that reads the whole staff roster to answer one question about one
// person, on every screen including the ones that have nothing to do with the team.

test('GET /api/ops/me with no session redirects to sign-in', opts, async () => {
  const { pool } = db
  const { get } = harness(pool)
  const res = await get('/api/ops/me')
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/login?next=%2Fapi%2Fops%2Fme')
  await res.body?.cancel()
})

test('GET /api/ops/me for a signed-in non-staff viewer is 403 with no body', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/me', await cookieFor('nobody@x.y'))
  assert.equal(res.status, 403)
  assert.equal(await res.text(), '')
})

test(
  'GET /api/ops/me answers the staff viewer their own email, role and what it may write',
  opts,
  async () => {
    const { pool } = db
    await seedTracyAdmin(pool, 'owner@tracy.test')
    const { get, cookieFor } = harness(pool)
    const res = await get('/api/ops/me', await cookieFor('owner@tracy.test'))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      email: 'owner@tracy.test',
      role: 'owner',
      writable: true
    })
    // Never cached: a role revoked in one tab must not be drawn as live in another.
    assert.equal(res.headers.get('cache-control'), 'no-store')
  }
)

test('GET /api/ops/me says writable false for a role that may only read', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'dev@tracy.test', 'developer')
  const { get, cookieFor } = harness(pool)
  const res = await get('/api/ops/me', await cookieFor('dev@tracy.test'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), {
    email: 'dev@tracy.test',
    role: 'developer',
    writable: false
  })
})
