/**
 * The inventory book against a real Postgres: the supply counts, the policy lock, the reservation
 * CAS and the refill outbox.
 *
 * The reservation tests run two transactions at once on purpose. `reserveReady` is this
 * repository's first use of `for update skip locked`, and the whole point of it — that a second
 * claimant steps over the row the first is holding instead of blocking on it and then finding
 * nothing — cannot be shown by calling the function twice in a row.
 */
import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'

import {
  approvalOf,
  approveGeneration,
  dueRefills,
  enqueueRefill,
  insertInstance,
  instanceById,
  instanceBySiteKey,
  listInstances,
  listPools,
  readPool,
  readSweep,
  recordSweepEnd,
  recordSweepStart,
  releaseReservation,
  reserveReady,
  SWEEP_PERIOD_MS,
  setInstanceState,
  setPolicy,
  setSweepPeriod,
  settleRefill,
  supplyOf,
  upsertPool
} from '../src/inventory/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const POOL_KEY = 'prod:prod1:joomla:tracy-business/j6:1.0.0:abcdef012345'
const GENERATION = 'abcdef0123456789'

const identity = (over = {}) => ({
  poolKey: POOL_KEY,
  environment: 'prod',
  host: 'prod1',
  platform: 'joomla',
  quickstartTag: 'tracy-business/j6',
  quickstartVersion: '1.0.0',
  generation: GENERATION,
  updatedBy: 'ops@tracy.test',
  ...over
})

