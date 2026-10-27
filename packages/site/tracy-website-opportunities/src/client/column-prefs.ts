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

/** My opportunities' own Columns choice: Opportunity and Demo show by default (Lee 19/10), the rest until shown (plan C1). */
export const MY_COLUMNS_KEY = 'tracy-wo:my-columns'
export type MyColumn = 'score' | 'web' | 'google' | 'social' | 'contact' | 'demo'
export const MY_COLUMNS: readonly MyColumn[] = ['score', 'web', 'demo', 'google', 'social', 'contact']
const MY_DEFAULT_HIDDEN: readonly MyColumn[] = ['web', 'google', 'social', 'contact']
export const isMyColumn = (v: unknown): v is MyColumn => MY_COLUMNS.some((c) => c === v)

export function readMyHiddenColumns(store: Store | null): MyColumn[] {
  try {
    const raw = store?.getItem(MY_COLUMNS_KEY)
    if (raw === null || raw === undefined) return [...MY_DEFAULT_HIDDEN]
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isMyColumn) : [...MY_DEFAULT_HIDDEN]
  } catch {
    return [...MY_DEFAULT_HIDDEN]
  }
}

export function writeMyHiddenColumns(store: Store | null, hidden: ReadonlySet<MyColumn>): void {
  try {
    store?.setItem(MY_COLUMNS_KEY, JSON.stringify([...hidden]))
  } catch {
    // Private window or blocked storage: the choice lasts until the tab closes.
  }
}
