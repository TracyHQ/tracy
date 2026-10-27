import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  FACEBOOK_APIFY,
  facebookApifyInput,
  facebookApifyStats
} from '../domain/social-stats/facebook-apify.mjs'
import { fetchSocialStats } from '../domain/social-stats/chain.mjs'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/social-stats/facebook-apify-topapi.json', import.meta.url))
)
const url = 'https://www.facebook.com/TamarelHoiAn'
const now = Date.parse('2026-10-20T08:00:00Z')

test('piloted rows supply real followers and dates, never pretend to cover a whole timeline', () => {
  const stat = facebookApifyStats(fixture, url, { now })
  assert.equal(stat.followers, 185)
  assert.equal(stat.lastPostAt, fixture[0].published_at)
  assert.equal(stat.posts, null)
  assert.equal(stat.coverage, 'partial')
  assert.equal(facebookApifyStats([...fixture, fixture[0]], url, { now }).postsPerMonth, stat.postsPerMonth)
  assert.deepEqual(facebookApifyInput(url), { startUrls: [url], maxPosts: 20, includePostDetails: false })
  assert.equal(FACEBOOK_APIFY.maxChargeUsd, 0.03)
})

test('missing followers stay null; zero is a measured number and likes are never substituted', () => {
  const rows = fixture.map((r) => ({ ...r, page_followers: null, page_likes: 9999 }))
  assert.equal(facebookApifyStats(rows, url, { now }).followers, null)
  assert.equal(
    facebookApifyStats(
      rows.map((r) => ({ ...r, page_followers: 0 })),
      url,
      { now }
    ).followers,
    0
  )
})

test('numeric page URLs require the exact observed source id', () => {
  const numericUrl = 'https://www.facebook.com/profile.php?id=156878528267439'
  const rows = fixture.map((r) => ({ ...r, input_url: numericUrl }))
  assert.equal(facebookApifyStats(rows, numericUrl, { now }).platformId, '156878528267439')
  assert.throws(
    () =>
      facebookApifyStats(
        rows.map((r) => ({ ...r, source_id: '181235555712013' })),
        numericUrl,
        { now }
      ),
    (e) => e.code === 'schema_error'
  )
})

for (const [name, rows] of [
  ['empty', []],
  ['diagnostic', [{ errorCode: 'NO_RESULTS' }]],
  ['sample', [{ ...fixture[0], _sample: true }]],
  ['wrong page', [{ ...fixture[0], input_url: 'https://www.facebook.com/anotherpage' }]],
  [
    'wrong source despite matching input echo',
    [
      {
        ...fixture[0],
        source_url: 'https://www.facebook.com/ExampleSpaceAgency',
        source_id: '181235555712013'
      }
    ]
  ],
  ['invalid date', [{ ...fixture[0], published_at: 'not-a-date' }]],
  ['future date', [{ ...fixture[0], published_at: '2099-01-01T00:00:00Z' }]],
  ['date disagreement', [{ ...fixture[0], timestamp: 1 }]],
  ['mixed identities', [fixture[0], { ...fixture[1], source_id: '1234567' }]],
  ['unbounded output', Array(21).fill(fixture[0])]
])
  test(`${name} is a technical failure, not a zero or a missing page`, () => {
    assert.throws(
      () => facebookApifyStats(rows, url, { now }),
      (e) => e.code === 'schema_error'
    )
  })

test('the Facebook chain delegates to the durable runner only after earlier providers are unavailable', async () => {
  let called = 0
  const result = await fetchSocialStats(
    { network: 'facebook', url },
    {
      apifyToken: 'test-token',
      keys: {},
      apifyProfile: async () => {
        called++
        return facebookApifyStats(fixture, url, { now })
      }
    }
  )
  assert.equal(result.provider, 'apify')
  assert.equal(called, 1)
  assert.deepEqual(result.attempts, [
    { provider: 'scrapecreators', code: 'credential_missing' },
    { provider: 'scraper3', code: 'credential_missing' }
  ])
})
