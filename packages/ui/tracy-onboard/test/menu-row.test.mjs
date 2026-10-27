/**
 * The account menu's "Getting started" row (`src/client/index.tsx` `MenuRow`, `checklist.ts`,
 * `Ring.tsx`), mounted with React into jsdom:
 * - a progress ring in the icon column and `n/N` at the right edge, counted by the same rule as
 *   the screen's checklist (`flow.ts` `stepsDone`): sign-in and appearance are always done, so the
 *   web with no AI account reads 2/3 and the desktop app with notifications off 2/4;
 * - a connect published to the page's status copy moves the count without a reload;
 * - the row goes when every step is done, when "Hide from account menu" was pressed (the account's
 *   `menuHiddenAt`), and when the operator's `onboarding` switch is off; "Show in account menu"
 *   brings it back without a reload.
 *
 * jsdom is resolved from a workspace member that declares it, as tracy-model-plan's DOM tests do.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, test } from 'node:test'
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
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-menu-row-'))
  const outfile = path.join(outDir, 'menu-row.cjs')
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
    '<!doctype html><html lang="en"><head></head><body><div id="menu"></div><div id="frame"></div></body></html>',
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

/** The ring's arc as the mock computes it: `2πr` with r = 7, offset = C × (1 − done/total). */
const R = 7
const C = 2 * Math.PI * R
const offsetFor = (done, total) => C * (1 - done / total)
const ring = () => {
  const arc = $('.tv-ob-ring .tv-ob-ring-arc')
  assert.ok(arc, 'the arc')
  return {
    label: $('.tv-ob-ring').getAttribute('aria-label'),
    dasharray: Number(arc.getAttribute('stroke-dasharray')),
    dashoffset: Number(arc.getAttribute('stroke-dashoffset'))
  }
}
const count = () => $('[data-menu-item="getting-started"] .tv-ob-menu-count')?.textContent ?? null

/** A page's status copy, as `pageAccountStatus()` gives it, with no network. */
function statusCopy(initial) {
  let known = initial
  const listeners = new Set()
  return {
    current: () => known,
    publish: (next) => {
      known = next
      for (const l of listeners) l()
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    }
  }
}

const NONE = { enabled: true, providers: [{ id: 'claude', name: 'Claude' }], connections: [] }
const CLAUDE = {
  ...NONE,
  connections: [{ connectionId: 'c1', provider: 'claude', name: 'Claude', account: 'lee', connected: true }]
}
const DISCONNECTED = {
  ...NONE,
  connections: [{ connectionId: 'c1', provider: 'claude', name: 'Claude', account: 'lee', connected: false }]
}

/** A store with the account's flags; `calls` records what was asked. */
let calls = []
function store({ closedAt = 1760000000000, menuHiddenAt = null, fail = false } = {}) {
  // The account: a hide records a time, a show clears it, and the next read says so.
  let hiddenAt = menuHiddenAt
  return {
    get: () => {
      calls.push('get')
      return fail
        ? Promise.reject(new Error('no door'))
        : Promise.resolve({ closedAt, menuHiddenAt: hiddenAt })
    },
    close: () => Promise.resolve(),
    hideMenu: () => {
      calls.push('hideMenu')
      hiddenAt ??= 1760200000000
      return Promise.resolve()
    },
    showMenu: () => {
      calls.push('showMenu')
      hiddenAt = null
      return Promise.resolve()
    }
  }
}

/** A surface: the web (no notifications) or the desktop app with notifications `enabled`. */
function surface(onboarding, { desktop = false, enabled = false, permission = 'allowed' } = {}) {
  if (!desktop) return { onboarding }
  let status = { supported: true, enabled, permission, lastShownAt: null, sound: 'system' }
  let watchers = []
  return {
    onboarding,
    agents: { detect: async () => ({ results: [], scanComplete: true }) },
    notifications: {
      status: async () => status,
      setEnabled: async (on) => {
        status = { ...status, enabled: on }
        for (const w of watchers) w(status)
        return status
      },
      test: async () => status,
      openSystemSettings: async () => {},
      onChange: (w) => {
        watchers.push(w)
        return () => {
          watchers = watchers.filter((x) => x !== w)
        }
      }
    }
  }
}

const SWITCH_ON = { ready: Promise.resolve(), isShown: () => true, subscribe: () => () => {} }

