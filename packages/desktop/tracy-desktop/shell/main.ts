/**
 * The window shell's main-process half: dsh's desktop window chrome and its shortcut bridge around a
 * page dsh's desktop app does not serve itself — Tracy's own origin.
 *
 * What is imported from the dsh submodule (vendor/tracy/deepseek-harness/apps/desktop/src), so a dsh
 * upgrade brings it along: `installDesktopShortcuts` (native key delivery, device-local shortcut
 * preferences in `keybindings.json`, the File › Close Page item), the IPC channel names its
 * preloads use, and the Windows caption height. Its `trusted` argument is a Tracy fork patch
 * (TRACY-FORK.md): upstream trusts only `dsh-app://app/`.
 *
 * What is written here, because dsh keeps it inline in its `createWindow` (apps/desktop/src/main.ts):
 * the frame per platform (src/window-chrome.js), the fullscreen and theme messages, the minimize
 * backdrop on macOS, and on Windows the answers to dsh's caption row — its palette for the overlay
 * buttons and its Application / Edit menus. Same values as dsh, on purpose: dsh's darwin CSS places
 * its first row around traffic lights at exactly { x: 16, y: 18 }, and its Windows CSS clears a
 * caption row exactly `WINDOWS_TITLEBAR_HEIGHT` tall.
 */

import { join } from 'node:path'
import { type BrowserWindow, Menu, ipcMain, nativeTheme, type MenuItemConstructorOptions } from 'electron'
import { DESKTOP_IPC } from '@dsh-desktop/ipc.ts'
import { installDesktopShortcuts } from '@dsh-desktop/keyboard.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from '@dsh-desktop/windows-layout.ts'
import { applicationMenu, captionMenu } from '../src/app-menu.js'
import { LINK_CHANNELS } from '../src/link-channels.js'
import { createOpenRouter, externalAllowed } from '../src/open-requests.js'
import {
  captionColors,
  measuredPalette,
  overlayColors,
  pageMarks,
  windowChrome
} from '../src/window-chrome.js'
import { windowRoleArgument } from '../src/window-role.js'

/** Sidebar fill painted while the material is detached; dsh's `chromeFallbackFill`. */
const fallbackFill = (): string => captionColors(nativeTheme.shouldUseDarkColors).color

/** The bundled preload, written next to this file by build/build-shell.mjs. */
const PRELOAD = join(__dirname, 'shell-preload.cjs')

/**
 * Window options of the shell on this platform (src/window-chrome.js): macOS hidden-inset with the
 * sidebar material, Windows a hidden title bar with the system buttons as an overlay in the theme's
 * colours, Linux the system frame with its menu bar hidden until Alt.
 * @returns options to spread into `new BrowserWindow`.
 */
export function windowShellOptions(): Electron.BrowserWindowConstructorOptions {
  return windowChrome(process.platform, {
    dark: nativeTheme.shouldUseDarkColors,
    captionHeight: WINDOWS_TITLEBAR_HEIGHT
  }) as Electron.BrowserWindowConstructorOptions
}

/**
 * The preload and what it needs to know, for `webPreferences`.
 * @param origin - the origin the window is opened on; the preload gives the shortcut bridge to it only.
 * @param role - which app window this is (src/window-role.js); a second window keeps its own storage copy.
 * @returns `preload` and `additionalArguments`.
 */
export function shellWebPreferences(
  origin: string,
  role: 'primary' | 'secondary' = 'primary'
): Pick<Electron.WebPreferences, 'preload' | 'additionalArguments'> {
  return { preload: PRELOAD, additionalArguments: [`--tracy-origin=${origin}`, windowRoleArgument(role)] }
}

/** The app's product windows, as main.js keeps them (the spare window is not one until it is used). */
export interface ProductWindows {
  /** The product window in use: the focused one, else the one focused last. */
  current(): BrowserWindow | undefined
  /** Every open product window. */
  all(): Iterable<BrowserWindow>
}

