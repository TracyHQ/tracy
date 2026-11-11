// A brand bench run that cannot finish (brand step trial bench, #320): a provider error and a truncated answer stop the
// run with the reason, a cancel stops it between calls, one run at a time (parallel to the planner bench), and an input
// that cannot run is refused before it is queued.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { cancelBrandRun, startBrandRun } from '../src/brand-step/brand-control.js'
import { createRun as createPlannerRun } from '../src/site-planner/bench-store.js'
import { readRun } from '../src/brand-step/brand-store.js'
import { createBrandQueue } from '../src/brand-step/brand-worker.js'
import { finalReply } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignBrandDoors,
  brandCase,
  done,
  fakeWiring,
  modelRouter,
  quiet,
  runOnce,
  saveCall,
  SECRET,
  startRun
} from './_brand-bench.mjs'
import { KIT_REF, kitIndexWithLooks, readyKitImages } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

test('a provider error stops the run with the provider reason', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const { run } = await runOnce(pool, c, {
    agent: [{ status: 500, body: { error: { message: 'upstream is down' } } }]
  })
  assert.equal(run.status, 'failed')
  assert.match(run.error, /upstream is down/)
  assert.equal(run.rounds[0].state, 'failed')
  assert.equal(run.outcome, null, 'a failed run holds no safe version')
})

test('a truncated answer fails the run', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  const { run } = await runOnce(pool, c, {
    agent: [finalReply({ content: '{"kind":', finishReason: 'length' })]
  })
  assert.equal(run.status, 'failed')
  assert.match(run.error, /AGENT_TRUNCATED/)
})

test('a cancel asked during a call stops the run after that call', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool)
  const c = await brandCase()
  const run = await startRun(pool, c)
  const model = modelRouter({ agent: [saveCall(c.brand), done()] })
  const fetchImpl = async (url, init) => {
    const asked = await cancelBrandRun(pool, run.id)
    assert.equal(asked.ok, true)
    return model.fetchImpl(url, init)
  }
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files }),
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  const after = await readRun(pool, run.id)
  assert.equal(after.status, 'cancelled')
  assert.equal(model.agent.requests.length, 1, 'no call after the cancel')
  assert.equal(after.rounds[0].state, 'cancelled')
})

test('a queued run nobody holds is cancelled at once', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool)
  const run = await startRun(pool, await brandCase())
  const cancelled = await cancelBrandRun(pool, run.id)
  assert.equal(cancelled.run.status, 'cancelled')
  assert.equal((await cancelBrandRun(pool, run.id)).code, 'BRAND_RUN_NOT_ACTIVE')
})

test('a cancel asked while brand preparation is pending prevents the first paid call', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool)
  const c = await brandCase()
  const run = await startRun(pool, c)
  const preparing = Promise.withResolvers()
  const release = Promise.withResolvers()
  const model = modelRouter({ agent: [saveCall(c.brand), done()] })
  const images = readyKitImages()
  const pending = createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: {
      async ensure(kit) {
        preparing.resolve()
        await release.promise
        return images.ensure(kit)
      }
    },
    wiring: fakeWiring({ files: c.files }),
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  try {
    await preparing.promise
    const cancelled = await cancelBrandRun(pool, run.id)
    assert.equal(cancelled.ok, true)
    release.resolve()
    await pending
    const after = await readRun(pool, run.id)
    assert.equal(after.status, 'cancelled')
    assert.equal(model.requests.length, 0, 'cancellation during preparation prevents every paid call')
    assert.equal(after.rounds.length, 0, 'round zero never opens after cancellation')
    const { rows } = await pool.query('select count(*)::int as n from brand_call where run_id=$1', [run.id])
    assert.equal(rows[0].n, 0)
  } finally {
    release.resolve()
    await pending
  }
})

