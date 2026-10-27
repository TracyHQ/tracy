/**
 * A job row must end up saying how the job ended — even when the caller that filed it stopped
 * waiting first.
 *
 * `runSiteJob` (`sites/route.js`) files the row and writes the host's answer onto it on every poll,
 * but only until its own deadline: `/moment` waits 45 s, the seal at turn open 15 s. The host's job
 * runs on past that (a moment queued behind another webroot job on the same site), and once the
 * door has answered nothing ever asks again. Measured 05/10/2026 on the local stand: 192
 * `webroot-moment` and 32 `webroot-seal-outside` rows still `running`, their last write 45 s and
 * 15 s after they were filed, while the host's own record of every one of them said `done` or
 * `failed`. A tracy-web restart mid-poll leaves the same thing behind.
 *
 * So a sweep asks the host for every row nobody has written for a while, and writes down what the
 * host says — the same write a poll makes. It never decides an ending itself, never puts an older
 * answer over a newer write, and a row it can get no answer for goes to the back of the queue
 * instead of holding the front.
 */
import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { mintSession } from '../src/lib/session.js'
import { settleQuietJobs } from '../src/cron.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

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

/**
 * A host whose jobs answer what `answers[id]` says at the moment of the poll — a test changes the
 * map to let a job end while nobody is looking. An id with no answer is one the host does not know
 * (404, as `GET /_host/jobs/:id` answers). `/_host/site` takes every job as `site-job-1`.
 */
function fakeHost(answers) {
  const polls = []
  const fetchImpl = async (input) => {
    const path = new URL(String(input)).pathname
    if (path === '/_host/site') return new Response(JSON.stringify({ jobId: 'site-job-1' }), { status: 202 })
    if (path.startsWith('/_host/jobs/')) {
      const id = path.slice('/_host/jobs/'.length)
      polls.push(id)
      const answer = answers[id]
      return answer
        ? new Response(JSON.stringify({ id, ...answer }), { status: 200 })
        : new Response(JSON.stringify({ code: 'NOT_FOUND' }), { status: 404 })
    }
    return new Response('{}', { status: 200 })
  }
  return { fetchImpl, polls }
}

function harness(pool, { fetchImpl, now }) {
  const config = readConfig({ ...env, DATABASE_URL: url })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    ...(now ? { now } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    )
  return { config, cookieFor, send }
}

async function site(pool, siteKey, label, { demo = false } = {}) {
  await pool.query('insert into site (site_key, label, host, demo) values ($1, $2, $3, $4)', [
    siteKey,
    label,
    'local',
    demo
  ])
}

