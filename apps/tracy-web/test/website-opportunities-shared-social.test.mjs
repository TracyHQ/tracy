// Real isolated Postgres databases and in-process HTTPS transport: no provider network or secret.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createSocialStats } from 'website-opportunities/src/social-stats.js'
import { createSocialService, SOCIAL_SERVICE_BASE } from 'website-opportunities/src/social-service.js'
import { socialServiceRoutes } from 'website-opportunities/src/social-service-routes.js'
import {
  mintSocialServiceKey,
  verifySocialServiceKey,
  revokeSocialServiceKey
} from 'website-opportunities/src/wo-social-auth.js'
import {
  createSocialClient,
  replicaSocialDomain,
  socialOrigin
} from 'website-opportunities/src/social-client.js'
import {
  applySocialEnvelope,
  readSocialReplica,
  linkPlaceSocialIdentity
} from 'website-opportunities/src/social-replica.js'
import { backfillSocialVersion } from 'website-opportunities/src/social-version.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { mintSession } from '../src/lib/session.js'
import { buildApp } from '../src/app.js'
import { readConfig, ConfigError } from '../src/config.js'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const options = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const central = fileDb(),
  local = fileDb(),
  other = fileDb()
before(async () => {
  await Promise.all([central.open(), local.open(), other.open()])
})
beforeEach(async () => {
  await Promise.all([central.reset(), local.reset(), other.reset()])
})
after(async () => {
  await Promise.all([central.close(), local.close(), other.close()])
})
const NOW = Date.parse('2026-10-20T12:00:00Z'),
  WEEK = 7 * 86400000
const ORIGIN = 'https://social-authority.example.test'
const URL = 'https://www.instagram.com/restaurant/'
const HANDLE = { network: 'instagram', url: URL },
  ALIAS = 'instagram:restaurant',
  ID = 'instagram:id:123456'
const CHANNEL = 'UC0123456789abcdefghijkl'
const YT = { network: 'youtube', url: 'https://www.youtube.com/@restaurant' }
const pepper = 'test-social-service-pepper'
async function grant(id = 'local', over = {}) {
  await central.pool.query(
    `insert into wo_social_deployment(deployment_id,origin,enabled,reads_per_minute,refreshes_per_day,forces_per_day)
    values($1,$2,$3,$4,$5,$6)`,
    [
      id,
      `https://${id}.example.test`,
      over.enabled ?? true,
      over.reads ?? 1000,
      over.refreshes ?? 100,
      over.forces ?? 100
    ]
  )
  return mintSocialServiceKey({
    pool: central.pool,
    pepper,
    deploymentId: id,
    scopes: over.scopes ?? ['read', 'refresh'],
    now: NOW,
    expiresAt: over.expiresAt ?? null
  })
}
async function seed({
  id = '123456',
  followers = 47,
  fetchedAt = NOW,
  bindingAt = NOW,
  invalidated = false
} = {}) {
  const key = `instagram:id:${id}`
  await central.pool.query(
    `insert into wo_social_stat(stat_key,network,url,status,platform_id,followers,posts,coverage,provider,fetched_at,checked_at)
    values($1,'instagram',$2,'done',$3,$4,130,'partial','instagram/apify',$5,$6) on conflict(stat_key) do update set
    status='done',followers=excluded.followers,fetched_at=excluded.fetched_at,checked_at=excluded.checked_at`,
    [key, URL, id, followers, new Date(fetchedAt), new Date(NOW)]
  )
  for (const alias of [ALIAS, key])
    await central.pool.query(
      `insert into wo_social_alias(alias_key,owner_key,network,platform_id,provider,observed_at,verified_at,invalidated_at)
    values($1,$2,'instagram',$3,'instagram/apify',$4,$4,$5) on conflict(alias_key) do update set owner_key=excluded.owner_key,platform_id=excluded.platform_id,
      observed_at=excluded.observed_at,verified_at=excluded.verified_at,invalidated_at=excluded.invalidated_at`,
      [alias, key, id, new Date(bindingAt), invalidated ? new Date(bindingAt) : null]
    )
  await backfillSocialVersion(central.pool, key)
  return key
}
async function world() {
  const domain = await websiteOpportunitiesDomain(),
    key = await grant(),
    keyB = await grant('replica-b')
  let clock = NOW,
    calls = 0,
    offline = false,
    loseReceipt = false
  const stats = createSocialStats({
    pool: central.pool,
    domain,
    runtime: async () => ({
      keys: { google: 'fixture-google' },
      settings: {
        socialStatsProviderDailyCap: { 'youtube-official': 100 },
        socialStatsYouTubeDailyQuota: 100,
        socialStatsPerAccountPerDay: 100
      }
    }),
    now: () => clock,
    log: { error() {}, warn() {} },
    fetchImpl: async (input) => {
      calls++
      const u = new globalThis.URL(input)
      if (u.pathname.endsWith('/channels'))
        return Response.json({
          items: [
            {
              id: CHANNEL,
              snippet: { customUrl: '@restaurant' },
              statistics: { subscriberCount: '300', videoCount: '1' },
              contentDetails: { relatedPlaylists: { uploads: 'UU0123456789abcdefghijkl' } }
            }
          ]
        })
      if (u.pathname.endsWith('/playlistItems'))
        return Response.json({
          items: [{ contentDetails: { videoPublishedAt: new Date(NOW - 86400000).toISOString() } }]
        })
      throw new Error('Unexpected provider URL')
    }
  })
  await central.pool.query('insert into wo_social_authority(singleton) values(true) on conflict do nothing')
  const authorityId = (await central.pool.query('select authority_id from wo_social_authority')).rows[0]
    .authority_id
  const service = createSocialService({ pool: central.pool, domain, stats, now: () => clock })
  const app = socialServiceRoutes({ host: woHost, pool: central.pool, service, pepper, now: () => clock })
  const transport = async (url, init) => {
    assert.equal(new globalThis.URL(url).origin, ORIGIN)
    assert.equal(init.redirect, 'error')
    assert.equal(init.credentials, 'omit')
    if (offline) throw new Error('Fixture central offline')
    const response = await app.request(url, init)
    if (loseReceipt && url.endsWith('/refresh')) {
      loseReceipt = false
      throw new Error('Fixture response lost after commit')
    }
    return response
  }
  const client = (pool, serviceKey = key.key) =>
    createSocialClient({
      pool,
      domain,
      origin: ORIGIN,
      token: serviceKey,
      fetchImpl: transport,
      now: () => clock,
      log: { error() {}, warn() {} }
    })
  const a = client(local.pool),
    b = client(other.pool, keyB.key)
  const principal = { deploymentId: 'local' }
  return {
    domain,
    key,
    stats,
    service,
    app,
    a,
    b,
    principal,
    authorityId,
    calls: () => calls,
    setTime: (t) => {
      clock = t
    },
    offline: (v) => {
      offline = v
    },
    lose: () => {
      loseReceipt = true
    },
    async close() {
      await a.drain()
      await b.drain()
      await stats.drain()
    }
  }
}

