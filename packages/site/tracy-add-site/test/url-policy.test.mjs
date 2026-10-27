#!/usr/bin/env node
/**
 * The one narrow redirect policy (#172): keep https across a same-host downgrade, and never let a
 * credential ride to a host — or a scheme, or a port — the flow did not start on.
 *
 * These pin the rules the three redirect followers share, in isolation from `fetch`. The
 * end-to-end login flow that exercises them together is in `login-redirect.test.mjs`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  apexWwwPair,
  isSupportedUrl,
  isTrustedHop,
  nextRedirectUrl,
  sameHost,
  secureRetryWebRoot
} from '../src/host/url-policy.mjs'

test('a same-host https→http downgrade is rewritten back to https (the #172 hop)', () => {
  assert.equal(
    nextRedirectUrl('https://example.test/administrator', 'http://example.test/administrator/'),
    'https://example.test/administrator/'
  )
})

test('an ordinary http→https upgrade passes through untouched', () => {
  assert.equal(nextRedirectUrl('http://example.test/', 'https://example.test/'), 'https://example.test/')
})

test('an apex→www move on https passes through untouched', () => {
  assert.equal(
    nextRedirectUrl('https://example.test/', 'https://www.example.test/'),
    'https://www.example.test/'
  )
})

test('a same-host downgrade that also changes the port is refused, not rewritten onto a wrong port', () => {
  // The current origin is https on its default port; the target names http:8080. Blindly flipping
  // the scheme would produce https://example.test:8080 — the target's http port used as an https
  // port. That is another origin, so the hop is refused.
  assert.equal(nextRedirectUrl('https://example.test/a', 'http://example.test:8080/a'), null)
})

test('a same-host downgrade keeps a matching explicit port', () => {
  assert.equal(
    nextRedirectUrl('https://example.test:8443/a', 'http://example.test:8443/a'),
    'https://example.test:8443/a'
  )
})

test('an unsupported scheme or userinfo in Location is refused', () => {
  assert.equal(nextRedirectUrl('https://example.test/', 'javascript:alert(1)'), null)
  assert.equal(nextRedirectUrl('https://example.test/', 'https://user:pass@example.test/'), null)
})

test('a cross-host https→http downgrade is left as http (to be rejected by the trust check)', () => {
  assert.equal(nextRedirectUrl('https://example.test/', 'http://other.test/'), 'http://other.test/')
})

test('sameHost and apexWwwPair', () => {
  assert.equal(sameHost('Example.TEST', 'example.test'), true)
  assert.equal(apexWwwPair('example.test', 'www.example.test'), true)
  assert.equal(apexWwwPair('www.example.test', 'example.test'), true)
  // The dangerous false positive the last-two-labels rule allowed:
  assert.equal(apexWwwPair('alice.co.uk', 'bob.co.uk'), false)
})

test('isSupportedUrl refuses non-http(s) and userinfo', () => {
  assert.equal(isSupportedUrl('https://example.test/'), true)
  assert.equal(isSupportedUrl('http://example.test/'), true)
  assert.equal(isSupportedUrl('ftp://example.test/'), false)
  assert.equal(isSupportedUrl('https://user:pass@example.test/'), false)
  assert.equal(isSupportedUrl('not a url'), false)
})

test('a credential rides same-origin and the apex/www variant, not a different host', () => {
  const anchor = 'https://example.test/administrator'
  assert.equal(isTrustedHop(anchor, 'https://example.test/administrator/'), true)
  assert.equal(isTrustedHop(anchor, 'https://www.example.test/administrator/'), true)
  assert.equal(isTrustedHop(anchor, 'https://untrusted.test/'), false)
  // Same last two labels, different tenant — must NOT be trusted.
  assert.equal(isTrustedHop('https://alice.co.uk/', 'https://bob.co.uk/'), false)
})

test('a credential never rides a downgrade once the flow is https', () => {
  assert.equal(isTrustedHop('https://example.test/', 'http://example.test/'), false)
  // Even if the anchor itself was http, a flow that has reached https may not step back down.
  assert.equal(isTrustedHop('http://example.test/', 'http://example.test/', { secure: true }), false)
})

test('a credential still rides an all-http flow (a genuine local/intranet host)', () => {
  assert.equal(isTrustedHop('http://localhost:8080/', 'http://localhost:8080/wp-admin'), true)
})

test('a changed port is another origin and gets nothing', () => {
  assert.equal(isTrustedHop('https://example.test/', 'https://example.test:8443/'), false)
})

test('an http→https upgrade is trusted (default ports 80→443 are not a "port change")', () => {
  assert.equal(isTrustedHop('http://example.test/', 'https://example.test/'), true)
})

test('secureRetryWebRoot upgrades only the same source identity, never rewrites it', () => {
  // A pasted https webRootUrl for the same host/path the http run used: accepted, normalized.
  assert.equal(
    secureRetryWebRoot('https://example.test/office/', 'http://example.test/office'),
    'https://example.test/office'
  )
  // Not https: no secure intent.
  assert.equal(secureRetryWebRoot('http://example.test/', 'http://example.test/'), null)
  // A different host: refuse rather than move the token's identity.
  assert.equal(secureRetryWebRoot('https://evil.test/', 'http://example.test/'), null)
  // A different path: refuse.
  assert.equal(secureRetryWebRoot('https://example.test/other', 'http://example.test/office'), null)
})
