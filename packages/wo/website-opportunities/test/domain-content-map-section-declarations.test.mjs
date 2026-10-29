// The section declarations a content map may carry (spec TracyHQ/tracy#189, round 9): a listing section's body, a step
// collection's presentation and a label's value, checked with the slot roles. Made-up bakery and dental clinic maps.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkContentMapRoles } from '../domain/content-map-roles.mjs'

const V3 = 'place-content-roles/3'
const g = (id, kind, extra = {}) => ({ id, item: Number(id.split('.').at(-1)) || 0, kind, ...extra })

for (const [trade, name] of [
  ['bakery', 'Sourdough'],
  ['dental clinic', 'Checkup']
]) {
  const map = ({ lists = 'service', presentation = 'offering-tabs', labelOf = 'module-3.1' } = {}) => ({
    roleVocabularyVersion: V3,
    entities: [{ key: 'module-1', kind: 'module', lists }],
    slots: [
      { key: 'module-1.0', entity: 'module-1', type: 'text', role: 'editorial.heading', sample: 'Our range' },
      { key: 'module-2.0', entity: 'module-2', type: 'text', role: 'step.title', sample: name, group: g('module-2.step.0', 'step', { presentation }) },
      { key: 'module-3.0', entity: 'module-3', type: 'text', role: 'editorial.paragraph', sample: 'Call:', group: g('module-3.item.0', 'service'), labelOf },
      { key: 'module-3.1', entity: 'module-3', type: 'text', role: 'contact.phone', sample: '(000) 555-0100', group: g('module-3.item.0', 'service') },
      { key: 'module-3.2', entity: 'module-3', type: 'text', role: 'offering.name', sample: name, group: g('module-3.item.0', 'service') }
    ]
  })

  test(`${trade}: declared right, the section declarations pass`, () => {
    assert.deepEqual(checkContentMapRoles(map()).errors, [])
  })

  test(`${trade}: an unknown body, presentation or label target is an error`, () => {
    assert.match(checkContentMapRoles(map({ lists: 'loaves' })).errors.join('\n'), /lists "loaves"/)
    assert.match(checkContentMapRoles(map({ presentation: 'carousel' })).errors.join('\n'), /presentation "carousel"/)
    assert.match(checkContentMapRoles(map({ labelOf: 'module-9.9' })).errors.join('\n'), /labelOf "module-9.9"/)
  })
}
