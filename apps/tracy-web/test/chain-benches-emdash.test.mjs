// The chain's benches on an EmDash kit (dev 25/11/2026, the first EmDash Diner chain builds): the brand step names the
// design system slot contract of the EmDash release (`slotNamesOfKit`, brand-step/design-slot-of-kit.js), and the picture
// bench opens the kit it lists (`openKitWithMap`, site-pictures/kit-with-map.js). Before, the brand step looked for a Joomla
// slot of the product name and found none, and the picture bench listed the kit but read the profiles alone to open it.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { slotNamesOfKit } from '../src/brand-step/design-slot-of-kit.js'
import { quickstartContractOf } from '../src/lib/ds-slot.js'
import { openKit, readableKits } from '../src/lib/template-kit-source.js'
import { openKitWithMap } from '../src/site-pictures/kit-with-map.js'

const EMDASH = 'tracy-diner/emdash-0.x/0.1.4'

test('the brand step names the EmDash release slot contract, never a Joomla one of the same product', () => {
  const asked = []
  const slotOf = (q) => (asked.push(q), quickstartContractOf(q))
  assert.deepEqual(slotNamesOfKit(openKit(EMDASH).doc, slotOf), {
    names: ['emdash-tracy-diner'],
    problem: null
  })
  assert.deepEqual(asked, [{ platform: 'emdash', tag: 'tracy-diner/emdash-0.x', version: '0.1.4' }])
  // A release with no slot contract has no names, and says why.
  const none = slotNamesOfKit({ contract: 'tracy-nowhere/emdash-0.x/0.1.0' }, quickstartContractOf)
  assert.deepEqual(none.names, [])
  assert.match(none.problem, /no EmDash template contract for tracy-nowhere\/emdash-0\.x/)
  // Joomla kits keep their own names.
  assert.deepEqual(slotNamesOfKit(openKit('ja-diner/j6/1.0.8').doc, quickstartContractOf).names, [
    'joomla-ja-diner-modes',
    'joomla-ja-diner'
  ])
})

test('the picture bench opens every kit it lists, the EmDash one with its content map', () => {
  assert.ok(readableKits().some((k) => k.ref === EMDASH))
  const kit = openKitWithMap(EMDASH)
  assert.equal(kit.ref, EMDASH)
  assert.equal(kit.platform, 'emdash')
  assert.ok(kit.doc.contentMap.slots.some((s) => s.key === 'slideshow.slideshow.items[0].image'))
  assert.equal(openKitWithMap('ja-diner/j6/1.0.8').platform, 'joomla')
})
