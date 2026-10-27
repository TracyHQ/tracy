import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readWithFirecrawl, readWithJina } from '../domain/website-readers.mjs'
import { capabilityGroup, defaultOrderOf } from '../domain/capabilities.mjs'

const HTML = `<html><head><title>Pho Ba</title><meta name="description" content="Noodles since 1990"></head><body>
  <h1>Pho Ba</h1><p>${'Hand-pulled noodles and slow broth. '.repeat(20)}</p>
  <img src="https://phoba.example/pho.jpg" alt="pho">
  <a href="https://www.instagram.com/phoba/">Instagram</a>
  <a href="https://phoba.example/files/menu.pdf">Our menu</a>
</body></html>`

const reply =
  (body, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('Jina Reader returns the rendered page read like the crawler reads it', async () => {
  let seen
  const fetch = async (url, init) => {
    seen = { url: String(url), headers: init.headers }
    return reply({ code: 200, data: { url: 'https://phoba.example/', title: 'Pho Ba', html: HTML } })()
  }
  const r = await readWithJina('https://phoba.example/', { key: 'jk', fetch })
  assert.equal(seen.url, 'https://r.jina.ai/https://phoba.example/')
  assert.equal(seen.headers['x-return-format'], 'html')
  assert.equal(seen.headers.authorization, 'Bearer jk')
  assert.equal(r.status, 'complete')
  assert.equal(r.provider, 'jina')
  assert.equal(r.profile.name, 'Pho Ba')
  assert.equal(r.socials.instagram, 'https://www.instagram.com/phoba/')
  assert.deepEqual(
    r.menus.map((m) => m.url),
    ['https://phoba.example/files/menu.pdf']
  )
  assert.ok(r.media.some((m) => m.url === 'https://phoba.example/pho.jpg'))
  assert.ok(r.pages[0].text.length > 400)
})

test('Firecrawl scrape returns the same reading of the raw HTML', async () => {
  let body
  const fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.firecrawl.dev/v1/scrape')
    body = JSON.parse(init.body)
    return reply({
      success: true,
      data: { rawHtml: HTML, metadata: { title: 'Pho Ba', sourceURL: 'https://phoba.example/' } }
    })()
  }
  const r = await readWithFirecrawl('https://phoba.example/', { key: 'fk', fetch })
  assert.deepEqual(body.formats, ['rawHtml'])
  assert.equal(r.status, 'complete')
  assert.equal(r.provider, 'firecrawl')
  assert.equal(r.socials.instagram, 'https://www.instagram.com/phoba/')
})

test('both readers report a missing or refused key, a spent quota, an empty page and a failure as the crawler does', async () => {
  for (const read of [readWithJina, readWithFirecrawl]) {
    assert.deepEqual(
      [
        (await read('https://x.example/', { key: '' })).status,
        (await read('https://x.example/', { key: '' })).reason
      ],
      ['blocked', 'credential_missing']
    )
    const r401 = await read('https://x.example/', { key: 'k', fetch: reply({}, 401) })
    assert.deepEqual([r401.status, r401.reason], ['blocked', 'credential_invalid'])
    const r402 = await read('https://x.example/', { key: 'k', fetch: reply({}, 402) })
    assert.deepEqual([r402.status, r402.reason], ['failed', 'quota'])
    const r500 = await read('https://x.example/', { key: 'k', fetch: reply({}, 500) })
    assert.deepEqual([r500.status, r500.reason], ['failed', 'provider_error'])
    const empty = await read('https://x.example/', { key: 'k', fetch: reply({ data: {} }) })
    assert.deepEqual([empty.status, empty.reason], ['failed', 'not_found'])
    const down = await read('https://x.example/', {
      key: 'k',
      fetch: async () => {
        throw new Error('down')
      }
    })
    assert.deepEqual([down.status, down.reason], ['failed', 'network'])
  }
})

test('website content lists only readers research can run, and defaults to all of them: the direct crawl, the Apify browser, Jina, Firecrawl', () => {
  assert.deepEqual(
    capabilityGroup('website-content').providers.map((p) => p.id),
    ['direct', 'apify-browser', 'jina', 'firecrawl']
  )
  assert.deepEqual(defaultOrderOf('website-content', {}), ['direct', 'apify-browser', 'jina', 'firecrawl'])
})

test('/ops shows the four website readers as the default order, undeclared, for the operator to reorder or drop', async () => {
  const { capabilityGroups } = await import('../src/ops/provider-states.js')
  const group = (await capabilityGroups(null, {}, {})).find((g) => g.id === 'website-content')
  assert.deepEqual(
    [group.order, group.declared, group.defaultOrder],
    [
      ['direct', 'apify-browser', 'jina', 'firecrawl'],
      false,
      ['direct', 'apify-browser', 'jina', 'firecrawl']
    ]
  )
})

test('asked for the page itself, both readers give its rendered HTML, for the menu reader to parse', async () => {
  const jina = await readWithJina('https://lr.test/menu', {
    key: 'jk',
    html: true,
    fetch: reply({ data: { url: 'https://lr.test/menu', html: HTML } })
  })
  assert.deepEqual(
    [jina.status, jina.provider, jina.url, jina.html],
    ['complete', 'jina', 'https://lr.test/menu', HTML]
  )
  const fc = await readWithFirecrawl('https://lr.test/menu', {
    key: 'fk',
    html: true,
    fetch: reply({ data: { rawHtml: HTML, metadata: { sourceURL: 'https://lr.test/menu' } } })
  })
  assert.deepEqual([fc.status, fc.provider, fc.html], ['complete', 'firecrawl', HTML])
  // No key: no call.
  let called = false
  const none = await readWithJina('https://lr.test/menu', {
    html: true,
    fetch: async () => {
      called = true
    }
  })
  assert.deepEqual([none.status, none.reason, called], ['blocked', 'credential_missing', false])
})
