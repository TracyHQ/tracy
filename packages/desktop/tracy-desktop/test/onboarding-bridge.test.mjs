/**
 * The onboarding bridge (`src/onboarding-bridge.js`): `app.onboarding.get()` / `close(input)` — whether
 * the first-run screen was closed on this device, kept in `<userData>/preferences.json`.
 *
 *   node --test packages/desktop/tracy-desktop/test/onboarding-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createOnboardingBridge } = require('../src/onboarding-bridge.js')
const { createPreferences } = require('../src/preferences.js')
const { ONBOARDING_CHANNELS } = require('../src/update-channels.js')

const ORIGIN = 'https://cowork.tracy.site'
const NOT_CLOSED = { flowVersion: 1, closedAt: null, outcome: null, picked: null }

function setup({ again = false } = {}) {
  const handlers = new Map()
  const ipcMain = {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel)
  }
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tracy-onboarding-')), 'preferences.json')
  const prefs = createPreferences({ file, log: () => {} })
  const bridge = createOnboardingBridge({ ipcMain, origin: ORIGIN, prefs, again, now: () => 1_000 })
  const contents = new EventEmitter()
  contents.mainFrame = { url: `${ORIGIN}/` }
  const window = new EventEmitter()
  window.webContents = contents
  window.isDestroyed = () => false
  bridge.attach(window)
  const top = { sender: contents, senderFrame: contents.mainFrame }
  const call = (channel, ...args) => handlers.get(channel)(top, ...args)
  return { ipcMain, bridge, call, file, prefs, contents }
}

test('a device that never closed the screen is told so', async () => {
  assert.deepEqual(await setup().call(ONBOARDING_CHANNELS.get), NOT_CLOSED)
})

test('closing records when, how and what was picked, and get reads it back', async () => {
  const { call, file } = setup()
  const closed = { flowVersion: 1, closedAt: 1_000, outcome: 'completed', picked: 'claude' }
  assert.deepEqual(await call(ONBOARDING_CHANNELS.close, { outcome: 'completed', picked: 'claude' }), closed)
  assert.deepEqual(await call(ONBOARDING_CHANNELS.get), closed)
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).onboarding, closed)
})

test('closing keeps the rest of the preferences', async () => {
  const { call, prefs } = setup()
  await prefs.update({ autoCheck: false })
  await call(ONBOARDING_CHANNELS.close, { outcome: 'dismissed', picked: null })
  assert.equal(prefs.read().autoCheck, false)
})

test('close takes an outcome of the two and an agent id or null; nothing else', async () => {
  const { call, file } = setup()
  for (const bad of [
    undefined,
    'completed',
    { outcome: 'won', picked: null },
    { outcome: 'completed', picked: 'Claude Code' },
    { outcome: 'completed', picked: 7 },
    { outcome: 'completed' },
    { outcome: 'completed', picked: null, closedAt: 5 }
  ])
    await assert.rejects(call(ONBOARDING_CHANNELS.close, bad), TypeError, JSON.stringify(bad))
  assert.equal(existsSync(file), false)
})

test('TRACY_DESKTOP_ONBOARDING=again: a closed screen reads as not closed, and nothing is written for it', async () => {
  const first = setup()
  await first.call(ONBOARDING_CHANNELS.close, { outcome: 'completed', picked: 'codex' })
  const before = readFileSync(first.file, 'utf8')
  const handlers = new Map()
  const ipcMain = { handle: (c, fn) => handlers.set(c, fn), removeHandler: () => {} }
  const bridge = createOnboardingBridge({
    ipcMain,
    origin: ORIGIN,
    prefs: first.prefs,
    again: true,
    now: () => 2_000
  })
  const contents = new EventEmitter()
  contents.mainFrame = { url: `${ORIGIN}/` }
  const window = Object.assign(new EventEmitter(), { webContents: contents, isDestroyed: () => false })
  bridge.attach(window)
  const top = { sender: contents, senderFrame: contents.mainFrame }
  const got = await handlers.get(ONBOARDING_CHANNELS.get)(top)
  assert.equal(got.closedAt, null)
  assert.equal(got.outcome, null)
  assert.equal(readFileSync(first.file, 'utf8'), before)
  // Closing it again in that run is recorded, and the run then reads it as closed.
  await handlers.get(ONBOARDING_CHANNELS.close)(top, { outcome: 'dismissed', picked: null })
  assert.equal((await handlers.get(ONBOARDING_CHANNELS.get)(top)).closedAt, 2_000)
})

test('a page that is not the product page is refused', async () => {
  const { ipcMain, contents } = setup()
  await assert.rejects(
    ipcMain.handlers.get(ONBOARDING_CHANNELS.get)({ sender: contents, senderFrame: { url: `${ORIGIN}/f` } }),
    /not allowed/
  )
})

test('dispose removes both handlers', () => {
  const { ipcMain, bridge } = setup()
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})

/** A product window whose page records what it is sent. */
function openableWindow(url = `${ORIGIN}/`) {
  const contents = new EventEmitter()
  contents.mainFrame = { url }
  contents.sent = []
  contents.send = (channel, ...args) => contents.sent.push([channel, ...args])
  const window = new EventEmitter()
  Object.assign(window, {
    webContents: contents,
    focused: false,
    calls: [],
    isDestroyed: () => false,
    isFocused: () => window.focused,
    isMinimized: () => false,
    restore: () => window.calls.push('restore'),
    show: () => window.calls.push('show'),
    focus: () => window.calls.push('focus')
  })
  return window
}

