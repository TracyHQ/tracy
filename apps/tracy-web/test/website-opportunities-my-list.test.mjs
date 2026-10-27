// My opportunities v2 (tasks/todo-wo-my-opportunities-v2.md, D1/D3/D4 as amended by the council of
// 19/10): the list door's stage, attention, search, keyset paging and id poll; the bulk resume/cancel
// door; and resume refusing while another job of the same opportunity is active.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { migrate } from '../src/db/index.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { fileDb, scratchPool } from './_db.mjs'
import { urlKeyOf } from 'website-opportunities/src/site-checks.js'
import { listWoQueue } from '../src/lib/wo-ops.js'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const A = 'a@tracy.test'
const B = 'b@tracy.test'
const BASE = '/api/website-opportunities'

/** `domainFails`: the plugin's domain cannot load on this server. `fetched` counts outbound calls. */
async function world({ domainFails = false } = {}) {
  const { pool } = db
  const config = readConfig(env)
  const domain = await websiteOpportunitiesDomain()
  const fetched = []
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => {
      if (domainFails) throw Object.assign(new Error('missing'), { code: 'DOMAIN_UNAVAILABLE' })
      return domain
    },
    websiteOpportunitiesRequest: async () => Response.json({ code: 'UNEXPECTED' }, { status: 500 }),
    fetchImpl: async (input) => {
      fetched.push(String(input))
      return Response.json({ code: 'NO_NETWORK' }, { status: 500 })
    }
  })
  const call = async (email, method, path, body) => {
    const headers = { origin: 'http://tracy.test:8080' }
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test:8080${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed }
  }
  const setSwitch = (on) =>
    pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
       on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ 'website-opportunities': on })]
    )
  await setSwitch(true)
  /** The account of `email`, made through the create door like a real first save. */
  const accountOf = async (email) => {
    const made = await call(email, 'POST', BASE, {
      candidate: { provider: 'osm', providerId: `seed/${email}`, name: 'Seed', lat: 1, lon: 1, socials: {} }
    })
    assert.ok(made.status === 201 || made.status === 200)
    await pool.query('delete from wo_opportunity where provider_id = $1', [`seed/${email}`])
    return (await pool.query('select id from account where email = $1', [email])).rows[0].id
  }
  return { pool, call, setSwitch, accountOf, fetched }
}

let seq = 0

test(
  'Ops shares customer milestone precedence across accounts, accepted actions and latest demo QA',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const a = await accountOf(A),
      b = await accountOf(B)
    const again = await seed(pool, a, { jobs: ['completed', 'failed'] })
    const qa = await seed(pool, a, { build: 'done' })
    const pending = await seed(pool, b)
    await pool.query(
      `update wo_build set qa='{"state":"passed"}', updated_at=now()+interval '1 day'
    where revision_id in(select id from wo_revision where opportunity_id=$1)`,
      [qa.id]
    )
    await pool.query(
      `insert into wo_build (account_id,revision_id,request_id,build_id,state,qa,created_at, choice, choice_key)
    select $1,r.id,$2,$3,'failed','{"state":"failed"}',now()+interval '1 second', '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture'
    from wo_revision r where r.opportunity_id=$4`,
      [a, randomUUID(), randomUUID(), qa.id]
    )
    await pool.query(
      `insert into wo_demo_action(account_id,opportunity_id,request_id,fingerprint,accepted_at,
    revision_id,build_request_id,session_id,queued_at)
    values($1,$2,$3,'fixture',now(),$4,$5,'fixture',now())`,
      [b, pending.id, randomUUID(), randomUUID(), randomUUID()]
    )
    const customers = [
      ...(await call(A, 'GET', BASE)).body.opportunities,
      ...(await call(B, 'GET', BASE)).body.opportunities
    ]
    const ops = await listWoQueue(pool, readConfig(env))
    assert.equal(ops.opportunities.length, 3)
    for (const row of ops.opportunities) {
      const customer = customers.find((o) => o.id === row.id)
      assert.equal(row.customerStage, customer.stage, row.name)
      assert.equal(row.customerAttention, customer.attention, row.name)
    }
    const rows = new Map(ops.opportunities.map((o) => [o.id, o]))
    assert.equal(rows.get(again.id).customerStage, 'demo')
    assert.equal(rows.get(again.id).customerAttention, true)
    assert.equal(rows.get(qa.id).customerStage, 'demo', 'an old QA pass must not hide a newer failure')
    assert.equal(rows.get(qa.id).customerStatus, 'Needs review')
    assert.equal(rows.get(pending.id).customerStage, 'demo')
    assert.equal(rows.get(pending.id).customerStatus, 'Building…')
    await pool.query(
      `update wo_build set state='deleted',qa='{"state":"passed"}',demo_deleted_at=now()
    where revision_id in(select id from wo_revision where opportunity_id=$1)`,
      [qa.id]
    )
    const deleted = (await listWoQueue(pool, readConfig(env))).opportunities.find((o) => o.id === qa.id)
    assert.equal(deleted.customerStage, 'demo', 'a deleted demo cannot enter Outreach')
    assert.equal((await call(A, 'GET', BASE)).body.opportunities.find((o) => o.id === qa.id).stage, 'demo')
  }
)

