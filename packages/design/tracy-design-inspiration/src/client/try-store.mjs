/**
 * The current try, held by the plugin module rather than by the Design system tab (13/10/2026). After Try
 * on your site the host brings the Browser tab in front, and on dsh's right column that UNMOUNTS the
 * Design system tab (one page per pane; measured on dev: `[data-try-bar]` gone right after Try while the
 * apply had gone through and the Browser tab was in front). What the bar on the page speaks for must
 * therefore outlive the tab: this store, read by the tab's `useTryOn` and by the plugin's bar host
 * (`try-bar-host.tsx`) alike. One try at a time, for one site.
 */
import { announceDesignSystemChanged } from '@tracy/core/turn-undo'

import { undoDesignSystem } from './design-system-door.mjs'

/** @typedef {import('./design-system-library.mjs').Trial} Trial */
/**
 * @typedef {object} TryState
 * @property {string} siteKey the site the try is on
 * @property {Trial} trial the system on the site from the try, and the look from before it
 * @property {boolean} canUndo this seat may press the undo door (the tab's read said so at the apply)
 * @property {boolean} undoing the bar's Undo is at the door
 */

/** @type {TryState | null} */
let current = null
/** @type {Set<() => void>} */
const listeners = new Set()

/** The try up now, or null. Stable between changes (a `useSyncExternalStore` snapshot). */
export function tryState() {
  return current
}

/** @param {TryState | null} next */
export function setTry(next) {
  current = next
  for (const listener of listeners) listener()
}

/** Forget the try: Keep, an undo, a change at another door, the plugin's tests. */
export function clearTry() {
  setTry(null)
}

/**
 * Hear every change. Returns the way to stop hearing.
 * @param {() => void} listener
 */
export function onTry(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Undo the try at the undo door, from the bar: the site goes back to the look from before the first try,
 * the try is forgotten, and the change is said on the page (`tracy:design-system-changed`) so the tab, if it
 * is mounted, and the start screen's Design system card read the site again. A refusal leaves the try up
 * (the bar stays, Undo can be pressed again). Null when there is no try, or it is already at the door.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Awaited<ReturnType<typeof undoDesignSystem>> | null>}
 */
export async function undoTry(fetchImpl) {
  const at = current
  if (!at || at.undoing || !at.trial.applyId) return null
  setTry({ ...at, undoing: true })
  const r = await undoDesignSystem(at.siteKey, at.trial.applyId, fetchImpl)
  // Only this try is settled: a new one that replaced it meanwhile is left alone.
  if (current?.trial === at.trial) setTry(r.ok ? null : { ...at, undoing: false })
  if (r.ok) announceDesignSystemChanged({ siteKey: at.siteKey, applyId: at.trial.applyId, undone: true })
  return r
}
