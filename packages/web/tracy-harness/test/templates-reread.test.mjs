/**
 * When the Templates page reads its one list again (`Templates.tsx`).
 *
 * The quickstarts + inspiration list feeds the Problems panel, the counts and the tab dots. A change
 * made elsewhere (another tab, the Demos screen, another admin, a demo job the server finished
 * meanwhile) must show without F5, so the page reads the list again:
 *
 *   - when a template page opens, and when the person returns to the list;
 *   - when the browser tab gets focus or becomes visible again (one read for both events);
 *   - never on a timer of its own.
 *
 * The Demo Site row of an open template page (`ReleaseDemo`, its own `/api/ops/demos` read) is read
 * on the same trigger, so it and the Problems panel are never out of step.
 *
 * While it reads again, the last list stays on screen: no "Reading the templates" flash.
 *
 * Mounted with react-dom on a linkedom document; `fetch` is a fixture, nothing leaves the process.
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
const GLOBALS = ['window', 'document', 'fetch', 'HTMLElement', 'Element', 'Node', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
let lib
let dom
let cleanups = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Templates } from './Templates'`,
      resolveDir: path.join(pkgRoot, 'src', 'cms'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('HTMLElement', dom.window.HTMLElement)
  set('Element', dom.window.Element)
  set('Node', dom.window.Node)
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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const release = (version) => ({
  tag: 'tracy-base/j6',
  name: 'Tracy Base',
  label: 'Tracy Base',
  kind: 'quickstart',
  github: 'published',
  tracy: 'ready',
  reason: null,
  choosable: true,
  platform: 'joomla',
  platformFromTag: false,
  version,
  cms: null,
  template: 'tracy',
  publishedAt: null,
  inspiration: { state: 'on', why: null, code: null, warnings: [] },
  contract: { state: 'exact' },
  notShowable: null,
  cardSource: true
})
const quickstarts = (version) => ({
  readAt: '2026-10-11T00:00:00Z',
  canRefresh: true,
  cannotRefreshReason: null,
  writable: true,
  releases: [release(version)]
})
const inspiration = (version) => ({
  readAt: '2026-10-11T00:00:00Z',
  origin: 'https://ops.test',
  writable: true,
  canRefresh: true,
  cannotRefreshReason: null,
  designSystemsShown: false,
  shown: [
    {
      id: 'tracy',
      label: 'Tracy Base',
      card: { provider: null, category: null, blurb: null, image: null, layouts: 0 },
      design: null,
      platforms: [{ platform: 'joomla', tag: 'tracy-base/j6', version, demo: null }],
      warnings: []
    }
  ],
  notShown: [],
  noCard: [],
  counts: { shown: 1, joomla: 1, wordpress: 0, emdash: 0, notShown: 0, noCard: 0 }
})

const demoListing = (version) => ({
  host: 'fleet-01',
  zone: 'demo.test',
  writable: true,
  reason: null,
  demos: [
    {
      tag: 'tracy-base/j6',
      platform: 'joomla',
      label: 'tracy-base-j6',
      defaultLabel: 'tracy-base-j6',
      address: 'https://tracy-base-j6.demo.test',
      pinned: false,
      revision: 1,
      updatedBy: null,
      updatedAt: null,
      deployed: {
        label: 'tracy-base-j6',
        host: 'fleet-01',
        address: 'https://tracy-base-j6.demo.test',
        version,
        jobId: 'job-old',
        state: 'done',
        step: null,
        deployedAt: '2026-10-10T00:00:00Z',
        live: true
      }
    }
  ]
})

// What the template page's Design Inspiration sheet reads for the release (only so it draws).
const cardSheet = {
  tag: 'tracy-base/j6',
  writable: true,
  refusal: null,
  label: 'Tracy Base',
  version: '1.0.0',
  languages: [],
  platform: 'joomla',
  template: 'tracy',
  demo: null,
  platforms: [],
  card: null,
  published: true,
  shots: [],
  categories: [],
  reason: null
}

/**
 * The server: `version` is what both list doors answer now; `hold` (when set) keeps the list doors
 * from answering until the test releases it. Every other door answers 404.
 */
function stubServer() {
  const server = { version: '1.0.0', calls: [], hold: null }
  globalThis.fetch = async (url) => {
    const u = String(url)
    server.calls.push(u)
    if (u === '/api/ops/demos') return json(demoListing(server.version))
    if (u.startsWith('/api/ops/quickstart/inspiration?')) return json(cardSheet)
    if (u === '/api/ops/quickstarts' || u === '/api/ops/inspiration') {
      if (server.hold) await server.hold
      return json(u === '/api/ops/quickstarts' ? quickstarts(server.version) : inspiration(server.version))
    }
    return json({ error: 'not here' }, 404)
  }
  server.demoReads = () => server.calls.filter((u) => u === '/api/ops/demos').length
  server.reads = () => server.calls.filter((u) => u === '/api/ops/quickstarts').length
  return server
}

