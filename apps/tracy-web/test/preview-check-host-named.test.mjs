/**
 * The probes open a stand's pages under a host name (`scripts/preview-check/host-named.mjs`): YouTube refuses some
 * videos inside a page served from a bare IP (JA Spa 1.0.7 /our-spa, PREV-1 18/10/2026), which no customer site is.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hostNamedAddress } from '../scripts/preview-check/host-named.mjs'

test('a loopback stand is read at localhost, same port, path and query', () => {
  assert.equal(hostNamedAddress('http://127.0.0.1:52986/'), 'http://localhost:52986/')
  assert.equal(hostNamedAddress('http://127.0.0.1:52986'), 'http://localhost:52986/')
  assert.equal(hostNamedAddress('http://127.0.0.5:9000/our-spa?x=1'), 'http://localhost:9000/our-spa?x=1')
  assert.equal(hostNamedAddress('http://[::1]:52986/'), 'http://localhost:52986/')
})

test('an address that already has a host name, or a non-loopback IP, is left as it is', () => {
  for (const a of [
    'http://localhost:52986/',
    'https://ja-spa-joomla.tracy.site/',
    'http://spa-review.tracy.test:51710/',
    'http://10.0.0.2:52986/',
    'http://127.0.0.1.example.com/'
  ])
    assert.equal(hostNamedAddress(a), a)
})
