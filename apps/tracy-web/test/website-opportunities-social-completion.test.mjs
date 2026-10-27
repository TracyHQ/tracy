import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test, before, beforeEach, after } from 'node:test'
import { fileDb } from './_db.mjs'
import { createSocialStats } from 'website-opportunities/src/social-stats.js'
import { websiteOpportunitiesDomain, WO_DOMAIN_DIR } from 'website-opportunities/src/domain-loader.js'
import { reserveSocialQuota, refundSocialQuota, pacificDay } from 'website-opportunities/src/social-quota.js'
import { publishSocialSnapshot } from 'website-opportunities/src/social-alias.js'
import { woRuntime } from '../src/lib/wo-ops.js'
import { parseWoOpsSettingsInput } from 'website-opportunities/src/wo-settings.js'
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const NOW = Date.parse('2026-10-20T09:22:30Z'),
  DAY = 86400000
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222'
const { SOCIAL_APIFY } = await import(
  new URL('social-stats/apify-profiles.mjs', 'file://' + WO_DOMAIN_DIR + '/')
)
for (const network of ['instagram', 'tiktok']) {
  test(
    `${network}: paid queue resumes the same pinned run and both accounts share its ID-owned snapshot`,
    opts,
    async () => {
      const dom = await websiteOpportunitiesDomain(),
        spec = SOCIAL_APIFY[network]
      const fixture = JSON.parse(
        await readFile(
          new URL(
            `../../../packages/wo/website-opportunities/test/fixtures/social-stats/${network}-apify.json`,
            import.meta.url
          )
        )
      )
      const item = fixture.find((r) => r.id || r.userId),
        url = item.url ?? item.profileUrl,
        handle = [{ network, url }]
      let clock = NOW,
        status = 'RUNNING',
        starts = 0
      const stats = () =>
        createSocialStats({
          pool: db.pool,
          domain: dom,
          now: () => clock,
          log: { warn() {}, error() {} },
          runtime: async () => ({
            keys: { apify: 'A' },
            settings: {
              researchDailyCapCents: 100,
              researchJobCapCents: 100,
              socialStatsPerAccountPerDay: 10,
              socialStatsProviderDailyCap: { [network + '-apify']: 5 }
            }
          }),
          fetchImpl: async (u, init) => {
            assert.equal(new URL(u).origin, 'https://api.apify.com')
            assert.equal(init.redirect, 'error')
            assert.equal(init.headers.authorization, 'Bearer A')
            if (init.method === 'POST') {
              starts++
              assert.equal(new URL(u).searchParams.get('maxTotalChargeUsd'), String(spec.maxChargeUsd))
              assert.deepEqual(JSON.parse(init.body), spec.input(url))
            }
            return new URL(u).pathname.includes('/datasets/')
              ? Response.json([item])
              : Response.json({
                  data: {
                    id: 'runSocialComple01',
                    actId: spec.actorId,
                    buildId: spec.buildId,
                    status,
                    defaultDatasetId: 'dataSocialCompl01'
                  }
                })
          }
        })
      const first = stats()
      await first.request(handle, { account: A })
      await first.drain()
      const before = (await db.pool.query('select * from wo_social_stat')).rows[0]
      assert.equal(before.apify_attempt.phase, 'running')
      clock += 4000
      status = 'SUCCEEDED'
      const second = stats()
      await second.request(handle, { account: B })
      await second.drain()
      const out = (await second.lookup(handle))[url]
      assert.equal(out.status, 'done')
      assert.equal(out.followers, item.followersCount ?? item.followerCount)
      assert.equal(out.fetchedAt, new Date(NOW).toISOString())
      assert.equal(starts, 1)
      const ledger = (await db.pool.query('select * from wo_cost_ledger')).rows
      assert.equal(ledger.length, 1)
      assert.equal(ledger[0].actual_cents, Math.ceil(spec.maxChargeUsd * 100))
      const buckets = (
        await db.pool.query('select count from rate_bucket where bucket=$1', [
          'wo:social-budget:' + network + '-apify'
        ])
      ).rows
      assert.equal(buckets[0].count, 1)
      const alias = (
        await db.pool.query('select * from wo_social_alias where alias_key=$1', [
          network + ':' + item.username
        ])
      ).rows[0]
      assert.equal(alias.owner_key, network + ':id:' + (item.id ?? item.userId))
    }
  )
}
async function fakeWorld({
  pool = db.pool,
  state = { clock: NOW, calls: 0, id: '138592309', fail: false }
} = {}) {
  const real = await websiteOpportunitiesDomain()
  const stats = createSocialStats({
    pool,
    now: () => state.clock,
    domain: {
      ...real,
      fetchSocialStats: async ({ network, url }) => {
        state.calls++
        await state.beforeFetch?.()
        if (state.fail) throw new real.SocialStatsError(state.failCode ?? 'provider_error', 'unavailable')
        return {
          stat: {
            network,
            url,
            platformId: state.id,
            handle: 'example',
            followers: state.id === '138592309' ? 100 : 200,
            posts: 4,
            lastPostAt: '2026-10-01T00:00:00Z',
            postsPerMonth: 1,
            coverage: 'partial',
            provider: 'apify'
          }
        }
      }
    },
    runtime: async () => ({ keys: {}, settings: {} }),
    log: { warn() {}, error() {} }
  })
  return { stats, state }
}
test(
  'verified handle and numeric ID reuse one owner; force reassignment never overwrites the former owner',
  opts,
  async () => {
    const { stats, state } = await fakeWorld()
    const slug = { network: 'facebook', url: 'https://www.facebook.com/example' },
      id = { network: 'facebook', url: 'https://www.facebook.com/profile.php?id=138592309' }
    await stats.request([slug], { account: A })
    await stats.drain()
    await stats.request([id], { account: B })
    await stats.drain()
    assert.equal(state.calls, 1)
    state.clock += 1000
    state.id = '987654321'
    await stats.request([slug], { account: B, force: true })
    await stats.drain()
    assert.equal((await stats.lookup([slug]))[slug.url].followers, 200)
    assert.equal((await stats.lookup([id]))[id.url].followers, 100)
    const owners = (
      await db.pool.query(
        "select platform_id,followers from wo_social_stat where stat_key like 'facebook:id:%' order by platform_id"
      )
    ).rows
    assert.deepEqual(
      owners.map((r) => [r.platform_id, Number(r.followers)]),
      [
        ['138592309', 100],
        ['987654321', 200]
      ]
    )
  }
)
test('alias discovered after enqueue is reread at admission, before any paid start', opts, async () => {
  const { stats, state } = await fakeWorld()
  const slug = { network: 'facebook', url: 'https://www.facebook.com/example' }
  await stats.request([slug], { account: A })
  await stats.drain()
  await db.pool.query(
    "insert into wo_social_stat (stat_key,network,url,status,requested_by) values ('facebook:other','facebook','https://www.facebook.com/other','queued',$1)",
    [B]
  )
  await db.pool.query(
    "insert into wo_social_alias select 'facebook:other',owner_key,network,platform_id,provider,observed_at,verified_at from wo_social_alias where alias_key='facebook:example'"
  )
  await stats.drain()
  assert.equal(state.calls, 1)
  assert.equal(
    (await stats.lookup([{ network: 'facebook', url: 'https://www.facebook.com/other' }]))[
      'https://www.facebook.com/other'
    ].followers,
    100
  )
})
test('lost lease cannot publish either snapshot or alias', opts, async () => {
  await db.pool.query(
    "insert into wo_social_stat (stat_key,network,url,status,lease_token,lease_until) values ('facebook:old','facebook','https://www.facebook.com/old','queued',2,$1)",
    [new Date(NOW + 1000)]
  )
  const ok = await publishSocialSnapshot({
    pool: db.pool,
    row: { stat_key: 'facebook:old', network: 'facebook', url: 'https://www.facebook.com/old' },
    lease: { token: '1' },
    fields: { platform_id: '138592309', fetched_at: new Date(NOW), provider: 'apify', status: 'done' },
    aliasKeys: ['facebook:old'],
    now: NOW
  })
  assert.equal(ok, false)
  assert.equal((await db.pool.query('select count(*)::int n from wo_social_alias')).rows[0].n, 0)
})
test('unreadable runtime stops the entire chain without any provider', opts, async () => {
  const dom = await websiteOpportunitiesDomain()
  let calls = 0
  const stats = createSocialStats({
    pool: db.pool,
    domain: dom,
    runtime: async () => ({ readable: false, keys: { apify: 'A' }, settings: {} }),
    fetchImpl: async () => {
      calls++
      throw Error('unexpected')
    },
    now: () => NOW,
    log: { warn() {}, error() {} }
  })
  await stats.request([{ network: 'facebook', url: 'https://www.facebook.com/example' }])
  await stats.drain()
  assert.equal(calls, 0)
  assert.equal(
    (await db.pool.query('select last_error from wo_social_stat')).rows[0].last_error,
    'budget_unreadable'
  )
})
const allocation = { limit: 4, used: 1, startsAt: '2026-10-18T00:00:00Z', endsAt: '2026-11-18T00:00:00Z' }
const reserve = (over = {}) =>
  reserveSocialQuota({
    pool: db.pool,
    budget: 'instagram-looter2',
    units: 2,
    cap: 20,
    account: A,
    perAccount: 20,
    settings: { socialStatsProviderCycle: { 'instagram-looter2': allocation } },
    now: NOW,
    ...over
  })
