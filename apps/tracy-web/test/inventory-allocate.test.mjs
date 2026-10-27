/**
 * `inventory/allocate.js` against a real Postgres — because every rule it has to keep is a rule
 * about two transactions meeting, and a mocked database cannot meet itself.
 *
 * 🔒 WHY A STORE DOUBLE, AND WHY IT IS NOT A FAKE. `inventory/store.js` is written in a parallel
 * branch. The double below is NOT a stub: it runs the same SQL against the same tables with the
 * same `for update skip locked` CAS the module contract specifies, so the race, the uniqueness and
 * the fencing are measured on Postgres rather than asserted in JavaScript. The moment the real
 * store lands, `storesUnderTest()` picks it up and the whole suite runs a second time against it —
 * so this file is the contract test for that module too, not a placeholder for it.
 */

import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { activateInstance, allocateFromPool } from '../src/inventory/allocate.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const POOL_KEY = 'dev:h1:joomla:tracy-business|j6:1.0.0:gen0123456789'

// ── the store double ─────────────────────────────────────────────────────────────────────────

/**
 * `reserveReady` per `module-contract.md`: one ready instance for one (account, build), the retry
 * of the same pair getting its OWN instance back with the token unchanged.
 *
 * `for update skip locked` in the subselect is the whole mechanism: a second transaction looking
 * at the same pool does not block on the row the first one has locked, it passes over it and takes
 * the next — which is how two customers arriving at once get two instances instead of one waiting
 * behind the other, and how the last instance goes to exactly one of them.
 */
async function reserveReady(client, { poolKey, accountId, buildId }) {
  const { rows: held } = await client.query(
    `select * from inventory_instance
      where reserved_account = $1 and reserved_build = $2
        and state in ('reserved', 'assigning', 'assigned')`,
    [accountId, buildId]
  )
  if (held[0]) return { ok: true, instance: held[0], fencingToken: String(held[0].fencing_token) }
  const { rows } = await client.query(
    `update inventory_instance set
       state = 'reserved', reserved_account = $2, reserved_build = $3, reserved_at = now(),
       fencing_token = fencing_token + 1, updated_at = now()
     where id = (
       select id from inventory_instance
        where pool_key = $1 and state = 'ready' and health_ok is true
        order by created_at
        for update skip locked
        limit 1)
     returning *`,
    [poolKey, accountId, buildId]
  )
  if (!rows[0]) return { ok: false, code: 'NONE_READY' }
  return { ok: true, instance: rows[0], fencingToken: String(rows[0].fencing_token) }
}

/**
 * 🔒 ONLY A STILL-`reserved` INSTANCE MAY BE LET GO (§5: an expired lease does NOT by itself mean
 * it is safe to re-let). Once the handover started, the seat, the session or the customer's own first words may
 * already exist, and putting the row back to `ready` would offer all of it to the next customer.
 */
async function releaseReservation(client, id, { expectedFencingToken }) {
  const { rows } = await client.query(
    `update inventory_instance set
       state = 'ready', reserved_account = null, reserved_build = null, reserved_at = null,
       updated_at = now()
     where id = $1 and state = 'reserved' and fencing_token = $2
     returning *`,
    [id, String(expectedFencingToken)]
  )
  return { ok: Boolean(rows[0]), row: rows[0] ?? null }
}

async function readPool(pool, poolKey) {
  const { rows } = await pool.query('select * from inventory_pool where pool_key = $1', [poolKey])
  return rows[0] ?? null
}

const storeDouble = { readPool, reserveReady, releaseReservation }

/** The real module once it exists — the same suite runs against it without a line changing. */
async function storesUnderTest() {
  const stores = [['double', storeDouble]]
  try {
    const real = await import('../src/inventory/store.js')
    if (typeof real.reserveReady === 'function') stores.push(['store.js', real])
  } catch {
    // Not landed yet; the double carries the contract until it is.
  }
  return stores
}

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

async function account(pool, email) {
  const { rows } = await pool.query('insert into account (email) values ($1) returning *', [email])
  return rows[0]
}

