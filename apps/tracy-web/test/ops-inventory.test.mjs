/**
 * `/api/ops/inventory` — the door onto the stock of CMS instances installed before a customer asks
 * for one (`src/ops/inventory.js`).
 *
 * Three properties shape this file, and each one is a rule that fails SILENTLY when it breaks:
 *
 * 1. ELIGIBILITY IS JOB EVIDENCE, NOT A SITE ROW. The stand case of 22/09 is seeded verbatim: a
 *    complete-looking demo site row whose every `provision` job is `failed`. A door that read the
 *    row would offer that quickstart for stocking and spend a real install learning it cannot come
 *    up.
 * 2. WRITES ARE OWNER/ADMIN AND SAME-ORIGIN. Staff read; anybody else is a 403 with no body, and a
 *    write from another origin is refused even with a valid staff session.
 * 3. AN INSTANCE WITH AN OWNER IS NEVER TORN DOWN (§5), and an operator screen never names the
 *    customer holding one — `reserved: true` is the whole answer.
 *
 * Every test runs against a real Postgres schema of its own (`fileDb`, emptied per test), because the parts worth
 * proving here — the optimistic lock on policy, the outbox dedupe, the supply arithmetic — live in
 * SQL and a double would only prove the double.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

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
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const ORIGIN = 'http://tracy.test'
const TAG = 'tracy-business/j6'
const OTHER_TAG = 'tracy-base/j6'

function harness(pool, extra = {}) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    ...extra
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = (path, cookie) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: 'manual'
      })
    )
  // `origin` defaults to this deployment's own, so a test that says nothing about it is testing
  // the happy path; the same-origin test passes a different one deliberately.
  const send = (method, path, cookie, body, { origin = ORIGIN } = {}) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
          'content-type': 'application/json'
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
  return { app, config, cookieFor, get, send }
}

/** A seat in the one `tracy_admin` workspace — what `admit()` reads to call somebody staff. */
async function seedStaff(pool, email, role = 'owner') {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const ws =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [ws, account, role]
  )
  return account
}

/**
 * A release row as a read of GitHub would have left it. `resolveInstall` is imported by the door
 * rather than injected, so the only way to tell it a release exists is to write one down.
 */
async function seedRelease(pool, tag, version, { platform = 'joomla' } = {}) {
  const release = {
    name: `Quickstart ${tag}`,
    kind: 'quickstart',
    github: 'published',
    publishedAt: '2026-09-14T19:33:55Z',
    assets: [
      { name: 'q.jpa', id: 1, size: 10 },
      { name: 's.sql', id: 2, size: 20 }
    ]
  }
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform,
    label: 'Tracy Business',
    version,
    install: {
      source: { file: 'q.jpa', sha256: 'a'.repeat(64) },
      state: { file: 's.sql', sha256: 'b'.repeat(64) }
    }
  }
  await pool.query(
    `insert into quickstart_releases (tag, release, setting, tracy, reason)
     values ($1, $2::jsonb, $3::jsonb, true, 'seeded')
     on conflict (tag) do update set release = excluded.release, setting = excluded.setting`,
    [tag, JSON.stringify(release), JSON.stringify(setting)]
  )
}

/** A demo site row the way `upsertDemoSite` leaves it: the version ASKED FOR, not one installed. */
async function seedDemoSite(pool, { siteKey, tag, version, platform = 'joomla' }) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, demo, quickstart_tag, quickstart_version)
     values ($1, $1, 'demo', $2, 'demo', true, $3, $4)`,
    [siteKey, platform, tag, version]
  )
}

async function seedJob(pool, { id, siteKey, state, jobKey }) {
  await pool.query(
    `insert into job (id, site_key, host, kind, state, detail)
     values ($1, $2, 'demo', 'provision', $3, $4::jsonb)`,
    [id, siteKey, state, JSON.stringify(jobKey ? { jobKey } : {})]
  )
}

/** The stand case, per tag: a demo whose provision reached `done` at `version`. */
async function seedSuccessfulDemo(pool, { tag, version, siteKey }) {
  await seedDemoSite(pool, { siteKey, tag, version })
  await seedJob(pool, {
    id: `job-done-${siteKey}`,
    siteKey,
    state: 'done',
    jobKey: `demo:${siteKey}:${version}:1`
  })
}

/** Create a pool through the door, and hand back the row the screen would be drawing. */
async function makePool(h, cookie, tag = TAG) {
  const res = await h.send('POST', '/api/ops/inventory/pool', cookie, { tag })
  assert.equal(res.status, 201, `pool creation failed: ${await res.clone().text()}`)
  const { pool: row } = await res.json()
  return row
}

/**
 * An instance row, plus the `site` row its foreign key demands. Written directly rather than
 * through a prepare: this file is about the DOOR, and the preparer has its own test.
 */
async function seedInstance(
  pool,
  {
    poolKey,
    generation,
    siteKey,
    label = siteKey.split('.')[0],
    state = 'ready',
    hashes = {},
    healthOk = true,
    reservedAccount = null
  }
) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin)
     values ($1, $2, 'local', 'joomla', 'fleet_born')`,
    [siteKey, label]
  )
  const { rows } = await pool.query(
    `insert into inventory_instance
       (pool_key, site_key, label, host, generation, state, hashes, health_ok, health_checked_at,
        reserved_account, reserved_at)
     values ($1, $2, $8, 'local', $3, $4, $5::jsonb, $6,
             case when $6::boolean is true then now() else null end,
             $7, case when $7::uuid is null then null else now() end)
     returning *`,
    [poolKey, siteKey, generation, state, JSON.stringify(hashes), healthOk, reservedAccount, label]
  )
  return rows[0]
}

