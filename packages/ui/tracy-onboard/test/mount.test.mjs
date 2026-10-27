/**
 * The plugin as dsh loads it (`src/client/index.tsx` `apply`), mounted with React into jsdom against
 * a fake desktop bridge:
 * - no bridge (the web) or bridge protocol 1 (an older app): nothing injected, nothing registered;
 * - the overlay registers into `shell.overlay`, asks `onboarding.get()` once, and shows only when
 *   the account never completed it;
 * - four steps, opening on the AI account (signing in is behind the person) or, once the data
 *   arrived, on the first step not done;
 * - Continue ×2 + Done closes with `{outcome: 'completed', picked}` and leads to Settings › AI accounts
 *   on the picked vendor when it is not connected; Escape and a click on the backdrop close as
 *   `dismissed`; ⌘↵ is Continue;
 * - "Connect now" runs the seat-plan sign-in (`@tracy/dsh-model-plan/connect`) and turns the step
 *   Done in place; picking another vendor meanwhile cancels it;
 * - "Appearance & language" carries Settings' Language row; notifications follow macOS's permission.
 *
 * jsdom is resolved from a workspace member that declares it, as tracy-model-plan's DOM tests do.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
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
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-mount-'))
  const outfile = path.join(outDir, 'mount.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement, act } from 'react'
        import { createRoot } from 'react-dom/client'
        import { apply, onboardOverlay } from './index'
        import { en } from './strings'
        export { Tour } from './Tour'
        export { desktopSurface } from './surface'
        export { START_STEPS, SITE_STEPS } from './tour-targets'
        export { TourComposerBridge } from './tour-composer'
        export { watchTourEdit } from './tour-edit'
        export { Welcome } from './Welcome'
        export { openAddSite, sceneAddress, SCENES } from './welcome-flow'
        export { vi as sidebarVi } from '../../../../../vendor/tracy/dsh-better-sidebar/src/client/locales-vi'
        export const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        export { apply, act, onboardOverlay }
        export function mount(component, container, translate = t) {
          const root = createRoot(container)
          act(() => root.render(createElement(component, { t: translate })))
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

/** A fresh page with `window.tracyDesktop` set to `desktop` (or none). */
function page(desktop) {
  dom = new JSDOM('<!doctype html><html lang="en"><head></head><body><div id="frame"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://cowork.tracy.test/demo/?tab=chat#top'
  })
  const { window } = dom
  if (desktop) window.tracyDesktop = desktop
  // jsdom's Location is unforgeable: the page sees a window whose `location` records `assign`.
  const location = {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    assign: (address) => assigned.push(address)
  }
  const seen = new Proxy(window, {
    get(target, prop) {
      if (prop === 'location') return location
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' && !/^[A-Z]/.test(String(prop)) ? value.bind(target) : value
    }
  })
  for (const name of [
    'window',
    'document',
    'Node',
    'HTMLElement',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'MutationObserver'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? seen : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  return window
}

/** What the fake app's main process was asked, in order. */
let calls = []
let assigned = []
/** The deployment's answer to `GET /api/desktop/config`. */
let config = {}
/** The person's answer from `GET /api/seat-plan/status`. */
let seatStatus = {}
/** The account's flag (`GET /api/onboarding` `completedAt`); null = never closed; 'fail' = no door. */
let accountFlag = null
/** The account's other flag (`menuHiddenAt`); 'fail' = the menu-hide door refuses. */
let menuHidden = null
let seenHints = []
/**
 * Whether the account saw the Welcome popup (the `welcome` mark of `/api/seen-hints`). Kept apart
 * from `seenHints` so the tour tests read only the marks they set; true unless a test is about the
 * popup, since the tour shows only after it.
 */
let welcomeSeen = true
let hintReadFailure = false
let hintRecordFailure = false

const CATALOGUE = [
  { id: 'claude', name: 'Claude', homepage: 'https://claude.ai' },
  { id: 'codex', name: 'ChatGPT Codex', homepage: 'https://chatgpt.com/codex' },
  { id: 'copilot', name: 'GitHub Copilot', homepage: 'https://github.com/features/copilot' }
]

/** A protocol-2 bridge; `closedAt` is what `onboarding.get()` answers. */
/** The Help menu's pushes: each watcher `onboarding.onOpen` was given (protocol-2 apps that have it). */
let openWatchers = []

/** What `agents.detect` answers instead of a complete scan that found Codex (null: that one). */
let detectAnswer = null

/** The notification watchers the page gave `notifications.onChange`. */
let notifyWatchers = []

function bridge({ closedAt = null, version = 2, onOpen = true, permission = 'unknown' } = {}) {
  let status = { supported: true, enabled: true, permission, lastShownAt: null, sound: 'system' }
  const record = (name, value) => (calls.push([name, value]), Promise.resolve(value))
  return {
    protocolVersion: 2,
    links: { openExternal: (url) => calls.push(['openExternal', url]) },
    app: {
      protocolVersion: version,
      agents: {
        detect: (ids) => {
          calls.push(['detect', ids])
          return Promise.resolve(
            detectAnswer?.(ids) ?? {
              results: ids.map((id) => ({ id, status: id === 'codex' ? 'found' : 'not-found' })),
              scanComplete: true
            }
          )
        },
        refresh: (ids) => (calls.push(['refresh', ids]), Promise.resolve({ results: [], scanComplete: true }))
      },
      onboarding: {
        ...(onOpen
          ? {
              onOpen: (watcher) => {
                openWatchers.push(watcher)
                return () => {
                  openWatchers = openWatchers.filter((w) => w !== watcher)
                }
              }
            }
          : {}),
        get: () => record('onboarding.get', { flowVersion: 1, closedAt, outcome: null, picked: null }),
        close: (input) => (
          calls.push(['onboarding.close', input]), Promise.resolve({ flowVersion: 1, closedAt: 1, ...input })
        )
      },
      notifications: {
        status: () => record('notifications.status', status),
        setEnabled: (on) => (
          (status = { ...status, enabled: on }), record('notifications.setEnabled', status)
        ),
        test: () => (
          (status = { ...status, lastShownAt: Date.UTC(2026, 9, 10, 20, 41) }),
          record('notifications.test', status)
        ),
        openSystemSettings: () => record('notifications.openSystemSettings', undefined),
        setSound: (name) => ((status = { ...status, sound: name }), record('notifications.setSound', status)),
        onChange: (watcher) => {
          notifyWatchers.push(watcher)
          return () => {
            notifyWatchers = notifyWatchers.filter((w) => w !== watcher)
          }
        }
      }
    }
  }
}

/** dsh's locale snapshot in the fake context: English, following the device. */
let locale = {}
const localeListeners = new Set()
const LOCALES = [
  { id: 'en', label: 'English' },
  { id: 'vi', label: 'Tiếng Việt' },
  { id: 'fr', label: 'Français' }
]

/** A fake dsh context; `registered` collects what went into each slot. */
function context() {
  const registered = []
  const themes = []
  let preference = 'system'
  const ctx = {
    effect: (fn) => void fn(),
    slots: {
      inject: (name, fn) => {
        registered.push({ inject: name })
        fn()
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      }
    },
    locale: {
      register: () => {},
      getSnapshot: () => locale,
      subscribe: (listener) => {
        localeListeners.add(listener)
        return () => localeListeners.delete(listener)
      },
      setLocale: (id) => {
        locale = { ...locale, active: id, preference: id }
        for (const l of localeListeners) l()
      },
      clearPreference: () => {
        const { preference: _, ...rest } = locale
        locale = rest
        for (const l of localeListeners) l()
      },
      bind: () => lib.t
    },
    theme: {
      getTheme: () => ({ preference }),
      setTheme: (id) => {
        preference = id
        themes.push(id)
      }
    }
  }
  return { ctx, registered, themes }
}

/**
 * Let promises and React effects settle. Never an async `act`: React's bundled copy would queue its
 * work on a `MessageChannel`, whose port keeps the test process alive (tracy-model-plan measured it).
 */
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
const key = async (init) => {
  lib.act(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, ...init })))
  await settle()
}

/** apply() on a page with `desktop`, the overlay mounted; returns the fake context. */
async function start(desktop, manual = false, translate = lib.t) {
  page(desktop)
  const sidebar = document.createElement('button')
  sidebar.className = 'tv-start-card'
  sidebar.innerHTML = '<i data-tone="create"></i>'
  sidebar.getBoundingClientRect = () => new window.DOMRect(10, 10, 32, 32)
  document.body.append(sidebar)
  const c = context()
  lib.apply(c.ctx)
  if (manual) {
    const help = c.registered.find((r) => r.options?.name === 'settings.help.item')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const stop = lib.mount(help.component, host)
    await settle()
    await click('[data-help-item="getting-started"] button')
    stop()
    host.remove()
  }
  const overlay = c.registered.find((r) => r.options?.name === 'shell.overlay')
  if (overlay) unmount = lib.mount(overlay.component, document.getElementById('frame'), translate)
  await settle()
  return c
}

/** Unmounts the overlay of the running test. */
let unmount = () => {}
/** Unmounts the account menu row a test mounted. */
let unmountRow = () => {}

afterEach(() => {
  unmount()
  unmount = () => {}
  unmountRow()
  unmountRow = () => {}
  dom?.window.close()
})

/** What `connect/start` and `connect/complete` answer, set per test. */
let startAnswer = null
let completeAnswer = null
const PROVIDERS = CATALOGUE.map(({ id, name }) => ({ id, name }))

