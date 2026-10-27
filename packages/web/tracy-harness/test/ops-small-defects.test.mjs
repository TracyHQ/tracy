/**
 * Two small Ops defects from the QA audit, mounted (#811).
 *
 *   - F-S8-022: the staff API reference (`/ops/api`, a page tracy-web renders itself) had no entry
 *     on the Ops rail. The rail now carries one link to it. It is an ordinary anchor: a press is
 *     NOT taken over by the SPA (which has no such screen and would land on CMS agents), so the
 *     browser loads the document; modifier presses stay real links as on every other row.
 *   - F-S2-011: turning the `tracy-account` switch off removes the only Sign out, and the screen
 *     said nothing. The catalogue now carries a warning for it, and User Interface prints it when
 *     the switch is off — as it already did for `settings-button`.
 *
 * The real `App` and `UserInterface` are bundled in memory (nothing is written to disk) and mounted
 * with react-dom on a linkedom document, as `question-actions.test.mjs` does; `fetch` is a fixture
 * and the switches door answers from the repository's own catalogue. linkedom navigates nowhere:
 * what is proven is that the press is left to the browser, not what the browser then loads.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
const CATALOGUE = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'packages', 'core', 'tracy-core', 'src', 'ui-switches', 'catalogue.json'),
    'utf8'
  )
)

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'fetch',
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
/** Every address the SPA wrote into the history, in order. */
let pushed = []
/** What `GET /api/ops/ui` answers; every other door answers 404. */
let uiDocument = null
/** Every `scrollIntoView` call, with its element. */
let scrolled = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { App } from './App'
        export { UserInterface } from './settings/UserInterface'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    // The screens name their pictures relative to the module; a CommonJS bundle has no module URL.
    define: { 'import.meta.url': '"http://harness.test/assets/"' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    plugins: [opsI18nPlugin()],
    // React stays outside the bundle and is loaded by Node itself: bundled, its `act` cannot find
    // `module.require` and falls back to a MessageChannel that keeps the test process alive.
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  const location = {
    origin: 'http://harness.test',
    host: 'harness.test',
    href: 'http://harness.test/ops',
    pathname: '/ops',
    search: ''
  }
  const history = {
    state: null,
    pushState: (_state, _title, url) => pushed.push(String(url)),
    replaceState: (_state, _title, url) => pushed.push(String(url))
  }
  set('window', window)
  set('document', dom.document)
  set('location', location)
  set('history', history)
  window.location = location
  window.history = history
  // linkedom lays nothing out, so it has no `scrollIntoView`. The rail calls it 200ms after a route
  // change (App.tsx, "Keep the row you are standing on in view"); any test whose App lives longer
  // than that — a slow CI runner is enough — would throw from the timer. Each call is recorded.
  window.Element.prototype.scrollIntoView = function (options) {
    scrolled.push({ el: this, options })
  }
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
  set('fetch', async (url) =>
    String(url) === '/api/ops/ui' && uiDocument ? json(200, uiDocument) : json(404, { error: 'not found' })
  )
  const storage = new Map()
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
  if (!window.localStorage)
    window.localStorage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, String(value))
    }
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  pushed = []
  scrolled = []
  uiDocument = null
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

async function mountOf(component, props = {}) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const settle = () => lib.act(async () => tick(5))
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () => root.render(lib.createElement(component, props)))
  await settle()
  await settle()
  return {
    host,
    settle,
    /** Press an element; answers whether the page took the press away from the browser. */
    press: async (el, init = {}) => {
      const event = new dom.window.Event('click', { bubbles: true, cancelable: true })
      Object.assign(
        event,
        { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
        init
      )
      await lib.act(async () => {
        el.dispatchEvent(event)
        await tick(5)
      })
      return event.defaultPrevented
    }
  }
}

// ── F-S8-022: the API reference on the rail ──────────────────────────────────────────────────────

const railLinks = (host) =>
  [...host.querySelectorAll('[data-slot="sidebar-content"] a')].map((a) => ({
    el: a,
    href: a.getAttribute('href'),
    text: a.textContent.trim()
  }))

test('Website Opportunities has four distinct view links in its own sidebar group', async () => {
  const view = await mountOf(lib.App)
  const links = railLinks(view.host).filter(
    (link) => link.href === '/ops/wo' || link.href?.startsWith('/ops/wo?')
  )
  assert.deepEqual(
    links.map((link) => link.href),
    ['/ops/wo', '/ops/wo?view=research', '/ops/wo?view=places', '/ops/wo?view=settings']
  )
  const group = links[0].el.closest('[data-slot="sidebar-group"]')
  assert.ok(group, 'the links belong to a sidebar group')
  assert.match(group.textContent, /Website Opportunities/)
  for (const link of links) assert.equal(link.el.closest('[data-slot="sidebar-group"]'), group)
  const invitations = railLinks(view.host).find((link) => link.href === '/ops/invitations')
  assert.ok(invitations)
  assert.notEqual(invitations.el.closest('[data-slot="sidebar-group"]'), group)
})

test('the Ops rail carries exactly one link to the staff API reference, labelled API', async () => {
  const view = await mountOf(lib.App)
  const links = railLinks(view.host)
  assert.ok(links.length > 10, `the rail is mounted (${links.length} rows)`)
  const api = links.filter((l) => l.href === '/ops/api')
  assert.equal(api.length, 1, 'one rail entry points at /ops/api')
  assert.equal(api[0].text, 'API')
  assert.equal(api[0].el.hasAttribute('target'), false, 'it opens in place, like the other rows')
  assert.equal(api[0].el.getAttribute('aria-current'), null, 'and is never the current screen')
})

