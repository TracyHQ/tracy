import { resumeRequest } from 'website-opportunities/src/place-requests.js'
// Research shared across accounts (tasks/todo-wo-shared-research.md P1.7): a place is researched once for
// every account that saves it. One active place job per place; an account's Cancel stops its own request
// only; a worker that lost its lease publishes nothing; a failed refresh keeps the published snapshot; a
// brief pins the media it was made from; a URL a client sent never becomes a source of a Google place.
// The domain is the real subtree with its network-facing parts replaced; media bytes are a real PNG.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { normalizeWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { createChargeable, createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { createExecutor } from 'website-opportunities/src/executor.js'
import { createDubaiPrefetch } from 'website-opportunities/src/dubai-prefetch.js'
import { imageInfoWith } from 'website-opportunities/src/media-info.js'
import { cancelRequest, requestResearch } from 'website-opportunities/src/place-requests.js'
import { claimPlaceJob, finishPlaceJob, placeLease } from 'website-opportunities/src/place-jobs.js'
import { createRevision } from '../src/opportunities-build/revisions.js'
import { placeViewOf } from 'website-opportunities/src/place-view.js'
import { fenced, insertOpportunity } from 'website-opportunities/src/store.js'
import { buildPlaced } from '../src/opportunities-build/build-store.js'
import { fileDb, writeAsHistory } from './_db.mjs'
import { createTracyWoHost } from '../src/wo-host.js'

const woHost = createTracyWoHost()
const imageInfo = imageInfoWith(woHost)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PLACE_ID = 'ChIJsharedPho1'
const SITE = 'https://phoba.example/'
let PNG
let PNG2
before(async () => {
  const png = (r) =>
    sharp({ create: { width: 400, height: 300, channels: 3, background: { r, g: 40, b: 30 } } })
      .png()
      .toBuffer()
  PNG = new Uint8Array(await png(200))
  PNG2 = new Uint8Array(await png(20))
})

async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

/** An opportunity saved from a Google Places search result, as the create door saves it. */
async function saveGoogle(pool, accountId, extra = {}) {
  const candidate = { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Ba', socials: {}, ...extra }
  const { row } = await insertOpportunity(pool, accountId, {
    name: 'Pho Ba',
    branch: null,
    provider: 'google-places',
    providerId: PLACE_ID,
    candidate
  })
  return row
}

const websiteOk = (
  media = [{ url: 'https://phoba.example/pho.png', kind: 'image', caption: 'pho dish' }]
) => ({
  available: true,
  calls: 0,
  async collect(ref) {
    this.calls += 1
    this.refs = [...(this.refs ?? []), ref]
    return {
      source: 'website',
      status: 'complete',
      profile: { name: 'Pho Ba', bio: 'Noodles since 1990', phone: '+84 1', links: [] },
      pages: [{ url: ref, title: 'Pho Ba', text: 'Pho' }],
      media,
      coverage: { fetched: 1, total: 1 }
    }
  }
})
const blocked = () => ({
  available: false,
  reason: 'credential_missing',
  collect: async () => ({ status: 'blocked', media: [] })
})

/** The real domain: connectors replaced, Place Details answering `websiteUri`, every image a PNG. */
async function domainWith({ website = websiteOk(), details, fetchLimited } = {}) {
  const real = await websiteOpportunitiesDomain()
  const calls = { details: 0 }
  const domain = {
    ...real,
    connectorsFor: () => ({
      website,
      facebook: blocked(),
      instagram: blocked(),
      tiktok: blocked(),
      youtube: blocked()
    }),
    fetchPlaceDetails: async (placeId) => {
      calls.details += 1
      if (details) return details(placeId)
      return { id: placeId, websiteUri: SITE, servesDinner: true }
    },
    fetchLimited:
      fetchLimited ??
      (async (u) => ({
        url: u,
        status: 200,
        mime: 'image/png',
        bytes: u.endsWith('2.png') ? PNG2 : PNG,
        truncated: false
      }))
  }
  return { domain, calls, website }
}

function executor(pool, domain, extra = {}) {
  const put = new Map()
  const ex = createExecutor({
    host: woHost,
    pool,
    shared: true,
    loadDomain: async () => domain,
    runtime: async () => ({
      keys: { google: 'AIza-test', apify: null },
      settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
    }),
    objects: {
      put: async (key, bytes) => {
        put.set(key, bytes)
        return true
      }
    },
    switchOn: async () => true,
    imageInfo,
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
    fetchImpl: async () => {
      throw new Error('no network in tests')
    },
    log: { warn() {}, error() {}, log() {} },
    // Provider calls are tried once here, so each test counts its calls; the retry has its own tests below.
    providerRetry: { maxWaitMs: 0 },
    ...extra
  })
  return { ex, put }
}

const one = async (pool, sql, params) => (await pool.query(sql, params)).rows[0]
const jobRow = (pool, id) => one(pool, 'select * from wo_job where id = $1', [id])
/** Run every claimable job until none is left. */
async function drain(ex) {
  for (let i = 0; i < 20; i += 1) {
    const { claimed, done } = await ex.tick()
    if (!claimed) return
    await done
  }
}

test(
  'Dubai pre-runs the full customer Research stages and a later user receives its warm profile and photos',
  opts,
  async () => {
    const { pool } = db
    const website = websiteOk()
    const collect = website.collect.bind(website)
    website.collect = async (...args) => {
      const result = await collect(...args)
      result.pages[0].text = 'Synthetic restaurant menu and story. '.repeat(20)
      result.profile.links = ['https://www.instagram.com/synthetic.restaurant/']
      result.menus = [{ url: `${SITE}menu.pdf`, sourceUrl: SITE }]
      return result
    }
    const { domain, calls } = await domainWith({ website })
    const connectors = domain.connectorsFor
    let socialCalls = 0
    domain.connectorsFor = (keys) => ({
      ...connectors(keys),
      instagram: {
        available: true,
        collect: async () => {
          socialCalls++
          return {
            source: 'instagram',
            status: 'complete',
            posts: [{ id: 'synthetic-post', text: 'Fresh noodles', postedAt: '2026-10-19T12:00:00Z' }],
            media: [],
            profile: {},
            coverage: { fetched: 1 }
          }
        }
      }
    })
    const at = new Date().toISOString()
    const scheduler = createDubaiPrefetch({
      objects: { get: async (key) => (put.has(key) ? new Response(put.get(key)) : null) },
      pool,
      role: 'central',
      discover: async () => ({
        candidates: [
          {
            provider: 'google-places',
            providerId: PLACE_ID,
            name: 'Pho Ba',
            website: SITE,
            kind: 'restaurants',
            distanceM: 100
          }
        ],
        source: { id: 'google-places-text', fetchedAt: at, revision: 'synthetic-verified-source' }
      })
    })
    await scheduler.create()
    await scheduler.setEnabled(true)
    const scheduled = await scheduler.tick()
    const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 200 }) })
    const { ex, put } = executor(pool, domain, {
      prefetch: true,
      researchLedger: ledger,
      chargeable: createChargeable(ledger),
      runtime: async () => ({
        keys: { google: 'synthetic', apify: 'synthetic' },
        settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
      })
    })
    await drain(ex)
    const job = await one(pool, 'select * from wo_place_job where id=$1', [scheduled.jobId])
    assert.equal(job.state, 'completed')
    assert.equal(calls.details, 1)
    assert.equal(website.calls, 1)
    assert.equal(socialCalls, 1)
    assert.ok(put.size > 0, 'full Research stores the restaurant media')
    const snapshot = await one(pool, 'select * from wo_place_snapshot where id=$1', [job.snapshot_id])
    assert.equal(snapshot.enrichment_scope, 'full')
    assert.equal(snapshot.state, 'published')
    const a = await account(pool, 'warm@tracy.test')
    const opportunity = await saveGoogle(pool, a)
    const { job: request } = await requestResearch(pool, {
      accountId: a,
      opportunity,
      requestId: 'warm-dubai'
    })
    assert.equal(request.result_snapshot_id, job.snapshot_id)
    assert.equal(request.state, 'completed')
    assert.equal((await one(pool, 'select count(*)::int as n from wo_place_job')).n, 1)
    const status = await scheduler.status()
    assert.ok(status.seeds[0].profile.bio)
    assert.ok(status.seeds[0].media_count > 0)
    const image = status.seeds[0].images[0]
    assert.ok(image)
    const response = await scheduler.media(status.seeds[0].place_id, image.id)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal((await response.arrayBuffer()).byteLength, PNG.byteLength)
    assert.equal(await scheduler.media('00000000-0000-4000-8000-000000000000', image.id), null)
    await pool.query('update wo_place_media set revoked_at=now() where id=$1', [image.id])
    assert.equal(await scheduler.media(status.seeds[0].place_id, image.id), null)
    const refreshed = await requestResearch(pool, {
      accountId: a,
      opportunity,
      requestId: 'user-refresh-after-dubai',
      force: true
    })
    await drain(ex)
    const newSnapshot = (await jobRow(pool, refreshed.job.id)).result_snapshot_id
    assert.notEqual(newSnapshot, job.snapshot_id)
    const latest = (await scheduler.status()).seeds[0]
    assert.equal(
      latest.snapshot_id,
      newSnapshot,
      'profile, sources and gallery use the current published version'
    )
    assert.ok(!latest.images.some((m) => m.id === image.id), 'revoked photos stay absent after refresh')
    assert.ok(status.controls.providerCostCents > 0)
  }
)

test(
  'two accounts, one Google place: ONE place job; the second request waits and gets the same snapshot',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const b = await account(pool, 'b@tracy.test')
    const oppA = await saveGoogle(pool, a)
    const oppB = await saveGoogle(pool, b)
    assert.ok(oppA.place_id, 'the create path resolves the Google place')
    assert.equal(oppA.place_id, oppB.place_id, 'one place for both accounts')

    const { job: reqA } = await requestResearch(pool, {
      accountId: a,
      opportunity: oppA,
      requestId: 'req-a-0001'
    })
    const { job: reqB } = await requestResearch(pool, {
      accountId: b,
      opportunity: oppB,
      requestId: 'req-b-0001'
    })
    assert.ok(reqA.place_job_id)
    assert.equal(reqB.place_job_id, reqA.place_job_id, 'the second request joins the running research')
    assert.equal(
      (await one(pool, `select count(*)::int as n from wo_place_job where state in ('queued', 'running')`)).n,
      1
    )

    const { domain, calls, website } = await domainWith()
    await drain(executor(pool, domain).ex)
    const doneA = await jobRow(pool, reqA.id)
    const doneB = await jobRow(pool, reqB.id)
    assert.equal(doneA.state, 'completed', JSON.stringify(doneA.last_error))
    assert.equal(doneB.state, 'completed')
    assert.ok(doneA.result_snapshot_id)
    assert.equal(doneB.result_snapshot_id, doneA.result_snapshot_id)
    assert.equal(calls.details, 1, 'one Place Details call for both accounts')
    assert.equal(website.calls, 1, 'the website is crawled once')
    assert.deepEqual(website.refs, ['https://phoba.example/'], 'from the websiteUri Google gave')
    const place = await one(pool, 'select * from wo_place where id = $1', [oppA.place_id])
    assert.equal(place.current_snapshot_id, doneA.result_snapshot_id)

    // A third request while the place is fresh is answered at once, no job.
    const c = await account(pool, 'c@tracy.test')
    const oppC = await saveGoogle(pool, c)
    const { job: reqC } = await requestResearch(pool, {
      accountId: c,
      opportunity: oppC,
      requestId: 'req-c-0001'
    })
    assert.equal(reqC.state, 'completed')
    assert.equal(reqC.result_snapshot_id, doneA.result_snapshot_id)
    assert.equal((await one(pool, 'select count(*)::int as n from wo_place_job')).n, 1)
  }
)

