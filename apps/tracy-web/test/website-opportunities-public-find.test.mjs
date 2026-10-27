// The sign-in-free Find page (tasks/plan-wo-public-find.md §2–3): `GET /find` and
// `POST /find/api/search`. The WO domain is the real subtree; the network is a stub, so every
// provider call the door makes is in `world.fetched`.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { saveWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { findResearchOf, withResearch } from 'website-opportunities/src/find-research.js'
import { ipBucketOf, woPublicFindRoutes } from '../src/public/wo-find-page.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { shardCookieName } from '../src/lib/cookies.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NOW = Date.parse('2026-10-23T10:00:00Z')
// A built page stand-in: `/find` serves whatever `packages/web/tracy-wo-find-page` built into here.
const ROOT = mkdtempSync(path.join(tmpdir(), 'wo-find-page-'))
mkdirSync(path.join(ROOT, 'find-assets'))
writeFileSync(
  path.join(ROOT, 'index.html'),
  '<!doctype html><div id="root"></div><script type="module" src="/find/find-assets/index-a1.js"></script>'
)
writeFileSync(path.join(ROOT, 'find-assets', 'index-a1.js'), 'console.log(1)')
writeFileSync(path.join(ROOT, 'find-assets', 'index-a1.css'), 'body{}')
const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]
const NOMINATIM_HOI_AN = [{ lat: '15.88', lon: '108.33', display_name: 'Hoi An, Vietnam', class: 'place' }]
const PLACES = {
  places: [
    {
      id: 'ChIJ-one',
      displayName: { text: '<img src=x onerror=alert(1)> Pho & Co' },
      location: { latitude: 15.881, longitude: 108.331 },
      rating: 4.5,
      userRatingCount: 120,
      primaryType: 'vietnamese_restaurant',
      primaryTypeDisplayName: { text: 'Vietnamese <restaurant>' },
      // A photo name is a Places Photo call waiting to happen: the public answer never carries it.
      photos: [{ name: 'places/ChIJ-one/photos/p1', authorAttributions: [{ displayName: 'A' }] }]
    },
    {
      id: 'ChIJ-two',
      displayName: { text: 'Banh Mi Two' },
      location: { latitude: 15.89, longitude: 108.34 },
      websiteUri: 'https://banhmi.example/',
      primaryType: 'restaurant',
      primaryTypeDisplayName: { text: 'Restaurant' }
    },
    {
      id: 'ChIJ-three',
      displayName: { text: 'Script Cafe' },
      location: { latitude: 15.88, longitude: 108.33 },
      primaryType: 'cafe',
      websiteUri: 'javascript:alert(1)'
    },
    {
      // A listed chain: the signed-in Find hides it by default, so the public one does too.
      id: 'ChIJ-chain',
      displayName: { text: 'KFC Hoi An' },
      location: { latitude: 15.882, longitude: 108.332 },
      primaryType: 'fast_food_restaurant'
    }
  ]
}

const SUGGESTIONS = {
  suggestions: [
    {
      placePrediction: {
        placeId: 'ChIJ-downtown',
        text: { text: 'Downtown Dubai, Dubai, UAE' },
        structuredFormat: { mainText: { text: 'Downtown Dubai' }, secondaryText: { text: 'Dubai, UAE' } },
        types: ['neighborhood']
      }
    }
  ]
}
const DETAILS = {
  id: 'ChIJ-downtown',
  formattedAddress: 'Downtown Dubai, UAE',
  location: { latitude: 25.1972, longitude: 55.2744 }
}

async function setSwitches({ wo = true, publicFind = true } = {}) {
  await db.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': wo, 'website-opportunities-public-find': publicFind })]
  )
}

async function world({ role = 'master', googleKey = 'g-key', google: googleAnswer, nominatim } = {}) {
  const fetched = []
  const slept = []
  const clock = { now: NOW }
  const fetchImpl = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url
    fetched.push({ href, body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers })
    if (href.startsWith('https://places.googleapis.com/v1/places:autocomplete'))
      return Response.json(SUGGESTIONS)
    if (/^https:\/\/places\.googleapis\.com\/v1\/places\/[A-Za-z0-9_-]+/.test(href))
      return Response.json(DETAILS)
    if (href.startsWith('https://places.googleapis.com/'))
      return googleAnswer ? googleAnswer() : Response.json(PLACES)
    if (href.startsWith('https://nominatim.openstreetmap.org/'))
      return nominatim ? nominatim(href) : Response.json(NOMINATIM_HOI_AN)
    throw new Error(`unexpected fetch ${href}`)
  }
  const app = woPublicFindRoutes({
    config: {
      deploymentRole: role,
      origin: 'https://cowork.tracy.test',
      googleApiKey: googleKey,
      sessionSecret: 's'.repeat(32),
      secure: false
    },
    pool: db.pool,
    loadDomain: websiteOpportunitiesDomain,
    fetchImpl,
    resolve: PUBLIC,
    root: ROOT,
    // As app.js wires it: published research, no account.
    decorateResearch: async (candidates) => {
      const rows = await findResearchOf(db.pool, candidates, null)
      return candidates.map((candidate, i) => withResearch(candidate, rows[i]))
    },
    now: () => clock.now,
    sleep: async (ms) => {
      slept.push(ms)
      clock.now += ms
    }
  })
  const search = (body, { ip = '203.0.113.7', headers = {} } = {}) =>
    app.request('/find/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  const google = () => fetched.filter((f) => f.href.startsWith('https://places.googleapis.com/'))
  const nominatimCalls = () =>
    fetched.filter((f) => f.href.startsWith('https://nominatim.openstreetmap.org/'))
  return { app, search, fetched, slept, clock, google, nominatimCalls }
}