test(
  'service credentials are hashed, scoped, expired, revocable and independent of seat keys',
  options,
  async () => {
    const key = await grant()
    const verify = (header) => verifySocialServiceKey({ pool: central.pool, pepper, header, now: NOW })
    assert.equal((await verify(`Bearer ${key.key}`)).deploymentId, 'local')
    assert.equal((await verify('Bearer trk_' + key.key.slice(4))).error, 'SOCIAL_AUTH_INVALID')
    assert.equal((await verify(`Bearer ${key.key.slice(0, -1)}X`)).error, 'SOCIAL_AUTH_INVALID')
    const stored = (await central.pool.query('select * from wo_social_service_key')).rows[0]
    assert.ok(!JSON.stringify(stored).includes(key.key.split('.')[1]))
    await revokeSocialServiceKey(central.pool, key.id, NOW)
    assert.equal((await verify(`Bearer ${key.key}`)).error, 'SOCIAL_AUTH_INVALID')
    assert.equal(await revokeSocialServiceKey(central.pool, key.id, NOW), false)
    const next = await mintSocialServiceKey({
      pool: central.pool,
      pepper,
      deploymentId: 'local',
      scopes: ['read'],
      now: NOW,
      expiresAt: new Date(NOW + 1000)
    })
    assert.deepEqual((await verify(`Bearer ${next.key}`)).scopes, ['read'])
    assert.equal(
      (
        await verifySocialServiceKey({
          pool: central.pool,
          pepper,
          header: `Bearer ${next.key}`,
          now: NOW + 1000
        })
      ).error,
      'SOCIAL_AUTH_INVALID'
    )
  }
)

test(
  'two deployments share the original snapshot version and fetchedAt; offline keeps stale data',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ fetchedAt: NOW - 3600000 })
      const [a, b] = await Promise.all([w.a.lookup([HANDLE]), w.b.lookup([HANDLE])])
      assert.equal(a[URL].followers, 47)
      assert.equal(a[URL].version, b[URL].version)
      assert.equal(a[URL].fetchedAt, new Date(NOW - 3600000).toISOString())
      assert.equal(w.calls(), 0)
      w.offline(true)
      w.setTime(NOW + WEEK)
      const stale = (await w.a.request([HANDLE]))[URL]
      assert.equal(stale.followers, 47)
      assert.equal(stale.stale, true)
      assert.equal(stale.error, 'shared_social_unavailable')
      assert.equal(stale.fetchedAt, a[URL].fetchedAt)
      assert.equal(w.calls(), 0)
    } finally {
      await w.close()
    }
  }
)

