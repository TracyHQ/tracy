/**
 * The account menu at the foot of the left column (plan `tasks/todo-account-menu.md` B1, B3, B6,
 * B8): the signed-in person's face replaces the gear and opens a menu; the header opens Settings ›
 * Account, the rows come from the `settings.menu.item` slot in `order`, Appearance picks the theme
 * preference, and the Settings shortcut opens Settings without closing it when pressed again.
 *
 * The real components (`AccountMenu`, `TracySettingsRoot`, the Settings and Appearance rows on
 * `@tracy/core`'s Popover) are bundled by esbuild and mounted with React into jsdom. A row's
 * registration is played by the test's own `renderSlot`, which renders the slot's rows sorted by
 * `order` the way dsh's list slot does.
 *
 *   node --test packages/ui/tracy-settings/test/account-menu.test.mjs
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
const clientDir = path.join(here, '..', 'src', 'client')
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
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
/** What `/api/ui` answers as switched off, for bundles built after it is set. */
let switchedOff = []
/** @type {any} */
let lib
/** @type {any} */
let dom

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'KeyboardEvent',
    'MouseEvent',
    'PointerEvent',
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true })
  }
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const target of [globalThis, window]) target.ResizeObserver ??= ResizeObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The operator switches door: nothing switched off unless a test says so (`switchedOff`).
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ hidden: switchedOff }) })
  // jsdom's CSS parser does not survive the plugin's sheet; nothing here measures style.
  const sheet = window.document.createElement('meta')
  sheet.id = 'tracy-settings-css'
  window.document.head.append(sheet)

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-account-menu-'))
  lib = await bundle('menu')
})

/**
 * The menu, bundled as a plugin's client is, on a new page. Each name is its own copy, with its own
 * page of operator switches read from `/api/ui` when first asked.
 */
async function bundle(name) {
  // A new page: @tracy/core/ui-switches reads `/api/ui` once per page and keeps it on globalThis.
  delete globalThis[Symbol.for('@tracy/core/ui-switches#page-read')]
  const outfile = path.join(outDir, `${name}.cjs`)
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TracySettingsRoot } from './index'
        export { AccountMenu, AppearanceRow, SettingsRow, MENU_ITEM_SLOT } from './account-menu'
        export { PopoverItem } from '@tracy/core/site-tabs'
        export { uiSwitches } from '@tracy/core/ui-switches'
        export { en } from './strings'
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    loader: { '.css': 'empty' },
    define: { __TAILWIND_CSS__: '""' },
    outfile,
    logLevel: 'silent'
  })
  return require(outfile)
}

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const mounted = []

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    lib.act(() => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
})

const t = (key, params) =>
  (lib.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
    params && name in params ? String(params[name]) : m
  )

const LEE = { initial: 'L', color: '#bf5b3d', avatarUrl: null }
const SIGNED_IN = { state: 'signedIn', email: 'lee@example.com', name: 'Lee', face: LEE }
const NO_NAME = { state: 'signedIn', email: 'lee@example.com', name: null, face: LEE }
const LOADING = { state: 'loading', email: null, name: null, face: null }
const FAILED = { state: 'error', email: null, name: null, face: null }

const shortcut = { getSnapshot: () => KEYS, subscribe: () => () => {} }
const KEYS = Object.freeze(['⌘', ','])

/** dsh's theme service, as the Appearance row reads it. */
function themeService(preference = 'system') {
  const listeners = new Set()
  const service = {
    preference,
    getPreference: () => service.preference,
    subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    setPreference: (id) => {
      service.preference = id
      for (const listener of listeners) listener()
    }
  }
  return service
}

/**
 * The menu rows as dsh's list slot renders them: sorted by `order`. AI accounts and Community are
 * stand-ins drawn the way their plugins draw them (a PopoverItem calling the props they get).
 */
