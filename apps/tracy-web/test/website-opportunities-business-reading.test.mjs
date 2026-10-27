// The reading step of a place's research (#1780), at its main seam: research collected for Harbour Sport Club on dev
// (26/10/2026, its Instagram bio, 12 posts and 3 Google reviews, reviewer names replaced) goes through a real research
// run with a fixed model answer, and comes out as the place profile (offerings, people, quotes, coverage) and the
// brief (Services, Who it is for, Team, About line) in the words of its trade. Scratch Postgres; collectors are fakes.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { requestResearch } from 'website-opportunities/src/place-requests.js'
import { addLink } from 'website-opportunities/src/places.js'
import { insertOpportunity, saveKeyMessagePicks, saveReadingPick } from 'website-opportunities/src/store.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { briefResearchOf, makeSiteBrief } from 'website-opportunities/src/brief-research.js'
import { readPlaceProfile } from 'website-opportunities/src/place-profile-read.js'
import { BUSINESS_READING_SYSTEM } from 'website-opportunities/domain/business-reading.mjs'
import { validatePlaceProfile } from 'website-opportunities/domain/place-profile.mjs'
import { fileDb } from './_db.mjs'
// Whether a person shows lives in their fact (brief schema 2, #1791); an older brief said it on the item.
const onSiteOf = (brief, p) => (p.factId ? brief.facts.find((f) => f.id === p.factId)?.onSite : p.onSite)
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const db = fileDb()
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/harbour-sport-club-research.json', import.meta.url), 'utf8')
)
const PLACE_ID = 'ChIJharbourSportClub'
// As the record on dev holds it: saved before links were cleaned at paste time (item 10).
const IG = 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDI&utm_source=qr'
const IG_CLEAN = 'https://www.instagram.com/harbour.sportclub/'
const MODEL_URL = 'https://model.test/v1/chat/completions'
const post = (id) => `post:instagram:${id}`

