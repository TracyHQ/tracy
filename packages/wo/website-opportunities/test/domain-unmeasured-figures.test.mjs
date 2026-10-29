// The demo figures a content map never measured (spec TracyHQ/tracy#189): a PNG read transparent at build time is a
// cut-out of the ladder only when the photo labeller says it shows a subject; an abstract design piece stays. Fictional
// templates: a bakery (a chef figure), a pet groomer (a dog figure), a florist (a blob and a line pattern).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  figureCandidatesOf,
  figureShowsSubject,
  unmeasuredFigureSlotsOf
} from '../domain/unmeasured-figures.mjs'
import { planDecor } from '../domain/decor-plan.mjs'

const slot = (key, file, extra = {}) => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  sample: `images/demo/${file}`,
  label: `Section / ${extra.name ?? 'img'}`,
  ...extra
})
const SLOTS = [
  slot('module-1.1', 'about/chef.png', { role: 'business.hero_image' }),
  slot('module-2.1', 'cta/dog.png'),
  slot('module-3.1', 'hero/blob.png', { role: 'business.hero_image' }),
  slot('module-4.1', 'team/face.png', { role: 'person.photo' }),
  slot('module-5.1', 'brand/logo-dark.png', { name: 'logo' }),
  slot('module-6.1', 'icons/star.png'),
  slot('module-7.1', 'gallery/photo.png'),
  slot('module-8.1', 'measured/figure.png', { fit: { measured: true, kind: 'cutout' } })
]
const never = SLOTS.map((s) => ({ file: s.sample, keys: [s.key] }))
const DEMO = new Map([
  ['images/demo/about/chef.png', { width: 600, height: 700, alpha: true }],
  ['images/demo/cta/dog.png', { width: 500, height: 400, alpha: true }],
  ['images/demo/hero/blob.png', { width: 900, height: 700, alpha: true }],
  ['images/demo/team/face.png', { width: 400, height: 400, alpha: true }],
  ['images/demo/brand/logo-dark.png', { width: 300, height: 120, alpha: true }],
  ['images/demo/icons/star.png', { width: 64, height: 64, alpha: true }],
  ['images/demo/gallery/photo.png', { width: 800, height: 600, alpha: false }],
  ['images/demo/measured/figure.png', { width: 800, height: 600, alpha: true }]
])

test('#189 candidates: transparent, icon-sized or larger, no measured kind, no person role, no logo name', () => {
  const found = figureCandidatesOf({ slots: SLOTS, never, demo: DEMO })
  assert.deepEqual(
    found.map((c) => c.file),
    ['images/demo/hero/blob.png', 'images/demo/about/chef.png', 'images/demo/cta/dog.png'],
    'largest first; the face, the logo, the small icon, the opaque PNG and the measured slot are not candidates'
  )
  assert.equal(figureCandidatesOf({ slots: SLOTS, never, demo: DEMO, max: 1 }).length, 1)
})

test('#189 a subject is a person, an object, a product, an animal or food; a design piece is not', () => {
  assert.equal(figureShowsSubject({ subject: 'people', peopleCount: 1 }), true)
  assert.equal(figureShowsSubject({ subject: 'other', peopleCount: 2, isGraphic: true }), true)
  assert.equal(figureShowsSubject({ subject: 'dessert' }), true)
  assert.equal(figureShowsSubject({ subject: 'product', isGraphic: true }), true)
  assert.equal(figureShowsSubject({ subject: 'equipment' }), true)
  assert.equal(
    figureShowsSubject({ subject: 'other', isGraphic: false }),
    true,
    'an animal: a thing, not a graphic'
  )
  assert.equal(figureShowsSubject({ subject: 'other', isGraphic: true }), false, 'a blob or a pattern')
  assert.equal(figureShowsSubject({ subject: 'other' }), false, 'not said to be no graphic: stays')
  assert.equal(figureShowsSubject({ subject: 'poster' }), false)
  assert.equal(figureShowsSubject(null), false)
})

test('#189 labelled figures climb the ladder (step 2 with no own picture); the blob and the unlabelled stay', () => {
  const candidates = figureCandidatesOf({ slots: SLOTS, never, demo: DEMO })
  const labels = new Map([
    ['images/demo/about/chef.png', { subject: 'people', peopleCount: 1, isGraphic: false }],
    ['images/demo/hero/blob.png', { subject: 'other', peopleCount: 0, isGraphic: true }]
  ])
  const out = unmeasuredFigureSlotsOf({ slots: SLOTS, candidates, labels })
  assert.deepEqual(
    out.slots.map((s) => s.key),
    ['module-1.1']
  )
  assert.equal(out.slots[0].fit.kind, 'cutout')
  assert.equal(out.slots[0].fit.measured, false)
  assert.deepEqual(out.kept.map((k) => k.file).sort(), [
    'images/demo/cta/dog.png',
    'images/demo/hero/blob.png'
  ])
  const plan = planDecor({ contentMap: { slots: out.slots }, brief: { assets: [] } })
  assert.equal(plan.slots.length, 1)
  assert.equal(plan.slots[0].mode, 'off')
  assert.equal(plan.slots[0].step, 2)
})

test("#189 an unmeasured figure takes the owner's clean clear picture (step 1), never a frame: its zone is unknown", () => {
  const candidates = figureCandidatesOf({ slots: SLOTS, never, demo: DEMO })
  const labels = new Map([
    ['images/demo/cta/dog.png', { subject: 'other', peopleCount: 0, isGraphic: false }]
  ])
  const out = unmeasuredFigureSlotsOf({ slots: SLOTS, candidates, labels })
  assert.deepEqual(
    out.slots.map((s) => s.key),
    ['module-2.1']
  )
  const own = {
    id: 'dog-cut',
    kind: 'image',
    width: 900,
    height: 800,
    hasAlpha: true,
    depicts: { id: 'general' }
  }
  const withOwn = planDecor({ contentMap: { slots: out.slots }, brief: { assets: [own] } })
  assert.equal(withOwn.slots[0].mode, 'own')
  assert.equal(withOwn.slots[0].mediaId, 'dog-cut')
  const photo = { key: 'module-2.1', action: 'photo', mediaId: 'shop-1' }
  const noOwn = planDecor({ contentMap: { slots: out.slots }, brief: { assets: [] }, fill: [photo] })
  assert.equal(noOwn.slots[0].mode, 'off', 'never framed without a measured zone')
})
