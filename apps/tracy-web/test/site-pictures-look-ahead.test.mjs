// The any-photo rung's look-ahead (ladder-step.js LOOK_AHEAD): a gallery tile the looker rejects again and again tries
// every owner photo, one per pass. Looked at three at a time, the passes find their looks taken, and nothing the ladder
// decides changes. On the invented Harrow Lane Climbing Wall (_site-pictures-gallery.mjs), with a fake looker door.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aheadDepth, LOOK_AHEAD } from '../src/site-pictures/ladder-step.js'
import { LOOK_CONCURRENCY } from '../src/site-pictures/looker-step.js'
import { scene } from './_generated-photos.mjs'
import { byFrame, finished, rungs } from './_site-pictures-gallery.mjs'

// One gallery of two tiles and eight tall owner photos: the rejected tile has six photos left for the any-photo rung.
const LAYOUT = [['page-g', 'block-g', 2, true]]
const MANY = new Map(
  await Promise.all(
    Array.from({ length: 8 }, async (_, i) => [
      `p-${String.fromCharCode(97 + i)}`,
      await scene(i % 2 ? 'dental' : 'bakery', 1000, 2000, 3 + i)
    ])
  )
)
const opts = (lookAhead) => ({ layout: LAYOUT, photos: MANY, lookAhead })
const placed = (doc) =>
  doc.frames.map((e) => ({
    frame: e.frame,
    source: e.source,
    asset: e.asset ?? null,
    sha256: e.sha256 ?? null
  }))

test('the look-ahead keeps every photo, cut, rung and verdict of the ladder, and its looks are counted and paid', async () => {
  const reject = new Set(['block-g.2'])
  const off = await finished(reject, 'run-ahead-off', opts(0))
  const on = await finished(reject, 'run-ahead-on', opts(LOOK_AHEAD))

  // The tile climbs through several any-photo placements, each rejected, in both runs.
  const anyPhoto = (doc) => rungs(doc, 'block-g.2').filter(([r, o]) => r === 'any-photo' && o === 'placed')
  assert.ok(anyPhoto(off.m).length >= 4, JSON.stringify(rungs(off.m, 'block-g.2')))
  // The same pictures end in the same frames, after the same rungs with the same details.
  assert.deepEqual(placed(on.m), placed(off.m))
  assert.deepEqual(on.m.ladder, off.m.ladder)
  assert.deepEqual(
    [...byFrame(on.m).values()].map((e) => e.looker?.verdict ?? null),
    [...byFrame(off.m).values()].map((e) => e.looker?.verdict ?? null)
  )

  // Without the look-ahead each any-photo placement waits for its own look. With it, only the first does (it is placed
  // in the pass the tile reaches the rung): every later one was looked at ahead, three at a time.
  const placedShas = (doc, rung) =>
    doc.ladder
      .find((l) => l.frame === 'block-g.2')
      .steps.filter((x) => x.rung === rung && x.outcome === 'placed')
      .map((x) => x.detail)
  // A cut the next-photo rung already placed (the same bytes) was looked at then: it waits for nothing either way.
  const waitedOn = (run) => {
    const fresh = run.m.looker.calls.filter((c) => c.frame === 'block-g.2' && !c.cached && !c.ahead)
    const before = new Set(placedShas(run.m, 'next-photo'))
    return placedShas(run.m, 'any-photo').filter(
      (sha) => !before.has(sha) && fresh.some((c) => c.sha256.startsWith(sha))
    ).length
  }
  assert.ok(!off.m.looker.calls.some((c) => c.ahead))
  assert.ok(waitedOn(off) >= 4, `${waitedOn(off)}`)
  assert.equal(waitedOn(on), 1)
  const ahead = on.m.looker.calls.filter((c) => c.ahead)
  assert.ok(ahead.length >= waitedOn(off) - 1, JSON.stringify(on.m.looker.calls))
  for (const c of ahead) assert.equal(c.frame, 'block-g.2')
  // No look is asked twice: the provider got exactly one call per distinct picture looked at, ahead or not.
  const asked = (run) =>
    new Set(run.m.looker.calls.filter((c) => !c.cached).map((c) => `${c.frame} ${c.sha256}`))
  assert.equal(on.looker.looks.length, asked(on).size)
  // A photo looked at ahead is paid like any look: the save's cost counts every look the provider answered.
  const paid = on.m.looker.calls.filter((c) => !c.cached).reduce((n, c) => n + c.costUsd, 0)
  assert.ok(Math.abs(on.out.paid - paid) < 1e-9, `${on.out.paid} vs ${paid}`)
  assert.ok(Math.abs(on.m.cost.looker - on.m.looker.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)) < 1e-9)
})

test('few frames on the rung look further ahead, so their looks fill the looker, and the ladder decides the same', async () => {
  // Many frames: LOOK_AHEAD each. Few: enough that one wave fills LOOK_CONCURRENCY looks.
  assert.equal(aheadDepth(11, LOOK_AHEAD, LOOK_CONCURRENCY), LOOK_AHEAD)
  assert.equal(aheadDepth(2, LOOK_AHEAD, 8), 4)
  assert.equal(aheadDepth(1, LOOK_AHEAD, 8), 8)
  assert.equal(aheadDepth(0, LOOK_AHEAD, 8), 8)

  // One rejected tile left on the any-photo rung, its six photos looked at three at a time or as one wave.
  const reject = new Set(['block-g.2'])
  const narrow = await finished(reject, 'run-ahead-narrow', { ...opts(LOOK_AHEAD), lookBudget: 0, lookMs: 5 })
  const wide = await finished(reject, 'run-ahead-wide', { ...opts(LOOK_AHEAD), lookMs: 5 })
  assert.deepEqual(placed(wide.m), placed(narrow.m))
  assert.deepEqual(wide.m.ladder, narrow.m.ladder)
  assert.deepEqual(
    [...byFrame(wide.m).values()].map((e) => e.looker?.verdict ?? null),
    [...byFrame(narrow.m).values()].map((e) => e.looker?.verdict ?? null)
  )
  assert.ok(narrow.looker.most() <= LOOK_AHEAD, `${narrow.looker.most()} looks in flight`)
  assert.ok(wide.looker.most() > LOOK_AHEAD, `${wide.looker.most()} looks in flight`)
  // Every photo the tile tried was looked at once, ahead or not, in both runs; the wide one asked no look twice.
  const asked = (run) =>
    new Set(run.m.looker.calls.filter((c) => !c.cached).map((c) => `${c.frame} ${c.sha256}`))
  assert.equal(wide.looker.looks.length, asked(wide).size)
})
