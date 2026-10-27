// Slot fit, wave 1: which demo pictures no build path replaces, and whether a picture can take a frame's shape at all.
// Every name and size here is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { protectedPicture, slotMap } from '../domain/pictures/slot-map.mjs'
import { fitCrop, fitOf, shapeFit } from '../domain/pictures/placement.mjs'

const slot = (label, extra = {}) => ({ type: 'image', label, ...extra })

test('a kept slot, an icon, an avatar strip, a signature, a cut-out and a drawing are protected, each with its kind', () => {
  const kind = (s, file, demo) => protectedPicture(s, file, demo)?.kind ?? null
  assert.equal(kind(slot('Classes / img', { customize: 'keep' }), 'images/demo/classes/one.jpg'), 'keep')
  assert.equal(kind(slot('The workout / img-icon'), 'images/demo/icons/icon-dark-1.png'), 'icon')
  assert.equal(kind(slot('Our Classes / top-desc'), 'images/demo/others/avatar-1.png'), 'avatar')
  assert.equal(kind(slot('Quote / sign'), 'images/demo/about/signature.png'), 'signature')
  assert.equal(kind(slot('Hero / image-main'), 'images/demo/hero/fighter.png', { alpha: true }), 'cutout')
  // A PNG whose transparency nobody measured counts as a cut-out until it is.
  assert.equal(kind(slot('Hero / image-main'), 'images/demo/hero/fighter.png'), 'cutout')
  assert.equal(kind(slot('Steps / img'), 'images/demo/steps/arrow.svg'), 'icon')
  assert.equal(kind(slot('Steps / img'), 'images/demo/steps/small.jpg', { width: 90, height: 90 }), 'icon')
  // A photograph is not protected.
  assert.equal(
    kind(slot('Our Classes / intro'), 'images/demo/classes/intro-1.jpg', { width: 1128, height: 484 }),
    null
  )
  assert.equal(
    kind(slot('Hero / image-main'), 'images/demo/hero/opaque.png', {
      width: 1200,
      height: 900,
      alpha: false
    }),
    null
  )
})

test('the planner never offers a kept slot', () => {
  const map = slotMap({
    slots: [
      {
        key: 'm-1.0',
        entity: 'm-1',
        ...slot('Gallery / img', { customize: 'keep' }),
        sample: 'images/demo/g/one.jpg'
      },
      { key: 'm-1.1', entity: 'm-1', ...slot('Gallery / img'), sample: 'images/demo/g/two.jpg' }
    ],
    pages: [{ route: 'home', entity: 'm-1' }]
  })
  assert.deepEqual(
    map.groups.map((g) => g.file),
    ['images/demo/g/two.jpg']
  )
  assert.equal(map.never[0].file, 'images/demo/g/one.jpg')
})

test('shapeFit: a phone portrait never fills a wide card; a wide photo fills it within the planner limits', () => {
  const card = { width: 1128, height: 484 }
  assert.equal(shapeFit({ width: 360, height: 640 }, card), null)
  assert.equal(shapeFit({ width: 1320, height: 2325 }, card), null)
  const wide = shapeFit({ width: 1600, height: 800 }, card)
  assert.ok(wide)
  assert.ok(Math.abs(wide.output.width / wide.output.height - card.width / card.height) <= 0.005)
  // A square frame takes a portrait's middle when little is lost, never enlarged past the planner's limit.
  assert.ok(shapeFit({ width: 1080, height: 1350 }, { width: 573, height: 574 }))
  assert.equal(shapeFit({ width: 300, height: 300 }, { width: 1400, height: 1400 }, { min: 1400 }), null)
})

test('fitCrop is the recipe the planner itself writes: the same crop as fitOf for the same picture and frame', () => {
  const demo = { width: 900, height: 600 }
  const label = {
    id: 'p1',
    width: 1800,
    height: 1350,
    aspect: 1800 / 1350,
    subject: 'interior',
    subjectFrom: 'vision',
    quality: 'good',
    words: [],
    textPresence: 'absent',
    centreLuminance: null
  }
  const planned = fitOf(label, { role: 'gallery', demo, topic: [] })
  const recipe = fitCrop(label, demo, { min: 600, label })
  assert.deepEqual(recipe, planned.crop)
  // Without a label the subject is kept by attention.
  assert.equal(fitCrop({ width: 1800, height: 1350 }, demo).strategy, 'attention')
})
