/**
 * Who may call `window.tracyDesktop.app` (`src/bridge-guard.js`): the top frame of a product window
 * the bridge was attached to, while that frame shows the pinned origin. Shared by every bridge.
 *
 *   node --test packages/desktop/tracy-desktop/test/bridge-guard.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createProductBridge } = require('../src/bridge-guard.js')

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
  const window = new EventEmitter()
  window.webContents = contents
  window.destroyed = false
  window.isDestroyed = () => window.destroyed
  return window
}

function setup() {
  const ipcMain = fakeIpcMain()
  const logs = []
  const seen = []
  const bridge = createProductBridge({
    ipcMain,
    origin: ORIGIN,
    label: 'test bridge',
    log: (line) => logs.push(line),
    handlers: {
      'x:echo': (arg, window) => {
        seen.push([arg, window])
        return arg
      }
    }
  })
  const window = fakeWindow()
  bridge.attach(window)
  const top = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const call = (event, ...args) => ipcMain.handlers.get('x:echo')(event, ...args)
  return { ipcMain, bridge, window, top, call, logs, seen }
}

test('the top frame of an attached window on the pinned origin is answered; the handler learns which window', async () => {
  const { call, top, seen, window } = setup()
  assert.equal(await call(top, 'hi', 'ignored'), 'hi')
  assert.deepEqual(seen, [['hi', window]])
})

test('a subframe, another window, a page that left the origin, a closed window: refused and logged', async () => {
  const { call, window, logs, bridge } = setup()
  const contents = window.webContents
  await assert.rejects(call({ sender: contents, senderFrame: { url: `${ORIGIN}/f` } }), /not allowed/)
  const stranger = fakeWindow()
  await assert.rejects(
    call({ sender: stranger.webContents, senderFrame: stranger.webContents.mainFrame }),
    /not allowed/
  )
  contents.mainFrame.url = 'https://evil.example/'
  await assert.rejects(call({ sender: contents, senderFrame: contents.mainFrame }), /not allowed/)
  assert.deepEqual(bridge.productWindows(), [])
  contents.mainFrame.url = `${ORIGIN}/`
  window.emit('closed')
  await assert.rejects(call({ sender: contents, senderFrame: contents.mainFrame }), /not allowed/)
  assert.equal(logs.length, 4)
  assert.match(logs[0], /test bridge: x:echo refused/)
})

test('productWindows lists the attached windows that are alive and on the origin', () => {
  const { bridge, window } = setup()
  const other = fakeWindow()
  bridge.attach(other)
  assert.deepEqual(bridge.productWindows(), [window, other])
  other.destroyed = true
  assert.deepEqual(bridge.productWindows(), [window])
})

test('dispose removes every handler', () => {
  const { ipcMain, bridge } = setup()
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})
