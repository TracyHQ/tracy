import assert from 'node:assert/strict'
import test from 'node:test'
import { emdashSlotFillWrites } from '../src/sites/brief-engines/emdash-wo-copy.js'

for (const label of ['Sourdough', 'Dental cleaning']) {
  test(`${label}: EmDash never overwrites a summary with an empty copy pin`, () => {
    const seed = {
      defaultLocale: 'en',
      collections: [{ slug: 'home', fields: [{ slug: 'services_items', type: 'repeater' }] }],
      content: {
        home: [
          { slug: 'home', data: { services_items: [{ title: label, text: `${label} from our team.` }] } }
        ]
      }
    }
    const slot = {
      slotKey: 'home.home.services_items[0].text',
      role: 'offering.summary',
      mode: 'copy',
      factRefs: []
    }
    assert.deepEqual(
      emdashSlotFillWrites({ seed, plan: { writes: [{ ...slot, state: 'empty', value: '' }] } }).writes,
      []
    )
    const sourced = emdashSlotFillWrites({
      seed,
      plan: { writes: [{ ...slot, state: 'sourced', value: `${label} from our team.`, entityId: 'one' }] }
    })
    assert.equal(sourced.writes[0].items.services_items[0].value, `${label} from our team.`)
  })
}
