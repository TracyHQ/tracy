/**
 * `inventory/reconcile.js` — the refill loop, proved on the real database.
 *
 * What these tests are actually for, in the order §4 asks for it:
 *   rule 5 — an event and two concurrent reconciles produce EXACTLY the deficit, never a multiple;
 *   rule 4 — the intent is written under the lock and the host call happens after it is released;
 *   backoff — finite, jittered, and terminal at `max_attempts` with the instance quarantined;
 *   recovery — an intent stranded in `running` by a dead replica is taken back, not stuck forever.
 *
 * `store.js` and `policy.js` belong to a parallel branch, so both are injected here. The store
 * below is real SQL against the real tables (`026-site-inventory.sql`); the policy below implements
 * the contract's `deficitOf`/`jobKeysFor` exactly as written, so what is under test is this file's
 * ordering and locking, not a double's opinion of arithmetic. Only the host is a double.
 */

import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import {
  intents,
  LOCK_ID,
  reconcilePools,
  runRefills,
  settleDrains,
  withInventoryLock
} from '../src/inventory/reconcile.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const config = { origin: 'http://tracy.test:8080', siteDomain: 'localhost', siteAddressPrefix: '' }

const store = {
  async listPools(pool) {
    return (await pool.query('select * from inventory_pool order by pool_key')).rows
  },
  async readPool(pool, poolKey) {
    return (await pool.query('select * from inventory_pool where pool_key = $1', [poolKey])).rows[0] ?? null
  },
  async supplyOf(pool, poolKey) {
    const { rows } = await pool.query(
      'select state, count(*)::int as n from inventory_instance where pool_key = $1 group by state',
      [poolKey]
    )
    const by = Object.fromEntries(rows.map((r) => [r.state, r.n]))
    const ready = by.ready ?? 0
    const preparing = (by.queued ?? 0) + (by.preparing ?? 0) + (by.verifying ?? 0)
    const awaitingReview = by.awaiting_review ?? 0
    const reserved = (by.reserved ?? 0) + (by.assigning ?? 0)
    const assigned = by.assigned ?? 0
    const quarantined = by.quarantined ?? 0
    const draining = by.draining ?? 0
    return {
      ready,
      preparing,
      awaitingReview,
      reserved,
      assigned,
      quarantined,
      draining,
      // Mirrors the real `supplyOf`: an `assigned` instance belongs to a customer and is NOT
      // stock (task §4 rule 3 — sites already handed over sit under the host quota instead).
      stock: ready + preparing + awaitingReview + reserved + quarantined + draining,
      handedOver: assigned
    }
  },
  async enqueueRefill(client, { poolKey, jobKeys }) {
    if (jobKeys.length === 0) return { inserted: 0 }
    const { rowCount } = await client.query(
      `insert into inventory_refill_intent (job_key, pool_key)
       select k, $2 from unnest($1::text[]) as k
       on conflict (job_key) do nothing`,
      [jobKeys, poolKey]
    )
    return { inserted: rowCount }
  },
  async setInstanceState(pool, id, patch = {}) {
    const { rows } = await pool.query(
      `update inventory_instance set state = coalesce($2, state), last_error = coalesce($3, last_error),
         updated_at = now() where id = $1 returning *`,
      [id, patch.state ?? null, patch.lastError ?? null]
    )
    return rows[0] ?? null
  }
}

