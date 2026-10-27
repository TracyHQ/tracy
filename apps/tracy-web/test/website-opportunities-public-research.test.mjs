// Research pressed on the sign-in-free /find (tasks/plan-wo-public-research.md, contract §7): the
// public admission never joins a place and decides afterwards; it reads a published snapshot, joins a
// matching running job, or queues a NEW job through an atomic limit — and its demand keeps that job
// alive when a signed-in request on it is cancelled.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  admitPublicResearch,
  finishPlaceJob,
  placeLease,
  claimPlaceJob,
  publicResearchProgress
} from 'website-opportunities/src/place-jobs.js'
import { cancelRequest, requestResearch } from 'website-opportunities/src/place-requests.js'
import { resolvePlace } from 'website-opportunities/src/places.js'
import { insertOpportunity } from 'website-opportunities/src/store.js'
import { publicResearchDoor } from 'website-opportunities/src/public-research.js'
import { saveWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { woPublicFindRoutes } from '../src/public/wo-find-page.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NOW = Date.parse('2026-10-23T10:00:00Z')
const LIMITS = { perAddressDay: 50, perDay: 1000, budgetCents: 500, jobCapCents: 200 }

const googleIds = new Map()
async function place(id) {
  const placeId = await resolvePlace(db.pool, { provider: 'google-places', providerId: id, name: null })
  googleIds.set(placeId, id)
  return placeId
}
const admit = (placeId, extra = {}) =>
  admitPublicResearch(db.pool, {
    placeId,
    providerId: googleIds.get(placeId),
    ipBucket: '203.0.113.7',
    now: NOW,
    limits: LIMITS,
    ...extra
  })
const jobsOf = async (placeId) =>
  (await db.pool.query('select * from wo_place_job where place_id = $1 order by created_at', [placeId])).rows

/** A full published snapshot with one collected source, as a finished place job leaves it. */
async function published(placeId) {
  const snap = (
    await db.pool.query(
      `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'preparing', $2) returning id`,
      [placeId, new Date(NOW - 3600_000)]
    )
  ).rows[0].id
  await db.pool.query(
    `insert into wo_place_snapshot_source (snapshot_id, source, status, collected_at, attempted_at)
     values ($1, 'website', 'complete', $2, $2)`,
    [snap, new Date(NOW - 3600_000)]
  )
  await db.pool.query(`insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, $2)`, [
    snap,
    JSON.stringify({ name: 'Pho Ba' })
  ])
  await db.pool.query(`update wo_place_snapshot set state = 'published' where id = $1`, [snap])
  await db.pool.query('update wo_place set current_snapshot_id = $2 where id = $1', [placeId, snap])
  return snap
}

test('a place someone already researched costs nothing: researched, no job, no count', opts, async () => {
  const p = await place('ChIJ-done')
  await published(p)
  // Even a snapshot old enough for the signed-in path to refresh is read as it is.
  // Published snapshots are immutable by trigger (schema 0004); this stands in for one published 90 days ago.
  await db.pool.query(
    `set local session_replication_role = replica;
     update wo_place_snapshot set published_at = '${new Date(NOW - 90 * 86_400_000).toISOString()}'`
  )
  const answer = await admit(p)
  assert.equal(answer.state, 'researched')
  assert.equal(answer.receipt, undefined)
  assert.deepEqual(await jobsOf(p), [])
  assert.equal((await db.pool.query('select count(*)::int as n from wo_place_public_request')).rows[0].n, 0)
})

test(
  'a new place is queued once, with a receipt; a second stranger joins the same job for free',
  opts,
  async () => {
    const p = await place('ChIJ-new')
    const first = await admit(p)
    assert.equal(first.state, 'queued')
    assert.match(first.receipt, /^[0-9a-f-]{36}$/)
    const second = await admit(p, { ipBucket: '198.51.100.9' })
    assert.equal(second.state, 'queued')
    assert.notEqual(second.receipt, first.receipt)
    const jobs = await jobsOf(p)
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].research_mode, 'full')
    assert.equal(jobs[0].work_priority, 0)
    const rows = (
      await db.pool.query(
        'select new_job, reserved_cents from wo_place_public_request order by created_at, new_job desc'
      )
    ).rows
    assert.deepEqual(rows.map((r) => [r.new_job, r.reserved_cents]).sort(), [
      [false, 0],
      [true, 200]
    ])
  }
)

