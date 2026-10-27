/**
 * My Sites writes each site's publish state after its name, and its row menu has one line, "Publish",
 * that opens that site's Publish tab — the same line for a draft and a live site, for every role.
 *
 * The REAL `MySitesTab` is bundled by esbuild and mounted with React into jsdom; `/api/sites`,
 * `/api/team` and `/auth/me` are answered by a replaced `fetch`, the side card is a recorder, and
 * every press is a real DOM event. Strings are the plugin's own English, so a key the plugin does
 * not ship shows as `⟦key⟧` and fails the test that reads it.
 *
 * What jsdom does not do: lay out or paint; the real browser run covers that.
 *
 *   node --test packages/site/tracy-my-sites/test/site-publish-dom.test.mjs
 *
 * `TRACY_TEST_DEPS_ROOT`: where esbuild, jsdom and the npm packages are resolved from when this
 * file runs from a copy of the tree with no install of its own (the red-before-fix run against the
 * base sources). The sources under test always come from the tree this file stands in.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'my-sites-publish-'))
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
async function openTab(rows) {
  const state = { reads: 0, opened: [], updated: [] }
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), window.location.origin)
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
/** The row's chip as it is written: its state and its word, or null when the row has none. */
function chipOf(siteKey) {
  const chips = tableRow(siteKey).querySelectorAll('[data-status]')
  assert.ok(chips.length <= 1, `${siteKey} writes its state ${chips.length} times`)
  return chips.length === 0
    ? null
    : { status: chips[0].getAttribute('data-status'), text: chips[0].textContent.trim() }
}
const click = (target) =>
  target.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
/** Open the row's "…" menu and hand back its lines, by their text. */
async function menuOf(siteKey) {
  const more = [...tableRow(siteKey).querySelectorAll('button')].filter(
    (b) => b.getAttribute('aria-label') === t('action.more')
  )
  assert.equal(more.length, 1, `${siteKey} has one More button`)
  click(more[0])
  await settle()
  const items = [...document.querySelectorAll('[role="menuitem"]')]
  assert.ok(items.length > 0, 'the menu opened')
  return items
}
const lineNamed = (items, name) => items.filter((item) => item.textContent.trim() === name)

test('each accepted row writes its state once after the name: Draft or Live, dot and word', async () => {
  await openTab(() => [
    row('alpha.example', { publish: 'draft' }),
    row('harbor.example', { publish: 'published', role: 'admin' }),
    row('northwind.example', { publish: 'published', role: 'editor' })
  ])
  assert.deepEqual(chipOf('alpha.example'), { status: 'draft', text: 'Draft' })
  assert.deepEqual(chipOf('harbor.example'), { status: 'live', text: 'Live' })
  assert.deepEqual(chipOf('northwind.example'), { status: 'live', text: 'Live' })
  // The chip sits in the site's own line, after the name.
  const lineOf = tableRow('alpha.example').querySelector('.tracy-mysites-site-line')
  const name = lineOf.querySelector('.tracy-mysites-site-name')
  const chip = lineOf.querySelector('[data-status]')
  assert.ok(name.compareDocumentPosition(chip) & window.Node.DOCUMENT_POSITION_FOLLOWING)
  assert.ok(chip.querySelector('.tv-status-dot'), 'a dot beside the word')
  assert.ok(!document.body.textContent.includes('⟦'), 'every string shown is one the plugin ships')
})

test('a row whose state the list does not give writes none: an invitation, a request, an older server', async () => {
  await openTab(() => [
    row('alpha.example'),
    row('invited.example', { status: 'invited', agent: null, publish: 'published' }),
    row('asked.example', { status: 'requested', agent: null, requestedAt: '2026-10-01T00:00:00Z' }),
    row('odd.example', { publish: 'sideways' })
  ])
  for (const siteKey of ['alpha.example', 'invited.example', 'asked.example', 'odd.example'])
    assert.equal(chipOf(siteKey), null, siteKey)
})

test('the row menu has one line "Publish" right after Settings — the same words for a draft, a live site, one being published and every role — and a press opens that site\'s Publish tab', async () => {
  const cases = [
    ['owner', 'draft'],
    ['admin', 'draft'],
    ['developer', 'draft'],
    ['editor', 'draft'],
    ['owner', 'published'],
    ['admin', 'published'],
    ['editor', 'published'],
    ['owner', 'draft', 'live'],
    ['owner', 'published', 'draft'],
    ['admin', 'published', 'delete']
  ]
  for (const [role, publish, publishing] of cases) {
    const what = `${role} ${publish} ${publishing ?? ''}`
    const state = await openTab(() => [
      row('alpha.example'),
      row('harbor.example', { publish, role, ...(publishing ? { publishing } : {}) })
    ])
    const items = await menuOf('harbor.example')
    const texts = items.map((item) => item.textContent.trim())
    assert.equal(lineNamed(items, 'Publish').length, 1, what)
    // No other wording of it, and no line left that names a section of Settings.
    assert.deepEqual(
      texts.filter((text) => /publish|domain/i.test(text)),
      ['Publish'],
      what
    )
    // It comes right after Settings, before the separator that ends the group.
    assert.equal(texts[texts.indexOf('Publish') - 1], 'Site settings', what)
    click(lineNamed(items, 'Publish')[0])
    await settle()
    assert.deepEqual(
      state.opened,
      [{ type: 'tracy:site-publish', meta: { siteKey: 'harbor.example' } }],
      what
    )
    for (const { root, host } of mounted.splice(0)) {
      root.unmount()
      await settle()
      host.remove()
    }
    document.body.replaceChildren()
    for (const scope of [globalThis, window]) delete scope[Symbol.for('tracy.api.sites.v2')]
  }
})

