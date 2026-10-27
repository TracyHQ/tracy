import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PROVIDERS,
  RAPIDAPI_HOSTS,
  SocialStatsError,
  postsCadence
} from '../domain/social-stats/providers.mjs'

// Fixtures were captured on 19/10/2026; `now` is that day.
const NOW = Date.parse('2026-10-19T00:00:00Z')
const KEY = 'rk-test-0123456789abcdef'
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/social-stats/${name}.json`, import.meta.url), 'utf8')

/** A fetch that answers each request with the first route whose `match` the URL contains, and records it. */
function fakeFetch(routes) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? 'GET',
      headers: { ...init.headers },
      body: init.body
    })
    const r = routes.find((x) => String(url).includes(x.match))
    if (!r) throw new Error(`unrouted ${url}`)
    if (r.throws) throw r.throws
    return new Response(r.body ?? fixture(r.fixture), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { fetch, calls }
}

const deps = (f, extra = {}) => ({ key: KEY, fetch: f.fetch, now: () => NOW, ...extra })
const rejects = (p, code) => assert.rejects(p, (e) => e instanceof SocialStatsError && e.code === code)

test('postsCadence: 90-day window ÷ 3, partial when the page stops short of 90 days, null when unknown', () => {
  const day = 86_400_000
  const at = (d) => ({ at: NOW - d * day })
  assert.deepEqual(postsCadence([at(1), at(10), at(100)], { now: NOW, reachedEnd: false }), {
    lastPostAt: new Date(NOW - day).toISOString(),
    postsPerMonth: 0.7,
    windowCovered: true
  })
  assert.deepEqual(postsCadence([at(1), at(10)], { now: NOW, reachedEnd: false }), {
    lastPostAt: new Date(NOW - day).toISOString(),
    postsPerMonth: 0.7,
    windowCovered: false
  })
  assert.deepEqual(postsCadence([at(1), at(10)], { now: NOW, reachedEnd: true }).windowCovered, true)
  assert.deepEqual(postsCadence([], { now: NOW, reachedEnd: true }), {
    lastPostAt: null,
    postsPerMonth: 0,
    windowCovered: true
  })
  assert.deepEqual(postsCadence(null, { now: NOW, reachedEnd: false }), {
    lastPostAt: null,
    postsPerMonth: null,
    windowCovered: false
  })
  // An old pinned post at the top of the page does not prove the page reached 90 days back.
  assert.equal(
    postsCadence([{ at: NOW - 400 * day, pinned: true }, at(5)], { now: NOW, reachedEnd: false })
      .windowCovered,
    false
  )
})

test('facebook/scraper3: page details + one page of posts', async () => {
  const f = fakeFetch([
    { match: '/page/details', fixture: 'facebook-scraper3-details-page' },
    { match: '/page/posts', fixture: 'facebook-scraper3-posts-page1' }
  ])
  const s = await PROVIDERS['facebook/scraper3'].fetchProfile(
    { url: 'https://m.facebook.com/TamarelHoiAn/' },
    deps(f)
  )
  assert.deepEqual(s, {
    network: 'facebook',
    provider: 'scraper3',
    platformId: '156878528267439',
    handle: 'TamarelHoiAn',
    url: 'https://www.facebook.com/TamarelHoiAn',
    followers: 185,
    posts: null,
    lastPostAt: '2026-08-04T10:01:06.000Z',
    postsPerMonth: 0.7,
    coverage: 'complete',
    fetchedAt: '2026-10-19T00:00:00.000Z'
  })
  assert.equal(f.calls.length, 2)
  assert.equal(
    f.calls[0].url,
    `https://${RAPIDAPI_HOSTS.scraper3}/page/details?url=https%3A%2F%2Fwww.facebook.com%2FTamarelHoiAn`
  )
  assert.equal(f.calls[1].url, `https://${RAPIDAPI_HOSTS.scraper3}/page/posts?page_id=156878528267439`)
  assert.deepEqual(f.calls[0].headers, {
    'X-RapidAPI-Key': KEY,
    'X-RapidAPI-Host': 'facebook-scraper3.p.rapidapi.com'
  })
})

