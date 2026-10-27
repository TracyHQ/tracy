// The three /ops/wo recovery actions that touch research (`force-complete-brief`, `reset-cap-resume`,
// `reclaim-retry`, `lib/wo-operator-fence.js`) take the job's lease before they write: a worker still
// holding the old token writes nothing afterwards. For an opportunity on a shared place they write no
// per-opportunity research at all and go through the place's job instead (tasks/todo-wo-shared-research.md
// P4.3). Real PostgreSQL; the HTTP shape of POST /api/ops/wo/opportunities/:id/action is unchanged.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { runWoOperatorAction } from '../src/lib/wo-ops.js'
import { PREFERENCE_LOCK_SQL } from '../src/lib/wo-revision-choice.js'
import { StaleLeaseError, fenced, preferenceLockSql } from 'website-opportunities/src/store.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const pg = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const OPERATOR = 'owner@tracy.test'

async function seedOpportunity({ placeId = null } = {}) {
  const accountId = (
    await db.pool.query(`insert into account (email) values ('a@customer.test') returning id`)
  ).rows[0].id
  const opp = (
    await db.pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, place_id, status)
       values ($1, 'Pho Ba', 'google-places', 'g-pho', $2, 'collecting') returning *`,
      [accountId, placeId]
    )
  ).rows[0]
  await db.pool.query(
    `insert into wo_source (opportunity_id, source, ref, status) values ($1, 'instagram', 'https://instagram.com/pho', 'failed')`,
    [opp.id]
  )
  return opp
}

async function runningJob(opp, extra = {}) {
  return (
    await db.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state, lease_owner, lease_token, lease_until, place_job_id)
       values ($1, $2, 'research', 'r1', 'running', 'worker-1', 3, now() + interval '5 minutes', $3) returning *`,
      [opp.account_id, opp.id, extra.placeJobId ?? null]
    )
  ).rows[0]
}

const sourceStatus = async (oppId) =>
  (await db.pool.query('select status from wo_source where opportunity_id = $1', [oppId])).rows[0].status

test(
  'reclaim-retry takes the lease first: a worker holding the old token writes nothing after it',
  pg,
  async () => {
    const opp = await seedOpportunity()
    const job = await runningJob(opp)
    const lease = { jobId: job.id, token: '3' }
    // The worker is mid-write (holding its fenced transaction) when the operator acts: the action waits.
    let actionDone = false
    let action
    await fenced(db.pool, lease, async (client) => {
      action = runWoOperatorAction(db.pool, opp.id, 'reclaim-retry', OPERATOR).then((out) => {
        actionDone = true
        return out
      })
      await new Promise((r) => setTimeout(r, 150))
      assert.equal(actionDone, false)
      // Nothing of the action landed while the worker still held the lease.
      assert.equal(await sourceStatus(opp.id), 'failed')
      await client.query(`update wo_source set status = 'done' where opportunity_id = $1`, [opp.id])
    })
    const out = await action
    assert.deepEqual(out, { ok: true, action: 'reclaim-retry', opportunityId: opp.id, status: 'collecting' })
    // The worker's write landed first; the retry then resets only what is unfinished, so `done` stays.
    assert.equal(await sourceStatus(opp.id), 'done')
    await assert.rejects(
      fenced(db.pool, lease, async (client) =>
        client.query(`update wo_source set status = 'failed' where opportunity_id = $1`, [opp.id])
      ),
      StaleLeaseError
    )
    const after = (await db.pool.query('select state, lease_token from wo_job where id = $1', [job.id]))
      .rows[0]
    assert.deepEqual(after, { state: 'queued', lease_token: '4' })
  }
)

