// The locale bridge (src/locale-bridge.js): the product page asks the main process for the
// operating system's languages, which the preload hands to dsh as `__DSH_LOCALE__`.
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createLocaleBridge } = require('../src/locale-bridge.js')
const { LOCALE_CHANNELS } = require('../src/update-channels.js')

const ORIGIN = 'https://cowork.tracy.site'

function setup(systemLanguages) {
  const handlers = new Map()
  const ipcMain = { handle: (c, fn) => handlers.set(c, fn), removeHandler: (c) => handlers.delete(c) }
  const bridge = createLocaleBridge({ ipcMain, origin: ORIGIN, systemLanguages })
  const contents = new EventEmitter()
  contents.mainFrame = { url: `${ORIGIN}/` }
  const window = new EventEmitter()
  window.webContents = contents
  window.isDestroyed = () => false
  bridge.attach(window)
  const ask = (frame = contents.mainFrame) =>
    handlers.get(LOCALE_CHANNELS.languages)({ sender: contents, senderFrame: frame })
  return { ask }
}

test('the product page gets the OS languages, most preferred first', async () => {
  assert.deepEqual(await setup(() => ['de-AT', 'en-US']).ask(), ['de-AT', 'en-US'])
})

test('a system that cannot say reads as no languages, never as an error', async () => {
  assert.deepEqual(
    await setup(() => {
      throw new Error('no')
    }).ask(),
    []
  )
  assert.deepEqual(await setup(() => 'en').ask(), [])
})

test('an iframe is refused', async () => {
  await assert.rejects(setup(() => ['en']).ask({ url: `${ORIGIN}/frame` }), /not allowed/)
})
