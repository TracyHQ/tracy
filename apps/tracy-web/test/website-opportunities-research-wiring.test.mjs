// The place executor wires the 23/10/2026 research parts together (tasks/plan-wo-public-research.md):
// a place Google lists no website for gets its Facebook page from a web search only with branch evidence,
// and a website's menu links become sourced dishes on the published snapshot.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJwiringCafe1'
const FB = 'https://www.facebook.com/wiringcafe.dubai'
const GOOGLE = {
  displayName: { text: 'Wiring Cafe' },
  formattedAddress: '12 Al Wasl Road, Jumeirah, Dubai',
  addressComponents: [
    { longText: '12', types: ['street_number'] },
    { longText: 'Al Wasl Road', types: ['route'] },
    { longText: 'Dubai', types: ['locality'] }
  ]
}

const blocked = () => ({
  available: false,
  reason: 'credential_missing',
  collect: async () => ({ status: 'blocked', media: [] })
})

async function domainWith({ details, pageAddress, website }) {
  const real = await websiteOpportunitiesDomain()
  const calls = { search: 0, page: 0 }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: website ?? blocked(),
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    }),
    fetchPlaceDetails: async (placeId) => ({ id: placeId, ...GOOGLE, ...details }),
    scrapeCreatorsGoogleSearch: async () => {
      calls.search += 1
      return [{ title: 'Wiring Cafe Dubai | Facebook', url: FB, description: 'Cafe in Dubai' }]
    },
    collectSocialProfile: async (network) => {
      calls.page += 1
      return {
        source: network,
        status: 'complete',
        profile: { name: 'Wiring Cafe', address: pageAddress, phone: null },
        posts: [],
        media: []
      }
    }
  }
  return { domain, calls }
}

function executor(pool, domain, { keys = {}, settings = {}, chargeable } = {}) {
  return createExecutor({
    ...(chargeable ? { chargeable } : {}),
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'AIza-test', apify: null, scrapecreators: 'sc-test', ...keys },
      settings: normalizeWoOpsSettings({
        pageSpeedCheckEnabled: false,
        googlePlacesPhotos: false,
        ...settings
      })
    }),
    objects: { put: async () => true },
    switchOn: async () => true,
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
}

async function researchOne(pool, domain, runtime = {}) {
  const accountId = (await pool.query("insert into account (email) values ('w@example.com') returning id"))
    .rows[0].id
  const candidate = { provider: 'google-places', providerId: PLACE_ID, name: 'Wiring Cafe', socials: {} }
  const { row } = await insertOpportunity(pool, accountId, {
    name: 'Wiring Cafe',
    branch: null,
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate
  })
  await requestResearch(pool, { accountId, opportunity: row, requestId: 'wiring-1' })
  const ex = executor(pool, domain, runtime)
  for (let i = 0; i < 20; i += 1) {
    const { claimed, done } = await ex.tick()
    if (!claimed) break
    await done
  }
}

const linksOf = async (pool) =>
  (await pool.query("select kind, url, verified_by from wo_place_link where kind = 'facebook'")).rows

test(
  'a place without a website gets the Facebook page a search confirms on its street address',
  opts,
  async () => {
    const { domain, calls } = await domainWith({ pageAddress: '12 Al Wasl Road, Dubai' })
    await researchOne(db.pool, domain)
    assert.ok(calls.search >= 1, 'searched the web')
    const links = await linksOf(db.pool)
    assert.deepEqual(
      links.map((l) => [l.url.replace(/\/$/, ''), l.verified_by]),
      [[FB, 'search']]
    )
  }
)

test('a found page without branch evidence never becomes a link', opts, async () => {
  const { domain, calls } = await domainWith({ pageAddress: 'Dubai Mall, Dubai' })
  await researchOne(db.pool, domain)
  assert.ok(calls.page >= 1, 'read the page facts')
  assert.deepEqual(await linksOf(db.pool), [])
})

test('a place with its own website is not searched', opts, async () => {
  const { domain, calls } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
  await researchOne(db.pool, domain)
  assert.equal(calls.search, 0)
})