/** The contract's `policy.js`, implemented here verbatim so the arithmetic is not a double's guess. */
const policy = {
  deficitOf({ supply, policy: p }) {
    if (p.paused) return { deficit: 0, reason: 'the pool is paused', bottleneck: 'paused' }
    if (!p.enabled) return { deficit: 0, reason: 'the pool is not enabled', bottleneck: 'disabled' }
    if (supply.ready > p.lowWatermark)
      return { deficit: 0, reason: 'ready is above the low watermark', bottleneck: 'at-target' }
    let want = Math.max(0, p.targetReady - supply.ready - supply.preparing - supply.awaitingReview)
    if (want === 0 && supply.awaitingReview > 0)
      return { deficit: 0, reason: 'instances are waiting for review', bottleneck: 'awaiting-review' }
    const roomInStock = p.maxStock - supply.stock
    const roomInFlight = p.maxConcurrentPrepares - supply.preparing
    const capped = Math.max(0, Math.min(want, roomInStock, roomInFlight))
    if (capped === 0 && want > 0)
      return {
        deficit: 0,
        reason: roomInStock <= 0 ? 'the pool is at its stock cap' : 'the pool is at its prepare concurrency',
        bottleneck: roomInStock <= 0 ? 'max-stock' : 'concurrency'
      }
    return {
      deficit: capped,
      reason: `${capped} short of target`,
      bottleneck: capped === 0 ? 'at-target' : null
    }
  },
  jobKeysFor(poolKey, deficit, taken) {
    const used = new Set(taken)
    const keys = []
    for (let n = 0; keys.length < deficit; n++) {
      const key = `${poolKey}:${n}`
      if (!used.has(key)) keys.push(key)
    }
    return keys
  }
}

const POOL = 'dev:local:joomla:tracy-business|j6:1.0.0:abcdef012345'

/** One instance row, with the site row its foreign key needs. */
async function seedInstance(pool, { poolKey, siteKey, state = 'ready' }) {
  const label = siteKey.split('.')[0]
  await pool.query(
    `insert into site (site_key, label, host, platform, origin)
     values ($1, $2, 'local', 'joomla', 'fleet_born') on conflict do nothing`,
    [siteKey, label]
  )
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state)
     values ($1, $2, $3, 'local', 'gen', $4) returning *`,
    [poolKey, siteKey, label, state]
  )
  return rows[0]
}

const stateOf = async (pool, id) =>
  (await pool.query('select state from inventory_instance where id = $1', [id])).rows[0].state

async function seedPool(pool, over = {}) {
  const p = {
    enabled: true,
    paused: false,
    pausedReason: null,
    lowWatermark: 1,
    targetReady: 3,
    maxStock: 5,
    maxConcurrentPrepares: 5,
    maxAttempts: 3,
    ...over
  }
  await pool.query(
    `insert into inventory_pool (pool_key, environment, host, platform, quickstart_tag, quickstart_version,
       generation, enabled, paused, paused_reason, low_watermark, target_ready, max_stock,
       max_concurrent_prepares, max_attempts)
     values ($1, 'dev', 'local', 'joomla', 'tracy-business/j6', '1.0.0', 'g1', $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      POOL,
      p.enabled,
      p.paused,
      p.pausedReason,
      p.lowWatermark,
      p.targetReady,
      p.maxStock,
      p.maxConcurrentPrepares,
      p.maxAttempts
    ]
  )
  return p
}

async function addInstance(pool, state, label) {
  await pool.query("insert into site (site_key, label, host) values ($1, $2, 'local')", [
    `${label}.localhost`,
    label
  ])
  const { rows } = await pool.query(
    `insert into inventory_instance (pool_key, site_key, label, host, generation, state)
     values ($1, $2, $3, 'local', 'g1', $4) returning *`,
    [POOL, `${label}.localhost`, label, state]
  )
  return rows[0]
}

const releases = {
  releases: async () => [{ tag: 'tracy-business/j6', platform: 'joomla' }],
  install: async () => ({ platform: 'joomla', version: '1.0.0' }),
  token: async () => 'tok'
}

// ── §4 rule 5: exactly the deficit, however many racers ────────────────────────────────────────

test('reconcile: R=1, P=1, target=3 enqueues ONE intent, not two', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  await addInstance(pool, 'ready', 'inv-r1')
  await addInstance(pool, 'preparing', 'inv-p1')
  const out = await reconcilePools(pool, config, { store, policy, log: {} })
  assert.equal(out.ran, true)
  assert.equal(out.enqueued, 1, '§4 example: target 3 minus ready 1 minus preparing 1')
  const { rows } = await pool.query('select job_key from inventory_refill_intent')
  assert.deepEqual(
    rows.map((r) => r.job_key),
    [`${POOL}:0`]
  )
})

