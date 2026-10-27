// Social stats (`website-opportunities/src/social-stats.js`): follower and posting figures of a restaurant's social
// pages, fetched in the background through the plugin's provider chains and kept per profile for
// every account. Billable calls are reserved one by one against a per-provider and a per-account
// daily cap; a spent cap defers the row to the next day and never pays a fallback. The domain is the
// real subtree with the network replaced.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createSocialStats, statKeyOf } from 'website-opportunities/src/social-stats.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const worlds = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map((s) => s.drain()))
})

const NOW = Date.parse('2026-10-18T12:00:00Z')
const DAY = 86_400_000
const HOUR = 3_600_000
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111'
const ACCOUNT_B = '22222222-2222-4222-8222-222222222222'
const TT = 'https://www.tiktok.com/@brewlet.coffee'
const YT = 'https://www.youtube.com/@brewletcoffee'
const IG = 'https://www.instagram.com/brewlet.coffee/'
const CHANNEL = 'UC0123456789abcdefghijkl'

const ttInfo = (handle = 'brewlet.coffee') => ({
  statusCode: 0,
  userInfo: {
    user: { id: '7001', uniqueId: handle, secUid: 'SEC-1', privateAccount: false },
    stats: { followerCount: 1200, videoCount: 2 }
  }
})
const ttPosts = () => ({
  data: {
    hasMore: false,
    itemList: [{ createTime: (NOW - 5 * DAY) / 1000 }, { createTime: (NOW - 40 * DAY) / 1000 }]
  }
})
const ytChannels = () => ({
  items: [
    {
      id: CHANNEL,
      snippet: { customUrl: '@brewletcoffee' },
      statistics: { subscriberCount: '300', videoCount: '1' },
      contentDetails: { relatedPlaylists: { uploads: 'UU0123456789abcdefghijkl' } }
    }
  ]
})
const ytUploads = () => ({
  items: [{ contentDetails: { videoPublishedAt: new Date(NOW - 2 * DAY).toISOString() } }]
})

/** Answers per `host + path`; anything else is a test failure. */
function network(over = {}) {
  const routes = {
    'tiktok-api23.p.rapidapi.com/api/user/info': () => Response.json(ttInfo()),
    'tiktok-api23.p.rapidapi.com/api/user/posts': () => Response.json(ttPosts()),
    'www.googleapis.com/youtube/v3/channels': () => Response.json(ytChannels()),
    'www.googleapis.com/youtube/v3/playlistItems': () => Response.json(ytUploads()),
    ...over
  }
  return (u) => {
    const x = new URL(u)
    const route = routes[`${x.host}${x.pathname}`]
    if (!route) throw new Error(`unexpected call ${x.host}${x.pathname}`)
    return route(x)
  }
}

async function world({
  answer = network(),
  caps = {},
  perAccount = 200,
  keys = { rapidapi: 'rk-test', google: 'AIza-test', apify: null },
  clock = { now: NOW },
  providerOrder = undefined,
  researchDailyCapCents = undefined
} = {}) {
  const real = await websiteOpportunitiesDomain()
  const asked = []
  const warned = []
  const stats = createSocialStats({
    pool: db.pool,
    runtime: async () => ({
      keys,
      settings: {
        socialStatsYouTubeDailyQuota: 10000,
        socialStatsProviderCycle: Object.fromEntries(
          ['facebook-scraper3', 'instagram-looter2', 'instagram-stable', 'tiktok-api23', 'yt-api'].map(
            (b) => [
              b,
              { limit: 10000, used: 0, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }
            ]
          )
        ),
        socialStatsPerAccountPerDay: perAccount,
        ...(providerOrder ? { providerOrder } : {}),
        ...(researchDailyCapCents === undefined ? {} : { researchDailyCapCents }),
        socialStatsProviderDailyCap: {
          'facebook-scraper3': 3,
          'instagram-looter2': 4,
          'instagram-stable': 0,
          'tiktok-api23': 30,
          'yt-api': 9,
          'youtube-official': 500,
          ...caps
        }
      }
    }),
    domain: real,
    fetchImpl: async (u, init) => {
      const x = new URL(String(u))
      asked.push(`${x.host}${x.pathname}`)
      return answer(String(u), init)
    },
    now: () => clock.now,
    log: { warn: (m) => warned.push(m), error: (m) => warned.push(m) }
  })
  worlds.push(stats)
  return { stats, asked, warned, clock }
}

