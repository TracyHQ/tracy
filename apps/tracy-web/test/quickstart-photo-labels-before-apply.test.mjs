/**
 * The quickstart workflow labels the brief's photos with the vision model in picture preparation, under the drawing
 * budget, and never while the write clock runs (item 24). The engines are composed exactly as app.js composes them, and
 * the build's own picture clock watches the shared model gateway.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { seeder } from '../src/lib/seeder.js'
import { composeBriefEngines } from '../src/sites/brief-engines/compose.js'
import { createJoomlaEngine } from '../src/sites/brief-engines/joomla.js'
import { nativeCopyBindings } from '../src/sites/brief-engines/quickstart-native.js'
import { createWordpressEngine } from '../src/sites/brief-engines/wordpress.js'
import { createEnginePictureClock } from '../src/sites/engine-picture-clock.js'
import { preparePicturesBeforeApply } from '../src/sites/picture-preparation.js'

const trades = [
  {
    platform: 'wordpress',
    name: 'Fernhollow Florist',
    trade: 'florist',
    photos: ['peony', 'tulip', 'wreath']
  },
  { platform: 'joomla', name: 'Saltgrass Yoga Studio', trade: 'yoga studio', photos: ['mat', 'class'] }
]

/** The picture door as site-pictures keeps it: labels by photo, asked of the build's vision only when allowed. */
function photoStore(photos) {
  const kept = new Map()
  const reads = []
  return {
    reads,
    kept,
    async forSite({ visionOverride, label = true, signal, visionNeeds }) {
      reads.push({ label, vision: Boolean(visionOverride), needs: visionNeeds ?? null })
      const vision = visionOverride ?? null
      const missing = vision ? photos.filter((id) => !kept.has(`${vision.key}:${id}`)) : []
      let stats = null
      if (vision && label && missing.length) {
        const answer = await vision.label({
          pictures: missing.map((id) => ({ id, bytes: Buffer.from(id) })),
          signal
        })
        for (const [id, value] of answer.labels) kept.set(`${vision.key}:${id}`, value)
        stats = { labelled: answer.labels.size, calls: answer.usage.calls, deferred: answer.deferred ?? 0 }
      } else if (vision && !label) stats = { labelled: 0, calls: 0, unlabelled: missing.length }
      return {
        vision: stats,
        pictures: photos.map((id) => ({
          id,
          vision: vision ? (kept.get(`${vision.key}:${id}`) ?? null) : null
        }))
      }
    }
  }
}

/** A vision door that goes through the shared model gateway, where the build's picture clock sees it. */
async function visionDoor({ slowMs = 0, advance = () => {} } = {}) {
  const { observePictureCall } = await seeder('model')
  const asked = []
  return {
    asked,
    door: {
      key: 'fictional-vision|labels/1',
      door: { model: 'fictional-vision' },
      maxPictures: 80,
      metered: true,
      label: async ({ pictures }) =>
        observePictureCall('vision', async () => {
          asked.push(pictures.map((p) => p.id))
          advance(slowMs)
          return {
            labels: new Map(pictures.map((p) => [p.id, { subject: 'interior', textPresence: 'absent' }])),
            usage: { calls: 1, promptTokens: 10, completionTokens: 5, requests: [] },
            failed: 0
          }
        })
    }
  }
}

