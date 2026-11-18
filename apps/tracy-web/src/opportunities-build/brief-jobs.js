/**
 * Making a Content brief in the background (#524). The brief takes minutes (the photographs are labelled by a vision
 * model, the business may be read again), and a request held that long lost its answer to the proxy timeout or to a
 * deploy although the server wrote the brief. So the door answers 202 with a job at once, the work runs beside the
 * request, and the client polls the job like it polls Research.
 *
 * 🔒 ONE RUNNING JOB PER OPPORTUNITY (`wo_brief_job_one_running`): a second press joins the running one; the same
 * requestId answers the same job. 🔒 A STOPPED WORKER NEVER LEAVES A JOB RUNNING: the worker beats every
 * `heartbeatMs`; a running job silent for `staleMs` is read as done when its brief was written after it started, else
 * as failed (`BRIEF_INTERRUPTED`), so Try again is offered.
 */

/** The job as the doors answer it. */
export function briefJobShape(row) {
  if (!row) return null
  return {
    id: row.id,
    opportunityId: row.opportunity_id,
    state: row.state,
    step: row.step ?? null,
    revisionId: row.revision_id ?? null,
    reused: row.reused === true,
    error: row.error ?? null,
    startedAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/**
 * @param {{ pool: import('pg').Pool, make: (args: {accountId: string, opportunityId: string,
 *   onStep: (step: string) => void}) => Promise<object>, staleMs?: number, heartbeatMs?: number,
 *   log?: {warn?: Function}}} deps - `make`: the brief itself (`createRevision`), answering `{revision, reused}` or
 *   `{error, errors}`; it calls `onStep` as it moves ('reading', 'labelling', 'writing').
 */
export function createBriefJobs({ pool, make, staleMs = 5 * 60_000, heartbeatMs = 15_000, log = console }) {
  const running = new Map()

  async function settle(id, fields) {
    await pool.query(
      `update wo_brief_job set state = $2, step = $3, revision_id = $4, reused = $5, error = $6::jsonb,
         heartbeat_at = now(), updated_at = now() where id = $1 and state = 'running'`,
      [
        id,
        fields.state,
        fields.step ?? null,
        fields.revisionId ?? null,
        fields.reused === true,
        fields.error ? JSON.stringify(fields.error) : null
      ]
    )
  }

  async function run(job) {
    const beat = setInterval(() => {
      pool.query('update wo_brief_job set heartbeat_at = now() where id = $1', [job.id]).catch(() => {})
    }, heartbeatMs)
    beat.unref?.()
    let step = 'writing'
    try {
      const result = await make({
        accountId: job.account_id,
        opportunityId: job.opportunity_id,
        onStep: (next) => {
          step = next
          pool
            .query(
              `update wo_brief_job set step = $2, heartbeat_at = now(), updated_at = now() where id = $1 and state = 'running'`,
              [job.id, next]
            )
            .catch(() => {})
        }
      })
      if (result?.revision)
        await settle(job.id, { state: 'done', step, revisionId: result.revision.id, reused: result.reused })
      else
        await settle(job.id, {
          state: 'failed',
          step,
          error: {
            code: result?.error === 'NOT_FOUND' ? 'NOT_FOUND' : 'BRIEF_INVALID',
            ...(result?.errors ? { errors: result.errors } : {})
          }
        })
    } catch (error) {
      log?.warn?.(`[wo brief job] ${job.id}: ${error?.message ?? error}`)
      await settle(job.id, {
        state: 'failed',
        step,
        error: { code: typeof error?.code === 'string' ? error.code : 'BRIEF_FAILED' }
      }).catch(() => {})
    } finally {
      clearInterval(beat)
    }
  }

  /** A running job whose worker went silent: done when its brief was written after it started, else failed. */
  async function healed(row) {
    if (row?.state !== 'running' || Date.now() - new Date(row.heartbeat_at).getTime() < staleMs) return row
    if (running.has(row.id)) return row
    const written = (
      await pool.query(
        `select id from wo_revision where opportunity_id = $1 and created_at >= $2 order by created_at desc limit 1`,
        [row.opportunity_id, row.created_at]
      )
    ).rows[0]
    await settle(
      row.id,
      written
        ? { state: 'done', step: row.step, revisionId: written.id }
        : { state: 'failed', step: row.step, error: { code: 'BRIEF_INTERRUPTED' } }
    )
    return (await pool.query('select * from wo_brief_job where id = $1', [row.id])).rows[0]
  }

  return {
    /**
     * Start (or join) the brief job of one opportunity. @returns {Promise<{job: object, created: boolean}>}
     */
    async start({ accountId, opportunityId, requestId }) {
      const same = (
        await pool.query('select * from wo_brief_job where account_id = $1 and request_id = $2', [
          accountId,
          requestId
        ])
      ).rows[0]
      if (same) {
        if (same.opportunity_id !== opportunityId) return { reused: true }
        return { job: await healed(same), created: false }
      }
      const live = (
        await pool.query(`select * from wo_brief_job where opportunity_id = $1 and state = 'running'`, [
          opportunityId
        ])
      ).rows[0]
      const current = live ? await healed(live) : null
      if (current?.state === 'running') return { job: current, created: false }
      let job
      try {
        job = (
          await pool.query(
            `insert into wo_brief_job (account_id, opportunity_id, request_id, step) values ($1, $2, $3, 'reading') returning *`,
            [accountId, opportunityId, requestId]
          )
        ).rows[0]
      } catch (error) {
        if (error?.code !== '23505') throw error
        const raced = (
          await pool.query(`select * from wo_brief_job where opportunity_id = $1 and state = 'running'`, [
            opportunityId
          ])
        ).rows[0]
        if (!raced) throw error
        return { job: raced, created: false }
      }
      const done = run(job).finally(() => running.delete(job.id))
      running.set(job.id, done)
      return { job, created: true }
    },

    /** One job of this account, its stopped worker healed. Null when it is not this account's. */
    async read(accountId, opportunityId, jobId) {
      const row = (
        await pool.query(
          'select * from wo_brief_job where id = $1 and account_id = $2 and opportunity_id = $3',
          [jobId, accountId, opportunityId]
        )
      ).rows[0]
      return row ? await healed(row) : null
    },

    /** The latest job of an opportunity (the Details page shows a running or failed one), healed. */
    async latestOf(opportunityId) {
      const row = (
        await pool.query(
          'select * from wo_brief_job where opportunity_id = $1 order by created_at desc limit 1',
          [opportunityId]
        )
      ).rows[0]
      return row ? await healed(row) : null
    },

    /** Resolves when every job this process runs has settled (tests, shutdown). */
    async idle() {
      await Promise.allSettled(running.values())
    }
  }
}