test('a plain press on the API link is left to the browser: the SPA neither cancels it nor routes', async () => {
  const view = await mountOf(lib.App)
  const api = railLinks(view.host).find((l) => l.href === '/ops/api')
  assert.ok(api, 'the API link is on the rail')
  pushed = []
  const taken = await view.press(api.el)
  assert.equal(taken, false, 'the press is not cancelled, so the browser loads /ops/api')
  assert.deepEqual(pushed, [], 'and the SPA writes no address of its own')
})

test('a modifier press on the API link stays a real link too', async () => {
  const view = await mountOf(lib.App)
  const api = railLinks(view.host).find((l) => l.href === '/ops/api')
  assert.ok(api, 'the API link is on the rail')
  for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
    pushed = []
    assert.equal(await view.press(api.el, init), false, `${JSON.stringify(init)} is not cancelled`)
    assert.deepEqual(pushed, [])
  }
})

test('the rows beside it still navigate in place', async () => {
  // The control: this harness does see a press the SPA takes, so the cases above mean something.
  const view = await mountOf(lib.App)
  const servers = railLinks(view.host).find((l) => l.href === '/ops/servers')
  assert.ok(servers, 'Servers is on the rail')
  pushed = []
  assert.equal(await view.press(servers.el), true, 'the SPA takes the press')
  assert.deepEqual(pushed, ['/ops/servers'])
  pushed = []
  assert.equal(await view.press(servers.el, { metaKey: true }), false, 'but not a modifier press')
  assert.deepEqual(pushed, [])
})

test('the rail scrolls the current row into view once the fold has settled', async () => {
  // Held past the 200ms timer on purpose: this is the case that threw on CI when a mounted App
  // simply outlived it on a slow runner.
  const view = await mountOf(lib.App)
  await lib.act(async () => tick(300))
  const current = view.host.querySelector('[data-slot="sidebar-content"] [aria-current="page"]')
  assert.ok(current, 'the rail marks the screen it stands on')
  assert.deepEqual(
    scrolled.map((call) => [call.el, call.options]),
    [[current, { block: 'nearest' }]]
  )
})

// ── F-S2-011: the Account switch says what turning it off costs ──────────────────────────────────

/** The door's answer, built from the repository's catalogue the way `ops/ui.js` builds it. */
const doorWith = (off) => ({
  areas: CATALOGUE.areas,
  groups: CATALOGUE.groups,
  switches: CATALOGUE.switches.map((s) => ({ ...s, on: off.includes(s.id) ? false : s.defaultOn })),
  updatedBy: null,
  updatedAt: null,
  writable: true
})
const SIGN_OUT_WARNING = /no way to sign out/i

async function settingsArea(off) {
  uiDocument = doorWith(off)
  const area = CATALOGUE.areas.find((a) =>
    a.groups.includes(CATALOGUE.switches.find((s) => s.id === 'tracy-account').group)
  )
  globalThis.location.search = `?area=${area.id}`
  globalThis.location.href = `http://harness.test/ops/ui?area=${area.id}`
  const view = await mountOf(lib.UserInterface)
  const row = [...view.host.querySelectorAll('[data-slot="item"]')].find((el) =>
    /Who is signed in, and Sign out\./.test(el.textContent)
  )
  assert.ok(row, 'the Account switch is drawn')
  return row.textContent
}

test('User Interface warns that Account off leaves no Sign out', async () => {
  assert.match(await settingsArea(['tracy-account']), SIGN_OUT_WARNING)
})

test('the warning shows only while the Account switch is off', async () => {
  assert.doesNotMatch(await settingsArea([]), SIGN_OUT_WARNING)
})

// Collapsible groups must obey the reader even when the current screen belongs to that group.
test('the active Ops group folds from its header and preserves the fold after navigation', async () => {
  window.localStorage.setItem('tracy.ops.foldedGroups', '[]')
  const view = await mountOf(lib.App)
  const header = view.host.querySelector('button[aria-label^="Agents"]')
  assert.ok(header)
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  await view.press(header)
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(JSON.parse(window.localStorage.getItem('tracy.ops.foldedGroups')), ['Agents'])
  await view.press(railLinks(view.host).find((link) => link.href === '/ops/servers').el)
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  await view.press(header.querySelector('svg'))
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  window.localStorage.setItem('tracy.ops.foldedGroups', '[]')
})

test('User Data Analytics preserves the existing Beta folded-group storage key', async () => {
  window.localStorage.setItem('tracy.ops.foldedGroups', '["Beta"]')
  const view = await mountOf(lib.App)
  const header = view.host.querySelector('button[aria-label="User Data Analytics"]')
  assert.ok(header)
  assert.equal(header.getAttribute('aria-expanded'), 'false')
  await view.press(header)
  assert.equal(header.getAttribute('aria-expanded'), 'true')
  assert.deepEqual(JSON.parse(window.localStorage.getItem('tracy.ops.foldedGroups')), [])
  await view.press(header)
  assert.deepEqual(JSON.parse(window.localStorage.getItem('tracy.ops.foldedGroups')), ['Beta'])
  window.localStorage.setItem('tracy.ops.foldedGroups', '[]')
})
