/**
 * The real `PreviewDialog`, bundled in memory and mounted with react-dom on a linkedom document — the
 * same setup `destructive-confirm.test.mjs` builds inline, as a fixture for tests that only need to
 * open the dialog. The caller sets `globalThis.fetch` before mounting; `restore()` puts every global
 * back.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..', '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
// react-dom is `@tracy/core`'s dependency, not this plugin's; pnpm resolves both to one React.
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')

const ORIGIN = 'http://lane.test'
const GLOBALS = [
  'window',
  'document',
  'location',
  'fetch',
  'DOMParser',
  'ResizeObserver',
  'MutationObserver',
  'HTMLElement',
  'Element',
  'Node',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT',
  'addEventListener',
  'removeEventListener'
]
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

export async function openDialogDom() {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PreviewDialog } from './PreviewDialog'
        export { en } from './strings'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  const saved = new Map()
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  const dom = parseHTML('<!doctype html><html><head></head><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  const { window } = dom
  set('window', window)
  set('document', dom.document)
  set('location', { origin: ORIGIN, href: `${ORIGIN}/demo.tracy.test/`, pathname: '/demo.tracy.test/' })
  set('DOMParser', window.DOMParser)
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
  // A template's body listens on the window itself (`TemplateBody`): the bare globals are the window's.
  set('addEventListener', window.addEventListener.bind(window))
  set('removeEventListener', window.removeEventListener.bind(window))
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  const lib = /** @type {any} */ (mod.exports)

  const t = (key, params = {}) =>
    key in lib.en ? lib.en[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? '')) : key

  /**
   * Mount the dialog on `list[index]`, let its first requests settle, and hand back its unmount.
   * @param {{ list: any[], index?: number, props?: Record<string, unknown> }} opts
   */
  async function mount({ list, index = 0, props = {} }) {
    const host = dom.document.createElement('div')
    dom.document.body.appendChild(host)
    const root = lib.createRoot(host)
    await lib.act(async () => {
      root.render(
        lib.createElement(lib.PreviewDialog, {
          list,
          index,
          site: null,
          onClose: () => {},
          onStep: () => {},
          t,
          ...props
        })
      )
    })
    for (let i = 0; i < 5; i += 1) await lib.act(async () => tick(5))
    return async () => {
      await lib.act(async () => root.unmount())
      host.remove()
      dom.document.body.innerHTML = ''
    }
  }

  return {
    mount,
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    }
  }
}