test('one brand run at a time; a planner run in flight does not block it', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool)
  const c = await brandCase()
  // A site planner bench run is queued: the two benches have their own queues.
  const planner = await createPlannerRun(pool, {
    startedBy: 'cli',
    brief: { facts: [] },
    briefSource: { kind: 'file', name: 'p.json' },
    kit: { ref: 'k' },
    promptSha256: 'a'.repeat(64),
    checkerVersion: 'v',
    door: { model: 'm' },
    harness: {}
  })
  assert.ok(planner.run, 'the planner run is queued')
  const first = await startRun(pool, c)
  const second = await startBrandRun({
    pool,
    secret: SECRET,
    brief: c.brief,
    briefSource: { kind: 'file', name: 'x.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files })
  })
  assert.equal(second.ok, false)
  assert.equal(second.code, 'BRAND_RUN_ACTIVE')
  assert.equal(second.active.id, first.id)
})

test('a brief with no usable brand part is refused before it is queued', opts, async () => {
  const { pool } = db
  await assignBrandDoors(pool)
  const c = await brandCase()
  for (const brief of [
    { facts: [] },
    { brand: { voice: 'English; calm' } },
    { brand: { name: 'Acme', voice: '' } },
    'x'
  ]) {
    const started = await startBrandRun({
      pool,
      secret: SECRET,
      brief,
      briefSource: { kind: 'file', name: 'x.json' },
      kitRef: KIT_REF,
      startedBy: 'cli',
      kitImages: readyKitImages(),
      wiring: fakeWiring({ files: c.files })
    })
    assert.equal(started.code, 'BRAND_BRIEF_SHAPE')
  }
  // A brief that holds the name back is a usable brand part.
  const held = { ...c.brief, brand: { ...c.brief.brand, name: null }, missing: [{ field: 'brand.name' }] }
  assert.equal((await startRun(pool, { ...c, brief: held })).status, 'queued')
})

test(
  'a kit without a part the brand step needs, or a template font that cannot be read, is refused with the reason',
  opts,
  async () => {
    const { pool } = db
    await assignBrandDoors(pool)
    const c = await brandCase()
    const { index, done: cleanup } = kitIndexWithLooks((doc) => {
      delete doc.site.favicon
      return doc
    })
    try {
      const started = await startBrandRun({
        pool,
        secret: SECRET,
        brief: c.brief,
        briefSource: { kind: 'file', name: 'x.json' },
        kitRef: KIT_REF,
        startedBy: 'cli',
        kitImages: readyKitImages(),
        wiring: fakeWiring({ files: c.files }),
        index
      })
      assert.equal(started.code, 'BRAND_KIT_UNUSABLE')
      assert.match(started.reason, /site\.favicon/)
    } finally {
      cleanup()
    }
    const noFont = await startBrandRun({
      pool,
      secret: SECRET,
      brief: c.brief,
      briefSource: { kind: 'file', name: 'x.json' },
      kitRef: KIT_REF,
      startedBy: 'cli',
      kitImages: readyKitImages(),
      wiring: fakeWiring({ files: c.files, font: null })
    })
    assert.equal(noFont.code, 'BRAND_FONT_UNRESOLVED')
    const { rows } = await pool.query('select count(*)::int as n from brand_run')
    assert.equal(rows[0].n, 0)
  }
)

test('a door changed after the start fails the run before any call', opts, async () => {
  const { pool } = db
  const c = await brandCase()
  await assignBrandDoors(pool)
  const run = await startRun(pool, c)
  await assignBrandDoors(pool, { agent: 'vendor/another-model' })
  const model = modelRouter({ agent: [] })
  await createBrandQueue({
    pool,
    secret: SECRET,
    fetchImpl: model.fetchImpl.bind(model),
    kitImages: readyKitImages(),
    wiring: fakeWiring({ files: c.files }),
    log: quiet,
    retry: { attempts: 1 }
  }).drain()
  const after = await readRun(pool, run.id)
  assert.equal(after.status, 'failed')
  assert.match(after.error, /BRAND_DOOR_CHANGED/)
  assert.equal(model.requests.length, 0)
})