async function mount(props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const render = (next) =>
    lib.act(async () => {
      root.render(lib.createElement(lib.Templates, { view: null, onOpen: () => {}, ...next }))
      await tick(5)
    })
  await render(props)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const fire = (target, type) =>
    lib.act(async () => {
      target.dispatchEvent(new dom.window.Event(type))
      await tick(5)
    })
  const settle = () =>
    lib.act(async () => {
      await tick(5)
    })
  return { host, render, fire, settle }
}

function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

test('opening a template reads the list again, and so does returning to the list', async () => {
  const server = stubServer()
  const ui = await mount({ template: null })
  assert.equal(server.reads(), 1, 'one read on mount')
  assert.ok(ui.host.querySelector('[data-template="tracy"]'))

  await ui.render({ template: 'tracy' })
  assert.equal(server.reads(), 2, 'the template page opened on a fresh list')
  assert.equal(server.calls.filter((u) => u === '/api/ops/inspiration').length, 2)

  await ui.render({ template: 'tracy', view: 'cards' })
  assert.equal(server.reads(), 2, 'a tab change inside the page is not a new read')

  await ui.render({ template: null })
  assert.equal(server.reads(), 3, 'back on the list, read again')
})

test('focus or visibility of the browser tab reads the list again, once for both events', async () => {
  const server = stubServer()
  const ui = await mount({ template: null })
  assert.equal(server.reads(), 1)

  await ui.fire(dom.window, 'focus')
  assert.equal(server.reads(), 2, 'focus reads again')

  // Coming back to the tab fires both events at once: they share one read.
  const held = deferred()
  server.hold = held.promise
  await lib.act(async () => {
    dom.document.dispatchEvent(new dom.window.Event('visibilitychange'))
    dom.window.dispatchEvent(new dom.window.Event('focus'))
    await tick(5)
  })
  assert.equal(server.reads(), 3, 'one read for visibilitychange + focus together')
  server.hold = null
  held.resolve()
  await ui.settle()

  // A hidden tab reads nothing.
  Object.defineProperty(dom.document, 'visibilityState', { value: 'hidden', configurable: true })
  try {
    await ui.fire(dom.document, 'visibilitychange')
    assert.equal(server.reads(), 3, 'a tab going hidden is not a read')
  } finally {
    delete dom.document.visibilityState
  }
})

test('while it reads again the last list stays on screen, then the new one replaces it', async () => {
  const server = stubServer()
  const ui = await mount({ template: null })
  assert.match(ui.host.textContent, /1\.0\.0/)

  const held = deferred()
  server.hold = held.promise
  server.version = '1.1.0'
  await ui.fire(dom.window, 'focus')
  assert.ok(ui.host.querySelector('[data-template="tracy"]'), 'the row is still drawn')
  assert.doesNotMatch(ui.host.textContent, /Reading the templates/)
  assert.match(ui.host.textContent, /1\.0\.0/)

  held.resolve()
  await ui.settle()
  await ui.settle()
  assert.match(ui.host.textContent, /1\.1\.0/, 'the change made elsewhere shows without F5')
})

test('no timer of its own: with nothing happening, nothing is read', async () => {
  const server = stubServer()
  await mount({ template: null })
  await lib.act(async () => {
    await tick(200)
  })
  assert.equal(server.reads(), 1)
})

test('the Demo Site row of an open template is read again on the same trigger, once', async () => {
  const server = stubServer()
  const ui = await mount({ template: 'tracy' })
  await ui.settle()
  assert.ok(ui.host.querySelector('[data-release-demo]'), 'the Demo Site row is drawn')
  assert.equal(server.demoReads(), 1)
  assert.match(ui.host.querySelector('[data-release-demo]').textContent, /Up to date/)

  // The demo moved on elsewhere (another admin updated it): the release is now behind.
  server.version = '1.1.0'
  const lists = server.reads()
  await lib.act(async () => {
    dom.document.dispatchEvent(new dom.window.Event('visibilitychange'))
    dom.window.dispatchEvent(new dom.window.Event('focus'))
    await tick(5)
  })
  await ui.settle()
  assert.equal(server.reads(), lists + 1, 'one read of the list')
  assert.equal(server.demoReads(), 2, 'one read of the Demo Site row, on the same trigger')
  assert.match(ui.host.querySelector('[data-release-demo]').textContent, /Up to date/)
  assert.match(ui.host.textContent, /1\.1\.0/)
})
