// A search result printed its address, so a Vietnamese site showed the demo's English slug
// ("/services/building-services") under a Vietnamese title (g60 build, 11/10/2026, LANG-2). The
// slug is structure and is never translated, so the result does not print it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('a search result does not print its address', () => {
  const search = readFileSync(new URL('../src/views/Search.astro', import.meta.url), 'utf8')
  assert.doesNotMatch(search, />\{urlOf\(r\)\}</)
})