test(
  'reconcile: an event plus two concurrent passes on the real database still produce exactly the deficit',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { targetReady: 3, lowWatermark: 1 })
    // The event half of §4: a claim/drain wrote its own intent for slot 0 before any cron ran.
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })

    // …and two replicas reconcile at the same moment. Three writers, one deficit of 3.
    const [a, b] = await Promise.all([
      reconcilePools(pool, config, { store, policy, log: {} }),
      reconcilePools(pool, config, { store, policy, log: {} })
    ])
    // One of them may have skipped its tick — that is the advisory lock doing its job, and it is
    // not a failure. What must hold is the row count.
    assert.equal([a.ran, b.ran].filter(Boolean).length >= 1, true)

    const { rows } = await pool.query('select job_key from inventory_refill_intent order by job_key')
    assert.deepEqual(
      rows.map((r) => r.job_key),
      [`${POOL}:0`, `${POOL}:1`, `${POOL}:2`],
      "three writers, one shortfall of three — the second pass must see the first pass's intents"
    )
    // Between them the passes wrote the two missing slots, and whichever came SECOND wrote none.
    // Compared as a sorted pair, not by position: `Promise.all` keeps the order the passes were
    // STARTED in, not the order they took the lock, so `b` winning made `.at(-1)` the pass that
    // did all the work — measured red on CI (2 !== 0) with the row count above still correct.
    const enqueued = [a, b]
      .filter((p) => p.ran)
      .map((p) => p.enqueued)
      .sort((x, y) => x - y)
    assert.deepEqual(
      enqueued,
      enqueued.length === 2 ? [0, 2] : [2],
      'a pass that arrives after the shortfall is already covered enqueues nothing'
    )
  }
)

test(
  'reconcile: two writers computing the SAME slots insert once — the key is the dedupe',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    const keys = [`${POOL}:0`, `${POOL}:1`, `${POOL}:2`]
    // Deliberately below the lock: this is the race the primary key has to survive on its own,
    // because the event road (a claim's own transaction) never takes the reconciler's lock.
    const [x, y] = await Promise.all([
      store.enqueueRefill(pool, { poolKey: POOL, jobKeys: keys }),
      store.enqueueRefill(pool, { poolKey: POOL, jobKeys: keys })
    ])
    assert.equal(x.inserted + y.inserted, 3)
    const { rows } = await pool.query('select count(*)::int as n from inventory_refill_intent')
    assert.equal(rows[0].n, 3)
  }
)

test('reconcile: a paused pool enqueues nothing and says why', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool, { paused: true, pausedReason: 'the host is out of disk' })
  const out = await reconcilePools(pool, config, { store, policy, log: {} })
  assert.equal(out.enqueued, 0)
  assert.equal(out.pools[0].bottleneck, 'paused')
  const { rows } = await pool.query('select count(*)::int as n from inventory_refill_intent')
  assert.equal(rows[0].n, 0)
})

test(
  'reconcile: instances already waiting for review are a bottleneck, not a reason to build more',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { targetReady: 2, lowWatermark: 1 })
    await addInstance(pool, 'awaiting_review', 'inv-ar1')
    await addInstance(pool, 'awaiting_review', 'inv-ar2')
    const out = await reconcilePools(pool, config, { store, policy, log: {} })
    assert.equal(out.enqueued, 0)
    assert.equal(out.pools[0].bottleneck, 'awaiting-review')
  }
)

// ── §4 rule 4: the network call happens with no lock held ──────────────────────────────────────