beforeEach(() => {
  openWatchers = []
  notifyWatchers = []
  calls = []
  assigned = []
  locale = { active: 'en', locales: LOCALES }
  localeListeners.clear()
  config = { llm: { connect: true, providers: ['claude', 'codex', 'copilot'] }, catalogue: CATALOGUE }
  seatStatus = { providers: PROVIDERS, connections: [] }
  startAnswer = null
  completeAnswer = null
  accountFlag = null
  menuHidden = null
  seenHints = []
  welcomeSeen = true
  hintReadFailure = false
  hintRecordFailure = false
  detectAnswer = null
  globalThis.fetch = async (url, init = {}) => {
    const at = String(url)
    const ok = (body) => ({ ok: true, status: 200, json: async () => body })
    // The operator's switches (`@tracy/core/ui-switches`): none off. One read per page, not recorded.
    if (at === '/api/ui') return ok({ hidden: [] })
    if (at === '/api/seen-hints') {
      const method = init.method ?? 'GET'
      calls.push([`${method} /api/seen-hints`, init.body ? JSON.parse(init.body) : undefined])
      if ((method === 'GET' && hintReadFailure) || (method === 'POST' && hintRecordFailure))
        return { ok: false, status: 503, json: async () => ({}) }
      if (method === 'POST') {
        const hint = JSON.parse(init.body).hint
        if (hint === 'welcome') welcomeSeen = true
        else seenHints.push(hint)
      }
      return ok({ hints: [...seenHints, ...(welcomeSeen ? ['welcome'] : [])].sort() })
    }
    if (at === '/api/onboarding') {
      const method = init.method ?? 'GET'
      calls.push([`${method} /api/onboarding`])
      if (accountFlag === 'fail') return { ok: false, status: 404, json: async () => ({}) }
      if (method === 'POST') accountFlag ??= '2026-10-11T18:00:00.000Z'
      return ok({ completedAt: accountFlag, menuHiddenAt: menuHidden === 'fail' ? null : menuHidden })
    }
    if (at === '/api/onboarding/menu-show') {
      calls.push(['POST /api/onboarding/menu-show'])
      if (menuHidden === 'fail') return { ok: false, status: 403, json: async () => ({}) }
      menuHidden = null
      return ok({ menuHiddenAt: null })
    }
    if (at === '/api/onboarding/menu-hide') {
      calls.push(['POST /api/onboarding/menu-hide'])
      if (menuHidden === 'fail') return { ok: false, status: 403, json: async () => ({}) }
      menuHidden ??= '2026-10-12T01:00:00.000Z'
      return ok({ menuHiddenAt: menuHidden })
    }
    calls.push(['fetch', at, init.body ? JSON.parse(init.body) : undefined])
    if (at === '/api/desktop/config') return ok(config)
    if (at === '/api/seat-plan/status') return ok(seatStatus)
    if (at === '/api/seat-plan/connect/start') return ok(startAnswer)
    if (at === '/api/seat-plan/connect/complete') return ok(completeAnswer)
    if (at === '/auth/me')
      return ok({
        email: 'lee@example.com',
        name: 'Lee',
        face: { initial: 'L', color: '#2a7', avatarUrl: null }
      })
    return { ok: false, status: 404, json: async () => ({}) }
  }
})

const railCount = () => document.querySelectorAll('[data-rail-step]').length
const names = (list) => list.map((x) => x[0])

test('the web, setup reopened from Help: three steps, "Popular" with no scan, Done on Appearance records the account', async () => {
  const c = await start(undefined, true)
  assert.ok($('[data-tracy-onboard][role="dialog"]'))
  assert.equal($('.tv-ob-eyebrow').textContent, 'Getting started with Tracy Cowork')
  assert.equal(railCount(), 3, 'Sign in, AI account, Appearance & language: no Notifications step')
  assert.equal($('.tv-ob-rail-count').textContent, '2/3')
  assert.equal($('.tv-ob-title').textContent, 'Pick your AI account')
  assert.equal($('[data-mode]').dataset.mode, 'popular')
  assert.equal($('[data-action="refresh"]'), null, 'nothing to refresh: the web looks at no computer')
  assert.equal($('.tv-ob-note'), null, 'and never says "No AI tools were found on this computer"')
  assert.ok(!calls.some((x) => x[0] === 'detect'))

  await click('[data-agent="claude"]')
  assert.ok($('[data-connect="idle"]'), 'Connect now, as in the app')
  await click('[data-action="next"]')
  assert.equal($('.tv-ob-title').textContent, 'Appearance & language')
  assert.equal($('[data-action="next"]').textContent.startsWith('Done'), true, 'the last step on the web')
  await click('[data-theme-pick="light"]')
  assert.deepEqual(c.themes, ['light'])

  await click('[data-action="next"]')
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(names(calls.filter((x) => x[0].endsWith('/api/onboarding'))), [
    'GET /api/onboarding',
    'GET /api/onboarding',
    'GET /api/onboarding',
    'GET /api/onboarding',
    'POST /api/onboarding'
  ])
  assert.deepEqual(assigned, ['/demo/?tab=chat&settings=ai-accounts&vendor=claude#top'])
})

test('the web, an account that closed it: nothing drawn; the account menu row "Getting started" reopens it', async () => {
  accountFlag = '2026-10-10T08:00:00.000Z'
  const c = await start(undefined)
  assert.equal($('[data-tracy-onboard]'), null)
  const row = c.registered.find((r) => r.options?.name === 'settings.menu.item')
  assert.equal(row.options.id, 'tracy-onboard.getting-started')
  assert.equal(row.options.locale, 'tracy-onboard')

  const closes = []
  const menu = document.createElement('div')
  document.body.appendChild(menu)
  unmountRow = lib.mount(
    (props) => row.component({ ...props, close: () => closes.push(1), openSettings: () => {} }),
    menu
  )
  // The row draws once the account's flags answered (a row about to be hidden never flashes).
  await settle()
  assert.equal($('[data-menu-item="getting-started"]').textContent, 'Getting started2/3')
  await click('[data-menu-item="getting-started"]')
  assert.deepEqual(closes, [1], 'the menu closes first')
  assert.ok($('[data-tracy-onboard]'))
  assert.equal($('.tv-ob-eyebrow').textContent, 'Getting started with Tracy Cowork')
  assert.equal(railCount(), 3)

  await key({ key: 'Escape' })
  assert.equal($('[data-tracy-onboard]'), null)
  assert.ok(
    calls.some((x) => x[0] === 'POST /api/onboarding'),
    'a close is recorded (the first time stays)'
  )
})

test('the web, no onboarding door (a bare dsh profile) or no answer: nothing drawn, nothing invented', async () => {
  accountFlag = 'fail'
  await start(undefined)
  assert.equal($('[data-tracy-onboard]'), null)
})

test('an older app (bridge protocol 1) is the web: the account decides, tour replaces automatic setup', async () => {
  await start(bridge({ version: 1 }))
  assert.ok($('[data-tour-step="createsite"]'))
  assert.equal($('[data-tracy-onboard]'), null)
  assert.equal(railCount(), 0)
  assert.ok(!calls.some((x) => x[0] === 'onboarding.get'))
})

test('the operator switched Getting started off: no screen on first run, no menu row, the menu reopens nothing', async () => {
  page(undefined)
  const shown = new Map([['onboarding', false]])
  const switches = {
    ready: Promise.resolve(),
    isShown: (id) => shown.get(id) ?? true,
    subscribe: () => () => {}
  }
  const store = {
    get: () => (calls.push(['get']), Promise.resolve({ closedAt: null })),
    close: () => Promise.resolve()
  }
  const { Overlay, open, MenuRow } = lib.onboardOverlay(store, { surface: { onboarding: store } }, switches)
  unmount = lib.mount(Overlay, document.getElementById('frame'))
  await settle()
  assert.equal($('[data-tracy-onboard]'), null)
  open()
  await settle()
  assert.equal($('[data-tracy-onboard]'), null)
  const menu = document.createElement('div')
  document.body.appendChild(menu)
  unmountRow = lib.mount((props) => MenuRow({ ...props, close: () => {}, openSettings: () => {} }), menu)
  assert.equal($('[data-menu-item="getting-started"]'), null)
})

test('a device that closed setup: the account still decides the automatic tour', async () => {
  const c = await start(bridge({ closedAt: 1760000000000 }))
  const overlay = c.registered.find((r) => r.options?.name === 'shell.overlay')
  assert.equal(overlay.options.id, 'tracy-onboard')
  assert.equal(overlay.options.locale, 'tracy-onboard')
  assert.ok(document.querySelector('style[data-tracy-onboard-style="1"]'))
  assert.equal($('[data-tracy-onboard]'), null)
  assert.ok($('[data-tour-step="createsite"]'), 'the account is new even though this device closed setup')
  assert.deepEqual(
    calls.filter((x) => x[0] !== 'fetch').map((x) => x[0]),
    // The account's first run, then the account's Welcome mark (Welcome.tsx).
    ['GET /api/onboarding', 'GET /api/seen-hints'],
    'automatic first run reads the account, independent of the device'
  )
})

test('setup opened from Help: found Codex picked, four steps, Done records the pick and opens AI accounts on it', async () => {
  const c = await start(bridge(), true)
  assert.ok($('[data-tracy-onboard][role="dialog"]'))
  assert.equal($('.tv-ob-title').textContent, 'Pick your AI account')
  assert.equal(document.querySelectorAll('[data-rail-step]').length, 4)
  assert.deepEqual(
    calls.find((x) => x[0] === 'detect'),
    ['detect', ['claude', 'codex', 'copilot']],
    'the catalogue ids, in order'
  )
  assert.equal($('[data-mode]').dataset.mode, 'found')
  assert.equal($('.tv-ob-agent[aria-pressed="true"]').dataset.agent, 'codex')

  await click('[data-action="next"]')
  assert.equal($('.tv-ob-title').textContent, 'Appearance & language')
  assert.ok($('.ts-select'), "Settings' Language row")
  await click('[data-theme-pick="dark"]')
  assert.deepEqual(c.themes, ['dark'], 'applied at once through dsh')
  assert.equal($('[data-theme-pick="dark"]').getAttribute('aria-pressed'), 'true')

  await key({ key: 'Enter', metaKey: true })
  assert.equal($('.tv-ob-title').textContent, 'Notifications')
  assert.equal($('[data-action="next"]').textContent.startsWith('Done'), true)
  await click('[data-action="send-test"]')
  assert.match($('[data-status]').textContent, /Test notification sent at/)
  await click('[data-action="notify"]')
  assert.deepEqual(calls.find((x) => x[0] === 'notifications.setEnabled')[1].enabled, false)
  await click('[data-action="open-settings"]')
  assert.ok(calls.some((x) => x[0] === 'notifications.openSystemSettings'))

  await click('[data-action="next"]')
  assert.deepEqual(
    calls.find((x) => x[0] === 'onboarding.close'),
    ['onboarding.close', { outcome: 'completed', picked: 'codex' }]
  )
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(assigned, ['/demo/?tab=chat&settings=ai-accounts&vendor=codex#top'])
})

