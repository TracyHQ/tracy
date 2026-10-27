/**
 * The notification sounds the picker offers (`src/notify-sounds.js`): the system default, or one of
 * the macOS alert sounds by name. A name, never a path: Electron looks it up in the system's sounds.
 *
 *   node --test packages/desktop/tracy-desktop/test/notify-sounds.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { NOTIFY_SOUNDS, isNotifySound } = require('../src/notify-sounds.js')

// Which names macOS ships is a fact about the system, not about this code: no test pins the list.
test('the list is fixed and names each sound once', () => {
  assert.ok(Object.isFrozen(NOTIFY_SOUNDS))
  assert.ok(NOTIFY_SOUNDS.length > 0)
  assert.equal(new Set(NOTIFY_SOUNDS).size, NOTIFY_SOUNDS.length)
})

test('a sound is the default or a name of the list, exactly', () => {
  assert.equal(isNotifySound('system'), true)
  assert.equal(isNotifySound('Tink'), true)
  for (const bad of [
    'tink',
    'Tink.aiff',
    '/System/Library/Sounds/Tink.aiff',
    '',
    'toString',
    1,
    null,
    undefined
  ])
    assert.equal(isNotifySound(bad), false, String(bad))
})
