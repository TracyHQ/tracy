/**
 * The site chip links to the live address `/api/sites` hands back, and to nothing else: no address
 * built from the key, no link for a site without an accepted seat, no non-web scheme.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { siteLinks } from '../src/client/site-links.ts'

test('an accepted seat links to the address the server gave', () => {
  const links = siteLinks({
    sites: [
      { siteKey: 'kinetic.vn', status: 'accepted', copyUrl: 'https://kinetic.vn/' },
      { siteKey: 'javoyara.tracy.test', status: 'accepted', copyUrl: 'http://javoyara.tracy.test:8080/' }
    ]
  })
  assert.equal(links.get('kinetic.vn'), 'https://kinetic.vn/')
  assert.equal(links.get('javoyara.tracy.test'), 'http://javoyara.tracy.test:8080/')
})

test('no link without an accepted seat, an address, or a web scheme', () => {
  const links = siteLinks({
    sites: [
      { siteKey: 'pending.vn', status: 'requested', copyUrl: null },
      { siteKey: 'invited.vn', status: 'invited', copyUrl: 'https://invited.vn/' },
      { siteKey: 'noaddr.vn', status: 'accepted', copyUrl: null },
      { siteKey: 'bad.vn', status: 'accepted', copyUrl: 'javascript:alert(1)' },
      { siteKey: 'junk.vn', status: 'accepted', copyUrl: 'not a url' }
    ]
  })
  assert.equal(links.size, 0)
})

test('a missing or broken answer gives no links', () => {
  for (const body of [null, undefined, {}, { sites: 'x' }, { sites: [null, 1, {}] }]) {
    assert.equal(siteLinks(body).size, 0)
  }
})