test('facebook/scraper3: a missing or private page answers 200 {type:"private_page"} → not_found, no posts call', async () => {
  const f = fakeFetch([{ match: '/page/details', fixture: 'facebook-scraper3-details-missing' }])
  await rejects(
    PROVIDERS['facebook/scraper3'].fetchProfile(
      { url: 'https://www.facebook.com/zzqx.notapage.918273' },
      deps(f)
    ),
    'not_found'
  )
  assert.equal(f.calls.length, 1)
})

test('facebook/scraper3: an empty {results:{}} (page renamed or gone, seen for 9ferrieshoian on 19/10) → not_found, no posts call', async () => {
  const f = fakeFetch([{ match: '/page/details', fixture: 'facebook-scraper3-details-empty' }])
  await rejects(
    PROVIDERS['facebook/scraper3'].fetchProfile({ url: 'https://www.facebook.com/9ferrieshoian' }, deps(f)),
    'not_found'
  )
  assert.equal(f.calls.length, 1)
})

test('instagram/looter2: one profile call carries followers, post count and the 12 latest posts', async () => {
  const f = fakeFetch([
    { match: '/profile?username=examplebrand', fixture: 'instagram-looter2-profile-large' }
  ])
  const s = await PROVIDERS['instagram/looter2'].fetchProfile({ handle: '@ExampleBrand' }, deps(f))
  assert.equal(f.calls.length, 1)
  assert.deepEqual(
    {
      platformId: s.platformId,
      handle: s.handle,
      followers: s.followers,
      posts: s.posts,
      lastPostAt: s.lastPostAt,
      postsPerMonth: s.postsPerMonth,
      coverage: s.coverage
    },
    {
      platformId: '22792097',
      handle: 'examplebrand',
      followers: 686560134,
      posts: 8620,
      lastPostAt: '2026-10-14T16:00:04.000Z',
      postsPerMonth: 4,
      coverage: 'partial'
    }
  )
})

