// Synthetic OSM/provider-free scratch Postgres. No production place or provider credential is used.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createDubaiPrefetch, selectDubaiSeeds } from 'website-opportunities/src/dubai-prefetch.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { claimPlaceJob, finishPlaceJob, joinPlace, placeLease } from 'website-opportunities/src/place-jobs.js'
import { currentSnapshotOf, snapshotFresh } from 'website-opportunities/src/places.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { fileDb } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()

const db = fileDb(),
  opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
before(db.open)
beforeEach(db.reset)
after(db.close)
const one = async (sql, args) => (await db.pool.query(sql, args)).rows[0]
const raw = (id = 1, extra = {}) => ({
  type: 'node',
  id,
  lat: 25.198,
  lon: 55.275,
  tags: {
    amenity: 'restaurant',
    name: `Synthetic restaurant ${id}`,
    website: `https://fixture${id}.example.test/`,
    ...extra
  }
})
let real
before(async () => {
  real = await websiteOpportunitiesDomain()
})
async function setup(elements = [raw(1), raw(2)], options = {}) {
  let reads = 0
  const discover = async () => {
    reads++
    const fetchedAt = new Date().toISOString()
    return {
      seeds: selectDubaiSeeds({ elements }, real, fetchedAt),
      source: {
        id: 'openstreetmap-overpass',
        fetchedAt,
        revision: createHash('sha256').update(JSON.stringify(elements)).digest('hex')
      }
    }
  }
  const scheduler = createDubaiPrefetch({
    pool: db.pool,
    role: 'central',
    discover,
    ...options
  })
  await scheduler.create()
  await scheduler.setEnabled(true)
  return { scheduler, reads: () => reads }
}
async function join(placeId, options) {
  const client = await db.pool.connect()
  try {
    await client.query('begin')
    const r = await joinPlace(client, placeId, options)
    await client.query('commit')
    return r
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
async function demand(job) {
  const a = await one('insert into account(email) values($1) returning id', [
    `${job.id}@fixture.example.test`
  ])
  const o = await one(
    `insert into wo_opportunity(account_id,name,provider,provider_id,candidate,place_id)
    values($1,'Synthetic restaurant','osm',$2,'{}',$3) returning id`,
    [a.id, job.place_id, job.place_id]
  )
  await db.pool.query(
    `insert into wo_job(account_id,opportunity_id,request_id,kind,state,place_job_id)
    values($1,$2,$3::text,'research','queued',$3::uuid)`,
    [a.id, o.id, job.id]
  )
}
function executor({ collect, ...extra } = {}) {
  const calls = { website: 0, paid: 0, media: 0 }
  const paid = () => {
    calls.paid++
    throw new Error('Unexpected paid call')
  }
  const domain = {
    ...real,
    connectorsFor({ APIFY_TOKEN }) {
      assert.equal(APIFY_TOKEN, undefined)
      return {
        website: {
          available: true,
          async collect(url, options) {
            calls.website++
            assert.equal(options.limit, 2)
            assert.deepEqual(options.cursor.queue, [url])
            if (collect) return collect(url, options)
            return {
              status: 'partial',
              reason: 'limit',
              cursor: { queue: ['https://unused.example.test'] },
              coverage: { fetched: 2 },
              profile: {
                name: 'Observed website name',
                bio: 'Synthetic public bio',
                links: ['https://www.instagram.com/fixture.restaurant/']
              },
              media: [{ url: 'https://fixture.example.test/photo.png' }]
            }
          }
        },
        facebook: { available: true, collect: paid }
      }
    },
    fetchPlaceDetails: paid,
    fetchPlacePhoto: paid
  }
  const ex = createExecutor({
    host: woHost,
    pool: db.pool,
    shared: true,
    prefetch: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'fixture-key', apify: 'fixture-token' },
      settings: normalizeWoOpsSettings({ googlePlacesPhotos: true, pageSpeedCheckEnabled: true })
    }),
    afterPublish: paid,
    chargeable: paid,
    switchOn: async () => true,
    objects: {
      put: async () => {
        calls.media++
        throw new Error('Unexpected media')
      }
    },
    fetchImpl: async () => {
      throw new Error('Unexpected network')
    },
    log: { warn() {}, error() {} },
    ...extra
  })
  return { ex, calls }
}

