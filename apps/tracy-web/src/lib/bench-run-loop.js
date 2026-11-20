// The run loop of a bench step (ADR 0041, #301, #303; shared by every bench step since #327): a durable queue over the
// step's run table that claims queued runs (up to BENCH_RUNS_AT_ONCE side by side, each under a lease, a heartbeat and a
// cancel of its own, #633), runs the step's approved prompt with runAgent over the step's door,
// saves every model call as it happens, reads the final answer, scores the document with the step's checker and saves
// the round. A document with failures gets a fix round (bench-run-round.js): the failure list, then the step's
// instruction to answer with only the changed parts, goes back as the next user turn of the same conversation. At
// most step.maxFixRounds fix rounds, then any failure still standing is stored on the run.
//
// A redeploy kills the process mid-run; the lease then lapses and the next tick claims the run again, which resumes at
// the round the saved rounds say, from the saved turns. A call that was dispatched and never answered is marked
// abandoned and its request is sent once more; if that resend is lost too, the run fails with AGENT_TURN_UNANSWERED.
// Every claim counts as an attempt, so the retry limit is high. A cancel cuts a model call with an uncertain receipt,
// or is honoured between two rounds. A run whose answered calls cost at least the harness's budgetUsd stops before its next call
// with <CODE_PREFIX>_BUDGET.
//
// On DeepSeek's own API the provider balance is read before the first model call of the run and again when the run
// ends (provider-balance.js), and both are stored on the run; a failed read is recorded and never stops the run. It is
// the account's balance: runs that overlapped this one (of this bench or another) spent from it too.
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
//   nextTurn({ row, ready, answers }), mergeTurns(answers, { row, ready })  optional: round 0 written in turns, each a
//                                 request of its own (bench-run-round.js); nextTurn gives the next turn's user message
//                                 or null
//   writesInTurns({ row, ready }) optional: whether this run writes round 0 in turns (every run of a step with
//                                 nextTurn, unless the step says otherwise)
//   turnsInOneConversation        optional: true when the turns are one conversation, each later turn's message the
//                                 next user message after the turn before (the planner's), not a request of its own
//   checkTurn({ row, ready, answers })  optional: a record of the step's own check of the turn just answered (the
//                                 last of `answers`), or null; kept in the round's reading.turnChecks, informational
//   parts({ row, ready }), mergeParts(values, { row, ready })  optional: round 0 written in parts at the same time, each a conversation
//                                 of its own (bench-run-parts.js); parts gives [{ about, firstUser }], or null when the
//                                 run writes round 0 as one conversation or in turns
//   release(row)                  optional: called once a claimed run's play ends, however it ends, so a step that
//                                 keeps something per run (the picture step's looker, looker-round.js) lets it go
import { createDurableQueue } from 'website-opportunities/src/durable-queue.js'
import { AgentError, runAgent } from './agent-over-door.js'
import { playRound } from './bench-run-round.js'
import { BENCH_RUNS_AT_ONCE } from './bench-sql.js'
import { platformRefusal, withCmsLine } from './cms-line.js'
import { readBalance, readsBalance } from './provider-balance.js'

/**
 * Up to BENCH_RUNS_AT_ONCE runs side by side (the limit a start is held to, lib/bench-sql.js), each with a lease of 3
 * minutes renewed every minute; a redeploy costs one of the 20 claims.
 */
export const BENCH_QUEUE = Object.freeze({
  concurrency: BENCH_RUNS_AT_ONCE,
  leaseMs: 3 * 60_000,
  maxAttempts: 20
})
/** How often an active bench reads a Stop request while a provider call is in flight. */
export const BENCH_STOP_POLL_MS = 2_000

/** Watch the durable Stop flag while the model call is running; a transient read error waits for the next poll. */
export function watchBenchStop(store, pool, runId, stop, intervalMs = BENCH_STOP_POLL_MS) {
  let polling = false
  const poll = setInterval(() => {
    if (polling || stop.signal.aborted) return
    polling = true
    void store
      .cancelAsked(pool, runId)
      .then((asked) => {
        if (asked) stop.abort()
      })
      .catch(() => {})
      .finally(() => {
        polling = false
      })
  }, intervalMs)
  poll.unref?.()
  return () => clearInterval(poll)
}

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
      const next = await nextRound(step, pool, runId, row.harness)
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
  } finally {
    step.release?.(row)
  }
}

// Where the run stands, from its saved rounds: the round to play (and the message to send first, when a fix round has
// sent nothing yet), the document a change list applies to and what the round already recorded, or the verdict when
// the last round left nothing to do.
async function nextRound(step, pool, runId, harness = null) {
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
  if (last.round >= fixRoundsOf(step, harness))
    return { end: ['succeeded', null, { standing_failures: last.failureList }] }
  return { round: last.round + 1, base: baseOf(last.round + 1), followUp: followUpAfter(last), opening: true }
}

/** What opens a fix round whose conversation has no turn yet, before the document written so far. */
export const BASE_DOCUMENT_INTRO =
  'This is your answer so far, written before this conversation began, as one JSON object:'

/**
 * The first message and follow-up of one call. A fix round continues its conversation, and runAgent sends the follow-up
 * after the conversation's last answer; a conversation with no turn yet has no answer to follow, and runAgent opens it
 * with its first message alone, so the follow-up (the failure list) was never sent. That is a fix round whose round 0
 * was written by code (the copy step's base copy, #705): on dev (BXR London, lat18, 19/11/2026) its fix round 1 wrote
 * the whole site copy again from the first message in one conversation, 6.5 minutes, and dropped the base copy. Such a
 * round opens with its first message, the document so far and the follow-up, in one user message, so the next round
 * continues that conversation as any other.
 * @param {{ firstUser: unknown, followUp?: string, base?: unknown, conversation: object[] }} input
 */
