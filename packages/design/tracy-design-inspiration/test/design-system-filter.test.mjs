// The Design system tab's toolbar: search by name and the Categories list over the library's industries
// (Akemi, 12/10/2026: "the same bar as the Design inspiration gallery").
//
//   node --test packages/design/tracy-design-inspiration/test/design-system-filter.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  categoriesOf,
  countLineOf,
  filterSystems,
  INDUSTRIES,
  industryOf,
  isFiltered,
  NO_FILTER,
  THEMES,
  themeOf,
  themesOf
} from '../src/client/design-system-filter.mjs'
import { en } from '../src/client/strings.ts'

const row = (name, group, description = '') => ({ name, group, description })

const ROWS = [
  row('Stripe', 'Fintech', 'Calm blues'),
  row('Linear', 'Saas', 'Dark precision'),
  row('Mercury', 'Fintech'),
  row('Vercel', 'Devtools'),
  row('Notion', 'Saas'),
  row('Figma', 'Saas'),
  row('Unknown', null),
  row('Weird', 'Health'),
  row('Leftover', 'Other')
]

test('a row is filed under the industry the door sends as its group; none or unknown is Other', () => {
  assert.equal(industryOf(row('a', 'Saas')), 'saas')
  assert.equal(industryOf(row('a', 'Devtools')), 'devtools')
  assert.equal(industryOf(row('a', 'Ai')), 'ai')
  assert.equal(industryOf(row('a', null)), 'other')
  assert.equal(industryOf(row('a', '')), 'other')
  assert.equal(industryOf(row('a', 'Health')), 'other')
})

test('the Categories list: industries present, most first, Other last whatever its count', () => {
  assert.deepEqual(categoriesOf(ROWS), [
    { key: 'saas', count: 3 },
    { key: 'fintech', count: 2 },
    { key: 'devtools', count: 1 },
    { key: 'other', count: 3 }
  ])
  // A tie keeps the catalogue's order.
  assert.deepEqual(
    categoriesOf([row('a', 'Media'), row('b', 'Agency')]).map((c) => c.key),
    ['agency', 'media']
  )
})

test('every industry has an English name, and the count line follows the gallery', () => {
  for (const key of INDUSTRIES) assert.ok(en[`ds.industry_${key}`], key)
  assert.equal(en['ds.industry_ecommerce'], 'E-commerce')
  assert.equal(en['ds.industry_devtools'], 'Dev tools')
  assert.deepEqual(countLineOf(1080, 1080), { key: 'ds.filter.countAll', params: { total: 1080 } })
  assert.deepEqual(countLineOf(37, 1080), { key: 'ds.filter.count', params: { shown: 37, total: 1080 } })
  assert.equal(en['ds.filter.countAll'], 'Showing all {total} design systems')
  assert.equal(en['ds.filter.count'], 'Showing {shown} of {total} design systems')
  // The gallery's own pattern, word for word but the noun.
  assert.equal(en['filter.countAll'].replace('designs', 'design systems'), en['ds.filter.countAll'])
  assert.equal(en['filter.count'].replace('designs', 'design systems'), en['ds.filter.count'])
})

test('search matches the name only, case-folded; ticks are ORed and ANDed with the search', () => {
  const names = (rows) => rows.map((r) => r.name)
  assert.equal(filterSystems(ROWS, NO_FILTER).length, ROWS.length)
  assert.deepEqual(names(filterSystems(ROWS, { query: '  STR ', categories: new Set() })), ['Stripe'])
  // A description is not searched (the gallery searches names).
  assert.deepEqual(filterSystems(ROWS, { query: 'blues', categories: new Set() }), [])
  assert.deepEqual(names(filterSystems(ROWS, { query: '', categories: new Set(['fintech']) })), [
    'Stripe',
    'Mercury'
  ])
  assert.deepEqual(names(filterSystems(ROWS, { query: '', categories: new Set(['fintech', 'devtools']) })), [
    'Stripe',
    'Mercury',
    'Vercel'
  ])
  assert.deepEqual(names(filterSystems(ROWS, { query: 'e', categories: new Set(['saas', 'other']) })), [
    'Linear',
    'Weird',
    'Leftover'
  ])
  assert.deepEqual(names(filterSystems(ROWS, { query: '', categories: new Set(['other']) })), [
    'Unknown',
    'Weird',
    'Leftover'
  ])
})

test('the bar offers Clear only while something narrows the list', () => {
  assert.equal(isFiltered(NO_FILTER), false)
  assert.equal(isFiltered({ query: 'a', categories: new Set() }), true)
  assert.equal(isFiltered({ query: '', categories: new Set(['ai']) }), true)
})

// The Theme menu (Akemi, 12/10/2026): the Refero catalogue's light, dark or mixed, as the library door sends it.
const look = (name, group, theme) => ({ name, group, theme })
const LOOKS = [
  look('Stripe', 'Fintech', 'light'),
  look('Linear', 'Saas', 'dark'),
  look('Mercury', 'Fintech', 'dark'),
  look('Vercel', 'Devtools', 'mixed'),
  look('Notion', 'Saas', 'light'),
  look('Old', 'Saas', null)
]

test('the Theme list: Light, Dark, Mixed in that order with their counts; a row with no theme is in none', () => {
  assert.deepEqual([...THEMES], ['light', 'dark', 'mixed'])
  assert.equal(themeOf(look('a', null, ' Dark ')), 'dark')
  assert.equal(themeOf(look('a', null, 'sepia')), null)
  assert.deepEqual(themesOf(LOOKS), [
    { key: 'light', count: 2 },
    { key: 'dark', count: 2 },
    { key: 'mixed', count: 1 }
  ])
  assert.deepEqual(
    themesOf([look('a', null, 'dark')]),
    [{ key: 'dark', count: 1 }],
    'a theme no row has is not listed'
  )
  assert.deepEqual(themesOf([row('a', null)]), [], 'an older server: no menu')
  assert.equal(en['ds.filter.theme'], 'Theme')
  assert.deepEqual(
    THEMES.map((k) => en[`ds.theme.${k}`]),
    ['Light', 'Dark', 'Mixed']
  )
})

test('themes are ORed among themselves and ANDed with the categories and the search', () => {
  const names = (rows) => rows.map((r) => r.name)
  const f = (query, categories, themes) => ({
    query,
    categories: new Set(categories),
    themes: new Set(themes)
  })
  assert.deepEqual(names(filterSystems(LOOKS, f('', [], ['dark']))), ['Linear', 'Mercury'])
  assert.deepEqual(names(filterSystems(LOOKS, f('', [], ['dark', 'mixed']))), ['Linear', 'Mercury', 'Vercel'])
  assert.deepEqual(names(filterSystems(LOOKS, f('', ['saas'], ['light']))), ['Notion'])
  assert.deepEqual(names(filterSystems(LOOKS, f('mer', [], ['light']))), [])
  assert.equal(
    filterSystems(LOOKS, f('', [], [])).length,
    LOOKS.length,
    'nothing ticked: every row, one without a theme too'
  )
  assert.equal(isFiltered(f('', [], ['mixed'])), true, 'a ticked theme offers Clear')
  assert.equal(isFiltered(NO_FILTER), false)
})
