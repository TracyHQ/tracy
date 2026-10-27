/**
 * What the app calls itself on each operating system it ships for (macOS, Windows, Linux).
 *
 * Pure, with the platform and the product name passed in, so every branch is tested on any host
 * (test/platform.test.mjs). main.js passes `process.platform` and `app.getName()`.
 */

const PRODUCT = 'Tracy Cowork'

/** The approve page's device line, by `process.platform`. */
const DEVICE_SUFFIX = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' }

/**
 * How the browser approve page names this app (`POST /auth/link/browser` `device`).
 * @param {string} platform - `process.platform`.
 * @returns {string}
 */
function deviceName(platform) {
  const suffix = DEVICE_SUFFIX[platform]
  return suffix === undefined ? PRODUCT : `${PRODUCT} for ${suffix}`
}

/**
 * The ids the operating system groups this app's windows by.
 *
 * `appUserModelId` (Windows: taskbar grouping, pins, notifications) is the variant's macOS bundle id,
 * derived from the product name exactly as build/package.sh derives that id from it: `Tracy Cowork`
 * is `ai.tracy.cowork`, `Tracy Cowork <Word>` is `ai.tracy.cowork.<word>`. The installer's shortcut
 * must carry the same id, or Windows shows the running app as a second taskbar button.
 *
 * `wmClass` (Linux): the class Electron gives every window is the app name, so the `.desktop`
 * file's `StartupWMClass` must be the product name for the dock to tie windows to the launcher.
 * @param {string} productName - `app.getName()`: the packaged `productName`, or a source run's name.
 * @returns {{ appUserModelId: string | null, wmClass: string }} `appUserModelId` is null for a name
 *   that is no Tracy Cowork variant.
 */
function appIdentity(productName) {
  const match = /^Tracy Cowork(?: ([A-Za-z][A-Za-z0-9]{0,15}))?$/.exec(productName)
  const appUserModelId =
    match === null ? null : `ai.tracy.cowork${match[1] === undefined ? '' : `.${match[1].toLowerCase()}`}`
  return { appUserModelId, wmClass: productName }
}

module.exports = { appIdentity, deviceName }