const countIntents = async (pool) =>
  Number((await pool.query('select count(*)::int as n from inventory_refill_intent')).rows[0].n)

const stateOf = async (pool, id) =>
  (await pool.query('select state from inventory_instance where id = $1', [id])).rows[0].state

// ---------------------------------------------------------------------------------------------
// The door
// ---------------------------------------------------------------------------------------------

test('every inventory endpoint refuses a caller with no session', opts, async () => {
  const { pool } = db
  const h = harness(pool)

  for (const path of [
    '/api/ops/inventory',
    '/api/ops/inventory/eligible',
    '/api/ops/inventory/instances?pool=p',
    '/api/ops/inventory/instance?id=00000000-0000-0000-0000-000000000000',
    '/api/ops/inventory/approval?pool=p&generation=g'
  ]) {
    const res = await h.get(path)
    assert.equal(res.status, 302, path)
    // The ONE sign-in door, carrying the way back — never a 200 with an empty list, which would
    // tell an outsider the surface is there.
    assert.equal(res.headers.get('location'), `/login?next=${encodeURIComponent(path.split('?')[0])}`, path)
    await res.body?.cancel()
  }

  for (const [method, path] of [
    ['POST', '/api/ops/inventory/pool'],
    ['PUT', '/api/ops/inventory/policy'],
    ['POST', '/api/ops/inventory/prepare'],
    ['POST', '/api/ops/inventory/approve'],
    ['POST', '/api/ops/inventory/retire']
  ]) {
    const res = await h.send(method, path, undefined, {})
    assert.equal(res.status, 302, path)
    await res.body?.cancel()
  }

  // And nothing was written on the way past.
  assert.equal(Number((await pool.query('select count(*)::int as n from inventory_pool')).rows[0].n), 0)
})

test('staff may READ every inventory endpoint', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'dev@tracy.test', 'developer')
  const h = harness(pool)
  const cookie = await h.cookieFor('dev@tracy.test')

  const list = await h.get('/api/ops/inventory', cookie)
  assert.equal(list.status, 200)
  assert.equal(list.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await list.json()).pools, [])

  const eligible = await h.get('/api/ops/inventory/eligible', cookie)
  assert.equal(eligible.status, 200)
  assert.deepEqual((await eligible.json()).quickstarts, [])

  // `instances` without a pool is a 400 about the QUERY, which is itself proof the door let the
  // reader through rather than refusing them.
  const instances = await h.get('/api/ops/inventory/instances', cookie)
  assert.equal(instances.status, 400)
  assert.equal((await instances.json()).code, 'POOL_REQUIRED')

  const one = await h.get('/api/ops/inventory/instance?id=00000000-0000-0000-0000-000000000000', cookie)
  assert.equal(one.status, 404)
  assert.equal((await one.json()).code, 'NOT_FOUND')

  // A stranger with a session but no staff seat gets nothing, and learns nothing.
  const stranger = await h.get('/api/ops/inventory', await h.cookieFor('stranger@x.y'))
  assert.equal(stranger.status, 403)
  assert.equal(await stranger.text(), '')
})

test('staff may NOT write: every press is 403 for a non-owner, non-admin seat', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'dev@tracy.test', 'developer')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('dev@tracy.test')

  for (const [method, path, body] of [
    ['POST', '/api/ops/inventory/pool', { tag: TAG }],
    ['PUT', '/api/ops/inventory/policy', { poolKey: 'p', revision: 1, enabled: true }],
    ['POST', '/api/ops/inventory/prepare', { poolKey: 'p' }],
    ['POST', '/api/ops/inventory/approve', { instanceId: 'x' }],
    ['POST', '/api/ops/inventory/retire', { instanceId: 'x', to: 'draining' }],
    ['PUT', '/api/ops/inventory/sweep', { periodMs: 60_000, revision: 0 }]
  ]) {
    const res = await h.send(method, path, cookie, body)
    assert.equal(res.status, 403, `${method} ${path}`)
    assert.equal(await res.text(), '', `${method} ${path}`)
  }

  // The refusal happened before any work: a developer pressing Create pool left no pool.
  assert.equal(Number((await pool.query('select count(*)::int as n from inventory_pool')).rows[0].n), 0)
})

test('an owner writing from another origin is refused, however valid the session', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test', 'owner')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')

  const foreign = await h.send(
    'POST',
    '/api/ops/inventory/pool',
    cookie,
    { tag: TAG },
    {
      origin: 'http://evil.test'
    }
  )
  assert.equal(foreign.status, 403)
  // The app-wide guard (#662, `lib/csrf.js`) answers before this door's own origin check does.
  assert.deepEqual(await foreign.json(), { code: 'CSRF_ORIGIN' })
  assert.deepEqual((await (await h.get('/api/ops/inventory', cookie)).json()).pools, [])

  // Same session, same body, this deployment's own origin: allowed. The origin is the only thing
  // that changed.
  const own = await h.send('POST', '/api/ops/inventory/pool', cookie, { tag: TAG })
  assert.equal(own.status, 201)

  // An admin seat writes too — the allow-list is owner AND admin, not owner alone.
  await seedStaff(pool, 'admin@tracy.test', 'admin')
  const asAdmin = await h.send('POST', '/api/ops/inventory/pool', await h.cookieFor('admin@tracy.test'), {
    tag: TAG
  })
  assert.equal(asAdmin.status, 201)
})