/**
 * One opportunity in a given life state, written straight to the tables (setup, not the subject):
 * `jobs` oldest first, `revision` makes a brief, `build` 'done' | 'provisioning' adds a build whose
 * `site_creation` row has that state.
 */
async function seed(
  pool,
  accountId,
  { name = `Place ${++seq}`, at, jobs = [], revision = false, build = null } = {}
) {
  const created = at ?? new Date(Date.UTC(2026, 0, 1) + seq * 1000)
  const { rows } = await pool.query(
    `insert into wo_opportunity (account_id, name, provider, provider_id, candidate, created_at)
     values ($1, $2, 'osm', $3, $4, $5) returning *`,
    [accountId, name, `node/${randomUUID()}`, JSON.stringify({ name }), created]
  )
  const opp = rows[0]
  const jobIds = []
  for (const [i, state] of jobs.entries()) {
    const job = await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state, created_at)
       values ($1, $2, 'research', $3, $4, $5) returning id`,
      [accountId, opp.id, `seed-${randomUUID()}`, state, new Date(created.getTime() + (i + 1) * 10)]
    )
    jobIds.push(job.rows[0].id)
  }
  if (revision || build) {
    const rev = await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, '{}'::jsonb, '') returning id`,
      [opp.id, accountId]
    )
    if (build) {
      const buildId = randomUUID()
      await pool.query(
        `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, choice, choice_key)
         values ($1, $2, $3, $4, 'provisioning', null, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture')`,
        [accountId, rev.rows[0].id, `b-${randomUUID()}`, buildId]
      )
      await pool.query(
        `insert into site_creation (account_id, build_id, payload_hash, state) values ($1, $2, 'h', $3)`,
        [accountId, buildId, build]
      )
    }
  }
  return { ...opp, jobIds, latestJobId: jobIds.at(-1) ?? null }
}

