/**
 * The spare window: one hidden second window, prepared ahead of time, so a Cmd+click shows a painted
 * window at once instead of a blank one that fills in (tasks/todo-desktop-multi-window.md; Cherry
 * Studio does the same). The spare shows a neutral local waiting page and runs NO Tracy page until it
 * is used: a hidden window still counts as visible to its page, so a preloaded product page would
 * already say hello, take presence and touch site history.
 *
 * THE RULES (council 09/10, point 8):
 *   - `take()` is synchronous: the caller has the spare before its first `await`, so two Cmd+clicks
 *     can never both get it. Nothing ready → undefined, and the caller opens a plain window.
 *   - At most one spare exists or is being prepared; the next one is prepared after the current turn
 *     (`schedule`), never inside the click that used the last one.
 *   - Only when `canPrepare()` (signed in, not quitting). `discard()` (sign-out, every product window
 *     closed) drops the spare and the scheduled refill; `dispose()` (quit) does that for good.
 *   - A spare is not a window the person has: `holds()` lets the caller leave it out of every count
 *     (Dock reopen, "no windows left").
 *
 * Pure: the window maker and the scheduler are passed in (test/window-pool.test.mjs).
 */

/**
 * @template W
 * @typedef {{ isDestroyed(): boolean, destroy(): void, once(event: 'closed', fn: () => void): unknown }} SpareLike
 */

/**
 * @template {SpareLike} W
 * @param {{
 *   create: () => { window: W, ready: Promise<unknown> },
 *   canPrepare: () => boolean,
 *   schedule?: (fn: () => void) => () => void,
 * }} options - `create` makes a hidden window and says when its waiting page has painted.
 */
function createWindowPool({ create, canPrepare, schedule = defaultSchedule }) {
  /** @type {W | undefined} */
  let spare
  let ready = false
  /** @type {(() => void) | undefined} */
  let refill
  let disposed = false

  const drop = () => {
    const window = spare
    spare = undefined
    ready = false
    if (window !== undefined && !window.isDestroyed()) window.destroy()
  }

  const prepare = () => {
    if (disposed || spare !== undefined || !canPrepare()) return
    const made = create()
    const window = made.window
    spare = window
    ready = false
    window.once('closed', () => {
      if (spare === window) {
        spare = undefined
        ready = false
      }
    })
    made.ready.then(
      () => {
        if (spare === window && !window.isDestroyed()) ready = true
      },
      () => {
        if (spare === window) drop()
        else if (!window.isDestroyed()) window.destroy()
      }
    )
  }

  const scheduleRefill = () => {
    if (disposed || refill !== undefined) return
    refill = schedule(() => {
      refill = undefined
      prepare()
    })
  }

  return {
    prepare,
    /** @returns {W | undefined} the painted spare, now the caller's; or nothing ready. */
    take() {
      const window = ready && spare !== undefined && !spare.isDestroyed() ? spare : undefined
      if (window !== undefined) {
        spare = undefined
        ready = false
      }
      scheduleRefill()
      return window
    },
    /** @param {unknown} window @returns {boolean} whether `window` is the spare (made, not yet taken). */
    holds(window) {
      return window !== undefined && window === spare
    },
    /** Drop the spare and any scheduled refill (sign-out, no product window left). */
    discard() {
      refill?.()
      refill = undefined
      drop()
    },
    /** For good (quit). */
    dispose() {
      disposed = true
      refill?.()
      refill = undefined
      drop()
    }
  }
}

/** @param {() => void} fn */
function defaultSchedule(fn) {
  const handle = setImmediate(fn)
  return () => clearImmediate(handle)
}

module.exports = { createWindowPool }