// ---------------------------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------------------------

test(
  'a demo whose every provision FAILED is not eligible — the complete-looking site row is not evidence',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedRelease(pool, 'tracy-x/j6', '1.0.0')
    // The stand case of 22/09, verbatim: the row says 1.0.0 and names the tag, and the only
    // provision job there has ever been is `failed`.
    await seedDemoSite(pool, { siteKey: 'x-joomla', tag: 'tracy-x/j6', version: '1.0.0' })
    await seedJob(pool, {
      id: 'job-failed-1',
      siteKey: 'x-joomla',
      state: 'failed',
      jobKey: 'demo:x-joomla:1.0.0:1'
    })
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')

    const res = await h.get('/api/ops/inventory/eligible', cookie)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.recorded, 0, 'a failed job attests nothing')
    const row = body.quickstarts.find((r) => r.tag === 'tracy-x/j6')
    assert.ok(row, 'the tag is still LISTED — vanishing would read as "we never had it"')
    assert.equal(row.eligible, false)
    assert.equal(row.attestedVersion, null)
    assert.equal(row.reason, 'no successful demo install recorded')
    assert.equal(row.drift, null)
  }
)

test('a provision that reached done at the release the catalogue now names is eligible', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedDemoSite(pool, { siteKey: 'business-joomla', tag: TAG, version: '1.0.0' })
  await seedJob(pool, {
    id: 'job-done-1',
    siteKey: 'business-joomla',
    state: 'done',
    jobKey: 'demo:business-joomla:1.0.0:1'
  })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')

  const body = await (await h.get('/api/ops/inventory/eligible', cookie)).json()
  // Reading the screen is what wrote the attestation down; a second read writes nothing.
  assert.equal(body.recorded, 1)
  const row = body.quickstarts.find((r) => r.tag === TAG)
  assert.equal(row.eligible, true)
  assert.equal(row.attestedVersion, '1.0.0')
  assert.equal(row.currentVersion, '1.0.0')
  assert.equal(row.versionSource, 'job-key')
  assert.equal(row.jobId, 'job-done-1')
  assert.equal(row.drift, null)
  assert.equal(row.reason, null)

  const again = await (await h.get('/api/ops/inventory/eligible', cookie)).json()
  assert.equal(again.recorded, 0)
})

test(
  'a demo attested at 1.0.0 does not make the 1.1.0 release eligible — drift names both numbers',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    // The demo succeeded at 1.0.0; the catalogue has since moved to 1.1.0 and nothing has proven
    // that one comes up.
    await seedDemoSite(pool, { siteKey: 'business-joomla', tag: TAG, version: '1.0.0' })
    await seedJob(pool, {
      id: 'job-done-1',
      siteKey: 'business-joomla',
      state: 'done',
      jobKey: 'demo:business-joomla:1.0.0:1'
    })
    await seedRelease(pool, TAG, '1.1.0')
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')

    const body = await (await h.get('/api/ops/inventory/eligible', cookie)).json()
    const row = body.quickstarts.find((r) => r.tag === TAG)
    assert.equal(row.eligible, false)
    assert.equal(row.drift, 'version')
    assert.equal(row.attestedVersion, '1.0.0')
    assert.equal(row.currentVersion, '1.1.0')
    assert.match(row.reason, /1\.0\.0/)
    assert.match(row.reason, /1\.1\.0/)
  }
)

test(
  'POST /pool on a quickstart that is not eligible is 409 NOT_ELIGIBLE and creates nothing',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedRelease(pool, 'tracy-x/j6', '1.0.0')
    await seedDemoSite(pool, { siteKey: 'x-joomla', tag: 'tracy-x/j6', version: '1.0.0' })
    await seedJob(pool, {
      id: 'job-failed-1',
      siteKey: 'x-joomla',
      state: 'failed',
      jobKey: 'demo:x-joomla:1.0.0:1'
    })
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')

    const res = await h.send('POST', '/api/ops/inventory/pool', cookie, { tag: 'tracy-x/j6' })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'NOT_ELIGIBLE')
    assert.equal(body.tag, 'tracy-x/j6')
    assert.equal(body.reason, 'no successful demo install recorded')

    // 🔒 The point of refusing here rather than at refill time: no pool exists to install from.
    const list = await (await h.get('/api/ops/inventory', cookie)).json()
    assert.deepEqual(list.pools, [])
    assert.equal(Number((await pool.query('select count(*)::int as n from inventory_pool')).rows[0].n), 0)
  }
)

test('POST /pool on an eligible quickstart creates a pool that is switched OFF', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')

  const row = await makePool(h, cookie)
  assert.equal(row.quickstartTag, TAG)
  assert.equal(row.quickstartVersion, '1.0.0')
  assert.equal(row.platform, 'joomla')
  assert.equal(row.host, 'local')
  assert.equal(row.environment, 'local')
  // 🔒 §7: a pool that appeared because a release was published must not start installing on its
  // own. Default off is the property; everything else here is the shape around it.
  assert.equal(row.policy.enabled, false)
  assert.equal(row.policy.paused, false)
  assert.equal(row.revision, 1)
  assert.deepEqual(row.supply, {
    ready: 0,
    preparing: 0,
    awaitingReview: 0,
    reserved: 0,
    assigned: 0,
    quarantined: 0,
    draining: 0,
    stock: 0,
    handedOver: 0
  })

  const list = await (await h.get('/api/ops/inventory', cookie)).json()
  assert.equal(list.pools.length, 1)
  assert.equal(list.pools[0].poolKey, row.poolKey)
})

