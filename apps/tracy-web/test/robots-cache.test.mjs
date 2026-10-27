/**
 * #888 item 4 (R-1): a published site's `robots.txt` must never be kept by a cache.
 *
 * Which `robots.txt` a stranger gets depends on the site's publish state: a draft gets the bar's own
 * Disallow-all text (`bar/route.js` `ROBOTS`, `no-store`), a published site gets its CMS's file,
 * proxied. The CMS decides how long its file may be kept — measured 11/10/2026 on dev: Joomla's
 * Apache sends no `cache-control` (Cloudflare then caches `.txt` and adds `max-age=14400`), EmDash
 * sends `public, max-age=86400` — so after an unpublish the edge kept handing out the published file
 * for 4 to 24 hours (`cf-cache-status: HIT`). Cloudflare honours an origin `no-store` (a draft's
 * robots.txt answers `cf-cache-status: BYPASS`), so the fix is the origin's: the proxied answer says
 * `no-store` whatever the CMS said. No database: `proxySite` is driven directly.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { proxySite } from '../src/bar/site-proxy.js'

const ROBOTS_TEXT = 'User-agent: *\nAllow: /\nSitemap: https://shop.tracy.test/sitemap.xml\n'

/** One request through `proxySite`, the CMS's answer carrying `upstreamHeaders`. */
function ask(path, upstreamHeaders, { method = 'GET', canonical = null, host = 'shop.tracy.test' } = {}) {
  return proxySite(new Request(`https://${host}${path}`, { method }), new URL(`http://shop-web-1${path}`), {
    email: null,
    sameHost: true,
    viewerHost: host,
    viewerProto: 'https',
    publish: 'published',
    variant: canonical ? 'none' : 'managed',
    badgeUrl: 'https://tracy.test/badge.js',
    canonical,
    fetchImpl: async () =>
      new Response(method === 'HEAD' ? null : ROBOTS_TEXT, {
        headers: { 'content-type': 'text/plain; charset=utf-8', ...upstreamHeaders }
      })
  })
}

test('R-1: a published robots.txt the CMS marks public for a day (EmDash) goes out no-store', async () => {
  const res = await ask('/robots.txt', { 'cache-control': 'public, max-age=86400' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(await res.text(), ROBOTS_TEXT, 'the body is the CMS file, unchanged')
})

test('R-1: a published robots.txt with no cache header at all (Joomla/Apache) goes out no-store', async () => {
  const res = await ask('/robots.txt', { 'last-modified': 'Sun, 11 Oct 2026 05:42:48 GMT', etag: '"2fc"' })
  assert.equal(res.headers.get('cache-control'), 'no-store')
  // A validator lets a cache keep the file and revalidate it; nothing of it may be kept.
  assert.equal(res.headers.get('expires'), null)
})

test('R-1: an Expires the CMS sets on robots.txt does not outlive the no-store', async () => {
  const res = await ask('/robots.txt', { expires: 'Thu, 01 Jan 2099 00:00:00 GMT' })
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('expires'), null)
})

test('R-1: a CDN-only lifetime header (read by the edge before Cache-Control) is dropped', async () => {
  const res = await ask('/robots.txt', {
    'cdn-cache-control': 'max-age=86400',
    'cloudflare-cdn-cache-control': 'max-age=86400',
    'surrogate-control': 'max-age=86400'
  })
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.equal(res.headers.get('cdn-cache-control'), null)
  assert.equal(res.headers.get('cloudflare-cdn-cache-control'), null)
  assert.equal(res.headers.get('surrogate-control'), null)
})

test('R-1: HEAD answers the same cache header as GET', async () => {
  const res = await ask('/robots.txt', { 'cache-control': 'max-age=14400' }, { method: 'HEAD' })
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('R-1: on a customer own domain (issue 1037) the projected robots.txt is no-store too', async () => {
  const res = await ask(
    '/robots.txt',
    { 'cache-control': 'public, max-age=86400' },
    { canonical: new URL('https://shop.tracy.test'), host: 'shop.example.com' }
  )
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  assert.match(await res.text(), /Sitemap: https:\/\/shop\.example\.com\/sitemap\.xml/)
})

test('R-1: any other file keeps the cache header the CMS chose', async () => {
  const res = await ask('/style.css', { 'cache-control': 'public, max-age=86400' })
  assert.equal(res.headers.get('cache-control'), 'public, max-age=86400')
})