/** Everything the screen needs from outside, as fakes (only the row and Hide are exercised here). */
function deps(surfaceOf) {
  return {
    surface: surfaceOf,
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
let closes = []

/** Mounts the row of `onboardOverlay(store, deps, switches, status)`; returns what the call gave. */
async function row(onboarding, surfaceOf, { switches = SWITCH_ON, status = statusCopy(NONE) } = {}) {
  page()
  const made = lib.onboardOverlay(onboarding, deps(surfaceOf), switches, status)
  unmount = lib.mount(
    (props) => made.MenuRow({ ...props, close: () => closes.push(1), openSettings: () => {} }),
    document.getElementById('menu')
  )
  await settle()
  return { ...made, status }
}

beforeEach(() => {
  calls = []
  closes = []
})

afterEach(() => {
  unmount()
  unmount = () => {}
  dom?.window.close()
})

test('the web with no AI account: 2/3 — sign-in and appearance are always done', async () => {
  const s = store()
  await row(s, surface(s))
  assert.equal($('[data-menu-item="getting-started"]').textContent.includes('Getting started'), true)
  assert.equal(count(), '2/3')
  assert.deepEqual(ring(), {
    label: '2 of 3 setup steps complete',
    dasharray: C,
    dashoffset: offsetFor(2, 3)
  })
  assert.equal($('.tv-ob-ring').getAttribute('role'), 'img')
})

test('the desktop app with no AI account and notifications off: 2/4', async () => {
  const s = store()
  await row(s, surface(s, { desktop: true, enabled: false }))
  assert.equal(count(), '2/4')
  assert.equal(ring().dashoffset, offsetFor(2, 4))
})

test('a connect published to the page copy moves the count to 3/4 without a reload; a disconnected row does not count', async () => {
  const s = store()
  const { status } = await row(s, surface(s, { desktop: true, enabled: false }), {
    status: statusCopy(DISCONNECTED)
  })
  assert.equal(count(), '2/4')
  lib.act(() => status.publish(CLAUDE))
  await settle()
  assert.equal(count(), '3/4')
  assert.deepEqual(ring(), {
    label: '3 of 4 setup steps complete',
    dasharray: C,
    dashoffset: offsetFor(3, 4)
  })
})

test('notifications turned on in the app move the count too (the status pushed by the app)', async () => {
  const s = store()
  const sf = surface(s, { desktop: true, enabled: false })
  await row(s, sf, { status: statusCopy(CLAUDE) })
  assert.equal(count(), '3/4')
  await sf.notifications.setEnabled(true)
  await settle()
  assert.equal($('[data-menu-item="getting-started"]'), null, '4/4: nothing left, the row goes')
})

test('every step done: no row (web, an account connected)', async () => {
  const s = store()
  await row(s, surface(s), { status: statusCopy(CLAUDE) })
  assert.equal($('[data-menu-item="getting-started"]'), null)
})

test('hidden from the account menu: no row, whatever the count', async () => {
  const s = store({ menuHiddenAt: 1760200000000 })
  await row(s, surface(s))
  assert.equal($('[data-menu-item="getting-started"]'), null)
  assert.ok(calls.includes('get'), 'the account was asked')
})

test('the operator switched Getting started off: no row', async () => {
  const s = store()
  await row(s, surface(s), { switches: { ...SWITCH_ON, isShown: () => false } })
  assert.equal($('[data-menu-item="getting-started"]'), null)
})

test('no answer about the flags (no door): the row shows with the count it knows', async () => {
  const s = store({ fail: true })
  await row(s, surface(s))
  assert.equal(count(), '2/3')
})

test('the row opens the screen; "Hide from account menu" there takes the row away and "Show in account menu" brings it back, without a reload', async () => {
  const s = store({ closedAt: 1760000000000 })
  const made = await row(s, surface(s))
  // The overlay beside the row, as on the page.
  const unmountOverlay = lib.mount(made.Overlay, document.getElementById('frame'))
  await settle()
  await click('[data-menu-item="getting-started"]')
  assert.deepEqual(closes, [1], 'the menu closes first')
  assert.ok($('[data-tracy-onboard]'), 'the screen opened')
  await click('.tv-ob-hide')
  assert.ok($('[data-tracy-onboard]'), 'the screen stays open')
  assert.ok(calls.includes('hideMenu'))
  assert.equal($('[data-menu-item="getting-started"]'), null, 'the row re-read the account and went')
  await click('.tv-ob-hide')
  assert.ok(calls.includes('showMenu'))
  assert.equal(count(), '2/3', 'the row is back at once, with its count')
  unmountOverlay()
})

test('through apply(): the real page copy — publishStatus from a connect moves the web row from 2/3 to gone', async () => {
  const window = page()
  let seat = NONE
  globalThis.fetch = async (url) => {
    const at = String(url)
    const ok = (body) => ({ ok: true, status: 200, json: async () => body })
    if (at === '/api/ui') return ok({ hidden: [] })
    if (at === '/api/onboarding') return ok({ completedAt: '2026-10-10T08:00:00.000Z', menuHiddenAt: null })
    if (at === '/api/seat-plan/status') return ok(seat)
    if (at === '/auth/me') return ok({ email: 'lee@example.com', name: 'Lee', face: null })
    return { ok: false, status: 404, json: async () => ({}) }
  }
  const registered = []
  lib.apply({
    effect: (fn) => void fn(),
    slots: {
      inject: (name, fn) => fn(),
      register: (options, component) => (registered.push({ options, component }), () => {})
    },
    locale: { register: () => {} },
    theme: { getTheme: () => ({ preference: 'system' }), setTheme: () => {} }
  })
  const item = registered.find((r) => r.options.name === 'settings.menu.item')
  assert.equal(item.options.id, 'tracy-onboard.getting-started')
  lib.act(() => lib.publishStatus(NONE))
  unmount = lib.mount(
    (props) => item.component({ ...props, close: () => {}, openSettings: () => {} }),
    document.getElementById('menu')
  )
  await settle()
  assert.equal(count(), '2/3')
  lib.act(() =>
    lib.publishStatus({
      ...CLAUDE,
      next: null,
      routing: { enabled: true, connectionOrder: ['c1', 'tracy'], version: 1 }
    })
  )
  await settle()
  assert.equal($('[data-menu-item="getting-started"]'), null, 'connected: every web step done')
  void window
})