/** A stock instance in a given state, with its site row underneath it. */
async function stock(pool, label, { state = 'ready', healthOk = true, healthAgeSeconds = 0 } = {}) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, created_by)
     values ($1, $1, 'prod1', 'joomla', 'fleet_born', null)`,
    [label]
  )
  const row = await insertInstance(pool, {
    poolKey: POOL_KEY,
    siteKey: label,
    label,
    host: 'prod1',
    generation: GENERATION
  })
  await pool.query(
    `update inventory_instance set state = $2, health_ok = $3,
            health_checked_at = now() - make_interval(secs => $4::int) where id = $1`,
    [row.id, state, healthOk, healthAgeSeconds]
  )
  return row.id
}

/**
 * Run `fn` with two clients checked out at the same time, and give both back before returning.
 *
 * The releases have to happen here rather than in a `t.after` hook: the hook that closes the pool
 * is registered first and `pool.end()` waits for every checked-out client, so a release scheduled
 * after it never runs and the test hangs instead of failing.
 */
async function twoAtOnce(pool, fn) {
  const a = await pool.connect()
  const b = await pool.connect()
  try {
    return await fn(a, b)
  } finally {
    a.release()
    b.release()
  }
}

async function anAccount(pool, email) {
  const { rows } = await pool.query('insert into account (email) values ($1) returning id', [email])
  return rows[0].id
}

test('a pool is created once and a second call does not touch its policy', dbOpts, async () => {
  const { pool } = db
  const created = await upsertPool(pool, identity())
  assert.equal(created.enabled, false, 'rollout is a flag, pools do not start installing')
  assert.equal(created.revision, 1)

  const changed = await setPolicy(pool, POOL_KEY, { enabled: true, targetReady: 3 }, { expectedRevision: 1 })
  assert.equal(changed.ok, true)

  const again = await upsertPool(pool, identity({ updatedBy: 'someone-else@tracy.test' }))
  assert.equal(again.enabled, true, 'an operator decision was overwritten')
  assert.equal(again.target_ready, 3)
  assert.equal(again.updated_by, 'someone-else@tracy.test')
  assert.equal((await listPools(pool)).length, 1)
})

test('policy moves under an optimistic lock; the loser is told, not applied', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())

  const first = await setPolicy(
    pool,
    POOL_KEY,
    { targetReady: 2 },
    { expectedRevision: 1, updatedBy: 'a@t.test' }
  )
  assert.equal(first.ok, true)
  assert.equal(first.row.revision, 2)

  // A second screen still looking at revision 1.
  const stale = await setPolicy(pool, POOL_KEY, { targetReady: 5 }, { expectedRevision: 1 })
  assert.deepEqual({ ok: stale.ok, code: stale.code }, { ok: false, code: 'REVISION_CONFLICT' })
  assert.equal((await readPool(pool, POOL_KEY)).target_ready, 2)
})

test('pausing without a reason is refused — that is the state nobody can act on', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())

  const bare = await setPolicy(pool, POOL_KEY, { paused: true }, { expectedRevision: 1 })
  assert.deepEqual({ ok: bare.ok, code: bare.code }, { ok: false, code: 'INVALID' })
  assert.match(bare.detail, /pausedReason/)
  assert.equal((await readPool(pool, POOL_KEY)).paused, false)

  const withReason = await setPolicy(
    pool,
    POOL_KEY,
    { paused: true, pausedReason: 'host disk below 10%' },
    { expectedRevision: 1 }
  )
  assert.equal(withReason.ok, true)
  assert.equal(withReason.row.paused_reason, 'host disk below 10%')
})

test('out-of-bounds and unknown policy fields are refused by name', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  const cases = [
    [{ targetReady: 0 }, /targetReady/],
    [{ lowWatermark: -1 }, /lowWatermark/],
    [{ healthTtlSeconds: 0 }, /healthTtlSeconds/],
    [{ maxConcurrentPrepares: 0 }, /maxConcurrentPrepares/],
    [{ enabled: 'yes' }, /enabled/],
    [{ nonsense: 1 }, /nonsense/],
    // The merge is against the row: maxStock defaults to 3, so a target of 4 alone is out of bounds.
    [{ targetReady: 4 }, /maxStock/],
    [{ lowWatermark: 2, targetReady: 1 }, /lowWatermark/]
  ]
  for (const [patch, detail] of cases) {
    const out = await setPolicy(pool, POOL_KEY, patch, { expectedRevision: 1 })
    assert.equal(out.ok, false, `${JSON.stringify(patch)} was accepted`)
    assert.equal(out.code, 'INVALID')
    assert.match(out.detail, detail)
  }
  assert.equal((await readPool(pool, POOL_KEY)).revision, 1, 'a refused patch still moved the revision')
})

test('supply counts the ladder, and stale health leaves ready without leaving stock', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await setPolicy(pool, POOL_KEY, { healthTtlSeconds: 3600 }, { expectedRevision: 1 })

  await stock(pool, 'ready-1')
  await stock(pool, 'stale-1', { healthAgeSeconds: 7200 })
  await stock(pool, 'unhealthy-1', { healthOk: false })
  await stock(pool, 'queued-1', { state: 'queued' })
  await stock(pool, 'verifying-1', { state: 'verifying' })
  await stock(pool, 'hold-1', { state: 'awaiting_review' })
  await stock(pool, 'reserved-1', { state: 'reserved' })
  await stock(pool, 'assigning-1', { state: 'assigning' })
  await stock(pool, 'assigned-1', { state: 'assigned' })
  await stock(pool, 'quarantined-1', { state: 'quarantined' })
  await stock(pool, 'draining-1', { state: 'draining' })
  await stock(pool, 'retired-1', { state: 'retired' })

  const supply = await supplyOf(pool, POOL_KEY)
  assert.deepEqual(supply, {
    ready: 1,
    preparing: 2,
    awaitingReview: 1,
    reserved: 1,
    assigned: 2,
    quarantined: 1,
    draining: 1,
    // Eleven rows still hold a database, a volume and a port: everything but the retired one. The
    // two ready-but-unusable instances are among them, which is why stock is not the sum of the
    // buckets above.
    // 🔒 TEN, NOT ELEVEN: the one `assigned` row is a customer's site, not stock. The task's §4
    // rule 3 lists what the cap counts — awaiting_review, reserved, quarantined, draining — and
    // puts sites already handed over under the host quota instead. `assigning` still counts, the
    // same way `reserved` does: both are committed but not yet gone.
    stock: 10,
    handedOver: 1
  })
})

test('an empty pool answers zeroes rather than nothing', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  assert.deepEqual(await supplyOf(pool, POOL_KEY), {
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
})

test('instance state moves field by field; a health verdict stamps its time', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  const id = await stock(pool, 'inst-1', { state: 'queued', healthOk: null })

  const preparing = await setInstanceState(pool, id, {
    state: 'preparing',
    jobId: 'job-7',
    bumpAttempt: true
  })
  assert.equal(preparing.state, 'preparing')
  assert.equal(preparing.job_id, 'job-7')
  assert.equal(preparing.attempts, 1)

  const verified = await setInstanceState(pool, id, {
    state: 'ready',
    healthOk: true,
    healthDetail: { cms: 200 },
    hashes: { cowork: 'r1' }
  })
  assert.equal(verified.job_id, 'job-7', 'a health result blanked the job id')
  assert.equal(verified.health_ok, true)
  assert.ok(verified.health_checked_at, 'a verdict with no time never expires')
  assert.deepEqual(verified.health_detail, { cms: 200 })
  assert.deepEqual(verified.hashes, { cowork: 'r1' })

  assert.equal((await instanceById(pool, id)).state, 'ready')
  assert.equal((await instanceBySiteKey(pool, 'inst-1')).id, id)
  assert.equal(await setInstanceState(pool, '00000000-0000-0000-0000-000000000000', { state: 'ready' }), null)
})

test('instances list by pool and filter by state', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await stock(pool, 'ready-1')
  await stock(pool, 'queued-1', { state: 'queued' })
  assert.equal((await listInstances(pool, POOL_KEY)).length, 2)
  const ready = await listInstances(pool, POOL_KEY, { states: ['ready'] })
  assert.deepEqual(
    ready.map((r) => r.label),
    ['ready-1']
  )
})

test('two transactions racing take two DIFFERENT instances', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await stock(pool, 'ready-1')
  await stock(pool, 'ready-2')
  const alice = await anAccount(pool, 'alice@tracy.test')
  const bob = await anAccount(pool, 'bob@tracy.test')

  const [first, second] = await twoAtOnce(pool, async (a, b) => {
    await a.query('begin')
    await b.query('begin')
    // A takes one and HOLDS the row lock — it has not committed.
    const one = await reserveReady(a, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-a' })
    // B must step over the row A is holding rather than block on it and then find nothing.
    const two = await reserveReady(b, { poolKey: POOL_KEY, accountId: bob, buildId: 'build-b' })
    await a.query('commit')
    await b.query('commit')
    return [one, two]
  })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first.instance.id, second.instance.id, 'both claimants took the same instance')
  assert.deepEqual(
    [first.instance.label, second.instance.label].sort(),
    ['ready-1', 'ready-2'],
    'a claimant took something that was not stock'
  )
  const supply = await supplyOf(pool, POOL_KEY)
  assert.equal(supply.ready, 0)
  assert.equal(supply.reserved, 2)
})

test('a second claimant on the last instance is told NONE_READY, not made to wait', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await stock(pool, 'ready-1')
  const alice = await anAccount(pool, 'alice@tracy.test')
  const bob = await anAccount(pool, 'bob@tracy.test')

  const second = await twoAtOnce(pool, async (a, b) => {
    await a.query('begin')
    await b.query('begin')
    assert.equal(
      (await reserveReady(a, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-a' })).ok,
      true
    )
    // Without `skip locked` this call would block until A commits.
    const out = await reserveReady(b, { poolKey: POOL_KEY, accountId: bob, buildId: 'build-b' })
    await a.query('commit')
    await b.query('commit')
    return out
  })
  assert.deepEqual(second, { ok: false, code: 'NONE_READY' })
})

test(
  'the same (account, build) gets its own instance back, with the SAME fencing token',
  dbOpts,
  async () => {
    const { pool } = db
    await upsertPool(pool, identity())
    await stock(pool, 'ready-1')
    await stock(pool, 'ready-2')
    const alice = await anAccount(pool, 'alice@tracy.test')

    const first = await reserveReady(pool, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-a' })
    const retry = await reserveReady(pool, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-a' })
    assert.equal(retry.ok, true)
    assert.equal(retry.instance.id, first.instance.id, 'a retry took a second site')
    assert.equal(retry.fencingToken, first.fencingToken, 'a retry moved the fence under the first attempt')
    assert.equal((await supplyOf(pool, POOL_KEY)).ready, 1, 'the retry consumed a second instance')
  }
)

test('a reservation is refused on stale or missing health', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await setPolicy(pool, POOL_KEY, { healthTtlSeconds: 60 }, { expectedRevision: 1 })
  await stock(pool, 'stale-1', { healthAgeSeconds: 600 })
  await stock(pool, 'unchecked-1', { healthOk: null })
  const alice = await anAccount(pool, 'alice@tracy.test')
  assert.deepEqual(await reserveReady(pool, { poolKey: POOL_KEY, accountId: alice, buildId: 'b' }), {
    ok: false,
    code: 'NONE_READY'
  })
})

test('a reservation comes back only while it is still a reservation', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await stock(pool, 'ready-1')
  const alice = await anAccount(pool, 'alice@tracy.test')

  const taken = await reserveReady(pool, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-a' })
  assert.equal(taken.fencingToken, 1, 'the fence must move on every reservation')

  const stale = await releaseReservation(pool, taken.instance.id, { expectedFencingToken: 0 })
  assert.deepEqual(stale, { ok: false, code: 'STALE_FENCE' })

  const released = await releaseReservation(pool, taken.instance.id, { expectedFencingToken: 1 })
  assert.equal(released.ok, true)
  assert.equal(released.instance.state, 'ready')
  assert.equal(released.instance.reserved_account, null)

  // Taken again: the fence moves on, so a worker still carrying token 1 is refused.
  const again = await reserveReady(pool, { poolKey: POOL_KEY, accountId: alice, buildId: 'build-b' })
  assert.equal(again.fencingToken, 2)

  await setInstanceState(pool, again.instance.id, { state: 'assigned' })
  const handed = await releaseReservation(pool, again.instance.id, { expectedFencingToken: 2 })
  assert.deepEqual(
    handed,
    { ok: false, code: 'NOT_RESERVED' },
    'an assigned site was handed to the next request'
  )
  assert.deepEqual(
    await releaseReservation(pool, '00000000-0000-0000-0000-000000000000', {
      expectedFencingToken: 1
    }),
    { ok: false, code: 'NOT_FOUND' }
  )
})

test('one deficit enqueued by three racers leaves one row per slot', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  const jobKeys = [`${POOL_KEY}:1`, `${POOL_KEY}:2`]

  assert.deepEqual(await enqueueRefill(pool, { poolKey: POOL_KEY, jobKeys }), { inserted: 2 })
  assert.deepEqual(await enqueueRefill(pool, { poolKey: POOL_KEY, jobKeys }), { inserted: 0 })
  assert.deepEqual(await enqueueRefill(pool, { poolKey: POOL_KEY, jobKeys: [] }), { inserted: 0 })
  const { rows } = await pool.query('select count(*)::int as n from inventory_refill_intent')
  assert.equal(rows[0].n, 2)
})

test('due refills are the pending ones whose time has come, oldest first', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  await enqueueRefill(pool, {
    poolKey: POOL_KEY,
    jobKeys: [`${POOL_KEY}:1`, `${POOL_KEY}:2`, `${POOL_KEY}:3`]
  })
  await pool.query(
    "update inventory_refill_intent set next_at = now() + interval '1 hour' where job_key = $1",
    [`${POOL_KEY}:2`]
  )
  await pool.query("update inventory_refill_intent set state = 'running' where job_key = $1", [
    `${POOL_KEY}:3`
  ])

  const due = await dueRefills(pool)
  assert.deepEqual(
    due.map((r) => r.job_key),
    [`${POOL_KEY}:1`]
  )
  assert.equal((await dueRefills(pool, 0)).length, 0)
})

test('a settled refill keeps the instance it produced; a failed one counts its attempt', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  const id = await stock(pool, 'ready-1')
  await enqueueRefill(pool, { poolKey: POOL_KEY, jobKeys: [`${POOL_KEY}:1`, `${POOL_KEY}:2`] })

  const done = await settleRefill(pool, `${POOL_KEY}:1`, { ok: true, instanceId: id })
  assert.equal(done.state, 'done')
  assert.equal(done.instance_id, id, 'an honoured intent must stay distinguishable from a lost one')
  assert.equal(done.attempts, 0)

  const failed = await settleRefill(pool, `${POOL_KEY}:2`, { ok: false, error: 'host refused' })
  assert.equal(failed.state, 'failed')
  assert.equal(failed.last_error, 'host refused')
  assert.equal(failed.attempts, 1)

  assert.equal(await settleRefill(pool, 'no-such-key', { ok: true }), null)
})

test('a generation is approved once, and the approval keeps what was seen', dbOpts, async () => {
  const { pool } = db
  await upsertPool(pool, identity())
  assert.equal(await approvalOf(pool, POOL_KEY, GENERATION), null)

  const first = await approveGeneration(pool, {
    poolKey: POOL_KEY,
    generation: GENERATION,
    expectedHashes: { cowork: 'r1' },
    approvedBy: 'ops@tracy.test'
  })
  assert.equal(first.ok, true)
  assert.deepEqual(first.row.expected_hashes, { cowork: 'r1' })

  const second = await approveGeneration(pool, {
    poolKey: POOL_KEY,
    generation: GENERATION,
    expectedHashes: { cowork: 'SOMETHING-ELSE' },
    approvedBy: 'other@tracy.test'
  })
  assert.equal(second.ok, false)
  assert.equal(second.code, 'ALREADY_APPROVED')
  assert.equal(second.row.approved_by, 'ops@tracy.test', 'the original approver was overwritten')
  assert.deepEqual((await approvalOf(pool, POOL_KEY, GENERATION)).expected_hashes, { cowork: 'r1' })
  // A new hash is a new generation and needs its own approval.
  assert.equal(await approvalOf(pool, POOL_KEY, 'another-generation'), null)
})

test('the refill timer reads its default period before anybody has touched it', dbOpts, async () => {
  const { pool } = db
  const sweep = await readSweep(pool)
  assert.equal(sweep.periodMs, SWEEP_PERIOD_MS.default)
  assert.equal(sweep.revision, 0)
  assert.equal(sweep.lastStartedAt, null, 'a timer that never ran must not claim a run')
})

test('the period moves under an optimistic lock, and out-of-range values are refused', dbOpts, async () => {
  const { pool } = db
  const first = await setSweepPeriod(pool, {
    periodMs: 60_000,
    expectedRevision: 0,
    updatedBy: 'ops@tracy.test'
  })
  assert.equal(first.ok, true)
  assert.equal(first.sweep.periodMs, 60_000)
  assert.equal(first.sweep.revision, 1)

  const stale = await setSweepPeriod(pool, { periodMs: 45_000, expectedRevision: 0 })
  assert.equal(stale.code, 'REVISION_CONFLICT', 'a second editor overwrote the first')
  assert.equal((await readSweep(pool)).periodMs, 60_000)

  for (const periodMs of [SWEEP_PERIOD_MS.min - 1, SWEEP_PERIOD_MS.max + 1, 30.5, '30000'])
    assert.equal(
      (await setSweepPeriod(pool, { periodMs, expectedRevision: 1 })).code,
      'INVALID',
      String(periodMs)
    )
})

test(
  'a run is recorded without touching the period, and an edit reaches a row a run created',
  dbOpts,
  async () => {
    const { pool } = db
    await recordSweepStart(pool)
    const running = await readSweep(pool)
    assert.notEqual(running.lastStartedAt, null)
    assert.equal(running.lastFinishedAt, null, 'a started run must read as still running')

    await recordSweepEnd(pool, { error: 'host unreachable', outcome: { enqueued: 2 } })
    const failed = await readSweep(pool)
    assert.equal(failed.lastError, 'host unreachable')
    assert.deepEqual(failed.lastOutcome, { enqueued: 2 })
    assert.equal(failed.revision, 0, 'a run is not an edit')

    // The row exists at revision 0 because of the runs above; the first edit must still land.
    const edited = await setSweepPeriod(pool, { periodMs: 20_000, expectedRevision: 0 })
    assert.equal(edited.ok, true)
    assert.equal(edited.sweep.lastError, 'host unreachable', 'an edit wiped the run record')

    await recordSweepEnd(pool, { outcome: { enqueued: 0 } })
    const clean = await readSweep(pool)
    assert.equal(clean.lastError, null, 'a clean run must clear the previous error')
    assert.equal(clean.periodMs, 20_000, 'a run reset the period')
  }
)