test(
  'cancel from one account stops its own request only; the place job goes on for the other',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const b = await account(pool, 'b@tracy.test')
    const oppA = await saveGoogle(pool, a)
    const oppB = await saveGoogle(pool, b)
    const { job: reqA } = await requestResearch(pool, {
      accountId: a,
      opportunity: oppA,
      requestId: 'req-a-0001'
    })
    const { job: reqB } = await requestResearch(pool, {
      accountId: b,
      opportunity: oppB,
      requestId: 'req-b-0001'
    })

    assert.equal((await cancelRequest(pool, a, reqA.id)).state, 'cancelled')
    assert.equal(await cancelRequest(pool, b, reqA.id), null, "another account cannot cancel A's request")
    const placeJob = await one(pool, 'select * from wo_place_job where id = $1', [reqA.place_job_id])
    assert.equal(placeJob.state, 'queued', 'B still waits on it')

    const { domain } = await domainWith()
    await drain(executor(pool, domain).ex)
    assert.equal(
      (await jobRow(pool, reqA.id)).state,
      'cancelled',
      'a cancelled request is not answered later'
    )
    assert.equal((await jobRow(pool, reqA.id)).result_snapshot_id, null)
    const doneB = await jobRow(pool, reqB.id)
    assert.equal(doneB.state, 'completed')
    assert.ok(doneB.result_snapshot_id)

    // The last request cancelled: nobody asks any more, so the place job stops too (its token moves).
    const { job: again } = await requestResearch(pool, {
      accountId: b,
      opportunity: oppB,
      requestId: 'req-b-0002',
      force: true
    })
    const queued = await one(pool, 'select * from wo_place_job where id = $1', [again.place_job_id])
    await cancelRequest(pool, b, again.id)
    const stopped = await one(pool, 'select * from wo_place_job where id = $1', [again.place_job_id])
    assert.equal(stopped.state, 'cancelled')
    assert.equal(Number(stopped.lease_token), Number(queued.lease_token) + 1)
  }
)

test(
  'a worker whose lease was taken publishes nothing: the snapshot stays preparing, current unchanged',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const opp = await saveGoogle(pool, a)
    const { job: req } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'req-a-0001'
    })
    const first = await claimPlaceJob(pool, 'worker-1', 60_000)
    assert.equal((await jobRow(pool, req.id)).state, 'running', 'the request mirrors the claim')
    // worker-1 stalls past its lease; worker-2 takes the job over.
    await pool.query(`update wo_place_job set lease_until = now() - interval '1 second' where id = $1`, [
      first.id
    ])
    const second = await claimPlaceJob(pool, 'worker-2', 60_000)
    assert.equal(second.id, first.id)
    assert.equal(second.snapshot_id, first.snapshot_id, 'the take-over continues the same snapshot')

    const stale = placeLease(first)
    await assert.rejects(
      fenced(pool, stale, (db) => db.query('select 1')),
      (e) => e.code === 'STALE_LEASE'
    )
    assert.equal(await finishPlaceJob(pool, stale, { state: 'completed' }), false)
    const snapshot = await one(pool, 'select * from wo_place_snapshot where id = $1', [first.snapshot_id])
    assert.equal(snapshot.state, 'preparing')
    assert.equal(
      (await one(pool, 'select * from wo_place where id = $1', [opp.place_id])).current_snapshot_id,
      null
    )
    assert.equal((await jobRow(pool, req.id)).state, 'running', 'the stale worker answered no request')

    // The worker holding the lease publishes.
    assert.equal(await finishPlaceJob(pool, placeLease(second), { state: 'completed' }), true)
    assert.equal(
      (await one(pool, 'select * from wo_place where id = $1', [opp.place_id])).current_snapshot_id,
      first.snapshot_id
    )
    assert.equal((await jobRow(pool, req.id)).result_snapshot_id, first.snapshot_id)
  }
)

/** Make every source of a snapshot look collected (and tried) `days` ago. */
const age = (pool, snapshotId, days) =>
  pool.query(
    `update wo_place_snapshot_source set collected_at = collected_at - ($2 * interval '1 day'),
       attempted_at = attempted_at - ($2 * interval '1 day') where snapshot_id = $1`,
    [snapshotId, days]
  )

test(
  'a failed refresh keeps the published snapshot; freshness is per source, from its last success',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const opp = await saveGoogle(pool, a)
    const { domain } = await domainWith()
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'req-a-0001' })
    await drain(executor(pool, domain).ex)
    const first = (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [opp.place_id]))
      .current_snapshot_id
    const firstWebsite = await one(
      pool,
      `select * from wo_place_snapshot_source where snapshot_id = $1 and source = 'website'`,
      [first]
    )
    assert.equal(firstWebsite.status, 'complete')

    // 31 days on, a refresh whose run fails: the place still shows the first snapshot.
    await age(pool, first, 31)
    const { job: failing } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'req-a-0002'
    })
    assert.ok(failing.place_job_id, 'a stale place is researched again')
    const broken = {
      ...domain,
      brandFromSocial: () => {
        throw new Error('brand reader broke')
      }
    }
    await drain(executor(pool, broken).ex)
    const failed = await jobRow(pool, failing.id)
    assert.equal(failed.state, 'failed')
    assert.equal(failed.result_snapshot_id, null)
    const place = await one(pool, 'select * from wo_place where id = $1', [opp.place_id])
    assert.equal(place.current_snapshot_id, first, 'the good snapshot stays current')
    assert.equal(
      (await one(pool, 'select state from wo_place_snapshot where id = $1', [first])).state,
      'published'
    )
    const failedRun = await one(pool, 'select * from wo_place_job where id = $1', [failing.place_job_id])
    assert.equal(
      (await one(pool, 'select state from wo_place_snapshot where id = $1', [failedRun.snapshot_id])).state,
      'failed'
    )

    // A refresh where the website does not answer but Google does: published, the website keeps its last success.
    const { domain: down } = await domainWith({
      website: { available: true, collect: async () => ({ status: 'failed', reason: 'error', media: [] }) }
    })
    const { job: refresh } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'req-a-0003'
    })
    await drain(executor(pool, down).ex)
    const done = await jobRow(pool, refresh.id)
    assert.equal(done.state, 'completed', JSON.stringify(done.last_error))
    assert.notEqual(done.result_snapshot_id, first)
    const sources = Object.fromEntries(
      (
        await pool.query('select * from wo_place_snapshot_source where snapshot_id = $1', [
          done.result_snapshot_id
        ])
      ).rows.map((r) => [r.source, r])
    )
    assert.equal(sources.website.status, 'complete', 'the data of the last success is kept')
    assert.deepEqual(sources.website.collected.pages, firstWebsite.collected.pages)
    assert.ok(
      sources.website.collected_at < sources['google-places'].collected_at,
      'the website is as old as its last success, Google is fresh'
    )
    assert.equal(sources.website.last_error.status, 'failed')
    assert.equal(
      (await one(pool, 'select state from wo_place_snapshot where id = $1', [first])).state,
      'superseded'
    )
  }
)

const TEMPLATES = {
  cards: [
    {
      id: 'ja-restaurant',
      label: 'JA Restaurant',
      platforms: [{ platform: 'joomla', tag: 'ja-restaurant/j6', version: '2.0.1' }]
    }
  ]
}

test(
  'a warm Google seed supplies public contact evidence without a client echo or cross-account overlay',
  opts,
  async () => {
    const { pool } = db
    const firstAccount = await account(pool, 'warm-minimal@tracy.test')
    const privateAccount = await account(pool, 'warm-overlay@tracy.test')
    const laterAccount = await account(pool, 'warm-later@tracy.test')
    const minimal = await saveGoogle(pool, firstAccount, { website: undefined })
    const privateOpp = await saveGoogle(pool, privateAccount, {
      website: undefined,
      phone: '+999 private',
      address: 'Private account address'
    })
    const later = await saveGoogle(pool, laterAccount, { website: undefined })
    const snapshot = await one(
      pool,
      "insert into wo_place_snapshot(place_id,state,enrichment_scope,published_at) values($1,'preparing','full',now()) returning *",
      [minimal.place_id]
    )
    const seed = {
      externalId: PLACE_ID,
      name: 'Pho Ba',
      phone: '+000 public seed',
      address: 'Observed public street',
      fetchedAt: '2026-10-20T12:00:00.000Z'
    }
    await pool.query(
      `insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected,collected_at,attempted_at)
     values($1,'google-places-search',$2,'complete',$3,now(),now()),
       ($1,'website',$4,'complete',$5,now(),now())`,
      [
        snapshot.id,
        PLACE_ID,
        seed,
        SITE,
        {
          profile: { name: 'Website spelling', phone: '+111 website', bio: 'Observed website bio', links: [] }
        }
      ]
    )
    await pool.query('insert into wo_place_snapshot_profile(snapshot_id,profile) values($1,$2)', [
      snapshot.id,
      { name: seed.name, phone: seed.phone, address: seed.address, bio: 'Observed website bio' }
    ])
    Object.assign(
      snapshot,
      await one(pool, "update wo_place_snapshot set state='published' where id=$1 returning *", [snapshot.id])
    )
    await pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [
      minimal.place_id,
      snapshot.id
    ])
    const before = await one(pool, 'select * from wo_place_snapshot_profile where snapshot_id=$1', [
      snapshot.id
    ])
    const publicView = await placeViewOf(pool, minimal)
    assert.equal(publicView.profile.name, seed.name)
    assert.equal(publicView.profile.phone, seed.phone)
    assert.equal(publicView.profile.address, seed.address)
    assert.equal(publicView.profile.provenance.phone.source, 'google-places')
    assert.equal(publicView.profile.provenance.address.source, 'google-places')
    assert.ok(publicView.profile.evidence.phone.some((item) => item.value === '+111 website'))
    assert.ok(publicView.profile.conflicts.includes('name'))
    assert.ok(publicView.profile.conflicts.includes('phone'))
    const privateView = await placeViewOf(pool, privateOpp)
    assert.equal(privateView.profile.phone, '+999 private')
    assert.equal(privateView.profile.address, 'Private account address')
    assert.ok(privateView.profile.evidence.phone.some((item) => item.value === seed.phone))
    const laterView = await placeViewOf(pool, later)
    assert.equal(laterView.profile.phone, seed.phone)
    assert.equal(laterView.profile.address, seed.address)
    assert.equal(JSON.stringify(laterView).includes('Private account address'), false)
    assert.deepEqual(
      await one(pool, 'select * from wo_place_snapshot_profile where snapshot_id=$1', [snapshot.id]),
      before
    )
    assert.deepEqual(await one(pool, 'select * from wo_place_snapshot where id=$1', [snapshot.id]), snapshot)
    const { domain } = await domainWith()
    const made = await createRevision(pool, {
      accountId: laterAccount,
      opportunityId: later.id,
      domain,
      templates: TEMPLATES
    })
    assert.ok(made.revision, JSON.stringify(made.errors))
    assert.equal(made.revision.place_snapshot_id, snapshot.id)
    assert.equal(made.revision.profile_effective.phone, seed.phone)
    assert.equal(made.revision.profile_effective.address, seed.address)

    for (const [ref, externalId, status] of [
      [PLACE_ID, 'ChIJmismatched', 'complete'],
      ['ChIJunbound', 'ChIJunbound', 'complete'],
      [PLACE_ID, PLACE_ID, 'partial']
    ]) {
      // Stands in for seeds that do not bind this place (published sources are immutable, schema 0004).
      await writeAsHistory(
        pool,
        "update wo_place_snapshot_source set ref=$2,collected=$3,status=$4 where snapshot_id=$1 and source='google-places-search'",
        [snapshot.id, ref, { ...seed, externalId }, status]
      )
      const refused = await placeViewOf(pool, later)
      assert.equal(refused.profile.phone, '+111 website')
      assert.equal(refused.profile.address, null)
      assert.equal(
        refused.profile.evidence.phone.some((item) => item.value === seed.phone),
        false
      )
    }
    await writeAsHistory(
      pool,
      "update wo_place_snapshot_source set ref=$2,collected=$3,status='complete' where snapshot_id=$1 and source='google-places-search'",
      [snapshot.id, PLACE_ID, seed]
    )
    await pool.query("delete from wo_place_identity where place_id=$1 and namespace='google'", [
      minimal.place_id
    ])
    const unbound = await placeViewOf(pool, later)
    assert.equal(unbound.profile.phone, '+111 website')
    assert.equal(unbound.profile.address, null)
  }
)

