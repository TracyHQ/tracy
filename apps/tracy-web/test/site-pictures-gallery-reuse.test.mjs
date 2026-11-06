// A gallery tile is never hidden alone (owner decision 04/11/2026, ADR 0043 section 4): the reuse rung, at the seam
// where a checked round is finished, on the invented Harrow Lane Climbing Wall (_site-pictures-gallery.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  cropOverlap,
  galleryIndex,
  neighbours,
  REUSE_MAX_OVERLAP
} from '../src/site-pictures/gallery-tiles.js'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { reuseRegion } from '../src/site-pictures/reuse-crop.js'
import { byFrame, finished, kit, p06, plan, rungs, tiles } from './_site-pictures-gallery.mjs'

// Page t holds a lone frame (block-s) and a gallery of two tiles (block-t); pages u and d as before.
const SHARED = [
  ['page-t', 'block-s', 1, false],
  ['page-t', 'block-t', 2, true],
  ['page-u', 'block-u', 2, true],
  ['page-d', 'block-d', 1, false]
]

test('a gallery tile no new photo fits reuses a photo of another block of its page, cut elsewhere', async () => {
  const { parts, m, check } = await finished(new Set(['block-u.2', 'block-d.1']), 'run-reuse', {
    layout: SHARED
  })
  // Code alone hides no tile: the tile it found no free photo for waits for the ladder.
  assert.deepEqual(
    parts.pending.filter((x) => x.waitsFor === 'ladder').map((x) => x.frame),
    ['block-t.2']
  )
  assert.ok(!parts.frames.some((e) => e.source === 'hide'))

  const e = byFrame(m)
  const lone = e.get('block-s.1')
  const first = e.get('block-t.1')
  // Which photo goes where is code's order (darker first, then by id): the test names them S and T.
  const S = lone.asset
  const T = first.asset
  assert.deepEqual([S, T].sort(), ['p-a', 'p-b'])
  // block-t.2 takes the photo of block-s.1 (another block), never the one of block-t.1 (its own block, card AK).
  const t2 = e.get('block-t.2')
  assert.equal(t2.source, 'owner-photo')
  assert.equal(t2.asset, S)
  assert.deepEqual([t2.reuse.rung, t2.reuse.with], ['reuse', ['block-s.1']])
  assert.ok(cropOverlap(t2.crop, lone.crop) <= REUSE_MAX_OVERLAP, JSON.stringify([t2.crop, lone.crop]))
  assert.equal(t2.reuse.overlap, Number(cropOverlap(t2.crop, lone.crop).toFixed(3)))
  assert.match(t2.reason, new RegExp(`^reused owner photo ${S}, also in block-s\\.1, cut to another region`))
  assert.deepEqual(rungs(m, 'block-t.2'), [
    ['next-photo', 'skipped'],
    ['fewer-rows', 'skipped'],
    ['reuse', 'placed']
  ])

  // No photo left (the other photo of its page is in its own block, its own was rejected) and no drawer door: the
  // rejected photos had a hard fault, so nothing is kept and it is returned, never hidden.
  assert.ok(!e.has('block-u.2'))
  const back = m.returns.find((r) => r.frame === 'block-u.2')
  assert.match(back.reason, /^a gallery tile is never hidden alone/)
  const u2 = m.ladder.find((l) => l.frame === 'block-u.2').steps
  assert.match(u2.find((x) => x.rung === 'reuse').detail, /no owner photo on the page can be reused/)
  assert.deepEqual(
    u2.slice(-5).map((x) => [x.rung, x.outcome]),
    [
      ['any-photo', 'skipped'],
      ['draw', 'skipped'],
      ['redraw', 'skipped'],
      ['best-rejected', 'skipped'],
      ['return', 'returned']
    ]
  )
  assert.match(u2.at(-5).detail, /is already in block-u \(block-u\.1\)/)
  assert.match(u2.at(-2).detail, /^every rejected picture has a hard fault/)
  // A frame that is not a gallery tile keeps today's ladder: hidden where the kit allows.
  assert.equal(e.get('block-d.1').source, 'hide')
  assert.deepEqual(rungs(m, 'block-d.1').slice(-2), [
    ['fewer-rows', 'skipped'],
    ['hide', 'hidden']
  ])
  // No tile anywhere is hidden; nothing is drawn.
  for (const f of [...tiles('block-t', 2), ...tiles('block-u', 2)])
    assert.notEqual(e.get(f)?.source, 'hide', f)
  assert.equal(m.drawer.calls.length, 0)

  // The finished manifest passes the check, P06 included: the reuse keeps clear of its other cut.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  assert.equal(p06(result).status, 'pass')
})