function menuRows(theme, opened) {
  const h = lib.createElement
  return [
    {
      order: 50,
      render: (props) =>
        h(
          lib.PopoverItem,
          { key: 'community', onClick: () => (opened.push('community'), props.close()) },
          'Community'
        )
    },
    { order: 30, render: (props) => h(lib.SettingsRow, { key: 'settings', ...props, t, shortcut }) },
    {
      order: 20,
      render: (props) =>
        h(
          lib.PopoverItem,
          { key: 'ai', onClick: () => props.openSettings('tracy-model-plan') },
          'AI accounts'
        )
    },
    { order: 40, render: (props) => h(lib.AppearanceRow, { key: 'appearance', ...props, t, theme }) }
  ]
    .sort((a, b) => a.order - b.order)
    .map((row) => (props) => row.render(props))
}

/** Mount the menu on its own: `opened` records what Settings was asked to open, and from where. */
function mountMenu({ viewer = SIGNED_IN, wide = false, accountShown = true, theme = themeService() } = {}) {
  const { createElement: h, act, createRoot, AccountMenu } = lib
  const opened = []
  const rows = menuRows(theme, opened)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(AccountMenu, {
        viewer,
        wide,
        t,
        accountShown,
        renderItems: (props) => rows.map((row) => row(props)),
        onOpenSettings: (id, opener) => opened.push({ id, opener })
      })
    )
  })
  mounted.push({ root, host })
  return { opened, theme }
}

const face = () => document.querySelector('[data-tracy-account-trigger]')
const menus = () => [...document.querySelectorAll('[role="menu"]')]
const rowsOf = (menu) =>
  [...menu.querySelectorAll('[role^="menuitem"]')].map((row) => (row.textContent ?? '').trim())
const rowNamed = (text) =>
  [...document.querySelectorAll('[role^="menuitem"]')].find((row) =>
    (row.textContent ?? '').trim().startsWith(text)
  )
const click = (element) => lib.act(() => element.click())
/** The header row: it is the row that carries the email. */
const header = () =>
  [...document.querySelectorAll('[role^="menuitem"]')].find((row) => row.textContent.includes('@example.com'))

function press(key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  lib.act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  })
  return event
}

test('the foot of the column is the person: their face, named for a screen reader, in both widths', () => {
  mountMenu({ wide: false })
  assert.equal(face().getAttribute('aria-label'), 'Lee: account and settings')
  assert.equal(face().getAttribute('aria-haspopup'), 'menu')
  assert.equal(face().querySelector('[data-tracy-face]').textContent, 'L')
  assert.equal(face().querySelector('[data-tracy-face]').style.width, '26px')
  assert.equal(face().textContent, 'L', 'the collapsed rail shows a name beside the face')
})

test('the wide column shows the name beside a 28px face, or the email when there is no name', () => {
  mountMenu({ wide: true })
  assert.equal(face().querySelector('[data-tracy-face]').style.width, '28px')
  assert.equal(face().querySelector('.ts-account-name').textContent, 'Lee')
  assert.equal(face().getAttribute('aria-label'), 'Lee: account and settings')
  afterEachNow()
  mountMenu({ wide: true, viewer: NO_NAME })
  assert.equal(face().querySelector('.ts-account-name').textContent, 'lee@example.com')
})

for (const [state, viewer] of [
  ['loading', LOADING],
  ['error', FAILED]
]) {
  test(`while the viewer is ${state}: a grey face with no letter, no header, and Settings still opens`, () => {
    const { opened } = mountMenu({ viewer, wide: true })
    assert.equal(
      face().querySelector('[data-tracy-face]').textContent,
      '',
      'a letter that may be someone else'
    )
    assert.equal(face().querySelector('.ts-account-name'), null)
    assert.equal(face().getAttribute('aria-label'), 'Account and settings')
    click(face())
    assert.deepEqual(rowsOf(menus()[0]), ['AI accounts', 'Settings⌘ ,', 'Appearance', 'Community'])
    click(rowNamed('Settings'))
    assert.deepEqual(
      opened.map(({ id }) => id),
      ['general']
    )
  })
}