test('a brief of a researched place makes its content from the posts the place collected', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'a@tracy.test')
  const opp = await saveGoogle(pool, a)
  const caption =
    'A good morning starts here. Our Eggs Benedict has become a firm favourite since its recent menu introduction, with poached eggs and ham on a proper English muffin.'
  const postedAt = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const website = websiteOk()
  const collect = website.collect
  website.collect = async function (ref) {
    return { ...(await collect.call(this, ref)), posts: [{ id: 'p1', url: `${SITE}p1`, caption, postedAt }] }
  }
  const { domain } = await domainWith({ website })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'req-a-0001' })
  await drain(executor(pool, domain).ex)
  assert.equal(
    (await one(pool, 'select count(*)::int as n from wo_source where opportunity_id = $1', [opp.id])).n,
    0,
    "the posts are the place snapshot's, not a per-account row"
  )
  const made = await createRevision(pool, {
    accountId: a,
    opportunityId: opp.id,
    domain,
    templates: TEMPLATES
  })
  assert.ok(made.revision, JSON.stringify(made.errors))
  const items = made.revision.brief.content.items
  assert.equal(items.length, 1)
  assert.deepEqual(items[0].posts[0], {
    source: 'website',
    id: 'p1',
    url: `${SITE}p1`,
    publishedAt: postedAt
  })
})

test(
  'a brief made before a refresh still builds the same media after it: the manifest pins id and sha256',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const opp = await saveGoogle(pool, a, { phone: '+84 999' })
    const { domain } = await domainWith()
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'req-a-0001' })
    await drain(executor(pool, domain).ex)
    const first = (
      await one(pool, 'select current_snapshot_id as id from wo_place where id = $1', [opp.place_id])
    ).id

    const made = await createRevision(pool, {
      accountId: a,
      opportunityId: opp.id,
      domain,
      templates: TEMPLATES
    })
    assert.ok(made.revision, JSON.stringify(made.errors))
    const revision = made.revision
    assert.equal(revision.place_snapshot_id, first)
    assert.equal(revision.asset_manifest.length, 1)
    const [pinned] = revision.asset_manifest
    assert.equal(pinned.origin, 'place')
    assert.match(pinned.sha256, /^[0-9a-f]{64}$/)
    assert.equal(revision.profile_effective.website, SITE, "the place's website, from Google")
    assert.equal(
      revision.profile_effective.phone,
      '+84 999',
      "the account's own overlay is in the brief's profile"
    )

    // The place is refreshed with other pictures; the old brief builds exactly what it was made with.
    await age(pool, first, 31)
    const { domain: later } = await domainWith({
      website: websiteOk([{ url: 'https://phoba.example/pho2.png', kind: 'image', caption: 'new dish' }])
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'req-a-0002' })
    await drain(executor(pool, later).ex)
    const second = (
      await one(pool, 'select current_snapshot_id as id from wo_place where id = $1', [opp.place_id])
    ).id
    assert.notEqual(second, first)
    const placed = await buildPlaced(pool, a, revision)
    assert.deepEqual(
      placed.map((m) => [m.id, m.sha256]),
      [[pinned.id, pinned.sha256]]
    )
    assert.equal(placed[0].mime, 'image/png')
    const next = await createRevision(pool, {
      accountId: a,
      opportunityId: opp.id,
      domain,
      templates: TEMPLATES
    })
    assert.equal(next.revision.place_snapshot_id, second)
    assert.equal(next.revision.asset_manifest.length, 2, 'a new brief sees the refreshed snapshot')

    // A place media row is never rewritten in place, nor deleted; only revoked.
    await assert.rejects(pool.query(`update wo_place_media set sha256 = 'x' where id = $1`, [pinned.id]))
    await assert.rejects(pool.query('delete from wo_place_media where id = $1', [pinned.id]))
    await pool.query(`update wo_place_media set revoked_at = now(), revoke_reason = 'legal' where id = $1`, [
      pinned.id
    ])
    assert.deepEqual(await buildPlaced(pool, a, revision), [], 'revoked media is never built again')
    // Another account's revision cannot reach it through this one's manifest.
    const b = await account(pool, 'b@tracy.test')
    assert.deepEqual(await buildPlaced(pool, b, { ...revision, account_id: b, asset_manifest: [] }), [])
  }
)

test(
  "poisoning: a fake website or social in a client's candidate never becomes a source of the shared place",
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const b = await account(pool, 'b@tracy.test')
    const EVIL = 'https://evil.example/'
    const oppA = await saveGoogle(pool, a, {
      website: EVIL,
      socials: { instagram: 'https://www.instagram.com/evil/' }
    })
    const oppB = await saveGoogle(pool, b)
    const { domain, website } = await domainWith()
    const { job: reqA } = await requestResearch(pool, {
      accountId: a,
      opportunity: oppA,
      requestId: 'req-a-0001'
    })
    await drain(executor(pool, domain).ex)

    const links = (
      await pool.query('select kind, url, verified_by from wo_place_link where place_id = $1', [
        oppA.place_id
      ])
    ).rows
    assert.deepEqual(links, [{ kind: 'website', url: SITE, verified_by: 'google' }], 'only what Google said')
    const snapshotId = (await jobRow(pool, reqA.id)).result_snapshot_id
    const shared = (
      await pool.query('select source, ref from wo_place_snapshot_source where snapshot_id = $1', [
        snapshotId
      ])
    ).rows
    assert.ok(!shared.some((s) => /evil/.test(s.ref ?? '')), JSON.stringify(shared))

    // A's own pages are researched for A alone, after the place's answer.
    const doneA = await jobRow(pool, reqA.id)
    assert.equal(doneA.state, 'completed', JSON.stringify(doneA.last_error))
    assert.deepEqual(website.refs, [SITE, 'https://evil.example/'], 'the place once, then A privately')
    const own = (
      await pool.query(
        'select source, ref, status from wo_source where opportunity_id = $1 order by source',
        [oppA.id]
      )
    ).rows
    assert.deepEqual(
      own.map((r) => [r.source, r.ref]),
      [
        ['instagram', 'https://www.instagram.com/evil'],
        ['website', 'https://evil.example/']
      ]
    )
    const viewA = await placeViewOf(pool, oppA)
    assert.ok(
      viewA.sources.some((s) => s.ref === EVIL && s.shared === false),
      'A still sees the page it named'
    )
    assert.equal(viewA.profile.website, SITE, "the place's own website wins in A's profile")

    // B, on the same place, gets the shared answer at once and none of A's pages.
    const { job: reqB } = await requestResearch(pool, {
      accountId: b,
      opportunity: oppB,
      requestId: 'req-b-0001'
    })
    assert.equal(reqB.state, 'completed')
    const viewB = await placeViewOf(pool, oppB)
    assert.ok(!JSON.stringify(viewB).includes('evil.example'))
  }
)

const ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const BASE = '/api/website-opportunities'