test(
  'billing-cycle reservation is atomic across replicas and keeps sent timeouts charged',
  opts,
  async () => {
    const r = await Promise.all([reserve(), reserve()])
    assert.equal(r.filter((x) => x.ok).length, 1)
    const no = await reserve({ now: NOW + DAY })
    assert.equal(no.ok, false)
    assert.equal(no.retryAt, Date.parse(allocation.endsAt))
  }
)
test(
  'unsent refunds go back to the original UTC day and cycle, never the day after midnight',
  opts,
  async () => {
    const r = await reserve()
    assert.equal(r.ok, true)
    await refundSocialQuota(db.pool, r, 1)
    assert.equal((await reserve()).ok, true)
    const rows = (
      await db.pool.query(
        "select window_start,count from rate_bucket where bucket='wo:social-budget:instagram-looter2'"
      )
    ).rows
    assert.equal(rows.length, 1)
    assert.equal(rows[0].count, 3)
  }
)
test('missing cycle, expired cycle and unallocated YouTube quota fail closed', opts, async () => {
  for (const settings of [
    {},
    { socialStatsProviderCycle: { 'instagram-looter2': { ...allocation, endsAt: '2026-10-19T00:00:00Z' } } }
  ])
    assert.equal((await reserve({ settings })).ok, false)
  assert.equal((await reserve({ budget: 'youtube-official', settings: {} })).ok, false)
  assert.equal((await db.pool.query('select count(*)::int n from rate_bucket')).rows[0].n, 0)
})
test('YouTube uses the Pacific day across UTC midnight and both DST changes', opts, async () => {
  assert.equal(pacificDay(Date.parse('2026-10-20T01:00:00Z')).date, '2026-10-19')
  assert.equal(
    new Date(pacificDay(Date.parse('2026-03-08T09:00:00Z')).resetsAt).toISOString(),
    '2026-03-09T07:00:00.000Z'
  )
  assert.equal(
    new Date(pacificDay(Date.parse('2026-11-01T08:00:00Z')).resetsAt).toISOString(),
    '2026-11-02T08:00:00.000Z'
  )
  const settings = { socialStatsYouTubeDailyQuota: 2 }
  assert.equal(
    (
      await reserve({
        budget: 'youtube-official',
        units: 2,
        settings,
        now: Date.parse('2026-10-19T23:00:00Z')
      })
    ).ok,
    true
  )
  const r = await reserve({
    budget: 'youtube-official',
    units: 1,
    settings,
    now: Date.parse('2026-10-20T01:00:00Z')
  })
  assert.equal(r.ok, false)
  assert.equal(r.retryAt, Date.parse('2026-10-20T07:00:00Z'))
})
test('Ops rejects malformed allocations instead of silently granting free usage', () => {
  for (const cycle of [[], null, { 'yt-api': { ...allocation, used: -1 } }, { unknown: allocation }])
    assert.equal(parseWoOpsSettingsInput({ socialStatsProviderCycle: cycle }).ok, false)
  assert.equal(parseWoOpsSettingsInput({ socialStatsYouTubeDailyQuota: 10001 }).ok, false)
  assert.equal(parseWoOpsSettingsInput({ socialStatsProviderCycle: { 'yt-api': allocation } }).ok, true)
})