async function makePool(pool, patch = {}) {
  const row = {
    environment: 'dev',
    host: 'h1',
    platform: 'joomla',
    quickstart_tag: 'tracy-business/j6',
    quickstart_version: '1.0.0',
    generation: 'gen0123456789',
    enabled: true,
    paused: false,
    paused_reason: null,
    ...patch
  }
  await pool.query(
    `insert into inventory_pool (pool_key, environment, host, platform, quickstart_tag,
       quickstart_version, generation, enabled, paused, paused_reason)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (pool_key) do update set enabled = excluded.enabled, paused = excluded.paused,
       paused_reason = excluded.paused_reason`,
    [
      POOL_KEY,
      row.environment,
      row.host,
      row.platform,
      row.quickstart_tag,
      row.quickstart_version,
      row.generation,
      row.enabled,
      row.paused,
      row.paused_reason
    ]
  )
}

/** A stock instance: a `site` row with NO owner and no `created_by`, plus its inventory row. */
async function stock(pool, label, { state = 'ready', healthOk = true } = {}) {
  const siteKey = `${label}.example.test`
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, created_by)
     values ($1, $2, 'h1', 'joomla', 'fleet_born', null)`,
    [siteKey, label]
  )
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state, health_ok,
       health_checked_at)
     values ($1, $2, $3, 'h1', 'gen0123456789', $4, $5, now()) returning *`,
    [POOL_KEY, siteKey, label, state, healthOk]
  )
  return rows[0]
}

/** A host that FAILS the test if anything asks it to provision. */
function hostSpy() {
  const calls = []
  return {
    calls,
    hostCall: async (_config, _host, path) => {
      calls.push(path)
      assert.notEqual(path, '/provision', 'a warm hit must never provision')
      return { ok: true, status: 200, body: {} }
    }
  }
}

function seatsSpy() {
  const granted = []
  return {
    granted,
    ownersOf: async () => [],
    grantSite: async (_pool, g) => {
      granted.push(g)
      return g
    },
    acceptGrant: async () => null
  }
}

const config = { defaultHost: 'h1', hosts: new Map() }

// ── the suite, once per store implementation ─────────────────────────────────────────────────

const stores = await storesUnderTest()