async function ownedSite(pool) {
  await site(pool, 'lantern.localhost', 'lantern')
  const { rows } = await pool.query("insert into account (email) values ('owner@x.y') returning id")
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at)
     values ('lantern.localhost', $1, 'owner', $1, now())`,
    [rows[0].id]
  )
}

/** A row as `runSiteJob` leaves it after its last poll: `running`, last written `quietFor` ago. */
async function openJob(
  pool,
  id,
  { siteKey = 'lantern.localhost', kind = 'webroot-moment', quietFor = '5 minutes', host = 'local' } = {}
) {
  await pool.query(
    `insert into job (id, site_key, host, kind, state, step, created_at, updated_at)
     values ($1, $2, $5, $3, 'running', $3, now() - interval '1 hour', now() - $4::interval)`,
    [id, siteKey, kind, quietFor, host]
  )
}

/** `count` such rows at once, `<prefix>-1` … `<prefix>-<count>`. */
async function openJobs(pool, prefix, count, { quietFor, host = 'local' }) {
  await pool.query(
    `insert into job (id, site_key, host, kind, state, step, created_at, updated_at)
     select $1 || '-' || n, 'lantern.localhost', $3, 'webroot-moment', 'running', 'webroot-moment',
            now() - interval '1 hour', now() - $4::interval
       from generate_series(1, $2::int) n`,
    [prefix, count, host, quietFor]
  )
}

const jobRow = async (pool, id) => (await pool.query('select * from job where id = $1', [id])).rows[0]

const quiet = { info() {}, warn() {}, error() {} }

/** Everything but `updated_at`: what a row SAYS, as opposed to when it was last looked at. */
const said = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'updated_at'))

const MOMENT = '{"ok":true,"committed":true,"files":2,"head":"abc","sha":"abc","paths":["a.css","b.scss"]}'

test(
  'a moment whose door stopped waiting is written down as the host ended it, by the sweep',
  opts,
  async () => {
    const { pool } = db
    const answers = { 'site-job-1': { state: 'running', step: 'webroot-moment' } }
    const { fetchImpl, polls } = fakeHost(answers)
    // Time jumps 100 s the moment the host is first asked how the job is going: past the door's
    // 45 s however often the door reads the clock, so the door answers after one real poll.
    const now = () => Date.now() + (polls.length > 0 ? 100_000 : 0)
    const { config, cookieFor, send } = harness(pool, { fetchImpl, now })
    await ownedSite(pool)

    // The door polls once, reaches its deadline and answers; the host's job is still going. Since ledger L31
    // that is not a failure: the door answers 202 `FLEET_JOB_PENDING` (the dsh takes it as recorded) and the
    // sweep follows the job to its end.
    const res = await send('POST', '/api/sites/lantern.localhost/moment', await cookieFor('owner@x.y'), {
      title: 'agent: fixed the footer'
    })
    assert.equal(res.status, 202)
    assert.deepEqual(await res.json(), { code: 'FLEET_JOB_PENDING' })
    assert.equal((await jobRow(pool, 'site-job-1')).state, 'running')

    // The host finishes with nobody asking. Only the sweep is left to ask.
    answers['site-job-1'] = { state: 'done', step: 'webroot-moment', exitCode: 0, output: MOMENT }
    const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
    assert.equal(swept.settled, 1)
    const row = await jobRow(pool, 'site-job-1')
    assert.equal(row.state, 'done')
    assert.equal(row.detail.output, MOMENT)
  }
)

test(
  'the sweep writes only what the host says: still running stays running, an unknown job says what it said',
  opts,
  async () => {
    const { pool } = db
    await site(pool, 'lantern.localhost', 'lantern')
    await openJob(pool, 'still-going', { kind: 'webroot-backup' })
    await openJob(pool, 'ended-badly', { kind: 'webroot-seal-outside' })
    await openJob(pool, 'not-known')
    const { fetchImpl } = fakeHost({
      'still-going': { state: 'running', step: 'database' },
      'ended-badly': {
        state: 'failed',
        step: 'webroot-seal-outside',
        exitCode: 1,
        output: 'another webroot job holds this site; try again shortly'
      }
    })
    const config = readConfig({ ...env, DATABASE_URL: url })
    const before = await jobRow(pool, 'not-known')

    const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
    assert.equal(swept.settled, 1)
    assert.equal((await jobRow(pool, 'ended-badly')).state, 'failed')
    // A job the host is still running is never written down as ended — only its step moves on.
    const going = await jobRow(pool, 'still-going')
    assert.equal(going.state, 'running')
    assert.equal(going.step, 'database')
    // A 404 is not an ending: nothing is known about how the job went, so nothing it says changes.
    // Only its place in the queue does — see the next tests.
    const unknown = await jobRow(pool, 'not-known')
    assert.deepEqual(said(unknown), said(before))
    assert.ok(unknown.updated_at > before.updated_at)
  }
)

test('a row its caller is still writing is not asked about', opts, async () => {
  const { pool } = db
  await site(pool, 'lantern.localhost', 'lantern')
  await openJob(pool, 'being-polled', { quietFor: '1 second' })
  const { fetchImpl, polls } = fakeHost({ 'being-polled': { state: 'done', output: MOMENT } })
  const config = readConfig({ ...env, DATABASE_URL: url })

  const swept = await settleQuietJobs(pool, config, { fetchImpl })
  assert.equal(swept.settled, 0)
  assert.deepEqual(polls, [])
  assert.equal((await jobRow(pool, 'being-polled')).state, 'running')
})

test('a host that does not answer is asked once per sweep, not once per row', opts, async () => {
  const { pool } = db
  await site(pool, 'lantern.localhost', 'lantern')
  await openJob(pool, 'a', { quietFor: '3 minutes' })
  await openJob(pool, 'b', { quietFor: '4 minutes' })
  await openJob(pool, 'c', { quietFor: '5 minutes' })
  let calls = 0
  const fetchImpl = async () => {
    calls++
    throw new TypeError('fetch failed')
  }
  const config = readConfig({ ...env, DATABASE_URL: url })

  const before = await Promise.all(['a', 'b', 'c'].map((id) => jobRow(pool, id)))

  const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(swept.settled, 0)
  assert.equal(calls, 1)
  // Every one of its rows still says what it said, and goes to the back of the queue.
  for (const row of before) {
    const now = await jobRow(pool, row.id)
    assert.deepEqual(said(now), said(row))
    assert.ok(now.updated_at > row.updated_at, row.id)
  }
})

test(
  'rows no host can answer for never hold the queue: an answerable row behind 20+ of them is still settled',
  opts,
  async () => {
    const { pool } = db
    await site(pool, 'lantern.localhost', 'lantern')
    // On a host this process no longer has a channel to — never asked, never touched.
    await openJobs(pool, 'gone', 25, { quietFor: '3 hours', host: 'retired' })
    // Job files the host no longer has (404), older AND newer than the one row it can answer for.
    await openJobs(pool, 'lost-old', 21, { quietFor: '2 hours' })
    await openJob(pool, 'answerable', { quietFor: '1 hour' })
    await openJobs(pool, 'lost-new', 21, { quietFor: '10 minutes' })
    const { fetchImpl, polls } = fakeHost({ answerable: { state: 'done', output: MOMENT } })
    const config = readConfig({ ...env, DATABASE_URL: url })
    const gone = await jobRow(pool, 'gone-1')

    await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
    await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
    assert.equal((await jobRow(pool, 'answerable')).state, 'done')
    assert.ok(!polls.some((id) => id.startsWith('gone-')))
    assert.deepEqual(await jobRow(pool, 'gone-1'), gone)
    const lost = await jobRow(pool, 'lost-old-1')
    assert.equal(lost.state, 'running')
  }
)

test('an answer never goes over a write made after the sweep read the row', opts, async () => {
  const { pool } = db
  await site(pool, 'lantern.localhost', 'lantern')
  await openJob(pool, 'raced')
  const config = readConfig({ ...env, DATABASE_URL: url })
  // While the sweep waits for the host, the door's own last poll writes the ending; the answer the
  // sweep then gets back is older than that write.
  const fetchImpl = async () => {
    await pool.query(
      `update job set state = 'done', step = 'webroot-moment', detail = $2::jsonb, updated_at = now()
       where id = $1`,
      ['raced', JSON.stringify({ state: 'done', output: MOMENT })]
    )
    return new Response(JSON.stringify({ id: 'raced', state: 'running', step: 'webroot-moment' }), {
      status: 200
    })
  }

  const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(swept.settled, 0)
  const row = await jobRow(pool, 'raced')
  assert.equal(row.state, 'done')
  assert.equal(row.detail.output, MOMENT)
})

/** A site with an owner of record, so a provision ending on it is announced (`updateJob`). */
async function createdSite(pool, siteKey, label) {
  const { rows } = await pool.query(
    'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
    ['owner@x.y']
  )
  await pool.query(
    'insert into site (site_key, label, host, platform, created_by) values ($1, $2, $3, $4, $5)',
    [siteKey, label, 'local', 'wordpress', rows[0].id]
  )
}

test(
  'a provision that failed days ago is written down without telling ops it just got stuck',
  opts,
  async () => {
    const { pool } = db
    const config = readConfig({ ...env, DATABASE_URL: url })
    createOpsSignal({ pool, config, log: quiet })
    await createdSite(pool, 'kestrel.localhost', 'kestrel')
    await createdSite(pool, 'marlin.localhost', 'marlin')
    await openJob(pool, 'old-build', { siteKey: 'kestrel.localhost', kind: 'provision' })
    await openJob(pool, 'new-build', { siteKey: 'marlin.localhost', kind: 'provision' })
    const { fetchImpl } = fakeHost({
      'old-build': { state: 'failed', step: 'docker build', updatedAt: Date.now() - 3 * 86_400_000 },
      'new-build': { state: 'failed', step: 'docker build', updatedAt: Date.now() - 60_000 }
    })

    const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
    assert.equal(swept.settled, 2)
    assert.equal((await jobRow(pool, 'old-build')).state, 'failed')
    const { rows } = await pool.query('select kind, site_key from ops_signal order by site_key')
    assert.deepEqual(rows, [{ kind: 'site.stuck', site_key: 'marlin.localhost' }])
  }
)

test('a sweep still running when the next tick comes is not run twice', opts, async () => {
  const { pool } = db
  await site(pool, 'lantern.localhost', 'lantern')
  await openJob(pool, 'slow')
  const config = readConfig({ ...env, DATABASE_URL: url })
  let calls = 0
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  let asked
  const askedOnce = new Promise((resolve) => {
    asked = resolve
  })
  const fetchImpl = async () => {
    calls++
    asked()
    await held
    return new Response(JSON.stringify({ id: 'slow', state: 'done', output: MOMENT }), { status: 200 })
  }

  const first = settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
  await askedOnce
  // The second run answers at once; one that waited on the first would still be waiting here.
  const second = settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
  const early = await Promise.race([
    second,
    new Promise((resolve) => setTimeout(() => resolve('still waiting on the first'), 200))
  ])
  release()
  await second
  assert.deepEqual(early, { ran: false, settled: 0 })
  assert.equal(calls, 1)
  assert.deepEqual(await first, { ran: true, settled: 1 })
})

// A demo's jobs belong to the demo sweep (`sweepDemos`), which ACTS on their endings — a removal
// takes the demo away, a teardown asks for the new copy — and finds them while they still say
// `queued`/`running` (`unsettledDemoJobs`). Settled here first, a removal would never be acted on.
test("a demo's jobs are left to the demo sweep", opts, async () => {
  const { pool } = db
  await site(pool, 'harbour.localhost', 'harbour', { demo: true })
  await openJob(pool, 'remove-1', { siteKey: 'harbour.localhost', kind: 'remove' })
  const { fetchImpl, polls } = fakeHost({ 'remove-1': { state: 'done', step: 'teardown' } })
  const config = readConfig({ ...env, DATABASE_URL: url })

  const swept = await settleQuietJobs(pool, config, { fetchImpl, staleMs: 0 })
  assert.equal(swept.settled, 0)
  assert.deepEqual(polls, [])
  assert.equal((await jobRow(pool, 'remove-1')).state, 'running')
})