/** The app's doors over this file's database, the switch on; `env` adds or overrides variables. */
async function doors(pool, domain, env = {}) {
  const config = readConfig({ ...ENV, ...env })
  const objects = {
    get: async () => new Response(PNG, { status: 200 }),
    publicUrl: async () => null,
    put: async () => true
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: async () => Response.json({ templates: TEMPLATES.cards }),
    websiteOpportunitiesObjects: objects,
    fetchImpl: async () => Response.json({ code: 'NO_NETWORK' }, { status: 500 })
  })
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, '{"website-opportunities": true}'::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`
  )
  const call = async (email, method, path, body) => {
    const headers = {
      origin: ENV.TRACY_ORIGIN,
      cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${ENV.TRACY_ORIGIN}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed }
  }
  return { app, call }
}

const CANDIDATE = { provider: 'google-places', providerId: PLACE_ID, name: 'Pho Ba', socials: {} }

test(
  'doors: research, list, detail and media read through the place; a revoked picture is withdrawn',
  opts,
  async () => {
    const { pool } = db
    const { domain } = await domainWith()
    const { call } = await doors(pool, domain)
    const oppA = (await call('a@tracy.test', 'POST', BASE, { candidate: CANDIDATE })).body.opportunity
    const oppB = (await call('b@tracy.test', 'POST', BASE, { candidate: CANDIDATE })).body.opportunity
    const ra = await call('a@tracy.test', 'POST', `${BASE}/${oppA.id}/research`, { requestId: 'req-a-0001' })
    const rb = await call('b@tracy.test', 'POST', `${BASE}/${oppB.id}/research`, { requestId: 'req-b-0001' })
    assert.equal(ra.status, 202)
    assert.equal(rb.status, 202)
    assert.ok(ra.body.job.placeJobId)
    assert.equal(rb.body.job.placeJobId, ra.body.job.placeJobId)
    const again = await call('a@tracy.test', 'POST', `${BASE}/${oppA.id}/research`, {
      requestId: 'req-a-0002'
    })
    assert.equal(again.status, 409)
    assert.equal(again.body.code, 'JOB_ACTIVE')
    assert.equal(
      (
        await call('a@tracy.test', 'POST', `${BASE}/${oppA.id}/research`, {
          requestId: 'req-a-0003',
          force: 'yes'
        })
      ).body.code,
      'JOB_ACTIVE',
      'an active request is refused before the body is read further'
    )

    await drain(executor(pool, domain).ex)
    // The list polled by id reads the request the place job answered.
    const listed = await call('b@tracy.test', 'GET', `${BASE}?ids=${oppB.id}`)
    assert.equal(listed.body.opportunities[0].stage, 'demo')
    assert.equal(listed.body.opportunities[0].job.state, 'completed')
    assert.ok(listed.body.opportunities[0].job.resultSnapshotId)

    const detail = (await call('b@tracy.test', 'GET', `${BASE}/${oppB.id}`)).body
    assert.ok(detail.place.snapshotId)
    assert.equal(detail.sources.find((s) => s.source === 'website').ref, SITE)
    assert.equal(detail.sources.find((s) => s.source === 'website').shared, true)
    assert.equal(detail.profile.phone, '+84 1', "the place's public profile")
    assert.equal(detail.media.length, 1)
    assert.equal(detail.media[0].origin, 'place')
    const mediaId = detail.media[0].id

    const read = await call('a@tracy.test', 'GET', `${BASE}/media/${mediaId}`)
    assert.equal(read.status, 200, 'any account with an opportunity of the place reads its pictures')
    const stranger = await call('c@tracy.test', 'GET', `${BASE}/media/${mediaId}`)
    assert.equal(stranger.status, 404)
    assert.equal(stranger.body.code, 'NOT_FOUND')
    await pool.query(`update wo_place_media set revoked_at = now(), revoke_reason = 'legal' where id = $1`, [
      mediaId
    ])
    const withdrawn = await call('a@tracy.test', 'GET', `${BASE}/media/${mediaId}`)
    assert.equal(withdrawn.status, 404)
    assert.equal(withdrawn.body.reason, 'revoked')
    assert.equal((await call('a@tracy.test', 'GET', `${BASE}/${oppA.id}`)).body.media.length, 0)

    // Cancel and resume from the list's doors act on the account's own request.
    const forced = await call('a@tracy.test', 'POST', `${BASE}/${oppA.id}/research`, {
      requestId: 'req-a-0004',
      force: true
    })
    assert.equal(forced.status, 202)
    assert.equal(forced.body.job.state, 'queued', 'force skips the freshness check')
    const cancel = await call('a@tracy.test', 'POST', `${BASE}/jobs/${forced.body.job.id}/cancel`)
    assert.equal(cancel.body.job.state, 'cancelled')
    const resumed = await call('a@tracy.test', 'POST', `${BASE}/jobs/${forced.body.job.id}/resume`)
    assert.equal(resumed.status, 200)
    assert.equal(resumed.body.job.state, 'completed', 'resume joins what the place needs now: it is fresh')
  }
)

test(
  'WO_SHARED_RESEARCH=0: a new request runs the per-account research; place jobs are not claimed',
  opts,
  async () => {
    const { pool } = db
    const { domain } = await domainWith()
    const { call } = await doors(pool, domain, { WO_SHARED_RESEARCH: '0' })
    const opp = (await call('a@tracy.test', 'POST', BASE, { candidate: CANDIDATE })).body.opportunity
    const res = await call('a@tracy.test', 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-a-0001' })
    assert.equal(res.status, 202)
    assert.equal(res.body.job.placeJobId, null)
    const b = await account(pool, 'b@tracy.test')
    const other = await saveGoogle(pool, b)
    await requestResearch(pool, { accountId: b, opportunity: other, requestId: 'req-b-0001' })
    await drain(executor(pool, domain, { shared: false }).ex)
    assert.equal((await jobRow(pool, res.body.job.id)).state, 'completed', 'the per-account job ran')
    const own = await one(pool, 'select profile from wo_profile where opportunity_id = $1', [opp.id])
    assert.equal(own.profile.googlePlace.placeId, PLACE_ID, 'into the per-account rows, as before')
    assert.equal(
      (await one(pool, 'select state from wo_place_job limit 1')).state,
      'queued',
      'with the switch off no worker takes a place job'
    )
  }
)

test(
  "a paid call over Tracy's research cap pauses the place job with 'budget'; what it reserved is in the ledger",
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const opp = await saveGoogle(pool, a)
    const { job: req } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'req-a-0001'
    })
    const instagram = { available: true, calls: 0, collect: async () => ({ status: 'complete', media: [] }) }
    const { domain } = await domainWith({
      website: {
        available: true,
        collect: async (ref) => ({
          status: 'complete',
          profile: { name: 'Pho Ba', links: ['https://www.instagram.com/phoba/'] },
          pages: [{ url: ref, title: 'Pho Ba', text: 'Pho' }],
          media: [],
          coverage: { fetched: 1 }
        })
      }
    })
    const paid = { ...domain, connectorsFor: () => ({ ...domain.connectorsFor(), instagram }) }
    // A social connector reserves each provider call through deps.charge (`domain/social-profile.mjs`).
    instagram.collect = async (ref, o, deps) =>
      deps.charge(
        { provider: 'apify', operation: 'apify~instagram-scraper', source: 'instagram', cursor: null },
        async () => {
          instagram.calls += 1
          return { status: 'complete', media: [], coverage: { fetched: 0 } }
        }
      )
    // 10¢ a day: Place Details (3¢) fits, an Instagram run held at its 25¢ ceiling does not.
    const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 10, jobCapCents: 10 }) })
    const { ex } = executor(pool, paid, {
      chargeable: createChargeable(ledger),
      runtime: async () => ({
        keys: { google: 'AIza-test', apify: 'apify-test' },
        settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
      })
    })
    await drain(ex)
    const placeJob = await one(pool, 'select * from wo_place_job where id = $1', [req.place_job_id])
    assert.equal(placeJob.state, 'paused')
    assert.deepEqual(placeJob.last_error, { code: 'SOURCE_PAUSED', source: 'instagram', reason: 'budget' })
    assert.equal(instagram.calls, 0, 'the paid call never went out')
    assert.equal((await jobRow(pool, req.id)).state, 'paused', 'the request says so too')
    const rows = (await pool.query('select provider, operation, state, place_id, job_id from wo_cost_ledger'))
      .rows
    assert.deepEqual(rows, [
      {
        provider: 'google',
        operation: 'place-details',
        state: 'settled',
        place_id: opp.place_id,
        job_id: placeJob.id
      }
    ])
  }
)

test(
  'abuse limit: an account sends at most newPlacesPerAccountPerDay never-researched places; a known one is free',
  opts,
  async () => {
    const { pool } = db
    const { domain } = await domainWith()
    const { call } = await doors(pool, domain)
    await pool.query(
      `insert into wo_ops_setting (id, settings, updated_by) values (true, '{"newPlacesPerAccountPerDay": 1}'::jsonb, 'test')`
    )
    const make = async (email, providerId) =>
      (await call(email, 'POST', BASE, { candidate: { ...CANDIDATE, providerId } })).body.opportunity
    const first = await make('a@tracy.test', 'ChIJnewOne')
    const second = await make('a@tracy.test', 'ChIJnewTwo')
    assert.equal(
      (await call('a@tracy.test', 'POST', `${BASE}/${first.id}/research`, { requestId: 'req-a-0001' }))
        .status,
      202
    )
    const refused = await call('a@tracy.test', 'POST', `${BASE}/${second.id}/research`, {
      requestId: 'req-a-0002'
    })
    assert.equal(refused.status, 429)
    assert.equal(refused.body.code, 'NEW_PLACES_LIMIT')
    assert.equal(
      (await one(pool, 'select count(*)::int as n from wo_job where request_id = $1', ['req-a-0002'])).n,
      0
    )
    // B spends its one new place on its own; joining the place A sent costs B nothing.
    const bJoin = await make('b@tracy.test', 'ChIJnewOne')
    const bNew = await make('b@tracy.test', 'ChIJnewTwo')
    assert.equal(
      (await call('b@tracy.test', 'POST', `${BASE}/${bJoin.id}/research`, { requestId: 'req-b-0001' }))
        .status,
      202
    )
    assert.equal(
      (await call('b@tracy.test', 'POST', `${BASE}/${bNew.id}/research`, { requestId: 'req-b-0002' })).status,
      202
    )
  }
)

// B8 remainder (ai-flow audit 19/10/2026): a place job reclaimed after a restart during a paid Apify run reads the
// run its dead holder recorded, and reserves nothing for it again (the first reservation still counts).
test(
  'a restart during a place job’s paid Apify run: the next holder reads the recorded run, one reservation',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'a@tracy.test')
    const opp = await saveGoogle(pool, a)
    const { job: req } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'req-a-0001'
    })
    const started = []
    const read = []
    const instagram = (dies) => ({
      available: true,
      collect: async (ref, o, deps) =>
        deps.charge(
          { provider: 'apify', operation: 'apify~instagram-scraper', source: 'instagram', cursor: null },
          async () => {
            if (o.run) {
              read.push(o.run.id)
              return { status: 'complete', posts: [{ id: 'p1' }], media: [], coverage: { fetched: 1 } }
            }
            const run = { source: 'instagram', offset: 0, id: `run-${started.length + 1}`, datasetId: 'ds-1' }
            started.push(run.id)
            await deps.onRun(run)
            if (dies) return new Promise(() => {}) // the process restarts here, mid-run
            return { status: 'complete', media: [], coverage: { fetched: 0 } }
          }
        )
    })
    const website = {
      available: true,
      collect: async (ref) => ({
        status: 'complete',
        profile: { name: 'Pho Ba', links: ['https://www.instagram.com/phoba/'] },
        pages: [{ url: ref, title: 'Pho Ba', text: 'Pho' }],
        media: [],
        coverage: { fetched: 1 }
      })
    }
    const { domain } = await domainWith({ website })
    const withInstagram = (dies) => ({
      ...domain,
      connectorsFor: () => ({ ...domain.connectorsFor(), instagram: instagram(dies) })
    })
    const ledger = createCostLedger({
      pool,
      caps: async () => ({ dailyCapCents: 10_000, jobCapCents: 10_000 })
    })
    const extra = {
      chargeable: createChargeable(ledger),
      runtime: async () => ({
        keys: { google: 'AIza-test', apify: 'apify-test' },
        settings: normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })
      })
    }
    const first = executor(pool, withInstagram(true), { ...extra, heartbeatMs: 3_600_000 })
    void first.ex.tick()
    const placeJob = () => one(pool, 'select * from wo_place_job where id = $1', [req.place_job_id])
    for (let i = 0; i < 300 && !(await placeJob()).progress?.apifyRun; i += 1)
      await new Promise((r) => setTimeout(r, 10))
    assert.equal((await placeJob()).progress.apifyRun?.id, 'run-1')
    await pool.query(`update wo_place_job set lease_until = now() - interval '1 second' where id = $1`, [
      req.place_job_id
    ])

    const second = executor(pool, withInstagram(false), extra)
    await drain(second.ex)
    assert.deepEqual(started, ['run-1'], 'one paid run, not two')
    assert.deepEqual(read, ['run-1'])
    const done = await placeJob()
    assert.equal(done.state, 'completed')
    assert.equal(done.progress.apifyRun, null)
    const apify = (await pool.query(`select state from wo_cost_ledger where provider = 'apify'`)).rows
    assert.equal(apify.length, 1, 'the run is reserved once, by the holder that started it')
  }
)

test(
  'a warm Google seed supplies public contact evidence without a client echo or cross-account overlay',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "alter table wo_place_snapshot add column if not exists enrichment_scope text not null default 'full' check (enrichment_scope in ('full','prefetch'))"
    )
    const firstAccount = await account(pool, 'warm-minimal@tracy.test')
    const privateAccount = await account(pool, 'warm-overlay@tracy.test')
    const laterAccount = await account(pool, 'warm-later@tracy.test')
    const minimal = await saveGoogle(pool, firstAccount, { website: undefined })
    const privateOpp = await saveGoogle(pool, privateAccount, {
      website: undefined,
      phone: '+999 private',
      address: 'Private account address'
    })
    const later = await saveGoogle(pool, laterAccount, { website: undefined })
    const snapshot = await one(
      pool,
      "insert into wo_place_snapshot(place_id,state,enrichment_scope,published_at) values($1,'preparing','full',now()) returning *",
      [minimal.place_id]
    )
    const seed = {
      externalId: PLACE_ID,
      name: 'Pho Ba',
      phone: '+000 public seed',
      address: 'Observed public street',
      fetchedAt: '2026-10-20T12:00:00.000Z'
    }
    await pool.query(
      `insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected,collected_at,attempted_at)
     values($1,'google-places-search',$2,'complete',$3,now(),now()),
       ($1,'website',$4,'complete',$5,now(),now())`,
      [
        snapshot.id,
        PLACE_ID,
        seed,
        SITE,
        {
          profile: { name: 'Website spelling', phone: '+111 website', bio: 'Observed website bio', links: [] }
        }
      ]
    )
    await pool.query('insert into wo_place_snapshot_profile(snapshot_id,profile) values($1,$2)', [
      snapshot.id,
      { name: seed.name, phone: seed.phone, address: seed.address, bio: 'Observed website bio' }
    ])
    Object.assign(
      snapshot,
      await one(pool, "update wo_place_snapshot set state='published' where id=$1 returning *", [snapshot.id])
    )
    await pool.query('update wo_place set current_snapshot_id=$2 where id=$1', [
      minimal.place_id,
      snapshot.id
    ])
    const before = await one(pool, 'select * from wo_place_snapshot_profile where snapshot_id=$1', [
      snapshot.id
    ])
    const publicView = await placeViewOf(pool, minimal)
    assert.equal(publicView.profile.name, seed.name)
    assert.equal(publicView.profile.phone, seed.phone)
    assert.equal(publicView.profile.address, seed.address)
    assert.equal(publicView.profile.provenance.phone.source, 'google-places')
    assert.equal(publicView.profile.provenance.address.source, 'google-places')
    assert.ok(publicView.profile.evidence.phone.some((item) => item.value === '+111 website'))
    assert.ok(publicView.profile.conflicts.includes('name'))
    assert.ok(publicView.profile.conflicts.includes('phone'))
    const privateView = await placeViewOf(pool, privateOpp)
    assert.equal(privateView.profile.phone, '+999 private')
    assert.equal(privateView.profile.address, 'Private account address')
    assert.ok(privateView.profile.evidence.phone.some((item) => item.value === seed.phone))
    const laterView = await placeViewOf(pool, later)
    assert.equal(laterView.profile.phone, seed.phone)
    assert.equal(laterView.profile.address, seed.address)
    assert.equal(JSON.stringify(laterView).includes('Private account address'), false)
    assert.deepEqual(
      await one(pool, 'select * from wo_place_snapshot_profile where snapshot_id=$1', [snapshot.id]),
      before
    )
    assert.deepEqual(await one(pool, 'select * from wo_place_snapshot where id=$1', [snapshot.id]), snapshot)
    const { domain } = await domainWith()
    const made = await createRevision(pool, {
      accountId: laterAccount,
      opportunityId: later.id,
      domain,
      templates: TEMPLATES
    })
    assert.ok(made.revision, JSON.stringify(made.errors))
    assert.equal(made.revision.place_snapshot_id, snapshot.id)
    assert.equal(made.revision.profile_effective.phone, seed.phone)
    assert.equal(made.revision.profile_effective.address, seed.address)

    for (const [ref, externalId, status] of [
      [PLACE_ID, 'ChIJmismatched', 'complete'],
      ['ChIJunbound', 'ChIJunbound', 'complete'],
      [PLACE_ID, PLACE_ID, 'partial']
    ]) {
      // Stands in for seeds that do not bind this place (published sources are immutable, schema 0004).
      await writeAsHistory(
        pool,
        "update wo_place_snapshot_source set ref=$2,collected=$3,status=$4 where snapshot_id=$1 and source='google-places-search'",
        [snapshot.id, ref, { ...seed, externalId }, status]
      )
      const refused = await placeViewOf(pool, later)
      assert.equal(refused.profile.phone, '+111 website')
      assert.equal(refused.profile.address, null)
      assert.equal(
        refused.profile.evidence.phone.some((item) => item.value === seed.phone),
        false
      )
    }
    await writeAsHistory(
      pool,
      "update wo_place_snapshot_source set ref=$2,collected=$3,status='complete' where snapshot_id=$1 and source='google-places-search'",
      [snapshot.id, PLACE_ID, seed]
    )
    await pool.query("delete from wo_place_identity where place_id=$1 and namespace='google'", [
      minimal.place_id
    ])
    const unbound = await placeViewOf(pool, later)
    assert.equal(unbound.profile.phone, '+111 website')
    assert.equal(unbound.profile.address, null)
  }
)

test(
  'a user joins the running full campaign job; cancellation preserves campaign demand and Stop blocks further stages',
  opts,
  async () => {
    const { pool } = db
    let entered, release
    const started = new Promise((r) => {
      entered = r
    })
    const barrier = new Promise((r) => {
      release = r
    })
    const { domain, calls, website } = await domainWith({
      details: async () => {
        entered()
        await barrier
        return { id: PLACE_ID, websiteUri: SITE }
      }
    })
    const a = await account(pool, 'joined-dubai@tracy.test')
    const opportunity = await saveGoogle(pool, a)
    const at = new Date().toISOString()
    const scheduler = createDubaiPrefetch({
      pool,
      role: 'central',
      discover: async () => ({
        candidates: [
          {
            provider: 'google-places',
            providerId: PLACE_ID,
            name: 'Pho Ba',
            website: SITE,
            kind: 'restaurants',
            distanceM: 100
          }
        ],
        source: { id: 'google-places-text', fetchedAt: at, revision: 'synthetic-verified-source' }
      })
    })
    await scheduler.create()
    await scheduler.setEnabled(true)
    const queued = await scheduler.tick()
    const ledger = createCostLedger({ pool, caps: async () => ({ dailyCapCents: 1000, jobCapCents: 200 }) })
    const { ex } = executor(pool, domain, {
      prefetch: true,
      researchLedger: ledger,
      chargeable: createChargeable(ledger)
    })
    const running = await ex.tick()
    await started
    const { job: request } = await requestResearch(pool, {
      accountId: a,
      opportunity,
      requestId: 'join-full-dubai'
    })
    assert.equal(request.place_job_id, queued.jobId)
    await cancelRequest(pool, a, request.id)
    assert.equal(
      (await one(pool, 'select state from wo_place_job where id=$1', [queued.jobId])).state,
      'running'
    )
    await scheduler.setEnabled(false)
    release()
    await running.done
    assert.equal(
      (await one(pool, 'select state from wo_place_job where id=$1', [queued.jobId])).state,
      'paused'
    )
    assert.equal(website.calls, 0)
    await scheduler.setEnabled(true)
    await drain(ex)
    assert.equal(
      (await one(pool, 'select state from wo_place_job where id=$1', [queued.jobId])).state,
      'completed'
    )
    assert.equal(calls.details, 1)
    assert.equal(website.calls, 1)
  }
)

// Litescrape is an additive source of the same shared place job, not a social collector.
const TA_FACTS = {
  name: 'Pho Ba',
  address: '12 River Road',
  phone: '+84123456789',
  lat: 10,
  lon: 106,
  website: SITE
}

const TA_PLACE = {
  place_id: '12345',
  title: TA_FACTS.name,
  address: TA_FACTS.address,
  phone: TA_FACTS.phone,
  website: SITE,
  gps_coordinates: { latitude: 10, longitude: 106 },
  link: 'https://www.tripadvisor.com/Restaurant_Review-d12345.html',
  rating: 4.5,
  reviews: 45,
  images: []
}

const taSettings = () => normalizeWoOpsSettings({ pageSpeedCheckEnabled: false, googlePlacesPhotos: false })

async function taExecutor(
  pool,
  {
    failure = false,
    cap = 100,
    hook = null,
    keys = true,
    primaryFailure = null,
    primaryEmpty = false,
    primaryScenario = null,
    fallbackId = '12345',
    serpFailure = null,
    // {op: status}: that SerpApi call fails once with the status (Retry-After 1), then answers.
    serpFailOnce = null,
    providerRetry = undefined,
    serpEmpty = false,
    serpPhotosMissing = false,
    serpReviewCount = 1,
    facts = TA_FACTS,
    taPlace = TA_PLACE,
    settings = {}
  } = {}
) {
  const calls = []
  const queries = []
  const { domain, calls: domainCalls } = await domainWith({
    website: blocked(),
    details: async () => ({ id: PLACE_ID, displayName: { text: facts.name }, websiteUri: facts.website }),
    fetchLimited: async (url) =>
      new URL(url).hostname.endsWith('tripadvisor.com')
        ? { status: 200, bytes: url.includes('gallery') ? PNG2 : PNG }
        : {
            status: 200,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                id: PLACE_ID,
                displayName: { text: facts.name },
                formattedAddress: facts.address,
                internationalPhoneNumber: facts.phone,
                location: { latitude: facts.lat, longitude: facts.lon },
                websiteUri: facts.website
              })
            )
          }
  })
  const ledger = createCostLedger({
    pool,
    caps: async () => ({
      dailyCapCents: typeof cap === 'object' ? cap.value : cap,
      jobCapCents: typeof cap === 'object' ? cap.value : cap
    })
  })
  const runtime = async () => ({
    keys: {
      google: 'test-google',
      ...(typeof keys === 'object' ? keys : keys ? { litescrape: 'test-private' } : {})
    },
    settings: { ...taSettings(), googleMapsMenu: false, ...settings }
  })
  const once = { ...serpFailOnce }
  const { ex } = executor(pool, domain, {
    ...(providerRetry ? { providerRetry } : {}),
    runtime,
    chargeable: createChargeable(ledger),
    apiFetch: async (url) => {
      const parsed = new URL(url)
      const op =
        parsed.hostname === 'serpapi.com'
          ? `serpapi-${{ tripadvisor: 'search', tripadvisor_place: 'place', tripadvisor_reviews: 'reviews' }[parsed.searchParams.get('engine')]}`
          : parsed.pathname.split('/').at(-1)
      calls.push(op)
      if (parsed.searchParams.has('q')) queries.push(parsed.searchParams.get('q'))
      if (hook) await hook(op)
      if (parsed.hostname === 'serpapi.com' && once[op]) {
        const status = once[op]
        delete once[op]
        return new Response('{}', { status, headers: { 'retry-after': '1' } })
      }
      if (parsed.hostname === 'serpapi.com') {
        const status = typeof serpFailure === 'object' && serpFailure ? serpFailure[op] : serpFailure
        if (status) return new Response('{}', { status })
        const base = {
          search_metadata: { status: 'Success', tripadvisor_place_url: taPlace.link },
          search_parameters: { place_id: taPlace.place_id }
        }
        if (op === 'serpapi-search')
          return Response.json({
            ...base,
            places: serpEmpty ? [] : [{ ...taPlace, location: taPlace.market }]
          })
        if (op === 'serpapi-place')
          return Response.json({
            ...base,
            place_result: {
              name: taPlace.title,
              address: taPlace.address,
              phone: taPlace.phone,
              website: taPlace.website,
              address_link: `https://maps.google.com/maps?daddr=River@${taPlace.gps_coordinates.latitude},${taPlace.gps_coordinates.longitude}`,
              ...(serpPhotosMissing
                ? {}
                : { images: ['https://media-cdn.tripadvisor.com/media/photo-o/01/gallery.jpg'] })
            }
          })
        return Response.json({
          ...base,
          reviews: Array.from({ length: serpReviewCount }, (_, index) => ({
            review_id: String(98765 + index),
            snippet: 'Wonderful pho with friendly service.',
            rating: 5,
            date: '2026-10-20',
            link: `https://www.tripadvisor.com/ShowUserReviews-d${taPlace.place_id}-r98765.html`,
            author: {
              display_name: 'Lan',
              link: 'https://www.tripadvisor.com/Profile/Lan',
              avatar: 'https://media-cdn.tripadvisor.com/media/photo-o/01/avatar.jpg'
            },
            images: ['https://media-cdn.tripadvisor.com/media/photo-o/01/review.jpg']
          }))
        })
      }
      if (new URL(url).hostname === 'tripadvisor-api1.p.rapidapi.com') {
        if (primaryFailure === 'network') throw new Error('private-network-detail')
        if (primaryScenario === 'reviews-quota' && op === 'reviews_byid')
          return new Response('{}', { status: 429 })
        if (primaryFailure === 'application')
          return new Response(
            JSON.stringify({
              message: '500: typeahead error: PersistedQueryNotFound',
              source: 'tripadvisor.com',
              searchResults: []
            })
          )
        if (primaryFailure) return new Response('{}', { status: primaryFailure })
        if (primaryEmpty)
          return new Response(
            JSON.stringify({ message: 'Success', source: 'tripadvisor.com', searchResults: [] })
          )
        const item = {
          locationId: 12345,
          name: TA_FACTS.name,
          latitude: 10,
          longitude: 106,
          officialUrl: SITE,
          tripadvisorUrl: TA_PLACE.link,
          address: facts.address,
          phone: facts.phone,
          photos: []
        }
        if (primaryScenario === 'insufficient') {
          delete item.phone
          delete item.address
        }
        if (primaryScenario === 'contradiction') item.phone = '+84999999999'
        return new Response(
          JSON.stringify({
            message: 'Success',
            source: 'tripadvisor.com',
            ...(op === 'autocomplete'
              ? { searchResults: [item] }
              : op === 'details_byid'
                ? { detail: item }
                : {
                    reviews: [
                      {
                        reviewId: 98765,
                        locationId: 12345,
                        text: 'Wonderful pho with friendly service.',
                        author: 'Lan',
                        rating: 5,
                        publishedDate: '1 month ago'
                      }
                    ]
                  })
          })
        )
      }
      if (failure) return new Response('provider unavailable', { status: 503 })
      return new Response(
        JSON.stringify(
          op === 'search'
            ? { search_results: [{ ...TA_PLACE, place_id: fallbackId }] }
            : op === 'place'
              ? { place_results: { ...TA_PLACE, place_id: fallbackId } }
              : {
                  reviews: [
                    {
                      id: '98765',
                      text: 'Wonderful pho with friendly service.',
                      user: { name: 'Lan' },
                      rating: 5,
                      published_date: '2026-10-20',
                      language: 'en'
                    }
                  ]
                }
        )
      )
    }
  })
  return { ex, calls, domain, runtime, domainCalls, queries }
}

