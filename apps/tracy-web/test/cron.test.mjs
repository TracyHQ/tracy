// Task 9: the two periodic jobs — sweeping this app's own expiring rows (otp_code, oauth_state,
// the rate_bucket rows flagged unswept since Task 2), and the nightly `/gateway/seat/sweep` call
// on every host, ported from `workers/cowork-web/src/worker.js`'s `scheduled()`/`gcGuestVisitors`.

import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { start, sweepClaims, sweepExpired, sweepHosts, sweepWidgetConversations } from '../src/cron.js'
import { readSweep } from '../src/inventory/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const opts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

function configWithHosts(hosts) {
  return { hosts: new Map(hosts) }
}

test(
  'sweepExpired: deletes otp_code/oauth_state past their expiry, and rate_bucket older than two days — live rows are untouched',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into otp_code (email, code_hash, expires_at) values ('old@x.y', 'h', now() - interval '1 hour')"
    )
    await pool.query(
      "insert into otp_code (email, code_hash, expires_at) values ('live@x.y', 'h', now() + interval '1 hour')"
    )
    await pool.query(
      "insert into oauth_state (state, provider, next, expires_at) values ('old-state', 'google', '/', now() - interval '1 hour')"
    )
    await pool.query(
      "insert into oauth_state (state, provider, next, expires_at) values ('live-state', 'google', '/', now() + interval '1 hour')"
    )
    await pool.query(
      "insert into rate_bucket (bucket, window_start, count) values ('b', now() - interval '3 days', 1)"
    )
    await pool.query(
      "insert into rate_bucket (bucket, window_start, count) values ('b', now() - interval '1 hour', 1)"
    )

    const result = await sweepExpired(pool)
    assert.equal(result.ran, true)

    const otp = (await pool.query('select email from otp_code order by email')).rows.map((r) => r.email)
    assert.deepEqual(otp, ['live@x.y'])
    const states = (await pool.query('select state from oauth_state')).rows.map((r) => r.state)
    assert.deepEqual(states, ['live-state'])
    const buckets = (await pool.query('select window_start from rate_bucket')).rows
    assert.equal(buckets.length, 1)
  }
)

test(
  'sweepExpired: a second replica holding the advisory lock makes this call skip its tick (ran: false), and nothing is deleted',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      "insert into otp_code (email, code_hash, expires_at) values ('old@x.y', 'h', now() - interval '1 hour')"
    )
    const holder = await pool.connect()
    await holder.query('select pg_advisory_lock(7243002)')
    try {
      const result = await sweepExpired(pool)
      assert.equal(result.ran, false)
      const otp = (await pool.query('select email from otp_code')).rows
      assert.equal(otp.length, 1) // untouched — the sweep never ran
    } finally {
      await holder.query('select pg_advisory_unlock(7243002)')
      holder.release()
    }
  }
)

