/**
 * What a Website Opportunities build hands its site's brief engine to write without a model: the brief's content items and
 * the build's page plan — nothing for a site no opportunity built — and where each record's words before the first write
 * and each write's receipt are kept.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import * as domain from 'website-opportunities/domain'
import { freezePlaceProfile } from '../src/opportunities-build/profile-revision.js'
import { createSiteContent } from '../src/opportunities-build/site-content.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

test(
  'WO identity exists before its create receipt, even without a page plan or sourced posts',
  opts,
  async () => {
    await seed(db.pool, { plan: null, items: null })
    const content = createSiteContent({ pool: db.pool })
    assert.equal(await content.isOpportunity({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test' }), true)
    assert.equal(
      await content.isOpportunity({ siteKey: 'plain.tracy.test', email: 'owner@tracy.test' }),
      false
    )
    assert.equal(
      await content.forSite({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test', strict: true }),
      null
    )
  }
)

test('WO identity and strict source readers reject database errors instead of reporting an ordinary or empty site', async () => {
  const content = createSiteContent({
    pool: {
      async query() {
        throw new Error('database unavailable')
      }
    },
    log: { warn() {} }
  })
  const who = { siteKey: 'hill.tracy.test', email: 'owner@tracy.test' }
  await assert.rejects(content.isOpportunity(who), /database unavailable/)
  await assert.rejects(content.forSite({ ...who, strict: true }), /database unavailable/)
  await assert.rejects(content.copyFor({ ...who, strict: true }), /database unavailable/)
  assert.equal(await content.forSite(who), null, 'optional readers retain their existing contract')
})

const ITEMS = [
  {
    id: 'post:facebook:1',
    kinds: ['dish'],
    title: 'Eggs Benedict',
    body: 'Poached eggs.',
    authorship: 'page',
    posts: [{ source: 'facebook' }]
  }
]
const PLAN = {
  pages: [
    { id: 'blog', path: '/blog', role: 'blog', keep: true, fill: 'sourced', items: ['post:facebook:1'] }
  ],
  keep: ['blog']
}

async function seed(
  pool,
  { plan = PLAN, items = ITEMS, business = null, placeProfile = null, brief = {} } = {}
) {
  const account = (await pool.query(`insert into account (email) values ('owner@tracy.test') returning id`))
    .rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate) values ($1, 'Hill', 'osm', 'node/1', '{}'::jsonb) returning id`,
      [account]
    )
  ).rows[0].id
  const revision = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest, place_profile)
       values ($1, $2, 1, $3::jsonb, '', '[]'::jsonb, $4::jsonb) returning id`,
      [
        opp,
        account,
        JSON.stringify({
          ...brief,
          ...(items ? { content: { items, links: [] } } : {}),
          ...(business ? { business } : {})
        }),
        placeProfile ? JSON.stringify(placeProfile) : null
      ]
    )
  ).rows[0].id
  const buildId = '22222222-2222-4222-8222-222222222222'
  const build = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, receipt, choice, choice_key)
       values ($1, $2, 'req-1', $3, 'hill.tracy.test', $4::jsonb, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
      [account, revision, buildId, JSON.stringify(plan ? { status: 202, pagePlan: plan } : { status: 202 })]
    )
  ).rows[0].id
  await pool.query(`insert into site (site_key, label, host) values ('hill.tracy.test', 'hill', 'local')`)
  await pool.query(`insert into site (site_key, label, host) values ('plain.tracy.test', 'plain', 'local')`)
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state, site_key) values ($1, $2, 'h', 'provisioning', 'hill.tracy.test')`,
    [account, buildId]
  )
  await pool.query(
    `insert into site_creation (account_id, build_id, payload_hash, state, site_key) values ($1, 'form-build', 'h', 'provisioning', 'plain.tracy.test')`,
    [account]
  )
  return { build }
}

test(
  'a site no opportunity built, another account, or a build without a page plan or items answers null',
  opts,
  async () => {
    const pool = db.pool
    await seed(pool, { plan: null })
    const content = createSiteContent({ pool })
    assert.equal(await content.forSite({ siteKey: 'plain.tracy.test', email: 'owner@tracy.test' }), null)
    assert.equal(await content.forSite({ siteKey: 'hill.tracy.test', email: 'other@tracy.test' }), null)
    assert.equal(await content.forSite({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test' }), null)
  }
)

test(
  'the build hands its items and page plan; a record’s words before are kept once, receipts merge',
  opts,
  async () => {
    const pool = db.pool
    const { build } = await seed(pool)
    const content = createSiteContent({ pool })
    const got = await content.forSite({ siteKey: 'hill.tracy.test', email: 'Owner@Tracy.test' })
    assert.equal(got.buildId, build)
    assert.deepEqual(got.items, ITEMS)
    assert.deepEqual(got.pagePlan, PLAN)
    assert.deepEqual(got.before, {})
    assert.deepEqual(await content.recordBefore(build, 'article:11', { title: 'Demo title' }), {
      title: 'Demo title'
    })
    // A retry reads the run's own words: the first "before" stays.
    assert.deepEqual(await content.recordBefore(build, 'article:11', { title: 'Eggs Benedict' }), {
      title: 'Demo title'
    })
    await content.recordWrite(build, 'article:11', { itemId: 'post:facebook:1', state: 'written' })
    await content.recordWrite(build, 'article:12', { state: 'hidden' })
    const again = await content.forSite({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test' })
    assert.deepEqual(again.before, { 'article:11': { title: 'Demo title' } })
    assert.deepEqual(Object.keys(again.writes).sort(), ['article:11', 'article:12'])
    assert.equal(again.writes['article:11'].state, 'written')
    assert.ok(again.writes['article:11'].at)
  }
)

test(
  'the build hands its sourced copy (name, story, dishes, contact) even without a page plan; other sites get null',
  opts,
  async () => {
    const pool = db.pool
    await seed(pool, {
      plan: null,
      business: { name: 'The Larch House', phone: '+84 235 0000 102', hours: ['Daily 7:00–22:00'] }
    })
    const content = createSiteContent({ pool })
    assert.equal(await content.copyFor({ siteKey: 'plain.tracy.test', email: 'owner@tracy.test' }), null)
    const got = await content.copyFor({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test', lang: 'en' })
    assert.deepEqual(got.pinned['hero.title'], { value: 'The Larch House', source: 'business.name' })
    assert.deepEqual(
      got.pinned.cards.map((c) => c.source),
      ['post:facebook:1']
    )
    assert.deepEqual(got.pinned.contact.hours, { value: 'Daily 7:00–22:00', source: 'business.hours' })
    assert.deepEqual(got.before, {})
    assert.ok(got.buildId)
  }
)

test(
  'the build hands the place profile and assessment its revision froze, not one read again from the brief',
  opts,
  async () => {
    const frozen = freezePlaceProfile({
      at: '2026-10-26T10:00:00.000Z',
      research: {
        opportunity: { provider: 'osm', provider_id: 'node/1', name: 'The Larch House (frozen)' },
        profile: { name: 'The Larch House (frozen)', phone: '+84 235 0000 102' },
        brand: {},
        sources: [],
        media: [],
        posts: []
      }
    })
    await seed(db.pool, { plan: null, business: { name: 'The Larch House' }, placeProfile: frozen })
    const content = createSiteContent({ pool: db.pool })
    const got = await content.copyFor({ siteKey: 'hill.tracy.test', email: 'owner@tracy.test', lang: 'en' })
    assert.equal(got.placeProfile.provisional, false)
    assert.equal(got.placeProfile.profile.business.name.value, 'The Larch House (frozen)')
    assert.deepEqual(got.placeProfile.assessment, frozen.assessment.facts)
  }
)

test(
  'a dish photo this build’s vision accepts depicts its dish in the frozen profile the copy hands over',
  opts,
  async () => {
    const research = {
      opportunity: { provider: 'osm', provider_id: 'node/2', name: 'Cà Phê Phin' },
      profile: {
        name: 'Cà Phê Phin',
        menuItems: [
          {
            name: 'Phin sữa đá',
            price: '35.000',
            source: { kind: 'page', url: 'https://caphebrewlet.example/menu' }
          }
        ]
      },
      brand: {},
      sources: [],
      media: [
        {
          id: 'm-phin',
          kind: 'image',
          status: 'stored',
          category: 'food',
          sha256: 'b'.repeat(64),
          source: 'website',
          source_url: 'https://caphebrewlet.example/img/phin.jpg',
          sourceUrl: 'https://caphebrewlet.example/img/phin.jpg',
          caption: 'Phin sữa đá của quán'
        }
      ],
      posts: []
    }
    const madeAt = '2026-10-26T10:00:00.000Z'
    const { sitemap, assets } = domain.buildBrief({ ...research, madeAt })
    const frozen = freezePlaceProfile({ research, at: madeAt })
    await seed(db.pool, { plan: null, placeProfile: frozen, brief: { sitemap, assets } })
    const content = createSiteContent({ pool: db.pool })
    const who = { siteKey: 'hill.tracy.test', email: 'owner@tracy.test', lang: 'vi' }
    const depicts = (got) => got.placeProfile.profile.media.flatMap((m) => m.value.relations)
    assert.deepEqual(depicts(await content.copyFor(who)), [], 'a candidate alone depicts nothing')
    const got = await content.copyFor({ ...who, pictures: [{ id: 'm-phin', vision: { subject: 'drink' } }] })
    assert.deepEqual(
      depicts(got).map((r) => [r.relation, r.entityId]),
      [['depicts', got.placeProfile.profile.offerings[0].id]]
    )
    assert.deepEqual(got.placeProfile.profile.media[0].value.relations.length, 1)
    assert.equal(frozen.profile.media[0].value.relations.length, 0)
  }
)

test('the latest retry owns the quickstart action fence and cancellation closes it', opts, async () => {
  const { quickstartActionOpen } = await import('../src/opportunities-build/site-content.js')
  const client = await db.pool.connect()
  try {
    await client.query(
      'create temporary table wo_demo_action (id text, account_id text, build_request_id text, revision_id text, status text, accepted_at timestamptz)'
    )
    await client.query(
      "insert into wo_demo_action values ('old','account','request','revision','failed','2026-10-21T16:04:00Z'),('retry','account','request','revision','queued','2026-10-21T16:06:00Z')"
    )
    const who = { accountId: 'account', requestId: 'request', revisionId: 'revision' }
    assert.equal(await quickstartActionOpen(client, who), true)
    assert.equal(await quickstartActionOpen(client, { ...who, revisionId: 'other' }), false)
    await client.query("update wo_demo_action set status='cancelled' where id='retry'")
    assert.equal(await quickstartActionOpen(client, who), false)
  } finally {
    await client.query('drop table if exists pg_temp.wo_demo_action')
    client.release()
  }
})
