// No gallery tile ends hidden or returned while the brief has usable owner photos (owner decision 04/11/2026, ADR 0043
// section 4): the last rung "any-photo" fills a tile from any usable owner photo, with heads whole, never the photo of a
// neighbouring tile and never the very cut of another tile; on the invented Harrow Lane Climbing Wall
// (_site-pictures-gallery.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { galleryIndex, neighbours } from '../src/site-pictures/gallery-tiles.js'
import { byFrame, finished, kit, rule, rungs, SQUARE, TALL, tiles } from './_site-pictures-gallery.mjs'

const SIX = [['page-t', 'block-t', 6, true]]
const same = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

test('with only three photos for six tiles, the last rung fills every tile, never beside the same photo', async () => {
  const { m, check } = await finished(new Set(), 'run-fill', {
    layout: SIX,
    photos: SQUARE,
    once: new Set(['block-t.6'])
  })
  const e = byFrame(m)
  const ids = tiles('block-t', 6)
  for (const f of ids) assert.equal(e.get(f)?.source, 'owner-photo', f)
  assert.deepEqual(m.returns, [])
  // A square photo cut whole leaves no clear second cut: the 30% rung is skipped, the last rung fills.
  for (const f of ['block-t.4', 'block-t.5', 'block-t.6']) {
    assert.equal(e.get(f).reuse.rung, 'any-photo', f)
    assert.ok(
      rungs(m, f).some(([r, o]) => r === 'reuse' && o === 'skipped'),
      f
    )
  }
  // The looker rejected the first fill of block-t.6: the rung tried the next photo (not the one of block-t.5).
  const t6 = rungs(m, 'block-t.6')
  assert.deepEqual(t6.slice(-3), [
    ['any-photo', 'placed'],
    ['any-photo', 'rejected'],
    ['any-photo', 'placed']
  ])
  // Never the same photo as the tile beside it, never the very cut of another tile.
  const gal = galleryIndex(kit(SIX))
  for (const a of ids)
    for (const b of ids) {
      if (a === b || e.get(a).asset !== e.get(b).asset) continue
      assert.ok(!neighbours(gal.get(a), gal.get(b)), `${a} ${b}`)
      assert.ok(!same(e.get(a).crop, e.get(b).crop), `${a} ${b}`)
    }
  // The check passes, P06 included.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
})

test('a tile is returned only when the brief has fewer than two usable photos', async () => {
  const one = new Map([['p-a', TALL.get('p-a')]])
  const { m } = await finished(new Set(), 'run-one', {
    layout: [['page-t', 'block-t', 2, true]],
    photos: one
  })
  assert.equal(byFrame(m).get('block-t.1').source, 'owner-photo')
  assert.ok(!byFrame(m).has('block-t.2'))
  const steps = m.ladder.find((l) => l.frame === 'block-t.2').steps
  assert.deepEqual(steps.at(-3), {
    rung: 'any-photo',
    outcome: 'skipped',
    detail: 'the brief has fewer than 2 usable owner photos'
  })
  // No picture was ever made for it: nothing to keep, so it is returned (and the package names it as a problem).
  assert.deepEqual(steps.at(-2), {
    rung: 'best-rejected',
    outcome: 'skipped',
    detail: 'no picture of this frame was made'
  })
  assert.match(m.returns.find((r) => r.frame === 'block-t.2').reason, /^a gallery tile is never hidden alone/)
})

test('the check fails a gallery tile hidden alone, not one dropped with its row', async () => {
  const { m, check } = await finished(new Set(), 'run-p12', { layout: SIX, photos: SQUARE })
  const hidden = {
    frame: 'block-t.5',
    source: 'hide',
    file: null,
    crop: null,
    enlarge: null,
    sharpness: null,
    darkened: false,
    seen: null,
    reason: 'hidden'
  }
  const alone = { ...m, frames: m.frames.map((x) => (x.frame === 'block-t.5' ? hidden : x)) }
  const p12 = rule(await check(alone), 'P12')
  assert.equal(p12.status, 'fail')
  assert.match(p12.failures[0].detail, /a gallery tile is never hidden alone/)
  const dropped = {
    ...alone,
    rows: [
      { block: 'block-t', list: 'block-t.gallery', rows: 5, from: 6, dropped: ['block-t.5'], reason: 'r' }
    ]
  }
  assert.equal(rule(await check(dropped), 'P12').status, 'pass')
})