test('no such line where the list gave no state, and Settings keeps opening its own tab, with nothing but the site', async () => {
  for (const extra of [{}, { publish: 'sideways' }, { publish: null }]) {
    const state = await openTab(() => [row('alpha.example'), row('harbor.example', extra)])
    const items = await menuOf('harbor.example')
    assert.equal(lineNamed(items, 'Publish').length, 0, JSON.stringify(extra))
    click(lineNamed(items, 'Site settings')[0])
    await settle()
    assert.deepEqual(state.opened, [{ type: 'tracy:site-settings', meta: { siteKey: 'harbor.example' } }])
    for (const { root, host } of mounted.splice(0)) {
      root.unmount()
      await settle()
      host.remove()
    }
    document.body.replaceChildren()
    for (const scope of [globalThis, window]) delete scope[Symbol.for('tracy.api.sites.v2')]
  }
})

test('a site published in its Publish tab: My Sites hears it and reads the list again, so the chip follows without a reload', async () => {
  let publish = 'draft'
  const state = await openTab(() => [row('alpha.example', { publish })])
  assert.deepEqual(chipOf('alpha.example'), { status: 'draft', text: 'Draft' })
  const reads = state.reads
  publish = 'published'
  window.dispatchEvent(
    new window.CustomEvent('tracy:site-publish-changed', { detail: { siteKey: 'alpha.example' } })
  )
  await settle()
  await settle()
  assert.ok(state.reads > reads, 'the list was asked for again')
  assert.deepEqual(chipOf('alpha.example'), { status: 'live', text: 'Live' })
  // The row is still there while it re-reads: no loading bar in place of the list.
  assert.ok(tableRow('alpha.example'))
})

test('a site published in ANOTHER browser tab: looking at this tab again reads the list, so its chip is not left behind', async () => {
  let publish = 'draft'
  const state = await openTab(() => [row('alpha.example', { publish })])
  assert.deepEqual(chipOf('alpha.example'), { status: 'draft', text: 'Draft' })
  // No event reaches this window: the publish happened in another tab.
  publish = 'published'
  const reads = state.reads
  window.dispatchEvent(new window.Event('focus'))
  await settle()
  await settle()
  assert.ok(state.reads > reads, 'the list was asked for again on focus')
  assert.deepEqual(chipOf('alpha.example'), { status: 'live', text: 'Live' })
  assert.ok(tableRow('alpha.example'), 'the list stays on screen while it re-reads')

  // Becoming visible again does the same; being hidden asks nothing.
  publish = 'draft'
  const before = state.reads
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  document.dispatchEvent(new window.Event('visibilitychange'))
  await settle()
  assert.equal(state.reads, before, 'a hidden tab does not ask')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  document.dispatchEvent(new window.Event('visibilitychange'))
  await settle()
  await settle()
  assert.ok(state.reads > before)
  assert.deepEqual(chipOf('alpha.example'), { status: 'draft', text: 'Draft' })
  delete document.visibilityState
})

