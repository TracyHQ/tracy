import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanReferrer, nextWithRef, referrerOf } from '../src/lib/referrer.js'
import { safePath } from '../src/lib/safe-path.js'

const ORIGIN = 'https://cowork.tracy.test'

test('a referrer is an absolute http(s) URL of at most 512 characters, without credentials or fragment', () => {
  assert.equal(cleanReferrer('https://www.joomlart.com/'), 'https://www.joomlart.com/')
  // Only scheme, host and path are kept: a query can carry a visitor's own tokens or search terms.
  assert.equal(
    cleanReferrer('https://user:pass@www.joomlart.com/joomla/templates/ja-kinetic?x=1&token=abc#demo'),
    'https://www.joomlart.com/joomla/templates/ja-kinetic'
  )
  assert.equal(cleanReferrer('http://example.com/a'), 'http://example.com/a')
  for (const bad of [
    'javascript:alert(1)',
    'data:text/html,<b>x</b>',
    'ftp://example.com/x',
    '/relative/path',
    'garbage',
    '',
    `https://example.com/${'a'.repeat(600)}`,
    null,
    undefined,
    42
  ])
    assert.equal(cleanReferrer(bad), null, String(bad).slice(0, 40))
})

test('an explicit ref wins over the Referer header; a bad ref falls back; our own origin is not a referrer', () => {
  const page = 'https://www.joomlart.com/joomla/templates/ja-kinetic'
  assert.equal(referrerOf({ ref: page, referer: 'https://www.joomlart.com/', origin: ORIGIN }), page)
  assert.equal(
    referrerOf({ ref: 'javascript:alert(1)', referer: 'https://www.joomlart.com/', origin: ORIGIN }),
    'https://www.joomlart.com/'
  )
  assert.equal(
    referrerOf({ ref: null, referer: 'https://www.joomlart.com/', origin: ORIGIN }),
    'https://www.joomlart.com/'
  )
  assert.equal(referrerOf({ ref: null, referer: `${ORIGIN}/login`, origin: ORIGIN }), null)
  assert.equal(referrerOf({ ref: `${ORIGIN}/new`, referer: null, origin: ORIGIN }), null)
  // Tracy's own host on another scheme or port is still Tracy, not an outside page.
  assert.equal(referrerOf({ ref: 'http://cowork.tracy.test/x', referer: null, origin: ORIGIN }), null)
  assert.equal(
    referrerOf({ ref: null, referer: 'https://cowork.tracy.test:8443/login', origin: ORIGIN }),
    null
  )
  assert.equal(referrerOf({ ref: null, referer: null, origin: ORIGIN }), null)
})

test('ref rides on a template landing next only, and the result is still a same-origin path', () => {
  const ref = 'https://www.joomlart.com/'
  const next = safePath('/new?template=ja-kinetic&platform=joomla', ORIGIN)
  const carried = nextWithRef(next, ref, ORIGIN)
  const url = new URL(carried)
  assert.equal(url.origin, ORIGIN)
  assert.equal(url.pathname, '/new')
  assert.equal(url.searchParams.get('template'), 'ja-kinetic')
  assert.equal(url.searchParams.get('ref'), ref)
  assert.equal(safePath(carried, ORIGIN), carried)
  // A page that does not forward it, or no ref at all: next is untouched.
  assert.equal(nextWithRef(safePath('/agent', ORIGIN), ref, ORIGIN), `${ORIGIN}/agent`)
  assert.equal(nextWithRef(next, null, ORIGIN), next)
  // A ref already on next is replaced, never duplicated.
  const twice = new URL(nextWithRef(carried, 'https://example.com/x', ORIGIN))
  assert.deepEqual(twice.searchParams.getAll('ref'), ['https://example.com/x'])
})