test('the menu: the header (who), then the slot rows in order, the first row focused', () => {
  mountMenu()
  click(face())
  assert.equal(menus().length, 1)
  assert.deepEqual(rowsOf(menus()[0]), [
    // The header: the face's letter, the name, the email.
    'LLeelee@example.com',
    'AI accounts',
    'Settings⌘ ,',
    'Appearance',
    'Community'
  ])
  assert.equal(document.activeElement, header())
  // Nothing but these: no Sign out in this menu (Lee, 09/10/2026).
  assert.equal(rowNamed('Sign out'), undefined)
})

test('the header opens Settings on Account, from the face, and the menu is gone', () => {
  const { opened } = mountMenu()
  click(face())
  click(header())
  assert.equal(menus().length, 0)
  assert.equal(opened.length, 1)
  assert.equal(opened[0].id, 'tracy-account')
  assert.equal(opened[0].opener, face())
})

test('with the Account section switched off the header still says who, but opens nothing', () => {
  const { opened } = mountMenu({ accountShown: false })
  click(face())
  const menu = menus()[0]
  assert.ok((menu.textContent ?? '').includes('lee@example.com'))
  assert.deepEqual(rowsOf(menu), ['AI accounts', 'Settings⌘ ,', 'Appearance', 'Community'])
  assert.equal(document.activeElement, rowNamed('AI accounts'))
  assert.equal(opened.length, 0)
})

test('the Settings row opens General and shows the keys the shortcut registry reports', () => {
  const { opened } = mountMenu()
  click(face())
  const settings = rowNamed('Settings')
  assert.equal(settings.querySelector('kbd').textContent, '⌘ ,')
  click(settings)
  assert.equal(opened[0].id, 'general')
})

test('a row can close the menu without opening Settings', () => {
  const { opened } = mountMenu()
  click(face())
  click(rowNamed('Community'))
  assert.deepEqual(opened, ['community'])
  assert.equal(menus().length, 0)
})

test('Appearance: Light, Dark and System beside the menu, the preference checked, a pick saved', () => {
  const { theme } = mountMenu({ theme: themeService('system') })
  click(face())
  rowNamed('Appearance').focus()
  press('ArrowRight')
  const side = menus()[1]
  const radios = () =>
    [...side.querySelectorAll('[role="menuitemradio"]')].map((row) => [
      (row.textContent ?? '').trim(),
      row.getAttribute('aria-checked')
    ])
  assert.deepEqual(radios(), [
    ['Light', 'false'],
    ['Dark', 'false'],
    ['System', 'true']
  ])
  click(rowNamed('Dark'))
  assert.equal(theme.preference, 'dark')
  assert.equal(menus().length, 0, 'choosing a theme left the menu open')
  click(face())
  rowNamed('Appearance').focus()
  press('Enter')
  assert.equal(rowNamed('Dark').getAttribute('aria-checked'), 'true')
})

test('Appearance follows a change made elsewhere (Settings › General, another window)', () => {
  const { theme } = mountMenu({ theme: themeService('light') })
  click(face())
  rowNamed('Appearance').focus()
  press('ArrowRight')
  lib.act(() => theme.setPreference('system'))
  assert.equal(rowNamed('System').getAttribute('aria-checked'), 'true')
  assert.equal(rowNamed('Light').getAttribute('aria-checked'), 'false')
})

// ── The root: the menu wired to the Settings dialog ─────────────────────────────────────────────

const SECTIONS = [
  { id: 'general', order: 0, label: 'General', group: '' },
  { id: 'tracy-account', order: 20, label: 'Account', group: 'user' },
  { id: 'dsh-passwords', order: 90, label: 'Password Gate', group: '' }
]