export function fixOpening({ firstUser, followUp, base, conversation }) {
  if (followUp === undefined || conversation.length > 0 || base === undefined || base === null)
    return { firstUser, followUp }
  const tail = `${BASE_DOCUMENT_INTRO}\n\n${JSON.stringify(base)}\n\n${followUp}`
  if (Array.isArray(firstUser)) return { firstUser: [...firstUser, { type: 'text', text: `\n\n${tail}` }] }
  return { firstUser: typeof firstUser === 'string' ? `${firstUser}\n\n${tail}` : tail }
}

// One runAgent call over the saved conversation: `{ answer, turns }`, or `{ ended }` with the run's verdict. The
// conversation is the run's turns numbered from `from` up to `to` (not included): a writing turn opens a new one at the
// next free number, a parallel part owns a range of numbers of its own (bench-run-parts.js). It is numbered from 0 for
// runAgent and saved under the run's own numbers; a bounded conversation makes at most `to - from` calls, so it never
// writes into the range after it. `firstUser` replaces the step's first message (a writing turn's or a part's).
// `signal` stops the conversation from outside, as a cancel does (a parallel part whose sibling ended the round).
async function ask(
  step,
  deps,
  { row, ready, round, history, followUp, leaseToken, must, firstUser, from = 0, to = Infinity, signal, base }
) {
  const { pool } = deps
  const { store } = step
  const runId = row.id
  const stop = new AbortController()
  const stopWatching = watchBenchStop(store, pool, runId, stop)
  const outside = () => stop.abort()
  signal?.addEventListener('abort', outside, { once: true })
  if (signal?.aborted) stop.abort()
  const shift = (turn, by) => ({
    ...turn,
    n: turn.n + by,
    ...(turn.resendOf !== undefined && turn.resendOf !== null ? { resendOf: turn.resendOf + by } : {})
  })
  const inside = (turn) => turn.n >= from && turn.n < to
  const harness = harnessOf(row.harness)
  const effort = effortFor(step, row.harness, round)
  const bounded = Number.isFinite(to) ? { maxTurns: Math.min(harness.maxTurns ?? to - from, to - from) } : {}
  // A step may answer some doors without a chat call (site-pictures: the picker on Gemini Decision 1); the same
  // arguments, the same result, each call saved as a turn through onTurn.
  const custom = step.runAgentFor?.({ ready }) ?? null
  const agent = custom ?? runAgent
  const request = step.agentRequest({ row, ready, history })
  const conversation = history.filter(inside)
  const opening = custom
    ? { firstUser, followUp }
    : fixOpening({ firstUser: firstUser ?? request.firstUser, followUp, base, conversation })
  try {
    const result = await agent({
      door: ready.door,
      system: withCmsLine(ready.prompt.text, ready.kit?.platform),
      ...request,
      ...(opening.firstUser !== undefined ? { firstUser: opening.firstUser } : {}),
      history: conversation.map((t) => shift(t, -from)),
      followUp: opening.followUp,
      fetchImpl: deps.fetchImpl,
      signal: stop.signal,
      ...harness,
      ...(effort ? { effort } : {}),
      ...bounded,
      ...(deps.retry ? { retry: deps.retry } : {}),
      // A streamed call's progress, for `status`: a hint, so a lost write is not an error (runAgent ignores it).
      onProgress: ({ n, ...progress }) =>
        store.saveTurnProgress(pool, { runId, n: n + from, progress, leaseToken }),
      onTurn: async (turn) => {
        await must(store.saveTurn(pool, { runId, round, turn: shift(turn, from), leaseToken }))
        if (turn.state === 'answered' && (await store.cancelAsked(pool, runId))) stop.abort()
      }
    })
    const turns = [...history.filter((t) => !inside(t)), ...result.turns.map((t) => shift(t, from))]
    return { ...result, turns: turns.sort((a, b) => a.n - b.n) }
  } catch (error) {
    if (!(error instanceof AgentError)) throw error
    if (error.code === 'AGENT_ABORTED') return { ended: ['cancelled'] }
    if (error.code === 'AGENT_BUDGET')
      return { ended: ['failed', `${step.codePrefix}_BUDGET: ${error.reason}`] }
    return { ended: ['failed', error.message] }
  } finally {
    stopWatching()
    signal?.removeEventListener('abort', outside)
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
  if (!ready.ok) return ready
  return platformRefusal(ready.kit, step.codePrefix) ?? { ...ready, prompt }
}

/**
 * How many fix rounds a run may play: the step's, or fewer when the run was started asking for fewer
 * (`harness.maxFixRounds`, a whole number from 0; site-writer: a chain build's first draft on a draft plan, which the
 * patch run on the final plan checks and fixes).
 */
export function fixRoundsOf(step, harness) {
  const asked = harness?.maxFixRounds
  return Number.isInteger(asked) && asked >= 0 ? Math.min(asked, step.maxFixRounds) : step.maxFixRounds
}

/**
 * The reasoning effort of one call: the run's, unless the run gives its first draft another (`harness.firstDraftEffort`,
 * round 0 only: the chain's planner since 20/11/2026) or the step asks a fix round to think less than its first draft
 * (`step.fixRoundEffort(effort)`, site-writer: max to high). Any other call keeps the run's.
 */
export function effortFor(step, harness, round) {
  if (!(round > 0))
    return typeof harness?.firstDraftEffort === 'string' ? harness.firstDraftEffort : undefined
  if (typeof step?.fixRoundEffort !== 'function') return undefined
  return step.fixRoundEffort(harness?.effort) ?? undefined
}

const harnessOf = (harness) =>
  Object.fromEntries(HARNESS_KEYS.filter((k) => harness?.[k] !== undefined).map((k) => [k, harness[k]]))
