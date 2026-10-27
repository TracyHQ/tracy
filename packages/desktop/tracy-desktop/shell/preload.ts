/**
 * The window's preload: dsh's own desktop preload pieces, imported from the dsh submodule, not copied.
 *
 * WHY THE PAGE MUST BE TOLD. On macOS the window opens `hiddenInset`: no title bar, only the traffic
 * lights. Electron drags the window only where the page declares `-webkit-app-region: drag`, and dsh
 * declares it once, behind `html[data-platform='darwin']`, which only its desktop preload sets. Without
 * that, nothing in the window could be dragged (Lee, 08/10/2026). On Windows the title bar is hidden
 * too and the system buttons float over the page (`titleBarOverlay`): dsh's caption row
 * (`html[data-windows-titlebar]`, set by its `syncWindowsAppearance`) is the drag strip and keeps the
 * page's content below the buttons. Linux keeps the system frame and needs neither.
 *
 * WHY THE SHORTCUT BRIDGE COMES WITH IT. To dsh, `data-platform` means "inside the dsh desktop app",
 * and `dsh-client-shortcuts` then refuses to start without `dshDesktop.keyboard` — measured on the
 * stand 09/10: one failed plugin, 25 more waiting on it, a blank window. So the page gets the same
 * bridge dsh's desktop app gives its own page, answered by `installDesktopShortcuts` in shell/main.ts.
 *
 * Exposes `dshDesktop` with `keyboard` and `shortcuts` only, to the top frame of the app's own origin;
 * dsh's `preload-app.ts` itself is not used — it hands its product API to `dsh-app://app/` only.
 *
 * TRACY'S OWN BRIDGE, `tracyDesktop.links`, goes to that same frame only: the page routes the links
 * the window was asked to open (`route`), and asks for the system browser outright (`openExternal`).
 * The page DECIDES; the main process checks and carries out (src/open-requests.js). Absent on the
 * web, so every caller must treat a missing `tracyDesktop` as "not in the app" and change nothing.
 *
 * WHICH WINDOW (tasks/todo-desktop-multi-window.md). The main process names the window's role on the
 * command line (src/window-role.js). A SECOND window gets, before the page's first script, its own
 * copy of the page's window-level storage keys (src/window-storage.js) and `html[data-desktop-window]`
 * for CSS; every product page gets `tracyDesktop.window.role`. A page with no `tracyDesktop.window`
 * (an older app) is the main window.
 *
 * `tracyDesktop.app` (Settings › Help & about) goes to the same frame: the app's version and its
 * update state, and the page's buttons (check, Restart, Later, Download, the automatic-check switch).
 * Each is a request the main process checks again (src/update-bridge.js); the page passes no
 * address, feed or path. `protocolVersion` says which of these exist: an app built before this
 * bridge has no `app` at all, which the page must not mistake for a browser.
 *
 * Protocol 2 adds, for the first-run screen (tasks/todo-desktop-onboard-agent.md, last section
 * — the bridge contract): `app.agents` (which agent CLIs are installed — the page names ids, never commands;
 * src/agents-bridge.js), `app.onboarding` (whether this device closed the screen;
 * src/onboarding-bridge.js) and `app.notifications` (system notifications when a turn ends;
 * src/notify-bridge.js). Each method passes the page's argument as is: the main process checks it.

 * Desktop first-run v2 (tasks/todo-desktop-onboard-v2.md) adds `app.notifications.onChange` (the status
 * pushed again when the macOS permission may have changed) and dsh's `__DSH_LOCALE__` (below);
 * a page tells them apart by feature, not by `protocolVersion`.
 *
 * Protocol 3 (tasks/todo-desktop-update-policy.md D4–D6): `app.whatsNew` (`seen`, `setNotify`),
 * `app.openChangelog()` (the main process builds the address from the bundle) and `app.onOpenHelp`
 * (the app asks the page to open Settings › Help & about); `update.later` is gone — a downloaded
 * version installs on quit (A1). The update state carries `readySince`, `stagedVersion`, `policy` and
 * `whatsNew`.
 *
 * `app.websiteOpportunities.onOpen` (feature-detected, no protocol bump): Help › Find Website
 * Opportunities… asks the page to open its tab (src/website-opportunities-menu.js).
 */