test(
  'sweepHosts: calls /gateway/seat/sweep on every configured host with {olderThanDays: 2}, one dead host does not cancel the others',
  opts,
  async () => {
    const { pool } = db
    const calls = []
    const fetchImpl = async (input, init) => {
      calls.push({ url: String(input), body: JSON.parse(init.body) })
      if (String(input).startsWith('http://dead')) throw new Error('connection refused')
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    const config = configWithHosts([
      ['alpha', { dshOrigin: 'http://alpha-dsh', seatSecret: 'ka' }],
      ['dead', { dshOrigin: 'http://dead-dsh', seatSecret: 'kd' }],
      ['beta', { dshOrigin: 'http://beta-dsh', seatSecret: 'kb' }]
    ])
    const warnings = []
    const result = await sweepHosts(pool, config, { fetchImpl, log: { warn: (m) => warnings.push(m) } })
    assert.equal(result.ran, true)
    assert.equal(calls.length, 3)
    for (const call of calls) {
      assert.ok(call.url.endsWith('/gateway/seat/sweep'))
      assert.deepEqual(call.body, { olderThanDays: 2 })
    }
    assert.equal(result.failed.length, 1)
    assert.match(result.failed[0], /^dead \(/)
    assert.equal(warnings.length, 1)
    // The door name, never the secret — same discipline as the Worker's own `gcGuestVisitors`.
    assert.ok(!warnings[0].includes('ka') && !warnings[0].includes('kb') && !warnings[0].includes('kd'))
  }
)

test('sweepHosts and sweepExpired share one advisory lock: one running blocks the other', opts, async () => {
  const { pool } = db
  const holder = await pool.connect()
  await holder.query('select pg_advisory_lock(7243002)')
  try {
    const result = await sweepHosts(pool, configWithHosts([]), {
      fetchImpl: async () => new Response('{}')
    })
    assert.equal(result.ran, false)
    assert.deepEqual(result.failed, [])
  } finally {
    await holder.query('select pg_advisory_unlock(7243002)')
    holder.release()
  }
})

test(
  'start/stop: returns a stop function, and stopping clears both timers (no crash, no dangling handle)',
  opts,
  async () => {
    const { pool } = db
    const config = configWithHosts([])
    // The timers start() sets, and the ones stop() clears, recorded on the way through.
    const made = []
    const cleared = new Set()
    const real = { setInterval, setTimeout, clearInterval, clearTimeout }
    let cron
    try {
      globalThis.setInterval = (...args) => {
        const timer = real.setInterval(...args)
        made.push(timer)
        return timer
      }
      globalThis.setTimeout = (...args) => {
        const timer = real.setTimeout(...args)
        made.push(timer)
        return timer
      }
      cron = start(pool, config, {
        fetchImpl: async () => new Response('{}'),
        log: { warn() {}, error() {} }
      })
    } finally {
      globalThis.setInterval = real.setInterval
      globalThis.setTimeout = real.setTimeout
    }
    assert.ok(made.length >= 2, 'start schedules its periodic jobs')
    try {
      globalThis.clearInterval = (timer) => (cleared.add(timer), real.clearInterval(timer))
      globalThis.clearTimeout = (timer) => (cleared.add(timer), real.clearTimeout(timer))
      cron.stop()
    } finally {
      globalThis.clearInterval = real.clearInterval
      globalThis.clearTimeout = real.clearTimeout
    }
    assert.equal(
      made.filter((timer) => !cleared.has(timer)).length,
      0,
      'every timer start set is cleared by stop'
    )
  }
)

// ── Fix round 1 (Minor): calling start() twice in one process must not double-schedule ──────────
//
// The advisory-lock tests above correctly prove the thing that matters across REPLICAS. This is
// the other half: one process, no intervening stop(), must not end up with two independent
// setInterval/setTimeout chains each separately racing for the advisory lock on its own schedule.
test(
  'start(): a second call while already running is a no-op — same handle back, a warning logged, no second schedule',
  opts,
  async () => {
    const { pool } = db
    const config = configWithHosts([])
    const warnings = []
    const log = { warn: (m) => warnings.push(m), error() {} }
    const first = start(pool, config, { fetchImpl: async () => new Response('{}'), log })
    try {
      const second = start(pool, config, { fetchImpl: async () => new Response('{}'), log })
      assert.strictEqual(second, first) // the SAME controller — no second pair of timers made
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /already running/)
    } finally {
      first.stop()
    }
  }
)

test('start(): after stop(), start() runs again and returns a FRESH handle', opts, async () => {
  const { pool } = db
  const config = configWithHosts([])
  const first = start(pool, config, {
    fetchImpl: async () => new Response('{}'),
    log: { warn() {}, error() {} }
  })
  first.stop()
  const second = start(pool, config, {
    fetchImpl: async () => new Response('{}'),
    log: { warn() {}, error() {} }
  })
  try {
    assert.notStrictEqual(second, first)
  } finally {
    second.stop()
  }
})

test('start(): the boot refill is stamped, so /ops can say the timer is alive', opts, async () => {
  const { pool } = db
  const cron = start(pool, configWithHosts([]), {
    fetchImpl: async () => new Response('{}'),
    log: { warn() {}, error() {}, info() {} }
  })
  try {
    // No pool is enabled, so the passes are reads and the run ends in milliseconds; the wait is
    // for the stamps, not for any work.
    let sweep = await readSweep(pool)
    for (let i = 0; i < 50 && sweep.lastFinishedAt === null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      sweep = await readSweep(pool)
    }
    assert.notEqual(sweep.lastStartedAt, null, 'the boot run was never stamped')
    assert.notEqual(sweep.lastFinishedAt, null, 'the boot run never recorded its end')
    assert.equal(sweep.lastError, null)
    assert.equal(sweep.lastOutcome.enqueued, 0)
    assert.equal(sweep.revision, 0, 'a run is not an edit of the period')
  } finally {
    cron.stop()
  }
})

test(
  'sweepClaims: a claim older than a day goes back — folder, site, seat, creation — a fresh or built one stays',
  opts,
  async () => {
    const { pool } = db
    const { rows: acc } = await pool.query("insert into account (email) values ('o@x.y') returning id")
    const accountId = acc[0].id
    const mk = async (label, state, age, jobId = null) => {
      await pool.query(
        "insert into site (site_key, label, host, platform, origin, created_by) values ($1, $2, 'local', 'emdash', 'fleet_born', $3)",
        [`${label}.localhost`, label, accountId]
      )
      await pool.query("insert into seat (site_key, account_id, role) values ($1, $2, 'owner')", [
        `${label}.localhost`,
        accountId
      ])
      await pool.query(
        `insert into site_creation (account_id, build_id, payload_hash, state, site_key, job_id, updated_at) values ($1, $2, 'h', $3, $4, $5, now() - $6::interval)`,
        [accountId, `${label}-build`, state, `${label}.localhost`, jobId, age]
      )
    }
    await mk('old-claim', 'claimed', '30 hours')
    await mk('fresh-claim', 'claimed', '1 hour')
    await mk('built', 'provisioning', '30 hours', 'job-1')
    await mk('lived-in', 'claimed', '30 hours')
    const calls = []
    const hostCall = async (_config, _host, path, payload) => {
      calls.push({ path, payload })
      return {
        ok: true,
        status: 200,
        body: {
          ok: true,
          removed: payload.label !== 'lived-in',
          ...(payload.label === 'lived-in' ? { reason: 'the folder holds a site' } : {})
        }
      }
    }
    const warned = []
    const result = await sweepClaims(pool, configWithHosts([]), {
      hostCall,
      log: { warn: (m) => warned.push(m), error: () => {} }
    })
    assert.deepEqual(result.released, ['old-claim.localhost'])
    assert.deepEqual(calls.map((c) => c.payload.label).sort(), ['lived-in', 'old-claim'])
    const { rows } = await pool.query('select label from site order by label')
    assert.deepEqual(
      rows.map((r) => r.label),
      ['built', 'fresh-claim', 'lived-in']
    )
    assert.equal(
      (await pool.query("select count(*)::int as n from seat where site_key = 'old-claim.localhost'")).rows[0]
        .n,
      0
    )
    assert.equal(
      (await pool.query("select count(*)::int as n from site_creation where build_id = 'old-claim-build'"))
        .rows[0].n,
      0
    )
    assert.ok(warned.some((m) => /lived-in.*kept/.test(m)))
  }
)

// 🔒 A PARTIAL LOGGER MUST NOT BE A LANDMINE. `start()` documents `log = console`, but callers
// pass whatever their test needed — `{}` or `{ log, warn }` — and the gap only detonates on a
// failure path, in whichever unrelated test happens to be running when something throws. This
// asserts the deterministic half of that class: the "already running" notice goes through `warn`,
// so a logger without `warn` used to throw from a call whose whole job was to report and move on.
test('start(): a logger missing a method is completed, not detonated', opts, async () => {
  const { pool } = db
  let first = null
  try {
    const config = configWithHosts([])
    first = start(pool, config, { log: {} })
    const again = start(pool, config, { log: {} })
    assert.equal(again, first, 'the second call returns the running handle instead of a second set of timers')
  } finally {
    first?.stop()
  }
})

// ── The publish operations nobody is reading (`sweepPublishOps`) ─────────────────────────────────
// An operation that is not ended is asked about on its host in the background, under its own key:
// one whose door died after reserving it (`starting`, no job, nothing in the follow-up book), one
// whose host lost its record, one the customer closed the tab on. Every time in these tests is the
// database's own (`now()`, intervals): nothing here measures a row against this process's clock.
// Read through a namespace so this file still loads on a tree without the sweep.
import * as cronModule from '../src/cron.js'
import { readConfig } from '../src/config.js'

const sweepConfig = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const quiet = { info() {}, warn() {}, error() {} }
const closing = (op, label) => `TRACY_RESULT go_live=${op} label=${label} platform=wordpress`

/**
 * A host that keeps go-live jobs by key, as `tracy-host` does: a new key is a new job, a key whose
 * job has no record (or none that is an outcome) is that job started again. `down` makes it
 * unreachable; `onGoLive` runs before each go-live is answered.
 */
function sweepHost() {
  const host = { calls: [], jobs: {}, keyed: new Map(), reruns: [], down: false, onGoLive: null }
  host.fetchImpl = async (input, init) => {
    const u = new URL(String(input))
    const body = init?.body ? JSON.parse(init.body) : null
    host.calls.push({ path: u.pathname, body })
    if (host.down) throw new Error('connect ECONNREFUSED')
    if (u.pathname === '/_host/go-live') {
      if (host.onGoLive) await host.onGoLive(body)
      const known = host.keyed.get(body.jobKey)
      if (known !== undefined) {
        const record = host.jobs[known]
        if (
          record &&
          (record.state === 'queued' || record.state === 'running' || Number.isInteger(record.exitCode))
        )
          return Response.json({ jobId: known, reused: true }, { status: 202 })
        host.jobs[known] = { state: 'queued', step: `go-live:${body.op}` }
        host.reruns.push(known)
        return Response.json({ jobId: known }, { status: 202 })
      }
      const id = `job-${host.keyed.size + 1}`
      host.keyed.set(body.jobKey, id)
      host.jobs[id] = { state: 'queued', step: `go-live:${body.op}` }
      return Response.json({ jobId: id }, { status: 202 })
    }
    if (u.pathname.startsWith('/_host/jobs/')) {
      const record = host.jobs[u.pathname.slice('/_host/jobs/'.length)]
      return record ? Response.json(record) : Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    }
    return new Response(null, { status: 404 })
  }
  host.goLives = () => host.calls.filter((call) => call.path === '/_host/go-live')
  host.keys = () => [...new Set(host.goLives().map((call) => call.body.jobKey))]
  return host
}

/** A site with an operation that is not ended, due for the sweep's look. */
async function heldOp(
  pool,
  { label = 'lantern', op = 'live', state = 'starting', jobId = null, ref = `${label}ref` } = {}
) {
  const siteKey = `${label}.localhost`
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
  await pool.query(
    `insert into site_publish_op (site_key, op, state, ref, job_id, sweep_at)
     values ($1, $2, $3, $4, $5, now() - interval '1 second')`,
    [siteKey, op, state, ref, jobId]
  )
  if (jobId)
    await pool.query("insert into job (id, site_key, host, kind) values ($1, $2, 'local', 'go-live')", [
      jobId,
      siteKey
    ])
  return siteKey
}
const opOf = async (pool, siteKey) =>
  (await pool.query('select * from site_publish_op where site_key = $1', [siteKey])).rows[0]
const due = (pool) => pool.query("update site_publish_op set sweep_at = now() - interval '1 second'")
const sweep = (pool, host, more = {}) =>
  cronModule.sweepPublishOps(pool, sweepConfig, { fetchImpl: host.fetchImpl, log: quiet, ...more })

test(
  'an operation whose door died after reserving it — starting, no job, nothing owed in the follow-up book — is handed to its host by the sweep under its own key, and reaches its outcome with nobody reading the site',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    const siteKey = await heldOp(pool)
    assert.equal((await pool.query('select count(*)::int as n from site_job_follow_up')).rows[0].n, 0)

    const first = await sweep(pool, host)
    assert.deepEqual(first, { taken: 1, ended: 0, held: 1, failed: 0 })
    assert.deepEqual(host.keys(), ['publish:lanternref'], "asked under the operation's own key")
    let op = await opOf(pool, siteKey)
    assert.equal(op.state, 'running')
    assert.equal(op.job_id, 'job-1')
    assert.equal(op.ref, 'lanternref')
    assert.equal(op.sweep_tries, 1)
    assert.equal((await pool.query('select publish from site')).rows[0].publish, 'draft')

    // The host's script ends; no tab is open. The next due look ends the operation on that outcome.
    host.jobs['job-1'] = {
      state: 'done',
      exitCode: 0,
      step: 'go-live:live',
      output: closing('live', 'lantern')
    }
    await due(pool)
    const second = await sweep(pool, host)
    assert.deepEqual(second, { taken: 1, ended: 1, held: 0, failed: 0 })
    op = await opOf(pool, siteKey)
    assert.equal(op.state, 'done')
    assert.equal((await pool.query('select publish from site')).rows[0].publish, 'published')
    assert.equal(host.keys().length, 1, 'one key from the reservation to the ending')
    // Ended: never looked at again, however due it reads.
    await due(pool)
    assert.deepEqual(await sweep(pool, host), { taken: 0, ended: 0, held: 0, failed: 0 })
  }
)