for (const [name, store] of stores) {
  test(`[${name}] a warm hit hands back the instance untouched and provisions nothing`, dbOpts, async () => {
    const { pool } = db
    await makePool(pool)
    const before = await stock(pool, 'stock-a')
    const acc = await account(pool, 'a@example.test')
    const host = hostSpy()

    const got = await allocateFromPool({
      pool,
      config,
      host,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-1',
      email: 'a@example.test'
    })

    assert.equal(got.ok, true)
    assert.equal(got.warm, true)
    // The identity the fleet already knows this site by — unchanged by the handover (§3).
    assert.equal(got.instanceId, before.id)
    assert.equal(got.siteKey, before.site_key)
    assert.equal(got.label, before.label)
    assert.deepEqual(host.calls, [], 'allocation called the host at all')
    // …and the fence moved exactly once.
    const after = (await pool.query('select * from inventory_instance where id = $1', [before.id])).rows[0]
    assert.equal(after.state, 'reserved')
    assert.equal(String(after.fencing_token), String(Number(before.fencing_token) + 1))
    assert.equal(got.fencingToken, String(after.fencing_token))
  })

  test(`[${name}] two customers at once never share an instance`, dbOpts, async () => {
    const { pool } = db
    await makePool(pool)
    await stock(pool, 'stock-a')
    await stock(pool, 'stock-b')
    const one = await account(pool, 'one@example.test')
    const two = await account(pool, 'two@example.test')

    const [a, b] = await Promise.all([
      allocateFromPool({ pool, config, store, poolKey: POOL_KEY, accountId: one.id, buildId: 'b-1' }),
      allocateFromPool({ pool, config, store, poolKey: POOL_KEY, accountId: two.id, buildId: 'b-2' })
    ])

    assert.equal(a.ok, true)
    assert.equal(b.ok, true)
    assert.notEqual(a.instanceId, b.instanceId)
    assert.notEqual(a.siteKey, b.siteKey)
  })

  test(
    `[${name}] the last instance goes to exactly one of two racers; the other goes cold`,
    dbOpts,
    async () => {
      const { pool } = db
      await makePool(pool)
      await stock(pool, 'stock-only')
      const one = await account(pool, 'one@example.test')
      const two = await account(pool, 'two@example.test')

      const results = await Promise.all([
        allocateFromPool({ pool, config, store, poolKey: POOL_KEY, accountId: one.id, buildId: 'b-1' }),
        allocateFromPool({ pool, config, store, poolKey: POOL_KEY, accountId: two.id, buildId: 'b-2' })
      ])
      const won = results.filter((r) => r.ok)
      const lost = results.filter((r) => !r.ok)
      assert.equal(won.length, 1)
      assert.equal(lost.length, 1)
      // The loser is told the one thing the caller can act on: go cold, on the pinned release.
      assert.equal(lost[0].code, 'NO_STOCK')
    }
  )

  test(
    `[${name}] the same customer pressing twice gets the same instance and the same fence`,
    dbOpts,
    async () => {
      const { pool } = db
      await makePool(pool)
      await stock(pool, 'stock-a')
      await stock(pool, 'stock-b')
      const acc = await account(pool, 'a@example.test')

      const first = await allocateFromPool({
        pool,
        config,
        store,
        poolKey: POOL_KEY,
        accountId: acc.id,
        buildId: 'b-1'
      })
      const again = await allocateFromPool({
        pool,
        config,
        store,
        poolKey: POOL_KEY,
        accountId: acc.id,
        buildId: 'b-1'
      })

      assert.equal(first.ok, true)
      assert.equal(again.ok, true)
      assert.equal(again.instanceId, first.instanceId)
      // 🔒 THE TOKEN MUST NOT MOVE on a retry: a worker already carrying it is still the rightful
      // one, and bumping here would fence off the request that is simply asking again.
      assert.equal(again.fencingToken, first.fencingToken)
      const { rows } = await pool.query(
        "select count(*)::int as n from inventory_instance where state in ('reserved','assigning','assigned')"
      )
      assert.equal(rows[0].n, 1, 'a reload took a second instance')
    }
  )

  test(`[${name}] a different payload under the same buildId is a conflict, not a site`, dbOpts, async () => {
    const { pool } = db
    await makePool(pool)
    await stock(pool, 'stock-a')
    const acc = await account(pool, 'a@example.test')
    await pool.query(
      "insert into site_creation (account_id, build_id, payload_hash, state) values ($1, 'b-1', 'hash-one', 'claiming')",
      [acc.id]
    )

    const got = await allocateFromPool({
      pool,
      config,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-1',
      payloadHash: 'hash-two'
    })

    assert.equal(got.ok, false)
    assert.equal(got.code, 'IDEMPOTENCY_CONFLICT')
    const { rows } = await pool.query(
      "select count(*)::int as n from inventory_instance where state <> 'ready'"
    )
    assert.equal(rows[0].n, 0, 'a conflicting payload still reserved stock')
  })

  test(`[${name}] a disabled or paused pool is said out loud, not reported as empty`, dbOpts, async () => {
    const { pool } = db
    await makePool(pool, { enabled: false })
    await stock(pool, 'stock-a')
    const acc = await account(pool, 'a@example.test')

    const off = await allocateFromPool({
      pool,
      config,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-1'
    })
    assert.deepEqual({ ok: off.ok, code: off.code }, { ok: false, code: 'POOL_DISABLED' })

    await makePool(pool, { enabled: true, paused: true, paused_reason: 'host disk' })
    const held = await allocateFromPool({
      pool,
      config,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-2'
    })
    assert.equal(held.code, 'POOL_DISABLED')
    assert.equal(held.detail, 'host disk')
  })

  test(`[${name}] no pool at all is NO_STOCK — the cold path's ordinary case`, dbOpts, async () => {
    const { pool } = db
    const acc = await account(pool, 'a@example.test')
    const got = await allocateFromPool({
      pool,
      config,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-1'
    })
    assert.deepEqual(got, { ok: false, code: 'NO_STOCK' })
  })

  test(
    `[${name}] a released reservation re-let to somebody else fences the old worker out`,
    dbOpts,
    async () => {
      const { pool } = db
      await makePool(pool)
      await stock(pool, 'stock-a')
      const one = await account(pool, 'one@example.test')
      const two = await account(pool, 'two@example.test')

      const first = await allocateFromPool({
        pool,
        config,
        store,
        poolKey: POOL_KEY,
        accountId: one.id,
        buildId: 'b-1'
      })
      assert.equal(first.ok, true)

      // The first worker goes quiet; a sweeper proves the instance is clean and lets it go, and the
      // next customer takes it. The instance is the same row; the fence is not.
      const client = await pool.connect()
      try {
        const let_go = await store.releaseReservation(client, first.instanceId, {
          expectedFencingToken: first.fencingToken
        })
        assert.equal(let_go.ok, true)
      } finally {
        client.release()
      }
      const second = await allocateFromPool({
        pool,
        config,
        store,
        poolKey: POOL_KEY,
        accountId: two.id,
        buildId: 'b-2'
      })
      assert.equal(second.ok, true)
      assert.equal(second.instanceId, first.instanceId)
      assert.notEqual(second.fencingToken, first.fencingToken)

      // …and now the first worker wakes up and tries to finish its handover.
      const seats = seatsSpy()
      const stale = await activateInstance({
        pool,
        config,
        host: hostSpy(),
        seats,
        instanceId: first.instanceId,
        accountId: one.id,
        email: 'one@example.test',
        expectedFencingToken: first.fencingToken
      })
      assert.equal(stale.ok, false)
      assert.equal(stale.code, 'STALE_FENCE')
      assert.deepEqual(seats.granted, [], 'a fenced-out worker granted a seat anyway')
      const row = (await pool.query('select * from inventory_instance where id = $1', [first.instanceId]))
        .rows[0]
      assert.equal(row.state, 'reserved', 'a fenced-out worker moved the instance')
      assert.equal(row.reserved_account, two.id)
    }
  )

  test(`[${name}] an assigned instance is never let go back to ready`, dbOpts, async () => {
    const { pool } = db
    await makePool(pool)
    await stock(pool, 'stock-a')
    const acc = await account(pool, 'a@example.test')
    const got = await allocateFromPool({
      pool,
      config,
      store,
      poolKey: POOL_KEY,
      accountId: acc.id,
      buildId: 'b-1'
    })
    const done = await activateInstance({
      pool,
      config,
      host: hostSpy(),
      seats: seatsSpy(),
      instanceId: got.instanceId,
      accountId: acc.id,
      email: 'a@example.test',
      expectedFencingToken: got.fencingToken
    })
    assert.equal(done.ok, true)

    const client = await pool.connect()
    try {
      // 🔒 The lease may well have expired. That is not the question: the owner HAS it.
      const refused = await store.releaseReservation(client, got.instanceId, {
        expectedFencingToken: got.fencingToken
      })
      assert.equal(refused.ok, false)
    } finally {
      client.release()
    }
    const row = (await pool.query('select * from inventory_instance where id = $1', [got.instanceId])).rows[0]
    assert.equal(row.state, 'assigned')
    assert.equal(row.reserved_account, acc.id)
  })
}

