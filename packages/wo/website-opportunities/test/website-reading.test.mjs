// The website reading research shares (`website-reading.js`, #575): moved out of the place executor's collection stage
// unchanged, so the build chat's research reads a website the same way. Scripted readers; an invented website.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/website-reading.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readWebsite } from '../src/website-reading.js'

const SITE = 'https://wrenfield-pottery.example/'
const thin = { status: 'complete', reason: null, pages: [{ text: '' }], media: [] }
const full = (by) => ({ status: 'complete', reason: null, pages: [{ text: 'x'.repeat(500) }], media: [], by })
const domain = {
  needsBrowser: (r) => (r.pages ?? []).reduce((n, p) => n + (p.text?.length ?? 0), 0) < 400,
  readWithJina: async () => full('jina'),
  readWithFirecrawl: async () => full('firecrawl')
}
const DEFAULT = ['direct', 'apify-browser', 'jina', 'firecrawl']
const AT = new Date('2026-11-01T00:00:00Z')

function input(over = {}) {
  const used = []
  return {
    used,
    args: {
      domain,
      keys: { apify: 'a', jina: 'j' },
      order: DEFAULT,
      ref: SITE,
      cursor: null,
      runDirect: async () => (used.push('direct'), thin),
      browser: async () => (used.push('browser'), { result: full('browser'), fetchedAt: AT }),
      charge: async (id, call) => (used.push(`charge:${id}`), call()),
      fetch: async () => assert.fail('no fetch'),
      ...over
    }
  }
}

test('the default order: the crawl, then the browser on a thin page, with what it fell back from', async () => {
  const { used, args } = input()
  const { result, fetchedAt } = await readWebsite(args)
  assert.deepEqual(used, ['direct', 'browser'])
  assert.equal(result.by, 'browser')
  assert.deepEqual(result.fallbackFrom, { status: 'complete', reason: null })
  assert.equal(fetchedAt, AT)
})

test('no browser door: the readers after the browser read the thin page, each paid through the charge', async () => {
  const { used, args } = input({ browser: null })
  const { result, fetchedAt } = await readWebsite(args)
  assert.deepEqual(used, ['direct', 'charge:jina'])
  assert.equal(result.by, 'jina')
  assert.equal(fetchedAt, null)
})

test('a browser that fails is recorded on the crawl, and the readers still try', async () => {
  const { used, args } = input({
    keys: { apify: 'a' },
    browser: async () => ({ result: { status: 'failed', reason: 'error' }, fetchedAt: AT })
  })
  const { result } = await readWebsite(args)
  assert.deepEqual(used, ['direct'])
  assert.deepEqual(result.fallback, { provider: 'apify-browser', status: 'failed', reason: 'error' })
})

test('another order is read in turn; no order is a crawl and its browser only', async () => {
  const custom = input({ order: ['jina', 'direct'] })
  assert.equal((await readWebsite(custom.args)).result.by, 'jina')
  assert.deepEqual(custom.used, ['charge:jina'])
  const none = input({ order: null, browser: null })
  assert.equal((await readWebsite(none.args)).result, thin)
  assert.deepEqual(none.used, ['direct'])
})
