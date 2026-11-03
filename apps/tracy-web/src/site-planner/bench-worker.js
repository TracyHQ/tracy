// The site planner bench worker (ADR 0041, #301): a durable queue over site_planner_run that claims the queued run,
// runs the approved planner prompt with runAgent over the site planner door and the two kit tools, saves every model
// call as it happens, parses the final answer as plan JSON (anything else is an error, never a plan), scores it with
// the checker and saves round 0 and the verdict. Fix rounds are #303.
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes
// from the saved turns. A call that was dispatched and never answered is never sent again (runAgent refuses with
// AGENT_TURN_UNANSWERED and the run fails with it), because the provider may have answered and charged it. Every
// claim counts as an attempt, so the retry limit is high. A cancel is honoured between two model calls.
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { AgentError, runAgent } from '../lib/agent-over-door.js'
import { saveRound, saveTurn, setProgress, turnsOf } from './bench-store.js'
import { sitePlannerDoor } from './door.js'
import { firstUserMessage, kitTools, openKit } from './kit-source.js'
import { CHECKER_VERSION, checkPlan, failureListText } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'

/** One run at a time; a lease of 3 minutes renewed every minute; a redeploy costs one of the 20 claims. */
export const BENCH_QUEUE = Object.freeze({ concurrency: 1, leaseMs: 3 * 60_000, maxAttempts: 20 })

const HARNESS_KEYS = ['maxTokens', 'effort', 'cacheTtl', 'toolImages', 'maxTurns', 'callTimeoutMs']

class LeaseLost extends Error {}

/**
 * @param {{ pool: import('pg').Pool, secret: string, fetchImpl?: typeof fetch, index?: Map<string, object>,
 *   log?: Console, now?: () => number }} deps
 */
export function createSitePlannerQueue({ pool, secret, fetchImpl = fetch, index, log = console, now }) {
  return createDurableQueue({
    pool,
    table: 'site_planner_run',
    keyColumn: 'id',
    name: 'site-planner',
    ...BENCH_QUEUE,
    log,
    ...(now ? { now } : {}),
    run: (row, lease) => runBenchRun({ pool, secret, fetchImpl, index }, row, lease)
  })
}

/** Run one claimed run to its verdict. False when the lease was lost and nothing more was written. */
export async function runBenchRun(deps, row, lease) {
  const { pool } = deps
  const runId = row.id
  const leaseToken = lease.token
  const must = async (written) => {
    if (!(await written)) throw new LeaseLost()
  }
  const round = (state, fields = {}) =>
    must(saveRound(pool, { runId, round: 0, state, leaseToken, ...fields }))
  const end = (status, error = null) =>
    lease.finish({
      status,
      error,
      step: 'done',
      checked_at: new Date(),
      finished_at: new Date(),
      updated_at: new Date()
    })
  try {
    if (row.cancel_requested_at) {
      if (row.step !== 'waiting') await round('cancelled')
      return end('cancelled')
    }
    const ready = await prepare(deps, row)
    if (!ready.ok) return end('failed', `${ready.code}: ${ready.reason}`)
    await must(setProgress(pool, { runId, step: 'planning', round: 0, leaseToken }))
    await round('planning')
    const stop = new AbortController()
    let result
    try {
      result = await runAgent({
        door: ready.door,
        system: ready.prompt.text,
        firstUser: firstUserMessage({ kit: ready.kit, brief: row.brief }),
        tools: kitTools(ready.kit.doc),
        history: await turnsOf(pool, runId),
        fetchImpl: deps.fetchImpl,
        signal: stop.signal,
        ...harnessOf(row.harness),
        onTurn: async (turn) => {
          await must(saveTurn(pool, { runId, round: 0, turn, leaseToken }))
          if (turn.state === 'answered' && (await cancelAsked(pool, runId))) stop.abort()
        }
      })
    } catch (error) {
      if (!(error instanceof AgentError)) throw error
      if (error.code === 'AGENT_ABORTED') {
        await round('cancelled')
        return end('cancelled')
      }
      await round('failed', { error: error.message })
      return end('failed', error.message)
    }
    const parsed = planOf(result.answer)
    if (!parsed.ok) {
      await round('failed', { answer: result.answer, error: parsed.error })
      return end('failed', parsed.error)
    }
    await must(setProgress(pool, { runId, step: 'checking', round: 0, leaseToken }))
    const checkResult = checkPlan({
      plan: parsed.plan,
      kit: ready.kit.doc,
      brief: row.brief,
      briefRef: briefRefOf(row.brief_source)
    })
    await round('checked', {
      answer: result.answer,
      plan: parsed.plan,
      checkResult,
      failureList: failureListText(checkResult)
    })
    return end('succeeded')
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

// Everything the run was started with must still hold: a run that silently ran on another model, prompt, checker or
// a kit the server no longer reads would not measure what it records.
async function prepare({ pool, secret, index }, row) {
  const prompt = plannerPrompt()
  if (prompt.sha256 !== row.prompt_sha256)
    return {
      ok: false,
      code: 'SITE_PLANNER_PROMPT_CHANGED',
      reason: 'the approved prompt changed since the start'
    }
  if (CHECKER_VERSION !== row.checker_version)
    return {
      ok: false,
      code: 'SITE_PLANNER_CHECKER_CHANGED',
      reason: `the checker is ${CHECKER_VERSION}, the run was started on ${row.checker_version}`
    }
  const kit = openKit(row.kit?.ref, index ? { index } : {})
  if (!kit)
    return { ok: false, code: 'SITE_PLANNER_KIT_GONE', reason: `the kit ${row.kit?.ref} cannot be read` }
  const door = await sitePlannerDoor({ pool, secret })
  if (!door.ok) return door
  const same = ['providerId', 'model', 'endpointHost'].every((k) => door.snapshot[k] === row.door?.[k])
  if (!same)
    return {
      ok: false,
      code: 'SITE_PLANNER_DOOR_CHANGED',
      reason: `the door now uses ${door.snapshot.providerId} ${door.snapshot.model}, the run was started on ${row.door?.providerId} ${row.door?.model}`
    }
  return { ok: true, prompt, kit, door: door.door }
}

const harnessOf = (harness) =>
  Object.fromEntries(HARNESS_KEYS.filter((k) => harness?.[k] !== undefined).map((k) => [k, harness[k]]))

async function cancelAsked(pool, runId) {
  const { rows } = await pool.query('select cancel_requested_at from site_planner_run where id = $1', [runId])
  return Boolean(rows[0]?.cancel_requested_at)
}

/** The plan in the final answer: one JSON object and nothing before or after it, as the prompt asks. */
export function planOf(answer) {
  let plan
  try {
    plan = JSON.parse(String(answer).trim())
  } catch (error) {
    return {
      ok: false,
      error: `SITE_PLANNER_ANSWER_NOT_JSON: ${String(error?.message ?? error).slice(0, 200)}`
    }
  }
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan))
    return { ok: false, error: 'SITE_PLANNER_ANSWER_NOT_OBJECT: the answer is JSON but not one object' }
  return { ok: true, plan }
}

const briefRefOf = (source) => String(source?.revisionId ?? source?.name ?? '')