function buildFor(business, { store, vision, placed, assetLabelling = null, writes = {} }) {
  const source = {
    id: `build-${business.trade}`,
    revision_id: 'revision-1',
    brief: {
      quickstartWorkflow: 'quickstart-first/1',
      reviewMode: 'manual',
      business: { name: business.name, trade: business.trade },
      ...(assetLabelling ? { assetLabelling } : {})
    },
    profile_effective: {},
    content: { writes: { ...writes } }
  }
  let siteName = 'Demo brand'
  const data = { title: 'Sample heading' }
  const record = { key: 'home', identity: { id: 'home' }, data, ...nativeCopyBindings(data, ['title']) }
  const adapter = {
    records: [record],
    get: (d, p) => p.reduce((v, k) => v[k], d),
    patchData: (_r, c) => ({ ...record.data, title: c['["title"]'] }),
    write: async (r, d, save) => {
      r.data = d
      await save({ state: 'verified' })
    },
    // The site's name as each CMS door reads and writes it: the template's demo name until the build writes its own.
    call: async (action, params) => {
      if (action === 'content.update') siteName = params.fields.value
      if (action === 'site.identity' && params.operation === 'set') siteName = params.fields.sitename
      return { item: { value: siteName }, fields: { sitename: siteName } }
    },
    api: async (method, _path, body) => {
      if (method === 'POST') siteName = body.title
      return { title: siteName }
    }
  }
  const options = { models: async () => ({}), siteAccess: async () => ({}) }
  const engines = composeBriefEngines(
    { wordpress: createWordpressEngine(options), joomla: createJoomlaEngine(options) },
    {
      woContent: {
        quickstartFor: async () => source,
        recordWrite: async (_id, key, value) => {
          source.content.writes[key] = value
        }
      },
      applyFor: () => async () => ({}),
      siteReader: async () => ({ base: 'https://fictional.tracy.test/' }),
      openNative: async () => adapter,
      realPictures: store,
      placePictures: async ({ real }) => {
        placed.push(real)
        return { placed: real.pictures.length, gaps: [], receipts: [], vision: real.vision }
      },
      generateFor: async () => {
        const generate = async ({ input }) => ({
          inputHash: input.inputHash,
          fields: input.fields.map((f) => ({
            key: f.key,
            value: business.name,
            sourceIds: [0],
            claimRefs: []
          }))
        })
        generate.vision = vision
        return generate
      }
    }
  )
  return engines[business.platform]
}

/** The runner's phases, in its order, under one picture clock. */
async function runPhases(engine, platform, { picturesMs = 180_000, now = Date.now } = {}) {
  const notes = []
  const clock = createEnginePictureClock({ now })
  const ctx = {
    siteKey: 'fictional.tracy.test',
    email: 'owner@example.test',
    platform,
    signal: new AbortController().signal,
    normalized: { languages: ['en'] },
    note: (text) => notes.push(text),
    time: () => {}
  }
  try {
    const prepared = await clock.run(() => engine.prepare(ctx))
    await clock.run(() => preparePicturesBeforeApply(engine, ctx, prepared, picturesMs, 10))
    clock.startApply()
    let report
    try {
      report = await clock.run(() => engine.apply(ctx, prepared))
    } finally {
      clock.endApply()
    }
    return { report, notes, clock: clock.report() }
  } finally {
    clock.close()
  }
}

for (const business of trades) {
  test(`${business.trade}: uncached photo labels are asked before the write clock, never during apply`, async () => {
    const store = photoStore(business.photos)
    const { door, asked } = await visionDoor()
    const placed = []
    const engine = buildFor(business, { store, vision: door, placed })
    const { report, clock } = await runPhases(engine, business.platform)
    assert.equal(clock.pictureCallsDuringApply, 0, 'no vision call while the write clock runs')
    assert.equal(clock.visionDuringApplyMs, 0)
    assert.deepEqual(clock.findings, [])
    assert.deepEqual(asked, [business.photos], 'every photo was labelled once, in preparation')
    assert.equal(placed.length, 1)
    assert.ok(
      placed[0].pictures.every((p) => p.vision?.subject === 'interior'),
      'apply places the labels preparation made'
    )
    assert.equal(report.photoLabels.unlabelled, 0)
    assert.equal(report.photoLabels.labelledBeforeApply, business.photos.length)
  })

  test(`${business.trade}: a picture budget that ends first leaves photos unlabelled, and apply asks no model`, async (t) => {
    let now = 1_000_000
    t.mock.method(Date, 'now', () => now)
    const store = photoStore(business.photos)
    const { door, asked } = await visionDoor()
    const placed = []
    const engine = buildFor(business, { store, vision: door, placed })
    // Ten seconds of picture budget cannot hold one vision batch: no batch starts.
    const { report, notes, clock } = await runPhases(engine, business.platform, {
      picturesMs: 10_000,
      now: () => now
    })
    assert.deepEqual(asked, [], 'no vision call at all')
    assert.equal(clock.pictureCallsDuringApply ?? 0, 0)
    assert.deepEqual(clock.findings ?? [], [])
    assert.ok(
      placed[0].pictures.every((p) => p.vision === null),
      'unlabelled photos go to the fallback'
    )
    assert.equal(report.photoLabels.unlabelled, business.photos.length)
    assert.ok(notes.some((note) => /without vision labels/.test(note)))
  })
}

