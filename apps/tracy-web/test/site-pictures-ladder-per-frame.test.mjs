// Each frame climbs the fallback ladder on its own (ladder-step.js frameTask): a rejected frame takes its next rung as
// soon as its own look comes back, while other frames still wait for theirs. Before, every frame climbed one rung per
// pass and each pass waited for every look of the manifest. On the invented Harrow Lane Climbing Wall
// (_site-pictures-gallery.mjs), with a fake looker door whose looks take as long as each test says.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { fileStore } from '../src/site-pictures/file-store.js'
import { fileFields } from '../src/site-pictures/frame-entries.js'
import { createLooker } from '../src/site-pictures/looker-step.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { scene } from './_generated-photos.mjs'
import { byFrame, finished, p06, rungs, SQUARE } from './_site-pictures-gallery.mjs'

// A fixed sequence of numbers in [0, 1) per seed, so every run of a test waits the same.
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31
  return seed / 2 ** 31
}
const answered = (events, frame, nth) =>
  events.find((e) => e.frame === frame && e.nth === nth && e.at === 'answered').t
const asked = (events, frame, nth) =>
  events.find((e) => e.frame === frame && e.nth === nth && e.at === 'asked').t
const placedOf = (doc) =>
  doc.frames.map((e) => ({
    frame: e.frame,
    source: e.source,
    asset: e.asset ?? null,
    sha256: e.sha256 ?? null
  }))

// Eight tall owner photos: a gallery tile the looker keeps rejecting climbs through many of them on the any-photo rung.
const MANY = new Map(
  await Promise.all(
    Array.from({ length: 8 }, async (_, i) => [
      `p-${String.fromCharCode(97 + i)}`,
      await scene(i % 2 ? 'dental' : 'bakery', 1000, 2000, 3 + i)
    ])
  )
)

// A lone any-real frame the looker always rejects: its code photo, two other photos, then hidden.
const LONE_LADDER = [
  ['placed', 'rejected'],
  ['next-photo', 'placed'],
  ['next-photo', 'rejected'],
  ['next-photo', 'placed'],
  ['next-photo', 'rejected'],
  ['next-photo', 'skipped'],
  ['fewer-rows', 'skipped'],
  ['hide', 'hidden']
]

test('a slow look of one frame does not hold back the next rung of another', async () => {
  // Two lone frames on pages of their own, both always rejected: the first look of block-a.1 takes 700 ms, others none.
  // Their shapes differ, so no picture of one is the very picture of the other (the looker lets the second of two
  // identical pictures wait for the first one's look, looker-negative-cache.js).
  const layout = [
    ['page-a', 'block-a', 1, false],
    ['page-b', 'block-b', 1, false, [400, 300]]
  ]
  const run = await finished(new Set(['block-a.1', 'block-b.1']), 'run-per-frame-slow', {
    layout,
    photos: SQUARE,
    lookDelay: (frame, nth) => (frame === 'block-a.1' && nth === 1 ? 700 : 0)
  })
  const { events } = run.looker
  // block-b.1 climbed its whole ladder, three looks and two rungs, before the first look of block-a.1 came back. One
  // pass at a time, its second look waited for that first look.
  assert.ok(answered(events, 'block-b.1', 3) < answered(events, 'block-a.1', 1), JSON.stringify(events))
  // Both frames took the same rungs, in the same order, as one pass at a time would.
  assert.deepEqual(rungs(run.m, 'block-b.1'), LONE_LADDER)
  assert.deepEqual(rungs(run.m, 'block-a.1'), LONE_LADDER)
  assert.equal(byFrame(run.m).get('block-a.1').source, 'hide')
  assert.equal(byFrame(run.m).get('block-b.1').source, 'hide')
})