function openSetup() {
  const ipcMain = { handle: () => {}, removeHandler: () => {} }
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'tracy-onboarding-')), 'preferences.json')
  const bridge = createOnboardingBridge({
    ipcMain,
    origin: ORIGIN,
    prefs: createPreferences({ file, log: () => {} })
  })
  return bridge
}

test('Help › Getting started tells the focused product window to open the first-run screen', () => {
  const bridge = openSetup()
  const [a, b] = [openableWindow(), openableWindow()]
  bridge.attach(a)
  bridge.attach(b)
  b.focused = true
  assert.equal(bridge.openOnboarding(), true)
  assert.deepEqual(b.webContents.sent, [[ONBOARDING_CHANNELS.open]])
  assert.deepEqual(a.webContents.sent, [])
})

test('a window whose page left the pinned origin, or one never attached, is never told', () => {
  const bridge = openSetup()
  const away = openableWindow('https://evil.example/')
  const stranger = openableWindow()
  bridge.attach(away)
  away.focused = true
  stranger.focused = true
  assert.equal(bridge.openOnboarding(), false)
  assert.deepEqual(away.webContents.sent, [])
  assert.deepEqual(stranger.webContents.sent, [])
})

test('with no product window in front, the first one is brought forward and told', () => {
  const bridge = openSetup()
  const window = openableWindow()
  bridge.attach(window)
  assert.equal(bridge.openOnboarding(), true)
  assert.deepEqual(window.calls, ['show', 'focus'])
  assert.deepEqual(window.webContents.sent, [[ONBOARDING_CHANNELS.open]])
})

test('firstRun: true until the screen is closed on this device, then false', async () => {
  const { bridge, call } = setup()
  assert.equal(bridge.firstRun(), true)
  await call(ONBOARDING_CHANNELS.close, { outcome: 'dismissed', picked: null })
  assert.equal(bridge.firstRun(), false)
})

test('firstRun with TRACY_DESKTOP_ONBOARDING=again: true until closed in this run', async () => {
  const { bridge, call, prefs } = setup({ again: true })
  await prefs.update({ onboarding: { flowVersion: 1, closedAt: 5, outcome: 'completed', picked: null } })
  assert.equal(bridge.firstRun(), true)
  await call(ONBOARDING_CHANNELS.close, { outcome: 'completed', picked: null })
  assert.equal(bridge.firstRun(), false)
})
