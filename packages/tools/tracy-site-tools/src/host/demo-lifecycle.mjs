/** Native finite provision wait: each poll remains in this user turn and stops before its next dispatch. */
import { pause, stoppedAnswer } from './turn-stop.mjs'

/**
 * @param {Record<string, unknown>} params
 * @param {(params: Record<string, unknown>) => Promise<any>} send
 * @param {{signal?: AbortSignal | null, sleep?: (ms: number, signal?: AbortSignal | null) => Promise<unknown>, now?: () => number, sweep?: SweepRun | null}} [options]
 *   `sweep`: runs one site tool call of a residue sweep (`index.ts`: the `tracy_site` tool itself).
 */
export async function runDemoLifecycle(
  params,
  send,
  { signal = null, sleep = pause, now = Date.now, sweep = null } = {}
) {
  if (signal?.aborted) return stoppedAnswer()
  if (params.operation === 'check') return sweptCheck(send, { signal, sleep, now, sweep })
  if (params.operation !== 'provision.wait') return send(params)
  const seconds = params.waitSeconds ?? 30
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 1 || seconds > 30)
    return { ok: false, code: 'AGENT_DEMO_BAD_WAIT' }
  const until = now() + seconds * 1000
  let answer
  for (let n = 0; n < 15; n++) {
    if (signal?.aborted) return stoppedAnswer({ lastReceipt: answer ?? null })
    answer = await send({ operation: 'provision.status' })
    if (answer?.ready || answer?.code || ['failed', 'refused', 'deleted'].includes(answer?.state))
      return answer
    if (now() >= until) break
    await sleep(Math.min(2000, until - now()), signal)
  }
  return { ...answer, waiting: true }
}

/** How long one `check` call polls a running check before it answers that the check still runs. */
const CHECK_WAIT_MS = 600_000
const CHECK_POLL_MS = 5_000
/** Status polls in a row that may fail on the way (tracy-web restarting, the edge) before the failure is the answer. */
const CHECK_POLL_MISSES = 6

/**
 * 🔒 A CHECK IS STARTED, THEN POLLED — never one request held open for minutes (dev 24/10/2026). The check
 * shoots and looks at every page, minutes on a whole site, and dsh reaches the Apply door through the public
 * origin: Cloudflare cut each call at ~100 s (524) while tracy-web ran on and then dropped the result as
 * unheard. `check.start` answers at once and the check runs on tracy-web (`client-demo.js`); each
 * `check.status` is a short call. A tracy-web without `check.start` gets the one long `check` it knows.
 * @param {(params: Record<string, unknown>) => Promise<any>} send
 * @param {{signal: AbortSignal | null, sleep: (ms: number, signal?: AbortSignal | null) => Promise<unknown>, now: () => number}} options
 */
async function runCheck(send, { signal, sleep, now }) {
  let answer = await send({ operation: 'check.start' })
  if (answer?.code === 'AGENT_DEMO_BAD_OPERATION') return send({ operation: 'check' })
  const until = now() + CHECK_WAIT_MS
  let misses = 0
  while (answer?.running === true) {
    if (signal?.aborted) return stoppedAnswer({ lastReceipt: answer })
    if (now() >= until)
      return {
        ...answer,
        ok: false,
        code: 'DEMO_CHECK_RUNNING',
        error:
          'The check is still running on Tracy. Call tracy_demo check again to wait for its result; it is not started twice.'
      }
    await sleep(Math.min(CHECK_POLL_MS, until - now()), signal)
    if (signal?.aborted) return stoppedAnswer({ lastReceipt: answer })
    const polled = await send({ operation: 'check.status' })
    if (onTheWay(polled) && ++misses < CHECK_POLL_MISSES) continue
    answer = polled
    misses = 0
  }
  return answer
}

/** @typedef {(call: {action: string, params: Record<string, unknown>}) => Promise<any>} SweepRun */

/**
 * 🔒 ROUNDS ONE `check` SWEEPS, AS MANY AS TRACY-WEB ALLOWS (lrsweep rig round 6, 24/10/2026): tracy-web goes on
 * planning a sweep while each round plans fewer calls than the one before, up to its own `SWEEP_ROUNDS_MAX` of 6, and
 * then answers with no calls and the stop reported (`client-demo.js` `sweepDecision`). Two here stopped a real site
 * with 14 template texts still planned. This bound matches tracy-web's, so the web side decides; it only keeps one
 * tool call finite should a tracy-web keep answering calls.
 */