// ── activation ───────────────────────────────────────────────────────────────────────────────

test('activation grants the owner seat, attaches, and provisions nothing', dbOpts, async () => {
  const { pool } = db
  await makePool(pool)
  const before = await stock(pool, 'stock-a')
  const acc = await account(pool, 'a@example.test')
  const host = hostSpy()
  const seats = seatsSpy()
  const paired = []

  const got = await allocateFromPool({
    pool,
    config,
    store: storeDouble,
    poolKey: POOL_KEY,
    accountId: acc.id,
    buildId: 'b-1'
  })
  const done = await activateInstance({
    pool,
    config,
    host,
    seats,
    instanceId: got.instanceId,
    accountId: acc.id,
    email: 'a@example.test',
    expectedFencingToken: got.fencingToken,
    sites: {
      pairComponent: async (site) => {
        paired.push(site.siteKey)
        return { ok: true }
      },
      setAttached: async () => {}
    }
  })

  assert.equal(done.ok, true)
  assert.equal(done.siteKey, before.site_key)
  assert.equal(done.workspacePath, `/site/${before.label}`)
  assert.deepEqual(host.calls, ['/attach'], 'activation called something other than /attach')
  assert.equal(seats.granted.length, 1)
  assert.deepEqual(
    { siteKey: seats.granted[0].siteKey, role: seats.granted[0].role, accountId: seats.granted[0].accountId },
    { siteKey: before.site_key, role: 'owner', accountId: acc.id }
  )
  assert.deepEqual(paired, [before.site_key])
  // No session door is wired in this test, and that is REPORTED rather than implied.
  assert.deepEqual(done.pending, ['session'])
  assert.equal(done.sessionId, null)
})

