/**
 * The design system picked in the Add site form, carried by the create request and put on the new site by the
 * server at the end of its build (Akemi, 12/10/2026): no browser tab has to stay open for it. The runner waits for
 * the host's provision job, then for the site's brief (its words go in first), then applies once through the Design
 * system door's own write (`applyAs`); every ending is kept on the row, said, and never retried in a loop.
 *
 *   TEST_DATABASE_URL=… node --test apps/tracy-web/test/design-system-at-create.test.mjs
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'

import { createBuildDesignSystems, DS_STEP, LOST_APPLY } from '../src/sites/design-system-at-create.js'
import { buildDesignSystemStore } from '../src/sites/design-system-at-create-store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const SITE = 'bakery.tracy.test'
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const quiet = { info() {}, warn() {} }
// A real turn of the event loop, so the database answers while a run waits.
const instant = () => new Promise((resolve) => setImmediate(resolve))

async function siteRow(pool, siteKey = SITE) {
  await pool.query(`insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'emdash')`, [
    siteKey,
    siteKey.split('.')[0]
  ])
}

const input = (over = {}) => ({
  siteKey: SITE,
  accountId: null,
  email: 'owner@example.test',
  id: MOXIE,
  name: 'Moxie',
  jobId: 'job-1',
  host: 'local',
  ...over
})

/** A runner over the real store, with the host, the brief and the apply as doubles that record what they saw. */
function runner(pool, { job = () => ({ state: 'done' }), brief = () => false, apply, ...extra } = {}) {
  const calls = { apply: [], jobs: 0, briefs: 0 }
  const builds = createBuildDesignSystems({
    store: buildDesignSystemStore(pool),
    hostJob: async (host, jobId) => {
      calls.jobs++
      return job(host, jobId, calls.jobs)
    },
    briefOpen: async () => {
      calls.briefs++
      return brief(calls.briefs)
    },
    apply: async (siteKey, ask) => {
      calls.apply.push({ siteKey, ...ask })
      return apply ? apply(calls.apply.length) : { status: 200, body: { ok: true, applyId: 'a1b2c3d4e5f6' } }
    },
    log: quiet,
    sleep: instant,
    limits: { jobPollMs: 1, pollMs: 1, busyWaitMs: 1 },
    ...extra
  })
  return { builds, calls }
}

test('a pick is kept on the row, then applied once the site is up, as the creator', dbOpts, async () => {
  await siteRow(db.pool)
  let up = false
  const { builds, calls } = runner(db.pool, { job: () => ({ state: up ? 'done' : 'running' }) })
  await builds.start(input())
  const queued = await builds.stateOf(SITE)
  assert.equal(queued.state, 'queued')
  assert.equal(queued.id, MOXIE)
  assert.equal(queued.name, 'Moxie')
  assert.equal(calls.apply.length, 0, 'nothing is written while the host still installs')
  up = true
  await builds.idle()
  assert.deepEqual(calls.apply, [{ siteKey: SITE, email: 'owner@example.test', id: MOXIE, at: 'create' }])
  const done = await builds.stateOf(SITE)
  assert.equal(done.state, 'applied')
  assert.equal(done.applyId, 'a1b2c3d4e5f6')
  assert.equal(done.reason, null)
})

test(
  'the brief goes in first: the apply waits while the site’s words are still being written',
  dbOpts,
  async () => {
    await siteRow(db.pool)
    const seen = []
    const { builds, calls } = runner(db.pool, {
      brief: (n) => {
        seen.push(`brief${n}`)
        return n < 3
      },
      apply: () => {
        seen.push('apply')
        return { status: 200, body: { ok: true, applyId: 'a1b2c3d4e5f6' } }
      }
    })
    await builds.start(input())
    await builds.idle()
    assert.deepEqual(seen, ['brief1', 'brief2', 'brief3', 'apply'])
    assert.equal(calls.apply.length, 1)
  }
)

test('a site that does not come up is not written to, and the row says why', dbOpts, async () => {
  await siteRow(db.pool)
  const { builds, calls } = runner(db.pool, { job: () => ({ state: 'failed' }) })
  await builds.start(input())
  await builds.idle()
  assert.equal(calls.apply.length, 0)
  const row = await builds.stateOf(SITE)
  assert.equal(row.state, 'failed')
  assert.match(row.reason, /did not come up/)
})

test(
  'a template that cannot wear the system: skipped, the reason recorded, the site untouched',
  dbOpts,
  async () => {
    await siteRow(db.pool)
    const { builds, calls } = runner(db.pool, {
      apply: () => ({
        status: 409,
        body: { code: 'DS_TEMPLATE_CANNOT_WEAR', reason: 'TEMPLATE_HAS_NO_SLOT' }
      })
    })
    await builds.start(input())
    await builds.idle()
    assert.equal(calls.apply.length, 1)
    const row = await builds.stateOf(SITE)
    assert.equal(row.state, 'skipped')
    assert.equal(row.reason, 'DS_TEMPLATE_CANNOT_WEAR: TEMPLATE_HAS_NO_SLOT')
  }
)

test('a failed write is said on the row and never retried', dbOpts, async () => {
  await siteRow(db.pool)
  const { builds, calls } = runner(db.pool, {
    apply: () => ({ status: 502, body: { code: 'DS_WRITE_FAILED', reason: 'timeout' } })
  })
  await builds.start(input())
  await builds.idle()
  await builds.start(input())
  await builds.idle()
  assert.equal(calls.apply.length, 1, 'one write, even when the start is asked again')
  const row = await builds.stateOf(SITE)
  assert.equal(row.state, 'failed')
  assert.equal(row.reason, 'DS_WRITE_FAILED: timeout')
})

