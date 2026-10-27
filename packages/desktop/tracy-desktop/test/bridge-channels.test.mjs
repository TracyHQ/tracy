/**
 * The channel names of `window.tracyDesktop.app` (`src/update-channels.js`): the preload and the main
 * process both read them from that one module, so the one way they can go wrong is two channels
 * sharing a name. What `protocolVersion` the page is told is run in update-bridge.test.mjs.
 *
 *   node --test packages/desktop/tracy-desktop/test/bridge-channels.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const channels = require('../src/update-channels.js')

// Every `*_CHANNELS` group the module exports, so a new group (Website Opportunities, Blocked…) is covered.
const all = Object.entries(channels)
  .filter(([group]) => group.endsWith('_CHANNELS'))
  .flatMap(([, group]) => Object.values(group))

test('no two channels share a name', () => {
  assert.ok(all.includes(channels.WEBSITE_OPPORTUNITIES_CHANNELS.open))
  assert.equal(new Set(all).size, all.length)
})

test('every channel is in the app’s own namespace, so none collides with Electron’s or a page’s', () => {
  for (const name of all) assert.match(name, /^tracy-desktop:[a-z-]+$/)
})
