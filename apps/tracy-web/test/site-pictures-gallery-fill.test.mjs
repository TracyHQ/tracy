// No gallery tile ends hidden or returned while a picture can be had (owner decisions 04/11/2026 and 06/11/2026, ADR
// 0043 section 4): the last photo rung "any-photo" fills a tile from an owner photo cut clearly differently from its
// other cuts on the page (at most half shared, card AK), and a tile no such cut is left for is drawn; on the invented
// Harrow Lane Climbing Wall (_site-pictures-gallery.mjs).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { byFrame, finished, rule, rungs, SQUARE, TALL, tiles } from './_site-pictures-gallery.mjs'

const SIX = [['page-t', 'block-t', 6, true]]

test('with only three photos for six tiles, every tile is filled with a different picture', async () => {
  // Card AK: a square photo cut whole leaves no second cut sharing at most half with it, so the three tiles left are
  // drawn (block-t.6 once more after the looker rejects its first drawing).
  const { m, check } = await finished(new Set(), 'run-fill', {
    layout: SIX,
    photos: SQUARE,
    once: new Set(['block-t.6']),
    draw: true
  })
  const e = byFrame(m)
  const ids = tiles('block-t', 6)
  assert.deepEqual(m.returns, [])
  const owner = ids.filter((f) => e.get(f)?.source === 'owner-photo')
  assert.equal(owner.length, 3)
  assert.equal(new Set(owner.map((f) => e.get(f).asset)).size, 3)
  for (const f of ['block-t.4', 'block-t.5', 'block-t.6']) {
    assert.equal(e.get(f).source, 'drawn', f)
    assert.deepEqual(e.get(f).filledBy, { rung: 'draw', faults: [] })
    for (const rung of ['reuse', 'any-photo'])
      assert.ok(
        rungs(m, f).some(([r, o]) => r === rung && o === 'skipped'),
        `${f} ${rung}`
      )
  }
  assert.equal(new Set(ids.map((f) => e.get(f).sha256)).size, 6)
  // The looker rejected the first drawing of block-t.6: it is drawn once more.
  assert.deepEqual(rungs(m, 'block-t.6').slice(-3), [
    ['draw', 'placed'],
    ['draw', 'rejected'],
    ['redraw', 'placed']
  ])
  // The check passes, P06 and P07 included.
  const result = await check(m)
  assert.deepEqual(
    result.rules.filter((r) => r.status === 'fail').map((r) => [r.id, r.failures]),
    []
  )
  // A drawn any-real frame that is not a gallery tile drawn by its ladder still fails P07.
  const unmarked = {
    ...m,
    frames: m.frames.map((x) => (x.frame === 'block-t.4' ? { ...x, filledBy: null } : x))
  }
  assert.equal(rule(await check(unmarked), 'P07').status, 'fail')
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
    steps.slice(-5).map((x) => [x.rung, x.outcome, x.detail]),
    [
      ['any-photo', 'skipped', 'the brief has fewer than 2 usable owner photos'],
      ['draw', 'skipped', 'the run has no drawer door'],
      ['redraw', 'skipped', 'the run has no drawer door'],
      // No picture was ever made for it: nothing to keep, so it is returned (and the package names it as a problem).
      ['best-rejected', 'skipped', 'no picture of this frame was made'],
      ['return', 'returned', null]
    ]
  )
  assert.match(m.returns.find((r) => r.frame === 'block-t.2').reason, /^a gallery tile is never hidden alone/)
})

test('the check fails a gallery tile hidden alone, not one dropped with its row', async () => {
  const { m, check } = await finished(new Set(), 'run-p12', { layout: SIX, photos: SQUARE, draw: true })
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