import { contextBridge, ipcRenderer } from 'electron'
import { LINK_CHANNELS } from '../src/link-channels.js'
import { localeBootstrap } from '../src/locale-bootstrap.js'
import { pageMarks } from '../src/window-chrome.js'
import { windowRoleOf } from '../src/window-role.js'
import { isolateWindowStorage, WINDOW_KEYS } from '../src/window-storage.js'
import {
  AGENT_CHANNELS,
  APP_BRIDGE_VERSION,
  LOCALE_CHANNELS,
  NOTIFY_CHANNELS,
  ONBOARDING_CHANNELS,
  UPDATE_CHANNELS,
  WEBSITE_OPPORTUNITIES_CHANNELS
} from '../src/update-channels.js'
import { markDocumentPlatform, syncWindowFullscreen } from '@dsh-desktop/preload-platform.ts'
import { createKeyboardApi, createShortcutsApi } from '@dsh-desktop/preload-shortcuts.ts'
import { syncNativeTheme } from '@dsh-desktop/preload-theme.ts'
import { syncWindowsAppearance } from '@dsh-desktop/preload-windows.ts'

// The main process passes the origin it opened the window on (`--tracy-origin=`), the same value
// `installDesktopShortcuts` is told to trust. A page from anywhere else gets no bridge.
const origin = process.argv.find((arg) => arg.startsWith('--tracy-origin='))?.slice('--tracy-origin='.length)
const product = origin !== undefined && location.origin === origin && process.isMainFrame
const role = windowRoleOf(process.argv)

/** What this platform's frame needs the page to know (src/window-chrome.js). */
const marks = pageMarks(process.platform)

if (marks.integratedChrome) {
  // Tracy's sidebar keeps its icon rail when collapsed, and clears the traffic lights itself
  // (@tracy/dsh-sidebar `.tsb-window-strip`); dsh's frame keeps the rail's width when told so
  // (ui-layout AppFrame, a Tracy fork patch — upstream drops the rail on macOS).
  // The window's top row is one chrome strip, with the content below it on a card, as in Cherry
  // Studio (Lee, 09/10/2026): dsh's integrated chrome mode (ui-layout AppFrame, a Tracy fork patch).
  const markWindow = (): void => {
    document.documentElement.setAttribute('data-desktop-sidebar-rail', '')
    document.documentElement.setAttribute('data-desktop-chrome', 'integrated')
  }
  if (document.documentElement === null)
    window.addEventListener('DOMContentLoaded', markWindow, { once: true })
  else markWindow()
}
// As dsh's own app preload does on every platform: `data-platform`, the fullscreen mirror (it listens
// only on macOS and Windows), and the page's theme forwarded to `nativeTheme`, so native chrome —
// the macOS material, the Windows overlay buttons, menus and dialogs — follows the app's theme.
markDocumentPlatform()
if (marks.fullscreen) syncWindowFullscreen()
syncNativeTheme()
// Windows: dsh's caption row — `html[data-windows-titlebar]` and its height, which dsh's CSS clears
// under the overlay buttons; its Application / Edit buttons; and the page's palette for the overlay.
// The product page only: the main process answers those messages from Tracy's origin alone.
if (marks.windowsCaption && product) {
  syncWindowsAppearance()
  // dsh measures that palette again when the page's own theme marks change (body
  // `data-ds-dark-theme`, its stylesheets), not when the colour scheme alone does. Tracy's
  // server-rendered pages (/login, the approve pages: apps/tracy-web page-shell.js) follow
  // `prefers-color-scheme` and nothing else, so on a theme change their overlay kept the old symbol
  // colour. A comment added to and taken out of <head> is a change dsh already listens for; on a
  // dsh page it measures the same palette and sends nothing.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const head = document.head as HTMLHeadElement | null
    if (head === null) return
    const nudge = document.createComment('')
    head.append(nudge)
    nudge.remove()
  })
}

if (product && role === 'secondary') {
  // First, before the page runs anything: the page reads these keys while it boots.
  contextBridge.executeInMainWorld({ func: isolateWindowStorage, args: [[...WINDOW_KEYS]] })
  const markRole = (): void => document.documentElement.setAttribute('data-desktop-window', role)
  if (document.documentElement === null) window.addEventListener('DOMContentLoaded', markRole, { once: true })
  else markRole()
}

/**
 * `tracyDesktop.protocolVersion`: 2 = links carry how they were pressed and may be answered with a
 * second window (`windows`), and `window.role` exists. Absent (an older app) = links on plain clicks only.
 */
const PROTOCOL_VERSION = 2

/** What the page answers a link with: `@tracy/dsh-site-tabs` desktop-open.mjs `OpenDecision`. */
type OpenDecision =
  | { kind: 'external' }
  | { kind: 'navigate'; url: string }
  | { kind: 'tab'; url: string; siteKey: string }
  | { kind: 'window'; url: string }

/**
 * The page's link router: `decide` answers, `execute` carries out what the main process accepted.
 * `windows: true` = it can answer a Cmd+click with a second window (the main process opens it).
 */
interface LinkRoute {
  windows?: boolean
  decide(url: string, how: { disposition?: string }): OpenDecision | Promise<OpenDecision>
  execute(decision: OpenDecision): void
}

