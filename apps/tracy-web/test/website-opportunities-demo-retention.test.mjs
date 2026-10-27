// Demo retention (`opportunities-build/demo-retention.js`, tasks/todo-wo-demo-retention.md): a Website
// Opportunities demo nobody touches freezes when its time is up, a frozen one is torn down through the
// site's own teardown after a grace, and the caps freeze the coldest demos first. Real Postgres.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readDemoSummary } from '../src/lib/wo-ops.js'
import { DEFAULT_WO_OPS_SETTINGS } from 'website-opportunities/src/wo-settings.js'
import * as retention from '../src/opportunities-build/demo-retention.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const NOW = Date.parse('2026-10-19T12:00:00Z')
const DAY = 86_400_000
const at = (ms) => new Date(ms).toISOString()
const SETTINGS = { ...DEFAULT_WO_OPS_SETTINGS }

let seq = 0
async function account(pool, email = `a${++seq}@tracy.test`) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

/** One built demo of `accountId` on host `host`, with the given retention columns. */
async function demo(
  pool,
  accountId,
  {
    host = 'local',
    expires = NOW + 14 * DAY,
    touched = null,
    frozen = null,
    deleted = null,
    handoff = null
  } = {}
) {
  const n = ++seq
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, 'Pho Ba', 'osm', $2) returning id`,
      [accountId, `n/${n}`]
    )
  ).rows[0].id
  const rev = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md)
       values ($1, $2, 1, '{}'::jsonb, 'Pho Ba') returning id`,
      [opp, accountId]
    )
  ).rows[0].id
  const siteKey = `demo${n}.localhost`
  await pool.query(`insert into site (site_key, label, host, platform) values ($1, $2, $3, 'joomla')`, [
    siteKey,
    `demo${n}`,
    host
  ])
  const id = (
    await pool.query(
      `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, handoff,
         demo_expires_at, demo_touched_at, demo_frozen_at, demo_deleted_at, choice, choice_key)
       values ($1, $2, $3, gen_random_uuid(), $4, 'provisioning', $5::jsonb, $6, $7, $8, $9, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
      [
        accountId,
        rev,
        `req-${n}`,
        siteKey,
        handoff ? JSON.stringify(handoff) : null,
        expires === null ? null : at(expires),
        touched === null ? null : at(touched),
        frozen === null ? null : at(frozen),
        deleted === null ? null : at(deleted)
      ]
    )
  ).rows[0].id
  return { id, siteKey, opp, rev, requestId: `req-${n}` }
}

const row = async (pool, id) =>
  (
    await pool.query(
      'select demo_expires_at, demo_touched_at, demo_frozen_at, demo_deleted_at from wo_build where id = $1',
      [id]
    )
  ).rows[0]
const ms = (v) => (v === null ? null : new Date(v).getTime())

test('a touch pushes the demo’s expiry out by demoTtlDays from the touch', opts, async () => {
  const { pool } = db
  const { id } = await demo(pool, await account(pool), { expires: NOW + DAY })
  await retention.touchDemo(pool, id, { now: NOW, settings: { ...SETTINGS, demoTtlDays: 14 } })
  const r = await row(pool, id)
  assert.equal(ms(r.demo_expires_at), NOW + 14 * DAY)
  assert.equal(ms(r.demo_touched_at), NOW)
})

test('a demo QA handed back as needs-review lives demoReviewTtlDays from a touch', opts, async () => {
  const { pool } = db
  const { id } = await demo(pool, await account(pool), { handoff: { state: 'needs-review' } })
  await retention.touchDemo(pool, id, { now: NOW, settings: { ...SETTINGS, demoReviewTtlDays: 7 } })
  assert.equal(ms((await row(pool, id)).demo_expires_at), NOW + 7 * DAY)
})

test('a touch does not thaw a frozen demo, nor give a kept-for-good one an expiry', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  const frozen = await demo(pool, acc, { expires: NOW - DAY, frozen: NOW - DAY })
  const kept = await demo(pool, acc, { expires: null })
  await retention.touchDemo(pool, frozen.id, { now: NOW, settings: SETTINGS })
  await retention.touchDemo(pool, kept.id, { now: NOW, settings: SETTINGS })
  assert.equal(ms((await row(pool, frozen.id)).demo_frozen_at), NOW - DAY)
  assert.equal(ms((await row(pool, frozen.id)).demo_expires_at), NOW - DAY)
  assert.equal((await row(pool, kept.id)).demo_expires_at, null)
})

test('a build that just got its site starts its clock once', opts, async () => {
  const { pool } = db
  const { id } = await demo(pool, await account(pool), { expires: null })
  await retention.startDemoClock(pool, id, { now: NOW, settings: { ...SETTINGS, demoTtlDays: 10 } })
  assert.equal(ms((await row(pool, id)).demo_expires_at), NOW + 10 * DAY)
  await retention.startDemoClock(pool, id, { now: NOW + DAY, settings: { ...SETTINGS, demoTtlDays: 10 } })
  assert.equal(ms((await row(pool, id)).demo_expires_at), NOW + 10 * DAY)
})

test('reopen thaws a frozen demo and gives it a new term; a deleted one is not reopened', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  const frozen = await demo(pool, acc, { expires: NOW - 2 * DAY, frozen: NOW - DAY })
  const gone = await demo(pool, acc, { expires: NOW - 9 * DAY, frozen: NOW - 8 * DAY, deleted: NOW - DAY })
  const reopened = await retention.reopenDemo(pool, frozen.id, { now: NOW, settings: SETTINGS })
  assert.ok(reopened)
  const r = await row(pool, frozen.id)
  assert.equal(r.demo_frozen_at, null)
  assert.equal(ms(r.demo_expires_at), NOW + 14 * DAY)
  assert.equal(ms(r.demo_touched_at), NOW)
  assert.equal(await retention.reopenDemo(pool, gone.id, { now: NOW, settings: SETTINGS }), null)
})

test('freezeDemo marks a live demo frozen once', opts, async () => {
  const { pool } = db
  const { id } = await demo(pool, await account(pool))
  assert.ok(await retention.freezeDemo(pool, id, { now: NOW }))
  assert.equal(await retention.freezeDemo(pool, id, { now: NOW + DAY }), null)
  assert.equal(ms((await row(pool, id)).demo_frozen_at), NOW)
})

/** A teardown that records what it was asked and answers `answer` (the site row goes on 'gone'). */
function teardownFake(pool, answer = 'gone') {
  const asked = []
  return {
    asked,
    teardown: async (build) => {
      asked.push(build.site_key)
      if (answer === 'gone') await pool.query('delete from site where site_key = $1', [build.site_key])
      return answer
    }
  }
}

const sweep = (pool, over = {}) =>
  retention.sweepDemos(pool, {
    now: NOW,
    settings: { ...SETTINGS, ...over.settings },
    teardown: over.teardown ?? (async () => 'started'),
    diskPct: over.diskPct,
    log: { info() {}, warn() {} }
  })

test('the sweep freezes demos whose term ran out, and leaves the rest', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  const due = await demo(pool, acc, { expires: NOW - 1 })
  const live = await demo(pool, acc, { expires: NOW + DAY })
  const kept = await demo(pool, acc, { expires: null })
  const result = await sweep(pool)
  assert.equal(result.ran, true)
  assert.equal(result.frozen, 1)
  assert.equal(ms((await row(pool, due.id)).demo_frozen_at), NOW)
  assert.equal((await row(pool, live.id)).demo_frozen_at, null)
  assert.equal((await row(pool, kept.id)).demo_frozen_at, null)
})

test(
  'a demo frozen past the grace goes through the teardown and is marked deleted once the site is gone',
  opts,
  async () => {
    const { pool } = db
    const acc = await account(pool)
    const old = await demo(pool, acc, { expires: NOW - 10 * DAY, frozen: NOW - 8 * DAY })
    const fresh = await demo(pool, acc, { expires: NOW - 2 * DAY, frozen: NOW - DAY })
    const fake = teardownFake(pool)
    const result = await sweep(pool, { teardown: fake.teardown, settings: { demoFreezeGraceDays: 7 } })
    assert.deepEqual(fake.asked, [old.siteKey])
    assert.equal(result.deleted, 1)
    assert.equal(ms((await row(pool, old.id)).demo_deleted_at), NOW)
    assert.equal((await row(pool, fresh.id)).demo_deleted_at, null)
    // The record stays: the build row, its revision and opportunity.
    assert.equal((await pool.query('select count(*)::int as n from wo_build')).rows[0].n, 2)
  }
)

test('a teardown still running leaves the demo undeleted for the next sweep', opts, async () => {
  const { pool } = db
  const old = await demo(pool, await account(pool), { expires: NOW - 10 * DAY, frozen: NOW - 8 * DAY })
  const fake = teardownFake(pool, 'started')
  const result = await sweep(pool, { teardown: fake.teardown })
  assert.equal(result.deleted, 0)
  assert.equal(result.tearingDown, 1)
  assert.equal((await row(pool, old.id)).demo_deleted_at, null)
})

test('a frozen demo whose site is already gone is marked deleted without a teardown', opts, async () => {
  const { pool } = db
  const old = await demo(pool, await account(pool), { expires: NOW - 10 * DAY, frozen: NOW - 8 * DAY })
  await pool.query('delete from site where site_key = $1', [old.siteKey])
  const fake = teardownFake(pool)
  await sweep(pool, { teardown: fake.teardown })
  assert.deepEqual(fake.asked, [])
  assert.equal(ms((await row(pool, old.id)).demo_deleted_at), NOW)
  const { rows } = await pool.query('select state from wo_build where id = $1', [old.id])
  assert.equal(
    rows[0].state,
    'deleted',
    'a deleted demo is no longer a live build (stand wo2 bug 1, with #1461)'
  )
})

test('switched off, the sweep changes nothing and says so', opts, async () => {
  const { pool } = db
  const due = await demo(pool, await account(pool), { expires: NOW - 1 })
  const result = await sweep(pool, { settings: { demoRetentionEnabled: false } })
  assert.deepEqual(result, { ran: false, reason: 'disabled' })
  assert.equal((await row(pool, due.id)).demo_frozen_at, null)
})

test('one sweep does at most demoSweepBatch operations', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  for (let i = 0; i < 3; i++) await demo(pool, acc, { expires: NOW - (i + 1) * 1000 })
  const result = await sweep(pool, { settings: { demoSweepBatch: 2 } })
  assert.equal(result.frozen, 2)
  const n = (await pool.query('select count(*)::int as n from wo_build where demo_frozen_at is not null'))
    .rows[0]
  assert.equal(n.n, 2)
})

test(
  'over demoMaxPerAccount the coldest live demos of that account freeze until under the cap',
  opts,
  async () => {
    const { pool } = db
    const acc = await account(pool)
    const other = await account(pool)
    const coldest = await demo(pool, acc, { touched: NOW - 5 * DAY })
    const cold = await demo(pool, acc, { touched: NOW - 4 * DAY })
    const warm = await demo(pool, acc, { touched: NOW - DAY })
    const elsewhere = await demo(pool, other, { touched: NOW - 9 * DAY })
    const result = await sweep(pool, { settings: { demoMaxPerAccount: 1 } })
    assert.equal(result.capped, 2)
    assert.notEqual((await row(pool, coldest.id)).demo_frozen_at, null)
    assert.notEqual((await row(pool, cold.id)).demo_frozen_at, null)
    assert.equal((await row(pool, warm.id)).demo_frozen_at, null)
    assert.equal((await row(pool, elsewhere.id)).demo_frozen_at, null)
    // A cap freezes; it never deletes.
    assert.equal((await row(pool, coldest.id)).demo_deleted_at, null)
  }
)

test('over demoMaxPerHost the coldest live demos on that host freeze', opts, async () => {
  const { pool } = db
  const coldest = await demo(pool, await account(pool), { host: 'h1', touched: NOW - 3 * DAY })
  const warm = await demo(pool, await account(pool), { host: 'h1', touched: NOW - DAY })
  const otherHost = await demo(pool, await account(pool), { host: 'h2', touched: NOW - 9 * DAY })
  const result = await sweep(pool, { settings: { demoMaxPerHost: 1 } })
  assert.equal(result.capped, 1)
  assert.notEqual((await row(pool, coldest.id)).demo_frozen_at, null)
  assert.equal((await row(pool, warm.id)).demo_frozen_at, null)
  assert.equal((await row(pool, otherHost.id)).demo_frozen_at, null)
})

test(
  'a host over demoDiskHighWaterPct has its coldest live demo frozen; no reading, no freeze',
  opts,
  async () => {
    const { pool } = db
    const coldest = await demo(pool, await account(pool), { host: 'full', touched: NOW - 3 * DAY })
    const warm = await demo(pool, await account(pool), { host: 'full', touched: NOW - DAY })
    const unread = await demo(pool, await account(pool), { host: 'dark', touched: NOW - 9 * DAY })
    const result = await sweep(pool, {
      settings: { demoDiskHighWaterPct: 80 },
      diskPct: async (host) => (host === 'full' ? 91 : null)
    })
    assert.equal(result.capped, 1)
    assert.notEqual((await row(pool, coldest.id)).demo_frozen_at, null)
    assert.equal((await row(pool, warm.id)).demo_frozen_at, null)
    assert.equal((await row(pool, unread.id)).demo_frozen_at, null)
  }
)

test('a second instance finds the sweep taken and skips its run', opts, async () => {
  const { pool } = db
  const due = await demo(pool, await account(pool), { expires: NOW - 1 })
  const holder = await pool.connect()
  try {
    await holder.query('select pg_advisory_lock($1)', [retention.DEMO_RETENTION_LOCK_ID])
    assert.deepEqual(await sweep(pool), { ran: false, reason: 'busy' })
    assert.equal((await row(pool, due.id)).demo_frozen_at, null)
  } finally {
    await holder.query('select pg_advisory_unlock($1)', [retention.DEMO_RETENTION_LOCK_ID])
    holder.release()
  }
})

test('the summary counts live, frozen and expiring-within-24-h demos', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  await demo(pool, acc, { expires: NOW + 2 * DAY })
  await demo(pool, acc, { expires: NOW + 3_600_000 })
  await demo(pool, acc, { expires: null })
  await demo(pool, acc, { expires: NOW - DAY, frozen: NOW - DAY })
  await demo(pool, acc, { expires: NOW - 9 * DAY, frozen: NOW - 8 * DAY, deleted: NOW - DAY })
  assert.deepEqual(await readDemoSummary(pool, { now: NOW }), {
    live: 3,
    frozen: 1,
    expiringSoon: 1,
    deleted: 1
  })
})

test(
  'GET /api/ops/wo/demos/summary answers the retention settings and the counts to staff only',
  opts,
  async () => {
    const { pool } = db
    const config = { origin: 'https://cowork.tracy.test', sessionSecret: 's'.repeat(32) }
    const app = woOpsRoutes({ pool, config, log: { log() {} }, now: () => NOW })
    const staff = await account(pool, 'ops@tracy.test')
    const cookie = `${SESSION_COOKIE}=${await mintSession('ops@tracy.test', config.sessionSecret)}`
    const read = () => app.request('/api/ops/wo/demos/summary', { headers: { cookie } })
    assert.equal((await read()).status, 403)
    const ws = (
      await pool.query("insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id")
    ).rows[0].id
    await pool.query(
      "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'developer',$2,now())",
      [ws, staff]
    )
    await demo(pool, staff, { expires: NOW + 3_600_000 })
    await demo(pool, staff, { expires: NOW - DAY, frozen: NOW - DAY })
    const res = await read()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    const body = await res.json()
    assert.deepEqual(body.counts, { live: 1, frozen: 1, expiringSoon: 1, deleted: 0 })
    assert.equal(body.retention.demoTtlDays, 14)
    assert.equal(body.retention.demoRetentionEnabled, true)
    assert.equal(Object.keys(body.retention).length, 10)
    assert.equal(body.retention.ownSiteBuildsPerAccountPerDay, 3)
    assert.equal(body.writable, false)
  }
)

// Dev round 19/10 (R-dev-4): a demo site deleted through DELETE /api/sites/:key kept counting as
// live, because only the sweep's own teardown stamped the build. The site's book-closing now marks
// every build that pointed at that site, so the summary and the Demo column read "deleted".
test('a site deleted through its own door marks the builds that pointed at it deleted', opts, async () => {
  const { pool } = db
  const acc = await account(pool)
  const { id, siteKey } = await demo(pool, acc)
  const other = await demo(pool, acc)
  assert.equal(await retention.markDemoDeletedBySite(pool, siteKey, { now: NOW }), 1)
  const mine = await row(pool, id)
  assert.equal(ms(mine.demo_deleted_at), NOW)
  assert.equal((await pool.query('select state from wo_build where id = $1', [id])).rows[0].state, 'deleted')
  assert.equal((await row(pool, other.id)).demo_deleted_at, null, 'another build is untouched')
  assert.equal(await retention.markDemoDeletedBySite(pool, siteKey, { now: NOW + DAY }), 0, 'stamped once')
})

// Local stand 24/10/2026: an agent build stays open after its turn for the owner's follow-up; with its site deleted
// that open action still refused every new build of the place (DEMO_BUILD_ACTIVE).
test(
  'a site deleted through its own door ends the build action still open on it, and only that one',
  opts,
  async () => {
    const { pool } = db
    const acc = await account(pool)
    const mine = await demo(pool, acc)
    const other = await demo(pool, acc)
    const action = async (d) =>
      (
        await pool.query(
          `insert into wo_demo_action (account_id, opportunity_id, request_id, fingerprint, accepted_at, revision_id,
           build_request_id, session_id, queued_at, status, lease_until)
         values ($1, $2, gen_random_uuid()::text, 'f', now(), $3, $4, 's', now(), 'queued', now() + interval '1 minute')
         returning id`,
          [acc, d.opp, d.rev, d.requestId]
        )
      ).rows[0].id
    const open = await action(mine)
    const untouched = await action(other)
    assert.equal(await retention.markDemoDeletedBySite(pool, mine.siteKey, { now: NOW }), 1)
    const read = async (id) =>
      (await pool.query('select status, error, lease_until from wo_demo_action where id = $1', [id])).rows[0]
    assert.deepEqual(await read(open), { status: 'failed', error: 'DEMO_SITE_DELETED', lease_until: null })
    assert.equal((await read(untouched)).status, 'queued')
  }
)

test(
  'a customer’s own site (Build from my business) never gets a clock, so no sweep or cap reaches it',
  opts,
  async () => {
    const { pool } = db
    const acc = await account(pool)
    const own = await demo(pool, acc, { expires: null })
    const b = (await pool.query('select * from wo_build where id=$1', [own.id])).rows[0]
    const opp = (await pool.query('select opportunity_id from wo_revision where id=$1', [b.revision_id]))
      .rows[0]
    await pool.query(
      `insert into wo_demo_action (account_id, opportunity_id, request_id, fingerprint, accepted_at, revision_id,
       build_request_id, session_id, selection, queued_at)
     values ($1, $2, 'own-build', 'f', now(), $3, $4, 's', '{"ownSite": true, "auto": {"reason": "auto"}}'::jsonb, now())`,
      [acc, opp.opportunity_id, b.revision_id, b.request_id]
    )
    assert.equal(await retention.startDemoClock(pool, own.id, { now: NOW, settings: SETTINGS }), null)
    assert.equal((await row(pool, own.id)).demo_expires_at, null)
    // A demo beside it still starts its clock.
    const other = await demo(pool, acc, { expires: null })
    await retention.startDemoClock(pool, other.id, { now: NOW, settings: { ...SETTINGS, demoTtlDays: 10 } })
    assert.equal(ms((await row(pool, other.id)).demo_expires_at), NOW + 10 * DAY)
  }
)
