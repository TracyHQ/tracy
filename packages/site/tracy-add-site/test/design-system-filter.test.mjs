// The "Choose a design system" sheet's toolbar: search by name and the Categories list over the library's industries
// (Akemi, 12/10/2026). A port of tracy-design-inspiration's `design-system-filter.mjs`; these cases hold it to the
// same behaviour.
//
//   node --test packages/site/tracy-add-site/test/design-system-filter.test.mjs
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

const row = (name, group) => ({ name, group })
const ROWS = [
  row('Stripe', 'Fintech'),
  row('Linear', 'Saas'),
  row('Mercury', 'Fintech'),
  row('Vercel', 'Devtools'),
  row('Notion', 'Saas'),
  row('Figma', 'Saas'),
  row('Unknown', null),
  row('Weird', 'Health'),
  row('Leftover', 'Other')
]

test('industries come from the group the door sends; none or unknown is Other; Other is listed last', () => {
  assert.equal(industryOf(row('a', 'Ecommerce')), 'ecommerce')
  assert.equal(industryOf(row('a', null)), 'other')
  assert.equal(industryOf(row('a', 'Health')), 'other')
  assert.deepEqual(categoriesOf(ROWS), [
    { key: 'saas', count: 3 },
    { key: 'fintech', count: 2 },
    { key: 'devtools', count: 1 },
    { key: 'other', count: 3 }
  ])
})

test('every industry and count line has an English string', () => {
  for (const key of INDUSTRIES) assert.ok(en[`ds_industry_${key}`], key)
  assert.deepEqual(countLineOf(5, 5), { key: 'ds_filter_count_all', params: { total: 5 } })
  assert.deepEqual(countLineOf(2, 5), { key: 'ds_filter_count', params: { shown: 2, total: 5 } })
  assert.equal(en.ds_filter_count_all, 'Showing all {total} design systems')
  assert.equal(en.ds_filter_count, 'Showing {shown} of {total} design systems')
  assert.equal(en.ds_filter_empty, 'No design systems match')
})

test('search is by name, ticks are ORed, both are ANDed', () => {
  const names = (rows) => rows.map((r) => r.name)
  assert.equal(filterSystems(ROWS, NO_FILTER).length, ROWS.length)
  assert.deepEqual(names(filterSystems(ROWS, { query: ' MER', categories: new Set() })), ['Mercury'])
  assert.deepEqual(names(filterSystems(ROWS, { query: '', categories: new Set(['fintech', 'devtools']) })), [
    'Stripe',
    'Mercury',
    'Vercel'
  ])
  assert.deepEqual(names(filterSystems(ROWS, { query: 'i', categories: new Set(['saas']) })), [
    'Linear',
    'Notion',
    'Figma'
  ])
  assert.equal(isFiltered(NO_FILTER), false)
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
  assert.equal(en['ds_filter_theme'], 'Theme')
  assert.deepEqual(
    THEMES.map((k) => en[`ds_theme_${k}`]),
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
