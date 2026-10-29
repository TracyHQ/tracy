/**
 * A section that lists records it does not hold (an article list) is written for what it lists, not for a figure in its
 * intro (spec TracyHQ/tracy#189, round 9). Fictional sections of a bakery and a dental clinic.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { sectionBodies, sectionShows } from '../src/plan-joomla-contract.mjs'

const slotsOf = (entity, figure) => [
  { key: `${entity}.0`, entity, role: 'editorial.heading', sample: 'Our range' },
  { key: `${entity}.1`, entity, role: 'stat.value', sample: figure, group: { id: `${entity}.stat.0`, item: 0, kind: 'stat_item' } }
]

for (const [trade, figure] of [
  ['bakery', '200 loaves a day'],
  ['dental clinic', '3k smiles']
]) {
  test(`${trade}: a listing section's heading shows what it lists, not the figure in its intro`, () => {
    const slots = slotsOf('module-70', figure)
    assert.deepEqual(sectionShows(slots)(slots[0]), ['stat_item'])
    assert.deepEqual(sectionShows(slots, null, new Map([['module-70', 'service']]))(slots[0]), ['service'])
  })
}

test('the bodies are read from the contract on disk; a contract without the file has none', () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'section-body-'))
  const dir = path.join(dataDir, 'quickstart-contracts', 'demo-bakery', 'j6', '1.0.0')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'content-map.json'),
    JSON.stringify({
      entities: [
        { key: 'module-70', kind: 'module', lists: 'service' },
        { key: 'module-71', kind: 'module' }
      ]
    })
  )
  assert.deepEqual([...sectionBodies(dataDir, 'demo-bakery/j6/1.0.0')], [['module-70', 'service']])
  assert.deepEqual([...sectionBodies(dataDir, 'demo-clinic/j6/1.0.0')], [])
  assert.deepEqual([...sectionBodies(undefined, 'demo-bakery/j6/1.0.0')], [])
  // The plan's own entities win over the disk.
  assert.deepEqual([...sectionBodies(dataDir, 'demo-bakery/j6/1.0.0', [{ key: 'module-72', lists: 'post' }])], [
    ['module-72', 'post']
  ])
})

test('a label slot reaches the writer as the label of its contact detail, told to stand alone', async () => {
  const { planJoomlaContract } = await import('../src/plan-joomla-contract.mjs')
  const slots = [
    { key: 'module-80.0', entity: 'module-80', type: 'text', role: 'editorial.paragraph', label: 'Row / phone-label', sample: 'or CALL:', maxCharacters: 30, labelOf: 'module-80.1' },
    { key: 'module-80.1', entity: 'module-80', type: 'text', role: 'contact.phone', label: 'Row / phone', sample: '(000) 555-0100', maxCharacters: 30 }
  ]
  let seen
  let system
  await planJoomlaContract({
    state: { contract: 'fictional/v1', revision: 'before', slots },
    site: { name: 'Cedar Bakery', about: 'Cedar Bakery bakes bread.', sourceLanguage: 'en' },
    inventions: 'never',
    generate: async (call) => {
      seen = call.input
      system = call.system
      return { values: { 'module-80.0': 'Call:', 'module-80.1': '(000) 555-0100' }, pending: [], invented: [] }
    }
  })
  assert.equal(seen.slots.find((s) => s.key === 'module-80.0').labels, 'phone')
  assert.equal(seen.slots.find((s) => s.key === 'module-80.1').labels, undefined)
  assert.match(system, /"labels" is the short label/)
})