const fbRoutes = (over = {}) => ({
  'facebook-scraper3.p.rapidapi.com/page/details': (x) =>
    Response.json({
      results: { page_id: x.searchParams.get('url').endsWith('phoba') ? '1001' : '1002', followers: 900 }
    }),
  'facebook-scraper3.p.rapidapi.com/page/posts': () =>
    Response.json({ results: [{ timestamp: (NOW - 3 * DAY) / 1000 }], cursor: null }),
  ...over
})

test('ScrapeCreators reserves calls against the matching network cap', opts, async () => {
  const routes = {
    'api.scrapecreators.com/v1/facebook/profile': () =>
      Response.json({ success: true, id: 'fb-1', followers: 100, postCount: 4 }),
    'api.scrapecreators.com/v1/facebook/profile/posts': () =>
      Response.json({
        success: true,
        posts: [{ publishTime: (NOW - 3 * DAY) / 1000 }],
        cursor: null,
        next_page_id: null
      }),
    'api.scrapecreators.com/v1/instagram/profile': () =>
      Response.json({
        success: true,
        data: {
          user: {
            id: 'ig-1',
            username: 'brewlet.coffee',
            edge_owner_to_timeline_media: {
              count: 1,
              edges: [{ node: { taken_at_timestamp: (NOW - 2 * DAY) / 1000 } }],
              page_info: { has_next_page: false },
              owner: { edge_followed_by: { count: 200 } }
            }
          }
        }
      }),
    'api.scrapecreators.com/v1/tiktok/profile': () =>
      Response.json({
        success: true,
        author: { id: 'tt-1', uniqueId: 'brewlet.coffee' },
        stats: { followerCount: 300, videoCount: 1 }
      }),
    'api.scrapecreators.com/v3/tiktok/profile/videos': () =>
      Response.json({
        success: true,
        aweme_list: [{ create_time_utc: new Date(NOW - DAY).toISOString() }],
        has_more: 0
      })
  }
  const cases = [
    {
      network: 'facebook',
      url: 'https://www.facebook.com/sc-probe-cafe',
      key: 'facebook:sc-probe-cafe',
      budget: 'facebook-scrapecreators',
      calls: 2
    },
    {
      network: 'instagram',
      url: 'https://www.instagram.com/sc.probe.cafe/',
      key: 'instagram:sc.probe.cafe',
      budget: 'instagram-scrapecreators',
      calls: 1
    },
    {
      network: 'tiktok',
      url: 'https://www.tiktok.com/@sc.probe.cafe',
      key: 'tiktok:sc.probe.cafe',
      budget: 'tiktok-scrapecreators',
      calls: 2
    }
  ]

  for (const item of cases) {
    const { stats, asked } = await world({
      answer: network(routes),
      keys: { rapidapi: 'rk-test', google: 'AIza-test', apify: null, scrapecreators: 'sc-test' }
    })
    await stats.request([{ network: item.network, url: item.url }], { account: ACCOUNT_A })
    await stats.drain()
    const saved = await rowOf(item.key)
    assert.equal(saved.provider, `${item.network}/scrapecreators`)
    assert.equal(await budgetUsed(item.budget), item.calls)
    assert.equal(asked.length, item.calls)
    // Every paid call is in the research cost ledger too, settled at its price (e2e dev 24/10/2026: none were).
    const { rows: charged } = await db.pool.query(
      `select provider, state, actual_cents from wo_cost_ledger where operation = $1`,
      [`social-stats:${item.network}`]
    )
    assert.equal(charged.length, item.calls, item.network)
    for (const c of charged)
      assert.deepEqual(c, { provider: 'scrapecreators', state: 'settled', actual_cents: 1 })
  }
})

test('a spent research daily budget defers the page like a spent provider cap', opts, async () => {
  const { stats, asked } = await world({ researchDailyCapCents: 0 })
  await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.deepEqual(asked, [], 'no call goes out past the research budget')
  assert.equal(await budgetUsed('tiktok-api23'), 0, 'the provider units are given back')
  const row = await rowOf('tiktok:brewlet.coffee')
  assert.equal(row.status, 'queued')
  assert.equal(row.last_error, 'budget')
  assert.equal(row.attempts, 0)
})

const countOf = async (bucket) =>
  Number(
    (await db.pool.query('select coalesce(sum(count), 0) as n from rate_bucket where bucket = $1', [bucket]))
      .rows[0].n
  )
const budgetUsed = (budget) => countOf(`wo:social-budget:${budget}`)
const accountUsed = (account) => countOf(`wo:social-account:${account}`)

const rowOf = async (key) =>
  (await db.pool.query('select * from wo_social_stat where stat_key = $1', [key])).rows[0]

