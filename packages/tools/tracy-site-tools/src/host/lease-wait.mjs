/**
 * WAITING FOR THE SITE'S WRITE LEASE — a queue the customer never has to run by hand.
 *
 * WHY (acceptance v4, 30/09, `tasks/evidence/comment-people/e2e-v4/send.md` S09, R09, ED1, ADV3,
 * SEND-v4-new-11): two conversations writing one site. The Apply door admits one writer at a time and
 * refuses the other `SITE_BUSY` (`apps/tracy-web/src/sites/route.js`). In v3 Tracy then WAITED and made
 * the change ("e2e3-send-b was mid-change on the site, so I waited for them to finish", 1 min 47 s) —
 * by improvising a background wait the session no longer has. In v4 the refusal reached the customer:
 * "my write was refused rather than queued", try again yourself. Nothing in the lease changed; the
 * waiting was never code.
 *
 * So the wait is code now, in the one place every Apply call passes (`applyDoor`): a write refused
 * `SITE_BUSY` is sent again, the same call with the same ids, after a pause, until the lease is free or
 * {@link LEASE_WAIT_MAX_MS} is spent. The door's "do not retry in a loop" is about the MODEL looping,
 * a call every few seconds for as long as it likes; this is bounded in time and in sends
 * ({@link LEASE_PAUSES_MS}), and the holder's own turn end now frees the lease at once
 * (`POST /api/sites/:key/lease/release`), so most waits end at the first or second look.
 *
 * Past the bound the refusal goes back as the door gave it, with `waitedSeconds` beside it, so what
 * Tracy says is true: it waited, and for how long.
 *
 * 🔒 THE PAUSE IS SPENT OUTSIDE THE SITE'S FLIGHT (review C1, 19/10/2026). A Joomla write and every
 * contract call run in the site's flight (`call-memory.mjs` `flight`), one queue per site shared by every
 * conversation in this process. The wait used to sleep inside it: the conversation HOLDING the lease then
 * queued behind its own waiter, could not write, its lease was not renewed (tracy-web renews on writes and
 * frees after 90 s of silence), and the waiter took the lease halfway through the holder's request. Now each
 * pause leaves the flight (`leave`) and queues again at its end (`rejoin`), so the next send is ordered
 * behind whatever the holder queued meanwhile, and the lease is asked again on each send.
 *
 * 🔒 STOP ENDS THE WAIT (review C2, `turn-stop.mjs`): a turn stopped before a send or during a pause sends
 * nothing more and answers `TURN_STOPPED`. A send already made is never cut.
 */

import { pause as stoppablePause, stoppedAnswer } from './turn-stop.mjs'

/** The longest one call waits for the lease: one stale window (90 s) and a little. */
export const LEASE_WAIT_MAX_MS = 100_000

/** Pauses between sends; the last one repeats. 3 + 5 + 8 + 10 × n — at most 13 sends in 100 s. */
export const LEASE_PAUSES_MS = Object.freeze([3_000, 5_000, 8_000, 10_000])

/**
 * Whether an answer is the Apply door's lease refusal.
 * @param {unknown} answer
 */
export function isLeaseBusy(answer) {
  return (
    answer !== null &&
    typeof answer === 'object' &&
    /** @type {Record<string, unknown>} */ (answer).ok !== true &&
    /** @type {Record<string, unknown>} */ (answer).code === 'SITE_BUSY'
  )
}

/**
 * Send, and while the site's lease is held by another conversation, wait and send again.
 * @param {() => Promise<unknown>} send - one Apply call, exactly as the caller made it.
 * @param {{
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   maxMs?: number,
 *   waiting?: () => () => void,
 *   signal?: AbortSignal | null,
 *   leave?: () => void,
 *   rejoin?: () => Promise<void>
 * }} [deps] - `waiting`: called once when the first refusal makes it wait, its answer once the
 *   wait is over — what the line under the chat reads (`@tracy/core` `chat-wait`, #1403 item 10).
 *   `signal`: the turn's; aborted, nothing more is sent. `leave` / `rejoin`: the site's flight this call
 *   runs in (`call-memory.mjs` `flightSeat`), left for each pause and queued for again after it.
 * @returns {Promise<unknown>} the first answer that is not a lease refusal (with `waitedSeconds` when it
 *   waited), the last refusal with `waitedSeconds`, or `TURN_STOPPED` when the turn stopped first.
 */
export async function waitOutLease(send, deps = {}) {
  const now = deps.now ?? Date.now
  const maxMs = deps.maxMs ?? LEASE_WAIT_MAX_MS
  const signal = deps.signal ?? null
  const started = now()
  // The bound counts the pauses asked for as well as the clock: a sleep that returns early (a test's,
  // or a timer cut short) must not turn the wait into a loop with no end.
  let paused = 0
  const spent = () => Math.max(now() - started, paused)
  if (signal?.aborted) return stoppedAnswer()
  let answer = await send()
  let pauses = 0
  let stopped = false
  /** @type {(() => void) | null} */
  let endWait = null
  try {
    while (isLeaseBusy(answer)) {
      const left = maxMs - spent()
      if (left <= 0) break
      endWait ??= deps.waiting?.() ?? null
      const pause = Math.min(LEASE_PAUSES_MS[Math.min(pauses, LEASE_PAUSES_MS.length - 1)], left)
      // Out of the flight for the pause: the holder's own calls on this site must not queue behind it.
      deps.leave?.()
      await stoppablePause(pause, signal, deps.sleep ?? null)
      if (signal?.aborted) {
        stopped = true
        break
      }
      paused += pause
      pauses += 1
      await deps.rejoin?.()
      // A Stop that came while this call queued again: still nothing sent.
      if (signal?.aborted) {
        stopped = true
        break
      }
      answer = await send()
    }
  } finally {
    endWait?.()
  }
  if (stopped) return stoppedAnswer({ waitedSeconds: Math.round(spent() / 1000) })
  if (pauses === 0 || answer === null || typeof answer !== 'object' || Array.isArray(answer)) return answer
  const waitedSeconds = Math.round(spent() / 1000)
  const a = /** @type {Record<string, unknown>} */ (answer)
  if (!isLeaseBusy(a)) return { ...a, waitedSeconds }
  return { ...a, waitedSeconds, next: stillBusyNext(a, waitedSeconds) }
}

/**
 * What to say after the wait ran out — replacing the door's own `next`, which was written for a
 * first refusal ("this conversation is next when they finish") and would have the agent promise a
 * turn it already waited for. Who holds it is the door's word; nothing is counted or guessed.
 * @param {Record<string, unknown>} a - the last refusal.
 * @param {number} waitedSeconds
 */
export function stillBusyNext(a, waitedSeconds) {
  const who =
    a.holderIsYou === true
      ? "another of the customer's own conversations"
      : typeof a.holder === 'string' && a.holder !== ''
        ? a.holder
        : 'another conversation'
  return `You already waited ${waitedSeconds} s and ${who} is still writing to this site. Tell the customer that in plain words, and what you were about to change; make it when they ask again. Do not retry in a loop.`
}