test('menu links on the website become sourced dishes on the published profile', opts, async () => {
  const website = {
    available: true,
    async collect(ref) {
      return {
        source: 'website',
        status: 'complete',
        profile: { name: 'Wiring Cafe', links: [] },
        pages: [{ url: ref, title: 'Wiring Cafe', text: 'Cafe' }],
        media: [],
        menus: [{ url: 'https://wiring.example/menu', sourceUrl: ref }],
        coverage: { fetched: 1, total: 1 }
      }
    }
  }
  const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' }, website })
  domain.readMenus = async ({ menus }) => ({
    items: [
      {
        name: 'Flat white',
        price: '18',
        currency: null,
        source: { url: menus[0].url, kind: 'html' },
        verified: true
      }
    ],
    reads: [{ url: menus[0].url, status: 'complete' }]
  })
  await researchOne(db.pool, domain)
  const profile = (
    await db.pool.query(
      `select s.profile from wo_place p join wo_place_snapshot_profile s on s.snapshot_id = p.current_snapshot_id`
    )
  ).rows[0]?.profile
  assert.equal(profile?.menuItems?.[0]?.name, 'Flat white')
  assert.equal(profile?.menuItems?.[0]?.verified, true)
})

/** The web search providers answering in turn: each call records which provider ran. */
function searchers(domain, calls, { jina = 'found', firecrawl = 'found' } = {}) {
  const answer = [{ title: 'Wiring Cafe Dubai | Facebook', url: FB, description: 'Cafe in Dubai' }]
  const run = (name, how) => async () => {
    calls.push(name)
    if (how === 'quota') throw Object.assign(new Error('quota'), { code: 'QUOTA' })
    return answer
  }
  domain.jinaSearch = run('jina', jina)
  domain.firecrawlSearch = run('firecrawl', firecrawl)
  const sc = domain.scrapeCreatorsGoogleSearch
  domain.scrapeCreatorsGoogleSearch = async (...a) => {
    calls.push('scrapecreators-google')
    return sc(...a)
  }
}

test('web search: the operator order decides which provider searches first', opts, async () => {
  const { domain } = await domainWith({ pageAddress: '12 Al Wasl Road, Dubai' })
  const calls = []
  searchers(domain, calls)
  await researchOne(db.pool, domain, {
    keys: { jina: 'jk', firecrawl: 'fk' },
    settings: { providerOrder: { 'web-search': ['jina', 'scrapecreators-google'] } }
  })
  assert.equal(calls[0], 'jina')
  assert.ok(!calls.includes('firecrawl'), 'a provider left out of the order is never called')
  assert.deepEqual(
    (await linksOf(db.pool)).map((l) => l.verified_by),
    ['search']
  )
})

test('web search: a spent quota falls to the next provider, a missing key is skipped', opts, async () => {
  const { domain } = await domainWith({ pageAddress: '12 Al Wasl Road, Dubai' })
  const calls = []
  searchers(domain, calls, { jina: 'quota' })
  await researchOne(db.pool, domain, {
    keys: { jina: 'jk' },
    settings: { providerOrder: { 'web-search': ['firecrawl', 'jina', 'scrapecreators-google'] } }
  })
  assert.equal(calls.includes('firecrawl'), false, 'no Firecrawl key: skipped without a call')
  assert.deepEqual(calls.slice(0, 2), ['jina', 'scrapecreators-google'])
  assert.equal((await linksOf(db.pool)).length, 1)
})

test('web search: the default order is what research ran before, ScrapeCreators only', opts, async () => {
  const { domain } = await domainWith({ pageAddress: '12 Al Wasl Road, Dubai' })
  const calls = []
  searchers(domain, calls)
  await researchOne(db.pool, domain, { keys: { jina: 'jk', firecrawl: 'fk' } })
  assert.ok(calls.length > 0)
  assert.ok(calls.every((c) => c === 'scrapecreators-google'))
})

/** A website whose crawl found one menu page, and a reader that records which links it read. */
function menuSite(domain) {
  const read = []
  domain.connectorsFor = () => ({
    ...Object.fromEntries(['facebook', 'instagram', 'tiktok', 'youtube'].map((n) => [n, blocked()])),
    website: {
      available: true,
      async collect(ref) {
        return {
          source: 'website',
          status: 'complete',
          profile: { name: 'Wiring Cafe', links: [] },
          pages: [{ url: ref, title: 'Wiring Cafe', text: 'Cafe' }],
          media: [],
          menus: [{ url: 'https://wiring.example/menu', sourceUrl: ref }],
          coverage: { fetched: 1, total: 1 }
        }
      }
    }
  })
  domain.readMenus = async ({ menus }) => {
    read.push(...menus.map((m) => m.url))
    return {
      items: menus.map((m) => ({
        name: 'Flat white',
        price: 'AED 18',
        currency: 'AED',
        source: { url: m.url, kind: 'page' },
        verified: true
      })),
      reads: menus.map((m) => ({ url: m.url, status: 'complete' }))
    }
  }
  return read
}
const ZOMATO = 'https://www.zomato.com/dubai/wiring-cafe-jumeirah/menu'
const profileOf = async () =>
  (
    await db.pool.query(
      'select s.profile from wo_place p join wo_place_snapshot_profile s on s.snapshot_id = p.current_snapshot_id'
    )
  ).rows[0]?.profile