test('runtime reports a database failure so social admission cannot use fallback credentials', async () => {
  const r = await woRuntime(
    {
      query: async () => {
        throw Error('offline')
      }
    },
    { apifyToken: 'fake', sessionSecret: 'test' },
    { log: { warn() {} } }
  )
  assert.equal(r.readable, false)
})

test('concurrent force through known slug and ID admits one generation and one refresh', opts, async () => {
  const { stats, state } = await fakeWorld()
  const slug = { network: 'facebook', url: 'https://www.facebook.com/example' },
    id = { network: 'facebook', url: 'https://www.facebook.com/profile.php?id=138592309' }
  await stats.request([slug], { account: A })
  await stats.drain()
  state.clock += 1000
  await Promise.all([
    stats.request([slug], { account: A, force: true }),
    stats.request([id], { account: B, force: true })
  ])
  await stats.drain()
  assert.equal(state.calls, 2)
  assert.equal((await stats.lookup([slug, id]))[slug.url].followers, 100)
})
test(
  'a failed force through a verified alias preserves the owner snapshot and original age',
  opts,
  async () => {
    const { stats, state } = await fakeWorld()
    const h = { network: 'facebook', url: 'https://www.facebook.com/example' }
    await stats.request([h])
    await stats.drain()
    state.clock += 1000
    state.fail = true
    await stats.request([h], { force: true })
    await stats.drain()
    const s = (await stats.lookup([h]))[h.url]
    assert.equal(s.status, 'done')
    assert.equal(s.followers, 100)
    assert.equal(s.fetchedAt, new Date(NOW).toISOString())
    assert.equal(s.error, 'provider_error')
  }
)
test(
  'a paid result waits at its source while the legacy ID row is active, then publishes without another call',
  opts,
  async () => {
    const { stats, state } = await fakeWorld(),
      h = { network: 'facebook', url: 'https://www.facebook.com/example' }
    await db.pool.query(
      `insert into wo_social_stat (stat_key,network,url,status,lease_token,lease_until,apify_attempt) values ('facebook:id:138592309','facebook','https://www.facebook.com/profile.php?id=138592309','queued',3,$1,$2)`,
      [new Date(NOW + 10000), { phase: 'running', id: 'legacy-receipt' }]
    )
    await stats.request([h])
    await stats.drain()
    const source = (await db.pool.query("select * from wo_social_stat where stat_key='facebook:example'"))
      .rows[0]
    assert.equal(source.apify_attempt.phase, 'publishing')
    assert.equal(source.apify_attempt.publication.fields.followers, 100)
    await db.pool.query(
      "update wo_social_stat set status='done',lease_until=null,platform_id='138592309',apify_attempt=$1 where stat_key='facebook:id:138592309'",
      [{ phase: 'done', id: 'legacy-receipt' }]
    )
    state.clock += 4000
    await stats.drain()
    assert.equal(state.calls, 1)
    assert.equal((await stats.lookup([h]))[h.url].followers, 100)
    assert.equal(
      (await db.pool.query("select apify_attempt from wo_social_stat where stat_key='facebook:id:138592309'"))
        .rows[0].apify_attempt.id,
      'legacy-receipt'
    )
  }
)
async function publishRaw(key, id, observedAt, keys = ['facebook:example'], clock = () => NOW + 5000) {
  await db.pool.query(
    `insert into wo_social_stat (stat_key,network,url,status,lease_token,lease_until) values ($1,'facebook','https://www.facebook.com/example','queued',1,$2) on conflict (stat_key) do update set status='queued',lease_token=1,lease_until=excluded.lease_until`,
    [key, new Date(NOW + 10000)]
  )
  return publishSocialSnapshot({
    pool: db.pool,
    row: { stat_key: key, network: 'facebook', url: 'https://www.facebook.com/example' },
    lease: { token: '1' },
    fields: {
      status: 'done',
      platform_id: id,
      followers: 100,
      provider: 'apify',
      coverage: 'partial',
      fetched_at: new Date(observedAt),
      checked_at: new Date(observedAt)
    },
    aliasKeys: keys,
    now: NOW + 5000,
    clock
  })
}
test('a late observation never reclaims a reassigned handle or changes its ID alias', opts, async () => {
  await publishRaw('facebook:new', '987654321', NOW + 2000)
  await publishRaw('facebook:old', '138592309', NOW + 1000)
  const a = (await db.pool.query("select * from wo_social_alias where alias_key='facebook:example'")).rows[0]
  assert.equal(a.platform_id, '987654321')
  await publishRaw('facebook:id:138592309', '987654321', NOW + 3000, [
    'facebook:example',
    'facebook:id:138592309'
  ])
  assert.equal(
    (await db.pool.query("select platform_id from wo_social_alias where alias_key='facebook:id:138592309'"))
      .rows[0].platform_id,
    '138592309'
  )
  assert.equal(
    (await db.pool.query("select platform_id from wo_social_stat where stat_key='facebook:id:138592309'"))
      .rows[0].platform_id,
    '138592309'
  )
})
test('lease expiration while waiting for publication locks cannot publish any alias', opts, async () => {
  assert.equal(
    await publishRaw('facebook:expired', '138592309', NOW, ['facebook:expired'], () => NOW + 11000),
    false
  )
  assert.equal((await db.pool.query('select count(*)::int n from wo_social_alias')).rows[0].n, 0)
})