test(
  'force-complete-brief on a legacy opportunity still skips its sources and writes a brief, fenced',
  pg,
  async () => {
    const opp = await seedOpportunity()
    const job = await runningJob(opp)
    const out = await runWoOperatorAction(db.pool, opp.id, 'force-complete-brief', OPERATOR)
    assert.deepEqual(out, {
      ok: true,
      action: 'force-complete-brief',
      opportunityId: opp.id,
      status: 'ready'
    })
    assert.equal(await sourceStatus(opp.id), 'skipped')
    await assert.rejects(
      fenced(db.pool, { jobId: job.id, token: '3' }, async () => {}),
      StaleLeaseError
    )
    const rev = (
      await db.pool.query(
        "select n, brief->>'forcedBy' as forced_by from wo_revision where opportunity_id = $1",
        [opp.id]
      )
    ).rows
    assert.deepEqual(rev, [{ n: 1, forced_by: OPERATOR }])
  }
)

async function sharedPlace({ published = true } = {}) {
  const placeId = (await db.pool.query(`insert into wo_place (display_name) values ('Pho Ba') returning id`))
    .rows[0].id
  let snapshotId = null
  if (published) {
    snapshotId = (
      await db.pool.query(
        `insert into wo_place_snapshot (place_id, state, published_at) values ($1, 'published', now()) returning id`,
        [placeId]
      )
    ).rows[0].id
    await db.pool.query('update wo_place set current_snapshot_id = $2 where id = $1', [placeId, snapshotId])
  }
  return { placeId, snapshotId }
}