test('the desktop app: reopened setup still has four steps and records the device and account', async () => {
  accountFlag = '2026-10-01T00:00:00.000Z'
  await start(bridge(), true)
  assert.ok($('[data-tracy-onboard]'), 'Help opens setup even when the account completed onboarding')
  assert.equal(railCount(), 4)
  await click('[data-action="skip"]')
  assert.deepEqual(
    names(calls).filter((n) => n.includes('onboarding')),
    [
      ...Array(3).fill('GET /api/onboarding'),
      'GET /api/onboarding',
      'POST /api/onboarding',
      'onboarding.close'
    ]
  )
})

test('the desktop app: an account door that fails never holds up the close on this device', async () => {
  accountFlag = 'fail'
  await start(bridge(), true)
  await click('[data-action="skip"]')
  assert.equal($('[data-tracy-onboard]'), null)
  assert.ok(calls.some((x) => x[0] === 'onboarding.close'))
})

test('Escape closes as dismissed and leads nowhere', async () => {
  await start(bridge(), true)
  await key({ key: 'Escape' })
  assert.deepEqual(calls.find((x) => x[0] === 'onboarding.close')[1], {
    outcome: 'dismissed',
    picked: 'codex'
  })
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(assigned, [])
})

test('a click on the backdrop closes as dismissed; a click inside the dialog does not', async () => {
  await start(bridge(), true)
  await click('.tv-ob-title')
  assert.ok($('[data-tracy-onboard]'))
  await click('.tv-ob-overlay')
  assert.equal(calls.find((x) => x[0] === 'onboarding.close')[1].outcome, 'dismissed')
})

test('connecting turned off on /ops: the line shows, and Done stays on the page', async () => {
  config = { llm: { connect: false, providers: [] }, catalogue: CATALOGUE }
  await start(bridge(), true)
  assert.ok($('[data-connect="off"]'))
  for (let i = 0; i < 3; i++) await click('[data-action="next"]')
  assert.equal(calls.find((x) => x[0] === 'onboarding.close')[1].outcome, 'completed')
  assert.deepEqual(assigned, [])
})

test('a picked vendor not on this computer: Install instructions opens its homepage through the app', async () => {
  await start(bridge(), true)
  await click('.tv-ob-disclosure')
  await click('[data-agent="copilot"]')
  assert.ok($('[data-warn="copilot"]'))
  await click('[data-action="install"]')
  assert.deepEqual(calls.at(-1), ['openExternal', 'https://github.com/features/copilot'])
})

test('a tracy-web without `catalogue`: the vendors come from the seat-plan status, without homepages', async () => {
  config = { llm: { connect: true, providers: ['claude', 'codex'] } }
  globalThis.fetch = async (url) => {
    calls.push(['fetch', String(url)])
    if (String(url) === '/api/desktop/config') return { ok: true, json: async () => config }
    if (String(url) === '/api/seat-plan/status')
      return {
        ok: true,
        json: async () => ({
          providers: [
            { id: 'claude', name: 'Claude' },
            { id: 'codex', name: 'ChatGPT Codex' }
          ]
        })
      }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  await start(bridge(), true)
  assert.deepEqual(
    [...document.querySelectorAll('[data-agent]')].map((el) => el.dataset.agent),
    ['tracy', 'codex'],
    'Tracy AI always leads; Codex found; Claude behind the disclosure'
  )
  await click('.tv-ob-disclosure')
  await click('[data-agent="claude"]')
  assert.ok($('[data-warn="claude"]'))
  assert.equal($('[data-action="install"]'), null, 'no homepage known')
})

const chip = () => $('.tv-ob-chip').textContent
const doneBars = () =>
  [...document.querySelectorAll('[data-rail-step]')].map((b) => b.dataset.done === 'true')

test('the Done / Not done chip and the checklist follow each step; all done opens on Sign in', async () => {
  seatStatus = { providers: PROVIDERS, connections: [{ provider: 'codex', account: 'lee', connected: true }] }
  await start(bridge(), true)
  assert.deepEqual(doneBars(), [true, true, true, true])
  assert.equal(document.querySelectorAll('[data-rail-step] svg').length, 4, 'a ✓ on each done row')
  assert.equal($('[data-rail-step][aria-current="step"]').dataset.railStep, '0', 'nothing left: step 1')
  assert.equal($('.tv-ob-title').textContent, 'Sign in')
  assert.equal(chip(), 'Done')
  assert.equal($('[data-action="back"]'), null)

  await click('[data-action="next"]')
  assert.equal(chip(), 'Done', 'an AI account is connected')
  await click('[data-action="next"]')
  assert.equal(chip(), 'Done', 'appearance & language is always done')

  await click('[data-action="next"]')
  assert.equal(chip(), 'Done', 'notifications on and supported')
  assert.equal($('[data-notify]').dataset.notify, 'on')
  await click('[data-action="notify"]')
  assert.equal(chip(), 'Not done')
  assert.equal($('[data-notify]').dataset.notify, 'off')
})

test('no connected account: the AI step is not done; the sound picker writes through setSound', async () => {
  seatStatus = { providers: PROVIDERS, connections: [{ provider: 'claude', connected: false }] }
  await start(bridge(), true)
  assert.equal(chip(), 'Not done')
  await click('[data-action="next"]')
  await click('[data-action="next"]')
  const select = $('[data-action="sound"]')
  assert.equal(select.value, 'system')
  lib.act(() => {
    select.value = 'Glass'
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await settle()
  assert.deepEqual(calls.find((x) => x[0] === 'notifications.setSound')[1].sound, 'Glass')
  assert.equal($('[data-action="sound"]').value, 'Glass')
})

/** The Help menu's "Getting started with Tracy Cowork": the app pushes `onboarding-open`. */
async function pushOpen() {
  assert.equal(openWatchers.length, 1, 'one subscription')
  lib.act(() => openWatchers[0]())
  await settle()
}

test('Help › Getting started reopens the panel after it was closed, at the first step not done', async () => {
  seatStatus = { providers: PROVIDERS, connections: [{ provider: 'codex', connected: true }] }
  accountFlag = '2026-10-10T08:00:00.000Z'
  await start(bridge({ closedAt: 1760000000000, permission: 'denied' }))
  assert.equal($('[data-tracy-onboard]'), null, 'closed on this device: nothing on load')
  await pushOpen()
  assert.ok($('[data-tracy-onboard]'))
  assert.equal($('.tv-ob-eyebrow').textContent, 'Getting started with Tracy Cowork')
  assert.equal(
    $('[data-rail-step][aria-current="step"]').dataset.railStep,
    '3',
    'signed in, connected, appearance always: start at Notifications, which macOS blocks'
  )
  assert.equal($('.tv-ob-title').textContent, 'Notifications')

  await key({ key: 'Escape' })
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(
    calls.filter((x) => x[0] === 'onboarding.close').map((x) => x[1].outcome),
    ['dismissed']
  )
  await pushOpen()
  assert.ok($('[data-tracy-onboard]'), 'reopens again after a second close')
  await pushOpen()
  assert.equal(
    document.querySelectorAll('[data-tracy-onboard]').length,
    1,
    'a push while open opens nothing more'
  )
})

test('first run, then closed, then reopened from Help: one subscription, the closes recorded each time', async () => {
  await start(bridge(), true)
  for (let i = 0; i < 3; i++) await click('[data-action="next"]')
  assert.equal($('[data-tracy-onboard]'), null)
  await pushOpen()
  assert.ok($('[data-tracy-onboard]'))
  await click('[data-action="skip"]')
  assert.deepEqual(
    calls.filter((x) => x[0] === 'onboarding.close').map((x) => x[1].outcome),
    ['completed', 'dismissed']
  )
})

test('an app without onOpen (older protocol-2 build): no subscription, Help can open setup', async () => {
  await start(bridge({ onOpen: false }), true)
  assert.equal(openWatchers.length, 0)
  assert.ok($('[data-tracy-onboard]'))
})

const BROWSER = {
  attemptId: 'a1',
  signIn: 'browser',
  authorizeUrl: 'https://chatgpt.com/auth?x=1',
  state: 'st-1'
}
const callback = (url) =>
  lib.act(() =>
    window.dispatchEvent(Object.assign(new window.Event('tracy-subscription-callback'), { detail: { url } }))
  )

test('Connect now: the vendor page opens through the app, the caught callback connects, the step turns Done in place', async () => {
  startAnswer = BROWSER
  completeAnswer = {
    ...seatStatus,
    connections: [
      {
        connectionId: 'k',
        provider: 'codex',
        name: 'ChatGPT Codex',
        account: 'lee@example.com',
        connected: true
      }
    ]
  }
  await start(bridge(), true)
  assert.equal(chip(), 'Not done')
  assert.equal($('[data-connect]').dataset.connect, 'idle')
  assert.match($('[data-connect]').textContent, /Connect ChatGPT Codex to finish this step/)
  await click('[data-action="connect"]')
  // In the desktop app the start asks for the browser sign-in: the app catches the callback itself.
  assert.deepEqual(calls.find((x) => x[1] === '/api/seat-plan/connect/start')[2], {
    provider: 'codex',
    surface: 'desktop'
  })
  assert.ok(calls.some((x) => x[0] === 'openExternal' && x[1] === BROWSER.authorizeUrl))
  assert.equal($('[data-connect]').dataset.connect, 'pending')
  callback('https://localhost/cb?code=1&state=st-1')
  await settle()
  assert.deepEqual(calls.find((x) => x[1] === '/api/seat-plan/connect/complete')[2], {
    attemptId: 'a1',
    url: 'https://localhost/cb?code=1&state=st-1'
  })
  assert.equal($('[data-connect]').dataset.connect, 'connected')
  assert.match($('[data-connect]').textContent, /Signed in as lee@example\.com/)
  assert.equal(chip(), 'Done')
  assert.deepEqual(doneBars(), [true, true, true, true])
  assert.ok($('[data-agent="codex"] .tv-ob-badge'), 'the card says Connected')
  // Done does not send a connected person to AI accounts.
  for (let i = 0; i < 3; i++) await click('[data-action="next"]')
  assert.deepEqual(assigned, [])
})

test('a pasted callback URL finishes a browser sign-in too', async () => {
  startAnswer = BROWSER
  completeAnswer = { ...seatStatus, connections: [{ provider: 'codex', account: 'x', connected: true }] }
  await start(bridge(), true)
  await click('[data-action="connect"]')
  await click('[data-action="paste"]')
  const input = $('[data-action="callback-url"]')
  // React was loaded before this page existed, so it watches typing with its keyup polyfill.
  lib.act(() => {
    input.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'https://localhost/cb?code=2&state=st-1')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    input.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true }))
  })
  await settle()
  await click('[data-action="submit"]')
  assert.equal($('[data-connect]').dataset.connect, 'connected')
})