function createLinksApi(): {
  route(handler: LinkRoute): () => void
  openExternal(url: string): void
} {
  let current: LinkRoute | undefined
  ipcRenderer.on(
    LINK_CHANNELS.ask,
    (_event, request: { requestId?: unknown; url?: unknown; disposition?: unknown }) => {
      const { requestId, url, disposition } = request ?? {}
      if (typeof requestId !== 'string' || typeof url !== 'string') return
      const handler = current
      const how = typeof disposition === 'string' ? { disposition } : {}
      void (async () => {
        let decision: unknown = { kind: 'external' }
        try {
          if (handler !== undefined) decision = await handler.decide(url, how)
        } catch {
          /* a router that throws answers "the browser" */
        }
        ipcRenderer.send(LINK_CHANNELS.answer, { requestId, decision })
      })()
    }
  )
  ipcRenderer.on(LINK_CHANNELS.execute, (_event, message: { decision?: OpenDecision }) => {
    if (message?.decision !== undefined) current?.execute(message.decision)
  })
  return {
    route(handler) {
      current = handler
      ipcRenderer.send(LINK_CHANNELS.ready, { ready: true, windows: handler.windows === true })
      return () => {
        if (current !== handler) return
        current = undefined
        ipcRenderer.send(LINK_CHANNELS.ready, false)
      }
    },
    openExternal(url) {
      ipcRenderer.send(LINK_CHANNELS.openExternal, String(url))
    }
  }
}

/** The update state as the page receives it: the main process's DTO, copied field by field. */
interface UpdateState {
  revision: number
  status: string
  version: string | null
  percent: number | null
  releaseNotes: string | null
  lastCheckedAt: number | null
  nextRetryAt: number | null
  autoCheck: boolean
  readySince: number | null
  stagedVersion: string | null
  policy: { level: string; minimumVersion: string | null; after: number | null } | null
  whatsNew: { pending: boolean; from: string | null; to: string; page: string } | null
  showWhatsNew: boolean
}