// ---------------------------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------------------------

test('PUT /policy moves the pool on the right revision and refuses a stale one', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, revision } = await makePool(h, cookie)

  const ok = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    enabled: true,
    targetReady: 2
  })
  assert.equal(ok.status, 200)
  const after = (await ok.json()).pool
  assert.equal(after.policy.enabled, true)
  assert.equal(after.policy.targetReady, 2)
  assert.equal(after.revision, revision + 1)

  // A second tab that was still looking at revision 1 presses Save.
  const stale = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    targetReady: 3
  })
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).code, 'REVISION_CONFLICT')

  // Read it back: the stale press changed NOTHING, which is the half a status code alone does not
  // prove.
  const reread = (await (await h.get('/api/ops/inventory', cookie)).json()).pools[0]
  assert.equal(reread.policy.targetReady, 2)
  assert.equal(reread.policy.enabled, true)
  assert.equal(reread.revision, revision + 1)
})

test('PUT /sweep changes how often the refill runs, on the right revision only', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')

  // Before anybody edits it the list answers the default, so the screen always has a period to show.
  const before = (await (await h.get('/api/ops/inventory', cookie)).json()).sweep
  assert.equal(before.periodMs, 30_000)
  assert.equal(before.revision, 0)

  const ok = await h.send('PUT', '/api/ops/inventory/sweep', cookie, { periodMs: 120_000, revision: 0 })
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).sweep.periodMs, 120_000)

  const stale = await h.send('PUT', '/api/ops/inventory/sweep', cookie, { periodMs: 15_000, revision: 0 })
  assert.equal(stale.status, 409)
  assert.equal((await stale.json()).code, 'REVISION_CONFLICT')

  // Out of range answers WHY, in words the screen can show as they are.
  const tooFast = await h.send('PUT', '/api/ops/inventory/sweep', cookie, { periodMs: 1_000, revision: 1 })
  assert.equal(tooFast.status, 400)
  assert.match((await tooFast.json()).detail, /10–3600 seconds/)

  const reread = (await (await h.get('/api/ops/inventory', cookie)).json()).sweep
  assert.equal(reread.periodMs, 120_000, 'a refused press changed the period')
  assert.equal(reread.updatedBy, 'owner@tracy.test')
})

test('PUT /policy refuses "paused with no reason" — the state nobody can act on', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, revision } = await makePool(h, cookie)

  const res = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    paused: true
  })
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.equal(body.code, 'INVALID')
  assert.match(body.detail, /pausedReason/)

  const reread = (await (await h.get('/api/ops/inventory', cookie)).json()).pools[0]
  assert.equal(reread.policy.paused, false)
  assert.equal(reread.revision, revision, 'a refused patch does not burn a revision')

  // The same press WITH a reason goes through, so what was refused is the missing sentence and
  // not pausing itself.
  const withReason = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    paused: true,
    pausedReason: 'host disk full'
  })
  assert.equal(withReason.status, 200)
  assert.equal((await withReason.json()).pool.policy.pausedReason, 'host disk full')
})

test('PUT /policy refuses out-of-bounds numbers with the field named', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, revision } = await makePool(h, cookie)

  // `targetReady: 0` — a pool that targets no stock is a pool switched off, said in a way no
  // screen can show.
  const zero = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    targetReady: 0
  })
  assert.equal(zero.status, 400)
  assert.match((await zero.json()).detail, /targetReady/)

  // `maxStock` below `targetReady` — checked against the row as it stands, so a patch naming only
  // one of the pair is still refused.
  const inverted = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    targetReady: 5
  })
  assert.equal(inverted.status, 400)
  assert.match((await inverted.json()).detail, /maxStock below targetReady/)

  const both = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    maxStock: 1,
    targetReady: 2
  })
  assert.equal(both.status, 400)

  // A field this door does not own is refused rather than quietly dropped.
  const unknown = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    nonsense: 1
  })
  assert.equal(unknown.status, 400)

  const reread = (await (await h.get('/api/ops/inventory', cookie)).json()).pools[0]
  assert.equal(reread.policy.targetReady, 1)
  assert.equal(reread.policy.maxStock, 3)
  assert.equal(reread.revision, revision)
})

// ---------------------------------------------------------------------------------------------
// Prepare
// ---------------------------------------------------------------------------------------------

test('POST /prepare writes ONE intent and calls no host', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  // 🔒 The app is built with NO `host` at all in this file's harness, so a door that installed
  // rather than enqueued would throw rather than pass — that absence is the assertion.
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey } = await makePool(h, cookie)

  assert.equal(await countIntents(pool), 0)
  const res = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey })
  assert.equal(res.status, 202)
  assert.equal((await res.json()).enqueued, 1)

  const { rows } = await pool.query(
    'select job_key, pool_key, state, instance_id from inventory_refill_intent'
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].pool_key, poolKey)
  assert.equal(rows[0].state, 'pending')
  // Nothing has run it: an intent with an instance would mean the press installed something.
  assert.equal(rows[0].instance_id, null)
  assert.equal(Number((await pool.query('select count(*)::int as n from inventory_instance')).rows[0].n), 0)
})

