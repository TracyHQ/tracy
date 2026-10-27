// The pinned pair at the head of the Design system tab's grid (Akemi, 13/10/2026, D2): the card of the system the
// site wears first, with its badge, and the synthetic Template default card right after it; when nothing is worn, the
// Template default card is first and carries the Wearing now badge. Under a narrowing filter the pair steps aside.
//
//   node --test packages/design/tracy-design-inspiration/test/design-system-pinned.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pinnedGridOf } from '../src/client/design-system-pinned.mjs'

const row = (id, name) => ({
  id,
  kind: 'refero',
  name,
  description: '',
  group: '',
  theme: null,
  image: null,
  fonts: [],
  colors: [],
  ok: true
})
const ROWS = [row('refero:a', 'Alpha'), row('refero:b', 'Beta'), row('refero:c', 'Gamma')]

test('nothing worn: the rows keep their order and the Template default card is first, wearing the badge', () => {
  const grid = pinnedGridOf({ rows: ROWS, worn: null, filtered: false })
  assert.deepEqual(
    grid.rows.map((r) => r.id),
    ['refero:a', 'refero:b', 'refero:c']
  )
  assert.equal(grid.wornFirst, false)
  assert.deepEqual(grid.defaultCard, { badge: 'wearing', at: 0 })
})

test('a worn library system is moved to the front, and the Template default card sits right after it', () => {
  const grid = pinnedGridOf({
    rows: ROWS,
    worn: { id: null, slotId: 'refero:b', name: 'Beta' },
    filtered: false
  })
  assert.deepEqual(
    grid.rows.map((r) => r.id),
    ['refero:b', 'refero:a', 'refero:c']
  )
  assert.equal(grid.wornFirst, true)
  assert.deepEqual(grid.defaultCard, { badge: 'default', at: 1 })
})

test('a worn system outside the library gets a card of its own at the front, marked synthetic', () => {
  const grid = pinnedGridOf({
    rows: ROWS,
    worn: { id: 'airbnb', slotId: 'od:airbnb', name: 'Airbnb' },
    filtered: false
  })
  assert.equal(grid.rows.length, 4)
  assert.equal(grid.rows[0].id, 'od:airbnb')
  assert.equal(grid.rows[0].name, 'Airbnb')
  assert.equal(grid.rows[0].synthetic, true)
  assert.equal(grid.wornFirst, true)
  assert.deepEqual(grid.defaultCard, { badge: 'default', at: 1 })
})

test('under a narrowing filter the pair follows the filter: no Template default card, the worn card only when it matched', () => {
  const worn = { id: null, slotId: 'refero:b', name: 'Beta' }
  const matched = pinnedGridOf({ rows: [ROWS[2], ROWS[1]], worn, filtered: true })
  assert.deepEqual(
    matched.rows.map((r) => r.id),
    ['refero:b', 'refero:c'],
    'the worn card stays first when the filter let it through'
  )
  assert.equal(matched.wornFirst, true)
  assert.equal(matched.defaultCard, null)

  const missed = pinnedGridOf({ rows: [ROWS[0]], worn, filtered: true })
  assert.deepEqual(
    missed.rows.map((r) => r.id),
    ['refero:a'],
    'a worn card the filter dropped is not brought back, nor is one made up'
  )
  assert.equal(missed.wornFirst, false)
  assert.equal(missed.defaultCard, null)
})

test('while the library is still asked, nothing is pinned', () => {
  assert.deepEqual(pinnedGridOf({ rows: null, worn: null, filtered: false }), {
    rows: null,
    wornFirst: false,
    defaultCard: null
  })
})
