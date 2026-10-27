// Several links of one business (`website-opportunities/src/link-fields.js`), through the real doors:
// `POST /api/website-opportunities` and Build from my business `POST /api/sites/from-business`. The network is
// fake: Google's short link and Text Search are domain functions replaced here, the listing page is served by the
// app's own fetch. Nothing here calls Google.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { sealSecret } from '../src/lib/secret-box.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { privateRefsDue } from 'website-opportunities/src/places.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const BASE = '/api/website-opportunities'
const OWN = '/api/sites/from-business'
const A = 'a@tracy.test'

// The three links of the real test case (26/10/2026).
const SHARE = 'https://share.google/hscFakeLink01'
const MAGICPIN = 'https://magicpin.com/uae/Dubai/Al-Barsha/Fitness/Padel-and-Tennis-Coach/store/1000001'
const INSTA = 'https://www.instagram.com/harbour.sportclub?mdxt=ZmFrZW1keHQ'
const RESOLVED = 'https://www.google.com/search?kgmid=/g/11yq3jy7tp&q=Padel+%26+Tennis+Coach'

const PAGE = `<html><head>
<script type="application/ld+json">{"@type":"Organization","name":"magicpin","sameAs":["https://www.facebook.com/mymagicpin"]}</script>
<script type="application/ld+json">{"@type":"ExerciseGym","name":"Padel & Tennis Coach","telephone":"+971 50 123 4567",
"address":{"streetAddress":"Al Barsha","addressLocality":"Dubai"},"geo":{"latitude":25.0123,"longitude":55.2456},
"aggregateRating":{"ratingValue":4.8,"reviewCount":37}}</script></head>
<body><a href="https://www.instagram.com/mymagicpin">magicpin</a></body></html>`

const COACH = {
  provider: 'google-places',
  providerId: 'ChIJcoachBarsha',
  name: 'Padel & Tennis Coach',
  address: 'Al Barsha, Dubai',
  phone: '+971 50 123 4567',
  lat: 25.0124,
  lon: 55.2455,
  rating: 4.9,
  category: 'Sports coach',
  trade: 'fitness',
  mapsUrl: 'https://maps.google.com/?cid=111',
  socials: {}
}
const ELSEWHERE = {
  ...COACH,
  providerId: 'ChIJcoachMarina',
  address: 'Dubai Marina',
  phone: '+971 4 000 0000',
  lat: 25.08,
  lon: 55.14,
  mapsUrl: 'https://maps.google.com/?cid=222'
}

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

async function world({ places = [COACH, ELSEWHERE], listing = PAGE } = {}) {
  const { pool } = db
  const config = readConfig(ENV)
  const real = await websiteOpportunitiesDomain()
  const searched = []
  const resolved = []
  const fetched = []
  const domain = {
    ...real,
    resolveShortLink: async (link) => {
      resolved.push(link)
      return { url: RESOLVED, hops: 2 }
    },
    searchNamedPlaces: async (args, deps) => {
      searched.push({ ...args, googleKey: deps.googleKey })
      const all = args.placeId ? places.filter((p) => p.providerId === args.placeId) : places
      return { candidates: all, area: null, center: null, pages: 1, provider: 'google-places' }
    }
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ templates: [] }),
    dnsResolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async (u) => {
      fetched.push(String(u))
      if (String(u) === MAGICPIN && listing !== null)
        return new Response(listing, { status: 200, headers: { 'content-type': 'text/html' } })
      if (String(u) === MAGICPIN) return new Response('denied', { status: 403 })
      return Response.json({ code: 'NO_NETWORK' }, { status: 500 })
    }
  })
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true, 'site-from-business': true })]
  )
  await pool.query(
    `insert into wo_ops_setting (id, settings, google_key_cipher, updated_by) values (true, $1::jsonb, $2, 'test')
     on conflict (id) do update set settings = excluded.settings, google_key_cipher = excluded.google_key_cipher`,
    [JSON.stringify({ defaultCms: 'joomla' }), await sealSecret('google-key', ENV.SESSION_SECRET)]
  )
  const call = async (method, path, body) => {
    const headers = {
      origin: ENV.TRACY_ORIGIN,
      cookie: `tracy_sess=${await mintSession(A, config.sessionSecret)}`
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ENV.TRACY_ORIGIN}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed }
  }
  return { pool, call, searched, resolved, fetched }
}

