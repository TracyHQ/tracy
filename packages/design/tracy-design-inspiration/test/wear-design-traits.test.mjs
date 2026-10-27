/**
 * `wearDesignTraits` — a template card that wears a design system takes that system's filter
 * traits (nav, hero) instead of the guesses `templateRows` stamps on every card. `dark` stays the
 * card's own: it says whether the DEMO switches on ?theme=dark, which no design system can answer.
 *
 *   node --test packages/design/tracy-design-inspiration/test/wear-design-traits.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wearDesignTraits } from '../src/host/templates.mjs'

const systems = [
  { id: 'apple', name: 'Apple', category: 'Themed & Unique', nav: 'centered', hero: 'cover', dark: false },
  {
    id: 'airbnb',
    name: 'Airbnb',
    category: 'E-Commerce & Retail',
    nav: 'top-left',
    hero: 'split',
    dark: true
  }
]
const card = (over = {}) => ({
  id: 'tracy-apple',
  name: 'Tracy Apple',
  nav: 'top-left',
  hero: 'split',
  dark: true,
  design: null,
  platforms: ['joomla'],
  ...over
})

test('a card wearing a catalogue system takes that system’s nav and hero, and keeps its own dark', () => {
  const [row] = wearDesignTraits([card({ design: { id: 'apple', source: 'catalog' } })], systems)
  assert.equal(row.nav, 'centered')
  assert.equal(row.hero, 'cover')
  assert.equal(row.dark, true, 'apple’s dark: false is about its fixture, not this demo')
  const [off] = wearDesignTraits(
    [card({ dark: false, design: { id: 'airbnb', source: 'catalog' } })],
    systems
  )
  assert.equal(off.dark, false, 'a demo with no dark mode is not switched on by a system that has one')
  assert.equal(row.id, 'tracy-apple', 'everything else on the row is left alone')
})

test('a card wearing nothing, or a system the catalogue does not list, keeps its own traits', () => {
  const rows = wearDesignTraits(
    [card(), card({ id: 'x', design: { id: 'nowhere', source: 'catalog' } })],
    systems
  )
  assert.deepEqual(
    rows.map((r) => [r.nav, r.hero, r.dark]),
    [
      ['top-left', 'split', true],
      ['top-left', 'split', true]
    ]
  )
})

test('no rows, or no systems, is no work — the same rows back', () => {
  assert.deepEqual(wearDesignTraits([], systems), [])
  const only = [card({ design: { id: 'apple', source: 'catalog' } })]
  assert.deepEqual(wearDesignTraits(only, []), only)
})