test(
  'stage and attention follow the rule table; counts leave attention rows out of their step',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const fresh = await seed(pool, acc, { name: 'Fresh' })
    const running = await seed(pool, acc, { name: 'Running', jobs: ['running'] })
    const failed = await seed(pool, acc, { name: 'Failed', jobs: ['failed'] })
    const done = await seed(pool, acc, { name: 'Done', jobs: ['completed'] })
    const reresearchPaused = await seed(pool, acc, { name: 'Again', jobs: ['completed', 'paused'] })
    const cancelled = await seed(pool, acc, { name: 'Stopped', jobs: ['cancelled'] })
    const brief = await seed(pool, acc, { name: 'Brief', jobs: ['completed'], revision: true })
    const building = await seed(pool, acc, { name: 'Building', jobs: ['completed'], build: 'provisioning' })
    const demo = await seed(pool, acc, { name: 'Demo', jobs: ['completed'], build: 'done' })
    await pool.query(
      `update wo_build set state='done',pictures='{"verified":true}'
      where revision_id in(select id from wo_revision where opportunity_id=$1)`,
      [demo.id]
    )

    const ready = await seed(pool, acc, { name: 'Ready', jobs: ['completed'], build: 'done' })
    await pool.query(
      `update wo_build set qa='{"state":"passed"}' where revision_id in(select id from wo_revision where opportunity_id=$1)`,
      [ready.id]
    )
    const res = await call(A, 'GET', `${BASE}?limit=100`)
    assert.equal(res.status, 200)
    const byId = new Map(res.body.opportunities.map((o) => [o.id, o]))
    const view = (o) => [byId.get(o.id).stage, byId.get(o.id).attention]
    assert.deepEqual(view(fresh), ['research', false])
    assert.deepEqual(view(running), ['research', false])
    assert.deepEqual(view(failed), ['research', true])
    assert.deepEqual(view(done), ['demo', false])
    assert.deepEqual(view(reresearchPaused), ['demo', true], 'a reached milestone survives attention')
    assert.deepEqual(view(cancelled), ['cancelled', false])
    assert.deepEqual(view(brief), ['demo', false])
    assert.deepEqual(view(building), ['demo', false], 'a build whose site is not done is not a demo')
    assert.deepEqual(view(demo), ['demo', false], 'provision does not pass QA')
    assert.deepEqual(view(ready), ['outreach', false])
    assert.equal(byId.get(demo.id).latestBuild.done, true)
    assert.equal(byId.get(building.id).latestBuild.done, false)
    assert.equal(byId.get(fresh.id).latestBuild, null)
    assert.deepEqual(res.body.counts, {
      all: 10,
      research: 2,
      demo: 4,
      outreach: 1,
      cancelled: 1,
      attention: 2
    })
    assert.equal(res.body.total, 10)
    assert.equal(res.body.nextCursor, null)

    const researching = await call(A, 'GET', `${BASE}?stage=research`)
    assert.deepEqual(
      researching.body.opportunities.map((o) => o.name).sort(),
      ['Fresh', 'Running'],
      'the attention row is not in its step'
    )
    assert.equal(researching.body.total, 2)
    const attention = await call(A, 'GET', `${BASE}?attention=1`)
    assert.deepEqual(attention.body.opportunities.map((o) => o.name).sort(), ['Again', 'Failed'])
    assert.equal(attention.body.total, 2)
    assert.equal((await call(A, 'GET', `${BASE}?stage=finished`)).body.code, 'INVALID_STAGE')
    const ops = await listWoQueue(pool, readConfig(env))
    assert.equal(ops.opportunities.length, 10, JSON.stringify(ops.error))
    for (const row of ops.opportunities) {
      assert.equal(row.customerStage, byId.get(row.id).stage, row.name)
      assert.equal(row.customerAttention, byId.get(row.id).attention, row.name)
    }
    assert.equal(ops.opportunities.find((o) => o.id === brief.id).customerStatus, 'Ready to build')
    assert.equal(ops.opportunities.find((o) => o.id === ready.id).customerStatus, 'Demo ready')
    assert.equal(ops.opportunities.find((o) => o.id === demo.id).customerStatus, 'Needs review')
    assert.equal(ops.opportunities.find((o) => o.id === demo.id).queueState, 'IDLE')
    assert.equal(ops.opportunities.find((o) => o.id === demo.id).currentStep, 'Demo built · QA not recorded')
  }
)

test('search matches name, branch or address; % and _ are letters, not wildcards', opts, async () => {
  const { pool, call, accountOf } = await world()
  const acc = await accountOf(A)
  await seed(pool, acc, { name: '100% Pho' })
  await seed(pool, acc, { name: '1000 Pho' })
  await seed(pool, acc, { name: 'Bun_Cha' })
  await seed(pool, acc, { name: 'BunXCha', jobs: ['running'] })
  await pool.query(
    `update wo_opportunity set candidate = '{"address": "12 Tran Phu, Hoi An"}' where name = '1000 Pho'`
  )

  const names = async (qs) =>
    (await call(A, 'GET', `${BASE}?${qs}`)).body.opportunities.map((o) => o.name).sort()
  assert.deepEqual(await names(`q=${encodeURIComponent('0%')}`), ['100% Pho'])
  assert.deepEqual(await names('q=bun_'), ['Bun_Cha'])
  assert.deepEqual(await names('q=hoi%20an'), ['1000 Pho'], 'the address is searched')
  const counted = await call(A, 'GET', `${BASE}?q=bun`)
  assert.equal(counted.body.total, 2)
  assert.equal(counted.body.counts.all, 2, 'counts follow the search')
  assert.equal(counted.body.counts.research, 2)
  assert.equal((await call(A, 'GET', `${BASE}?q=${'x'.repeat(101)}`)).body.code, 'INVALID_QUERY')
})