const listingRow = async (pool, id) =>
  (await pool.query(`select * from wo_source where opportunity_id = $1 and source = 'listing'`, [id])).rows[0]

test(
  'the three real links make ONE opportunity: the Google place, the magicpin listing, the Instagram page',
  opts,
  async () => {
    const w = await world()
    const res = await w.call('POST', BASE, { links: [SHARE, MAGICPIN, INSTA] })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const opp = res.body.opportunity
    // The listing's coordinates picked the Al Barsha place among two of the same name.
    assert.equal(opp.provider, 'google-places')
    assert.equal(opp.providerId, 'ChIJcoachBarsha')
    assert.equal(opp.name, 'Padel & Tennis Coach')
    assert.deepEqual(opp.candidate.socials, { instagram: 'https://www.instagram.com/harbour.sportclub' })
    assert.deepEqual(opp.candidate.listings, [{ url: MAGICPIN, source: 'magicpin' }])
    assert.equal(opp.candidate.website, null)
    assert.deepEqual(
      res.body.links.map((l) => [l.kind, l.used, l.reason ?? null]),
      [
        ['google', true, null],
        ['listing', true, null],
        ['instagram', true, null]
      ]
    )
    assert.deepEqual(w.resolved, [SHARE])
    assert.equal(w.searched[0].query, 'Padel & Tennis Coach')
    assert.equal((await w.pool.query('select count(*)::int as n from wo_opportunity')).rows[0].n, 1)
    // The listing page was read once, and its facts are the opportunity's private `listing` source.
    assert.equal(w.fetched.filter((u) => u === MAGICPIN).length, 1)
    const row = await listingRow(w.pool, opp.id)
    assert.equal(row.status, 'complete')
    assert.equal(row.collected.profile.name, 'Padel & Tennis Coach')
    assert.equal(row.collected.listings[0].facts.geo.lat, 25.0123)
    assert.ok(!JSON.stringify(row.collected).includes('mymagicpin'))
    // The Instagram page is the opportunity's own to research; the listing never is.
    const saved = (await w.pool.query('select * from wo_opportunity where id = $1', [opp.id])).rows[0]
    const due = await privateRefsDue(w.pool, saved, saved.place_id, Date.now())
    assert.deepEqual(
      due.map((d) => d.source),
      ['instagram']
    )
  }
)

test('{url} still works; pasting more links of a saved business adds them to it', opts, async () => {
  const w = await world()
  const first = await w.call('POST', BASE, { url: 'https://coach.example/' })
  assert.equal(first.status, 201, JSON.stringify(first.body))
  assert.equal(first.body.opportunity.candidate.website, 'https://coach.example/')
  const again = await w.call('POST', BASE, { links: ['https://coach.example/', INSTA, MAGICPIN] })
  assert.equal(again.status, 200, JSON.stringify(again.body))
  assert.equal(again.body.opportunity.id, first.body.opportunity.id)
  assert.equal(
    again.body.opportunity.candidate.socials.instagram,
    'https://www.instagram.com/harbour.sportclub'
  )
  assert.deepEqual(again.body.opportunity.candidate.listings, [{ url: MAGICPIN, source: 'magicpin' }])
  assert.ok(await listingRow(w.pool, first.body.opportunity.id))
  const blocked = await w.call('POST', BASE, { url: 'http://127.0.0.1/' })
  assert.equal(blocked.body.code, 'URL_BLOCKED')
  assert.equal((await w.call('POST', BASE, { links: [] })).body.code, 'INVALID_LINKS')
  const none = await w.call('POST', BASE, { links: ['not a link', 'http://10.0.0.1/'] })
  assert.equal(none.status, 422)
  assert.equal(none.body.code, 'NO_USABLE_LINKS')
  assert.deepEqual(
    none.body.links.map((l) => l.reason),
    ['invalid', 'not-public']
  )
})