test('Dubai eligibility is bounded, authoritative by OSM identity, and excludes social URLs and inactive places', () => {
  const elements = [
    ...Array.from({ length: 60 }, (_, i) => raw(i + 1)),
    raw(1),
    raw(90, { amenity: 'cafe' }),
    raw(91, { disused: 'yes' }),
    raw(92, { website: 'https://instagram.com/fixture' }),
    { ...raw(93), lat: 0 }
  ]
  const seeds = selectDubaiSeeds({ elements }, real, new Date().toISOString())
  assert.equal(seeds.length, 50)
  assert.equal(new Set(seeds.map((s) => s.externalId)).size, 50)
  assert.ok(seeds.every((s) => !['node/90', 'node/91', 'node/92', 'node/93'].includes(s.externalId)))
})

test(
  'repeated seed import is idempotent; two ticks and a new scheduler cannot duplicate the queued child',
  opts,
  async () => {
    const { scheduler, reads } = await setup()
    await scheduler.create()
    assert.equal(reads(), 1)
    const a = await scheduler.tick()
    assert.ok(a.jobId)
    await db.pool.query('update wo_prefetch_campaign set next_tick_at=now()')
    const restarted = createDubaiPrefetch({ pool: db.pool, role: 'central' })
    const b = await restarted.tick()
    assert.equal(b.waiting, true)
    assert.equal((await one('select count(*)::int as n from wo_place_job')).n, 1)
    assert.equal((await scheduler.status()).campaign.tick_count, 2)
  }
)

test(
  'free prefetch uses two website pages, keeps original OSM age and creates no provider/ledger/media work',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const { ex, calls } = executor()
    const run = await ex.tick()
    await run.done
    const status = await scheduler.status(),
      seed = status.seeds[0]
    assert.equal(seed.state, 'completed')
    assert.equal(seed.enrichment_scope, 'prefetch')
    assert.equal(seed.profile.name, 'Synthetic restaurant 1')
    assert.equal(seed.profile.bio, 'Synthetic public bio')
    assert.equal(seed.socials.length, 1)
    assert.equal(seed.socials[0].verifiedBy, 'website')
    assert.equal(seed.sources.find((s) => s.source === 'website').coverage.fetched, 2)
    assert.equal(
      new Date(seed.sources.find((s) => s.source === 'osm').fetchedAt).toISOString(),
      seed.facts.fetchedAt
    )
    assert.deepEqual(calls, { website: 1, paid: 0, media: 0 })
    for (const table of ['wo_cost_ledger', 'wo_social_stat', 'wo_place_media'])
      assert.equal((await one(`select count(*)::int as n from ${table}`)).n, 0)
    assert.equal(snapshotFresh(await currentSnapshotOf(db.pool, seed.place_id), Date.now()), false)
    // Reading results does not enqueue a missing social profile.
    await scheduler.status()
    assert.equal((await one('select count(*)::int as n from wo_social_stat')).n, 0)
  }
)

test(
  'user work claims before older prefetch; one global prefetch slot is preserved across executors',
  opts,
  async () => {
    const { scheduler } = await setup()
    await scheduler.tick()
    const seeds = (await scheduler.status()).seeds
    const user = await join(seeds[1].place_id)
    const first = await claimPlaceJob(db.pool, 'user-worker', 60000, { kind: 'user' })
    assert.equal(first.id, user.job.id)
    const pref = await claimPlaceJob(db.pool, 'pref-worker', 60000, { kind: 'prefetch' })
    assert.ok(pref.prefetch_campaign_id)
    const third = (await one("insert into wo_place(display_name) values('third') returning id")).id
    await join(third, { prefetchCampaignId: 'dubai' })
    assert.equal(await claimPlaceJob(db.pool, 'other-pref-worker', 60000, { kind: 'prefetch' }), null)
  }
)