/** The seat as dsh mounts it, with a fake shortcut registry that records what it was given. */
function mountRoot({ sections = SECTIONS } = {}) {
  const { createElement: h, act, createRoot, TracySettingsRoot, MENU_ITEM_SLOT } = lib
  const shortcuts = { registered: [], disposed: 0 }
  const settingsShortcut = {
    register: (open) => {
      shortcuts.registered.push(open)
      return () => shortcuts.disposed++
    }
  }
  const rows = (props) => [
    h(lib.PopoverItem, { key: 'ai', onClick: () => props.openSettings('tracy-model-plan') }, 'AI accounts'),
    h(lib.SettingsRow, { key: 'settings', ...props, t, shortcut }),
    h(lib.PopoverItem, { key: 'gate', onClick: () => props.openSettings('dsh-passwords') }, 'Gate'),
    h(lib.PopoverItem, { key: 'nowhere', onClick: () => props.openSettings('no-such-section') }, 'Nowhere')
  ]
  const renderSlot = (name, owner, options) => {
    if (name === MENU_ITEM_SLOT) return rows(owner)
    if (name === 'settings.section') return h('p', { id: `section-${options?.only}` }, options?.only)
    if (name === 'settings.action') return null
    return name
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(TracySettingsRoot, {
        wide: true,
        t,
        renderSlot,
        useSections: (select) => select(sections),
        settingsShortcut
      })
    )
  })
  const entry = { root, host }
  mounted.push(entry)
  return { shortcuts, entry }
}

const dialog = () => document.querySelector('[role="dialog"]')
const openSection = () => dialog()?.querySelector('[id^="section-"]')?.id.slice('section-'.length)

test('the Settings row opens the dialog on General, focus inside it; closing gives focus back to the face', () => {
  mountRoot()
  click(face())
  click(rowNamed('Settings'))
  assert.equal(menus().length, 0)
  assert.ok(dialog(), 'Settings did not open')
  assert.equal(openSection(), 'general')
  assert.ok(dialog().contains(document.activeElement), 'focus stayed outside the dialog')
  press('Escape')
  assert.equal(dialog(), null)
  assert.equal(document.activeElement, face(), 'focus did not come back to the face')
})

test('a section that is not on the nav opens Settings on its default', () => {
  for (const row of ['AI accounts', 'Gate', 'Nowhere']) {
    mountRoot()
    click(face())
    click(rowNamed(row))
    assert.equal(openSection(), 'general', `${row} opened a page the nav does not show`)
    afterEachNow()
  }
})

test('the shortcut opens Settings, pressed again keeps it open, and leaves with the seat', () => {
  const { shortcuts, entry } = mountRoot()
  assert.equal(shortcuts.registered.length, 1, 'the command is not registered once')
  lib.act(() => shortcuts.registered[0]())
  assert.ok(dialog(), 'the shortcut did not open Settings')
  assert.equal(openSection(), 'general')
  lib.act(() => shortcuts.registered[0]())
  assert.ok(dialog(), 'the second press closed Settings')
  lib.act(() => entry.root.unmount())
  mounted.splice(mounted.indexOf(entry), 1)
  entry.host.remove()
  assert.equal(shortcuts.disposed, 1, 'the command outlived the seat')
})

test('the dialog tells the shortcut registry it is Settings', () => {
  mountRoot()
  click(face())
  click(rowNamed('Settings'))
  assert.equal(dialog().getAttribute('data-shortcut-modal'), 'settings')
})

/** Unmount everything now, for a test that mounts twice. */
function afterEachNow() {
  for (const { root, host } of mounted.splice(0)) {
    lib.act(() => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
}

test('Appearance follows its operator switch (`appearance`): off, the row is not in the menu', async () => {
  switchedOff = ['appearance']
  const own = await bundle('appearance-off')
  const { createElement: h, act, createRoot } = own
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const theme = themeService()
  // Once the door has answered (no async `act`: from a bundle it leaves a MessageChannel open).
  await own.uiSwitches().ready
  switchedOff = []
  act(() => {
    root.render(
      h(own.AccountMenu, {
        viewer: SIGNED_IN,
        wide: true,
        t,
        accountShown: true,
        renderItems: (props) => [
          h(own.SettingsRow, { key: 'settings', ...props, t, shortcut }),
          h(own.AppearanceRow, { key: 'appearance', ...props, t, theme })
        ],
        onOpenSettings: () => {}
      })
    )
  })
  try {
    act(() => face().click())
    assert.equal(
      document.querySelector('[data-menu-item="appearance"]'),
      null,
      'the switched-off row is drawn'
    )
    assert.notEqual(document.querySelector('[data-menu-item="settings"]'), null)
  } finally {
    // This copy's own React unmounts what it mounted.
    act(() => root.unmount())
    host.remove()
  }
})
