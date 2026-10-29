// The sharpness gate's hook in the fill plan (spec TracyHQ/tracy#189): a photo the gate measured too soft for a slot is
// refused there as `unsharp`, the next photo of the ranking takes the slot, and with none left the slot is drawn, never
// extended from the refused photo. Two fictional trades: a bakery and a dental clinic. Fixtures are fictional.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planFill } from '../domain/fill-plan.mjs'
import { planDrawings } from '../domain/fill-draw.mjs'

const card = (n) => ({ id: `module-2.item.${n}`, item: n, kind: 'service' })
const MAP = {
  roleVocabularyVersion: 'place-content-roles/3',
  entities: [{ key: 'module-2', kind: 'module' }],
  slots: [
    {
      key: 'module-2.0',
      entity: 'module-2',
      type: 'text',
      sample: 'Demo Card',
      label: 'x',
      role: 'offering.name',
      group: card(0)
    },
    {
      key: 'module-2.1',
      entity: 'module-2',
      type: 'image',
      sample: 'images/demo/cards/wide.jpg',
      label: 'module-2.1',
      role: 'offering.image',
      group: card(0),
      fit: {
        measured: true,
        kind: 'photo',
        replace: 'photo',
        source: { width: 1128, height: 484, format: 'jpg' },
        boxes: { desktop: { width: 704, height: 302 } }
      }
    }
  ],
  pages: [{ route: 'home', assignedModules: [{ entity: 'module-2' }] }]
}
const photo = (id, [width, height]) => ({
  id,
  kind: 'image',
  width,
  height,
  depicts: { id: 'svc-1', evidence: { via: 'vision' } },
  portraitOf: null,
  isGraphic: false,
  faceBoxes: [],
  source: 'website',
  uploaderRole: 'owner'
})
const TRADES = {
  bakery: { business: { trade: 'food', subTrade: 'bakery' }, offering: 'Sourdough Classes' },
  dental: { business: { trade: 'health', subTrade: 'dental clinic' }, offering: 'Teeth Whitening' }
}

for (const [trade, t] of Object.entries(TRADES)) {
  const brief = (assets) => ({
    business: t.business,
    reading: { services: [{ id: 'svc-1', label: t.offering }] },
    assets
  })
  const cardNames = { 'module-2.item.0': t.offering }
  const card1 = (fill) => fill.slots.find((d) => d.key === 'module-2.1')

  test(`#189 ${trade}: an unsharp photo is refused for its slot and the next one of the ranking takes it`, () => {
    const assets = [photo('big-soft', [1631, 700]), photo('small-crisp', [1200, 515])]
    const first = planFill({ contentMap: MAP, brief: brief(assets), cardNames, perSlot: true })
    assert.equal(card1(first).mediaId, 'big-soft')
    const unsharp = new Map([['module-2.1', new Set(['big-soft'])]])
    const again = planFill({ contentMap: MAP, brief: brief(assets), cardNames, perSlot: true, unsharp })
    assert.equal(card1(again).action, 'photo')
    assert.equal(card1(again).mediaId, 'small-crisp')
  })

  test(`#189 ${trade}: with every photo unsharp the slot is drawn as a scene, not extended from a refused photo`, () => {
    const assets = [photo('soft-1', [1631, 700])]
    const unsharp = new Map([['module-2.1', new Set(['soft-1'])]])
    const fill = planFill({ contentMap: MAP, brief: brief(assets), cardNames, perSlot: true, unsharp })
    assert.equal(card1(fill).action, 'keep')
    assert.equal(card1(fill).refused.unsharp, 1)
    const drawn = planDrawings({ fill, contentMap: MAP, brief: brief(assets), unsharp })
    const d = drawn.slots.find((s) => s.key === 'module-2.1')
    assert.equal(d.action, 'draw')
    assert.equal(drawn.drawings[0].mode, 'scene')
    assert.deepEqual(
      drawn.drawings[0].referenceIds,
      ['soft-1'],
      'a refused photo still shows what the place looks like'
    )
    // Without the gate's refusal the same photo would have been extended.
    assert.equal(planDrawings({ fill, contentMap: MAP, brief: brief(assets) }).drawings[0].mode, 'outpaint')
  })
}
