/**
 * Settings › Help & about's "Getting started" row (`src/client/index.tsx` `HelpRow`, registered into
 * `@tracy/dsh-settings`' `settings.help.item`; Lee, 12/10/2026, tasks/evidence/getting-started-reopen
 * /mock.html §0), mounted with React into jsdom:
 * - always there while the operator's `onboarding` switch is on, whatever the progress or the
 *   account menu flag: the same ring as the account menu row and "{done} of {total} setup steps
 *   complete.", a tick and "All set. Open it again any time." once every step is done, and
 *   "· Hidden from the account menu" after the line while the row is hidden there;
 * - drawn with the section's own classes, its button with the class the section hands over;
 * - Open opens the screen in reopened mode, as the account menu row does;
 * - toggling the account menu flag on the screen redraws the line underneath without a reload.
 *
 * jsdom is resolved from a workspace member that declares it, as tracy-model-plan's DOM tests do.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const require = createRequire(import.meta.url)

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

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let JSDOM
/** @type {any} */
let dom

before(async () => {
  JSDOM = loadJsdom().JSDOM
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-help-row-'))
  const outfile = path.join(outDir, 'help-row.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement, act } from 'react'
        import { createRoot } from 'react-dom/client'
        import { publishStatus } from '@tracy/dsh-model-plan/connect'
        import { apply, onboardOverlay } from './index'
        import { en } from './strings'
        export const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        export { apply, act, onboardOverlay, publishStatus }
        export function mount(component, container) {
          const root = createRoot(container)
          act(() => root.render(createElement(component, { t })))
          return () => act(() => root.unmount())
        }
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'text' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

function page() {
  dom = new JSDOM(
    '<!doctype html><html lang="en"><head></head><body><div id="help"></div><div id="frame"></div></body></html>',
    {
      pretendToBeVisual: true,
      url: 'https://cowork.tracy.test/demo/?tab=chat'
    }
  )
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent']) {
    Object.defineProperty(globalThis, name, { value: window[name] ?? window, configurable: true })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  return window
}

async function settle() {
  for (let round = 0; round < 3; round++) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    lib.act(() => {})
  }
}

const $ = (selector) => document.querySelector(selector)
const click = async (selector) => {
  const el = $(selector)
  assert.ok(el, `no ${selector}`)
  lib.act(() => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
  await settle()
}

const R = 7
const C = 2 * Math.PI * R
const BUTTON = 'tv-test-outline-sm'

/** A page's status copy with no network: `connected` = an AI account is connected. */
function statusCopy(connected) {
  const known = {
    enabled: true,
    providers: [{ id: 'claude', name: 'Claude' }],
    connections: connected ? [{ connectionId: 'c1', provider: 'claude', connected: true }] : []
  }
  return { current: () => known, subscribe: () => () => {} }
}

/** The account's flags: a hide records a time, a show clears it. */
function store({ menuHiddenAt = null } = {}) {
  let hiddenAt = menuHiddenAt
  return {
    get: () => Promise.resolve({ closedAt: 1760000000000, menuHiddenAt: hiddenAt }),
    close: () => Promise.resolve(),
    hideMenu: () => {
      hiddenAt ??= 1760200000000
      return Promise.resolve()
    },
    showMenu: () => {
      hiddenAt = null
      return Promise.resolve()
    }
  }
}

const SWITCH_ON = { ready: Promise.resolve(), isShown: () => true, subscribe: () => () => {} }

function deps(onboarding) {
  return {
    surface: { onboarding },
    connect: () => ({ provider: '', cancel() {}, submit() {} }),
    copy: async () => true,
    theme: { get: () => 'system', set: () => {} },
    readOffer: async () => ({ catalogue: [], connected: [], accounts: {}, connect: true, connectable: [] }),
    navigate: () => {},
    location: { pathname: '/demo/', search: '', hash: '' },
    formatTime: () => '',
    isMac: true,
    openExternal: () => {}
  }
}

let unmount = () => {}
let unmountOverlay = () => {}

/** Mounts the Help row (and the overlay beside it) of `onboardOverlay(...)`. */
async function help({ flags = {}, connected = false, switches = SWITCH_ON } = {}) {
  page()
  const s = store(flags)
  const made = lib.onboardOverlay(s, deps(s), switches, statusCopy(connected))
  unmount = lib.mount(
    (props) => made.HelpRow({ ...props, buttonClassName: BUTTON }),
    document.getElementById('help')
  )
  unmountOverlay = lib.mount(made.Overlay, document.getElementById('frame'))
  await settle()
  return made
}

afterEach(() => {
  unmount()
  unmount = () => {}
  unmountOverlay()
  unmountOverlay = () => {}
  dom?.window.close()
})

const line = () => $('[data-help-item="getting-started"] .ts-help-status')?.textContent ?? null

test("in progress: the section's row, the ring at 2 of 3, the line and an Open button with the section's class", async () => {
  await help()
  const row = $('#help > .ts-help-row[data-help-item="getting-started"]')
  assert.ok(row, "one row in the section's own class")
  assert.equal($('.ts-row-text .ts-row-title').textContent, 'Getting started')
  assert.equal(line(), '2 of 3 setup steps complete.')
  const ring = $('.ts-help-status .tv-ob-ring')
  assert.equal(ring.getAttribute('aria-hidden'), 'true', 'the line beside it says the same thing')
  assert.equal(Number($('.tv-ob-ring-arc').getAttribute('stroke-dashoffset')), C * (1 - 2 / 3))
  assert.equal($('.tv-ob-ring-tick'), null)
  const open = $('.ts-help-actions button')
  assert.equal(open.textContent, 'Open')
  assert.equal(open.className, BUTTON)
  assert.equal(open.type, 'button')
})

test('every step done: a tick in the ring and "All set. Open it again any time." — the row stays', async () => {
  await help({ connected: true })
  assert.equal(line(), 'All set. Open it again any time.')
  assert.ok($('.tv-ob-ring-tick'), 'the tick')
  assert.equal($('.tv-ob-ring-arc'), null)
  assert.equal($('.tv-ob-ring').dataset.done, 'true')
})

test('hidden from the account menu: the line says so after a separator — the row stays', async () => {
  await help({ flags: { menuHiddenAt: 1760200000000 } })
  assert.equal(line(), '2 of 3 setup steps complete.· Hidden from the account menu')
  assert.equal($('[data-help-hidden] [aria-hidden="true"]').textContent, '· ')
})

test('Open opens the screen in reopened mode; Show in account menu there clears the note underneath', async () => {
  await help({ flags: { menuHiddenAt: 1760200000000 } })
  assert.equal($('[data-tracy-onboard]'), null)
  await click('.ts-help-actions button')
  assert.ok($('[data-tracy-onboard]'), 'the screen opened')
  assert.equal($('.tv-ob-eyebrow').textContent, 'Getting started with Tracy Cowork')
  assert.equal($('.tv-ob-hide').textContent, 'Show in account menu')
  await click('.tv-ob-hide')
  assert.equal($('[data-help-hidden]'), null, 'the row re-read the account')
  assert.equal(line(), '2 of 3 setup steps complete.')
})

test('the operator switched Getting started off: no row', async () => {
  await help({ switches: { ...SWITCH_ON, isShown: () => false } })
  assert.equal($('[data-help-item="getting-started"]'), null)
})

test('through apply(): the row registers into settings.help.item after the updates', async () => {
  page()
  const registered = []
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) })
  lib.apply({
    effect: (fn) => void fn(),
    slots: {
      inject: (name, fn) => fn(),
      register: (options, component) => (registered.push({ options, component }), () => {})
    },
    locale: { register: () => {} },
    theme: { getTheme: () => ({ preference: 'system' }), setTheme: () => {} }
  })
  const item = registered.find((r) => r.options.name === 'settings.help.item')
  assert.ok(item, 'registered')
  assert.deepEqual(
    { id: item.options.id, order: item.options.order, locale: item.options.locale },
    { id: 'tracy-onboard.getting-started', order: 10, locale: 'tracy-onboard' }
  )
})
