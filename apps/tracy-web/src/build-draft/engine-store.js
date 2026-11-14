/**
 * The engine state of the build chat in the account's draft (#609, migration 217): the latest step the engine doors
 * started, kept in the draft row so `GET /api/build-draft/engine` answers it after the request that started the step
 * has ended. Every write goes through `changeDraft` (`store.js`), one transaction holding the account's row.
 */
import { changeDraft } from './store.js'

/** What the engine reads of a draft: the state of its latest step and what that step's answer is made from. */
export async function readEngineRow(pool, accountId) {
  const { rows } = await pool.query(
    'select id, answers, template, plan, research, needs_profile, engine, brand, build from build_draft where account_id = $1',
    [accountId]
  )
  return rows[0] ?? null
}

/**
 * Mark a step running, unless one is running already. Answers `{started: true}`, `{running: engine}` when a step of
 * this process still runs, or `{error: 'NO_DRAFT'}`. `isLive(engine)` says whether a running state is still worked on.
 * @param {{step: string, inputs: object, runner: string, now: () => number}} start
 */
export async function startStep(pool, accountId, { step, inputs, runner, now }, isLive) {
  let running = null
  const result = await changeDraft(pool, accountId, (row) => {
    if (row.engine?.state === 'running' && isLive(row.engine)) {
      running = row.engine
      return { error: 'RUNNING' }
    }
    return {
      engine: { step, state: 'running', runner, inputs, startedAt: new Date(now()).toISOString() }
    }
  })
  if (running) return { running }
  return result.error ? result : { started: true }
}

/**
 * End the running step of `runner`: `ended` is `{state: 'done'}` or `{state: 'stopped', say, reason?}`, `columns` the
 * draft columns the step writes with it. A step that is no longer this runner's (a later start replaced it) changes
 * nothing.
 */
export function endStep(pool, accountId, runner, ended, columns = {}, now = Date.now) {
  return changeDraft(pool, accountId, (row) => {
    if (row.engine?.state !== 'running' || row.engine.runner !== runner) return { error: 'NOT_RUNNING' }
    return {
      ...columns,
      engine: { ...row.engine, ...ended, endedAt: new Date(now()).toISOString() }
    }
  })
}

/**
 * A step left `running` by a process that is gone (a restart) is stopped, with a fault for the team, so it never
 * reads as running forever. Answers whether it stopped one.
 */
export async function stopOrphan(pool, accountId, isLive, ended, now = Date.now) {
  let stopped = false
  await changeDraft(pool, accountId, (row) => {
    if (row.engine?.state !== 'running' || isLive(row.engine)) return { error: 'NOT_ORPHAN' }
    stopped = true
    const at = new Date(now()).toISOString()
    return {
      engine: { ...row.engine, ...ended, endedAt: at },
      fault: { step: row.engine.step, code: 'step_interrupted', message: 'the process running it ended', at }
    }
  })
  return stopped
}

/** Write a finished step that ran inside its request (an edit): no running state in between. */
export function putEndedStep(pool, accountId, engine, now = Date.now) {
  const at = new Date(now()).toISOString()
  return changeDraft(pool, accountId, () => ({ engine: { ...engine, startedAt: at, endedAt: at } }))
}