test('an apply that throws is a failed row, not a crash', dbOpts, async () => {
  await siteRow(db.pool)
  const { builds } = runner(db.pool, {
    apply: () => {
      throw new Error('host unreachable')
    }
  })
  await builds.start(input())
  await builds.idle()
  const row = await builds.stateOf(SITE)
  assert.equal(row.state, 'failed')
  assert.match(row.reason, /host unreachable/)
})

test('a busy site is asked again a bounded number of times, then the row says so', dbOpts, async () => {
  await siteRow(db.pool)
  const { builds, calls } = runner(db.pool, {
    apply: () => ({ status: 409, body: { code: 'SITE_BUSY' } }),
    limits: { jobPollMs: 1, pollMs: 1, busyWaitMs: 1, busyTries: 4 }
  })
  await builds.start(input())
  await builds.idle()
  assert.equal(calls.apply.length, 4)
  assert.equal((await builds.stateOf(SITE)).state, 'failed')
  // Busy once, then free: written on the second try.
  await db.reset()
  await siteRow(db.pool)
  const again = runner(db.pool, {
    apply: (n) =>
      n === 1
        ? { status: 409, body: { code: 'SITE_BUSY' } }
        : { status: 200, body: { ok: true, applyId: 'b' } }
  })
  await again.builds.start(input())
  await again.builds.idle()
  assert.equal(again.calls.apply.length, 2)
  assert.equal((await again.builds.stateOf(SITE)).state, 'applied')
})

test('two replicas starting the same site write once', dbOpts, async () => {
  await siteRow(db.pool)
  const a = runner(db.pool)
  const b = runner(db.pool)
  await Promise.all([a.builds.start(input()), b.builds.start(input())])
  await Promise.all([a.builds.idle(), b.builds.idle()])
  assert.equal(a.calls.apply.length + b.calls.apply.length, 1)
  assert.equal((await a.builds.stateOf(SITE)).state, 'applied')
})

test(
  'a retry of a failed install puts the pick back to work on the new job; an applied one stays',
  dbOpts,
  async () => {
    await siteRow(db.pool)
    const first = runner(db.pool, { job: () => ({ state: 'failed' }) })
    await first.builds.start(input())
    await first.builds.idle()
    assert.equal((await first.builds.stateOf(SITE)).state, 'failed')
    const second = runner(db.pool, { job: (_h, jobId) => ({ state: jobId === 'job-2' ? 'done' : 'failed' }) })
    await second.builds.start(input({ jobId: 'job-2' }))
    await second.builds.idle()
    assert.equal(second.calls.apply.length, 1)
    assert.equal((await second.builds.stateOf(SITE)).state, 'applied')
    // Pressed again after it was written: nothing more.
    await second.builds.start(input({ jobId: 'job-3' }))
    await second.builds.idle()
    assert.equal(second.calls.apply.length, 1)
    assert.equal((await second.builds.stateOf(SITE)).state, 'applied')
  }
)

test('the sweep finishes a pick whose process died while waiting, once', dbOpts, async () => {
  await siteRow(db.pool)
  const store = buildDesignSystemStore(db.pool)
  await store.put(input())
  await db.pool.query(`update site_create_design_system set updated_at = now() - interval '10 minutes'`)
  const { builds, calls } = runner(db.pool)
  await builds.sweep()
  await builds.idle()
  await builds.sweep()
  await builds.idle()
  assert.equal(calls.apply.length, 1)
  assert.equal((await builds.stateOf(SITE)).state, 'applied')
})

test(
  'a pick whose process died WHILE writing is never written again: applied when the write landed, else failed',
  dbOpts,
  async () => {
    await siteRow(db.pool)
    await siteRow(db.pool, 'other.tracy.test')
    const store = buildDesignSystemStore(db.pool)
    await store.put(input())
    await store.put(input({ siteKey: 'other.tracy.test' }))
    await db.pool.query(
      `update site_create_design_system set state = 'applying', updated_at = now() - interval '10 minutes'`
    )
    // The write on `bakery` landed before the process died: its Design system row is there.
    await db.pool.query(
      `insert into site_design_system (site_key, undo_id, platform, system_id, system_name, actor)
     values ($1, 'c0ffeec0ffee', 'emdash', $2, 'Moxie', 'owner@example.test')`,
      [SITE, MOXIE]
    )
    const { builds, calls } = runner(db.pool)
    await builds.sweep()
    await builds.idle()
    assert.equal(calls.apply.length, 0, 'never written a second time')
    const landed = await builds.stateOf(SITE)
    assert.equal(landed.state, 'applied')
    assert.equal(landed.applyId, 'c0ffeec0ffee')
    const lost = await builds.stateOf('other.tracy.test')
    assert.equal(lost.state, 'failed')
    assert.equal(lost.reason, LOST_APPLY)
  }
)

test(
  'the poll door’s view: open while queued or applying (with the step to show), the ending after',
  dbOpts,
  async () => {
    await siteRow(db.pool)
    const { builds } = runner(db.pool, { job: () => ({ state: 'running' }) })
    assert.equal(await builds.stateOf(SITE), null, 'a site made with no pick has no row')
    await builds.start(input())
    const open = await builds.stateOf(SITE)
    assert.equal(open.open, true)
    assert.equal(DS_STEP, 'applying your design system')
    await db.pool.query(`update site_create_design_system set state = 'applied', apply_id = 'x'`)
    const closed = await builds.stateOf(SITE)
    assert.equal(closed.open, false)
    assert.deepEqual(builds.said(closed), { id: MOXIE, name: 'Moxie', state: 'applied', applyId: 'x' })
    await builds.stop()
  }
)