test(
  'a SECOND press takes the next free slot, because the free slot is read off the outbox',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedRelease(pool, TAG, '1.0.0')
    await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')
    const { poolKey } = await makePool(h, cookie)

    // 🔒 NEITHER PRESS HAS AN INSTANCE TO COUNT. An intent that has not been drained yet produced
    // no `inventory_instance` row, so a door that named the slot after the instance count would
    // hand the second press the SAME name, the insert would collapse into the first row, and the
    // operator would be told 202 for a press that queued nothing.
    const first = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey })
    assert.equal(first.status, 202)
    assert.equal((await first.json()).enqueued, 1)

    const second = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey })
    assert.equal(second.status, 202)
    assert.equal((await second.json()).enqueued, 1)

    const { rows } = await pool.query(
      'select job_key from inventory_refill_intent where pool_key = $1 order by job_key',
      [poolKey]
    )
    assert.equal(rows.length, 2, 'two presses, two slots')
    assert.deepEqual(
      rows.map((r) => r.job_key),
      [`${poolKey}:1`, `${poolKey}:2`]
    )
    // Still nothing installed: both presses only wrote names.
    assert.equal(Number((await pool.query('select count(*)::int as n from inventory_instance')).rows[0].n), 0)
  }
)

test('POST /prepare on a paused pool is 409 POOL_PAUSED and carries the reason', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, revision } = await makePool(h, cookie)

  const paused = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    paused: true,
    pausedReason: 'release under investigation'
  })
  assert.equal(paused.status, 200)

  const res = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'POOL_PAUSED')
  // The sentence travels with the refusal: an operator reading this at 3am must not have to go
  // and find why somebody paused it.
  assert.equal(body.reason, 'release under investigation')
  assert.equal(await countIntents(pool), 0)
})

test('POST /prepare on a pool at maxStock is 409 AT_MAX_STOCK and adds no intent', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation, revision } = await makePool(h, cookie)

  const capped = await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision,
    maxStock: 1
  })
  assert.equal(capped.status, 200)
  // One instance still preparing already holds a database, a volume and a port — `stock` counts
  // it, which is why a second press must be refused rather than queued.
  await seedInstance(pool, { poolKey, generation, siteKey: 'stock-1', state: 'queued', healthOk: null })

  const res = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'AT_MAX_STOCK')
  assert.equal(body.stock, 1)
  assert.equal(body.maxStock, 1)
  assert.equal(await countIntents(pool), 0)
})

// ---------------------------------------------------------------------------------------------
// Approve
// ---------------------------------------------------------------------------------------------

test('POST /approve refuses an instance that is not awaiting review', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'stock-1',
    state: 'ready',
    hashes: { artifact: 'h1' }
  })

  const res = await h.send('POST', '/api/ops/inventory/approve', cookie, {
    instanceId: instance.id,
    expectedHashes: { artifact: 'h1' }
  })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'NOT_AWAITING_REVIEW')
  assert.equal(body.state, 'ready')

  // No approval was recorded for a generation nobody was asked to inspect.
  const approval = await (
    await h.get(
      `/api/ops/inventory/approval?pool=${encodeURIComponent(poolKey)}&generation=${generation}`,
      cookie
    )
  ).json()
  assert.equal(approval.approval, null)
})

test(
  'POST /approve from a stale screen is 409 HASH_MISMATCH and leaves the instance held',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedRelease(pool, TAG, '1.0.0')
    await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')
    const { poolKey, generation } = await makePool(h, cookie)
    const instance = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: 'stock-1',
      state: 'awaiting_review',
      hashes: { artifact: 'now' }
    })

    const res = await h.send('POST', '/api/ops/inventory/approve', cookie, {
      instanceId: instance.id,
      expectedHashes: { artifact: 'what-the-tab-was-showing' }
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'HASH_MISMATCH')
    // The refusal hands back what the instance ACTUALLY says, so the screen can redraw instead of
    // asking the person to guess.
    assert.deepEqual(body.hashes, { artifact: 'now' })

    assert.equal(await stateOf(pool, instance.id), 'awaiting_review')
    const approval = await (
      await h.get(
        `/api/ops/inventory/approval?pool=${encodeURIComponent(poolKey)}&generation=${generation}`,
        cookie
      )
    ).json()
    assert.equal(approval.approval, null)
  }
)

test('POST /approve on the hashes the screen was showing makes the instance ready', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const hashes = { artifact: 'sha-artifact' }
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'stock-1',
    state: 'awaiting_review',
    hashes
  })

  const res = await h.send('POST', '/api/ops/inventory/approve', cookie, {
    instanceId: instance.id,
    expectedHashes: hashes
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  // Two separate facts, said separately: the generation is now approved (this press filed it), and
  // this instance was released. The old shape said `approved: false` while moving the instance
  // anyway — three signals disagreeing on one screen.
  assert.equal(body.released, true)
  assert.equal(body.alreadyApproved, false)
  assert.equal(body.generation, generation)

  assert.equal(await stateOf(pool, instance.id), 'ready')

  // The approval is filed against (pool, generation) — later refills of the SAME generation are
  // what it lets through, not this one row.
  const approval = (
    await (
      await h.get(
        `/api/ops/inventory/approval?pool=${encodeURIComponent(poolKey)}&generation=${generation}`,
        cookie
      )
    ).json()
  ).approval
  assert.ok(approval)
  assert.equal(approval.pool_key, poolKey)
  assert.equal(approval.generation, generation)
  assert.equal(approval.approved_by, 'owner@tracy.test')
  assert.deepEqual(approval.expected_hashes, hashes)
})

