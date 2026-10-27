/**
 * The /ops shell speaks the picked language, and the language switch sits beside the theme switch.
 *
 * WHAT RUNS: the real `App`, `I18nProvider` and `createOpsLanguage`, bundled in memory and mounted
 * with react-dom on a linkedom document; the dictionaries are the repository's own
 * `src/i18n/locales/<lang>/shell.json`, handed in by a fixture loader instead of Vite's chunks.
 * WHAT DOES NOT: no browser, no Vite build, no door answers (every fetch is a 404).
 *
 *   node --test packages/web/tracy-harness/test/ops-shell-language.test.mjs
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
const dictionary = (lang) =>
  JSON.parse(readFileSync(path.join(pkgRoot, 'src', 'i18n', 'locales', lang, 'shell.json'), 'utf8'))

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'navigator',
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
const cleanups = []
const storage = new Map()
const cookieWrites = []

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { App } from './App'
        export { I18nProvider, Trans, tr } from './i18n'
        export { createOpsLanguage } from './i18n/ops-language.ts'`,
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
    plugins: [opsI18nPlugin()],
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html lang="en"><head></head><body></body></html>')
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
  const history = { state: null, pushState() {}, replaceState() {} }
  set('window', window)
  set('document', dom.document)
  set('location', location)
  set('history', history)
  set('navigator', { languages: ['en-US'], language: 'en-US', userAgent: 'node' })
  window.location = location
  window.history = history
  window.navigator = globalThis.navigator
  window.Element.prototype.scrollIntoView = () => {}
  Object.defineProperty(dom.document, 'cookie', {
    configurable: true,
    get: () => 'tracy_lang=vi',
    set: (value) => cookieWrites.push(value)
  })
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
  set(
    'fetch',
    async () => new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
  )
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
  window.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, String(value)),
    removeItem: (key) => void storage.delete(key)
  }
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  storage.clear()
  cookieWrites.length = 0
  dom.document.documentElement.className = ''
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

/** Mount the shell with a remembered /ops language; dictionaries come from the repository. */
async function mount(savedLanguage) {
  if (savedLanguage) storage.set('tracy.ops.lang', savedLanguage)
  const language = lib.createOpsLanguage({ win: window, load: async (lang) => dictionary(lang) })
  await language.store.ready
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () =>
    root.render(lib.createElement(lib.I18nProvider, { language }, lib.createElement(lib.App)))
  )
  await lib.act(async () => tick(5))
  return {
    host,
    language,
    text: () => host.textContent.replace(/\s+/g, ' '),
    act: (fn) =>
      lib.act(async () => {
        await fn()
        await tick(5)
      })
  }
}

test('the rail, the brand and the theme switch read in the remembered language', async () => {
  const de = dictionary('de')
  const ui = await mount('de')
  assert.equal(dom.document.documentElement.lang, 'de')
  for (const key of [
    'shell.brand.subtitle',
    'shell.group.campaigns',
    'shell.nav.invitations',
    'shell.nav.general'
  ])
    assert.ok(ui.text().includes(de[key]), `${key}: ${de[key]}`)
  assert.ok(!ui.text().includes('Website operations'), 'no English subtitle')
  const theme = ui.host.querySelector('[data-theme-switch]')
  assert.equal(theme.getAttribute('aria-label'), de['shell.theme.group'])
  assert.equal(
    theme.querySelector('[data-theme-choice="dark"]').getAttribute('aria-label'),
    de['shell.theme.dark']
  )
})

test('the language switch sits in the same row as the theme switch, named in the language on screen', async () => {
  const ui = await mount('fr')
  const theme = ui.host.querySelector('[data-theme-switch]')
  const languageSwitch = ui.host.querySelector('[data-language-switch]')
  assert.ok(languageSwitch, 'the switch is drawn')
  assert.equal(theme.parentElement, languageSwitch.parentElement, 'one row, under the brand')
  assert.ok(
    languageSwitch.className.includes('group-data-[collapsible=icon]:hidden'),
    'hidden with the theme switch when the rail is icons only'
  )
  const button = languageSwitch.querySelector('button')
  assert.equal(button.getAttribute('aria-label'), 'Langue : Français')
  assert.equal(button.getAttribute('data-language-current'), 'fr')
})

test('picking a language redraws the shell and remembers it, without touching tracy_lang', async () => {
  const ui = await mount()
  assert.equal(ui.language.store.get().lang, 'vi', 'starts from the tracy_lang cookie')
  assert.ok(ui.text().includes(dictionary('vi')['shell.brand.subtitle']))
  await ui.act(() => ui.language.setLanguage('zh'))
  assert.ok(ui.text().includes(dictionary('zh')['shell.nav.invitations']), ui.text())
  assert.equal(dom.document.documentElement.lang, 'zh-CN')
  assert.equal(storage.get('tracy.ops.lang'), 'zh')
  await ui.act(() => ui.language.setLanguage('device'))
  assert.equal(storage.has('tracy.ops.lang'), false)
  assert.equal(ui.language.store.get().lang, 'vi')
  assert.deepEqual(cookieWrites, [])
})

test('the theme switch still works as before: dark on press, remembered under its own key', async () => {
  const ui = await mount('nl')
  const dark = ui.host.querySelector('[data-theme-choice="dark"]')
  await ui.act(() => dark.dispatchEvent(new dom.window.Event('click', { bubbles: true })))
  assert.equal(dom.document.documentElement.classList.contains('dark'), true)
  assert.equal(dark.getAttribute('aria-pressed'), 'true')
  assert.equal(storage.get('tracy.ops.theme'), 'dark')
  assert.equal(storage.get('tracy.ops.lang'), 'nl', 'the language choice is untouched')
})

test('without a provider the shell reads English, never a raw key', async () => {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () => root.render(lib.createElement(lib.App)))
  const text = host.textContent
  assert.ok(text.includes('Website operations'))
  assert.ok(!/shell\.[a-z]/.test(text), 'no key on screen')
})

test('tr() reads the language on screen outside a component; Trans fills values as text, never markup', async () => {
  const ui = await mount('it')
  assert.equal(lib.tr('shell.brand.subtitle'), dictionary('it')['shell.brand.subtitle'])
  await ui.act(() => ui.language.setLanguage('es'))
  assert.equal(lib.tr('shell.account.signedInAs', { email: 'a@b.c' }), 'Sesión iniciada como a@b.c')
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await lib.act(async () =>
    root.render(
      lib.createElement(
        lib.I18nProvider,
        { language: ui.language },
        lib.createElement(lib.Trans, { i18nKey: 'shell.account.signedInAs', values: { email: '<b>x</b>' } })
      )
    )
  )
  assert.equal(host.textContent, 'Sesión iniciada como <b>x</b>')
  assert.equal(host.querySelector('b'), null)
})
