// Documentary galleries use owner photos through every reuse option and report a shortage instead of drawing
// the business’s place (#548). Invented Harrow Lane Climbing Wall (_site-pictures-gallery.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byFrame, finished, kit, plan, rule, SQUARE, TALL, tiles } from './_site-pictures-gallery.mjs'

import { indexInputs } from '../src/site-pictures/picture-check/inputs-index.js'
import { rungsFor } from '../src/site-pictures/ladder-rungs.js'

const SIX = [['page-t', 'block-t', 6, true]]

test('a documentary gallery with too few owner photos returns surplus tiles instead of inventing the place', async () => {
  const { m, check } = await finished(new Set(), 'run-fill', { layout: SIX, photos: SQUARE, draw: true })
  const e = byFrame(m)
  assert.equal(m.frames.filter((e) => e.source === 'owner-photo').length, 3)
  assert.equal(m.drawer.calls.length, 0)
  assert.deepEqual(m.returns.map((r) => r.frame).sort(), ['block-t.4', 'block-t.5', 'block-t.6'])
  for (const f of tiles('block-t', 6)) assert.notEqual(e.get(f)?.source, 'drawn')
  // Even a stale manifest that claims the former gallery draw exception now fails provenance checking.
  const fake = {
    ...m.frames.find((e) => e.source === 'owner-photo'),
    source: 'drawn',
    filledBy: { rung: 'draw', faults: [] }
  }
  const result = await check({ ...m, frames: m.frames.map((e) => (e.frame === fake.frame ? fake : e)) })
  assert.equal(rule(result, 'P07').status, 'fail')
})

test('a tile is returned only when no owner photo and no drawing is left for it', async () => {
  const one = new Map([['p-a', TALL.get('p-a')]])
  const { m } = await finished(new Set(), 'run-one', {
    layout: [['page-t', 'block-t', 2, true]],
    photos: one
  })
  assert.equal(byFrame(m).get('block-t.1').source, 'owner-photo')
  assert.ok(!byFrame(m).has('block-t.2'))
  const steps = m.ladder.find((l) => l.frame === 'block-t.2').steps
  assert.deepEqual(
    steps.slice(-3).map((x) => [x.rung, x.outcome, x.detail]),
    [
      ['any-photo', 'skipped', 'the brief has fewer than 2 usable owner photos'],
      // No picture was ever made for it: nothing to keep, so it is returned (and the package names it as a problem).
      ['best-rejected', 'skipped', 'no picture of this frame was made'],
      ['return', 'returned', null]
    ]
  )
  assert.match(m.returns.find((r) => r.frame === 'block-t.2').reason, /^a gallery tile is never hidden alone/)
})

test('the check fails a gallery tile hidden alone, not one dropped with its row', async () => {
  const { m, check } = await finished(new Set(), 'run-p12', { layout: SIX, photos: TALL, draw: true })
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

test('a specific business gallery keeps the real-photo reuse ladder without any drawing rung', () => {
  const k = kit(SIX)
  const p = plan(SIX)
  for (const frame of k.blocks[0].frames) frame.role = 'business.gallery_image'
  for (const item of p.pages[0].blocks[0].lists[0].items) item.pictures[0].match = 'specific'
  const idx = indexInputs({ kit: k, plan: p, brief: { facts: [], assets: [] } })
  for (const frame of k.blocks[0].frames) {
    assert.ok(idx.galleryTile(frame.id), 'the template still requires a whole gallery grid')
    const rungs = rungsFor(idx, frame.id)
    assert.ok(rungs.includes('reuse'))
    assert.ok(rungs.includes('any-photo'))
    assert.ok(!rungs.some((r) => ['draw', 'redraw', 'redraw-alt'].includes(r)))
  }
})
