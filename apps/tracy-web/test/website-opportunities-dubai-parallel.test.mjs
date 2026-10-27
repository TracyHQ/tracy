// Real scratch Postgres; restaurant data and collectors are synthetic and never call providers.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { fileDb } from './_db.mjs'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createDubaiPrefetch } from 'website-opportunities/src/dubai-prefetch.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { claimPlaceJob, finishPlaceJob, joinPlace, placeLease } from 'website-opportunities/src/place-jobs.js'
import { resolvePlace } from 'website-opportunities/src/places.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const db = fileDb()
const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

async function join(placeId, options) {
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    const result = await joinPlace(client, placeId, options)
    await client.query('commit')
    return result.job
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}
async function setup() {
  const s = createDubaiPrefetch({
    pool: db.pool,
    role: 'central',
    discover: async () => ({
      source: {
        id: 'google-places-text',
        revision: 'parallel-fixture-v1',
        fetchedAt: new Date().toISOString()
      },
      seeds: Array.from({ length: 6 }, (_, n) => ({
        externalId: `parallel-fixture-${n}`,
        name: `Synthetic parallel restaurant ${n}`,
        website: `https://parallel-${n}.example.test/`,
        fetchedAt: new Date().toISOString()
      }))
    })
  })
  await s.create()
  await s.setConcurrency(3)
  await s.setEnabled(true)
  assert.equal(await s.capacity(), 3)
  return s
}
async function admit(s) {
  await db.pool.query("update wo_prefetch_campaign set next_tick_at=now() where id='dubai'")
  return s.tick()
}
async function queuedFourth() {
  const { rows } = await db.pool.query(
    'select place_id from wo_prefetch_seed where job_id is null order by external_id limit 1'
  )
  return join(rows[0].place_id, { prefetchCampaignId: 'dubai' })
}
const background = () => claimPlaceJob(db.pool, 'parallel-claim-fixture', 60000, { kind: 'prefetch' })

test(
  'three background Research jobs overlap across executors while a new user retains admission',
  opts,
  async () => {
    const s = await setup()
    const admitted = []
    for (let n = 0; n < 3; n++) admitted.push((await admit(s)).jobId)
    assert.equal(new Set(admitted).size, 3)
    assert.equal((await admit(s)).waiting, true)
    assert.equal((await db.pool.query('select count(*)::int as n from wo_place_job')).rows[0].n, 3)
    const fourth = await queuedFourth()
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let entered = 0
    const real = await websiteOpportunitiesDomain()
    const domain = {
      ...real,
      connectorsFor: () => ({
        website: {
          available: true,
          async collect() {
            entered++
            await held
            return {
              status: 'complete',
              profile: { name: 'Synthetic observed restaurant', links: [] },
              coverage: { fetched: 1 },
              pages: [],
              media: []
            }
          }
        }
      })
    }
    const make = (owner) =>
      createExecutor({
        host: woHost,
        pool: db.pool,
        owner,
        shared: true,
        prefetch: true,
        concurrency: 2,
        prefetchConcurrency: async () => 3,
        loadDomain: async () => domain,
        runtime: async () => ({
          keys: { google: null, apify: null },
          settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
        }),
        objects: null,
        switchOn: async () => true,
        fetchImpl: async () => {
          throw new Error('Unexpected network')
        },
        log: { warn() {}, error() {} }
      })
    const a = make('parallel-executor-a'),
      b = make('parallel-executor-b')
    const ticks = []
    try {
      ticks.push(await a.tick(), await b.tick(), await a.tick())
      assert.equal(ticks.filter((t) => t.claimed).length, 3)
      assert.equal((await b.tick()).claimed, null, 'The fourth background job cannot exceed the shared cap')
      const userPlace = await resolvePlace(db.pool, {
        provider: 'url',
        providerId: 'https://parallel-user.example.test/',
        name: 'Synthetic user restaurant'
      })
      const userJob = await join(userPlace)
      const userTick = await a.tick()
      ticks.push(userTick)
      assert.equal(
        userTick.claimed?.id,
        userJob.id,
        'A customer job is admitted while all background slots are busy'
      )
      const deadline = Date.now() + 3000
      while (entered < 4 && Date.now() < deadline) await delay(5)
      assert.equal(entered, 4, 'Three background collectors and the customer collector overlap')
      assert.deepEqual(await s.setEnabled(false), { updated: true })
      release()
      await Promise.all(ticks.map((t) => t.done))
      assert.equal(
        await background(),
        null,
        'Stopping prevents the queued fourth background job from starting after capacity frees'
      )
      assert.equal(
        (await db.pool.query('select state from wo_place_job where id=$1', [fourth.id])).rows[0].state,
        'queued'
      )
    } finally {
      release()
      await Promise.all(ticks.map((t) => t.done))
      await Promise.all([a.idle(), b.idle()])
    }
  }
)

