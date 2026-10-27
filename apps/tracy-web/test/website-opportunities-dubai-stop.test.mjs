// Real scratch Postgres; all place/source data and provider callbacks are synthetic.
import assert from 'node:assert/strict'
import { before, beforeEach, after, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { createDubaiPrefetch } from 'website-opportunities/src/dubai-prefetch.js'
import { claimPlaceJob } from 'website-opportunities/src/place-jobs.js'
import { createCostLedger, withCharge } from 'website-opportunities/src/cost-ledger.js'

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

function scheduler(pool = db.pool) {
  return createDubaiPrefetch({
    pool,
    role: 'central',
    discover: async () => ({
      source: { id: 'google-places-text', revision: 'synthetic-v1', fetchedAt: new Date().toISOString() },
      seeds: [1, 2].map((n) => ({
        externalId: `synthetic-stop-${n}`,
        name: `Synthetic stop restaurant ${n}`,
        website: `https://stop-${n}.example.test/`,
        sourceUrl: `https://maps.example.test/stop-${n}`,
        fetchedAt: new Date().toISOString()
      }))
    })
  })
}
async function setup() {
  const s = scheduler()
  await s.create()
  assert.deepEqual(await s.setEnabled(true), { updated: true })
  return s
}
async function enabled() {
  return (await db.pool.query("select enabled from wo_prefetch_campaign where id='dubai'")).rows[0].enabled
}
async function repeatedTicks(s) {
  for (let n = 0; n < 8; n++) {
    await db.pool.query("update wo_prefetch_campaign set next_tick_at=now() where id='dubai'")
    const results = await Promise.all([s.tick(), scheduler().tick()])
    assert.ok(results.every((r) => r.busy || r.ran === false))
    assert.equal(await enabled(), false)
  }
}

test(
  'a successful Stop survives repeated concurrent ticks and a new scheduler; only explicit Start resumes',
  opts,
  async () => {
    const s = await setup()
    const child = await s.tick()
    assert.ok(child.jobId)
    assert.deepEqual(await scheduler().setEnabled(false), { updated: true })
    await repeatedTicks(s)
    assert.equal(await claimPlaceJob(db.pool, 'stopped-fixture', 60000, { kind: 'prefetch' }), null)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_place_job')).rows[0].n, 1)
    assert.deepEqual(await scheduler().setEnabled(true), { updated: true })
    assert.ok(await claimPlaceJob(db.pool, 'restarted-fixture', 60000, { kind: 'prefetch' }))
  }
)

test(
  'Stop racing an in-flight tick reports busy, then a successful retry fences every later tick',
  opts,
  async () => {
    await setup()
    let entered, resume
    const inTick = new Promise((resolve) => {
      entered = resolve
    })
    const released = new Promise((resolve) => {
      resume = resolve
    })
    // Hold the real transaction after its campaign read, while its advisory lock is still held.
    const pausedPool = {
      connect: async () => {
        const client = await db.pool.connect()
        return {
          release: () => client.release(),
          async query(sql, args) {
            const result = await client.query(sql, args)
            if (typeof sql === 'string' && sql.startsWith('select * from wo_prefetch_campaign')) {
              entered()
              await released
            }
            return result
          }
        }
      }
    }
    const tick = scheduler(pausedPool).tick()
    try {
      await inTick
      assert.deepEqual(await scheduler().setEnabled(false), { busy: true })
    } finally {
      resume()
    }
    assert.ok((await tick).jobId)
    assert.deepEqual(await scheduler().setEnabled(false), { updated: true })
    await repeatedTicks(scheduler())
  }
)

test(
  'Stop denies new billed admissions for a running background child without customer demand',
  opts,
  async () => {
    const s = await setup()
    await s.tick()
    const job = await claimPlaceJob(db.pool, 'running-fixture', 60000, { kind: 'prefetch' })
    assert.ok(job)
    assert.equal(
      (await db.pool.query('select count(*)::int as n from wo_job where place_job_id=$1', [job.id])).rows[0]
        .n,
      0
    )
    const ledger = createCostLedger({
      pool: db.pool,
      caps: async () => ({ dailyCapCents: 10000, jobCapCents: 10000 })
    })
    assert.deepEqual(await s.setEnabled(false), { updated: true })
    let calls = 0
    await assert.rejects(
      withCharge(
        ledger,
        {
          provider: 'google',
          operation: 'place-photo',
          maxCents: 1,
          placeId: job.place_id,
          jobId: job.id,
          prefetchCampaignId: 'dubai',
          requestKey: `synthetic-stopped:${job.id}`,
          expectedLeaseToken: job.lease_token
        },
        async () => {
          calls++
          return {}
        }
      ),
      { code: 'PREFETCH_STOPPED' }
    )
    assert.equal(calls, 0)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_cost_ledger')).rows[0].n, 0)
    await repeatedTicks(s)
  }
)

test('an expired source disables the campaign and repeated ticks do not revive it', opts, async () => {
  const s = await setup()
  await db.pool.query(
    `update wo_prefetch_campaign set seed_source=jsonb_set(seed_source,'{fetchedAt}',to_jsonb((now()-interval '31 days')::text))`
  )
  assert.deepEqual(await s.tick(), { ran: false, reason: 'seed_expired' })
  await repeatedTicks(scheduler())
  assert.equal((await db.pool.query('select count(*)::int as n from wo_place_job')).rows[0].n, 0)
})