test(
  'crossed reassignment of two verified busy owners terminates without a publication dependency cycle',
  opts,
  async () => {
    const ids = ['138592309', '987654321']
    for (const id of ids)
      await db.pool.query(
        `insert into wo_social_stat (stat_key,network,url,status,platform_id,followers,lease_token,lease_until,apify_attempt) values ($1,'facebook',$2,'queued',$3,88,1,$4,$5)`,
        [
          'facebook:id:' + id,
          'https://www.facebook.com/profile.php?id=' + id,
          id,
          new Date(NOW + 10000),
          { phase: 'publishing' }
        ]
      )
    await Promise.all(
      ids.map((id, i) =>
        publishSocialSnapshot({
          pool: db.pool,
          row: {
            stat_key: 'facebook:id:' + id,
            network: 'facebook',
            url: 'https://www.facebook.com/handle' + i
          },
          lease: { token: '1' },
          fields: {
            status: 'done',
            platform_id: ids[1 - i],
            followers: 99,
            provider: 'apify',
            coverage: 'partial',
            fetched_at: new Date(NOW),
            checked_at: new Date(NOW),
            apify_attempt: { phase: 'done', id: 'receipt' + i }
          },
          aliasKeys: ['facebook:handle' + i],
          now: NOW,
          clock: () => NOW
        })
      )
    )
    const rows = (
      await db.pool.query(
        'select stat_key,status,platform_id,apify_attempt from wo_social_stat order by stat_key'
      )
    ).rows
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.equal(row.status, 'done')
      assert.equal(row.apify_attempt.phase, 'done')
      assert.equal(row.stat_key, 'facebook:id:' + row.platform_id)
    }
    const aliases = (
      await db.pool.query(
        'select alias_key,platform_id from wo_social_alias where alias_key like $1 order by alias_key',
        ['facebook:handle%']
      )
    ).rows
    assert.deepEqual(
      aliases.map((a) => a.platform_id),
      [ids[1], ids[0]]
    )
  }
)