test('instagram/looter2: a profile whose every post is on the page is complete even with none in 90 days', async () => {
  const f = fakeFetch([{ match: '/profile', fixture: 'instagram-looter2-profile-few-posts' }])
  const s = await PROVIDERS['instagram/looter2'].fetchProfile(
    { url: 'https://www.instagram.com/tamarel.hoian/' },
    deps(f)
  )
  assert.deepEqual(
    [s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    [11, 7, '2024-06-14T13:58:35.000Z', 0, 'complete']
  )
})

test('instagram/looter2: "does not exist" → not_found; other status:false → provider_error', async () => {
  await rejects(
    PROVIDERS['instagram/looter2'].fetchProfile(
      { handle: 'zzqx_notauser_918273' },
      deps(fakeFetch([{ match: '/profile', fixture: 'instagram-looter2-profile-missing' }]))
    ),
    'not_found'
  )
  await rejects(
    PROVIDERS['instagram/looter2'].fetchProfile(
      { handle: 'x' },
      deps(
        fakeFetch([
          { match: '/profile', status: 200, body: '{"status":false,"errorMessage":"Internal Error"}' }
        ])
      )
    ),
    'provider_error'
  )
})

test('instagram/looter2: a private profile keeps its counts and leaves the cadence null', async () => {
  const body = JSON.stringify({
    status: true,
    id: '1',
    username: 'shut',
    is_private: true,
    edge_followed_by: { count: 40 },
    edge_owner_to_timeline_media: { count: 9, edges: [] }
  })
  const s = await PROVIDERS['instagram/looter2'].fetchProfile(
    { handle: 'shut' },
    deps(fakeFetch([{ match: '/profile', body }]))
  )
  assert.deepEqual(
    [s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    [40, 9, null, null, 'partial']
  )
})

// Dev round L3 (19/10/2026): Looter2 answered every profile on dev with media count 0 and no posts,
// theorchard_demo with 59 010 followers among them; the fixture has that shape. Unknown, not "0/mo".
test('instagram/looter2: no media for an account with followers is unknown, not zero', async () => {
  const s = await PROVIDERS['instagram/looter2'].fetchProfile(
    { handle: 'theorchard_demo' },
    deps(fakeFetch([{ match: '/profile', fixture: 'instagram-looter2-profile-no-media' }]))
  )
  assert.deepEqual(
    [s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    [59010, null, null, null, 'partial']
  )
  const dormant = JSON.stringify({
    status: true,
    id: '2',
    username: 'empty',
    is_private: false,
    edge_followed_by: { count: 0 },
    edge_owner_to_timeline_media: { count: 0, edges: [] }
  })
  const d = await PROVIDERS['instagram/looter2'].fetchProfile(
    { handle: 'empty' },
    deps(fakeFetch([{ match: '/profile', body: dormant }]))
  )
  assert.deepEqual(
    [d.followers, d.posts, d.postsPerMonth, d.coverage],
    [0, 0, 0, 'complete'],
    'no followers and no posts may well be true'
  )
})

test('instagram/stable: hover for counts, POST user posts for dates', async () => {
  const f = fakeFetch([
    { match: '/ig_get_fb_profile_hover.php', fixture: 'instagram-scraper-stable-api-hover-few-posts' },
    { match: '/get_ig_user_posts.php', fixture: 'instagram-scraper-stable-api-posts-few-posts' }
  ])
  const s = await PROVIDERS['instagram/stable'].fetchProfile({ handle: 'tamarel.hoian' }, deps(f))
  assert.deepEqual(
    [s.platformId, s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    ['54775783265', 11, 7, '2024-06-14T13:58:35.000Z', 0, 'complete']
  )
  assert.equal(f.calls[1].method, 'POST')
  assert.equal(f.calls[1].headers['content-type'], 'application/x-www-form-urlencoded')
  assert.equal(String(f.calls[1].body), 'username_or_url=tamarel.hoian&amount=12')
})

test('instagram/stable: its only error shape is an array of text → provider_error (not proof the handle is missing)', async () => {
  await rejects(
    PROVIDERS['instagram/stable'].fetchProfile(
      { handle: 'zzqx' },
      deps(
        fakeFetch([
          { match: '/ig_get_fb_profile_hover.php', fixture: 'instagram-scraper-stable-api-hover-missing' }
        ])
      )
    ),
    'provider_error'
  )
})

test('tiktok/api23: user info then user posts by secUid', async () => {
  const f = fakeFetch([
    { match: '/api/user/info', fixture: 'tiktok-api23-user-info-large' },
    { match: '/api/user/posts', fixture: 'tiktok-api23-user-posts-large' }
  ])
  const s = await PROVIDERS['tiktok/api23'].fetchProfile(
    { url: 'https://www.tiktok.com/@examplebrand' },
    deps(f)
  )
  assert.deepEqual(
    [s.handle, s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    ['examplebrand', 96300000, 1510, '2026-10-09T22:25:11.000Z', 5, 'partial']
  )
  assert.match(
    f.calls[1].url,
    /\/api\/user\/posts\?secUid=MS4wLjABAAAAg4tDffIOUROgUvxS_gk8bvOKJz8lairklioMDpTfAtX&count=35&cursor=0$/
  )
})

test('tiktok/api23: all-zero output is unverified; 10221 is not_found', async () => {
  const f = fakeFetch([{ match: '/api/user/info', fixture: 'tiktok-api23-user-info-zero' }])
  await rejects(PROVIDERS['tiktok/api23'].fetchProfile({ handle: 'brewlet.coffee' }, deps(f)), 'schema_error')
  assert.equal(f.calls.length, 1)
  await rejects(
    PROVIDERS['tiktok/api23'].fetchProfile(
      { handle: 'zzqx' },
      deps(fakeFetch([{ match: '/api/user/info', fixture: 'tiktok-api23-user-info-missing' }]))
    ),
    'not_found'
  )
})

test('youtube/official: channels by handle, then the uploads playlist (never search.list); key in a header', async () => {
  const f = fakeFetch([
    { match: '/youtube/v3/channels', fixture: 'youtube-official-channels-handle' },
    { match: '/youtube/v3/playlistItems', fixture: 'youtube-official-uploads' }
  ])
  const s = await PROVIDERS['youtube/official'].fetchProfile(
    { url: 'https://www.youtube.com/@ExampleCreator' },
    deps(f)
  )
  assert.deepEqual(s, {
    network: 'youtube',
    provider: 'official',
    platformId: 'UCI3ZB0OvndmJYP3S5fBBfGL',
    handle: 'examplecreator',
    url: 'https://www.youtube.com/channel/UCI3ZB0OvndmJYP3S5fBBfGL',
    followers: 522000000,
    posts: 1007,
    lastPostAt: '2026-10-17T16:00:18.000Z',
    postsPerMonth: 5,
    coverage: 'complete',
    fetchedAt: '2026-10-19T00:00:00.000Z'
  })
  assert.equal(
    f.calls[0].url,
    'https://www.googleapis.com/youtube/v3/channels?part=snippet%2Cstatistics%2CcontentDetails&forHandle=%40examplecreator'
  )
  assert.equal(
    f.calls[1].url,
    'https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=UUI3ZB0OvndmJYP3S5fBBfGL&maxResults=50'
  )
  for (const c of f.calls) {
    assert.deepEqual(c.headers, { 'X-goog-api-key': KEY })
    assert.ok(!c.url.includes(KEY))
  }
})

test('youtube/official: /user/ resolves through forUsername; /c/ never guesses the identity', async () => {
  const f = fakeFetch([])
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { url: 'https://www.youtube.com/c/ExampleDevelopers' },
      deps(f)
    ),
    'schema_error'
  )
  assert.equal(f.calls.length, 0)
  const g = fakeFetch([
    { match: 'forUsername=ExampleDevelopers', fixture: 'youtube-official-channels-forusername' },
    { match: '/playlistItems', fixture: 'youtube-official-uploads' }
  ])
  await PROVIDERS['youtube/official'].fetchProfile(
    { url: 'https://www.youtube.com/user/ExampleDevelopers' },
    deps(g)
  )
  assert.equal(g.calls.length, 2)
})

test('youtube/official: no channel → not_found; Google errors map to their codes', async () => {
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { handle: 'zzqxnotachannel918273' },
      deps(fakeFetch([{ match: '/channels', fixture: 'youtube-official-channels-missing' }]))
    ),
    'not_found'
  )
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { handle: 'channelx' },
      deps(fakeFetch([{ match: '/channels', status: 400, fixture: 'youtube-official-error-bad-key' }]))
    ),
    'credential_missing'
  )
  const google = (status, reason) =>
    JSON.stringify({
      error: {
        code: status,
        message: reason,
        errors: [{ reason, domain: 'youtube.quota' }],
        details: [{ reason }]
      }
    })
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { handle: 'channelx' },
      deps(fakeFetch([{ match: '/channels', status: 403, body: google(403, 'quotaExceeded') }]))
    ),
    'quota_exhausted'
  )
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { handle: 'channelx' },
      deps(fakeFetch([{ match: '/channels', status: 403, body: google(403, 'rateLimitExceeded') }]))
    ),
    'rate_limited'
  )
  await rejects(
    PROVIDERS['youtube/official'].fetchProfile(
      { handle: 'channelx' },
      deps(fakeFetch([{ match: '/channels', status: 403, body: google(403, 'API_KEY_SERVICE_BLOCKED') }]))
    ),
    'blocked'
  )
})

