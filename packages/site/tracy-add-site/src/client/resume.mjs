/**
 * A pointer to an unfinished site creation, so the console can reopen after the tab is closed.
 *
 * 🔒 STORE A POINTER, NOT CONTENT. Three facts — `siteKey`, `jobId`, `platform` — are enough to ask
 * the server again. Writing progress here too would build a second copy of a changing truth, and
 * that copy shows up after reopening the tab as a screen frozen at the minute it was closed.
 * ADR 0088 §3 calls the reopenable console where the import branch is more mature than create; what it reopens
 * is the **question**, not the old answer.
 *
 * 🔒 EVERY READ/WRITE IS WRAPPED IN `try`. `localStorage` throws on access when the browser blocks
 * third-party storage — and dsh runs in an iframe on the `web` surface. Losing the ability to reopen the console is
 * an inconvenience; throwing here loses the whole tab.
 *
 * ONE unfinished run, not a queue. The plugin's tab is `single: true`, so there is no way
 * to open two runs at once; a list here would be structure for a state that does not exist.
 */

/** The `localStorage` key. Package-prefixed so it collides with nobody. */
export const PENDING_KEY = 'tracy:add-site:pending'

/**
 * One pending build PER CONVERSATION. `localStorage` is shared by every session on the origin, so a
 * single key made the Add site tab of a brand-new session reopen the build another session started,
 * and nobody could start a second site alongside it (measured 15/09). No session id keeps the old key.
 * @param {string} [sessionId] The dsh session the side card is showing.
 * @returns {string}
 */
const keyFor = (sessionId) => (sessionId ? `${PENDING_KEY}:${sessionId}` : PENDING_KEY)

/**
 * The slot a build moves to when the wizard is left for the next site ("Add another site"): no
 * conversation shows it any more, only the background poll asks after it, and clears it once settled.
 * @param {string} jobId
 * @returns {string} A value for the `sessionId` parameter of this file's functions.
 */
export const backgroundKey = (jobId) => `bg:${jobId}`

/**
 * The unfinished run, or `null`.
 *
 * A pointer with a missing field or wrong type reads as `null`: half a pointer cannot ask anything, and
 * `jobId: 12345` coerced to a string and sent is sending a made-up question. This is data outside our
 * control — any code on the same origin can write to this key.
 *
 * `forkUrl` is optional: only the fork branch writes it. A pointer written before the fork branch
 * existed (or by the create branch) reads back without it, and the caller treats missing as no fork.
 * @param {Storage|null} store The store; `null` when the browser does not allow it.
 * @param {string} [sessionId] The conversation the pointer belongs to (`keyFor`).
 * @returns {{siteKey: string, jobId: string, platform: string, forkUrl?: string, seen?: string}|null} The pointer, or null.
 */
export function readPending(store, sessionId) {
  if (!store) return null
  let raw
  try {
    raw = store.getItem(keyFor(sessionId))
  } catch {
    return null
  }
  if (!raw) return null
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { siteKey, jobId, platform, forkUrl, seen } = /** @type {Record<string,unknown>} */ (parsed)
  if (typeof siteKey !== 'string' || typeof jobId !== 'string' || typeof platform !== 'string') return null
  if (!siteKey || !jobId || !platform) return null
  /** @type {{siteKey: string, jobId: string, platform: string, forkUrl?: string, seen?: string}} */
  const result = { siteKey, jobId, platform }
  // forkUrl is optional; only include it when present and a non-empty string.
  if (typeof forkUrl === 'string' && forkUrl) result.forkUrl = forkUrl
  if (typeof seen === 'string' && seen) result.seen = seen
  return result
}

/**
 * Record the unfinished run.
 * @param {Storage|null} store The store.
 * @param {{siteKey: string, jobId: string, platform: string, forkUrl?: string, seen?: string}} pending The pointer.
 * @param {string} [sessionId] The conversation the pointer belongs to (`keyFor`).
 * @returns {void}
 */
export function writePending(store, pending, sessionId) {
  if (!store) return
  try {
    store.setItem(keyFor(sessionId), JSON.stringify(pending))
  } catch {
    /* failing to write only means this run cannot be reopened — not a reason to fail */
  }
}

