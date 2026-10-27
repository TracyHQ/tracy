/**
 * Ask again every few seconds while something is moving and the page is in sight. One question at a
 * time: the next waits for the answer of the last.
 */
import { useEffect, useRef } from 'react'

export const POLL_MS = 3000
/** Social stats take 10–20 s per page and the door allows 60 calls an hour per account. */
export const SOCIAL_POLL_MS = 10_000

/** Refusals that asking again in a few seconds cannot change: the poll stops instead of retrying. */
const REFUSALS = new Set(['RATE_LIMITED', 'FEATURE_OFF', 'CHECKS_UNAVAILABLE', 'SOCIAL_STATS_UNAVAILABLE'])

export function pollRefused(code: string): boolean {
  return REFUSALS.has(code)
}

export interface PollTimers {
  set(fn: () => void, ms: number): number
  clear(id: number): void
  isHidden(): boolean
}

const browserTimers: PollTimers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
  isHidden: () => document.visibilityState === 'hidden'
}

/**
 * Run `read` every `everyMs` until the returned stop is called. `leading` reads at once instead of
 * after the first period, for a poll whose first call is what starts the work (site checks).
 */
export function startPoll(
  read: () => Promise<unknown>,
  everyMs: number,
  { leading = false, timers = browserTimers }: { leading?: boolean; timers?: PollTimers } = {}
): () => void {
  let stopped = false
  let timer: number | undefined
  const tick = async (): Promise<void> => {
    if (stopped) return
    if (!timers.isHidden()) {
      try {
        await read()
      } catch {
        // A failed read is shown by the view that owns it; the poll just tries again.
      }
    }
    if (!stopped) timer = timers.set(() => void tick(), everyMs)
  }
  if (leading) void tick()
  else timer = timers.set(() => void tick(), everyMs)
  return () => {
    stopped = true
    if (timer !== undefined) timers.clear(timer)
  }
}

export function usePoll(
  read: () => Promise<unknown>,
  active: boolean,
  everyMs = POLL_MS,
  { leading = false }: { leading?: boolean } = {}
): void {
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    if (!active) return
    return startPoll(() => readRef.current(), everyMs, { leading })
  }, [active, everyMs, leading])
}

/** Calls `fn` when the window regains focus or the page becomes visible again; returns the stop. */
export function onBackInSight(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const visible = (): void => {
    if (document.visibilityState === 'visible') fn()
  }
  window.addEventListener('focus', fn)
  document.addEventListener('visibilitychange', visible)
  return () => {
    window.removeEventListener('focus', fn)
    document.removeEventListener('visibilitychange', visible)
  }
}