function createAppApi(): object {
  const watchers = new Set<(state: UpdateState) => void>()
  ipcRenderer.on(UPDATE_CHANNELS.state, (_event, state: UpdateState) => {
    // The page gets the state, never the IPC event.
    for (const watcher of watchers) {
      try {
        watcher({ ...state })
      } catch {
        /* one watcher's failure is not another's */
      }
    }
  })
  // Help › Getting started (src/onboarding-bridge.js `openOnboarding`): the page opens its first-run
  // screen. The watcher gets no argument, never the IPC event.
  const openWatchers = new Set<() => void>()
  ipcRenderer.on(ONBOARDING_CHANNELS.open, () => {
    for (const watcher of openWatchers) {
      try {
        watcher()
      } catch {
        /* one watcher's failure is not another's */
      }
    }
  })
  // Help › Find Website Opportunities…: the page opens its tab. No argument, never the IPC event.
  const opportunityWatchers = new Set<() => void>()
  ipcRenderer.on(WEBSITE_OPPORTUNITIES_CHANNELS.open, () => {
    for (const watcher of opportunityWatchers) {
      try {
        watcher()
      } catch {
        /* one watcher's failure is not another's */
      }
    }
  })
  // The notification status changed (the macOS permission, read again when a window gains focus —
  // src/notify-bridge.js). The watcher gets a copy of the status, never the IPC event.
  const notifyWatchers = new Set<(status: object) => void>()
  ipcRenderer.on(NOTIFY_CHANNELS.changed, (_event, status: object) => {
    for (const watcher of notifyWatchers) {
      try {
        watcher({ ...status })
      } catch {
        /* one watcher's failure is not another's */
      }
    }
  })
  // Settings › Help & about asked for by the app (a notification pressed, Help › What's New…). The
  // watcher gets no argument, never the IPC event.
  const helpWatchers = new Set<() => void>()
  ipcRenderer.on(UPDATE_CHANNELS.openHelp, () => {
    for (const watcher of helpWatchers) {
      try {
        watcher()
      } catch {
        /* one watcher's failure is not another's */
      }
    }
  })
  const invoke = (channel: string, ...args: unknown[]): Promise<UpdateState> =>
    ipcRenderer.invoke(channel, ...args) as Promise<UpdateState>
  return {
    protocolVersion: APP_BRIDGE_VERSION,
    info: () => ipcRenderer.invoke(UPDATE_CHANNELS.info),
    update: {
      getState: () => invoke(UPDATE_CHANNELS.getState),
      check: () => invoke(UPDATE_CHANNELS.check),
      restart: () => invoke(UPDATE_CHANNELS.restart),
      download: () => invoke(UPDATE_CHANNELS.download),
      setAutoCheck: (on: unknown) => invoke(UPDATE_CHANNELS.setAutoCheck, on),
      onState(watcher: unknown): () => void {
        if (typeof watcher !== 'function') throw new TypeError('onState takes a function')
        const fn = watcher as (state: UpdateState) => void
        watchers.add(fn)
        return () => {
          watchers.delete(fn)
        }
      }
    },
    whatsNew: {
      seen: () => invoke(UPDATE_CHANNELS.whatsNewSeen),
      setNotify: (on: unknown) => invoke(UPDATE_CHANNELS.whatsNewSetNotify, on)
    },
    openChangelog: async (): Promise<void> => {
      await ipcRenderer.invoke(UPDATE_CHANNELS.openChangelog)
    },
    onOpenHelp(watcher: unknown): () => void {
      if (typeof watcher !== 'function') throw new TypeError('onOpenHelp takes a function')
      const fn = watcher as () => void
      helpWatchers.add(fn)
      return () => {
        helpWatchers.delete(fn)
      }
    },
    agents: {
      detect: (ids: unknown) => ipcRenderer.invoke(AGENT_CHANNELS.detect, ids),
      refresh: (ids: unknown) => ipcRenderer.invoke(AGENT_CHANNELS.refresh, ids)
    },
    onboarding: {
      get: () => ipcRenderer.invoke(ONBOARDING_CHANNELS.get),
      close: (input: unknown) => ipcRenderer.invoke(ONBOARDING_CHANNELS.close, input),
      onOpen(watcher: unknown): () => void {
        if (typeof watcher !== 'function') throw new TypeError('onOpen takes a function')
        const fn = watcher as () => void
        openWatchers.add(fn)
        return () => {
          openWatchers.delete(fn)
        }
      }
    },
    websiteOpportunities: {
      onOpen(watcher: unknown): () => void {
        if (typeof watcher !== 'function') throw new TypeError('onOpen takes a function')
        const fn = watcher as () => void
        opportunityWatchers.add(fn)
        return () => {
          opportunityWatchers.delete(fn)
        }
      }
    },
    notifications: {
      status: () => ipcRenderer.invoke(NOTIFY_CHANNELS.status),
      setEnabled: (on: unknown) => ipcRenderer.invoke(NOTIFY_CHANNELS.setEnabled, on),
      setSound: (name: unknown) => ipcRenderer.invoke(NOTIFY_CHANNELS.setSound, name),
      test: () => ipcRenderer.invoke(NOTIFY_CHANNELS.test),
      turnFinished: (input: unknown) => ipcRenderer.invoke(NOTIFY_CHANNELS.turnFinished, input),
      openSystemSettings: async (): Promise<void> => {
        await ipcRenderer.invoke(NOTIFY_CHANNELS.openSettings)
      },
      onChange(watcher: unknown): () => void {
        if (typeof watcher !== 'function') throw new TypeError('onChange takes a function')
        const fn = watcher as (status: object) => void
        notifyWatchers.add(fn)
        return () => {
          notifyWatchers.delete(fn)
        }
      }
    }
  }
}

if (product)
  contextBridge.exposeInMainWorld('tracyDesktop', {
    protocolVersion: PROTOCOL_VERSION,
    window: { role },
    links: createLinksApi(),
    app: createAppApi()
  })

/**
 * dsh's native locale bridge (dsh `packages/client/locale/src/client/bootstrap.ts`): the operating
 * system's languages, so a first run opens in the person's language, and the language they picked in
 * Settings › Language — read from the `tracy_lang` cookie, because with this bridge present dsh no
 * longer reads its own stored pick (src/locale-bootstrap.js says why). Read fresh on every page load.
 * A failed read answers with no languages rather than rejecting: dsh's locale plugin fails to start
 * on a rejected read. `onChange` has nothing to do: the pick is kept by Tracy's Language row.
 */
if (product)
  contextBridge.exposeInMainWorld('__DSH_LOCALE__', {
    read: async (): Promise<{ languages: string[]; preference: string | null }> => {
      let languages: unknown = []
      try {
        languages = await ipcRenderer.invoke(LOCALE_CHANNELS.languages)
      } catch {
        /* no languages: dsh falls back to the browser's */
      }
      let cookie = ''
      try {
        cookie = document.cookie
      } catch {
        /* no cookie access: no pick */
      }
      return localeBootstrap({ languages, cookie })
    },
    onChange(): void {}
  })

contextBridge.exposeInMainWorld(
  'dshDesktop',
  product
    ? { protocolVersion: 1, keyboard: createKeyboardApi(), shortcuts: createShortcutsApi() }
    : { protocolVersion: 1 }
)