test(
  'one central collector serves two replicas; retrying a lost refresh receipt reuses its UUID',
  options,
  async () => {
    const w = await world()
    try {
      w.lose()
      await Promise.all([w.a.request([YT]), w.b.request([YT])])
      await Promise.all([w.a.drain(), w.b.drain()])
      await w.stats.drain()
      assert.equal(w.calls(), 2)
      const pendingLocal = (await local.pool.query("select * from wo_social_outbox where status='queued'"))
        .rows[0]
      const pending =
        pendingLocal ??
        (await other.pool.query("select * from wo_social_outbox where status='queued'")).rows[0]
      const pendingPool = pendingLocal ? local.pool : other.pool
      assert.ok(pending)
      w.setTime(NOW + 10000)
      await w.a.drain()
      await w.b.drain()
      await w.stats.drain()
      const after = (
        await pendingPool.query('select * from wo_social_outbox where operation_id=$1', [
          pending.operation_id
        ])
      ).rows[0]
      assert.equal(after.status, 'done')
      assert.equal(w.calls(), 2)
      const [a, b] = await Promise.all([w.a.lookup([YT]), w.b.lookup([YT])])
      assert.equal(a[YT.url].followers, 300)
      assert.equal(a[YT.url].version, b[YT.url].version)
      assert.equal(
        (await central.pool.query('select count(*)::int as n from wo_social_operation')).rows[0].n,
        2
      )
    } finally {
      await w.close()
    }
  }
)

test('operation retry never refreshes a reassigned handle or changes its payload', options, async () => {
  const w = await world()
  try {
    await seed()
    const operationId = randomUUID(),
      body = {
        authorityId: w.authorityId,
        operationId,
        handle: HANDLE,
        force: true,
        expectedFence: (await w.service.lookup([HANDLE])).items[0].state.refreshFence
      }
    const one = await w.service.refresh(w.principal, body)
    await w.stats.drain()
    await seed({ id: '654321', followers: 8, bindingAt: NOW + 1 })
    const before = (
      await central.pool.query("select lease_token from wo_social_stat where stat_key='instagram:id:654321'")
    ).rows[0].lease_token
    assert.deepEqual(await w.service.refresh(w.principal, body), one)
    assert.equal(
      (
        await central.pool.query(
          "select lease_token from wo_social_stat where stat_key='instagram:id:654321'"
        )
      ).rows[0].lease_token,
      before
    )
    await assert.rejects(w.service.refresh(w.principal, { ...body, force: false }), {
      code: 'OPERATION_CONFLICT'
    })
  } finally {
    await w.close()
  }
})

test('deployment refresh and force ceilings survive key rotation and default to off', options, async () => {
  const w = await world()
  try {
    await central.pool.query(
      "update wo_social_deployment set refreshes_per_day=1,forces_per_day=0 where deployment_id='local'"
    )
    await assert.rejects(
      w.service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: true
      }),
      { code: 'SOCIAL_REFRESH_LIMIT' }
    )
    const body = { authorityId: w.authorityId, operationId: randomUUID(), handle: HANDLE, force: false }
    await w.service.refresh(w.principal, body)
    await w.stats.drain()
    await mintSocialServiceKey({
      pool: central.pool,
      pepper,
      deploymentId: 'local',
      scopes: ['refresh'],
      now: NOW
    })
    await w.service.refresh(w.principal, body)
    await assert.rejects(w.service.refresh(w.principal, { ...body, operationId: randomUUID() }), {
      code: 'SOCIAL_REFRESH_LIMIT'
    })
    await grant('off', { refreshes: 0 })
    await assert.rejects(w.service.refresh({ deploymentId: 'off' }, { ...body, operationId: randomUUID() }), {
      code: 'SOCIAL_REFRESH_LIMIT'
    })
  } finally {
    await w.close()
  }
})

test(
  'service doors reject cookies, read-only refresh, other deployments operations and read overage',
  options,
  async () => {
    const w = await world()
    try {
      const post = (path, key, body) =>
        w.app.request(ORIGIN + SOCIAL_SERVICE_BASE + path, {
          method: 'POST',
          headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      assert.equal((await post('/lookup', 'trk_bad', { handles: [HANDLE] })).status, 401)
      const read = await grant('read', { scopes: ['read'], reads: 1 })
      assert.equal(
        (
          await post('/refresh', read.key, {
            authorityId: w.authorityId,
            operationId: randomUUID(),
            handle: HANDLE,
            force: false
          })
        ).status,
        403
      )
      assert.equal((await post('/lookup', read.key, { handles: [HANDLE] })).status, 429)
      const op = await w.service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: false
      })
      const stranger = await grant('other')
      const response = await w.app.request(`${ORIGIN}${SOCIAL_SERVICE_BASE}/operations/${op.operationId}`, {
        headers: { authorization: `Bearer ${stranger.key}` }
      })
      assert.equal(response.status, 404)
    } finally {
      await w.close()
    }
  }
)