test(
  'no age ends, frees or drops an operation: one reserved forty days ago is asked about exactly like a fresh one, in both states',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    const starting = await heldOp(pool, { label: 'old-starting' })
    const running = await heldOp(pool, {
      label: 'old-running',
      state: 'running',
      jobId: 'gone-job',
      ref: 'runref'
    })
    await pool.query(
      "update site_publish_op set started_at = now() - interval '40 days', updated_at = now() - interval '40 days'"
    )
    const result = await sweep(pool, host)
    assert.equal(result.taken, 2)
    assert.equal(result.held, 2)
    assert.deepEqual(host.keys().sort(), ['publish:old-startingref', 'publish:runref'])
    for (const siteKey of [starting, running]) {
      const op = await opOf(pool, siteKey)
      assert.equal(op.state, 'running', `${siteKey}: held, and now running a job the host named`)
      assert.equal(op.code, null)
    }
    // The running one's record was gone on the host (404): the same key started the job again.
    assert.equal((await opOf(pool, running)).job_id, 'job-2')
  }
)

test(
  'a host that cannot be reached: the operation stays held and unconfirmed, and is looked at again after a wait that grows and stops at ten minutes — never given up',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    host.down = true
    const siteKey = await heldOp(pool)
    const waits = []
    for (let look = 1; look <= 12; look++) {
      const result = await sweep(pool, host)
      assert.deepEqual(result, { taken: 1, ended: 0, held: 1, failed: 0 }, `look ${look}`)
      const { rows } = await pool.query(
        'select state, code, sweep_tries, extract(epoch from sweep_at - now()) as wait from site_publish_op'
      )
      assert.equal(rows[0].state, 'starting', `look ${look}: still held`)
      assert.equal(rows[0].code, 'HOST_UNREACHABLE', `look ${look}`)
      assert.equal(rows[0].sweep_tries, look)
      waits.push(Number(rows[0].wait))
      // Not due yet: a sweep right away takes nothing and asks nobody.
      const calls = host.calls.length
      assert.equal((await sweep(pool, host)).taken, 0, `look ${look}: not before its wait is over`)
      assert.equal(host.calls.length, calls)
      await due(pool)
    }
    assert.ok(waits[0] > 10 && waits[0] <= 31, `the first wait is short: ${waits[0]}`)
    assert.ok(waits[3] > waits[0], 'the wait grows')
    assert.ok(Math.max(...waits) <= 600.5, `and stops at ten minutes: ${Math.max(...waits)}`)
    assert.ok(waits.at(-1) > 590, `where it stays: ${waits.at(-1)}`)
    // The host is back: the same key, taken at last.
    host.down = false
    assert.equal((await sweep(pool, host)).held, 1)
    assert.equal((await opOf(pool, siteKey)).state, 'running')
    assert.deepEqual(host.keys(), ['publish:lanternref'])
  }
)

