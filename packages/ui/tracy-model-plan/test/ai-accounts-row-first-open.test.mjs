/**
 * The account menu's AI accounts row on the FIRST opening of the menu (`src/client/AiAccountsRow.tsx`
 * `aiAccountsRow`, `src/client/account-status.ts`). Measured on dev 09/10/2026: the first opening
 * showed the section name alone and the vendor marks / "Not connected" came only from the second
 * opening, because the status was first asked for when the row mounted, i.e. when the menu opened.
 *
 * What must hold:
 * - the status is asked for as soon as the plugin's client loads, so it is usually known before the
 *   person first opens the menu;
 * - a row mounted before the answer lands shows the name alone, then the marks the moment the answer
 *   lands, without the menu being opened a second time;
 * - every copy of the client on one page (dsh can evaluate a plugin's bundle more than once) shares
 *   ONE copy of the status and ONE read, so a Connect published by one copy shows in the other.
 *
 * The client is bundled by esbuild (twice, for two module states) and mounted with React into jsdom.
 * jsdom is resolved from a workspace member that declares it, as `tracy-core`'s DOM tests do.
 *
 *   node --test packages/ui/tracy-model-plan/test/ai-accounts-row-first-open.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const clientDir = path.join(here, '..', 'src', 'client')
const require = createRequire(import.meta.url)

/** jsdom, from a workspace member that declares it. A tree without it fails here, by name. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

/** The status door's answer: nothing connected, two vendors allowed. */
const NOTHING_CONNECTED = {
  enabled: true,
  providers: [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'ChatGPT Codex' }
  ],
  connections: []
}

let outDir = ''
/** @type {any} */
let dom
/** Every call of `fetch` to the status door, each answered only when the test says so. */
/** @type {{ resolve: (value: unknown) => void }[]} */
let reads = []

const SOURCE = `
  import { createElement, act } from 'react'
  import { createRoot } from 'react-dom/client'
  import { aiAccountsRow } from './AiAccountsRow'
  import { accountStatus } from './account-status'
  import { apply } from './index'
  import { en } from './strings'
  const t = (key) => String(en[key] ?? key)
  export { accountStatus }
  /** What dsh does when the page loads the plugin: \`apply\` with its services. */
  export function start() {
    apply({
      effect: (fn) => void fn(),
      inject: () => {},
      slots: { inject: () => {}, register: () => () => {} },
      locale: { register: () => {}, bind: () => t }
    })
  }
  export function mount(container) {
    const Row = aiAccountsRow('tracy-model-plan')
    const root = createRoot(container)
    act(() => {
      root.render(createElement(Row, { t, openSettings: () => {}, close: () => {} }))
    })
    let mounted = true
    const unmount = () => {
      if (mounted) act(() => root.unmount())
      mounted = false
    }
    globalThis.__mountedRows?.push(unmount)
    return { unmount, act }
  }
`

/** Bundle the client once per call: each output is its own module state, like a second copy. */
async function bundle(name) {
  const outfile = path.join(outDir, `${name}.cjs`)
  await require('esbuild').build({
    stdin: { contents: SOURCE, resolveDir: clientDir, loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    define: { __TAILWIND_CSS__: '""' },
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  return outfile
}

let firstFile = ''
let secondFile = ''

/** A fresh page: a new document (no status kept on it), no read on its way, the bundles not loaded. */
function freshPage() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
}

/** @type {any} */
let JSDOM

before(async () => {
  JSDOM = loadJsdom().JSDOM
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  /** Rows mounted by the running test, unmounted afterwards even when an assertion threw first. */
  globalThis.__mountedRows = []
  globalThis.fetch = (url) => {
    // The operator's switches (`@tracy/core/ui-switches`): no answer, every default stands.
    if (String(url) !== '/api/seat-plan/status') return Promise.resolve({ ok: false, status: 404 })
    return new Promise((resolve) => {
      reads.push({
        resolve: (value) => resolve({ ok: true, status: 200, json: async () => value })
      })
    })
  }
  // Real path: \`require.cache\` is keyed by it, and macOS's tmpdir is a symlink.
  outDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'tracy-ai-accounts-first-open-')))
  firstFile = await bundle('first')
  secondFile = await bundle('second')
})

beforeEach(() => {
  freshPage()
  reads = []
  delete require.cache[firstFile]
  delete require.cache[secondFile]
})

afterEach(() => {
  for (const unmount of globalThis.__mountedRows.splice(0)) unmount()
  dom?.window.close()
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/**
 * Let pending promise callbacks run, then flush what they scheduled with a synchronous `act`. An
 * async `act` would make React's bundled copy queue its work on a `MessageChannel`, whose port keeps
 * the test process alive after the last test.
 */
async function settle(act) {
  // Outside \`act\` on purpose: the answer lands the way it does in the page, and React renders it
  // on its own scheduler, which these turns of the event loop let run.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  act(() => {})
}

const marks = (el) => [...el.querySelectorAll('[data-vendor-mark]')].map((m) => m.dataset.vendorMark)

test('the status is asked for when the plugin starts, before any menu opens', () => {
  require(firstFile).start()
  assert.equal(reads.length, 1, 'one read on load')
})

test('a row mounted before the answer shows the name alone, then the marks when it lands', async () => {
  const lib = require(firstFile)
  lib.start()
  const container = document.createElement('div')
  document.body.append(container)
  const { act, unmount } = lib.mount(container)
  assert.equal(container.textContent, 'AI accounts', 'loading: the name alone, no claim')
  assert.deepEqual(marks(container), [])
  assert.equal(reads.length, 1, 'the row joins the read already on its way')

  reads[0].resolve(NOTHING_CONNECTED)
  await settle(act)
  assert.deepEqual(marks(container), ['claude', 'codex'], 'marks without a second mount')
  assert.equal(container.textContent, 'AI accountsNot connected')
  unmount()
})

test('a row mounted after the answer landed shows it at once', async () => {
  const lib = require(firstFile)
  lib.start()
  reads[0].resolve(NOTHING_CONNECTED)
  await settle((fn) => fn())
  const container = document.createElement('div')
  document.body.append(container)
  const { unmount } = lib.mount(container)
  assert.deepEqual(marks(container), ['claude', 'codex'])
  unmount()
})

test('two copies of the client on one page share one read and one copy of the status', async () => {
  const one = require(firstFile)
  const two = require(secondFile)
  assert.notEqual(one, two, 'two module states')
  one.start()
  two.start()
  assert.equal(reads.length, 1, 'one read for the page, not one per copy')
  reads[0].resolve(NOTHING_CONNECTED)
  await settle((fn) => fn())
  assert.deepEqual(two.accountStatus.current(), NOTHING_CONNECTED)

  // A Connect in Settings (one copy) shows on the row drawn by the other copy.
  const container = document.createElement('div')
  document.body.append(container)
  const { act, unmount } = two.mount(container)
  act(() => {
    one.accountStatus.publish({
      ...NOTHING_CONNECTED,
      connections: [
        { connectionId: 'c1', provider: 'codex', name: 'ChatGPT Codex', account: 'a@b.c', connected: true }
      ]
    })
  })
  assert.deepEqual(marks(container), ['codex'])
  assert.equal(container.textContent, 'AI accounts')
  unmount()
})
