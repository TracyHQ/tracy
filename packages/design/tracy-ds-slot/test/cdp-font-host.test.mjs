import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { cachedFont, fontFetchUrl } from '../scripts/cdp.mjs'

const dirs = []
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
function cacheDir() {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-font-host-'))
  dirs.push(dir)
  return dir
}
function recorder(answer) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return answer(url, init)
  }
  return { calls, fetchImpl }
}
const GSTATIC = 'https://fonts.gstatic.com/s/inter/v13/inter.woff2'

test('fontFetchUrl keeps a fonts.gstatic.com address as it was', () => {
  const url =
    'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
  assert.equal(fontFetchUrl(url), url)
})

test('fontFetchUrl refuses every other host', () => {
  for (const url of [
    'https://fonts.gstatic.com.example.net/s/inter.woff2',
    'https://fonts.gstatic.com@example.net/s/inter.woff2',
    'http://fonts.gstatic.com/s/inter.woff2',
    'https://example.net/https://fonts.gstatic.com/s/inter.woff2',
    'http://169.254.169.254/latest/meta-data/',
    '',
    undefined
  ])
    assert.equal(fontFetchUrl(url), null, String(url))
})

test('fontFetchUrl keeps the fetch on fonts.gstatic.com whatever the path holds', () => {
  for (const url of [
    'https://fonts.gstatic.com/@example.net/x',
    'https://fonts.gstatic.com//example.net/x'
  ]) {
    assert.equal(new URL(fontFetchUrl(url)).host, 'fonts.gstatic.com', url)
  }
})

test('cachedFont never fetches for another host', async () => {
  const dir = cacheDir()
  const { calls, fetchImpl } = recorder(() => new Response('x'))
  for (const url of [
    'http://169.254.169.254/latest/meta-data/',
    'https://fonts.gstatic.com.example.net/x.woff2'
  ])
    assert.equal(await cachedFont(url, { fetchImpl, dir }), null, url)
  assert.deepEqual(calls, [])
  assert.deepEqual(readdirSync(dir), [])
})

test('cachedFont fetches a gstatic font once, without following redirects, then serves it from disk', async () => {
  const dir = cacheDir()
  const { calls, fetchImpl } = recorder(
    () => new Response(Buffer.from('woff2-bytes'), { headers: { 'content-type': 'font/woff2' } })
  )
  const first = await cachedFont(GSTATIC, { fetchImpl, dir })
  assert.equal(first?.body.toString(), 'woff2-bytes')
  assert.equal(first?.type, 'font/woff2')
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).host, 'fonts.gstatic.com')
  assert.equal(calls[0].init?.redirect, 'error')
  const second = await cachedFont(GSTATIC, { fetchImpl, dir })
  assert.equal(second?.body.toString(), 'woff2-bytes')
  assert.equal(calls.length, 1)
})

test('cachedFont treats a redirect from fonts.gstatic.com as a miss and caches nothing', async () => {
  const dir = cacheDir()
  // what fetch does with redirect: 'error' when the answer is a 3xx
  const { calls, fetchImpl } = recorder((url, init) => {
    if (init?.redirect === 'error') throw new TypeError('fetch failed: unexpected redirect')
    return new Response('metadata')
  })
  assert.equal(await cachedFont(GSTATIC, { fetchImpl, dir }), null)
  assert.equal(calls.length, 1)
  assert.deepEqual(readdirSync(dir), [])
})

// a dynamic subset address of Google's css2 (/l/font?kit=...&skey=...): the query chooses the bytes
const DYNAMIC = 'https://fonts.gstatic.com/l/font?kit=Wren0Example-Kit_Value&skey=0a1b2c3d4e5f6a7b&v=v19'

test('fontFetchUrl keeps the query of a dynamic subset address byte for byte', () => {
  assert.equal(fontFetchUrl(DYNAMIC), DYNAMIC)
  for (const url of [
    'https://fonts.gstatic.com/l/font?kit=a~b%2Fc&flag',
    'https://fonts.gstatic.com/l/font?text=Wren+Example&kit=x'
  ])
    assert.equal(fontFetchUrl(url), url)
})

test('fontFetchUrl keeps the fetch on fonts.gstatic.com whatever the query holds', () => {
  for (const [url, search] of [
    ['https://fonts.gstatic.com/l/font?kit=x@example.net/y', '?kit=x%40example.net%2Fy'],
    ['https://fonts.gstatic.com/l/font?kit=//example.net/x#frag', '?kit=%2F%2Fexample.net%2Fx'],
    ['https://fonts.gstatic.com/l/font?a=1&b=http://example.net\\x', '?a=1&b=http%3A%2F%2Fexample.net%5Cx']
  ]) {
    const u = new URL(fontFetchUrl(url) ?? '')
    assert.equal(u.host, 'fonts.gstatic.com', url)
    assert.equal(u.pathname, '/l/font', url)
    assert.equal(u.search, search, url)
    assert.equal(u.hash, '', url)
  }
})

test('cachedFont fetches a dynamic subset address with its query and keeps it on disk', async () => {
  const dir = cacheDir()
  const { calls, fetchImpl } = recorder((url) =>
    new URL(url).searchParams.get('kit') === 'Wren0Example-Kit_Value'
      ? new Response(Buffer.from('subset-bytes'), { headers: { 'content-type': 'font/woff2' } })
      : new Response('not found', { status: 404 })
  )
  const font = await cachedFont(DYNAMIC, { fetchImpl, dir })
  assert.equal(font?.body.toString(), 'subset-bytes')
  assert.equal(calls[0].url, DYNAMIC)
  assert.equal((await cachedFont(DYNAMIC, { fetchImpl, dir }))?.body.toString(), 'subset-bytes')
  assert.equal(calls.length, 1)
})

test('cachedFont still fails a dynamic subset address gstatic does not serve, and caches nothing for it', async () => {
  const dir = cacheDir()
  const { calls, fetchImpl } = recorder(() => new Response('not found', { status: 404 }))
  assert.equal(await cachedFont(DYNAMIC, { fetchImpl, dir }), null)
  assert.equal(calls.length, 1)
  assert.deepEqual(readdirSync(dir), [])
})