test('two frames of one page that climb at once never show the same photo', async () => {
  // Two lone frames on one page, each rejected once: code gives them two of the three photos, and both take their next
  // photo as soon as their first looks come back, at the same moment. A rung chooses its photo and places it in one
  // lock, so the second sees the photo the first took. Storing a picture takes a while here, the gap between choosing
  // and placing that a frame without the lock would lose the race in.
  const layout = [['page-d', 'block-d', 2, false]]
  for (const seed of [1, 2, 3, 4, 5]) {
    const rand = seeded(seed)
    const run = await finished(new Set(), `run-per-frame-page-${seed}`, {
      layout,
      photos: SQUARE,
      once: new Set(['block-d.1', 'block-d.2']),
      lookDelay: (_frame, nth) => (nth === 1 ? 30 : Math.round(rand() * 40)),
      storeDelay: () => Math.round(50 + rand() * 30)
    })
    const { events } = run.looker
    // Both frames waited for their next photo at once: each first look came back before either second look was asked.
    const firstBack = Math.max(answered(events, 'block-d.1', 1), answered(events, 'block-d.2', 1))
    assert.ok(
      firstBack < Math.min(asked(events, 'block-d.1', 2), asked(events, 'block-d.2', 2)),
      `seed ${seed}`
    )
    const e = byFrame(run.m)
    for (const f of ['block-d.1', 'block-d.2']) {
      assert.deepEqual(
        rungs(run.m, f),
        [
          ['placed', 'rejected'],
          ['next-photo', 'placed']
        ],
        `seed ${seed} ${f}`
      )
      assert.equal(e.get(f).looker.verdict, 'pass')
    }
    assert.notEqual(e.get('block-d.1').asset, e.get('block-d.2').asset, `seed ${seed}`)
    // The picture check's duplicate rule agrees.
    assert.equal(p06(await run.check(run.m)).status, 'pass', `seed ${seed}`)
  }
})

test('with frames climbing at once and looking ahead, every look is asked once and paid once', async () => {
  // Two galleries, three tiles always rejected, looks of every length: tiles on the any-photo rung look ahead while
  // other tiles are still on their earlier rungs.
  const layout = [
    ['page-g', 'block-g', 3, true],
    ['page-h', 'block-h', 2, true]
  ]
  const rand = seeded(7)
  const run = await finished(new Set(['block-g.2', 'block-g.3', 'block-h.2']), 'run-per-frame-paid', {
    layout,
    photos: MANY,
    lookDelay: () => Math.round(rand() * 25)
  })
  const calls = run.m.looker.calls
  assert.ok(
    calls.some((c) => c.ahead),
    'the tiles looked ahead'
  )
  // One record per picture of a frame.
  assert.equal(new Set(calls.map((c) => `${c.frame} ${c.sha256}`)).size, calls.length)
  // The provider answered once per record not cached: no look was asked twice, ahead, placed or waited on.
  const fresh = calls.filter((c) => !c.cached)
  assert.equal(run.looker.looks.length, fresh.length)
  // What the save paid is every look the provider answered, once; the manifest's cost counts every record.
  const paid = fresh.reduce((n, c) => n + c.costUsd, 0)
  assert.ok(Math.abs(run.out.paid - paid) < 1e-9, `${run.out.paid} vs ${paid}`)
  assert.ok(Math.abs(run.m.cost.looker - calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)) < 1e-9)
  // Looks of several pictures were in flight at once.
  assert.ok(run.looker.peak() > 1)
})

