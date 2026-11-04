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
import { reuseRegion } from '../src/site-pictures/reuse-crop.js'
import { byFrame, finished, kit, p06, plan, rungs, tiles } from './_site-pictures-gallery.mjs'

test('a gallery tile no new photo fits reuses a photo of its page, cut elsewhere, never next to its other tile', async () => {
  const { parts, m, check } = await finished(new Set(['block-u.2', 'block-d.1']), 'run-reuse')
  // Code alone hides no tile: the two tiles it found no free photo for wait for the ladder.
  assert.deepEqual(
    parts.pending.filter((x) => x.waitsFor === 'ladder').map((x) => x.frame),
    ['block-t.3', 'block-t.4']
  )
  assert.ok(!parts.frames.some((e) => e.source === 'hide'))

  const e = byFrame(m)
  const first = e.get('block-t.1')
  const second = e.get('block-t.2')
  // Which photo goes first is code's order (darker first, then by id): the test names them A and B.
  const A = first.asset
  const B = second.asset
  assert.deepEqual([A, B].sort(), ['p-a', 'p-b'])
  // block-t.3 takes the photo of block-t.1 (two tiles away), not the one of its neighbour block-t.2.
  const t3 = e.get('block-t.3')
  assert.equal(t3.source, 'owner-photo')
  assert.equal(t3.asset, A)
  assert.deepEqual([t3.reuse.rung, t3.reuse.with], ['reuse', ['block-t.1']])
  assert.ok(cropOverlap(t3.crop, first.crop) <= REUSE_MAX_OVERLAP, JSON.stringify([t3.crop, first.crop]))
  assert.equal(t3.reuse.overlap, Number(cropOverlap(t3.crop, first.crop).toFixed(3)))
  assert.match(t3.reason, new RegExp(`^reused owner photo ${A}, also in block-t\\.1, cut to another region`))
  assert.deepEqual(rungs(m, 'block-t.3'), [
    ['next-photo', 'skipped'],
    ['fewer-rows', 'skipped'],
    ['reuse', 'placed']
  ])
  // block-t.4 sits next to block-t.3, which now shows A: it takes B of block-t.2, two tiles away.
  const t4 = e.get('block-t.4')
  assert.equal(t4.asset, B)
  assert.deepEqual(t4.reuse.with, ['block-t.2'])
  assert.ok(cropOverlap(t4.crop, second.crop) <= REUSE_MAX_OVERLAP)
  assert.match(m.ladder.find((l) => l.frame === 'block-t.4').steps[2].detail ?? '', /^[0-9a-f]{12}$/)

  // No photo left (the other photo of the page is in the neighbouring tile, its own was rejected): returned, never hidden.
  assert.ok(!e.has('block-u.2'))
  const back = m.returns.find((r) => r.frame === 'block-u.2')
  assert.match(back.reason, /^a gallery tile is never hidden alone/)
  // The last rung tries every photo: the neighbour's is never taken, the tile's own is rejected again.
  const u2 = rungs(m, 'block-u.2')
  assert.ok(u2.some(([r, o]) => r === 'reuse' && o === 'skipped'))
  assert.deepEqual(u2.slice(-2), [
    ['any-photo', 'skipped'],
    ['return', 'returned']
  ])
  assert.match(
    m.ladder.find((l) => l.frame === 'block-u.2').steps.at(-2).detail,
    /is in the neighbouring tile block-u\.1/
  )
  // A frame that is not a gallery tile keeps today's ladder: hidden where the kit allows.
  assert.equal(e.get('block-d.1').source, 'hide')
  assert.deepEqual(rungs(m, 'block-d.1').slice(-2), [
    ['fewer-rows', 'skipped'],
    ['hide', 'hidden']
  ])
  // No tile anywhere is hidden; nothing is drawn.
  for (const f of [...tiles('block-t', 4), ...tiles('block-u', 2)])
    assert.notEqual(e.get(f)?.source, 'hide', f)
  assert.equal(m.drawer.calls.length, 0)

  // The finished manifest passes the check, P06 included: the reuses keep clear of their other cuts.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  assert.equal(p06(result).status, 'pass')
})

test('the duplicate rule fails a photo shown twice on a page unless a gallery tile reused it clear of the other', async () => {
  const { m, check } = await finished(new Set(), 'run-dup')
  const swap = (frame, change) => ({
    ...m,
    frames: m.frames.map((e) => (e.frame === frame ? { ...e, ...change } : e))
  })
  const t1 = byFrame(m).get('block-t.1')
  const A = t1.asset
  assert.equal(p06(await check(m)).status, 'pass')
  // The same photo with no reuse mark: two showings of A on page-t.
  const noMark = p06(await check(swap('block-t.3', { reuse: null })))
  assert.equal(noMark.status, 'fail')
  assert.match(
    noMark.failures[0].detail,
    new RegExp(`brief asset ${A} is already shown in block-t\\.1 on page-t`)
  )
  // Marked as reused, but cut the same way: too much shared.
  const sameCut = p06(await check(swap('block-t.3', { crop: { ...t1.crop } })))
  assert.equal(sameCut.status, 'fail')
  assert.match(sameCut.failures[0].detail, /at most 30% of the smaller cut/)
  // Marked as reused, cut elsewhere, but next to the other showing: block-t.2 holding A beside block-t.1.
  const t3 = byFrame(m).get('block-t.3')
  const nextTo = swap('block-t.2', {
    asset: A,
    crop: t3.crop,
    reuse: { rung: 'reuse', with: ['block-t.1'], overlap: 0 }
  })
  assert.equal(p06(await check(nextTo)).status, 'fail')
  // The last rung asks only for another cut: the same cut of block-t.1 fails, a smaller one passes; never beside it.
  const lastSame = swap('block-t.3', {
    crop: { ...t1.crop },
    reuse: { rung: 'any-photo', with: ['block-t.1'], overlap: 1 }
  })
  assert.equal(p06(await check(lastSame)).status, 'fail')
  const inner = { ...t1.crop, width: t1.crop.width - 50, height: t1.crop.height - 50 }
  const lastOther = swap('block-t.3', {
    crop: inner,
    reuse: { rung: 'any-photo', with: ['block-t.1'], overlap: 1 }
  })
  assert.equal(p06(await check(lastOther)).status, 'pass')
  const lastNext = swap('block-t.2', {
    asset: A,
    crop: inner,
    reuse: { rung: 'any-photo', with: ['block-t.1'], overlap: 1 }
  })
  assert.equal(p06(await check(lastNext)).status, 'fail')
  // A frame that is not a gallery tile may not reuse: block-d.1 also shown on page-t, marked as reused, cut clear.
  const both = plan()
  both.pages[0].blocks.push(both.pages[2].blocks[0])
  const single = swap('block-d.1', {
    asset: A,
    crop: t3.crop,
    reuse: { rung: 'reuse', with: ['block-t.1'], overlap: 0 }
  })
  const lone = p06(await check(single, both))
  assert.equal(lone.status, 'fail')
  assert.ok(
    lone.failures.some(
      (f) =>
        (f.where === 'block-d.1' && f.detail.includes(`${A} is already shown in block-t.1`)) ||
        (f.where === 'block-t.1' && f.detail.includes(`${A} is already shown in block-d.1`))
    ),
    JSON.stringify(lone.failures)
  )
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