test(
  'a legacy YouTube channel-ID row and explicit ID alias never receive another channel identity',
  opts,
  async () => {
    const a = 'UCX6OQ3DkcsbYNE6H8uQQuVA',
      b = 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
      key = 'youtube:channel:' + a
    await db.pool.query(
      `insert into wo_social_stat (stat_key,network,url,status,platform_id,followers,lease_token,lease_until) values ($1,'youtube',$2,'queued',$3,88,1,$4)`,
      [key, 'https://www.youtube.com/channel/' + a, a, new Date(NOW + 10000)]
    )
    await publishSocialSnapshot({
      pool: db.pool,
      row: { stat_key: key, network: 'youtube', url: 'https://www.youtube.com/@example' },
      lease: { token: '1' },
      fields: {
        status: 'done',
        platform_id: b,
        followers: 200,
        provider: 'official',
        fetched_at: new Date(NOW),
        checked_at: new Date(NOW)
      },
      aliasKeys: [key, 'youtube:channel:' + b, 'youtube:example'],
      now: NOW
    })
    const row = (await db.pool.query('select * from wo_social_stat where stat_key=$1', [key])).rows[0]
    assert.equal(row.platform_id, a)
    assert.equal(Number(row.followers), 88)
    assert.equal(
      (
        await db.pool.query(
          'select count(*)::int n from wo_social_alias where alias_key=$1 and platform_id<>$2',
          [key, a]
        )
      ).rows[0].n,
      0
    )
  }
)

test(
  'not_found for a former handle invalidates that binding while its numeric owner keeps its snapshot',
  opts,
  async () => {
    const { stats, state } = await fakeWorld(),
      slug = { network: 'facebook', url: 'https://www.facebook.com/example' },
      id = { network: 'facebook', url: 'https://www.facebook.com/profile.php?id=138592309' }
    await stats.request([slug])
    await stats.drain()
    state.clock += 1000
    state.fail = true
    state.failCode = 'not_found'
    await stats.request([slug], { force: true })
    await stats.drain()
    const out = await stats.lookup([slug, id])
    assert.equal(out[slug.url].status, 'failed')
    assert.equal(out[slug.url].error, 'not_found')
    assert.equal(out[id.url].status, 'done')
    assert.equal(out[id.url].followers, 100)
    assert.equal(out[id.url].fetchedAt, new Date(NOW).toISOString())
    assert.ok(
      (await db.pool.query("select invalidated_at from wo_social_alias where alias_key='facebook:example'"))
        .rows[0].invalidated_at
    )
  }
)

