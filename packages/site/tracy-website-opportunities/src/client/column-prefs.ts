/** The Columns menu's choice, remembered on this device (`localStorage['tracy-wo:columns']`). */
import type { ColumnId } from '@tracy/wo-views'

export const COLUMNS_KEY = 'tracy-wo:columns'

const COLUMNS: readonly ColumnId[] = ['type', 'score', 'web', 'google', 'social', 'contact', 'status']
const DEFAULT_HIDDEN: readonly ColumnId[] = ['type']
const isColumn = (v: unknown): v is ColumnId => COLUMNS.some((c) => c === v)

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readHiddenColumns(store: Store | null): ColumnId[] {
  try {
    const raw = store?.getItem(COLUMNS_KEY)
    if (raw === null || raw === undefined) return [...DEFAULT_HIDDEN]
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isColumn) : [...DEFAULT_HIDDEN]
  } catch {
    return [...DEFAULT_HIDDEN]
  }
}

export function writeHiddenColumns(store: Store | null, hidden: ReadonlySet<ColumnId>): void {
  try {
    store?.setItem(COLUMNS_KEY, JSON.stringify([...hidden]))
  } catch {
    // Private window or blocked storage: the choice lasts until the tab closes.
  }
}

/** `window.localStorage`, or null where reading it throws. */
export function localStore(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * My opportunities' view (spec #512): Cards or Compact rows, and Map only where the deployment has a browser map
 * key. Remembered through the same door as Find's Columns choice. The Table view is Find's alone now.
 */
export const MY_VIEW_KEY = 'tracy-wo:my-view'
export type MyView = 'cards' | 'rows' | 'map'
const MY_VIEWS: readonly MyView[] = ['cards', 'rows', 'map']

export function readMyView(store: Store | null): MyView {
  try {
    const raw = store?.getItem(MY_VIEW_KEY)
    return MY_VIEWS.find((v) => v === raw) ?? 'cards'
  } catch {
    return 'cards'
  }
}

export function writeMyView(store: Store | null, view: MyView): void {
  try {
    store?.setItem(MY_VIEW_KEY, view)
  } catch {
    // Private window or blocked storage: the choice lasts until the tab closes.
  }
}

/** The views offered: Map only with a browser map key (`GET /capabilities` `maps.browserKey`); hidden, not disabled. */
export function myViews(browserKey: string | null | undefined): readonly MyView[] {
  return typeof browserKey === 'string' && browserKey !== '' ? MY_VIEWS : ['cards', 'rows']
}

/** The remembered view when it is offered here, else Cards. */
export function shownMyView(chosen: MyView, offered: readonly MyView[]): MyView {
  return offered.includes(chosen) ? chosen : 'cards'
}