test(
  'menu links: a search the operator puts first is asked first, and its dishes stay unverified',
  opts,
  async () => {
    const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
    const read = menuSite(domain)
    const calls = []
    domain.scrapeCreatorsGoogleSearch = async () => {
      calls.push('scrapecreators-google')
      return [{ title: 'Wiring Cafe Menu | Zomato', url: ZOMATO }]
    }
    await researchOne(db.pool, domain, {
      settings: { providerOrder: { 'menu-links': ['scrapecreators-google', 'website'] } }
    })
    assert.deepEqual(calls, ['scrapecreators-google'])
    assert.deepEqual(read, [ZOMATO])
    const profile = await profileOf()
    assert.deepEqual(
      profile.menus.map((m) => [m.url, m.source]),
      [[ZOMATO, 'search']]
    )
    assert.equal(profile.menuItems[0].verified, false, 'another branch may share the name: never a fact')
  }
)

test('menu links: no key skips the search and the website menu answers', opts, async () => {
  const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
  const read = menuSite(domain)
  const calls = []
  domain.serpapiGoogleSearch = async () => {
    calls.push('serpapi')
    return []
  }
  await researchOne(db.pool, domain, {
    settings: { providerOrder: { 'menu-links': ['serpapi-google-search', 'website'] } }
  })
  assert.deepEqual(calls, [], 'no SerpApi key in this runtime')
  assert.deepEqual(read, ['https://wiring.example/menu'])
  assert.equal((await profileOf()).menuItems[0].verified, true)
})

test('menu links: the default order is the website only, no search', opts, async () => {
  const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
  const read = menuSite(domain)
  const calls = []
  domain.scrapeCreatorsGoogleSearch = async () => {
    calls.push('sc')
    return []
  }
  await researchOne(db.pool, domain)
  assert.deepEqual(calls, [])
  assert.deepEqual(read, ['https://wiring.example/menu'])
})

test('menu dishes switched off on /ops/wo: menu links are kept, no dish is read', opts, async () => {
  const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
  const read = menuSite(domain)
  await researchOne(db.pool, domain, { settings: { providerOrder: { 'menu-items': [] } } })
  assert.deepEqual(read, [])
  const profile = await profileOf()
  assert.equal(profile.menus.length, 1)
  assert.equal(profile.menuItems, undefined)
})

/** A direct crawl (thin or full) and the two reader services, each recording that it ran. */
function websiteReaders(domain, calls, { direct = 'full' } = {}) {
  const page = (provider) => ({
    source: 'website',
    provider,
    status: 'complete',
    profile: { name: 'Wiring Cafe' },
    socials: {},
    pages: [{ url: 'https://wiring.example/', title: 'Wiring Cafe', text: 'Coffee and toast. '.repeat(40) }],
    media: [],
    menus: [],
    coverage: { fetched: 1, provider }
  })
  domain.connectorsFor = () => ({
    ...Object.fromEntries(['facebook', 'instagram', 'tiktok', 'youtube'].map((n) => [n, blocked()])),
    website: {
      available: true,
      async collect() {
        calls.push('direct')
        return direct === 'thin'
          ? { ...page('direct'), pages: [{ url: 'https://wiring.example/', title: '', text: 'Loading' }] }
          : page('direct')
      }
    }
  })
  domain.readWithJina = async () => {
    calls.push('jina')
    return page('jina')
  }
  domain.readWithFirecrawl = async () => {
    calls.push('firecrawl')
    return page('firecrawl')
  }
}
const websiteRow = async () =>
  (
    await db.pool.query(
      "select status, reason, collected, coverage from wo_place_snapshot_source where source = 'website'"
    )
  ).rows[0]
const SITE = { details: { websiteUri: 'https://wiring.example/' } }

