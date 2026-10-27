/**
 * The blocked screen's IPC (tasks/todo-desktop-update-policy.md C7): the main-process half of
 * `window.tracyBlocked` (src/blocked-preload.js). Its own guard, by `webContents`: only the top frame
 * of a window this bridge was attached to, while it shows the local blocked page — never a product
 * page, never a frame. The page reads its view and presses one of the three buttons it shows; it
 * passes nothing else. The product bridge (src/update-bridge.js) is not widened for it.
 */
const { BLOCKED_CHANNELS } = require('./update-channels.js')

const ACTIONS = new Set(['update', 'retry', 'download'])

/**
 * @param {{
 *   ipcMain: { handle: Function, removeHandler: Function },
 *   pageUrl: string,
 *   view: () => object,
 *   act: (action: 'update' | 'retry' | 'download') => Promise<void> | void,
 *   log: (line: string) => void
 * }} deps - `pageUrl`: the file URL of src/blocked.html.
 */
function createBlockedBridge({ ipcMain, pageUrl, view, act, log }) {
  const windows = new Set()
  const showsPage = (frame) => typeof frame?.url === 'string' && frame.url.split(/[?#]/)[0] === pageUrl

  const trusted = (event) => {
    for (const window of windows) {
      if (window.isDestroyed()) continue
      const contents = window.webContents
      if (event?.sender !== contents) continue
      return event.senderFrame === contents.mainFrame && showsPage(event.senderFrame)
    }
    return false
  }
  const guarded = (channel, handler) =>
    ipcMain.handle(channel, async (event, arg) => {
      if (!trusted(event)) {
        log(`blocked screen: ${channel} refused (not the blocked page)`)
        throw new Error('not allowed')
      }
      return handler(arg)
    })

  guarded(BLOCKED_CHANNELS.get, () => view())
  guarded(BLOCKED_CHANNELS.act, async (action) => {
    if (!ACTIONS.has(action)) {
      log('blocked screen: an unknown action was refused')
      throw new Error('not allowed')
    }
    await act(action)
    return view()
  })

  return {
    attach(window) {
      windows.add(window)
      window.on('closed', () => windows.delete(window))
    },
    /** Send the current view to every blocked window still showing the page. */
    push(next) {
      for (const window of windows)
        if (!window.isDestroyed() && showsPage(window.webContents.mainFrame))
          window.webContents.send(BLOCKED_CHANNELS.state, next)
    },
    dispose() {
      for (const channel of [BLOCKED_CHANNELS.get, BLOCKED_CHANNELS.act]) ipcMain.removeHandler(channel)
      windows.clear()
    }
  }
}

module.exports = { createBlockedBridge }