test('runRefills: the reconciler lock is FREE while the host call is in flight', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })

  let lockWasFree = null
  let intentWasClaimed = null
  const prepare = {
    prepareInstance: async () => {
      // A separate session, taken at the moment the "provision" is running. Both facts matter:
      // the lock must be gone (or a minutes-long install freezes every other writer), AND the
      // intent must already be marked `running` (or something else would pick it up meanwhile).
      const probe = await pool.connect()
      try {
        const { rows } = await probe.query('select pg_try_advisory_lock($1) as got', [LOCK_ID])
        lockWasFree = rows[0].got
        if (rows[0].got) await probe.query('select pg_advisory_unlock($1)', [LOCK_ID])
        intentWasClaimed = (
          await probe.query('select state from inventory_refill_intent where job_key = $1', [`${POOL}:0`])
        ).rows[0].state
      } finally {
        probe.release()
      }
      return { ok: true, instanceId: null }
    }
  }
  const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
  assert.deepEqual({ ran: out.ran, started: out.started, done: out.done }, { ran: true, started: 1, done: 1 })
  assert.equal(lockWasFree, true, '§4 rule 4: release the lock, THEN provision')
  assert.equal(intentWasClaimed, 'running', 'the work is marked taken before the lock is let go')
  const { rows } = await pool.query('select state from inventory_refill_intent')
  assert.equal(rows[0].state, 'done')
})

// ── Backoff: finite, jittered, terminal ────────────────────────────────────────────────────────

test('runRefills: a failure backs off into the future and keeps the reason', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool, { maxAttempts: 3 })
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
  const prepare = {
    prepareInstance: async () => ({ ok: false, code: 'HOST_REFUSED', detail: { status: 502 } })
  }
  const out = await runRefills(pool, config, {
    store,
    prepare,
    releases,
    host: {},
    log: {},
    random: () => 0.5
  })
  assert.deepEqual({ done: out.done, failed: out.failed }, { done: 0, failed: 1 })
  const { rows } = await pool.query(
    `select state, attempts, last_error, next_at > now() as later,
            next_at <= now() + interval '20 minutes' as bounded from inventory_refill_intent`
  )
  assert.equal(rows[0].state, 'pending')
  assert.equal(rows[0].attempts, 1)
  assert.match(rows[0].last_error, /HOST_REFUSED/)
  assert.equal(rows[0].later, true, 'a retry that is due immediately is a storm, not a backoff')
  assert.equal(rows[0].bounded, true, 'and the backoff is capped, not unbounded')
})