const AT = { lat: 15.88, lon: 108.33, radiusM: 3000 }
/** The numbers these fence tests were written against, set through the operator settings. */
const TIGHT = {
  publicFindSearchesPerAddressMinute: 3,
  publicFindSearchesPerAddressHour: 10,
  publicFindSearchesPerMinute: 20,
  // The cache is off here: these tests count Google calls of repeated identical searches.
  placesCacheDays: 0
}
const tighten = (extra = {}) => saveWoOpsSettings(db.pool, { ...TIGHT, ...extra }, 'test')

test(
  'a stranger searches around a point: one Google Nearby call for every kind of business, the signed-in default, chains hidden',
  opts,
  async () => {
    await setSwitches()
    const w = await world()
    const res = await w.search(AT)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.equal(w.fetched.length, 1)
    const [call] = w.google()
    assert.equal(call.href, 'https://places.googleapis.com/v1/places:searchNearby')
    assert.ok(
      call.body.includedTypes.includes('restaurant') && call.body.includedTypes.includes('beauty_salon')
    )
    assert.equal(call.body.maxResultCount, 20)
    assert.equal(call.body.pageToken, undefined)
    assert.deepEqual(body.center, { lat: 15.88, lon: 108.33, label: null })
    assert.equal(body.provider, 'google-places')
    assert.equal(body.hiddenChains, 1)
    assert.equal(body.rowsHtml, undefined)
    assert.deepEqual(
      body.candidates.map((c) => [c.providerId, c.website ?? null, c.status]),
      [
        ['ChIJ-one', null, 'new'],
        ['ChIJ-two', 'https://banhmi.example/', 'new'],
        // A website that is not http(s) is never handed on: it reads as none listed.
        ['ChIJ-three', null, 'new']
      ]
    )
    // No check runs for a stranger: a row with a website says so, instead of "checking" for ever.
    assert.deepEqual(body.candidates[1].siteCheck, { status: 'not_queued' })
    assert.equal(body.candidates[0].siteCheck, undefined)
    const one = body.candidates[0]
    assert.equal(one.rating, 4.5)
    assert.equal(one.reviews, 120)
    assert.equal(one.category, 'Vietnamese <restaurant>')
    assert.equal(one.kind, 'restaurants')
    assert.ok(one.distanceM > 100 && one.distanceM < 200, `distance ${one.distanceM}`)
  }
)

test('the answer carries no photo and no link that is not http(s)', opts, async () => {
  await setSwitches()
  const w = await world()
  const raw = await (await w.search(AT)).text()
  assert.ok(!/javascript:/i.test(raw), 'no javascript: anywhere')
  assert.ok(!raw.includes('photos/'), 'no photo name')
  const { candidates } = JSON.parse(raw)
  assert.ok(candidates.every((c) => c.photo === undefined || c.photo === null))
  // Provider text stays text: the view escapes it as React does every string.
  assert.equal(candidates[0].name, '<img src=x onerror=alert(1)> Pho & Co')
})

test('the capabilities door is read-only and offers nothing that costs per row', opts, async () => {
  await setSwitches()
  const w = await world()
  const res = await w.app.request('/find/api/capabilities')
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const caps = await res.json()
  assert.deepEqual(caps.maps, { browserKey: null })
  assert.deepEqual(caps.socialStats.providers, { rapidapi: false, youtube: false, apify: false })
  assert.deepEqual(caps.search.radiiM, [1000, 3000, 5000, 10000])
  assert.ok(Array.isArray(caps.kinds) && caps.kinds.includes('restaurants'))
  assert.equal(w.fetched.length, 0)
  assert.equal((await w.app.request('/find/api/capabilities', { method: 'POST' })).status, 404)
  await setSwitches({ publicFind: false })
  assert.equal((await w.app.request('/find/api/capabilities')).status, 404)
})

test('nothing Google returned is written to Postgres', opts, async () => {
  await setSwitches()
  const w = await world()
  assert.equal((await w.search(AT)).status, 200)
  for (const table of ['wo_opportunity', 'wo_place'])
    assert.equal((await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)
})

test(
  'either switch off: the API door answers 404 and calls nobody; the page sends the person to sign in',
  opts,
  async () => {
    for (const off of [{ wo: false }, { publicFind: false }]) {
      await setSwitches(off)
      const w = await world()
      const res = await w.search(AT)
      assert.equal(res.status, 404)
      assert.equal((await res.json()).code, 'FEATURE_OFF')
      assert.equal(w.fetched.length, 0)
      const page = await w.app.request('/find')
      assert.equal(page.status, 302)
      assert.equal(
        page.headers.get('location'),
        `/login?next=${encodeURIComponent('/new/?tab=tracy:website-opportunities&wo-view=find')}`
      )
    }
  }
)

test('on a shard the page and the door do not exist', opts, async () => {
  await setSwitches()
  const w = await world({ role: 'shard' })
  assert.equal((await w.app.request('/find')).status, 404)
  assert.equal((await w.search(AT)).status, 404)
  assert.equal(w.fetched.length, 0)
})

test('a search the door would not make is 400 and costs nothing', opts, async () => {
  await setSwitches()
  const w = await world()
  const bad = [
    { ...AT, radiusM: 2000 },
    { ...AT, radiusM: 50_000 },
    { lat: 91, lon: 0, radiusM: 1000 },
    { lat: '15', lon: 108, radiusM: 1000 },
    { radiusM: 1000 },
    { ...AT, query: 'Hoi An' },
    { ...AT, filters: {} },
    { ...AT, limit: 60 },
    { query: 'x'.repeat(201), radiusM: 1000 },
    { query: 'Hoi An', radiusM: 1000, pad: 'x'.repeat(2100) },
    '[]'
  ]
  for (const body of bad) {
    const res = await w.search(body)
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80))
    assert.equal((await res.json()).code, 'INVALID_SEARCH')
  }
  assert.equal(w.fetched.length, 0)
  // None of them counted against the person.
  for (let i = 0; i < 3; i++) assert.equal((await w.search(AT)).status, 200)
})