test(
  'TripAdvisor enriches a previously fresh snapshot once, is shared and reaches profile and brief without replacing Google',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-a@tracy.test')
    const opp = await saveGoogle(pool, a, { name: 'Poisoned client name', address: 'Poisoned branch' })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-old' })
    const first = await taExecutor(pool, { keys: false })
    await drain(first.ex)
    assert.equal(first.calls.length, 0)
    const held = (await pool.query('select current_snapshot_id from wo_place where id = $1', [opp.place_id]))
      .rows[0]
    const { reviewSourcesRequired } = await import('website-opportunities/src/tripadvisor-research.js')
    const runner = await taExecutor(pool)
    const requiredSources = reviewSourcesRequired(await runner.runtime())
    const { job } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'ta-new',
      requiredSources
    })
    assert.equal(job.state, 'queued')
    await drain(runner.ex)
    assert.deepEqual(runner.calls, ['search', 'place', 'reviews'])
    const view = await placeViewOf(pool, opp)
    assert.notEqual(view.snapshot.id, held.current_snapshot_id)
    assert.equal(view.profile.googlePlace.placeId, PLACE_ID)
    assert.equal(view.profile.reviewSources.tripadvisor.reviews[0].author, 'Lan')
    assert.equal(view.profile.reviewSources.tripadvisor.match.status, 'matched')
    assert.equal(view.profile.socials.tripadvisor, undefined)
    const reviewSource = view.sources.find((s) => s.source === 'tripadvisor')
    assert.equal(reviewSource.status, 'complete')
    assert.equal(reviewSource.ref, TA_PLACE.link)
    assert.equal(reviewSource.coverage.fetched, 1)
    const identity = await one(pool, "select * from wo_place_identity where namespace = 'tripadvisor'")
    assert.equal(identity.place_id, opp.place_id)
    const { job: cached } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'ta-cache',
      requiredSources
    })
    assert.equal(cached.state, 'completed')
    await drain(runner.ex)
    assert.equal(runner.calls.length, 3, 'cached Research sends no Litescrape calls')
    const costs = (
      await pool.query(
        "select operation, state from wo_cost_ledger where provider = 'litescrape' order by created_at"
      )
    ).rows
    assert.deepEqual(
      costs.map((r) => [r.operation, r.state]),
      [
        ['search', 'settled'],
        ['place', 'settled'],
        ['reviews', 'settled']
      ]
    )
    const rev = await createRevision(pool, {
      accountId: a,
      opportunityId: opp.id,
      domain: runner.domain,
      templates: TEMPLATES,
      now: Date.now
    })
    assert.ok(rev.revision, JSON.stringify(rev))
    assert.equal(rev.revision.brief.reviewSources.tripadvisor.reviews[0].author, 'Lan')
    assert.ok(rev.revision.brief_md.includes('TripAdvisor'))
  }
)

