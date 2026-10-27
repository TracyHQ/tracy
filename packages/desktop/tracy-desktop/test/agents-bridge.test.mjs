/**
 * The agents bridge (`src/agents-bridge.js`): `app.agents.detect(ids)` / `refresh(ids)` for the
 * first-run screen. Driven with a stand-in shell PATH reader and an imaginary disk.
 *
 *   node --test packages/desktop/tracy-desktop/test/agents-bridge.test.mjs
 */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createAgentsBridge } = require('../src/agents-bridge.js')
const { AGENT_CHANNELS } = require('../src/update-channels.js')

const ORIGIN = 'https://cowork.tracy.site'

function fakeIpcMain() {
  const handlers = new Map()
  return {
    handlers,
    handle: (channel, fn) => handlers.set(channel, fn),
    removeHandler: (channel) => handlers.delete(channel)
  }
}

function fakeWindow() {
  const contents = new EventEmitter()
  contents.mainFrame = { url: `${ORIGIN}/` }
  const window = new EventEmitter()
  window.webContents = contents
  window.isDestroyed = () => false
  return window
}

/** A reader whose answer the test releases with `settle(result)`. */
function fakeReader() {
  const reader = { reads: [], pending: null }
  reader.read = ({ force = false } = {}) => {
    if (reader.pending && !force) return reader.pending.promise
    let settle
    const promise = new Promise((resolve) => {
      settle = resolve
    })
    reader.pending = { promise, settle }
    reader.reads.push(force)
    return promise
  }
  reader.settle = (result) => reader.pending.settle(result)
  return reader
}

const FILE = { mode: 0o100755, isFile: () => true }