test('a body over 2 KB is refused before it is parsed', opts, async () => {
  await setSwitches()
  const w = await world()
  const res = await w.search(`{"radiusM":1000,"query":"${'a'.repeat(2100)}"}`)
  assert.equal(res.status, 400)
  assert.equal(w.fetched.length, 0)
})

test('a cross-site page cannot spend the budget', opts, async () => {
  await setSwitches()
  const w = await world()
  assert.equal((await w.search(AT, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  assert.equal((await w.search(AT, { headers: { 'sec-fetch-site': 'same-site' } })).status, 403)
  const form = await w.app.request('/find/api/search', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.7' },
    body: JSON.stringify(AT)
  })
  assert.equal(form.status, 415)
  assert.equal(w.fetched.length, 0)
  assert.equal((await w.search(AT, { headers: { 'sec-fetch-site': 'same-origin' } })).status, 200)
})

test(
  'one address may search 3 times a minute and 10 times an hour (when the operator sets those)',
  opts,
  async () => {
    await setSwitches()
    await tighten()
    const w = await world()
    for (let i = 0; i < 3; i++) assert.equal((await w.search(AT)).status, 200)
    const burst = await w.search(AT)
    assert.equal(burst.status, 429)
    assert.equal((await burst.json()).code, 'RATE_LIMITED')
    assert.equal(w.google().length, 3)
    for (let minute = 1; minute <= 3; minute++) {
      w.clock.now = NOW + minute * 60_000
      for (let i = 0; i < 3; i++) await w.search(AT)
    }
    // 4 + 9 asked within the hour; a refused ask counts too, so the 10th ask was the last answered.
    assert.equal(w.google().length, 9)
    w.clock.now = NOW + 3_600_000
    assert.equal((await w.search(AT)).status, 200)
    // Another address has its own count.
    w.clock.now = NOW + 30 * 60_000
    assert.equal((await w.search(AT, { ip: '198.51.100.9' })).status, 200)
  }
)

test('IPv6 addresses count per /64', opts, async () => {
  assert.equal(ipBucketOf('2001:db8:1:2:aaaa::1'), ipBucketOf('2001:0db8:0001:0002:ffff:1:2:3'))
  assert.notEqual(ipBucketOf('2001:db8:1:2::1'), ipBucketOf('2001:db8:1:3::1'))
  assert.equal(ipBucketOf('::ffff:203.0.113.7'), ipBucketOf('203.0.113.7'))
  assert.equal(ipBucketOf('not-an-ip'), 'unknown')
  await setSwitches()
  await tighten()
  const w = await world()
  for (let i = 0; i < 3; i++) await w.search(AT, { ip: `2001:db8:1:2::${i + 1}` })
  assert.equal((await w.search(AT, { ip: '2001:db8:1:2:ffff::9' })).status, 429)
  assert.equal((await w.search(AT, { ip: '2001:db8:1:3::1' })).status, 200)
})

test(
  'the whole deployment stops at the daily cap from /ops, and 0 closes the door without a call',
  opts,
  async () => {
    await setSwitches()
    await saveWoOpsSettings(db.pool, { publicFindSearchesPerDay: 2, placesCacheDays: 0 }, 'test')
    const w = await world()
    assert.equal((await w.search(AT, { ip: '198.51.100.1' })).status, 200)
    assert.equal((await w.search(AT, { ip: '198.51.100.2' })).status, 200)
    const third = await w.search(AT, { ip: '198.51.100.3' })
    assert.equal(third.status, 429)
    assert.equal((await third.json()).code, 'DAILY_LIMIT')
    assert.equal(w.google().length, 2)
    await saveWoOpsSettings(db.pool, { publicFindSearchesPerDay: 0, placesCacheDays: 0 }, 'test')
    const closed = await w.search(AT, { ip: '198.51.100.4' })
    assert.equal(closed.status, 429)
    assert.equal((await closed.json()).code, 'CLOSED')
    assert.equal(w.google().length, 2)
  }
)

test(
  'the whole deployment makes at most 20 Google searches a minute (when the operator sets that)',
  opts,
  async () => {
    await setSwitches()
    await tighten()
    const w = await world()
    for (let i = 0; i < 20; i++) assert.equal((await w.search(AT, { ip: `198.51.100.${i + 1}` })).status, 200)
    const res = await w.search(AT, { ip: '198.51.100.99' })
    assert.equal(res.status, 429)
    assert.equal((await res.json()).code, 'BUSY')
    assert.equal(w.google().length, 20)
  }
)

test('a failed Google call keeps its reserved count and falls back to nothing that costs', opts, async () => {
  await setSwitches()
  await saveWoOpsSettings(db.pool, { publicFindSearchesPerDay: 1 }, 'test')
  const w = await world({ google: () => new Response('boom', { status: 500 }) })
  const res = await w.search(AT)
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'DISCOVERY_FAILED')
  // One Google call, and no Apify, Overpass or second Google call after it.
  assert.deepEqual(
    w.fetched.map((f) => f.href),
    ['https://places.googleapis.com/v1/places:searchNearby']
  )
  const next = await w.search(AT, { ip: '198.51.100.5' })
  assert.equal((await next.json()).code, 'DAILY_LIMIT')
})

test('no Google key: 503 before anything is counted', opts, async () => {
  await setSwitches()
  const w = await world({ googleKey: null })
  const res = await w.search(AT)
  assert.equal(res.status, 503)
  assert.equal(w.fetched.length, 0)
})

test('a typed area is geocoded by Nominatim once, then from the cache', opts, async () => {
  await setSwitches()
  const w = await world()
  const res = await w.search({ query: '  Hoi An ', radiusM: 1000 })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.center, { lat: 15.88, lon: 108.33, label: 'Hoi An, Vietnam' })
  assert.equal(w.nominatimCalls().length, 1)
  assert.match(w.nominatimCalls()[0].href, /q=Hoi%20An$/)
  w.clock.now += 60_000
  assert.equal((await w.search({ query: 'hoi an', radiusM: 1000 })).status, 200)
  assert.equal(w.nominatimCalls().length, 1, 'the second ask is served from the cache')
})

