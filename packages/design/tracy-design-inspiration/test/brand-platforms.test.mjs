/**
 * Where a brand (`brand:<host>`) offers "Create with <CMS>": only on a CMS where a published
 * quickstart can wear it (Lee, 29/09/2026). Read off the template rows Tracy serves, never a list.
 *
 *   node --test packages/design/tracy-design-inspiration/test/brand-platforms.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BRAND_BUILDS, brandPlatforms, withBrandPlatforms } from '../src/host/templates.mjs'

const card = (id, platforms, design) => ({ id, platforms, design })

test('a catalogue-styled quickstart on WordPress lets a brand be built on WordPress, and only there', () => {
  // tracy-base: one card, a Joomla and a WordPress archive, wearing the catalogue's Apple.
  const rows = [card('tracy-base', ['joomla', 'wordpress'], { id: 'apple', source: 'catalog' })]
  // Joomla T4 compiles its tokens, so the Joomla archive of the same card cannot wear a brand.
  assert.deepEqual(brandPlatforms(rows), ['wordpress'])
})

test('no quickstart that can wear a brand: no platform, never a guess', () => {
  assert.deepEqual(brandPlatforms([]), [], 'Tracy publishes nothing, or cannot be reached')
  // A look of its own (Tracy Business) or none named says nothing about wearing a brand.
  assert.deepEqual(
    brandPlatforms([
      card('tracy-business', ['joomla', 'wordpress'], { id: 'tracy-business', source: 'quickstart' }),
      card('ja-kinetic', ['joomla'], null),
      card('odd', 'wordpress', { id: 'apple', source: 'catalog' })
    ]),
    []
  )
  // A catalogue look on a CMS whose build cannot wear a brand.
  assert.deepEqual(brandPlatforms([card('t', ['joomla', 'emdash'], { id: 'apple', source: 'catalog' })]), [])
})

test('the platforms follow the build order, once each', () => {
  const rows = [
    card('a', ['wordpress'], { id: 'apple', source: 'catalog' }),
    card('b', ['wordpress', 'joomla'], { id: 'airbnb', source: 'catalog' })
  ]
  assert.deepEqual(brandPlatforms(rows), ['wordpress'])
  assert.ok(BRAND_BUILDS.includes('wordpress'))
  assert.ok(Object.isFrozen(BRAND_BUILDS))
})

test('withBrandPlatforms stamps every brand row, each with its own list', () => {
  const brands = [
    { id: 'brand:acme.example', platforms: [] },
    { id: 'brand:stripe.com', platforms: [] }
  ]
  const rows = [card('tracy-base', ['wordpress'], { id: 'apple', source: 'catalog' })]
  const out = withBrandPlatforms(brands, rows)
  assert.deepEqual(
    out.map((b) => b.platforms),
    [['wordpress'], ['wordpress']]
  )
  assert.notEqual(out[0].platforms, out[1].platforms)
  assert.deepEqual(brands[0].platforms, [], 'the input rows are not changed')
  assert.deepEqual(
    withBrandPlatforms(brands, []).map((b) => b.platforms),
    [[], []]
  )
})
