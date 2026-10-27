#!/usr/bin/env node
import assert from 'node:assert/strict'
/**
 * The webroot on the token path is the site's own, not the one the site key spells.
 *
 * The site key has `www.` stripped, so the token path used to POST to the apex. A site whose
 * canonical host is `www.` answers the apex with a 301, and fetch turns a redirected POST into a
 * GET with no body — the engine sees no token and refuses (joomlart.com, 2026-09-06). Pinned here:
 * a host-only redirect is followed, a path redirect (a language prefix, a landing page) is not,
 * and a site that does not answer keeps the address it was given.
 */
import { test } from 'node:test'

import { resolveWebRoot } from '../src/host/webroot.mjs'

/** A fetch that answers from a table of `url → {status, location}`. */
function fetchFrom(table) {
  const calls = []
  const impl = async (url, init = {}) => {
    calls.push({ url, headers: new Headers(init.headers) })
    const hit = table[url] ?? { status: 200 }
    return {
      status: hit.status,
      headers: {
        get: (name) => (name.toLowerCase() === 'location' ? (hit.location ?? null) : null)
      }
    }
  }
  return { impl, calls }
}

test('an apex that 301s to www resolves to www', async () => {
  const { impl, calls } = fetchFrom({
    'https://joomlart.com/': {
      status: 301,
      location: 'https://www.joomlart.com/'
    }
  })
  assert.equal(
    await resolveWebRoot('https://joomlart.com', impl, { authorization: 'Basic secret' }),
    'https://www.joomlart.com'
  )
  assert.equal(calls[0].headers.get('authorization'), 'Basic secret')
  assert.equal(calls[1].headers.get('authorization'), null)
})

test('a redirect that changes only the scheme is followed too', async () => {
  const { impl, calls } = fetchFrom({
    'http://example.com/': { status: 301, location: 'https://example.com/' }
  })
  assert.equal(
    await resolveWebRoot('http://example.com', impl, { authorization: 'Basic secret' }),
    'https://example.com'
  )
  assert.equal(calls[0].headers.get('authorization'), 'Basic secret')
  assert.equal(calls[1].headers.get('authorization'), null)
})

test('a same-origin redirect keeps the caller credential', async () => {
  const { impl, calls } = fetchFrom({
    'https://example.com/': { status: 301, location: 'https://example.com/?canonical=1' }
  })
  assert.equal(
    await resolveWebRoot('https://example.com', impl, { authorization: 'Basic secret' }),
    'https://example.com'
  )
  assert.equal(calls.length, 2)
  assert.ok(calls.every((call) => call.headers.get('authorization') === 'Basic secret'))
})

test('a redirect that moves the path is not followed — the webroot stays where it was', async () => {
  const { impl } = fetchFrom({
    'https://example.com/': {
      status: 302,
      location: 'https://example.com/en/'
    }
  })
  assert.equal(await resolveWebRoot('https://example.com', impl), 'https://example.com')
})

test('a host redirect followed by a path redirect keeps the host, not the path', async () => {
  const { impl, calls } = fetchFrom({
    'https://example.com/': {
      status: 301,
      location: 'https://www.example.com/'
    },
    'https://www.example.com/': {
      status: 302,
      location: 'https://www.example.com/lander'
    }
  })
  assert.equal(await resolveWebRoot('https://example.com', impl), 'https://www.example.com')
  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.com/', 'https://www.example.com/']
  )
})

test('a webroot under a subpath keeps the subpath, with or without a trailing slash', async () => {
  const { impl } = fetchFrom({
    'https://example.org/office/': {
      status: 301,
      location: 'https://www.example.org/office/'
    }
  })
  assert.equal(await resolveWebRoot('https://example.org/office/', impl), 'https://www.example.org/office')
})

test('a site that answers 200 straight away keeps its address', async () => {
  const { impl } = fetchFrom({})
  assert.equal(await resolveWebRoot('https://example.com/', impl), 'https://example.com')
})

test('an http root that answers 200 stays http — resolving it is NOT a recovery', async () => {
  // A saved http webroot whose http root answers 200 without redirecting to https resolves back to
  // http — so run.ts must not treat this as automatic recovery; the credential can only be
  // recovered from explicit https intent.
  const { impl } = fetchFrom({})
  assert.equal(await resolveWebRoot('http://example.test/', impl), 'http://example.test')
})

test('a site that does not answer at all keeps the address it was given', async () => {
  const impl = async () => {
    throw new TypeError('fetch failed')
  }
  assert.equal(await resolveWebRoot('https://example.com', impl), 'https://example.com')
})

test('a cross-host redirect to a different site is not followed — the token must not be sent there', async () => {
  // The caller POSTs the source token to whatever webroot this returns. A redirect to a stranger's
  // host must not become that address, so it is not followed; the given webroot stands.
  const { impl, calls } = fetchFrom({
    'https://example.test/': { status: 301, location: 'https://evil.test/' }
  })
  assert.equal(await resolveWebRoot('https://example.test', impl), 'https://example.test')
  assert.deepEqual(
    calls.map((call) => call.url),
    ['https://example.test/']
  )
})

test('an https flow is never downgraded to http, not even to its www variant', async () => {
  // A same-site www hop that also drops to http is a downgrade of an origin already served over
  // https. It is refused, and the https address is kept — no silent insecure fallback.
  const { impl } = fetchFrom({
    'https://shop.test/': { status: 301, location: 'http://www.shop.test/' }
  })
  assert.equal(await resolveWebRoot('https://shop.test', impl), 'https://shop.test')
})

test('a redirect loop stops at the last address that answered', async () => {
  const { impl } = fetchFrom({
    'https://a.example.com/': {
      status: 301,
      location: 'https://b.example.com/'
    },
    'https://b.example.com/': {
      status: 301,
      location: 'https://a.example.com/'
    }
  })
  assert.match(await resolveWebRoot('https://a.example.com', impl), /^https:\/\/[ab]\.example\.com$/)
})