test('youtube/yt-api: /resolve for anything but a channel id, then /channel/videos', async () => {
  const f = fakeFetch([
    { match: '/resolve', body: JSON.stringify({ browseId: 'UCI3ZB0OvndmJYP3S5fBBfGL' }) },
    { match: '/channel/videos', fixture: 'yt-api-channel-videos' }
  ])
  const s = await PROVIDERS['youtube/yt-api'].fetchProfile(
    { url: 'https://www.youtube.com/c/ExampleCreator' },
    deps(f)
  )
  assert.equal(
    f.calls[0].url,
    `https://${RAPIDAPI_HOSTS['yt-api']}/resolve?url=https%3A%2F%2Fwww.youtube.com%2Fc%2FExampleCreator`
  )
  assert.equal(
    f.calls[1].url,
    `https://${RAPIDAPI_HOSTS['yt-api']}/channel/videos?id=UCI3ZB0OvndmJYP3S5fBBfGL`
  )
  // The fixture is Example Creator's videos tab: yt-api's /channel/videos leaves shorts out, so its cadence is lower than the official one.
  assert.deepEqual(
    [s.followers, s.posts, s.lastPostAt, s.postsPerMonth, s.coverage],
    [522000000, 1000, '2026-10-17T00:00:00.000Z', 2.3, 'partial']
  )
})