test(
  'two replicas sweeping at the same moment: each operation is taken by one of them, the host is asked under one key, and there is one job — never a second operation',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    const sites = []
    for (const label of ['one', 'two', 'three']) sites.push(await heldOp(pool, { label }))
    const results = await Promise.all([sweep(pool, host), sweep(pool, host), sweep(pool, host)])
    assert.equal(
      results.reduce((sum, result) => sum + result.taken, 0),
      3,
      `each operation taken once: ${JSON.stringify(results)}`
    )
    assert.equal(host.goLives().length, 3, 'one ask per operation')
    assert.equal(host.keys().length, 3)
    assert.equal(host.keyed.size, 3, 'one job per operation')
    assert.equal((await pool.query('select count(*)::int as n from site_publish_op')).rows[0].n, 3)
    for (const siteKey of sites) assert.equal((await opOf(pool, siteKey)).state, 'running')
    assert.equal((await pool.query("select count(*)::int as n from job where kind = 'go-live'")).rows[0].n, 3)
  }
)

test(
  'the sweep takes a bounded batch, oldest look first, and leaves what is not due and what has ended — a cleanup that FAILED is never started again by it',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    for (const label of ['a', 'b', 'c']) await heldOp(pool, { label })
    await pool.query(
      "update site_publish_op set sweep_at = now() - interval '3 hours' where site_key = 'b.localhost'"
    )
    const notDue = await heldOp(pool, { label: 'later' })
    await pool.query("update site_publish_op set sweep_at = now() + interval '1 hour' where site_key = $1", [
      notDue
    ])
    // Ended operations, due by their clock all the same: a failed draft and a failed removal.
    for (const [label, op] of [
      ['faileddraft', 'draft'],
      ['failedremoval', 'drop-domain']
    ]) {
      const siteKey = await heldOp(pool, { label, op, state: 'running', jobId: `${label}-job` })
      await pool.query(
        "update site_publish_op set state = 'failed', code = 'DOMAIN_STILL_ROUTED' where site_key = $1",
        [siteKey]
      )
    }
    const first = await sweep(pool, host, { limit: 2 })
    assert.equal(first.taken, 2)
    assert.equal(host.goLives()[0].body.label, 'b', 'the one waiting longest is looked at first')
    const second = await sweep(pool, host, { limit: 2 })
    assert.equal(second.taken, 1, 'the rest of the due ones')
    assert.equal((await sweep(pool, host, { limit: 2 })).taken, 0)
    assert.deepEqual(
      host
        .goLives()
        .map((call) => call.body.label)
        .sort(),
      ['a', 'b', 'c']
    )
    assert.equal((await opOf(pool, notDue)).state, 'starting')
    for (const label of ['faileddraft', 'failedremoval']) {
      const op = await opOf(pool, `${label}.localhost`)
      assert.equal(op.state, 'failed', `${label}: left as it ended`)
      assert.equal(op.attempt, 0, `${label}: not taken back by a clock`)
    }
  }
)