test(
  'keyset paging over 120 rows: newest first, no duplicate, no gap, even within one instant',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const same = new Date(Date.UTC(2026, 5, 1))
    const made = []
    // 40 rows share one created_at to the microsecond: only the id orders them.
    for (let i = 0; i < 120; i++)
      made.push(await seed(pool, acc, { at: i < 40 ? same : new Date(same.getTime() + i * 1000) }))
    // The 40 newest move inside one millisecond at 60.5 s, apart only by microseconds (a JS Date
    // cannot hold them): rows 20–59 of the list, so the first page ends inside that millisecond.
    await pool.query(
      `update wo_opportunity o
     set created_at = $2::timestamptz + interval '60.5 seconds' + x.n * interval '1 microsecond'
     from (select id, row_number() over (order by id) as n from wo_opportunity
           where account_id = $1 and created_at >= $2::timestamptz + interval '80 seconds') x
     where o.id = x.id`,
      [acc, same]
    )
    const expected = (
      await pool.query(
        'select id from wo_opportunity where account_id = $1 order by created_at desc, id desc',
        [acc]
      )
    ).rows.map((r) => r.id)
    const seen = []
    let cursor = null
    let pages = 0
    do {
      const res = await call(A, 'GET', `${BASE}?limit=50${cursor ? `&cursor=${cursor}` : ''}`)
      assert.equal(res.status, 200)
      assert.equal(res.body.total, 120)
      seen.push(...res.body.opportunities.map((o) => o.id))
      cursor = res.body.nextCursor
      pages++
    } while (cursor && pages < 10)
    assert.equal(pages, 3)
    assert.deepEqual(seen, expected)
    assert.equal(new Set(seen).size, 120)
    assert.equal((await call(A, 'GET', `${BASE}?cursor=bm9wZQ`)).body.code, 'INVALID_CURSOR')
    for (const limit of ['0', '101', '2.5', 'x'])
      assert.equal((await call(A, 'GET', `${BASE}?limit=${limit}`)).body.code, 'INVALID_LIMIT', limit)
  }
)

test('ids poll answers exactly those rows whatever their stage, with counts', opts, async () => {
  const { pool, call, accountOf } = await world()
  const acc = await accountOf(A)
  const running = await seed(pool, acc, { jobs: ['running'] })
  const demo = await seed(pool, acc, { jobs: ['completed'], build: 'done' })
  await seed(pool, acc)
  const res = await call(A, 'GET', `${BASE}?ids=${running.id},${demo.id}&stage=research`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.opportunities.map((o) => o.id).sort(), [running.id, demo.id].sort())
  assert.equal(res.body.counts.all, 3)
  assert.equal(res.body.nextCursor, null)
  const tooMany = Array.from({ length: 101 }, () => randomUUID()).join(',')
  assert.equal((await call(A, 'GET', `${BASE}?ids=${tooMany}`)).body.code, 'INVALID_IDS')
  assert.equal((await call(A, 'GET', `${BASE}?ids=not-a-uuid`)).body.code, 'INVALID_IDS')
})

test('another account sees none of my rows, by filter or by id', opts, async () => {
  const { pool, call, accountOf } = await world()
  const acc = await accountOf(A)
  await accountOf(B)
  const mine = await seed(pool, acc, { jobs: ['failed'] })
  const asB = await call(B, 'GET', `${BASE}?ids=${mine.id}`)
  assert.deepEqual(asB.body.opportunities, [])
  assert.equal(asB.body.counts.all, 0)
  const paged = await call(B, 'GET', `${BASE}?attention=1`)
  assert.deepEqual(paged.body.opportunities, [])
  assert.equal(paged.body.total, 0)
  assert.deepEqual((await call(B, 'GET', BASE)).body, { opportunities: [] })
})

test(
  'no parameter: the old answer — every row, newest first, old fields kept, no paging keys',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    for (let i = 0; i < 60; i++) await seed(pool, acc, { jobs: i % 2 ? ['completed'] : [] })
    const res = await call(A, 'GET', BASE)
    assert.equal(res.status, 200)
    assert.deepEqual(Object.keys(res.body), ['opportunities'])
    assert.equal(res.body.opportunities.length, 60, 'not cut to a page')
    const first = res.body.opportunities[0]
    for (const key of [
      'id',
      'name',
      'branch',
      'provider',
      'providerId',
      'candidate',
      'status',
      'createdAt',
      'updatedAt',
      'job',
      'latestRevision',
      'sites'
    ])
      assert.ok(key in first, key)
    const dates = res.body.opportunities.map((o) => Date.parse(o.createdAt))
    assert.deepEqual(
      dates,
      [...dates].sort((a, b) => b - a)
    )
    assert.deepEqual((await call(null, 'GET', `${BASE}?stage=new`)).status, 401)
  }
)

