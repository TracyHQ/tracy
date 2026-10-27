/**
 * An account's research REQUEST for an opportunity that names a place (`WO_SHARED_RESEARCH` on): it is a
 * `wo_job` row served by the place's job (`place-jobs.js`), not a run of its own.
 *
 *   no run due             → the request is answered at once with the current snapshot (`result_snapshot_id`)
 *   place being researched → the request waits on that run and is answered when it publishes
 *   otherwise              → a place job is queued (or a paused one queued again) and the request waits on it
 *
 * Cancel stops only the account's request; the place job stops too only when no request is left on it.
 * Resume joins whatever run the place needs now. Force skips the freshness check and queues at most one
 * run after the one going. The sources only this opportunity names (its candidate's own website or social
 * pages) are researched for it alone, after the place's answer (`place-jobs.js answerOne`).
 */
import { answerOne, joinPlace, releasePlaceJob } from './place-jobs.js'
import { placeAgainPlan } from './research-again.js'
import { JobActiveError, cancelJob, ensurePlaceOf, jobOf, resumeJob } from './store.js'

const RESUMABLE = ['paused', 'blocked', 'failed', 'cancelled']

/** The account sent more never-researched places today than `/ops/wo` › newPlacesPerAccountPerDay allows. */
export class NewPlacesLimitError extends Error {
  constructor() {
    super('too many new places today')
    this.name = 'NewPlacesLimitError'
    this.code = 'NEW_PLACES_LIMIT'
  }
}

/** Research again found nothing due: `plan` says why each part was kept. */
export class NothingDueError extends Error {
  constructor(plan) {
    super('nothing to look at again')
    this.name = 'NothingDueError'
    this.code = 'NOTHING_DUE'
    this.plan = plan
  }
}

/** The account started `researchAgainPerAccountDay` Research again runs today (UTC). */
export class AgainLimitError extends Error {
  constructor() {
    super('too many research again runs today')
    this.name = 'AgainLimitError'
    this.code = 'RESEARCH_AGAIN_LIMIT'
  }
}

/** Research again runs `accountId` started on the UTC day of `now` (a joined run is not counted). */
export async function againRunsToday(db, accountId, now) {
  const from = new Date(Math.floor(now / 86_400_000) * 86_400_000)
  const { rows } = await db.query(
    `select count(*)::int as n from wo_place_job
      where again_plan is not null and started_by = 'account' and started_by_account_id = $1
        and created_at >= $2 and created_at < $3`,
    [accountId, from, new Date(from.getTime() + 86_400_000)]
  )
  return rows[0].n
}

/**
 * Make the request `requestId` of `opportunity` (the account's own row, with `place_id`). Throws
 * `JobActiveError` while another request of it is queued or running, and `NewPlacesLimitError` when the
 * place was never researched and `newPlaceAllowed()` (the account's abuse limit) says no: a place someone
 * already researched costs the account nothing.
 * @returns {Promise<{job: object, created: boolean}>}
 */
export async function requestResearch(
  pool,
  {
    accountId,
    opportunity,
    requestId,
    force = false,
    now = Date.now,
    requiredSources = {},
    onlySource = null,
    newPlaceAllowed = async () => true,
    again = null
  }
) {
  const placeId = await ensurePlaceOf(pool, opportunity)
  if (!placeId) throw new Error('requestResearch: the opportunity names no place')
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_opportunity where id = $1 and account_id = $2 for update', [
      opportunity.id,
      accountId
    ])
    const same = (
      await client.query('select * from wo_job where account_id = $1 and request_id = $2', [
        accountId,
        requestId
      ])
    ).rows[0]
    if (same) {
      await client.query('rollback')
      return { job: same, created: false }
    }
    const active = (
      await client.query(
        `select * from wo_job where opportunity_id = $1 and state in ('queued', 'running') order by created_at desc limit 1`,
        [opportunity.id]
      )
    ).rows[0]
    if (active) throw new JobActiveError(active)
    // `again` ({keys, settings, domain}): Research again — the plan is worked out under the place's lock and frozen
    // into the run; nothing due answers NOTHING_DUE, and only a run this press starts counts against the limit.
    let againPlan = null
    if (again) {
      await client.query('select 1 from wo_place where id = $1 for no key update', [placeId])
      againPlan = await placeAgainPlan(client, placeId, { now: now(), ...again })
      if (!againPlan.run.length) throw new NothingDueError(againPlan)
    }
    const joined = await joinPlace(client, placeId, {
      force,
      now: now(),
      requiredSources,
      onlySource,
      againPlan,
      starter: { kind: 'account', accountId },
      // A link added since the place's last research (`store.js candidateWithNewRefs`) asks for a new run.
      staleBefore: force ? null : (opportunity.candidate?.linksAddedAt ?? null)
    })
    if (
      again &&
      !joined.joined &&
      (await againRunsToday(client, accountId, now())) > (again.settings?.researchAgainPerAccountDay ?? 20)
    )
      throw new AgainLimitError()
    if (joined.newPlace && !(await newPlaceAllowed())) throw new NewPlacesLimitError()
    let job = (
      await client.query(
        `insert into wo_job (account_id, opportunity_id, kind, request_id, state, place_job_id)
         values ($1, $2, 'research', $3, $4, $5) returning *`,
        [
          accountId,
          opportunity.id,
          requestId,
          joined.job ? joined.job.state : 'queued',
          joined.job ? joined.job.id : null
        ]
      )
    ).rows[0]
    if (joined.current) job = await answered(client, job, opportunity, joined.current.id, placeId, now())
    await client.query('commit')
    return { job, created: true, ...(againPlan ? { plan: againPlan, joined: Boolean(joined.joined) } : {}) }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error?.code === '23505' && error?.constraint === 'wo_job_one_active') throw new JobActiveError(null)
    throw error
  } finally {
    client.release()
  }
}