test(
  'backoff: jitter actually moves the delay — two failures of the same attempt differ',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`, `${POOL}:1`] })
    const row = { job_key: `${POOL}:0`, attempts: 3, instance_id: null }
    const low = await intents.settle(pool, row, { ok: false, error: 'e', maxAttempts: 9, random: () => 0 })
    const high = await intents.settle(
      pool,
      { ...row, job_key: `${POOL}:1` },
      {
        ok: false,
        error: 'e',
        maxAttempts: 9,
        random: () => 0.999
      }
    )
    assert.equal(low.delay < high.delay, true, 'no jitter means N replicas retry in the same millisecond')
    assert.equal(high.delay <= 15 * 60 * 1000, true)
  }
)

test(
  'runRefills: out of attempts is terminal — the intent fails and its instance is quarantined',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool, { maxAttempts: 2 })
    const instance = await addInstance(pool, 'queued', 'inv-doomed')
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
    await pool.query('update inventory_refill_intent set instance_id = $1', [instance.id])
    const prepare = { prepareInstance: async () => ({ ok: false, code: 'HOST_REFUSED' }) }
    const deps = { store, prepare, releases, host: {}, log: {}, random: () => 0.5 }

    await runRefills(pool, config, deps) // attempt 1 → pending
    await pool.query('update inventory_refill_intent set next_at = now()') // the backoff elapses
    await runRefills(pool, config, deps) // attempt 2 → out of attempts

    const { rows: intent } = await pool.query(
      'select state, attempts, last_error from inventory_refill_intent'
    )
    assert.equal(intent[0].state, 'failed')
    assert.equal(intent[0].attempts, 2)
    assert.match(intent[0].last_error, /HOST_REFUSED/)
    const { rows: inst } = await pool.query(
      'select state, last_error from inventory_instance where id = $1',
      [instance.id]
    )
    assert.equal(inst[0].state, 'quarantined', 'an instance nobody will retry must stop counting as supply')
    assert.match(inst[0].last_error, /HOST_REFUSED/)
  }
)

test(
  'runRefills: a retry resumes the instance the intent already made, never a second site',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    const instance = await addInstance(pool, 'queued', 'inv-resume')
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
    await pool.query('update inventory_refill_intent set instance_id = $1', [instance.id])
    let seen = null
    const prepare = {
      prepareInstance: async (input) => {
        seen = input.instanceId
        return { ok: true, instanceId: input.instanceId }
      }
    }
    await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
    assert.equal(seen, instance.id)
  }
)

// ── Recovery: nothing stays stuck ──────────────────────────────────────────────────────────────

test('claim: an intent stranded in `running` past its lease is taken back', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
  // A replica claimed this and died. Without the lease half of the predicate it sits here for
  // good — and because it counts as work in flight, the pool's deficit never comes back either.
  await pool.query(
    "update inventory_refill_intent set state = 'running', next_at = now() - interval '1 hour'"
  )
  let picked = 0
  const prepare = { prepareInstance: async () => (picked++, { ok: true, instanceId: null }) }
  const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
  assert.equal(picked, 1, 'a dead replica must not strand its intent')
  assert.equal(out.done, 1)
})

test('claim: a `running` intent still inside its lease is left alone', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
  await pool.query(
    "update inventory_refill_intent set state = 'running', next_at = now() + interval '9 minutes'"
  )
  let picked = 0
  const prepare = { prepareInstance: async () => (picked++, { ok: true, instanceId: null }) }
  await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
  assert.equal(picked, 0, 'a healthy worker must not be raced by the next tick')
})

test("the reconciler holds its OWN lock id, not cron.js's 7_243_002", dbOpts, async () => {
  const { pool } = db
  assert.equal(LOCK_ID, 7_243_003)
  // Cron's lock held by somebody else must not stop a refill: that sharing is exactly what would
  // freeze the seat-sync drain and the provision sweep for the length of an install.
  const cron = await pool.connect()
  try {
    await cron.query('select pg_advisory_lock($1)', [7_243_002])
    let ran = false
    await withInventoryLock(pool, async () => {
      ran = true
    })
    assert.equal(ran, true)
    await cron.query('select pg_advisory_unlock($1)', [7_243_002])
  } finally {
    cron.release()
  }
})

test('withInventoryLock: the replica that loses skips its tick rather than queueing', dbOpts, async () => {
  const { pool } = db
  const held = await pool.connect()
  try {
    await held.query('select pg_advisory_lock($1)', [LOCK_ID])
    let ran = false
    const got = await withInventoryLock(pool, async () => {
      ran = true
    })
    assert.equal(got, false)
    assert.equal(ran, false)
    const out = await reconcilePools(pool, config, { store, policy, log: {} })
    assert.deepEqual(out, { ran: false, enqueued: 0, pools: [] })
    await held.query('select pg_advisory_unlock($1)', [LOCK_ID])
  } finally {
    held.release()
  }
})

// ── The wiring, against the real modules ───────────────────────────────────────────────────────

/**
 * Everything above injects doubles for `store`/`policy` so that this file could be written while
 * those two were still being written elsewhere. This one test does the opposite: it imports the
 * REAL `inventory/store.js` and `inventory/policy.js` and drives one shortfall end to end through
 * them, so a signature that drifts apart between the two branches fails here rather than on the
 * stand. Only the host and the release lookups stay doubles — they are the network.
 */
test('wiring: a real pool, the real store and the real policy refill one instance', dbOpts, async () => {
  const realStore = await import('../src/inventory/store.js')
  const realPolicy = await import('../src/inventory/policy.js')
  const realPrepare = await import('../src/inventory/prepare.js')
  const { createSite, putJob, siteByKey } = await import('../src/sites/store.js')

  const { pool } = db
  await realStore.upsertPool(pool, {
    poolKey: POOL,
    environment: 'dev',
    host: 'local',
    platform: 'joomla',
    quickstartTag: 'tracy-business/j6',
    quickstartVersion: '1.0.0',
    generation: 'g1',
    updatedBy: 'test'
  })
  await realStore.setPolicy(
    pool,
    POOL,
    { enabled: true, lowWatermark: 1, targetReady: 2 },
    { expectedRevision: 1, updatedBy: 'test' }
  )

  const decided = await reconcilePools(pool, config, {
    store: realStore,
    policy: realPolicy,
    log: {}
  })
  assert.equal(decided.ran, true)
  assert.equal(decided.enqueued >= 1, true)

  const host = { hostCall: async () => ({ ok: true, status: 200, body: { jobId: 'job-wired' } }) }
  const made = await runRefills(pool, config, {
    store: realStore,
    prepare: realPrepare,
    sites: { createSite, putJob, siteByKey },
    releases,
    host,
    log: {}
  })
  assert.deepEqual({ ran: made.ran, done: made.done, failed: made.failed }, { ran: true, done: 1, failed: 0 })

  const { rows } = await pool.query('select state, site_key, job_id, attempts from inventory_instance')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].state, 'preparing')
  assert.equal(rows[0].job_id, 'job-wired')
  assert.equal(rows[0].attempts, 1)
  // Still owned by nobody, through the real store as well.
  const site = await siteByKey(pool, rows[0].site_key)
  assert.equal(site.created_by, null)
  assert.equal(site.demo, false)
  assert.deepEqual(await realStore.supplyOf(pool, POOL), {
    ready: 0,
    preparing: 1,
    awaitingReview: 0,
    reserved: 0,
    assigned: 0,
    quarantined: 0,
    draining: 0,
    stock: 1,
    handedOver: 0
  })
})

// ── A stopped pool's intents are never claimed ─────────────────────────────────────────────────

/**
 * `reconcilePools` refusing to ENQUEUE for a paused pool was read as enough, and it is not: an
 * intent written a moment before the pause is still sitting in the outbox, and the next drain
 * would install it. Measured 22/09 on the local stand — a pool paused with a reason, one pending
 * intent, and the very next drain started a real CMS install (`inv-5gxygu16`). An operator who
 * pauses a pool that is running away watches it keep installing, which is the one thing the
 * button is for.
 *
 * The guard lives in the CLAIM, not in the caller, and the difference is what these tests are
 * mostly about: a claim-then-notice-then-put-back has already spent an `attempts` and already
 * pushed `next_at` out by a full lease, so lifting the pause leaves the intent waiting ten more
 * minutes for work that never ran. A row that is never touched needs nothing undone.
 */

/** Change policy through the real store, so the test cannot stop a pool in a way the product cannot. */
async function setPoolPolicy(pool, patch, expectedRevision = 1) {
  const realStore = await import('../src/inventory/store.js')
  const out = await realStore.setPolicy(pool, POOL, patch, { expectedRevision, updatedBy: 'test' })
  assert.equal(out.ok, true, `setPolicy refused: ${out.code} ${out.detail ?? ''}`)
  return out.row
}

/** A `prepare` double that counts its calls — the fact these tests turn on. */
function countingPrepare() {
  const calls = []
  return {
    calls,
    prepareInstance: async (input) => {
      calls.push(input.poolKey)
      return { ok: true, instanceId: null }
    }
  }
}

test('runRefills: a pool paused after its intent was written does NOT install it', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  // The order is the whole point: the intent is written while the pool is still running…
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
  // …and only then does the operator press pause.
  const row = await setPoolPolicy(pool, { paused: true, pausedReason: 'the pool is running away' })
  assert.equal(row.paused, true)

  const prepare = countingPrepare()
  const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })

  assert.equal(prepare.calls.length, 0, 'a paused pool must not reach prepareInstance at all')
  assert.deepEqual(
    { ran: out.ran, started: out.started, done: out.done, failed: out.failed },
    { ran: true, started: 0, done: 0, failed: 0 },
    'nothing was claimed, so nothing was started, finished or failed'
  )
  const { rows: inst } = await pool.query('select count(*)::int as n from inventory_instance')
  assert.equal(inst[0].n, 0, 'no instance may be born out of a paused pool')
  const { rows: intent } = await pool.query('select state from inventory_refill_intent')
  assert.equal(
    intent[0].state,
    'pending',
    'the shortfall is still recorded, waiting for the pool to come back'
  )
})

test(
  'runRefills: a paused pool leaves its intent untouched — attempts and next_at do not move',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
    await setPoolPolicy(pool, { paused: true, pausedReason: 'the host is out of disk' })

    const read = async () =>
      (
        await pool.query(
          'select state, attempts, next_at, last_error from inventory_refill_intent where job_key = $1',
          [`${POOL}:0`]
        )
      ).rows[0]
    const before = await read()

    const prepare = countingPrepare()
    await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
    const after = await read()

    assert.equal(after.state, 'pending', 'a pause is a wait, not an ending')
    assert.equal(
      after.attempts,
      before.attempts,
      'a pass that never ran the work is NOT an attempt: counting it burns a backoff budget nothing spent'
    )
    assert.equal(
      after.next_at.getTime(),
      before.next_at.getTime(),
      'and nothing may push the intent into the future — a resumed pool would then sit idle for a whole lease'
    )
    assert.equal(after.last_error, null, 'nothing went wrong, so nothing may be written down as if it had')
  }
)

test('runRefills: a pool switched off is passed over exactly as a paused one is', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
  // `enabled: false` is the other half of the same decision — the pool is not to build now.
  const row = await setPoolPolicy(pool, { enabled: false })
  assert.equal(row.enabled, false)
  assert.equal(row.paused, false, 'switched off, not paused — this is the OTHER half of the predicate')

  const prepare = countingPrepare()
  const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })

  assert.equal(prepare.calls.length, 0, 'a disabled pool must not reach prepareInstance either')
  assert.deepEqual(
    { started: out.started, done: out.done, failed: out.failed },
    { started: 0, done: 0, failed: 0 }
  )
  const { rows } = await pool.query('select state, attempts from inventory_refill_intent')
  assert.equal(rows[0].state, 'pending')
  assert.equal(rows[0].attempts, 0, 'a pool that is off must not spend the attempts of work it never ran')
})

test(
  'runRefills: lifting the pause lets the very intent that waited run on the NEXT pass',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`] })
    await setPoolPolicy(pool, { paused: true, pausedReason: 'the host is out of disk' }, 1)

    const prepare = countingPrepare()
    const skipped = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
    assert.equal(prepare.calls.length, 0)
    assert.equal(skipped.started, 0)

    // Unpause. Nothing else changes — same intent, same slot, same pool, and NO clock is waited on.
    const row = await setPoolPolicy(pool, { paused: false, pausedReason: null }, 2)
    assert.equal(row.paused, false)

    const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })
    assert.equal(
      prepare.calls.length,
      1,
      'passing over is a deferral, not a cancellation — and not a lease to sit out either'
    )
    assert.deepEqual({ started: out.started, done: out.done }, { started: 1, done: 1 })
    const { rows } = await pool.query('select state from inventory_refill_intent where job_key = $1', [
      `${POOL}:0`
    ])
    assert.equal(rows[0].state, 'done')
  }
)

