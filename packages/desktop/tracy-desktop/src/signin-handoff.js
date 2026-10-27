/**
 * The desktop sign-in round: Google or GitHub sign-in finishes in the system browser, and the
 * session lands in THIS app's cookie jar.
 *
 * Why a round at all. The app and the browser hold two different cookie jars. A provider sign-in
 * that finishes in the browser sets `tracy_sess` there, and the app never sees it. So the app asks
 * the server for a one-time round (`purpose: "desktop"`), sends the person to the browser to
 * approve it, polls until they do, and then redeems the round itself — the redeem answer carries
 * the `Set-Cookie`, and because the app makes that request through its own session, the cookie
 * lands in the app's jar.
 *
 * Contract (server side in `apps/tracy-web`, spec `tasks/todo-desktop-signin-package.md`):
 *   POST /auth/link/browser {purpose, device, email?} -> {nonce, clientSecret, matchCode, expiresAt}
 *   GET  /auth/link/:nonce                     -> {status: pending|approved|denied|expired}
 *   POST /auth/link/:nonce/session {clientSecret}, Origin = home, JSON -> 204 + Set-Cookie
 *        (refused: 403 {code: 'SIGN_IN_REFUSED', reason: 'NOT_ADMITTED' | 'ACCESS_UNAVAILABLE'})
 *   POST /auth/link/:nonce/cancel {clientSecret}, Origin = home, JSON -> 204 (a pending round
 *        becomes denied; sent when a started round is cancelled, never awaited)
 *   GET  /auth/me                              -> {email | null}
 *
 * 🔒 THE CLIENT SECRET LIVES ONLY IN THE CLOSURE OF ONE ROUND. It is never put in a URL, never
 * handed to `onCode` (whatever the window shows), and never written to the log. The nonce goes in
 * the browser URL because the approve page needs it; the secret is what makes the nonce alone
 * worthless, so it must not travel the same way.
 *
 * Everything with a side effect is injected (fetch, clock, sleep, random, openExternal, log), so
 * the whole round runs under `node --test` without Electron or a network.
 */

const DEFAULT_DEVICE = 'Tracy Cowork for Mac'

/** Longest address the server takes (RFC 5321 path limit); a longer one is not sent at all. */
const MAX_EMAIL = 254

/**
 * The address typed on the sign-in page (`/signin/email?email=`), as the start body carries it, or
 * undefined. It goes in the BODY of the start request only (tasks/todo-desktop-onboard-v2.md,
 * contract 2): never in a URL, never in the log. The server checks its shape; an older server
 * ignores the unknown field, so the round runs as before.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function emailHint(value) {
  if (typeof value !== 'string') return undefined
  const email = value.trim()
  return email === '' || email.length > MAX_EMAIL ? undefined : email
}

/** Poll interval and its jitter: 5 s ± 1 s, so many apps never settle into one beat. */
const POLL_MS = 5_000
const JITTER_MS = 1_000

/** Longest any single request may take before the round treats it as lost. */
const REQUEST_TIMEOUT_MS = 15_000

/** Raised inside a round when it was cancelled; never escapes `start`. */
class Cancelled extends Error {}

/**
 * Create the sign-in handoff for ONE window. One round is active at a time: starting a new one
 * cancels the old one, whose `start` then resolves `{outcome: 'cancelled'}`.
 * @param {object} deps
 * @param {string} deps.home - the origin the window was opened on, without a trailing `/`.
 * @param {typeof fetch} deps.fetch - the window session's fetch, so Set-Cookie lands in its jar.
 * @param {() => number} [deps.now] - epoch ms.
 * @param {(ms: number) => Promise<void>} [deps.sleep] - waits between polls.
 * @param {() => number} [deps.random] - [0, 1), for the poll jitter.
 * @param {(url: string) => unknown} deps.openExternal - opens the system browser.
 * @param {(line: string) => void} [deps.log] - progress lines; never given the secret.
 * @param {string} [deps.device] - how the approve page names this app.
 * @param {number} [deps.pollMs]
 * @param {number} [deps.jitterMs]
 * @param {number} [deps.timeoutMs] - per-request timeout.
 */