test(
  'replica rejects authority changes and lower versions; binding reassignment has its own revision',
  options,
  async () => {
    const w = await world()
    try {
      await seed()
      const old = await w.service.lookup([HANDLE]),
        expected = new Map([[ALIAS, { ...HANDLE, aliasKey: ALIAS }]])
      await applySocialEnvelope({ pool: local.pool, origin: ORIGIN, envelope: old, expected, now: NOW })
      await seed({ followers: 48, fetchedAt: NOW + 1000 })
      const newer = await w.service.lookup([HANDLE])
      await applySocialEnvelope({
        pool: local.pool,
        origin: ORIGIN,
        envelope: newer,
        expected,
        now: NOW + 1000
      })
      await applySocialEnvelope({
        pool: local.pool,
        origin: ORIGIN,
        envelope: old,
        expected,
        now: NOW + 2000
      })
      assert.equal((await readSocialReplica(local.pool, ORIGIN, expected, NOW))[URL].followers, 48)
      await assert.rejects(
        applySocialEnvelope({
          pool: local.pool,
          origin: ORIGIN,
          envelope: { ...newer, authorityId: randomUUID() },
          expected,
          now: NOW
        }),
        { code: 'SOCIAL_AUTHORITY_CHANGED' }
      )
      // Owner B has an older snapshot version than owner A, but a newer handle binding.
      await seed({ id: '654321', followers: 3, bindingAt: NOW + 3000, fetchedAt: NOW - 1000 })
      const moved = await w.service.lookup([HANDLE])
      await applySocialEnvelope({
        pool: local.pool,
        origin: ORIGIN,
        envelope: moved,
        expected,
        now: NOW + 3000
      })
      await applySocialEnvelope({
        pool: local.pool,
        origin: ORIGIN,
        envelope: old,
        expected,
        now: NOW + 4000
      })
      assert.equal((await readSocialReplica(local.pool, ORIGIN, expected, NOW))[URL].followers, 3)
      await seed({ id: '654321', followers: 3, bindingAt: NOW + 5000, invalidated: true })
      await applySocialEnvelope({
        pool: local.pool,
        origin: ORIGIN,
        envelope: await w.service.lookup([HANDLE]),
        expected,
        now: NOW + 5000
      })
      const missing = (await readSocialReplica(local.pool, ORIGIN, expected, NOW))[URL]
      assert.equal(missing.error, 'not_found')
      assert.equal(missing.followers, undefined)
      await assert.rejects(central.pool.query('delete from wo_social_snapshot'), /immutable/)
    } finally {
      await w.close()
    }
  }
)

test('client missing configuration and rich collectors never call local providers', options, async () => {
  const domain = await websiteOpportunitiesDomain()
  let calls = 0
  const client = createSocialClient({
    pool: local.pool,
    domain,
    origin: null,
    token: null,
    fetchImpl: async () => {
      calls++
      throw new Error('No transport expected')
    }
  })
  assert.equal((await client.request([HANDLE]))[URL].error, 'shared_social_unavailable')
  assert.equal(await client.tick(), 0)
  assert.equal(calls, 0)
  const connectors = replicaSocialDomain(domain).connectorsFor({
    APIFY_TOKEN: 'local-token-must-not-be-used'
  })
  for (const source of ['facebook', 'instagram', 'tiktok', 'youtube']) {
    assert.equal(connectors[source].available, false)
    assert.equal((await connectors[source].collect('fixture')).reason, 'shared_social_required')
  }
  assert.equal(connectors.website.available, true)
  assert.equal(socialOrigin('https://x.test/path'), null)
  assert.equal(socialOrigin('http://x.test'), null)
  assert.equal(socialOrigin('https://u:p@x.test'), null)
})

test('overlapping force operations cannot pay again after a slow alias resolution', options, async () => {
  const w = await world()
  try {
    let unblock, entered
    const gate = new Promise((resolve) => {
        unblock = resolve
      }),
      waiting = new Promise((resolve) => {
        entered = resolve
      })
    let loads = 0
    const slow = createSocialService({
      pool: central.pool,
      stats: w.stats,
      now: () => NOW,
      domain: async () => {
        if (++loads === 2) {
          entered()
          await gate
        }
        return w.domain
      }
    })
    const expectedFence = (await w.service.lookup([YT])).items[0].state.refreshFence
    const first = slow.refresh(w.principal, {
      authorityId: w.authorityId,
      operationId: randomUUID(),
      handle: YT,
      expectedFence,
      force: true
    })
    const second = slow.refresh(w.principal, {
      authorityId: w.authorityId,
      operationId: randomUUID(),
      handle: YT,
      expectedFence,
      force: true
    })
    await waiting
    assert.equal((await first).admission, 'admitted')
    w.setTime(NOW + 1000)
    await w.stats.drain()
    unblock()
    assert.equal((await second).admission, 'superseded')
    await w.stats.drain()
    assert.equal(w.calls(), 2)
  } finally {
    await w.close()
  }
})

