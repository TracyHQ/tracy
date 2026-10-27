/**
 * /ops › Shards: "Add a shard" is one button that opens a dialog with the Add form, mounted.
 *
 *   - The button opens the dialog; the six fields, the hint and the Add press live inside it.
 *   - Success: one POST, the dialog closes, the list re-reads and shows the new row, and the secret
 *     is gone from the form when it is opened again.
 *   - Refusal: the dialog stays open with the refusal inside it, the secret field is emptied and
 *     the other fields keep what was typed.
 *   - Cancel empties the secret too (A SECRET GOES ONE WAY, top of Shards.tsx).
 *
 * The real `Shards` is bundled in memory (nothing is written to disk) and mounted with react-dom on
 * a linkedom document, as `ops-small-defects.test.mjs` does; `fetch` is a fixture. No tracy-web,
 * no shard and no database is involved.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const GLOBALS = [
  'window',
  'document',
  'navigator',
  'ResizeObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
let cleanups = []

const MASTER = { appTag: 'app-1', dshTag: 'ctx-1', sourceCommit: null, migrationHead: null, people: 0 }
const SECRET = 'a'.repeat(64)
const TUNNEL = '01234567-89ab-cdef-0123-456789abcdef'
const shardRow = (name) => ({
  name,
  origin: `https://${name}.example.com`,
  provider: 'do',
  region: 'asia',
  accepting: false,
  pinned: false,
  pinnedAppTag: null,
  pinnedDshTag: null,
  maxSites: 200,
  targetAppTag: null,
  targetDshTag: null,
  degradedUntil: null,
  lowMemBeats: 0,
  updateGrantedAt: null,
  heartbeatAt: null,
  silent: false,
  migrationHead: null,
  heartbeat: null,
  sites: 0,
  people: 0
})

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Shards } from './shards/Shards'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    define: { 'import.meta.url': '"http://harness.test/assets/"' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    // React stays outside the bundle so its `act` finds `module.require` (see ops-small-defects).
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    plugins: [opsI18nPlugin()],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('navigator', { userAgent: 'node', platform: 'node', maxTouchPoints: 0 })
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  set(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  const styles = () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: globalThis.ResizeObserver,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
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

/**
 * Mount `Shards` against a fixture: `GET` answers the current list; `POST` answers `postAnswer`
 * and, on a 2xx, adds the posted row to the list. Every POST body is recorded.
 */
async function mountShards({ postAnswer }) {
  const shards = [shardRow('s1')]
  const posts = []
  const fetchImpl = async (url, init = {}) => {
    if (String(url) !== '/api/ops/shards') return json(404, {})
    if ((init.method ?? 'GET') === 'POST') {
      const body = JSON.parse(init.body)
      posts.push(body)
      const [status, answer] = postAnswer
      if (status < 300) shards.push(shardRow(body.name))
      return json(status, answer)
    }
    return json(200, { shards: [...shards], master: MASTER, adopt: 'off', dns: false, writable: true })
  }
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const settle = () => lib.act(async () => tick(5))
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () => root.render(lib.createElement(lib.Shards, { fetchImpl })))
  await settle()
  await settle()
  const doc = dom.document
  const dialog = () => doc.querySelector('[role="dialog"]')
  const buttonIn = (scope, text) =>
    [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text) ?? null
  const press = async (el) => {
    assert.ok(el, 'the control exists')
    await lib.act(async () => {
      el.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
      await tick(5)
    })
    await settle()
  }
  const input = (label) => doc.querySelector(`input[aria-label="${label}"]`)
  // The Base UI input ignores synthetic DOM events here: call its React handler directly, as
  // invitations-real-flow.test.mjs does.
  const type = async (label, value) =>
    lib.act(async () => {
      const el = input(label)
      assert.ok(el, `field ${label} exists`)
      const props = el[Object.keys(el).find((k) => k.startsWith('__reactProps$'))]
      props.onChange({ target: { value }, currentTarget: { value } })
    })
  const fill = async (name) => {
    await type('Name', name)
    await type('Origin', `https://${name}.example.com`)
    await type('Secret (SHARD_SECRET)', SECRET)
    await type('Tunnel id', TUNNEL)
  }
  return { host, doc, dialog, buttonIn, press, input, fill, posts }
}

