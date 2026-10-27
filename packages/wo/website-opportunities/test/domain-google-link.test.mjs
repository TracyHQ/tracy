import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isGoogleHost,
  matchGooglePlace,
  namesMatch,
  parseGoogleLink,
  resolveShortLink
} from '../domain/google-link.mjs'

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]

test('parse: place id, cid, coordinates, kgmid and the searched words', () => {
  const byId = parseGoogleLink(
    'https://www.google.com/maps/search/?api=1&query=Tennis&query_place_id=ChIJN1t_tDeuEmsRUsoyG83frY4'
  )
  assert.equal(byId.placeId, 'ChIJN1t_tDeuEmsRUsoyG83frY4')
  assert.equal(byId.q, 'Tennis')
  assert.equal(byId.short, false)

  const byCid = parseGoogleLink('https://maps.google.com/?cid=12345678901234567890')
  assert.equal(byCid.cid, '12345678901234567890')

  const place = parseGoogleLink(
    'https://www.google.com/maps/place/Padel+%26+Tennis+Coach/@25.0123,55.2456,17z/data=!4m6!3m5!1s0x3e5f6d:0x1a2b3c!8m2'
  )
  assert.equal(place.q, 'Padel & Tennis Coach')
  assert.equal(place.lat, 25.0123)
  assert.equal(place.lng, 55.2456)
  assert.equal(place.cid, BigInt('0x1a2b3c').toString())

  const search = parseGoogleLink(
    'https://www.google.com/search?kgmid=/g/11yq3jy7tp&q=Padel+%26+Tennis+Coach&shem=abc'
  )
  assert.equal(search.kgmid, '/g/11yq3jy7tp')
  assert.equal(search.q, 'Padel & Tennis Coach')

  const short = parseGoogleLink('https://share.google/hscFakeLink01')
  assert.equal(short.short, true)
  assert.equal(short.q, undefined)
  // Google's own relay is a hop too, and its `q` is the short link, not words.
  const relay = parseGoogleLink('https://www.google.com/share.google?q=https://share.google/hscFakeLink01')
  assert.equal(relay.short, true)
  assert.equal(relay.q, undefined)

  assert.equal(parseGoogleLink('https://example.com/maps/place/X'), null)
  assert.equal(parseGoogleLink('not a link'), null)
  assert.equal(isGoogleHost('maps.app.goo.gl'), true)
  assert.equal(isGoogleHost('google.evil.com'), false)
})

/** A fetch that answers each URL from `routes` and records what was asked, which bodies were read and cancelled. */
function fakeFetch(routes) {
  const asked = []
  let bodiesRead = 0
  let cancelled = 0
  const read = () => {
    bodiesRead += 1
    throw new Error('the body must never be read')
  }
  const fetch = async (url, init) => {
    asked.push({ url, redirect: init.redirect })
    const route = routes[url]
    if (!route) throw new Error(`unexpected ${url}`)
    return {
      status: route.status,
      headers: new Headers(route.location ? { location: route.location } : {}),
      body: {
        getReader: read,
        cancel: async () => {
          cancelled += 1
        }
      },
      text: read,
      json: read,
      arrayBuffer: read
    }
  }
  return { fetch, asked, bodiesRead: () => bodiesRead, cancelled: () => cancelled }
}

test('resolveShortLink follows Location headers only, Google hosts only, and never reads a body', async () => {
  const net = fakeFetch({
    'https://share.google/hscFakeLink01': {
      status: 302,
      location: 'https://www.google.com/share.google?q=hscFakeLink01'
    },
    'https://www.google.com/share.google?q=hscFakeLink01': {
      status: 301,
      location: '/search?kgmid=/g/11yq3jy7tp&q=Padel+%26+Tennis+Coach'
    }
  })
  const out = await resolveShortLink('https://share.google/hscFakeLink01', {
    fetch: net.fetch,
    resolve: PUBLIC
  })
  assert.equal(out.url, 'https://www.google.com/search?kgmid=/g/11yq3jy7tp&q=Padel+%26+Tennis+Coach')
  assert.equal(out.hops, 2)
  // The final search page is not fetched at all; the hops were manual redirects.
  assert.deepEqual(
    net.asked.map((a) => a.redirect),
    ['manual', 'manual']
  )
  assert.equal(net.bodiesRead(), 0)
  assert.equal(net.cancelled(), 2)
  assert.equal(parseGoogleLink(out.url).q, 'Padel & Tennis Coach')
})