test('replica only links verified local place sources and revokes a reassigned handle', options, async () => {
  const w = await world()
  try {
    await seed()
    const place = (
      await local.pool.query("insert into wo_place(display_name) values('Fixture restaurant') returning id")
    ).rows[0].id
    // An unverified URL submitted by the caller cannot create a place source.
    await w.a.lookup([HANDLE])
    await linkPlaceSocialIdentity({
      pool: local.pool,
      placeId: place,
      kind: 'instagram',
      url: URL,
      origin: ORIGIN,
      aliasKey: ALIAS,
      now: NOW
    })
    assert.equal((await local.pool.query('select count(*)::int as n from wo_place_social_link')).rows[0].n, 0)
    await local.pool.query(
      "insert into wo_place_link(place_id,kind,url,verified_by) values($1,'instagram',$2,'website')",
      [place, URL]
    )
    await w.a.lookup([HANDLE])
    const link = (await local.pool.query('select * from wo_place_social_link')).rows[0]
    assert.equal(link.identity_key, ID)
    assert.equal(link.revoked_at, null)
    await seed({ id: '654321', followers: 8, bindingAt: NOW + 1000 })
    await w.a.lookup([HANDLE])
    const revoked = (await local.pool.query('select * from wo_place_social_link')).rows[0]
    assert.equal(revoked.identity_key, ID)
    assert.ok(revoked.revoked_at)
  } finally {
    await w.close()
  }
})

test('shared social configuration rejects typo roles and unsafe origins', () => {
  const base = {
    TRACY_ORIGIN: 'https://tracy.test:8443',
    SESSION_SECRET: 's'.repeat(32),
    SITE_DOMAIN: 'localhost',
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://127.0.0.1:8090',
    HOST_local_DSH_ORIGIN: 'http://127.0.0.1:51790',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  }
  assert.equal(readConfig(base).woSocialRole, 'standalone')
  assert.equal(readConfig({ ...base, WO_SOCIAL_ROLE: 'client' }).woSocialRole, 'client')
  assert.throws(() => readConfig({ ...base, WO_SOCIAL_ROLE: 'clinet' }), ConfigError)
  for (const origin of [
    'http://central.test',
    'https://central.test/path',
    'https://u:p@central.test',
    'https://central.test?redirect=x'
  ])
    assert.throws(
      () => readConfig({ ...base, WO_SOCIAL_ROLE: 'client', WO_SOCIAL_ORIGIN: origin }),
      ConfigError
    )
})

test('client cutover refuses refresh while a legacy provider receipt is uncertain', options, async () => {
  const w = await world()
  try {
    await local.pool.query(
      `insert into wo_social_stat(stat_key,network,url,status,apify_attempt)
      values($1,'instagram',$2,'failed',$3)`,
      [ALIAS, URL, { phase: 'start_uncertain', id: 'fixture-lost-start' }]
    )
    const result = (await w.a.request([HANDLE], { force: true }))[URL]
    assert.equal(result.error, 'shared_social_cutover_required')
    await w.a.drain()
    assert.equal((await local.pool.query('select count(*)::int as n from wo_social_outbox')).rows[0].n, 0)
    assert.equal(
      (await central.pool.query('select count(*)::int as n from wo_social_operation')).rows[0].n,
      0
    )
    assert.equal(w.calls(), 0)
  } finally {
    await w.close()
  }
})

test(
  'unchanged snapshot still receives newer negative metadata without renewing fetchedAt',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ fetchedAt: NOW - WEEK })
      const first = (await w.a.lookup([HANDLE]))[URL]
      await central.pool.query(
        "update wo_social_stat set status='failed',last_error='quota_exceeded' where stat_key=$1",
        [ID]
      )
      const second = (await w.a.lookup([HANDLE]))[URL]
      assert.equal(second.version, first.version)
      assert.equal(second.fetchedAt, first.fetchedAt)
      assert.equal(second.error, 'quota_exceeded')
      assert.equal(second.stale, true)
    } finally {
      await w.close()
    }
  }
)

test('malformed identity envelope cannot change an authority pin or existing replica', options, async () => {
  const w = await world()
  try {
    await seed()
    const envelope = await w.service.lookup([HANDLE]),
      expected = new Map([[ALIAS, { ...HANDLE, aliasKey: ALIAS }]])
    envelope.items[0].identity.platformId = '654321'
    await assert.rejects(
      applySocialEnvelope({ pool: local.pool, origin: ORIGIN, envelope, expected, now: NOW }),
      /Invalid social identity/
    )
    assert.equal(
      (await local.pool.query('select count(*)::int as n from wo_social_replica_authority')).rows[0].n,
      0
    )
  } finally {
    await w.close()
  }
})