const SWEEPS_MAX = 6

/**
 * 🔒 THE SWEEP RUNS HERE, BEFORE THE CHECK IS COUNTED (product owner, 24/10/2026). A check that found template
 * residue, whatever else failed, answers with the calls that clear it (`sweep.calls`, tracy-web `residue-sweep.js`): each is a
 * `content.replace` or `content.update` sent through the site tool, with the replace job's own guards (`expect`),
 * so a refusal writes nothing and is reported. Then the check runs again; tracy-web did not count the first.
 * @param {(params: Record<string, unknown>) => Promise<any>} send
 * @param {{signal: AbortSignal | null, sleep: (ms: number, signal?: AbortSignal | null) => Promise<unknown>, now: () => number, sweep: SweepRun | null}} options
 */
async function sweptCheck(send, { signal, sleep, now, sweep }) {
  /** @type {Array<{calls: number, refused: Record<string, unknown>[], cleared: number, unresolved: number}>} */
  const sweeps = []
  /** The last round's `cleared` rows, still to be seen gone in the read after it. */
  /** @type {Array<{path: unknown, find: unknown, by: string}>} */
  let unseen = []
  for (let round = 0; ; round++) {
    const answer = await runCheck(send, { signal, sleep, now })
    if (unseen.length > 0) confirmCleared(sweeps[sweeps.length - 1], unseen, answer)
    unseen = []
    const calls = Array.isArray(answer?.sweep?.calls) ? answer.sweep.calls : []
    if (calls.length === 0 || sweep === null || round >= SWEEPS_MAX || signal?.aborted)
      return heard(answer, sweeps)
    const refused = []
    const sendOne = sweepRound(sweep)
    for (const call of calls) {
      if (signal?.aborted) return stoppedAnswer({ lastReceipt: heard(answer, []) })
      const done = await sendOne(call)
      if (done?.ok === true && typeof done.cleared === 'string')
        unseen.push({ path: call.params?.path ?? null, find: call.params?.find ?? null, by: done.cleared })
      if (done?.ok !== true)
        refused.push({
          action: call.action,
          find: call.params?.find ?? null,
          code: done?.code ?? 'SWEEP_CALL_FAILED',
          // 🔒 A FAILURE WITH NO CODE KEEPS ITS WORDS (lrsweep rig, JA Diner wp7, 25/10/2026): 80 featured-picture
          // writes of one build failed with no code of the site's, and with the error dropped nothing said why.
          ...((done?.code ?? 'SWEEP_CALL_FAILED') === 'SWEEP_CALL_FAILED' && done?.error
            ? { error: String(done.error).slice(0, 160) }
            : {}),
          ...(done?.unresolved === true ? { waits: true } : {})
        })
    }
    sweeps.push({
      calls: calls.length,
      refused,
      cleared: unseen.length,
      unresolved: Array.isArray(answer.sweep.unresolved) ? answer.sweep.unresolved.length : 0
    })
    // 🔒 A ROUND WHOSE EVERY CALL WAITS FOR A DOOR CHANGES NOTHING (24/10/2026): a check again would plan the same
    // calls, so the check as it stands is the answer. A call waits when the resolver answers it `unresolved` (a
    // plugin door or a logo writer not built yet).
    if (refused.length === calls.length && refused.every((r) => r.waits === true))
      return heard(answer, sweeps)
  }
}

/**
 * 🔒 A `cleared` ROW STANDS ONLY WHEN THE READ AFTER ITS ROUND SHOWS ITS WORDS GONE FROM ITS PAGE (product owner,
 * round 7, 24/10/2026). `sweepRound` answers a NOT_FOUND done when an earlier write of the round held its words: an
 * inference. The check after the round is the measure: tracy-web lists every page's words a replace would still clear
 * (`sweep.shown`, cap or not; a tracy-web from before `shown` gives its calls). Words still listed on their page, or a
 * check that answered no read, put the row back among the round's refusals as the NOT_FOUND it was.
 * @param {{refused: Record<string, unknown>[], cleared: number}} entry
 * @param {Array<{path: unknown, find: unknown, by: string}>} rows
 * @param {any} answer
 */