async function answered(client, job, opportunity, snapshotId, placeId, now) {
  await answerOne(
    client,
    { id: job.id, opportunity_id: opportunity.id, candidate: opportunity.candidate },
    { snapshotId, placeId, now }
  )
  return (await client.query('select * from wo_job where id = $1', [job.id])).rows[0]
}

/** Cancel the account's request; its place job stops only when no other request waits on it. */
export async function cancelRequest(pool, accountId, jobId) {
  const cancelled = await cancelJob(pool, accountId, jobId)
  if (cancelled?.place_job_id && !cancelled.result_snapshot_id)
    await releasePlaceJob(pool, cancelled.place_job_id)
  return cancelled
}

/**
 * Queue a stopped request again. A request of the per-account path resumes as before (`resumeJob`). A
 * place request joins what its place needs now (`shared`), or, with shared research switched off, falls
 * back to a per-account run of its own. Throws `JobActiveError` like `resumeJob`.
 * @returns {Promise<object | null>} null when the job is not the account's or not resumable
 */
export async function resumeRequest(
  pool,
  accountId,
  jobId,
  { shared, now = Date.now, requiredSources = {} } = {}
) {
  const job = await jobOf(pool, accountId, jobId)
  if (!job) return null
  if (!job.place_job_id && !job.result_snapshot_id) return resumeJob(pool, accountId, jobId)
  const opportunity = (await pool.query('select * from wo_opportunity where id = $1', [job.opportunity_id]))
    .rows[0]
  const placeId = shared ? await ensurePlaceOf(pool, opportunity) : null
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select 1 from wo_opportunity where id = $1 for update', [job.opportunity_id])
    const active = (
      await client.query(
        `select * from wo_job where opportunity_id = $1 and id <> $2 and state in ('queued', 'running')
         order by created_at desc limit 1`,
        [job.opportunity_id, jobId]
      )
    ).rows[0]
    if (active) throw new JobActiveError(active)
    const own = (
      await client.query('select * from wo_job where id = $1 and account_id = $2 for update', [
        jobId,
        accountId
      ])
    ).rows[0]
    if (!own || !RESUMABLE.includes(own.state)) {
      await client.query('rollback')
      return null
    }
    let row
    if (!placeId) {
      row = (
        await client.query(
          `update wo_job set state = 'queued', stage = 'discovery', place_job_id = null, result_snapshot_id = null,
             last_error = null, updated_at = now() where id = $1 returning *`,
          [jobId]
        )
      ).rows[0]
    } else {
      const joined = await joinPlace(client, placeId, {
        now: now(),
        requiredSources,
        starter: { kind: 'account', accountId }
      })
      row = (
        await client.query(
          `update wo_job set state = $2, place_job_id = $3, result_snapshot_id = null, last_error = null,
             updated_at = now() where id = $1 returning *`,
          [jobId, joined.job ? joined.job.state : 'queued', joined.job ? joined.job.id : own.place_job_id]
        )
      ).rows[0]
      if (joined.current) row = await answered(client, row, opportunity, joined.current.id, placeId, now())
    }
    await client.query('commit')
    return row
  } catch (error) {
    await client.query('rollback').catch(() => {})
    if (error?.code === '23505' && error?.constraint === 'wo_job_one_active') throw new JobActiveError(null)
    throw error
  } finally {
    client.release()
  }
}
