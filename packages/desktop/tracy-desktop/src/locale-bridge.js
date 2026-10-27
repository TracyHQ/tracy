/**
 * The locale bridge: the product page's preload asks for the operating system's languages
 * (`app.getPreferredSystemLanguages()`), which it hands to dsh as `__DSH_LOCALE__` together with the
 * language picked in Settings (src/locale-bootstrap.js, shell/preload.ts). The page passes nothing.
 * Who may ask: src/bridge-guard.js.
 */
const { createProductBridge } = require('./bridge-guard.js')
const { LOCALE_CHANNELS } = require('./update-channels.js')

/**
 * @param {object} deps
 * @param {{ handle: Function, removeHandler: Function }} deps.ipcMain
 * @param {string} deps.origin - the pinned origin.
 * @param {() => unknown} deps.systemLanguages - `app.getPreferredSystemLanguages`.
 * @param {(line: string) => void} [deps.log]
 */
function createLocaleBridge({ ipcMain, origin, systemLanguages, log = () => {} }) {
  const languages = () => {
    try {
      const list = systemLanguages()
      return Array.isArray(list) ? list.filter((tag) => typeof tag === 'string') : []
    } catch {
      return []
    }
  }
  const bridge = createProductBridge({
    ipcMain,
    origin,
    label: 'locale bridge',
    log,
    handlers: { [LOCALE_CHANNELS.languages]: languages }
  })
  return { attach: bridge.attach, dispose: bridge.dispose }
}

module.exports = { createLocaleBridge }