test(
  'an operation that ended and was replaced while the sweep was asking about it: the new one keeps the first look it was given — the sweep writes only on the operation it took',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    const siteKey = await heldOp(pool)
    host.onGoLive = async () => {
      // Meanwhile: the old operation is closed by hand and a new one reserved for the same site.
      await pool.query(
        `update site_publish_op set ref = 'newref', state = 'starting', job_id = null, sweep_tries = 0,
                sweep_at = now() + interval '30 seconds' where site_key = $1`,
        [siteKey]
      )
      host.onGoLive = null
    }
    const result = await sweep(pool, host)
    assert.equal(result.taken, 1)
    const op = await opOf(pool, siteKey)
    assert.equal(op.ref, 'newref')
    assert.equal(op.state, 'starting', 'the job named for the OLD ref was not written on the new operation')
    assert.equal(op.job_id, null)
    assert.equal(op.sweep_tries, 0, 'its back-off was not started for it')
    const { rows } = await pool.query(
      'select extract(epoch from sweep_at - now()) as wait from site_publish_op'
    )
    assert.ok(
      Number(rows[0].wait) > 20 && Number(rows[0].wait) <= 30.5,
      `its first look stands: ${rows[0].wait}`
    )
  }
)

test(
  'a site that is gone, and an answer that cannot be written, do not stop the sweep: the other operations are still looked at',
  opts,
  async () => {
    const { pool } = db
    const host = sweepHost()
    const kept = await heldOp(pool, { label: 'kept' })
    const broken = await heldOp(pool, { label: 'broken' })
    await pool.query("update site_publish_op set sweep_at = now() - interval '1 hour' where site_key = $1", [
      broken
    ])
    host.onGoLive = async (body) => {
      // The host's answer for this one is a job id that is no job id: nothing is adopted.
      if (body.label === 'broken') throw new Error('socket hang up')
    }
    const result = await sweep(pool, host)
    assert.equal(result.taken, 2)
    assert.equal(result.held, 2)
    assert.equal((await opOf(pool, kept)).state, 'running')
    assert.equal((await opOf(pool, broken)).state, 'starting')
    assert.equal((await opOf(pool, broken)).code, 'HOST_UNREACHABLE')
  }
)