/** What the editorial model answers for Harbour Sport Club: true items, one invented, one template line. */
const ANSWER = {
  services: [
    { name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: post('HSCpost0001') },
    {
      name: 'Tennis lessons',
      quote:
        'Start your tennis journey with us in Dubai! Whether you’re a beginner or pro, our lessons are tailored',
      ref: post('HSCpost0002')
    },
    { name: 'Swimming lessons', quote: 'Swimming Lessons', ref: 'bio' },
    { name: 'Personalized fitness lessons', quote: 'Personalized Fitness Lessons', ref: post('HSCpost0012') },
    // Invented: no text says yoga.
    { name: 'Yoga classes', quote: 'Join our yoga classes', ref: post('HSCpost0001') },
    // A template line of the post: never a quote.
    { name: 'Location', quote: 'Location: [Your Location]', ref: post('HSCpost0012') }
  ],
  audience: [
    { label: 'all ages and levels', quote: 'For all ages & levels', ref: post('HSCpost0001') },
    { label: 'kids', quote: 'Tennis with kids is always full of smiles', ref: post('HSCpost0008') }
  ],
  team: [
    { name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' },
    { name: 'Sam', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }
  ],
  story: [{ text: 'European coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }]
}

async function research({ door = 'ready', answer = ANSWER, candidate = {} } = {}) {
  const { pool } = db
  const accountId = (await pool.query("insert into account(email) values('reading@tracy.test') returning id"))
    .rows[0].id
  const { row: opportunity } = await insertOpportunity(pool, accountId, {
    name: 'Harbour Sport Club',
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate: { provider: 'google-places', providerId: PLACE_ID, name: 'Harbour Sport Club', ...candidate }
  })
  const calls = { model: 0, bodies: [] }
  const real = await websiteOpportunitiesDomain()
  const blocked = { available: false, collect: async () => ({ status: 'blocked', media: [] }) }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website: blocked,
      facebook: blocked,
      tiktok: blocked,
      youtube: blocked,
      instagram: {
        available: true,
        collect: async () => ({
          source: 'instagram',
          status: 'complete',
          cursor: null,
          profile: { name: 'Harbour Sport Club', bio: HSC.bio },
          posts: HSC.posts,
          media: [],
          logos: [],
          coverage: { fetched: HSC.posts.length }
        })
      }
    }),
    fetchPlaceDetails: async (placeId) => ({
      id: placeId,
      displayName: { text: 'Harbour Sport Club' },
      primaryType: 'sports_club',
      types: ['sports_club', 'point_of_interest', 'establishment'],
      reviews: HSC.reviews.map((r) => ({
        authorAttribution: { displayName: r.author },
        text: { text: r.text, languageCode: 'en' },
        rating: r.rating,
        publishTime: r.publishTime
      }))
    })
  }
  const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 }) })
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'test-google' },
      settings: {
        ...normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false }),
        tripadvisorReviews: false
      }
    }),
    chargeable: createChargeable(ledger),
    businessReadingDoor: async () =>
      door === 'ready'
        ? { state: 'ready', door: { url: MODEL_URL, key: 'test-key', model: 'deepseek-chat', effort: null } }
        : { state: door },
    apiFetch: async (url, init) => {
      if (String(url) === MODEL_URL) {
        const body = JSON.parse(init.body)
        assert.equal(body.messages[0].content, BUSINESS_READING_SYSTEM)
        calls.model += 1
        calls.bodies.push(body)
        return Response.json({
          id: 'reading-1',
          choices: [{ message: { content: JSON.stringify(answer) } }],
          usage: { prompt_tokens: 4000, completion_tokens: 600 }
        })
      }
      throw new Error('no network in tests')
    },
    objects: { put: async () => true, get: async () => null },
    imageInfo: imageInfoWith(woHost),
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    switchOn: async () => true,
    log: { warn() {}, error() {}, log() {}, info() {} }
  })
  await requestResearch(pool, { accountId, opportunity, requestId: 'first' })
  const placeId = (await pool.query('select place_id from wo_opportunity where id = $1', [opportunity.id]))
    .rows[0].place_id
  // The club's Instagram, as an operator adds a link to a Google place.
  await addLink(pool, placeId, 'instagram', IG, 'operator', {})
  for (let i = 0; i < 20; i++) {
    const { claimed, done } = await ex.tick()
    if (!claimed) break
    await done
  }
  const opp = (await pool.query('select * from wo_opportunity where id = $1', [opportunity.id])).rows[0]
  const { read } = await briefResearchOf(pool, opp)
  const brief = makeSiteBrief(domain, read, { opportunity: opp, madeAt: '2026-10-26T10:00:00.000Z' })
  return {
    pool,
    accountId,
    calls,
    opp,
    domain,
    brief,
    markdown: domain.renderBriefMarkdown(brief),
    profile: await readPlaceProfile(pool, { opportunityId: opp.id })
  }
}

const labels = (items) => (items ?? []).map((i) => i.label)