test(
  'a Google link that matches several places: 409 with candidates, then the picked place',
  opts,
  async () => {
    const w = await world()
    const asked = await w.call('POST', BASE, { links: [SHARE, INSTA] })
    assert.equal(asked.status, 409, JSON.stringify(asked.body))
    assert.equal(asked.body.code, 'GOOGLE_LINK_AMBIGUOUS')
    assert.deepEqual(
      asked.body.candidates.map((c) => Object.keys(c).sort()),
      [
        ['address', 'category', 'name', 'provider', 'providerId', 'rating'],
        ['address', 'category', 'name', 'provider', 'providerId', 'rating']
      ]
    )
    assert.equal(asked.body.links.length, 2)
    assert.equal((await w.pool.query('select count(*)::int as n from wo_opportunity')).rows[0].n, 0)
    const picked = await w.call('POST', BASE, { links: [SHARE, INSTA], place: asked.body.candidates[1] })
    assert.equal(picked.status, 201, JSON.stringify(picked.body))
    assert.equal(picked.body.opportunity.providerId, 'ChIJcoachMarina')
    assert.equal(
      picked.body.opportunity.candidate.socials.instagram,
      'https://www.instagram.com/harbour.sportclub'
    )
    // The typed name alone settles it when it equals one place's name.
    const w2 = await world({ places: [COACH, { ...ELSEWHERE, name: 'Padel Club' }] })
    const named = await w2.call('POST', BASE, { links: [SHARE], name: 'Padel & Tennis Coach' })
    assert.equal(named.status, 201, JSON.stringify(named.body))
    assert.equal(named.body.opportunity.providerId, 'ChIJcoachBarsha')
    // A forged place is refused.
    const forged = await w.call('POST', BASE, { links: [SHARE], place: { provider: 'osm', providerId: 'x' } })
    assert.equal(forged.body.code, 'INVALID_PLACE')
  }
)

test(
  'a listing alone: never a website, never crawled; a page that blocks keeps its link and a name hint',
  opts,
  async () => {
    const w = await world({ listing: null })
    const res = await w.call('POST', BASE, { links: [MAGICPIN] })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const opp = res.body.opportunity
    assert.equal(opp.provider, 'url')
    assert.equal(opp.providerId, MAGICPIN)
    assert.equal(opp.name, 'Padel and Tennis Coach')
    assert.equal(opp.candidate.website, undefined)
    assert.deepEqual(res.body.links[0], { url: MAGICPIN, kind: 'listing', source: 'magicpin', used: true })
    const row = await listingRow(w.pool, opp.id)
    assert.equal(row.status, 'failed')
    assert.equal(row.collected.listings[0].nameHint, 'Padel and Tennis Coach')
    // The place it names has no source to crawl: no website link, and nothing private to collect.
    const saved = (await w.pool.query('select * from wo_opportunity where id = $1', [opp.id])).rows[0]
    assert.deepEqual(
      (await w.pool.query('select * from wo_place_link where place_id = $1', [saved.place_id])).rows,
      []
    )
    assert.deepEqual(await privateRefsDue(w.pool, saved, saved.place_id, Date.now()), [])
    const research = await w.call('POST', `${BASE}/${opp.id}/research`, { requestId: 'req-listing-01' })
    assert.ok(research.status < 300, JSON.stringify(research.body))
    const sources = (await w.pool.query('select source from wo_source where opportunity_id = $1', [opp.id]))
      .rows
    assert.deepEqual(
      sources.map((s) => s.source),
      ['listing']
    )
    // Without a Google key a Google link cannot become a place: it is left out, the rest is used.
    await w.pool.query('update wo_ops_setting set google_key_cipher = null')
    const noKey = await w.call('POST', BASE, { links: [SHARE, INSTA] })
    assert.equal(noKey.status, 201, JSON.stringify(noKey.body))
    assert.deepEqual(noKey.body.links[0].reason, 'unresolvable')
    assert.equal(noKey.body.opportunity.provider, 'url')
  }
)