test(
  'queued promotion becomes full and survives stop; running promotion creates one durable user follow-up',
  opts,
  async () => {
    const { scheduler } = await setup()
    await scheduler.setConcurrency(2)
    await scheduler.tick()
    const seed = (await scheduler.status()).seeds[0]
    const promoted = await join(seed.place_id)
    assert.equal(promoted.job.id, seed.job_id)
    assert.equal(promoted.job.prefetch_campaign_id, 'dubai')
    assert.equal(promoted.job.work_priority, 0)
    await demand(promoted.job)
    await scheduler.setEnabled(false)
    assert.equal((await claimPlaceJob(db.pool, 'user', 60000, { kind: 'user' })).id, seed.job_id)
    await scheduler.setEnabled(true)
    await db.pool.query('update wo_prefetch_campaign set next_tick_at=now()')
    await scheduler.tick()
    const pref = await claimPlaceJob(db.pool, 'pref', 60000, { kind: 'prefetch' })
    const follow = await join(pref.place_id),
      again = await join(pref.place_id)
    assert.notEqual(follow.job.id, pref.id)
    assert.equal(follow.job.id, again.job.id)
    assert.equal(follow.job.prefetch_campaign_id, null)
    await scheduler.setEnabled(false)
    await finishPlaceJob(db.pool, placeLease(pref), { state: 'failed' })
    assert.equal((await claimPlaceJob(db.pool, 'user2', 60000, { kind: 'user' })).id, follow.job.id)
  }
)

test(
  'stop prevents claims and new admission; a running free request pauses at checkpoint and can resume',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    await scheduler.setEnabled(false)
    assert.equal(await claimPlaceJob(db.pool, 'stopped', 60000), null)
    assert.equal((await scheduler.tick()).ran, false)
    await scheduler.setEnabled(true)
    let release, reached
    const entered = new Promise((r) => {
        reached = r
      }),
      gate = new Promise((r) => {
        release = r
      })
    const { ex } = executor({
      collect: async () => {
        reached()
        await gate
        return { status: 'complete', profile: { name: 'Observed' }, coverage: { fetched: 1 } }
      }
    })
    const run = await ex.tick()
    await entered
    await scheduler.setEnabled(false)
    release()
    await run.done
    assert.equal((await one('select state from wo_place_job')).state, 'paused')
    await scheduler.setEnabled(true)
    assert.equal((await one('select state from wo_place_job')).state, 'queued')
  }
)

test(
  'restart recovers the same snapshot under a new lease; exhausted leases stop rather than loop',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const first = await claimPlaceJob(db.pool, 'before-restart', 1)
    await db.pool.query("update wo_place_job set lease_until=now()-interval '1 second'")
    const resumed = await claimPlaceJob(db.pool, 'after-restart', 1)
    assert.equal(first.id, resumed.id)
    assert.equal(first.snapshot_id, resumed.snapshot_id)
    await db.pool.query("update wo_place_job set attempt=3,lease_until=now()-interval '1 second'")
    assert.equal(await claimPlaceJob(db.pool, 'exhausted', 60000), null)
    await db.pool.query('update wo_prefetch_campaign set next_tick_at=now()')
    await scheduler.tick()
    assert.equal((await one('select state from wo_place_job')).state, 'failed')
  }
)