test(
  'Harbour Sport Club: services, who it is for, team and story read from its own words',
  opts,
  async () => {
    const r = await research()
    assert.equal(r.calls.model, 1, 'one model call per research run')
    assert.ok(!JSON.stringify(r.calls.bodies).includes('[Your Location]'), 'a template line is never sent')

    // The brief: what the club sells, for whom, who teaches, in its own words.
    const reading = r.brief.reading
    assert.equal(reading.method, 'model')
    assert.deepEqual(labels(reading.services), [
      'Padel sessions',
      'Tennis lessons',
      'Swimming lessons',
      'Personalized fitness lessons'
    ])
    assert.deepEqual(labels(reading.audience), ['all ages and levels', 'kids'])
    assert.deepEqual(
      reading.team.map((p) => [p.label, p.role, onSiteOf(r.brief, p)]),
      [
        ['Alex', 'coach', false],
        ['Sam', 'coach', false]
      ],
      'people named only in reviews stay off the site until shown'
    )
    assert.equal(reading.story[0].quote, 'European Coaching in Dubai')
    assert.equal(
      reading.about,
      'Harbour Sport Club offers European coaching in Dubai: padel sessions, tennis lessons, swimming lessons and personalized fitness lessons, for all ages and levels.'
    )
    assert.equal(reading.services[0].source.url, 'https://www.instagram.com/p/HSCpost0001/')
    assert.equal(r.brief.business.trade, 'fitness')
    const services = r.brief.sitemap.find((p) => p.slug === 'services')
    assert.ok(services, 'a Services page')
    assert.equal(
      r.brief.sitemap.some((p) => p.slug === 'menu'),
      false,
      'no menu page'
    )
    assert.ok(!/\[Your Location\]|Yoga/i.test(JSON.stringify(r.brief)), 'nothing invented, no template text')
    assert.ok(
      !/\brestaurant|\bdish|Book a table|sample dish/i.test(r.markdown),
      r.markdown.match(/.*(restaurant|dish|Book a table|sample dish).*/gi)?.join('\n')
    )
    assert.match(r.markdown, /## Services, audience, team and story/)
    assert.match(r.markdown, /Padel sessions/)
    assert.deepEqual(r.domain.validateBrief(r.brief).errors ?? [], [])
    // Item 10: the old record's tracked link reaches the brief and the profile clean.
    assert.equal(r.brief.business.socials.instagram, IG_CLEAN)
    assert.ok(!/igsh|utm_/.test(r.markdown), 'no tracking in the brief')

    // The place profile: offerings, people, quotes and coverage, valid against ADR 0037.
    const doc = r.profile
    assert.deepEqual(validatePlaceProfile(doc).errors ?? validatePlaceProfile(doc), [])
    assert.deepEqual(
      doc.offerings.map((o) => [o.value.name, o.value.kind]),
      [
        ['Padel sessions', 'service'],
        ['Tennis lessons', 'service'],
        ['Swimming lessons', 'service'],
        ['Personalized fitness lessons', 'service']
      ]
    )
    assert.deepEqual(
      doc.people.map((p) => [p.value.name, p.value.relationship, p.value.role]),
      [
        ['Alex', 'team', 'coach'],
        ['Sam', 'team', 'coach']
      ]
    )
    assert.ok(!/igsh|utm_/.test(JSON.stringify(doc.links)), 'no tracking in the profile links')
    assert.ok(doc.links.some((l) => l.value.url === IG_CLEAN))
    const coverage = Object.fromEntries(doc.coverage.map((c) => [c.target, c]))
    assert.equal(coverage.offerings.status, 'found')
    assert.equal(coverage.people.status, 'found')

    // The ledger: one reserved and settled model call, for this purpose.
    const rows = (await r.pool.query("select * from wo_cost_ledger where purpose = 'business-reading'")).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].provider, 'woEditorial')
  }
)

test(
  'without a model the rules read the bio and posts, and coverage says the model did not run',
  opts,
  async () => {
    const r = await research({ door: 'not_configured' })
    assert.equal(r.calls.model, 0)
    assert.equal(r.brief.reading.method, 'rules')
    assert.equal(r.brief.reading.reason, 'not_configured')
    assert.ok(labels(r.brief.reading.services).includes('Swimming Lessons'))
    assert.deepEqual(r.brief.reading.team, [], 'rules name no person')
    assert.ok(!/\[Your Location\]/.test(JSON.stringify(r.brief)))
    const offerings = r.profile.coverage.find((c) => c.target === 'offerings')
    assert.match(offerings.reason ?? offerings.note ?? '', /model reading did not run \(not_configured\)/)
    // The rules never look for people, so the Team is not researched (not "looked, not there"), and says why.
    const people = r.profile.coverage.find((c) => c.target === 'people')
    assert.equal(people.status, 'not_researched')
    assert.match(people.reason, /model reading did not run \(not_configured\)/)
    assert.equal(
      (await r.pool.query("select * from wo_cost_ledger where purpose = 'business-reading'")).rows.length,
      0
    )
  }
)