/**
 * Install the app-wide half once: the shortcut bridge and the application menu it owns an item of.
 * Every product window is answered by its own page (dsh `installDesktopShortcuts` `products`, a Tracy
 * fork patch); keys and menu commands go to the window in use.
 * @param windows - the product windows.
 * @param userData - Electron's userData directory; dsh keeps `keybindings.json` there.
 * @param origin - the product page's origin.
 * @param appMenuItems - Tracy's update items (Check for Updates…): under About on macOS, under Help
 *   elsewhere (src/app-menu.js). Read at every menu rebuild; `refreshMenu` rebuilds after they change.
 * @param newWindow - File › New Window: a second window on the product's home page.
 * @param gettingStarted - Help › Getting started with Tracy Cowork: the page opens its first-run
 *   screen (src/onboarding-bridge.js `openOnboarding`); no item without it.
 * @param whatsNew - Help › What's New…: Settings › Help & about opens on the running version's notes
 *   (tasks/todo-desktop-update-policy.md D6); no item without it.
 * @param websiteOpportunities - Help › Find Website Opportunities…: whether it shows now and what a
 *   press does (src/website-opportunities-menu.js); read at every rebuild, no item without it.
 * @param platform - `process.platform`; a parameter only so a test can name another.
 * @returns attach for each window, refreshMenu, and dispose for app quit.
 */
