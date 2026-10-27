/**
 * The Browser toolbar's Undo button, its state side (TCH #957, `tasks/undo-change/toolbar-contract.md`).
 *
 * Tracy (tracy-chat-input) owns the undo engine and says, on `tracy:undo-toolbar-state`, what the button
 * of each conversation shows — with every word already translated, so this fork adds no locale key and
 * reads the same words as the chat's undo card. The fork only draws; a press goes back on
 * `tracy:undo-toolbar-press`.
 *
 * The store listens on the window from module load: a state Tracy publishes before a Browser tab mounts
 * (the chat column loads first) is kept, and the tab starts from it. Latest wins per session; a session
 * nobody spoke for has no state, and no state draws no button.
 */
import { useCallback, useSyncExternalStore } from 'react'
import { UNDO_TOOLBAR_PRESS_EVENT, UNDO_TOOLBAR_STATE_EVENT } from './comment-store.ts'

export const UNDO_TOOLBAR_STATES = ['ready', 'off', 'blocked', 'working', 'hidden'] as const
export type UndoToolbarState = (typeof UNDO_TOOLBAR_STATES)[number]

/** The words of the button and its cards, as Tracy sends them (already in the interface language). */
export interface UndoToolbarText {
  label: string
  tooltip: string
  confirmTitle?: string
  confirmQuote?: string
  confirmBody?: string
  confirmUndo?: string
  cancel?: string
  blockedTitle?: string
  blockedBody?: string
  blockedAction?: string
  working?: string
  toastDone?: string
  toastAction?: string
}

export interface UndoToolbarDetail {
  sessionId: string
  siteKey: string
  state: UndoToolbarState
  text: UndoToolbarText
  toast: 'done' | 'partial' | null
}

export type UndoToolbarAction = 'confirm' | 'open-changes'

const OPTIONAL_TEXT = ['confirmTitle', 'confirmQuote', 'confirmBody', 'confirmUndo', 'cancel', 'blockedTitle', 'blockedBody', 'blockedAction', 'working', 'toastDone', 'toastAction'] as const

/**
 * A well-formed `tracy:undo-toolbar-state` detail, or null. `label` and `tooltip` are required (a
 * button with no name is not drawn); an optional word that is not a string is dropped.
 */
export function readUndoToolbarState(detail: unknown): UndoToolbarDetail | null {
  if (detail === null || typeof detail !== 'object') return null
  const d = detail as Record<string, unknown>
  if (typeof d.sessionId !== 'string' || d.sessionId === '') return null
  if (!(UNDO_TOOLBAR_STATES as readonly unknown[]).includes(d.state)) return null
  const said = d.text
  if (said === null || typeof said !== 'object') return null
  const words = said as Record<string, unknown>
  if (typeof words.label !== 'string' || typeof words.tooltip !== 'string') return null
  const text: UndoToolbarText = { label: words.label, tooltip: words.tooltip }
  for (const key of OPTIONAL_TEXT) {
    const value = words[key]
    if (typeof value === 'string' && value !== '') text[key] = value
  }
  const toast = d.toast === 'done' || d.toast === 'partial' ? d.toast : null
  return { sessionId: d.sessionId, siteKey: typeof d.siteKey === 'string' ? d.siteKey : '', state: d.state as UndoToolbarState, text, toast }
}

export interface UndoToolbarStore {
  /** The latest state for the session; null when none was ever said. */
  get(sessionId: string): UndoToolbarDetail | null
  subscribe(listener: () => void): () => void
  /** Stop listening on the target (tests). */
  dispose(): void
}

/**
 * A store of the latest state per session, fed by `tracy:undo-toolbar-state` on `target`.
 * @param target - where Tracy publishes (the window).
 */
export function createUndoToolbarStore(target: EventTarget): UndoToolbarStore {
  const latest = new Map<string, UndoToolbarDetail>()
  const listeners = new Set<() => void>()
  /** One read per detail object Tracy sent: the same object again is the same state (its toast shown once). */
  const reads = new WeakMap<object, UndoToolbarDetail>()
  const onState = (event: Event): void => {
    const raw: unknown = (event as CustomEvent).detail
    const known = raw !== null && typeof raw === 'object' ? reads.get(raw) : undefined
    const detail = known ?? readUndoToolbarState(raw)
    if (detail === null) return
    if (known === undefined) reads.set(raw as object, detail)
    latest.set(detail.sessionId, detail)
    for (const listener of [...listeners]) listener()
  }
  target.addEventListener(UNDO_TOOLBAR_STATE_EVENT, onState)
  return {
    get: sessionId => latest.get(sessionId) ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      target.removeEventListener(UNDO_TOOLBAR_STATE_EVENT, onState)
      listeners.clear()
      latest.clear()
    },
  }
}

/** The page's store, listening from module load (see the file header). */
const pageStore: UndoToolbarStore | null = typeof window === 'undefined' ? null : createUndoToolbarStore(window)

const NO_SUBSCRIPTION = (): (() => void) => () => {}

/**
 * What the toolbar draws for `sessionId`: the latest state, or null — nothing said for the session,
 * or `hidden` (both draw no button).
 * @param store - the page's store unless a test passes its own.
 */
export function useUndoToolbarState(sessionId: string, store: UndoToolbarStore | null = pageStore): UndoToolbarDetail | null {
  const subscribe = store === null ? NO_SUBSCRIPTION : store.subscribe
  const read = useCallback(() => (store === null || sessionId === '' ? null : store.get(sessionId)), [store, sessionId])
  const detail = useSyncExternalStore(subscribe, read, read)
  return shownUndoState(detail)
}

/** The state the button draws: none for no state and for `hidden`. */
export function shownUndoState(detail: UndoToolbarDetail | null): UndoToolbarDetail | null {
  return detail === null || detail.state === 'hidden' ? null : detail
}

/**
 * Tell Tracy the person pressed: `confirm` (the confirm card's Undo) or `open-changes` (the blocked
 * card's action, or the toast's).
 * @param target - where Tracy listens (the window).
 */
export function pressUndoToolbar(sessionId: string, action: UndoToolbarAction, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent(UNDO_TOOLBAR_PRESS_EVENT, { detail: { sessionId, action } }))
}
