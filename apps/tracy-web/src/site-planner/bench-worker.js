// The site planner bench worker (ADR 0041, #301, #303): a durable queue over site_planner_run that claims the queued
// run, runs the approved planner prompt with runAgent over the site planner door and the two kit tools, saves every
// model call as it happens, parses the final answer as plan JSON, scores it with the checker and saves the round.
// A plan with failures gets a fix round: the failure list goes back as the next user turn of the same conversation
// (reasoning and tool turns kept whole), the planner answers with the whole plan again, and it is scored again; at
// most two fix rounds, then any failure still standing is stored on the run. An answer that is not one JSON object
// (one markdown code fence around it is accepted) is a round that is not a plan: a short message asking for the whole
// plan as one JSON object is sent back instead, and it counts as a fix round.
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes
// at the round the saved rounds say, from the saved turns. A call that was dispatched and never answered (the process
// died while waiting for the model) is marked abandoned and its request is sent once more: a model call has no effect
// besides its cost. If that resend is lost too, the run fails with AGENT_TURN_UNANSWERED. Every claim counts as an
// attempt, so the retry limit is high. A cancel is honoured between two model calls and between two rounds.
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { AgentError, runAgent } from '../lib/agent-over-door.js'
import {
  abandonTurn,
  roundsOf,
  saveRound,
  saveTurn,
  setProgress,
  turnCountOf,
  turnsOf
} from './bench-store.js'
import { sitePlannerDoor } from './door.js'
import { firstUserMessage, kitTools, openKit } from './kit-source.js'
import { CHECKER_VERSION, checkPlan, failureListText } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'

/** Fix rounds after round 0: round 2 is the last plan scored. */
export const MAX_FIX_ROUNDS = 2

/** What a round whose answer is not a plan sends back, as its failure list. */
export const NOT_A_PLAN_MESSAGE =
  'Your answer is not a plan. Answer with the whole plan as one JSON object, with nothing before or after it.\n'

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
  const end = (status, error = null, fields = {}) =>
    lease.finish({
      status,
      error,
      ...fields,
      step: 'done',
      checked_at: new Date(),
      finished_at: new Date(),
      updated_at: new Date()
    })
  try {
    if (row.cancel_requested_at) {
      if (row.step !== 'waiting')
        await must(saveRound(pool, { runId, round: row.round, state: 'cancelled', leaseToken }))
      return end('cancelled')
    }
    const ready = await prepare(deps, row)
    if (!ready.ok) return end('failed', `${ready.code}: ${ready.reason}`)
    for (;;) {
      const next = await nextRound(pool, runId)
      if (next.end) return end(...next.end)
      const { round, followUp } = next
      // A cancel asked during the last call of a round ends the run before the next round opens.
      if (round > 0 && next.opening && (await cancelAsked(pool, runId))) return end('cancelled')
      await must(setProgress(pool, { runId, step: round ? 'fixing' : 'planning', round, leaseToken }))
      if (next.opening) await must(saveRound(pool, { runId, round, state: 'planning', leaseToken }))
      const ended = await playRound(deps, { row, ready, round, followUp, leaseToken, must })
      if (ended) return end(...ended)
    }
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

// Where the run stands, from its saved rounds: the round to play (and the failure list to send first, when a fix
// round has sent nothing yet), or the verdict when the last round left nothing to do.
async function nextRound(pool, runId) {
  const rounds = await roundsOf(pool, runId)
  const last = rounds.at(-1)
  if (!last) return { round: 0, opening: true }
  if (last.state === 'planning') {
    const fresh = last.round > 0 && (await turnCountOf(pool, runId, last.round)) === 0
    return { round: last.round, ...(fresh ? { followUp: rounds[last.round - 1].failureList } : {}) }
  }
  if (last.state === 'cancelled') return { end: ['cancelled'] }
  if (last.state === 'failed') return { end: ['failed', last.error] }
  if (!last.failureList) return { end: ['succeeded'] }
  if (last.round >= MAX_FIX_ROUNDS)
    return { end: ['succeeded', null, { standing_failures: last.failureList }] }
  return { round: last.round + 1, followUp: last.failureList, opening: true }
}

// One round: the planner runs (resuming from the saved turns), then its answer is saved as a plan with its check, or
// as an answer that is not a plan. Returns the run's verdict when the round ends the run, else null.
async function playRound(deps, { row, ready, round, followUp, leaseToken, must }) {
  const { pool } = deps
  const runId = row.id
  const save = (state, fields = {}) => must(saveRound(pool, { runId, round, state, leaseToken, ...fields }))
  const history = await turnsOf(pool, runId)
  const lost = history.at(-1)
  if (lost?.state === 'dispatched' && lost.resendOf === undefined) {
    await must(abandonTurn(pool, { runId, n: lost.n, leaseToken }))
    lost.state = 'abandoned'
  }
  const stop = new AbortController()
  let result
  try {
    result = await runAgent({
      door: ready.door,
      system: ready.prompt.text,
      firstUser: firstUserMessage({ kit: ready.kit, brief: row.brief }),
      tools: kitTools(ready.kit.doc),
      history,
      followUp,
      fetchImpl: deps.fetchImpl,
      signal: stop.signal,
      ...harnessOf(row.harness),
      onTurn: async (turn) => {
        await must(saveTurn(pool, { runId, round, turn, leaseToken }))
        if (turn.state === 'answered' && (await cancelAsked(pool, runId))) stop.abort()
      }
    })
  } catch (error) {
    if (!(error instanceof AgentError)) throw error
    if (error.code === 'AGENT_ABORTED') {
      await save('cancelled')
      return ['cancelled']
    }
    await save('failed', { error: error.message })
    return ['failed', error.message]
  }
  const parsed = planOf(result.answer)
  if (!parsed.ok) {
    await save('not_a_plan', { answer: result.answer, error: parsed.error, failureList: NOT_A_PLAN_MESSAGE })
    return null
  }
  await must(setProgress(pool, { runId, step: 'checking', round, leaseToken }))
  const checkResult = checkPlan({
    plan: parsed.plan,
    kit: ready.kit.doc,
    brief: row.brief,
    briefRef: briefRefOf(row.brief_source)
  })
  await save('checked', {
    answer: result.answer,
    plan: parsed.plan,
    checkResult,
    failureList: failureListText(checkResult)
  })
  return null
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

const FENCED = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```$/i

/**
 * The plan in the final answer: one JSON object and nothing before or after it, as the prompt asks. One markdown code
 * fence around the whole answer (```json or ```) is accepted, since it changes nothing in the plan.
 */
export function planOf(answer) {
  const text = String(answer).trim()
  const body = FENCED.exec(text)?.[1] ?? text
  let plan
  try {
    plan = JSON.parse(body.trim())
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
