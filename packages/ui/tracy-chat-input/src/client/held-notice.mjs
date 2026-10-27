/**
 * What the author of a message held by a Tracy update is shown (#517), kept free of React and of
 * the page so `test/deploy-hold.test.mjs` can hold it.
 *
 * WHY. While a dsh deploy drains, a new message waits in the conversation's queue instead of
 * starting a turn the deploy would cut (`tracy-site-tools` `deploy-hold.mjs`). Seen 28/09 on dev
 * (`qaem643`): the author sent twice, waited ten minutes each time, and nothing on screen said Tracy
 * was updating — nor, after the update, that neither message had run. The host half says which of
 * those a conversation is in (`POST /api/tracy-site-tools/held` with `{ sessionId }` — the shape
 * the seat gateway holds to the viewer's own sessions); this file turns the answer into the one
 * line under the queue.
 */

/** How often a conversation with a waiting message asks again. */
export const HELD_POLL_MS = 5_000

const STATES = new Set(['none', 'held', 'released', 'delayed', 'unsaved', 'failed', 'unknown'])
/** The host's notice id shape (`randomUUID`). */
const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** @param {unknown} value @returns {value is string} */
const isNoticeId = (value) => typeof value === 'string' && NOTICE_ID.test(value)

/**
 * @typedef {'none' | 'held' | 'released' | 'delayed' | 'unsaved' | 'failed' | 'unknown'} HeldState
 * @typedef {{ id: string, state: 'failed' | 'unknown', count: number }} EarlierNotice
 * @typedef {{
 *   state: HeldState,
 *   count: number,
 *   recorded: boolean,
 *   settled: boolean,
 *   draining: boolean,
 *   id: string | null,
 *   earlier: EarlierNotice[]
 * }} HeldAnswer
 * `recorded`: the answer is about this conversation's own record — not the host saying it cannot
 * read its records at all, which it says to every conversation alike. `settled`: the host will not
 * change this answer until the author acts; an answer without it is treated as unsettled.
 * `id`: the id of this conversation's own notice (`failed`/`unknown` record), what the page names
 * when it confirms drawing it; null otherwise. `earlier`: notices about an earlier update's messages
 * kept beside this record (another update began before the page drew them) — one line each.
 * @typedef {'held.waiting' | 'held.delayed' | 'held.unsaved' | 'held.failed' | 'held.unknown' | 'held.unreadable'} HeldNoticeKey
 */

/** Every key of the door's answer (`tracy-site-tools` `index.ts`), and of each earlier notice in it. */
const ANSWER_KEYS = ['ok', 'draining', 'state', 'count', 'recorded', 'settled', 'id', 'earlier']
const EARLIER_KEYS = ['id', 'state', 'count']
/** @param {unknown} value @returns {value is Record<string, unknown>} */
const isPlain = (value) =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
/** @param {Record<string, unknown>} o @param {readonly string[]} keys */
const hasExactly = (o, keys) => {
  const own = Object.keys(o)
  return own.length === keys.length && keys.every((key) => Object.hasOwn(o, key))
}
/** @param {unknown} value @returns {value is number} */
const isCount = (value) => Number.isSafeInteger(value) && /** @type {number} */ (value) >= 0

/**
 * One earlier notice exactly as the door writes it, or null.
 * @param {unknown} value @returns {EarlierNotice | null}
 */
function earlierOf(value) {
  if (!isPlain(value) || !hasExactly(value, EARLIER_KEYS)) return null
  if (!isNoticeId(value.id) || !isCount(value.count)) return null
  if (value.state !== 'failed' && value.state !== 'unknown') return null
  return { id: value.id, state: value.state, count: value.count }
}

/**
 * The door's answer, or null when it is not one.
 *
 * 🔒 ONLY THE ONE SHAPE THE DOOR WRITES IS AN ANSWER (`heldPrompts().status` plus `ok`/`draining`):
 * every key present and of its type, no other key, and the fields agreeing with the state the way
 * the host produces them — a notice (`failed`, or `unknown` about this conversation's record) is
 * settled and names its id; a message still followed (`held`, `released`, `delayed`, `unsaved`) is
 * this conversation's, unsettled, with no id; `none` and the host-wide `unknown` carry nothing
 * else. A line on this screen says a message ran, will run or did not; a body that only looks like
 * an answer (a proxy's page, a door of another version, a field missing) must never say it, so it
 * draws nothing and clears nothing (the caller keeps what it showed, and asks again).
 * @param {unknown} body
 * @returns {HeldAnswer | null}
 */