test(
  'lowering parallelism drains existing leases without replacing jobs or their paid receipts',
  opts,
  async () => {
    const s = await setup()
    for (let n = 0; n < 3; n++) await admit(s)
    const fourth = await queuedFourth()
    const jobs = (await Promise.all([background(), background(), background(), background()])).filter(Boolean)
    assert.equal(jobs.length, 3)
    for (const job of jobs) {
      const reservation = (
        await db.pool.query(
          `insert into wo_cost_ledger(budget_day,provider,operation,reserved_cents,job_id,place_id,prefetch_campaign_id)
      values(current_date,'synthetic','fixture-receipt',0,$1,$2,'dubai') returning id`,
          [job.id, job.place_id]
        )
      ).rows[0]
      await db.pool.query(
        `insert into wo_place_paid_receipt(place_id,source,job_id,request_hash,reservation_id,state,response,fetched_at)
      values($1,'synthetic',$2,'synthetic-receipt',$3,'received','{}',now())`,
        [job.place_id, job.id, reservation.id]
      )
    }
    const receipts = (await db.pool.query('select * from wo_place_paid_receipt order by id')).rows
    await s.setConcurrency(1)
    assert.equal(await s.capacity(), 1)
    assert.deepEqual(
      (await db.pool.query("select id from wo_place_job where state='running' order by id")).rows.map(
        (r) => r.id
      ),
      jobs.map((j) => j.id).sort()
    )
    assert.deepEqual((await db.pool.query('select * from wo_place_paid_receipt order by id')).rows, receipts)
    for (const job of jobs.slice(0, 2)) {
      assert.equal(await finishPlaceJob(db.pool, placeLease(job), { state: 'completed' }), true)
      assert.equal(
        await background(),
        null,
        'Capacity reduction admits no replacement while an existing lease occupies the smaller cap'
      )
    }
    assert.equal(await finishPlaceJob(db.pool, placeLease(jobs[2]), { state: 'completed' }), true)
    assert.equal((await background())?.id, fourth.id)
  }
)

test(
  'three expired background leases recover concurrently with bounded ownership and fenced old tokens',
  opts,
  async () => {
    const s = await setup()
    for (let n = 0; n < 3; n++) await admit(s)
    const original = (await Promise.all([background(), background(), background()])).filter(Boolean)
    assert.equal(original.length, 3)
    await db.pool.query("update wo_place_job set lease_until=now()-interval '1 second' where state='running'")
    const recovered = (
      await Promise.all([background(), background(), background(), background(), background()])
    ).filter(Boolean)
    assert.equal(recovered.length, 3)
    assert.deepEqual(recovered.map((j) => j.id).sort(), original.map((j) => j.id).sort())
    for (const job of recovered) {
      assert.equal(job.attempt, 2)
      assert.ok(BigInt(job.lease_token) > BigInt(original.find((j) => j.id === job.id).lease_token))
    }
    for (const old of original)
      assert.equal(await finishPlaceJob(db.pool, placeLease(old), { state: 'failed' }), false)
    assert.equal(
      (await db.pool.query("select count(*)::int as n from wo_place_job where state='running'")).rows[0].n,
      3
    )
  }
)
