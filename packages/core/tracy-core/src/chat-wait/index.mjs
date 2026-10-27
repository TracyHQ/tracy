/**
 * What a running chat turn is waiting on, for the line under the chat (#1403 item 10).
 *
 * WHY. A turn can sit for minutes with nothing on screen but "Thinking for…": a write waits up to
 * 100 s for another conversation's write lease (`tracy-site-tools` `lease-wait.mjs`), the first
 * write waits up to 120 s for the previous turn's moment to be saved (`tracy-site-tabs`
 * `writeReady`), and a turn that wrote is looked at for up to 30 s before it closes (the visual
 * check). The model is not working in any of them, and the customer cannot tell a wait from a hang.
 *
 * The waits happen in two plugins, each bundling its own copy of this file into its own `lib/`, so
 * the record is one per process, under a global symbol: whichever plugin waits writes it, and the
 * one door that answers the page (`tracy-site-tools` `/held` asked with `wait: true`) reads it.
 *
 * Host-side only. Never throws.
 */

const KEY = Symbol.for('tracy.chat-wait')

/**
 * @typedef {'lease' | 'previous' | 'check'} WaitKind
 * `lease`: another conversation is changing the site; `previous`: the previous request's changes are
 * being saved; `check`: the page is looked at before the turn closes.
 * @typedef {{ kind: WaitKind, since: number }} Wait
 */

/** @returns {Map<string, Wait>} */
function registry() {
  const g = /** @type {Record<symbol, Map<string, Wait> | undefined>} */ (/** @type {unknown} */ (globalThis))
  let map = g[KEY]
  if (!(map instanceof Map)) {
    map = new Map()
    g[KEY] = map
  }
  return map
}

/**
 * The turn of `sessionId` starts waiting on `kind`. The newest wait of a conversation is the one
 * shown; ending an older one leaves a newer one in place.
 * @param {string} sessionId
 * @param {WaitKind} kind
 * @param {number} [now]
 * @returns {() => void} end - idempotent
 */
export function beginWait(sessionId, kind, now = Date.now()) {
  const wait = { kind, since: now }
  registry().set(sessionId, wait)
  return () => {
    if (registry().get(sessionId) === wait) registry().delete(sessionId)
  }
}

/**
 * Wait for `promise` with `sessionId` marked as waiting on `kind` meanwhile.
 * @template T
 * @param {string | null | undefined} sessionId - none: nothing is marked
 * @param {WaitKind} kind
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
export async function whileWaiting(sessionId, kind, promise) {
  if (typeof sessionId !== 'string') return promise
  const end = beginWait(sessionId, kind)
  try {
    return await promise
  } finally {
    end()
  }
}

/**
 * What the turn of `sessionId` waits on now, and for how many whole seconds; null when nothing.
 * @param {string} sessionId
 * @param {number} [now]
 * @returns {{ kind: WaitKind, seconds: number } | null}
 */
export function waitOf(sessionId, now = Date.now()) {
  const wait = registry().get(sessionId)
  if (!wait) return null
  return { kind: wait.kind, seconds: Math.max(0, Math.floor((now - wait.since) / 1000)) }
}
