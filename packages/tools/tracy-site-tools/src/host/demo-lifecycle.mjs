/** Native finite provision wait: each poll remains in this user turn and stops before its next dispatch. */
import { refusedBeforeWrite } from './refused-before-write.mjs'
import { pause, stoppedAnswer } from './turn-stop.mjs'

/** A pair kept back because another pair of its page's call has an unknown outcome: the next check reads it. */
const NOT_SENT = Object.freeze({ ok: false, code: 'SWEEP_NOT_SENT' })

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
  if (params.operation === 'copy.write') return startCopy(send)
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
  // `sweepBatches`: this dsh sends a sweep call's pairs together and sets a refused one aside (`sweepRound`), so
  // tracy-web may plan a page's words as one call; a tracy-web that does not know it plans one pair per call.
  let answer = await send({ operation: 'check.start', sweepBatches: true })
  if (answer?.code === 'AGENT_DEMO_BAD_OPERATION') return send({ operation: 'check', sweepBatches: true })
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
    let sent = 0
    // Several at a time where tracy-web says the site's door takes them (`inFlight`, `sendRound`); each answer is
    // read at its call's place in the round, so the report is the one a round sent one call at a time gives.
    const answers = await sendRound(calls, sweepRound(sweep), {
      inFlight: answer.sweep.inFlight,
      shown: answer.sweep.shown,
      signal
    })
    if (answers === null) return stoppedAnswer({ lastReceipt: heard(answer, []) })
    for (const [at, call] of calls.entries()) {
      const answered = answers[at]
      // A page's pairs sent as one call answer pair by pair (`sweepRound`), each reported as its own call was.
      const rows = Array.isArray(answered?.pairs)
        ? answered.pairs
        : [{ find: call.params?.find ?? null, done: answered }]
      for (const { find, done } of rows) {
        sent++
        if (done?.ok === true && typeof done.cleared === 'string')
          unseen.push({ path: call.params?.path ?? null, find, by: done.cleared })
        if (done?.ok !== true)
          refused.push({
            action: call.action,
            find,
            code: done?.code ?? 'SWEEP_CALL_FAILED',
            // 🔒 A FAILURE WITH NO CODE KEEPS ITS WORDS (lrsweep rig, JA Diner wp7, 25/10/2026): 80 featured-picture
            // writes of one build failed with no code of the site's, and with the error dropped nothing said why.
            ...((done?.code ?? 'SWEEP_CALL_FAILED') === 'SWEEP_CALL_FAILED' && done?.error
              ? { error: String(done.error).slice(0, 160) }
              : {}),
            ...(done?.unresolved === true ? { waits: true } : {}),
            // A replace whose answer proves nothing (lost, thrown, unknown) may have written its words: never a pair to
            // send again unread; the check after this round reads the page.
            ...(call.action === 'content.replace' && done?.code !== NOT_SENT.code && !refusedBeforeWrite(done)
              ? { unknown: true }
              : {})
          })
      }
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
    if (refused.length === sent && refused.every((r) => r.waits === true)) return heard(answer, sweeps)
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
 *
 * 🔒 THE ROUND'S WRITES ARE KEPT IN THE ROUND'S ORDER, NOT THE ORDER THEIR ANSWERS CAME (02/11/2026): with calls in
 * flight together (`sendRound`), the write a NOT_FOUND is explained by is the first one of the round that holds its
 * words, as it was when the round went one call at a time. `at` is the call's place in the round; a caller that
 * sends one call after another may leave it out.
 * @param {SweepRun} sweep
 * @returns {(call: {action: string, params: Record<string, any>}, at?: number) => Promise<any>}
 */
export function sweepRound(sweep) {
  /** @type {Array<{at: number, words: string}>} */
  const written = []
  let next = 0
  /** @param {{action: string, params: Record<string, any>}} call */
  const sent = (call) =>
    sweep(call).catch((failure) => ({
      ok: false,
      code: 'SWEEP_CALL_FAILED',
      error: String(failure?.message ?? failure)
    }))
  /** @param {{action: string, params: Record<string, any>}} call @param {number} at */
  const one = async (call, at) => {
    const done = await sent(call)
    if (call.action !== 'content.replace') return done
    return heldBy(call.params?.find, done, at)
  }
  /**
   * A pair's answer: written, or a NOT_FOUND an earlier write of the round explains.
   * @param {unknown} words @param {any} done @param {number} at
   */
  const heldBy = (words, done, at) => {
    const find = wordsKey(words)
    if (done?.ok === true) {
      const after = written.findIndex((w) => w.at > at)
      written.splice(after === -1 ? written.length : after, 0, { at, words: find })
    } else if (done?.code === 'NOT_FOUND' && find !== '') {
      const by = written.find((w) => w.words.includes(find))
      if (by !== undefined) return { ok: true, count: 0, cleared: by.words }
    }
    return done
  }
  return async (call, at = next++) => {
    const changes = call.action === 'content.replace' ? call.params?.changes : undefined
    if (!Array.isArray(changes)) return one(call, at)
    return { ok: true, pairs: await batch(call, changes, at) }
  }

  /**
   * A PAGE'S PAIRS GO AS ONE CALL; A REFUSED PAIR IS SET ASIDE, NEVER THE PAGE (28/10/2026). The replace job writes
   * a call whole or not at all (`locateAll`: the first refusal wins, nothing is written, `change` names the pair), so
   * the pair it names answers that refusal as its own call would have, and the rest are sent again, as
   * `copy-apply.mjs` does. A pair refused for sharing words with another pair of the call (BAD_PARAMS) is sent alone
   * after the rest is written: the order the sweep gave pair by pair. A refusal that names no pair (the call's count
   * over the job's limit, a call mixing stored and theme-printed words) has each pair sent alone, as before.
   *
   * 🔒 ONLY A REFUSAL THAT PROVES NOTHING WAS WRITTEN IS SENT AGAIN (28/10/2026, `refusedBeforeWrite`): a
   * lost receipt, a timeout, a thrown call or an unknown outcome may have written every pair, and a pair whose new
   * words hold its old ones ("Menu item" → "Menu item for customer") would be written twice. Such an answer is each
   * pair's answer, as one pair's unknown outcome always was, and the next check reads the page. A pair waiting for
   * the rest of its call (the overlap above) is sent only once every answer of the call is known.
   * @param {{action: string, params: Record<string, any>}} call
   * @param {Array<{find: string, replace: string, expect?: number}>} changes
   * @param {number} at - the call's place in the round
   * @returns {Promise<Array<{find: string, done: any}>>}
   */
  async function batch(call, changes, at) {
    const { changes: _changes, ...base } = call.params
    /** @param {{find: string, replace: string, expect?: number}} pair */
    const alone = (pair) => ({ action: call.action, params: { ...base, ...pair } })
    /** @type {Array<{find: string, done: any}>} */
    const rows = []
    /** @type {typeof changes} */
    const after = []
    let queue = [...changes]
    while (queue.length > 0) {
      const done = await sent(
        queue.length === 1 ? alone(queue[0]) : { action: call.action, params: { ...base, changes: queue } }
      )
      if (done?.ok === true) {
        for (const pair of queue) rows.push({ find: pair.find, done: heldBy(pair.find, done, at) })
        break
      }
      if (!refusedBeforeWrite(done)) {
        for (const pair of queue) rows.push({ find: pair.find, done })
        break
      }
      const refusedAt =
        queue.length === 1
          ? 0
          : Number.isInteger(done?.change) && done.change >= 0 && done.change < queue.length
            ? done.change
            : null
      if (refusedAt === null) {
        for (const pair of queue) rows.push({ find: pair.find, done: await one(alone(pair), at) })
        break
      }
      if (queue.length > 1 && done?.code === 'BAD_PARAMS') after.push(queue[refusedAt])
      else rows.push({ find: queue[refusedAt].find, done: heldBy(queue[refusedAt].find, done, at) })
      queue = queue.filter((_pair, i) => i !== refusedAt)
    }
    const known = rows.every((r) => r.done?.ok === true || refusedBeforeWrite(r.done))
    for (const pair of after)
      rows.push({ find: pair.find, done: known ? await one(alone(pair), at) : NOT_SENT })
    return rows
  }
}

/** The most calls of one sweep round in flight at once, whatever tracy-web asks (`sweep.inFlight`). */
export const SWEEP_IN_FLIGHT_MAX = 4

/**
 * Sends a round's calls, at most `inFlight` at a time, each only once every call it waits for has answered
 * ({@link roundOrder}); calls start in the round's order, the first one free going first.
 *
 * 🔒 SEVERAL AT A TIME ONLY WHERE THE SITE'S DOOR TAKES THEM, AND ONLY WHAT CANNOT MEET ON ONE RECORD (02/11/2026).
 * A round sent one call after another took 217–657 s of a build's checks (local r5 EmDash 528 calls, r3 WordPress
 * 720). tracy-web says how many may be in flight (`sweep.inFlight`, `client-demo.js` `sweepInFlightOf`): four on
 * EmDash, whose writes wait for SQLite's one writer and carry each entry's revision; none on WordPress and Joomla,
 * where the Claude Cowork engine takes the site's write lock without waiting (`GET_LOCK(…, 0)`): a second write is
 * refused `writer_busy` and waits 3–19 s for its retry, and every Joomla write already queues in the site's flight
 * (`call-memory.mjs`). Without it, or with anything but a whole number above one, the round goes one call at a time
 * as it always did. Stop sends nothing more; the calls in flight answer, and the answer is null.
 * @param {Array<{action: string, params: Record<string, any>}>} calls
 * @param {(call: {action: string, params: Record<string, any>}, at: number) => Promise<any>} sendOne
 * @param {{inFlight?: unknown, shown?: unknown, signal?: AbortSignal | null}} [options] - `shown`: every page's
 *   words the read before the round showed (`sweep.shown`)
 * @returns {Promise<any[] | null>} each call's answer at its place in the round; null when Stop came first
 */
export function sendRound(calls, sendOne, { inFlight = 1, shown = [], signal = null } = {}) {
  const limit =
    typeof inFlight === 'number' && Number.isInteger(inFlight) && inFlight > 1
      ? Math.min(inFlight, SWEEP_IN_FLIGHT_MAX)
      : 1
  // One at a time: each call waits for the one before it, the order the round always had.
  const waits = limit > 1 ? roundOrder(calls, shown) : calls.map((_, i) => (i > 0 ? [i - 1] : []))
  const pending = waits.map((w) => w.length)
  /** @type {number[][]} */
  const freed = calls.map(() => [])
  for (const [i, w] of waits.entries()) for (const j of w) freed[j].push(i)
  /** @type {any[]} */
  const answers = Array.from({ length: calls.length })
  const sentAlready = calls.map(() => false)
  let flying = 0
  let stopped = false
  /** @param {number} at */
  const send = async (at) => {
    try {
      return await sendOne(calls[at], at)
    } catch (failure) {
      return {
        ok: false,
        code: 'SWEEP_CALL_FAILED',
        error: String(/** @type {any} */ (failure)?.message ?? failure)
      }
    }
  }
  return new Promise((resolve) => {
    const pump = () => {
      for (let at = 0; at < calls.length && flying < limit && !stopped; at++) {
        if (sentAlready[at] || pending[at] > 0) continue
        if (signal?.aborted) {
          stopped = true
          break
        }
        sentAlready[at] = true
        flying += 1
        void send(at).then((done) => {
          answers[at] = done
          flying -= 1
          for (const i of freed[at]) pending[i] -= 1
          pump()
        })
      }
      if (flying === 0) resolve(stopped ? null : answers)
    }
    pump()
  })
}

/**
 * What each call of a round waits for: the calls before it that may write a record it writes. The sweep plans per page
 * and cannot know the records a call reaches until the replace job reads them, so it waits for any call before it that:
 * - is on its page (a page's later call holds words its earlier one changes: `onePerPage` layers, `partsOf` parts);
 * - looks for words that hold its own or that its own hold (a passage before a name inside it, a post's excerpt on
 *   the blog and its body on the post's page);
 * - looks for words several pages show, when it does too, whatever the words: a header, footer, menu or site title is
 *   one record every page shows, and two calls writing different words of it at once would meet on its revision. The
 *   read before the round names every page's words, cap or not (`shown`), so words the cap left on one page still
 *   count as shown on several;
 * - is not a page's words (a link, a picture, a post, a record's fields, a site-wide replace), or it is not one:
 *   such a call writes where its own resolver finds, so it waits for every call before it and every call after it
 *   waits for it.
 * A call waits only for calls before it, so the round always ends.
 * @param {Array<{action: string, params: Record<string, any>}>} calls
 * @param {unknown} [shown] - `sweep.shown`: `<path>\u0000<words>` per page's words the read showed
 * @returns {number[][]} for each call, the places of the calls it waits for
 */
export function roundOrder(calls, shown = []) {
  const keys = calls.map(pageWordsOf)
  /** @type {Array<{path: string, words: string[]}>} */
  const read = []
  for (const key of Array.isArray(shown) ? shown : []) {
    const at = typeof key === 'string' ? key.indexOf('\u0000') : -1
    const words = at > 0 ? wordsKey(key.slice(at + 1)) : ''
    if (words !== '') read.push({ path: pageKey(key.slice(0, at)), words: [words] })
  }
  const seen = [...keys, ...read]
  const shared = keys.map(
    (k) => k !== null && seen.some((o) => o !== null && o.path !== k.path && overlaps(k.words, o.words))
  )
  return keys.map((k, i) => {
    /** @type {number[]} */
    const waits = []
    for (let j = 0; j < i; j++) {
      const o = keys[j]
      if (
        k === null ||
        o === null ||
        o.path === k.path ||
        overlaps(k.words, o.words) ||
        (shared[i] && shared[j])
      )
        waits.push(j)
    }
    return waits
  })
}

/**
 * A call's page and the words it looks for, or null for a call that is not one page's words: any other action, a
 * link's address (`href`), a replace over the whole site (`all: true`), or a shape the sweep does not plan.
 * @param {{action?: string, params?: Record<string, any>}} call
 */
function pageWordsOf(call) {
  const p = call?.params
  if (call?.action !== 'content.replace' || !p || p.href || p.all === true || typeof p.path !== 'string')
    return null
  const finds = Array.isArray(p.changes) ? p.changes.map((/** @type {any} */ c) => c?.find) : [p.find]
  const words = finds.map((f) => (typeof f === 'string' ? wordsKey(f) : ''))
  if (words.length === 0 || words.includes('')) return null
  return { path: pageKey(p.path), words }
}

/** A page as one key: any case, no query or fragment, no last slash. @param {string} path */
const pageKey = (path) =>
  path
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '') || '/'

