/**
 * Templates Management: the WHOLE row opens a template (Akemi, 12/10/2026).
 *
 * Measured on cowork.tracy.site the same day: a click on the row's empty space or version chips
 * opened the template, but a click anywhere in the Warnings cell, its pill included, did nothing
 * (that cell stopped the click), and the row itself could not be reached with the keyboard; only
 * the chevron button could. One row, one target: a click anywhere, or Enter on the focused row.
 *
 * Mounted with react-dom on a linkedom document, the way ops-templates-feedback.test.mjs does.
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

const GLOBALS = [
  'window',
  'document',
  'location',
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

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TemplateTable } from './Templates'`,
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
  set('window', window)
  set('document', dom.document)
  set('location', { origin: 'http://harness.test', href: 'http://harness.test/cms', pathname: '/cms' })
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

const row = (over = {}) => ({
  id: 'ja-directory',
  label: 'JA Directory',
  designPack: false,
  active: true,
  image: null,
  category: null,
  releases: [{ tag: 'quickstart/ja-directory/j6', platform: 'joomla', version: '1.0.2' }],
  hasListing: true,
  issues: [],
  warnings: ['The card has no blurb yet.'],
  problems: {},
  ...over
})

async function table() {
  const opened = []
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  await lib.act(async () => {
    root.render(
      lib.createElement(lib.TemplateTable, {
        rows: [row()],
        tab: 'active',
        empty: 'Nothing',
        onOpen: (t) => opened.push(t.id)
      })
    )
  })
  await lib.act(async () => tick(5))
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const fire = async (el, event) => {
    await lib.act(async () => {
      el.dispatchEvent(event)
      await tick(5)
    })
  }
  const click = (el) => fire(el, new dom.window.Event('click', { bubbles: true, cancelable: true }))
  const key = (el, k) => {
    const e = new dom.window.Event('keydown', { bubbles: true, cancelable: true })
    e.key = k
    return fire(el, e)
  }
  return { host, opened, click, key, tr: host.querySelector('tr[data-template="ja-directory"]') }
}

test('a click anywhere on the row opens it: thumbnail, name, chips, warnings pill, empty cell, chevron', async () => {
  const t = await table()
  const cells = [...t.tr.querySelectorAll('td')]
  const targets = [
    ['thumbnail', cells[0].firstElementChild],
    ['name', cells[1].querySelector('span')],
    ['version chip', cells[2].querySelector('[data-build]')],
    ['warnings pill', cells[3].querySelector('[data-count]')],
    ['warnings cell', cells[3]],
    ['chevron cell', cells[4]],
    ['chevron', cells[4].querySelector('svg') ?? cells[4].firstElementChild]
  ]
  for (const [what, el] of targets) {
    assert.ok(el, `${what} is drawn`)
    const before = t.opened.length
    await t.click(el)
    assert.equal(t.opened.length, before + 1, `${what} opens the template exactly once`)
  }
  assert.ok(t.opened.every((id) => id === 'ja-directory'))
})

test('the row is one keyboard stop, and Enter opens it', async () => {
  const t = await table()
  assert.equal(t.tr.getAttribute('tabindex'), '0', 'the row itself is focusable')
  const stops = [...t.tr.querySelectorAll('button, a[href], [tabindex]')].filter(
    (el) => el.getAttribute('tabindex') !== '-1'
  )
  assert.deepEqual(
    stops.map((el) => el.outerHTML.slice(0, 60)),
    [],
    'nothing inside the row is a second tab stop'
  )
  await t.key(t.tr, 'Enter')
  assert.deepEqual(t.opened, ['ja-directory'])
  await t.key(t.tr, 'Tab')
  assert.equal(t.opened.length, 1, 'other keys do nothing')
})