test('while a publish runs on a site its row reads Publishing… and its menu keeps the one line "Publish"; going back to draft reads Draft and keeps it too; the chip follows when the job ends', async () => {
  let rows = [
    row('alpha.example', { publish: 'draft', publishing: 'live' }),
    row('harbor.example', { publish: 'draft', publishing: 'draft', role: 'admin' }),
    row('quay.example', { publish: 'published', publishing: 'live' }),
    row('idle.example', { publish: 'draft' })
  ]
  const state = await openTab(() => rows)
  assert.deepEqual(chipOf('alpha.example'), { status: 'publishing', text: 'Publishing…' })
  assert.deepEqual(chipOf('harbor.example'), { status: 'draft', text: 'Draft' })
  assert.deepEqual(chipOf('quay.example'), { status: 'publishing', text: 'Publishing…' })
  assert.deepEqual(chipOf('idle.example'), { status: 'draft', text: 'Draft' })
  for (const siteKey of ['alpha.example', 'harbor.example', 'quay.example']) {
    const items = await menuOf(siteKey)
    // The line opens the Publish tab; whether an operation may start is that tab's to say.
    assert.equal(lineNamed(items, 'Publish').length, 1, siteKey)
    assert.equal(lineNamed(items, 'Publish…').length + lineNamed(items, 'Domains').length, 0, siteKey)
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
  }
  // The site beside them, with nothing under way, has the same line.
  assert.equal(lineNamed(await menuOf('idle.example'), 'Publish').length, 1)
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await settle()

  // The list is read again while the job still runs (a look back at the tab): still Publishing….
  const reads = state.reads
  window.dispatchEvent(new window.Event('focus'))
  await settle()
  await settle()
  assert.ok(state.reads > reads)
  assert.deepEqual(chipOf('alpha.example'), { status: 'publishing', text: 'Publishing…' })

  // The job ended: the Publish tab says so, and the row reads Live with nothing under way.
  rows = [row('alpha.example', { publish: 'published' })]
  window.dispatchEvent(
    new window.CustomEvent('tracy:site-publish-changed', { detail: { siteKey: 'alpha.example' } })
  )
  await settle()
  await settle()
  assert.deepEqual(chipOf('alpha.example'), { status: 'live', text: 'Live' })
})

test('two reads of the list answered in reverse order: only the latest ask is applied, so an older Draft never paints over a newer Live', async () => {
  // The page's shared reader (tracy-sidebar `sites.mjs`) is replaced for this one bundle, so each
  // read of the tab is an ask this test answers when, and in the order, it chooses.
  const real = path.join(repo, 'packages/ui/tracy-sidebar/src/client/sites.mjs')
  const stub = path.join(outDir, 'sites-held.mjs')
  writeFileSync(
    stub,
    `export * from ${JSON.stringify(real)}
export const readSites = (options) => globalThis.__heldReadSites(options)
`
  )
  const heldReader = {
    name: 'held-sites-reader',
    setup(build) {
      build.onResolve({ filter: /tracy-sidebar\/src\/client\/sites\.mjs$/ }, (args) =>
        args.importer === stub ? null : { path: stub }
      )
    }
  }
  const held = await bundle('my-sites-held.cjs', [heldReader])
  /** @type {{ resolve: (answer: { status: number, body: unknown }) => void }[]} */
  const asks = []
  globalThis.__heldReadSites = () => new Promise((resolve) => void asks.push({ resolve }))
  globalThis.fetch = async (input) => {
    const url = new URL(String(input), window.location.origin)
    if (url.pathname === '/auth/me') return json(200, { email: 'me@example.test' })
    if (url.pathname === '/api/team') return json(200, { sites: [] })
    return json(404, { code: 'NOT_FOUND' })
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = held.createRoot(host)
  mounted.push({ root, host })
  try {
    root.render(
      held.createElement(
        held.TabLoadingScope,
        { label: t('loading.label') },
        held.createElement(held.MySitesTab, {
          t,
          sidebar: { openTab() {}, getSnapshot: () => ({ sessionId: 's1', tabs: [] }) }
        })
      )
    )
    await settle()
    const answer = (publish) => ({ status: 200, body: { sites: [row('alpha.example', { publish })] } })
    assert.equal(asks.length, 1, 'the first read')
    asks[0].resolve(answer('draft'))
    await settle()
    assert.deepEqual(chipOf('alpha.example'), { status: 'draft', text: 'Draft' })

    // Two more reads leave, one after the other: a publish heard of, then a look back at the tab.
    window.dispatchEvent(new window.CustomEvent('tracy:site-publish-changed', { detail: {} }))
    await settle()
    window.dispatchEvent(new window.Event('focus'))
    await settle()
    assert.equal(asks.length, 3, 'both are on the wire')
    // The LATER ask is answered first (the site is live by then) …
    asks[2].resolve(answer('published'))
    await settle()
    assert.deepEqual(chipOf('alpha.example'), { status: 'live', text: 'Live' })
    // … and the EARLIER one, read while the site was still a draft, arrives after it.
    asks[1].resolve(answer('draft'))
    await settle()
    await settle()
    assert.deepEqual(
      chipOf('alpha.example'),
      { status: 'live', text: 'Live' },
      'the older answer was dropped'
    )
    // A failure of an older ask is dropped the same way: the list stays on screen.
    window.dispatchEvent(new window.Event('focus'))
    await settle()
    window.dispatchEvent(new window.Event('focus'))
    await settle()
    assert.equal(asks.length, 5)
    asks[4].resolve(answer('published'))
    await settle()
    asks[3].resolve({ status: 0, body: null })
    await settle()
    await settle()
    assert.ok(tableRow('alpha.example'), 'an older failure did not take the list away')
    assert.deepEqual(chipOf('alpha.example'), { status: 'live', text: 'Live' })
  } finally {
    delete globalThis.__heldReadSites
  }
})