test(
  'a SECOND instance of an already-approved generation is released, and the first approval stands',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedStaff(pool, 'second@tracy.test', 'admin')
    await seedRelease(pool, TAG, '1.0.0')
    await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
    const h = harness(pool)
    const owner = await h.cookieFor('owner@tracy.test')
    const second = await h.cookieFor('second@tracy.test')
    const { poolKey, generation } = await makePool(h, owner)
    const hashes = { artifact: 'sha-artifact' }

    const first = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: 'stock-1',
      state: 'awaiting_review',
      hashes
    })
    const firstPress = await h.send('POST', '/api/ops/inventory/approve', owner, {
      instanceId: first.id,
      expectedHashes: hashes
    })
    assert.equal(firstPress.status, 200)
    assert.equal((await firstPress.json()).alreadyApproved, false)

    // 🔒 APPROVING A GENERATION, NOT A ROW (§3): the next instance built at the same generation
    // rides on the decision already taken, so it is RELEASED — and the door says plainly that the
    // approval it is riding on is somebody else's.
    const next = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: 'stock-2',
      state: 'awaiting_review',
      hashes
    })
    const res = await h.send('POST', '/api/ops/inventory/approve', second, {
      instanceId: next.id,
      expectedHashes: hashes
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.released, true)
    assert.equal(body.alreadyApproved, true)
    assert.equal(await stateOf(pool, next.id), 'ready')

    // The record is the FIRST decision: who took it and what they were looking at. A second press
    // overwriting it would erase the only audit there is.
    assert.equal(body.approval.approved_by, 'owner@tracy.test')
    const { rows } = await pool.query(
      'select approved_by, expected_hashes from inventory_generation_approval where pool_key = $1 and generation = $2',
      [poolKey, generation]
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].approved_by, 'owner@tracy.test')
    assert.deepEqual(rows[0].expected_hashes, hashes)
  }
)

test('the same hashes in another key order are the same hashes — JSON promises no order', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  // Several keys, and a nested object, because a one-key object cannot tell the two comparisons
  // apart — that is exactly why the old `JSON.stringify` test passed while the bug was live.
  const stored = {
    artifact: 'sha-artifact',
    contract: 'sha-contract',
    cowork: { floor: '1.4.0', sha256: 'sha-cowork' }
  }
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'stock-1',
    state: 'awaiting_review',
    hashes: stored
  })

  // What a screen that built the object in another order would post. Byte-for-byte a different
  // string; fact-for-fact the same hashes.
  const reversed = {
    cowork: { sha256: 'sha-cowork', floor: '1.4.0' },
    contract: 'sha-contract',
    artifact: 'sha-artifact'
  }
  assert.notEqual(JSON.stringify(reversed), JSON.stringify(stored), 'the fixture must differ as text')

  const res = await h.send('POST', '/api/ops/inventory/approve', cookie, {
    instanceId: instance.id,
    expectedHashes: reversed
  })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).released, true)
  assert.equal(await stateOf(pool, instance.id), 'ready')
})

test('a hash that genuinely differs is still HASH_MISMATCH, order or not', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const stored = { artifact: 'sha-artifact', contract: 'sha-contract' }
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'stock-1',
    state: 'awaiting_review',
    hashes: stored
  })

  // Canonicalising must not be mistaken for being lenient: a reordered object with ONE value
  // changed, and an object missing a key, are both still refusals.
  for (const expectedHashes of [
    { contract: 'sha-contract', artifact: 'sha-SOMETHING-ELSE' },
    { contract: 'sha-contract' },
    { contract: 'sha-contract', artifact: 'sha-artifact', extra: 'sha-extra' }
  ]) {
    const res = await h.send('POST', '/api/ops/inventory/approve', cookie, {
      instanceId: instance.id,
      expectedHashes
    })
    assert.equal(res.status, 409, JSON.stringify(expectedHashes))
    assert.equal((await res.json()).code, 'HASH_MISMATCH')
    assert.equal(await stateOf(pool, instance.id), 'awaiting_review')
  }

  assert.equal(
    Number(
      (
        await pool.query('select count(*)::int as n from inventory_generation_approval where pool_key = $1', [
          poolKey
        ])
      ).rows[0].n
    ),
    0
  )
})

test(
  'an instance id that is not a uuid is a 400 about the REQUEST, never a 500 about the server',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')

    // 🔒 Postgres answers a malformed uuid with 22P02, which reaches a caller as a 500 — an error
    // that reads like the server broke, for a request that was simply wrong. A screen seeing 500
    // sends somebody to the logs; a screen seeing 400 fixes its own input.
    for (const id of ['x', '', 'not-a-uuid', '12345', '00000000-0000-0000-0000-00000000000']) {
      const read = await h.get(`/api/ops/inventory/instance?id=${encodeURIComponent(id)}`, cookie)
      assert.equal(read.status, 400, `GET instance ${JSON.stringify(id)}`)
      assert.equal((await read.json()).code, 'BAD_INSTANCE_ID')

      const approve = await h.send('POST', '/api/ops/inventory/approve', cookie, {
        instanceId: id,
        expectedHashes: {}
      })
      assert.equal(approve.status, 400, `approve ${JSON.stringify(id)}`)
      assert.equal((await approve.json()).code, 'BAD_INSTANCE_ID')

      const retire = await h.send('POST', '/api/ops/inventory/retire', cookie, {
        instanceId: id,
        to: 'draining'
      })
      assert.equal(retire.status, 400, `retire ${JSON.stringify(id)}`)
      assert.equal((await retire.json()).code, 'BAD_INSTANCE_ID')
    }

    // A well-formed id that names nothing is still the other answer — 400 is about the SHAPE.
    const missing = await h.get('/api/ops/inventory/instance?id=00000000-0000-0000-0000-000000000000', cookie)
    assert.equal(missing.status, 404)
    assert.equal((await missing.json()).code, 'NOT_FOUND')
  }
)