test('two concurrent presses for one new place make one job and reserve once', opts, async () => {
  const p = await place('ChIJ-race')
  const answers = await Promise.all([admit(p), admit(p, { ipBucket: '198.51.100.9' }), admit(p)])
  assert.ok(answers.every((a) => a.state === 'queued'))
  assert.equal((await jobsOf(p)).length, 1)
  const reserved = (
    await db.pool.query('select coalesce(sum(reserved_cents),0)::int as c from wo_place_public_request')
  ).rows[0].c
  assert.equal(reserved, 200)
})

test('the day limits count new places only: per address, per deployment, and the budget', opts, async () => {
  const a = await place('ChIJ-a')
  const b = await place('ChIJ-b')
  const c = await place('ChIJ-c')
  const limits = { ...LIMITS, perAddressDay: 1 }
  assert.equal((await admit(a, { limits })).state, 'queued')
  assert.equal((await admit(b, { limits })).refused, 'PUBLIC_RESEARCH_LIMIT')
  // Joining the running job of `a` costs no new place, so it is still allowed.
  assert.equal((await admit(a, { limits })).state, 'queued')
  // Another address has room of its own, until the deployment's day is full.
  assert.equal(
    (await admit(b, { limits: { ...limits, perDay: 1 }, ipBucket: '198.51.100.9' })).refused,
    'PUBLIC_RESEARCH_LIMIT'
  )
  // The budget: 500 cents hold two job caps of 200, not three.
  assert.equal((await admit(b, { ipBucket: '198.51.100.9' })).state, 'queued')
  assert.equal((await admit(c, { ipBucket: '192.0.2.1' })).refused, 'PUBLIC_RESEARCH_SPENT')
  assert.deepEqual(await jobsOf(c), [], 'a refusal queues nothing')
  // A new UTC day starts the counts again.
  assert.equal((await admit(c, { ipBucket: '192.0.2.1', now: NOW + 86_400_000 })).state, 'queued')
  // 0 closes the door.
  const d = await place('ChIJ-d')
  assert.equal(
    (await admit(d, { limits: { ...LIMITS, perDay: 0 }, now: NOW + 86_400_000 })).refused,
    'PUBLIC_RESEARCH_LIMIT'
  )
})

test('a finished public job counts what it really cost, not the cap it held', opts, async () => {
  const a = await place('ChIJ-done-a')
  const b = await place('ChIJ-done-b')
  const c = await place('ChIJ-done-c')
  assert.equal((await admit(a)).state, 'queued')
  assert.equal((await admit(b)).state, 'queued')
  // Two 200-cent holds fill 500 cents; a third must wait while both run.
  assert.equal((await admit(c)).refused, 'PUBLIC_RESEARCH_SPENT')
  for (let i = 0; i < 2; i += 1) {
    const job = await claimPlaceJob(db.pool, 'worker-1', 60_000)
    await db.pool.query(
      `insert into wo_cost_ledger (budget_day, place_id, job_id, provider, operation, reserved_cents, actual_cents, state)
       values ($1, $2, $3, 'scrapecreators', 'facebook-profile', 2, 2, 'settled'),
              ($1, $2, $3, 'google', 'place-details', 30, null, 'released')`,
      [new Date(NOW).toISOString().slice(0, 10), job.place_id, job.id]
    )
    assert.equal(await finishPlaceJob(db.pool, placeLease(job), { state: 'completed' }, { now: NOW }), true)
  }
  // Both finished at 2 cents each: the day holds 4 of 500, so the third place is admitted.
  assert.equal((await admit(c)).state, 'queued')
})

