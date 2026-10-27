/**
 * The Design system tab when the library door does not answer (Akemi, 12/10/2026): the tab says the Add site
 * card's own sentence ("The design systems could not load.") with Try again, centred where the grid would be,
 * never the door's code; Try again asks the library door again, and an answer brings the cards.
 *
 * The real `DesignSystemTab` is bundled in memory and mounted with react-dom on a linkedom document, as
 * `poster-failure.test.mjs` does. Every request the tab makes is answered by the stub below.
 *
 *   node --test packages/design/tracy-design-inspiration/test/design-system-library-error.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const coreRequire = createRequire(path.join(repoRoot, 'packages', 'core', 'tracy-core', 'package.json'))
const { parseHTML } = rootRequire('linkedom')

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'ResizeObserver',
  'IntersectionObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'addEventListener',
  'removeEventListener',
  'IS_REACT_ACT_ENVIRONMENT'
]
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom

/** How the library door answers next: 'fail' (a 503 with a code) or 'ok' (one system). */
let libraryAnswer = 'fail'
let libraryCalls = 0
const SITE = 'acme.localhost'
const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

async function answer(url) {
  const u = String(url)
  if (u === '/api/design-system/library') {
    libraryCalls += 1
    if (libraryAnswer === 'fail') return json(503, { code: 'LIBRARY_UNAVAILABLE' })
    return json(200, {
      systems: [{ id: 'refero:one', name: 'Calm Paper', description: 'Quiet and light', ok: true }]
    })
  }
  if (u === `/api/sites/${encodeURIComponent(SITE)}/design-system`)
    return json(200, {
      platform: 'wordpress',
      canApply: true,
      refused: [],
      worn: null,
      template: 'tracy-business',
      supported: true,
      last: null
    })
  if (u === '/api/sites') return json(200, { sites: [{ key: SITE, name: 'Acme', copyUrl: null }] })
  throw new Error(`unexpected request: ${u}`)
}

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { DesignSystemTab } from './DesignSystemTab'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
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
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', { origin: 'http://tracy.test', href: 'http://tracy.test/', pathname: '/' })
  window.location = globalThis.location
  set('MutationObserver', window.MutationObserver)
  set('HTMLElement', window.HTMLElement)
  set('Element', window.Element)
  set('Node', window.Node)
  const Inert = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  set('ResizeObserver', Inert)
  set('IntersectionObserver', Inert)
  const styles = () => new Proxy({ getPropertyValue: () => '' }, { get: (t, k) => (k in t ? t[k] : '') })
  set('getComputedStyle', styles)
  set('requestAnimationFrame', (fn) => setTimeout(() => fn(Date.now()), 0))
  set('cancelAnimationFrame', (id) => clearTimeout(id))
  set('fetch', answer)
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  set('addEventListener', () => {})
  set('removeEventListener', () => {})
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  lib = mod.exports
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

/** The plugin's own English, with `{name}` filled. */
const t = (key, params = {}) => en[key].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
const settle = () => lib.act(async () => tick(10))

test('a library door that fails says the Add site sentence and Try again, centred, never its code', async () => {
  libraryAnswer = 'fail'
  libraryCalls = 0
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  await lib.act(async () => root.render(lib.createElement(lib.DesignSystemTab, { siteKey: SITE, t })))
  await settle()
  await settle()

  const alert = host.querySelector('[data-library-error]')
  assert.ok(alert, 'the error block shows')
  assert.equal(
    alert.getAttribute('data-library-error'),
    'LIBRARY_UNAVAILABLE',
    'the code is kept for support'
  )
  assert.ok(!host.textContent.includes('LIBRARY_UNAVAILABLE'), 'the customer never reads the code')
  assert.ok(!host.textContent.includes('didn’t work'), 'no bare "That didn’t work"')
  assert.equal(alert.querySelector('p').textContent, 'The design systems could not load.')
  const button = alert.querySelector('button')
  assert.equal(button.textContent, 'Try again')
  const classes = alert.className.split(/\s+/)
  for (const c of ['items-center', 'justify-center', 'text-center', 'flex-1'])
    assert.ok(classes.includes(c), `centred in the grid area (${c})`)
  assert.equal(libraryCalls, 1)

  // Try again asks the library door again; this time it answers and the card shows.
  libraryAnswer = 'ok'
  await lib.act(async () => button.dispatchEvent(new dom.window.Event('click', { bubbles: true })))
  await settle()
  await settle()
  assert.equal(libraryCalls, 2, 'Try again calls the library again')
  assert.equal(host.querySelector('[data-library-error]'), null, 'the error is gone')
  assert.ok(host.querySelector('[data-system="refero:one"]'), 'the grid shows the system')

  await lib.act(async () => root.unmount())
  host.remove()
})

test("the English is word for word the Add site card's, so its translations carry over", () => {
  const addSite = readFileSync(
    path.join(repoRoot, 'packages', 'site', 'tracy-add-site', 'src', 'client', 'strings.ts'),
    'utf8'
  )
  assert.match(addSite, /ds_failed: 'The design systems could not load\.'/)
  assert.match(addSite, /ds_retry: 'Try again'/)
  assert.equal(en['ds.library.failed'], 'The design systems could not load.')
  assert.equal(en['ds.retry'], 'Try again')
})