test('a build that stopped waiting for a stalled photo labelling says so in its notes (item 27)', async () => {
  const business = trades[1]
  const store = photoStore(business.photos)
  const { door } = await visionDoor()
  const engine = buildFor(business, {
    store,
    vision: door,
    placed: [],
    assetLabelling: { status: 'stalled', asked: 60, labelled: 24, cached: 24 }
  })
  const { notes } = await runPhases(engine, business.platform)
  assert.ok(
    notes.some(
      (note) => /made no progress for 15 minutes/.test(note) && /24 of 60 photos labelled/.test(note)
    ),
    notes.join(' | ')
  )
})

test('a batch starts only while the picture budget holds it, and a started batch is never cut', async () => {
  const { labelWithinBudget } = await import('../src/sites/brief-engines/quickstart-photo-labels.js')
  let now = 0
  const sent = []
  const vision = {
    key: 'fictional-vision|labels/1',
    label: async ({ pictures, signal }) => {
      sent.push({ ids: pictures.map((p) => p.id), signal })
      now += 50_000
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: 'interior' }])),
        usage: { calls: 1, promptTokens: 1, completionTokens: 1 },
        failed: 0
      }
    }
  }
  const run = new AbortController().signal
  const stop = new AbortController()
  const pictures = Array.from({ length: 20 }, (_, n) => ({ id: `studio-${n}`, bytes: Buffer.from([n]) }))
  // 120 s: the first batch (assumed 60 s) and a second one (measured 50 s) fit; a third would not.
  const answer = await labelWithinBudget(vision, {
    deadlineAt: 120_000,
    stop: stop.signal,
    now: () => now,
    inFlight: 1
  }).label({
    pictures,
    signal: run
  })
  assert.deepEqual(
    sent.map((call) => call.ids.length),
    [8, 8]
  )
  assert.ok(
    sent.every((call) => call.signal === run),
    'the provider call listens to the build, not the picture deadline'
  )
  assert.equal(answer.labels.size, 16)
  assert.equal(answer.deferred, 4)
  assert.equal(answer.usage.calls, 2)
  stop.abort()
  const stopped = await labelWithinBudget(vision, {
    deadlineAt: Number.POSITIVE_INFINITY,
    stop: stop.signal
  }).label({
    pictures,
    signal: run
  })
  assert.equal(stopped.deferred, 20, 'a stopped picture phase starts no batch')
  assert.equal(labelWithinBudget(null, { deadlineAt: 0 }), null)
})

test('preparation and apply read the photo shortlist by the same frame needs, so a labelled photo is never a miss (item 27)', async () => {
  const business = trades[1]
  const store = photoStore(business.photos)
  const { door } = await visionDoor()
  const frames = [{ width: 800, height: 400, path: 'images/demo/hero.jpg' }]
  const engine = buildFor(business, {
    store,
    vision: door,
    placed: [],
    writes: { 'quickstart:baseline': { state: 'read', baseline: { imageFrames: frames } } }
  })
  await runPhases(engine, business.platform)
  const prep = store.reads.find((r) => r.label === true)
  const apply = store.reads.find((r) => r.label === false)
  assert.deepEqual(prep.needs, [{ width: 800, height: 400 }])
  assert.deepEqual(apply.needs, prep.needs)
})