test('the duplicate rule fails a photo shown twice on a page unless a gallery tile of another block reused it clear of the other', async () => {
  const { m, check } = await finished(new Set(), 'run-dup', { layout: SHARED })
  const swap = (frame, change) => ({
    ...m,
    frames: m.frames.map((e) => (e.frame === frame ? { ...e, ...change } : e))
  })
  const s1 = byFrame(m).get('block-s.1')
  const t2 = byFrame(m).get('block-t.2')
  const S = s1.asset
  assert.equal(p06(await check(m)).status, 'pass')
  // The same photo with no reuse mark: two showings of S on page-t.
  const noMark = p06(await check(swap('block-t.2', { reuse: null })))
  assert.equal(noMark.status, 'fail')
  assert.match(
    noMark.failures[0].detail,
    new RegExp(`brief asset ${S} is already shown in block-s\\.1 on page-t`)
  )
  // Marked as reused, but cut the same way: too much shared.
  const sameCut = p06(await check(swap('block-t.2', { crop: { ...s1.crop } })))
  assert.equal(sameCut.status, 'fail')
  assert.match(sameCut.failures[0].detail, /at most 30% of the smaller cut/)
  // The last rung allows at most half shared (card AK): the same cut fails, a cut sharing half or less passes.
  const lastSame = swap('block-t.2', {
    crop: { ...s1.crop },
    reuse: { rung: 'any-photo', with: ['block-s.1'], overlap: 1 }
  })
  assert.equal(p06(await check(lastSame)).status, 'fail')
  const half = { ...s1.crop, y: s1.crop.y + s1.crop.height / 2 }
  assert.ok(cropOverlap(half, s1.crop) <= 0.5)
  const lastHalf = swap('block-t.2', {
    crop: half,
    reuse: { rung: 'any-photo', with: ['block-s.1'], overlap: 0.5 }
  })
  assert.equal(p06(await check(lastHalf)).status, 'pass')
  // One photo twice in one block always fails, cut clear or not: block-t.1 holding S beside block-t.2.
  const inBlock = swap('block-t.1', {
    asset: S,
    crop: half,
    reuse: { rung: 'any-photo', with: ['block-t.2'], overlap: 0 }
  })
  assert.equal(p06(await check(inBlock)).status, 'fail')
  // A frame that is not a gallery tile may not reuse: block-d.1 also shown on page-t, marked as reused, cut clear.
  const both = plan(SHARED)
  both.pages[0].blocks.push(both.pages[3].blocks[0])
  const single = swap('block-d.1', {
    asset: S,
    crop: t2.crop,
    reuse: { rung: 'reuse', with: ['block-s.1'], overlap: 0 }
  })
  const loneReuse = p06(await check(single, both))
  assert.equal(loneReuse.status, 'fail')
  assert.ok(
    loneReuse.failures.some(
      (f) =>
        (f.where === 'block-d.1' && f.detail.includes(`${S} is already shown in block-s.1`)) ||
        (f.where === 'block-s.1' && f.detail.includes(`${S} is already shown in block-d.1`))
    ),
    JSON.stringify(loneReuse.failures)
  )
})

test('a gallery never shows one owner photo twice in its block; with no other photo left the tile is drawn', async () => {
  // Card AK: one gallery of four tiles and two owner photos. Code places both; the two other tiles may not take
  // either again in the same block (reuse, any-photo), so they go to the draw rung.
  const {
    m,
    check,
    looker,
    kit: k
  } = await finished(new Set(), 'run-ak', {
    layout: [['page-t', 'block-t', 4, true]],
    draw: true
  })
  const e = byFrame(m)
  const assets = tiles('block-t', 4)
    .map((f) => e.get(f))
    .filter((x) => x?.source === 'owner-photo')
    .map((x) => x.asset)
  assert.equal(new Set(assets).size, assets.length, JSON.stringify(assets))
  for (const f of ['block-t.3', 'block-t.4']) {
    assert.equal(e.get(f)?.source, 'drawn', f)
    assert.deepEqual(e.get(f).filledBy, { rung: 'draw', faults: [] })
    const steps = m.ladder.find((l) => l.frame === f).steps
    assert.match(steps.find((x) => x.rung === 'reuse').detail, /is already in block-t/)
    assert.match(steps.find((x) => x.rung === 'any-photo').detail, /is already in block-t/)
  }
  assert.equal(looker.drawings.length, 2)
  // The picture check passes it (a drawn gallery tile after the any-photo rung is no P07 failure), and so does the export.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  const exported = exportPictureMapping({ pictures: m, contract: 'c', revision: 'r', kit: k })
  assert.deepEqual(exported.problems, [])

  // The same photo twice in the block, or two cuts sharing more than half, fails the check and the export.
  const t1 = e.get('block-t.1')
  const twice = {
    ...m,
    frames: m.frames.map((x) =>
      x.frame === 'block-t.3'
        ? {
            ...t1,
            frame: 'block-t.3',
            reuse: { rung: 'any-photo', with: ['block-t.1'], overlap: 0.2 },
            crop: { ...t1.crop, width: t1.crop.width - 50, height: t1.crop.height - 50 }
          }
        : x
    )
  }
  const dup = p06(await check(twice))
  assert.equal(dup.status, 'fail')
  assert.match(dup.failures[0].detail, new RegExp(`brief asset ${t1.asset} is already shown in block-t\\.1`))
  const out = exportPictureMapping({ pictures: twice, contract: 'c', revision: 'r', kit: k })
  assert.ok(!('module-t.3' in out.mapping.changes))
  assert.deepEqual(out.problems, [
    {
      where: 'block-t.3',
      detail: `owner photo ${t1.asset} is already shown in block-t.1 of the same block block-t`
    }
  ])
})

