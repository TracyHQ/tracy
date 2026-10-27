/**
 * Whether macOS lets this app show notifications — read in the MAIN process through a small N-API
 * addon (native/notify-permission/, council d in tasks/todo-desktop-onboard-v2.md). Electron 44 has no
 * API for it, and a helper process may not be attributed to the app, so the addon asks
 * `UNUserNotificationCenter.getNotificationSettings` from inside the app itself: asynchronously, read
 * only (it never asks for permission and never touches Electron's delegate).
 *
 * `read()` answers `allowed | denied | notDetermined | unknown`. `unknown` covers everything that is
 * not a system answer: not macOS, the addon missing (a run from source that never built it) or
 * failing to load, an exception, an answer outside the four, no reply within `timeoutMs`. The addon
 * is loaded once, on the first read; a failed load is logged once and not tried again.
 */
const path = require('node:path')

/** Where package.sh puts the built addon (`build/build-native.sh`); copied into the app with src/. */
const ADDON_FILE = path.join(__dirname, 'native', 'notify-permission.node')
const ANSWERS = new Set(['allowed', 'denied', 'notDetermined', 'unknown'])
const TIMEOUT_MS = 2_000

/**
 * @param {object} deps
 * @param {string} deps.platform - `process.platform`.
 * @param {() => { read: (callback: (answer: unknown) => void) => void }} [deps.load] - loads the addon.
 * @param {number} [deps.timeoutMs]
 * @param {(line: string) => void} [deps.log]
 */
function createPermissionReader({
  platform,
  load = () => require(ADDON_FILE),
  timeoutMs = TIMEOUT_MS,
  log = () => {}
}) {
  /** The addon, null once a load failed, undefined before the first read. */
  let addon
  /** The last answer logged, so each change is logged once. */
  let lastLogged

  const loaded = () => {
    if (addon !== undefined) return addon
    try {
      addon = load()
      if (typeof addon?.read !== 'function') throw new Error('the addon has no read()')
    } catch (error) {
      addon = null
      log(`notify permission: addon not loaded (${error.message}); the permission reads as unknown`)
    }
    return addon
  }

  return {
    /** @returns {Promise<'allowed' | 'denied' | 'notDetermined' | 'unknown'>} */
    read() {
      if (platform !== 'darwin') return Promise.resolve('unknown')
      const native = loaded()
      if (native === null) return Promise.resolve('unknown')
      return new Promise((resolve) => {
        // Not unref'd: a read in flight is worth waiting for (at most `timeoutMs`).
        const timer = setTimeout(() => resolve('unknown'), timeoutMs)
        const settle = (answer) => {
          clearTimeout(timer)
          const status = ANSWERS.has(answer) ? answer : 'unknown'
          if (status !== lastLogged) log(`notify permission: macOS answers ${status}`)
          lastLogged = status
          resolve(status)
        }
        try {
          native.read(settle)
        } catch {
          settle('unknown')
        }
      })
    }
  }
}

module.exports = { createPermissionReader, ADDON_FILE }
