import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { listWoQueue } from '../src/lib/wo-ops.js'
import { fileDb } from './_db.mjs'

const opts = { skip: !process.env.TEST_DATABASE_URL && 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const config = { origin: 'https://tracy.test', sessionSecret: 's'.repeat(32), siteDomain: 'tracy.test' }

// The request is deliberately stale: only the shared worker receives collection checkpoints.
async function fixture({ state = 'running', shared = true, snapshot = true, consumed = false } = {}) {
  const pool = db.pool
  const account = (await pool.query("insert into account(email) values('ops@test.example') returning id"))
    .rows[0].id
  const opportunity = (
    await pool.query(
      `insert into wo_opportunity(account_id,name,provider,provider_id,candidate,status)
    values($1,'Harbor Gym','url','https://harbor.example','{}','collecting') returning id`,
      [account]
    )
  ).rows[0].id
  let worker = null
  let snapshotId = null
  if (shared) {
    const place = (await pool.query("insert into wo_place(display_name) values('Harbor Gym') returning id"))
      .rows[0].id
    worker = (
      await pool.query(
        `insert into wo_place_job(place_id,state,stage,progress,lease_owner,lease_until,heartbeat_at,attempt)
      values($1,'running','collection','{"collecting":"website"}','shared-worker',now()+interval '1 hour',now(),2) returning id`,
        [place]
      )
    ).rows[0].id
    if (snapshot) {
      snapshotId = (
        await pool.query(`insert into wo_place_snapshot(place_id,job_id) values($1,$2) returning id`, [
          place,
          worker
        ])
      ).rows[0].id
      await pool.query('update wo_place_job set snapshot_id=$1 where id=$2', [snapshotId, worker])
      await pool.query(
        `insert into wo_place_snapshot_source(snapshot_id,source,ref,status)
        values($1,'website','https://harbor.example','pending'),($1,'instagram','https://instagram.com/harbor','done')`,
        [snapshotId]
      )
    }
  }
  const job = (
    await pool.query(
      `insert into wo_job(account_id,opportunity_id,kind,request_id,state,stage,
      place_job_id,result_snapshot_id,created_at,updated_at,last_error)
    values($1,$2,'research','request-1',$3,'discovery',$4,$5,now()-interval '2 minutes',now()-interval '118 seconds','{"code":"STALE","message":"Old request error"}') returning id`,
      [account, opportunity, state, worker, consumed ? snapshotId : null]
    )
  ).rows[0].id
  await pool.query(
    `insert into wo_source(opportunity_id,source,ref,status) values($1,'facebook','https://facebook.com/harbor','done'),
      ($1,'website','https://harbor.example','done')`,
    [opportunity]
  )
  return { opportunity, job, worker }
}

async function rowFor(fixture) {
  const result = await listWoQueue(db.pool, config)
  const row = result.opportunities.find((row) => row.id === fixture.opportunity)
  assert.ok(row, 'the actual Ops SQL must return the fixture opportunity')
  return row
}

test(
  'Ops follows the active shared worker and current snapshot, preserving request identity',
  opts,
  async () => {
    const f = await fixture()
    const row = await rowFor(f)
    assert.equal(row.execution.jobId, f.job)
    assert.equal(row.execution.state, 'running')
    assert.equal(row.execution.stage, 'collection')
    assert.equal(row.execution.workerId, 'shared-worker')
    assert.equal(row.execution.attempt, 2)
    assert.equal(
      row.collectors.find((item) => item.name.startsWith('2.')).status,
      'pending',
      'the active snapshot replaces stale private status for the same link'
    )
    assert.equal(row.execution.errorCode, null, 'cleared worker errors must not revive stale request errors')
    assert.match(row.currentStep, /^Collecting website \(2\/3 done\)$/)
    assert.ok(row.durationSec >= 120 && row.durationSec < 130, `live elapsed seconds: ${row.durationSec}`)
    assert.equal(
      row.collectors.find((item) => item.name.startsWith('3.')).status,
      'success',
      'private sources remain visible'
    )
    assert.equal(
      row.collectors.find((item) => item.name.startsWith('4.')).status,
      'success',
      'current snapshot sources are visible'
    )
  }
)

for (const state of ['completed', 'cancelled', 'failed']) {
  test(`Ops keeps ${state} request diagnostics and frozen duration`, opts, async () => {
    const row = await rowFor(await fixture({ state }))
    assert.equal(row.execution.stage, 'discovery')
    assert.equal(row.execution.workerId, null)
    assert.equal(row.execution.errorCode, 'STALE')
    assert.equal(row.durationSec, 2)
    assert.equal(row.collectors.find((item) => item.name.startsWith('4.')).status, 'skipped')
  })
}

test('private research keeps its own diagnostics and live elapsed duration', opts, async () => {
  const row = await rowFor(await fixture({ shared: false }))
  assert.equal(row.execution.stage, 'discovery')
  assert.equal(row.execution.workerId, null)
  assert.ok(row.durationSec >= 120 && row.durationSec < 130)
})

test('shared work without a snapshot still exposes worker checkpoints', opts, async () => {
  const row = await rowFor(await fixture({ snapshot: false }))
  assert.equal(row.execution.stage, 'collection')
  assert.equal(row.execution.workerId, 'shared-worker')
  assert.match(row.currentStep, /^Collecting website/)
})

test('consumed shared results do not override private follow-up diagnostics', opts, async () => {
  const row = await rowFor(await fixture({ consumed: true }))
  assert.equal(row.execution.stage, 'discovery')
  assert.equal(row.execution.workerId, null)
  assert.equal(row.collectors.find((item) => item.name.startsWith('4.')).status, 'skipped')
})
