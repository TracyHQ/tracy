// The site planner bench worker (ADR 0041, #301, #303): a durable queue over site_planner_run that claims the queued
// run, runs the approved planner prompt with runAgent over the site planner door and the two kit tools, saves every
// model call as it happens, reads the final answer (plan-changes.js), scores the plan with the checker and saves the
// round. A plan with failures gets a fix round: the failure list, then a short instruction to answer with only the
// changed parts, goes back as the next user turn of the same conversation (reasoning and tool turns kept whole). The
// server applies the change list to the previous plan and scores the merged plan; a whole plan is accepted as well.
// At most two fix rounds, then any failure still standing is stored on the run. A change list that cannot be applied
// gets one short message asking for the whole plan, and that answer belongs to the same round. An answer that is not
// one JSON object (one fenced block in it is read, the text around it dropped and recorded) is a round that is not a
// plan: a short message asking for the whole plan as one JSON object is sent back instead, and it counts as a fix
// round.
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes
// at the round the saved rounds say, from the saved turns. A call that was dispatched and never answered (the process
// died while waiting for the model) is marked abandoned and its request is sent once more: a model call has no effect
// besides its cost. If that resend is lost too, the run fails with AGENT_TURN_UNANSWERED. Every claim counts as an
// attempt, so the retry limit is high. A cancel is honoured between two model calls and between two rounds.
//
// Before any model call of a claim, the kit's images are made ready (kit-images.js): a kit whose zip is missing or
// whose images do not match the kit fails the run with that code and reason. The saved turns keep a reference for
// each opened image, and the images are read back from the cache when the run resumes or a fix round replays them.
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { AgentError, runAgent } from '../lib/agent-over-door.js'
import {
  abandonTurn,
  roundSent,
  roundsOf,
  saveRound,
  saveTurn,
  setProgress,
  turnCountOf,
  turnsOf
} from './bench-store.js'
import { sitePlannerDoor } from './door.js'
import { kitImagesFor } from './kit-images.js'
import { firstUserMessage, kitTools, openKit } from './kit-source.js'
import {
  applyChanges,
  CHANGES_INSTRUCTION,
  isChangeList,
  objectOf,
  WHOLE_PLAN_MESSAGE
} from './plan-changes.js'
import { CHECKER_VERSION, checkPlan, failureListText } from './plan-check/check-plan.js'
import { plannerPrompt } from './planner-prompt.js'

/** Fix rounds after round 0: round 2 is the last plan scored. */
export const MAX_FIX_ROUNDS = 2

/** What a round whose answer is not a plan sends back, as its failure list. */
export const NOT_A_PLAN_MESSAGE =
  'Your answer is not a plan. Answer with the whole plan as one JSON object, with nothing before or after it.\n'

/** One run at a time; a lease of 3 minutes renewed every minute; a redeploy costs one of the 20 claims. */
export const BENCH_QUEUE = Object.freeze({ concurrency: 1, leaseMs: 3 * 60_000, maxAttempts: 20 })

const HARNESS_KEYS = ['maxTokens', 'effort', 'cacheTtl', 'toolImages', 'maxTurns', 'callTimeoutMs', 'retry']

class LeaseLost extends Error {}

/**
 * @param {{ pool: import('pg').Pool, secret: string, config: any, fetchImpl?: typeof fetch,
 *   index?: Map<string, object>, kitImages?: { ensure: Function }, log?: Console, now?: () => number,
 *   retry?: object }} deps
 *   `config` locates the image cache and the releases credential; `kitImages` replaces the release zips (tests);
 *   `retry` replaces the run's retry policy (tests that kill the process mid call, which no retry may outlive).
 */
