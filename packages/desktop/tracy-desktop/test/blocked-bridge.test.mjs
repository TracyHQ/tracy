/**
 * The blocked screen's own IPC (src/blocked-bridge.js, src/blocked-preload.js): only the top frame of
 * a blocked window showing the local blocked page may ask, and only for the three actions it shows.
 * The product bridge (`tracyDesktop.app`) is not widened for it.
 *
 *   node --test packages/desktop/tracy-desktop/test/blocked-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createBlockedBridge } = require('../src/blocked-bridge.js')
const { BLOCKED_CHANNELS } = require('../src/update-channels.js')

const PAGE = 'file:///Applications/Tracy%20Cowork.app/Contents/Resources/app/src/blocked.html'

function fakeIpcMain() {
  const handlers = new Map()
  return { handlers, handle: (c, fn) => handlers.set(c, fn), removeHandler: (c) => handlers.delete(c) }
}
function fakeWindow(url = PAGE) {
  const contents = new EventEmitter()
  contents.mainFrame = { url }
  contents.sent = []
  contents.send = (c, v) => contents.sent.push([c, v])
  const window = new EventEmitter()
  window.webContents = contents
  window.destroyed = false
  window.isDestroyed = () => window.destroyed
  return window
}

function setup() {
  const ipcMain = fakeIpcMain()
  const acted = []
  const bridge = createBlockedBridge({
    ipcMain,
    pageUrl: PAGE,
    view: () => ({ title: 'Update required' }),
    act: async (action) => acted.push(action),
    log: () => {}
  })
  const window = fakeWindow()
  bridge.attach(window)
  const call = (channel, sender, frame, ...args) =>
    ipcMain.handlers.get(channel)({ sender, senderFrame: frame }, ...args)
  return { bridge, window, call, acted, ipcMain }
}

test('the blocked page reads its view and presses its buttons', async () => {
  const { window, call, acted } = setup()
  const top = window.webContents.mainFrame
  assert.deepEqual(await call(BLOCKED_CHANNELS.get, window.webContents, top), { title: 'Update required' })
  for (const action of ['update', 'retry', 'download'])
    await call(BLOCKED_CHANNELS.act, window.webContents, top, action)
  assert.deepEqual(acted, ['update', 'retry', 'download'])
})

test('anything else is refused: another action, another window, a subframe, the page navigated elsewhere', async () => {
  const { window, call } = setup()
  const top = window.webContents.mainFrame
  await assert.rejects(call(BLOCKED_CHANNELS.act, window.webContents, top, 'install-anything'), /not allowed/)
  const product = fakeWindow('https://cowork.tracy.ai/')
  await assert.rejects(
    call(BLOCKED_CHANNELS.get, product.webContents, product.webContents.mainFrame),
    /not allowed/
  )
  await assert.rejects(call(BLOCKED_CHANNELS.get, window.webContents, { url: PAGE }), /not allowed/)
  window.webContents.mainFrame.url = 'https://evil.example/'
  await assert.rejects(
    call(BLOCKED_CHANNELS.get, window.webContents, window.webContents.mainFrame),
    /not allowed/
  )
})

test('the view is pushed to every live blocked window; dispose removes the handlers', () => {
  const { bridge, window, ipcMain } = setup()
  bridge.push({ title: 'x' })
  assert.deepEqual(window.webContents.sent, [[BLOCKED_CHANNELS.state, { title: 'x' }]])
  window.destroyed = true
  bridge.push({ title: 'y' })
  assert.equal(window.webContents.sent.length, 1)
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})

test('the sandboxed preload names the same channels (it cannot require this module)', () => {
  const preload = readFileSync(new URL('../src/blocked-preload.js', import.meta.url), 'utf8')
  for (const channel of Object.values(BLOCKED_CHANNELS)) assert.ok(preload.includes(`'${channel}'`), channel)
})
