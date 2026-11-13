// The build chat's research gatherer before a site exists (#609, `build-draft/gather.js`), as the app wires it
// (`build-draft-gather-wiring.js` `preSiteGatherer`): the Website Opportunities domain and its pieces are the real ones,
// only the doors that reach the network, the objects and the draft picture table are fakes (`build-draft-gather-fakes.mjs`;
// the pictures are invented bytes, measured for real). No database, no network, no key.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-gather.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { EXT } from 'website-opportunities/src/media-store.js'
import { createLogoWriter } from '../src/build-draft/logo-file.js'
import { researchOf } from 'website-opportunities/domain'
import { draftPictureReader, draftPictures, preSiteGatherer } from '../src/build-draft-wiring.js'
import { assetManifestOf } from '../src/opportunities-build/asset-manifest.js'
import {
  FACEBOOK,
  MAPS,
  PLACE_ID,
  SITE,
  connector,
  facebookResult,
  fakeDomain,
  fakeObjects,
  fakePicturePool,
  pngOf,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'

const LOGO = 'https://hollowmere-bakehouse.example/img/hollowmere-logo.png'
const noFetch = async () => assert.fail('no fetch outside the fakes')

/**
 * A picture store of invented bytes: the domain's download door answers `served` (an address to its bytes, else 404),
 * the objects and the table are held in memory, and the pictures are measured by the real measuring (`sharp`).
 */
function storing(domain, served, { objects = fakeObjects() } = {}) {
  const asked = []
  domain.fetchLimited = async (url, deps) => {
    asked.push({ url, maxBytes: deps.maxBytes })
    const bytes = served[url]
    return bytes
      ? { status: 200, bytes, truncated: false }
      : { status: 404, bytes: new Uint8Array(), truncated: false }
  }
  const pool = fakePicturePool()
  return { pool, objects, asked, doors: { pool, objects } }
}

function gatherer(domain, { keys = {}, settings = {}, paid = async () => true, pool = null, ...rest } = {}) {
  return preSiteGatherer({
    pool,
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

test('a website link: its facts, its pictures stored as draft pictures, and the social page it links to', async () => {
  const asked = []
  const { domain } = await fakeDomain({
    connectors: {
      website: connector(websiteResult(), asked),
      facebook: connector(facebookResult(), asked)
    }
  })
  const served = {
    'https://hollowmere-bakehouse.example/img/loaves.jpg': await pngOf(640, 480),
    'https://hollowmere-bakehouse.example/img/oven.jpg': await pngOf(480, 640, { r: 40, g: 40, b: 44 })
  }
  const store = storing(domain, served)
  const paidFor = []
  const gather = gatherer(domain, {
    keys: { apify: 'apify-test' },
    paid: async (id) => (paidFor.push(id), true),
    pool: store.pool,
    objects: store.objects
  })
  const { brief, manifest, setAside, picturesSetAside, pictureRun } = await gather(
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
  // The two website pictures are stored copies of their real size; the social one did not download and is set aside.
  assert.deepEqual(manifest, assetManifestOf(manifest), 'the revision manifest shape')
  assert.deepEqual(
    manifest.map((m) => [m.sourceUrl.split('/').pop(), m.origin, m.mime, m.width, m.height]).sort(),
    [
      ['loaves.jpg', 'draft', 'image/png', 640, 480],
      ['oven.jpg', 'draft', 'image/png', 480, 640]
    ]
  )
  assert.ok(
    manifest.every((m) => /^[0-9a-f]{64}$/.test(m.sha256) && store.pool.rows.some((r) => r.id === m.id))
  )
  assert.deepEqual(picturesSetAside, [
    { url: 'https://cdn.social.example/hollowmere/rye.jpg', reason: 'the picture could not be downloaded' }
  ])
  assert.ok(store.pool.rows.every((r) => r.research_run === pictureRun && r.account_id === 'acc-1'))
  assert.deepEqual(
    [...store.objects.held.keys()].sort(),
    store.pool.rows.map((r) => r.object_key).sort(),
    'each stored row has its object under the draft key'
  )
  assert.ok([...store.objects.held.keys()].every((k) => k.startsWith('build-drafts/acc-1/')))
  // A stored picture opens again by its manifest id, its bytes checked against its sha256.
  const open = draftPictureReader(draftPictures({ pool: store.pool, objects: store.objects }))
  const loaves = manifest.find((m) => m.sourceUrl.endsWith('/loaves.jpg'))
  const opened = await open(loaves.id)
  assert.deepEqual(
    [opened.sha256, opened.mime, opened.width, opened.height],
    [loaves.sha256, 'image/png', 640, 480]
  )
  assert.deepEqual(opened.bytes, Buffer.from(served['https://hollowmere-bakehouse.example/img/loaves.jpg']))
  assert.equal(await open(loaves.id, { accountId: '00000000-0000-4000-8000-00000000ffff' }), null)
  const { sources } = researchOf(brief, { manifest })
  const website = sources.find((s) => s.id === 'website')
  assert.equal(website.fields['business.name'], 'Hollowmere Bakehouse')
  assert.ok(website.pictures.some((p) => p.ref.endsWith('/img/oven.jpg')))
})

test('without a picture store every picture is set aside with its reason, none is in the manifest', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const { manifest, picturesSetAside, pictureRun } = await gatherer(domain)(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.deepEqual(manifest, [])
  assert.equal(pictureRun, undefined)
  assert.equal(picturesSetAside.length, 2)
  assert.ok(picturesSetAside.every((p) => p.reason === 'this server has no store to keep pictures in'))
})

test('a picture the store refuses, or one not reached by the deadline, is set aside and not in the manifest', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const served = {
    'https://hollowmere-bakehouse.example/img/loaves.jpg': await pngOf(64, 48),
    'https://hollowmere-bakehouse.example/img/oven.jpg': new TextEncoder().encode(
      '<html>not a picture</html>'
    )
  }
  const refused = storing(domain, served, { objects: fakeObjects({ refuse: true }) })
  const one = await gatherer(domain, refused.doors)(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.deepEqual(one.manifest, [])
  assert.deepEqual(one.picturesSetAside.map((p) => p.reason).sort(), [
    'the address is not a picture or a video',
    'the picture could not be kept'
  ])
  assert.deepEqual(refused.pool.rows, [])
  // A download that never answers: the research's deadline sets it aside, what was read is still the brief.
  const { domain: slow } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const late = storing(slow, {})
  slow.fetchLimited = () => new Promise(() => {})
  const two = await gatherer(slow, { ...late.doors, budgetMs: 200 })(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.equal(two.brief.business.name, 'Hollowmere Bakehouse')
  assert.deepEqual(two.manifest, [])
  assert.ok(two.picturesSetAside.length === 2)
  assert.ok(
    two.picturesSetAside.every(
      (p) => p.reason === 'the research ran out of time before this picture was kept'
    )
  )
})

test('a newer research replaces the pictures: same bytes keep their id, the others and their objects go', async () => {
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const loaves = await pngOf(640, 480)
  const store = storing(domain, {
    'https://hollowmere-bakehouse.example/img/loaves.jpg': loaves,
    'https://hollowmere-bakehouse.example/img/oven.jpg': await pngOf(480, 640, { r: 10, g: 120, b: 90 })
  })
  const pictures = draftPictures({ pool: store.pool, objects: store.objects })
  const first = await gatherer(domain, store.doors)(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.equal(first.manifest.length, 2)
  // The oven picture is gone from the website; the loaves are the same bytes.
  const { domain: later } = await fakeDomain({
    connectors: {
      website: connector({ ...websiteResult(), media: [websiteResult().media[0]] })
    }
  })
  later.fetchLimited = domain.fetchLimited
  const second = await gatherer(later, store.doors)(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.equal(second.manifest.length, 1)
  assert.equal(second.manifest[0].id, first.manifest.find((m) => m.sourceUrl.endsWith('/loaves.jpg')).id)
  assert.equal(await pictures.prune('acc-1', second.pictureRun), 1)
  assert.deepEqual(
    store.pool.rows.map((r) => r.id),
    [second.manifest[0].id]
  )
  assert.deepEqual([...store.objects.held.keys()], [store.pool.rows[0].object_key])
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

test('the link guard always gets a DNS resolver, even when the server injects none', async () => {
  // The server (`app.js`) passes no resolver of its own in production. Without one the real guard refuses every
  // website as `dns_unavailable`, so every owner link was set aside and research stopped (#609, first real run).
  const { domain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const handed = []
  const guard = domain.assertPublicUrl
  domain.assertPublicUrl = async (url, deps) => {
    handed.push(typeof deps?.resolve)
    return guard(url, deps)
  }
  await gatherer(domain)({ links: [SITE], description: null }, {})
  assert.ok(handed.length > 0, 'the guard was asked')
  assert.deepEqual([...new Set(handed)], ['function'])
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

test('the logo file is written from its stored copy; anything that is not a stored image is no file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-logo-'))
  const write = createLogoWriter({ dir, ext: EXT })
  const bytes = await pngOf(32, 32)
  const sha256 = 'a'.repeat(64)
  const file = await write({ sha256, mime: 'image/png', bytes })
  assert.equal(file, path.join(dir, `${sha256}.png`))
  assert.deepEqual(new Uint8Array(readFileSync(file)), bytes)
  assert.equal(await write(null), null)
  assert.equal(await write({ sha256, mime: 'video/mp4', bytes }), null)
  assert.equal(await write({ sha256: '../escape', mime: 'image/png', bytes }), null)
  rmSync(dir, { recursive: true, force: true })
})

test('research keeps the logo the website names as a file, from its stored copy; no logo hint, no file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'draft-logo-'))
  const withLogo = { ...websiteResult(), logos: [{ url: LOGO, via: 'jsonld-logo' }] }
  const { domain } = await fakeDomain({ connectors: { website: connector(withLogo) } })
  const logo = await pngOf(120, 40)
  const store = storing(domain, { [LOGO]: logo })
  const gathered = await gatherer(domain, { ...store.doors, logoDir: dir })(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.equal(path.dirname(gathered.logoFile), dir)
  assert.deepEqual(new Uint8Array(readFileSync(gathered.logoFile)), logo)
  // The brand step refuses a logo file its brief does not name (`BRAND_LOGO_NO_ID`): the brief names the stored logo.
  const named = gathered.brief.brand?.logo
  assert.match(named ?? '', /\S/, 'the brief names its logo')
  assert.equal(gathered.brief.brand.logoResearch?.chosen?.mediaId, named)
  assert.ok(
    gathered.brief.assets.some((a) => a.id === named),
    'the named logo is one of the brief assets'
  )
  assert.equal(
    store.asked.filter((a) => a.url === LOGO).length,
    1,
    'the logo is downloaded once, when stored'
  )
  const { domain: plain } = await fakeDomain({ connectors: { website: connector(websiteResult()) } })
  const none = await gatherer(plain, { ...storing(plain, {}).doors, logoDir: dir })(
    { links: [SITE], description: null },
    { accountId: 'acc-1' }
  )
  assert.equal(none.logoFile, undefined)
  assert.equal(none.brief.brand?.logo, undefined, 'no logo file, no logo in the brief')
  rmSync(dir, { recursive: true, force: true })
})