test('Nominatim is asked at most once a second across the whole app', opts, async () => {
  await setSwitches()
  const w = await world()
  await w.search({ query: 'Hoi An', radiusM: 1000 }, { ip: '198.51.100.1' })
  await w.search({ query: 'Da Nang', radiusM: 1000 }, { ip: '198.51.100.2' })
  assert.equal(w.nominatimCalls().length, 2)
  // The second waited for the next second instead of asking inside the first one's.
  assert.equal(w.slept.reduce((a, b) => a + b, 0) >= 1000 - (NOW % 1000), true)
  assert.equal(w.slept.length, 1)
})

test('an area the map does not know is 404 and Google is not called', opts, async () => {
  await setSwitches()
  const w = await world({ nominatim: () => Response.json([]) })
  const res = await w.search({ query: 'Nowhere at all', radiusM: 1000 })
  assert.equal(res.status, 404)
  assert.equal((await res.json()).code, 'PLACE_NOT_FOUND')
  assert.equal(w.google().length, 0)
})

test(
  'the built page and its assets are served with their own types; an unknown door is JSON 404',
  opts,
  async () => {
    await setSwitches()
    const w = await world()
    for (const at of ['/find', '/find/']) {
      const page = await w.app.request(at, { headers: { accept: 'text/html' } })
      assert.equal(page.status, 200, at)
      assert.match(page.headers.get('content-type'), /^text\/html/)
      assert.match(await page.text(), /id="root"/)
    }
    const js = await w.app.request('/find/find-assets/index-a1.js')
    assert.equal(js.status, 200)
    assert.match(js.headers.get('content-type'), /javascript/)
    assert.match(
      (await w.app.request('/find/find-assets/index-a1.css')).headers.get('content-type'),
      /^text\/css/
    )
    assert.equal((await w.app.request('/find/find-assets/missing.js')).status, 404)
    for (const door of ['/find/api/nope', '/find/api/search']) {
      const res = await w.app.request(door, { headers: { accept: 'text/html' } })
      assert.equal(res.status, 404, door)
      assert.match(res.headers.get('content-type'), /application\/json/, door)
    }
  }
)

/** `/find` for one visitor: its status and where it sends them. */
async function visit(w, cookie, at = '/find?wo-at=1,2&wo-radius=3000&wo-pick=a,b&utm_source=fb&lang=vi&x=1') {
  const res = await w.app.request(at, { headers: { accept: 'text/html', ...(cookie ? { cookie } : {}) } })
  return {
    status: res.status,
    location: res.headers.get('location'),
    cache: res.headers.get('cache-control')
  }
}

test(
  'a signed-in visitor, or one a shard holds, goes straight to the full Find; the matrix of switches and sessions',
  opts,
  async () => {
    const secret = 's'.repeat(32)
    const signedInFind = '/new/?tab=tracy:website-opportunities&wo-view=find'
    const kept = 'wo-at=1%2C2&wo-radius=3000&wo-pick=a%2Cb&utm_source=fb'
    const live = `${SESSION_COOKIE}=${await mintSession('lee@tracy.test', secret)}`
    const expired = `${SESSION_COOKIE}=${await mintSession('lee@tracy.test', secret, NOW - 400 * 86_400_000)}`
    const pointer = `${shardCookieName(false)}=shard-a`
    for (const switches of [{}, { publicFind: false }, { wo: false }]) {
      await setSwitches(switches)
      const open = switches.publicFind !== false && switches.wo !== false
      const w = await world()
      for (const cookie of [live, pointer]) {
        const v = await visit(w, cookie)
        assert.equal(v.status, 302, JSON.stringify(switches))
        assert.equal(v.location, `${signedInFind}&${kept}`)
        assert.equal(v.cache, 'no-store')
      }
      for (const cookie of [null, expired]) {
        const v = await visit(w, cookie)
        if (open) assert.equal(v.status, 200, 'a stranger sees the page')
        else {
          assert.equal(v.status, 302)
          assert.equal(v.location, `/login?next=${encodeURIComponent(`${signedInFind}&${kept}`)}`)
        }
      }
      // Assets are never redirected, whoever asks.
      assert.notEqual(
        (await w.app.request('/find/find-assets/index-a1.js', { headers: { cookie: live } })).status,
        302
      )
    }
    const shard = await world({ role: 'shard' })
    assert.equal((await visit(shard, live)).status, 404)
  }
)

