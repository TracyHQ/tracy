/**
 * Ask the server for the unread count every 30 seconds, only while the page is in sight (spec #809:
 * cheaper than a live socket at today's scale, and the log does not change if that is swapped later).
 *
 *   - visible at start → ask now, then every `intervalMs`;
 *   - hidden → no timer at all (a tab in the background costs the server nothing);
 *   - visible again → ask at once, then resume the rhythm;
 *   - `poke()` → ask now (after a press that changed the count), without stacking a second timer;
 *   - one question at a time: a poke while one is in flight waits for it instead of racing it.
 *
 * Pure: the document, the timer and the question are handed in, so `test/poller.test.mjs` drives
 * every rule with fakes.
 */

export const POLL_MS = 30_000

export interface PollerDeps {
  /** One read of `/api/notifications/unread`; null when there was no readable answer. */
  read: () => Promise<number | null>
  /** Called with every count read. */
  onCount: (count: number) => void
  doc: {
    readonly visibilityState: string
    addEventListener: (type: 'visibilitychange', listener: () => void) => void
    removeEventListener: (type: 'visibilitychange', listener: () => void) => void
  }
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  intervalMs?: number
}

export interface Poller {
  /** Ask now (when visible). */
  poke: () => void
  stop: () => void
}

export function startUnreadPoller(deps: PollerDeps): Poller {
  const interval = deps.intervalMs ?? POLL_MS
  let timer: unknown = null
  let inFlight = false
  let again = false
  let stopped = false

  const visible = (): boolean => deps.doc.visibilityState === 'visible'
  const clear = (): void => {
    if (timer !== null) deps.clearTimer(timer)
    timer = null
  }
  const schedule = (): void => {
    clear()
    if (stopped || !visible()) return
    timer = deps.setTimer(() => {
      timer = null
      ask()
    }, interval)
  }
  const ask = (): void => {
    if (stopped || !visible()) return
    if (inFlight) {
      again = true
      return
    }
    inFlight = true
    clear()
    void deps
      .read()
      .then(
        (count) => {
          if (!stopped && count !== null) deps.onCount(count)
        },
        () => undefined
      )
      .finally(() => {
        inFlight = false
        if (again) {
          again = false
          ask()
          return
        }
        schedule()
      })
  }
  const onVisibility = (): void => {
    if (visible()) ask()
    else clear()
  }

  deps.doc.addEventListener('visibilitychange', onVisibility)
  ask()

  return {
    poke: ask,
    stop: () => {
      stopped = true
      clear()
      deps.doc.removeEventListener('visibilitychange', onVisibility)
    }
  }
}
