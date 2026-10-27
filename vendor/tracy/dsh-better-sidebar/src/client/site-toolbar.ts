/**
 * The Browser toolbar's Publish and "More" buttons, their state side (TCH `fix/ds-templates-local`,
 * Akemi 15/10/2026). Same arrangement as the Design system and Undo buttons: the fork imports nothing
 * of Tracy's and adds no locale key. TCH `@tracy/dsh-my-sites` says, on `tracy:site-toolbar-state`,
 * which of the two buttons a site shows and with which words (already translated), and a press goes
 * back on `tracy:site-toolbar-press`. Tracy opens the site's Publish tab, or draws its own site menu
 * (My Sites' `…` menu, one source) under the button the press names. The fork only draws.
 *
 * Keyed by site: both buttons act on the site, the same for every conversation on it. The store
 * listens from module load and asks Tracy for the state once (`tracy:site-toolbar-ask`), so a state
 * said before this module loaded is said again. No state, or a null label, draws no button.
 */
import { useCallback, useSyncExternalStore } from 'react'

export const SITE_TOOLBAR_STATE_EVENT = 'tracy:site-toolbar-state'
export const SITE_TOOLBAR_PRESS_EVENT = 'tracy:site-toolbar-press'
export const SITE_TOOLBAR_ASK_EVENT = 'tracy:site-toolbar-ask'

export interface SiteToolbarDetail {
  siteKey: string
  /** The Publish button's word, or null: no Publish button. */
  publish: string | null
  /** The More button's accessible name, or null: no More button. */
  more: string | null
}

export type SiteToolbarAction = 'publish' | 'more'

const label = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** A well-formed state detail, or null. */
export function readSiteToolbarState(detail: unknown): SiteToolbarDetail | null {
  if (detail === null || typeof detail !== 'object') return null
  const d = detail as Record<string, unknown>
  if (typeof d.siteKey !== 'string' || d.siteKey === '') return null
  return { siteKey: d.siteKey, publish: label(d.publish), more: label(d.more) }
}

export interface SiteToolbarStore {
  get(siteKey: string): SiteToolbarDetail | null
  subscribe(listener: () => void): () => void
  dispose(): void
}

/** The latest state per site, fed by `tracy:site-toolbar-state` on `target`. */
export function createSiteToolbarStore(target: EventTarget): SiteToolbarStore {
  const latest = new Map<string, SiteToolbarDetail>()
  const listeners = new Set<() => void>()
  const onState = (event: Event): void => {
    const detail = readSiteToolbarState((event as CustomEvent).detail)
    if (detail === null) return
    latest.set(detail.siteKey, detail)
    for (const listener of [...listeners]) listener()
  }
  target.addEventListener(SITE_TOOLBAR_STATE_EVENT, onState)
  target.dispatchEvent(new CustomEvent(SITE_TOOLBAR_ASK_EVENT))
  return {
    get: siteKey => latest.get(siteKey) ?? null,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      target.removeEventListener(SITE_TOOLBAR_STATE_EVENT, onState)
      listeners.clear()
      latest.clear()
    },
  }
}

const pageStore: SiteToolbarStore | null = typeof window === 'undefined' ? null : createSiteToolbarStore(window)

const NO_SUBSCRIPTION = (): (() => void) => () => {}

/** What the toolbar draws for `siteKey`: the latest state, or null (none said). */
export function useSiteToolbarState(siteKey: string | null, store: SiteToolbarStore | null = pageStore): SiteToolbarDetail | null {
  const subscribe = store === null ? NO_SUBSCRIPTION : store.subscribe
  const read = useCallback(() => (store === null || !siteKey ? null : store.get(siteKey)), [store, siteKey])
  return useSyncExternalStore(subscribe, read, read)
}

/**
 * Tell Tracy the person pressed `action` for `siteKey`, from the conversation `sessionId`. `anchor` is
 * the pressed button: Tracy places the site menu under it and gives the focus back to it.
 */
export function pressSiteToolbar(siteKey: string, sessionId: string, action: SiteToolbarAction, anchor: HTMLElement, target: EventTarget = window): void {
  target.dispatchEvent(new CustomEvent(SITE_TOOLBAR_PRESS_EVENT, { detail: { siteKey, sessionId, action, anchor } }))
}
