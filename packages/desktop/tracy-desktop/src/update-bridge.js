/**
 * The update bridge: the main-process half of `window.tracyDesktop.app` (shell/preload.ts), which
 * Settings › Help & about reads. Channels in src/update-channels.js.
 *
 * WHO MAY ASK: src/bridge-guard.js — only the top frame of a product window this bridge was attached
 * to, while that frame shows the pinned origin. The page names no feed, channel, URL or path —
 * every action takes no argument, except the two switches, which take a boolean and nothing else. A
 * burst of check requests starts one check; a burst of Download presses opens the browser once.
 * Restart is single-flight in the updater (one native question at a time), the switches are saved one
 * write at a time. The changelog link is built by the main process from the bundle
 * (src/bundle-notes.js `changelogUrl`), never from the page.
 *
 * PROTOCOL 3 (tasks/todo-desktop-update-policy.md D4–D6): the state also carries `readySince`,
 * `stagedVersion`, the minimum version `policy` verdict and `whatsNew`; `openHelp` pushes to ONE
 * product window the request to open Settings › Help & about (a notification pressed, Help › What's
 * New…).
 *
 * WHAT GOES BACK: `toUpdateDto` of the state, the listed fields only, and only to attached windows
 * that still show the pinned origin.
 *
 * ACCEPTED RISK, written down on purpose: script running on the pinned origin (an XSS there) can
 * call these too — turn automatic checks off, ask for a check, bring up the Restart question. None
 * of it installs anything without the person answering the native dialog.
 */
const { createProductBridge } = require('./bridge-guard.js')
const { APP_BRIDGE_VERSION, UPDATE_CHANNELS } = require('./update-channels.js')

/** A check asked for within this long after the last one started does not start another. */
const CHECK_GAP_MS = 3_000

const DTO_FIELDS = [
  'revision',
  'status',
  'version',
  'percent',
  'releaseNotes',
  'lastCheckedAt',
  'nextRetryAt',
  'autoCheck',
  'readySince',
  'stagedVersion'
]

/**
 * The state as it crosses IPC: the listed fields, and copies of the known fields of `policy` and
 * `whatsNew` (the page's contract: protocol 3).
 * @param {import('./update-state.js').UpdateState & { policy?: any, whatsNew?: any }} state
 */
function toUpdateDto(state) {
  const dto = {}
  for (const key of DTO_FIELDS) dto[key] = state[key] ?? null
  const policy = state.policy
  dto.policy =
    policy && typeof policy.level === 'string'
      ? { level: policy.level, minimumVersion: policy.minimumVersion ?? null, after: policy.after ?? null }
      : null
  const pending = state.whatsNew?.pending
  dto.whatsNew = pending
    ? { pending: true, from: pending.from ?? null, to: pending.to, page: pending.page }
    : null
  dto.showWhatsNew = state.whatsNew?.notify === true
  return dto
}

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {{
 *   info: () => { version: string, arch: string, channel: string | null, updates: boolean },
 *   getState: () => import('./update-state.js').UpdateState,
 *   onState: (fn: (state: import('./update-state.js').UpdateState) => void) => () => void,
 *   check: () => Promise<void>, restart: () => Promise<boolean>,
 *   download: () => boolean, setAutoCheck: (on: boolean) => Promise<void>,
 *   seen: () => Promise<void>, setNotify: (on: boolean) => Promise<void>, openChangelog: () => void
 * }} deps.face - the updater and What's new, or stand-ins that are off.
 * @param {() => number} [deps.now]
 * @param {(line: string) => void} [deps.log]
 */
function createUpdateBridge({ ipcMain, origin, face, now = Date.now, log = () => {} }) {
  let lastCheckAt = Number.NEGATIVE_INFINITY
  let checking = null
  const check = () => {
    if (checking) return checking
    if (now() - lastCheckAt < CHECK_GAP_MS) return Promise.resolve()
    lastCheckAt = now()
    checking = Promise.resolve(face.check()).finally(() => {
      checking = null
    })
    return checking
  }

  // Download opens the system browser: a run of presses opens it once per pause.
  let lastDownloadAt = Number.NEGATIVE_INFINITY
  const download = () => {
    if (now() - lastDownloadAt < CHECK_GAP_MS) return
    lastDownloadAt = now()
    face.download()
  }

  const state = () => toUpdateDto(face.getState())
  // Handlers, each answering with the state after it. Only the switch reads the page's argument.
  const bridge = createProductBridge({
    ipcMain,
    origin,
    label: 'update bridge',
    log,
    handlers: {
      [UPDATE_CHANNELS.info]: () => ({ protocolVersion: APP_BRIDGE_VERSION, ...face.info() }),
      [UPDATE_CHANNELS.getState]: state,
      [UPDATE_CHANNELS.check]: async () => {
        await check()
        return state()
      },
      [UPDATE_CHANNELS.restart]: async () => {
        await face.restart()
        return state()
      },
      [UPDATE_CHANNELS.whatsNewSeen]: async () => {
        await face.seen()
        return state()
      },
      [UPDATE_CHANNELS.whatsNewSetNotify]: async (on) => {
        if (typeof on !== 'boolean') throw new TypeError('notify must be a boolean')
        await face.setNotify(on)
        return state()
      },
      [UPDATE_CHANNELS.openChangelog]: () => {
        face.openChangelog()
      },
      [UPDATE_CHANNELS.download]: () => {
        download()
        return state()
      },
      [UPDATE_CHANNELS.setAutoCheck]: async (on) => {
        if (typeof on !== 'boolean') throw new TypeError('autoCheck must be a boolean')
        await face.setAutoCheck(on)
        return state()
      }
    }
  })

  const offState = face.onState((next) => {
    const dto = toUpdateDto(next)
    for (const window of bridge.productWindows()) window.webContents.send(UPDATE_CHANNELS.state, dto)
  })

  return {
    /** A product window, opened on the pinned origin. */
    attach: bridge.attach,
    /**
     * Ask ONE product window to open Settings › Help & about: `window` when it is one that shows the
     * pinned origin, else the first such window. @returns {boolean} whether one was asked.
     */
    openHelp(window) {
      const windows = bridge.productWindows()
      const target = windows.includes(window) ? window : windows[0]
      if (target === undefined) return false
      target.webContents.send(UPDATE_CHANNELS.openHelp)
      return true
    },
    dispose() {
      offState()
      bridge.dispose()
    }
  }
}

module.exports = { createUpdateBridge, toUpdateDto }
