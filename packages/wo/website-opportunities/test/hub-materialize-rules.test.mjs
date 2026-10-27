// Field selection of the hub snapshot: pure, deterministic rules per field (no database).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefFactsOf, deriveContent, POLICY_VERSION, selectFields } from '../src/hub/materialize.js'

let n = 0
const obs = (field, value, family, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  field,
  value,
  family,
  objectId: extra.objectId ?? `${family}-object`,
  fetchedAt: extra.fetchedAt ?? '2026-10-20T10:00:00.000Z',
  evidenceHash: 'h'
})

test('one source gives a chosen value with its provenance', () => {
  const fields = selectFields([obs('website', 'https://cafe.example/', 'google_maps')], POLICY_VERSION)
  assert.equal(fields.website.status, 'chosen')
  assert.equal(fields.website.value, 'https://cafe.example/')
  assert.deepEqual(fields.website.provenance.sources, ['google_maps'])
  assert.equal(fields.website.blocksBrief, false)
})

test('within one source object the newest hub fetch wins', () => {
  const fields = selectFields(
    [
      obs('phone', '+31 20 111', 'google_maps', { fetchedAt: '2026-10-01T00:00:00Z', objectId: 'X' }),
      obs('website', 'https://old.example/', 'google_maps', {
        fetchedAt: '2026-10-01T00:00:00Z',
        objectId: 'X'
      }),
      obs('website', 'https://new.example/', 'google_maps', {
        fetchedAt: '2026-10-10T00:00:00Z',
        objectId: 'X'
      })
    ],
    POLICY_VERSION
  )
  assert.equal(fields.website.value, 'https://new.example/')
  assert.equal(fields.website.status, 'chosen')
  assert.deepEqual(fields.website.alternatives, [])
})

test('twenty copies of the same Google data are one source family, not twenty votes', () => {
  const google = Array.from({ length: 20 }, () =>
    obs('website', 'https://a.example/', 'google_maps', { objectId: 'G' })
  )
  const fields = selectFields(
    [
      ...google,
      obs('website', 'https://b.example/', 'tripadvisor'),
      obs('website', 'https://b.example/', 'facebook')
    ],
    POLICY_VERSION
  )
  assert.equal(fields.website.status, 'conflicted')
  assert.equal(fields.website.value, null)
  assert.equal(fields.website.blocksBrief, true)
  assert.deepEqual(fields.website.alternatives.map((a) => a.sources).sort(), [
    ['facebook', 'tripadvisor'],
    ['google_maps']
  ])
})

test('a higher-priority source outranks one lower source without a conflict', () => {
  const fields = selectFields(
    [
      obs('website', 'https://a.example/', 'google_maps'),
      obs('website', 'https://b.example/', 'tripadvisor')
    ],
    POLICY_VERSION
  )
  assert.equal(fields.website.status, 'chosen')
  assert.equal(fields.website.value, 'https://a.example/')
  assert.deepEqual(
    fields.website.alternatives.map((a) => a.value),
    ['https://b.example/']
  )
})

test('two equally ranked sources that disagree are conflicted', () => {
  const fields = selectFields(
    [obs('website', 'https://a.example/', 'google_maps'), obs('website', 'https://b.example/', 'osm')],
    POLICY_VERSION
  )
  assert.equal(fields.website.status, 'conflicted')
})

test('URLs that differ only in scheme, www or trailing slash agree', () => {
  const fields = selectFields(
    [obs('website', 'https://www.a.example/', 'google_maps'), obs('website', 'http://a.example', 'osm')],
    POLICY_VERSION
  )
  assert.equal(fields.website.status, 'chosen')
  assert.deepEqual(fields.website.provenance.sources, ['google_maps', 'osm'])
})

test('a low-impact field keeps a conflicted value but reports it', () => {
  const fields = selectFields(
    [
      obs('description', 'Coffee', 'business_website'),
      obs('description', 'Tea', 'business_website', { objectId: 'other' })
    ],
    POLICY_VERSION
  )
  // one family: the newest object wins, no conflict
  assert.equal(fields.description.status, 'chosen')
  const conflicted = selectFields(
    [
      obs('category', 'cafe', 'google_maps'),
      obs('category', 'bar', 'google_maps', { objectId: 'g2', fetchedAt: '2026-10-01T00:00:00Z' }),
      obs('category', 'bar', 'osm'),
      obs('category', 'bar', 'tripadvisor')
    ],
    POLICY_VERSION
  )
  assert.equal(conflicted.category.status, 'conflicted')
  assert.equal(conflicted.category.blocksBrief, false)
  assert.notEqual(conflicted.category.value, null)
})

