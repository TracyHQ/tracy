import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addressOf, nameOf, pagesOf, shotFailed } from '../shoot-pages.mjs'

test('every kit page once, the front page first', () => {
  const kit = { pages: [{ path: '/about-us' }, { path: '/' }, { path: '/j-pages/login' }] }
  assert.deepEqual(pagesOf(kit), ['/', '/about-us', '/j-pages/login'])
  assert.deepEqual(pagesOf({}), ['/'])
})

test('a kit page is opened at the address WordPress serves it at, never through a redirect', () => {
  const base = 'http://demo.example'
  assert.equal(addressOf('/', base), 'http://demo.example/')
  assert.equal(addressOf('/about-us', base), 'http://demo.example/about-us/')
  assert.equal(addressOf('/j-pages/login', base), 'http://demo.example/j-pages/login/')
})

test('file names are the Joomla script ones', () => {
  assert.equal(nameOf('/'), 'home')
  assert.equal(nameOf('/category/our-blog/news'), 'category-our-blog-news')
})

test('a shot counts only with a file and the answer 200', () => {
  assert.equal(shotFailed({ file: 'a.png', status: 200 }), false)
  assert.equal(shotFailed({ file: 'a.png', status: 404 }), true)
  assert.equal(shotFailed({ file: null, status: null }), true)
})
