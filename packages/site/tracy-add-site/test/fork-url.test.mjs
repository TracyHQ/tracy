#!/usr/bin/env node
/**
 * fork-url — validate and normalise the URL a customer pastes as their design reference.
 *
 * Written before the implementation (red → green). Six cases minimum per the plan (C2).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { forkUrlRefusal, normalizeForkUrl } from '../src/client/fork-url.mjs'

// ── forkUrlRefusal ───────────────────────────────────────────────────────────

test('a plain public site is accepted (returns null)', () => {
  assert.equal(forkUrlRefusal('https://www.joomlart.com'), null)
  assert.equal(forkUrlRefusal('http://example.com'), null)
  assert.equal(forkUrlRefusal('stripe.com'), null)
})

test('a URL with no dot in the host is refused as shape', () => {
  assert.equal(forkUrlRefusal('localhost'), 'local')
  assert.equal(forkUrlRefusal('justaplainword'), 'shape')
  assert.equal(forkUrlRefusal('http://nohost'), 'shape')
})

test('an IP literal is refused as local', () => {
  assert.equal(forkUrlRefusal('192.168.1.1'), 'local')
  assert.equal(forkUrlRefusal('http://10.0.0.1'), 'local')
  assert.equal(forkUrlRefusal('127.0.0.1'), 'local')
  assert.equal(forkUrlRefusal('http://172.16.5.3'), 'local')
})

test('localhost and *.local and *.internal are refused as local', () => {
  assert.equal(forkUrlRefusal('localhost'), 'local')
  assert.equal(forkUrlRefusal('http://localhost'), 'local')
  assert.equal(forkUrlRefusal('myapp.local'), 'local')
  assert.equal(forkUrlRefusal('svc.internal'), 'local')
})

test('a tracy.ai lane is refused as tracy', () => {
  assert.equal(forkUrlRefusal('lucaswp.tracy.ai'), 'tracy')
  assert.equal(forkUrlRefusal('https://myblog.tracy.ai'), 'tracy')
  assert.equal(forkUrlRefusal('tracy.ai'), 'tracy')
})

test('a non-http scheme is refused as shape', () => {
  assert.equal(forkUrlRefusal('ftp://example.com'), 'shape')
  assert.equal(forkUrlRefusal('file:///etc/passwd'), 'shape')
})

// ── normalizeForkUrl ─────────────────────────────────────────────────────────

test('https:// URLs pass through (URL constructor normalises the trailing slash)', () => {
  // `new URL('https://www.joomlart.com').href` is 'https://www.joomlart.com/' — the slash is
  // the canonical form. What matters is that the scheme is preserved, not whether the slash is there.
  assert.equal(normalizeForkUrl('https://www.joomlart.com'), 'https://www.joomlart.com/')
})

test('a bare host gets https:// prepended', () => {
  assert.equal(normalizeForkUrl('stripe.com'), 'https://stripe.com/')
})

test('http:// is kept as-is', () => {
  assert.equal(normalizeForkUrl('http://example.com'), 'http://example.com/')
})

test('refused inputs return null', () => {
  assert.equal(normalizeForkUrl('justaplainword'), null)
  assert.equal(normalizeForkUrl('localhost'), null)
  assert.equal(normalizeForkUrl('lucaswp.tracy.ai'), null)
})

test('a URL with a path component is accepted and kept', () => {
  // The customer may paste the URL of a specific page they liked.
  assert.equal(normalizeForkUrl('https://www.joomlart.com/themes/'), 'https://www.joomlart.com/themes/')
})

// ── zone (Task 11) ───────────────────────────────────────────────────────────

test('zone defaults to tracy.ai — production, unchanged from before the parameter existed', () => {
  assert.equal(forkUrlRefusal('lucaswp.tracy.ai'), 'tracy')
  assert.equal(forkUrlRefusal('tracy.ai'), 'tracy')
})

test('a caller passing its own deployment zone refuses THAT zone instead', () => {
  assert.equal(forkUrlRefusal('lucaswp.dev-cowork.tracy.test', 'dev-cowork.tracy.test'), 'tracy')
  assert.equal(forkUrlRefusal('dev-cowork.tracy.test', 'dev-cowork.tracy.test'), 'tracy')
  // A site on production's zone is a perfectly good fork reference on a dev deployment.
  assert.equal(forkUrlRefusal('lucaswp.tracy.ai', 'dev-cowork.tracy.test'), null)
})

test('normalizeForkUrl threads the zone through to forkUrlRefusal', () => {
  assert.equal(normalizeForkUrl('lucaswp.tracy.ai', 'dev-cowork.tracy.test'), 'https://lucaswp.tracy.ai/')
  assert.equal(normalizeForkUrl('lucaswp.dev-cowork.tracy.test', 'dev-cowork.tracy.test'), null)
})
