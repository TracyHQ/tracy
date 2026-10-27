/**
 * The desktop app's update state, read once per page at the plugin level (not inside the section),
 * so the nav dot moves while Settings shows another section, or is closed (council 09/10 §2.4.7).
 *
 * The bridge is `window.tracyDesktop.app` (packages/desktop/tracy-desktop/shell/preload.ts). Absent
 * in a browser and in an app built before it — `desktopBridge` answers null for both; the section
 * tells them apart by the user agent.
 *
 * Snapshots carry a `revision`: a reply that arrives after a newer pushed state is dropped.
 */
import type { InstallMode, UpdateState } from './help-about-model'

/** What the app says about itself. The optional fields arrived with protocol 3. */
export interface AppInfo {
  readonly protocolVersion: number
  readonly version: string
  readonly arch: string
  readonly channel: string | null
  readonly updates: boolean
  /** How a downloaded version installs; null when the updater is off. */
  readonly installMode?: InstallMode | null
  /** The notes of the RUNNING version, from the app bundle; null when the bundle has none. */
  readonly releaseNotes?: string | null
  /** The running version's changelog page, `X.Y`. */
  readonly notesPage?: string | null
  /** The docs site the changelog lives on (shown only; the app opens it). */
  readonly docsOrigin?: string | null
}

export interface DesktopBridge {
  readonly protocolVersion: number
  info(): Promise<Omit<AppInfo, 'protocolVersion'> & { protocolVersion?: number }>
  readonly update: {
    getState(): Promise<UpdateState>
    check(): Promise<UpdateState>
    restart(): Promise<UpdateState>
    download(): Promise<UpdateState>
    setAutoCheck(on: boolean): Promise<UpdateState>
    onState(watcher: (state: UpdateState) => void): () => void
  }
  /** Protocol 3. Each is looked up with `typeof` before use: an older app has none of them. */
  readonly whatsNew?: {
    seen(): Promise<UpdateState>
    setNotify(on: boolean): Promise<UpdateState>
  }
  openChangelog?(): Promise<void>
  onOpenHelp?(watcher: () => void): () => void
}

/** The bridge, when this page runs in an app that has one (protocol 1 or later). */
export function desktopBridge(scope: unknown): DesktopBridge | null {
  const app = (scope as { tracyDesktop?: { app?: unknown } } | null)?.tracyDesktop?.app as
    | Partial<DesktopBridge>
    | undefined
  if (app === undefined || app === null || typeof app !== 'object') return null
  if (typeof app.protocolVersion !== 'number' || app.protocolVersion < 1) return null
  if (typeof app.info !== 'function' || typeof app.update?.onState !== 'function') return null
  return app as DesktopBridge
}

export interface UpdateSnapshot {
  readonly info: AppInfo | null
  readonly state: UpdateState | null
  /** The last press of the automatic-check switch could not be saved by the app. */
  readonly saveFailed: boolean
  /** The last press of the What's new switch could not be saved by the app. */
  readonly notifySaveFailed: boolean
}

/** `later` left with bridge protocol 3: a downloaded version now waits without being postponed. */
export type UpdateAction = 'check' | 'restart' | 'download'

export interface UpdateSource {
  /** True when this page runs in an app with the bridge. */
  readonly present: boolean
  /** True when the app can open the running version's changelog (protocol 3). */
  readonly canOpenChangelog: boolean
  getSnapshot(): UpdateSnapshot | null
  subscribe(listener: () => void): () => void
  /** Start listening to the app; returns the stop. */
  start(): () => void
  act(action: UpdateAction): Promise<void>
  /** @returns false when the app could not save it. */
  setAutoCheck(on: boolean): Promise<boolean>
  /** Tell the app the person has seen What's new (Help & about is on screen). */
  seen(): Promise<void>
  /** @returns false when the app could not save it, or has no such switch. */
  setNotify(on: boolean): Promise<boolean>
  /** Open the running version's changelog in the system browser; the app knows the address. */
  openChangelog(): Promise<void>
  /** Run `watcher` whenever the app asks for Help & about (a notification, Help › What's New…). */
  onOpenHelp(watcher: () => void): () => void
}

const isState = (value: unknown): value is UpdateState =>
  value !== null &&
  typeof value === 'object' &&
  typeof (value as UpdateState).revision === 'number' &&
  typeof (value as UpdateState).status === 'string'

/** @param bridge - `desktopBridge(window)`; null gives a source that is always empty. */
export function createUpdateSource(bridge: DesktopBridge | null): UpdateSource {
  const listeners = new Set<() => void>()
  let snapshot: UpdateSnapshot | null = null
  const set = (next: Partial<UpdateSnapshot>): void => {
    snapshot = { info: null, state: null, saveFailed: false, notifySaveFailed: false, ...snapshot, ...next }
    for (const listener of listeners) listener()
  }
  /** Take a state unless a newer one is already here. */
  const take = (state: unknown): void => {
    if (!isState(state)) return
    const current = snapshot?.state
    if (current && current.revision > state.revision) return
    set({ state })
  }

  const whatsNew = typeof bridge?.whatsNew === 'object' && bridge.whatsNew !== null ? bridge.whatsNew : null

  return {
    present: bridge !== null,
    canOpenChangelog: typeof bridge?.openChangelog === 'function',
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    start() {
      if (bridge === null) return () => {}
      let live = true
      const off = bridge.update.onState((state) => {
        if (live) take(state)
      })
      void bridge.update.getState().then(
        (state) => {
          if (live) take(state)
        },
        () => {}
      )
      void bridge.info().then(
        (info) => {
          if (live) set({ info: { ...info, protocolVersion: bridge.protocolVersion } })
        },
        () => {}
      )
      return () => {
        live = false
        off()
      }
    },
    async act(action) {
      if (bridge === null) return
      try {
        take(await bridge.update[action]())
      } catch {
        /* the state line keeps saying what the app last said */
      }
    },
    async setAutoCheck(on) {
      if (bridge === null) return false
      try {
        take(await bridge.update.setAutoCheck(on))
        set({ saveFailed: false })
        return true
      } catch {
        set({ saveFailed: true })
        return false
      }
    },
    async seen() {
      if (typeof whatsNew?.seen !== 'function') return
      try {
        take(await whatsNew.seen())
      } catch {
        /* the dot stays; the next showing of the section tries again */
      }
    },
    async setNotify(on) {
      if (typeof whatsNew?.setNotify !== 'function') return false
      try {
        take(await whatsNew.setNotify(on))
        set({ notifySaveFailed: false })
        return true
      } catch {
        set({ notifySaveFailed: true })
        return false
      }
    },
    async openChangelog() {
      if (typeof bridge?.openChangelog !== 'function') return
      try {
        await bridge.openChangelog()
      } catch {
        /* the system browser reports its own failure; the page has nothing to add */
      }
    },
    onOpenHelp(watcher) {
      if (typeof bridge?.onOpenHelp !== 'function') return () => {}
      return bridge.onOpenHelp(watcher)
    }
  }
}
