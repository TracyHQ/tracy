// The cut-out ladder of a brief build (spec TracyHQ/tracy#189): a transparent figure over a ground takes the owner's own
// transparent picture, else is taken off, else (its own column left empty beside the text) shows an owner photo in a frame.
// Every layout is a fictional template: a figure right over a backdrop photo, a figure in a column left or right of the
// text, a small centred figure, a figure overlapping the section edges, a figure hidden on phones. Two fictional trades:
// a bakery (a chef cut-out) and a dental clinic (a person cut-out). Never drawn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cutOutStepOf, cutOutZoneOf } from '../domain/cutout-ladder.mjs'
import { DECOR_REASONS, planDecor } from '../domain/decor-plan.mjs'

const boxes = (desktop, phone) => ({
  desktop: { width: desktop[0], height: desktop[1] },
  ...(phone ? { phone: { width: phone[0], height: phone[1] } } : {})
})
const figure = (key, desktop, phone = [358, 300], label = 'Intro / figure') => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  role: 'business.hero_image',
  label,
  sample: `images/demo/figure-${key}.png`,
  fit: {
    measured: true,
    kind: 'cutout',
    transparent: true,
    boxes: boxes(desktop, phone),
    source: { width: 900, height: 900 }
  }
})
const backdrop = (key, label = 'Intro / image-bg') => ({
  key,
  entity: key.split('.')[0],
  type: 'image',
  role: 'business.hero_image',
  label,
  sample: 'images/demo/bg.jpg',
  fit: { measured: true, kind: 'photo', boxes: boxes([1440, 900], [390, 640]) }
})
const words = (key, role = 'claim.heading') => ({
  key,
  entity: key.split('.')[0],
  type: 'text',
  role,
  sample: 'Demo'
})
const photo = (id, depicts = 'general', extra = {}) => ({
  id,
  kind: 'image',
  width: 1600,
  height: 1200,
  depicts: { id: depicts },
  isGraphic: false,
  ...extra
})

const BAKERY = {
  reading: {
    services: [
      { id: 'svc-cakes', label: 'Celebration Cakes' },
      { id: 'svc-bread', label: 'Sourdough Bread' }
    ]
  }
}
const DENTAL = {
  reading: {
    services: [
      { id: 'svc-white', label: 'Teeth Whitening' },
      { id: 'svc-check', label: 'Check-ups' }
    ]
  }
}

// Five fictional layouts, each one section (an entity) with its words.
const LAYOUTS = {
  // A chef or a person standing right over the hero's own background photo, wider than a column.
  heroRightOverBackdrop: [
    backdrop('module-1.0'),
    figure('module-1.1', [1175, 960], [390, 319]),
    words('module-1.2')
  ],
  // A figure in its own column left of the text, no backdrop.
  columnLeft: [
    figure('module-2.0', [704, 733], [358, 373]),
    words('module-2.1'),
    words('module-2.2', 'editorial.paragraph')
  ],
  // A small figure centred above a call-to-action band's words: taking it off leaves a gap, not an empty area.
  smallCentred: [figure('module-3.0', [220, 220], [160, 160]), words('module-3.1')],
  // A figure overlapping the section edges (box wider than the viewport), over a band painted by CSS.
  overlappingEdges: [figure('module-4.0', [1600, 700], [390, 171]), words('module-4.1')],
  // A figure in a column right of an about block's words, hidden on phones (no phone box).
  columnRightHiddenOnPhone: [words('module-5.0'), figure('module-5.1', [620, 640], null)]
}

const at = (slots, key) => slots.find((s) => s.key === key)

test('the zone of a cut-out is read from its measured box and its own section', () => {
  const hero = cutOutZoneOf(at(LAYOUTS.heroRightOverBackdrop, 'module-1.1'), LAYOUTS.heroRightOverBackdrop)
  assert.equal(hero.backdrop, true)
  assert.equal(hero.emptyWhenOff, false, 'the background photo carries a hero once its figure goes')
  const column = cutOutZoneOf(at(LAYOUTS.columnLeft, 'module-2.0'), LAYOUTS.columnLeft)
  assert.equal(column.emptyWhenOff, true, 'a column beside the words is left empty')
  assert.equal(cutOutZoneOf(at(LAYOUTS.smallCentred, 'module-3.0'), LAYOUTS.smallCentred).emptyWhenOff, false)
  assert.equal(
    cutOutZoneOf(at(LAYOUTS.overlappingEdges, 'module-4.0'), LAYOUTS.overlappingEdges).emptyWhenOff,
    false
  )
  const right = cutOutZoneOf(
    at(LAYOUTS.columnRightHiddenOnPhone, 'module-5.1'),
    LAYOUTS.columnRightHiddenOnPhone
  )
  assert.equal(right.emptyWhenOff, true)
  assert.equal(right.phone, false)
  // A figure with no measured box is never framed: its zone is unknown.
  const bare = { ...figure('module-6.0', [1, 1]), fit: { kind: 'cutout' } }
  assert.equal(cutOutZoneOf(bare, [bare, words('module-6.1')]).emptyWhenOff, false)
})

