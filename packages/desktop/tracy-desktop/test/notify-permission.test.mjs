// The macOS notification permission reader (src/notify-permission.js), driven with fake addons:
// what the addon answers, how a missing or broken addon reads, and that a reply that never comes
// reads as unknown instead of hanging the status.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createPermissionReader, ADDON_FILE } = require('../src/notify-permission.js')

const addon = (answer) => ({ read: (callback) => setImmediate(() => callback(answer)) })

test('macOS: the addon answer is passed on, for each of its four values', async () => {
  for (const answer of ['allowed', 'denied', 'notDetermined', 'unknown']) {
    const reader = createPermissionReader({ platform: 'darwin', load: () => addon(answer) })
    assert.equal(await reader.read(), answer)
  }
})

test('an answer outside the four reads as unknown', async () => {
  for (const answer of ['granted', 7, undefined]) {
    const reader = createPermissionReader({ platform: 'darwin', load: () => addon(answer) })
    assert.equal(await reader.read(), 'unknown')
  }
})

test('not macOS: unknown, and the addon is never loaded', async () => {
  let loads = 0
  const reader = createPermissionReader({ platform: 'win32', load: () => (loads++, addon('allowed')) })
  assert.equal(await reader.read(), 'unknown')
  assert.equal(loads, 0)
})

test('an addon that fails to load reads unknown, is tried once, and says so once in the log', async () => {
  let loads = 0
  const logs = []
  const reader = createPermissionReader({
    platform: 'darwin',
    load: () => {
      loads++
      throw new Error('dlopen failed')
    },
    log: (line) => logs.push(line)
  })
  assert.equal(await reader.read(), 'unknown')
  assert.equal(await reader.read(), 'unknown')
  assert.equal(loads, 1)
  assert.equal(logs.length, 1)
  assert.match(logs[0], /dlopen failed/)
})

test('an addon that throws when asked reads unknown', async () => {
  const reader = createPermissionReader({
    platform: 'darwin',
    load: () => ({
      read: () => {
        throw new Error('boom')
      }
    })
  })
  assert.equal(await reader.read(), 'unknown')
})

test('a reply that never comes reads unknown after the timeout', async () => {
  const reader = createPermissionReader({
    platform: 'darwin',
    load: () => ({ read: () => {} }),
    timeoutMs: 20
  })
  assert.equal(await reader.read(), 'unknown')
})

test('the addon lives next to the sources, in src/native/, so package.sh copies it with src/', () => {
  assert.match(ADDON_FILE, /[/\\]src[/\\]native[/\\]notify-permission\.node$/)
})

test('each new system answer is logged once (the measurement on a signed build reads it)', async () => {
  const answers = ['notDetermined', 'notDetermined', 'denied']
  const logs = []
  const reader = createPermissionReader({
    platform: 'darwin',
    load: () => ({ read: (callback) => callback(answers.shift()) }),
    log: (line) => logs.push(line)
  })
  await reader.read()
  await reader.read()
  await reader.read()
  assert.deepEqual(logs, [
    'notify permission: macOS answers notDetermined',
    'notify permission: macOS answers denied'
  ])
})