test(
  'runRefills: a running pool drains exactly as before — the guard holds nothing back',
  dbOpts,
  async () => {
    const { pool } = db
    await seedPool(pool)
    await store.enqueueRefill(pool, { poolKey: POOL, jobKeys: [`${POOL}:0`, `${POOL}:1`] })
    const prepare = countingPrepare()
    const out = await runRefills(pool, config, { store, prepare, releases, host: {}, log: {} })

    assert.equal(
      prepare.calls.length,
      2,
      'the positive case: a claim predicate that matches nothing is worse'
    )
    assert.deepEqual(
      { ran: out.ran, started: out.started, done: out.done, failed: out.failed },
      { ran: true, started: 2, done: 2, failed: 0 }
    )
    const { rows } = await pool.query(
      "select count(*)::int as n from inventory_refill_intent where state = 'done'"
    )
    assert.equal(rows[0].n, 2)
  }
)

// ── Finishing a teardown ──────────────────────────────────────────────────────────────────────
//
// `retire → retired` asks the host to tear the site down and leaves the row in `draining` carrying
// the job. Something has to notice when that job finishes, or the row sits in `draining` for ever
// and the screen looks like the button did nothing — which is exactly what it looked like
// (measured 22/09: the job said `done`, the row still said `draining`).

test('settleDrains: a finished teardown retires the row', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await seedInstance(pool, {
    poolKey: POOL,
    siteKey: 'inv-gone.tracy.test',
    state: 'draining'
  })
  await pool.query("update inventory_instance set job_id = 'tear-1' where id = $1", [instance.id])

  const out = await settleDrains(pool, config, {
    host: { hostJob: async () => ({ ok: true, status: 200, body: { state: 'done' } }) }
  })
  assert.equal(out.retired, 1)
  assert.equal(await stateOf(pool, instance.id), 'retired')
})