test('the real template post: its placeholder line is cut, the rest of the post is kept (item 8)', async () => {
  const { contentPool } = await import('website-opportunities/domain/content-pool.mjs')
  const { items } = contentPool({
    now: '2026-10-26T10:00:00.000Z',
    facts: {},
    posts: HSC.posts.map((p) => ({ source: 'instagram', ...p }))
  })
  const fitness = items.find((it) => it.posts.some((p) => p.id === 'HSCpost0012'))
  assert.ok(fitness, 'the post is kept')
  const text = `${fitness.title}\n${fitness.body}`
  assert.doesNotMatch(text, /\[Your Location\]|Location:/)
  assert.match(text, /Personalized workout plans/)
  assert.match(text, /DM to book your first session!/)
  assert.ok(
    !items.some((it) => /\[[^\]]*\]/.test(`${it.title} ${it.body}`)),
    'no bracketed template text anywhere'
  )
  assert.ok(items.length >= 8, `posts kept: ${items.length} of 12`)
})

test(
  'two key message saves in a row: the second does not undo the first removal or label',
  opts,
  async () => {
    const r = await research()
    const first = await saveKeyMessagePicks(r.pool, r.accountId, r.opp.id, {
      removed: ['km_a'],
      order: ['km_b', 'km_c'],
      labels: { km_b: 'Beta renamed' }
    })
    assert.deepEqual(first.candidate.keyMessagePicks.removed, ['km_a'])
    // A partial second save: only a reorder.
    const second = await saveKeyMessagePicks(r.pool, r.accountId, r.opp.id, {
      removed: [],
      order: ['km_c', 'km_b'],
      labels: {}
    })
    const picks = second.candidate.keyMessagePicks
    assert.deepEqual(picks.removed, ['km_a'])
    assert.deepEqual(picks.order, ['km_c', 'km_b'])
    assert.deepEqual(picks.labels, { km_b: 'Beta renamed' })
    assert.equal(
      await saveKeyMessagePicks(r.pool, '00000000-0000-4000-8000-000000000000', r.opp.id, {
        removed: [],
        order: [],
        labels: {}
      }),
      null
    )
  }
)

test(
  'Remove takes an item off the brief; Show on the site puts a review-only person on it; the card shows both',
  opts,
  async () => {
    const r = await research()
    const swim = r.brief.reading.services.find((s) => s.label === 'Swimming lessons')
    const alex = r.brief.reading.team.find((p) => p.label === 'Alex')
    assert.ok(await saveReadingPick(r.pool, r.accountId, r.opp.id, swim.id, 'remove'))
    const row = await saveReadingPick(r.pool, r.accountId, r.opp.id, alex.id, 'show')
    assert.deepEqual(row.candidate.readingPicks.removed, [swim.id], 'the second pick keeps the first')
    assert.deepEqual(row.candidate.readingPicks.shown, [alex.id])
    assert.equal(
      await saveReadingPick(r.pool, '00000000-0000-4000-8000-000000000000', r.opp.id, swim.id, 'restore'),
      null
    )

    const view = await placeViewOf(r.pool, row)
    const card = view.profile.readingCard
    assert.equal(card.services.find((s) => s.id === swim.id).removed, true)
    assert.deepEqual(
      card.team.map((p) => [p.label, p.reviewsOnly, p.onSite]),
      [
        ['Alex', true, true],
        ['Sam', true, false]
      ]
    )
    const { read } = await briefResearchOf(r.pool, row)
    const brief = makeSiteBrief(r.domain, read, { opportunity: row, madeAt: '2026-10-26T11:00:00.000Z' })
    assert.ok(!brief.reading.services.some((s) => s.id === swim.id))
    assert.doesNotMatch(brief.reading.about, /swimming/i)
    assert.deepEqual(
      brief.reading.team.map((p) => [p.label, onSiteOf(brief, p)]),
      [
        ['Alex', true],
        ['Sam', false]
      ]
    )
    assert.match(r.domain.renderBriefMarkdown(brief), /Alex/)
  }
)