test('spent public budget refuses strangers while signed-in research still runs', opts, async () => {
  const spent = { ...LIMITS, budgetCents: 0 }
  const p = await place('ChIJ-signed')
  assert.equal((await admit(p, { limits: spent })).refused, 'PUBLIC_RESEARCH_SPENT')
  const account = (await db.pool.query("insert into account (email) values ('a@tracy.test') returning id"))
    .rows[0].id
  const { row: opp } = await insertOpportunity(db.pool, account, {
    name: 'Pho',
    branch: null,
    provider: 'google-places',
    providerId: 'ChIJ-signed',
    candidate: { provider: 'google-places', providerId: 'ChIJ-signed', name: 'Pho', socials: {} }
  })
  const { job } = await requestResearch(db.pool, {
    accountId: account,
    opportunity: opp,
    requestId: 'req-0001'
  })
  assert.equal(job.state, 'queued')
  // A job a signed-in person started is joined by a stranger for free, budget or not.
  assert.equal((await admit(p, { limits: spent })).state, 'queued')
})

test('public demand keeps the shared job when the signed-in request on it is cancelled', opts, async () => {
  const account = (await db.pool.query("insert into account (email) values ('a@tracy.test') returning id"))
    .rows[0].id
  const { row: opp } = await insertOpportunity(db.pool, account, {
    name: 'Pho',
    branch: null,
    provider: 'google-places',
    providerId: 'ChIJ-shared',
    candidate: { provider: 'google-places', providerId: 'ChIJ-shared', name: 'Pho', socials: {} }
  })
  const { job } = await requestResearch(db.pool, {
    accountId: account,
    opportunity: opp,
    requestId: 'req-0001'
  })
  const p = await place('ChIJ-shared')
  assert.equal((await admit(p)).state, 'queued')
  await cancelRequest(db.pool, account, job.id)
  const [placeJob] = await jobsOf(p)
  assert.equal(placeJob.state, 'queued', 'the stranger still waits on it')
})