test('a force delayed in transport keeps its observed generation across deployments', options, async () => {
  const w = await world()
  try {
    await w.a.request([YT])
    await w.a.drain()
    await w.stats.drain()
    const expectedFence = (await w.service.lookup([YT])).items[0].state.refreshFence
    w.setTime(NOW + 1000)
    const a = await w.service.refresh(w.principal, {
      authorityId: w.authorityId,
      operationId: randomUUID(),
      handle: YT,
      force: true,
      expectedFence
    })
    assert.equal(a.admission, 'admitted')
    await w.stats.drain()
    assert.equal(w.calls(), 4)
    w.setTime(NOW + 2000)
    const b = await w.service.refresh(
      { deploymentId: 'replica-b' },
      { authorityId: w.authorityId, operationId: randomUUID(), handle: YT, force: true, expectedFence }
    )
    assert.equal(b.admission, 'superseded')
    await w.stats.drain()
    assert.equal(w.calls(), 4)
  } finally {
    await w.close()
  }
})

test('authority rotation rejects old outbox epochs before any provider admission', options, async () => {
  const w = await world()
  try {
    await seed()
    await w.a.lookup([HANDLE])
    const expectedFence = (await w.service.lookup([HANDLE])).items[0].state.refreshFence
    await central.pool.query('update wo_social_authority set authority_id=$1', [randomUUID()])
    await assert.rejects(
      w.service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: true,
        expectedFence
      }),
      { code: 'SOCIAL_AUTHORITY_CHANGED' }
    )
    const reply = (await w.a.request([HANDLE], { force: true }))[URL]
    assert.equal(reply.error, 'shared_social_authority_changed')
    assert.equal(reply.followers, 47)
    assert.equal(reply.stale, true)
    assert.equal((await local.pool.query('select count(*)::int as n from wo_social_outbox')).rows[0].n, 0)
    assert.equal(
      (await central.pool.query('select count(*)::int as n from wo_social_operation')).rows[0].n,
      0
    )
  } finally {
    await w.close()
  }
})

test('late queued response cannot overwrite a newer failure at the same alias binding', options, async () => {
  const w = await world()
  try {
    await seed({ fetchedAt: NOW - WEEK })
    await central.pool.query("update wo_social_stat set status='queued' where stat_key=$1", [ID])
    const old = await w.service.lookup([HANDLE]),
      expected = new Map([[ALIAS, { ...HANDLE, aliasKey: ALIAS }]])
    await central.pool.query(
      "update wo_social_stat set status='failed',last_error='rate_limited',checked_at=$2 where stat_key=$1",
      [ID, new Date(NOW)]
    )
    const fresh = await w.service.lookup([HANDLE])
    assert.equal(fresh.items[0].binding.revision, old.items[0].binding.revision)
    await applySocialEnvelope({ pool: local.pool, origin: ORIGIN, envelope: fresh, expected, now: NOW })
    await applySocialEnvelope({ pool: local.pool, origin: ORIGIN, envelope: old, expected, now: NOW + 1 })
    const result = (await readSocialReplica(local.pool, ORIGIN, expected, NOW))[URL]
    assert.equal(result.error, 'rate_limited')
    assert.equal(result.status, 'done')
  } finally {
    await w.close()
  }
})

test(
  'expired handle evidence revalidates even when its former owner has a fresh ID snapshot',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ bindingAt: NOW - WEEK - 1, fetchedAt: NOW - 1000 })
      const envelope = await w.service.lookup([HANDLE])
      assert.equal(envelope.items[0].state.refreshNeeded, true)
      assert.equal(envelope.items[0].state.refreshFence.targetKey, ALIAS)
      const result = (await w.a.request([HANDLE]))[URL]
      assert.equal(result.status, 'queued')
      assert.equal(result.stale, true)
      await w.a.drain()
      await w.stats.drain()
      assert.equal(
        (await central.pool.query('select count(*)::int as n from wo_social_operation')).rows[0].n,
        1
      )
    } finally {
      await w.close()
    }
  }
)

test(
  'force returns queued before its durable outbox is sent; auto limit leaves other handles not queued',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ fetchedAt: NOW - 1000 })
      w.setTime(NOW + 1)
      const result = (await w.a.request([HANDLE], { force: true }))[URL]
      assert.equal(result.status, 'queued')
      assert.equal(result.followers, 47)
      await w.a.drain()
      await w.stats.drain()
      const second = (await w.a.request([YT], { limit: 0 }))[YT.url]
      assert.equal(second.status, 'not_queued')
    } finally {
      await w.close()
    }
  }
)

test(
  'invalidated handles retry after cooldown and legacy verdict controls later polls',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ invalidated: true, bindingAt: NOW - 3600001 })
      const before = await w.service.lookup([HANDLE])
      assert.equal(before.items[0].state.refreshNeeded, true)
      const receipt = await w.service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: false
      })
      assert.equal(receipt.admission, 'admitted')
      await w.stats.drain()
      assert.equal((await w.service.lookup([HANDLE])).items[0].state.refreshNeeded, false)
    } finally {
      await w.close()
    }
  }
)

