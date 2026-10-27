/**
 * Bounded retry of one step of an import.
 *
 * WHY IT MUST EXIST. An import is hundreds of requests to someone else's server, lasting several
 * minutes: a shared host runs out of PHP workers, a proxy resets a connection, a DNS lookup blinks. Without
 * this layer any one of them ENDS THE WHOLE RUN — and it really happened in `tracy-desk`,
 * at table 59 of 84 of a customer site (10/08, `TypeError: fetch failed`), throwing away everything
 * already copied.
 *
 * 🔒 RETRYING IS SAFE PRECISELY BECAUSE OF HOW THE ENGINE IS DESIGNED: each call is a bounded chunk,
 * named by an explicit cursor — asking again with the same cursor returns the same bytes. Even a
 * multipart part can be sent twice: storage keeps the last copy under that part number.
 *
 * 🔒 ONLY TRANSPORT FAILURES ARE RETRIED. A refusal the engine REALLY says (wrong token, table does not
 * exist) is an answer, and asking again cannot change it. Getting this distinction wrong means either giving up
 * too early, or knocking six times on a door that already answered "no".
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Four attempts, doubling from 1s: 1s, 2s, 4s. A host out of workers needs seconds, not milliseconds. */
const ATTEMPTS = 4
const FIRST_DELAY_MS = 1000

/** Name marking an error the caller has judged a transport failure rather than an answer. */
const RELAYED = 'RelayedTransportError'

/**
 * Build an error that says: the engine RELAYED a transport incident; it did not refuse on its own.
 *
 * Needed because the engine PUTs to storage itself and reports storage's 502 as its own `ok:false`.
 * Read as an answer, the retry would never run — exactly where `tracy-desk` needed a patch.
 */
export function relayedTransportError(message: string): Error {
  const error = new Error(message)
  error.name = RELAYED
  return error
}

/** Whether this error is worth asking again. */
function isTransport(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === RELAYED) return true
  // `fetch` wraps every network incident in `TypeError: fetch failed`; `AbortError` is our own
  // timeout. Both mean "no answer received yet", not "refused".
  return error.name === 'TypeError' || error.name === 'TimeoutError' || error.name === 'AbortError'
}

/**
 * Run one step, asking again when the connection blinks.
 * @param call The work to do. Must be idempotent by its own cursor.
 * @param onRetry Called before each wait, so the console can say it is retrying.
 */
export async function withRetry<T>(
  call: () => Promise<T>,
  onRetry?: (attempt: number, delayMs: number) => void
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return await call()
    } catch (error) {
      lastError = error
      if (!isTransport(error) || attempt === ATTEMPTS) break
      const delay = FIRST_DELAY_MS * 2 ** (attempt - 1)
      onRetry?.(attempt, delay)
      await sleep(delay)
    }
  }
  throw lastError
}

/**
 * A separate ladder for ONE PART of a webroot upload: longer and sparser than the shared ladder.
 *
 * The shared ladder is sized for a shared host briefly out of workers. Storage having a bad
 * minute lasts longer than that.
 */
export const PART_ATTEMPTS = 6
export const PART_FIRST_DELAY_MS = 2000

/**
 * One part, retried until it lands.
 *
 * 🔒 THE SIGNATURE IS MINTED AGAIN ON EVERY ATTEMPT, and that is the whole reason this ladder lives here rather than
 * wrapping the engine call: a presigned URL has a lifetime, so waiting a minute then reusing the first URL fails on
 * the SIGNATURE, not on storage — and it looks exactly like storage failing twice in a row.
 * @param attemptOnce Takes the attempt number, mints a fresh URL itself, then calls the engine.
 * @param onRetry Reports to the console.
 */
export async function withPartRetry<T>(
  attemptOnce: (attempt: number) => Promise<T>,
  onRetry?: (attempt: number, delayMs: number) => void
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
    try {
      return await attemptOnce(attempt)
    } catch (error) {
      lastError = error
      if (!isTransport(error) || attempt === PART_ATTEMPTS) break
      const delay = PART_FIRST_DELAY_MS * 2 ** (attempt - 1)
      onRetry?.(attempt, delay)
      await sleep(delay)
    }
  }
  throw lastError
}