test('youtube/yt-api: a response for a different channel never binds the requested alias', async () => {
  const f = fakeFetch([
    { match: '/resolve', fixture: 'yt-api-resolve-c-url' },
    { match: '/channel/videos', fixture: 'yt-api-channel-videos' }
  ])
  await rejects(
    PROVIDERS['youtube/yt-api'].fetchProfile({ url: 'https://www.youtube.com/c/ExampleDevelopers' }, deps(f)),
    'schema_error'
  )
})

test('youtube/yt-api: a channel id skips /resolve; "does not exist" (HTTP 200) → not_found', async () => {
  const f = fakeFetch([{ match: '/channel/videos', fixture: 'yt-api-channel-videos-missing' }])
  await rejects(
    PROVIDERS['youtube/yt-api'].fetchProfile(
      { url: 'https://www.youtube.com/channel/UCzzqxnotachannel9182730' },
      deps(f)
    ),
    'not_found'
  )
  assert.equal(f.calls.length, 1)
})

// ── error codes, one test each ────────────────────────────────────────────────────────────────────

const tt = (route) =>
  PROVIDERS['tiktok/api23'].fetchProfile(
    { handle: 'examplebrand' },
    deps(fakeFetch([{ match: '/api/user/info', ...route }]))
  )

test('credential_missing: no key, no request', async () => {
  const f = fakeFetch([])
  await rejects(
    PROVIDERS['tiktok/api23'].fetchProfile({ handle: 'examplebrand' }, { fetch: f.fetch, now: () => NOW }),
    'credential_missing'
  )
  assert.equal(f.calls.length, 0)
})

test('credential_missing: RapidAPI 401 "Invalid API key"', () =>
  rejects(
    tt({
      status: 401,
      body: '{"message":"Invalid API key. Go to https://docs.rapidapi.com/docs/keys for more info."}'
    }),
    'credential_missing'
  ))

// Captured with a made-up key: RapidAPI answers a wrong key exactly like a missing subscription.
test('subscription_missing: RapidAPI 403 "You are not subscribed to this API."', () =>
  rejects(tt({ status: 403, fixture: 'rapidapi-not-subscribed' }), 'subscription_missing'))

test('blocked: any other RapidAPI 403', () =>
  rejects(
    tt({ status: 403, body: '{"message":"This endpoint is disabled for your subscription"}' }),
    'blocked'
  ))

test('rate_limited: 429 "Too many requests"', () =>
  rejects(tt({ status: 429, body: '{"message":"Too many requests"}' }), 'rate_limited'))

test('rate_limited: 429 per-second plan limit', () =>
  rejects(
    tt({
      status: 429,
      body: '{"message":"You have exceeded the rate limit per second for your plan, BASIC, by the API provider"}'
    }),
    'rate_limited'
  ))

