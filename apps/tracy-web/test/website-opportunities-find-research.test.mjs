import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeFindCheck, usableResearch, withResearch } from 'website-opportunities/src/find-research.js'

const publicRow = {
  snapshot_id: 'published',
  scope: 'full',
  published_at: '2026-10-20T10:00:00Z',
  profile: {
    name: 'Public restaurant',
    phone: '+123',
    website: 'https://public.example',
    pageSpeed: { performance: 31, checkedAt: '2026-10-20T10:00:00Z' }
  },
  sources: [{ status: 'complete', collected_at: '2026-10-20T09:00:00Z' }]
}

test('a newer partial research measurement keeps previously checked public contacts and CMS', () => {
  const cached = {
    status: 'done',
    performance: 41,
    checkedAt: '2026-10-19T10:00:00Z',
    emails: ['public@example.test'],
    cms: 'WordPress'
  }
  const merged = mergeFindCheck(publicRow.profile.pageSpeed, cached)
  assert.equal(merged.performance, 31)
  assert.deepEqual(merged.emails, cached.emails)
  assert.equal(merged.cms, 'WordPress')
  assert.equal(
    mergeFindCheck(cached, { status: 'done', performance: 75, checkedAt: '2026-10-21T10:00:00Z' })
      .performance,
    75
  )
})

test('a full profile needs observed source evidence before offering Build demo', () => {
  assert.equal(usableResearch(publicRow), true)
  assert.equal(usableResearch({ ...publicRow, scope: 'prefetch' }), false)
  assert.equal(usableResearch({ ...publicRow, sources: [] }), false)
  assert.equal(usableResearch({ ...publicRow, profile: {} }), false)
})

test('Find keeps current Google facts, fills public gaps and uses only account-scoped workflow metadata', () => {
  const candidate = { name: 'Current Google name', phone: '+456', status: 'new', socials: {} }
  const warm = withResearch(candidate, publicRow)
  assert.equal(warm.name, candidate.name)
  assert.equal(warm.phone, '+456')
  assert.equal(warm.website, publicRow.profile.website)
  assert.equal(warm.status, 'researched')
  assert.equal(warm.findAction.kind, 'build')
  assert.equal(warm.findAction.opportunityId, undefined)
  assert.equal(candidate.status, 'new')
  assert.equal(
    withResearch(candidate, { ...publicRow, opportunity_id: 'mine', site_key: 'mine.example' }).findAction
      .kind,
    'view'
  )
  assert.equal(
    withResearch(candidate, { ...publicRow, opportunity_id: 'mine', action_id: 'queued' }).findAction.kind,
    'building'
  )
})

test('Tripadvisor review totals require a successful match of the exact branch and matching URL identity', async () => {
  const { tripadvisorReviewOf } = await import('website-opportunities/src/find-research.js')
  const review = {
    placeId: '12345',
    rating: 4.5,
    reviewCount: 238,
    match: { status: 'matched', placeId: '12345' }
  }
  const source = {
    source: 'tripadvisor',
    status: 'complete',
    ref: 'https://www.tripadvisor.com/12345',
    collected_at: '2026-10-21T10:00:00Z',
    review
  }
  assert.deepEqual(tripadvisorReviewOf([source]), {
    rating: 4.5,
    reviews: 238,
    url: source.ref,
    checkedAt: source.collected_at
  })
  for (const changed of [
    { ...source, status: 'failed' },
    { ...source, review: { ...review, match: { ...review.match, status: 'ambiguous' } } },
    { ...source, review: { ...review, scope: 'brand', branchVerified: false } },
    { ...source, review: { ...review, match: { ...review.match, scope: 'brand' } } },
    { ...source, ref: 'https://www.tripadvisor.com/99999' },
    { ...source, ref: 'https://www.tripadvisor.com.attacker.test/12345' },
    { ...source, review: { ...review, rating: null, reviewCount: null } }
  ])
    assert.equal(tripadvisorReviewOf([changed]), null)
  assert.equal(tripadvisorReviewOf([]), null)
})
