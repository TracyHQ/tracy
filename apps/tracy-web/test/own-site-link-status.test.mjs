import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { ownSiteRoutes } from '../src/opportunities-build/own-site.js'
import { mintSession } from '../src/lib/session.js'

const ID = '11111111-1111-4111-8111-111111111111'
const GOOGLE = 'https://share.google/fictionalBirchBakery'
const SOCIAL = 'https://instagram.com/fictional.birch.bakery'
const WEBSITE = 'https://birch-bakery.example'
const secret = 's'.repeat(32)

async function researchResult(links, sources, media = []) {
  const opp = {
    id: ID,
    name: 'Birch Bakery',
    provider: 'url',
    candidate: { trade: 'food', ownSite: { requestId: 'fictional-request' }, pastedLinks: links }
  }
  const pool = {
    query: async (sql) => {
      if (sql.includes('from ui_setting')) return { rows: [{ on: true }] }
      if (sql.includes('from wo_source')) return { rows: sources }
      if (sql.includes('from wo_media')) return { rows: media }
      if (sql.includes('from wo_demo_action')) return { rows: [] }
      if (sql.includes('select candidate from wo_opportunity'))
        return { rows: [{ candidate: opp.candidate }] }
      if (sql.includes('from wo_preference')) return { rows: [] }
      throw new Error(`Unexpected query: ${sql}`)
    }
  }
  const app = new Hono()
  ownSiteRoutes(app, {
    pool,
    config: { sessionSecret: secret },
    now: () => 0,
    ensureAccount: async () => ({ id: 'fictional-account' }),
    opportunityOf: async () => opp,
    domainOr: async () => ({}),
    jobsOfOpportunity: async () => [{ id: 'fictional-job', state: 'completed' }],
    jobShape: (job) => ({ id: job.id, state: job.state }),
    templateCards: async () => ({ cards: [] })
  })
  const response = await app.request(`/api/sites/from-business/${ID}`, {
    headers: { cookie: `tracy_sess=${await mintSession('owner@example.test', secret)}` }
  })
  assert.equal(response.status, 200)
  return (await response.json()).business
}

const pending = (url, kind, primary = false) => ({ url, kind, used: true, readStatus: 'pending', primary })

test('research polling keeps an unconfigured Google link and blocks automatic template advancement', async () => {
  const business = await researchResult(
    [
      {
        url: GOOGLE,
        kind: 'google',
        used: false,
        reason: 'unresolvable',
        primary: true,
        readStatus: 'could-not-read',
        readReason: 'not-configured'
      },
      pending(WEBSITE, 'website')
    ],
    [
      {
        source: 'website',
        ref: WEBSITE,
        status: 'complete',
        collected: { profile: { phone: '+1 202 555 0144' } }
      }
    ]
  )
  assert.equal(business.links.length, 2)
  assert.equal(business.links[0].readReason, 'not-configured')
  assert.equal(business.links[1].readStatus, 'read')
  assert.equal(business.requiresLinkReview, true)
  assert.deepEqual(business.job.result.links, business.links)
})

test('a private social profile is reported beside the exact link, even if an old profile was collected', async () => {
  const business = await researchResult(
    [pending(SOCIAL, 'instagram', true)],
    [
      {
        source: 'instagram',
        ref: SOCIAL,
        status: 'failed',
        reason: 'private_or_empty',
        collected: { profile: { phone: '+1 202 555 0144' }, media: [{ kind: 'image' }] }
      }
    ]
  )
  assert.equal(business.links[0].readStatus, 'could-not-read')
  assert.equal(business.links[0].readReason, 'blocked')
  assert.equal(business.requiresLinkReview, true)
})

test('when every pasted source reads, research returns exact contribution counts and permits the template choice', async () => {
  const business = await researchResult(
    [pending(WEBSITE, 'website', true), pending(SOCIAL, 'instagram')],
    [
      {
        source: 'website',
        ref: WEBSITE,
        status: 'complete',
        collected: { profile: { phone: '+1 202 555 0144', email: 'bakery@example.test' } }
      },
      {
        source: 'instagram',
        ref: SOCIAL,
        status: 'complete',
        collected: { reviews: [{ text: 'Fresh fictional bread.' }] }
      }
    ],
    [{ source: 'instagram', kind: 'image', status: 'stored' }]
  )
  assert.equal(
    business.links.every((l) => l.readStatus === 'read'),
    true
  )
  assert.deepEqual(business.links[0].counts, { photos: 0, reviews: 0, contacts: 2 })
  assert.deepEqual(business.links[1].counts, { photos: 1, reviews: 1, contacts: 0 })
  assert.equal(business.requiresLinkReview, false)
  assert.equal(business.phase, 'choose')
})

test('another profile on the same network cannot make the pasted profile look read', async () => {
  const business = await researchResult(
    [pending(SOCIAL, 'instagram', true)],
    [
      {
        source: 'instagram',
        ref: 'https://instagram.com/fictional.other.bakery',
        status: 'complete',
        collected: { profile: { name: 'Other Bakery' } }
      }
    ]
  )
  assert.equal(business.links[0].readStatus, 'could-not-read')
  assert.equal(business.links[0].readReason, 'unresolved')
  assert.equal(business.requiresLinkReview, true)
})

test('the latest failed attempt remains visible when shared research keeps earlier collected data', async () => {
  const business = await researchResult(
    [pending(WEBSITE, 'website', true)],
    [
      {
        source: 'website',
        ref: WEBSITE,
        status: 'complete',
        collected: { profile: { name: 'Birch Bakery' } },
        last_error: { status: 'failed', reason: 'timeout', at: '2026-10-29T08:00:00Z' }
      }
    ]
  )
  assert.equal(business.links[0].readStatus, 'could-not-read')
  assert.equal(business.links[0].readReason, 'fetch-failed')
  assert.equal(business.requiresLinkReview, true)
})

test('Google contribution counts use collected contact aliases and actual review items', async () => {
  const business = await researchResult(
    [pending(GOOGLE, 'google', true)],
    [
      {
        source: 'google-places',
        ref: 'ChIJfictionalBirch',
        status: 'complete',
        collected: {
          formattedAddress: '12 Fictional Lane',
          nationalPhoneNumber: '(202) 555-0144',
          internationalPhoneNumber: '+1 202 555 0144',
          userRatingCount: 999,
          reviews: [{ text: 'Fresh fictional bread.' }]
        }
      }
    ],
    [
      { source: 'google-places', kind: 'image', status: 'stored' },
      { source: 'google-places', kind: 'image', status: 'failed' }
    ]
  )
  assert.deepEqual(business.links[0].counts, { photos: 1, reviews: 1, contacts: 2 })
})

test('a timeout with zero collected items is unread even when the collector calls it partial', async () => {
  const business = await researchResult(
    [pending(WEBSITE, 'website', true)],
    [
      {
        source: 'website',
        ref: WEBSITE,
        status: 'partial',
        reason: 'timeout',
        coverage: { fetched: 0 },
        collected: { profile: null, media: [], posts: [], pages: [] }
      }
    ]
  )
  assert.equal(business.links[0].readStatus, 'could-not-read')
  assert.equal(business.links[0].readReason, 'fetch-failed')
  assert.equal(business.requiresLinkReview, true)
})