test('picking another vendor while signing in cancels the attempt: its callback no longer connects anything', async () => {
  startAnswer = BROWSER
  completeAnswer = { ...seatStatus, connections: [{ provider: 'codex', connected: true }] }
  await start(bridge(), true)
  await click('[data-action="connect"]')
  await click('.tv-ob-disclosure')
  await click('[data-agent="claude"]')
  assert.equal($('[data-connect]').dataset.connect, 'idle')
  assert.match($('[data-connect]').textContent, /Connect Claude/)
  callback('https://localhost/cb?code=1&state=st-1')
  await settle()
  assert.equal(calls.filter((x) => x[1] === '/api/seat-plan/connect/complete').length, 0)
  assert.equal(chip(), 'Not done')
})

test('a vendor the deployment offers without a sign-in: the API-key panel hands over to Settings › AI accounts', async () => {
  config = {
    llm: { connect: true },
    catalogue: [...CATALOGUE, { id: 'gemini', name: 'Gemini', homepage: null }]
  }
  await start(bridge(), true)
  await click('.tv-ob-disclosure')
  await click('[data-agent="gemini"]')
  assert.match($('[data-connect]').textContent, /Gemini connects with an API key/)
  await click('[data-action="open-accounts"]')
  assert.deepEqual(calls.find((x) => x[0] === 'onboarding.close')[1], {
    outcome: 'completed',
    picked: 'gemini'
  })
  assert.deepEqual(assigned, ['/demo/?tab=chat&settings=ai-accounts&vendor=gemini#top'])
})

test('a vendor the server says signs in with a key (signIn: key): the key panel, never Connect now; no signIn keeps it connectable', async () => {
  const GLM = { id: 'glm', name: 'GLM', homepage: null }
  config = { llm: { connect: true }, catalogue: [CATALOGUE[0], GLM] }
  seatStatus = {
    providers: [
      { id: 'claude', name: 'Claude', signIn: 'browser' },
      { id: 'glm', name: 'GLM', signIn: 'key' }
    ],
    connections: []
  }
  await start(undefined, true)
  await click('[data-agent="glm"]')
  assert.match($('[data-connect]').textContent, /GLM connects with an API key/)
  assert.equal($('[data-action="connect"]'), null)
  await click('[data-agent="claude"]')
  assert.ok($('[data-action="connect"]'), 'a browser vendor keeps Connect now')
  unmount()
  unmount = () => {}

  // A tracy-web older than signIn lists GLM without it: connectable, as before.
  seatStatus = {
    providers: [
      { id: 'claude', name: 'Claude' },
      { id: 'glm', name: 'GLM' }
    ],
    connections: []
  }
  await start(undefined, true)
  await click('[data-agent="glm"]')
  assert.ok($('[data-action="connect"]'))
})

test('Sign in: the signed-in card names the person from /auth/me', async () => {
  await start(bridge(), true)
  await click('[data-rail-step="0"]')
  assert.equal($('.tv-ob-title').textContent, 'Sign in')
  assert.equal(chip(), 'Done')
  assert.match($('.tv-ob-who').textContent, /LLeelee@example\.comSigned in/)
})

test('macOS blocks notifications: amber card, test and sound disabled, step not done; allowed after System Settings → Done', async () => {
  await start(bridge({ permission: 'denied' }), true)
  await click('[data-rail-step="3"]')
  assert.equal($('[data-notify]').dataset.notify, 'blocked')
  assert.equal($('[data-action="send-test"]').disabled, true)
  assert.equal($('[data-action="sound"]').disabled, true)
  assert.equal(chip(), 'Not done')
  assert.equal(notifyWatchers.length, 1, 'the page follows the app')
  lib.act(() =>
    notifyWatchers[0]({
      supported: true,
      enabled: true,
      permission: 'allowed',
      lastShownAt: null,
      sound: 'system'
    })
  )
  await settle()
  assert.equal($('[data-notify]').dataset.notify, 'on')
  assert.equal($('[data-action="send-test"]').disabled, false)
  assert.equal(chip(), 'Done')
})

test("Appearance & language: Settings' row picks a language through dsh; an unoffered device language gets its line", async () => {
  page(bridge())
  window.__DSH_LOCALE__ = { read: async () => ({ languages: ['ja-JP'], preference: null }), onChange() {} }
  globalThis.__DSH_LOCALE__ = window.__DSH_LOCALE__
  try {
    const c = context()
    lib.apply(c.ctx)
    lib.act(() => openWatchers[0]())
    await settle()
    const overlay = c.registered.find((r) => r.options?.name === 'shell.overlay')
    unmount = lib.mount(overlay.component, document.getElementById('frame'))
    await settle()
    await click('[data-rail-step="2"]')
    assert.match(
      $('.tv-ob-lang-note').textContent,
      /This computer uses 日本語\. Tracy doesn't offer it yet, so it uses English\./
    )
    await click('.ts-select')
    assert.ok(document.querySelector('.ts-lang-menu.tv-onboard'), "the menu carries the screen's scope")
    await key({ key: 'Escape' })
    assert.ok($('[data-tracy-onboard]'), 'Escape closes the menu, not the screen')
    assert.equal(document.querySelector('.ts-lang-menu'), null)
    await click('.ts-select')
    const fr = [...document.querySelectorAll('.ts-lang-menu [role="menuitemradio"]')].find(
      (b) => b.textContent === 'Français'
    )
    lib.act(() => fr.dispatchEvent(new window.MouseEvent('click', { bubbles: true })))
    await settle()
    assert.equal(locale.preference, 'fr')
    assert.equal($('.tv-ob-lang-note'), null, 'a pick: no line')
  } finally {
    delete globalThis.__DSH_LOCALE__
  }
})

test('an account already connected is the pick, in the main grid, with its connected panel and no warning', async () => {
  // The scan finds Codex; GitHub Copilot is connected through the server (dev acceptance, finding 4).
  seatStatus = {
    providers: PROVIDERS,
    connections: [{ connectionId: 'c1', provider: 'copilot', account: 'octocat', connected: true }],
    next: { connectionId: 'c1', name: 'GitHub Copilot' }
  }
  await start(bridge(), true)
  await click('[data-rail-step="1"]')
  const copilot = $('[data-agent="copilot"]')
  assert.ok(copilot, 'the connected vendor is in the main grid, not only behind "Show more"')
  assert.equal(copilot.getAttribute('aria-pressed'), 'true', 'the connected vendor is preselected')
  assert.equal($('[data-agent="codex"]').getAttribute('aria-pressed'), 'false')
  assert.equal($('[data-connect]').dataset.connect, 'connected')
  assert.equal($('[data-warn]'), null)
})

test('the header: × is Skip — closes as dismissed, leads nowhere, the menu flag untouched', async () => {
  await start(bridge(), true)
  const close = $('.tv-ob-top-actions .tv-ob-close')
  assert.equal(close.getAttribute('aria-label'), 'Close')
  await click('.tv-ob-close')
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(calls.find((x) => x[0] === 'onboarding.close')[1], {
    outcome: 'dismissed',
    picked: 'codex'
  })
  assert.deepEqual(assigned, [])
  assert.ok(!calls.some((x) => x[0] === 'POST /api/onboarding/menu-hide'))
})

test('the header: "Hide from account menu" records the flag and keeps the screen; the button becomes "Show in account menu", which clears it', async () => {
  await start(undefined, true)
  const hide = $('.tv-ob-top-actions .tv-ob-hide')
  assert.equal(hide.textContent, 'Hide from account menu')
  assert.equal(
    hide.getAttribute('aria-label'),
    'Hide from account menu',
    'icon-only under 620 px keeps a name'
  )
  assert.equal(hide.dataset.state, 'shown')
  assert.match(hide.title, /Settings › Help & about still opens this screen/)
  await click('.tv-ob-hide')
  assert.ok($('[data-tracy-onboard]'), 'the screen stays open')
  assert.deepEqual(
    names(calls).filter((n) => n.startsWith('POST /api/onboarding')),
    ['POST /api/onboarding/menu-hide'],
    'the flag only: no close recorded'
  )
  assert.equal(menuHidden, '2026-10-12T01:00:00.000Z')
  const show = $('.tv-ob-top-actions .tv-ob-hide')
  assert.equal(show.textContent, 'Show in account menu')
  assert.equal(show.getAttribute('aria-label'), 'Show in account menu')
  assert.equal(show.dataset.state, 'hidden')
  assert.equal(show.title, 'Puts the Getting started row back in the account menu.')

  await click('.tv-ob-hide')
  assert.ok($('[data-tracy-onboard]'), 'still open')
  assert.ok(calls.some((x) => x[0] === 'POST /api/onboarding/menu-show'))
  assert.equal(menuHidden, null, 'the account flag is cleared')
  assert.equal($('.tv-ob-hide').textContent, 'Hide from account menu')
  assert.ok(!calls.some((x) => x[0] === 'POST /api/onboarding'), 'toggling never closes the screen')
  assert.deepEqual(assigned, [])
})

test('the header: an account that hid the row opens the screen on "Show in account menu"', async () => {
  menuHidden = '2026-10-12T01:00:00.000Z'
  await start(undefined, true)
  assert.ok($('[data-tracy-onboard]'))
  assert.equal($('.tv-ob-hide').textContent, 'Show in account menu')
  assert.equal($('.tv-ob-hide').dataset.state, 'hidden')
})