test(
  'start(): the shard silence sweep rides a one-minute timer and the DNS reconcile the hourly one',
  opts,
  async () => {
    const { pool } = db
    const ran = []
    const shardSweeps = {
      silent: async () => ran.push('silent'),
      reconcile: async () => ran.push('reconcile')
    }
    const timers = []
    const real = setInterval
    let cron
    try {
      globalThis.setInterval = (fn, ms) => {
        const timer = real(() => {}, 1 << 30)
        timers.push({ fn, ms, timer })
        return timer
      }
      cron = start(pool, configWithHosts([]), {
        fetchImpl: async () => new Response('{}'),
        log: { warn() {}, error() {} },
        shardSweeps
      })
    } finally {
      globalThis.setInterval = real
    }
    try {
      const ours = timers.filter(({ fn }) => String(fn).includes('shardSweeps'))
      assert.deepEqual(
        ours.map(({ ms }) => ms).sort((a, b) => a - b),
        [60_000, 60 * 60 * 1000]
      )
      // Only the minute timer is fired: the hourly one would also start every other hourly sweep.
      for (const { fn, ms } of ours) if (ms === 60_000) fn()
    } finally {
      cron.stop()
      for (const { timer } of timers) clearInterval(timer)
    }
    assert.deepEqual(ran, ['silent'])
  }
)