test(
  'mounted in the app, /find answers a visitor with no cookie, before the dsh catch-all',
  opts,
  async () => {
    const { buildApp } = await import('../src/app.js')
    const { readConfig } = await import('../src/config.js')
    await setSwitches()
    const config = readConfig({
      TRACY_ORIGIN: 'http://tracy.test:8080',
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      GOOGLE_PLACES_API_KEY: 'g-key'
    })
    const asked = []
    const app = buildApp({
      config,
      pool: db.pool,
      mail: { send: async () => {} },
      dnsResolve: PUBLIC,
      woFindPageRoot: ROOT,
      fetchImpl: async (input) => {
        const href = typeof input === 'string' ? input : input.url
        asked.push(href)
        if (href.startsWith('https://places.googleapis.com/')) return Response.json(PLACES)
        throw new Error(`unexpected fetch ${href}`)
      }
    })
    const page = await app.request('http://tracy.test:8080/find', { headers: { accept: 'text/html' } })
    assert.equal(page.status, 200)
    assert.match(await page.text(), /id="root"/)
    const res = await app.request('http://tracy.test:8080/find/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
      body: JSON.stringify(AT)
    })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).candidates.length, 3)
    assert.deepEqual(asked, ['https://places.googleapis.com/v1/places:searchNearby'])
  }
)

const STAND_ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k',
  GOOGLE_PLACES_API_KEY: 'g-key'
}

test('the public search asks Google exactly what the signed-in default area search asks', opts, async () => {
  const { buildApp } = await import('../src/app.js')
  const { readConfig } = await import('../src/config.js')
  const { mintSession, SESSION_COOKIE } = await import('../src/lib/session.js')
  await setSwitches()
  const config = readConfig(STAND_ENV)
  const bodies = []
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    dnsResolve: PUBLIC,
    fetchImpl: async (input, init = {}) => {
      const href = typeof input === 'string' ? input : input.url
      if (href.startsWith('https://places.googleapis.com/')) {
        bodies.push({ href, body: JSON.parse(String(init.body)) })
        return Response.json(PLACES)
      }
      throw new Error(`unexpected fetch ${href}`)
    }
  })
  // Both Finds share one cache (`website-opportunities/src/places-cache.js`): with it on, the public search after the
  // signed-in one is the same request and costs nothing; with it off, Google sees the same request twice.
  for (const [radiusM, cacheDays] of [
    [3000, 0],
    [10_000, 0],
    [3000, 183],
    [5000, 183]
  ]) {
    await saveWoOpsSettings(db.pool, { placesCacheDays: cacheDays }, 'test')
    bodies.length = 0
    const cookie = `${SESSION_COOKIE}=${await mintSession(`p${radiusM}c${cacheDays}@tracy.test`, config.sessionSecret)}`
    const signedIn = await app.request('http://tracy.test:8080/api/website-opportunities/search', {
      method: 'POST',
      headers: { cookie, origin: 'http://tracy.test:8080', 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 15.88, lon: 108.33, radiusM })
    })
    assert.equal(signedIn.status, 200)
    const signedInIds = (await signedIn.json()).candidates.map((c) => c.providerId)
    const publicRes = await app.request('http://tracy.test:8080/find/api/search', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `203.0.113.${radiusM / 1000 + cacheDays}`
      },
      body: JSON.stringify({ lat: 15.88, lon: 108.33, radiusM })
    })
    assert.equal(publicRes.status, 200)
    const publicIds = (await publicRes.json()).candidates.map((p) => p.providerId)
    // The signed-in search may page further; its first page and the public one are one request.
    if (cacheDays === 0) {
      assert.equal(bodies.length, 2, `radius ${radiusM}`)
      assert.deepEqual(bodies[1], bodies[0], `radius ${radiusM}`)
    } else
      assert.equal(
        bodies.length,
        1,
        `radius ${radiusM}: the public search was answered from the shared cache`
      )
    assert.deepEqual(publicIds, signedInIds, `radius ${radiusM}`)
    assert.ok(!publicIds.includes('ChIJ-chain'))
  }
})