test('the header: on a desktop app the toggle goes to the account door; a refused door (403) keeps the screen and says the flag did not change', async () => {
  menuHidden = 'fail'
  await start(bridge(), true)
  await click('.tv-ob-hide')
  assert.ok($('[data-tracy-onboard]'), 'the screen never hangs on, nor closes for, the flag')
  assert.ok(calls.some((x) => x[0] === 'POST /api/onboarding/menu-hide'))
  assert.ok(!calls.some((x) => x[0] === 'onboarding.close'))
  assert.equal(
    $('.tv-ob-hide').textContent,
    'Hide from account menu',
    'what the account says, not what was asked'
  )
})

test('Done with Tracy AI picked closes as completed and leads nowhere (the built-in card is never "not connected yet")', async () => {
  await start(undefined, true)
  await click('[data-agent="tracy"]')
  assert.equal($('[data-connect]').dataset.connect, 'tracy')
  assert.match($('[data-connect]').textContent, /signed in as lee@example\.com/)
  assert.equal($('[data-action="connect"]'), null)
  assert.equal(chip(), 'Not done', 'the step is done only once a private account is connected')
  await click('[data-action="next"]')
  await click('[data-action="next"]')
  assert.equal($('[data-tracy-onboard]'), null)
  assert.deepEqual(assigned, [], 'no trip to Settings › AI accounts')
  assert.deepEqual(
    names(calls).filter((n) => n.endsWith('/api/onboarding')),
    [...Array(4).fill('GET /api/onboarding'), 'POST /api/onboarding']
  )
})

test('a scan the app never completes (slow or failed login-shell read) stops looking after the cap: grid, Refresh, no false claim', async () => {
  // Measured 11/10/2026 on the packaged 0.6.0-dev.1: a login shell slower than the plugin's few
  // re-asks, or one the app cannot read, left "Looking for AI tools…" up for good with Refresh
  // disabled. The app keeps answering `scanComplete: false` with `unknown` for what it has not seen.
  detectAnswer = (ids) => ({
    results: ids.map((id) => ({ id, status: id === 'codex' ? 'found' : 'unknown' })),
    scanComplete: false
  })
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await start(bridge(), true)
    await click('[data-rail-step="1"]')
    assert.equal($('[data-mode]').dataset.mode, 'looking', 'still looking right after the first answer')
    assert.equal($('[data-action="refresh"]').disabled, true)
    for (let i = 0; i < 20; i++) {
      mock.timers.tick(1000)
      await settle()
    }
    assert.equal($('[data-mode]').dataset.mode, 'found', 'what was found so far, no longer "Looking…"')
    assert.equal($('.tv-ob-spinner'), null)
    assert.equal($('[data-action="refresh"]').disabled, false, 'the person can ask again')
    assert.equal($('.tv-ob-note'), null, 'never "No AI tools were found" on an incomplete scan')
    assert.equal($('[data-warn]'), null, 'never "not on this computer" on an incomplete scan')
    const asks = calls.filter((x) => x[0] === 'detect').length
    assert.ok(asks >= 8, `kept asking past the app's 10 s shell timeout (asked ${asks} times)`)
  } finally {
    mock.timers.reset()
  }
})

test('a new web account enters step 1 directly and Skip tour records completion without setup', async () => {
  await start(undefined)
  assert.ok($('[data-tour-step="createsite"]'))
  assert.equal($('.tv-tour-welcome'), null)
  assert.match($('.tv-tour-step').textContent, /1 OF 1$/)
  assert.equal($('[data-tracy-onboard]'), null)
  assert.equal(
    calls.some((x) => x[1] === '/api/desktop/config'),
    false,
    'no setup or AI-account scan'
  )
  await click('.tv-tour-link')
  assert.equal($('.tv-tour'), null)
  assert.equal(calls.filter((x) => x[0] === 'POST /api/onboarding').length, 1)
})

test('site tour skips unavailable controls, sends a chip through the real composer action face, and remembers completion', async () => {
  page(undefined)
  const preview = document.createElement('div')
  preview.setAttribute('data-browser-scroll', '')
  const composer = document.createElement('div')
  composer.setAttribute('data-slot', 'conversation.composer.bar')
  composer.innerHTML = '<div contenteditable="true" data-composer-input="true"></div>'
  document.body.append(preview, composer)
  // jsdom has no layout. Only these two existing controls have a visible rectangle in this case.
  const rect = () => new window.DOMRect(100, 100, 240, 80)
  preview.getBoundingClientRect = rect
  composer.firstChild.getBoundingClientRect = rect
  const switcher = document.createElement('button')
  switcher.className = 'tracy-site-chip'
  switcher.getBoundingClientRect = () => new window.DOMRect(500, 100, 100, 40)
  const blocker = document.createElement('div')
  document.body.append(switcher, blocker)
  composer.firstChild.getBoundingClientRect = () => new window.DOMRect(100, 500, 240, 80)
  // A narrow-layout pane covers the switcher, while preview and composer remain exposed.
  document.elementsFromPoint = (x, y) => (x > 400 ? [blocker] : y > 400 ? [composer.firstChild] : [preview])
  const edits = []
  const actions = { setDraft: (text) => edits.push(['draft', text]), submit: () => edits.push(['send']) }
  const stopBridge = lib.mount(
    () => lib.TourComposerBridge({ inputActions: actions }),
    document.createElement('div')
  )
  const props = {
    t: lib.t,
    first: false,
    enabled: true,
    account: 'lee@example.com',
    complete: async () => {}
  }
  unmount = lib.mount(() => lib.Tour(props), document.getElementById('frame'))
  await settle()
  assert.equal($('.tv-tour').dataset.tourStep, 'preview')
  assert.match($('.tv-tour-step').textContent, /1 OF 2$/)
  assert.equal($('[role=progressbar]').getAttribute('aria-valuemax'), '2')
  assert.equal($('.tv-tour-progress span').style.width, '50%')
  await click('.tv-tour-primary')
  assert.equal(
    $('.tv-tour').dataset.tourStep,
    'composer',
    'missing controls and controls covered by another pane are skipped'
  )
  assert.match($('.tv-tour-step').textContent, /2 OF 2$/)
  assert.equal($('.tv-tour-progress span').style.width, '100%')
  await click('.tv-tour-chips button')
  await new Promise((resolve) => window.setTimeout(resolve, 40))
  await settle()
  assert.deepEqual(edits, [['draft', 'Make the homepage headline shorter'], ['send']])
  assert.equal($('.tv-tour'), null)
  assert.deepEqual(seenHints, ['site-tour'])
  assert.equal(window.localStorage.getItem('tracy.tour.site.lee@example.com'), null)
  unmount()
  unmount = lib.mount(() => lib.Tour(props), document.getElementById('frame'))
  await settle()
  assert.equal($('.tv-tour'), null, 'the same account does not get the site tour twice')
  stopBridge()
})

test('first run focuses the primary action without a welcome popup', async () => {
  tourFixture(startCards)
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: true,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => {}
      }),
    document.getElementById('frame')
  )
  await settle()
  assert.ok(document.activeElement === $('.tv-tour-primary'), 'primary action receives focus')
  assert.equal(document.activeElement.textContent, 'Next')
  lib.act(() => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
  assert.ok(document.activeElement === $('.tv-tour-link'), 'Skip tour remains keyboard reachable')
  assert.equal($('.tv-tour-welcome'), null)
})

function tourFixture(html) {
  page(undefined)
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  for (const el of root.querySelectorAll('*'))
    el.getBoundingClientRect = () => new window.DOMRect(100, 100, 240, 40)
  return root
}

const startOrder = ['template', 'import', 'createsite']
const siteOrder = [
  'preview',
  'designsystem',
  'changes',
  'team',
  'undo',
  'publish',
  'edit',
  'pick',
  'change',
  'composer'
]
const startCards =
  '<div data-tracy-start="1"><div class="tv-start-cards"><button class="tv-start-card"><i data-tone="create"></i></button><button class="tv-start-card"><i data-tone="template"></i></button><button class="tv-start-card"><i data-tone="import"></i></button></div></div>'

test('the first screen has three choices and Your turn uses its real Create a new site button', async () => {
  assert.deepEqual(lib.START_STEPS, startOrder)
  const screen = tourFixture(startCards)
  let completed = 0
  let opened = 0
  screen.querySelector('.tv-start-card').addEventListener('click', () => opened++)
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: true,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => completed++
      }),
    document.getElementById('frame')
  )
  await settle()
  const seen = []
  const copy = [
    [
      'Pick a design you love',
      'Browse ready-made designs by industry and style. Each one can be reshaped to fit your brand.'
    ],
    ['Already have a website?', 'Connect your Joomla or WordPress site and Tracy works on that one instead.'],
    [
      'Your turn: get a website in minutes',
      'Tracy builds a full, working site from a professional design, and you change anything just by asking. Press Create a new site to begin.'
    ]
  ]
  for (let n = 0; n < 3; n++) {
    seen.push($('.tv-tour').dataset.tourStep)
    assert.equal($('.tv-tour-step').textContent, `${n + 1} OF 3`)
    assert.deepEqual([$('#tv-tour-heading').textContent, $('#tv-tour-body').textContent], copy[n])
    assert.ok(
      document.activeElement === (n < 2 ? $('.tv-tour-primary') : $('.tv-tour-card')),
      'focus follows the step action'
    )
    assert.equal($('[role=progressbar]').getAttribute('aria-valuenow'), String(n + 1))
    assert.equal($('[role=progressbar]').getAttribute('aria-valuemax'), '3')
    assert.equal(
      [...document.querySelectorAll('button')].some((button) => button.textContent === 'Skip section'),
      false
    )
    if (n < 2) await click('.tv-tour-primary')
  }
  assert.deepEqual(seen, startOrder)
  assert.equal($('#tv-tour-heading').textContent, 'Your turn: get a website in minutes')
  assert.equal(
    $('#tv-tour-body').textContent,
    'Tracy builds a full, working site from a professional design, and you change anything just by asking. Press Create a new site to begin.'
  )
  assert.equal($('.tv-tour-primary'), null, 'no Next or Done on Your turn')
  assert.equal($('.tv-tour-card').tabIndex, -1)
  assert.equal($('.tv-tour-chips'), null, 'the real screen button is the continuation')
  await click('.tv-start-card')
  assert.equal(completed, 1)
  assert.equal(opened, 1, 'the real button handler still runs')
  assert.equal($('.tv-tour'), null)
})

