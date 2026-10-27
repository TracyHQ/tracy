import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const { createAppOpened, openedDay } = require('../src/app-opened.js')
const ID = '7c79de93-287d-49ee-ac31-bfd1b520e903'
const DAY_MS = 86_400_000

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')

function harness(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-opened-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'app-opened.json')
  const calls = []
  const pending = new Set()
  let at = Date.parse('2026-10-22T16:59:59Z')
  let id = ID
  let online = true
  const deps = {
    file,
    version: '0.6.1',
    platform: 'mac',
    installId: () => id,
    now: () => at,
    log: () => {},
    timers: {
      setTimeout: (fn, ms) => {
        const entry = { fn, ms }
        pending.add(entry)
        return entry
      },
      clearTimeout: (entry) => pending.delete(entry)
    },
    send: async (event) => {
      calls.push(event)
      return online
    },
    ...options
  }
  let tracker = createAppOpened(deps)
  t.after(() => tracker.stop())
  return {
    calls,
    pending,
    file,
    dir,
    get tracker() {
      return tracker
    },
    setTime: (value) => {
      at = typeof value === 'string' ? Date.parse(value) : value
    },
    setId: (value) => {
      id = value
    },
    setOnline: (value) => {
      online = value
    },
    restart() {
      tracker.stop()
      tracker = createAppOpened(deps)
      return tracker
    },
    async retry() {
      const entry = pending.values().next().value
      pending.delete(entry)
      at += entry.ms
      await entry.fn()
    }
  }
}

test('UTC+7 midnight starts a new day independently of the system time zone', () => {
  assert.equal(openedDay(Date.parse('2026-10-22T16:59:59.999Z')), '2026-10-22')
  assert.equal(openedDay(Date.parse('2026-10-22T17:00:00Z')), '2026-10-23')
})

test('background retries and page loads create no signal; a focus sends only allowed fields', async (t) => {
  const h = harness(t)
  await h.tracker.flush()
  assert.equal(h.calls.length, 0)
  assert.equal(h.pending.size, 0)
  await h.tracker.opened()
  assert.deepEqual(h.calls, [
    { installId: ID, version: '0.6.1', platform: 'mac', openedAt: '2026-10-22T16:59:59.000Z' }
  ])
  assert.equal(h.pending.size, 0)
})

test('repeated windows and focus calls, including a process restart, count once per UTC+7 day', async (t) => {
  const h = harness(t)
  await Promise.all([h.tracker.opened(), h.tracker.opened(), h.tracker.opened()])
  await h.restart().opened()
  assert.equal(h.calls.length, 1)
  h.setTime('2026-10-22T17:00:00Z')
  await h.tracker.opened()
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[1].openedAt, '2026-10-22T17:00:00.000Z')
})

test('offline focus is durable and retries preserve the original timestamp, platform and version', async (t) => {
  const h = harness(t)
  h.setOnline(false)
  await h.tracker.opened()
  assert.equal(h.pending.size, 1)
  const saved = JSON.parse(readFileSync(h.file, 'utf8'))
  assert.equal(saved.pending.length, 1)
  assert.equal('installId' in saved.pending[0], false)
  h.restart()
  h.setTime('2026-10-23T03:00:00Z')
  h.setOnline(true)
  await h.tracker.flush()
  assert.deepEqual(h.calls[1], h.calls[0])
  assert.equal(JSON.parse(readFileSync(h.file, 'utf8')).pending.length, 0)
  assert.equal(h.calls.length, 2)
})

test('missing updater id is never replaced with a new identifier; later updater callback delivers existing focus', async (t) => {
  const h = harness(t)
  h.setId(null)
  await h.tracker.opened()
  assert.equal(h.calls.length, 0)
  assert.equal(h.pending.size, 1)
  h.setId(ID)
  await h.tracker.flush()
  assert.equal(h.calls.length, 1)
  await h.tracker.flush()
  assert.equal(h.calls.length, 1)
})

test('offline retries back off even when focus events keep arriving', async (t) => {
  const h = harness(t)
  h.setOnline(false)
  await h.tracker.opened()
  await h.tracker.opened()
  assert.equal(h.calls.length, 1)
  h.setOnline(true)
  await h.retry()
  assert.equal(h.calls.length, 2)
  assert.equal(h.pending.size, 0)
})

