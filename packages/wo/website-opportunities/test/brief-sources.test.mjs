// A brief lists every source its research tried, the failed ones with their status and error code, so a reader
// knows why some data is thin (a Google Maps 429, a TripAdvisor 402).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { briefSourceEntry, withAttemptedSources } from '../domain/brief-sources.mjs'
import { renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { fromPlace, makeSiteBrief } from '../src/brief-research.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)

const instagram = {
  source: 'instagram',
  ref: 'https://www.instagram.com/harboursportclub.test/',
  status: 'complete',
  reason: null,
  coverage: { fetched: 12, attempts: [{ status: 'complete', provider: 'scrapecreators' }] }
}
const googleMaps = {
  source: 'google-maps',
  ref: null,
  status: 'failed',
  reason: 'HTTP_429',
  coverage: {
    pending: false,
    version: 'google-maps-1',
    pipeline: { place: { code: 'HTTP_429', state: 'failed' } },
    pipelineJobId: 'job-1'
  }
}
const tripadvisor = {
  source: 'tripadvisor',
  ref: null,
  status: 'failed',
  reason: 'HTTP_402',
  coverage: {
    version: 'tripadvisor-5',
    outcomes: [
      { step: 'match', reason: 'HTTP_429', status: 'failed', provider: 'serpapi' },
      { step: 'match', reason: 'APPLICATION_ERROR', status: 'failed', provider: 'rapidapi' },
      { step: 'match', reason: 'HTTP_402', status: 'failed', provider: 'litescrape' }
    ]
  }
}
const googlePlaces = {
  source: 'google-places',
  ref: 'HarbourSportClub1',
  status: 'complete',
  reason: null,
  coverage: null
}
const pending = { source: 'facebook', ref: null, status: 'pending', reason: null, coverage: null }

test('a failed source keeps its code, its HTTP status and every provider it tried', () => {
  assert.deepEqual(briefSourceEntry(tripadvisor), {
    source: 'tripadvisor',
    status: 'failed',
    reason: 'HTTP_402',
    code: 'HTTP_402',
    httpStatus: 402,
    coverage: { fetched: 0 },
    attempts: [
      { provider: 'serpapi', status: 'failed', step: 'match', code: 'HTTP_429', httpStatus: 429 },
      { provider: 'rapidapi', status: 'failed', step: 'match', code: 'APPLICATION_ERROR' },
      { provider: 'litescrape', status: 'failed', step: 'match', code: 'HTTP_402', httpStatus: 402 }
    ]
  })
  assert.deepEqual(briefSourceEntry(googleMaps), {
    source: 'google-maps',
    status: 'failed',
    reason: 'HTTP_429',
    code: 'HTTP_429',
    httpStatus: 429,
    coverage: { fetched: 0 }
  })
  // A complete source keeps its coverage and the providers that answered.
  assert.deepEqual(briefSourceEntry(instagram), {
    source: 'instagram',
    status: 'complete',
    coverage: { fetched: 12, attempts: [{ status: 'complete', provider: 'scrapecreators' }] },
    attempts: [{ provider: 'scrapecreators', status: 'complete' }]
  })
})

test('fromPlace carries every source the run tried, failures included, never a pending one', () => {
  const read = fromPlace({
    sources: [{ ...instagram, shared: true }],
    shown: [instagram, googlePlaces, googleMaps, tripadvisor, pending].map((s) => ({
      ...s,
      updated_at: new Date('2026-10-20T08:00:00Z'),
      shared: true
    })),
    profile: { name: 'Harbour Sport Club' },
    brand: null,
    media: []
  })
  assert.deepEqual(
    read.attemptedSources.map((s) => [s.source, s.status, s.reason]),
    [
      ['instagram', 'complete', null],
      ['google-places', 'complete', null],
      ['google-maps', 'failed', 'HTTP_429'],
      ['tripadvisor', 'failed', 'HTTP_402']
    ]
  )
  assert.ok(read.attemptedSources.every((s) => !('updated_at' in s) && !('shared' in s)))
})

test('withAttemptedSources adds the sources a brief left out and says what a failed one leaves missing', () => {
  const brief = {
    sources: [{ source: 'instagram', status: 'complete', coverage: { fetched: 12 } }],
    missing: []
  }
  const out = withAttemptedSources(brief, [instagram, googlePlaces, googleMaps, tripadvisor, pending])
  assert.deepEqual(
    out.sources.map((s) => [s.source, s.status, s.httpStatus ?? null]),
    [
      ['instagram', 'complete', null],
      ['google-places', 'complete', null],
      ['google-maps', 'failed', 429],
      ['tripadvisor', 'failed', 402]
    ]
  )
  assert.deepEqual(
    out.missing.map((m) => m.field),
    ['source:google-maps', 'source:tripadvisor']
  )
  assert.match(out.missing[1].why, /HTTP_402/)
  // No attempt list: the brief is returned as it was.
  assert.equal(withAttemptedSources(brief, undefined), brief)
})

test('a site brief made from research lists Google Maps 429 and TripAdvisor 402, and still validates', () => {
  const read = {
    profile: HSC.profile,
    brand: HSC.brand,
    sources: [instagram],
    attemptedSources: [instagram, googlePlaces, googleMaps, tripadvisor],
    media: HSC.media,
    posts: HSC.posts
  }
  const brief = makeSiteBrief(domain, read, { opportunity: HSC.opportunity, madeAt: HSC.madeAt })
  const bySource = new Map(brief.sources.map((s) => [s.source, s]))
  assert.deepEqual([...bySource.keys()].sort(), ['google-maps', 'google-places', 'instagram', 'tripadvisor'])
  assert.equal(bySource.get('google-maps').httpStatus, 429)
  assert.equal(bySource.get('tripadvisor').code, 'HTTP_402')
  assert.deepEqual(
    bySource.get('tripadvisor').attempts.map((a) => a.provider),
    ['serpapi', 'rapidapi', 'litescrape']
  )
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const md = renderBriefMarkdown(brief)
  assert.match(md, /- google-maps: failed \(HTTP_429\)/)
  assert.match(md, /- tripadvisor: failed \(HTTP_402\).*litescrape failed HTTP_402/)
})

test('a brief made without attempted sources keeps its sources as before (schema 2 readers)', () => {
  const read = {
    profile: HSC.profile,
    brand: HSC.brand,
    sources: [instagram],
    media: HSC.media,
    posts: HSC.posts
  }
  const brief = makeSiteBrief(domain, read, { opportunity: HSC.opportunity, madeAt: HSC.madeAt })
  assert.deepEqual(
    brief.sources.map((s) => s.source),
    ['instagram']
  )
  for (const s of brief.sources) for (const key of ['source', 'status', 'coverage']) assert.ok(key in s, key)
})
