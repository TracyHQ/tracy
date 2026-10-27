/**
 * THE CUSTOMER PRESSED STOP: WHAT A SITE CALL STILL SENDS, AND WHAT IT DOES NOT (review C2, 19/10/2026).
 *
 * WHY. No site tool read the turn's abort signal. dsh waits for a tool's body to finish and only then
 * replaces its answer with "Error: tool call aborted", so a call waiting out another conversation's write
 * lease (up to 100 s, `lease-wait.mjs`) kept waiting after Stop and then wrote — while the log said it was
 * aborted, and the next turn believed nothing had changed. Once the turn's signal is aborted:
 * - a send not made yet is not made: the call answers {@link stoppedAnswer} at once, a lease wait included;
 * - a send already on the wire is NOT cut: aborting a request does not prove the site stopped writing, so it
 *   runs to its own deadline, and what it answered (landed, refused, or unknown) is kept as it is;
 * - a road of several sends (the replace job, a group delete, a contract apply and its repairs, an EmDash
 *   write in rounds) stops between two of them, because each send asks here first.
 *
 * The signal is the one dsh hands every tool call (`exec.signal`, required by its tool registry). Pure.
 */

/** The code of a call the turn's Stop kept from being sent. */
export const TURN_STOPPED = 'TURN_STOPPED'

/**
 * The answer of a call that was not sent because the customer stopped the turn.
 * @param {Record<string, unknown>} [extra] - e.g. `waitedSeconds` for a lease wait cut short.
 * @returns {Record<string, unknown>}
 */
export function stoppedAnswer(extra = {}) {
  return {
    ok: false,
    code: TURN_STOPPED,
    error: 'The customer stopped this turn before this call was sent: nothing was sent.',
    ...extra
  }
}

/**
 * Whether an answer is {@link stoppedAnswer}'s: nothing was sent, so nothing changed.
 * @param {unknown} answer
 */
export function isTurnStopped(answer) {
  return (
    answer !== null &&
    typeof answer === 'object' &&
    /** @type {Record<string, unknown>} */ (answer).ok === false &&
    /** @type {Record<string, unknown>} */ (answer).code === TURN_STOPPED
  )
}

/**
 * Wait `ms`, or less: the wait ends as soon as `signal` is aborted. With `sleep` (an injected clock, a
 * test's), that sleep is the wait; without it, a timer that is cleared on abort, so nothing outlives it.
 * @param {number} ms
 * @param {AbortSignal | null | undefined} [signal]
 * @param {((ms: number) => unknown) | null} [sleep]
 * @returns {Promise<void>}
 */
export function pause(ms, signal = null, sleep = null) {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null
    const done = () => {
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
    if (sleep) Promise.resolve(sleep(ms)).then(done, done)
    else timer = setTimeout(done, ms)
  })
}

/**
 * A sleep that the turn's Stop cuts short ({@link pause}); `sleep` itself when there is no signal.
 * @param {((ms: number) => unknown) | null | undefined} sleep
 * @param {AbortSignal | null | undefined} signal
 * @returns {(ms: number) => Promise<void>}
 */
export function stoppableSleep(sleep, signal) {
  if (!signal) return sleep ? async (ms) => void (await sleep(ms)) : (ms) => pause(ms)
  return (ms) => pause(ms, signal, sleep ?? null)
}
