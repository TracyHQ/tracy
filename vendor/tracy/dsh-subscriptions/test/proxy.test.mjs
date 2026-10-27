import test from 'node:test'
import assert from 'node:assert/strict'
import { parseProxyUrl, proxyFetch, pickFetch } from '../lib/proxy.js'

test('parseProxyUrl accepts http/https/socks5', () => {
  for (const raw of ['http://p:8080', 'https://p:8443', 'socks5://p:1080']) {
    const p = parseProxyUrl(raw)
    assert.ok(p, raw)
    assert.equal(p.scheme, raw.split(':')[0])
    assert.equal(p.host, 'p')
  }
})

test('parseProxyUrl defaults ports', () => {
  assert.equal(parseProxyUrl('http://p').port, 80)
  assert.equal(parseProxyUrl('https://p').port, 443)
  assert.equal(parseProxyUrl('socks5://p').port, 1080)
})

test('parseProxyUrl extracts auth', () => {
  const p = parseProxyUrl('http://user:pw@p:8080')
  assert.deepEqual(p.auth, { username: 'user', password: 'pw' })
})

test('parseProxyUrl rejects garbage', () => {
  for (const raw of ['', null, 'not a url', 'ftp://p', 'http://']) {
    assert.equal(parseProxyUrl(raw), null, String(raw))
  }
})

test('proxyFetch returns null for empty/invalid, function for valid', async () => {
  assert.equal(proxyFetch(''), null)
  assert.equal(proxyFetch(null), null)
  assert.equal(proxyFetch('ftp://p'), null)
  const f = await proxyFetch('http://127.0.0.1:1')
  assert.equal(typeof f, 'function')
})

test('proxyFetch caches dispatcher per URL', async () => {
  const a = await proxyFetch('http://cachehost:1')
  const b = await proxyFetch('http://cachehost:1')
  assert.equal(a, b)
})

test('pickFetch prefers fetchForRef, then fetchImpl, then global', () => {
  assert.equal(pickFetch({ fetchForRef: () => 'A', fetchImpl: 'B' }, 'r'), 'A')
  assert.equal(pickFetch({ fetchForRef: () => null, fetchImpl: 'B' }, 'r'), 'B')
  assert.equal(pickFetch({}, 'r'), globalThis.fetch)
  assert.equal(pickFetch(undefined, 'r'), globalThis.fetch)
})