test(
  'no refresh, resume or retry from public: a stopped job reads as stopped and queues nothing',
  opts,
  async () => {
    for (const state of ['failed', 'paused', 'blocked']) {
      const p = await place(`ChIJ-${state}`)
      await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, $2)`, [p, state])
      const answer = await admit(p)
      assert.equal(answer.state, 'stopped', state)
      const jobs = await jobsOf(p)
      assert.deepEqual(
        jobs.map((j) => j.state),
        [state],
        `${state} is left as it is`
      )
    }
  }
)

test(
  'progress is read by receipt only: stage while running, researched once published, stopped otherwise',
  opts,
  async () => {
    const p = await place('ChIJ-progress')
    const { receipt } = await admit(p)
    const read = async () =>
      await publicResearchProgress(db.pool, [receipt, '00000000-0000-4000-8000-000000000000'], { now: NOW })
    let seen = await read()
    assert.deepEqual(Object.keys(seen), [receipt], 'an unknown receipt says nothing')
    assert.deepEqual(seen[receipt], { placeId: 'ChIJ-progress', state: 'queued' })
    const job = await claimPlaceJob(db.pool, 'worker-1', 60_000)
    await db.pool.query("update wo_place_job set stage = 'media' where id = $1", [job.id])
    seen = await read()
    assert.deepEqual(seen[receipt], { placeId: 'ChIJ-progress', state: 'running', stage: 'media' })
    await db.pool.query(
      `insert into wo_place_snapshot_profile (snapshot_id, profile) values ($1, '{"name":"Pho"}')`,
      [job.snapshot_id]
    )
    assert.equal(await finishPlaceJob(db.pool, placeLease(job), { state: 'completed' }, { now: NOW }), true)
    seen = await read()
    assert.equal(seen[receipt].state, 'researched')
    assert.ok(seen[receipt].researchedAt)
    assert.deepEqual(Object.keys(seen[receipt]).sort(), ['placeId', 'researchedAt', 'state'])
    // A receipt older than two days is forgotten.
    assert.deepEqual(await publicResearchProgress(db.pool, [receipt], { now: NOW + 3 * 86_400_000 }), {})
  }
)

test('a cancelled or failed job reads as stopped through its receipt', opts, async () => {
  const p = await place('ChIJ-stop')
  const { receipt } = await admit(p)
  await db.pool.query("update wo_place_job set state = 'cancelled' where place_id = $1", [p])
  assert.equal((await publicResearchProgress(db.pool, [receipt], { now: NOW }))[receipt].state, 'stopped')
})

// ---- The doors: POST/GET /find/api/research, as app.js wires them.

async function setSwitches({ wo = true, publicFind = true } = {}) {
  await db.pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify({ 'website-opportunities': wo, 'website-opportunities-public-find': publicFind })]
  )
}

function doors({ role = 'master' } = {}) {
  const app = woPublicFindRoutes({
    config: { deploymentRole: role, googleApiKey: 'g-key', sessionSecret: 's'.repeat(32), secure: false },
    pool: db.pool,
    loadDomain: websiteOpportunitiesDomain,
    fetchImpl: async (href) => {
      throw new Error(`no provider is called by a research press: ${href}`)
    },
    research: publicResearchDoor(db.pool),
    now: () => NOW
  })
  const post = (body, { ip = '203.0.113.7', headers = {} } = {}) =>
    app.request('/find/api/research', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  const get = (query) =>
    app.request(`/find/api/research?${query}`, { headers: { 'cf-connecting-ip': '203.0.113.7' } })
  return { post, get }
}

const count = async (table) => (await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n

test(
  'POST research: a researched place is free and can be built; a new one is queued with a receipt',
  opts,
  async () => {
    await setSwitches()
    const done = await place('ChIJ-done')
    await published(done)
    const { post } = doors()
    const res = await post({ placeIds: ['ChIJ-done', 'ChIJ-fresh', 'ChIJ-fresh'] })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const { places } = await res.json()
    assert.equal(places.length, 2, 'one answer per place')
    assert.equal(places[0].placeId, 'ChIJ-done')
    assert.equal(places[0].state, 'researched')
    assert.equal(places[0].canBuild, true)
    assert.equal(places[0].receipt, undefined)
    assert.equal(places[1].placeId, 'ChIJ-fresh')
    assert.equal(places[1].state, 'queued')
    assert.match(places[1].receipt, /^[0-9a-f-]{36}$/)
    assert.equal(await count('wo_place_job'), 1)
    const made = (
      await db.pool.query(
        "select display_name from wo_place p join wo_place_identity i on i.place_id = p.id where i.external_id = 'ChIJ-fresh'"
      )
    ).rows[0]
    assert.equal(made.display_name, null, 'no name from the browser')
  }
)

test(
  'POST research: a hostile body is refused and writes nothing — no place, no link, no job',
  opts,
  async () => {
    await setSwitches()
    const { post } = doors()
    for (const body of [
      { placeIds: ['ChIJ-evil'], website: 'https://attacker.example/' },
      { placeIds: ['ChIJ-evil'], candidate: { website: 'http://169.254.169.254/latest/meta-data/' } },
      {
        placeIds: ['ChIJ-evil'],
        socials: { facebook: 'javascript:alert(1)' },
        name: 'Fake name',
        phone: '+1'
      },
      { placeIds: ['https://attacker.example/'] },
      { placeIds: ['ChIJ evil'] },
      { placeIds: [] },
      { placeIds: Array.from({ length: 11 }, (_, i) => `ChIJ-${i}`) },
      [{ placeIds: ['ChIJ-evil'] }],
      'not json'
    ]) {
      const res = await post(body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal((await res.json()).code, 'INVALID_RESEARCH')
    }
    assert.equal(await count('wo_place'), 0)
    assert.equal(await count('wo_place_link'), 0)
    assert.equal(await count('wo_place_job'), 0)
  }
)

test('POST research: spent budget refuses with sign-in words and makes no place', opts, async () => {
  await setSwitches()
  await saveWoOpsSettings(db.pool, { researchPublicDailyCapCents: 0 }, 'test')
  const { post } = doors()
  const res = await post({ placeIds: ['ChIJ-new'] })
  assert.equal(res.status, 200)
  const [answer] = (await res.json()).places
  assert.deepEqual(answer, { placeId: 'ChIJ-new', state: 'refused', code: 'PUBLIC_RESEARCH_SPENT' })
  assert.equal(await count('wo_place'), 0)
})

test('POST research: off, on a shard, or from another site, nothing is admitted', opts, async () => {
  await setSwitches({ publicFind: false })
  assert.equal((await doors().post({ placeIds: ['ChIJ-x'] })).status, 404)
  await setSwitches()
  assert.equal((await doors({ role: 'shard' }).post({ placeIds: ['ChIJ-x'] })).status, 404)
  const cross = await doors().post({ placeIds: ['ChIJ-x'] }, { headers: { 'sec-fetch-site': 'cross-site' } })
  assert.equal(cross.status, 403)
  assert.equal(await count('wo_place'), 0)
})

test('GET research never creates or resumes a job, and says nothing of accounts or jobs', opts, async () => {
  await setSwitches()
  const stopped = await place('ChIJ-stopped')
  await db.pool.query("insert into wo_place_job (place_id, state) values ($1, 'paused')", [stopped])
  const done = await place('ChIJ-done')
  await published(done)
  const { post, get } = doors()
  const { places } = await (await post({ placeIds: ['ChIJ-queued'] })).json()
  const receipt = places[0].receipt
  const before = (await db.pool.query('select id, state, updated_at from wo_place_job order by id')).rows

  const byPlace = await (await get('placeIds=ChIJ-unknown,ChIJ-stopped,ChIJ-done,ChIJ-queued')).json()
  assert.deepEqual(
    byPlace.places.map((p) => [p.placeId, p.state]),
    [
      ['ChIJ-unknown', 'none'],
      ['ChIJ-stopped', 'none'],
      ['ChIJ-done', 'researched'],
      // Arbitrary ids show researched or none only: queued work is read through a receipt.
      ['ChIJ-queued', 'none']
    ]
  )
  const byReceipt = await (await get(`receipts=${receipt}`)).json()
  assert.deepEqual(byReceipt.receipts, { [receipt]: { placeId: 'ChIJ-queued', state: 'queued' } })
  assert.deepEqual(
    (await db.pool.query('select id, state, updated_at from wo_place_job order by id')).rows,
    before
  )
  assert.equal(await count('wo_place_identity'), 3, 'a GET makes no place')
  const text = JSON.stringify([byPlace, byReceipt])
  for (const leak of [stopped, done, 'account', 'opportunity', 'jobId', 'snapshot'])
    assert.ok(!text.includes(leak), leak)
  assert.equal((await get('placeIds=a b')).status, 400)
  assert.equal((await get('receipts=nope')).status, 200)
})

test(
  'a signed-in visitor of /find keeps the Build demo hand-over on the way to the full Find',
  opts,
  async () => {
    await setSwitches()
    const app = woPublicFindRoutes({
      config: { deploymentRole: 'master', sessionSecret: 's'.repeat(32), secure: false },
      pool: db.pool,
      loadDomain: websiteOpportunitiesDomain,
      now: () => Date.now()
    })
    const cookie = `${SESSION_COOKIE}=${await mintSession('a@tracy.test', 's'.repeat(32))}`
    const res = await app.request('/find?wo-at=1,2&wo-radius=3000&wo-pick=a&wo-build=a', {
      headers: { cookie }
    })
    assert.equal(res.status, 302)
    assert.match(res.headers.get('location'), /&wo-build=a(?:&|$)/)
  }
)