test(
  'late prefetch publication preserves a full snapshot and expired source receipts stop the campaign',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const pref = await claimPlaceJob(db.pool, 'pref', 60000)
    const full = await one(
      "insert into wo_place_snapshot(place_id,state,enrichment_scope,published_at) values($1,'published','full',now()) returning id",
      [pref.place_id]
    )
    await db.pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [pref.place_id, full.id])
    await finishPlaceJob(db.pool, placeLease(pref), { state: 'completed' })
    assert.equal(
      (await one('select current_snapshot_id from wo_place where id=$1', [pref.place_id]))
        .current_snapshot_id,
      full.id
    )
    assert.equal((await one('select state from wo_place_snapshot where id=$1', [full.id])).state, 'published')
    await db.pool.query(
      "update wo_prefetch_campaign set next_tick_at=now(),seed_source=jsonb_set(seed_source,'{fetchedAt}',to_jsonb((now()-interval '31 days')::text))"
    )
    assert.equal((await scheduler.tick()).reason, 'seed_expired')
    assert.equal((await scheduler.status()).campaign.enabled, false)
  }
)

test('client and standalone cannot seed, start, or tick the central campaign', opts, async () => {
  for (const role of ['client', 'standalone']) {
    const scheduler = createDubaiPrefetch({
      pool: db.pool,
      role,
      fetchImpl: async () => {
        throw new Error('Unexpected IO')
      }
    })
    await assert.rejects(scheduler.create(), /Central/)
    await assert.rejects(scheduler.setEnabled(true), /Central/)
    assert.equal((await scheduler.tick()).reason, 'central_only')
  }
})

test(
  'Ops requires a staff seat to read and owner/admin plus same Origin to write; reads do not trigger providers',
  opts,
  async () => {
    const { scheduler } = await setup()
    let role = 'admit',
      mutations = 0,
      mediaReads = 0
    const pool = {
      query: async (sql, params) =>
        /select sw.role/.test(sql) ? { rows: role ? [{ role }] : [] } : db.pool.query(sql, params)
    }
    const origin = 'https://fixture.example.test',
      secret = 'fixture-only-session-secret-at-least-32'
    const cookie = `${SESSION_COOKIE}=${await mintSession('fixture@example.test', secret)}`
    const app = woOpsRoutes({
      pool,
      config: { origin, sessionSecret: secret, woSocialRole: 'central' },
      prefetch: {
        media: async () => {
          mediaReads++
          return new Response('synthetic-image')
        },
        status: scheduler.status,
        setEnabled: async (value) => {
          mutations++
          return scheduler.setEnabled(value)
        }
      }
    })
    const request = (method, headers = {}, body) =>
      app.request(`${origin}/api/ops/wo/prefetch/dubai`, {
        method,
        headers: { cookie, ...headers },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    assert.equal((await request('GET')).status, 200)
    const mediaUrl = `${origin}/api/ops/wo/prefetch/dubai/places/place/media/image`
    assert.equal((await app.request(mediaUrl, { headers: { cookie } })).status, 200)
    assert.equal((await request('POST', { origin }, { action: 'stop' })).status, 403)
    role = 'admin'
    assert.equal((await request('POST', {}, { action: 'stop' })).status, 403)
    assert.equal((await request('POST', { origin }, { action: 'stop' })).status, 200)
    assert.equal(mutations, 1)
    role = null
    assert.equal((await request('GET')).status, 403)
    assert.equal((await app.request(mediaUrl, { headers: { cookie } })).status, 403)
    assert.equal(mediaReads, 1)
  }
)

test(
  'a free cron cannot resume a paused user job or reactivate its paid credential context',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    const seed = (await scheduler.status()).seeds[0]
    const user = await join(seed.place_id)
    await db.pool.query(
      'update wo_place_job set state=\'paused\',last_error=\'{"code":"SOURCE_PAUSED","reason":"budget"}\' where id=$1',
      [user.job.id]
    )
    const receipt = await scheduler.tick()
    assert.equal(receipt.jobId, user.job.id)
    const job = await one('select * from wo_place_job where id=$1', [user.job.id])
    assert.equal(job.state, 'paused')
    assert.equal(job.prefetch_campaign_id, null)
    assert.equal(job.last_error.reason, 'budget')
    const { ex, calls } = executor()
    assert.equal((await ex.tick()).claimed, null)
    assert.deepEqual(calls, { website: 0, paid: 0, media: 0 })
  }
)

test(
  'stop plus a dead worker cannot strand a user follow-up or allow late prefetch publication',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const held = await claimPlaceJob(db.pool, 'dead-prefetch', 60000)
    const user = await join(held.place_id)
    await scheduler.setEnabled(false)
    await db.pool.query("update wo_place_job set lease_until=now()-interval '1 second' where id=$1", [
      held.id
    ])
    const next = await claimPlaceJob(db.pool, 'user-after-restart', 60000, { kind: 'user' })
    assert.equal(next.id, user.job.id)
    assert.equal(await finishPlaceJob(db.pool, placeLease(held), { state: 'completed' }), false)
    await scheduler.setEnabled(true)
    assert.equal((await one('select state from wo_place_job where id=$1', [next.id])).state, 'running')
  }
)

