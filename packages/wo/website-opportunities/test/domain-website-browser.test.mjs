import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crawlWebsiteWithFallback, needsBrowser } from '../domain/website-browser.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const html = (body) => `<!doctype html><html><head><title>Bistro</title></head><body>${body}</body></html>`
const rendered = html(
  '<h1>Bistro</h1><p>' +
    'Fresh pasta every day. '.repeat(30) +
    '</p><img src="/a.jpg" alt="pasta"><img src="/b.jpg"><a href="https://www.instagram.com/bistro/">ig</a>'
)

function fakeFetch({ site, apify }) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url: String(url), auth: init.headers?.authorization })
    if (String(url).startsWith('https://api.apify.com/')) return apify()
    return site(String(url))
  }
  fn.calls = calls
  return fn
}

test('needsBrowser: a JS shell or a 403 wants the browser; a real page or a dead domain does not', () => {
  assert.equal(needsBrowser({ status: 'complete', pages: [{ text: 'Loading…' }], media: [] }), true)
  assert.equal(needsBrowser({ status: 'failed', reason: 'login_required' }), true)
  assert.equal(needsBrowser({ status: 'failed', reason: 'not_found' }), false)
  assert.equal(needsBrowser({ status: 'complete', pages: [{ text: 'x'.repeat(500) }], media: [] }), false)
})

test('a JS-only site is re-read through the Apify browser with the token in a header', async () => {
  const fetch = fakeFetch({
    site: (u) =>
      u.endsWith('sitemap.xml')
        ? new Response('', { status: 404 })
        : new Response(html('<div id="root"></div>'), {
            status: 200,
            headers: { 'content-type': 'text/html' }
          }),
    apify: () =>
      new Response(
        JSON.stringify([
          {
            url: 'https://bistro.example/',
            html: rendered,
            text: 'Fresh pasta',
            metadata: { title: 'Bistro' }
          }
        ]),
        { status: 201 }
      )
  })
  const r = await crawlWebsiteWithFallback(
    'https://bistro.example/',
    { maxPages: 5 },
    { fetch, resolve, token: 'apify_api_secret' }
  )
  assert.equal(r.provider, 'apify-browser')
  assert.equal(r.status, 'complete')
  assert.equal(r.media.length, 2)
  assert.equal(r.socials.instagram, 'https://www.instagram.com/bistro/')
  assert.equal(r.fallbackFrom.status, 'complete')
  const call = fetch.calls.find((c) => c.url.startsWith('https://api.apify.com/'))
  assert.equal(call.auth, 'Bearer apify_api_secret')
  assert.ok(!call.url.includes('apify_api_secret'))
})

test('without a token the plain result stands; a failed browser run is reported, not hidden', async () => {
  const site = (u) =>
    u.endsWith('sitemap.xml')
      ? new Response('', { status: 404 })
      : new Response(html('<div></div>'), { status: 200, headers: { 'content-type': 'text/html' } })
  const noToken = await crawlWebsiteWithFallback(
    'https://bistro.example/',
    {},
    {
      fetch: fakeFetch({
        site,
        apify: () => {
          throw new Error('must not call')
        }
      }),
      resolve
    }
  )
  assert.equal(noToken.provider, undefined)
  const quota = await crawlWebsiteWithFallback(
    'https://bistro.example/',
    {},
    { fetch: fakeFetch({ site, apify: () => new Response('{}', { status: 402 }) }), resolve, token: 't' }
  )
  assert.deepEqual(quota.fallback, { provider: 'apify-browser', status: 'failed', reason: 'quota' })
})
