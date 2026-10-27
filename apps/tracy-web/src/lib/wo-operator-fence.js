/**
 * The `/ops/wo` recovery actions that touch research — `force-complete-brief`, `reset-cap-resume`,
 * `reclaim-retry` (`wo-ops.js runWoOperatorAction`; tasks/todo-wo-shared-research.md P4.3).
 *
 * 🔒 THE OPERATOR TAKES THE LEASE BEFORE WRITING. A legacy opportunity (no place): one transaction locks
 * its jobs `for update` first, so a worker inside `fenced()` finishes its write before the action starts,
 * and the action's token bump makes every later fenced write of that worker fail.
 * 🔒 A SHARED PLACE GETS NO PER-OPPORTUNITY RESEARCH WRITES. Its sources belong to the place job, so the
 * action goes through the place: retry/resume queue the place's run (`requeuePlaceFor`); a forced brief
 * answers the opportunity's own request with the published snapshot and pins it on the revision.
 * A forced brief names no CMS or template, as no brief does since 24/10/2026: the build chooses them.
 * Every outcome keeps the old answer `{ok, action, opportunityId, status}` (or `{ok: false, status, error}`).
 */
import { requeuePlaceFor } from 'website-opportunities/src/wo-places-store.js'
import { principalOf } from './wo-principal.js'

export const FENCED_ACTIONS = new Set(['force-complete-brief', 'reset-cap-resume', 'reclaim-retry'])

async function inTx(pool, fn) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const lockJobs = (client, opportunityId) =>
  client.query('select id from wo_job where opportunity_id = $1 order by id for update', [opportunityId])

const clearCaps = (client, accountId) =>
  client.query(`delete from rate_bucket where bucket like $1 or bucket like $2`, [
    `wo:apify:${accountId}%`,
    `wo:search:${accountId}%`
  ])

const setStatus = (client, opportunityId, status) =>
  client.query('update wo_opportunity set status = $2, updated_at = now() where id = $1', [
    opportunityId,
    status
  ])

class Refused extends Error {
  constructor(status, error, message) {
    super(message)
    this.outcome = { ok: false, status, error, message }
  }
}

async function insertForcedRevision(client, opp, operatorEmail, placeSnapshotId = null) {
  const exists = await client.query('select 1 from wo_revision where opportunity_id = $1 limit 1', [opp.id])
  if (exists.rows.length) return
  const candidate = opp.candidate && typeof opp.candidate === 'object' ? opp.candidate : {}
  const brief = {
    identity: { name: opp.name, branch: opp.branch || '', address: candidate.address || '' },
    forcedBy: operatorEmail,
    forcedAt: new Date().toISOString()
  }
  await client.query(
    `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest, place_snapshot_id)
     values ($1, $2, 1, $3::jsonb, $4, '[]'::jsonb, $5)`,
    [
      opp.id,
      opp.account_id,
      JSON.stringify(brief),
      `# ${opp.name}\n\nSynthesized by operator (${operatorEmail}) from available sources.`,
      placeSnapshotId
    ]
  )
}

async function legacy(client, opp, action, operatorEmail) {
  await lockJobs(client, opp.id)
  if (action === 'force-complete-brief') {
    await client.query(
      `update wo_source set status = 'skipped', reason = coalesce(reason, 'skipped_by_operator'), updated_at = now()
        where opportunity_id = $1 and status in ('blocked', 'failed', 'paused', 'running', 'pending')`,
      [opp.id]
    )
    await client.query(
      `update wo_job set state = 'completed', stage = 'done', lease_owner = null, lease_until = null,
              lease_token = lease_token + 1, updated_at = now()
        where opportunity_id = $1 and state in ('queued', 'running', 'paused', 'blocked', 'failed')`,
      [opp.id]
    )
    await insertForcedRevision(client, opp, operatorEmail)
    await setStatus(client, opp.id, 'ready')
    return 'ready'
  }
  if (action === 'reset-cap-resume') await clearCaps(client, opp.account_id)
  await client.query(
    `update wo_job set state = 'queued', lease_owner = null, lease_until = null,
            lease_token = lease_token + 1, last_error = null, updated_at = now()
      where opportunity_id = $1 and state in ('running', 'paused', 'blocked', 'failed')`,
    [opp.id]
  )
  if (action === 'reclaim-retry')
    await client.query(
      `update wo_source set status = 'pending', reason = null, updated_at = now()
        where opportunity_id = $1 and status in ('blocked', 'failed', 'paused', 'running')`,
      [opp.id]
    )
  await setStatus(client, opp.id, 'collecting')
  return 'collecting'
}

async function shared(client, opp, action, operatorEmail) {
  await lockJobs(client, opp.id)
  if (action === 'force-complete-brief') {
    const snapshotId = (
      await client.query(
        `select s.id from wo_place p join wo_place_snapshot s on s.id = p.current_snapshot_id
          where p.id = $1 and s.state = 'published'`,
        [opp.place_id]
      )
    ).rows[0]?.id
    if (!snapshotId)
      throw new Refused(
        409,
        'NO_PUBLISHED_SNAPSHOT',
        'This place has no published research yet; refresh it under Places first.'
      )
    // Only this account's requests: other accounts keep waiting on the place's run.
    await client.query(
      `update wo_job set state = 'completed', stage = 'done', result_snapshot_id = $2, updated_at = now()
        where opportunity_id = $1 and result_snapshot_id is null
          and state in ('queued', 'running', 'paused', 'blocked', 'failed')`,
      [opp.id, snapshotId]
    )
    await insertForcedRevision(client, opp, operatorEmail, snapshotId)
    await setStatus(client, opp.id, 'ready')
    return 'ready'
  }
  if (action === 'reset-cap-resume') await clearCaps(client, opp.account_id)
  await requeuePlaceFor(client, opp.place_id, opp.id, { actor: operatorEmail, action, principalOf })
  await setStatus(client, opp.id, 'collecting')
  return 'collecting'
}

/** Run one of `FENCED_ACTIONS` on `opp` (its `wo_opportunity` row). */
export async function runFencedResearchAction(pool, opp, action, operatorEmail) {
  try {
    const status = await inTx(pool, (client) =>
      (opp.place_id ? shared : legacy)(client, opp, action, operatorEmail)
    )
    return { ok: true, action, opportunityId: opp.id, status }
  } catch (error) {
    if (error instanceof Refused) return error.outcome
    throw error
  }
}