test('a restaurant with 80 photos to label: four batches in flight, three rounds, ten paid calls (item 27)', async () => {
  const { labelWithinBudget, picturePhaseMs } = await import(
    '../src/sites/brief-engines/quickstart-photo-labels.js'
  )
  let now = 0
  let inFlight = 0
  let most = 0
  const calls = []
  // Recorded latencies of a fictional vision model: 40 to 55 seconds a batch.
  const latencies = [41_000, 52_000, 47_000, 55_000, 44_000, 49_000, 53_000, 40_000, 46_000, 50_000]
  const vision = {
    key: 'fictional-vision|labels/1',
    label: async ({ pictures }) => {
      const took = latencies[calls.length]
      calls.push(pictures.length)
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((resolve) => setImmediate(resolve))
      inFlight -= 1
      now = Math.max(now, took + Math.floor(now / 60_000) * 60_000)
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: 'dish' }])),
        usage: { calls: 1, promptTokens: 1, completionTokens: 1 },
        failed: 0
      }
    }
  }
  const pictures = Array.from({ length: 80 }, (_, n) => ({ id: `dish-${n}`, bytes: Buffer.from([n]) }))
  const budget = picturePhaseMs({ misses: 80 })
  assert.equal(budget, 195_000, '15 s, then three rounds at the seeded 60 s')
  const answer = await labelWithinBudget(vision, { deadlineAt: budget, now: () => now }).label({ pictures })
  assert.equal(most, 4, 'four batches in flight at once')
  assert.equal(calls.length, 10, 'ten paid attempts of the quickstart run')
  assert.equal(answer.labels.size, 80)
  assert.equal(answer.deferred, 0)
  assert.equal(answer.batchMs.length, 10, 'each batch duration is recorded')
})

test('the picture clock is sized by the photos left to label, between one minute and eight', async () => {
  const { picturePhaseMs, p95 } = await import('../src/sites/brief-engines/quickstart-photo-labels.js')
  assert.equal(picturePhaseMs({ misses: 0 }), 60_000, 'nothing to label: the shortest clock')
  assert.equal(picturePhaseMs({ misses: 40 }), 135_000, 'a clinic with 40 photos left: two rounds')
  assert.equal(picturePhaseMs({ misses: 300 }), 480_000, 'a restaurant with 300 left: held at eight minutes')
  assert.equal(picturePhaseMs({ misses: 80, p95BatchMs: 30_000 }), 105_000, 'a faster model, a shorter clock')
  assert.equal(picturePhaseMs({ misses: 8, drawRounds: 2 }), 125_000, 'drawing rounds at the seeded 25 s')
  assert.equal(
    p95([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200]),
    190
  )
  assert.equal(p95([]), null)
})

test('the engine sizes its picture clock from the photos still unlabelled, asking no model', async () => {
  const business = trades[0]
  const store = photoStore(business.photos)
  const { door, asked } = await visionDoor()
  const engine = buildFor(business, { store, vision: door, placed: [] })
  const ctx = {
    siteKey: 'fictional.tracy.test',
    email: 'owner@example.test',
    platform: business.platform,
    signal: new AbortController().signal,
    normalized: { languages: ['en'] },
    note: () => {},
    time: () => {}
  }
  const prepared = await engine.prepare(ctx)
  assert.equal(
    await engine.picturesBudgetMs(ctx, prepared),
    75_000,
    'three photos: one round at the seeded 60 s'
  )
  assert.deepEqual(asked, [])
  assert.deepEqual(store.reads.at(-1).label, false)
})

test('the demo look and the menu photo reading are outside every module a brief build loads', async () => {
  const { spawnSync } = await import('node:child_process')
  // Every module the runner, the composed engines and their picture and model doors reach, imported in a child that
  // records each resolved address. The two other vision readers run in the demo service and the research only.
  const probe = `
    import { registerHooks } from 'node:module'
    const seen = new Set()
    registerHooks({ resolve(specifier, context, next) { const found = next(specifier, context); seen.add(found.url); return found } })
    for (const path of ${JSON.stringify([
      '../src/sites/brief-build.js',
      '../src/sites/brief-engines/compose.js',
      '../src/sites/brief-engines/wordpress.js',
      '../src/sites/brief-engines/joomla.js',
      '../src/sites/brief-engines/emdash.js',
      '../src/opportunities-build/site-pictures.js',
      '../src/opportunities-build/quickstart-model.js'
    ])}) await import(new URL(path, ${JSON.stringify(import.meta.url)}))
    console.log(JSON.stringify([...seen]))
  `
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' })
  assert.equal(child.status, 0, child.stderr)
  const loaded = JSON.parse(child.stdout.trim().split('\n').at(-1))
  assert.ok(loaded.some((url) => url.endsWith('/sites/brief-engines/quickstart-first.js')))
  for (const reader of ['/opportunities-build/demo-look.js', '/src/menu-photo-reading.js'])
    assert.ok(!loaded.some((url) => url.endsWith(reader)), `${reader} is not reachable from a brief build`)
})
