/**
 * What the app calls itself on each operating system: the device name the sign-in approve page
 * shows, and the ids Windows and Linux group its windows, taskbar pins and notifications by.
 * The platform is passed in, so every branch runs on any host.
 *
 *   node --test packages/desktop/tracy-desktop/test/platform.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { appIdentity, deviceName } = require('../src/platform.js')

test('the approve page names the app after the operating system it runs on', () => {
  assert.equal(deviceName('darwin'), 'Tracy Cowork for Mac')
  assert.equal(deviceName('win32'), 'Tracy Cowork for Windows')
  assert.equal(deviceName('linux'), 'Tracy Cowork for Linux')
})

test('an operating system the app does not ship for gets a plain name, never another one', () => {
  assert.equal(deviceName('freebsd'), 'Tracy Cowork')
})

test('each variant has its own Windows app id, the same one its macOS bundle id is', () => {
  // build/package.sh: stable ai.tracy.cowork, dev ai.tracy.cowork.dev, preview ai.tracy.cowork.preview,
  // a test build ai.tracy.cowork.<lowercased test name>.
  assert.equal(appIdentity('Tracy Cowork').appUserModelId, 'ai.tracy.cowork')
  assert.equal(appIdentity('Tracy Cowork Dev').appUserModelId, 'ai.tracy.cowork.dev')
  assert.equal(appIdentity('Tracy Cowork Preview').appUserModelId, 'ai.tracy.cowork.preview')
  assert.equal(appIdentity('Tracy Cowork Upd2').appUserModelId, 'ai.tracy.cowork.upd2')
})

test("the Linux window class is the product name, the class Electron gives the window, so a .desktop file's StartupWMClass matches", () => {
  assert.equal(appIdentity('Tracy Cowork').wmClass, 'Tracy Cowork')
  assert.equal(appIdentity('Tracy Cowork Dev').wmClass, 'Tracy Cowork Dev')
})

test('a name that is not a Tracy Cowork variant gets no id rather than a made-up one', () => {
  assert.equal(appIdentity('Electron').appUserModelId, null)
  assert.equal(appIdentity('@tracy/desktop').appUserModelId, null)
})
