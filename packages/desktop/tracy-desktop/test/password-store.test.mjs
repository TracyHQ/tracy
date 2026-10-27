/**
 * On Linux the app tells Chromium to keep its cookie key in the basic store (`src/password-store.js`):
 * with the default Secret Service store, a session whose login keyring is locked or missing (GNOME
 * auto-login) shows "Choose password for new keyring" and the window stays blank until it is answered.
 * macOS and Windows keep their OS store; a store named on the command line wins.
 *
 *   node --test packages/desktop/tracy-desktop/test/password-store.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

import { debugGuardFirst } from '../build/release-preflight.mjs'

const require = createRequire(import.meta.url)
const { passwordStoreSwitch } = require('../src/password-store.js')

const none = () => false

test('Linux keeps the cookie key in the basic store, so no keyring prompt can block the first window', () => {
  assert.equal(passwordStoreSwitch({ platform: 'linux', hasSwitch: none }), 'basic')
})

test('macOS and Windows keep their own OS store', () => {
  assert.equal(passwordStoreSwitch({ platform: 'darwin', hasSwitch: none }), null)
  assert.equal(passwordStoreSwitch({ platform: 'win32', hasSwitch: none }), null)
})

test('a store the person names on the command line wins', () => {
  const named = (s) => s === 'password-store'
  assert.equal(passwordStoreSwitch({ platform: 'linux', hasSwitch: named }), null)
})

test('main.js sets the store before app.whenReady, and after the debug-switch guard', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const applied = main.indexOf('applyPasswordStore(app')
  assert.notEqual(applied, -1, 'main.js applies the password store')
  assert.ok(applied < main.indexOf('whenReady'), 'before app.whenReady')
  assert.ok(main.indexOf('refuseDebugSwitches(') < applied, 'after the debug-switch guard')
  assert.equal(debugGuardFirst(main), true)
})