test('Build from my business accepts links: one business, the same 409 and 422', opts, async () => {
  const w = await world()
  const res = await w.call('POST', OWN, { requestId: 'own-links-0001', links: [SHARE, MAGICPIN, INSTA] })
  assert.equal(res.status, 202, JSON.stringify(res.body))
  assert.equal(res.body.business.phase, 'research')
  assert.equal(res.body.links.length, 3)
  const opp = (await w.pool.query('select * from wo_opportunity where id = $1', [res.body.business.id]))
    .rows[0]
  assert.equal(opp.provider_id, 'ChIJcoachBarsha')
  assert.equal(opp.candidate.ownSite.requestId, 'own-links-0001')
  assert.equal(opp.candidate.trade, 'fitness')
  assert.ok(await listingRow(w.pool, opp.id))
  const ambiguous = await w.call('POST', OWN, { requestId: 'own-links-0002', links: [SHARE] })
  assert.equal(ambiguous.status, 409)
  assert.equal(ambiguous.body.code, 'GOOGLE_LINK_AMBIGUOUS')
  const picked = await w.call('POST', OWN, {
    requestId: 'own-links-0002',
    links: [SHARE],
    place: ambiguous.body.candidates[1]
  })
  assert.equal(picked.status, 202, JSON.stringify(picked.body))
  const none = await w.call('POST', OWN, { requestId: 'own-links-0003', links: ['nope'] })
  assert.equal(none.status, 422)
  assert.equal(none.body.code, 'NO_USABLE_LINKS')
  assert.equal(
    (await w.call('POST', OWN, { requestId: 'own-links-0004', url: 'ftp://x' })).body.code,
    'INVALID_URL'
  )
})

test(
  'the name on the site: a typed name is final, a pick on the Profile card replaces it and reaches the brief',
  opts,
  async () => {
    const { mergeProfile } = await import('website-opportunities/src/executor.js')
    const { briefResearchOf, makeSiteBrief } = await import('website-opportunities/src/brief-research.js')
    const w = await world()
    const res = await w.call('POST', BASE, { links: [SHARE, MAGICPIN, INSTA], name: 'Harbour Sport Club' })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const opp = res.body.opportunity
    assert.equal(opp.name, 'Harbour Sport Club')
    // Google's own name stays Google's claim on the candidate; the typed name is kept beside it.
    assert.equal(opp.candidate.name, 'Padel & Tennis Coach')
    assert.equal(opp.candidate.typedName, 'Harbour Sport Club')
    // What research would save: Instagram and the listing as collected.
    const saved = (await w.pool.query('select * from wo_opportunity where id = $1', [opp.id])).rows[0]
    const rows = [
      {
        source: 'instagram',
        ref: 'https://www.instagram.com/harbour.sportclub',
        status: 'complete',
        collected: { profile: { name: 'Harbour Sport Club' } }
      },
      await listingRow(w.pool, opp.id)
    ]
    await w.pool.query(`insert into wo_profile (opportunity_id, profile) values ($1, $2::jsonb)`, [
      opp.id,
      JSON.stringify(mergeProfile(saved, rows))
    ])
    const typed = await w.call('GET', `${BASE}/${opp.id}`)
    assert.equal(typed.status, 200, JSON.stringify(typed.body))
    assert.equal(typed.body.profile.name, 'Harbour Sport Club')
    assert.equal(typed.body.profile.nameCheck.state, 'chosen')
    assert.equal(typed.body.profile.nameCheck.chosen.by, 'typed')
    assert.equal(typed.body.profile.nameCheck.disagree, true)

    const picked = await w.call('PUT', `${BASE}/${opp.id}/name`, { name: '  Padel &  Tennis Coach ' })
    assert.equal(picked.status, 200, JSON.stringify(picked.body))
    assert.equal(picked.body.opportunity.name, 'Padel & Tennis Coach')
    assert.equal(picked.body.opportunity.candidate.namePick.name, 'Padel & Tennis Coach')
    const after = await w.call('GET', `${BASE}/${opp.id}`)
    assert.equal(after.body.profile.name, 'Padel & Tennis Coach')
    assert.deepEqual(after.body.profile.nameCheck.chosen, { name: 'Padel & Tennis Coach', by: 'picked' })

    // The brief, and so the site check that holds the build to it, carries the picked name.
    const row = (await w.pool.query('select * from wo_opportunity where id = $1', [opp.id])).rows[0]
    const { read } = await briefResearchOf(w.pool, row)
    const domain = await websiteOpportunitiesDomain()
    const brief = makeSiteBrief(domain, read, { opportunity: row, madeAt: '2026-10-26T00:00:00.000Z' })
    assert.equal(brief.business.name, 'Padel & Tennis Coach')

    // Saving the business again with its links keeps the pick.
    const again = await w.call('POST', BASE, { links: [SHARE, MAGICPIN, INSTA] })
    assert.equal(again.body.opportunity.candidate.namePick.name, 'Padel & Tennis Coach')

    assert.equal((await w.call('PUT', `${BASE}/${opp.id}/name`, { name: ' ' })).body.code, 'INVALID_NAME')
    assert.equal((await w.call('PUT', `${BASE}/${opp.id}/name`, { name: 'x'.repeat(201) })).status, 400)
    assert.equal((await w.call('PUT', `${BASE}/${opp.id}/name`, {})).status, 400)
    const unknown = await w.call('PUT', `${BASE}/00000000-0000-4000-8000-000000000000/name`, { name: 'X' })
    assert.equal(unknown.status, 404)
  }
)

