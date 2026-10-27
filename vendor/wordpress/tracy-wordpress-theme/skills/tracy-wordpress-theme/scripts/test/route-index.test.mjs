// The route index of a page group: a page answers to its page-map path and its measured path; the search view is measured
// at `/?s=<term>`, so the query is part of the route — the home page and the search page do not collide.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeIndex, routeKey } from '../lib/route-index.mjs'

const home = { id: 'en-home', path: '/', pagemapPath: '/' }
const search = { id: 'en-search', path: '/?s=steel', pagemapPath: '/search' }

test('route key: the trailing slash goes, the query stays', () => {
  assert.equal(routeKey('/ru/?s=x'), '/ru?s=x')
  assert.equal(routeKey('/team/'), '/team')
  assert.equal(routeKey('/'), '/')
  assert.equal(routeKey('/?s=x'), '/?s=x')
})

test('home and search of one locale index without a collision, and either route resolves to its page', () => {
  const idx = routeIndex([home, search])
  assert.equal(idx.resolve('/'), home)
  assert.equal(idx.resolve('/?s=steel'), search)
  assert.equal(idx.resolve('/search'), search)
  assert.equal(idx.resolve('/search/'), search)
  assert.equal(idx.resolve('/nowhere'), null)
})

test('a query the index does not know is not the home page; on a path with no queried page it is dropped as before', () => {
  const idx = routeIndex([home, search, { id: 'en-about', path: '/about', pagemapPath: '/about' }])
  assert.equal(idx.resolve('/?s=other'), null)
  assert.equal(idx.resolve('/about?utm=1'), idx.byForm.get('/about'))
  // a tracking query is not an identity: it resolves to the page its path names, beside a search page on the same path
  assert.equal(idx.resolve('/?utm_source=x'), home)
  assert.equal(idx.resolve('/?s=steel&utm_source=x'), search)
  assert.equal(idx.resolve('/?utm_source=x&s=other'), null)
})

test('a search view served at its source path indexes at that path with the term', () => {
  const served = { id: 'en-search', path: '/pages/j-pages/smart-search?s=steel', pagemapPath: '/pages/j-pages/smart-search' }
  const idx = routeIndex([home, served])
  assert.equal(idx.resolve('/pages/j-pages/smart-search'), served)
  assert.equal(idx.resolve('/pages/j-pages/smart-search?s=steel'), served)
})

test('duplicate ids and genuinely conflicting routes still fail', () => {
  assert.throws(() => routeIndex([home, { ...search, id: 'en-home' }]), /two pages carry the id en-home/)
  assert.throws(() => routeIndex([home, { id: 'x', path: '/', pagemapPath: '/x' }]), /both answer to \//)
  assert.throws(() => routeIndex([search, { id: 'y', path: '/?s=steel', pagemapPath: '/y' }]), /both answer to \/\?s=steel/)
})

test('parameter order is not identity: two pages on /?s=steel&a=1 and /?a=1&s=steel are one ambiguous route', () => {
  assert.equal(routeKey('/?s=steel&a=1'), routeKey('/?a=1&s=steel'))
  assert.throws(() => routeIndex([{ id: 'x', path: '/?s=steel&a=1', pagemapPath: '/x' }, { id: 'y', path: '/?a=1&s=steel', pagemapPath: '/y' }]), /both answer to/)
  const idx = routeIndex([home, { id: 'x', path: '/?s=steel&a=1', pagemapPath: '/x' }])
  assert.equal(idx.resolve('/?a=1&s=steel'), idx.byForm.get(routeKey('/?s=steel&a=1')))
})