/**
 * Forget the unfinished run. Called when it finishes, fails, or the person starts over.
 * @param {Storage|null} store The store.
 * @param {string} [sessionId] The conversation the pointer belongs to (`keyFor`).
 * @returns {void}
 */
export function clearPending(store, sessionId) {
  if (!store) return
  try {
    store.removeItem(keyFor(sessionId))
  } catch {
    /* if removal slips, the next open asks about a finished job again, and the server answers `done` — harmless */
  }
}

/**
 * The pending build of one site, whichever conversation (or background slot) holds it — what a
 * site's own workspace shows while that site is still being created.
 * @param {Storage|null} store The store.
 * @param {string|null} siteKey The site the page is open on.
 * @returns {{siteKey: string, jobId: string, platform: string, forkUrl?: string, seen?: string}|null}
 */
export function pendingForSite(store, siteKey) {
  if (!siteKey) return null
  return allPending(store).find((pending) => pending.siteKey === siteKey) ?? null
}

/**
 * The builds a mounted wizard is showing right now. The background poll leaves those to the wizard:
 * it still has the agent to wait for, and a pointer cleared under it is a refresh that forgets the
 * screen the person is looking at.
 * @type {Set<string>}
 */
export const onScreen = new Set()

/**
 * Keep the milestones a build has passed with its pointer, under every key that points at it.
 *
 * AN EXCEPTION TO "A POINTER, NOT CONTENT" ABOVE (15/09/2026): the job row carries only the step
 * the fleet stands on NOW, so the steps already passed exist nowhere but on this screen, and a
 * refresh wiped them — the console came back with one line. They are history, not a copy of a
 * moving truth: a step that has happened does not un-happen.
 * @param {Storage|null} store The store.
 * @param {string} jobId The build.
 * @param {string} seen The milestones, newline-joined (`wizard.tsx`).
 * @returns {void}
 */
export function rememberSeen(store, jobId, seen) {
  forEachPointer(store, (key, pending) => {
    if (pending.jobId === jobId) store?.setItem(key, JSON.stringify({ ...pending, seen }))
  })
}

/**
 * Visit every pointer this browser holds, with its storage key.
 * @param {Storage|null} store The store.
 * @param {(key: string, pending: NonNullable<ReturnType<typeof readPending>>) => void} visit
 * @returns {void}
 */
function forEachPointer(store, visit) {
  if (!store) return
  try {
    const keys = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key !== null && (key === PENDING_KEY || key.startsWith(`${PENDING_KEY}:`))) keys.push(key)
    }
    for (const key of keys) {
      const pending = readPending(store, key === PENDING_KEY ? undefined : key.slice(PENDING_KEY.length + 1))
      if (pending) visit(key, pending)
    }
  } catch {
    /* storage refused mid-walk: the pointers stay as they were, which only costs a stale screen */
  }
}

/**
 * Forget a build under EVERY key that points at it. A build is shown from more than one place (the
 * conversation that started it, its background slot, the new site's own workspace), and a pointer
 * left under one of them reopens a finished build there — in the site's workspace that is a reload
 * that never ends.
 * @param {Storage|null} store The store.
 * @param {string} jobId The build that settled.
 * @returns {void}
 */
export function clearJob(store, jobId) {
  forEachPointer(store, (key, pending) => {
    if (pending.jobId === jobId) store?.removeItem(key)
  })
}

/**
 * Every pending build this browser holds, across all conversations — for the background poll in
 * `index.tsx`. The job door finishes a site's handover only when somebody polls it, so a build whose
 * conversation is not on screen used to stand still (measured 15/09: two sites started 14 s apart;
 * each advanced only while its own tab was open).
 * @param {Storage|null} store The store.
 * @returns {{siteKey: string, jobId: string, platform: string, forkUrl?: string, seen?: string}[]}
 */
export function allPending(store) {
  if (!store) return []
  const out = []
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key === PENDING_KEY || key?.startsWith(`${PENDING_KEY}:`)) {
        const pending = readPending(
          store,
          key === PENDING_KEY ? undefined : key.slice(PENDING_KEY.length + 1)
        )
        // A finished build has nothing left to hand over.
        if (pending) out.push(pending)
      }
    }
  } catch {
    return out
  }
  return out
}