test('built with no dnsResolve, as in production, the public doors still resolve hosts', opts, async () => {
  const dns = (await import('node:dns/promises')).default
  const { syncBuiltinESMExports } = await import('node:module')
  const { mock } = await import('node:test')
  const looked = []
  const lookup = mock.method(dns, 'lookup', async (host) => {
    looked.push(host)
    return [{ address: '93.184.216.34', family: 4 }]
  })
  syncBuiltinESMExports()
  try {
    const { buildApp } = await import('../src/app.js')
    const { readConfig } = await import('../src/config.js')
    await setSwitches()
    const asked = []
    const app = buildApp({
      config: readConfig(STAND_ENV),
      pool: db.pool,
      mail: { send: async () => {} },
      fetchImpl: async (input) => {
        const href = typeof input === 'string' ? input : input.url
        asked.push(href)
        if (href.startsWith('https://places.googleapis.com/')) return Response.json(PLACES)
        throw new Error(`unexpected fetch ${href}`)
      }
    })
    const res = await app.request('http://tracy.test:8080/find/api/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.60' },
      body: JSON.stringify(AT)
    })
    assert.equal(res.status, 200)
    assert.deepEqual(looked, ['places.googleapis.com'])
    assert.deepEqual(asked, ['https://places.googleapis.com/v1/places:searchNearby'])
  } finally {
    lookup.mock.restore()
    syncBuiltinESMExports()
  }
})

test('a short page with a next-page token still costs exactly one Google request', opts, async () => {
  await setSwitches()
  const w = await world({ google: () => Response.json({ ...PLACES, nextPageToken: 'more' }) })
  const res = await w.search(AT)
  assert.equal(res.status, 200)
  assert.equal(w.google().length, 1)
  assert.equal(w.google()[0].body.pageToken, undefined)
})

test(
  'the door reads its limits live: a changed setting changes the answer without a restart',
  opts,
  async () => {
    await setSwitches()
    await tighten({ publicFindSearchesPerAddressMinute: 1 })
    const w = await world()
    assert.equal((await w.search(AT)).status, 200)
    assert.equal((await w.search(AT)).status, 429)
    await tighten({ publicFindSearchesPerAddressMinute: 5 })
    assert.equal((await w.search(AT)).status, 200, 'the same router, a raised limit')
    await tighten({ publicFindSearchesPerAddressMinute: 5, publicFindSearchesPerMinute: 1 })
    const busy = await w.search(AT, { ip: '198.51.100.77' })
    assert.equal((await busy.json()).code, 'BUSY')
  }
)

test('the defaults are generous: 10 searches a minute from one address', opts, async () => {
  await setSwitches()
  const w = await world()
  for (let i = 0; i < 10; i++) assert.equal((await w.search(AT)).status, 200, `search ${i + 1}`)
  assert.equal((await w.search(AT)).status, 429)
})

/** Published shared research for one Google place, as the research pipeline leaves it. */
async function publishResearch(providerId, profile, at = '2026-10-20T10:00:00Z') {
  const { pool } = db
  const place = (await pool.query('insert into wo_place default values returning id')).rows[0].id
  await pool.query(
    "insert into wo_place_identity(namespace,external_id,place_id,source) values('google',$1,$2,'test')",
    [providerId, place]
  )
  const snap = (
    await pool.query(
      "insert into wo_place_snapshot(place_id,state,published_at) values($1,'preparing',$2) returning id",
      [place, at]
    )
  ).rows[0].id
  await pool.query('insert into wo_place_snapshot_profile(snapshot_id,profile) values($1,$2)', [
    snap,
    profile
  ])
  await pool.query(
    "insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected_at) values($1,'website',$2,'complete',$3)",
    [snap, profile.website ?? 'https://x.example/', at]
  )
  await pool.query("update wo_place_snapshot set state='published' where id=$1", [snap])
  await pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [place, snap])
  return place
}

test(
  'a place with published shared research shows it: researched, its website check and its socials',
  opts,
  async () => {
    await setSwitches()
    await publishResearch('ChIJ-two', {
      name: 'Banh Mi Two',
      website: 'https://banhmi.example/',
      phone: '+84 1',
      socials: { facebook: 'https://www.facebook.com/banhmitwo' },
      pageSpeed: { performance: 31, mobileFriendly: false, checkedAt: '2026-10-20T10:00:00Z' }
    })
    const w = await world()
    const { candidates } = await (await w.search(AT)).json()
    const two = candidates.find((c) => c.providerId === 'ChIJ-two')
    assert.equal(two.status, 'researched')
    assert.deepEqual(two.research, { researchedAt: '2026-10-20T10:00:00.000Z', canBuild: true })
    assert.equal(two.siteCheck.status, 'done')
    assert.equal(two.siteCheck.performance, 31)
    assert.equal(two.socials.facebook, 'https://www.facebook.com/banhmitwo')
    assert.equal(two.findAction, undefined, 'no action for a stranger')
    const one = candidates.find((c) => c.providerId === 'ChIJ-one')
    assert.equal(one.status, 'new')
    assert.equal(one.research, null)
    assert.equal(w.google().length, 1, 'the research lookup costs no provider call')
  }
)

