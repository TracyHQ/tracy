/**
 * Settings › Account while `/auth/me` cannot be read, mounted (F-S2-021, #811).
 *
 * The section printed "not signed in" for every answer it could not use: a rejected request, a 5xx,
 * an HTML error page. An outage read as a sign-out. The door's own signed-out answer is one exact
 * shape: 200 with `email: null` (`apps/tracy-web/src/identity/route.js`).
 *
 * These tests mount the real `AccountSection`: a failed read (rejection, HTTP error, empty,
 * non-JSON or malformed body, an `email` that is missing, empty or not a string) shows the
 * failure sentence with a retry and never the signed-out sentence; `email: null` alone shows
 * signed out; a usable address shows the account; a retry asks the same door again and settles
 * from the new answer.
 *
 * The section is private to the plugin, so the bundle made here appends a test-only export to the
 * source in memory (nothing is written to disk and the shipped module is not changed). It is
 * mounted with react-dom on a linkedom document; `fetch` is a fixture. No tracy-web, no browser.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))
const { parseHTML } = rootRequire('linkedom')
const ENTRY = path.join(pkgRoot, 'src', 'client', 'index.tsx')

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
/** @type {{ url: string }[]} */
let asked = []
/** What the door answers next, one entry per request. */
let answers = []

/** Expose the private section to this test only. */
const exposeAccount = {
  name: 'expose-account-section',
  setup(build) {
    build.onLoad({ filter: /src\/client\/index\.tsx$/ }, (args) =>
      args.path === ENTRY
        ? {
            contents: `${readFileSync(ENTRY, 'utf8')}\nexport { AccountSection as AccountSectionForTest }\n`,
            loader: 'tsx'
          }
        : undefined
    )
  }
}

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { AccountSectionForTest } from './index'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    define: { __TAILWIND_CSS__: '""' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    plugins: [exposeAccount],
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
  set('fetch', async (url) => {
    asked.push({ url: String(url) })
    const next = answers.shift()
    if (next === undefined) throw new Error(`unexpected request: ${url}`)
    return next()
  })
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
  asked = []
  answers = []
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

/** The translate function hands back the key, so a test names the sentence, not its wording. */
const t = (key) => key

const body =
  (status, text, type = 'application/json') =>
  () =>
    new Response(text, { status, headers: { 'content-type': type } })
const json = (status, value) => body(status, JSON.stringify(value))
const rejected = () => () => {
  throw new TypeError('fetch failed')
}

async function mountAccount() {
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  const settle = () => lib.act(async () => tick(5))
  await lib.act(async () => root.render(lib.createElement(lib.AccountSectionForTest, { t })))
  await settle()
  await settle()
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
  return {
    text: () => host.textContent,
    button,
    press: async (label) => {
      const el = button(label)
      assert.ok(el, `a "${label}" button is on screen`)
      await lib.act(async () => {
        el.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
        await tick(5)
      })
      await settle()
    }
  }
}

function assertFailed(view, label) {
  assert.match(view.text(), /state\.failed/, `${label}: the failure sentence is shown`)
  assert.ok(view.button('action.retry'), `${label}: with a way to retry`)
  assert.doesNotMatch(view.text(), /account\.anonymous/, `${label}: never read as signed out`)
  assert.equal(view.button('action.signIn'), undefined, `${label}: and no sign-in button`)
}

const FAILED_READS = [
  ['the request is rejected', rejected()],
  ['the door answers 500 with JSON', json(500, { error: 'boom' })],
  ['the door answers 502 with an HTML page', body(502, '<html><body>Bad gateway</body></html>', 'text/html')],
  ['the door answers 401', json(401, { error: 'unauthorized' })],
  ['an error status carries the signed-out shape', json(503, { email: null })],
  ['a 200 with an empty body', body(200, '')],
  ['a 200 with an HTML page', body(200, '<!doctype html><html></html>', 'text/html')],
  ['a 200 with malformed JSON', body(200, '{"email":')],
  ['a 200 whose JSON is null', json(200, null)],
  ['a 200 whose JSON is a list', json(200, [])],
  ['a 200 with no email field', json(200, { defaultSite: null })],
  ['a 200 with an empty email', json(200, { email: '' })],
  ['a 200 whose email is not a string', json(200, { email: 42 })]
]

for (const [label, answer] of FAILED_READS) {
  test(`a failed read is said as a failure, not as signed out: ${label}`, async () => {
    answers = [answer]
    const view = await mountAccount()
    assert.deepEqual(asked, [{ url: '/auth/me' }])
    assertFailed(view, label)
  })
}

test('the door’s own signed-out answer (200, email: null) still reads as not signed in', async () => {
  answers = [json(200, { email: null, defaultSite: null, face: null })]
  const view = await mountAccount()
  assert.match(view.text(), /account\.anonymous/)
  assert.ok(view.button('action.signIn'))
  assert.doesNotMatch(view.text(), /state\.failed/)
  assert.equal(view.button('action.retry'), undefined)
})

test('a usable address shows the account and Sign out', async () => {
  answers = [json(200, { email: 'akemi@tracy.test', defaultSite: null, face: null })]
  const view = await mountAccount()
  assert.match(view.text(), /akemi@tracy\.test/)
  assert.ok(view.button('account.signOut'))
  assert.doesNotMatch(view.text(), /state\.failed|account\.anonymous/)
})

test('Try again asks the same door once more and shows the account when it answers', async () => {
  answers = [json(500, {}), json(200, { email: 'akemi@tracy.test' })]
  const view = await mountAccount()
  assertFailed(view, 'first read')
  await view.press('action.retry')
  assert.deepEqual(asked, [{ url: '/auth/me' }, { url: '/auth/me' }])
  assert.match(view.text(), /akemi@tracy\.test/)
  assert.doesNotMatch(view.text(), /state\.failed/)
})

test('Try again that reaches a signed-out door shows not signed in', async () => {
  answers = [rejected(), json(200, { email: null })]
  const view = await mountAccount()
  assertFailed(view, 'first read')
  await view.press('action.retry')
  assert.match(view.text(), /account\.anonymous/)
  assert.doesNotMatch(view.text(), /state\.failed/)
})

test('Try again that fails again keeps the failure and the retry', async () => {
  answers = [json(500, {}), body(200, 'not json', 'text/plain')]
  const view = await mountAccount()
  await view.press('action.retry')
  assert.equal(asked.length, 2)
  assertFailed(view, 'second read')
})
