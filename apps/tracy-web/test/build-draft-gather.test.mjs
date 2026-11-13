// The build chat's research gatherer before a site exists (#609, `build-draft/gather.js`), as the app wires it
// (`build-draft-wiring.js` `preSiteGatherer`): the Website Opportunities domain and its pieces are the real ones, only
// the doors that reach the network are fakes (`build-draft-gather-fakes.mjs`). No database, no network, no key.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { researchOf } from 'website-opportunities/domain'
import { preSiteGatherer } from '../src/build-draft-wiring.js'
import { assetManifestOf } from '../src/opportunities-build/asset-manifest.js'
import {
  FACEBOOK,
  MAPS,
  PLACE_ID,
  SITE,
  connector,
  facebookResult,
  fakeDomain,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'

const noFetch = async () => assert.fail('no fetch outside the fakes')

function gatherer(domain, { keys = {}, settings = {}, paid = async () => true, ...rest } = {}) {
  return preSiteGatherer({
    pool: null,
    config: null,
    overrides: {
      loadDomain: async () => domain,
      runtime: runtimeWith(keys, settings),
      fetch: noFetch,
      paidRunAllowed: paid,
      ...rest
    }
  })
}

test('a website link: its facts, its pictures as references, and the social page it links to', async () => {
  const asked = []
  const { domain } = await fakeDomain({
    connectors: {
      website: connector(websiteResult(), asked),
      facebook: connector(facebookResult(), asked)
    }
  })
  const paidFor = []
  const gather = gatherer(domain, {
    keys: { apify: 'apify-test' },
    paid: async (id) => (paidFor.push(id), true)
  })
  const { brief, manifest, setAside } = await gather(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.deepEqual(setAside, [])
  assert.deepEqual(
    asked.map((a) => [a.ref, a.opts.limit]),
    [
      [SITE, 40],
      [FACEBOOK, 20]
    ]
  )
  assert.deepEqual(paidFor, ['acc-1'], 'the paid social run is counted against the account')
  assert.equal(brief.business.name, 'Hollowmere Bakehouse')
  assert.ok(brief.facts.some((f) => f.field === 'phone' && f.value === '+1 555 0142 318'))
  assert.equal(brief.trade, 'food')
  assert.equal(manifest.length, 3)
  assert.deepEqual(manifest, assetManifestOf(manifest), 'the revision manifest shape')
  assert.ok(manifest.every((m) => m.width === null && m.mime === null && m.sourceUrl.startsWith('https:')))
  const { sources } = researchOf(brief, { manifest })
  const website = sources.find((s) => s.id === 'website')
  assert.equal(website.fields['business.name'], 'Hollowmere Bakehouse')
  assert.ok(website.pictures.some((p) => p.ref.endsWith('/img/oven.jpg')))
})

test('a Google Maps link: the place facts from Google, read with the server key', async () => {
  const { domain, calls } = await fakeDomain()
  const gather = gatherer(domain, { keys: { google: 'google-test' } })
  const { brief, setAside } = await gather({ links: [MAPS], description: null })
  assert.deepEqual(setAside, [])
  assert.deepEqual(
    calls.find((c) => c[0] === 'details'),
    ['details', PLACE_ID, true]
  )
  assert.equal(brief.business.name, 'Hollowmere Bakehouse')
  assert.equal(brief.googlePlace?.placeId, PLACE_ID)
  assert.equal(brief.trade, 'food')
  const { sources } = researchOf(brief, { manifest: [] })
  assert.match(sources.find((s) => s.id === 'google').fields['contact.hours'], /Monday/)
})

test('without a Google key the Google link is set aside, and the website is still read', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const gather = gatherer(domain)
  const { brief, setAside } = await gather({ links: [MAPS, SITE], description: null })
  assert.deepEqual(setAside, [
    { link: MAPS, reason: 'this server has no Google key to read the Google listing' }
  ])
  assert.equal(brief.business.name, 'Hollowmere Bakehouse')
  // Only a Google link and no key: nothing is read, and reading again would read nothing again.
  await assert.rejects(gather({ links: [MAPS], description: null }), {
    code: 'research_empty',
    noRerun: true
  })
})

test('private targets are refused by the existing guards, each link set aside with its reason', async () => {
  const { domain } = await fakeDomain({
    realGuard: true,
    connectors: { website: connector(websiteResult()) }
  })
  // The documentation range is refused by the link guard as it refuses a private address.
  const gather = gatherer(domain, { resolve: async () => [{ address: '192.0.2.10', family: 4 }] })
  await assert.rejects(
    gather({ links: ['http://localhost:8080/', 'https://rebinds.example/'], description: null }),
    { code: 'research_empty', noRerun: true }
  )
  const { domain: open } = await fakeDomain({
    // A page that sends its reader on to a private address: the pinned fetch of the wiring refuses the dial.
    connectors: { website: connector(async (_ref, _opts, deps) => deps.fetch('http://localhost:9/')) }
  })
  const pinned = preSiteGatherer({
    pool: null,
    config: null,
    overrides: { loadDomain: async () => open, runtime: runtimeWith({ google: 'google-test' }) }
  })
  const { setAside } = await pinned({ links: [SITE, MAPS], description: null })
  assert.deepEqual(setAside, [
    { link: SITE, reason: 'a private address, or one that does not answer on the internet' }
  ])
})

test('a paid social page past the day count is set aside; nothing else read is research_empty', async () => {
  const { domain } = await fakeDomain({ connectors: { facebook: connector(facebookResult()) } })
  const gather = gatherer(domain, { keys: { apify: 'apify-test' }, paid: async () => false })
  await assert.rejects(gather({ links: [FACEBOOK], description: null }, { accountId: 'acc-1' }), {
    code: 'research_empty',
    noRerun: true
  })
  const read = gatherer(domain, { keys: { apify: 'apify-test' } })
  const { brief } = await read({ links: [FACEBOOK], description: null }, { accountId: 'acc-1' })
  const { sources } = researchOf(brief, { manifest: [] })
  assert.ok(sources.some((s) => s.id === 'facebook'))
})

test('the owner description reaches the brief as the seller typed bio', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const description = 'Family bakery, rye and sourdough, open early for commuters.'
  const { brief } = await gatherer(domain)({ links: [SITE], description }, {})
  const story = brief.sitemap.flatMap((p) => p.sections).find((s) => s.kind === 'story' || s.id === 'story')
  assert.ok(
    JSON.stringify(brief).includes(description),
    `the description is in the brief: ${JSON.stringify(story?.evidence ?? null)}`
  )
  // A description is not a source: with no link to read, the research has nothing.
  await assert.rejects(gatherer(domain)({ links: [], description }, {}), {
    code: 'research_empty',
    noRerun: true
  })
})

