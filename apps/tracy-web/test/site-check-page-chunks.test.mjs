// How a site's pages go to the host: every path must pass the host's own page-path rule, or the whole call is refused.
// Paths are invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demoQaBody } from '../../tracy-host/src/demo-qa.js'
import { callPages, chunksOf, hostPath } from '../src/site-check/page-chunks.js'

const PATHS = [
  '/',
  '/shop/item one',
  '/team/jo bloggs',
  '/m\u00fcller/menu',
  '/a\\b',
  '/already%20coded/x',
  '/plain/page?x=1#top'
]

test('a path with a space or other unsafe character is sent percent-encoded', () => {
  assert.equal(hostPath('/shop/item one'), '/shop/item%20one')
  assert.equal(hostPath('/m\u00fcller/menu'), '/m%C3%BCller/menu')
  assert.equal(hostPath('/a\\b'), '/a%5Cb')
})

test('a path already encoded or plain is left as it is', () => {
  assert.equal(hostPath('/already%20coded/x'), '/already%20coded/x')
  assert.equal(hostPath('/plain/page?x=1#top'), '/plain/page?x=1#top')
  assert.equal(hostPath('/'), '/')
})

test('every call of a site passes the host request validation', () => {
  for (const chunk of chunksOf(PATHS)) {
    const asked = demoQaBody({ label: 'bench-site', platform: 'joomla', ...callPages(chunk) })
    assert.equal(asked.error, null, asked.error)
  }
})