// ---------------------------------------------------------------------------------------------
// Retire
// ---------------------------------------------------------------------------------------------

test('POST /retire never touches an instance a customer holds (§5)', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)

  let n = 0
  for (const state of ['reserved', 'assigning', 'assigned']) {
    const instance = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: `held-${n++}`,
      state
    })
    for (const to of ['draining', 'quarantined']) {
      const res = await h.send('POST', '/api/ops/inventory/retire', cookie, {
        instanceId: instance.id,
        to
      })
      assert.equal(res.status, 409, `${state} -> ${to}`)
      const body = await res.json()
      assert.equal(body.code, 'HAS_OWNER', `${state} -> ${to}`)
      assert.equal(body.state, state)
      assert.equal(await stateOf(pool, instance.id), state, `${state} -> ${to}`)
    }
  }
})

test('POST /retire drains a ready instance, and it leaves supply.ready', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'stock-1',
    state: 'ready',
    healthOk: true
  })

  const before = (await (await h.get('/api/ops/inventory', cookie)).json()).pools[0]
  assert.equal(before.supply.ready, 1)
  assert.equal(before.supply.stock, 1)

  const res = await h.send('POST', '/api/ops/inventory/retire', cookie, {
    instanceId: instance.id,
    to: 'draining',
    reason: 'wrong generation now'
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.instance.state, 'draining')
  assert.equal(body.instance.lastError, 'wrong generation now')

  const after = (await (await h.get('/api/ops/inventory', cookie)).json()).pools[0]
  assert.equal(after.supply.ready, 0)
  assert.equal(after.supply.draining, 1)
  // Still stock: it holds a database, a volume and a port until something actually tears it down.
  assert.equal(after.supply.stock, 1)

  // A target this door does not own is refused rather than written through. `retired` is NOT one
  // of them any more — it is the press that actually frees the disk (see the teardown tests
  // below) — so the invented one stands in for it here.
  const bad = await h.send('POST', '/api/ops/inventory/retire', cookie, {
    instanceId: instance.id,
    to: 'vanished'
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).code, 'BAD_TARGET')
})

// ---------------------------------------------------------------------------------------------
// What the screen must not say
// ---------------------------------------------------------------------------------------------

test(
  'an instance view says a slot is TAKEN, never who took it — no email anywhere in the body',
  opts,
  async () => {
    const { pool } = db
    await seedStaff(pool, 'owner@tracy.test')
    await seedRelease(pool, TAG, '1.0.0')
    await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
    const h = harness(pool)
    const cookie = await h.cookieFor('owner@tracy.test')
    const { poolKey, generation } = await makePool(h, cookie)

    const customer = (
      await pool.query('insert into account (email) values ($1) returning id', ['customer@example.test'])
    ).rows[0].id
    const taken = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: 'stock-taken',
      state: 'reserved',
      reservedAccount: customer
    })
    await pool.query('update inventory_instance set reserved_build = $2 where id = $1', [
      taken.id,
      'build-77'
    ])
    const free = await seedInstance(pool, {
      poolKey,
      generation,
      siteKey: 'stock-free',
      state: 'ready'
    })

    const listText = await (
      await h.get(`/api/ops/inventory/instances?pool=${encodeURIComponent(poolKey)}`, cookie)
    ).text()
    const oneText = await (await h.get(`/api/ops/inventory/instance?id=${taken.id}`, cookie)).text()

    for (const [name, text] of [
      ['instances', listText],
      ['instance', oneText]
    ]) {
      // The account id and the build it was taken for are as identifying as the address itself:
      // an operator screen needs to know a slot is taken, not which customer took it.
      assert.doesNotMatch(text, /customer@example\.test/, name)
      assert.ok(!text.includes(customer), `${name} must not carry the account id`)
      assert.ok(!text.includes('build-77'), `${name} must not carry the build`)
      assert.ok(!text.includes('reserved_account'), name)
    }

    const list = JSON.parse(listText)
    const takenView = list.instances.find((i) => i.id === taken.id)
    const freeView = list.instances.find((i) => i.id === free.id)
    assert.equal(takenView.reserved, true)
    assert.equal(freeView.reserved, false)
    assert.equal(JSON.parse(oneText).instance.reserved, true)
  }
)

// ---------------------------------------------------------------------------------------------
// A tag nobody has ever demoed
// ---------------------------------------------------------------------------------------------

test('POST /pool on a tag with no demo at all is refused, and an unknown host is a 400', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, OTHER_TAG, '1.0.0')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')

  // A published release that no demo has ever been built from is not listed at all — so the
  // fallback sentence, not a row's reason, is what a press on it gets.
  const never = await h.send('POST', '/api/ops/inventory/pool', cookie, { tag: OTHER_TAG })
  assert.equal(never.status, 409)
  const body = await never.json()
  assert.equal(body.code, 'NOT_ELIGIBLE')
  assert.equal(body.reason, 'no demo of this quickstart')

  // A host this deployment does not run is refused before any eligibility work.
  const host = await h.send('POST', '/api/ops/inventory/pool', cookie, { tag: TAG, host: 'mars' })
  assert.equal(host.status, 400)
  assert.equal((await host.json()).code, 'UNKNOWN_HOST')

  const missingTag = await h.send('POST', '/api/ops/inventory/pool', cookie, {})
  assert.equal(missingTag.status, 400)
  assert.equal((await missingTag.json()).code, 'TAG_REQUIRED')

  assert.deepEqual((await (await h.get('/api/ops/inventory', cookie)).json()).pools, [])
})

