/**
 * The site's ••• menu (`MoreMenu`, `more.tsx`) and the operator's switches: a row whose switch is off
 * by default must appear once `/api/ui` says the operator turned it on, even when the menu was drawn
 * before that answer landed.
 *
 *   node --test packages/site/tracy-my-sites/test/more-sync-rows.test.mjs
 *
 * Measured on cowork.tracy.site 25/10/2026: `site-sync-to-live` on in `/ops`, `GET /api/ui` not
 * hiding it, yet the Owner's menu never had the row. This plugin's copy of
 * `@tracy/core/ui-switches` was first asked when the menu opened, so the menu was drawn at the code
 * default (off), and it read the switch without subscribing: the answer landing 280 ms later drew
 * nothing again. (The other half, a copy asked late starting from the page's answer, is
 * `packages/core/tracy-core/test/ui-switches-copies.test.mjs`.)
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PACKAGE = 'packages/site/tracy-my-sites'
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const depsRoot = process.env.TRACY_TEST_DEPS_ROOT || repo
const require = createRequire(path.join(depsRoot, PACKAGE, 'package.json'))

/** jsdom, from a workspace member that declares it. A tree without it fails here, by name. */
function loadJsdom() {
  const homes = ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']
  for (const home of homes) {
    try {
      return createRequire(path.join(depsRoot, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error(`jsdom is not installed under ${homes.join(' or ')}; run pnpm install`)
}

/**
 * `@tracy/core/<door>` resolved to THIS tree's sources through the package's own `exports`, so a
 * copy of the tree is tested against its own core and never against the install's.
 */
const coreFromThisTree = {
  name: 'core-from-this-tree',
  setup(build) {
    const home = path.join(repo, 'packages/core/tracy-core')
    const doors = JSON.parse(readFileSync(path.join(home, 'package.json'), 'utf8')).exports
    build.onResolve({ filter: /^@tracy\/core(\/.*)?$/ }, (args) => {
      const door = `.${args.path.slice('@tracy/core'.length)}`
      if (typeof doors[door] !== 'string') return { errors: [{ text: `@tracy/core has no door ${door}` }] }
      return { path: path.join(home, doors[door]) }
    })
  }
}

/** Bundle `contents` (resolved from this package's client sources) and load it. */
async function bundle(name, contents) {
  const outfile = path.join(outDir, `${name}.cjs`)
  await require('esbuild').build({
    stdin: { contents, resolveDir: path.join(repo, PACKAGE, 'src', 'client'), loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    // The build inlines the plugin's stylesheet through this constant; a test needs none.
    define: { __TAILWIND_CSS__: '""' },
    plugins: [coreFromThisTree],
    nodePaths: [
      path.join(depsRoot, PACKAGE, 'node_modules'),
      path.join(depsRoot, 'packages/core/tracy-core/node_modules')
    ],
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
}

let outDir = ''
/** @type {any} */
let dom
const realFetch = globalThis.fetch

function browser(url) {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'KeyboardEvent',
    'MouseEvent',
    'Event',
    'CustomEvent',
    'DocumentFragment',
    'MutationObserver',
    'getComputedStyle',
    'localStorage',
    'sessionStorage',
    'location'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  // What Radix asks of a browser that jsdom does not have.
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = window.ResizeObserver = Observer
  globalThis.PointerEvent = window.PointerEvent = window.MouseEvent
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  // No `act`: React's async `act` waits on a MessageChannel it never closes when it runs from a
  // bundle, and one open port per call keeps this process alive after the last test. Updates are
  // scheduled the ordinary way (`setImmediate` under Node) and `settle` waits for them.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'more-sync-rows-'))
}

after(() => {
  globalThis.fetch = realFetch
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const mounted = []

/** Let pending promises, renders and effects run: a few turns of the timer queue. */
async function settle() {
  for (let turn = 0; turn < 4; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
  // The page keeps one `/api/sites` answer for every reader (tracy-sidebar `sites.mjs`); a case
  // that rereads the list must not hand its answer to the next case's first read.
  for (const scope of [globalThis, window]) delete scope[Symbol.for('tracy.api.sites.v2')]
})

async function mount(lib, element) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(element)
  await settle()
  return { root, host }
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Replace `fetch` with a table of `"METHOD /path" → () => Response`, recording every call. */
function answer(table) {
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), window.location.origin)
    const key = `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`
    calls.push({ key, body: init.body ?? null })
    const route = table[key]
    if (!route) return json(404, { code: 'NOT_FOUND' })
    return route({ url, init })
  }
  return calls
}

/** @type {any} */
let lib

before(async () => {
  browser('http://tracy.test/acme.example/')
  lib = await bundle(
    'more-sync-rows',
    `
      export { createElement } from 'react'
      export { createRoot } from 'react-dom/client'
      export { MoreMenu } from './more'
      export { en } from './strings'
    `
  )
})

const t = (key, params) =>
  Object.hasOwn(lib.en, key)
    ? lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))
    : `⟦${key}⟧`

const SITE = {
  siteKey: 'acme.example',
  role: 'owner',
  status: 'accepted',
  liveUrl: 'https://acme.example/',
  adminUrl: 'https://acme.example/administrator/',
  lastOwner: true,
  publish: 'published',
  publishing: null,
  syncsFromLive: true
}

/** The menu's items named Sync from live and Sync to live (by their words, as a person reads them). */
const rows = () => {
  const items = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((el) =>
    el.textContent.trim()
  )
  return {
    from: items.filter((text) => text === lib.en['more.syncFromLive']).length,
    to: items.filter((text) => text === lib.en['more.syncToLive']).length
  }
}

test('Sync to live, off by default, appears in a menu drawn before the door said the operator turned it on', async () => {
  let release = () => {}
  const gate = new Promise((resolve) => (release = resolve))
  answer({
    'GET /api/ui': async () => {
      await gate
      return json(200, { hidden: [] })
    }
  })
  await mount(lib, lib.createElement(lib.MoreMenu, { site: SITE, onAction: () => {}, t, defaultOpen: true }))
  assert.ok(document.querySelector('[role="menu"]'), 'the menu is open')
  assert.deepEqual(rows(), { from: 1, to: 0 }, 'before the answer: the code defaults')
  release()
  await settle()
  assert.deepEqual(rows(), { from: 1, to: 1 }, 'the answer lands: the row appears in the open menu')
})

test('an Editor never gets the Sync rows, whatever the switches say', async () => {
  await mount(
    lib,
    lib.createElement(lib.MoreMenu, {
      site: { ...SITE, role: 'editor', lastOwner: false },
      onAction: () => {},
      t,
      defaultOpen: true
    })
  )
  assert.ok(document.querySelector('[role="menu"]'))
  assert.deepEqual(rows(), { from: 0, to: 0 })
})
