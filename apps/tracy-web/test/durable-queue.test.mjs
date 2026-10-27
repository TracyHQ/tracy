// The durable queue (`website-opportunities/src/durable-queue.js`) on a throwaway table: the row is the queue,
// the lease token is the only right to write. Four races two web instances can run into.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(async () => {
  await db.open()
  if (!url) return
  await db.pool.query(`create table if not exists dq_item (
    item_key text primary key,
    account_id uuid,
    label text,
    result text,
    status text not null,
    error text,
    queued_at timestamptz not null default now(),
    lease_until timestamptz,
    lease_token bigint not null default 0,
    attempts integer not null default 0,
    checked_at timestamptz,
    not_before timestamptz)`)
})
/** Every queue a test made: a run released at a test's end kicks a tick that must not claim the next test's rows. */
const queues = new Set()
afterEach(async () => {
  for (const q of queues) await q.drain()
  queues.clear()
})

beforeEach(async () => {
  if (url) await db.pool.query('delete from dq_item')
})
after(db.close)

const NOW = Date.parse('2026-10-18T12:00:00Z')
const gate = () => {
  let open
  const opened = new Promise((r) => {
    open = r
  })
  return { opened, open }
}
const rowOf = async (key) => (await db.pool.query('select * from dq_item where item_key = $1', [key])).rows[0]

function queueOf({
  clock = { now: NOW },
  run,
  concurrency = 4,
  leaseMs = 60_000,
  notBeforeColumn,
  enabled,
  queuedStatus,
  failedStatus,
  accountIds
}) {
  const warned = []
  const queue = createDurableQueue({
    pool: db.pool,
    table: 'dq_item',
    keyColumn: 'item_key',
    name: 'dq',
    now: () => clock.now,
    concurrency,
    leaseMs,
    run,
    ...(queuedStatus ? { queuedStatus } : {}),
    ...(failedStatus ? { failedStatus } : {}),
    ...(accountIds ? { accountIds } : {}),
    ...(notBeforeColumn ? { notBeforeColumn } : {}),
    ...(enabled ? { enabled } : {}),
    log: { warn: (m) => warned.push(m), error: (m) => warned.push(m) }
  })
  queues.add(queue)
  return { queue, warned }
}

test(
  'two queues ticking at once lease each row once, never more than `concurrency` in total',
  opts,
  async () => {
    const hold = gate()
    const ran = []
    const run = async (row, lease) => {
      ran.push(row.item_key)
      await hold.opened
      await lease.finish({ status: 'done', result: 'ok', checked_at: new Date(NOW) })
    }
    const a = queueOf({ run })
    const b = queueOf({ run })
    await a.queue.enqueue([1, 2, 3, 4, 5, 6].map((n) => ({ key: `k${n}`, fields: { label: `L${n}` } })))
    const [x, y] = await Promise.all([a.queue.tick(), b.queue.tick()])
    assert.ok(x + y <= 4, `leased ${x} + ${y}`)
    assert.equal(ran.length, x + y)
    hold.open()
    for (let i = 0; i < 3; i++) await Promise.all([a.queue.drain(), b.queue.drain()])
    assert.deepEqual(ran.sort(), ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], 'each exactly once')
  }
)

test(
  'a result written after the lease ran out is rejected and leaves the new holder’s row',
  opts,
  async () => {
    const clock = { now: NOW }
    const hold = gate()
    let aLease = null
    const a = queueOf({
      clock,
      run: async (_row, lease) => {
        aLease = lease
        await hold.opened
      }
    })
    const b = queueOf({
      clock,
      run: (row, lease) => lease.finish({ status: 'done', result: 'B', checked_at: new Date(clock.now) })
    })
    await a.queue.enqueue([{ key: 'k', fields: { label: 'x' } }])
    assert.equal(await a.queue.tick(), 1)
    clock.now = NOW + 61_000
    await b.queue.drain()
    assert.equal((await rowOf('k')).result, 'B')
    const landed = await aLease.finish({ status: 'done', result: 'A', checked_at: new Date(clock.now) })
    assert.equal(landed, false)
    const row = await rowOf('k')
    assert.equal(row.result, 'B')
    assert.equal(row.status, 'done')
    assert.ok(a.warned.some((m) => /lease lost/.test(m)))
    hold.open()
  }
)