test(
  'a user joining during publication uses the same place-before-job lock order without deadlocking',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const pref = await claimPlaceJob(db.pool, 'publishing', 60000)
    const joiner = await db.pool.connect()
    let releaseJoin, reachedFinish
    const joining = new Promise((r) => {
        releaseJoin = r
      }),
      finishing = new Promise((r) => {
        reachedFinish = r
      })
    await joiner.query('begin')
    await joiner.query("set local statement_timeout='2s'")
    await joiner.query('select 1 from wo_place where id=$1 for update', [pref.place_id])
    const finishPool = {
      connect: async () => {
        const client = await db.pool.connect()
        return {
          release: () => client.release(),
          query: async (sql, args) => {
            if (sql.includes('for no key update of p')) reachedFinish()
            return client.query(sql, args)
          }
        }
      }
    }
    const published = finishPlaceJob(finishPool, placeLease(pref), { state: 'completed' })
    await finishing
    releaseJoin()
    await joining
    const user = await joinPlace(joiner, pref.place_id)
    await joiner.query('commit')
    joiner.release()
    assert.equal(await published, true)
    assert.equal(user.job.prefetch_campaign_id, null)
    assert.equal((await one('select state from wo_place_job where id=$1', [user.job.id])).state, 'queued')
  }
)

test(
  'claiming a first snapshot can take its FK key-share while a concurrent join holds the place lock',
  opts,
  async () => {
    const { scheduler } = await setup([raw()])
    await scheduler.tick()
    const seed = (await scheduler.status()).seeds[0]
    const joiner = await db.pool.connect()
    await joiner.query('begin')
    await joiner.query('select 1 from wo_place where id=$1 for no key update', [seed.place_id])
    const boundedPool = {
      connect: async () => {
        const client = await db.pool.connect()
        await client.query("set statement_timeout='2s'")
        return {
          query: (sql, args) => client.query(sql, args),
          release: async () => {
            await client.query('reset statement_timeout')
            client.release()
          }
        }
      }
    }
    try {
      const claimed = await claimPlaceJob(boundedPool, 'claim-during-join', 60000)
      assert.equal(claimed.id, seed.job_id)
      assert.ok(claimed.snapshot_id)
      const user = await joinPlace(joiner, seed.place_id)
      assert.notEqual(user.job.id, claimed.id)
      await joiner.query('commit')
    } finally {
      await joiner.query('rollback')
      joiner.release()
    }
  }
)