test('statKeyOf: one key per profile whatever the spelling; junk is null', async () => {
  const { parseSocialUrl } = await websiteOpportunitiesDomain()
  const keyOf = (h) => statKeyOf(h, parseSocialUrl)
  assert.equal(
    keyOf({ network: 'tiktok', url: 'https://www.TikTok.com/@Brewlet.Coffee?lang=en' }),
    'tiktok:brewlet.coffee'
  )
  assert.equal(keyOf({ network: 'tiktok', url: 'tiktok.com/@brewlet.coffee' }), 'tiktok:brewlet.coffee')
  assert.equal(keyOf({ network: 'facebook', url: 'https://facebook.com/ExampleVN' }), 'facebook:examplevn')
  assert.equal(
    keyOf({ network: 'facebook', url: 'https://www.facebook.com/profile.php?id=100064' }),
    'facebook:id:100064'
  )
  assert.equal(
    keyOf({ network: 'youtube', url: `https://youtube.com/channel/${CHANNEL}` }),
    `youtube:channel:${CHANNEL}`
  )
  assert.equal(keyOf({ network: 'youtube', url: YT }), 'youtube:brewletcoffee')
  assert.equal(keyOf({ network: 'facebook', url: 'https://facebook.com/sharer.php' }), null)
  assert.equal(
    keyOf({ network: 'instagram', url: 'https://www.tiktok.com/@x' }),
    null,
    'network must match the host'
  )
})

test(
  'a new profile is queued, fetched once and answered from the cache for every account',
  opts,
  async () => {
    const { stats, asked } = await world()
    const first = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
    assert.deepEqual(first, { [TT]: { status: 'queued' } })
    await stats.drain()
    assert.deepEqual(asked, [
      'tiktok-api23.p.rapidapi.com/api/user/info',
      'tiktok-api23.p.rapidapi.com/api/user/posts'
    ])
    const expected = {
      status: 'done',
      url: TT,
      followers: 1200,
      posts: 2,
      lastPostAt: new Date(NOW - 5 * DAY).toISOString(),
      postsPerMonth: 0.7,
      coverage: 'complete',
      fetchedAt: new Date(NOW).toISOString(),
      stale: false,
      provider: 'tiktok/api23'
    }
    const spelled = 'https://tiktok.com/@Brewlet.Coffee'
    const again = await stats.request([{ network: 'tiktok', url: spelled }], { account: ACCOUNT_B })
    assert.deepEqual(again[spelled], { ...expected, url: spelled })
    await stats.drain()
    assert.equal(asked.length, 2, 'a second account reads the cache: no new call')
    const peek = await stats.lookup([
      { network: 'tiktok', url: TT },
      { network: 'youtube', url: YT }
    ])
    assert.deepEqual(peek, { [TT]: expected }, 'lookup is read-only: an unknown profile is absent')
    assert.equal(await rowOf('youtube:brewletcoffee'), undefined, 'lookup queues nothing')
  }
)

test('the provider is the chain tier id end to end, also for a row stored before it was', opts, async () => {
  const { stats } = await world()
  await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.equal((await rowOf('tiktok:brewlet.coffee')).provider, 'tiktok/api23')
  await db.pool.query(`update wo_social_stat set provider = 'api23' where stat_key = 'tiktok:brewlet.coffee'`)
  const out = await stats.lookup([{ network: 'tiktok', url: TT }])
  assert.equal(out[TT].provider, 'tiktok/api23')
})

test('only the first `limit` unknown profiles are queued; force re-queues a fresh one', opts, async () => {
  const { stats, asked, clock } = await world()
  const handles = [
    { network: 'tiktok', url: TT },
    { network: 'youtube', url: YT },
    { network: 'tiktok', url: 'https://www.tiktok.com/@other.cafe' }
  ]
  const out = await stats.request(handles, { account: ACCOUNT_A, limit: 2 })
  assert.deepEqual(
    Object.values(out).map((s) => s.status),
    ['queued', 'queued', 'not_queued']
  )
  await stats.drain()
  assert.equal(asked.length, 4)
  const fresh = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  assert.equal(fresh[TT].status, 'done')
  clock.now += 1000
  const forced = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A, force: true })
  assert.equal(forced[TT].status, 'queued')
  assert.equal(forced[TT].followers, 1200, 'a queued refresh still shows the numbers it has')
  await stats.drain()
  assert.equal(asked.length, 6)
})