test('locations within 150 m agree; farther apart they conflict and are never averaged', () => {
  const near = selectFields(
    [
      obs('location', { latitude: 52.37, longitude: 4.89 }, 'google_maps'),
      obs('location', { latitude: 52.3705, longitude: 4.89 }, 'osm')
    ],
    POLICY_VERSION
  )
  assert.equal(near.location.status, 'chosen')
  assert.deepEqual(near.location.value, { latitude: 52.37, longitude: 4.89 })
  const far = selectFields(
    [
      obs('location', { latitude: 52.37, longitude: 4.89 }, 'google_maps'),
      obs('location', { latitude: 52.38, longitude: 4.89 }, 'osm')
    ],
    POLICY_VERSION
  )
  assert.equal(far.location.status, 'conflicted')
  assert.equal(far.location.value, null)
})

test('phones are a set; ratings stay per source', () => {
  const fields = selectFields(
    [
      obs('phone', '+31 20 111', 'google_maps'),
      obs('phone', '+31 20 222', 'business_website'),
      obs('rating', { rating: 4.5, reviewCount: 120 }, 'google_maps'),
      obs('rating', { rating: 4.0, reviewCount: 30 }, 'tripadvisor')
    ],
    POLICY_VERSION
  )
  assert.deepEqual(fields.phone.value, ['+31 20 111', '+31 20 222'])
  assert.deepEqual(fields.rating.value, {
    google_maps: { rating: 4.5, reviewCount: 120 },
    tripadvisor: { rating: 4.0, reviewCount: 30 }
  })
})

test('fields outside the closed list are ignored', () => {
  const fields = selectFields([obs('pipeline_notes', 'call him', 'google_maps')], POLICY_VERSION)
  assert.equal(fields.pipeline_notes, undefined)
})

test('the result does not depend on the order observations arrive in', () => {
  const list = [
    obs('website', 'https://a.example/', 'google_maps'),
    obs('website', 'https://b.example/', 'osm'),
    obs('phone', '+1', 'osm'),
    obs('name', 'Cafe', 'google_maps')
  ]
  const a = selectFields(list, POLICY_VERSION)
  const b = selectFields([...list].reverse(), POLICY_VERSION)
  assert.deepEqual(a, b)
})

test('an unknown policy version is refused', () => {
  assert.throws(() => selectFields([], 'hub-policy/999'), /policy/)
})

test('no website is "not found in sources X, Y at T", never "no website"', () => {
  const list = [
    obs('name', 'Cafe', 'google_maps', { fetchedAt: '2026-10-20T10:00:00.000Z' }),
    obs('phone', '+1', 'osm', { fetchedAt: '2026-10-21T10:00:00.000Z' })
  ]
  const { content, provenance } = deriveContent(selectFields(list, POLICY_VERSION), list)
  assert.deepEqual(content.websiteVerdict, { state: 'not_found', checkedSources: ['google_maps', 'osm'] })
  assert.equal(provenance.websiteVerdict.checkedAt, '2026-10-21T10:00:00.000Z')
  assert.equal(content.score.reasons.includes('web.none'), true)
})

test('a conflicted website holds the score instead of scoring "no website"', () => {
  const list = [
    obs('website', 'https://a.example/', 'google_maps'),
    obs('website', 'https://b.example/', 'osm')
  ]
  const { content } = deriveContent(selectFields(list, POLICY_VERSION), list)
  assert.equal(content.websiteVerdict.state, 'conflicted')
  assert.equal(content.score.pending, true)
  assert.equal(content.score.reasons.includes('web.none'), false)
})

test('a brief gets no conflicted website, contact, identity or location', () => {
  const list = [
    obs('website', 'https://a.example/', 'google_maps'),
    obs('website', 'https://b.example/', 'osm'),
    obs('name', 'Cafe', 'google_maps'),
    obs('category', 'cafe', 'google_maps'),
    obs('category', 'bar', 'osm'),
    obs('category', 'bar', 'tripadvisor')
  ]
  const facts = briefFactsOf(selectFields(list, POLICY_VERSION))
  assert.equal('website' in facts.facts, false)
  assert.deepEqual(facts.blocked, [{ field: 'website', status: 'conflicted' }])
  assert.equal(facts.facts.name, 'Cafe')
  assert.equal(facts.facts.category, 'cafe')
  assert.deepEqual(facts.conflicts, ['category', 'website'])
})