export function installShell(
  windows: ProductWindows,
  userData: string,
  origin: string,
  appMenuItems: () => MenuItemConstructorOptions[] = () => [],
  newWindow: () => void = () => {},
  gettingStarted: (() => void) | undefined = undefined,
  whatsNew: (() => void) | undefined = undefined,
  websiteOpportunities: (() => { visible: boolean; open: () => void }) | undefined = undefined,
  platform: NodeJS.Platform = process.platform
): {
  attach(window: BrowserWindow): void
  refreshMenu(): void
  dispose(): void
} {
  const trusted = (url: string): boolean => {
    try {
      return new URL(url).origin === origin
    } catch {
      return false
    }
  }
  let refresh = (): void => {}
  // Tracy draws no update or onboarding overlay over the page, so nothing ever blocks input.
  const shortcuts = installDesktopShortcuts(
    () => windows.current(),
    userData,
    platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux',
    () => {
      refresh()
    },
    () => ({ revision: 0, blocked: false }),
    trusted,
    () => windows.all()
  )
  const file = (): MenuItemConstructorOptions =>
    shortcuts.fileMenu({ fileMenu: 'File', closePage: 'Close Page' })

  refresh = () => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        applicationMenu({
          platform,
          file: file(),
          updateItems: appMenuItems(),
          newWindow,
          gettingStarted,
          whatsNew,
          websiteOpportunities: websiteOpportunities?.()
        }) as MenuItemConstructorOptions[]
      )
    )
  }
  refresh()

  /** The product window whose top frame sent this message, or undefined for anyone else. */
  const productOf = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): BrowserWindow | undefined => {
    const window = [...windows.all()].find(
      (candidate) => !candidate.isDestroyed() && event.sender === candidate.webContents
    )
    if (window === undefined || event.senderFrame !== window.webContents.mainFrame) return undefined
    return window
  }

  // Only a product window's top frame may set the theme; dsh's handler checks the same. The theme is
  // the whole app's (`nativeTheme`), so every window follows.
  const onTheme = (event: Electron.IpcMainEvent, source: unknown): void => {
    if (productOf(event) === undefined) return
    if (source === 'light' || source === 'dark' || source === 'system') nativeTheme.themeSource = source
  }
  ipcMain.on(DESKTOP_IPC.nativeThemeSet, onTheme)

  const disposers: Array<() => void> = []
  /** Windows: repaint one window's overlay buttons for the page it shows now. Set below. */
  let paintCaption: ((window: BrowserWindow) => void) | undefined
  /** Windows: the palette each window's page measured; a new document starts without one. */
  const measured = new WeakMap<BrowserWindow, { color: string; symbolColor: string }>()
  if (platform === 'win32') {
    paintCaption = (window) => {
      if (window.isDestroyed()) return
      window.setTitleBarOverlay(
        overlayColors({
          url: window.webContents.getURL(),
          dark: nativeTheme.shouldUseDarkColors,
          measured: measured.get(window)
        })
      )
    }
    const fromTracy = (
      event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
    ): BrowserWindow | undefined => {
      const window = productOf(event)
      return window !== undefined && trusted(event.senderFrame?.url ?? '') ? window : undefined
    }
    // dsh's caption row (`syncWindowsAppearance`) reports the page's sidebar fill and label colour
    // whenever its theme or stylesheets change; the overlay buttons take them, each window its own.
    // A transparent fill is no palette (src/window-chrome.js `measuredPalette`): that page keeps the
    // theme fallback, which follows the theme below.
    const onAppearance = (
      event: Electron.IpcMainEvent,
      _language: unknown,
      color: unknown,
      symbolColor: unknown
    ): void => {
      const window = fromTracy(event)
      if (window === undefined) return
      const palette = measuredPalette(color, symbolColor)
      if (palette === null) measured.delete(window)
      else measured.set(window, palette)
      paintCaption?.(window)
    }
    ipcMain.on(DESKTOP_IPC.windowsAppearance, onAppearance)
    // A window whose page has not measured (still loading, a page without dsh's palette) follows the
    // theme with dsh's fallback colours, so no window keeps a light strip in a dark theme; the sign-in
    // waiting page keeps its own dark palette in either theme.
    const onNativeTheme = (): void => {
      for (const window of windows.all()) if (!measured.has(window)) paintCaption?.(window)
    }
    nativeTheme.on('updated', onNativeTheme)
    // The caption row's Application and Edit buttons pop up these menus under themselves.
    ipcMain.handle(DESKTOP_IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
      const window = fromTracy(event)
      if (window === undefined) throw new Error('desktop menu: rejected sender')
      const inRange = (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100_000
      const items = captionMenu(name, {
        file: file(),
        updateItems: appMenuItems(),
        newWindow,
        gettingStarted,
        whatsNew,
        websiteOpportunities: websiteOpportunities?.(),
        editKey: (keyCode: string, modifiers: Array<'control'>) =>
          shortcuts.sendEditingKey(keyCode, modifiers)
      }) as MenuItemConstructorOptions[] | null
      if (items === null || !inRange(x) || !inRange(y)) throw new Error('desktop menu: invalid popup request')
      const zoom = window.webContents.getZoomFactor()
      return new Promise<void>((resolve) => {
        Menu.buildFromTemplate(items).popup({
          window,
          x: Math.round(x * zoom),
          y: Math.round(y * zoom),
          callback: () => resolve()
        })
      })
    })
    disposers.push(() => {
      ipcMain.removeListener(DESKTOP_IPC.windowsAppearance, onAppearance)
      nativeTheme.removeListener('updated', onNativeTheme)
      ipcMain.removeHandler(DESKTOP_IPC.windowsMenu)
    })
  }

  return {
    refreshMenu: () => refresh(),
    attach(window) {
      shortcuts.attach(window)
      if (paintCaption !== undefined) {
        // A new document owns the overlay afresh: the last page's palette goes with it (a dsh page's
        // palette must not stay over /login or the waiting page), and the new page measures its own.
        const paint = paintCaption
        window.webContents.on('did-navigate', () => {
          measured.delete(window)
          paint(window)
        })
      }
      if (!pageMarks(platform).fullscreen) return
      // macOS and Windows hide the window controls in fullscreen; the page drops its clearance for
      // them off html[data-fullscreen]. Reloads re-register the preload's listener, so resend after
      // each load.
      const sendFullscreen = (): void => {
        if (!window.isDestroyed())
          window.webContents.send(DESKTOP_IPC.windowFullscreen, window.isFullScreen())
      }
      window.on('enter-full-screen', sendFullscreen)
      window.on('leave-full-screen', sendFullscreen)
      window.webContents.on('did-finish-load', sendFullscreen)
      if (platform !== 'darwin') return
      // Deminiaturize reattaches the material late (electron/electron#25368): paint an opaque base
      // while minimized or hidden; the null -> 'sidebar' flip on restore forces the reattachment.
      const applyBackdrop = (): void => {
        if (window.isDestroyed()) return
        if (window.isMinimized() || !window.isVisible()) {
          window.setVibrancy(null)
          window.setBackgroundColor(fallbackFill())
        } else {
          window.setVibrancy('sidebar')
          window.setBackgroundColor('#00000000')
        }
      }
      for (const event of ['minimize', 'hide', 'restore', 'show'] as const)
        window.on(event as 'minimize', applyBackdrop)
    },
    dispose() {
      ipcMain.removeListener(DESKTOP_IPC.nativeThemeSet, onTheme)
      for (const dispose of disposers) dispose()
      shortcuts.dispose()
    }
  }
}

/** How long the page has to answer where a link goes before the browser opens it. */
const LINK_ANSWER_MS = 2000