test('the Add form is behind one "Add a shard" button, and the button opens it in a dialog', async () => {
  const view = await mountShards({ postAnswer: [201, {}] })
  assert.equal(view.input('Name'), null, 'no inline form on the page')
  const opener = view.buttonIn(view.host, 'Add a shard')
  assert.ok(opener, 'the page carries the button')
  assert.equal(opener.disabled, false)
  await view.press(opener)
  const dialog = view.dialog()
  assert.ok(dialog, 'a dialog opened')
  for (const label of ['Name', 'Origin', 'Secret (SHARD_SECRET)', 'Tunnel id', 'Provider', 'Region'])
    assert.ok(dialog.querySelector(`input[aria-label="${label}"]`), `${label} is in the dialog`)
  const secret = dialog.querySelector('input[aria-label="Secret (SHARD_SECRET)"]')
  assert.equal(secret.getAttribute('type'), 'password')
  // linkedom keeps the attribute name as React wrote it; a browser reads it case-blind.
  assert.equal(secret.getAttribute('autocomplete') ?? secret.getAttribute('autoComplete'), 'off')
  assert.match(dialog.textContent, /It takes nobody until you switch “Takes new people” on\./)
  assert.equal(view.buttonIn(dialog, 'Add').disabled, true, 'an empty draft cannot be sent')
})

test('an accepted Add closes the dialog, lists the new shard and leaves no secret behind', async () => {
  const view = await mountShards({ postAnswer: [201, {}] })
  await view.press(view.buttonIn(view.host, 'Add a shard'))
  await view.fill('s2')
  const add = view.buttonIn(view.dialog(), 'Add')
  assert.equal(add.disabled, false, 'a complete draft can be sent')
  await view.press(add)
  assert.equal(view.posts.length, 1, 'one POST')
  assert.equal(view.posts[0].name, 's2')
  assert.equal(view.posts[0].secret, SECRET)
  assert.equal(view.dialog(), null, 'the dialog closed')
  assert.match(view.host.textContent, /s2/, 'the list shows the new shard')
  await view.press(view.buttonIn(view.host, 'Add a shard'))
  assert.equal(view.input('Secret (SHARD_SECRET)').value, '', 'the secret is not kept')
  assert.equal(view.input('Name').value, '', 'the draft starts over')
})

test('a refused Add keeps the dialog open with the refusal inside it and the secret emptied', async () => {
  const view = await mountShards({ postAnswer: [409, { code: 'shard_exists' }] })
  await view.press(view.buttonIn(view.host, 'Add a shard'))
  await view.fill('s2')
  await view.press(view.buttonIn(view.dialog(), 'Add'))
  assert.equal(view.posts.length, 1, 'one POST')
  const dialog = view.dialog()
  assert.ok(dialog, 'the dialog stays open')
  const alert = dialog.querySelector('[role="alert"]')
  assert.ok(alert, 'the refusal is inside the dialog')
  assert.match(alert.textContent, /Could not add s2: 409 shard_exists/)
  assert.equal(view.input('Secret (SHARD_SECRET)').value, '', 'the secret field is emptied')
  assert.equal(view.input('Name').value, 's2', 'the rest of the draft stays')
})

test('Cancel closes the dialog and empties the secret', async () => {
  const view = await mountShards({ postAnswer: [201, {}] })
  await view.press(view.buttonIn(view.host, 'Add a shard'))
  await view.fill('s2')
  await view.press(view.buttonIn(view.dialog(), 'Cancel'))
  assert.equal(view.dialog(), null, 'the dialog closed')
  assert.equal(view.posts.length, 0, 'nothing was sent')
  await view.press(view.buttonIn(view.host, 'Add a shard'))
  assert.equal(view.input('Secret (SHARD_SECRET)').value, '', 'the secret did not survive Cancel')
})
