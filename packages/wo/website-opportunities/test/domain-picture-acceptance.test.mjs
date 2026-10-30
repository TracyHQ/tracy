// The picture stage's acceptance check (spec TracyHQ/tracy#189, criteria 3.1, 3.4, 3.6, 9.2), its domain half: a frame
// whose copy names one offering never takes a photo of another, a crop never cuts the people a photo shows, a photo is
// never written several times wider than it is shown, and a drawing is refused for the faults the labeller names while
// clear faces drawn right are accepted (decision faces = B). Fixtures are fictional: a dance school and a pottery studio.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill } from '../domain/fill-plan.mjs'
import { drawnPictureVerdict } from '../domain/fill-draw.mjs'
import { subjectCrop } from '../domain/pictures/subject-crop.mjs'
import {
  avoidLine,
  defectsOf,
  inspectionClause,
  pictureByteBudget,
  weightCapOf
} from '../domain/pictures/picture-acceptance.mjs'

const fit = (width, height) => ({
  measured: true,
  kind: 'photo',
  replace: 'photo',
  transparent: false,
  source: { width, height, format: 'jpg' },
  boxes: { desktop: { width: 600, height: Math.round((600 * height) / width) } },
  aspect: Number((width / height).toFixed(4)),
  tolerance: 0.02,
  crop: 'cover'
})
const tile = { id: 'module-1.gallery.0', item: 0, kind: 'gallery' }
const MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-1', kind: 'module' }],
  pages: [{ route: 'home', entity: 'home', assignedModules: [{ entity: 'module-1' }], home: true }],
  slots: [
    {
      key: 'module-1.0',
      entity: 'module-1',
      type: 'image',
      sample: 'images/demo/gallery/one.jpg',
      label: 'tile',
      role: 'business.gallery_image',
      group: tile,
      fit: fit(800, 600)
    },
    {
      key: 'module-1.1',
      entity: 'module-1',
      type: 'text',
      sample: 'Demo tile',
      label: 'tile title',
      role: 'item.title',
      group: tile
    }
  ]
}
const photo = (id, offering) => ({
  id,
  kind: 'image',
  width: 1600,
  height: 1200,
  depicts: { id: offering, evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false
})
const DANCE = {
  business: { name: 'Quillhaven Dance Rooms', trade: 'dance school' },
  reading: {
    services: [
      { id: 'svc-ballet', label: 'Ballet Classes' },
      { id: 'svc-salsa', label: 'Salsa Nights' }
    ]
  }
}
const written = { 'module-1.1': 'Ballet Classes for beginners' }
const decision = (brief) =>
  planFill({ contentMap: MAP, brief, perSlot: true, written }).slots.find((d) => d.key === 'module-1.0')

test('3.1 a general frame whose copy names one offering never takes a photo the brief links to another', () => {
  const only = decision({ ...DANCE, assets: [photo('salsa-1', 'svc-salsa')] })
  assert.notEqual(only.action, 'photo', 'a salsa photo under the words "Ballet Classes" is refused')
  assert.equal(only.refused?.['other-topic'], 1)
  const both = decision({
    ...DANCE,
    assets: [photo('salsa-1', 'svc-salsa'), photo('ballet-1', 'svc-ballet')]
  })
  assert.equal(both.mediaId, 'ballet-1')
  // A general photo still serves the frame: it shows no other offering.
  const general = decision({ ...DANCE, assets: [photo('room-1', 'general')] })
  assert.equal(general.mediaId, 'room-1')
})

test('3.6 a crop holds the whole figure of the people a photo shows, a head turned away included', () => {
  // A coach (head at the top, turned away, no face box) teaching a child whose face is lower in the photo.
  const coach = {
    width: 1600,
    height: 1200,
    subjectBox: [0.1, 0.05, 0.8, 0.55],
    faceBoxes: [[0.55, 0.6, 0.1, 0.1]],
    peopleCount: 2
  }
  const wide = { width: 1600, height: 700 }
  assert.deepEqual(subjectCrop(coach, wide, { min: 800 }), { refused: 'cuts-the-subject' })
  // The same people lower in the frame fit: the crop keeps the subject box whole.
  const lower = { ...coach, subjectBox: [0.1, 0.2, 0.8, 0.5] }
  const cut = subjectCrop(lower, wide, { min: 800 })
  assert.ok('crop' in cut)
  const top = cut.crop.at.y * (lower.height - cut.crop.source.height)
  assert.ok(top <= 0.2 * lower.height, `the crop starts at ${top}, above the subject's top`)
  assert.ok(top + cut.crop.source.height >= 0.7 * lower.height)
  // A photo of a thing (no people) is only centred on its subject, as before.
  const vase = { width: 1600, height: 1200, subjectBox: [0.1, 0.05, 0.8, 0.9], faceBoxes: [], peopleCount: 0 }
  assert.ok('crop' in subjectCrop(vase, wide, { min: 800 }))
})

test('9.2 a 4000 px photo for a 600 px frame is written at most twice the width it is shown at', () => {
  const big = { width: 4000, height: 3000 }
  const frame = { width: 3000, height: 2250 }
  const cut = subjectCrop(big, frame, { min: 600, maxWidth: weightCapOf({ shown: 600 }) })
  assert.ok('crop' in cut)
  assert.equal(cut.crop.output.width, 1200)
  assert.equal(weightCapOf({ shown: 600, minWidth: 1500 }), 1500, 'never under the width the site asks')
  assert.equal(weightCapOf({}), 2560)
  assert.ok(pictureByteBudget(1920, 1080) < 250_000)
})

test('3.4 a drawing is refused for the faults the labeller names, and accepted with clear faces drawn right', () => {
  const clean = { textPresence: 'absent', faceBoxes: [[0.4, 0.2, 0.1, 0.1]], defects: [] }
  assert.deepEqual(drawnPictureVerdict(clean), { ok: true, reason: null })
  for (const fault of ['garbled-lettering', 'distorted-face', 'distorted-body', 'visible-seam', 'off-topic'])
    assert.deepEqual(drawnPictureVerdict({ ...clean, defects: [fault] }), { ok: false, reason: fault })
  assert.deepEqual(drawnPictureVerdict({ ...clean, defects: ['other-trade'] }).reason, 'other-trade')
  assert.deepEqual(defectsOf(['visible-seam', 'made-up']), ['visible-seam'])
  assert.match(avoidLine('visible-seam'), /refused because it showed a visible join/)
  assert.match(avoidLine('text-found'), /letters, words/)
  assert.equal(avoidLine('model-failed'), '')
  const clause = inspectionClause({ trade: 'pottery studio', shows: 'Wheel Throwing' })
  assert.match(clause, /pottery studio/)
  assert.match(clause, /"Wheel Throwing"/)
  assert.match(clause, /clear faces are allowed/)
})