test('enqueue of a row a worker holds keeps its lease, attempts and token', opts, async () => {
  const hold = gate()
  const a = queueOf({ run: () => hold.opened })
  await a.queue.enqueue([{ key: 'k', fields: { label: 'x' } }])
  await a.queue.tick()
  const held = await rowOf('k')
  await a.queue.enqueue([{ key: 'k', fields: { label: 'y' } }])
  const row = await rowOf('k')
  assert.equal(row.lease_until.getTime(), held.lease_until.getTime())
  assert.equal(row.attempts, 1)
  assert.equal(row.lease_token, held.lease_token)
  assert.equal(row.label, 'x')
  hold.open()
})

test('enqueue re-queues a finished row and revokes any older lease', opts, async () => {
  let first = null
  const a = queueOf({
    run: async (_row, lease) => {
      first ??= lease
      await lease.finish({ status: 'done', result: 'one', checked_at: new Date(NOW) })
    }
  })
  await a.queue.enqueue([{ key: 'k', fields: { label: 'x' } }])
  await a.queue.drain()
  await a.queue.tick() // the tick a finished run schedules, settled before the re-queue
  await a.queue.enqueue([{ key: 'k', fields: { label: 'y' } }])
  const row = await rowOf('k')
  assert.equal(row.status, 'queued')
  assert.equal(row.attempts, 0)
  assert.equal(row.label, 'y')
  assert.equal(await first.finish({ status: 'done', result: 'stale' }), false)
})

test('enqueue with `seenAt` leaves a row a worker finished after the caller looked', opts, async () => {
  const a = queueOf({
    run: async (_row, lease) => {
      await lease.finish({ status: 'done', result: 'fresh', checked_at: new Date(NOW + 1000) })
    }
  })
  await a.queue.enqueue([{ key: 'k', fields: { label: 'x' } }])
  await a.queue.drain()
  await a.queue.tick()
  // The caller read the rows before the worker finished: its decision to queue is stale.
  await a.queue.enqueue([{ key: 'k', fields: { label: 'y' } }], { seenAt: new Date(NOW) })
  let row = await rowOf('k')
  assert.equal(row.status, 'done', 'not re-queued')
  assert.equal(row.label, 'x')
  // Looked after the check: the row is stale by the caller's rule, so it is queued again.
  await a.queue.enqueue([{ key: 'k', fields: { label: 'y' } }], { seenAt: new Date(NOW + 2000) })
  row = await rowOf('k')
  assert.equal(row.status, 'queued')
  assert.equal(row.label, 'y')
})

test('concurrent enqueue of one new key from two queues makes one row', opts, async () => {
  const a = queueOf({ run: async () => {} })
  const b = queueOf({ run: async () => {} })
  await Promise.all([
    a.queue.enqueue([{ key: 'k', fields: { label: 'a' } }]),
    b.queue.enqueue([{ key: 'k', fields: { label: 'b' } }])
  ])
  const { rows } = await db.pool.query('select status from dq_item')
  assert.deepEqual(rows, [{ status: 'queued' }])
})

test('a queued row whose `notBeforeColumn` is in the future is not claimed until then', opts, async () => {
  const clock = { now: NOW }
  const ran = []
  const run = async (row, lease) => {
    ran.push(row.item_key)
    await lease.finish({ status: 'done', checked_at: new Date(clock.now) })
  }
  const { queue } = queueOf({ clock, run, notBeforeColumn: 'not_before' })
  await queue.enqueue([
    { key: 'later', fields: { not_before: new Date(NOW + 3_600_000) } },
    { key: 'now', fields: { not_before: null } }
  ])
  await queue.drain()
  assert.deepEqual(ran, ['now'])
  assert.equal((await rowOf('later')).status, 'queued')
  clock.now = NOW + 3_600_000
  await queue.drain()
  assert.deepEqual(ran, ['now', 'later'])
})