test('resolveShortLink refuses a hop that leaves Google, and a private address', async () => {
  const away = fakeFetch({
    'https://maps.app.goo.gl/abc': { status: 302, location: 'https://evil.example/collect' }
  })
  await assert.rejects(
    resolveShortLink('https://maps.app.goo.gl/abc', { fetch: away.fetch, resolve: PUBLIC }),
    (e) => e.code === 'GOOGLE_LINK_FOREIGN'
  )
  assert.equal(away.asked.length, 1)
  const inside = fakeFetch({ 'https://g.page/x': { status: 302, location: 'https://www.google.com/maps' } })
  await assert.rejects(
    resolveShortLink('https://g.page/x', {
      fetch: inside.fetch,
      resolve: async () => [{ address: '127.0.0.2', family: 4 }]
    }),
    (e) => e.code === 'URL_BLOCKED'
  )
  assert.equal(inside.asked.length, 0)
  await assert.rejects(
    resolveShortLink('https://example.com/x', { fetch: inside.fetch, resolve: PUBLIC }),
    (e) => e.code === 'GOOGLE_LINK_FOREIGN'
  )
})

const COACH = {
  providerId: 'ChIJcoach',
  name: 'Padel & Tennis Coach',
  lat: 25.0123,
  lon: 55.2456,
  phone: '+971 50 123 4567',
  mapsUrl: 'https://maps.google.com/?cid=111'
}
const OTHER = {
  providerId: 'ChIJother',
  name: 'Padel and Tennis Coach Academy',
  lat: 25.2,
  lon: 55.3,
  mapsUrl: 'https://maps.google.com/?cid=222'
}

test('match: a place id or cid is exact; a name with a nearby listing or its phone is one place', () => {
  assert.equal(
    matchGooglePlace({ candidates: [OTHER, COACH], parsed: { placeId: 'ChIJcoach' } }).match.providerId,
    'ChIJcoach'
  )
  assert.equal(
    matchGooglePlace({ candidates: [OTHER, COACH], parsed: { cid: '222' } }).match.providerId,
    'ChIJother'
  )
  const near = matchGooglePlace({
    candidates: [OTHER, COACH],
    parsed: { q: 'Padel & Tennis Coach' },
    hints: [{ name: 'Padel & Tennis Coach', lat: 25.0125, lng: 55.2457 }]
  })
  assert.equal(near.match.providerId, 'ChIJcoach')
  const phoned = matchGooglePlace({
    candidates: [OTHER, COACH],
    parsed: { q: 'Padel Tennis Coach' },
    hints: [{ name: 'Padel & Tennis Coach', phone: '050 123 4567' }]
  })
  assert.equal(phoned.match.providerId, 'ChIJcoach')
  // The typed name equal to exactly one result.
  assert.equal(
    matchGooglePlace({ candidates: [OTHER, COACH], parsed: {}, typedName: 'padel & tennis coach' }).match
      .providerId,
    'ChIJcoach'
  )
})

test('match: never guesses; two candidates without proof are ambiguous, none is none', () => {
  const two = matchGooglePlace({ candidates: [OTHER, COACH], parsed: { q: 'Tennis Padel' } })
  assert.deepEqual(
    two.ambiguous.map((c) => c.providerId),
    ['ChIJother', 'ChIJcoach']
  )
  // One result alone, with no coordinate, phone or typed name: still asked, never taken silently.
  assert.equal(matchGooglePlace({ candidates: [COACH], parsed: { q: 'Coach' } }).ambiguous.length, 1)
  // Far from the listing: not proof.
  const far = matchGooglePlace({
    candidates: [COACH],
    parsed: { q: 'Padel & Tennis Coach' },
    hints: [{ name: 'Padel & Tennis Coach', lat: 25.1, lng: 55.3 }]
  })
  assert.ok(far.ambiguous)
  assert.deepEqual(matchGooglePlace({ candidates: [], parsed: { q: 'x' } }), { none: true })
  const many = Array.from({ length: 9 }, (_, i) => ({ ...OTHER, providerId: `ChIJ${i}` }))
  assert.equal(matchGooglePlace({ candidates: many, parsed: {} }).ambiguous.length, 5)
  assert.equal(namesMatch('Padel & Tennis Coach', 'padel and tennis coach'), true)
  assert.equal(namesMatch('Gym', 'Gold Gym Dubai'), false)
})
