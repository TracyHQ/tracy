// The build chat's research reads a website the way the step chain does (#575, `website-reading.js` `readWebsite`): the
// operator's reader order (/ops/wo `website-content`), the Apify browser when the plain crawl answered a thin page, and
// the rendered readers. The browser is a paid run, so the account's daily count of paid runs holds it as it holds a
// social page. Invented bakery; every network door is a fake.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather-website-reading.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import { SITE, connector, fakeDomain, runtimeWith, websiteResult } from './build-draft-gather-fakes.mjs'

/** What a script-built site gives the plain crawl: one page with no words and no picture. */
const thinResult = () => ({
  source: 'website',
  status: 'complete',
  reason: null,
  coverage: { fetched: 1 },
  profile: {},
  pages: [{ url: SITE, title: '', text: '' }],
  media: [],
  posts: []
})

/** A page with enough words to need no browser (`needsBrowser`: at least 400 characters of text). */
const WORDS =
  'Sourdough, rye and seeded loaves baked before dawn in our wood oven, every day of the week. '.repeat(6)
const fullResult = () => ({
  ...websiteResult(),
  pages: [{ url: SITE, title: 'Hollowmere Bakehouse', text: WORDS }]
})

/** The rendered site, as the Apify browser or a reader reads it. */
const renderedResult = () => ({
  ...fullResult(),
  provider: 'apify-browser',
  profile: { ...websiteResult().profile, phone: '+1 555 0142 777' }
})

function gatherer(domain, { keys = {}, settings = {}, paid = async () => true } = {}) {
  return preSiteGatherer({
    pool: null,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith(keys, settings),
      fetch: async () => assert.fail('no fetch outside the fakes'),
      paidRunAllowed: paid
    }
  })
}

async function domainWithBrowser(direct) {
  const { domain } = await fakeDomain({ connectors: { website: connector(direct) } })
  const browsed = []
  domain.crawlWithBrowser = async (url, opts, deps) => {
    browsed.push({ url, maxPages: opts.maxPages, token: deps.token })
    return renderedResult()
  }
  return { domain, browsed }
}

test('a thin website is read again through the Apify browser, as the step chain reads it', async () => {
  const { domain, browsed } = await domainWithBrowser(thinResult)
  const { brief } = await gatherer(domain, { keys: { apify: 'apify-test' } })(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.deepEqual(browsed, [{ url: SITE, maxPages: 40, token: 'apify-test' }])
  assert.equal(brief.business.phone, '+1 555 0142 777', 'the rendered page is what the brief read')
})

test('the browser is a paid run: past the day count, the thin page is kept and no browser runs', async () => {
  const { domain, browsed } = await domainWithBrowser(thinResult)
  const { brief } = await gatherer(domain, { keys: { apify: 'apify-test' }, paid: async () => false })(
    { links: [SITE], description: null, name: 'Hollowmere Bakehouse' },
    { accountId: 'acc-1' }
  )
  assert.deepEqual(browsed, [])
  assert.notEqual(brief.business.phone, '+1 555 0142 777')
})

test('a full page never needs the browser; without an Apify key none runs either', async () => {
  const full = await domainWithBrowser(fullResult)
  await gatherer(full.domain, { keys: { apify: 'apify-test' } })({ links: [SITE], description: null }, {})
  assert.deepEqual(full.browsed, [])
  const noKey = await domainWithBrowser(thinResult)
  await gatherer(noKey.domain)({ links: [SITE], description: null, name: 'Hollowmere Bakehouse' }, {})
  assert.deepEqual(noKey.browsed, [])
})

test('the operator reader order is followed: Jina first reads the site, the crawl never runs', async () => {
  const crawled = []
  const { domain } = await fakeDomain({ connectors: { website: connector(thinResult, crawled) } })
  const read = []
  domain.readWithJina = async (url, opts) => {
    read.push({ url, key: opts.key })
    return renderedResult()
  }
  const { brief } = await gatherer(domain, {
    keys: { jina: 'jina-test' },
    settings: { providerOrder: { 'website-content': ['jina', 'direct'] } }
  })({ links: [SITE], description: null }, {})
  assert.deepEqual(read, [{ url: SITE, key: 'jina-test' }])
  assert.deepEqual(crawled, [], 'the direct crawl comes after a reader that gave a full page')
  assert.equal(brief.business.phone, '+1 555 0142 777')
})

test('an order of no reader switches the website off, as on /ops/wo', async () => {
  const crawled = []
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult, crawled) } })
  await assert.rejects(
    gatherer(domain, { settings: { providerOrder: { 'website-content': [] } } })(
      { links: [SITE], description: null },
      {}
    ),
    { code: 'research_empty' }
  )
  assert.deepEqual(crawled, [], 'the website is never read')
})
