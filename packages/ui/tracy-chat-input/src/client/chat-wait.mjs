/**
 * The line under a running chat that says what its turn waits on (#1403 item 10): another
 * conversation's write lease, the previous request's changes being saved, or the page being looked
 * at before the turn closes. Each is a wait of up to 100 / 120 / 30 s in which the model does not
 * work, and the chat showed only "Thinking for…". The host half records the wait (`@tracy/core`
 * `chat-wait`) and answers it on `tracy-site-tools` `/held` asked with `wait: true`.
 *
 * 🔒 NEVER WHO. "Another conversation" is all the line says: the lease's holder may be someone this
 * seat does not know, and the door never names them. Kept free of React for `test/chat-wait.test.mjs`.
 */

/** How often a running chat asks, and how long a wait lasts before the line shows it. */
export const WAIT_POLL_MS = 3000
export const WAIT_SHOW_AFTER_S = 3

const KINDS = new Set(['lease', 'previous', 'check'])

/**
 * @typedef {'lease' | 'previous' | 'check'} WaitKind
 * @typedef {'wait.lease' | 'wait.previous' | 'wait.check'} WaitKey
 */

/**
 * The line for what the host said, or null: nothing waited on, or not long enough to say.
 * @param {unknown} waiting - the door's `waiting`
 * @returns {{ key: WaitKey, kind: WaitKind, seconds: number } | null}
 */
export function waitLine(waiting) {
  const w = /** @type {{ kind?: unknown, seconds?: unknown } | null | undefined} */ (waiting)
  if (!w || typeof w.kind !== 'string' || !KINDS.has(w.kind)) return null
  if (typeof w.seconds !== 'number' || !Number.isFinite(w.seconds) || w.seconds < WAIT_SHOW_AFTER_S)
    return null
  const kind = /** @type {WaitKind} */ (w.kind)
  return { key: /** @type {WaitKey} */ (`wait.${kind}`), kind, seconds: Math.floor(w.seconds) }
}

/**
 * Ask the host half what the turn of `sessionId` waits on.
 * @param {string} sessionId
 * @param {{ dshUrl: (path: string) => string, fetchImpl?: typeof fetch, signal?: AbortSignal }} deps
 * @returns {Promise<unknown>} the door's `waiting`; null when it said nothing or could not be asked
 */
export async function readWait(sessionId, { dshUrl, fetchImpl = fetch, signal }) {
  try {
    const res = await fetchImpl(dshUrl('/api/tracy-site-tools/held'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, wait: true }),
      signal
    })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.ok === true ? (body.waiting ?? null) : null
  } catch {
    return null
  }
}