test(
  'website content: a reader the operator puts first reads the site, the direct crawl is not called',
  opts,
  async () => {
    const { domain } = await domainWith(SITE)
    const calls = []
    websiteReaders(domain, calls)
    await researchOne(db.pool, domain, {
      keys: { jina: 'jk' },
      settings: { providerOrder: { 'website-content': ['jina', 'direct'] } }
    })
    assert.deepEqual(calls, ['jina'])
    assert.equal((await websiteRow()).status, 'complete')
  }
)

test(
  'website content: a thin direct crawl falls to the next reader; a reader without its key is skipped',
  opts,
  async () => {
    const { domain } = await domainWith(SITE)
    const calls = []
    websiteReaders(domain, calls, { direct: 'thin' })
    await researchOne(db.pool, domain, {
      keys: { jina: 'jk' },
      settings: { providerOrder: { 'website-content': ['direct', 'firecrawl', 'jina'] } }
    })
    assert.deepEqual(calls, ['direct', 'jina'])
    assert.equal((await websiteRow()).coverage.provider, 'jina')
  }
)

test(
  'website content: the default order is the direct crawl first; a full page calls no other reader',
  opts,
  async () => {
    const { domain } = await domainWith(SITE)
    const calls = []
    websiteReaders(domain, calls)
    await researchOne(db.pool, domain, { keys: { jina: 'jk', firecrawl: 'fk' } })
    assert.deepEqual(calls, ['direct'])
  }
)

test(
  'website content: by default a thin direct crawl falls to Jina, then Firecrawl, each only with its key',
  opts,
  async () => {
    const { domain } = await domainWith(SITE)
    const calls = []
    websiteReaders(domain, calls, { direct: 'thin' })
    await researchOne(db.pool, domain, { keys: { firecrawl: 'fk' } })
    assert.deepEqual(calls, ['direct', 'firecrawl'])
    assert.equal((await websiteRow()).coverage.provider, 'firecrawl')
  }
)

test('website content switched off on /ops/wo: the website is not read', opts, async () => {
  const { domain } = await domainWith(SITE)
  const calls = []
  websiteReaders(domain, calls)
  await researchOne(db.pool, domain, {
    keys: { jina: 'jk' },
    settings: { providerOrder: { 'website-content': [] } }
  })
  assert.deepEqual(calls, [])
  assert.deepEqual([(await websiteRow()).status, (await websiteRow()).reason], ['skipped', 'switched_off'])
})

test(
  'menu photos: off by default (recorded as switched off), and with no vision model assigned the step reports not configured',
  opts,
  async () => {
    for (const [settings, status] of [
      [{}, 'switched_off'],
      [{ providerOrder: { 'menu-items': ['document-text', 'photo-vision'] } }, 'not_configured']
    ]) {
      await db.reset()
      const { domain } = await domainWith({ details: { websiteUri: 'https://wiring.example/' } })
      menuSite(domain)
      await researchOne(db.pool, domain, { settings })
      const profile = await profileOf()
      assert.equal(profile.menuPhotoStatus, status)
      assert.deepEqual(
        profile.menuItems.map((i) => [i.name, i.verified]),
        [['Flat white', true]]
      )
    }
  }
)

// Tin Lantern Saigon (stand, 24/10/2026): ScrapeCreators' "no results" (HTTP 404, not charged) ended the network and left
// an unreconciled cent on the ledger.
test(
  'web search: a ScrapeCreators "no results" settles at 0 cents and the next query runs',
  opts,
  async () => {
    const { domain } = await domainWith({ pageAddress: '12 Al Wasl Road, Dubai' })
    const queries = []
    domain.scrapeCreatorsGoogleSearch = async (q) => {
      queries.push(q)
      return queries.length === 1
        ? Object.assign([], { charged: false })
        : [{ title: 'Wiring Cafe Dubai | Facebook', url: FB, description: 'Cafe in Dubai' }]
    }
    // The ledger's settle reads `actualCents(result)`; null = the reservation.
    const settled = []
    const chargeable = async (spec, fn) => {
      const result = await fn({ notSent() {} })
      if (spec.operation === 'google-search') settled.push(spec.actualCents?.(result) ?? null)
      return result
    }
    await researchOne(db.pool, domain, { chargeable })
    assert.ok(queries.length >= 2, 'the second query ran')
    assert.deepEqual(settled.slice(0, 2), [0, null])
    assert.equal((await linksOf(db.pool)).length, 1)
  }
)
