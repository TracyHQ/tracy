import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planSlotFill } from '../domain/slot-fill.mjs'
import { slotFillPins } from '../domain/contract-copy-pins.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { leftDemoText } from '../domain/demo-left-text.mjs'

for (const [name, offering] of [
  ['Cedar Bakery', 'Sourdough loaves'],
  ['Willow Dental', 'Dental checkups']
]) {
  test(`${name}: process titles and bodies belong to the brief copy writer, never neutral pins`, () => {
    const slotRoles = {
      groups: [{ id: 'journey.0', entityKind: 'step', itemIndex: 0 }],
      bindings: ['title', 'description'].map((field) => ({
        slotKey: `journey.${field}`,
        groupId: 'journey.0',
        role: `step.${field}`,
        mode: 'copy'
      }))
    }
    const profile = {
      business: { name: { id: 'name', value: name } },
      offerings: [{ id: 'offering', value: { kind: 'service', name: offering } }]
    }
    const plan = planSlotFill({
      slotRoles,
      profile,
      assessment: [
        { factId: 'name', status: 'accepted' },
        { factId: 'offering', status: 'accepted' }
      ],
      neutralFor
    })
    assert.deepEqual(
      plan.writes.map((w) => w.state),
      ['composed', 'composed']
    )
    assert.ok(plan.writes.every((w) => w.factRefs.includes('offering')))
    const pins = slotFillPins({
      plan,
      contentMap: { slots: slotRoles.bindings.map((b) => ({ key: b.slotKey, type: 'text' })) }
    })
    assert.deepEqual(pins.pins, {})
  })
}

test('a journey section with only its heading and decorative business image left is hidden whole', () => {
  const slots = [
    {
      key: 'module-20.heading',
      entity: 'module-20',
      type: 'text',
      role: 'editorial.heading',
      sample: 'Your journey'
    },
    {
      key: 'module-20.photo',
      entity: 'module-20',
      type: 'image',
      role: 'business.hero_image',
      group: { id: 'module-20.business', kind: 'business', item: 0 }
    },
    ...['title', 'description'].map((field) => ({
      key: `module-20.${field}`,
      entity: 'module-20',
      type: 'text',
      role: `step.${field}`,
      group: { id: 'module-20.step.0', kind: 'step', item: 0 },
      sample: 'Demo boxing stage',
      column: 'params',
      jsonPath: ['journey', `journey[${field}]`, 0]
    }))
  ]
  const result = leftDemoText({
    slots,
    written: { 'module-20.title': 'Step' },
    asked: slots.filter((s) => s.role?.startsWith('step.')).map((s) => s.key),
    ownText: 'Cedar Bakery'
  })
  assert.equal(result.hides[0].how, 'entity')
  assert.equal(result.hides[0].entity, 'module-20')
})

for (const name of ['Cedar Bakery', 'Willow Dental']) {
  test(`${name}: a placeholder title or a missing body removes the entire step, retaining a complete sibling`, () => {
    const slots = [0, 1, 2].flatMap((item) =>
      ['title', 'description'].map((field) => ({
        key: `module-9.${item}.${field}`,
        entity: 'module-9',
        column: 'params',
        type: 'text',
        role: `step.${field}`,
        group: { id: `module-9.step.${item}`, kind: 'step', item },
        sample: field === 'title' ? 'Demo training' : 'Practice the old boxing drills.',
        jsonPath: ['journey', `journey[${field}]`, item],
        maxCharacters: 400
      }))
    )
    const written = {
      'module-9.0.title': 'First visit',
      'module-9.0.description': 'Tell us what you need and discuss the next step.',
      'module-9.1.title': 'STEP',
      'module-9.1.description': '',
      'module-9.2.title': 'Discuss your needs'
    }
    const result = leftDemoText({ slots, written, asked: slots.map((s) => s.key), ownText: name })
    assert.deepEqual(
      result.hides.map((h) => h.index),
      [1, 2]
    )
    assert.ok(!result.hides.some((h) => h.index === 0))
    assert.deepEqual(result.values, {})
  })
}
