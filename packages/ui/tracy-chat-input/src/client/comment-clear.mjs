/**
 * Delete all · Undo (Brian 29/09 ~18:00; stage 6 rule 12, Brian 21:10: Delete all — "Clear all" until
 * 22:45 — soft-deletes EVERY comment of the page shown, open and resolved since 23:20, everyone's —
 * "people who work must be careful"). It is a DELAYED commit held here, in the chat column, which
 * owns the one clock:
 *   start()   the comments on screen leave every count at once (`lists.hide`), the Browser tab is
 *             told to take the same ids off its pins and "Comments N" (`tracy:comment-act` `hide`,
 *             round 5 TH-7), and the head row reads "Deleted N comments · Undo (10)", counting the
 *             {@link CLEAR_UNDO_MS} down, a second a tick (Brian 23:20). The rows themselves stay where
 *             they stood, dimmed and inert, until the window ends (UI fine-tune round 2, rule 6): the
 *             view draws them from {@link held}, the model taken at the press;
 *   undo()    they come back (`lists.show`, and `show` to the Browser tab); nothing ever reached the
 *             server;
 *   commit()  the time is up, or the page hides or unloads first ({@link commitClearOnLeave}): the
 *             Browser tab gets `tracy:comment-act` `clear` naming the ids it hid (never "all": a
 *             comment made during the window stays), and the fork writes the clear with `keepalive`.
 *             The door takes every named thread it can and lists the ones already gone (e2e v7
 *             INTH-1), so an answer is success. A refusal comes back as `tracy:comment-act-failed`
 *             `clear`: the rows come back at once ({@link failed}) and the view says "Could not delete.
 *             Try again." under the head row for {@link CLEAR_FAILED_MS} — never silent.
 * Why not a server-side undo (`POST /clear/undo`): the rows never leave the server during the window,
 * so Undo needs no door, no time limit and no audit of a restore; the one risk of waiting, a poll
 * listing them again, is closed by the lists hiding what is pending (`createCommentLists`).
 */
import { clearAct, viewModel } from './comment-view.mjs'

/**
 * How long "Deleted N comments · Undo (10)" stays, and the clear waits (Brian 29/09: a few seconds; 10 s
 * since UI fine-tune round 2, rule 6, 30/09 — it was 6 s). The one constant for this window.
 */
export const CLEAR_UNDO_MS = 10_000

/**
 * @typedef {{ tabId: string, sessionId: string, kind: 'clear' | 'hide' | 'show', ids: string[] }} ClearAct
 * @typedef {{ set(fn: () => void, ms: number): unknown, clear(handle: unknown): void }} Timers
 */

/**
 * The clears Delete all would send now: what the tab shows (UI fine-tune 30/09) — the filter's open
 * comments of the chosen status, all authors ({@link clearAct}).
 * @param {import('./comment-view.mjs').ListsSnapshot} snapshot
 * @param {{ filter?: import('./comment-view.mjs').PageFilter, status?: import('./comment-view.mjs').StatusFilter }} [view]
 * @returns {ClearAct[]}
 */
export function clearAllActs(snapshot, view) {
  const act = clearAct(snapshot, view)
  return act === null ? [] : [act]
}

/** One tick of the countdown. */
const TICK_MS = 1000

/** How long "Could not delete. Try again." stays after a refused Delete all (e2e v7 INTH-1). */
export const CLEAR_FAILED_MS = 8000

/** The Browser tab's word that an act was not kept (`comment-view.mjs` `ACT_FAILED_EVENT`). */
const ACT_FAILED_EVENT = 'tracy:comment-act-failed'

/**
 * @param {{ lists: ReturnType<typeof import('./comment-view.mjs').createCommentLists>,
 *   act: (detail: ClearAct) => void, timers?: Timers, delayMs?: number,
 *   target?: EventTarget | null }} input — `target` is where the Browser tab's `tracy:comment-act-failed`
 *   is heard (`window` on the page; none keeps no failure line).
 */