test(
  'Ops provisioning requires same-origin owner/admin and minted keys revoke permanently',
  options,
  async () => {
    const secret = 's'.repeat(32),
      config = { origin: ORIGIN, sessionSecret: secret, woSocialRole: 'central', woSocialKeyPepper: pepper }
    const workspace = (
      await central.pool.query(
        "insert into workspace(display_name,kind) values('Fixture Ops','tracy_admin') returning id"
      )
    ).rows[0].id
    const cookies = {}
    for (const role of ['owner', 'developer']) {
      const email = `${role}@shared-social.example.test`,
        account = (await central.pool.query('insert into account(email) values($1) returning id', [email]))
          .rows[0].id
      await central.pool.query(
        'insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,$3,$2,now())',
        [workspace, account, role]
      )
      cookies[role] = `tracy_sess=${await mintSession(email, secret)}`
    }
    const app = woOpsRoutes({ pool: central.pool, config, now: () => NOW, log: { log() {} } })
    const request = (path, method, body, role = 'owner', origin = ORIGIN) =>
      app.request(ORIGIN + '/api/ops/wo/social' + path, {
        method,
        headers: { origin, cookie: cookies[role], 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    const body = {
      origin: 'https://replica.example.test',
      enabled: true,
      readsPerMinute: 100,
      refreshesPerDay: 4,
      forcesPerDay: 1
    }
    assert.equal((await request('/deployments/local', 'PUT', body, 'developer')).status, 403)
    assert.equal(
      (await request('/deployments/local', 'PUT', body, 'owner', 'https://other.example.test')).status,
      403
    )
    assert.equal(
      (await request('/deployments/local', 'PUT', { ...body, origin: 'http://unsafe.test' })).status,
      400
    )
    assert.equal((await request('/deployments/local', 'PUT', body)).status, 200)
    const response = await request('/deployments/local/keys', 'POST', { scopes: ['read', 'refresh'] })
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const key = await response.json()
    assert.equal(
      (await verifySocialServiceKey({ pool: central.pool, pepper, header: `Bearer ${key.key}`, now: NOW }))
        .deploymentId,
      'local'
    )
    assert.equal((await request(`/keys/${key.id}`, 'DELETE')).status, 200)
    assert.equal(
      (await verifySocialServiceKey({ pool: central.pool, pepper, header: `Bearer ${key.key}`, now: NOW }))
        .error,
      'SOCIAL_AUTH_INVALID'
    )
    await request('/deployments/local', 'PUT', body)
    assert.equal(
      (await verifySocialServiceKey({ pool: central.pool, pepper, header: `Bearer ${key.key}`, now: NOW }))
        .error,
      'SOCIAL_AUTH_INVALID'
    )
  }
)

test(
  'app wiring in client role leaves legacy provider queues untouched and keeps social collectors blocked',
  options,
  async () => {
    const config = readConfig({
      TRACY_ORIGIN: ORIGIN,
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 's'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://host.test',
      HOST_local_DSH_ORIGIN: 'http://dsh.test',
      HOST_local_SECRET: 'h',
      SEAT_local_SECRET: 'k',
      WO_SOCIAL_ROLE: 'client',
      APIFY_TOKEN: 'fixture-local-provider-must-not-run',
      GOOGLE_API_KEY: 'fixture-google'
    })
    let calls = 0
    const app = buildApp({
      pool: local.pool,
      config,
      mail: { send: async () => {} },
      fetchImpl: async () => {
        calls++
        throw new Error('Unexpected provider transport')
      }
    })
    await local.pool.query(
      "insert into wo_social_stat(stat_key,network,url,status) values($1,'instagram',$2,'queued')",
      [ALIAS, URL]
    )
    assert.equal(await app.socialStatsTick(), 0)
    assert.equal((await app.socialStats.request([HANDLE]))[URL].error, 'shared_social_cutover_required')
    assert.equal((await local.pool.query('select attempts from wo_social_stat')).rows[0].attempts, 0)
    assert.equal(calls, 0)
  }
)

test(
  'force can requeue an uncertain central receipt for reconciliation without replacing its attempt',
  options,
  async () => {
    const w = await world()
    try {
      const attempt = { id: 'fixture-unknown-receipt', phase: 'start_uncertain', url: URL }
      await central.pool.query(
        "insert into wo_social_stat(stat_key,network,url,status,checked_at,apify_attempt) values($1,'instagram',$2,'failed',$3,$4)",
        [ALIAS, URL, new Date(NOW - 1000), attempt]
      )
      const expectedFence = (await w.service.lookup([HANDLE])).items[0].state.refreshFence
      const service = createSocialService({
        pool: central.pool,
        domain: w.domain,
        stats: { tick: async () => 0 },
        now: () => NOW
      })
      const receipt = await service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: true,
        expectedFence
      })
      assert.equal(receipt.admission, 'admitted')
      const row = (await central.pool.query('select * from wo_social_stat where stat_key=$1', [ALIAS]))
        .rows[0]
      assert.equal(row.status, 'queued')
      assert.deepEqual(row.apify_attempt, attempt)
      assert.equal(w.calls(), 0)
    } finally {
      await w.close()
    }
  }
)

test(
  'expired alias failure cooldown is preserved and a second invalidated refresh never revokes an active lease',
  options,
  async () => {
    const w = await world()
    try {
      await seed({ bindingAt: NOW - WEEK - 1 })
      await central.pool.query(
        `insert into wo_social_stat(stat_key,network,url,status,last_error,checked_at,next_retry_at)
      values($1,'instagram',$2,'failed','rate_limited',$3,$4)`,
        [ALIAS, URL, new Date(NOW), new Date(NOW + 3600000)]
      )
      assert.equal((await w.service.lookup([HANDLE])).items[0].state.refreshNeeded, false)
      assert.equal(
        (
          await w.service.refresh(w.principal, {
            authorityId: w.authorityId,
            operationId: randomUUID(),
            handle: HANDLE,
            force: false
          })
        ).admission,
        'fresh'
      )
      await central.pool.query(
        'update wo_social_alias set invalidated_at=$2,observed_at=$2 where alias_key=$1',
        [ALIAS, new Date(NOW - 3600001)]
      )
      await central.pool.query(
        "update wo_social_stat set status='queued',lease_token=42,lease_until=$2 where stat_key=$1",
        [ALIAS, new Date(NOW + 120000)]
      )
      const before = (await central.pool.query('select * from wo_social_stat where stat_key=$1', [ALIAS]))
        .rows[0]
      const receipt = await w.service.refresh(w.principal, {
        authorityId: w.authorityId,
        operationId: randomUUID(),
        handle: HANDLE,
        force: false
      })
      assert.equal(receipt.admission, 'joined')
      const after = (await central.pool.query('select * from wo_social_stat where stat_key=$1', [ALIAS]))
        .rows[0]
      assert.equal(after.lease_token, before.lease_token)
      assert.equal(after.lease_until.toISOString(), before.lease_until.toISOString())
      assert.equal((await w.service.lookup([HANDLE])).items[0].state.status, 'queued')
    } finally {
      await w.close()
    }
  }
)

test('queued legacy handle stays queued after the client outbox receipt is terminal', options, async () => {
  const w = await world()
  try {
    await seed({ bindingAt: NOW - WEEK - 1 })
    // A held legacy lease belongs to a collector already working; service admission may only join it.
    await central.pool.query(
      `insert into wo_social_stat(stat_key,network,url,status,lease_until,lease_token)
      values($1,'instagram',$2,'queued',$3,12)`,
      [ALIAS, URL, new Date(NOW + 120000)]
    )
    const expectedFence = (await w.service.lookup([HANDLE])).items[0].state.refreshFence
    await w.a.lookup([HANDLE])
    await local.pool.query(
      `insert into wo_social_outbox(outbox_key,origin,authority_id,expected_fence,operation_id,alias_key,network,url,force,queued_at)
      values($1,$2,$3,$4,$5,$6,'instagram',$7,false,$8)`,
      ['fixture-pending', ORIGIN, w.authorityId, expectedFence, randomUUID(), ALIAS, URL, new Date(NOW)]
    )
    await w.a.drain()
    assert.equal((await local.pool.query('select status from wo_social_outbox')).rows[0].status, 'done')
    assert.equal((await w.a.lookup([HANDLE]))[URL].status, 'queued')
  } finally {
    await w.close()
  }
})

test('full web app admits dedicated central service auth without a seat session', options, async () => {
  const key = await grant()
  await seed()
  const config = readConfig({
    TRACY_ORIGIN: ORIGIN,
    SITE_DOMAIN: 'localhost',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host.test',
    HOST_local_DSH_ORIGIN: 'http://dsh.test',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k',
    WO_SOCIAL_ROLE: 'central',
    WO_SOCIAL_KEY_PEPPER: pepper
  })
  const app = buildApp({
    pool: central.pool,
    config,
    mail: { send: async () => {} },
    fetchImpl: async () => {
      throw new Error('No provider expected for lookup')
    }
  })
  const response = await app.request(ORIGIN + SOCIAL_SERVICE_BASE + '/lookup', {
    method: 'POST',
    headers: { authorization: `Bearer ${key.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ handles: [HANDLE] })
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).items[0].identity.platformId, '123456')
})

test('replica returns every original URL spelling while reading one shared alias', options, async () => {
  const w = await world()
  try {
    await seed()
    const alternate = 'https://www.instagram.com/RESTAURANT/'
    const results = await w.a.lookup([HANDLE, { network: 'instagram', url: alternate }])
    assert.equal(results[URL].followers, 47)
    assert.equal(results[alternate].followers, 47)
    assert.equal(results[alternate].url, alternate)
    assert.equal(results[alternate].version, results[URL].version)
  } finally {
    await w.close()
  }
})
