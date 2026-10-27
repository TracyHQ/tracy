/**
 * The Design inspiration grid is a shelf of things a site can be made from. A measured brand
 * (`brand:<host>`) is four colours and a borrowed page, not a template, so it never takes a place
 * on that shelf — whichever road it came by (the agent's extract, the public page's domain box,
 * the community shelf).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isBrandCard, templateShelf } from '../src/client/template-shelf.mjs'

test('a brand id is a brand card; a catalog or template id is not', () => {
  assert.equal(isBrandCard({ id: 'brand:kinetic.example' }), true)
  assert.equal(isBrandCard({ id: 'airbnb' }), false)
  assert.equal(isBrandCard({ id: 'ja-kinetic' }), false)
  assert.equal(isBrandCard({}), false)
})

test('the shelf drops every brand card, own, reference or community alike', () => {
  const rows = [
    { id: 'brand:mysite.com', category: 'Your brand' },
    { id: 'brand:kinetic.example', category: 'Reference' },
    { id: 'ja-voyara', category: 'Travel' },
    { id: 'brand:joomlart.com', category: 'Community' },
    { id: 'airbnb', category: 'Travel' }
  ]
  assert.deepEqual(
    templateShelf(rows).map((d) => d.id),
    ['ja-voyara', 'airbnb']
  )
})

test('a list with no brand card comes back in its own order', () => {
  const rows = [{ id: 'b' }, { id: 'a' }, { id: 'c' }]
  assert.deepEqual(templateShelf(rows), rows)
})

test('anything that is not a list is an empty shelf, not a crash', () => {
  assert.deepEqual(templateShelf(undefined), [])
  assert.deepEqual(templateShelf(null), [])
})
