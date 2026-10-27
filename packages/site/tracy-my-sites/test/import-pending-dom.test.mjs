/**
 * My Sites on a site whose import never finished (`/api/sites` `importPending`): the row says
 * "Import not finished" and its one action opens the import recovery page, never Start the agent,
 * whose `/attach` only made an empty folder on the host. The row is not dropped and does not open.
 *
 * The REAL `MySitesTab` is bundled by esbuild and mounted with React into jsdom, the same harness as
 * `site-publish-dom.test.mjs`.
 *
 *   node --test packages/site/tracy-my-sites/test/import-pending-dom.test.mjs
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

/** `@tracy/core/<door>` resolved to THIS tree's sources, so a copy of the tree tests its own core. */
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

let outDir = ''
/** @type {any} */
let dom
/** @type {any} */
let lib
const realFetch = globalThis.fetch

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://tracy.test/alpha.example/'
  })
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
  // No `act` (see `error-next-step.test.mjs`): updates are scheduled the ordinary way and `settle`
  // waits for them.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'my-sites-import-pending-'))
  lib = await bundle('my-sites.cjs')
})

/** The tab's client, bundled from this tree's source; `plugins` go before the shared one. */
async function bundle(name, plugins = []) {
  const outfile = path.join(outDir, name)
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TabLoadingScope } from '@tracy/ui'
        export { MySitesTab } from './index'
        export { en } from './strings'
      `,
      resolveDir: path.join(repo, PACKAGE, 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    define: { __TAILWIND_CSS__: '""' },
    plugins: [...plugins, coreFromThisTree],
    nodePaths: [
      path.join(depsRoot, PACKAGE, 'node_modules'),
      path.join(depsRoot, 'packages/core/tracy-core/node_modules')
    ],
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
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
  // The page keeps one `/api/sites` answer for every reader (tracy-sidebar `sites.mjs`).
  for (const scope of [globalThis, window]) delete scope[Symbol.for('tracy.api.sites.v2')]
})

/** The plugin's own English, `{name}` filled; a key the table lacks reads as `⟦key⟧`. */
const t = (key, params) =>
  Object.hasOwn(lib.en, key)
    ? lib.en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''))
    : `⟦${key}⟧`

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const row = (siteKey, extra = {}) => ({
  siteKey,
  platform: 'wordpress',
  role: 'owner',
  status: 'accepted',
  createdAt: '2026-09-30T08:00:00.000Z',
  agent: '/',
  copyUrl: `https://${siteKey}/`,
  ...extra
})

/** The tab over `rows()` — a function, so a test can change what the next read of the list says. */
async function openTab(rows, removeAnswer = () => json(200, { removed: true, artifactsKept: 0 })) {
  const state = { reads: 0, opened: [], updated: [], removes: [] }
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), window.location.origin)
    if (init.method === 'DELETE' && url.pathname.endsWith('/import')) {
      state.removes.push(url.pathname)
      return removeAnswer()
    }
    if (url.pathname === '/auth/me') return json(200, { email: 'me@example.test' })
    if (url.pathname === '/api/team') return json(200, { sites: [] })
    if (url.pathname === '/api/sites') {
      state.reads++
      return json(200, { sites: rows() })
    }
    return json(404, { code: 'NOT_FOUND' })
  }
  // The side card as `openTabWithMeta` uses it: the seed is what a site tab is opened with.
  const sidebar = {
    openTab: (seed) => void state.opened.push(seed),
    getSnapshot: () => ({ sessionId: 's1', tabs: [] })
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(
    lib.createElement(
      lib.TabLoadingScope,
      { label: t('loading.label') },
      lib.createElement(lib.MySitesTab, { t, sidebar })
    )
  )
  await settle()
  await settle()
  return state
}

const tableRow = (siteKey) =>
  [...document.querySelectorAll('tr')].find((tr) => tr.textContent.includes(siteKey)) ?? null
const click = (target) =>
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

