/**
 * The real `DesignSystemTab` and `SystemPreviewDialog`, bundled in memory and mounted with react-dom on a
 * linkedom document — the setup `design-system-library-error.test.mjs` builds inline, as a fixture for
 * tests that walk the try flow (a card, its preview popup, Try on your site, the bar, Keep, Undo).
 *
 * Every door the tab asks is answered by `doors()`, a small in-memory tracy-web: the library, the site's
 * design system read, apply and undo (which move `read` as the host does), the words and preview doors.
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

export const SITE = 'acme.localhost'
export const SYSTEMS = [
  { id: 'refero:one', name: 'Calm Paper', description: 'Quiet and light', ok: true, fonts: [], colors: [] },
  { id: 'refero:two', name: 'Bold Ink', description: 'Dark and loud', ok: true, fonts: [], colors: [] }
]

const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'fetch',
  'DOMParser',
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
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The doors, over one mutable `read`. `applies` and `undos` keep what was pressed.
 * @param {Record<string, unknown>} read - the site's design system read as the tab first sees it.
 */
export function doors(read) {
  /** `preview`: what the preview door answers (status, body); the tab's own tests never need a page. */
  const state = { read, applies: [], undos: [], preview: [503, { code: 'DS_PREVIEW_UNAVAILABLE' }] }
  const base = `/api/sites/${encodeURIComponent(SITE)}/design-system`
  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://tracy.test')
    const method = (init.method ?? 'GET').toUpperCase()
    if (url.pathname === '/api/design-system/library') return json(200, { systems: SYSTEMS })
    if (url.pathname === '/api/sites')
      return json(200, { sites: [{ key: SITE, name: 'Acme', copyUrl: null }] })
    if (url.pathname === base && method === 'GET') return json(200, state.read)
    if (url.pathname === base && method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'))
      const s = SYSTEMS.find((x) => x.id === body.id)
      state.applies.push(body.id)
      const worn = state.read.worn
      const previous = worn ? { id: worn.slotId, name: worn.name } : null
      // `template-default` takes the worn system off (an apply of its own, undone like any other).
      const bare = body.id === 'template-default'
      state.read = {
        ...state.read,
        worn: bare ? null : { id: null, slotId: body.id, name: s?.name ?? body.id },
        last: {
          applyId: `apply-${state.applies.length + 1}`,
          id: body.id,
          name: s?.name ?? body.id,
          previous,
          undone: false
        }
      }
      return json(200, {
        applyId: state.read.last.applyId,
        worn: state.read.worn ? { name: state.read.worn.name } : null,
        seen: true,
        read: state.read
      })
    }
    if (url.pathname === `${base}/undo` && method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}'))
      state.undos.push(body.applyId)
      const previous = state.read.last?.previous ?? null
      state.read = {
        ...state.read,
        worn: previous ? { id: null, slotId: previous.id, name: previous.name } : null,
        last: { ...state.read.last, undone: true }
      }
      return json(200, { worn: previous ? { name: previous.name } : null, read: state.read })
    }
    if (url.pathname === `${base}/words`) return json(200, { present: false })
    if (url.pathname === `${base}/preview`) return json(state.preview[0], state.preview[1])
    throw new Error(`unexpected request: ${method} ${url.pathname}`)
  }
  return state
}

