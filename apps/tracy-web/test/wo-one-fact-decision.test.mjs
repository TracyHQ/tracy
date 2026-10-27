// One decision per fact (#1791), read where each reader reads it: the Profile card (`GET …/place-profile`), the brief a
// revision freezes, the builder's prompt and the QA gate. The card lists exactly the facts the brief states, under the
// same ids, and an owner's switch on the card reaches the next brief, its prompt and QA.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { renderAgentPrompt } from 'website-opportunities/domain/agent-prompt.mjs'
import { FACT_OVERRIDES_MAX } from 'website-opportunities/src/owner-fact-picks.js'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { createRevision } from '../src/opportunities-build/revisions.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'
import { fileDb } from './_db.mjs'

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const BASE = '/api/website-opportunities'
const A = 'a@tracy.test'
const PHONE = '+1 555 0100'

async function world({ candidate = {}, listing = null } = {}) {
  const config = readConfig(env)
  const loaded = { ...(await websiteOpportunitiesDomain()) }
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => loaded,
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await db.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': true })]
  )
  const call = async (method, path, body) => {
    const headers = {
      origin: 'http://tracy.test:8080',
      cookie: `tracy_sess=${await mintSession(A, config.sessionSecret)}`
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test:8080${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const made = await call('POST', BASE, {
    candidate: {
      provider: 'osm',
      providerId: 'node/7',
      name: 'North Studio',
      lat: 25.1,
      lon: 55.2,
      socials: {},
      ...candidate
    }
  })
  assert.equal(made.status, 201)
  const opp = made.body.opportunity
  // Research of the place: its phone, which its own website states.
  await db.pool.query('insert into wo_profile(opportunity_id,profile) values($1,$2)', [
    opp.id,
    {
      name: 'North Studio',
      phone: PHONE,
      provenance: { phone: { source: 'website', seenAt: '2026-10-25T00:00:00Z' } }
    }
  ])
  await db.pool.query(
    "insert into wo_source(opportunity_id,source,ref,status,collected,updated_at) values($1,'website','https://studio.example','complete',$2,'2026-10-25T00:00:00Z')",
    [opp.id, { pages: [{ url: 'https://studio.example', text: `North Studio. Call ${PHONE}.` }] }]
  )
  if (listing)
    await db.pool.query(
      "insert into wo_source(opportunity_id,source,ref,status,collected,updated_at) values($1,'listing',$2,'complete',$3,'2026-10-25T00:00:00Z')",
      [opp.id, listing.url, { listings: [{ ok: true, ...listing }] }]
    )
  const accountId = (await db.pool.query('select account_id from wo_opportunity where id = $1', [opp.id]))
    .rows[0].account_id
  let clock = Date.parse('2026-10-26T12:00:00.000Z')
  const revise = async () => {
    clock += 60_000
    const out = await createRevision(db.pool, { accountId, opportunityId: opp.id, domain, now: () => clock })
    assert.ok(out.revision, JSON.stringify(out))
    return out.revision
  }
  return { call, opp, revise }
}

test(
  'the card lists exactly the facts the brief states, under the same ids and decisions',
  opts,
  async () => {
    const { call, opp, revise } = await world()
    const revision = await revise()
    const card = await call('GET', `${BASE}/${opp.id}/place-profile`)
    assert.equal(card.status, 200)
    assert.equal(card.body.revisionId, revision.id)
    assert.deepEqual(
      card.body.decisions.map((d) => [d.factId, d.field, d.onSite, d.confidence]).sort(),
      revision.brief.facts.map((f) => [f.id, f.field, f.onSite, f.confidence]).sort()
    )
    const phone = revision.brief.facts.find((f) => f.field === 'phone')
    assert.equal(phone.value, PHONE)
    assert.equal(phone.onSite, true)
    assert.equal(revision.brief.business.phone, PHONE)
  }
)

test(
  'the owner switching a fact off on the card reaches the next brief, its prompt and QA',
  opts,
  async () => {
    const { call, opp, revise } = await world()
    const first = await revise()
    const phone = first.brief.facts.find((f) => f.field === 'phone')
    const off = await call('PUT', `${BASE}/${opp.id}/facts`, { factId: phone.id, onSite: false })
    assert.equal(off.status, 200)
    const card = await call('GET', `${BASE}/${opp.id}/place-profile`)
    assert.deepEqual(
      card.body.decisions.find((d) => d.factId === phone.id),
      { ...card.body.decisions.find((d) => d.factId === phone.id), onSite: false, decidedBy: 'owner' }
    )

    const second = await revise()
    assert.notEqual(second.id, first.id)
    const fact = second.brief.facts.find((f) => f.id === phone.id)
    assert.equal(fact.onSite, false)
    assert.equal(fact.decidedBy, 'owner')
    assert.equal(second.brief.business.phone, null)
    assert.ok(!JSON.stringify(second.brief.sitemap).includes('tel:'), 'no Call button')
    // The builder is told to keep it off; QA fails a page that shows it.
    const prompt = renderAgentPrompt({ revision: { ...second, cms: 'joomla' } })
    assert.match(prompt, /555 0100/)
    assert.match(prompt, /phone/i)
    const qa = briefOf(second)
    assert.deepEqual(
      qa.withheld.find((w) => w.field === 'phone'),
      { field: 'phone', values: [PHONE], ...qa.withheld.find((w) => w.field === 'phone') }
    )
    // The card of the new revision says the same.
    const again = await call('GET', `${BASE}/${opp.id}/place-profile`)
    assert.equal(again.body.revisionId, second.id)
    assert.equal(again.body.decisions.find((d) => d.factId === phone.id).onSite, false)
  }
)

test(
  'the card refuses a fact override past the cap and a key message label past 60 characters',
  opts,
  async () => {
    const { call, opp } = await world()
    const held = Object.fromEntries(
      Array.from({ length: FACT_OVERRIDES_MAX }, (_, n) => [
        `fact_held${n}`,
        { onSite: false, at: '2026-10-26T00:00:00Z' }
      ])
    )
    await db.pool.query(
      "update wo_opportunity set candidate = jsonb_set(candidate, '{factOverrides}', $2::jsonb) where id = $1",
      [opp.id, JSON.stringify(held)]
    )
    const past = await call('PUT', `${BASE}/${opp.id}/facts`, { factId: 'fact_onemore', onSite: true })
    assert.equal(past.status, 400)
    assert.equal(past.body.code, 'TOO_MANY_FACT_OVERRIDES')
    // One already held may still change, and null frees a place.
    assert.equal(
      (await call('PUT', `${BASE}/${opp.id}/facts`, { factId: 'fact_held0', onSite: true })).status,
      200
    )
    assert.equal(
      (await call('PUT', `${BASE}/${opp.id}/facts`, { factId: 'fact_held1', onSite: null })).status,
      200
    )
    assert.equal(
      (await call('PUT', `${BASE}/${opp.id}/facts`, { factId: 'fact_onemore', onSite: true })).status,
      200
    )
    const long = await call('PUT', `${BASE}/${opp.id}/key-messages`, { labels: { ke_x: 'x'.repeat(61) } })
    assert.equal(long.status, 400)
    assert.match(JSON.stringify(long.body), /1 to 60 characters/)
  }
)

test(
  "Google's 4-review rating a listing copies differently stays withheld on the card, in the prompt and in QA",
  opts,
  async () => {
    // Found on Google with a 5.0 rating from 4 reviews; a directory page shows Google's rating as 5.0 from 16.
    const { call, opp, revise } = await world({
      candidate: { provider: 'google-places', providerId: 'ChIJnorthStudioFake', rating: 5, reviews: 4 },
      listing: {
        url: 'https://listing.test/north-studio',
        facts: { rating: 5, reviews: 16, ratingOf: 'google' }
      }
    })
    const revision = await revise()
    const facts = revision.brief.facts.filter((f) => f.field === 'googleRating')
    assert.deepEqual(facts.map((f) => [f.value.label, f.value.amount, f.onSite]).sort(), [
      ['rating', 5, false],
      ['reviewCount', 4, false]
    ])
    const values = revision.brief.missing
      .find((m) => m.field === 'googleRating')
      .withheld.flatMap((w) => w.values)
    assert.ok(values.includes('5.0 ★') && values.includes('4 reviews'), JSON.stringify(values))
    assert.match(revision.brief_md, /googleRating: 5 \(rating\) .* off the site: .*few-reviews/)
    const prompt = renderAgentPrompt({ revision: { ...revision, cms: 'joomla' } })
    assert.match(prompt, /5\.0 ★/)
    const qa = briefOf(revision).withheld.find((w) => w.field === 'googleRating')
    assert.ok(qa?.values.includes('5.0 ★') && qa.values.includes('4 reviews'), JSON.stringify(qa))
    // The card reads every fact the brief states, each with its field; the rating is off with its reason.
    const card = await call('GET', `${BASE}/${opp.id}/place-profile`)
    assert.equal(card.body.decisions.length, revision.brief.facts.length)
    for (const d of card.body.decisions) assert.equal(typeof d.field, 'string')
    for (const f of facts) {
      const d = card.body.decisions.find((x) => x.factId === f.id)
      assert.equal(d.field, 'googleRating')
      assert.equal(d.onSite, false)
      assert.ok(d.reasons.includes('few-reviews'), JSON.stringify(d.reasons))
    }
  }
)
