import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchLimited } from '../domain/fetch-limited.mjs'

const PUBLIC = [{ address: '93.184.216.34', family: 4 }]
const publicDns = async () => PUBLIC
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function routes(map) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init })
    const r = map[String(url)]
    if (!r) return new Response('not found', { status: 404 })
    return typeof r === 'function' ? r(init) : r()
  }
  return { fetch, calls }
}

test('fetches a public URL and sniffs the MIME from the bytes, not the header', async () => {
  const { fetch, calls } = routes({
    'https://a.test/logo': () => new Response(png, { headers: { 'content-type': 'text/html' } })
  })
  const r = await fetchLimited('https://a.test/logo', { fetch, resolve: publicDns })
  assert.equal(r.status, 200)
  assert.equal(r.mime, 'image/png')
  assert.equal(r.url, 'https://a.test/logo')
  assert.equal(r.truncated, false)
  assert.deepEqual([...r.bytes], [...png])
  assert.equal(calls[0].init.redirect, 'manual')
})

test('textual bodies the sniffer cannot identify keep their declared text type', async () => {
  const { fetch } = routes({
    'https://a.test/sitemap.xml': () =>
      new Response('<?xml version="1.0"?><urlset/>', {
        headers: { 'content-type': 'application/xml; charset=utf-8' }
      }),
    'https://a.test/fake.jpg': () => new Response('just text', { headers: { 'content-type': 'image/jpeg' } })
  })
  assert.equal(
    (await fetchLimited('https://a.test/sitemap.xml', { fetch, resolve: publicDns })).mime,
    'application/xml'
  )
  assert.equal((await fetchLimited('https://a.test/fake.jpg', { fetch, resolve: publicDns })).mime, null)
})

test('follows redirects manually and reports the final URL', async () => {
  const { fetch } = routes({
    'https://a.test/old': () => new Response(null, { status: 301, headers: { location: '/new' } }),
    'https://a.test/new': () => new Response('<html></html>')
  })
  const r = await fetchLimited('https://a.test/old', { fetch, resolve: publicDns })
  assert.equal(r.url, 'https://a.test/new')
  assert.equal(r.mime, 'text/html')
})

test('a redirect to the cloud metadata address is blocked before it is fetched', async () => {
  const { fetch, calls } = routes({
    'https://a.test/x': () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
  })
  await assert.rejects(fetchLimited('https://a.test/x', { fetch, resolve: publicDns }), {
    code: 'URL_BLOCKED'
  })
  assert.equal(calls.length, 1)
})

test('DNS rebinding: the same host answering 127.0.0.1 on the next hop is blocked', async () => {
  let lookups = 0
  const resolve = async () => (lookups++ === 0 ? PUBLIC : [{ address: '127.0.0.1', family: 4 }])
  const { fetch, calls } = routes({
    'https://rebind.test/a': () =>
      new Response(null, { status: 302, headers: { location: 'https://rebind.test/b' } }),
    'https://rebind.test/b': () => new Response('secret')
  })
  await assert.rejects(fetchLimited('https://rebind.test/a', { fetch, resolve }), { code: 'URL_BLOCKED' })
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://rebind.test/a']
  )
})

test('more than five redirects fail with TOO_MANY_REDIRECTS', async () => {
  const fetch = async (url) => new Response(null, { status: 302, headers: { location: `${url}x` } })
  await assert.rejects(fetchLimited('https://a.test/r', { fetch, resolve: publicDns }), {
    code: 'TOO_MANY_REDIRECTS'
  })
})

test('a body larger than maxBytes is cut and marked truncated', async () => {
  const big = new Uint8Array(10_000).fill(65)
  const { fetch } = routes({ 'https://a.test/big': () => new Response(big) })
  const r = await fetchLimited('https://a.test/big', { fetch, resolve: publicDns, maxBytes: 1000 })
  assert.equal(r.bytes.length, 1000)
  assert.equal(r.truncated, true)
})

test('a server that never answers times out', async () => {
  const fetch = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason))
    })
  await assert.rejects(fetchLimited('https://slow.test/', { fetch, resolve: publicDns, timeoutMs: 30 }), {
    code: 'TIMEOUT'
  })
})

test('accept filters the sniffed MIME', async () => {
  const { fetch } = routes({ 'https://a.test/page': () => new Response('<html></html>') })
  await assert.rejects(
    fetchLimited('https://a.test/page', { fetch, resolve: publicDns, accept: ['image/*', 'video/*'] }),
    { code: 'MIME_REJECTED' }
  )
})

test('non-2xx statuses are returned, not thrown', async () => {
  const { fetch } = routes({})
  const r = await fetchLimited('https://a.test/missing', { fetch, resolve: publicDns })
  assert.equal(r.status, 404)
})
