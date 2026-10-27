/**
 * The research card's two search rows (`facebook-search`, `instagram-search`) carry the pages the search found,
 * so the card can say which page was added, which needs a check and which was not used. Short evidence only:
 * no page facts, no provider answer. Every other row is unchanged.
 *
 *   node --test apps/tracy-web/test/opportunities-search-row-pages.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { searchRowPages } from 'website-opportunities/src/place-view.js'

const page = {
  url: 'https://www.facebook.com/samplesushibar',
  network: 'facebook',
  verdict: 'confirmed',
  provider: 'jina',
  evidence: {
    query: 'Sample Sushi Bar Dubai facebook',
    title: 'Sample Sushi Bar | Dubai',
    proofs: ['address', 'phone'],
    reasons: [],
    page: { name: 'Sample Sushi Bar', phone: '+971 4 000 0000' }
  }
}

test('a search that found pages carries each one with its verdict and short evidence', () => {
  const row = { source: 'facebook-search', status: 'complete', collected: { queries: 2, pages: [page] } }
  assert.deepEqual(searchRowPages(row), {
    queries: 2,
    pages: [
      {
        url: 'https://www.facebook.com/samplesushibar',
        network: 'facebook',
        verdict: 'confirmed',
        title: 'Sample Sushi Bar | Dubai',
        proofs: ['address', 'phone'],
        reasons: []
      }
    ]
  })
})

test('a failed or empty search reads its pages from coverage', () => {
  const row = {
    source: 'instagram-search',
    status: 'skipped',
    reason: 'not_found',
    coverage: {
      version: 'social-search-2',
      queries: 3,
      pages: [{ ...page, verdict: 'rejected', evidence: { reasons: ['name_mismatch'] } }]
    }
  }
  const got = searchRowPages(row)
  assert.equal(got.queries, 3)
  assert.deepEqual(got.pages[0].reasons, ['name_mismatch'])
  assert.deepEqual(got.pages[0].proofs, [])
  assert.equal(got.pages[0].title, null)
})

test('other rows and rows without pages add nothing', () => {
  assert.equal(searchRowPages({ source: 'facebook', status: 'complete', collected: { pages: [page] } }), null)
  assert.equal(searchRowPages({ source: 'facebook-search', status: 'failed', reason: 'timeout' }), null)
})
