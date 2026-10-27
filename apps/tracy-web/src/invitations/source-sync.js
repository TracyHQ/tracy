import { performance } from 'node:perf_hooks'
import { SOURCE_NAMES, sourceError } from './source-contract.js'
import { getSourceFixture } from './source-fixtures.js'
import {
  beginSourceRun,
  applySourcePage,
  readSourceState,
  sourceDigest,
  sourceTransaction,
  lockSourceCampaigns
} from './source-store.js'

const ERROR_CODES = new Set([
  'source_cursor_expired',
  'source_cursor_invalid',
  'source_cursor_loop',
  'source_page_conflict',
  'source_version_conflict',
  'source_page_limit',
  'source_schema_invalid',
  'source_version_invalid',
  'source_identity_invalid',
  'source_fact_invalid',
  'source_transaction_limit',
  'source_unavailable',
  'source_coverage_incomplete',
  'source_sync_timeout'
])
const coverageComplete = (values) =>
  Array.isArray(values) && SOURCE_NAMES.every((source) => values.includes(source))
export async function getSourceHealth(db, scopeId) {
  return (await readSourceState(db, scopeId, [])).scope
}

async function boundedRead(action, milliseconds) {
  if (milliseconds <= 0) throw sourceError('source_sync_timeout', 409)
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(sourceError('source_sync_timeout', 409)), milliseconds)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function resultFor(db, run) {
  return {
    runId: run.id,
    status: run.status,
    scope: await getSourceHealth(db, run.scope_id),
    campaignRevision: (
      await db.query('select revision from invitations_sandbox_campaign where id=$1', [run.campaign_id])
    ).rows[0].revision
  }
}

async function finishRun(pool, runId, onFactsChanged) {
  return sourceTransaction(pool, async (db, now) => {
    const run = (await db.query('select * from invitations_source_run where id=$1 for update', [runId]))
      .rows[0]
    if (run.status === 'ready') return run.result
    if (!run.state.snapshotComplete || !run.state.checkpointComplete || !coverageComplete(run.state.coverage))
      throw sourceError('source_coverage_incomplete', 409)
    await db.query('select id from invitations_source_scope where id=$1 for update', [run.scope_id])
    const affectedCampaigns = await lockSourceCampaigns(db, run.scope_id)
    await db.query(
      "update invitations_source_scope set status='ready',reasons='[]',fence_cursor=$2,cursor=$3,completed_at=$4 where id=$1",
      [run.scope_id, run.state.fenceCursor, run.state.token, now]
    )
    const current = (await readSourceState(db, run.scope_id)).current
    await onFactsChanged({ db, scopeId: run.scope_id, previous: current, current, affectedCampaigns, now })
    for (const row of affectedCampaigns)
      await db.query('update invitations_sandbox_campaign set data=$2,revision=revision+1 where id=$1', [
        row.id,
        row.data
      ])
    run.status = 'ready'
    const result = await resultFor(db, run)
    await db.query("update invitations_source_run set status='ready',result=$2,error_code=null where id=$1", [
      run.id,
      result
    ])
    return result
  })
}

/** Bounded explicit sync; resolver injection is server/test-only, never browser input. */
export async function syncSourceFixture({
  pool,
  campaignId,
  actor,
  revision,
  fixtureId,
  requestKey,
  onFactsChanged = async () => {},
  resolveFixture = getSourceFixture
}) {
  // The original revision is part of the request digest. Replays use the original input.
  let run = await beginSourceRun({
    pool,
    campaignId,
    actor,
    revision,
    fixtureId,
    requestKey,
    requestDigest: sourceDigest({ campaignId, actor, revision, fixtureId, requestKey })
  })
  if (run.status === 'ready') return run.result
  if (run.terminal) return sourceTransaction(pool, (db) => resultFor(db, run), { readOnly: true })
  const started = performance.now()
  const remaining = () => Math.max(0, 10000 - (performance.now() - started))
  try {
    const adapter = resolveFixture(fixtureId, {
      anchor: run.anchor.toISOString(),
      versionBase: Number(run.version_base)
    })
    const status = await boundedRead(() => adapter.status(), remaining())
    if (status?.ready !== true) throw sourceError('source_unavailable', 409)
    if (!coverageComplete(status.coverage)) throw sourceError('source_coverage_incomplete', 409)
    for (let count = 0; count < 16 && remaining() > 0; count++) {
      run = (await pool.query('select * from invitations_source_run where id=$1', [run.id])).rows[0]
      if (run.status === 'ready') return run.result
      if (run.state.checkpointComplete) return await finishRun(pool, run.id, onFactsChanged)
      const page = await boundedRead(
        () =>
          run.state.phase === 'snapshot'
            ? adapter.snapshotPage({ pageToken: run.state.token })
            : adapter.changesPage({ cursor: run.state.token }),
        remaining()
      )
      await applySourcePage({ pool, runId: run.id, page, onFactsChanged })
    }
    run = (await pool.query('select * from invitations_source_run where id=$1', [run.id])).rows[0]
    if (run.state.checkpointComplete) return await finishRun(pool, run.id, onFactsChanged)
    return sourceTransaction(pool, (db) => resultFor(db, run), { readOnly: true })
  } catch (error) {
    if (error.code === 'source_run_superseded') throw error
    const code = ERROR_CODES.has(error.code) ? error.code : 'source_sync_failed'
    return sourceTransaction(pool, async (db, now) => {
      const stored = (await db.query('select * from invitations_source_run where id=$1 for update', [run.id]))
        .rows[0]
      if (stored.status === 'ready') return stored.result
      if (stored.status === 'superseded') throw sourceError('source_run_superseded', 409)
      await db.query('select id from invitations_source_scope where id=$1 for update', [run.scope_id])
      const affectedCampaigns = await lockSourceCampaigns(db, run.scope_id)
      await db.query("update invitations_source_scope set status='failed',reasons=$2 where id=$1", [
        run.scope_id,
        JSON.stringify([code])
      ])
      const current = (await readSourceState(db, run.scope_id)).current
      await onFactsChanged({ db, scopeId: run.scope_id, previous: current, current, affectedCampaigns, now })
      for (const row of affectedCampaigns)
        await db.query('update invitations_sandbox_campaign set data=$2,revision=revision+1 where id=$1', [
          row.id,
          row.data
        ])
      await db.query(
        "update invitations_source_run set status='failed',error_code=$2,terminal=$3 where id=$1",
        [run.id, code, code === 'source_cursor_expired']
      )
      return resultFor(db, { ...run, status: 'failed' })
    })
  }
}
