/**
 * The sharpness gate's eyes (spec TracyHQ/tracy#189): an owner photo is judged as it will be shown, cut and rendered at
 * its slot's shown width at 1x and 2x. Every picture here is generated: a fictional bakery counter and a fictional
 * dental clinic, each made sharp, blurred, saved as a heavily compressed JPEG, and drawn small then enlarged 3x.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import { blurredBand, judgePhoto, measureSharpness, slotClassOf } from '../src/lib/photo-sharpness.js'
import { kinds, padded, scene } from './_generated-photos.mjs'

const LARGE = { kind: 'large', width: 704 }
const MEDIUM = { kind: 'medium', width: 448 }

for (const trade of ['bakery', 'dental']) {
  test(`#189 ${trade}: a crisp photo passes a large slot and a medium one as it is`, async () => {
    const { crisp } = await kinds(trade, 900, 600)
    for (const slot of [LARGE, MEDIUM]) {
      const j = await judgePhoto(crisp, slot)
      assert.equal(j.verdict, 'pass', JSON.stringify(j.measured))
      assert.equal(j.step, 'kept')
      assert.ok(j.score >= j.threshold)
    }
  })

  test(`#189 ${trade}: a blurred photo fails even after the light correction`, async () => {
    const { blurred } = await kinds(trade, 900, 600)
    const j = await judgePhoto(blurred, LARGE)
    assert.equal(j.verdict, 'fail')
    assert.equal(j.reason, 'soft')
    assert.ok(j.before, 'it was corrected and measured again before it failed')
    assert.ok(j.score < j.threshold)
  })

  test(`#189 ${trade}: a heavily compressed JPEG fails on its blocks`, async () => {
    const { compressed } = await kinds(trade, 900, 600)
    const m = await measureSharpness(compressed, 704)
    assert.ok(m.blockiness > 1.35, String(m.blockiness))
    const j = await judgePhoto(compressed, LARGE)
    assert.equal(j.verdict, 'fail')
    assert.equal(j.reason, 'blocky')
  })

  test(`#189 ${trade}: a small photo enlarged 3x passes its pixel size but fails a large slot`, async () => {
    const { enlarged } = await kinds(trade, 900, 600)
    const j = await judgePhoto(enlarged, LARGE)
    assert.equal(j.verdict, 'fail')
    assert.equal(j.reason, 'soft')
  })

  test(`#189 ${trade}: a photo cut narrower than a large slot is refused as enlarged too far, a medium slot takes it`, async () => {
    const { crisp } = await kinds(trade, 600, 400)
    const large = await judgePhoto(crisp, LARGE)
    assert.equal(large.verdict, 'fail')
    assert.equal(large.reason, 'enlarged-too-far')
    assert.equal((await judgePhoto(crisp, MEDIUM)).verdict, 'pass')
  })

  test(`#189 ${trade}: a picture padded with a blurred stretched copy fails, a crisp one has no band`, async () => {
    const band = await blurredBand(await padded(trade, 1200, 515))
    assert.equal(band?.edge, 'left')
    assert.equal(await blurredBand(await scene(trade, 1200, 515)), null)
    const j = await judgePhoto(await padded(trade, 1200, 515), LARGE)
    assert.equal(j.verdict, 'fail')
    assert.equal(j.reason, 'blurred-region')
  })
}

test('#189 a flat picture (a plain wall) has nothing to look blurred and passes', async () => {
  const flat = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#cfd8d6' } })
    .jpeg()
    .toBuffer()
  assert.equal((await judgePhoto(flat, LARGE)).verdict, 'pass')
  assert.equal(await blurredBand(flat), null)
})

test('#189 the slot class: small, medium, large by shown width; a full-width hero picture is a background', () => {
  const shown = (s) => s.fit.boxes.desktop.width
  const slot = (role, width, kind = 'photo') => ({ role, fit: { kind, boxes: { desktop: { width } } } })
  assert.equal(slotClassOf([slot('business.gallery_image', 344)], shown).kind, 'small')
  assert.equal(slotClassOf([slot('business.gallery_image', 448)], shown).kind, 'medium')
  assert.equal(slotClassOf([slot('offering.image', 704)], shown).kind, 'large')
  assert.equal(slotClassOf([slot('business.hero_image', 1440)], shown).kind, 'background')
  // The widest slot a cut serves decides.
  assert.deepEqual(slotClassOf([slot('business.gallery_image', 344), slot('offering.image', 704)], shown), {
    kind: 'large',
    width: 704
  })
})
