/**
 * Research again, as the place card and the public Find draw it: the server's plan read safely, what will
 * run with its reason and price, what is kept, the total and who pays; refusals in the visitor's words; and
 * the pages a social search found, with their verdicts and short evidence.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  againRefusalKey,
  againView,
  formatCents,
  readAgainPreview,
  searchPagesOf
} from '../src/client/research-again.ts'

const PLAN = {
  run: [
    { part: 'facebook-search', reason: 'never', ceilingCents: 4 },
    { part: 'tripadvisor', reason: 'failed', ceilingCents: 2 }
  ],
  kept: [
    { part: 'google-places', reason: 'up-to-date' },
    { part: 'google-maps', reason: 'up-to-date' },
    { part: 'website', reason: 'none' },
    { part: 'tiktok', reason: 'unavailable', detail: 'credential_missing' }
  ],
  ceilingCents: 6
}

test('the account door reads as a plan the account pays, with what is left of today', () => {
  const preview = readAgainPreview({ plan: PLAN, payer: 'account', limit: { perDay: 20, usedToday: 3 } })
  assert.equal(preview.payer, 'account')
  assert.equal(preview.open, true)
  assert.equal(preview.left, 17)
  assert.equal(preview.plan.run.length, 2)
  assert.equal(preview.plan.ceilingCents, 6)
})

test('a used-up day closes the account door; the public door says itself whether it is open', () => {
  assert.equal(
    readAgainPreview({ plan: PLAN, payer: 'account', limit: { perDay: 2, usedToday: 2 } }).open,
    false
  )
  const pub = readAgainPreview({ placeId: 'ChIJ', plan: PLAN, payer: 'tracy', open: false })
  assert.equal(pub.payer, 'tracy')
  assert.equal(pub.open, false)
  assert.equal(pub.left, null)
})

test('a place never researched has no plan; junk rows and unknown reasons are dropped, not guessed', () => {
  assert.equal(readAgainPreview({ placeId: 'x', plan: null, payer: 'tracy', open: true }).plan, null)
  const read = readAgainPreview({
    plan: {
      run: [
        { part: 'website', reason: 'outdated', ceilingCents: 1 },
        { part: 7 },
        { part: 'tiktok', reason: 'whim', ceilingCents: 1 }
      ],
      kept: 'no',
      ceilingCents: 'lots'
    },
    payer: 'account'
  })
  assert.deepEqual(read.plan.run, [{ part: 'website', reason: 'outdated', ceilingCents: 1 }])
  assert.deepEqual(read.plan.kept, [])
  assert.equal(read.plan.ceilingCents, 1)
  assert.equal(readAgainPreview('nope'), null)
})

test('the view lists each part that runs with its reason and price, groups what is kept, and totals', () => {
  const view = againView(PLAN, 'en')
  assert.deepEqual(view.run, [
    { part: 'facebook-search', reasonKey: 'again.run.never', price: '$0.04' },
    { part: 'tripadvisor', reasonKey: 'again.run.failed', price: '$0.02' }
  ])
  assert.deepEqual(view.kept, [
    { parts: ['google-places', 'google-maps'], reasonKey: 'again.kept.up-to-date' },
    { parts: ['website'], reasonKey: 'again.kept.none' },
    { parts: ['tiktok'], reasonKey: 'again.kept.unavailable' }
  ])
  assert.equal(view.total, '$0.06')
  assert.equal(view.due, 2)
})

test('nothing due is its own state, never a run of nothing', () => {
  const view = againView(
    { run: [], kept: [{ part: 'website', reason: 'up-to-date' }], ceilingCents: 0 },
    'en'
  )
  assert.equal(view.due, 0)
  assert.equal(view.run.length, 0)
})

test('cents read as US dollars in the interface language', () => {
  assert.equal(formatCents(7, 'en'), '$0.07')
  assert.equal(formatCents(125, 'en'), '$1.25')
  assert.match(formatCents(7, 'de'), /0,07/)
})

test('each refusal has its own words; an unknown one is a plain failure', () => {
  assert.equal(againRefusalKey('NOTHING_DUE'), 'again.error.nothingDue')
  assert.equal(againRefusalKey('RESEARCH_AGAIN_LIMIT'), 'again.error.limit')
  assert.equal(againRefusalKey('JOB_ACTIVE'), 'again.error.running')
  assert.equal(againRefusalKey('AGAIN_UNSUPPORTED'), 'again.error.unsupported')
  assert.equal(againRefusalKey('PUBLIC_AGAIN_LIMIT'), 'again.error.publicPlace')
  assert.equal(againRefusalKey('PUBLIC_RESEARCH_SPENT'), 'again.error.publicSpent')
  assert.equal(againRefusalKey('PUBLIC_RESEARCH_LIMIT'), 'again.error.publicLimit')
  assert.equal(againRefusalKey('RATE_LIMITED'), 'again.error.publicLimit')
  assert.equal(againRefusalKey('NOT_RESEARCHED'), 'again.error.notResearched')
  assert.equal(againRefusalKey('NETWORK'), 'again.error.network')
  assert.equal(againRefusalKey('HTTP_500'), 'again.error.failed')
})

test('a search row lists its pages, added first, each with its verdict and short evidence', () => {
  const pages = searchPagesOf({
    source: 'instagram-search',
    status: 'complete',
    reason: 'pending',
    pages: [
      {
        url: 'https://www.instagram.com/samplesushi',
        network: 'instagram',
        verdict: 'pending',
        title: 'Sample Sushi (@samplesushi)',
        proofs: ['phone'],
        reasons: ['name_near', 'page_closed', 'odd_new_reason']
      },
      {
        url: 'https://www.facebook.com/samplesushibar',
        network: 'facebook',
        verdict: 'confirmed',
        title: null,
        proofs: ['address', 'phone'],
        reasons: []
      },
      { url: 'javascript:alert(1)', network: 'facebook', verdict: 'confirmed', proofs: [], reasons: [] },
      {
        url: 'https://www.facebook.com/sampleramen',
        network: 'facebook',
        verdict: 'rejected',
        proofs: [],
        reasons: ['locality_mismatch']
      }
    ]
  })
  assert.deepEqual(
    pages.map((p) => [p.verdictKey, p.url]),
    [
      ['again.page.confirmed', 'https://www.facebook.com/samplesushibar'],
      ['again.page.pending', 'https://www.instagram.com/samplesushi'],
      ['again.page.rejected', 'https://www.facebook.com/sampleramen']
    ]
  )
  assert.deepEqual(pages[0].proofKeys, ['again.proof.address', 'again.proof.phone'])
  assert.equal(pages[0].title, null)
  assert.deepEqual(pages[1].reasonKeys, ['again.why.name_near', 'again.why.page_closed', 'again.why.other'])
  assert.equal(pages[1].label, 'instagram.com/samplesushi')
})

test('a failed or empty search keeps its pages under coverage; other rows have none', () => {
  const pages = searchPagesOf({
    source: 'facebook-search',
    status: 'skipped',
    reason: 'not_found',
    coverage: {
      version: 'social-search-2',
      queries: 3,
      pages: [
        {
          url: 'https://facebook.com/other',
          network: 'facebook',
          verdict: 'rejected',
          reasons: ['name_mismatch']
        }
      ]
    }
  })
  assert.equal(pages.length, 1)
  assert.deepEqual(pages[0].reasonKeys, ['again.why.name_mismatch'])
  assert.deepEqual(
    searchPagesOf({ source: 'website', status: 'complete', pages: [{ url: 'https://x.example' }] }),
    []
  )
})

test('a public Research again press: a run to follow by its receipt, up to date, or a refusal', async () => {
  const { readAgainStart } = await import('../src/client/public-research.ts')
  assert.deepEqual(readAgainStart({ placeId: 'p', state: 'queued', receipt: 'r1', plan: null }), {
    ok: true,
    follow: { state: 'queued', receipt: 'r1' }
  })
  assert.deepEqual(readAgainStart({ placeId: 'p', state: 'running', receipt: 'r1' }), {
    ok: true,
    follow: { state: 'running', receipt: 'r1', stage: null }
  })
  assert.deepEqual(readAgainStart({ placeId: 'p', state: 'up-to-date', plan: {} }), {
    ok: false,
    code: 'NOTHING_DUE'
  })
  assert.deepEqual(readAgainStart({ placeId: 'p', state: 'refused', code: 'PUBLIC_AGAIN_LIMIT' }), {
    ok: false,
    code: 'PUBLIC_AGAIN_LIMIT'
  })
  assert.deepEqual(readAgainStart({ state: 'queued' }), { ok: false, code: 'UNKNOWN' })
  assert.deepEqual(readAgainStart(null), { ok: false, code: 'UNKNOWN' })
})