test(
  'Google import passes DNS and transport through the real HTTP guard before accepting place facts',
  opts,
  async () => {
    const lookups = [],
      requests = []
    const scheduler = createDubaiPrefetch({
      pool: db.pool,
      role: 'central',
      loadDomain: async () => real,
      runtime: async () => ({ keys: { google: 'synthetic-key' } }),
      ledger: createCostLedger({
        pool: db.pool,
        caps: async () => ({ dailyCapCents: 100, jobCapCents: 15 })
      }),
      resolve: async (host) => {
        lookups.push(host)
        return [{ address: '93.184.216.34', family: 4 }]
      },
      fetchImpl: async (url, init) => {
        requests.push({ url, method: init.method })
        return Response.json({
          places: [
            {
              id: 'google-1',
              displayName: { text: 'Synthetic restaurant' },
              primaryType: 'restaurant',
              businessStatus: 'OPERATIONAL',
              websiteUri: 'https://fixture.example.test',
              location: { latitude: 25.198, longitude: 55.275 }
            }
          ]
        })
      }
    })
    assert.equal((await scheduler.create()).seeded, 1)
    assert.deepEqual(lookups, ['places.googleapis.com'])
    assert.deepEqual(requests, [
      { url: 'https://places.googleapis.com/v1/places:searchText', method: 'POST' }
    ])
  }
)

test(
  'unavailable seed sources persist a truthful blocker, prevent cron admission, and can be retried without fake proof',
  opts,
  async () => {
    let unavailable = true
    const scheduler = createDubaiPrefetch({
      pool: db.pool,
      role: 'central',
      discover: async () => {
        if (unavailable) throw Object.assign(new Error('Timed out'), { code: 'TIMEOUT' })
        const fetchedAt = new Date().toISOString()
        return {
          seeds: selectDubaiSeeds({ elements: [raw()] }, real, fetchedAt),
          source: {
            id: 'openstreetmap-overpass',
            fetchedAt,
            revision: createHash('sha256').update('fixture').digest('hex')
          }
        }
      }
    })
    assert.deepEqual(await scheduler.create(), { seeded: 0, sourceUnavailable: true })
    let status = await scheduler.status()
    assert.equal(status.campaign.enabled, false)
    assert.equal(status.seeds.length, 0)
    assert.equal(status.campaign.seed_source.revision, null)
    assert.equal(status.campaign.seed_source.fetchedAt, null)
    assert.match(status.campaign.last_error, /TIMEOUT/)
    assert.equal((await scheduler.setEnabled(true)).reason, 'verified_source_required')
    assert.equal((await scheduler.tick()).ran, false)
    assert.equal((await one('select count(*)::int as n from wo_place_job')).n, 0)
    unavailable = false
    assert.equal((await scheduler.create()).seeded, 1)
    status = await scheduler.status()
    assert.equal(status.seeds.length, 1)
    assert.equal(status.campaign.last_error, null)
    assert.match(status.campaign.seed_source.revision, /^[a-f0-9]{64}$/)
  }
)

test(
  'two expired leases after promotion and cancellation cannot block the background slot forever',
  opts,
  async () => {
    const { scheduler } = await setup()
    await scheduler.setConcurrency(2)
    await scheduler.tick()
    const first = await claimPlaceJob(db.pool, 'first', 60000, { kind: 'prefetch' })
    await join(first.place_id)
    // A running full job can remain user-admitted after the last request stops waiting.
    await db.pool.query("delete from wo_place_job where place_id=$1 and state='queued'", [first.place_id])
    await db.pool.query("update wo_place_job set research_mode='full',work_priority=0 where id=$1", [
      first.id
    ])
    await db.pool.query('update wo_prefetch_campaign set next_tick_at=now()')
    await scheduler.tick()
    const second = await claimPlaceJob(db.pool, 'second', 60000, { kind: 'prefetch' })
    assert.ok(second)
    await scheduler.setConcurrency(1)
    await db.pool.query(
      "update wo_place_job set lease_until=now()-interval '1 second' where id=any($1::uuid[])",
      [[first.id, second.id]]
    )
    const recovered = await claimPlaceJob(db.pool, 'restarted', 60000, { kind: 'prefetch' })
    assert.ok(recovered)
    assert.equal((await one("select count(*)::int as n from wo_place_job where state='running'")).n, 1)
    assert.equal(await claimPlaceJob(db.pool, 'another', 60000, { kind: 'prefetch' }), null)
  }
)
