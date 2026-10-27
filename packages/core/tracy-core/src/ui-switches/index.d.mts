/**
 * Hand-written types for `index.mjs`, for consumer packages with no `allowJs` (same reason as
 * `../config/index.d.mts`). Kept in sync BY HAND with the JSDoc typedefs there.
 */

export interface UiSwitch {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly hint: string
  readonly drawnBy: 'dsh' | 'Tracy'
  readonly defaultOn: boolean
  /** Better Sidebar tab types this switch governs. */
  readonly tabs?: readonly string[]
  /** What an operator must know before turning it off. */
  readonly warning?: string
  /** A switch whose piece sits inside this one's: turning the parent off hides it too. */
  readonly parent?: string
}

export interface UiSwitches {
  /** Settles once the door has answered or failed; never rejects. */
  readonly ready: Promise<void>
  /** Throws for an id the catalogue does not list. */
  isShown(id: string): boolean
  /** Registration ids minus those switched off; an id the catalogue does not list passes. */
  keepShown(ids: readonly string[]): string[]
  /**
   * Called once, when the door's answer lands; never when it had landed before this copy was first
   * asked (that copy reads the answer from the start).
   */
  subscribe(listener: () => void): () => void
  /** The right-column switches as Better Sidebar's tab policy (`service.setTabPolicy`). */
  tabPolicy(): TabPolicy
  /**
   * Install the tab policy on a side card now, replace it when the door answers, remove it on
   * dispose. A side card older than feature `setTabPolicy` gets nothing and nothing throws.
   */
  followTabPolicy(sidebar: { setTabPolicy?: (policy: TabPolicy) => () => void }): () => void
}

export interface TabPolicy {
  /** Off: the type does not exist for customers (a `tab-*` switch). */
  isAllowed(tabId: string): boolean
  /** Off: left out of the + menu and the Start guide, still opens elsewhere (a `launch-*` switch). */
  isListed(tabId: string): boolean
}

export const UI_SWITCHES: readonly UiSwitch[]

/** Every tab type a `launch-*` switch names, in catalogue order: what dsh's + launcher may offer. */
export const LAUNCHER_TABS: readonly string[]

export function uiSwitches(options?: { fetch?: typeof globalThis.fetch; root?: Element | null }): UiSwitches

/**
 * The switches as a dsh host plugin reads them from Tracy's `/api/ui` at `origin`: whether one switch
 * is on, or null when Tracy gave no readable answer (the caller treats null as off for a road a
 * switch closes).
 */
export function switchesAtTracy(
  origin: string | null | undefined,
  options?: { fetch?: typeof globalThis.fetch; timeoutMs?: number }
): Promise<((id: string) => boolean) | null>
