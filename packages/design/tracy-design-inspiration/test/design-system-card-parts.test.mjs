// The Design system tab's cards (12/10/2026, the Add site sheet's family): the palette dots, the font the "Aa"
// swatch is drawn in, and which card is marked as the one the site wears.
//
//   node --test packages/design/tracy-design-inspiration/test/design-system-card-parts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fontOf, isWorn, swatchesOf } from '../src/client/design-system-card-parts.mjs'
import { systemOf } from '../src/client/design-system-library.mjs'

test('the library row keeps its palette, and a card draws at most four hex dots, accent first', () => {
  const s = systemOf({
    id: 'refero:a1',
    name: 'Airbnb',
    ok: true,
    colors: ['#FF385C', '#ffffff', 'red', '#ff385c', '#222', '#717171', '#ebebeb']
  })
  assert.deepEqual(swatchesOf(s), ['#ff385c', '#ffffff', '#222', '#717171'])
  assert.deepEqual(swatchesOf(systemOf({ id: 'refero:b', name: 'B', ok: true })), [])
  assert.deepEqual(swatchesOf(null), [])
})

test('the swatch font is the first font in use, or none', () => {
  assert.equal(fontOf({ fonts: [{ use: '' }, { use: ' Inter ' }] }), 'Inter')
  assert.equal(fontOf({ fonts: [] }), null)
  assert.equal(fontOf(undefined), null)
})

test('the worn card matches the slot id or the worn id; nothing worn marks no card', () => {
  assert.equal(isWorn({ id: null, slotId: 'refero:a1' }, 'refero:a1'), true)
  assert.equal(isWorn({ id: 'refero:a1', slotId: 'x' }, 'refero:a1'), true)
  assert.equal(isWorn({ id: null, slotId: 'refero:a1' }, 'refero:b'), false)
  assert.equal(isWorn(null, 'refero:a1'), false)
})