test(
  'the hours on the site: Google’s 24/7 alone waits for a check; keep, leave off and typed hours reach the brief',
  opts,
  async () => {
    const { briefResearchOf, makeSiteBrief } = await import('website-opportunities/src/brief-research.js')
    const w = await world()
    const res = await w.call('POST', BASE, { links: [SHARE, MAGICPIN, INSTA] })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const id = res.body.opportunity.id
    const allDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
      (d) => `${d}: Open 24 hours`
    )
    await w.pool.query(
      `update wo_opportunity set candidate = candidate || '{"trade":"fitness"}'::jsonb where id = $1`,
      [id]
    )
    await w.pool.query(`insert into wo_profile (opportunity_id, profile) values ($1, $2::jsonb)`, [
      id,
      JSON.stringify({
        name: 'Padel & Tennis Coach',
        phone: '+971 50 123 4567',
        googlePlace: { placeId: 'ChIJcoachBarsha', openingHours: allDay }
      })
    ])
    const briefNow = async () => {
      const row = (await w.pool.query('select * from wo_opportunity where id = $1', [id])).rows[0]
      const { read } = await briefResearchOf(w.pool, row)
      return makeSiteBrief(await websiteOpportunitiesDomain(), read, {
        opportunity: row,
        madeAt: '2026-10-26T00:00:00.000Z'
      })
    }
    const first = await w.call('GET', `${BASE}/${id}`)
    assert.equal(first.body.profile.hoursCheck.state, 'check')
    assert.equal((await briefNow()).business.hours, undefined)

    const kept = await w.call('PUT', `${BASE}/${id}/hours`, { choice: 'keep' })
    assert.equal(kept.status, 200, JSON.stringify(kept.body))
    assert.equal(kept.body.opportunity.candidate.hoursPick.choice, 'keep')
    assert.equal((await w.call('GET', `${BASE}/${id}`)).body.profile.hoursCheck.choice, 'keep')
    assert.deepEqual((await briefNow()).business.hours, allDay)

    assert.equal((await w.call('PUT', `${BASE}/${id}/hours`, { choice: 'leave' })).status, 200)
    assert.equal((await briefNow()).business.hours, undefined)

    const typed = await w.call('PUT', `${BASE}/${id}/hours`, { choice: 'edit', hours: ['Mo-Fr 07:00-22:00'] })
    assert.equal(typed.status, 200, JSON.stringify(typed.body))
    assert.deepEqual((await briefNow()).business.hours, ['Mo-Fr 07:00-22:00'])

    const unreadable = await w.call('PUT', `${BASE}/${id}/hours`, {
      choice: 'edit',
      hours: ['by appointment']
    })
    assert.equal(unreadable.status, 400)
    assert.equal(unreadable.body.code, 'INVALID_HOURS')
    assert.equal(
      (await w.call('PUT', `${BASE}/${id}/hours`, { choice: 'maybe' })).body.code,
      'INVALID_CHOICE'
    )
    const unknown = await w.call('PUT', `${BASE}/00000000-0000-4000-8000-000000000000/hours`, {
      choice: 'keep'
    })
    assert.equal(unknown.status, 404)
  }
)