test('a read past the time budget is set aside as too slow; what was read by then is kept', async () => {
  const { domain } = await fakeDomain({
    connectors: { website: connector(() => new Promise(() => {})) }
  })
  const gather = gatherer(domain, { keys: { google: 'google-test' }, budgetMs: 50 })
  const { brief, setAside } = await gather({ links: [MAPS, SITE], description: null })
  assert.deepEqual(setAside, [
    { link: SITE, reason: 'the page took longer to read than the research allows' }
  ])
  assert.equal(brief.googlePlace?.placeId, PLACE_ID)
})

test('a Google link that matches several places is set aside, the other links still read', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  domain.searchNamedPlaces = async () => ({
    candidates: [
      { provider: 'google-places', providerId: 'ChIJinventedA', name: 'Hollowmere Bakehouse' },
      { provider: 'google-places', providerId: 'ChIJinventedB', name: 'Hollowmere Bakehouse' }
    ]
  })
  const words = 'https://www.google.com/maps/search/?api=1&query=Hollowmere+Bakehouse'
  const { setAside } = await gatherer(domain, { keys: { google: 'google-test' } })({
    links: [words, SITE],
    description: null
  })
  assert.deepEqual(setAside, [{ link: words, reason: 'the Google link matches more than one place' }])
})

test('a listing page is read once and kept as the private listing source, through its own writer', async () => {
  const { domain } = await fakeDomain()
  const listing = 'https://www.yelp.com/biz/hollowmere-bakehouse-brackenford'
  domain.readListingPage = async () => ({
    ok: true,
    facts: {
      name: 'Hollowmere Bakehouse',
      telephone: '+1 555 0142 318',
      address: '12 Quillan Lane, Brackenford'
    }
  })
  const { brief, setAside } = await gatherer(domain)({ links: [listing], description: null })
  assert.deepEqual(setAside, [])
  assert.equal(brief.business.name, 'Hollowmere Bakehouse')
  assert.ok(brief.facts.some((f) => f.field === 'address'))
  // A listing page that does not answer is set aside; with nothing else, nothing was read.
  domain.readListingPage = async () => ({ ok: false, reason: 'blocked' })
  await assert.rejects(gatherer(domain)({ links: [listing], description: null }), { code: 'research_empty' })
})