test('missing template and import choices are skipped without adding fallback chips', async () => {
  tourFixture('<button class="tv-start-card"><i data-tone="create"></i></button>')
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: true,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => {}
      }),
    document.getElementById('frame')
  )
  await settle()
  assert.equal($('.tv-tour-step').textContent, '1 OF 1')
  assert.equal($('.tv-tour').dataset.tourStep, 'createsite')
  assert.ok(document.activeElement === $('.tv-tour-card'), 'the card receives focus without a primary action')
  assert.equal($('.tv-tour-chips'), null)
  assert.equal($('.tv-tour-primary'), null)
})

test('site story keeps ten consecutive counters when start cards unmount and composer returns after send', async () => {
  assert.deepEqual(lib.SITE_STEPS, siteOrder)
  tourFixture(`<div data-browser-scroll></div>
    <button class="tv-start-card"><i data-tone="edit"></i></button>
    <button class="tv-start-card"><i data-tone="changes"></i></button>
    <button class="tv-start-card"><i data-tone="design-system"></i></button>
    <button class="tv-start-card"><i data-tone="team"></i></button>
    <div data-browser-tab><button data-undo></button><button aria-label="Interactive"></button>
    <div role="group"><button aria-pressed="false"></button><button aria-label="Edit"></button></div><button aria-label="Comments, 0"></button>
    <button data-site-toolbar="publish"></button></div>
    <div data-slot="conversation.composer.bar"><div data-composer-input="true"></div></div>`)
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: false,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => {}
      }),
    document.getElementById('frame')
  )
  await settle()
  const seen = []
  for (let n = 0; n < 10; n++) {
    seen.push($('.tv-tour').dataset.tourStep)
    assert.equal($('.tv-tour-step').textContent, `${n + 1} OF 10`)
    if (n === 6) {
      assert.equal($('.tv-tour-primary'), null)
      $('[data-browser-tab] button[aria-label="Edit"]').setAttribute('aria-pressed', 'true')
      await waitEdit()
    } else if (n === 7) {
      assert.equal($('.tv-tour-primary'), null)
      const box = document.createElement('div')
      box.setAttribute('data-comment-box', '')
      box.setAttribute('data-foot', 'new')
      box.innerHTML =
        '<textarea></textarea><button title="Ask Tracy to edit (Enter)">Ask Tracy to edit</button>'
      box.getBoundingClientRect = () => new window.DOMRect(400, 200, 340, 240)
      $('[data-browser-tab]').append(box)
      await waitEdit()
    } else if (n === 8) {
      assert.equal($('.tv-tour-primary'), null)
      const composer = $('[data-slot="conversation.composer.bar"]')
      for (const card of document.querySelectorAll('.tv-start-card')) card.remove()
      composer.remove()
      await sendSelection()
      await new Promise((resolve) => setTimeout(resolve, 500))
      await settle()
      assert.equal($('.tv-tour').dataset.tourStep, 'composer', 'waits for the composer after send')
      document.body.append(composer)
      await new Promise((resolve) => setTimeout(resolve, 400))
      await settle()
    } else if (n < 9) await click('.tv-tour-primary')
  }
  assert.deepEqual(seen, siteOrder)
  assert.equal($('.tv-tour-primary').textContent, 'Done')
  assert.equal(document.querySelectorAll('.tv-tour-chips button').length, 3)
})

test('first run waits for the real screen before counting or completing', async () => {
  page(undefined)
  let completed = 0
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: true,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => completed++
      }),
    document.getElementById('frame')
  )
  await settle()
  assert.equal(completed, 0, 'loading the screen must not silently complete the tour')
  const target = document.createElement('button')
  target.className = 'tv-start-card'
  target.innerHTML = '<i data-tone="create"></i>'
  target.getBoundingClientRect = () => new window.DOMRect(10, 10, 32, 32)
  document.body.append(target)
  const form = document.createElement('div')
  form.innerHTML =
    '<div data-tracy-start="1"><div class="tv-start-cards"></div></div><div data-add-site-form><input data-slot="input-group-control" /></div>'
  document.body.append(form)
  for (const el of form.querySelectorAll('*'))
    el.getBoundingClientRect = () => new window.DOMRect(100, 100, 240, 40)
  lib.act(() => window.dispatchEvent(new window.Event('resize')))
  await new Promise((resolve) => window.setTimeout(resolve, 40))
  await settle()
  assert.equal($('.tv-tour').dataset.tourStep, 'createsite')
  assert.match($('.tv-tour-step').textContent, /1 OF 1$/)
  await click('.tv-tour-link')
  assert.equal(completed, 1)
})

async function waitEdit() {
  await new Promise((resolve) => window.setTimeout(resolve, 140))
  await settle()
}
function tourEvent(type, detail) {
  lib.act(() => window.dispatchEvent(new window.CustomEvent(type, { detail })))
}
async function sendSelection() {
  const field = $('[data-comment-box] textarea')
  field.value = 'Make this heading bigger'
  await click('[data-comment-box] button')
  const detail = {
    siteKey: 'demo',
    sessionId: 'session-1',
    requestId: 'request-1',
    items: [{ text: field.value, commentId: 'comment-1', element: { selector: 'h1' } }]
  }
  tourEvent('tracy:comment-send', detail)
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'send intent alone is insufficient')
  tourEvent('tracy:comment-sent', { requestId: 'another', sessionId: 'session-1' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'another request does not advance')
  tourEvent('tracy:comment-failed', { requestId: 'request-1', code: 'rejected' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'failed submission does not advance')
  tourEvent('tracy:comment-sent', { requestId: 'request-1', sessionId: 'session-1' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'a failed request cannot later advance')
  // A retry needs the same real selected-box submit and its own successful acknowledgement.
  await click('[data-comment-box] button')
  tourEvent('tracy:comment-send', { ...detail, requestId: 'request-2' })
  tourEvent('tracy:comment-sent', { requestId: 'request-2', sessionId: 'other-session' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'another session does not advance')
  tourEvent('tracy:comment-sent', { requestId: 'request-2', sessionId: 'session-1' })
  await settle()
}

test('Edit waits for actual mode, selection and acknowledged send; Back and Skip cancel observers', async () => {
  tourFixture(`<div data-browser-scroll></div>
    <div data-browser-tab><div role="group"><button aria-pressed="false"></button><button aria-label="Edit" aria-pressed="false"></button></div></div>
    <div data-slot="conversation.composer.bar"><div data-composer-input="true"></div></div>`)
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: lib.t,
        first: false,
        enabled: true,
        account: 'lee@example.com',
        complete: async () => {}
      }),
    document.getElementById('frame')
  )
  await settle()
  await click('.tv-tour-primary')
  assert.equal($('.tv-tour').dataset.tourStep, 'edit')
  assert.equal($('.tv-tour-primary'), null)
  await click('[aria-label="Edit"]')
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'edit', 'a click without a mode change does not advance')
  assert.equal($('.tv-tour-card').getAttribute('aria-modal'), 'false')
  $('[aria-label="Edit"]').setAttribute('aria-pressed', 'true')
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'pick')
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'pick', 'does not advance without selection')
  await click('.tv-tour-actions > div:last-child button')
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'preview', 'Back skips completed actions without resending')
  await click('.tv-tour-primary')
  await waitEdit()
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'pick')
  const box = document.createElement('div')
  box.setAttribute('data-comment-box', '')
  box.setAttribute('data-foot', 'new')
  box.innerHTML =
    '<textarea></textarea><button title="Note for team">Note for team</button><button title="Ask Tracy to edit (Enter)">Ask Tracy to edit</button>'
  box.getBoundingClientRect = () => new window.DOMRect(400, 200, 340, 240)
  $('[data-browser-tab]').append(box)
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'change')
  const field = box.querySelector('textarea')
  field.value = 'Make this heading bigger'
  field.focus()
  await key({ key: 'Tab' })
  assert.ok(document.activeElement === field, 'the tour does not trap typing focus')
  lib.act(() =>
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }))
  )
  await click('[data-comment-box] button[title="Note for team"]')
  tourEvent('tracy:comment-send', {
    siteKey: 'demo',
    sessionId: 's',
    requestId: 'r',
    items: [{ text: field.value, element: {}, commentId: 'c' }]
  })
  tourEvent('tracy:comment-sent', { sessionId: 's', requestId: 'r' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'Note for team and newline are not sends')
  await click('.tv-tour-link')
  tourEvent('tracy:comment-sent', { sessionId: 's', requestId: 'r' })
  await waitEdit()
  assert.equal($('.tv-tour'), null, 'Skip ends the tour and removes waiting observers')
})

test('selected-box Enter accepts only its own successful request, never newlines, composition or another site', async () => {
  tourFixture(`<div data-browser-tab><div data-comment-box data-foot="new"><textarea></textarea></div></div>`)
  const field = $('[data-comment-box] textarea')
  field.value = 'Make this heading bigger'
  let advanced = 0
  const stop = lib.watchTourEdit('change', () => advanced++)
  const detail = {
    siteKey: 'demo',
    sessionId: 'session-1',
    requestId: 'enter-1',
    items: [{ text: field.value, commentId: 'c-1', element: { selector: 'h1' } }]
  }
  const enter = (extra = {}) =>
    field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...extra }))
  const ack = () => tourEvent('tracy:comment-sent', { requestId: 'enter-1', sessionId: 'session-1' })
  try {
    for (const extra of [{ shiftKey: true }, { isComposing: true }]) {
      enter(extra)
      tourEvent('tracy:comment-send', detail)
      ack()
      assert.equal(advanced, 0)
    }
    enter()
    tourEvent('tracy:comment-send', { ...detail, siteKey: 'another-site' })
    ack()
    assert.equal(advanced, 0, 'another site cannot satisfy the selection')
    tourEvent('tracy:comment-send', { ...detail, items: [{ ...detail.items[0], text: 'Another change' }] })
    ack()
    assert.equal(advanced, 0, 'another change cannot satisfy the selection')
    tourEvent('tracy:comment-send', detail)
    $('[data-comment-box]').remove()
    assert.equal(advanced, 0, 'popover disappearance is not success')
    ack()
    ack()
    assert.equal(advanced, 1, 'Enter completes exactly once after the matching acknowledgement')
  } finally {
    stop()
  }
})

