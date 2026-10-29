import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planJoomlaContract } from '../src/plan-joomla-contract.mjs'
import { planWordpressContract } from '../src/plan-wordpress-contract.mjs'

for (const [name, offerings] of [
  ['Cedar Bakery', ['Bread', 'Pastries', 'Cakes']],
  ['Willow Dental', ['Checkups', 'Fillings', 'Whitening']]
]) {
  test(`${name}: the writer receives first-visit and offering tab roles with paired bodies`, async () => {
    const slots = Array.from({ length: 4 }, (_, item) =>
      ['title', 'description'].map((field) => ({
        key: `module-7.${item}.${field}`,
        entity: 'module-7',
        type: 'text',
        role: `step.${field}`,
        group: { id: `module-7.step.${item}`, kind: 'step', item },
        label: `Journey / ${field}`,
        maxCharacters: field === 'title' ? 30 : 500,
        sample:
          field === 'title'
            ? `Demo phase ${item}`
            : '((p))Demo training.((/p))((ul))((li))Demo drill((/li))((/ul))'
      }))
    ).flat()
    let seen
    let instructions
    const titles = ['First visit', ...offerings]
    const result = await planJoomlaContract({
      state: { contract: 'fictional/v1', revision: 'before', slots },
      site: { name, about: `${name} offers ${offerings.join(', ')}.`, sourceLanguage: 'en' },
      inventions: 'never',
      offerings: Object.fromEntries(offerings.map((label, i) => [`offering.${i}`, label])),
      generate: async ({ system, input }) => {
        seen = input
        instructions = system
        return {
          values: Object.fromEntries(
            slots.map((s) => [
              s.key,
              s.role === 'step.title'
                ? titles[s.group.item]
                : `((p))Discuss ${titles[s.group.item]}.((/p))((ul))((li))Choose what suits your needs.((/li))((/ul))`
            ])
          ),
          pending: []
        }
      }
    })
    assert.equal(seen.slots[0].journey.kind, 'offering-tabs')
    assert.equal(seen.slots[0].journey.subject, 'first-visit')
    assert.equal(seen.slots[2].journey.offering, offerings[0])
    assert.deepEqual(seen.slots[2].journey, seen.slots[3].journey)
    assert.match(instructions, /intro.*bullet/i)
    assert.match(instructions, /prices.*guarantees.*durations/i)
    assert.equal(result.changes['module-7.1.title'], offerings[0])
    assert.match(result.changes['module-7.1.description'], new RegExp(offerings[0]))
    assert.match(result.changes['module-7.1.description'], /\(\(ul\)\).*\(\(li\)\)/)
  })
}

test('numbered process groups receive ordered stages rather than offering tabs', async () => {
  const slots = [0, 1, 2].flatMap((item) =>
    ['index', 'title', 'description'].map((field) => ({
      key: `stage.${item}.${field}`,
      entity: 'module-8',
      type: 'text',
      role: `step.${field}`,
      group: { id: `journey.step.${item}`, kind: 'step', item },
      maxCharacters: 100,
      sample: field === 'index' ? String(item + 1) : 'Demo stage',
      label: `Journey / ${field}`
    }))
  )
  let seen
  await planJoomlaContract({
    state: { contract: 'fictional/v1', slots },
    site: { name: 'Cedar Bakery', about: 'Choose, order and collect bread.' },
    generate: async ({ input }) => {
      seen = input
      return { values: {}, pending: slots.map((s) => s.key) }
    }
  })
  assert.equal(seen.slots[1].journey.kind, 'process')
  assert.equal(seen.slots[1].journey.position, 1)
  assert.equal(seen.slots[7].journey.position, 3)
})

test('WordPress step roles receive the same editorial process task', async () => {
  const slots = ['title', 'description'].map((field) => ({
    key: `stage.${field}`,
    entity: 'post-7',
    type: 'text',
    role: `step.${field}`,
    group: { id: 'post-7.step.0', item: 0, kind: 'step' },
    sample: 'Demo phase',
    maxCharacters: 80
  }))
  let seen
  await planWordpressContract({
    contentMap: { slots },
    site: { name: 'Cedar Bakery', about: 'Choose, order and collect bread.' },
    generate: async ({ input }) => {
      seen = input
      return { values: {}, pending: slots.map((s) => s.key) }
    }
  })
  assert.equal(seen.slots[0].journey.kind, 'process')
  assert.deepEqual(seen.slots[0].journey, seen.slots[1].journey)
})