/**
 * Route the links one product window is asked to open (src/open-requests.js has the rules), and
 * answer the page's own "open in the browser". Every message is taken only from this window's top
 * frame on `origin` — the frame the preload gives `tracyDesktop.links` to.
 * @param window - the product window.
 * @param origin - Tracy's origin, the one the window was opened on.
 * @param effects - `openExternal`: the system browser (main.js; it may log instead, for tests).
 *   `log`: one line per routed link. `openWindow`: a second app window on a checked Tracy address,
 *   for a Cmd+click the page answered with `window`. `onReady`: the page registered (or took its
 *   registration back), and whether it can open windows — a signed-in Tracy page.
 * @returns `open`, for `setWindowOpenHandler` after it denied (subscription hand-off goes first).
 */
export function installLinks(
  window: BrowserWindow,
  origin: string,
  {
    openExternal,
    log = () => {},
    openWindow = () => {},
    onReady = () => {}
  }: {
    openExternal: (url: string) => void
    log?: (entry: Record<string, unknown>) => void
    openWindow?: (url: string) => void
    onReady?: (ready: boolean, windows: boolean) => void
  }
): { open(details: { url: string; disposition?: string }): void } {
  const contents = window.webContents
  const router = createOpenRouter({
    origin,
    timeoutMs: LINK_ANSWER_MS,
    ask: (requestId: string, url: string, disposition: string | undefined) => {
      log({ event: 'ask', requestId, url, disposition })
      contents.send(LINK_CHANNELS.ask, { requestId, url, disposition })
    },
    execute: (requestId: string, decision: unknown) => {
      log({ event: 'execute', requestId, decision })
      contents.send(LINK_CHANNELS.execute, { requestId, decision })
    },
    openExternal: (url: string) => {
      log({ event: 'external', url })
      openExternal(url)
    },
    openWindow: (url: string) => {
      log({ event: 'window', url })
      openWindow(url)
    }
  })

  const fromProduct = (event: Electron.IpcMainEvent): boolean => {
    if (window.isDestroyed() || event.sender !== contents || event.senderFrame !== contents.mainFrame)
      return false
    try {
      return new URL(event.senderFrame.url).origin === origin
    } catch {
      return false
    }
  }
  // `true`/`false` from an app before protocol 2; `{ ready, windows }` since.
  const onReadyMessage = (event: Electron.IpcMainEvent, message: unknown): void => {
    if (!fromProduct(event)) return
    const said =
      message !== null && typeof message === 'object'
        ? (message as { ready?: unknown; windows?: unknown })
        : { ready: message }
    log({ event: 'ready', ready: said.ready === true, windows: said.windows === true })
    router.setReady(said.ready === true, { windows: said.windows === true })
    onReady(said.ready === true, said.windows === true)
  }
  const onAnswer = (event: Electron.IpcMainEvent, message: unknown): void => {
    if (!fromProduct(event) || message === null || typeof message !== 'object') return
    const { requestId, decision } = message as { requestId?: unknown; decision?: unknown }
    if (typeof requestId !== 'string') return
    log({ event: 'answer', requestId, decision })
    router.answer(requestId, decision)
  }
  // The Browser tab's "Open externally" / "Open in browser": the page names the system browser.
  const onOpenExternal = (event: Electron.IpcMainEvent, url: unknown): void => {
    if (!fromProduct(event) || !externalAllowed(url)) return
    log({ event: 'external', url, asked: 'page' })
    openExternal(url as string)
  }
  ipcMain.on(LINK_CHANNELS.ready, onReadyMessage)
  ipcMain.on(LINK_CHANNELS.answer, onAnswer)
  ipcMain.on(LINK_CHANNELS.openExternal, onOpenExternal)

  // A new document must register again; an answer from the old one would act on a page that is gone.
  // `did-navigate` = a main-frame document committed (not a download, not a same-document change).
  contents.on('did-navigate', () => router.reset())
  contents.on('render-process-gone', () => router.reset())
  window.on('closed', () => {
    router.reset()
    ipcMain.removeListener(LINK_CHANNELS.ready, onReadyMessage)
    ipcMain.removeListener(LINK_CHANNELS.answer, onAnswer)
    ipcMain.removeListener(LINK_CHANNELS.openExternal, onOpenExternal)
  })

  return {
    open(details) {
      router.open(details)
    }
  }
}