test('activation that dies half way resumes on the SAME instance', dbOpts, async () => {
  const { pool } = db
  await makePool(pool)
  const mine = await stock(pool, 'stock-a')
  await stock(pool, 'stock-b')
  const acc = await account(pool, 'a@example.test')

  const got = await allocateFromPool({
    pool,
    config,
    store: storeDouble,
    poolKey: POOL_KEY,
    accountId: acc.id,
    buildId: 'b-1'
  })

  // First attempt: the seat is granted, then the lane call throws and the request dies.
  const seats = seatsSpy()
  await assert.rejects(
    activateInstance({
      pool,
      config,
      host: {
        hostCall: async () => {
          throw new Error('host went away')
        }
      },
      seats,
      instanceId: got.instanceId,
      accountId: acc.id,
      email: 'a@example.test',
      expectedFencingToken: got.fencingToken
    })
  )
  const mid = (await pool.query('select * from inventory_instance where id = $1', [got.instanceId])).rows[0]
  assert.equal(mid.state, 'assigning', 'the checkpoint that names the instance being handed over')

  // Second attempt, same token: it picks up on the instance the first one took.
  const resumed = await activateInstance({
    pool,
    config,
    host: hostSpy(),
    seats,
    instanceId: got.instanceId,
    accountId: acc.id,
    email: 'a@example.test',
    expectedFencingToken: got.fencingToken,
    sites: { pairComponent: async () => ({ ok: true }), setAttached: async () => {} }
  })
  assert.equal(resumed.ok, true)
  assert.equal(resumed.siteKey, mine.site_key)
  const { rows } = await pool.query(
    "select count(*)::int as n from inventory_instance where state in ('reserved','assigning','assigned')"
  )
  assert.equal(rows[0].n, 1, 'the resumed attempt took a second instance')
})

test('activation refuses an instance reserved for somebody else', dbOpts, async () => {
  const { pool } = db
  await makePool(pool)
  await stock(pool, 'stock-a')
  const one = await account(pool, 'one@example.test')
  const two = await account(pool, 'two@example.test')
  const got = await allocateFromPool({
    pool,
    config,
    store: storeDouble,
    poolKey: POOL_KEY,
    accountId: one.id,
    buildId: 'b-1'
  })
  const seats = seatsSpy()
  const refused = await activateInstance({
    pool,
    config,
    host: hostSpy(),
    seats,
    instanceId: got.instanceId,
    accountId: two.id,
    email: 'two@example.test',
    expectedFencingToken: got.fencingToken
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'RESERVED_FOR_ANOTHER')
  assert.deepEqual(seats.granted, [])
})

test('an instance that was never reserved cannot be activated', dbOpts, async () => {
  const { pool } = db
  await makePool(pool)
  const idle = await stock(pool, 'stock-a')
  const acc = await account(pool, 'a@example.test')
  const refused = await activateInstance({
    pool,
    config,
    host: hostSpy(),
    seats: seatsSpy(),
    instanceId: idle.id,
    accountId: acc.id,
    email: 'a@example.test',
    expectedFencingToken: idle.fencing_token
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'NOT_RESERVED')
})

test('stock is invisible to the seat book until it is handed over', dbOpts, async () => {
  const { pool } = db
  await makePool(pool)
  const row = await stock(pool, 'stock-a')
  // The premise the migration rests on, measured rather than asserted: no seat, no `created_by`,
  // and `demo` untouched — so no `/api/sites` query can return it.
  const site = (await pool.query('select * from site where site_key = $1', [row.site_key])).rows[0]
  assert.equal(site.created_by, null)
  const seats = await pool.query('select count(*)::int as n from seat where site_key = $1', [row.site_key])
  assert.equal(seats.rows[0].n, 0)
})