export function createSitePlannerQueue({
  pool,
  secret,
  config,
  fetchImpl = fetch,
  index,
  kitImages = kitImagesFor({ pool, config, fetchImpl }),
  log = console,
  now,
  retry
}) {
  return createDurableQueue({
    pool,
    table: 'site_planner_run',
    keyColumn: 'id',
    name: 'site-planner',
    ...BENCH_QUEUE,
    log,
    ...(now ? { now } : {}),
    run: (row, lease) => runBenchRun({ pool, secret, fetchImpl, index, kitImages, retry }, row, lease)
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
      const { round, followUp, base, reading } = next
      // A cancel asked during the last call of a round ends the run before the next round opens.
      if (round > 0 && next.opening && (await cancelAsked(pool, runId))) return end('cancelled')
      await must(setProgress(pool, { runId, step: round ? 'fixing' : 'planning', round, leaseToken }))
      if (next.opening) await must(saveRound(pool, { runId, round, state: 'planning', leaseToken }))
      const ended = await playRound(deps, { row, ready, round, followUp, base, reading, leaseToken, must })
      if (ended) return end(...ended)
    }
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

// Where the run stands, from its saved rounds: the round to play (and the message to send first, when a fix round has
// sent nothing yet), the plan a change list applies to and what the round already recorded, or the verdict when the
// last round left nothing to do.
async function nextRound(pool, runId) {
  const rounds = await roundsOf(pool, runId)
  const last = rounds.at(-1)
  if (!last) return { round: 0, opening: true }
  const baseOf = (round) => rounds.slice(0, round).findLast((r) => r.plan)?.plan ?? null
  if (last.state === 'planning') {
    const fresh = last.round > 0 && (await turnCountOf(pool, runId, last.round)) === 0
    return {
      round: last.round,
      base: baseOf(last.round),
      reading: last.reading,
      ...(fresh ? { followUp: followUpAfter(rounds[last.round - 1]) } : {})
    }
  }
  if (last.state === 'cancelled') return { end: ['cancelled'] }
  if (last.state === 'failed') return { end: ['failed', last.error] }
  if (!last.failureList) return { end: ['succeeded'] }
  if (last.round >= MAX_FIX_ROUNDS)
    return { end: ['succeeded', null, { standing_failures: last.failureList }] }
  return { round: last.round + 1, base: baseOf(last.round + 1), followUp: followUpAfter(last), opening: true }
}

/** What a fix round sends first: a checked plan's failure list with the change list instruction after it. */
const followUpAfter = (round) =>
  round.state === 'checked' ? `${round.failureList}${CHANGES_INSTRUCTION}` : round.failureList

// One round: the planner runs (resuming from the saved turns), then its answer is saved as a plan with its check, or
// as an answer that is not a plan. A change list that cannot be applied asks once for the whole plan, in the same
// round. Returns the run's verdict when the round ends the run, else null.
async function playRound(deps, { row, ready, round, followUp, base, reading: prior, leaseToken, must }) {
  const { pool } = deps
  const runId = row.id
  const save = (state, fields = {}) => must(saveRound(pool, { runId, round, state, leaseToken, ...fields }))
  let history = await turnsOf(pool, runId)
  const lost = history.at(-1)
  if (lost?.state === 'dispatched' && lost.resendOf === undefined) {
    await must(abandonTurn(pool, { runId, n: lost.n, leaseToken }))
    lost.state = 'abandoned'
  }
  let askedWhole = await roundSent(pool, runId, round, WHOLE_PLAN_MESSAGE)
  const reading = { ...prior }
  for (;;) {
    const result = await ask(deps, { row, ready, round, history, followUp, leaseToken, must })
    if (result.ended) {
      const [state, error] = result.ended
      await save(state, error ? { error } : {})
      return result.ended
    }
    const read = objectOf(result.answer)
    if (!read.ok) {
      await save('not_a_plan', {
        answer: result.answer,
        error: read.error,
        failureList: NOT_A_PLAN_MESSAGE,
        reading
      })
      return null
    }
    reading.form = isChangeList(read.value) ? 'changes' : 'plan'
    reading.droppedText = read.droppedText
    let plan = read.value
    let changes
    if (reading.form === 'changes') {
      const applied = applyChanges(base, read.value)
      if (!applied.ok && askedWhole) {
        await save('not_a_plan', {
          answer: result.answer,
          error: `SITE_PLANNER_CHANGES_NOT_APPLIED: ${applied.reason}`,
          failureList: NOT_A_PLAN_MESSAGE,
          changes: read.value.changes,
          reading
        })
        return null
      }
      if (!applied.ok) {
        // Recorded before the ask goes out, so a resumed round still knows why the whole plan was asked for.
        reading.wholePlanAsked = { reason: applied.reason, answer: result.answer }
        await save('planning', { changes: read.value.changes, reading })
        history = result.turns
        followUp = WHOLE_PLAN_MESSAGE
        askedWhole = true
        continue
      }
      plan = applied.plan
      changes = read.value.changes
    }
    await must(setProgress(pool, { runId, step: 'checking', round, leaseToken }))
    const checkResult = checkPlan({
      plan,
      kit: ready.kit.doc,
      brief: row.brief,
      briefRef: briefRefOf(row.brief_source)
    })
    await save('checked', {
      answer: result.answer,
      plan,
      checkResult,
      failureList: failureListText(checkResult),
      reading,
      ...(changes ? { changes } : {})
    })
    return null
  }
}

// One runAgent call over the saved conversation: `{ answer, turns }`, or `{ ended }` with the run's verdict.
async function ask(deps, { row, ready, round, history, followUp, leaseToken, must }) {
  const { pool } = deps
  const runId = row.id
  const stop = new AbortController()
  try {
    return await runAgent({
      door: ready.door,
      system: ready.prompt.text,
      firstUser: firstUserMessage({ kit: ready.kit, brief: row.brief }),
      tools: kitTools(ready.kit.doc, { images: ready.images }),
      resolveImage: ready.images.resolve,
      history,
      followUp,
      fetchImpl: deps.fetchImpl,
      signal: stop.signal,
      ...harnessOf(row.harness),
      ...(deps.retry ? { retry: deps.retry } : {}),
      onTurn: async (turn) => {
        await must(saveTurn(pool, { runId, round, turn, leaseToken }))
        if (turn.state === 'answered' && (await cancelAsked(pool, runId))) stop.abort()
      }
    })
  } catch (error) {
    if (!(error instanceof AgentError)) throw error
    if (error.code === 'AGENT_ABORTED') return { ended: ['cancelled'] }
    return { ended: ['failed', error.message] }
  }
}

// Everything the run was started with must still hold: a run that silently ran on another model, prompt, checker or
// a kit the server no longer reads would not measure what it records.
async function prepare({ pool, secret, index, kitImages }, row) {
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
  const images = await kitImages.ensure(kit)
  if (!images.ok) return images
  return { ok: true, prompt, kit, door: door.door, images: images.images }
}

const harnessOf = (harness) =>
  Object.fromEntries(HARNESS_KEYS.filter((k) => harness?.[k] !== undefined).map((k) => [k, harness[k]]))

async function cancelAsked(pool, runId) {
  const { rows } = await pool.query('select cancel_requested_at from site_planner_run where id = $1', [runId])
  return Boolean(rows[0]?.cancel_requested_at)
}

const briefRefOf = (source) => String(source?.revisionId ?? source?.name ?? '')
