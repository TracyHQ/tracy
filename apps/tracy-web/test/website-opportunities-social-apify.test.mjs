import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createSocialStats } from 'website-opportunities/src/social-stats.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const worlds = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map((x) => x.stats.drain()))
})
const NOW = Date.parse('2026-10-20T08:00:00Z')
const DAY = 86_400_000
const URL = 'https://www.facebook.com/TamarelHoiAn'
const KEY = 'facebook:tamarelhoian'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const RUN = 'runFacebookStats01'
const DATA = 'dataFacebookStats1'

async function world({ caps = {}, cash = 30, accountCap = 20, ...changes } = {}) {
  const dom = await websiteOpportunitiesDomain()
  const state = { status: 'SUCCEEDED', starts: 0, rapid: 0, reads: 0, clock: NOW, ...changes }
  const run = () => ({
    id: RUN,
    actId: dom.FACEBOOK_APIFY.actorId,
    buildId: dom.FACEBOOK_APIFY.buildId,
    status: state.status,
    defaultDatasetId: DATA,
    usageTotalUsd: 0.001
  })
  const items = () => [
    {
      post_id: '138592309',
      input_url: URL,
      source_id: '189100555012762',
      source_url: URL,
      page_followers: 185,
      published_at: new Date(NOW - 2 * DAY).toISOString(),
      timestamp: (NOW - 2 * DAY) / 1000
    }
  ]
  const runtime = async () => ({
    keys: { rapidapi: 'R', apify: 'A' },
    settings: {
      researchDailyCapCents: cash,
      researchJobCapCents: 30,
      socialStatsYouTubeDailyQuota: 10000,
      socialStatsProviderCycle: Object.fromEntries(
        ['facebook-scraper3', 'instagram-looter2', 'instagram-stable', 'tiktok-api23', 'yt-api'].map((b) => [
          b,
          { limit: 10000, used: 0, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' }
        ])
      ),
      socialStatsPerAccountPerDay: accountCap,
      socialStatsProviderDailyCap: { 'facebook-scraper3': 20, 'facebook-apify': 5, ...caps }
    }
  })
  const fetchImpl = async (url, init) => {
    const u = new globalThis.URL(url)
    if (u.host === 'facebook-scraper3.p.rapidapi.com') {
      state.rapid++
      return Response.json({ message: 'MONTHLY quota exceeded' }, { status: 429 })
    }
    assert.equal(u.origin, 'https://api.apify.com')
    assert.equal(init.headers.authorization, 'Bearer A')
    assert.equal(init.redirect, 'error')
    assert.equal(u.searchParams.has('token'), false)
    if (init.method === 'POST') {
      state.starts++
      assert.equal(u.pathname, `/v2/acts/${dom.FACEBOOK_APIFY.actor}/runs`)
      assert.equal(u.searchParams.get('build'), '0.1.9')
      assert.equal(u.searchParams.get('maxTotalChargeUsd'), '0.03')
      assert.equal(JSON.parse(init.body).maxPosts, 20)
      if (state.loseResponse) throw new Error('connection lost after send')
      if (state.loseLease) {
        state.loseLease = false
        await db.pool.query(
          `update wo_social_stat set lease_token=lease_token+1, lease_until=$1 where stat_key=$2`,
          [new Date(state.clock - 1), KEY]
        )
      }
      return Response.json({ data: run() })
    }
    state.reads++
    if (state.readFailure) throw new Error('read connection lost')
    if (state.redirect)
      return new Response(null, { status: 302, headers: { location: 'https://elsewhere.test' } })
    if (u.pathname === `/v2/actor-runs/${RUN}`) return Response.json({ data: run() })
    assert.equal(u.pathname, `/v2/datasets/${DATA}/items`)
    return state.largeBody
      ? new Response('x'.repeat(2 * 1024 * 1024 + 1))
      : Response.json(state.empty ? [] : items())
  }
  const stats = createSocialStats({
    pool: db.pool,
    runtime,
    domain: dom,
    fetchImpl,
    now: () => state.clock,
    log: { warn() {}, error() {} }
  })
  const result = { stats, state, runtime, fetchImpl, dom }
  worlds.push(result)
  return result
}
const row = async () => (await db.pool.query('select * from wo_social_stat where stat_key=$1', [KEY])).rows[0]
// The Apify start's own rows; the RapidAPI tier's requests are ledger rows of their own (`social-stats:<network>`).
const money = async () => (await db.pool.query(`select * from wo_cost_ledger where provider = 'apify'`)).rows
const count = async (bucket) =>
  Number(
    (await db.pool.query('select coalesce(sum(count),0) n from rate_bucket where bucket=$1', [bucket]))
      .rows[0].n
  )
async function ask(w, account = A, force = false) {
  await w.stats.request([{ network: 'facebook', url: URL }], { account, force })
  await w.stats.drain()
  return w.stats.lookup([{ network: 'facebook', url: URL }])
}

test(
  'RapidAPI quota failure falls back once; a second account reuses the same paid snapshot',
  opts,
  async () => {
    const w = await world()
    await ask(w)
    const r = await row()
    assert.equal(r.status, 'done')
    assert.equal(r.followers, '185')
    assert.equal(r.coverage, 'partial')
    assert.equal(r.provider, 'facebook/apify')
    assert.equal(r.apify_attempt.phase, 'done')
    await ask(w, B)
    assert.equal(w.state.starts, 1)
    assert.equal(w.state.rapid, 1)
    assert.equal(await count('wo:social-budget:facebook-apify'), 1)
    assert.equal(await count(`wo:social-account:${B}`), 0)
    assert.equal(
      (await db.pool.query(`select count(*)::int as n from wo_cost_ledger where provider = 'rapidapi'`))
        .rows[0].n,
      1,
      'the refused RapidAPI request is in the ledger too'
    )
    assert.equal(
      (await money())[0].actual_cents,
      3,
      'provisional provider cost never understates the ceiling'
    )
  }
)

test(
  'restart and a new UTC day resume the stored run without another start or RapidAPI call',
  opts,
  async () => {
    const w = await world({ status: 'RUNNING' })
    await ask(w)
    assert.equal((await row()).apify_attempt.runId, RUN)
    const resumed = await world()
    resumed.state.clock += DAY
    await ask(resumed, B)
    assert.equal((await row()).status, 'done')
    assert.equal(w.state.starts + resumed.state.starts, 1)
    assert.equal(resumed.state.rapid, 0)
    assert.equal((await money()).length, 1)
    assert.equal(await count('wo:social-budget:facebook-apify'), 1)
  }
)

test(
  'an old run resumed after eight days remains stale instead of receiving seven fresh days',
  opts,
  async () => {
    const w = await world({ status: 'RUNNING' })
    await ask(w)
    w.state.clock += 8 * DAY
    w.state.status = 'SUCCEEDED'
    await w.stats.drain()
    const answer = await w.stats.lookup([{ network: 'facebook', url: URL }])
    assert.equal(answer[URL].stale, true)
    assert.equal(new Date(answer[URL].fetchedAt).getTime(), NOW)
    assert.equal(w.state.starts, 1)
  }
)

for (const situation of ['released', 'yesterday']) {
  test(`an unsent ${situation} reservation cannot fund a new run`, opts, async () => {
    const w = await world({ status: 'RUNNING' })
    await ask(w)
    const r = await row()
    const attempt = { ...r.apify_attempt, phase: 'reserved' }
    delete attempt.runId
    await db.pool.query(`update wo_social_stat set apify_attempt=$1 where stat_key=$2`, [attempt, KEY])
    await db.pool.query(`update wo_cost_ledger set provider_run_id=null, state=$1 where id=$2`, [
      situation === 'released' ? 'released' : 'reserved',
      attempt.reservationId
    ])
    w.state.clock += situation === 'yesterday' ? DAY : 3001
    await w.stats.drain()
    assert.equal(w.state.starts, 1, 'retired before any POST')
    assert.equal((await row()).apify_attempt.phase, 'not_sent')
    w.state.clock += 3001
    w.state.status = 'SUCCEEDED'
    await w.stats.drain()
    assert.equal(w.state.starts, 2)
    assert.equal((await money()).length, 2, 'a fresh reservation funds the new start')
  })
}

test('unknown POST outcome survives automatic and forced refresh without paying again', opts, async () => {
  const w = await world({ loseResponse: true })
  await ask(w)
  assert.equal((await row()).apify_attempt.phase, 'start_uncertain')
  w.state.clock += DAY
  await ask(w, B)
  await ask(w, B, true)
  assert.equal(w.state.starts, 1)
  assert.equal(w.state.rapid, 1, 'pending attempt is checked before the RapidAPI chain')
  assert.equal((await money())[0].state, 'unreconciled')
})

test(
  'a late start response records its receipt after lease loss; the next worker reads that run',
  opts,
  async () => {
    const w = await world({ loseLease: true })
    await ask(w)
    assert.equal((await row()).status, 'done')
    assert.equal(w.state.starts, 1)
    assert.equal((await money())[0].provider_run_id, RUN)
  }
)

for (const [name, settings] of [
  ['paid tier off', { caps: { 'facebook-apify': 0 } }],
  ['RapidAPI cap refused', { caps: { 'facebook-scraper3': 1 } }],
  ['account reservation refused', { accountCap: 1 }],
  ['money ceiling refused', { cash: 2 }]
])
  test(`${name}: no paid start and no bypass of a refused budget`, opts, async () => {
    const w = await world(settings)
    await ask(w)
    assert.equal(w.state.starts, 0)
    assert.equal((await row()).fetched_at, null)
    if (name !== 'paid tier off') assert.equal((await row()).last_error, 'budget')
  })

for (const [name, setting] of [
  ['empty output', 'empty'],
  ['redirect', 'redirect'],
  ['oversized output', 'largeBody']
]) {
  test(`${name} preserves the last good stale snapshot`, opts, async () => {
    const w = await world()
    await ask(w)
    w.state.clock += 8 * DAY
    w.state[setting] = true
    const answer = await ask(w)
    assert.equal(answer[URL].status, 'done')
    assert.equal(answer[URL].followers, 185)
    assert.equal(answer[URL].stale, true)
    assert.equal(new Date((await row()).fetched_at).getTime(), NOW)
    assert.equal(w.state.starts, 2)
  })
}

test('a dataset read failure retries the read instead of creating a new paid attempt', opts, async () => {
  const w = await world({ readFailure: true })
  await ask(w)
  assert.equal((await row()).apify_attempt.runId, RUN)
  w.state.clock += 3_600_001
  w.state.readFailure = false
  await ask(w)
  assert.equal((await row()).status, 'done')
  assert.equal(w.state.starts, 1)
  assert.equal(w.state.rapid, 1)
})

test('a second account spelling the same handle differently resumes the existing run', opts, async () => {
  const w = await world({ readFailure: true })
  await ask(w)
  w.state.clock += 3_600_001
  w.state.readFailure = false
  const lower = 'https://www.facebook.com/tamarelhoian/'
  await w.stats.request([{ network: 'facebook', url: lower }], { account: B, force: true })
  await w.stats.drain()
  const answer = await w.stats.lookup([{ network: 'facebook', url: lower }])
  assert.equal(answer[lower].status, 'done')
  assert.equal(w.state.starts, 1)
  assert.equal(w.state.rapid, 1)
})