test(
  'TripAdvisor identity collision is recorded without merging places or fetching reviews',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-collision@tracy.test')
    const opp = await saveGoogle(pool, a)
    const other = (
      await pool.query("insert into wo_place (display_name) values ('Other branch') returning id")
    ).rows[0].id
    await pool.query(
      "insert into wo_place_identity (namespace, external_id, place_id, source) values ('tripadvisor', '12345', $1, 'litescrape')",
      [other]
    )
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-collision' })
    const runner = await taExecutor(pool)
    await drain(runner.ex)
    assert.deepEqual(runner.calls, ['search', 'place'])
    const source = await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")
    assert.equal(source.reason, 'identity_conflict')
    assert.equal(
      (await one(pool, 'select merged_into from wo_place where id = $1', [opp.place_id])).merged_into,
      null
    )
  }
)

test(
  'TripAdvisor failure preserves successful reviews and budget refusal pauses without a provider call',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-errors@tracy.test')
    const opp = await saveGoogle(pool, a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-good' })
    await drain((await taExecutor(pool)).ex)
    const good = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-refresh', force: true })
    const broken = await taExecutor(pool, { failure: true })
    await drain(broken.ex)
    assert.deepEqual((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor, good)
    assert.deepEqual(broken.calls, ['place'])
    const source = await one(
      pool,
      "select s.* from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id = s.snapshot_id where s.source = 'tripadvisor'"
    )
    assert.equal(source.last_error.reason, 'HTTP_503')
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-budget', force: true })
    const capped = await taExecutor(pool, { cap: 0 })
    await drain(capped.ex)
    assert.deepEqual(capped.calls, [])
    const job = await one(pool, "select * from wo_place_job where state = 'paused'")
    assert.equal(job.last_error.reason, 'budget')
  }
)

test('TripAdvisor response after cancellation cannot publish or leave an identity', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-cancel@tracy.test')
  const opp = await saveGoogle(pool, a)
  const { job } = await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-cancel' })
  const runner = await taExecutor(pool, { hook: async () => cancelRequest(pool, a, job.id) })
  await drain(runner.ex)
  assert.deepEqual(runner.calls, ['search'])
  assert.equal(
    (await one(pool, 'select current_snapshot_id from wo_place where id = $1', [opp.place_id]))
      .current_snapshot_id,
    null
  )
  assert.equal(
    (await one(pool, "select count(*)::int as n from wo_place_identity where namespace = 'tripadvisor'")).n,
    0
  )
})

test('TripAdvisor paused budget resumes its persisted search without paying for it twice', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-resume@tracy.test')
  const opp = await saveGoogle(pool, a)
  const { job: request } = await requestResearch(pool, {
    accountId: a,
    opportunity: opp,
    requestId: 'ta-resume-1'
  })
  const cap = { value: 7 }
  const runner = await taExecutor(pool, { cap })
  await drain(runner.ex)
  assert.deepEqual(runner.calls, ['search'])
  const stopped = await one(pool, "select * from wo_place_job where state = 'paused'")
  assert.equal(stopped.last_error.source, 'tripadvisor')
  assert.equal(stopped.stage, 'collection')
  cap.value = 20
  await resumeRequest(pool, a, request.id, { shared: true })
  await drain(runner.ex)
  assert.deepEqual(runner.calls, ['search', 'place', 'reviews'])
  assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.reviews.length, 1)
  const charged = await one(
    pool,
    "select count(*)::int as n from wo_cost_ledger where provider = 'litescrape' and operation = 'search'"
  )
  assert.equal(charged.n, 1)
})

test(
  'OneAPI primary success does not call Litescrape and charges each actual primary attempt',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-primary@tracy.test')
    const opp = await saveGoogle(pool, a)
    const h = await taExecutor(pool, {
      keys: { rapidapi: 'primary-private', litescrape: 'fallback-private' }
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'oneapi-test' })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['autocomplete', 'details_byid', 'reviews_byid'])
    const source = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
    assert.equal(source.provider, 'rapidapi')
    assert.equal(source.reviews[0].date, '1 month ago')
    const rows = (
      await pool.query(
        "select provider, operation, state from wo_cost_ledger where provider in ('rapidapi','litescrape') order by created_at"
      )
    ).rows
    assert.deepEqual(
      rows.map((r) => [r.provider, r.operation, r.state]),
      ['search', 'place', 'reviews'].map((op) => ['rapidapi', `tripadvisor-${op}`, 'settled'])
    )
  }
)

for (const failure of [401, 402, 403, 429, 503, 'application']) {
  test(`OneAPI failure ${failure} falls back once with separate provider accounting`, opts, async () => {
    const { pool } = db
    const a = await account(pool, `tripadvisor-fallback-${failure}@tracy.test`)
    const opp = await saveGoogle(pool, a)
    const h = await taExecutor(pool, {
      keys: { rapidapi: 'primary-private', litescrape: 'fallback-private' },
      primaryFailure: failure
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'oneapi-test' })
    await drain(h.ex)
    assert.deepEqual(
      h.calls,
      [503, 'application'].includes(failure)
        ? ['autocomplete', 'search', 'place', 'reviews_byid', 'reviews', 'details_byid']
        : ['autocomplete', 'search', 'place', 'reviews']
    )
    assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.provider, 'litescrape')
    const rows = (
      await pool.query(
        "select provider, state from wo_cost_ledger where provider in ('rapidapi','litescrape') order by created_at"
      )
    ).rows
    assert.equal(rows.length, h.calls.length)
    assert.equal(rows.filter((r) => r.provider === 'litescrape' && r.state === 'settled').length, 3)
    assert.ok(rows.filter((r) => r.provider === 'rapidapi').every((r) => r.state === 'unreconciled'))
  })
}

test('OneAPI legitimate empty search does not spend fallback quota', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-empty@tracy.test')
  const opp = await saveGoogle(pool, a)
  const h = await taExecutor(pool, {
    keys: { rapidapi: 'primary-private', litescrape: 'fallback-private' },
    primaryEmpty: true
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'oneapi-test' })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['autocomplete'])
  assert.equal(
    (await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")).last_error
      ?.reason,
    'not_found'
  )
})

test('budget refusal between failed primary and fallback pauses before fallback network', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-fallback-budget@tracy.test')
  const opp = await saveGoogle(pool, a)
  const h = await taExecutor(pool, {
    keys: { rapidapi: 'primary-private', litescrape: 'fallback-private' },
    primaryFailure: 429,
    cap: 7
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'oneapi-test' })
  await drain(h.ex)
  const job = await one(pool, 'select * from wo_place_job')
  assert.equal(job.state, 'paused')
  assert.deepEqual(h.calls, ['autocomplete'])
})

test(
  'missing OneAPI branch evidence uses an optional same-brand website association without fallback',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-insufficient@tracy.test')
    const opp = await saveGoogle(pool, a)
    const h = await taExecutor(pool, {
      keys: { rapidapi: 'primary', litescrape: 'fallback' },
      primaryScenario: 'insufficient'
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'insufficient' })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['autocomplete', 'details_byid', 'reviews_byid'])
    const source = await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")
    assert.equal(
      source.collected.provider,
      'rapidapi',
      'reviews still prefer the primary provider on the verified fallback ID'
    )
    assert.ok(source.collected.match.scope === 'brand' && source.collected.match.branchVerified === false)
    assert.equal(
      (await one(pool, "select count(*)::int n from wo_place_identity where namespace='tripadvisor'")).n,
      0
    )
  }
)

test(
  'OneAPI conflicting branch phone keeps a same-brand review source without creating branch identity',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-contradiction@tracy.test')
    const opp = await saveGoogle(pool, a)
    const h = await taExecutor(pool, {
      keys: { rapidapi: 'primary', litescrape: 'fallback' },
      primaryScenario: 'contradiction'
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'contradiction' })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['autocomplete', 'details_byid', 'reviews_byid'])
    const source = await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")
    assert.equal(source.collected.match.scope, 'brand')
    assert.equal(source.collected.match.branchVerified, false)
    assert.equal(
      (await one(pool, "select count(*)::int n from wo_place_identity where namespace='tripadvisor'")).n,
      0
    )
  }
)

test('fallback cannot replace a primary matched identity when its review call fails', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-pinned@tracy.test')
  const opp = await saveGoogle(pool, a)
  const h = await taExecutor(pool, {
    keys: { rapidapi: 'primary', litescrape: 'fallback' },
    primaryScenario: 'reviews-quota',
    fallbackId: '45678'
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'pinned' })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['autocomplete', 'details_byid', 'reviews_byid', 'reviews'])
  const source = await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")
  assert.equal(source.collected.placeId, '12345')
  assert.equal(source.collected.reviews.length, 1)
  assert.equal(
    source.coverage.components.photos.provider,
    'rapidapi',
    'reuse the successful pinned details, without a different branch search'
  )
  assert.deepEqual(
    (await pool.query("select external_id from wo_place_identity where namespace = 'tripadvisor'")).rows,
    [{ external_id: '12345' }]
  )
})

test('unknown primary outcome is not paid twice after budget pauses the fallback', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-unknown@tracy.test')
  const opp = await saveGoogle(pool, a)
  const cap = { value: 7 }
  const h = await taExecutor(pool, {
    keys: { rapidapi: 'primary', litescrape: 'fallback' },
    primaryFailure: 'network',
    cap
  })
  const { job } = await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'unknown' })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['autocomplete'])
  const source = await one(pool, "select * from wo_place_snapshot_source where source = 'tripadvisor'")
  assert.equal(source.coverage.pipeline['rapidapi:search'].state, 'sent')
  cap.value = 20
  await resumeRequest(pool, a, job.id, { shared: true })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['autocomplete', 'search', 'place', 'reviews_byid', 'reviews', 'details_byid'])
  assert.equal(
    (
      await one(
        pool,
        "select count(*)::int as n from wo_cost_ledger where provider = 'rapidapi' and operation = 'tripadvisor-search'"
      )
    ).n,
    1
  )
  assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.provider, 'litescrape')
})

test('refresh cannot remap an existing TripAdvisor source or mix another branch reviews', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-refresh-pin@tracy.test')
  const opp = await saveGoogle(pool, a)
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'before-refresh' })
  const first = await taExecutor(pool)
  await drain(first.ex)
  const old = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'after-refresh', force: true })
  const second = await taExecutor(pool, { fallbackId: '45678' })
  await drain(second.ex)
  assert.deepEqual(second.calls, ['place'])
  assert.deepEqual((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor, old)
  assert.equal(
    (
      await one(
        pool,
        "select s.* from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id = s.snapshot_id where source = 'tripadvisor'"
      )
    ).last_error.reason,
    'INVALID_RESPONSE'
  )
})

test(
  'new research retries a recovered provider instead of inheriting the previous job failure checkpoint',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-recovery@tracy.test')
    const opp = await saveGoogle(pool, a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'failure' })
    const first = await taExecutor(pool, { keys: { rapidapi: 'primary' }, primaryFailure: 503 })
    await drain(first.ex)
    assert.deepEqual(first.calls, ['autocomplete'])
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'recovery', force: true })
    const second = await taExecutor(pool, { keys: { rapidapi: 'primary' } })
    await drain(second.ex)
    assert.deepEqual(second.calls, ['autocomplete', 'details_byid', 'reviews_byid'])
    assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.provider, 'rapidapi')
  }
)