function confirmCleared(entry, rows, answer) {
  const read = Array.isArray(answer?.checks)
  /** @type {string[]} */
  const listed = Array.isArray(answer?.sweep?.shown)
    ? answer.sweep.shown.map(String)
    : (Array.isArray(answer?.sweep?.calls) ? answer.sweep.calls : [])
        .filter((/** @type {any} */ c) => c?.action === 'content.replace')
        .map((/** @type {any} */ c) => `${c.params?.path}\u0000${c.params?.find}`)
  const shown = new Set(
    listed.map((/** @type {string} */ key) => {
      const at = key.indexOf('\u0000')
      return `${key.slice(0, at)}\u0000${wordsKey(key.slice(at + 1))}`
    })
  )
  for (const row of rows) {
    const still = shown.has(`${row.path}\u0000${wordsKey(row.find)}`)
    if (read && !still) continue
    entry.cleared--
    entry.refused.push({
      action: 'content.replace',
      find: row.find,
      code: 'NOT_FOUND',
      ...(read ? { stillShown: true } : { unread: true })
    })
  }
}

/** The check's answer as the agent reads it: the sweeps run, without the planner's evidence list. @param {any} answer @param {any[]} sweeps */
function heard(answer, sweeps) {
  const sweep = answer?.sweep && typeof answer.sweep === 'object' ? answer.sweep : null
  const { shown: _shown, ...rest } = sweep ?? {}
  return {
    ...answer,
    ...(sweep ? { sweep: rest } : {}),
    ...(sweeps.length ? { swept: sweeps } : {})
  }
}

/** Words as one replace compares them: one case, one space. @param {unknown} text */
const wordsKey = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/**
 * One sweep round's sender: each call goes through `sweep`, a thrown failure answers SWEEP_CALL_FAILED.
 *
 * 🔒 A STALE READ IS NOT A MISS (lrsweep rig round 5, 24/10/2026). The round's calls are planned from one read,
 * and a footer or sidebar module is one stored source every page shows, so the plan holds its words once per page.
 * The first write clears that source, and the same words on the next page then meet NOT_FOUND: 43 of round 2's
 * calls did, for hours, phones and an address the read had seen before the round began. The replace job itself
 * reads the page fresh, so its NOT_FOUND is the measure that those words are no longer there; when a write
 * earlier in this round put in place words that hold them, that write is why, and the call is answered done with
 * `cleared` naming it. Every call is still sent whole with its own guards (`expect`, confirm-count); a NOT_FOUND
 * that no earlier write explains stays refused.
 * @param {SweepRun} sweep
 * @returns {SweepRun}
 */
export function sweepRound(sweep) {
  /** @type {string[]} */
  const written = []
  return async (call) => {
    const done = await sweep(call).catch((failure) => ({
      ok: false,
      code: 'SWEEP_CALL_FAILED',
      error: String(failure?.message ?? failure)
    }))
    if (call.action !== 'content.replace') return done
    const find = wordsKey(call.params?.find)
    if (done?.ok === true) written.push(find)
    else if (done?.code === 'NOT_FOUND' && find !== '') {
      const by = written.find((w) => w.includes(find))
      if (by !== undefined) return { ok: true, count: 0, cleared: by }
    }
    return done
  }
}

/** A poll that failed on the way, not an answer from the check: the check itself runs on. @param {any} answer */
function onTheWay(answer) {
  return (
    ['COWORK_WEB_UNREACHABLE', 'COWORK_WEB_BAD_RESPONSE'].includes(answer?.code) ||
    (typeof answer?.httpStatus === 'number' && answer.httpStatus >= 500)
  )
}

/** @param {string} name @param {unknown} args */
export function demoToolNeedsReady(name, args) {
  return (
    ['bash', 'pwsh', 'terminal_open', 'terminal_write', 'write', 'edit', 'str_replace_editor'].includes(
      name
    ) &&
    !(
      name === 'str_replace_editor' &&
      args &&
      typeof args === 'object' &&
      'command' in args &&
      args.command === 'view'
    )
  )
}
