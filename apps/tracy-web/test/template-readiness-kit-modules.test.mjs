// The kit modules check of the readiness verdict (kit-modules-check.js): a module the demo prints on a kit page, which the
// kit holds no block for, is named before a site is built. Invented kits and maps, then the committed JA Diner 1.0.8 kit,
// whose template-kit 3.1.0 build missed the T3 Section<N> modules of its home and about pages.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { defaultContracts } from '../src/lib/contracts.js'
import { KIT_MODULES_CHECK, modulesMissingFromKit } from '../src/lib/template-readiness/kit-modules-check.js'
import { latestPin, releaseOfPin } from '../src/lib/template-readiness/pinned-release.js'

const kit = {
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2'] } },
    { id: 'page-about', path: '/about', blocks: { 1440: ['block-2'] } }
  ],
  blocks: [
    { id: 'block-1', source: { entity: 'module-1', position: 'section-top', contains: ['module-5'] } },
    { id: 'block-2', source: { entity: 'module-2', position: 'footer-1' } }
  ]
}
const assigned = (entity, position, extra = {}) => ({
  entity,
  position,
  published: '1',
  access: '1',
  ...extra
})
const map = {
  slots: ['module-1', 'module-2', 'module-3', 'module-4', 'module-5', 'module-6', 'module-7', 'module-8'].map(
    (entity, i) => ({
      key: `${entity}.0`,
      entity,
      sample: `words ${i}`
    })
  ),
  pages: [
    {
      route: 'home',
      assignedModules: [
        assigned('module-1', 'section-top'),
        assigned('module-5', 'section-top'),
        assigned('module-3', 'section-top'),
        // Unpublished, members only, or in a position the kit holds no block in: not judged here.
        assigned('module-6', 'section-top', { published: '0' }),
        assigned('module-7', 'section-top', { access: '2' }),
        assigned('module-8', 'footer')
      ]
    },
    {
      route: 'about',
      assignedModules: [assigned('module-3', 'section-top'), assigned('module-4', 'footer-1')]
    },
    // A page the kit does not hold is not judged.
    { route: 'legacy', assignedModules: [assigned('module-9', 'section-top')] }
  ]
}

test('a published public module with slots, in a position the kit knows, on a kit page, with no block, is named', () => {
  assert.deepEqual(modulesMissingFromKit(kit, map), [
    { module: 'module-3', position: 'section-top', pages: ['/', '/about'] },
    { module: 'module-4', position: 'footer-1', pages: ['/about'] }
  ])
  // A module with no slot of the map has nothing the flow could write: not named.
  const bare = { ...map, slots: map.slots.filter((s) => s.entity !== 'module-4') }
  assert.deepEqual(
    modulesMissingFromKit(kit, bare).map((m) => m.module),
    ['module-3']
  )
})

test('the rebuilt JA Diner 1.0.8 kit holds a block for every module its pages print (#667): nothing to flag', () => {
  // Before #667 the committed kit missed the home features and the chef modules (module-95, 104, 115-117, 121-123); the
  // check that names missing modules is held by the invented case above.
  const contracts = defaultContracts()
  assert.equal(KIT_MODULES_CHECK.judge(releaseOfPin(latestPin('ja-diner'), contracts), { contracts }), null)
})

test('the latest JA Boxing kit holds a block for every module its pages print: nothing to flag', () => {
  const contracts = defaultContracts()
  assert.equal(KIT_MODULES_CHECK.judge(releaseOfPin(latestPin('ja-boxing'), contracts), { contracts }), null)
})