test('sweepWidgetConversations: deletes expired widget conversations a batch at a time, oldest first, and stops when one comes back short or at its cap', async () => {
  const asked = []
  const pool = (counts) => ({
    async query(sql, params) {
      asked.push({ sql, params })
      return { rowCount: counts.shift() ?? 0, rows: [] }
    }
  })
  const now = Date.parse('2026-10-19T00:00:00Z')
  assert.equal(await sweepWidgetConversations(pool([100, 100, 37]), { sessionSecret: 's' }, { now }), 237)
  assert.equal(asked.length, 3)
  assert.match(
    asked[0].sql,
    /^delete from widget_conversation .* where expires_at <= \$1 order by expires_at limit \$2\)$/
  )
  assert.deepEqual(asked[0].params, [new Date(now), 100])
  asked.length = 0
  // At its cap one pass stops; the rest goes on the next pass.
  assert.equal(
    await sweepWidgetConversations(pool([100, 100, 100]), { sessionSecret: 's' }, { now, batches: 2 }),
    200
  )
  assert.equal(asked.length, 2)
  asked.length = 0
  assert.equal(await sweepWidgetConversations(pool([]), { sessionSecret: 's' }, { now }), 0)
  assert.equal(asked.length, 1)
})

test(
  'sweepWidgetConversations on the real table: every expired row goes, live and adopted native ones stay',
  opts,
  async () => {
    const { pool } = db
    // One clock for the rows and the sweep: the process's, as the store writes expires_at (the
    // database's now() is not moved by the clock-shift run).
    const now = Date.now()
    const at = new Date(now)
    await pool.query(
      `insert into widget_conversation (visitor_digest, payload_cipher, revision, expires_at)
     select 'expired-' || n, 'sealed', 1, $1::timestamptz - interval '1 minute' * n from generate_series(1, 250) n`,
      [at]
    )
    await pool.query(
      `insert into widget_conversation (visitor_digest, payload_cipher, revision, expires_at)
     values ('live', 'sealed', 1, $1::timestamptz + interval '1 hour'), ('native', 'sealed', 2, '9999-12-31T23:59:59.999Z')`,
      [at]
    )
    assert.equal(await sweepWidgetConversations(pool, { sessionSecret: 's' }, { now }), 250)
    const left = (await pool.query('select visitor_digest from widget_conversation order by 1')).rows
    assert.deepEqual(
      left.map((row) => row.visitor_digest),
      ['live', 'native']
    )
  }
)