export function parseHeld(body) {
  if (!isPlain(body) || !hasExactly(body, ANSWER_KEYS) || body.ok !== true) return null
  const { state, count, recorded, settled, draining, id } = body
  if (typeof state !== 'string' || !STATES.has(state) || !isCount(count)) return null
  if (typeof recorded !== 'boolean' || typeof settled !== 'boolean' || typeof draining !== 'boolean')
    return null
  if (!(id === null || isNoticeId(id)) || !Array.isArray(body.earlier)) return null
  /** @type {EarlierNotice[]} */
  const earlier = []
  for (const value of body.earlier) {
    const n = earlierOf(value)
    if (n === null) return null
    earlier.push(n)
  }
  // At most one kept notice per state, none of the state of this record's own notice.
  const states = earlier.map((n) => n.state)
  if (new Set(states).size !== states.length) return null
  const notice = recorded && (state === 'failed' || state === 'unknown')
  if (notice) {
    if (!settled || id === null || states.includes(/** @type {'failed' | 'unknown'} */ (state))) return null
  } else if (state === 'none' || state === 'unknown') {
    // No record of this conversation (or none the host can read): nothing else to say.
    if (recorded || !settled || count !== 0 || id !== null || earlier.length > 0) return null
  } else if (state === 'failed') {
    return null
  } else if (!recorded || settled || id !== null) {
    return null
  }
  return {
    state: /** @type {HeldState} */ (state),
    count,
    recorded,
    settled,
    draining,
    id: /** @type {string | null} */ (id),
    earlier
  }
}

/**
 * The line for an earlier update's notice kept beside a message held now, or null. Always drawn
 * when the host keeps one: it is about messages that are no longer queued, so nothing on the page
 * says it otherwise.
 * @param {EarlierNotice | null | undefined} earlier
 * @returns {HeldNoticeKey | null}
 */
export function earlierNoticeKey(earlier) {
  if (!earlier) return null
  return earlier.state === 'failed' ? 'held.failed' : 'held.unknown'
}

/**
 * Which line to show.
 *
 * - `held`: the update is on and a message of the author's still waits — say it will run. Once the
 *   author removed every held message (the host stops following each, `count`) and nothing waits
 *   in the queue either, there is nothing to promise.
 * - `delayed`: the update is over but Tracy has not managed to start it yet; it still runs, once,
 *   as soon as it can — said so, never "send it again" (that would run it twice).
 * - `unsaved`: it still waits and still runs, once — but Tracy could not write it down, so after a
 *   restart it may not be able to say what became of it. Say it runs and must not be sent again
 *   (the old message still in the queue would run beside the new one); never the `unknown` notice.
 * - `failed`: it did not run after the update and no longer can — say so.
 * - `unknown`: settled — nothing of it waits any more, and nobody can say whether it ran (it may
 *   have run in part: the update cut its turn) — say that, not "it ran" and not "it did not", and
 *   ask the author to look before sending again. Always for this conversation's own record
 *   (`recorded`, even one that names no message: a version 1 record from before messages were
 *   followed).
 * - `unknown` without a record (`held.unreadable`): the host cannot read what it held at all, so it
 *   cannot say whether a message of this conversation was held, nor what became of it — and the
 *   queue may be empty because the update lost it. Said on every conversation while that lasts,
 *   never hidden for an empty queue (that would be the silent loss again); `held.unknown` instead
 *   while a queued message sits in an idle conversation, which is at least one it can point to.
 * - `released` / `none`: nothing to add; the queue and the transcript show the rest.
 *
 * @param {{ state: HeldState, count: number, recorded?: boolean, queued: number, running: boolean }} input
 * @returns {HeldNoticeKey | null}
 */
export function heldNoticeKey({ state, count, recorded = false, queued, running }) {
  if (state === 'held') return count > 0 || queued > 0 ? 'held.waiting' : null
  if (state === 'delayed') return count > 0 || queued > 0 ? 'held.delayed' : null
  if (state === 'unsaved') return 'held.unsaved'
  if (state === 'failed') return 'held.failed'
  if (state === 'unknown') {
    if (recorded || count > 0 || (queued > 0 && !running)) return 'held.unknown'
    return 'held.unreadable'
  }
  return null
}

/**
 * Whether to keep asking: while the host's answer may still change on its own (`settled` false — a
 * message held, being released, delayed, or not yet written down),
 * and while a queued message sits in an idle conversation (it may be held and this page not yet
 * told). A settled notice stays until the author sends again, which the next status change asks
 * about.
 * @param {{ state: HeldState | null, settled?: boolean, queued: number, running: boolean }} input
 */
export function shouldPoll({ state, settled = false, queued, running }) {
  if (state !== null && state !== 'none' && !settled) return true
  return queued > 0 && !running
}

/**
 * The notices of this answer the page must confirm once drawn (`ackHeld`), by id: each earlier
 * update's notice kept beside the record (always drawn, `earlierNoticeKey`), and this conversation's
 * own settled notice when a line was drawn for it — which the host forgets some time after the
 * confirmation. Named by id, so a confirmation reaching the host after a newer notice replaced the
 * one drawn confirms only what was drawn.
 * @param {{ state: HeldState, settled: boolean, recorded: boolean, id?: string | null, earlier?: EarlierNotice[] }} answer
 * @param {HeldNoticeKey | null} key - what the page drew for its own record
 * @returns {string[]}
 */