for (const outcome of ['done', 'not_found'])
  for (const spelling of ['slug', 'id']) {
    test(
      `force delayed in ${spelling} resolution reuses an overlapping ${outcome} refresh`,
      opts,
      async () => {
        const { stats, state } = await fakeWorld()
        const slug = { network: 'facebook', url: 'https://www.facebook.com/example' }
        const id = { network: 'facebook', url: 'https://www.facebook.com/profile.php?id=138592309' }
        await stats.request([slug])
        await stats.drain()
        let providerEntered, finishProvider, aliasEntered, finishAlias
        const providerWaiting = new Promise((r) => (providerEntered = r))
        const providerGate = new Promise((r) => (finishProvider = r))
        const aliasWaiting = new Promise((r) => (aliasEntered = r))
        const aliasGate = new Promise((r) => (finishAlias = r))
        state.clock += 1000
        state.beforeFetch = async () => {
          providerEntered()
          await providerGate
        }
        state.fail = outcome === 'not_found'
        state.failCode = 'not_found'
        await stats.request([slug], { account: A, force: true })
        await providerWaiting
        state.clock += 1000
        const slowPool = {
          connect: () => db.pool.connect(),
          query: async (sql, args) => {
            if (sql.includes('left join wo_social_alias')) {
              aliasEntered()
              await aliasGate
            }
            return db.pool.query(sql, args)
          }
        }
        const slow = (await fakeWorld({ pool: slowPool, state })).stats
        const second = slow.request([spelling === 'slug' ? slug : id], { account: B, force: true })
        await aliasWaiting
        try {
          state.clock += 1000
          finishProvider()
          await stats.drain()
          state.clock += 1000
        } finally {
          finishProvider()
          finishAlias()
        }
        await second
        await slow.drain()
        assert.equal(state.calls, 2, 'overlap must reuse the completed refresh despite a newer generation')
        assert.equal((await slow.lookup([id]))[id.url].followers, 100)
        state.clock += 1000
        state.fail = false
        await slow.request([id], { account: B, force: true })
        await slow.drain()
        assert.equal(state.calls, 3, 'a later explicit refresh is still admitted')
      }
    )
  }

test('a normal retry after invalidation honors the verdict of that retry', opts, async () => {
  const { stats, state } = await fakeWorld()
  const h = { network: 'facebook', url: 'https://www.facebook.com/example' }
  await stats.request([h])
  await stats.drain()
  state.clock += 1000
  state.fail = true
  state.failCode = 'not_found'
  await stats.request([h], { force: true })
  await stats.drain()
  assert.equal(state.calls, 2)
  state.clock += 3600001
  await stats.request([h])
  await stats.drain()
  assert.equal(state.calls, 3)
  state.clock += 1000
  await stats.request([h])
  await stats.drain()
  assert.equal(state.calls, 3, 'the new not_found retry keeps its own cooldown')
})

test('lease expiration while waiting on an alias lock rolls publication back', opts, async () => {
  const blocker = await db.pool.connect()
  let clock = NOW + 5000
  let publishing
  try {
    await blocker.query('begin')
    await blocker.query('select pg_advisory_xact_lock(hashtext($1))', ['social-alias:facebook:example'])
    publishing = publishRaw('facebook:late-lock', '138592309', NOW, ['facebook:example'], () => clock)
    const deadline = Date.now() + 3000
    while (true) {
      const waiting = await db.pool.query(`select count(*)::int n from pg_locks
        where locktype='advisory' and not granted and database=(select oid from pg_database where datname=current_database())`)
      if (waiting.rows[0].n > 0) break
      assert.ok(Date.now() < deadline, 'publisher reaches the held alias lock')
      await new Promise((r) => setTimeout(r, 10))
    }
    clock = NOW + 11000
  } finally {
    await blocker.query('rollback')
    blocker.release()
  }
  assert.equal(await publishing, false)
  assert.equal((await db.pool.query('select count(*)::int n from wo_social_alias')).rows[0].n, 0)
  const source = (await db.pool.query("select * from wo_social_stat where stat_key='facebook:late-lock'"))
    .rows[0]
  assert.equal(source.status, 'queued')
  assert.equal(source.followers, null)
})
