import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchSocialStats, SOCIAL_CHAINS, ADVANCE_CODES } from '../domain/social-stats/chain.mjs'
import { PROVIDERS, SocialStatsError } from '../domain/social-stats/providers.mjs'

const NOW = Date.parse('2026-10-19T00:00:00Z')
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/social-stats/${name}.json`, import.meta.url), 'utf8')

/** A stub provider that throws `code` or returns a stat, and records that it ran with which key. */
function stub(network, provider, credential, outcome, ran) {
  return {
    network,
    provider,
    credential,
    async fetchProfile(target, deps) {
      ran.push({ provider, key: deps.key, target })
      if (typeof outcome === 'string')
        throw new SocialStatsError(outcome, `${provider} said ${outcome}`, { provider })
      return { network, provider, followers: outcome.followers }
    }
  }
}

test('the configured chains', () => {
  // test-quality: contract the provider order per network is a product decision; reordering must be deliberate
  assert.deepEqual(SOCIAL_CHAINS, {
    instagram: ['instagram/scrapecreators', 'instagram/looter2', 'instagram/stable', 'instagram/apify'],
    facebook: ['facebook/scrapecreators', 'facebook/scraper3', 'facebook/apify'],
    tiktok: ['tiktok/scrapecreators', 'tiktok/api23', 'tiktok/apify'],
    youtube: ['youtube/official', 'youtube/yt-api']
  })
})

test('first provider wins: no fallbackFrom', async () => {
  const ran = []
  const providers = { 'instagram/looter2': stub('instagram', 'looter2', 'rapidapi', { followers: 5 }, ran) }
  const r = await fetchSocialStats(
    { network: 'instagram', url: 'https://www.instagram.com/tamarel.hoian/' },
    { keys: { rapidapi: 'R' }, providers, chains: { instagram: ['instagram/looter2'] } }
  )
  assert.deepEqual(r, {
    stat: { network: 'instagram', provider: 'looter2', followers: 5 },
    provider: 'looter2',
    attempts: []
  })
  assert.deepEqual(ran, [
    { provider: 'looter2', key: 'R', target: { url: 'https://www.instagram.com/tamarel.hoian/' } }
  ])
})

test('ScrapeCreators is the first social tier and receives its own key', async () => {
  const ran = []
  const providers = {
    'instagram/scrapecreators': stub('instagram', 'scrapecreators', 'scrapecreators', { followers: 77 }, ran),
    'instagram/looter2': stub('instagram', 'looter2', 'rapidapi', { followers: 5 }, ran)
  }
  const r = await fetchSocialStats(
    { network: 'instagram', url: 'https://www.instagram.com/tamarel.hoian/' },
    { keys: { scrapecreators: 'SC', rapidapi: 'R' }, providers }
  )
  assert.equal(r.provider, 'scrapecreators')
  assert.equal(r.stat.followers, 77)
  assert.equal(ran.length, 1)
  assert.equal(ran[0].provider, 'scrapecreators')
  assert.equal(ran[0].key, 'SC')
  assert.equal(ran[0].target.url, 'https://www.instagram.com/tamarel.hoian/')
})

test('ScrapeCreators TikTok adapter maps documented profile and aweme_list fields', async () => {
  const requested = []
  const fetch = async (url, init) => {
    const u = new URL(url)
    requested.push({
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      key: init.headers['x-api-key']
    })
    if (u.pathname === '/v1/tiktok/profile') {
      return Response.json({
        success: true,
        user: { id: 't-1', uniqueId: 'sample' },
        stats: { followerCount: 4100000, videoCount: 2017 }
      })
    }
    return Response.json({
      success: true,
      aweme_list: [{ create_time_utc: '2026-03-13T18:18:03.000Z' }],
      has_more: 1,
      max_cursor: 'cursor'
    })
  }
  const r = await PROVIDERS['tiktok/scrapecreators'].fetchProfile(
    { url: 'https://www.tiktok.com/@sample' },
    { key: 'SC', fetch, now: () => NOW }
  )
  assert.equal(r.followers, 4100000)
  assert.equal(r.posts, 2017)
  assert.equal(r.lastPostAt, '2026-03-13T18:18:03.000Z')
  assert.equal(r.coverage, 'partial')
  assert.deepEqual(
    requested.map(({ path, key }) => ({ path, key })),
    [
      { path: '/v1/tiktok/profile', key: 'SC' },
      { path: '/v3/tiktok/profile/videos', key: 'SC' }
    ]
  )
})

test('ScrapeCreators Facebook adapter maps documented profile and publishTime fields', async () => {
  const fetch = async (url) => {
    const path = new URL(url).pathname
    if (path === '/v1/facebook/profile') {
      return Response.json({
        success: true,
        id: 'fb-1',
        followerCount: 3200,
        url: 'https://www.facebook.com/saffronindiandemo'
      })
    }
    return Response.json({ success: true, posts: [{ publishTime: 1785837666 }] })
  }
  const r = await PROVIDERS['facebook/scrapecreators'].fetchProfile(
    { url: 'https://www.facebook.com/TamarelHoiAn' },
    { key: 'SC', fetch, now: () => NOW }
  )
  assert.equal(r.platformId, 'fb-1')
  assert.equal(r.followers, 3200)
  assert.equal(r.lastPostAt, new Date(1785837666 * 1000).toISOString())
  assert.equal(r.coverage, 'partial', 'one page of three public posts is not full 90-day coverage')
})

for (const code of [
  'rate_limited',
  'quota_exhausted',
  'subscription_missing',
  'blocked',
  'provider_error',
  'timeout',
  'schema_error',
  'credential_missing'
]) {
  test(`${code} moves on to the next provider`, async () => {
    const ran = []
    const providers = {
      'instagram/looter2': stub('instagram', 'looter2', 'rapidapi', code, ran),
      'instagram/stable': stub('instagram', 'stable', 'rapidapi', { followers: 11 }, ran)
    }
    const r = await fetchSocialStats(
      { network: 'instagram', url: 'https://www.instagram.com/tamarel.hoian/' },
      { keys: { rapidapi: 'R' }, providers, chains: { instagram: ['instagram/looter2', 'instagram/stable'] } }
    )
    assert.equal(r.provider, 'stable')
    assert.equal(r.fallbackFrom, 'looter2')
    assert.deepEqual(r.attempts, [{ provider: 'looter2', code }])
    assert.deepEqual(
      ran.map((x) => x.provider),
      ['looter2', 'stable']
    )
  })
}

test('not_found stops the chain at once', async () => {
  const ran = []
  const providers = {
    'facebook/scraper3': stub('facebook', 'scraper3', 'rapidapi', 'not_found', ran),
    'facebook/apify': stub('facebook', 'apify', 'apify', { followers: 1 }, ran)
  }
  await assert.rejects(
    fetchSocialStats(
      { network: 'facebook', url: 'https://www.facebook.com/zzqx' },
      {
        keys: { rapidapi: 'R' },
        apifyToken: 'A',
        providers,
        chains: { facebook: ['facebook/scraper3', 'facebook/apify'] }
      }
    ),
    (e) => e.code === 'not_found' && e.attempts.length === 1 && e.attempts[0].provider === 'scraper3'
  )
  assert.equal(ran.length, 1)
  assert.ok(!ADVANCE_CODES.has('not_found'))
})

test('every tier failing throws the last error with the whole attempt list', async () => {
  const ran = []
  const providers = {
    'tiktok/api23': stub('tiktok', 'api23', 'rapidapi', 'quota_exhausted', ran)
  }
  await assert.rejects(
    fetchSocialStats(
      { network: 'tiktok', url: 'https://www.tiktok.com/@brewlet.coffee' },
      { keys: { rapidapi: 'R' }, providers }
    ),
    (e) => {
      assert.equal(e.code, 'credential_missing')
      assert.deepEqual(e.attempts, [
        { provider: 'scrapecreators', code: 'credential_missing' },
        { provider: 'api23', code: 'quota_exhausted' },
        { provider: 'apify', code: 'credential_missing' }
      ])
      return true
    }
  )
})

test('Apify requires a token and a durable runner before a paid fetch', async () => {
  const providers = { 'facebook/scraper3': stub('facebook', 'scraper3', 'rapidapi', 'blocked', []) }
  await assert.rejects(
    fetchSocialStats(
      { network: 'facebook', url: 'https://www.facebook.com/TamarelHoiAn' },
      { keys: {}, providers }
    ),
    (e) => e.code === 'credential_missing'
  )
  await assert.rejects(
    fetchSocialStats(
      { network: 'facebook', url: 'https://www.facebook.com/TamarelHoiAn' },
      { keys: {}, apifyToken: 'A', providers }
    ),
    (e) => e.code === 'provider_error'
  )
})

test('a URL that is not a profile of the network fails before any provider runs', async () => {
  const ran = []
  const providers = { 'instagram/looter2': stub('instagram', 'looter2', 'rapidapi', { followers: 1 }, ran) }
  await assert.rejects(
    fetchSocialStats(
      { network: 'instagram', url: 'https://www.instagram.com/p/C7QwnWDw9u8/' },
      { keys: { rapidapi: 'R' }, providers }
    ),
    (e) => e.code === 'not_found'
  )
  await assert.rejects(
    fetchSocialStats({ network: 'myspace', url: 'https://myspace.com/x' }, { providers }),
    RangeError
  )
  assert.equal(ran.length, 0)
})

test('real adapters end to end: YouTube official quota gone → yt-api answers, each with its own key', async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ host: new URL(url).host, headers: init.headers })
    if (url.includes('googleapis.com')) {
      return new Response(JSON.stringify({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }), {
        status: 403
      })
    }
    if (url.includes('/resolve')) return Response.json({ browseId: 'UCI3ZB0OvndmJYP3S5fBBfGL' })
    return new Response(fixture('yt-api-channel-videos'))
  }
  const r = await fetchSocialStats(
    { network: 'youtube', url: 'https://www.youtube.com/@ExampleCreator' },
    { keys: { google: 'G', rapidapi: 'R' }, fetch, now: () => NOW }
  )
  assert.equal(r.provider, 'yt-api')
  assert.equal(r.fallbackFrom, 'official')
  assert.equal(r.stat.followers, 522000000)
  assert.deepEqual(
    seen.map((s) => s.host),
    ['www.googleapis.com', 'yt-api.p.rapidapi.com', 'yt-api.p.rapidapi.com']
  )
  assert.equal(seen[0].headers['X-goog-api-key'], 'G')
  assert.equal(seen[1].headers['X-RapidAPI-Key'], 'R')
})

test('domain index exports social stats and names the capability; contract version unchanged', async () => {
  const domain = await import('../domain/index.mjs')
  for (const name of [
    'fetchSocialStats',
    'SOCIAL_CHAINS',
    'SOCIAL_PROVIDERS',
    'SocialStatsError',
    'SOCIAL_STATS_ERROR_CODES',
    'parseSocialUrl',
    'RAPIDAPI_HOSTS'
  ])
    assert.ok(name in domain, name)
  assert.ok(domain.CONTRACT.capabilities.includes('social-stats'))
  assert.equal(domain.CONTRACT.version, 1)
})