test(
  'customer Details omits optional provider failures and keeps previous reviews after refresh quota failure',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'tripadvisor-customer-visible@tracy.test')
    const opp = await saveGoogle(pool, a)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'quota' })
    const failed = await taExecutor(pool, { keys: { rapidapi: 'primary' }, primaryFailure: 402 })
    await drain(failed.ex)
    assert.equal(
      (await placeViewOf(pool, opp)).sources.some((s) => s.source === 'tripadvisor'),
      false
    )
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'success', force: true })
    const success = await taExecutor(pool)
    await drain(success.ex)
    const prior = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'refresh', force: true })
    const refreshed = await taExecutor(pool, { keys: { rapidapi: 'primary' }, primaryFailure: 429 })
    await drain(refreshed.ex)
    const current = await placeViewOf(pool, opp)
    assert.deepEqual(current.profile.reviewSources.tripadvisor, prior)
    const source = current.sources.find((s) => s.source === 'tripadvisor')
    assert.equal(source.status, 'complete')
    assert.equal(source.reason, null)
    assert.equal(source.coverage.fetched, 1)
    assert.equal(source.lastError, undefined)
    const stored = await one(
      pool,
      "select s.* from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id = s.snapshot_id where s.source = 'tripadvisor'"
    )
    assert.equal(stored.last_error.reason, 'HTTP_429', 'operator diagnostics are preserved')
  }
)

test(
  'user journey saves a place, starts Research, opens Details and creates an attributed TripAdvisor brief',
  opts,
  async () => {
    const { pool } = db
    const runner = await taExecutor(pool)
    const { call } = await doors(pool, runner.domain)
    const email = 'tripadvisor-customer-journey@tracy.test'
    const created = await call(email, 'POST', BASE, { candidate: CANDIDATE })
    assert.equal(created.status, 201)
    const id = created.body.opportunity.id
    const started = await call(email, 'POST', `${BASE}/${id}/research`, { requestId: 'customer-journey' })
    assert.equal(started.status, 202)
    await drain(runner.ex)
    const listed = await call(email, 'GET', `${BASE}?ids=${id}`)
    assert.equal(listed.body.opportunities[0].job.state, 'completed')
    const detail = await call(email, 'GET', `${BASE}/${id}`)
    assert.equal(detail.status, 200)
    const source = detail.body.sources.find((s) => s.source === 'tripadvisor')
    assert.equal(source.ref, TA_PLACE.link)
    assert.equal(source.status, 'complete')
    assert.equal(source.reason, null)
    const { tripadvisorReviewView } = await import(
      '../../../packages/site/tracy-website-opportunities/src/client/detail-model.ts'
    )
    const shown = tripadvisorReviewView(detail.body.profile)
    assert.equal(shown[0].text, 'Wonderful pho with friendly service.')
    assert.equal(shown[0].author, 'Lan')
    assert.equal(shown[0].url, TA_PLACE.link)
    const accountId = (await one(pool, 'select id from account where email = $1', [email])).id
    const brief = await createRevision(pool, {
      accountId,
      opportunityId: id,
      domain: runner.domain,
      templates: TEMPLATES
    })
    assert.equal(brief.revision.brief.reviewSources.tripadvisor.reviews[0].author, 'Lan')
    assert.ok(brief.revision.brief_md.includes(shown[0].text))
    assert.ok(brief.revision.brief_md.includes(TA_PLACE.link))
  }
)

test(
  'SerpApi primary persists reviews, avatars and attached photos through customer Details and demo manifest',
  opts,
  async () => {
    const { pool } = db
    const runner = await taExecutor(pool, {
      keys: { serpapi: 'primary', rapidapi: 'secondary', litescrape: 'last' }
    })
    const { call } = await doors(pool, runner.domain)
    const email = 'serpapi-user-journey@tracy.test'
    const created = await call(email, 'POST', BASE, { candidate: CANDIDATE })
    const id = created.body.opportunity.id
    assert.equal(
      (await call(email, 'POST', `${BASE}/${id}/research`, { requestId: 'serp-journey' })).status,
      202
    )
    await drain(runner.ex)
    assert.deepEqual(runner.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews'])
    const detail = await call(email, 'GET', `${BASE}/${id}`)
    assert.equal(detail.status, 200)
    const source = detail.body.profile.reviewSources.tripadvisor
    assert.equal(source.provider, 'serpapi')
    assert.equal(source.rating, 4.5, 'search aggregates survive missing place aggregates')
    const review = source.reviews[0]
    assert.match(review.authorAvatarUrl, /avatar\.jpg$/)
    assert.equal(review.authorUrl, 'https://www.tripadvisor.com/Profile/Lan')
    assert.equal(review.photos.length, 1)
    assert.equal(review.photos[0].reviewId, review.id)
    assert.equal(review.photos[0].sourceUrl, review.url)
    assert.ok(review.photos[0].mediaId)
    const media = detail.body.media.filter((m) => m.source === 'tripadvisor')
    assert.equal(media.length, 2)
    assert.ok(media.every((m) => !m.sourceUrl.includes('avatar')))
    const attached = media.find((m) => m.id === review.photos[0].mediaId)
    assert.equal(attached.postId, review.id)
    assert.equal(attached.credit.sourceUrl, review.url)
    assert.deepEqual(attached.credit.authors, [])
    const stored = (await pool.query("select * from wo_place_media where source = 'tripadvisor'")).rows
    assert.equal(stored.length, 2)
    assert.ok(
      stored.every((m) => m.status === 'stored' && m.provider === 'serpapi' && m.object_key && m.sha256)
    )
    const accountId = (await one(pool, 'select id from account where email = $1', [email])).id
    const made = await createRevision(pool, {
      accountId,
      opportunityId: id,
      domain: runner.domain,
      templates: TEMPLATES
    })
    assert.equal(made.revision.asset_manifest.length, 2)
    assert.ok(
      made.revision.asset_manifest.every(
        (m) => m.source === 'tripadvisor' && m.credit.sourceUrl && m.sourceUrl
      )
    )
    // The brief asset's credit is plain text (#47); the manifest above keeps the provider's full credit.
    assert.ok(
      made.revision.brief.assets.every(
        (m) => m.source === 'tripadvisor' && typeof m.credit === 'string' && m.uploaderRole !== undefined
      )
    )
    assert.equal(made.revision.brief.reviewSources.tripadvisor.reviews[0].photos[0].mediaId, attached.id)
    for (const text of [review.authorUrl, review.authorAvatarUrl, review.photos[0].url, attached.id])
      assert.ok(made.revision.brief_md.includes(text))
    const placed = await buildPlaced(pool, accountId, made.revision)
    assert.equal(placed.length, 2)
    assert.ok(placed.every((m) => m.labels.credit.provider === 'TripAdvisor'))
    assert.ok(made.revision.brief_md.includes('TripAdvisor gallery photo'))
    assert.ok(
      placed.every((m) => made.revision.asset_manifest.some((a) => a.id === m.id && a.sha256 === m.sha256))
    )
    const ledger = (
      await pool.query(
        "select provider,operation,reserved_cents,state from wo_cost_ledger where provider='serpapi'"
      )
    ).rows
    assert.equal(ledger.length, 3)
    assert.ok(ledger.every((r) => r.state === 'settled'))
  }
)

for (const status of [401, 429])
  test(
    `SerpApi ${status} falls through RapidAPI quota to Litescrape with separate attempt records`,
    opts,
    async () => {
      const { pool } = db
      const a = await account(pool, `serpapi-fallback-${status}@tracy.test`)
      const opp = await saveGoogle(pool, a)
      const h = await taExecutor(pool, {
        keys: { serpapi: 'first', rapidapi: 'second', litescrape: 'third' },
        serpFailure: status,
        primaryFailure: 429
      })
      await requestResearch(pool, { accountId: a, opportunity: opp, requestId: `serp-fallback-${status}` })
      await drain(h.ex)
      assert.deepEqual(h.calls, ['serpapi-search', 'autocomplete', 'search', 'place', 'reviews'])
      assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.provider, 'litescrape')
      const rows = (
        await pool.query('select provider,state from wo_cost_ledger where provider != $1', ['google'])
      ).rows
      assert.equal(rows.length, 5)
      assert.equal(rows.filter((r) => r.state === 'unreconciled').length, 2)
    }
  )

for (const status of [429, 503])
  test(
    `SerpApi ${status} once is retried after its wait, and the reviews come from SerpApi`,
    opts,
    async () => {
      const { pool } = db
      const a = await account(pool, `serpapi-retry-${status}@tracy.test`)
      const opp = await saveGoogle(pool, a)
      const waits = []
      const h = await taExecutor(pool, {
        keys: { serpapi: 'first', rapidapi: 'second', litescrape: 'third' },
        serpFailOnce: { 'serpapi-search': status },
        providerRetry: { sleep: async (ms) => void waits.push(ms) }
      })
      await requestResearch(pool, { accountId: a, opportunity: opp, requestId: `serp-retry-${status}` })
      await drain(h.ex)
      assert.deepEqual(h.calls, ['serpapi-search', 'serpapi-search', 'serpapi-place', 'serpapi-reviews'])
      assert.deepEqual(waits, [1000])
      const source = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
      assert.equal(source.provider, 'serpapi')
      assert.equal(source.reviews.length, 1)
    }
  )

test('SerpApi 402 (paid quota spent) is not retried: the next provider is asked at once', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'serpapi-402@tracy.test')
  const opp = await saveGoogle(pool, a)
  const waits = []
  const h = await taExecutor(pool, {
    keys: { serpapi: 'first', rapidapi: 'second', litescrape: 'third' },
    serpFailOnce: { 'serpapi-search': 402 },
    providerRetry: { sleep: async (ms) => void waits.push(ms) }
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-402' })
  await drain(h.ex)
  assert.equal(h.calls.filter((c) => c === 'serpapi-search').length, 1)
  assert.deepEqual(waits, [])
  assert.equal(h.calls[1], 'autocomplete')
})

test(
  'SerpApi empty search ends enrichment without fallback while transient review failure reuses the verified ID',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serpapi-step@tracy.test')
    const opp = await saveGoogle(pool, a)
    const keys = { serpapi: 'first', rapidapi: 'second', litescrape: 'third' }
    const empty = await taExecutor(pool, { keys, serpEmpty: true })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-empty' })
    await drain(empty.ex)
    assert.deepEqual(empty.calls, ['serpapi-search'])
    const fallback = await taExecutor(pool, { keys, serpFailure: { 'serpapi-reviews': 503 } })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-reviews', force: true })
    await drain(fallback.ex)
    assert.deepEqual(fallback.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews', 'reviews_byid'])
    const source = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
    assert.equal(source.provider, 'rapidapi')
    assert.equal(source.placeId, '12345')
    assert.equal(source.media.length, 1, 'successful SerpApi gallery survives review fallback')
  }
)

test('the operator order on /ops/wo decides which Tripadvisor provider is asked first', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-order@tracy.test')
  const opp = await saveGoogle(pool, a)
  const h = await taExecutor(pool, {
    keys: { serpapi: 'first', rapidapi: 'second', litescrape: 'third' },
    settings: { providerOrder: { tripadvisor: ['litescrape', 'serpapi'] } }
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-order' })
  await drain(h.ex)
  assert.equal(h.calls[0], 'search', 'Litescrape is asked first')
  assert.ok(!h.calls.includes('autocomplete'), 'RapidAPI is not in the order, so it is never called')
  assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.provider, 'litescrape')
})

test('an empty Tripadvisor order switches the reviews off', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'tripadvisor-off@tracy.test')
  const opp = await saveGoogle(pool, a)
  const h = await taExecutor(pool, {
    keys: { serpapi: 'first', rapidapi: 'second', litescrape: 'third' },
    settings: { providerOrder: { tripadvisor: [] } }
  })
  await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'ta-off' })
  await drain(h.ex)
  assert.deepEqual(h.calls, [])
})