test('a pending request serializes concurrent focus delivery, without losing the next day', async (t) => {
  let done
  const calls = []
  const h = harness(t, {
    send: (event) => {
      calls.push(event)
      return new Promise((resolve) => {
        done = resolve
      })
    }
  })
  const first = h.tracker.opened()
  await h.tracker.opened()
  h.setTime('2026-10-22T17:00:00Z')
  await h.tracker.opened()
  assert.equal(calls.length, 1)
  done(true)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 2)
  done(true)
  await first
  assert.equal(JSON.parse(readFileSync(h.file, 'utf8')).sent.length, 2)
})

test('queue expires after 90 days and background delivery never fabricates activity for today', async (t) => {
  const h = harness(t)
  h.setOnline(false)
  await h.tracker.opened()
  h.setTime(Date.parse(h.calls[0].openedAt) + 91 * DAY_MS)
  h.setOnline(true)
  await h.tracker.flush()
  assert.equal(h.calls.length, 1)
  assert.deepEqual(JSON.parse(readFileSync(h.file, 'utf8')), { pending: [], sent: [] })
})

test('a delivery failure or unavailable server keeps the event; stopping cancels retry', async (t) => {
  const h = harness(t, {
    send: async () => {
      throw new Error('offline')
    }
  })
  await h.tracker.opened()
  assert.equal(JSON.parse(readFileSync(h.file, 'utf8')).pending.length, 1)
  h.tracker.stop()
  assert.equal(h.pending.size, 0)
  await h.tracker.opened()
  assert.equal(h.pending.size, 0)
})

test('a failed disk save prevents transmission until the event can be persisted', async (t) => {
  const h = harness(t)
  writeFileSync(h.file, 'not a directory')
  const calls = []
  const tracker = createAppOpened({
    file: path.join(h.file, 'state'),
    version: '0.6.1',
    platform: 'linux',
    installId: () => ID,
    send: async (event) => {
      calls.push(event)
      return true
    },
    log: () => {}
  })
  t.after(() => tracker.stop())
  await tracker.opened()
  assert.equal(calls.length, 0)
})

test('the real window hook ignores hidden spares, unfocused, destroyed and local windows', () => {
  const source = main.slice(
    main.indexOf('function recordAppOpened(window) {'),
    main.indexOf('/**\n * Same page fetch')
  )
  let opened = 0
  const scope = {
    appOpened: undefined,
    product: { remote: true },
    path,
    process,
    app: { getPath: () => '/unused', getVersion: () => '0.6.1' },
    createAppOpened: () => ({
      opened: () => {
        opened++
      }
    }),
    readInstallId: () => ID,
    sendAppOpened: () => {},
    logUpdate: () => {}
  }
  const hook = runInNewContext(`${source}; recordAppOpened`, scope)
  const window = { isDestroyed: () => false, isVisible: () => true, isFocused: () => true }
  hook({ ...window, isVisible: () => false })
  hook({ ...window, isFocused: () => false })
  hook({ ...window, isDestroyed: () => true })
  scope.product.remote = false
  hook(window)
  assert.equal(opened, 0)
  scope.product.remote = true
  hook(window)
  assert.equal(opened, 1)
})

test('the real transport uses the existing same-origin cookie and exact body, never an external page', async () => {
  const start = main.indexOf('async function sendAppOpened(event) {')
  const source = main.slice(start, main.indexOf('/**', start))
  const requests = []
  const window = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => 'https://cowork.example/login',
      executeJavaScript: async (script) =>
        runInNewContext(script, {
          AbortSignal,
          fetch: async (url, init) => {
            requests.push({ url, init })
            return { status: 204 }
          }
        })
    }
  }
  const scope = {
    product: { origin: 'https://cowork.example' },
    quitting: false,
    products: new Set([window])
  }
  const send = runInNewContext(`${source}; sendAppOpened`, scope)
  const event = { installId: ID, version: '0.6.1', platform: 'mac', openedAt: '2026-10-22T16:59:59.000Z' }
  assert.equal(await send(event), true)
  assert.equal(requests[0].url, '/api/desktop/installs/opened')
  assert.equal(requests[0].init.credentials, 'same-origin')
  assert.deepEqual(JSON.parse(requests[0].init.body), event)
  window.webContents.getURL = () => 'https://external.example/'
  assert.equal(await send(event), false)
  assert.equal(requests.length, 1)
})
