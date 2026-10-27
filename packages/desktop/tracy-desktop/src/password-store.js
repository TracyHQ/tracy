/**
 * Where Chromium keeps the key it encrypts the cookie store with, on Linux.
 *
 * By default Chromium asks the Secret Service (gnome-keyring, KWallet) for that key, and it creates and
 * unlocks the default keyring to get it: with no login keyring, or a locked one (GNOME auto-login never
 * unlocks it), the desktop shows "Choose password for new keyring" / "Unlock keyring" at first launch
 * and the window stays blank until the person answers. Chromium has no "use the keyring only if it is
 * already unlocked" mode (components/os_crypt/async/browser/freedesktop_secret_key_provider.cc: no
 * default collection -> CreateCollection prompt; then Unlock prompt).
 *
 * The app stores no secret of its own through Chromium: there is no `safeStorage` call in the app,
 * its shell, dsh or dsh-passwords. What the key protects is the cookie store, chiefly the session
 * cookie. So on Linux the app uses the `basic` store: the cookie file is obfuscated with Chromium's
 * fixed key, protected at rest by the file's owner-only permissions, not by the keyring. A store named
 * on the command line (`--password-store=gnome-libsecret`) still wins. macOS (Keychain) and Windows
 * (DPAPI) never prompt and keep their OS store.
 *
 * Not probing the keyring at launch on purpose: cookies written under the keyring's key cannot be read
 * under the basic key, so a store that changes between launches signs the person out whenever their
 * keyring happens to be locked.
 */

/**
 * The `--password-store` value this launch must add, or null to leave Chromium's choice alone.
 * @param {{ platform: string, hasSwitch: (name: string) => boolean }} launch
 * @returns {'basic' | null}
 */
function passwordStoreSwitch({ platform, hasSwitch }) {
  if (platform !== 'linux') return null
  if (hasSwitch('password-store')) return null
  return 'basic'
}

/**
 * Add the switch before `app.whenReady()`; Chromium reads it when the cookie store opens.
 * @param {import('electron').App} app
 * @param {string} platform - `process.platform`.
 */
function applyPasswordStore(app, platform) {
  const store = passwordStoreSwitch({ platform, hasSwitch: (s) => app.commandLine.hasSwitch(s) })
  if (store !== null) app.commandLine.appendSwitch('password-store', store)
}

module.exports = { passwordStoreSwitch, applyPasswordStore }
