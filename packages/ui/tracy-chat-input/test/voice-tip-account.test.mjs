/** Account-level voice hints mounted in the DOM, including browser-state migration and read failures. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const coreRequire = createRequire(path.join(repoRoot, 'packages/core/tracy-core/package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')
const saved = new Map()
let source
const cleanups = []
const KEY = 'tracy.voice-tip.seen'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `export { createElement, act } from 'react'; export { createRoot } from 'react-dom/client'; export { VoiceTip } from './VoiceMode'`,
      resolveDir: path.join(pkgRoot, 'src/client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  source = built.outputFiles[0].text
  for (const name of [
    'window',
    'document',
    'fetch',
    'localStorage',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IS_REACT_ACT_ENVIRONMENT'
  ])
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

async function mount({ hints = [], storage = new Map(), readStatus = 200, recordStatus = 200, read } = {}) {
  const dom = parseHTML('<!doctype html><html><body></body></html>')
  const calls = []
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('IS_REACT_ACT_ENVIRONMENT', true)
  set('requestAnimationFrame', () => 0)
  set('cancelAnimationFrame', () => {})
  set('localStorage', {
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k)
  })
  set('fetch', async (url, init = {}) => {
    calls.push({ url, init })
    if (init.method === 'POST') return new Response('{}', { status: recordStatus })
    if (read) return read()
    return new Response(JSON.stringify({ hints }), { status: readStatus })
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(
    (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id)),
    mod,
    mod.exports
  )
  const lib = mod.exports
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () => {
    root.render(lib.createElement(lib.VoiceTip, { shown: true, anchor: () => null }))
    await tick()
  })
  const flush = () => lib.act(async () => tick())
  return {
    host,
    calls,
    storage,
    flush,
    clickClose: () =>
      lib.act(async () => {
        host.querySelector('[data-voice-tip-close]').click()
      })
  }
}
const note = (view) => view.host.querySelector('[data-voice-tip]')
const posts = (view) => view.calls.filter((call) => call.init.method === 'POST')

test('a previously seen account does not see the tip on a fresh browser', async () => {
  const view = await mount({ hints: ['voice-tip'] })
  assert.equal(Boolean(note(view)), false)
  assert.equal(view.calls[0]?.url, '/api/seen-hints')
  assert.equal(posts(view).length, 0)
})

test('an unseen account sees one tip and records it on the server without setting the browser key', async () => {
  const view = await mount()
  assert.ok(note(view))
  assert.equal(posts(view).length, 1)
  assert.deepEqual(JSON.parse(posts(view)[0].init.body), { hint: 'voice-tip' })
  assert.equal(posts(view)[0].init.credentials, 'same-origin')
  assert.equal(view.storage.has(KEY), false)
})

test('another account using the same browser gets its own unseen tip', async () => {
  const storage = new Map()
  const seen = await mount({ storage, hints: ['voice-tip'] })
  assert.equal(Boolean(note(seen)), false)
  for (const cleanup of cleanups.splice(0)) await cleanup()
  const unseen = await mount({ storage, hints: [] })
  assert.ok(note(unseen))
})

test('the tip stays hidden while the account read waits, and after a failed read', async () => {
  let answer
  const view = await mount({
    read: () =>
      new Promise((resolve) => {
        answer = resolve
      })
  })
  assert.equal(Boolean(note(view)), false, 'never flash before the server answers')
  answer(new Response('{}', { status: 503 }))
  await view.flush()
  assert.equal(Boolean(note(view)), false)
})

for (const status of [401, 500])
  test(`a ${status} read never shows or records a tip`, async () => {
    const view = await mount({ readStatus: status })
    assert.equal(Boolean(note(view)), false)
    assert.equal(posts(view).length, 0)
  })

test('legacy browser state is copied to the account then removed, and never shows the tip', async () => {
  const storage = new Map([[KEY, '1']])
  const view = await mount({ storage })
  assert.equal(Boolean(note(view)), false)
  assert.equal(posts(view).length, 1)
  assert.equal(storage.has(KEY), false)
})

test('a failed legacy migration keeps its key for retry while the tip stays hidden', async () => {
  const storage = new Map([[KEY, '1']])
  const view = await mount({ storage, recordStatus: 503 })
  assert.equal(Boolean(note(view)), false)
  assert.equal(posts(view).length, 1)
  assert.equal(storage.get(KEY), '1')
})

test('record failure does not block the tip or its close button', async () => {
  const view = await mount({ recordStatus: 503 })
  assert.ok(note(view))
  await view.clickClose()
  await view.flush()
  assert.equal(Boolean(note(view)), false)
})