export async function openTabDom() {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { DesignSystemTab } from './DesignSystemTab'
        export { SystemPreviewDialog } from './SystemPreviewDialog'
        export { apply } from './index'
        export { clearTry } from './try-store.mjs'
        export { en } from './strings'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    // `styles.ts` reads the built stylesheet from this define (`scripts/build-client.mjs`); the DOM here has no CSS.
    define: { __TAILWIND_CSS__: '""' },
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
  set('location', new URL('http://tracy.test/'))
  set('history', {
    replaceState: (_state, _title, address) => {
      set('location', new URL(address, globalThis.location.href))
      window.location = globalThis.location
    }
  })
  window.location = globalThis.location
  set('DOMParser', window.DOMParser)
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
  for (const [name, value] of Object.entries({
    getComputedStyle: styles,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    ResizeObserver: Inert,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  }))
    if (typeof window[name] !== 'function') window[name] = value
  // The try state listens on the window itself (`onDesignSystemChanged`): the bare globals are the window's.
  set('addEventListener', window.addEventListener.bind(window))
  set('removeEventListener', window.removeEventListener.bind(window))
  set('IS_REACT_ACT_ENVIRONMENT', true)
  // Two browser facts linkedom lacks, which react-dom's onChange for a text box relies on: it decides at load whether
  // the `input` event exists by `'oninput' in document` (else it falls back to an IE polyfill that calls
  // `attachEvent`), and it only treats an <input> as a text box when `.type` reads a known type — a browser answers
  // 'text' for an input with no type attribute, linkedom answers null.
  dom.document.oninput = null
  const inputProto = window.HTMLInputElement.prototype
  const typeDesc = Object.getOwnPropertyDescriptor(inputProto, 'type')
  if (typeDesc?.get)
    Object.defineProperty(inputProto, 'type', {
      ...typeDesc,
      get() {
        return typeDesc.get.call(this) ?? 'text'
      }
    })
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  const lib = /** @type {any} */ (mod.exports)

  /** The plugin's own English, with `{name}` filled. */
  const t = (key, params = {}) =>
    key in lib.en ? lib.en[key].replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`)) : key
  const settle = async (rounds = 5) => {
    for (let i = 0; i < rounds; i += 1) await lib.act(async () => tick(5))
  }
  const fire = (el, type = 'click') =>
    lib.act(async () => el.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true })))
  /**
   * Type into a text box the way a browser's keystrokes land: the value set through the prototype's own setter
   * (React tracks the instance's `value` to tell a real change from its own write, and a value set through that
   * tracker is never reported to onChange), then one `input` event.
   */
  const type = async (input, text) => {
    const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set
    if (native) native.call(input, text)
    else input.value = text
    await fire(input, 'input')
    await settle()
  }

  /**
   * Mount the tab over `state` (from `doors()`), let its first reads settle, and hand back its unmount.
   * @param {{ state: ReturnType<typeof doors>, props?: Record<string, unknown> }} opts
   */
  async function mountTab({ state, props = {} }) {
    set('fetch', state.fetch)
    const host = dom.document.createElement('div')
    dom.document.body.appendChild(host)
    const root = lib.createRoot(host)
    await lib.act(async () => {
      root.render(lib.createElement(lib.DesignSystemTab, { siteKey: SITE, t, ...props }))
    })
    await settle()
    return {
      host,
      async unmount() {
        await lib.act(async () => root.unmount())
        lib.clearTry()
        host.remove()
        dom.document.body.innerHTML = ''
      }
    }
  }

  /**
   * Mount the preview popup alone, on `system`, with `props` over its quiet defaults; `state` (from `doors()`)
   * answers its doors, the preview door's answer included.
   * @param {{ system?: (typeof SYSTEMS)[number], props?: Record<string, unknown>, state?: ReturnType<typeof doors> }} opts
   */
  async function mountPreview({ system = SYSTEMS[0], props = {}, state = doors({}) } = {}) {
    set('fetch', state.fetch)
    const host = dom.document.createElement('div')
    dom.document.body.appendChild(host)
    const root = lib.createRoot(host)
    await lib.act(async () => {
      root.render(
        lib.createElement(lib.SystemPreviewDialog, {
          s: system,
          t,
          siteKey: SITE,
          template: null,
          returnTo: { current: null },
          tryLabel: t('ds.tryOn'),
          canTry: true,
          reason: null,
          position: null,
          onStep: null,
          onClose: () => {},
          onTry: () => {},
          ...props
        })
      )
    })
    await settle()
    return {
      host,
      async unmount() {
        await lib.act(async () => root.unmount())
        host.remove()
        dom.document.body.innerHTML = ''
      }
    }
  }

  /**
   * Run the plugin's real `apply()` against a fake host (`ctx`), then mount the Design system tab the way
   * dsh would: through the descriptor `apply` registered. `opened` keeps every `openTab` the plugin asked the
   * side card for, so a test can say which tab a press brought in sight; `reloaded` every `reloadTab` (the
   * side card says one Browser tab is open, `browser-1`). `unmountTab()` takes down the tab alone, as the right
   * column does when the Browser tab takes its pane; `unmount()` the tab and the plugin.
   * @param {{ state: ReturnType<typeof doors>, tabType?: string, meta?: Record<string, unknown> }} opts
   */
  async function mountPlugin({ state, tabType = 'tracy:design-system', meta = { siteKey: SITE } }) {
    set('fetch', state.fetch)
    const disposers = []
    const descriptors = new Map()
    const opened = []
    const reloaded = []
    let refreshed = 0
    const ctx = {
      effect: (fn) => {
        const dispose = fn()
        if (typeof dispose === 'function') disposers.push(dispose)
      },
      get: () => undefined,
      betterSidebar: {
        registerTab: (d) => {
          descriptors.set(d.id, d)
          return () => descriptors.delete(d.id)
        },
        openTab: (seed, scope) => opened.push({ seed, scope }),
        openTabsOf: (type) => (type === 'tracy:browser' ? [{ id: 'browser-1' }] : []),
        reloadTab: (id, why) => reloaded.push({ id, why }),
        refreshAvailable: () => {
          refreshed += 1
        }
      },
      locale: { bind: () => t, register: () => {} },
      slots: { inject: () => {}, register: () => () => {} },
      uiConversation: { events: { register: () => {} } },
      uiWorkspace: { startSession: () => {} }
    }
    // Inside act: the plugin mounts its own React root (the try's bar) as it applies.
    await lib.act(async () => lib.apply(ctx))
    const descriptor = descriptors.get(tabType)
    if (!descriptor) throw new Error(`the plugin did not register ${tabType}`)
    const host = dom.document.createElement('div')
    dom.document.body.appendChild(host)
    const root = lib.createRoot(host)
    const press = async (nextMeta) => {
      await lib.act(async () => {
        root.render(descriptor.component({ tab: { id: 'tab-1', type: tabType, title: '', meta: nextMeta } }))
      })
      await settle()
    }
    await press(meta)
    let tabUp = true
    const unmountTab = async () => {
      if (!tabUp) return
      tabUp = false
      await lib.act(async () => root.unmount())
      host.remove()
    }
    return {
      host,
      press,
      opened,
      reloaded,
      /** Every descriptor the plugin registered on the side card, by tab type. */
      descriptors,
      /** How many times the plugin asked the side card to re-ask every `available`. */
      refreshed: () => refreshed,
      unmountTab,
      async unmount() {
        await unmountTab()
        await lib.act(async () => {
          for (const dispose of disposers.reverse()) dispose()
        })
        lib.clearTry()
        dom.document.body.innerHTML = ''
      }
    }
  }

  return {
    lib,
    dom,
    t,
    settle,
    fire,
    type,
    mountTab,
    mountPreview,
    mountPlugin,
    /** The whole page: the tab's host and every popup or bar portaled onto the body. */
    body: () => dom.document.body,
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete globalThis[name]
      }
    }
  }
}
