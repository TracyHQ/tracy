/**
 * The update bridge (`src/update-bridge.js`): what the product page may ask the main process about
 * the app and its updates, and who may ask. Driven with a stand-in for `ipcMain` and for windows;
 * the same rules against real Electron frames are measured by
 * tasks/evidence/desktop-help-about/ipc-guard/run.mjs.
 *
 *   node --test packages/desktop/tracy-desktop/test/update-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createUpdateBridge, toUpdateDto } = require('../src/update-bridge.js')
const { UPDATE_CHANNELS } = require('../src/update-channels.js')
const { initialUpdateState, reduceUpdate } = require('../src/update-state.js')

const ORIGIN = 'https://cowork.tracy.site'

function fakeIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, fn) => {
      if (handlers.has(channel)) throw new Error(`second handler for ${channel}`)
      handlers.set(channel, fn)
    },
    removeHandler: (channel) => handlers.delete(channel)
  }
}

function fakeWindow(url = `${ORIGIN}/`) {
  const contents = new EventEmitter()
  contents.mainFrame = { url }
  contents.sent = []
  contents.send = (channel, payload) => contents.sent.push([channel, payload])
  const window = new EventEmitter()
  window.webContents = contents
  window.destroyed = false
  window.isDestroyed = () => window.destroyed
  return window
}

function fakeFace() {
  const watchers = new Set()
  const face = {
    state: initialUpdateState({ autoCheck: true }),
    calls: [],
    info: () => ({ version: '0.3.0-dev.4', arch: 'arm64', channel: 'dev', updates: true }),
    getState: () => face.state,
    onState: (fn) => {
      watchers.add(fn)
      return () => watchers.delete(fn)
    },
    push: (event) => {
      face.state = reduceUpdate(face.state, event)
      for (const fn of watchers) fn(face.state)
    },
    check: async () => {
      face.calls.push('check')
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
    restart: async () => {
      face.calls.push('restart')
      return true
    },
    seen: async () => face.calls.push('seen'),
    setNotify: async (on) => face.calls.push(`notify:${on}`),
    openChangelog: () => face.calls.push('changelog'),
    download: () => {
      face.calls.push('download')
      return true
    },
    setAutoCheck: async (on) => {
      face.calls.push(`auto:${on}`)
    }
  }
  return face
}

function setup() {
  const ipcMain = fakeIpcMain()
  const face = fakeFace()
  const clock = { now: 0 }
  const bridge = createUpdateBridge({ ipcMain, origin: ORIGIN, face, now: () => clock.now, log: () => {} })
  const window = fakeWindow()
  bridge.attach(window)
  const call = (channel, event, ...args) => ipcMain.handlers.get(channel)(event, ...args)
  const top = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  return { ipcMain, face, clock, bridge, window, call, top }
}

test('the product window top frame on the pinned origin reads the app info and the state', async () => {
  const { call, top } = setup()
  assert.deepEqual(await call(UPDATE_CHANNELS.info, top), {
    protocolVersion: 3,
    version: '0.3.0-dev.4',
    arch: 'arm64',
    channel: 'dev',
    updates: true
  })
  assert.equal((await call(UPDATE_CHANNELS.getState, top)).status, 'idle')
})

test('a subframe, another window, or the page after it left the origin is refused', async () => {
  const { call, window } = setup()
  const contents = window.webContents
  const iframe = { url: `${ORIGIN}/frame` }
  await assert.rejects(
    call(UPDATE_CHANNELS.getState, { sender: contents, senderFrame: iframe }),
    /not allowed/
  )
  const stranger = fakeWindow()
  await assert.rejects(
    call(UPDATE_CHANNELS.check, {
      sender: stranger.webContents,
      senderFrame: stranger.webContents.mainFrame
    }),
    /not allowed/
  )
  contents.mainFrame.url = 'https://evil.example/'
  await assert.rejects(
    call(UPDATE_CHANNELS.info, { sender: contents, senderFrame: contents.mainFrame }),
    /not allowed/
  )
})

test('a closed window is forgotten', async () => {
  const { call, window, top } = setup()
  window.emit('closed')
  await assert.rejects(call(UPDATE_CHANNELS.info, top), /not allowed/)
})

test('the switch takes a boolean and nothing else', async () => {
  const { call, top, face } = setup()
  for (const bad of ['true', 1, null, undefined, { on: true }])
    await assert.rejects(call(UPDATE_CHANNELS.setAutoCheck, top, bad), /boolean/)
  await call(UPDATE_CHANNELS.setAutoCheck, top, false)
  assert.deepEqual(face.calls, ['auto:false'])
})

test('a burst of check requests starts one check; another comes only after a pause', async () => {
  const { call, top, face, clock } = setup()
  await Promise.all([1, 2, 3, 4, 5].map(() => call(UPDATE_CHANNELS.check, top)))
  assert.deepEqual(face.calls, ['check'])
  clock.now = 1_000
  await call(UPDATE_CHANNELS.check, top)
  assert.deepEqual(face.calls, ['check'])
  clock.now = 10_000
  await call(UPDATE_CHANNELS.check, top)
  assert.deepEqual(face.calls, ['check', 'check'])
})

test('actions take no arguments from the page: no feed, channel, URL or path reaches the updater', async () => {
  const { call, top, face } = setup()
  face.download = (...args) => {
    face.calls.push(['download', args.length])
    return true
  }
  face.openChangelog = (...args) => face.calls.push(['changelog', args.length])
  await call(UPDATE_CHANNELS.download, top, 'https://evil.example/x.dmg')
  await call(UPDATE_CHANNELS.openChangelog, top, 'https://evil.example/')
  await call(UPDATE_CHANNELS.whatsNewSeen, top, { page: '9.9' })
  assert.deepEqual(face.calls, [['download', 0], ['changelog', 0], 'seen'])
})

test('every action answers with the state after it', async () => {
  const { call, top, face } = setup()
  face.push({ type: 'checking' })
  const answer = await call(UPDATE_CHANNELS.whatsNewSeen, top)
  assert.equal(answer.status, 'checking')
  assert.equal(answer.revision, face.state.revision)
})

test('state changes go to the product window only, and only while it shows the pinned origin', () => {
  const { face, window } = setup()
  const other = fakeWindow()
  face.push({ type: 'checking' })
  assert.equal(window.webContents.sent.length, 1)
  assert.equal(window.webContents.sent[0][0], UPDATE_CHANNELS.state)
  assert.equal(other.webContents.sent.length, 0)
  window.webContents.mainFrame.url = 'https://evil.example/'
  face.push({ type: 'not-available', at: 1 })
  assert.equal(window.webContents.sent.length, 1)
})

test('what crosses IPC is the listed fields only', () => {
  const dto = toUpdateDto({ ...initialUpdateState({ autoCheck: true }), secret: 'x', error: new Error('y') })
  assert.deepEqual(Object.keys(dto).sort(), [
    'autoCheck',
    'lastCheckedAt',
    'nextRetryAt',
    'percent',
    'policy',
    'readySince',
    'releaseNotes',
    'revision',
    'showWhatsNew',
    'stagedVersion',
    'status',
    'version',
    'whatsNew'
  ])
})

test("policy and What's new cross as copies of their known fields, nothing else", () => {
  const dto = toUpdateDto({
    ...initialUpdateState({ autoCheck: true }),
    policy: { level: 'warn', minimumVersion: '0.6.0', after: 5, offline: false, secret: 1 },
    whatsNew: { pending: { from: '0.5.1', to: '0.6.0', page: '0.6', x: 1 }, notify: true },
    showWhatsNew: true
  })
  assert.deepEqual(dto.policy, { level: 'warn', minimumVersion: '0.6.0', after: 5 })
  assert.deepEqual(dto.whatsNew, { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' })
  assert.equal(dto.showWhatsNew, true)
  const none = toUpdateDto({
    ...initialUpdateState({ autoCheck: true }),
    whatsNew: { pending: null, notify: false }
  })
  assert.equal(none.whatsNew, null)
  assert.equal(none.showWhatsNew, false)
  assert.equal(none.policy, null)
})

test("the What's new switch takes a boolean and nothing else; seen answers with the state", async () => {
  const { call, top, face } = setup()
  for (const bad of ['true', 1, null, undefined])
    await assert.rejects(call(UPDATE_CHANNELS.whatsNewSetNotify, top, bad), /boolean/)
  await call(UPDATE_CHANNELS.whatsNewSetNotify, top, false)
  assert.equal((await call(UPDATE_CHANNELS.whatsNewSeen, top)).status, 'idle')
  assert.deepEqual(face.calls, ['notify:false', 'seen'])
})

test('openHelp asks ONE product window to open Help & about: the one named, else the first that shows the origin', () => {
  const { bridge, window, ipcMain, face } = setup()
  const second = fakeWindow()
  bridge.attach(second)
  assert.equal(bridge.openHelp(second), true)
  assert.deepEqual(
    second.webContents.sent.map(([c]) => c),
    [UPDATE_CHANNELS.openHelp]
  )
  assert.equal(window.webContents.sent.length, 0)
  assert.equal(bridge.openHelp(), true)
  assert.deepEqual(
    window.webContents.sent.map(([c]) => c),
    [UPDATE_CHANNELS.openHelp]
  )
  window.webContents.mainFrame.url = 'https://evil.example/'
  second.destroyed = true
  assert.equal(bridge.openHelp(), false)
  void ipcMain
  void face
})

test('dispose removes every handler', () => {
  const { ipcMain, bridge } = setup()
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})

test('Download pressed again and again opens one browser tab per pause', async () => {
  const { call, top, face, clock } = setup()
  for (let i = 0; i < 5; i++) await call(UPDATE_CHANNELS.download, top)
  assert.deepEqual(face.calls, ['download'])
  clock.now = 10_000
  await call(UPDATE_CHANNELS.download, top)
  assert.deepEqual(face.calls, ['download', 'download'])
})
