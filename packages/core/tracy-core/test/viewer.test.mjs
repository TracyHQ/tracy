/**
 * The viewer store (`src/seat/viewer.tsx`): who is signed in, read from `GET /auth/me` once per PAGE.
 *
 * `@tracy/core` is bundled into each plugin, so every plugin carries its own copy of the module.
 * The store hangs on the document, under a registry symbol, so the copies share one answer. This
 * file proves it the way the page meets it: the module is bundled by esbuild, then loaded twice
 * from two files — two module instances, as two plugins' clients are — on one document.
 *
 *   node --test packages/core/tracy-core/test/viewer.test.mjs
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let outDir = ''
/** One plugin's copy of the module. */
/** @type {any} */
let bundleA
/** Another plugin's copy: its own module state. */
/** @type {any} */
let bundleB

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'viewer-store-'))
  const outfile = path.join(outDir, 'viewer-a.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToString } from 'react-dom/server'
        export * from './viewer'
        export { readViewer, viewerDoorAnswer } from './index.mjs'
      `,
      resolveDir: path.join(here, '..', 'src', 'seat'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent'
  })
  bundleA = require(outfile)
  const second = path.join(outDir, 'viewer-b.cjs')
  copyFileSync(outfile, second)
  bundleB = require(second)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Every `fetch` the page made, as `{url, init}`. */
let calls = []
/** Where the page was sent by `location.replace`. */
let replaced = []

/** A fresh page: a new document (so a new store), a counting fetch, a `location` to send. */
function page(answer) {
  calls = []
  replaced = []
  Object.defineProperty(globalThis, 'document', { value: {}, configurable: true, writable: true })
  Object.defineProperty(globalThis, 'window', {
    value: { location: { replace: (url) => replaced.push(url) } },
    configurable: true,
    writable: true
  })
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return answer(url, init)
  }
}

const json = (status, body) => new Response(JSON.stringify(body), { status })
const meCalls = () => calls.filter((c) => c.url === '/auth/me')

/** Wait until the store leaves `loading`. */
async function settled(store) {
  if (store.get().state !== 'loading') return store.get()
  await new Promise((resolve) => {
    const stop = store.subscribe(() => {
      if (store.get().state !== 'loading') {
        stop()
        resolve()
      }
    })
  })
  return store.get()
}

const FACE = { initial: 'S', color: '#2563eb', avatarUrl: null }

beforeEach(() => {
  page(() => json(200, { email: 'sam@example.com', name: 'Sam Tester', defaultSite: null, face: FACE }))
})

test('two bundles on one document ask /auth/me once and see one signed-in viewer', async () => {
  const a = bundleA.viewerStore()
  const b = bundleB.viewerStore()
  const viewer = await settled(a)
  assert.deepEqual(viewer, { state: 'signedIn', email: 'sam@example.com', name: 'Sam Tester', face: FACE })
  assert.equal(await settled(b), viewer, 'the other bundle reads the same snapshot')
  assert.equal(meCalls().length, 1)
})

test('a viewer starts as loading', () => {
  assert.equal(bundleA.viewerStore().get().state, 'loading')
})

test('refresh() reads the door again and tells every bundle', async () => {
  const a = bundleA.viewerStore()
  await settled(a)
  const heard = []
  bundleB.viewerStore().subscribe(() => heard.push(bundleB.viewerStore().get().name))
  globalThis.fetch = async (url) => {
    calls.push({ url })
    return json(200, { email: 'sam@example.com', name: 'Sam Renamed', defaultSite: null, face: FACE })
  }
  await bundleB.viewerStore().refresh()
  assert.equal(a.get().name, 'Sam Renamed')
  assert.deepEqual(heard, ['Sam Renamed'])
  assert.equal(meCalls().length, 2)
})

test('nobody signed in, or a 401, is a guest', async () => {
  page(() => json(200, { email: null, name: null, defaultSite: null, face: null }))
  assert.deepEqual(await settled(bundleA.viewerStore()), {
    state: 'guest',
    email: null,
    name: null,
    face: null
  })
  page(() => json(401, { error: 'UNAUTHENTICATED' }))
  assert.equal((await settled(bundleA.viewerStore())).state, 'guest')
})

test('a network error, or an answer that is not the door, is an error', async (t) => {
  // Each error schedules its one retry; fake timers keep it from landing in a later test.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  page(() => {
    throw new TypeError('Failed to fetch')
  })
  assert.deepEqual(await settled(bundleA.viewerStore()), {
    state: 'error',
    email: null,
    name: null,
    face: null
  })
  page(() => new Response('<html>login</html>', { status: 200 }))
  assert.equal((await settled(bundleA.viewerStore())).state, 'error')
  page(() => json(500, {}))
  assert.equal((await settled(bundleA.viewerStore())).state, 'error')
})

test('signOut() clears the viewer for every bundle, posts to /auth/signout and goes to /login', async () => {
  const a = bundleA.viewerStore()
  await settled(a)
  await bundleB.signOut()
  assert.deepEqual(a.get(), { state: 'guest', email: null, name: null, face: null })
  const out = calls.find((c) => c.url === '/auth/signout')
  assert.equal(out.init.method, 'POST')
  assert.equal(out.init.credentials, 'same-origin')
  assert.deepEqual(replaced, ['/login'])
})

test('signOut() still leaves for /login when the sign-out door cannot be reached', async () => {
  page((url) => {
    if (url === '/auth/signout') throw new TypeError('Failed to fetch')
    return json(200, { email: 'sam@example.com', name: null, defaultSite: null, face: FACE })
  })
  await bundleA.signOut()
  assert.deepEqual(replaced, ['/login'])
  assert.equal(bundleA.viewerStore().get().state, 'guest')
})

test('useViewer() renders the store’s current viewer', async () => {
  await settled(bundleA.viewerStore())
  const { createElement: h, renderToString, useViewer } = bundleA
  const Probe = () => {
    const v = useViewer()
    return h('span', null, `${v.state}:${v.name}`)
  }
  assert.equal(renderToString(h(Probe)), '<span>signedIn:Sam Tester</span>')
})

/** The next change the store announces. */
const nextChange = (store) =>
  new Promise((resolve) => {
    const stop = store.subscribe(() => {
      stop()
      resolve(store.get())
    })
  })

/** A door that cannot be reached the first `failures` times, then answers Sam. */
function flakyDoor(failures) {
  let left = failures
  page(() => {
    if (left > 0) {
      left -= 1
      throw new TypeError('Failed to fetch')
    }
    return json(200, { email: 'sam@example.com', name: 'Sam Tester', defaultSite: null, face: FACE })
  })
}

test("a door that could not be reached is not the page's answer: the next read asks again", async () => {
  flakyDoor(1)
  assert.equal(await bundleA.viewerDoorAnswer(), null)
  const answer = await bundleB.viewerDoorAnswer()
  assert.equal(answer?.status, 200, 'the failed read was kept for the page')
  assert.equal(await bundleA.readViewer(), 'seat')
  assert.equal(meCalls().length, 2, 'a good answer is still asked once')
})

test('a 5xx is not kept for the page either; a guest answer is', async () => {
  let status = 503
  page(() => json(status, status === 200 ? { email: null } : {}))
  assert.equal((await bundleA.viewerDoorAnswer())?.status, 503)
  status = 200
  assert.equal(await bundleA.readViewer(), 'guest')
  assert.equal(await bundleB.readViewer(), 'guest')
  assert.equal(meCalls().length, 2)
})

test('a viewer in error asks the door once more after 3 s, and only once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  flakyDoor(2)
  const store = bundleA.viewerStore()
  assert.equal((await settled(store)).state, 'error')
  t.mock.timers.tick(2900)
  assert.equal(meCalls().length, 1, 'asked again before 3 s')
  const changed = nextChange(store)
  t.mock.timers.tick(100)
  assert.equal((await changed).state, 'error')
  assert.equal(meCalls().length, 2)
  t.mock.timers.tick(10_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(meCalls().length, 2, 'retried more than once')
})

test('a viewer in error that the retry reaches becomes signed in', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  flakyDoor(1)
  const store = bundleA.viewerStore()
  assert.equal((await settled(store)).state, 'error')
  const changed = nextChange(store)
  t.mock.timers.tick(3000)
  assert.equal((await changed).state, 'signedIn')
})

test('a guest is an answer: no retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  page(() => json(401, { error: 'UNAUTHENTICATED' }))
  const store = bundleA.viewerStore()
  assert.equal((await settled(store)).state, 'guest')
  t.mock.timers.tick(10_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(meCalls().length, 1)
})

test('embedded sign-out waits for server revocation before clearing identity and notifying its parent', async () => {
  page((url) =>
    url === '/widget/api/native/logout'
      ? json(200, { ok: true })
      : json(200, { email: 'sam@example.com', name: 'Sam Tester', face: FACE })
  )
  const messages = []
  window.location.pathname = '/widget/native/s/session-widget-test'
  window.location.origin = 'https://widget.example.test'
  window.parent = { postMessage: (...args) => messages.push(args) }
  const store = bundleA.viewerStore()
  await settled(store)
  await bundleA.signOut()
  const out = calls.find((c) => c.url === '/widget/api/native/logout')
  assert.equal(out.init.method, 'POST')
  assert.equal(out.init.body, '{}')
  assert.equal(out.init.headers['content-type'], 'application/json')
  assert.equal(store.get().state, 'guest')
  assert.deepEqual(messages, [[{ type: 'tracy-widget-native-signed-out' }, 'https://widget.example.test']])
  assert.deepEqual(replaced, ['/widget?reauth=1'])
  assert.equal(
    calls.some((c) => c.url === '/auth/signout'),
    false
  )
})

test('refused embedded sign-out keeps identity and never reports success or leaves the document', async () => {
  for (const answer of [
    () => json(503, { ok: false }),
    () => json(200, { ok: false }),
    () => {
      throw Error('network')
    }
  ]) {
    page((url) =>
      url === '/widget/api/native/logout'
        ? answer()
        : json(200, { email: 'sam@example.com', name: 'Sam Tester', face: FACE })
    )
    const messages = []
    window.location.pathname = '/widget/native/s/session-widget-test'
    window.location.origin = 'https://widget.example.test'
    window.parent = { postMessage: (...args) => messages.push(args) }
    const store = bundleA.viewerStore()
    await settled(store)
    await assert.rejects(bundleA.signOut())
    assert.equal(store.get().state, 'signedIn')
    assert.deepEqual(messages, [])
    assert.deepEqual(replaced, [])
  }
})
