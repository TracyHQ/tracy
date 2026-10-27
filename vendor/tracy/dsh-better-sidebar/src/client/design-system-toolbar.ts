/**
 * The Browser toolbar's Design system button, its state side (TCH `feat/design-system-button`, plan
 * `tasks/ke-hoach-nut-design-system.md`). Same arrangement as the Undo button (`undo-toolbar.ts`): Tracy
 * (`@tracy/dsh-design-inspiration`) says, on `tracy:design-system-toolbar-state`, whether the button of a
 * site shows and with which words — already translated, so this fork adds no locale key — and a press goes
 * back on `tracy:design-system-toolbar-press`. The fork only draws.
 *
 * Keyed by site, not by conversation: the button opens the site's own design-system panel, the same for
 * every conversation on it. The store listens from module load, so a state said before the Browser tab
 * mounts is kept. No state, or `hidden` (the operator's switch off, not a site), draws no button.
 */
import { useCallback, useSyncExternalStore } from 'react'

export const DESIGN_SYSTEM_TOOLBAR_STATE_EVENT = 'tracy:design-system-toolbar-state'
export const DESIGN_SYSTEM_TOOLBAR_PRESS_EVENT = 'tracy:design-system-toolbar-press'

export const DESIGN_SYSTEM_TOOLBAR_STATES = ['ready', 'off', 'hidden'] as const
export type DesignSystemToolbarState = (typeof DESIGN_SYSTEM_TOOLBAR_STATES)[number]

export interface DesignSystemToolbarDetail {
  siteKey: string
  state: DesignSystemToolbarState
  text: { label: string; tooltip: string }
}

/** A well-formed state detail, or null (a button with no name is not drawn). */
export function readDesignSystemToolbarState(detail: unknown): DesignSystemToolbarDetail | null {
  if (detail === null || typeof detail !== 'object') return null
  const d = detail as Record<string, unknown>
  if (typeof d.siteKey !== 'string' || d.siteKey === '') return null
  if (!(DESIGN_SYSTEM_TOOLBAR_STATES as readonly unknown[]).includes(d.state)) return null
  const words = d.text
  if (words === null || typeof words !== 'object') return null
  const w = words as Record<string, unknown>
  if (typeof w.label !== 'string' || w.label === '' || typeof w.tooltip !== 'string') return null
  return { siteKey: d.siteKey, state: d.state as DesignSystemToolbarState, text: { label: w.label, tooltip: w.tooltip } }
}

export interface DesignSystemToolbarStore {
  get(siteKey: string): DesignSystemToolbarDetail | null
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** The latest state per site, fed by `tracy:design-system-toolbar-state` on `target`. */
export function createDesignSystemToolbarStore(target: EventTarget): DesignSystemToolbarStore {
  const latest = new Map<string, DesignSystemToolbarDetail>()
  const listeners = new Set<() => void>()
  const onState = (event: Event): void => {
    const detail = readDesignSystemToolbarState((event as CustomEvent).detail)
    if (detail === null) return
    latest.set(detail.siteKey, detail)
    for (const listener of [...listeners]) listener()
  }
  target.addEventListener(DESIGN_SYSTEM_TOOLBAR_STATE_EVENT, onState)
  return {
    get: siteKey => latest.get(siteKey) ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      target.removeEventListener(DESIGN_SYSTEM_TOOLBAR_STATE_EVENT, onState)
      listeners.clear()
      latest.clear()
    },
  }
}

const pageStore: DesignSystemToolbarStore | null = typeof window === 'undefined' ? null : createDesignSystemToolbarStore(window)

const NO_SUBSCRIPTION = (): (() => void) => () => {}

/** What the toolbar draws for `siteKey`: the latest state, or null (none said, or `hidden`). */
export function useDesignSystemToolbarState(siteKey: string | null, store: DesignSystemToolbarStore | null = pageStore): DesignSystemToolbarDetail | null {
  const subscribe = store === null ? NO_SUBSCRIPTION : store.subscribe
  const read = useCallback(() => (store === null || !siteKey ? null : store.get(siteKey)), [store, siteKey])
  const detail = useSyncExternalStore(subscribe, read, read)
  return detail === null || detail.state === 'hidden' ? null : detail
}

/** Tell Tracy the person pressed the button of `siteKey`, from the conversation `sessionId`. */
export function pressDesignSystemToolbar(siteKey: string, sessionId: string, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent(DESIGN_SYSTEM_TOOLBAR_PRESS_EVENT, { detail: { siteKey, sessionId } }))
}