const viTour = JSON.parse(
  readFileSync(path.join(repo, 'packages/locale/tracy-locale-vi/vi/tracy-onboard.json'), 'utf8')
)
const viText = (key, params = {}) =>
  String(viTour[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))

test('the registered overlay passes its Vietnamese lookup to every start-tour label', async () => {
  await start(undefined, false, viText)
  assert.equal($('#tv-tour-heading').textContent, viText('tour.createsite.heading'))
  assert.equal($('#tv-tour-body').textContent, viText('tour.createsite.body'))
  assert.equal($('.tv-tour-step').textContent, viText('tour.step', { current: 1, total: 1 }))
  assert.equal($('.tv-tour-link').textContent, viText('tour.skip'))
  assert.equal($('[role=progressbar]').getAttribute('aria-label'), viText('tour.progress'))
})

for (const chip of [0, 1, 2]) {
  test(`Vietnamese site tour translates navigation, counter and chip ${chip}, and sends the displayed prompt`, async () => {
    tourFixture(
      '<div data-browser-scroll></div><div data-slot="conversation.composer.bar"><div data-composer-input="true"></div></div>'
    )
    const edits = []
    unmountRow = lib.mount(
      () =>
        lib.TourComposerBridge({
          inputActions: { setDraft: (text) => edits.push(text), submit: () => edits.push('sent') }
        }),
      document.createElement('div')
    )
    unmount = lib.mount(
      (props) =>
        lib.Tour({
          ...props,
          first: false,
          enabled: true,
          account: 'locale@example.test',
          complete: async () => {}
        }),
      document.getElementById('frame'),
      viText
    )
    await settle()
    assert.equal($('#tv-tour-heading').textContent, viText('tour.preview.heading'))
    assert.equal($('.tv-tour-primary').textContent, viText('tour.next'))
    assert.equal($('.tv-tour-step').textContent, viText('tour.step', { current: 1, total: 2 }))
    await click('.tv-tour-primary')
    assert.equal($('#tv-tour-heading').textContent, viText('tour.composer.heading'))
    assert.equal($('.tv-tour-primary').textContent, viText('tour.done'))
    assert.equal($('.tv-tour-actions > div:last-child button').textContent, viText('tour.back'))
    assert.equal($('.tv-tour-step').textContent, viText('tour.step', { current: 2, total: 2 }))
    const chips = [...document.querySelectorAll('.tv-tour-chips button')]
    assert.deepEqual(
      chips.map((button) => button.textContent),
      [0, 1, 2].map((n) => viText(`tour.chip.${n}`))
    )
    await click(`.tv-tour-chips button:nth-child(${chip + 1})`)
    await new Promise((resolve) => window.setTimeout(resolve, 40))
    assert.deepEqual(edits, [viText(`tour.chip.${chip}`), 'sent'])
  })
}

const viSidebar = (key) => lib.sidebarVi[key] ?? key

test('Vietnamese Edit controls and selected-box Send advance only after the matching acknowledgement', async () => {
  tourFixture(`<div data-browser-scroll></div>
    <div data-browser-tab><div role="group"><button aria-pressed="true"></button><button data-test-edit aria-label="${viSidebar('editButton')}" aria-pressed="false"></button></div></div>
    <div data-slot="conversation.composer.bar"><div data-composer-input="true"></div></div>`)
  unmount = lib.mount(
    () =>
      lib.Tour({
        t: viText,
        first: false,
        enabled: true,
        account: 'locale@example.test',
        complete: async () => {}
      }),
    document.getElementById('frame')
  )
  await settle()
  assert.equal($('.tv-tour-step').textContent, viText('tour.step', { current: 1, total: 5 }))
  await click('.tv-tour-primary')
  assert.equal($('.tv-tour').dataset.tourStep, 'edit')
  $('[data-test-edit]').setAttribute('aria-pressed', 'true')
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'pick')
  const box = document.createElement('div')
  box.setAttribute('data-comment-box', '')
  box.setAttribute('data-foot', 'new')
  box.innerHTML = `<textarea></textarea><button data-test-note title="Note for team">Note for team</button><button data-test-send title="${viSidebar('editSend')} (Enter)">${viSidebar('editSend')}</button>`
  box.getBoundingClientRect = () => new window.DOMRect(400, 200, 340, 240)
  $('[data-browser-tab]').append(box)
  await waitEdit()
  assert.equal($('.tv-tour').dataset.tourStep, 'change')
  const field = box.querySelector('textarea')
  field.value = 'Make the title shorter'
  const detail = {
    siteKey: 'demo',
    requestId: 'vi-edit',
    sessionId: 'vi-session',
    items: [{ text: field.value, commentId: 'vi-comment', element: { selector: 'h1' } }]
  }
  await click('[data-test-note]')
  tourEvent('tracy:comment-send', detail)
  tourEvent('tracy:comment-sent', detail)
  assert.equal(
    $('.tv-tour').dataset.tourStep,
    'change',
    'the people-only action cannot complete the tour step'
  )
  await click('[data-test-send]')
  tourEvent('tracy:comment-send', detail)
  assert.equal($('.tv-tour').dataset.tourStep, 'change', 'send intent is not acknowledgement')
  tourEvent('tracy:comment-sent', { ...detail, requestId: 'other-request' })
  assert.equal($('.tv-tour').dataset.tourStep, 'change')
  tourEvent('tracy:comment-sent', detail)
  await settle()
  assert.equal($('.tv-tour').dataset.tourStep, 'composer')
})

const siteTourControls =
  '<div data-browser-scroll></div><div data-slot="conversation.composer.bar"><div data-composer-input="true"></div></div>'
function mountSiteTour(account = 'lee@example.com') {
  unmount = lib.mount(
    () => lib.Tour({ t: lib.t, first: false, enabled: true, account, complete: async () => {} }),
    document.getElementById('frame')
  )
}

test('account seen hints suppress the site tour in a fresh browser', async () => {
  seenHints = ['site-tour']
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  assert.equal($('.tv-tour') === null, true, 'the account already saw this tour in another browser')
  assert.ok(calls.some(([name]) => name === 'GET /api/seen-hints'))
})

test('the site tour migrates the matching legacy account key once and removes it after saving', async () => {
  tourFixture(siteTourControls)
  window.localStorage.setItem('tracy.tour.site.lee@example.com', 'seen')
  mountSiteTour()
  await settle()
  assert.equal($('.tv-tour') === null, true)
  assert.deepEqual(
    calls.filter(([name]) => name === 'POST /api/seen-hints'),
    [['POST /api/seen-hints', { hint: 'site-tour' }]]
  )
  assert.equal(window.localStorage.getItem('tracy.tour.site.lee@example.com'), null)
})

test('the site tour never adopts another account legacy key', async () => {
  tourFixture(siteTourControls)
  window.localStorage.setItem('tracy.tour.site.other@example.com', 'seen')
  mountSiteTour()
  await settle()
  assert.ok($('.tv-tour'))
  assert.equal(calls.filter(([name]) => name === 'POST /api/seen-hints').length, 0)
})

test('a failed seen-hint read hides the site tour', async () => {
  hintReadFailure = true
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  assert.equal($('.tv-tour') === null, true)
})

test('skipping the site tour records the account and a failed record still dismisses it', async () => {
  hintRecordFailure = true
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  assert.ok($('.tv-tour'))
  await click('.tv-tour-link')
  assert.equal($('.tv-tour') === null, true)
  assert.deepEqual(
    calls.filter(([name]) => name === 'POST /api/seen-hints'),
    [['POST /api/seen-hints', { hint: 'site-tour' }]]
  )
  assert.equal(window.localStorage.getItem('tracy.tour.site.lee@example.com'), null)
})

test('failed legacy migration hides the tour and retains its key for retry', async () => {
  hintRecordFailure = true
  tourFixture(siteTourControls)
  window.localStorage.setItem('tracy.tour.site.lee@example.com', 'seen')
  mountSiteTour()
  await settle()
  assert.equal($('.tv-tour') === null, true)
  assert.equal(window.localStorage.getItem('tracy.tour.site.lee@example.com'), 'seen')
  assert.ok(calls.some(([name]) => name === 'POST /api/seen-hints'))
})

test('desktop stage 1 through the surface overlay uses account completion on a new device', async () => {
  accountFlag = '2026-10-01T00:00:00.000Z'
  const desktop = bridge()
  tourFixture(startCards)
  const surface = lib.desktopSurface(desktop.app)
  const switches = { ready: Promise.resolve(), isShown: () => true, subscribe: () => () => {} }
  const { Overlay } = lib.onboardOverlay(surface.onboarding, { surface }, switches)
  unmount = lib.mount(Overlay, document.getElementById('frame'))
  await settle()
  assert.equal($('.tv-tour') === null, true, 'completed account must not restart on a new computer')
})

test('desktop automatic tour closure records both the account and the device', async () => {
  await start(bridge())
  assert.ok($('[data-tour-step="createsite"]'))
  await click('.tv-tour-link')
  assert.equal($('.tv-tour') === null, true)
  assert.ok(calls.some(([name]) => name === 'POST /api/onboarding'))
  assert.deepEqual(
    calls.find(([name]) => name === 'onboarding.close'),
    ['onboarding.close', { outcome: 'completed', picked: null }]
  )
})

test('a site tour dismissal follows the account into another fresh browser', async () => {
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  await click('.tv-tour-link')
  assert.deepEqual(seenHints, ['site-tour'])
  unmount()
  unmount = () => {}
  dom.window.close()
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  assert.equal($('.tv-tour') === null, true)
  assert.equal(window.localStorage.length, 0, 'the new browser has no local completion flag')
})

test('a failed account read hides the desktop first tour even on a new device', async () => {
  accountFlag = 'fail'
  const desktop = bridge()
  tourFixture(startCards)
  const surface = lib.desktopSurface(desktop.app)
  const switches = { ready: Promise.resolve(), isShown: () => true, subscribe: () => () => {} }
  const { Overlay } = lib.onboardOverlay(surface.onboarding, { surface }, switches)
  unmount = lib.mount(Overlay, document.getElementById('frame'))
  await settle()
  assert.equal($('.tv-tour') === null, true)
})

test('desktop automatic tour completion keeps account failures visible and does not mark the device', async () => {
  await start(bridge())
  accountFlag = 'fail'
  await click('.tv-tour-link')
  assert.ok($('.tv-tour'))
  assert.ok($('.tv-tour-error'))
  assert.equal(
    calls.some(([name]) => name === 'onboarding.close'),
    false
  )
})