test(
  'resume refuses while another job of the opportunity is queued or running; two at once make one',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const busy = await seed(pool, acc, { jobs: ['cancelled', 'running'] })
    const refused = await call(A, 'POST', `${BASE}/jobs/${busy.jobIds[0]}/resume`)
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'JOB_ACTIVE')
    assert.equal(refused.body.job.id, busy.jobIds[1], 'names the job in the way')

    const idle = await seed(pool, acc, { jobs: ['cancelled', 'failed'] })
    const both = await Promise.all(idle.jobIds.map((id) => call(A, 'POST', `${BASE}/jobs/${id}/resume`)))
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409])
    const { rows } = await pool.query(
      `select count(*)::int as n from wo_job where opportunity_id = $1 and state in ('queued', 'running')`,
      [idle.id]
    )
    assert.equal(rows[0].n, 1)
  }
)

test(
  'migration 132 keeps the newest active job of an opportunity and cancels older duplicates',
  opts,
  async () => {
    const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
    const dir = await mkdtemp(join(tmpdir(), 'tracy-132-'))
    const all = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql'))
    for (const name of all.filter((n) => n < '132')) await copyFile(join(MIGRATIONS, name), join(dir, name))
    const { pool, close } = await scratchPool()
    try {
      await migrate(pool, dir, { lockId: 7_243_132 })
      const acc = (await pool.query("insert into account (email) values ('m@x.y') returning id")).rows[0].id
      const dup = await seed(pool, acc, { jobs: ['running', 'queued'] })
      const alone = await seed(pool, acc, { jobs: ['running'] })
      await pool.query('insert into wo_job_attempt (job_id, attempt, lease_token) values ($1, 1, 0)', [
        dup.jobIds[0]
      ])

      const { applied } = await migrate(pool, MIGRATIONS, { lockId: 7_243_132 })
      assert.ok(applied.includes('132-website-opportunities-one-active-job.sql'))
      const state = async (id) =>
        (await pool.query('select state, last_error from wo_job where id = $1', [id])).rows[0]
      assert.deepEqual(await state(dup.jobIds[0]), {
        state: 'cancelled',
        last_error: { code: 'DUPLICATE_ACTIVE_JOB' }
      })
      assert.equal((await state(dup.jobIds[1])).state, 'queued', 'the newest stays')
      assert.equal((await state(alone.jobIds[0])).state, 'running', 'no duplicate, untouched')
      const attempt = await pool.query('select outcome from wo_job_attempt where job_id = $1', [
        dup.jobIds[0]
      ])
      assert.equal(attempt.rows[0].outcome, 'cancelled')
      await assert.rejects(
        pool.query(
          `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'x-00000001', 'queued')`,
          [acc, alone.id]
        ),
        /wo_job_one_active/
      )
    } finally {
      await close()
    }
  }
)

const BULK = `${BASE}/jobs/bulk`

test(
  'bulk by job ids: each job through its own checks, one at a time; another account’s is NOT_FOUND',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const accB = await accountOf(B)
    const paused = await seed(pool, acc, { jobs: ['paused'] })
    const failed = await seed(pool, acc, { jobs: ['failed'] })
    const done = await seed(pool, acc, { jobs: ['completed'] })
    const theirs = await seed(pool, accB, { jobs: ['paused'] })
    const res = await call(A, 'POST', BULK, {
      action: 'resume',
      requestId: 'bulk-00000001',
      jobIds: [paused.latestJobId, failed.latestJobId, done.latestJobId, theirs.latestJobId]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.results, [
      { jobId: paused.latestJobId, ok: true },
      { jobId: failed.latestJobId, ok: true },
      { jobId: done.latestJobId, ok: false, code: 'JOB_NOT_RESUMABLE' },
      { jobId: theirs.latestJobId, ok: false, code: 'NOT_FOUND' }
    ])
    assert.deepEqual([res.body.done, res.body.skipped, res.body.failed], [2, 1, 1])
    const theirState = await pool.query('select state from wo_job where id = $1', [theirs.latestJobId])
    assert.equal(theirState.rows[0].state, 'paused', 'B’s job is not touched')

    const cancel = await call(A, 'POST', BULK, {
      action: 'cancel',
      requestId: 'bulk-00000002',
      jobIds: [paused.latestJobId, done.latestJobId]
    })
    assert.deepEqual(cancel.body.results, [
      { jobId: paused.latestJobId, ok: true },
      { jobId: done.latestJobId, ok: false, code: 'JOB_FINISHED' }
    ])
  }
)