test('a URL that is not a profile answers not_found and makes no row', opts, async () => {
  const { stats, asked } = await world()
  const bad = 'https://www.facebook.com/sharer.php?u=x'
  const out = await stats.request([{ network: 'facebook', url: bad }], { account: ACCOUNT_A })
  assert.deepEqual(out[bad], { status: 'not_found', error: 'not_a_profile' })
  assert.equal((await db.pool.query('select count(*)::int as n from wo_social_stat')).rows[0].n, 0)
  await stats.drain()
  assert.equal(asked.length, 0)
})

test('a spent provider cap defers the row to the next day and never pays the fallback', opts, async () => {
  // youtube-official may make one call today; a channel costs two, so none is made.
  const caps = { 'youtube-official': 1 }
  const { stats, asked, clock } = await world({ caps })
  await stats.request([{ network: 'youtube', url: YT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.deepEqual(asked, [], 'neither half a channel nor yt-api (the paid fallback) is paid for')
  assert.equal(await budgetUsed('youtube-official'), 0, 'the refused reservation is given back')
  const row = await rowOf('youtube:brewletcoffee')
  assert.equal(row.status, 'queued')
  assert.equal(row.next_retry_at.toISOString(), '2026-10-19T00:00:00.000Z', 'the next UTC day')
  assert.equal(row.attempts, 0, 'a deferral is not an attempt')
  assert.equal(row.last_error, 'budget')
  assert.equal(row.fetched_at, null)
  const waiting = await stats.request([{ network: 'youtube', url: YT }], { account: ACCOUNT_A })
  assert.deepEqual(
    waiting[YT],
    { status: 'queued', deferredUntil: '2026-10-19T00:00:00.000Z' },
    'a deferred page says until when, so the client stops asking (dev round L1)'
  )
  assert.equal(
    (await stats.lookup([{ network: 'youtube', url: YT }]))[YT].deferredUntil,
    '2026-10-19T00:00:00.000Z'
  )
  await stats.drain()
  assert.equal(asked.length, 0, 'still today: not claimed')
  clock.now = Date.parse('2026-10-19T00:00:01Z')
  caps['youtube-official'] = 5 // the operator raised it
  const due = await stats.request([{ network: 'youtube', url: YT }], { account: ACCOUNT_A })
  assert.deepEqual(due[YT], { status: 'queued' }, 'past its date the page is plainly queued again')
  await stats.drain()
  assert.equal(asked.length, 2)
  assert.equal((await rowOf('youtube:brewletcoffee')).status, 'done')
})

test(
  'a page reserves its whole cost before the first call: an odd cap pays no half page (dev round L2)',
  opts,
  async () => {
    const FB1 = 'https://www.facebook.com/phoba'
    const FB2 = 'https://www.facebook.com/fernlight'
    const { stats, asked } = await world({ answer: network(fbRoutes()), caps: { 'facebook-scraper3': 3 } })
    await stats.request(
      [
        { network: 'facebook', url: FB1 },
        { network: 'facebook', url: FB2 }
      ],
      { account: ACCOUNT_A }
    )
    await stats.drain()
    assert.deepEqual(asked, [
      'facebook-scraper3.p.rapidapi.com/page/details',
      'facebook-scraper3.p.rapidapi.com/page/posts'
    ])
    // Two workers claim in either order: one page is fetched, the other deferred.
    const rows = [await rowOf('facebook:phoba'), await rowOf('facebook:fernlight')]
    assert.deepEqual(rows.map((r) => r.status).sort(), ['done', 'queued'])
    assert.equal(rows.find((r) => r.status === 'queued').last_error, 'budget')
    assert.equal(await budgetUsed('facebook-scraper3'), 2, 'the third unit is not spent')
    assert.equal(await accountUsed(ACCOUNT_A), 2)
  }
)

test('what a page reserved and did not spend is given back', opts, async () => {
  const gone = () => Response.json({ results: {} })
  const { stats, asked } = await world({
    answer: network(fbRoutes({ 'facebook-scraper3.p.rapidapi.com/page/details': gone })),
    caps: { 'facebook-scraper3': 3 }
  })
  await stats.request([{ network: 'facebook', url: 'https://www.facebook.com/phoba' }], {
    account: ACCOUNT_A
  })
  await stats.drain()
  assert.equal(asked.length, 1)
  assert.equal((await rowOf('facebook:phoba')).status, 'not_found')
  assert.equal(await budgetUsed('facebook-scraper3'), 1)
  assert.equal(await accountUsed(ACCOUNT_A), 1)
})

test(
  "the operator's provider order decides which tier is asked first, as for the place profile",
  opts,
  async () => {
    const { stats, asked } = await world({
      answer: network(fbRoutes()),
      keys: { rapidapi: 'rk-test', google: null, apify: null, scrapecreators: 'sc-test' },
      caps: { 'facebook-scraper3': 3, 'facebook-scrapecreators': 10 },
      providerOrder: { facebook: ['rapidapi-scraper3', 'scrapecreators'] }
    })
    await stats.request([{ network: 'facebook', url: 'https://www.facebook.com/phoba' }], {
      account: ACCOUNT_A
    })
    await stats.drain()
    assert.deepEqual(asked, [
      'facebook-scraper3.p.rapidapi.com/page/details',
      'facebook-scraper3.p.rapidapi.com/page/posts'
    ])
    assert.equal((await rowOf('facebook:phoba')).provider, 'facebook/scraper3')
  }
)

test('a provider cap of 0 switches that tier off: the chain skips it', opts, async () => {
  const notSubscribed = () =>
    Response.json({ message: 'You are not subscribed to this API.' }, { status: 403 })
  const { stats, asked } = await world({
    answer: network({ 'instagram-looter2.p.rapidapi.com/profile': notSubscribed })
  })
  await stats.request([{ network: 'instagram', url: IG }], { account: ACCOUNT_A })
  await stats.drain()
  assert.deepEqual(
    asked,
    ['instagram-looter2.p.rapidapi.com/profile'],
    'instagram-stable (cap 0) never called'
  )
  const row = await rowOf('instagram:brewlet.coffee')
  assert.equal(row.status, 'failed')
  assert.equal(row.next_retry_at.getTime(), NOW + HOUR, 'a failure is asked again after an hour')
})

test('the per-account daily cap counts billable calls and defers like a provider cap', opts, async () => {
  const { stats, asked } = await world({ perAccount: 2 })
  await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.equal(asked.length, 2)
  await stats.request([{ network: 'youtube', url: YT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.equal(asked.length, 2, 'the account spent its 2 calls today')
  assert.equal((await rowOf('youtube:brewletcoffee')).status, 'queued')
  await stats.request([{ network: 'tiktok', url: 'https://www.tiktok.com/@other.cafe' }], {
    account: ACCOUNT_B
  })
  await stats.drain()
  assert.equal(asked.length, 4, 'another account has its own day')
})

test('a failed refresh keeps the last snapshot; the row is asked again after an hour', opts, async () => {
  const state = { down: false }
  const info = () => (state.down ? new Response('oops', { status: 500 }) : Response.json(ttInfo()))
  const { stats, asked, clock } = await world({
    answer: network({ 'tiktok-api23.p.rapidapi.com/api/user/info': info })
  })
  await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  await stats.drain()
  clock.now = NOW + 8 * DAY
  state.down = true
  const stale = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  assert.equal(stale[TT].status, 'queued', 'stale after 7 days: refreshed')
  assert.equal(stale[TT].stale, true)
  await stats.drain()
  const row = await rowOf('tiktok:brewlet.coffee')
  assert.equal(row.status, 'failed')
  assert.equal(row.last_error, 'provider_error')
  assert.equal(Number(row.followers), 1200, 'the snapshot stays')
  const kept = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  assert.equal(kept[TT].status, 'done', 'the old numbers answer, marked stale')
  assert.equal(kept[TT].stale, true)
  assert.equal(kept[TT].followers, 1200)
  assert.equal(kept[TT].error, 'provider_error')
  const calls = asked.length
  await stats.drain()
  assert.equal(asked.length, calls, 'not asked again within the hour')
  clock.now += HOUR
  state.down = false
  const retried = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  assert.equal(retried[TT].status, 'queued')
  await stats.drain()
  assert.equal((await rowOf('tiktok:brewlet.coffee')).status, 'done')
})

test('a missing profile is cached as not_found for 30 days', opts, async () => {
  const missing = () => Response.json({ statusCode: 10221, userInfo: { user: {} } })
  const { stats, asked, clock } = await world({
    answer: network({ 'tiktok-api23.p.rapidapi.com/api/user/info': missing })
  })
  await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_A })
  await stats.drain()
  assert.equal(asked.length, 1, 'not_found never advances the chain')
  clock.now = NOW + 10 * DAY
  const out = await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_B })
  assert.deepEqual(out[TT], { status: 'not_found' })
  await stats.drain()
  assert.equal(asked.length, 1)
  clock.now = NOW + 31 * DAY
  assert.equal(
    (await stats.request([{ network: 'tiktok', url: TT }], { account: ACCOUNT_B }))[TT].status,
    'queued'
  )
})
