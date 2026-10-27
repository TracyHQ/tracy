/**
 * Hand-written types for `index.mjs`, for consumer packages with no `allowJs` (same reason as
 * `../config/index.d.mts`). Kept in sync BY HAND with the JSDoc there.
 */

export declare const VIEWER_DOOR: '/auth/me'
export declare const SEAT: 'seat'
export declare const GUEST: 'guest'
export declare const UNKNOWN: 'unknown'

export declare function viewerFromAnswer(status: number, body: unknown): string

export declare function isLocalSurface(hostname: string): boolean

export declare function mayHoldSeatOnlyTab(viewer: string, hostname: string): boolean

export declare function pageHolder(): Record<symbol, unknown>

export declare function viewerDoorAnswer(options?: {
  fresh?: boolean
}): Promise<{ status: number; body: unknown } | null>

export declare function forgetViewerAnswer(): void

export declare function readViewer(options?: { fetch?: typeof globalThis.fetch }): Promise<string>

export declare function tabIdsOfType(state: unknown, type: string): string[]

export interface SeatSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  closeTab?: (tabId: string) => void
  getSnapshot?: () => { state?: unknown }
  subscribeState?: (listener: () => void) => () => void
  openTabsOf?: (type: string) => readonly { id: string }[]
}

export interface NativeSeatSidebar {
  mounted?: { getSnapshot(): string | undefined; subscribe(listener: () => void): () => void }
  openTabs?: {
    getSnapshot?(): readonly { sessionId: string; tabId: string; kind: string }[]
    subscribe(listener: () => void): () => void
  }
  close?: (tabId: string) => void
}

export declare function seatOnlyTab(
  sidebar: SeatSidebar,
  type: string,
  describe: () => Record<string, unknown>,
  options?: {
    readViewer?: () => Promise<string>
    hostname?: string
    nativeSidebar?: () => NativeSeatSidebar | undefined
  }
): () => void

export declare function sweepSeededTabs(
  sidebar: Omit<SeatSidebar, 'registerTab'>,
  type: string,
  getNativeSidebar?: () => NativeSeatSidebar | undefined
): (() => void) | undefined