export function drawnNotices({ state, settled, recorded, id = null, earlier = [] }, key) {
  const ids = earlier.filter((n) => earlierNoticeKey(n) !== null).map((n) => n.id)
  if (settled && recorded && (state === 'failed' || state === 'unknown') && key !== null && id !== null)
    ids.push(id)
  return ids
}

/**
 * Ask the host half once.
 * @param {string} sessionId
 * @param {{ dshUrl: (path: string) => string, fetchImpl?: typeof fetch, signal?: AbortSignal }} deps -
 *   `dshUrl` from `dsh-url.ts`: the door is dsh's, under the page's site mount; `signal` aborts the
 *   request (the watch stopped, or the ask took too long)
 * @returns {Promise<HeldAnswer | null>} null when dsh did not answer (it is being replaced — the
 *   update itself), was aborted, or answered something else; the caller keeps what it showed.
 */
export async function readHeld(sessionId, { dshUrl, fetchImpl = fetch, signal }) {
  try {
    const res = await fetchImpl(dshUrl('/api/tracy-site-tools/held'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      signal
    })
    if (!res.ok) return null
    return parseHeld(await res.json().catch(() => null))
  } catch {
    return null
  }
}

/**
 * Tell the host half these notices of `sessionId` were drawn (`drawnNotices`). Called only after
 * drawing, so a notice whose answer never reached the page is never counted as seen. True only when
 * the door itself says it wrote them down: a 200 whose body is the door's answer (`parseHeld` — it
 * answers with the status once `seen` is written, and 503 when it could not). Any other 200 (a
 * proxy's page, an empty or foreign body) is not the host taking it. False when the host did not
 * take it (unreachable, aborted, refused, or anything else): `noticeAcker` sends it again, a bounded
 * number of times.
 * @param {string} sessionId
 * @param {readonly string[]} ids - the ids of the notices drawn
 * @param {{ dshUrl: (path: string) => string, fetchImpl?: typeof fetch, signal?: AbortSignal }} deps
 * @returns {Promise<boolean>} whether the host took it
 */
export async function ackHeld(sessionId, ids, { dshUrl, fetchImpl = fetch, signal }) {
  if (ids.length === 0) return false
  try {
    const res = await fetchImpl(dshUrl('/api/tracy-site-tools/held'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, seen: [...ids] }),
      signal
    })
    if (!res.ok) return false
    return parseHeld(await res.json().catch(() => null)) !== null
  } catch {
    return false
  }
}

/** How many times one mounted page sends one confirmation before it leaves it unconfirmed. */
export const ACK_TRIES = 3
/** How long one confirmation may take before it counts as not taken (and is aborted). */
export const ACK_TIMEOUT_MS = 10_000

/**
 * Confirm drawn notices until the host has taken each (`ackHeld`). An id counts as confirmed only
 * once the host answered ok — a confirmation lost while dsh is replaced would otherwise leave the
 * host without `seenAt`, and the notice would outlive the author's next message. A refused, lost or
 * timed-out confirmation (`timeout` ms, then aborted) is sent again `every` ms later, at most
 * `tries` sends in all; after that the id stays unconfirmed — the host keeps the notice, and the
 * next page mounted on the conversation confirms it again. An id on its way, waiting for its
 * retry, or out of tries is not sent again by a new render. After `stop` (the page left) nothing
 * is sent, retried or recorded, and the request in flight is aborted.
 * @param {(sessionId: string, ids: string[], signal: AbortSignal) => Promise<boolean>} send -
 *   `ackHeld`, bound
 * @param {{
 *   every?: number,
 *   tries?: number,
 *   timeout?: number,
 *   timers?: { setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }
 * }} [opts]
 * @returns {{ ack: (sessionId: string, ids: readonly string[]) => Promise<void>, stop: () => void }}
 */