test(
  'a queue that is not `enabled` claims nothing, and a check that throws counts as off',
  opts,
  async () => {
    const ran = []
    const run = async (row, lease) => {
      ran.push(row.item_key)
      await lease.finish({ status: 'done', checked_at: new Date(NOW) })
    }
    const state = { on: false }
    const { queue } = queueOf({ run, enabled: async () => state.on })
    await queue.enqueue([{ key: 'a' }])
    await queue.drain()
    assert.deepEqual(ran, [])
    assert.equal((await rowOf('a')).lease_until, null, 'not even leased')
    const broken = queueOf({
      run,
      enabled: async () => {
        throw new Error('db down')
      }
    })
    await broken.queue.drain()
    assert.deepEqual(ran, [], 'fails closed')
    state.on = true
    await queue.drain()
    assert.deepEqual(ran, ['a'])
  }
)

test(
  'protocol queue scopes both exhaustion and claim; legacy does not consume its pending or expired rows',
  opts,
  async () => {
    const own = '00000000-0000-4000-8000-000000000001'
    const foreign = '00000000-0000-4000-8000-000000000002'
    const clock = { now: NOW },
      held = gate(),
      ran = []
    const quality = queueOf({
      clock,
      queuedStatus: 'quality-queued-v1',
      failedStatus: 'quality-failed-v1',
      accountIds: [own],
      run: async (row, lease) => {
        ran.push(row.item_key)
        await held.opened
        await assert.rejects(lease.finish({ status: 'queued' }), /protocol downgrade/)
        await lease.finish({ status: 'quality-done-v1', result: 'owned' })
      }
    })
    const legacy = queueOf({
      clock,
      run: () => {
        throw new Error('legacy must not run')
      }
    })
    await quality.queue.enqueue([{ key: 'ours', fields: { account_id: own } }])
    await assert.rejects(
      quality.queue.enqueue([{ key: 'forbidden', fields: { account_id: foreign } }]),
      /outside scope/
    )
    await db.pool.query(
      `insert into dq_item(item_key,account_id,status,attempts,lease_until)
    values('foreign-exhausted',$1,'quality-queued-v1',3,$3),('foreign-pending',$1,'quality-queued-v1',0,null),
    ('own-exhausted',$2,'quality-queued-v1',3,$3)`,
      [foreign, own, new Date(NOW - 1)]
    )
    assert.equal(await legacy.queue.tick(), 0)
    assert.equal(await quality.queue.tick(), 1)
    assert.deepEqual(ran, ['ours'])
    assert.equal((await rowOf('own-exhausted')).status, 'quality-failed-v1')
    assert.equal((await rowOf('foreign-exhausted')).status, 'quality-queued-v1')
    clock.now += 60_001
    assert.equal(await legacy.queue.tick(), 0)
    held.open()
    await quality.queue.drain()
    // The expired original receipt is refused; the quality consumer alone reclaims its own row.
    assert.equal((await rowOf('ours')).status, 'quality-done-v1')
    assert.equal((await rowOf('foreign-pending')).attempts, 0)
  }
)

test('new consumers share concurrency across protocol namespaces and accounts', opts, async () => {
  const hold = gate(),
    runs = []
  const run = async (row, lease) => {
    runs.push(row.item_key)
    await hold.opened
    await lease.finish({ status: 'done' })
  }
  const legacy = queueOf({ concurrency: 1, run })
  const quality = queueOf({ concurrency: 1, queuedStatus: 'quality-queued-v1', run })
  await legacy.queue.enqueue([{ key: 'old' }])
  await quality.queue.enqueue([{ key: 'new' }])
  await Promise.all([legacy.queue.tick(), quality.queue.tick()])
  assert.equal(runs.length, 1)
  hold.open()
  for (const queue of [legacy.queue, quality.queue, legacy.queue, quality.queue]) await queue.drain()
  assert.deepEqual(runs.sort(), ['new', 'old'])
})