function createSigninHandoff({
  home,
  fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  openExternal,
  log = () => {},
  device = DEFAULT_DEVICE,
  pollMs = POLL_MS,
  jitterMs = JITTER_MS,
  timeoutMs = REQUEST_TIMEOUT_MS
}) {
  const origin = home.replace(/\/+$/, '')
  /** The round in progress: its AbortController, or null. */
  let current = null

  /**
   * Run one round to its end.
   * @param {AbortController} round - aborted when the round is cancelled.
   * @param {(info: {matchCode: string, expiresAt: number}) => void} onCode - shows the code.
   * @param {string | undefined} email - the address typed on the sign-in page, already checked.
   * @returns {Promise<{outcome: 'signed-in'|'denied'|'expired'|'cancelled'|'failed', reason?: string,
   *   refusal?: 'not-admitted'}>}
   */
  async function run(round, onCode, email) {
    const cancelled = new Promise((_, reject) => {
      const stop = () => reject(new Cancelled())
      if (round.signal.aborted) stop()
      else round.signal.addEventListener('abort', stop, { once: true })
    })
    // Keep an unobserved rejection from crashing the process when nobody is racing it.
    cancelled.catch(() => {})
    /** Resolve `promise`, unless the round is cancelled first. */
    const guard = (promise) => Promise.race([promise, cancelled])
    /** One request, bounded by the round AND a timeout. */
    const request = (path, init = {}) =>
      guard(
        fetch(`${origin}${path}`, {
          cache: 'no-store',
          ...init,
          signal: AbortSignal.any([round.signal, AbortSignal.timeout(timeoutMs)])
        })
      )

    // 1. Ask for a round.
    let started
    try {
      const response = await request('/auth/link/browser', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(
          email === undefined ? { purpose: 'desktop', device } : { purpose: 'desktop', device, email }
        )
      })
      if (!response.ok) return { outcome: 'failed', reason: `start answered ${response.status}` }
      started = await guard(response.json())
    } catch (error) {
      if (error instanceof Cancelled) throw error
      return { outcome: 'failed', reason: 'start request failed' }
    }
    const { nonce, matchCode } = started
    const clientSecret = started.clientSecret
    const expiresAt = Number(started.expiresAt)
    if (
      typeof nonce !== 'string' ||
      nonce === '' ||
      typeof clientSecret !== 'string' ||
      clientSecret === ''
    ) {
      return { outcome: 'failed', reason: 'start answer incomplete' }
    }
    const door = `/auth/link/${encodeURIComponent(nonce)}`
    log('desktop sign-in: round started, waiting for approval in the browser')

    // A cancel from here on (the person left the waiting page, closed the window, or started a
    // newer round) ends the round on the server too, so the browser can no longer approve a
    // sign-in no app will redeem. Fire and forget: never awaited, its own timeout, never the
    // round's signal (already aborted when this runs), and a failure is only a log line.
    round.signal.addEventListener(
      'abort',
      () => {
        Promise.resolve()
          .then(() =>
            fetch(`${origin}${door}/cancel`, {
              method: 'POST',
              cache: 'no-store',
              headers: { Origin: origin, 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientSecret }),
              redirect: 'error',
              signal: AbortSignal.timeout(timeoutMs)
            })
          )
          .catch(() => log('desktop sign-in: could not tell the server the round was cancelled'))
      },
      { once: true }
    )

    // 2. Show the code, send the person to the browser.
    onCode({ matchCode: String(matchCode ?? ''), expiresAt })
    await openExternal(`${origin}/signin?n=${encodeURIComponent(nonce)}`)

    // 3. Poll, one request at a time: the next one is sent only after the last one answered AND
    //    the pause after it ran out — so two polls can never be in flight together.
    for (;;) {
      if (now() >= expiresAt) {
        log('desktop sign-in: round expired')
        return { outcome: 'expired' }
      }
      let status
      try {
        const response = await request(door)
        status = response.ok ? (await guard(response.json())).status : undefined
      } catch (error) {
        if (error instanceof Cancelled) throw error
        // A lost poll is not an answer; the next one asks again.
        status = undefined
      }
      if (status === 'approved') break
      if (status === 'denied') {
        log('desktop sign-in: round denied in the browser')
        return { outcome: 'denied' }
      }
      if (status === 'expired') {
        log('desktop sign-in: round expired')
        return { outcome: 'expired' }
      }
      await guard(sleep(pollMs + (random() * 2 - 1) * jitterMs))
    }

    // 4. Redeem. The answer's Set-Cookie is the session; it lands in whichever jar `fetch` uses.
    log('desktop sign-in: approved, redeeming the round')
    try {
      const response = await request(`${door}/session`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientSecret }),
        credentials: 'include',
        redirect: 'error'
      })
      if (response.ok) return { outcome: 'signed-in' }
      log(`desktop sign-in: redeem refused (${response.status})`)
      const body = await guard(response.json()).catch((error) => {
        if (error instanceof Cancelled) throw error
        return null
      })
      return {
        outcome: 'failed',
        reason: `redeem answered ${response.status}`,
        // The one refusal the sign-in page can explain: the address is not admitted (waitlist).
        ...(body?.code === 'SIGN_IN_REFUSED' && body?.reason === 'NOT_ADMITTED'
          ? { refusal: 'not-admitted' }
          : {})
      }
    } catch (error) {
      if (error instanceof Cancelled) throw error
    }

    // 5. The redeem's answer was lost. The server may have consumed the round and set the cookie
    //    anyway — and the round is one-shot, so retrying it cannot work. Ask who we are instead.
    log('desktop sign-in: redeem answer lost, checking /auth/me')
    try {
      const response = await request('/auth/me', { credentials: 'include', redirect: 'error' })
      if (response.ok && (await guard(response.json())).email) return { outcome: 'signed-in' }
    } catch (error) {
      if (error instanceof Cancelled) throw error
    }
    return { outcome: 'failed', reason: 'redeem answer lost and no session' }
  }

  return {
    /**
     * Start a round, cancelling any round already in progress.
     * @param {object} [handlers]
     * @param {(info: {matchCode: string, expiresAt: number}) => void} [handlers.onCode]
     * @param {unknown} [handlers.email] - the address typed on the sign-in page, if any.
     */
    async start({ onCode = () => {}, email } = {}) {
      current?.abort()
      const round = new AbortController()
      current = round
      try {
        return await run(round, onCode, emailHint(email))
      } catch (error) {
        if (error instanceof Cancelled) return { outcome: 'cancelled' }
        return { outcome: 'failed', reason: 'unexpected error' }
      } finally {
        if (current === round) current = null
      }
    },
    /** Cancel the round in progress, if any. */
    cancel() {
      if (current === null) return
      log('desktop sign-in: round cancelled')
      current.abort()
      current = null
    },
    /** Whether a round is in progress. */
    get active() {
      return current !== null
    }
  }
}

module.exports = { createSigninHandoff }