export function noticeAcker(
  send,
  { every = HELD_POLL_MS, tries = ACK_TRIES, timeout = ACK_TIMEOUT_MS, timers = globalThis } = {}
) {
  /** `sessionId:id` the host took */
  const taken = new Set()
  /** `sessionId:id` on its way, waiting for its retry, or out of tries in this mount */
  const pending = new Set()
  /** @type {Set<ReturnType<typeof setTimeout>>} */
  const retries = new Set()
  /** @type {Set<AbortController>} */
  const inFlight = new Set()
  let live = true
  /**
   * One send, settled within `timeout` ms: false when it fails, throws, or does not answer in time.
   * @param {string} sessionId @param {string[]} ids
   * @returns {Promise<boolean>}
   */
  const sendOnce = (sessionId, ids) => {
    const controller = new AbortController()
    inFlight.add(controller)
    return new Promise((resolve) => {
      const timer = timers.setTimeout(() => {
        controller.abort()
        resolve(false)
      }, timeout)
      Promise.resolve()
        .then(() => send(sessionId, ids, controller.signal))
        .then(
          (ok) => resolve(ok === true),
          () => resolve(false)
        )
        .finally(() => timers.clearTimeout(timer))
    }).finally(() => inFlight.delete(controller))
  }
  /**
   * @param {string} sessionId
   * @param {string[]} ids - all in `pending`, which they leave only when taken
   * @param {number} sent - sends made before this one
   */
  const attempt = async (sessionId, ids, sent) => {
    const ok = await sendOnce(sessionId, ids)
    if (!live) return
    if (ok) {
      for (const id of ids) {
        pending.delete(`${sessionId}:${id}`)
        taken.add(`${sessionId}:${id}`)
      }
      return
    }
    // Out of tries: left in `pending`, so this mount does not send it again; unconfirmed on the host.
    if (sent + 1 >= tries) return
    const timer = timers.setTimeout(() => {
      retries.delete(timer)
      if (live) void attempt(sessionId, ids, sent + 1)
    }, every)
    retries.add(timer)
  }
  return {
    /** @param {string} sessionId @param {readonly string[]} ids */
    ack: async (sessionId, ids) => {
      const fresh = ids.filter((id) => !taken.has(`${sessionId}:${id}`) && !pending.has(`${sessionId}:${id}`))
      if (!live || fresh.length === 0) return
      for (const id of fresh) pending.add(`${sessionId}:${id}`)
      await attempt(sessionId, fresh, 0)
    },
    stop: () => {
      live = false
      for (const timer of retries) timers.clearTimeout(timer)
      retries.clear()
      for (const controller of inFlight) controller.abort()
      inFlight.clear()
    }
  }
}

/** How long one ask may take before it counts as unanswered (and is aborted). */
export const READ_TIMEOUT_MS = 10_000

/**
 * Ask about one conversation now, then again `every` ms after each ask ends — until the host gave
 * one answer, and after it for as long as `poll`; stop when the returned function is called.
 *
 * - One ask at a time: the next is timed from the end of the last, so a dsh that hangs never piles
 *   requests up, and no older answer can land after a newer one.
 * - An ask unanswered after `timeout` ms is aborted and counts as unanswered.
 * - Unanswered (`null` — dsh being replaced, the door refused, a body that is not an answer): asked
 *   again, whatever `poll` says. A page opened while dsh restarts, with nothing queued, would
 *   otherwise never learn that a message of its conversation was lost.
 * - After the stop (the page moved to another conversation, or the status changed and a new watch
 *   began) nothing is asked, the ask in flight is aborted, and its late answer is dropped.
 *
 * @param {string} sessionId
 * @param {{
 *   poll: boolean,
 *   read: (sessionId: string, signal: AbortSignal) => Promise<HeldAnswer | null>,
 *   onAnswer: (answer: HeldAnswer) => void,
 *   every?: number,
 *   timeout?: number,
 *   timers?: { setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }
 * }} deps
 * @returns {() => void}
 */
export function watchHeld(
  sessionId,
  { poll, read, onAnswer, every = HELD_POLL_MS, timeout = READ_TIMEOUT_MS, timers = globalThis }
) {
  let live = true
  /** @type {ReturnType<typeof setTimeout> | undefined} the next ask */
  let next
  /** @type {ReturnType<typeof setTimeout> | undefined} the ask in flight's deadline */
  let deadline
  /** @type {AbortController | undefined} */
  let inFlight
  const ask = async () => {
    const controller = new AbortController()
    inFlight = controller
    /** @type {HeldAnswer | null} */
    const answer = await new Promise((resolve) => {
      deadline = timers.setTimeout(() => {
        controller.abort()
        resolve(null)
      }, timeout)
      // Asked now, not a tick later: a watch begun is a request on its way.
      /** @type {Promise<HeldAnswer | null>} */
      let reply
      try {
        reply = Promise.resolve(read(sessionId, controller.signal))
      } catch (error) {
        reply = Promise.reject(error)
      }
      reply.then(
        (a) => resolve(a ?? null),
        () => resolve(null)
      )
    })
    timers.clearTimeout(deadline)
    deadline = undefined
    inFlight = undefined
    if (!live) return
    if (answer !== null) onAnswer(answer)
    if (answer !== null && !poll) return
    next = timers.setTimeout(() => {
      next = undefined
      if (live) void ask()
    }, every)
  }
  void ask()
  return () => {
    live = false
    if (next !== undefined) timers.clearTimeout(next)
    if (deadline !== undefined) timers.clearTimeout(deadline)
    inFlight?.abort()
  }
}