test(
  'reclaim-retry on a shared place writes no opportunity research and queues the place job',
  pg,
  async () => {
    const { placeId } = await sharedPlace()
    const placeJob = (
      await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, 'failed') returning id`, [
        placeId
      ])
    ).rows[0].id
    const opp = await seedOpportunity({ placeId })
    const request = (
      await db.pool.query(
        `insert into wo_job (account_id, opportunity_id, kind, request_id, state, place_job_id)
       values ($1, $2, 'research', 'r1', 'failed', $3) returning id`,
        [opp.account_id, opp.id, placeJob]
      )
    ).rows[0].id
    const out = await runWoOperatorAction(db.pool, opp.id, 'reclaim-retry', OPERATOR)
    assert.deepEqual(out, { ok: true, action: 'reclaim-retry', opportunityId: opp.id, status: 'collecting' })
    assert.equal(await sourceStatus(opp.id), 'failed')
    const queued = (
      await db.pool.query(`select id from wo_place_job where place_id = $1 and state = 'queued'`, [placeId])
    ).rows
    assert.equal(queued.length, 1)
    const req = (await db.pool.query('select state, place_job_id from wo_job where id = $1', [request]))
      .rows[0]
    assert.deepEqual(req, { state: 'queued', place_job_id: queued[0].id })
    const events = (await db.pool.query('select action, actor, detail from wo_place_ops_event')).rows
    assert.equal(events.length, 1)
    assert.equal(events[0].detail.via, 'reclaim-retry')
  }
)

test(
  'force-complete-brief on a shared place answers the request with the published snapshot and pins it',
  pg,
  async () => {
    const { placeId, snapshotId } = await sharedPlace()
    const placeJob = (
      await db.pool.query(`insert into wo_place_job (place_id, state) values ($1, 'running') returning id`, [
        placeId
      ])
    ).rows[0].id
    const opp = await seedOpportunity({ placeId })
    const request = (
      await db.pool.query(
        `insert into wo_job (account_id, opportunity_id, kind, request_id, state, place_job_id)
       values ($1, $2, 'research', 'r1', 'running', $3) returning id`,
        [opp.account_id, opp.id, placeJob]
      )
    ).rows[0].id
    const out = await runWoOperatorAction(db.pool, opp.id, 'force-complete-brief', OPERATOR)
    assert.equal(out.status, 'ready')
    assert.equal(await sourceStatus(opp.id), 'failed')
    const req = (await db.pool.query('select state, result_snapshot_id from wo_job where id = $1', [request]))
      .rows[0]
    assert.deepEqual(req, { state: 'completed', result_snapshot_id: snapshotId })
    // Other accounts still wait on the place job: it keeps running.
    assert.equal(
      (await db.pool.query('select state from wo_place_job where id = $1', [placeJob])).rows[0].state,
      'running'
    )
    const rev = (
      await db.pool.query('select place_snapshot_id from wo_revision where opportunity_id = $1', [opp.id])
    ).rows
    assert.deepEqual(rev, [{ place_snapshot_id: snapshotId }])
  }
)

test('force-complete-brief on a shared place with nothing published is refused', pg, async () => {
  const { placeId } = await sharedPlace({ published: false })
  const opp = await seedOpportunity({ placeId })
  const out = await runWoOperatorAction(db.pool, opp.id, 'force-complete-brief', OPERATOR)
  assert.equal(out.ok, false)
  assert.equal(out.status, 409)
  assert.equal(out.error, 'NO_PUBLISHED_SNAPSHOT')
  assert.equal((await db.pool.query('select 1 from wo_revision')).rowCount, 0)
})

test('reset-cap-resume on a shared place queues the place job and leaves the sources alone', pg, async () => {
  const { placeId } = await sharedPlace()
  const opp = await seedOpportunity({ placeId })
  const out = await runWoOperatorAction(db.pool, opp.id, 'reset-cap-resume', OPERATOR)
  assert.deepEqual(out, { ok: true, action: 'reset-cap-resume', opportunityId: opp.id, status: 'collecting' })
  assert.equal(await sourceStatus(opp.id), 'failed')
  assert.equal(
    (await db.pool.query(`select 1 from wo_place_job where place_id = $1 and state = 'queued'`, [placeId]))
      .rowCount,
    1
  )
})

// ── A forced brief chooses its CMS and template like a revision the customer asked for (#1461) ──

const TRACY_BASE_TAGS = {
  joomla: 'tracy-base/j6',
  wordpress: 'tracy-base/wp7',
  emdash: 'tracy-base/emdash-0.x'
}

async function seedTracyBaseReleases() {
  for (const [platform, tag] of Object.entries(TRACY_BASE_TAGS))
    await db.pool.query(
      `insert into quickstart_releases (tag, release, setting, inspiration, tracy)
       values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 'ready')`,
      [
        tag,
        JSON.stringify({
          name: tag,
          kind: 'quickstart',
          github: 'published',
          publishedAt: '2026-10-18T12:00:00Z'
        }),
        JSON.stringify({ platform, version: '1.0.0', label: 'Tracy Base', template: 'tracy-base' }),
        JSON.stringify({ template: 'tracy' })
      ]
    )
}

async function saveOpsSettings(settings) {
  await db.pool.query(
    `insert into wo_ops_setting (id, settings, updated_by) values (true, $1::jsonb, 'owner@tracy.test')`,
    [JSON.stringify(settings)]
  )
}

// A forced brief is a brief: it names no CMS or template, so no pin can refuse it (the build chooses, 24/10/2026).
test(
  'force-complete-brief writes a brief with no CMS or template, even under a strict pin no longer offered',
  pg,
  async () => {
    await seedTracyBaseReleases()
    await saveOpsSettings({
      templatePinPolicy: 'strict',
      pinnedTemplates: { emdash: 'tracy-base/emdash-9.x' }
    })
    const opp = await seedOpportunity()
    const out = await runWoOperatorAction(db.pool, opp.id, 'force-complete-brief', OPERATOR)
    assert.equal(out.status, 'ready')
    const [rev] = (await db.pool.query('select * from wo_revision where opportunity_id = $1', [opp.id])).rows
    for (const column of ['cms', 'cms_source', 'resolved_at', 'template'])
      assert.equal(column in rev, false, column)
    assert.equal('cms' in rev.brief, false)
  }
)

test('a forced brief and a Settings save lock the same preference key', () => {
  // test-quality: contract lib/ cannot import opportunities/store.js, so the key is written twice
  assert.equal(PREFERENCE_LOCK_SQL, preferenceLockSql)
})
