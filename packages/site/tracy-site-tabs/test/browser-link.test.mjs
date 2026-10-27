/**
 * The Browser tab on the page's real address (Brian, 27/09 evening): a link that opens a site page
 * in a mode, and the address bar that follows what the tab shows.
 *
 *   node --test packages/site/tracy-site-tabs/test/browser-link.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  browserTargetOf,
  browserTargetOnHost,
  mirroredBrowserSearch,
  readBrowserDeepLink,
  sitePageOf,
  sitePathKey,
  stripBrowserDeepLink
} from '../src/client/browser-link.mjs'

test('readBrowserDeepLink: only open=browser is a request', () => {
  assert.equal(readBrowserDeepLink(''), null)
  assert.equal(readBrowserDeepLink('?page=/services&mode=edit'), null)
  assert.equal(readBrowserDeepLink('?open=my-sites&page=/x'), null)
})

test('readBrowserDeepLink: page and mode, with or without the leading ?', () => {
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=/services&mode=edit'), {
    page: '/services',
    mode: 'edit'
  })
  assert.deepEqual(readBrowserDeepLink('open=browser&page=%2Fservices&mode=interactive'), {
    page: '/services',
    mode: 'interactive'
  })
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=/news?p=2'), { page: '/news?p=2', mode: null })
})

test('readBrowserDeepLink: page defaults to /, and never names another host', () => {
  assert.deepEqual(readBrowserDeepLink('?open=browser'), { page: '/', mode: null })
  assert.deepEqual(readBrowserDeepLink('?open=browser&page='), { page: '/', mode: null })
  // A protocol-relative or absolute address would send the tab off the site.
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=//evil.example/x'), { page: '/', mode: null })
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=https://evil.example/'), { page: '/', mode: null })
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=/\\evil.example'), { page: '/', mode: null })
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=services'), { page: '/', mode: null })
})

test('readBrowserDeepLink: a mode Tracy does not know is no mode', () => {
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=/&mode=comment'), { page: '/', mode: null })
})

test('stripBrowserDeepLink: the three parameters go, everything else stays in place', () => {
  assert.equal(stripBrowserDeepLink('?open=browser&page=/services&mode=edit'), '')
  assert.equal(
    stripBrowserDeepLink('?tab=tracy:team&open=browser&page=/x&site=a.b&mode=edit'),
    '?tab=tracy:team&site=a.b'
  )
  assert.equal(stripBrowserDeepLink(''), '')
  assert.equal(stripBrowserDeepLink('?x=1'), '?x=1')
})

test('browserTargetOf: the page on the site origin, the mode as the Browser tab reads it', () => {
  assert.equal(
    browserTargetOf('http://capiwl1643.tracy.test:8080/', { page: '/services', mode: 'edit' }),
    'http://capiwl1643.tracy.test:8080/services?mode=edit'
  )
  assert.equal(
    browserTargetOf('https://a.tracy.site', { page: '/news?p=2', mode: null }),
    'https://a.tracy.site/news?p=2'
  )
  assert.equal(browserTargetOf('not a url', { page: '/', mode: null }), null)
  assert.equal(browserTargetOf(null, { page: '/', mode: null }), null)
})

test("sitePageOf: the path (and the site's own query) of an address on the site, Tracy's own parameters off", () => {
  const hosts = new Set(['capiwl1643.tracy.test'])
  assert.equal(sitePageOf('http://capiwl1643.tracy.test:8080/services', hosts), '/services')
  assert.equal(sitePageOf('http://capiwl1643.tracy.test:8080/', hosts), '/')
  assert.equal(
    sitePageOf('http://capiwl1643.tracy.test:8080/news?p=2&tracy_preview=pv1.x&mode=edit#top', hosts),
    '/news?p=2'
  )
  // A `mode` that is the site's own stays.
  assert.equal(sitePageOf('http://capiwl1643.tracy.test:8080/list?mode=grid', hosts), '/list?mode=grid')
  assert.equal(sitePageOf('https://example.com/services', hosts), null)
  assert.equal(sitePageOf('', hosts), null)
  assert.equal(sitePageOf(undefined, hosts), null)
})

test('mirroredBrowserSearch: writes open, page and mode after what is already there', () => {
  const hosts = new Set(['a.tracy.test'])
  assert.equal(
    mirroredBrowserSearch('', { url: 'http://a.tracy.test:8080/services', mode: 'edit' }, hosts),
    '?open=browser&page=/services&mode=edit'
  )
  assert.equal(
    mirroredBrowserSearch(
      '?tab=tracy:browser&open=browser&page=/old&mode=edit',
      { url: 'http://a.tracy.test:8080/new?p=2', mode: 'interactive' },
      hosts
    ),
    '?tab=tracy:browser&open=browser&page=/new?p=2&mode=interactive'
  )
})

test('mirroredBrowserSearch: a closed tab, or a page off the site, takes the parameters away', () => {
  const hosts = new Set(['a.tracy.test'])
  assert.equal(mirroredBrowserSearch('?x=1&open=browser&page=/s&mode=edit', null, hosts), '?x=1')
  assert.equal(
    mirroredBrowserSearch(
      '?open=browser&page=/s&mode=edit',
      { url: 'https://example.com/', mode: 'edit' },
      hosts
    ),
    ''
  )
})

test('sitePathKey: only a site session page (/<siteKey>/…) is mirrored', () => {
  assert.equal(sitePathKey('/capiwl1643.tracy.test/s/session-1'), 'capiwl1643.tracy.test')
  assert.equal(sitePathKey('/capiwl1643.tracy.test/'), 'capiwl1643.tracy.test')
  assert.equal(sitePathKey('/new/s/session-1'), null)
  assert.equal(sitePathKey('/'), null)
})

test('readBrowserDeepLink: host= is read as a bare host, and only as one', () => {
  assert.deepEqual(readBrowserDeepLink('?open=browser&page=/cart&host=Shop.Example.com'), {
    page: '/cart',
    mode: null,
    host: 'shop.example.com'
  })
  for (const bad of ['evil.example/x', 'user@evil.example', 'https://evil.example', ''])
    assert.deepEqual(
      readBrowserDeepLink(`?open=browser&page=/&host=${encodeURIComponent(bad)}`),
      { page: '/', mode: null },
      bad
    )
})

test("browserTargetOnHost: a link's host is kept only when it is one of the site's own hosts", () => {
  const hosts = new Set(['shop.localhost', 'shop.example.com'])
  const link = { page: '/cart?x=1#pay', mode: null, host: 'shop.example.com' }
  assert.equal(
    browserTargetOnHost('http://shop.localhost:8080/', link, hosts),
    'http://shop.example.com/cart?x=1#pay'
  )
  assert.equal(
    browserTargetOnHost('http://shop.localhost:8080/', { ...link, host: 'evil.example' }, hosts),
    'http://shop.localhost:8080/cart?x=1#pay'
  )
  // No hosts known: the served address, as before; browserTargetOf never reads host.
  assert.equal(
    browserTargetOnHost('http://shop.localhost:8080/', link, new Set()),
    'http://shop.localhost:8080/cart?x=1#pay'
  )
  assert.equal(
    browserTargetOf('http://shop.localhost:8080/', link),
    'http://shop.localhost:8080/cart?x=1#pay'
  )
})

test('stripBrowserDeepLink: host= goes with the other three', () => {
  assert.equal(stripBrowserDeepLink('?open=browser&page=/cart&host=shop.example.com&keep=1'), '?keep=1')
})