test('desktop automatic tour completion tolerates failed device bookkeeping after saving the account', async () => {
  const desktop = bridge()
  desktop.app.onboarding.close = async (input) => {
    calls.push(['onboarding.close', input])
    throw new Error('device preferences unavailable')
  }
  await start(desktop)
  await click('.tv-tour-link')
  assert.equal($('.tv-tour') === null, true)
  assert.ok(accountFlag)
  assert.ok(calls.some(([name]) => name === 'onboarding.close'))
})

// ── The "Welcome to Tracy" popup (Welcome.tsx): first run, before the tour, once per account ──────

const frameSrc = () => $('.tv-wl-demo iframe')?.getAttribute('src') ?? ''
const welcomePosts = () =>
  calls.filter(([name, body]) => name === 'POST /api/seen-hints' && body?.hint === 'welcome')
/** The replay in the frame reports its clock, as the scenes' scene-progress-bridge.js does. */
function replayClock(time, total, motion = 'full') {
  const frame = $('.tv-wl-demo iframe')
  lib.act(() =>
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: { type: 'welcome-playback-progress', source: frame.src, time, total, motion },
        source: frame.contentWindow
      })
    )
  )
}

test('an account that has not seen it gets the Welcome popup first; the tour waits; × records it and hands over to the tour', async () => {
  welcomeSeen = false
  await start(undefined)
  assert.ok($('.tv-welcome [role="dialog"]'), 'the popup is open')
  assert.equal($('.tv-tour'), null, 'the tour waits for the popup')
  assert.equal($('#tv-wl-title').textContent, 'Welcome to Tracy')
  assert.match(frameSrc(), /^\/welcome\/scenes\/engine\.html\?theme=light&motion=full&rev=1&tab=2$/)
  assert.equal(document.querySelectorAll('.tv-wl-dot').length, 8)
  assert.equal($('.tv-wl-prev').disabled, true)
  await click('.tv-wl-next')
  assert.equal($('#tv-wl-title').textContent, 'Bring the site you have')
  assert.match(frameSrc(), /^\/welcome\/scenes\/addsite\/index\.html\?.*flow=import/)
  assert.equal($('.tv-wl-dot.is-current').getAttribute('aria-current'), 'step')
  await key({ key: 'ArrowLeft' })
  assert.equal($('#tv-wl-title').textContent, 'Welcome to Tracy')
  assert.equal($('.tv-wl-cta'), null, 'no call to action before the last scene')
  await click('.tv-wl-close')
  assert.equal($('.tv-welcome'), null)
  assert.equal(welcomePosts().length, 1, 'the account mark is recorded once')
  assert.ok($('[data-tour-step="createsite"]'), 'the first-run tour follows')
  assert.equal(
    calls.filter(([name]) => name === 'POST /api/onboarding').length,
    0,
    'closing is not completing'
  )
})

test('Escape closes the Welcome popup, and the account never gets it again, on a reload or another browser', async () => {
  welcomeSeen = false
  await start(undefined)
  await key({ key: 'Escape' })
  assert.equal($('.tv-welcome'), null)
  assert.equal(welcomePosts().length, 1)
  assert.ok($('.tv-tour'), 'Escape on the popup does not also skip the tour')
  unmount()
  unmount = () => {}
  // A fresh page: nothing kept in this browser, the account answers `welcome`.
  await start(undefined)
  assert.equal($('.tv-welcome'), null, 'seen on the account: never again')
  assert.ok($('[data-tour-step="createsite"]'))
  assert.equal(welcomePosts().length, 1)
})

test("the last scene offers Let's build your first site once its replay ends; it opens Add site and completes the first run", async () => {
  welcomeSeen = false
  await start(undefined)
  await click('.tv-wl-dot:last-child')
  assert.equal($('#tv-wl-title').textContent, 'Go live your way')
  assert.match(frameSrc(), /engine\.html\?.*tab=2&publish=1$/)
  replayClock(4, 10)
  assert.equal($('.tv-wl-cta'), null, 'not while the replay plays')
  assert.ok($('.tv-wl-progress span').style.width.startsWith('40'))
  replayClock(10, 10)
  assert.equal($('.tv-wl-cta').textContent, "Let's build your first site")
  await click('.tv-wl-cta')
  assert.equal($('.tv-welcome'), null)
  assert.equal($('.tv-tour'), null, 'building is what the tour led to: no tour after it')
  assert.equal(welcomePosts().length, 1)
  assert.equal(
    calls.filter(([name]) => name === 'POST /api/onboarding').length,
    1,
    'the first run is complete'
  )
  assert.deepEqual(assigned, ['/new/?tab=tracy:add-site'], 'Add site opens in the creation workspace')
})

test('a message from anything but the scene frame never offers the call to action', async () => {
  welcomeSeen = false
  await start(undefined)
  await click('.tv-wl-dot:last-child')
  lib.act(() =>
    window.dispatchEvent(
      new dom.window.MessageEvent('message', {
        data: { type: 'welcome-playback-progress', source: $('.tv-wl-demo iframe').src, time: 9, total: 9 },
        source: window
      })
    )
  )
  assert.equal($('.tv-wl-cta'), null)
})

test('an unreadable seen-hints answer shows no Welcome popup and the tour goes on', async () => {
  welcomeSeen = false
  hintReadFailure = true
  await start(undefined)
  assert.equal($('.tv-welcome'), null)
  assert.ok($('[data-tour-step="createsite"]'))
})

test('an account that already finished the first run never gets the Welcome popup', async () => {
  welcomeSeen = false
  accountFlag = '2026-10-01T00:00:00.000Z'
  await start(undefined)
  assert.equal($('.tv-welcome'), null)
  assert.equal(welcomePosts().length, 0)
})

test("the Welcome popup's scenes follow the app's theme as it switches, and reduced motion", async () => {
  welcomeSeen = false
  page(undefined)
  document.body.setAttribute('data-ds-dark-theme', '')
  dom.window.matchMedia = (query) => ({
    matches: query.includes('reduce'),
    addEventListener() {},
    removeEventListener() {}
  })
  unmount = lib.mount(({ t }) => lib.Welcome({ t, onClose: () => {} }), document.getElementById('frame'))
  await settle()
  assert.match(frameSrc(), /theme=dark&motion=reduced/)
  document.body.removeAttribute('data-ds-dark-theme')
  await settle()
  assert.match(frameSrc(), /theme=light&motion=reduced/)
  await click('.tv-wl-dot:last-child')
  replayClock(0, 12, 'reduced')
  assert.ok($('.tv-wl-cta'), 'reduced motion shows the final state, and the way out, at once')
})

test('the call to action opens Add site in place inside the creation workspace', () => {
  const events = []
  const assignedHere = []
  const win = {
    dispatchEvent: (event) => events.push(event),
    location: { assign: (to) => assignedHere.push(to) }
  }
  lib.openAddSite(win, 'https://cowork.tracy.test/new/')
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'tracy:onboarding-start')
  assert.deepEqual(events[0].detail, { action: 'create' })
  assert.deepEqual(assignedHere, [])
  lib.openAddSite(win, 'https://cowork.tracy.test/site/shop.example.com/')
  assert.deepEqual(assignedHere, ['/new/?tab=tracy:add-site'])
})

test('the eight scenes keep the approved order and each has its copy', () => {
  assert.equal(lib.SCENES.length, 8)
  assert.deepEqual(
    lib.SCENES.map((s) => s.flow ?? `tab${s.tab}`),
    ['tab2', 'import', 'create', 'system', 'customize', 'tab3', 'tab2', 'tab2']
  )
  for (let n = 1; n <= 8; n++) {
    assert.notEqual(lib.t(`welcome.${n}.title`), `welcome.${n}.title`)
    assert.doesNotMatch(lib.t(`welcome.${n}.body`), /[–—]|\bAI\b/, 'no dashes and no "AI" in the copy')
  }
  assert.equal(
    lib.sceneAddress(lib.SCENES[6], 'dark', false),
    '/welcome/scenes/engine.html?theme=dark&motion=full&rev=1&tab=2&changes=1'
  )
})

// Usage (`usage.ts`, `POST /api/onboarding/step`): each showing tells the steps it reached and how it ended.
const usage = () => calls.filter((x) => x[0] === 'fetch' && x[1] === '/api/onboarding/step').map((x) => x[2])

test('the Welcome popup tells each scene it reached and, on Escape, the scene it was left at', async () => {
  welcomeSeen = false
  page(undefined)
  let by = ''
  unmount = lib.mount(
    ({ t }) => lib.Welcome({ t, onClose: (how) => (by = how) }),
    document.getElementById('frame')
  )
  await settle()
  await key({ key: 'ArrowRight' })
  await key({ key: 'ArrowRight' })
  await key({ key: 'Escape' })
  assert.equal(by, 'escape')
  const told = usage()
  const run = told[0].runId
  assert.ok(
    told.every((x) => x.runId === run && x.flow === 'welcome'),
    'one showing, one id'
  )
  assert.deepEqual(
    told.map(({ step, end }) => (end ? `${step}:${end}` : step)),
    ['1', '2', '3', '3:escape']
  )
})

test('Skip on the first-run tour tells the step it was at and ends as skip', async () => {
  await start(undefined)
  await click('.tv-tour-link')
  const told = usage().filter((x) => x.flow === 'tour-start')
  assert.deepEqual(
    told.map(({ step, end }) => (end ? `${step}:${end}` : step)),
    ['createsite', 'createsite:skip']
  )
  assert.equal(new Set(told.map((x) => x.runId)).size, 1)
})

test('the site tour tells each step it reached and ends as skip at the step shown', async () => {
  tourFixture(siteTourControls)
  mountSiteTour()
  await settle()
  const first = $('.tv-tour')?.getAttribute('data-tour-step')
  assert.ok(first)
  await click('.tv-tour-link')
  const told = usage().filter((x) => x.flow === 'tour-site')
  assert.deepEqual(told.at(-1), { runId: told[0].runId, flow: 'tour-site', step: first, end: 'skip' })
  assert.deepEqual(told[0], { runId: told[0].runId, flow: 'tour-site', step: first })
})