function setup({ disk = {}, env = { PATH: '/usr/bin:/bin' } } = {}) {
  const ipcMain = fakeIpcMain()
  const reader = fakeReader()
  const clock = { now: 0 }
  const bridge = createAgentsBridge({
    ipcMain,
    origin: ORIGIN,
    reader,
    platform: 'darwin',
    env,
    home: '/Users/a',
    stat: async (p) => {
      if (Object.hasOwn(disk, p)) return disk[p]
      throw Object.assign(new Error(`ENOENT: no such file, stat '${p}'`), { code: 'ENOENT' })
    },
    now: () => clock.now
  })
  const windows = [fakeWindow(), fakeWindow()]
  for (const window of windows) bridge.attach(window)
  const top = (window = windows[0]) => ({
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame
  })
  const call = (channel, event, ...args) => ipcMain.handlers.get(channel)(event, ...args)
  return { ipcMain, reader, clock, bridge, windows, top, call }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test('the first answer comes at once from the app PATH and install dirs, and says the scan is not complete', async () => {
  const { call, top, reader } = setup({ disk: { '/Users/a/.local/bin/claude': FILE } })
  const answer = await call(AGENT_CHANNELS.detect, top(), ['claude', 'codex', 'grok', 'no-such-id'])
  assert.deepEqual(answer, {
    results: [
      { id: 'claude', status: 'found' },
      { id: 'codex', status: 'unknown' },
      { id: 'grok', status: 'unknown' },
      { id: 'no-such-id', status: 'unsupported' }
    ],
    scanComplete: false
  })
  assert.deepEqual(reader.reads, [false])
})

test('once the login shell PATH is read, its directories are searched and the scan is complete', async () => {
  const fnm = '/Users/a/.local/state/fnm_multishells/123/bin'
  const { call, top, reader } = setup({ disk: { [`${fnm}/codex`]: FILE } })
  await call(AGENT_CHANNELS.detect, top(), ['codex'])
  reader.settle({ ok: true, segments: [fnm], reason: 'none' })
  await tick()
  assert.deepEqual(await call(AGENT_CHANNELS.detect, top(), ['codex', 'grok']), {
    results: [
      { id: 'codex', status: 'found' },
      { id: 'grok', status: 'not-found' }
    ],
    scanComplete: true
  })
})

test('two windows asking at the same time start one shell read', async () => {
  const { call, top, reader, windows } = setup()
  await Promise.all([
    call(AGENT_CHANNELS.detect, top(windows[0]), ['claude']),
    call(AGENT_CHANNELS.detect, top(windows[1]), ['claude'])
  ])
  assert.equal(reader.reads.length, 1)
})

test('a shell read that failed leaves the scan incomplete: what was not found stays unknown, and no reason leaks', async () => {
  const { call, top, reader } = setup()
  await call(AGENT_CHANNELS.detect, top(), ['claude'])
  reader.settle({ ok: false, segments: [], reason: 'timeout' })
  await tick()
  const answer = await call(AGENT_CHANNELS.detect, top(), ['claude'])
  assert.deepEqual(answer, { results: [{ id: 'claude', status: 'unknown' }], scanComplete: false })
})

test('nothing but ids and statuses reaches the page: no PATH, no path, no fs error', async () => {
  const { call, top, reader } = setup({ disk: { '/bin/claude': FILE } })
  await call(AGENT_CHANNELS.detect, top(), ['claude'])
  reader.settle({ ok: true, segments: ['/secret/bin'], reason: 'none' })
  await tick()
  const text = JSON.stringify(await call(AGENT_CHANNELS.detect, top(), ['claude', 'codex']))
  assert.doesNotMatch(text, /\/bin|secret|ENOENT|usr/)
})

test('ids must be an array of at most 32 agent ids', async () => {
  const { call, top } = setup()
  for (const bad of [
    'claude',
    null,
    undefined,
    [1],
    ['Claude'],
    ['../x'],
    Array.from({ length: 33 }, () => 'claude')
  ])
    await assert.rejects(call(AGENT_CHANNELS.detect, top(), bad), TypeError)
  await assert.rejects(call(AGENT_CHANNELS.refresh, top(), 'claude'), TypeError)
})

test('a page that is not the product page is refused', async () => {
  const { call } = setup()
  const stranger = fakeWindow()
  await assert.rejects(
    call(
      AGENT_CHANNELS.detect,
      { sender: stranger.webContents, senderFrame: stranger.webContents.mainFrame },
      ['claude']
    ),
    /not allowed/
  )
})

test('refresh reads the shell again and waits for it; within 10 s it answers from what is known', async () => {
  const fnm = '/Users/a/.fnm/bin'
  const { call, top, reader, clock } = setup({ disk: { [`${fnm}/codex`]: FILE } })
  await call(AGENT_CHANNELS.detect, top(), ['codex'])
  reader.settle({ ok: true, segments: [], reason: 'none' })
  await tick()
  clock.now = 20_000
  const refreshing = call(AGENT_CHANNELS.refresh, top(), ['codex'])
  await tick()
  assert.deepEqual(reader.reads, [false, true])
  reader.settle({ ok: true, segments: [fnm], reason: 'none' })
  assert.deepEqual(await refreshing, { results: [{ id: 'codex', status: 'found' }], scanComplete: true })
  clock.now = 25_000
  await call(AGENT_CHANNELS.refresh, top(), ['codex'])
  assert.deepEqual(reader.reads, [false, true])
  clock.now = 31_000
  const again = call(AGENT_CHANNELS.refresh, top(), ['codex'])
  await tick()
  assert.deepEqual(reader.reads, [false, true, true])
  reader.settle({ ok: true, segments: [fnm], reason: 'none' })
  await again
})

test('while a refresh is reading, detect answers from the last complete read', async () => {
  const { call, top, reader, clock } = setup({ disk: { '/x/claude': FILE } })
  await call(AGENT_CHANNELS.detect, top(), ['claude'])
  reader.settle({ ok: true, segments: ['/x'], reason: 'none' })
  await tick()
  clock.now = 20_000
  void call(AGENT_CHANNELS.refresh, top(), ['claude'])
  await tick()
  assert.deepEqual(await call(AGENT_CHANNELS.detect, top(), ['claude']), {
    results: [{ id: 'claude', status: 'found' }],
    scanComplete: true
  })
})

test('the app’s own PATH is read once and never written', async () => {
  const env = { PATH: '/opt/tools:/bin' }
  const { call, top } = setup({ env, disk: { '/opt/tools/claude': FILE } })
  assert.equal((await call(AGENT_CHANNELS.detect, top(), ['claude'])).results[0].status, 'found')
  assert.deepEqual(env, { PATH: '/opt/tools:/bin' })
})

test('dispose removes both handlers', () => {
  const { ipcMain, bridge } = setup()
  bridge.dispose()
  assert.equal(ipcMain.handlers.size, 0)
})