test('two asks of one look at the same time are one look: asked once, paid once, recorded once as paid', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wo-look-once-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const store = fileStore(dir)
  const bytes = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#556677' } })
    .jpeg()
    .toBuffer()
  const name = await store.putPicture(bytes, 'jpg')
  const frame = { id: 'block-x.1', kind: 'photo', width: 300, height: 200, canHide: true }
  const idx = {
    frames: new Map([[frame.id, frame]]),
    wishes: new Map([[frame.id, { frame: frame.id, match: 'specific', shows: 'A bench.', avoid: [] }]]),
    twinsOf: new Map(),
    listOf: () => 'frames'
  }
  const entry = {
    frame: frame.id,
    source: 'owner-photo',
    asset: 'p-x',
    ...fileFields({ sha256: name.split('.')[0], ext: 'jpg', width: 300, height: 200 })
  }
  let asks = 0
  const prompts = picturePrompts()
  const looker = createLooker({
    idx,
    alts: null,
    storeDir: dir,
    runId: 'once',
    door: {
      providerId: 'openrouter',
      baseUrl: 'https://example.test/api',
      apiKey: 'k',
      model: 'test/looker'
    },
    prompt: { text: prompts.looker, sha256: prompts.roles.looker },
    fetchImpl: async () => {
      asks++
      await new Promise((resolve) => setTimeout(resolve, 30))
      const said = { verdict: 'pass', faults: [], seen: 'A bench in a park.' }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(said) } }], usage: { cost: 0.001 } }),
        { headers: { 'content-type': 'application/json' } }
      )
    }
  })
  const doc = { frames: [entry], siteSettings: [], cost: {}, timing: {} }
  const memo = new Map()
  const first = looker.look(doc, { memo })
  // While the first ask is under way, the look counts as taken (the look-ahead asks for no wave of it).
  assert.equal(looker.known(entry, memo), true)
  const second = looker.look(doc, { memo })
  const ahead = looker.ahead([['frames', entry]], memo)
  const [a, b, c] = await Promise.all([first, second, ahead])
  assert.equal(asks, 1)
  assert.deepEqual(
    [a.doc.looker.calls[0].cached, b.doc.looker.calls[0].cached, c[0].cached],
    [false, true, true]
  )
  assert.equal(a.paid + b.paid, 0.001)
  assert.equal(b.doc.frames[0].looker.verdict, 'pass')
})

test('a frame climbing alone takes the same rungs, photos and verdicts however long each look takes', async () => {
  // One gallery tile always rejected climbs next photo, fewer rows, reuse and the any-photo rung through every photo;
  // the other tile and a lone frame pass, their looks slow. One look at a time and no waiting give the same manifest.
  const layout = [
    ['page-g', 'block-g', 2, true],
    ['page-d', 'block-d', 1, false]
  ]
  const reject = new Set(['block-g.2'])
  const rand = seeded(11)
  const serial = await finished(reject, 'run-per-frame-alone-serial', {
    layout,
    photos: MANY,
    lookConcurrency: 1
  })
  const timed = await finished(reject, 'run-per-frame-alone-timed', {
    layout,
    photos: MANY,
    lookDelay: (frame) => (frame === 'block-g.2' ? Math.round(rand() * 20) : 60 + Math.round(rand() * 60))
  })
  // The rungs develop's ladder took here, one pass at a time (16/11/2026): two other photos, then the any-photo rung
  // through the seven photos left, each rejected, then its best rejected picture.
  const tries = Array.from({ length: 7 }, () => [
    ['any-photo', 'placed'],
    ['any-photo', 'rejected']
  ]).flat()
  for (const run of [serial, timed])
    assert.deepEqual(rungs(run.m, 'block-g.2'), [
      ['placed', 'rejected'],
      ['next-photo', 'placed'],
      ['next-photo', 'rejected'],
      ['next-photo', 'placed'],
      ['next-photo', 'rejected'],
      ['next-photo', 'skipped'],
      ['fewer-rows', 'skipped'],
      ['reuse', 'skipped'],
      ...tries,
      ['any-photo', 'skipped'],
      ['best-rejected', 'placed']
    ])
  assert.deepEqual(placedOf(timed.m), placedOf(serial.m))
  assert.deepEqual(timed.m.ladder, serial.m.ladder)
  assert.deepEqual(
    timed.m.frames.map((e) => e.looker?.verdict ?? null),
    serial.m.frames.map((e) => e.looker?.verdict ?? null)
  )
  assert.deepEqual(
    timed.m.looker.calls.map((c) => [c.frame, c.sha256]).sort(),
    serial.m.looker.calls.map((c) => [c.frame, c.sha256]).sort()
  )
})
