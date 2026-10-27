/**
 * The page's one unread count, shared by the left-column row and the Inbox tab.
 *
 * Module state on purpose: both are mounted by dsh at different places in its tree, so a prop
 * cannot join them. One poller writes it (`index.tsx`); the two components read it through
 * `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react'

let count = 0
const listeners = new Set<() => void>()
/** Ask the server again now: set by `index.tsx` once the poller runs. */
let pokeFn: () => void = () => undefined

export const unread = {
  get: (): number => count,
  set(next: number): void {
    if (!Number.isFinite(next) || next === count) return
    count = Math.max(0, next)
    for (const listener of listeners) listener()
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  poke: (): void => pokeFn(),
  setPoke(fn: () => void): void {
    pokeFn = fn
  }
}

export function useUnread(): number {
  return useSyncExternalStore(unread.subscribe, unread.get)
}
