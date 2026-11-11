// The picture bench takes an owner photo only when the brief asset says it carries no lettering and shows no other
// business. Those two labels come from the vision model through the brief (`picture-links.mjs benchLabelsOf`); a photo
// labelled by the model must reach the bench usable, and an unknown label must still refuse it.
// Fixtures are fictional: the Juniper Lane Bakery does not exist.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assetRelationsOf } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { photoRefusal, usablePhotos } from '../src/site-pictures/photo-shortlist.js'

const vision = {
  subject: 'interior',
  content: 'venue-interior',
  textPresence: 'absent',
  hasTextOverlay: false,
  showsOtherBusiness: false,
  isGraphic: false,
  isOwnPhoto: true
}
const briefAsset = (labels) => {
  const m = { id: 'ph_1', kind: 'image', source: 'website', labels: { vision: { labels } } }
  return { id: m.id, kind: m.kind, width: 1600, height: 1000, quality: 'high', ...assetRelationsOf(m) }
}

test('a photo the vision model labelled in full reaches the bench usable', () => {
  const a = briefAsset(vision)
  assert.equal(photoRefusal(a), null)
  const { usable, refused } = usablePhotos({ assets: [a] }, new Map([[a.id, new Uint8Array(1)]]))
  assert.deepEqual(
    usable.map((x) => x.id),
    ['ph_1']
  )
  assert.deepEqual(refused, [])
})

test('lettering or another business still refuses the photo', () => {
  assert.equal(photoRefusal(briefAsset({ ...vision, textPresence: 'present' })), 'lettering or a watermark')
  assert.equal(photoRefusal(briefAsset({ ...vision, hasTextOverlay: true })), 'lettering or a watermark')
  assert.equal(photoRefusal(briefAsset({ ...vision, showsOtherBusiness: true })), 'another business')
})

test('a label the model never answered stays unknown, and the bench refuses it', () => {
  const { showsOtherBusiness, ...older } = vision
  assert.equal(showsOtherBusiness, false)
  assert.equal(photoRefusal(briefAsset(older)), 'a label that decides it is unknown')
})

test('a photo labelled with the direct answers (no textPresence) reaches the bench usable; a blurry answer refuses it', () => {
  const { textPresence, hasTextOverlay, ...direct } = vision
  assert.equal(textPresence, 'absent')
  assert.equal(hasTextOverlay, false)
  const labels = { ...direct, isBlurry: false, hasTextOrWatermark: false }
  assert.equal(photoRefusal(briefAsset(labels)), null)
  assert.equal(photoRefusal(briefAsset({ ...labels, hasTextOrWatermark: true })), 'lettering or a watermark')
  assert.equal(photoRefusal(briefAsset({ ...labels, isBlurry: true })), 'blurry')
})

test('measured sharpness is primary; the vision blur answer refuses only without a measurement or with a poor one', () => {
  const blurry = { ...briefAsset(vision), isBlurry: true }
  const measuredSharp = { passed: true, verdict: 'pass', score: 0.7, bar: 0.45, version: 'test' }
  const measuredPoor = { passed: false, verdict: 'fail', score: 0.3, bar: 0.45, version: 'test' }
  assert.equal(photoRefusal({ ...blurry, sharpness: measuredSharp }), null)
  assert.equal(photoRefusal(blurry), 'blurry')
  assert.equal(photoRefusal({ ...blurry, sharpness: measuredPoor }), 'blurry')
})

test('scene text survives brief mapping and native photo eligibility follows the stricter P09 rule', () => {
  const source = { ...vision, textPresence: 'present', hasTextOverlay: false, hasTextOrWatermark: false }
  const asset = briefAsset(source)
  assert.equal(asset.textPresence, 'present')
  assert.equal(asset.hasTextOrWatermark, false, 'the legacy overlay-only label remains unchanged')
  assert.equal(photoRefusal(asset), 'lettering or a watermark')
  assert.equal(photoRefusal(briefAsset({ ...source, textPresence: 'absent' })), null)
  const unknown = briefAsset({ ...source, textPresence: 'invented' })
  assert.equal('textPresence' in unknown, false)
})