test(
  'bulk by filter: the server picks the latest job of each matching row once; over 500 is TOO_MANY',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const a = await seed(pool, acc, { name: 'Pho One', jobs: ['completed', 'failed'] })
    const b = await seed(pool, acc, { name: 'Pho Two', jobs: ['blocked'] })
    await seed(pool, acc, { name: 'Bun', jobs: ['paused'] })
    await seed(pool, acc, { name: 'Pho Fresh' })
    const res = await call(A, 'POST', BULK, {
      action: 'resume',
      requestId: 'bulk-00000003',
      filter: { attention: true, q: 'pho' }
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.results.map((r) => r.jobId).sort(), [a.latestJobId, b.latestJobId].sort())
    assert.equal(res.body.done, 2)
    const after = await call(A, 'GET', `${BASE}?attention=1`)
    assert.deepEqual(
      after.body.opportunities.map((o) => o.name),
      ['Bun']
    )

    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id)
     select $1, 'Many ' || g, 'osm', 'many/' || g from generate_series(1, 501) g`,
      [acc]
    )
    await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state)
     select account_id, id, 'research', 'many-' || id, 'cancelled' from wo_opportunity where name like 'Many %'`
    )
    const tooMany = await call(A, 'POST', BULK, {
      action: 'resume',
      requestId: 'bulk-00000004',
      filter: { stage: 'cancelled' }
    })
    assert.equal(tooMany.status, 422)
    assert.equal(tooMany.body.code, 'TOO_MANY')
    const untouched = await pool.query(`select count(*)::int as n from wo_job where state = 'queued'`)
    assert.equal(untouched.rows[0].n, 2, 'nothing ran: refused, never cut')
    const ids = Array.from({ length: 501 }, () => randomUUID())
    const tooManyIds = await call(A, 'POST', BULK, {
      action: 'cancel',
      requestId: 'bulk-00000005',
      jobIds: ids
    })
    assert.equal(tooManyIds.status, 422)
    assert.equal(tooManyIds.body.code, 'TOO_MANY')
  }
)

test(
  'bulk: the same requestId answers the stored result without running again; another body is refused',
  opts,
  async () => {
    const { pool, call, accountOf } = await world()
    const acc = await accountOf(A)
    const paused = await seed(pool, acc, { jobs: ['paused'] })
    const body = { action: 'resume', requestId: 'bulk-00000006', jobIds: [paused.latestJobId] }
    const first = await call(A, 'POST', BULK, body)
    assert.equal(first.body.done, 1)
    // The job moves on; a replay must not resume it a second time nor report a different outcome.
    await pool.query(`update wo_job set state = 'paused' where id = $1`, [paused.latestJobId])
    const replay = await call(A, 'POST', BULK, body)
    assert.equal(replay.status, 200)
    assert.deepEqual(replay.body, first.body)
    assert.equal(
      (await pool.query('select state from wo_job where id = $1', [paused.latestJobId])).rows[0].state,
      'paused'
    )
    const reused = await call(A, 'POST', BULK, { ...body, action: 'cancel' })
    assert.equal(reused.status, 409)
    assert.equal(reused.body.code, 'REQUEST_ID_REUSED')
  }
)

test('bulk: input checked; resume is off with the switch, cancel still stops', opts, async () => {
  const { pool, call, accountOf, setSwitch } = await world()
  const acc = await accountOf(A)
  const paused = await seed(pool, acc, { jobs: ['paused'] })
  for (const [body, code] of [
    [{ action: 'delete', requestId: 'bulk-00000007', jobIds: [paused.latestJobId] }, 'INVALID_ACTION'],
    [{ action: 'cancel', requestId: 'x', jobIds: [paused.latestJobId] }, 'INVALID_REQUEST_ID'],
    [{ action: 'cancel', requestId: 'bulk-00000008' }, 'INVALID_SELECTION'],
    [{ action: 'cancel', requestId: 'bulk-00000008', jobIds: ['nope'] }, 'INVALID_SELECTION'],
    [{ action: 'cancel', requestId: 'bulk-00000008', filter: { stage: 'done' } }, 'INVALID_SELECTION']
  ]) {
    const res = await call(A, 'POST', BULK, body)
    assert.equal(res.status, 400, code)
    assert.equal(res.body.code, code)
  }
  await setSwitch(false)
  const resume = await call(A, 'POST', BULK, {
    action: 'resume',
    requestId: 'bulk-00000009',
    jobIds: [paused.latestJobId]
  })
  assert.equal(resume.body.code, 'FEATURE_OFF')
  const cancel = await call(A, 'POST', BULK, {
    action: 'cancel',
    requestId: 'bulk-00000010',
    jobIds: [paused.latestJobId]
  })
  assert.equal(cancel.status, 200)
  assert.equal(cancel.body.done, 1)
  assert.equal((await call(null, 'POST', BULK, { action: 'cancel' })).status, 401)
})

