import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  SOCIAL_APIFY,
  instagramApifyStats,
  tiktokApifyStats
} from '../domain/social-stats/apify-profiles.mjs'
const now = Date.parse('2026-10-20T09:22:30Z')
const ig = JSON.parse(
  await readFile(new URL('./fixtures/social-stats/instagram-apify.json', import.meta.url))
)
const tt = JSON.parse(await readFile(new URL('./fixtures/social-stats/tiktok-apify.json', import.meta.url)))
const goodIg = ig.find((r) => r.username === 'quillbasilrestaurant')
const goodTt = tt[0]
const igUrl = goodIg.url,
  ttUrl = goodTt.profileUrl
test('piloted Instagram rows preserve identity, follower counts and measured dates with partial coverage', () => {
  const s = instagramApifyStats([goodIg], igUrl, { now })
  assert.equal(s.platformId, '71793498611')
  assert.equal(s.followers, 47)
  assert.equal(s.posts, 130)
  assert.equal(s.coverage, 'partial')
  assert.equal(s.postsPerMonth, 4)
  assert.equal(
    s.lastPostAt,
    goodIg.latestPosts
      .map((p) => p.timestamp)
      .sort()
      .at(-1)
  )
  assert.deepEqual(SOCIAL_APIFY.instagram.input(igUrl), {
    usernames: ['quillbasilrestaurant'],
    includeAboutSection: false
  })
})
test('piloted TikTok counts are followers rather than hearts; pinned posts do not imply complete history', () => {
  const s = tiktokApifyStats([goodTt], ttUrl, { now })
  assert.equal(s.platformId, '6791898425841258549')
  assert.equal(s.followers, 164)
  assert.equal(s.posts, 35)
  assert.equal(s.coverage, 'partial')
  assert.equal(s.lastPostAt, '2026-06-29T01:58:22.000Z')
  assert.deepEqual(SOCIAL_APIFY.tiktok.input(ttUrl), {
    profiles: ['@brindledeli'],
    includeRecentVideos: true,
    maxRecentVideos: 10
  })
})
for (const [name, map, good, url, field] of [
  ['Instagram', instagramApifyStats, goodIg, igUrl, 'latestPosts'],
  ['TikTok', tiktokApifyStats, goodTt, ttUrl, 'recentVideos']
]) {
  test(`${name}: empty, diagnostic, future dates and conflicting identity are technical failures`, () => {
    for (const items of [
      [],
      [{ ...good, error: 'not_found' }],
      [{ ...good, username: 'someone.else' }],
      [
        {
          ...good,
          [field]: [
            { ...good[field][0], timestamp: '2099-01-01T00:00:00Z', createdAt: '2099-01-01T00:00:00Z' }
          ]
        }
      ]
    ])
      assert.throws(() => map(items, url, { now }), { code: 'schema_error' })
  })
  test(`${name}: private or unreadable posts remain null, including cadence`, () => {
    for (const row of [
      { ...good, private: true, isPrivate: true },
      { ...good, [field]: [] }
    ]) {
      const s = map([row], url, { now })
      assert.equal(s.lastPostAt, null)
      assert.equal(s.postsPerMonth, null)
      assert.equal(s.coverage, 'partial')
    }
  })
}
test('TikTok diagnostic omission and unverified all-zero responses never become an empty account', () => {
  assert.throws(() => tiktokApifyStats([tt[1]], 'https://www.tiktok.com/@chefexample', { now }), {
    code: 'schema_error'
  })
  assert.throws(
    () =>
      tiktokApifyStats([{ ...goodTt, followerCount: 0, videoCount: 0, recentVideos: [] }], ttUrl, { now }),
    { code: 'schema_error' }
  )
})