for (const [trade, brief, offering] of [
  ['bakery', BAKERY, 'svc-cakes'],
  ['dental clinic', DENTAL, 'svc-white']
]) {
  test(`a ${trade}: step 2 by default, step 3 only where a column is left empty, never a drawing`, () => {
    for (const [name, slots] of Object.entries(LAYOUTS)) {
      const cut = slots.find((s) => s.fit?.kind === 'cutout')
      // The fill plan chose one ordinary photo for every cut-out slot.
      const fill = [{ key: cut.key, action: 'photo', mediaId: 'room-1', crop: { strategy: 'centre' } }]
      const plan = planDecor({ contentMap: { slots }, brief: { ...brief, assets: [photo('room-1')] }, fill })
      const d = plan.slots.find((s) => s.key === cut.key)
      assert.equal(d.action, 'cut-out', name)
      assert.ok(DECOR_REASONS[d.reason], `${name}: ${d.reason}`)
      assert.notEqual(d.mode, 'object', `${name}: never drawn`)
      assert.equal(d.referenceIds, undefined, `${name}: nothing to draw from`)
      const framed = name === 'columnLeft' || name === 'columnRightHiddenOnPhone'
      assert.equal(d.mode, framed ? 'framed' : 'off', name)
      assert.equal(d.step, framed ? 3 : 2, name)
      if (framed) assert.equal(d.mediaId, 'room-1')
      else assert.equal(d.mediaId, undefined)
    }
  })

  test(`a ${trade}: no photo the fill plan chose leaves even an empty column off (step 2)`, () => {
    const slots = LAYOUTS.columnLeft
    const d = planDecor({ contentMap: { slots }, brief: { ...brief, assets: [photo('room-1')] } }).slots[0]
    assert.equal(d.mode, 'off')
  })

  test(`a ${trade}: the owner's own transparent picture of the subject wins on every layout (step 1)`, () => {
    for (const [name, slots] of Object.entries(LAYOUTS)) {
      const assets = [
        photo('room-1'),
        photo('logo-1', 'general', { hasAlpha: true, isLogo: true }),
        photo('poster-1', offering, { hasAlpha: true, hasTextOverlay: true }),
        photo('tiny-1', offering, { hasAlpha: true, width: 120, height: 90 }),
        photo('own-1', offering, { hasAlpha: true })
      ]
      const d = planDecor({ contentMap: { slots }, brief: { ...brief, assets } }).slots.find(
        (s) => s.decor === 'cut-out'
      )
      assert.equal(d.mode, 'own', name)
      assert.equal(d.step, 1)
      assert.equal(d.mediaId, 'own-1', `${name}: never the logo, a worded picture or one too small`)
    }
  })
}

test('a transparent picture of another offering is not the subject of the section', () => {
  const slots = LAYOUTS.columnLeft
  const step = cutOutStepOf({
    slot: slots[0],
    slots,
    assets: [photo('own-2', 'svc-bread', { hasAlpha: true })],
    subject: { kind: 'offering', id: 'svc-cakes' }
  })
  assert.equal(step.mode, 'off')
})

test('a figure taken off is hidden by the head block wherever it is shown, so it leaves no box', async () => {
  const { leftoverHeadBlock, hiddenByHeadBlock } = await import('../domain/outside-map.mjs')
  const block = leftoverHeadBlock({ pictures: ['/images/tracy-content/clear.png'] })
  assert.match(block, /img\[src\*="images\/tracy-content\/clear\.png"\]\{display:none !important\}/)
  assert.ok(hiddenByHeadBlock(block).has('images/tracy-content/clear.png'))
  assert.equal(leftoverHeadBlock({ pictures: [] }), '')
})