test('quota_exhausted: 429 MONTHLY quota', () =>
  rejects(
    tt({
      status: 429,
      body: '{"message":"You have exceeded the MONTHLY quota for Requests on your current plan, BASIC. Upgrade your plan at https://rapidapi.com/Lundehund/api/tiktok-api23"}'
    }),
    'quota_exhausted'
  ))

test('provider_error: a 5xx and an unknown endpoint', async () => {
  await rejects(tt({ status: 502, body: '{"message":"Bad gateway"}' }), 'provider_error')
  await rejects(tt({ status: 404, fixture: 'rapidapi-endpoint-missing' }), 'provider_error')
  await rejects(tt({ status: 404, fixture: 'rapidapi-api-missing' }), 'provider_error')
})

test('schema_error: a body that is not JSON, or JSON without the fields we map', async () => {
  await rejects(tt({ body: '<html>oops</html>' }), 'schema_error')
  await rejects(
    tt({ body: '{"statusCode":0,"userInfo":{"user":{"id":"1","uniqueId":"examplebrand","secUid":"S"}}}' }),
    'schema_error'
  )
})

test("not_found: a URL that is not a profile of the provider's network", async () => {
  const f = fakeFetch([])
  await rejects(
    PROVIDERS['tiktok/api23'].fetchProfile({ url: 'https://www.instagram.com/tamarel.hoian/' }, deps(f)),
    'not_found'
  )
  assert.equal(f.calls.length, 0)
})

test('timeout: the request is aborted after timeoutMs', async () => {
  const fetch = (_url, init) =>
    new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)))
  await rejects(
    PROVIDERS['tiktok/api23'].fetchProfile(
      { handle: 'examplebrand' },
      { key: KEY, fetch, timeoutMs: 20, now: () => NOW }
    ),
    'timeout'
  )
})

test('the key never shows up in an error message', async () => {
  const err = await PROVIDERS['tiktok/api23']
    .fetchProfile(
      { handle: 'examplebrand' },
      deps(fakeFetch([{ match: '/api/user/info', throws: new Error(`connect failed for key=${KEY}`) }]))
    )
    .catch((e) => e)
  assert.equal(err.code, 'provider_error')
  assert.ok(!err.message.includes(KEY), err.message)
  assert.ok(!JSON.stringify(err).includes(KEY))
  const echoed = await tt({
    status: 403,
    body: JSON.stringify({ message: `You are not subscribed to this API. key ${KEY}` })
  }).catch((e) => e)
  assert.equal(echoed.code, 'subscription_missing')
  assert.ok(!echoed.message.includes(KEY), echoed.message)
})

test('YouTube hidden subscriber count stays null; an empty uploads page is not an empty public channel', async () => {
  const channel = JSON.parse(fixture('youtube-official-channels-handle'))
  channel.items[0].statistics.hiddenSubscriberCount = true
  const f = fakeFetch([
    { match: '/channels', body: JSON.stringify(channel) },
    { match: '/playlistItems', body: JSON.stringify({ items: [] }) }
  ])
  const s = await PROVIDERS['youtube/official'].fetchProfile({ handle: 'examplecreator' }, deps(f))
  assert.equal(s.followers, null)
  assert.equal(s.lastPostAt, null)
  assert.equal(s.postsPerMonth, null)
  assert.equal(s.coverage, 'partial')
})
test('YouTube uploads include Shorts dates; no Videos-tab filter is applied', async () => {
  const f = fakeFetch([
    { match: '/channels', fixture: 'youtube-official-channels-handle' },
    {
      match: '/playlistItems',
      body: JSON.stringify({
        items: [{ contentDetails: { videoId: 'short-video', videoPublishedAt: '2026-10-18T10:00:00Z' } }]
      })
    }
  ])
  const s = await PROVIDERS['youtube/official'].fetchProfile({ handle: 'examplecreator' }, deps(f))
  assert.equal(s.lastPostAt, '2026-10-18T10:00:00.000Z')
  assert.equal(s.postsPerMonth, 0.3)
})
