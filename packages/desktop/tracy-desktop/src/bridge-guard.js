/**
 * The part every `window.tracyDesktop.app` bridge shares (src/update-bridge.js, agents-bridge.js,
 * onboarding-bridge.js, notify-bridge.js): who may ask, and the handlers' lifetime.
 *
 * WHO MAY ASK (council 09/10/2026, tasks/todo-desktop-help-about.md §2.4): only the top frame of a
 * product window the bridge was attached to, while that frame shows the pinned origin. An iframe,
 * another window, a page the window navigated to elsewhere: refused (`not allowed`) and logged.
 * A handler gets the page's first argument only (validating it is the handler's job) and the window
 * that asked.
 */

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {Record<string, (arg: unknown, window: any) => unknown>} deps.handlers - by channel.
 * @param {string} deps.label - names the bridge in log lines.
 * @param {(line: string) => void} [deps.log]
 */
function createProductBridge({ ipcMain, origin, handlers, label, log = () => {} }) {
  /** @type {Set<any>} */
  const windows = new Set()

  const showsOrigin = (frame) => {
    try {
      return new URL(frame.url).origin === origin
    } catch {
      return false
    }
  }

  /** The attached window whose top frame on the pinned origin sent `event`, or null. */
  const trusted = (event) => {
    for (const window of windows) {
      if (window.isDestroyed()) continue
      const contents = window.webContents
      if (event?.sender !== contents) continue
      if (event.senderFrame !== contents.mainFrame) return null
      return showsOrigin(event.senderFrame) ? window : null
    }
    return null
  }

  for (const [channel, handler] of Object.entries(handlers))
    ipcMain.handle(channel, async (event, ...args) => {
      const window = trusted(event)
      if (window === null) {
        log(`${label}: ${channel} refused (not the product page)`)
        throw new Error('not allowed')
      }
      return handler(args[0], window)
    })

  return {
    /** A product window, opened on the pinned origin. */
    attach(window) {
      windows.add(window)
      window.on('closed', () => windows.delete(window))
    },
    /** The attached windows still alive and showing the pinned origin. */
    productWindows() {
      return [...windows].filter(
        (window) => !window.isDestroyed() && showsOrigin(window.webContents.mainFrame)
      )
    },
    dispose() {
      for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
      windows.clear()
    }
  }
}

module.exports = { createProductBridge }
