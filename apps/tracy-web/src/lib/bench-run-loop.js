// The run loop of a bench step (ADR 0041, #301, #303; shared by every bench step since #327): a durable queue over the
// step's run table that claims the queued run, runs the step's approved prompt with runAgent over the step's door,
// saves every model call as it happens, reads the final answer, scores the document with the step's checker and saves
// the round. A document with failures gets a fix round (bench-run-round.js): the failure list, then the step's
// instruction to answer with only the changed parts, goes back as the next user turn of the same conversation. At
// most step.maxFixRounds fix rounds, then any failure still standing is stored on the run.
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes at
// the round the saved rounds say, from the saved turns. A call that was dispatched and never answered is marked
// abandoned and its request is sent once more; if that resend is lost too, the run fails with AGENT_TURN_UNANSWERED.
// Every claim counts as an attempt, so the retry limit is high. A cancel is honoured between two model calls and
// between two rounds. A run whose answered calls cost more than the harness's budgetUsd stops before its next call
// with <CODE_PREFIX>_BUDGET.
//
// On DeepSeek's own API the provider balance is read before the first model call of the run and again when the run
// ends (provider-balance.js), and both are stored on the run; a failed read is recorded and never stops the run.
//
// A step is a plain object (the planner's: site-planner/bench-worker.js):
//   name, codePrefix              the queue's name and the prefix of the run's error codes (SITE_PLANNER)
//   store                         benchStore(...) over the step's own tables (bench-run-store.js)
//   maxFixRounds                  fix rounds after round 0
//   prompt()                      { text, sha256 }: the approved prompt, compared with the run's prompt_sha256
//   checker                       { version, check({ doc, row, ready }), failureListText(result) }
//   changes                       { applyValidChanges(previous, list, { row, ready }), oversized(replacements),
//                                   smallEditsMessage(oversized), invalidChangesMessage(rejected, applied) }
//   messages                      { changesInstruction, wholeDoc, notADoc }
//   readAnswer(value, { round, row, ready })  optional: what the step makes of an answer object before it is read as
//                                 a document or a change list ({ changes }); the writer puts its copy file together
//                                 here, and reads a fix round's corrected entries as a change list
//   prepare(deps, row)            everything else the run needs before a call: { ok: true, door, ... } or a refusal
//                                 { ok: false, code, reason }; checked after the prompt and the checker
//   agentRequest({ row, ready, history })  { firstUser, tools, writeStep?, resolveImage? } for runAgent
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { AgentError, runAgent } from './agent-over-door.js'
import { playRound } from './bench-run-round.js'
import { readBalance, readsBalance } from './provider-balance.js'

/** One run at a time; a lease of 3 minutes renewed every minute; a redeploy costs one of the 20 claims. */
export const BENCH_QUEUE = Object.freeze({ concurrency: 1, leaseMs: 3 * 60_000, maxAttempts: 20 })

const HARNESS_KEYS = [
  'maxTokens',
  'effort',
  'cacheTtl',
  'cacheMarkers',
  'provider',
  'toolImages',
  'maxTurns',
  'callTimeoutMs',
  'idleMs',
  'retry',
  'wire',
  'price',
  'budgetUsd'
]

export class LeaseLost extends Error {}

/**
 * The durable queue of one step. `deps` reach step.prepare as given; the loop itself reads pool, fetchImpl,
 * balanceFetch (fetchImpl unless given) and retry (replaces the run's retry policy, for tests).
 */
export function createBenchQueue(step, { log = console, now, ...deps }) {
  return createDurableQueue({
    pool: deps.pool,
    table: step.store.tables.runTable,
    keyColumn: 'id',
    name: step.name,
    ...BENCH_QUEUE,
    log,
    ...(now ? { now } : {}),
    run: (row, lease) => runBenchRun(step, deps, row, lease)
  })
}