test('bulk resume skips a job whose opportunity already has another one running', opts, async () => {
  const { pool, call, accountOf } = await world()
  const acc = await accountOf(A)
  const busy = await seed(pool, acc, { jobs: ['cancelled', 'running'] })
  const res = await call(A, 'POST', BULK, {
    action: 'resume',
    requestId: 'bulk-00000011',
    jobIds: [busy.jobIds[0]]
  })
  assert.deepEqual(res.body.results, [{ jobId: busy.jobIds[0], ok: false, code: 'JOB_ACTIVE' }])
  assert.equal(res.body.skipped, 1)
})

test(
  'rows carry the Opportunity score Find gives, from what is already cached; nothing is fetched',
  opts,
  async () => {
    const { pool, call, accountOf, fetched } = await world()
    const account = await accountOf(A)
    const website = 'https://pho-hoa.example'
    const { rows } = await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
     values ($1, 'Pho Hoa', 'osm', 'node/pho', $2) returning id`,
      [
        account,
        JSON.stringify({
          provider: 'osm',
          providerId: 'node/pho',
          name: 'Pho Hoa',
          website,
          rating: 4.6,
          reviews: 900,
          socials: {}
        })
      ]
    )
    // A check already done for its website: read from the cache, never asked again.
    await pool.query(
      `insert into wo_site_check (url_key, url, status, performance, seo, https, mobile_friendly, checked_at)
     values ($1, $2, 'done', 31, 70, true, false, now())`,
      [urlKeyOf(website), website]
    )
    const before = fetched.length
    const paged = await call(A, 'GET', `${BASE}?limit=50`)
    assert.equal(paged.status, 200)
    const row = paged.body.opportunities.find((r) => r.id === rows[0].id)
    assert.ok(row.score && typeof row.score.score === 'number' && ['A', 'B', 'C'].includes(row.score.grade))
    assert.equal(row.score.pending, false)
    assert.ok(Array.isArray(row.score.reasons) && row.score.reasons.length > 0)
    assert.equal(row.siteCheck.status, 'done')
    assert.equal(row.siteCheck.performance, 31)

    const polled = await call(A, 'GET', `${BASE}?ids=${rows[0].id}`)
    assert.deepEqual(polled.body.opportunities[0].score, row.score)
    const whole = await call(A, 'GET', BASE)
    assert.equal(whole.body.opportunities.find((r) => r.id === rows[0].id).score.grade, row.score.grade)
    assert.equal(fetched.length, before, 'the list never calls a provider')
  }
)

test('a server whose domain cannot load answers score null and still lists every row', opts, async () => {
  const ok = await world()
  const account = await ok.accountOf(A)
  await seed(ok.pool, account, { name: 'Listed anyway' })
  const broken = await world({ domainFails: true })
  const still = await broken.call(A, 'GET', `${BASE}?limit=50`)
  assert.equal(still.status, 200)
  assert.deepEqual(
    still.body.opportunities.map((r) => [r.name, r.score]),
    [['Listed anyway', null]]
  )
})

test('/ops/wo links a demo at its site key, which already carries the site domain', opts, async () => {
  const { pool, accountOf } = await world()
  const acc = await accountOf(A)
  const demo = await seed(pool, acc, { name: 'Linked demo', jobs: ['completed'], build: 'done' })
  await pool.query(
    `update wo_build set state='done', site_key='wo-demo-linked.localhost'
      where revision_id in (select id from wo_revision where opportunity_id=$1)`,
    [demo.id]
  )
  const row = (await listWoQueue(pool, readConfig(env))).opportunities.find((o) => o.id === demo.id)
  assert.equal(row.demoSite, 'wo-demo-linked.localhost')
  assert.equal(row.demoUrl, 'http://wo-demo-linked.localhost:8080/')
})
