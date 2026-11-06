import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fontFetchUrl } from '../scripts/cdp.mjs'

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