// ── Demo retention: the first sweep runs soon after start, not an hour later ────────────────────
//
// develop deploys ~34 times a day, so a web process rarely lives a whole hour. An hourly interval
// alone never fired there (dev round 19/10, D3/D4/D6 blocked): no demo ever froze. One early run
// after start, then hourly, is what makes the sweep reach a deployment that restarts often.
test(
  'demo retention: start() schedules one sweep shortly after boot, then hourly; stop() clears both',
  opts,
  async () => {
    const { pool } = db
    const config = configWithHosts([])
    const ticks = []
    const timeouts = []
    const intervals = []
    const real = { setInterval, setTimeout, clearInterval, clearTimeout }
    let cron
    try {
      globalThis.setTimeout = (fn, ms) => {
        const timer = real.setTimeout(() => {}, 0)
        timeouts.push({ timer, fn, ms })
        return timer
      }
      globalThis.setInterval = (fn, ms) => {
        const timer = real.setInterval(() => {}, 1 << 30)
        intervals.push({ timer, fn, ms })
        return timer
      }
      cron = start(pool, config, {
        fetchImpl: async () => new Response('{}'),
        log: { warn() {}, error() {} },
        demoRetentionTick: async () => {
          ticks.push(Date.now())
        }
      })
    } finally {
      globalThis.setInterval = real.setInterval
      globalThis.setTimeout = real.setTimeout
    }
    const first = timeouts.find(({ ms }) => ms === cronModule.DEMO_RETENTION_FIRST_MS)
    assert.ok(first, 'a first sweep is scheduled at DEMO_RETENTION_FIRST_MS after start')
    assert.ok(
      cronModule.DEMO_RETENTION_FIRST_MS < 10 * 60 * 1000,
      'the first sweep comes well inside the gap between two develop deploys'
    )
    const hourly = intervals.find(({ ms }) => ms === 60 * 60 * 1000)
    assert.ok(hourly, 'the hourly interval is still there')
    first.fn()
    await new Promise((resolve) => real.setTimeout(resolve, 20))
    assert.equal(ticks.length, 1, 'firing the first timer runs the sweep once')
    const cleared = new Set()
    try {
      globalThis.clearInterval = (t) => (cleared.add(t), real.clearInterval(t))
      globalThis.clearTimeout = (t) => (cleared.add(t), real.clearTimeout(t))
      cron.stop()
    } finally {
      globalThis.clearInterval = real.clearInterval
      globalThis.clearTimeout = real.clearTimeout
    }
    assert.ok(cleared.has(first.timer), 'stop() clears the first-run timer')
    for (const { timer } of timeouts) real.clearTimeout(timer)
    for (const { timer } of intervals) real.clearInterval(timer)
  }
)
