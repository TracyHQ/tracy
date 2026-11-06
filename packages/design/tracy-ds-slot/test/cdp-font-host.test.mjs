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
