/**
 * A card whose poster cannot be loaded, and the preview's live demo frame, mounted (#811).
 *
 *   - F-S5-014: the poster `<img>` of `DemoThumb` had `onLoad` only, so a poster that failed to
 *     load left the card's skeleton pulsing for good. A failed poster now stops the skeleton and
 *     leaves the card's own no-picture ground (the `bg-muted` box a card without a poster shows),
 *     with no broken image; a poster that loads, a card with no poster and a NEW poster address
 *     after a failure behave as before.
 *   - F-S5-012: the live demo frame of `TemplateBody` sends no referrer, like the card's frame,
 *     and still carries no `sandbox` (the demo is a page a person uses).
 *
 * The real components are bundled in memory and mounted with react-dom on a linkedom document, as
 * `destructive-confirm.test.mjs` does. linkedom loads no picture, so the test fires the `load` and
 * `error` events a browser would; what a real browser paints is not measured here.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
// react-dom is `@tracy/core`'s dependency, not this plugin's; pnpm resolves both packages' react
// to one copy, so the renderer and the components share it.
const coreRequire = createRequire(path.join(repoRoot, 'packages', 'core', 'tracy-core', 'package.json'))
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
  'addEventListener',
  'removeEventListener',
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
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { DemoThumb } from './DemoThumb'
        export { TemplateBody } from './TemplateBody'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
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
  set('location', { origin: 'http://tracy.test', href: 'http://tracy.test/', pathname: '/' })
  window.location = globalThis.location
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
  // No card here is `active` and the preview asks nothing before it mounts its frame.
  set('fetch', async (url) => {
    throw new Error(`unexpected request: ${url}`)
  })
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: globalThis.ResizeObserver,
    addEventListener() {},
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  // The preview listens for its demo's height message on the bare global.
  set('addEventListener', () => {})
  set('removeEventListener', () => {})
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
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

async function mountOf(component, props) {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  let current = props
  const render = (next = {}) =>
    lib.act(async () => {
      current = { ...current, ...next }
      root.render(lib.createElement(component, current))
    })
  const settle = () => lib.act(async () => tick(5))
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await render()
  await settle()
  return {
    host,
    render,
    settle,
    /** Fire a media event the way a browser does: on the element, not bubbling. */
    fire: async (el, type) => {
      await lib.act(async () => {
        el.dispatchEvent(new dom.window.Event(type, { bubbles: false, cancelable: false }))
        await tick(5)
      })
    }
  }
}

const POSTER = 'https://tracy.test/api/templates/ja-vega/shots/home-1440.png?v=1&w=720'
const OTHER = 'https://tracy.test/api/templates/ja-vega/shots/home-1440.png?v=2&w=720'
const card = (over = {}) => ({ src: '', probe: null, poster: POSTER, title: 'Card', active: false, ...over })

/** What the card shows in place of its picture. */
const picture = (host) => ({
  img: host.querySelector('img')?.getAttribute('src') ?? null,
  pulsing: host.querySelector('[data-poster-loading]') !== null,
  // The ground of a card that has no picture: the frame's own muted box, nothing drawn on it.
  ground: host.firstElementChild?.className.split(/\s+/).includes('bg-muted') ?? false,
  children: host.firstElementChild?.children.length ?? -1
})

test('a poster on its way pulses, and stops once it has loaded', async () => {
  const view = await mountOf(lib.DemoThumb, card())
  assert.deepEqual(picture(view.host), { img: POSTER, pulsing: true, ground: true, children: 2 })
  await view.fire(view.host.querySelector('img'), 'load')
  assert.deepEqual(picture(view.host), { img: POSTER, pulsing: false, ground: true, children: 1 })
})

test('a poster that fails to load stops pulsing and leaves the no-picture ground, no broken image', async () => {
  const view = await mountOf(lib.DemoThumb, card())
  await view.fire(view.host.querySelector('img'), 'error')
  const failed = picture(view.host)
  assert.equal(failed.pulsing, false, 'the skeleton does not pulse for good')
  assert.equal(failed.img, null, 'the failed picture is taken away')
  // Exactly what a card with no poster at all shows.
  const bare = await mountOf(lib.DemoThumb, card({ poster: null }))
  assert.deepEqual(failed, picture(bare.host))
  assert.deepEqual(failed, { img: null, pulsing: false, ground: true, children: 0 })
})

test('the failure stays through a redraw with the same address', async () => {
  const view = await mountOf(lib.DemoThumb, card())
  await view.fire(view.host.querySelector('img'), 'error')
  await view.render({ title: 'Card again' })
  assert.deepEqual(picture(view.host), { img: null, pulsing: false, ground: true, children: 0 })
})

test('a new poster address after a failure is asked for, pulses and can load', async () => {
  const view = await mountOf(lib.DemoThumb, card())
  await view.fire(view.host.querySelector('img'), 'error')
  await view.render({ poster: OTHER })
  assert.deepEqual(picture(view.host), { img: OTHER, pulsing: true, ground: true, children: 2 })
  await view.fire(view.host.querySelector('img'), 'load')
  assert.deepEqual(picture(view.host), { img: OTHER, pulsing: false, ground: true, children: 1 })
})

test('a new poster address that fails too ends on the no-picture ground', async () => {
  const view = await mountOf(lib.DemoThumb, card())
  await view.fire(view.host.querySelector('img'), 'error')
  await view.render({ poster: OTHER })
  await view.fire(view.host.querySelector('img'), 'error')
  assert.deepEqual(picture(view.host), { img: null, pulsing: false, ground: true, children: 0 })
})

test('a card with no poster never pulses and draws no picture', async () => {
  const view = await mountOf(lib.DemoThumb, card({ poster: null }))
  assert.deepEqual(picture(view.host), { img: null, pulsing: false, ground: true, children: 0 })
})

test('the preview’s live demo frame sends no referrer and is not sandboxed', async () => {
  const template = {
    quickstarts: {},
    version: '1.0.0',
    image: null,
    demo: { url: 'https://ja-vega.tracy.test/', version: '1.0.0' },
    languages: ['en'],
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: {} }]
  }
  const view = await mountOf(lib.TemplateBody, {
    template,
    name: 'JA Vega',
    device: 'desktop',
    theme: 'light',
    t: (key) => key
  })
  const frame = view.host.querySelector('iframe')
  assert.ok(frame, 'the live demo frame is mounted')
  assert.match(frame.getAttribute('src') ?? '', /^https:\/\/ja-vega\.tracy\.test\//)
  // An HTML document lower-cases attribute names as they are set; linkedom keeps the case React
  // wrote, so the attributes are read by name without regard to case.
  const attributes = new Map([...frame.attributes].map((a) => [a.name.toLowerCase(), a.value]))
  assert.equal(attributes.get('referrerpolicy'), 'no-referrer')
  assert.equal(attributes.has('sandbox'), false, 'a person uses this page: no sandbox')
})
