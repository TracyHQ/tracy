/**
 * Help › Find Website Opportunities… (tasks/spec-website-opportunities-contracts.md §6): whether the
 * item shows, from the operator's switch `website-opportunities` on Tracy's `GET /api/ui`.
 *
 * Shows only with a product window, signed in, and the latest read for THAT window's origin answered
 * with the switch not hidden. No answer, a failed read, sign-out, no window: hidden. Read on focus,
 * every 30 s while a window exists, and again before a click acts. Pure: Electron, the read and the
 * clock come in as functions (test/website-opportunities-menu.test.mjs).
 */

const SWITCH_ID = 'website-opportunities'
const INTERVAL_MS = 30_000

/**
 * The hidden ids of an `/api/ui` answer, or null when it is not one.
 * @param {unknown} body
 * @returns {string[] | null}
 */
function hiddenFromAnswer(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const { hidden } = /** @type {{ hidden?: unknown }} */ (body)
  if (!Array.isArray(hidden)) return null
  return hidden.filter((id) => typeof id === 'string')
}

/**
 * @param {object} deps
 * @param {() => string | undefined} deps.currentOrigin - the origin the product window in use shows
 *   (only when it is the app's pinned origin); undefined with no such window.
 * @param {() => boolean} [deps.hasWindows] - any product window open, loaded or not (keeps the timer).
 * @param {() => boolean} deps.signedIn
 * @param {(origin: string) => Promise<string[] | null>} deps.readHidden - `/api/ui` at that origin
 *   with the app's cookies; null when there was no readable answer.
 * @param {() => void} deps.onChange - rebuild the menu.
 * @param {() => void} deps.open - act on a click.
 * @param {typeof setInterval} [deps.setInterval]
 * @param {typeof clearInterval} [deps.clearInterval]
 * @param {(line: string) => void} [deps.log]
 */
function createWebsiteOpportunitiesMenu({
  currentOrigin,
  hasWindows = () => currentOrigin() !== undefined,
  signedIn,
  readHidden,
  onChange,
  open,
  setInterval: every = setInterval,
  clearInterval: stop = clearInterval,
  log = () => {}
}) {
  /** The latest applied read: which origin it was for and whether the switch was on there. */
  /** @type {{ origin: string, on: boolean } | null} */
  let known = null
  /** Bumped by every read and every reset: only the newest read may apply. */
  let generation = 0
  let shown = false
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer

  const visible = () => {
    const origin = currentOrigin()
    return known !== null && known.on && origin !== undefined && known.origin === origin && signedIn()
  }

  const settle = () => {
    const now = visible()
    if (now === shown) return
    shown = now
    log(`website opportunities: menu item ${now ? 'shown' : 'hidden'}`)
    onChange()
  }

  const stopTimer = () => {
    if (timer === undefined) return
    stop(timer)
    timer = undefined
  }

  const reset = () => {
    generation++
    known = null
    settle()
  }

  const refresh = async () => {
    const origin = currentOrigin()
    if (origin === undefined || !signedIn()) {
      reset()
      return false
    }
    const mine = ++generation
    let hidden = null
    try {
      hidden = await readHidden(origin)
    } catch {
      hidden = null
    }
    // A newer read, a reset, or a window now on another origin: this answer is not for it.
    if (mine === generation && currentOrigin() === origin)
      known = { origin, on: hidden !== null && !hidden.includes(SWITCH_ID) }
    settle()
    return visible()
  }

  return {
    visible,
    refresh,
    reset,
    /** A product window opened or closed: one timer while any exists, none (and hidden) otherwise. */
    windowsChanged() {
      if (!hasWindows()) {
        stopTimer()
        reset()
        return
      }
      timer ??= every(async () => {
        if (!hasWindows()) {
          stopTimer()
          reset()
          return
        }
        await refresh()
      }, INTERVAL_MS)
    },
    /** The item was pressed: read again, act only if the switch is still on. */
    async click() {
      if (await refresh()) open()
      else log('website opportunities: pressed, but the switch is off now; nothing opened')
    },
    dispose() {
      stopTimer()
      generation++
    }
  }
}

module.exports = { SWITCH_ID, createWebsiteOpportunitiesMenu, hiddenFromAnswer }