test(
  'missing photo capability falls back per step without losing successful SerpApi review photos',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serpapi-photos@tracy.test')
    const opp = await saveGoogle(pool, a)
    const h = await taExecutor(pool, {
      keys: { serpapi: 'first', rapidapi: 'second' },
      serpPhotosMissing: true
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-photos' })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews', 'details_byid'])
    const source = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor
    assert.equal(source.provider, 'serpapi')
    assert.equal(source.reviews[0].photos.length, 1)
    assert.ok(source.reviews[0].photos[0].mediaId)
    assert.equal(source.media.length, 1, 'empty valid fallback gallery does not erase attached images')
  }
)

test('SerpApi budget pause resumes operation checkpoints without double payment', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'serpapi-resume@tracy.test')
  const opp = await saveGoogle(pool, a)
  const cap = { value: 10 }
  const h = await taExecutor(pool, { keys: { serpapi: 'first', rapidapi: 'second' }, cap })
  const { job } = await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-budget' })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['serpapi-search'])
  assert.equal((await one(pool, "select state from wo_place_job where state='paused'")).state, 'paused')
  cap.value = 100
  await resumeRequest(pool, a, job.id, { shared: true })
  await drain(h.ex)
  assert.deepEqual(h.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews'])
  assert.equal((await one(pool, "select count(*)::int n from wo_cost_ledger where provider='serpapi'")).n, 3)
})

test(
  'provider-switch refresh keeps same-review author links, avatar and attached stored photos',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serpapi-refresh-links@tracy.test')
    const opp = await saveGoogle(pool, a)
    const first = await taExecutor(pool, { keys: { serpapi: 'first' } })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-original' })
    await drain(first.ex)
    const old = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.reviews[0]
    const next = await taExecutor(pool, { keys: { rapidapi: 'second' } })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'serp-switch', force: true })
    await drain(next.ex)
    const review = (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.reviews[0]
    assert.equal(review.provider, 'rapidapi')
    for (const key of ['authorUrl', 'authorAvatarUrl', 'url']) assert.equal(review[key], old[key])
    assert.deepEqual(review.photos, old.photos)
    const photo = await one(pool, 'select * from wo_place_media where id=$1', [review.photos[0].mediaId])
    assert.equal(photo.credit.viaProvider, 'serpapi')
  }
)

test(
  'TripAdvisor photo capability upgrade leaves fresh Google facts and other collectors cached',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serpapi-capability@tracy.test')
    const opp = await saveGoogle(pool, a)
    const first = await taExecutor(pool)
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'old-review-source' })
    await drain(first.ex)
    await pool.query(
      "update wo_place_snapshot_source set collector_version='tripadvisor-2', coverage=jsonb_set(coverage,'{version}','\"tripadvisor-2\"'::jsonb) where source='tripadvisor'"
    )
    const next = await taExecutor(pool, { keys: { serpapi: 'new-photo-provider' } })
    const { reviewSourcesRequired } = await import('website-opportunities/src/tripadvisor-research.js')
    await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'photo-capability',
      requiredSources: reviewSourcesRequired(await next.runtime())
    })
    await drain(next.ex)
    assert.deepEqual(next.calls, ['serpapi-place', 'serpapi-reviews'])
    assert.equal(next.domainCalls.details, 0)
    const view = await placeViewOf(pool, opp)
    assert.equal(view.profile.reviewSources.tripadvisor.reviews[0].photos.length, 1)
    assert.equal(
      (
        await one(
          pool,
          "select s.collector_version from wo_place_snapshot_source s join wo_place p on p.current_snapshot_id=s.snapshot_id where s.source='tripadvisor'"
        )
      ).collector_version,
      'tripadvisor-5'
    )
  }
)

test(
  'photo budget refusal keeps good reviews and resumes only the missing gallery operation',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serpapi-photo-resume@tracy.test')
    const opp = await saveGoogle(pool, a)
    const cap = { value: 15 }
    const h = await taExecutor(pool, {
      keys: { serpapi: 'first', rapidapi: 'second' },
      serpPhotosMissing: true,
      cap
    })
    const { job } = await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'photo-budget' })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews'])
    const stopped = await one(pool, "select * from wo_place_snapshot_source where source='tripadvisor'")
    assert.equal(stopped.collected.reviews[0].author, 'Lan')
    assert.equal(stopped.coverage.pending, true)
    cap.value = 100
    await resumeRequest(pool, a, job.id, { shared: true })
    await drain(h.ex)
    assert.deepEqual(h.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews', 'details_byid'])
    assert.ok((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.reviews[0].photos[0].mediaId)
  }
)

test(
  'ordinary Research retries a previous not-found source and collects no-website restaurant reviews without creating branch identity',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'green-land-restaurant@tracy.test')
    const opp = await saveGoogle(pool, a)
    const facts = {
      name: 'GREEN MESA RESTAURANT - KARAMA',
      address: '18 5B St - Al Karama - Dubai - United Arab Emirates',
      website: null,
      phone: '+97140000000',
      lat: 25.2423516,
      lon: 55.3050931
    }
    const taPlace = {
      ...TA_PLACE,
      place_id: '8731234',
      title: 'Green Mesa',
      address: '12c Street, 104/3 Hor Al Anz, Dubai United Arab Emirates',
      market: 'Dubai',
      website: null,
      phone: '+97145550194',
      gps_coordinates: { latitude: 25.28052, longitude: 55.34199 },
      link: 'https://www.tripadvisor.com/Restaurant_Review-d7654321.html'
    }
    const old = await taExecutor(pool, { keys: { serpapi: 'first' }, facts, taPlace, serpEmpty: true })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'old-policy' })
    await drain(old.ex)
    await pool.query(
      "update wo_place_snapshot_source set collector_version='tripadvisor-3',coverage=jsonb_set(coverage,'{version}','\"tripadvisor-3\"'::jsonb),last_error=jsonb_set(coalesce(last_error,'{}'::jsonb),'{version}','\"tripadvisor-3\"'::jsonb) where source='tripadvisor'"
    )
    const next = await taExecutor(pool, { keys: { serpapi: 'first' }, facts, taPlace })
    const { reviewSourcesRequired } = await import('website-opportunities/src/tripadvisor-research.js')
    const { job } = await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'ordinary-new-policy',
      requiredSources: reviewSourcesRequired(await next.runtime())
    })
    assert.equal(job.state, 'queued')
    await drain(next.ex)
    assert.deepEqual(next.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews'])
    assert.deepEqual(next.queries, ['GREEN MESA RESTAURANT'])
    assert.equal(next.domainCalls.details, 0, 'fresh Google facts stay cached')
    const view = await placeViewOf(pool, opp)
    const source = view.profile.reviewSources.tripadvisor
    assert.equal(source.name, 'Green Mesa')
    assert.equal(source.address, taPlace.address)
    assert.equal(source.scope, 'brand')
    assert.equal(source.branchVerified, false)
    assert.equal(source.reviews.length, 1)
    assert.equal(
      (await one(pool, "select count(*)::int n from wo_place_identity where namespace='tripadvisor'")).n,
      0
    )
    const made = await createRevision(pool, {
      accountId: a,
      opportunityId: opp.id,
      domain: next.domain,
      templates: TEMPLATES
    })
    assert.ok(made.revision.brief_md.includes('Reviews for "Green Mesa"'))
    assert.ok(made.revision.brief_md.includes('not verified as the selected Google branch'))
    const other = (
      await pool.query("insert into wo_place(display_name) values ('Other Google branch') returning id")
    ).rows[0].id
    await pool.query(
      "insert into wo_place_identity(namespace,external_id,place_id,source) values ('tripadvisor','8731234',$1,'operator')",
      [other]
    )
    await requestResearch(pool, {
      accountId: a,
      opportunity: opp,
      requestId: 'existing-other-identity',
      force: true
    })
    const refreshed = await taExecutor(pool, { keys: { serpapi: 'first' }, facts, taPlace })
    await drain(refreshed.ex)
    assert.equal((await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.scope, 'brand')
    assert.equal(
      (
        await one(
          pool,
          "select place_id from wo_place_identity where namespace='tripadvisor' and external_id='8731234'"
        )
      ).place_id,
      other
    )
  }
)

test(
  'SerpApi twenty reviews reach the shared profile and brief; a fresh reader costs no extra calls',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serp-twenty@tracy.test')
    const opp = await saveGoogle(pool, a)
    const runner = await taExecutor(pool, { keys: { serpapi: 'first' }, serpReviewCount: 20 })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'twenty' })
    await drain(runner.ex)
    const view = await placeViewOf(pool, opp)
    assert.equal(view.profile.reviewSources.tripadvisor.reviews.length, 20)
    const made = await createRevision(pool, {
      accountId: a,
      opportunityId: opp.id,
      domain: runner.domain,
      templates: TEMPLATES
    })
    assert.equal(made.revision.brief.reviewSources.tripadvisor.reviews.length, 20)
    const b = await account(pool, 'serp-twenty-other@tracy.test')
    const other = await saveGoogle(pool, b)
    await requestResearch(pool, { accountId: b, opportunity: other, requestId: 'reuse-twenty' })
    await drain(runner.ex)
    assert.deepEqual(runner.calls, ['serpapi-search', 'serpapi-place', 'serpapi-reviews'])
    assert.equal((await placeViewOf(pool, other)).profile.reviewSources.tripadvisor.reviews.length, 20)
  }
)

test(
  'SerpApi refresh reuses the accepted place ID without another search and preserves identity checks',
  opts,
  async () => {
    const { pool } = db
    const a = await account(pool, 'serp-cached-id@tracy.test')
    const opp = await saveGoogle(pool, a)
    const first = await taExecutor(pool, { keys: { serpapi: 'first' } })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'resolve-id' })
    await drain(first.ex)
    const refresh = await taExecutor(pool, { keys: { serpapi: 'first' } })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'reuse-id', force: true })
    await drain(refresh.ex)
    assert.deepEqual(refresh.calls, ['serpapi-place', 'serpapi-reviews'])
    const changed = await taExecutor(pool, {
      keys: { serpapi: 'first' },
      taPlace: { ...TA_PLACE, title: 'Different restaurant', website: null }
    })
    await requestResearch(pool, { accountId: a, opportunity: opp, requestId: 'changed-listing', force: true })
    await drain(changed.ex)
    assert.deepEqual(changed.calls, ['serpapi-place'])
    assert.equal(
      (await placeViewOf(pool, opp)).profile.reviewSources.tripadvisor.name,
      'Pho Ba',
      'failed revalidation preserves good old data'
    )
  }
)

test(
  'doors: the detail lists Google with the collected sources, and Retry on one source queues that source alone',
  opts,
  async () => {
    const { pool } = db
    const { domain } = await domainWith()
    const { call } = await doors(pool, domain)
    const opp = (await call('a@tracy.test', 'POST', BASE, { candidate: CANDIDATE })).body.opportunity
    await call('a@tracy.test', 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-a-0001' })
    await drain(executor(pool, domain).ex)
    const detail = (await call('a@tracy.test', 'GET', `${BASE}/${opp.id}`)).body
    assert.deepEqual(
      detail.sources.map((s) => [s.source, s.status, s.shared]),
      [
        ['website', 'complete', true],
        ['google-places', 'complete', true],
        // A food place's Menu parts: no menu link found, photo reading off by default.
        ['menu-file', 'skipped', true],
        ['menu-photos', 'skipped', true]
      ]
    )
    const bogus = await call('a@tracy.test', 'POST', `${BASE}/${opp.id}/research`, {
      requestId: 'req-a-0002',
      only: 'google-places-search'
    })
    assert.equal(bogus.status, 400)
    assert.equal(bogus.body.code, 'INVALID_ONLY')
    const unavailable = await call('a@tracy.test', 'POST', `${BASE}/${opp.id}/research`, {
      requestId: 'req-a-0004',
      only: 'tripadvisor'
    })
    assert.equal(unavailable.status, 409, 'no Tripadvisor provider is set up here')
    assert.equal(unavailable.body.code, 'ONLY_UNAVAILABLE')
    const retry = await call('a@tracy.test', 'POST', `${BASE}/${opp.id}/research`, {
      requestId: 'req-a-0003',
      only: 'website'
    })
    assert.equal(retry.status, 202)
    assert.equal(
      retry.body.job.state,
      'queued',
      'a fresh source is collected again: the Retry skips the freshness check'
    )
    const placeJob = (
      await pool.query('select only_source, force from wo_place_job where id = $1', [
        retry.body.job.placeJobId
      ])
    ).rows[0]
    assert.deepEqual(placeJob, { only_source: 'website', force: false })
  }
)
