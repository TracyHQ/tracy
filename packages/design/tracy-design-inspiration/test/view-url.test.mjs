import assert from 'node:assert/strict'
import test from 'node:test'

import { searchWithView, viewFromSearch } from '../src/client/view-url.mjs'

test('an address without a filter opens the whole library', () => {
  assert.deepEqual(viewFromSearch(''), { cat: [], brand: [], open: null })
  assert.deepEqual(viewFromSearch(undefined), { cat: [], brand: [], open: null })
  assert.deepEqual(viewFromSearch('?domain=joomlart.com'), { cat: [], brand: [], open: null })
})

test('categories and picked inspirations come back as they were written', () => {
  assert.deepEqual(viewFromSearch('?cat=Community'), { cat: ['Community'], brand: [], open: null })
  assert.deepEqual(viewFromSearch('?cat=Community,Editorial %C2%B7 Studio'), {
    cat: ['Community', 'Editorial · Studio'],
    brand: [],
    open: null
  })
  assert.deepEqual(viewFromSearch('?brand=airbnb,brand:joomlart.com'), {
    cat: [],
    brand: ['airbnb', 'brand:joomlart.com'],
    open: null
  })
})

test('empty pieces are dropped rather than becoming an unmatchable category', () => {
  assert.deepEqual(viewFromSearch('?cat=,,Community,'), { cat: ['Community'], brand: [], open: null })
  assert.deepEqual(viewFromSearch('?cat='), { cat: [], brand: [], open: null })
})

test('a filter and its address are the same thing, both ways round', () => {
  for (const view of [
    { cat: ['Community'], brand: [], open: null },
    { cat: ['Editorial · Studio', 'AI & LLM'], brand: ['airbnb'], open: null },
    { cat: [], brand: ['brand:joomlart.com'], open: null },
    { cat: [], brand: [], open: 'clay' },
    { cat: ['Community'], brand: [], open: 'brand:zingnews.vn' }
  ]) {
    assert.deepEqual(viewFromSearch(searchWithView('', view)), view)
  }
})

test('nothing chosen leaves no query at all', () => {
  assert.equal(searchWithView('', { cat: [], brand: [], open: null }), '')
  assert.equal(searchWithView('?cat=Community', { cat: [], brand: [], open: null }), '')
})

test('every other parameter survives — `domain` is how a shared link carries the site', () => {
  assert.equal(
    searchWithView('?domain=joomlart.com', { cat: ['Community'], brand: [], open: null }),
    '?domain=joomlart.com&cat=Community'
  )
  assert.deepEqual(viewFromSearch('?domain=x.com&cat=Community'), {
    cat: ['Community'],
    brand: [],
    open: null
  })
})

test('the retired `?source=community` switch is dropped, not carried along', () => {
  assert.equal(
    searchWithView('?source=community', { cat: ['Community'], brand: [], open: null }),
    '?cat=Community'
  )
  assert.equal(searchWithView('?source=community', { cat: [], brand: [], open: null }), '')
})

test('the open preview is a parameter of its own, and blank is the same as absent', () => {
  assert.equal(viewFromSearch('?open=clay').open, 'clay')
  assert.equal(viewFromSearch('?open=brand:zingnews.vn').open, 'brand:zingnews.vn')
  assert.equal(viewFromSearch('?open=').open, null)
  assert.equal(viewFromSearch('?open=%20%20').open, null)
  assert.equal(viewFromSearch('').open, null)
  assert.equal(searchWithView('', { cat: [], brand: [], open: 'clay' }), '?open=clay')
  assert.equal(
    searchWithView('', { cat: ['Community'], brand: [], open: 'brand:zingnews.vn' }),
    '?cat=Community&open=brand%3Azingnews.vn'
  )
})

test('chosen CMS chips are a parameter of their own, and an address without one keeps its old shape', () => {
  assert.deepEqual(viewFromSearch('?platform=joomla,wordpress'), {
    cat: [],
    brand: [],
    open: null,
    platform: ['joomla', 'wordpress']
  })
  assert.equal('platform' in viewFromSearch('?cat=Community'), false)
  assert.equal('platform' in viewFromSearch('?platform=,'), false)
  assert.equal(
    searchWithView('?domain=x.com', { cat: [], brand: [], open: null, platform: ['emdash'] }),
    '?domain=x.com&platform=emdash'
  )
  assert.equal(searchWithView('?platform=joomla', { cat: [], brand: [], open: null, platform: [] }), '')
  const view = { cat: ['Community'], brand: [], open: 'clay', platform: ['joomla', 'emdash'] }
  assert.deepEqual(viewFromSearch(searchWithView('', view)), view)
})
