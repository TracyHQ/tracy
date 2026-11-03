// Starting and cancelling a site planner bench run (ADR 0041, #301): everything is checked before a run is queued
// (brief shape, kit, door), one run is active at a time and a refusal names it, and cancel stops a waiting run at once.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun } from '../src/site-planner/bench-store.js'
import {
  BENCH_HARNESS,
  briefOfRevision,
  cancelBenchRun,
  startBenchRun
} from '../src/site-planner/bench-control.js'
import { CHECKER_VERSION } from '../src/site-planner/plan-check/check-plan.js'
import { plannerPrompt } from '../src/site-planner/planner-prompt.js'
import {
  API_KEY,
  assignPlannerDoor,
  KIT_REF,
  MODEL,
  readyKitImages,
  SECRET,
  startRun
} from './_site-planner-bench.mjs'
import { brief } from './_site-plan-check-inputs.mjs'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const start = (pool, over = {}) =>
  startBenchRun({
    pool,
    secret: SECRET,
    brief: brief(),
    briefSource: { kind: 'file', name: 'hsc.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    kitImages: readyKitImages(),
    ...over
  })

test('a started run stores what it will run on, and never the key', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const run = await startRun(pool, { startedBy: 'cli:akemi' })
  const full = await readRun(pool, run.id)
  assert.equal(full.status, 'queued')
  assert.equal(full.startedBy, 'cli:akemi')
  assert.deepEqual(full.brief, brief())
  assert.deepEqual(full.briefSource, { kind: 'file', name: 'harbour-sport-club.json' })
  assert.equal(full.kit.ref, KIT_REF)
  assert.equal(full.kit.images, 110)
  assert.equal(full.promptSha256, plannerPrompt().sha256)
  assert.equal(full.checkerVersion, CHECKER_VERSION)
  assert.equal(full.door.model, MODEL)
  assert.equal(full.door.providerId, 'openrouter')
  assert.deepEqual(full.harness, BENCH_HARNESS)
  assert.equal(JSON.stringify(full).includes(API_KEY), false)
})

test('a brief of the wrong shape is refused with its problems, nothing queued', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const refused = await start(pool, { brief: { facts: [{ id: 'f1' }] } })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'SITE_PLANNER_BRIEF_SHAPE')
  assert.match(refused.reason, /facts\[0\]: field must be a non-empty string/)
  assert.equal((await pool.query('select count(*)::int as n from site_planner_run')).rows[0].n, 0)
})

test('an unknown kit is refused and the readable kits are named', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const refused = await start(pool, { kitRef: 'no-such/kit/1.0.0' })
  assert.equal(refused.code, 'SITE_PLANNER_KIT_UNKNOWN')
  assert.match(refused.reason, /ja-boxing\/j6\/1\.0\.10/)
})

test('an unset or switched-off door refuses the run with its reason', opts, async () => {
  const { pool } = db
  const unset = await start(pool)
  assert.equal(unset.code, 'SITE_PLANNER_DOOR_UNSET')
  assert.match(unset.reason, /Site planner/)
  await assignPlannerDoor(pool, { enabled: false })
  assert.equal((await start(pool)).code, 'SITE_PLANNER_DOOR_DISABLED')
  assert.equal((await pool.query('select count(*)::int as n from site_planner_run')).rows[0].n, 0)
})

test('a second run is refused while one is active, naming the active run', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const first = await startRun(pool)
  const second = await start(pool)
  assert.equal(second.ok, false)
  assert.equal(second.code, 'SITE_PLANNER_RUN_ACTIVE')
  assert.equal(second.active.id, first.id)
  assert.match(second.reason, new RegExp(first.id))
})

test(
  'cancelling a run nobody has picked up ends it at once; a finished run cannot be cancelled',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const run = await startRun(pool)
    const cancelled = await cancelBenchRun(pool, run.id)
    assert.equal(cancelled.ok, true)
    assert.equal(cancelled.run.status, 'cancelled')
    assert.equal(cancelled.run.step, 'done')
    assert.ok(cancelled.run.finishedAt)
    assert.equal((await cancelBenchRun(pool, run.id)).code, 'SITE_PLANNER_RUN_NOT_ACTIVE')
    assert.equal((await cancelBenchRun(pool, 'not-a-uuid')).code, 'SITE_PLANNER_RUN_NOT_FOUND')
    // The slot is free again.
    await startRun(pool)
  }
)

test('cancelling a run a worker holds only asks it to stop between model calls', opts, async () => {
  const { pool } = db
  await assignPlannerDoor(pool)
  const run = await startRun(pool)
  await pool.query(`update site_planner_run set lease_until = now() + interval '5 minutes' where id = $1`, [
    run.id
  ])
  const asked = await cancelBenchRun(pool, run.id)
  assert.equal(asked.ok, true)
  assert.equal(asked.run.status, 'queued')
  assert.ok(asked.run.cancelRequestedAt)
})

test('a brief is read from a WO revision by its id', opts, async () => {
  const { pool } = db
  assert.deepEqual(await briefOfRevision(pool, 'not-a-uuid'), {
    ok: false,
    code: 'SITE_PLANNER_REVISION_UNKNOWN'
  })
  const missing = await briefOfRevision(pool, '00000000-0000-4000-8000-000000000000')
  assert.equal(missing.code, 'SITE_PLANNER_REVISION_UNKNOWN')
})