test('an unfinished import says so and offers the recovery page, not Start the agent', async () => {
  const recovery = '/new/?tab=tracy:add-site&import=old-shop.example.com'
  const state = await openTab(() => [
    row('alpha.example', { publish: 'draft' }),
    row('old-shop.example.com', {
      agent: null,
      imported: true,
      importPending: true,
      importRecovery: recovery,
      publish: 'draft'
    })
  ])
  const pending = tableRow('old-shop.example.com')
  assert.ok(pending, 'the row is still listed')
  assert.ok(pending.textContent.includes(t('badge.importPending')))
  const buttons = [...pending.querySelectorAll('button')].map((b) => b.textContent.trim())
  assert.ok(!buttons.includes(t('action.start')), 'no Start the agent on an unfinished import')
  assert.equal(pending.getAttribute('role'), null, 'the row itself does not open')

  const link = [...pending.querySelectorAll('a')].find(
    (a) => a.textContent.trim() === t('action.finishImport')
  )
  assert.ok(link, 'Finish import is a link')
  assert.equal(link.getAttribute('href'), recovery)
  // A press on it is the link's own, not the row's: no site tab opens.
  link.addEventListener('click', (event) => event.preventDefault())
  click(link)
  await settle()
  assert.deepEqual(state.opened, [], 'no site tab was opened for it')
  assert.ok(!document.body.textContent.includes('⟦'), 'every string shown is one the plugin ships')
})

test('a site with no agent that is not an unfinished import still offers Start the agent', async () => {
  await openTab(() => [row('alpha.example'), row('quiet.example', { agent: null })])
  const buttons = [...tableRow('quiet.example').querySelectorAll('button')].map((b) => b.textContent.trim())
  assert.ok(buttons.includes(t('action.start')))
  assert.ok(!buttons.includes(t('action.finishImport')))
})

const pendingRow = (extra = {}) =>
  row('old-shop.example.com', {
    agent: null,
    imported: true,
    importPending: true,
    importRecovery: '/new/?tab=tracy:add-site&import=old-shop.example.com',
    ...extra
  })
const buttonIn = (root, name) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === name)

test('an owner removes an unfinished import from its row: it asks first, then the one Remove door', async () => {
  let gone = false
  const state = await openTab(
    () => (gone ? [row('alpha.example')] : [row('alpha.example'), pendingRow()]),
    () => {
      gone = true
      return json(200, { removed: true, artifactsKept: 0 })
    }
  )
  click(buttonIn(tableRow('old-shop.example.com'), t('action.removeImport')))
  await settle()
  const dialog = document.querySelector('[role="dialog"]')
  assert.ok(dialog, 'Remove asks first')
  assert.ok(dialog.textContent.includes(t('removeImport.title', { site: 'old-shop.example.com' })))
  assert.deepEqual(state.removes, [], 'nothing is sent before the confirm')
  click(buttonIn(dialog, t('action.removeImport')))
  await settle()
  await settle()
  assert.deepEqual(state.removes, ['/api/sites/old-shop.example.com/import'])
  assert.equal(tableRow('old-shop.example.com'), null, 'the list is read again without it')
  assert.equal(document.querySelector('[role="dialog"]'), null)
})

test('a read still going, or a host that could not say: the dialog says so and the row stays', async () => {
  const state = await openTab(
    () => [pendingRow()],
    () => json(409, { code: 'IMPORT_RUNNING' })
  )
  click(buttonIn(tableRow('old-shop.example.com'), t('action.removeImport')))
  await settle()
  click(buttonIn(document.querySelector('[role="dialog"]'), t('action.removeImport')))
  await settle()
  assert.ok(document.querySelector('[role="dialog"]').textContent.includes(t('removeImport.running')))
  assert.ok(tableRow('old-shop.example.com'))
  assert.equal(state.removes.length, 1)
  assert.ok(!document.body.textContent.includes('⟦'))
})

test('only an owner is offered Remove', async () => {
  await openTab(() => [pendingRow({ role: 'editor' })])
  assert.equal(buttonIn(tableRow('old-shop.example.com'), t('action.removeImport')), undefined)
})