/** Run one claimed run to its verdict. False when the lease was lost and nothing more was written. */
export async function runBenchRun(step, deps, row, lease) {
  const { pool } = deps
  const { store } = step
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
        await must(store.saveRound(pool, { runId, round: row.round, state: 'cancelled', leaseToken }))
      return end('cancelled')
    }
    const ready = await prepare(step, deps, row)
    if (!ready.ok) return end('failed', `${ready.code}: ${ready.reason}`)
    const balance = (side) =>
      readsBalance(ready.door)
        ? // A record, not a gate: a write refused (side already read, or a stale lease) changes nothing.
          readBalance(ready.door, { fetchImpl: deps.balanceFetch ?? deps.fetchImpl }).then((read) =>
            store.saveBalance(pool, { runId, side, balance: read, leaseToken })
          )
        : null
    const ended = async (...verdict) => {
      await balance('after')
      return end(...verdict)
    }
    // Read once per run: a resumed run keeps the balance read before its first call (saveBalance never replaces it).
    if (!row.balance?.before) await balance('before')
    const ctx = { step, deps, row, ready, leaseToken, must, ask: (args) => ask(step, deps, args) }
    for (;;) {
      const next = await nextRound(step, pool, runId)
      if (next.end) return ended(...next.end)
      const { round, followUp, base, reading } = next
      // A cancel asked during the last call of a round ends the run before the next round opens.
      if (round > 0 && next.opening && (await store.cancelAsked(pool, runId))) return ended('cancelled')
      await must(store.setProgress(pool, { runId, step: round ? 'fixing' : 'planning', round, leaseToken }))
      if (next.opening) await must(store.saveRound(pool, { runId, round, state: 'planning', leaseToken }))
      const verdict = await playRound(ctx, { round, followUp, base, reading })
      if (verdict) return ended(...verdict)
    }
  } catch (error) {
    if (error instanceof LeaseLost) return false
    throw error
  }
}

// Where the run stands, from its saved rounds: the round to play (and the message to send first, when a fix round has
// sent nothing yet), the document a change list applies to and what the round already recorded, or the verdict when
// the last round left nothing to do.
async function nextRound(step, pool, runId) {
  const { store } = step
  const doc = store.tables.docColumn
  const rounds = await store.roundsOf(pool, runId)
  const last = rounds.at(-1)
  if (!last) return { round: 0, opening: true }
  const baseOf = (round) => rounds.slice(0, round).findLast((r) => r[doc])?.[doc] ?? null
  const followUpAfter = (round) =>
    round.state === 'checked' ? `${round.failureList}${step.messages.changesInstruction}` : round.failureList
  if (last.state === 'planning') {
    const fresh = last.round > 0 && (await store.turnCountOf(pool, runId, last.round)) === 0
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
  if (last.round >= step.maxFixRounds)
    return { end: ['succeeded', null, { standing_failures: last.failureList }] }
  return { round: last.round + 1, base: baseOf(last.round + 1), followUp: followUpAfter(last), opening: true }
}

// One runAgent call over the saved conversation: `{ answer, turns }`, or `{ ended }` with the run's verdict.
async function ask(step, deps, { row, ready, round, history, followUp, leaseToken, must }) {
  const { pool } = deps
  const { store } = step
  const runId = row.id
  const stop = new AbortController()
  try {
    return await runAgent({
      door: ready.door,
      system: ready.prompt.text,
      ...step.agentRequest({ row, ready, history }),
      history,
      followUp,
      fetchImpl: deps.fetchImpl,
      signal: stop.signal,
      ...harnessOf(row.harness),
      ...(deps.retry ? { retry: deps.retry } : {}),
      // A streamed call's progress, for `status`: a hint, so a lost write is not an error (runAgent ignores it).
      onProgress: ({ n, ...progress }) => store.saveTurnProgress(pool, { runId, n, progress, leaseToken }),
      onTurn: async (turn) => {
        await must(store.saveTurn(pool, { runId, round, turn, leaseToken }))
        if (turn.state === 'answered' && (await store.cancelAsked(pool, runId))) stop.abort()
      }
    })
  } catch (error) {
    if (!(error instanceof AgentError)) throw error
    if (error.code === 'AGENT_ABORTED') return { ended: ['cancelled'] }
    if (error.code === 'AGENT_BUDGET')
      return { ended: ['failed', `${step.codePrefix}_BUDGET: ${error.reason}`] }
    return { ended: ['failed', error.message] }
  }
}

// Everything the run was started with must still hold: a run that silently ran on another prompt or checker (or, in
// step.prepare, another model or input the server no longer reads) would not measure what it records.
async function prepare(step, deps, row) {
  const prompt = step.prompt()
  if (prompt.sha256 !== row.prompt_sha256)
    return {
      ok: false,
      code: `${step.codePrefix}_PROMPT_CHANGED`,
      reason: 'the approved prompt changed since the start'
    }
  if (step.checker.version !== row.checker_version)
    return {
      ok: false,
      code: `${step.codePrefix}_CHECKER_CHANGED`,
      reason: `the checker is ${step.checker.version}, the run was started on ${row.checker_version}`
    }
  const ready = await step.prepare(deps, row)
  return ready.ok ? { ...ready, prompt } : ready
}

const harnessOf = (harness) =>
  Object.fromEntries(HARNESS_KEYS.filter((k) => harness?.[k] !== undefined).map((k) => [k, harness[k]]))