// ── What the operator screen needs that the doors did not answer ───────────────────────────────
//
// Three gaps, all found by drawing the screen rather than reading the code (Lee, 22/09):
// an instance had no address to open, `retire` freed nothing, and `prepare` could only ever ask
// for one slot at a time and then wait for a tick.

test('an instance answers the address a person can open', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'inv-a3f9k2p1.tracy.test',
    state: 'ready',
    healthOk: true
  })

  const [row] = (
    await (await h.get(`/api/ops/inventory/instances?pool=${encodeURIComponent(poolKey)}`, cookie)).json()
  ).instances
  // Built from the deployment's own origin, never a hard-coded scheme or port — a stand answers
  // on http and a port, production on https and none (`lib/site-address.js`).
  assert.equal(row.url, 'http://inv-a3f9k2p1.tracy.test/')
})

test('retiring to `retired` tears the site down, rather than only relabelling the row', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const calls = []
  const h = harness(pool, {
    host: {
      hostCall: async (_config, hostName, path, payload) => {
        calls.push({ hostName, path, payload })
        return { ok: true, status: 202, body: { jobId: 'tear-1' } }
      }
    }
  })
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'inv-b7x2m0q4.tracy.test',
    state: 'ready',
    healthOk: true
  })

  const res = await h.send('POST', '/api/ops/inventory/retire', cookie, {
    instanceId: instance.id,
    to: 'retired',
    reason: 'freeing disk'
  })
  assert.equal(res.status, 200)
  // 🔒 THE WHOLE POINT: a real teardown was asked for. Without this the row said `draining` while
  // the container, the volume and the port stayed — so the pool refilled beside it and the disk
  // only ever grew (measured on the stand: ~362 MB per site).
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/teardown']
  )
  assert.equal(calls[0].payload.label, 'inv-b7x2m0q4')

  // The job is asynchronous, so the row waits in `draining` carrying the job that will finish it.
  const body = await res.json()
  assert.equal(body.instance.state, 'draining')
  assert.equal(body.instance.jobId, 'tear-1')
})

test('a teardown the host refuses leaves the row alone, rather than claiming it is gone', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool, {
    host: { hostCall: async () => ({ ok: false, status: 502, body: { code: 'FLEET_REFUSED' } }) }
  })
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'inv-c1.tracy.test',
    state: 'ready'
  })

  const res = await h.send('POST', '/api/ops/inventory/retire', cookie, {
    instanceId: instance.id,
    to: 'retired'
  })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'TEARDOWN_REFUSED')
  // Marking it gone while it is still there is the one outcome worth refusing: the pool would
  // refill beside a site nobody is ever going to clean up.
  const after = (await (await h.get(`/api/ops/inventory/instance?id=${instance.id}`, cookie)).json()).instance
  assert.equal(after.state, 'ready')
})

test('a customer’s instance is never torn down, even by an explicit press', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const calls = []
  const h = harness(pool, {
    host: { hostCall: async (..._a) => (calls.push(_a), { ok: true, status: 202, body: { jobId: 'x' } }) }
  })
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey, generation } = await makePool(h, cookie)
  const instance = await seedInstance(pool, {
    poolKey,
    generation,
    siteKey: 'inv-d4.tracy.test',
    state: 'assigned'
  })
  const res = await h.send('POST', '/api/ops/inventory/retire', cookie, {
    instanceId: instance.id,
    to: 'retired'
  })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).code, 'HAS_OWNER')
  assert.equal(calls.length, 0, 'a teardown was sent for a site a customer holds')
})

test('prepare can ask for several slots at once', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey } = await makePool(h, cookie)
  await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision: 1,
    enabled: true,
    targetReady: 3,
    maxStock: 5
  })

  const res = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey, count: 3 })
  assert.equal(res.status, 202)
  assert.equal((await res.json()).enqueued, 3)
  const { rows } = await pool.query(
    'select count(*)::int as n from inventory_refill_intent where pool_key = $1',
    [poolKey]
  )
  assert.equal(rows[0].n, 3)
})

test('prepare never enqueues past max_stock, however many are asked for', opts, async () => {
  const { pool } = db
  await seedStaff(pool, 'owner@tracy.test')
  await seedRelease(pool, TAG, '1.0.0')
  await seedSuccessfulDemo(pool, { tag: TAG, version: '1.0.0', siteKey: 'business-joomla' })
  const h = harness(pool)
  const cookie = await h.cookieFor('owner@tracy.test')
  const { poolKey } = await makePool(h, cookie)
  await h.send('PUT', '/api/ops/inventory/policy', cookie, {
    poolKey,
    revision: 1,
    enabled: true,
    maxStock: 2
  })

  // The ceiling is the pool's, not the caller's: a press that asked for ten gets the two there is
  // room for, and says so, rather than being refused outright or quietly starting ten installs.
  const res = await h.send('POST', '/api/ops/inventory/prepare', cookie, { poolKey, count: 10 })
  assert.equal(res.status, 202)
  const body = await res.json()
  assert.equal(body.enqueued, 2)
  assert.equal(body.capped, true)
})
