#!/usr/bin/env node
/**
 * Where the host half of the import calls Tracy back (artifacts, component credential).
 *
 * The browser's address is the wrong answer inside a container: locally it is
 * `tracy.test:51710`, the HOST publish of tracy-web, and nothing listens on 51710 inside
 * tracy-dsh — the import died at `reading_content` with `TypeError: fetch failed` (measured
 * 14/09). The dsh's own `MCP_TRACY_ORIGIN` is the answer the site tools already use.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { callbackOrigin } from '../src/host/callback-origin.mjs'

test('the configured origin wins over the browser address', () => {
  assert.equal(
    callbackOrigin({
      configured: 'http://tracy-web:8080',
      forwardedHost: 'tracy.test:51710',
      forwardedProto: 'http'
    }),
    'http://tracy-web:8080'
  )
})

test('a trailing slash on the configured origin is dropped — callers append /api/…', () => {
  assert.equal(
    callbackOrigin({ configured: 'https://cowork.tracy.ai/', forwardedHost: 'x' }),
    'https://cowork.tracy.ai'
  )
})

test('nothing configured: the forwarded host, as before', () => {
  assert.equal(
    callbackOrigin({ configured: '', forwardedHost: 'cowork.tracy.site', forwardedProto: 'https' }),
    'https://cowork.tracy.site'
  )
})

test('no forwarded host: the raw Host header, proto defaults to http', () => {
  assert.equal(callbackOrigin({ configured: null, host: '127.0.0.1:51700' }), 'http://127.0.0.1:51700')
})

test('nothing at all: empty, so the caller answers NOT_SIGNED_IN rather than dialling nowhere', () => {
  assert.equal(callbackOrigin({}), '')
})

test('a configured value that is not an http(s) URL is ignored, not dialled', () => {
  assert.equal(
    callbackOrigin({
      configured: 'tracy-web:8080',
      forwardedHost: 'cowork.tracy.ai',
      forwardedProto: 'https'
    }),
    'https://cowork.tracy.ai'
  )
})
