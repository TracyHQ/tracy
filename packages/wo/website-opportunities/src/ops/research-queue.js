/**
 * The research queue as the operator sees it: place jobs (`wo_place_job`) by state, and the two things an operator
 * may do to one. Retry queues the place again the way an operator's retry always has (`joinPlace` with `evenIfFresh`:
 * a stopped run keeps its cursors, a finished one starts anew). Cancel goes through `releasePlaceJob`, so a job a
 * request or a stranger still waits on is never stopped from here.
 */
import { joinPlace, releasePlaceJob } from '../place-jobs.js'

export const PLACE_JOB_STATES = Object.freeze([
  'queued',
  'running',
  'paused',
  'blocked',
  'failed',
  'cancelled',
  'completed'
])
/** What the queue shows when no state is asked for: work not done yet, and work that failed. */
const NEEDS_AN_EYE = ['queued', 'running', 'paused', 'blocked', 'failed']
const ACTIVE = ['queued', 'running', 'paused', 'blocked']
const RETRYABLE = ['failed', 'paused', 'blocked', 'cancelled']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOBS_MAX = 200

/** A stored `last_error` as one line of text, or null. */
export function errorText(lastError) {
  if (!lastError) return null
  if (typeof lastError === 'string') return lastError
  if (typeof lastError === 'object') {
    const code = lastError.code || lastError.reason || null
    const msg = lastError.message || lastError.detail || null
    if (code && msg) return `${code}: ${msg}`
    return msg || code || null
  }
  return null
}

const iso = (d) => (d ? new Date(d).toISOString() : null)

/**
 * Counts per state and the newest jobs (`state` one of PLACE_JOB_STATES, or the ones that need an eye).
 * @param {import('pg').Pool} pool
 * @param {{state?: string | null, limit?: number}} [filter]
 */
export async function researchQueue(pool, { state = null, limit = 50 } = {}) {
  const states = state ? [state] : NEEDS_AN_EYE
  const [counts, jobs] = await Promise.all([
    pool.query('select state, count(*)::int as n from wo_place_job group by state'),
    pool.query(
      `select j.id, j.place_id, p.display_name, j.state, j.stage, j.attempt, j.only_source, j.started_by,
              j.last_error, j.created_at, j.updated_at, j.lease_until
         from wo_place_job j join wo_place p on p.id = j.place_id
        where j.state = any($1)
        order by j.updated_at desc, j.id desc limit $2`,
      [states, Math.max(1, Math.min(JOBS_MAX, limit))]
    )
  ])
  const byState = Object.fromEntries(PLACE_JOB_STATES.map((s) => [s, 0]))
  for (const r of counts.rows) byState[r.state] = r.n
  return {
    counts: byState,
    jobs: jobs.rows.map((j) => ({
      id: j.id,
      placeId: j.place_id,
      placeName: j.display_name ?? null,
      state: j.state,
      stage: j.stage,
      attempt: j.attempt,
      onlySource: j.only_source ?? null,
      startedBy: j.started_by ?? null,
      error: errorText(j.last_error),
      createdAt: iso(j.created_at),
      updatedAt: iso(j.updated_at),
      leaseUntil: iso(j.lease_until),
      retryable: RETRYABLE.includes(j.state),
      cancellable: ACTIVE.includes(j.state)
    }))
  }
}

const jobById = async (db, id, lock = '') =>
  UUID.test(id)
    ? (await db.query(`select * from wo_place_job where id = $1 ${lock}`, [id])).rows[0]
    : undefined

/**
 * Queue a stopped or finished job's place again. `{job}` (the job that will run), or `{error: 'NOT_FOUND' |
 * 'NOT_RETRYABLE'}` (a job still queued or running, or one that completed: Research again is the place's own door).
 */
export async function retryPlaceJob(pool, id, { now = Date.now } = {}) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const job = await jobById(client, id, 'for update')
    if (!job || !RETRYABLE.includes(job.state)) {
      await client.query('rollback')
      return { error: job ? 'NOT_RETRYABLE' : 'NOT_FOUND' }
    }
    const joined = await joinPlace(client, job.place_id, {
      evenIfFresh: true,
      now: now(),
      starter: { kind: 'operator', accountId: null }
    })
    await client.query('commit')
    return { job: { id: joined.job.id, state: joined.job.state, placeId: joined.job.place_id } }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Stop a job nobody waits on. `{ok: true}`, or `{error: 'NOT_FOUND' | 'NOT_ACTIVE' | 'STILL_WANTED'}`. */
export async function cancelPlaceJob(pool, id) {
  const job = await jobById(pool, id)
  if (!job) return { error: 'NOT_FOUND' }
  if (!ACTIVE.includes(job.state)) return { error: 'NOT_ACTIVE' }
  if (await releasePlaceJob(pool, id)) return { ok: true }
  const after = await jobById(pool, id)
  return { error: ACTIVE.includes(after?.state) ? 'STILL_WANTED' : 'NOT_ACTIVE' }
}