test(
  'one account’s own opportunity, profile, build and demo action never reach the anonymous answer',
  opts,
  async () => {
    await setSwitches()
    const { pool } = db
    const place = await publishResearch('ChIJ-two', {
      name: 'Banh Mi Two',
      website: 'https://banhmi.example/'
    })
    const account = (await pool.query("insert into account(email) values('owner@tracy.test') returning id"))
      .rows[0].id
    const opp = (
      await pool.query(
        "insert into wo_opportunity(account_id,name,provider,provider_id,place_id) values($1,'Banh Mi Two','google-places','ChIJ-two',$2) returning id",
        [account, place]
      )
    ).rows[0].id
    await pool.query('insert into wo_profile(opportunity_id,profile) values($1,$2)', [
      opp,
      { name: 'SECRET NAME', email: 'secret@private.example', phone: '+00 secret' }
    ])
    await pool.query(
      "insert into wo_job(opportunity_id,account_id,kind,state,request_id) values($1,$2,'research','completed','job-secret')",
      [opp, account]
    )
    const rev = (
      await pool.query(
        `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, '{}'::jsonb, 'secret brief') returning id`,
        [opp, account]
      )
    ).rows[0].id
    await pool.query(
      "insert into site (site_key, label, host, platform) values ('secret-demo.localhost','secret-demo','local','joomla')"
    )
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, choice, choice_key)
     values ($1, $2, 'req-secret', gen_random_uuid(), 'secret-demo.localhost', 'completed',
       '{"cms":"joomla","cmsSource":"default","template":{}}'::jsonb, 'joomla||||')`,
      [account, rev]
    )
    await pool.query(
      `insert into wo_demo_action (account_id, opportunity_id, request_id, fingerprint, accepted_at, revision_id,
       build_request_id, session_id, queued_at) values ($1,$2,'act-secret','fp',now(),$3,'req-secret','session-secret',now())`,
      [account, opp, rev]
    )
    const w = await world()
    const raw = await (await w.search(AT)).text()
    for (const secret of [
      opp,
      rev,
      account,
      'secret-demo',
      'SECRET NAME',
      'secret@private',
      '+00 secret',
      'session-secret',
      'opportunityId',
      'siteKey',
      'findAction'
    ])
      assert.ok(!raw.includes(secret), `the answer leaks ${secret}`)
    const two = JSON.parse(raw).candidates.find((c) => c.providerId === 'ChIJ-two')
    assert.equal(two.status, 'researched', 'only the published research shows')
  }
)

const SESSION = '11111111-2222-4333-8444-555555555555'
const suggest = (w, q, { ip = '203.0.113.9', session = SESSION } = {}) =>
  w.app.request(`/find/api/places/suggest?q=${encodeURIComponent(q)}&session=${session}&lang=en`, {
    headers: { 'cf-connecting-ip': ip }
  })
const resolvePick = (w, placeId, { ip = '203.0.113.9', session = SESSION } = {}) =>
  w.app.request(`/find/api/places/suggest/${placeId}?session=${session}`, {
    headers: { 'cf-connecting-ip': ip }
  })

test(
  'the public place box: one Autocomplete call with the typing session, then one Place Details on a pick',
  opts,
  async () => {
    await setSwitches()
    const w = await world()
    const res = await suggest(w, 'downtown')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const { suggestions } = await res.json()
    assert.deepEqual(
      suggestions.map((x) => x.placeId),
      ['ChIJ-downtown']
    )
    assert.equal(w.fetched.length, 1)
    assert.equal(w.fetched[0].href, 'https://places.googleapis.com/v1/places:autocomplete')
    assert.equal(w.fetched[0].body.sessionToken, SESSION)
    const pick = await resolvePick(w, 'ChIJ-downtown')
    assert.deepEqual(await pick.json(), { label: 'Downtown Dubai, UAE', lat: 25.1972, lon: 55.2744 })
    assert.match(w.fetched[1].href, /places\/ChIJ-downtown\?sessionToken=/)
    for (const table of ['wo_opportunity', 'wo_place'])
      assert.equal((await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)
  }
)

test(
  'the public place box checks what the signed-in one checks, and a short word asks nobody',
  opts,
  async () => {
    await setSwitches()
    const w = await world()
    assert.deepEqual(await (await suggest(w, 'do')).json(), { suggestions: [] })
    assert.equal((await suggest(w, 'downtown', { session: 'not-a-uuid' })).status, 400)
    assert.equal((await suggest(w, 'x'.repeat(201))).status, 400)
    assert.equal((await resolvePick(w, 'bad!id')).status, 400)
    assert.equal(w.fetched.length, 0)
    for (const off of [{ wo: false }, { publicFind: false }]) {
      await setSwitches(off)
      const res = await suggest(w, 'downtown')
      assert.equal(res.status, 404)
      assert.equal((await res.json()).code, 'FEATURE_OFF')
    }
    await setSwitches()
    const shard = await world({ role: 'shard' })
    assert.equal((await suggest(shard, 'downtown')).status, 404)
    assert.equal(w.fetched.length + shard.fetched.length, 0)
  }
)

test(
  'the place box fences are reserved before Google, from the operator settings, and refuse the way the box understands',
  opts,
  async () => {
    await setSwitches()
    await saveWoOpsSettings(
      db.pool,
      {
        publicFindSuggestPerAddressMinute: 2,
        publicFindSuggestPerMinute: 3,
        publicFindSuggestPerDay: 4,
        placesCacheDays: 0
      },
      'test'
    )
    const w = await world()
    assert.equal((await suggest(w, 'downtown')).status, 200)
    assert.equal((await suggest(w, 'downtown')).status, 200)
    const own = await suggest(w, 'downtown')
    assert.equal(own.status, 429)
    assert.equal((await own.json()).code, 'RATE_LIMITED')
    assert.equal((await suggest(w, 'downtown', { ip: '198.51.100.20' })).status, 200)
    const busy = await suggest(w, 'downtown', { ip: '198.51.100.21' })
    assert.equal((await busy.json()).code, 'BUSY')
    assert.equal(w.fetched.length, 3, 'a refused ask reaches no provider')
    w.clock.now += 60_000
    assert.equal((await suggest(w, 'downtown', { ip: '198.51.100.22' })).status, 200)
    const day = await suggest(w, 'downtown', { ip: '198.51.100.23' })
    assert.equal((await day.json()).code, 'DAILY_LIMIT')
    await saveWoOpsSettings(db.pool, { publicFindSuggestPerDay: 0 }, 'test')
    const closed = await resolvePick(w, 'ChIJ-downtown', { ip: '198.51.100.24' })
    assert.equal((await closed.json()).code, 'CLOSED')
    assert.equal(w.fetched.length, 4)
    // The search keeps its own budget: a spent suggestion day does not stop searching.
    assert.equal((await w.search(AT, { ip: '198.51.100.25' })).status, 200)
  }
)

const cacheRows = async () =>
  (await db.pool.query('select key, answer from wo_places_cache order by key')).rows

test(
  'a search kept in the cache answers the next visitor in the same cell with no Google call and no deployment budget',
  opts,
  async () => {
    await setSwitches()
    await saveWoOpsSettings(db.pool, { publicFindSearchesPerDay: 1 }, 'test')
    const w = await world()
    const first = await (await w.search(AT, { ip: '198.51.100.31' })).json()
    // 100 m away, same 600 m cell of a 3 km search: the same answer, distances from where this visitor is.
    const near = { lat: 15.8809, lon: 108.33, radiusM: 3000 }
    const res = await w.search(near, { ip: '198.51.100.32' })
    assert.equal(res.status, 200, 'the day cap of 1 is not spent by a cache hit')
    const second = await res.json()
    assert.equal(w.google().length, 1)
    assert.deepEqual(
      second.candidates.map((c) => c.providerId),
      first.candidates.map((c) => c.providerId)
    )
    assert.deepEqual(second.center, { lat: 15.8809, lon: 108.33, label: null })
    assert.notEqual(
      second.candidates[0].distanceM,
      first.candidates[0].distanceM,
      'distance from this visitor'
    )
    // Another cell, another radius: a fresh call (here refused by the spent day cap, before Google).
    assert.equal((await w.search({ ...AT, radiusM: 5000 }, { ip: '198.51.100.33' })).status, 429)
    assert.equal(w.google().length, 1)
    // Nothing of an account in the cache: Google's rows only.
    const rows = await cacheRows()
    assert.equal(rows.length, 1)
    assert.match(rows[0].key, /^[0-9a-f]{64}$/, 'a hash of the request, no API key or session in it')
    assert.ok(!JSON.stringify(rows[0].answer).includes('findAction'))
  }
)

test(
  'research shows live on a cache hit, an expired answer is asked again, and 0 days keeps nothing',
  opts,
  async () => {
    await setSwitches()
    await saveWoOpsSettings(db.pool, { placesCacheDays: 1 }, 'test')
    const w = await world()
    await w.search(AT)
    await publishResearch('ChIJ-two', { name: 'Banh Mi Two', website: 'https://banhmi.example/' })
    const hit = await (await w.search(AT)).json()
    assert.equal(w.google().length, 1)
    assert.equal(hit.candidates.find((c) => c.providerId === 'ChIJ-two').status, 'researched')
    w.clock.now += 2 * 86_400_000
    await w.search(AT)
    assert.equal(w.google().length, 2, 'past its days the answer is asked again')
    await saveWoOpsSettings(db.pool, { placesCacheDays: 0 }, 'test')
    await db.pool.query('delete from wo_places_cache')
    await w.search(AT)
    await w.search(AT)
    assert.equal(w.google().length, 4)
    assert.equal((await cacheRows()).length, 0)
  }
)

test(
  'the place box keeps its suggestions and picks too: the same words and the same pick ask Google once',
  opts,
  async () => {
    await setSwitches()
    await saveWoOpsSettings(db.pool, { publicFindSuggestPerMinute: 1 }, 'test')
    const w = await world()
    assert.equal((await suggest(w, 'Downtown ', { ip: '198.51.100.41' })).status, 200)
    const again = await suggest(w, 'downtown', { ip: '198.51.100.42' })
    assert.equal(again.status, 200, 'a hit spends no deployment budget')
    assert.deepEqual(
      (await again.json()).suggestions.map((x) => x.placeId),
      ['ChIJ-downtown']
    )
    w.clock.now += 60_000
    await resolvePick(w, 'ChIJ-downtown', { ip: '198.51.100.43' })
    w.clock.now += 60_000
    assert.deepEqual(await (await resolvePick(w, 'ChIJ-downtown', { ip: '198.51.100.44' })).json(), {
      label: 'Downtown Dubai, UAE',
      lat: 25.1972,
      lon: 55.2744
    })
    assert.deepEqual(
      w.fetched.map((f) => f.href.replace(/\?.*/, '')),
      [
        'https://places.googleapis.com/v1/places:autocomplete',
        'https://places.googleapis.com/v1/places/ChIJ-downtown'
      ]
    )
  }
)

test('a fixed cache cell from /ops widens what one answer covers', opts, async () => {
  await setSwitches()
  await saveWoOpsSettings(db.pool, { placesCacheCellMeters: 10_000 }, 'test')
  const w = await world()
  await w.search(AT, { ip: '198.51.100.51' })
  // About 2 km away: another cell at the automatic size (600 m for 3 km), the same 10 km cell here.
  await w.search({ lat: 15.898, lon: 108.33, radiusM: 3000 }, { ip: '198.51.100.52' })
  assert.equal(w.google().length, 1)
})