/** Whether words of one list hold, or are held by, words of the other. @param {string[]} a @param {string[]} b */
const overlaps = (a, b) => a.some((x) => b.some((y) => x.includes(y) || y.includes(x)))

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

/** What `copy.write` answers while the words are being written: the photos meanwhile, then `copy.apply`. */
export const COPY_STARTED_NEXT =
  'The words are being written (a minute or two): place the photos now; tracy_demo {operation:"copy.apply"} waits for the words and puts them on the site.'

/**
 * 🔒 THE WORDS ARE WRITTEN WHILE THE AGENT PLACES THE PHOTOS (local round 36, 26/10/2026): `copy.write` held the turn
 * 71–104 s polling tracy-web's copy tasks, the agent idle. It starts them and answers; `copy.apply` waits for them
 * (`copyWritten`). Words already written answer their summary at once.
 * @param {(params: Record<string, unknown>) => Promise<any>} send
 */
async function startCopy(send) {
  const answer = await send({ operation: 'copy.start' })
  return answer?.running === true ? { ok: true, running: true, next: COPY_STARTED_NEXT } : answer
}

/** How long `copy.apply` waits for the copy tasks before it answers that they still run. */
const COPY_WAIT_MS = 600_000
const COPY_POLL_MS = 3_000

/**
 * The words of every page written by tracy-web's copy tasks (`demo-copy.js`): started if they were not, then polled
 * until written, as a check is — a whole site's tasks take longer than one request may stay open on dev. What
 * `copy.apply` waits for before it reads the packs.
 * @param {(params: Record<string, unknown>) => Promise<any>} send
 * @param {{signal?: AbortSignal | null, sleep?: (ms: number, signal?: AbortSignal | null) => Promise<unknown>, now?: () => number}} [options]
 */
export async function copyWritten(send, { signal = null, sleep = pause, now = Date.now } = {}) {
  let answer = await send({ operation: 'copy.start' })
  const until = now() + COPY_WAIT_MS
  let misses = 0
  while (answer?.running === true) {
    if (signal?.aborted) return stoppedAnswer({ lastReceipt: answer })
    if (now() >= until)
      return {
        ...answer,
        ok: false,
        code: 'COPY_STILL_RUNNING',
        error:
          'The words are still being written. Call tracy_demo copy.apply again to wait for them; they are not started twice.'
      }
    await sleep(Math.min(COPY_POLL_MS, until - now()), signal)
    if (signal?.aborted) return stoppedAnswer({ lastReceipt: answer })
    const polled = await send({ operation: 'copy.status' })
    if (onTheWay(polled) && ++misses < CHECK_POLL_MISSES) continue
    answer = polled
    misses = 0
  }
  return answer
}