test('the kit list structure, not canHide, makes a gallery tile; the reuse region keeps clear and heads whole', () => {
  const idx = galleryIndex(kit())
  assert.deepEqual(idx.get('block-t.3'), {
    block: 'block-t',
    list: 'block-t.gallery',
    index: 2,
    columns: null
  })
  assert.equal(idx.get('block-d.1'), undefined)
  assert.ok(neighbours(idx.get('block-t.2'), idx.get('block-t.3')))
  assert.ok(!neighbours(idx.get('block-t.1'), idx.get('block-t.3')))
  // With columns, the tile directly below is a neighbour too.
  const grid = (index) => ({ block: 'b', list: 'l', index, columns: 3 })
  assert.ok(neighbours(grid(0), grid(3)))
  assert.ok(!neighbours(grid(0), grid(2)))

  const size = { width: 1000, height: 2000 }
  const avoid = [{ x: 0, y: 500, width: 1000, height: 1000 }]
  const r = reuseRegion(size, { width: 300, height: 300 }, avoid, { heads: [], subject: null, minWidth: 200 })
  assert.ok(r)
  assert.equal(r.width, r.height)
  assert.ok(cropOverlap(r, avoid[0]) <= REUSE_MAX_OVERLAP)
  // A head across the only free band: the region keeps it whole or leaves it out, never cuts through it.
  const head = [0.4, 0.1, 0.2, 0.1]
  const h = { x: 400, y: 200, width: 200, height: 200 }
  const withHead = reuseRegion(size, { width: 300, height: 300 }, avoid, {
    heads: [head],
    subject: null,
    minWidth: 200
  })
  const inside =
    h.x >= withHead.x &&
    h.y >= withHead.y &&
    h.x + h.width <= withHead.x + withHead.width &&
    h.y + h.height <= withHead.y + withHead.height
  assert.ok(inside || cropOverlap(withHead, h) === 0, JSON.stringify(withHead))
  // Nothing clear enough above the size limit: no region.
  assert.equal(
    reuseRegion(size, { width: 300, height: 300 }, [{ x: 0, y: 0, width: 1000, height: 2000 }], {
      heads: [],
      subject: null,
      minWidth: 200
    }),
    null
  )
})

// Real run 6: the last rung cut a bush and a fence out of an owner photo, because every region holding the subject was
// the very cut of another tile. A reuse or any-photo region keeps the photo's main subject, or is not offered.
test('the any-photo region keeps the subject even when the subject cut is taken and empty foliage is free', () => {
  const size = { width: 2000, height: 1000 }
  const square = { width: 300, height: 300 }
  // The subject sits in the top left corner; the rest of the photo is empty foliage.
  const subject = [0.02, 0.05, 0.12, 0.25]
  const box = { x: 40, y: 50, width: 240, height: 250 }
  const taken = [{ x: 0, y: 0, width: 1000, height: 1000 }]
  const last = { heads: [], subject, minWidth: 200, maxOverlap: 1, distinct: true }
  // The reuse rule (at most 30% shared) leaves only the empty right half: without the rule that is what was cut.
  const reuse = { heads: [], subject, minWidth: 200 }
  const empty = reuseRegion(size, square, taken, reuse)
  assert.equal(cropOverlap(empty, box), 0, JSON.stringify(empty))
  assert.equal(reuseRegion(size, square, taken, { ...reuse, keepSubject: true }), null)
  const r = reuseRegion(size, square, taken, { ...last, keepSubject: true })
  assert.ok(r, 'a region is offered')
  assert.ok(cropOverlap(r, box) >= 0.5, JSON.stringify(r))
  // Never the very cut of another tile.
  assert.notDeepEqual(r, taken[0])
})

test('a photo with no detected subject is cut only when the region covers most of the photo', () => {
  const size = { width: 1000, height: 2000 }
  const square = { width: 300, height: 300 }
  const opts = { heads: [], subject: null, minWidth: 200, keepSubject: true }
  // Only a small region is free: refused.
  assert.equal(reuseRegion(size, square, [{ x: 0, y: 500, width: 1000, height: 1000 }], opts), null)
  // A region that is half of the photo (the largest square of a 1:2 photo) is enough.
  const r = reuseRegion(size, square, [{ x: 0, y: 0, width: 1000, height: 1000 }], opts)
  assert.ok(r && r.width * r.height >= 0.5 * size.width * size.height, JSON.stringify(r))
})