export function createPendingClear(input) {
  const timers = input.timers ?? {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(/** @type {any} */ (handle))
  }
  /** @type {{ acts: ClearAct[], ids: string[], count: number, left: number, timer: unknown,
   *   held: ReturnType<typeof viewModel> } | null} */
  let pending = null
  /** @type {{ count: number, left: number } | null} */
  let shown = null
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const set = (/** @type {{ count: number, left: number } | null} */ next) => {
    shown = next
    for (const fn of listeners) fn()
  }
  /** The ids of the clears sent from here and not yet answered for: a refusal is ours only for these. */
  /** @type {Set<string>} */
  const sent = new Set()
  /** The failure line: its timer while it shows, else null. */
  /** @type {{ timer: unknown } | null} */
  let failure = null
  const unfail = () => {
    if (failure === null) return
    timers.clear(failure.timer)
    failure = null
    for (const fn of listeners) fn()
  }
  /** @param {unknown} detail */
  const onActFailed = (detail) => {
    const d = /** @type {{ kind?: unknown, ids?: unknown }} */ (detail ?? {})
    if (d.kind !== 'clear' || !Array.isArray(d.ids)) return
    const ids = d.ids.filter((id) => typeof id === 'string' && sent.has(id))
    if (ids.length === 0) return
    for (const id of ids) sent.delete(id)
    // Back at once, whatever the tab lists next (it lists them live again once it has reloaded).
    input.lists.show(ids)
    if (failure !== null) timers.clear(failure.timer)
    failure = { timer: timers.set(unfail, CLEAR_FAILED_MS) }
    for (const fn of listeners) fn()
  }
  input.target?.addEventListener(ACT_FAILED_EVENT, (e) => onActFailed(/** @type {CustomEvent} */ (e).detail))
  /** A second gone: the number on Undo goes down; at 0 the clear goes. */
  const tick = () => {
    const p = pending
    if (p === null) return
    p.left -= 1
    if (p.left <= 0) {
      commit()
      return
    }
    p.timer = timers.set(tick, TICK_MS)
    set({ count: p.count, left: p.left })
  }
  const commit = () => {
    const p = pending
    if (p === null) return
    pending = null
    timers.clear(p.timer)
    for (const a of p.acts) input.act(a)
    for (const id of p.ids) sent.add(id)
    input.lists.settle(p.ids)
    set(null)
  }
  return {
    /**
     * Delete all: hide what the tab shows now and start the window; returns how many.
     * @param {{ filter?: import('./comment-view.mjs').PageFilter, status?: import('./comment-view.mjs').StatusFilter }} [view]
     */
    start(view) {
      commit()
      unfail()
      const snapshot = input.lists.getSnapshot()
      const acts = clearAllActs(snapshot, view)
      const ids = [...new Set(acts.flatMap((a) => a.ids))]
      if (ids.length === 0) return 0
      const left = Math.max(1, Math.round((input.delayMs ?? CLEAR_UNDO_MS) / TICK_MS))
      const held = viewModel(snapshot, view)
      pending = { acts, ids, count: ids.length, left, timer: timers.set(tick, TICK_MS), held }
      input.lists.hide(ids)
      for (const a of acts) input.act({ ...a, kind: 'hide' })
      set({ count: ids.length, left })
      return ids.length
    },
    /** Undo: the comments come back; no clear is sent. */
    undo() {
      const p = pending
      if (p === null) return
      pending = null
      timers.clear(p.timer)
      input.lists.show(p.ids)
      for (const a of p.acts) input.act({ ...a, kind: 'show' })
      set(null)
    },
    /** Send the clear now (the window ended, or the page is going away). */
    commit,
    /** The notice to show: how many were deleted and the seconds left, or null. */
    get: () => shown,
    /** A Delete all the door refused (e2e v7 INTH-1): "Could not delete. Try again." shows while true. */
    failed: () => failure !== null,
    /**
     * The tab as it stood at the press, while the window runs (rule 6): its rows stay drawn, frozen, in
     * their places; null otherwise.
     * @returns {ReturnType<typeof viewModel> | null}
     */
    held: () => pending?.held ?? null,
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
  }
}

/** How long "Resolved. Undo" stands in place of a comment resolved while Resolved is hidden (U33). */
export const RESOLVE_UNDO_MS = 5000

/**
 * @typedef {{ tabId: string, sessionId: string, kind: 'resolve', ids: string[] }} ResolveAct
 */

/**
 * Resolve · Undo (UI fine-tune 30/09, rule 4, U33): a Resolve pressed while the Resolved group is hidden
 * would make the comment vanish from sight, so it is a DELAYED commit like Delete all's: the row folds
 * into one line "Resolved. Undo" in its place for {@link RESOLVE_UNDO_MS}; Undo puts the row back and
 * nothing is sent (the door has no reopen to undo with); the time up — or the page hiding or unloading
 * first ({@link commitClearOnLeave}) — sends the resolve to the Browser tab. Several may wait at once.
 * @param {{ act: (detail: ResolveAct) => void, timers?: Timers, delayMs?: number }} input
 */
export function createPendingResolve(input) {
  const timers = input.timers ?? {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(/** @type {any} */ (handle))
  }
  /** @type {Map<string, { detail: ResolveAct, timer: unknown }>} */
  const waiting = new Map()
  /** @type {ReadonlySet<string>} */
  let ids = new Set()
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const changed = () => {
    ids = new Set(waiting.keys())
    for (const fn of listeners) fn()
  }
  /** @param {string} id */
  const send = (id) => {
    const w = waiting.get(id)
    if (w === undefined) return
    waiting.delete(id)
    timers.clear(w.timer)
    input.act(w.detail)
  }
  return {
    /** @param {ResolveAct} detail - one comment's resolve, as the row would send it. */
    start(detail) {
      const id = detail.ids[0]
      if (id === undefined || waiting.has(id)) return
      const timer = timers.set(() => {
        send(id)
        changed()
      }, input.delayMs ?? RESOLVE_UNDO_MS)
      waiting.set(id, { detail, timer })
      changed()
    },
    /** @param {string} id - Undo: the row comes back; nothing is sent. */
    undo(id) {
      const w = waiting.get(id)
      if (w === undefined) return
      waiting.delete(id)
      timers.clear(w.timer)
      changed()
    },
    /** Send every resolve waiting now (the page is going away). */
    commit() {
      if (waiting.size === 0) return
      for (const id of waiting.keys()) send(id)
      changed()
    },
    /** The comments whose "Resolved. Undo" line stands now. */
    get: () => ids,
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
  }
}

/**
 * Send a waiting clear when the page hides (`visibilitychange` → hidden: a tab switched away may be
 * discarded) or unloads (`pagehide`), so a clear the person did not undo is never lost.
 * @param {{ commit(): void }} clearing
 * @param {EventTarget} [target] - `window`
 * @param {{ visibilityState: string }} [doc] - `document`
 * @returns {() => void}
 */
export function commitClearOnLeave(clearing, target = window, doc = document) {
  const onHide = () => clearing.commit()
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') clearing.commit()
  }
  target.addEventListener('pagehide', onHide)
  target.addEventListener('visibilitychange', onVisibility)
  return () => {
    target.removeEventListener('pagehide', onHide)
    target.removeEventListener('visibilitychange', onVisibility)
  }
}