test('settleDrains: a teardown that failed stays put and says why', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await seedInstance(pool, {
    poolKey: POOL,
    siteKey: 'inv-stuck.tracy.test',
    state: 'draining'
  })
  await pool.query("update inventory_instance set job_id = 'tear-2' where id = $1", [instance.id])

  const out = await settleDrains(pool, config, {
    host: {
      hostJob: async () => ({ ok: true, status: 200, body: { state: 'failed', detail: 'volume busy' } })
    }
  })
  assert.equal(out.retired, 0)
  // 🔒 NOT RETIRED: the site is still standing, and marking the row gone would leave a folder on
  // the host that nothing will ever reclaim — the exact debris this whole press exists to remove.
  assert.equal(await stateOf(pool, instance.id), 'draining')
  const { rows } = await pool.query('select last_error from inventory_instance where id = $1', [instance.id])
  assert.match(rows[0].last_error, /volume busy/)
})

test('settleDrains: a host that does not answer changes nothing at all', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  const instance = await seedInstance(pool, {
    poolKey: POOL,
    siteKey: 'inv-quiet.tracy.test',
    state: 'draining'
  })
  await pool.query("update inventory_instance set job_id = 'tear-3' where id = $1", [instance.id])

  const out = await settleDrains(pool, config, {
    host: { hostJob: async () => ({ ok: false, status: 0, body: null }) }
  })
  assert.equal(out.retired, 0)
  assert.equal(await stateOf(pool, instance.id), 'draining')
})

test('settleDrains: a drain nobody started is left alone', dbOpts, async () => {
  const { pool } = db
  await seedPool(pool)
  // `retire → draining` (the label-only press) writes no job. It is a decision, not a teardown,
  // and finishing it here would delete a site nobody asked to delete.
  const instance = await seedInstance(pool, {
    poolKey: POOL,
    siteKey: 'inv-marked.tracy.test',
    state: 'draining'
  })
  let asked = 0
  const out = await settleDrains(pool, config, {
    host: { hostJob: async () => (asked++, { ok: true, body: {} }) }
  })
  assert.equal(asked, 0)
  assert.equal(out.retired, 0)
  assert.equal(await stateOf(pool, instance.id), 'draining')
})
