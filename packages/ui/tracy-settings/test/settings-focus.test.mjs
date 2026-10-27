/**
 * The Settings dialog and the keyboard (issue #807, F-S2-006).
 *
 * The surface says `role="dialog" aria-modal="true"`, so it owes what that promises: focus moves in
 * when it opens, Tab and Shift+Tab stay inside it, and closing hands focus back to what opened it.
 * The Language row's menu is portalled to `document.body`, outside the dialog: it still belongs to
 * the dialog, so Tab from the menu continues from the menu's button, and Escape closes the menu
 * first and the dialog on the next press.
 *
 * The real components (`TracySettingsRoot`, `SettingsPage`, `LanguageRow` with `@tracy/core`'s
 * Popover) are bundled by esbuild and mounted with React into jsdom; keys are real DOM events on
 * the focused element. jsdom is resolved from a workspace member that declares it.
 *
 * WHAT jsdom DOES NOT DO, so this file does not claim it: it never moves focus on Tab by itself.
 * The dialog does not rely on that: it takes every Tab press and moves focus by hand, so each case
 * asserts "prevented" and where focus landed. That the order it walks is the order a browser's own
 * Tab walks is a claim about browsers, measured in one (see the regression case), not here. Nothing
 * is laid out either: a control hidden by CSS is told apart through `getComputedStyle` (inline
 * styles and a small sheet here), which is what the dialog reads, not through any box it has.
 *
 *   node --test packages/ui/tracy-settings/test/settings-focus.test.mjs
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
// react-dom is not a dependency of this package; @tracy/core carries it, and pnpm resolves both
// packages' react to the same copy, so the mount below has one React.
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
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

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom
/** Every `keydown` listener the document holds right now, as `{listener, capture}`. */
const keydownListeners = new Set()

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['document', 'Node', 'HTMLElement', 'KeyboardEvent', 'MouseEvent', 'Event']) {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true })
  }
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  // The nav column sits in a scroll area that watches its own size; nothing here has a size.
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const target of [globalThis, window]) target.ResizeObserver ??= ResizeObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // The seat injects its stylesheet once per document, keyed by this id. jsdom's CSS parser does not
  // survive that sheet (the process is killed for memory), and no style is measured here, so the id
  // is taken before the seat mounts.
  const sheet = window.document.createElement('meta')
  sheet.id = 'tracy-settings-css'
  window.document.head.append(sheet)

  // A rule from a stylesheet, not an inline style: the dialog must read the computed value.
  const rule = window.document.createElement('style')
  rule.textContent = '.focus-test-off { display: none }'
  window.document.head.append(rule)

  const add = window.document.addEventListener.bind(window.document)
  const remove = window.document.removeEventListener.bind(window.document)
  const captures = (options) => options === true || options?.capture === true
  window.document.addEventListener = (type, listener, options) => {
    if (type === 'keydown') keydownListeners.add({ listener, capture: captures(options) })
    return add(type, listener, options)
  }
  window.document.removeEventListener = (type, listener, options) => {
    if (type === 'keydown') {
      for (const entry of keydownListeners) {
        if (entry.listener === listener && entry.capture === captures(options)) {
          keydownListeners.delete(entry)
          break
        }
      }
    }
    return remove(type, listener, options)
  }

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-focus-'))
  const outfile = path.join(outDir, 'focus.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { SettingsPage, TracySettingsRoot } from './index'
        export { createSectionRequests } from './settings-link'
        export { LanguageRow } from './language-row'
        export { SettingsRow, MENU_ITEM_SLOT } from './account-menu'
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
    // The client entry reads the Tailwind sheet from a build-time constant.
    define: { __TAILWIND_CSS__: '""' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

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

const ROWS = [
  { id: 'general', order: 0, label: 'General', group: '' },
  { id: 'tracy-account', order: 20, label: 'Account', group: 'user' },
  { id: 'gone-soon', order: 30, label: 'Gone soon', group: '' }
]

const t = (key, params) =>
  (lib.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
    params && name in params ? String(params[name]) : m
  )

const language = {
  getSnapshot: () => SNAPSHOT,
  subscribe: () => () => {},
  setLocale: () => {},
  clearPreference: () => {}
}
const SNAPSHOT = {
  active: 'en',
  preference: undefined,
  locales: [
    { id: 'en', label: 'English' },
    { id: 'vi', label: 'Tiếng Việt' }
  ]
}

/** What each section draws. `general` ends in controls a keyboard must never land on. */
function section(id) {
  const h = lib.createElement
  if (id === 'general') {
    return h(
      'div',
      null,
      h(lib.LanguageRow, { t, language }),
      h('button', { type: 'button', id: 'after-language' }, 'After the language row'),
      h('button', { type: 'button', id: 'last' }, 'Last control'),
      h('button', { type: 'button', id: 'disabled', disabled: true }, 'Disabled'),
      h('fieldset', { disabled: true }, h('button', { type: 'button', id: 'in-disabled-fieldset' }, 'Off')),
      h('button', { type: 'button', id: 'hidden', hidden: true }, 'Hidden'),
      h('div', { hidden: true }, h('button', { type: 'button', id: 'in-hidden' }, 'Inside hidden')),
      h('button', { type: 'button', id: 'untabbable', tabIndex: -1 }, 'Not in the tab order'),
      h('input', { type: 'hidden', id: 'hidden-input' }),
      h('a', { id: 'no-href' }, 'Not a link'),
      // Hidden by CSS alone, after the last control a person can see: none of these is a stop.
      h('button', { type: 'button', id: 'css-display-none', style: { display: 'none' } }, 'No box'),
      h(
        'div',
        { style: { display: 'none' } },
        h('button', { type: 'button', id: 'in-css-display-none' }, 'x')
      ),
      h('button', { type: 'button', id: 'css-invisible', style: { visibility: 'hidden' } }, 'Invisible'),
      h(
        'div',
        { style: { visibility: 'hidden' } },
        h('button', { type: 'button', id: 'in-css-invisible' }, 'Inherits invisible')
      ),
      h('button', { type: 'button', id: 'css-collapsed', style: { visibility: 'collapse' } }, 'Collapsed'),
      h('button', { type: 'button', id: 'sheet-hidden', className: 'focus-test-off' }, 'Hidden by a sheet')
    )
  }
  if (id === 'gone-soon') return h('button', { type: 'button', id: 'gone-control' }, 'Here for now')
  return h('p', null, 'Nothing to press here.')
}

const NO_KEYS = Object.freeze([])
const shortcut = { getSnapshot: () => NO_KEYS, subscribe: () => () => {} }

const renderSlot = (name, owner, options) => {
  if (name === 'settings.section') return section(options?.only)
  // The account menu's Settings row: the way into the dialog since the face replaced the gear.
  if (name === lib.MENU_ITEM_SLOT) return lib.createElement(lib.SettingsRow, { ...owner, t, shortcut })
  if (name === 'settings.action') return null
  return name
}

/** Mount the sidebar seat (the face's menu + dialog) the way dsh does, with the given sections. */
function mountRoot(rows = ROWS) {
  const { createElement: h, act, createRoot, TracySettingsRoot } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(h(TracySettingsRoot, { wide: true, t, renderSlot, useSections: (select) => select(rows) }))
  })
  const entry = { root, host }
  mounted.push(entry)
  return entry
}

/** The person's face at the foot of the column: it opens the menu that opens Settings. */
const gear = () => document.querySelector('[data-tracy-account-trigger]')
/** Open Settings the way a person does: the face, then the menu's Settings row. */
function openFromMenu() {
  click(gear())
  const row = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].find(
    (item) => (item.textContent ?? '').trim() === 'Settings'
  )
  click(row)
}
const dialog = () => document.querySelector('[role="dialog"]')
const closeButton = () => dialog().querySelector('.ts-close')
const navItems = () => [...dialog().querySelectorAll('.ts-nav')]
const languageButton = () => dialog().querySelector('.ts-select')
const menu = () => document.querySelector('[role="menu"]')
const byId = (id) => document.getElementById(id)
const click = (element) => lib.act(() => element.click())
const focus = (element) => lib.act(() => element.focus())

/** A node in a failure message: jsdom nodes must never reach assert's own diff (it walks the window). */
const describeNode = (node) =>
  node == null
    ? String(node)
    : `<${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}> "${(node.textContent ?? '').trim().slice(0, 40)}"`

/** Focus is on exactly `expected`. */
function focusIs(expected, message = 'focus') {
  const active = document.activeElement
  assert.ok(
    active === expected,
    `${message}: focus is on ${describeNode(active)}, expected ${describeNode(expected)}`
  )
}

/** @returns {KeyboardEvent} the event, after dispatch on whatever holds focus */
function press(key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  lib.act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  })
  return event
}

function open(rows) {
  mountRoot(rows)
  openFromMenu()
  assert.ok(dialog(), 'the dialog did not open')
}

test('opening moves focus into the dialog, onto the section that is open', () => {
  open()
  assert.ok(dialog().contains(document.activeElement), 'focus stayed outside the dialog')
  // The open section's own nav item, which is not the first one in the column: groups order the
  // column, and the section that opens by default sits in the second group.
  const current = navItems().filter((item) => item.getAttribute('aria-current') === 'page')
  assert.equal(current.length, 1)
  focusIs(current[0])
  assert.ok(current[0] !== navItems()[0], 'this case needs the open section away from the top of the column')
})

test('a dialog with no section still takes focus, on its close button', () => {
  open([])
  assert.equal(navItems().length, 0)
  focusIs(closeButton())
  // One control: Tab and Shift+Tab both stay on it instead of leaving the dialog.
  for (const shiftKey of [false, true]) {
    const event = press('Tab', { shiftKey })
    assert.equal(event.defaultPrevented, true)
    focusIs(closeButton())
  }
})

test('Tab on the last control wraps to the first; disabled and hidden controls are never the last', () => {
  open()
  focus(byId('last'))
  const event = press('Tab')
  assert.equal(event.defaultPrevented, true, 'Tab was left to the browser at the end of the dialog')
  focusIs(navItems()[0])
})

test('Shift+Tab on the first control wraps to the last one a keyboard can reach', () => {
  open()
  focus(navItems()[0])
  const event = press('Tab', { shiftKey: true })
  assert.equal(event.defaultPrevented, true, 'Shift+Tab was left to the browser at the start of the dialog')
  focusIs(byId('last'))
})

test('controls hidden by CSS alone are not stops: Tab on the last visible control still wraps', () => {
  open()
  const hidden = [
    'css-display-none',
    'in-css-display-none',
    'css-invisible',
    'in-css-invisible',
    'css-collapsed',
    'sheet-hidden'
  ]
  for (const id of hidden) assert.ok(byId(id), `the fixture lost #${id}`)
  // They follow "Last control" in the document, which is what made Tab look safe to leave alone.
  for (const id of hidden) {
    assert.ok(
      (byId('last').compareDocumentPosition(byId(id)) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      `#${id} must come after the last visible control`
    )
  }
  focus(byId('last'))
  assert.equal(
    press('Tab').defaultPrevented,
    true,
    'Tab was left to the browser with only hidden controls ahead'
  )
  focusIs(navItems()[0])

  focus(navItems()[0])
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(byId('last'), 'Shift+Tab wrapped onto a control that is not on screen')
})

test('a control inside a visibility:hidden parent that turns itself visible is a stop', () => {
  const { createElement: h } = lib
  mountPage({
    rows: [{ id: 'only', order: 0, label: 'Only', group: '' }],
    activeId: 'only',
    renderSlot: (name) =>
      name === 'settings.section'
        ? h(
            'div',
            { style: { visibility: 'hidden' } },
            h('button', { type: 'button', id: 'shown-again', style: { visibility: 'visible' } }, 'Visible')
          )
        : null
  })
  focus(navItems()[navItems().length - 1])
  lib.act(() => document.activeElement.blur())
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(byId('shown-again'))
})

test('Tab between two controls inside the dialog is moved by the dialog too, never left to the browser', () => {
  open()
  const order = [...navItems(), closeButton(), languageButton(), byId('after-language'), byId('last')]
  for (let index = 0; index < order.length - 1; index++) {
    focus(order[index])
    assert.equal(press('Tab').defaultPrevented, true, `Tab from stop ${index} was left to the browser`)
    focusIs(order[index + 1], `Tab from stop ${index}`)
    assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
    focusIs(order[index], `Shift+Tab back to stop ${index}`)
  }
})

test('focus that is nowhere in the dialog comes back in on Tab, at the start or the end', () => {
  open()
  lib.act(() => document.activeElement.blur())
  focusIs(document.body)
  assert.equal(press('Tab').defaultPrevented, true)
  focusIs(navItems()[0])

  lib.act(() => document.activeElement.blur())
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(byId('last'))
})

test('a control outside the tab order but inside the dialog continues from where it stands', () => {
  open()
  // The last focusable thing in the dialog, after every reachable control: Shift+Tab goes back to
  // "Last control", Tab wraps.
  focus(byId('untabbable'))
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(byId('last'))
  focus(byId('untabbable'))
  assert.equal(press('Tab').defaultPrevented, true)
  focusIs(navItems()[0])
})

/** Mount the dialog with one section that draws `children`. */
function openWith(...children) {
  mountPage({
    rows: [{ id: 'only', order: 0, label: 'Only', group: '' }],
    activeId: 'only',
    renderSlot: (name) => (name === 'settings.section' ? lib.createElement('div', null, ...children) : null)
  })
}

/**
 * Press Tab until focus is back where it started, and return the ids walked (nav item = "nav",
 * close button = "close"). Every press must be the dialog's and must land inside it.
 */
function walk(start, shiftKey = false) {
  const name = (el) =>
    el.id || (el === closeButton() ? 'close' : el.classList.contains('ts-nav') ? 'nav' : '?')
  focus(start)
  const seen = [name(start)]
  for (let presses = 0; presses < 40; presses++) {
    const event = press('Tab', { shiftKey })
    assert.equal(
      event.defaultPrevented,
      true,
      `press ${presses + 1} after ${seen.join(' > ')} was left to the browser`
    )
    const active = document.activeElement
    assert.ok(dialog().contains(active), `press ${presses + 1} after ${seen.join(' > ')} left the dialog`)
    if (active === start) return seen
    seen.push(name(active))
  }
  assert.fail(`Tab never came back to the start: ${seen.join(' > ')}`)
}

test('a positive tabindex after the last ordinary control: Tab on that last control wraps, it does not leave', () => {
  const h = lib.createElement
  openWith(
    h('button', { type: 'button', id: 'zero-a' }, 'a'),
    h('button', { type: 'button', id: 'zero-last' }, 'last in document order among tabindex 0'),
    h('button', { type: 'button', id: 'two', tabIndex: 2 }, 'second'),
    h('button', { type: 'button', id: 'one', tabIndex: 1 }, 'first'),
    h('button', { type: 'button', id: 'two-b', tabIndex: 2 }, 'second, later in the document')
  )
  // The browser's order: positive values ascending (ties in document order), then the rest.
  const order = ['one', 'two', 'two-b', 'nav', 'close', 'zero-a', 'zero-last']
  assert.deepEqual(walk(byId('one')), order)
  assert.deepEqual(walk(byId('one'), true), ['one', ...order.slice(1).reverse()])

  // The reported press: a control follows in the document, yet this is the end of the tab order.
  focus(byId('zero-last'))
  assert.equal(press('Tab').defaultPrevented, true, 'Tab at the end of the tab order was left to the browser')
  focusIs(byId('one'))
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(byId('zero-last'))
  // And the other edge: the last positive value is followed by the first ordinary control.
  focus(byId('two-b'))
  press('Tab')
  focusIs(navItems()[0])
})

test('only positive tabindex values in a section: both edges still wrap inside the dialog', () => {
  mountPage({
    rows: [],
    activeId: undefined,
    renderSlot: () => null
  })
  // No section: the close button is the only ordinary stop. Add positive ones after it.
  const extra = document.createElement('button')
  extra.id = 'late-positive'
  extra.tabIndex = 3
  lib.act(() => dialog().append(extra))
  assert.deepEqual(walk(extra), ['late-positive', 'close'])
  assert.deepEqual(walk(extra, true), ['late-positive', 'close'])
})

test('a radio group is one stop: the checked radio, or the first one when none is checked', () => {
  const h = lib.createElement
  const radio = (id, name, props = {}) => h('input', { type: 'radio', id, name, ...props })
  openWith(
    h('button', { type: 'button', id: 'before' }, 'before'),
    radio('size-s', 'size'),
    radio('size-m', 'size', { defaultChecked: true }),
    radio('size-l', 'size'),
    h('button', { type: 'button', id: 'between' }, 'between'),
    radio('tone-a', 'tone'),
    radio('tone-b', 'tone'),
    radio('tone-off', 'tone', { disabled: true }),
    // Same name in another form: a group of its own.
    h('form', null, radio('form-tone-a', 'tone'), radio('form-tone-b', 'tone', { defaultChecked: true })),
    // No name: each one is a stop.
    h('input', { type: 'radio', id: 'lone-a' }),
    h('input', { type: 'radio', id: 'lone-b' }),
    // The group that ends the dialog: three radios follow the checked one in the document.
    radio('end-on', 'end', { defaultChecked: true }),
    radio('end-b', 'end'),
    radio('end-c', 'end')
  )
  const forward = ['before', 'size-m', 'between', 'tone-a', 'form-tone-b', 'lone-a', 'lone-b', 'end-on']
  assert.deepEqual(walk(navItems()[0]), ['nav', 'close', ...forward])
  // Going back, the group with nothing checked is entered at the same radio (Chrome 154, measured).
  assert.deepEqual(walk(navItems()[0], true), ['nav', ...[...forward].reverse(), 'close'])

  // The reported press: on the checked radio that ends the tab order, unchecked ones still follow.
  focus(byId('end-on'))
  assert.equal(press('Tab').defaultPrevented, true, 'Tab on the last group was left to the browser')
  focusIs(navItems()[0])
  // Focus on a radio that is not its group's stop (a script put it there): Tab leaves the group.
  focus(byId('size-s'))
  press('Tab')
  focusIs(byId('between'))
  focus(byId('size-l'))
  press('Tab', { shiftKey: true })
  focusIs(byId('before'))
})

test('a disabled fieldset disables its form controls, not its first legend and not its links', () => {
  const h = lib.createElement
  openWith(
    h('button', { type: 'button', id: 'before' }, 'before'),
    h(
      'fieldset',
      { disabled: true },
      h('legend', null, h('button', { type: 'button', id: 'in-first-legend' }, 'Still works')),
      h('legend', null, h('button', { type: 'button', id: 'in-second-legend' }, 'Disabled')),
      h('button', { type: 'button', id: 'in-fieldset' }, 'Disabled'),
      h('input', { id: 'input-in-fieldset' }),
      h('a', { href: '#x', id: 'link-in-fieldset' }, 'A link is never disabled'),
      h(
        'fieldset',
        null,
        h('legend', null, h('button', { type: 'button', id: 'nested-legend' }, 'Disabled by the outer one'))
      )
    ),
    h(
      'fieldset',
      null,
      h(
        'legend',
        null,
        h(
          'fieldset',
          { disabled: true },
          h('legend', null, h('button', { type: 'button', id: 'last-legend' }, 'The last stop'))
        )
      )
    )
  )
  const order = ['nav', 'close', 'before', 'in-first-legend', 'link-in-fieldset', 'last-legend']
  assert.deepEqual(walk(navItems()[0]), order)
  assert.deepEqual(walk(navItems()[0], true), ['nav', ...order.slice(1).reverse()])
  // The reported press: the last stop sits in the first legend of a disabled fieldset.
  focus(byId('last-legend'))
  assert.equal(press('Tab').defaultPrevented, true)
  focusIs(navItems()[0])
  focus(navItems()[0])
  press('Tab', { shiftKey: true })
  focusIs(byId('last-legend'), 'Shift+Tab skipped the control in the legend')
})

test('a stop that turns focus down is passed over, forward and back, and Tab still lands inside', () => {
  const h = lib.createElement
  openWith(
    h('button', { type: 'button', id: 'before' }, 'before'),
    h('button', { type: 'button', id: 'refuses' }, 'refuses'),
    h('button', { type: 'button', id: 'refuses-too' }, 'refuses too')
  )
  // What a browser does for a control it will not focus for a reason this dialog cannot read.
  for (const id of ['refuses', 'refuses-too']) byId(id).focus = () => {}
  assert.deepEqual(walk(navItems()[0]), ['nav', 'close', 'before'])
  assert.deepEqual(walk(navItems()[0], true), ['nav', 'before', 'close'])
})

test('Tab into a text field selects its text, as the browser does', () => {
  const h = lib.createElement
  openWith(
    h('button', { type: 'button', id: 'before' }, 'before'),
    h('input', { id: 'name', defaultValue: 'Tracy' }),
    h('textarea', { id: 'note', defaultValue: 'two words' }),
    h('input', { type: 'checkbox', id: 'tick' })
  )
  focus(byId('before'))
  press('Tab')
  focusIs(byId('name'))
  assert.deepEqual([byId('name').selectionStart, byId('name').selectionEnd], [0, 5])
  press('Tab')
  focusIs(byId('note'))
  assert.deepEqual([byId('note').selectionStart, byId('note').selectionEnd], [0, 9])
  press('Tab')
  focusIs(byId('tick'))
})

test('the section under focus is removed: the next Tab lands back inside the dialog', () => {
  open()
  click(navItems().find((item) => item.textContent === 'Gone soon'))
  focus(byId('gone-control'))
  // Another section opens; the control that held focus is unmounted, and focus falls to the body.
  click(navItems()[0])
  assert.ok(byId('gone-control') === null)
  focusIs(document.body)
  assert.equal(press('Tab').defaultPrevented, true)
  assert.ok(dialog().contains(document.activeElement))
  focusIs(navItems()[0])
})

test('the language menu is outside the dialog, and Tab from it continues from its button', () => {
  open()
  click(languageButton())
  assert.ok(menu(), 'the menu did not open')
  assert.equal(dialog().contains(menu()), false, 'the menu is expected to be portalled out of the dialog')

  focus(menu().querySelector('button'))
  assert.equal(press('Tab').defaultPrevented, true)
  focusIs(byId('after-language'))
  // Tab leaves a menu without choosing: it is closed by then (WAI-ARIA menu pattern).
  assert.ok(menu() === null, 'Tab left the menu open')

  click(languageButton())
  focus(menu().querySelector('button'))
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, true)
  focusIs(closeButton())
  assert.ok(menu() === null, 'Shift+Tab left the menu open')
})

test('Escape with the language menu open closes the menu only; the next Escape closes Settings', () => {
  open()
  click(languageButton())
  focus(menu().querySelector('button'))

  press('Escape')
  assert.ok(menu() === null, 'the menu is still open')
  assert.ok(dialog(), 'one Escape closed the menu AND Settings')
  focusIs(languageButton(), 'focus did not return to the menu button')

  press('Escape')
  assert.ok(dialog() === null, 'the second Escape did not close Settings')
  focusIs(gear(), 'focus did not return to the button that opened Settings')
})

test('closing by the close button returns focus to the opener, every time', () => {
  mountRoot()
  for (let round = 0; round < 3; round++) {
    openFromMenu()
    assert.ok(dialog().contains(document.activeElement), `round ${round}: focus not in the dialog`)
    click(closeButton())
    assert.ok(dialog() === null)
    focusIs(gear(), `round ${round}: focus not back on the opener`)
  }
})

test('the dialog holds one keydown listener while open and none after it closes', () => {
  mountRoot()
  const idle = keydownListeners.size
  for (let round = 0; round < 3; round++) {
    openFromMenu()
    assert.equal(keydownListeners.size, idle + 1, `round ${round}: while open`)
    click(languageButton())
    assert.equal(keydownListeners.size, idle + 2, `round ${round}: with the menu open`)
    press('Escape')
    press('Escape')
    assert.equal(keydownListeners.size, idle, `round ${round}: after closing`)
  }
  // Keys after the dialog is gone are nobody's: nothing is prevented, nothing is focused.
  lib.act(() => document.activeElement.blur())
  for (const [key, init] of [
    ['Tab', {}],
    ['Tab', { shiftKey: true }],
    ['Escape', {}]
  ]) {
    assert.equal(press(key, init).defaultPrevented, false, key)
    focusIs(document.body)
  }
})

test('unmounting the whole seat while Settings and its menu are open leaves no listener behind', () => {
  const idle = keydownListeners.size
  const entry = mountRoot()
  openFromMenu()
  click(languageButton())
  assert.equal(keydownListeners.size, idle + 2)
  assert.doesNotThrow(() => lib.act(() => entry.root.unmount()))
  assert.equal(keydownListeners.size, idle)
  assert.equal(press('Escape').defaultPrevented, false)
})

/** Mount `SettingsPage` alone, the way a caller that owns the open state does. */
function mountPage(props = {}) {
  const { createElement: h, act, createRoot, SettingsPage } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(SettingsPage, {
        t,
        renderSlot,
        rows: ROWS,
        activeId: 'general',
        onSelect: () => {},
        onClose: () => {},
        ...props
      })
    )
  })
  const entry = { root, host }
  mounted.push(entry)
  return entry
}

test('without a named opener, focus returns to whatever held it when the dialog opened', () => {
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  const entry = mountPage()
  assert.ok(dialog().contains(document.activeElement))
  lib.act(() => entry.root.unmount())
  focusIs(outside)
})

test('an opener that left the document is not focused when the dialog closes', () => {
  const opener = document.createElement('button')
  document.body.append(opener)
  let focused = 0
  opener.addEventListener('focus', () => focused++)
  const entry = mountPage({ opener })
  opener.remove()
  assert.doesNotThrow(() => lib.act(() => entry.root.unmount()))
  assert.equal(focused, 0, 'focus was written to a node that is no longer in the document')
  focusIs(document.body)
})

test('Escape that something else consumed does not close Settings', () => {
  let closed = 0
  mountPage({ onClose: () => closed++ })
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  event.preventDefault()
  lib.act(() => {
    document.body.dispatchEvent(event)
  })
  assert.equal(closed, 0)
  press('Escape')
  assert.equal(closed, 1)
})

// ── the app asks for Help & about (desktop: a notification, Help › What's New…) ──────────────────

const WITH_HELP = [...ROWS, { id: 'tracy-help-about', order: 1000, label: 'Help & about', group: 'help' }]

function mountWithRequests(rows, sectionRequests = lib.createSectionRequests()) {
  const { createElement: h, act, createRoot, TracySettingsRoot } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (current) =>
    act(() => {
      root.render(
        h(TracySettingsRoot, {
          wide: true,
          t,
          renderSlot,
          useSections: (select) => select(current),
          sectionRequests
        })
      )
    })
  render(rows)
  mounted.push({ root, host })
  sectionRequests.rerender = render
  return sectionRequests
}

const openSection = () => dialog().querySelector('.ts-nav[aria-current="page"]')?.textContent?.trim()

test('the app asks for Help & about: Settings opens on it', () => {
  const requests = mountWithRequests(WITH_HELP)
  assert.equal(dialog(), null)
  lib.act(() => requests.ask('tracy-help-about'))
  assert.ok(dialog(), 'Settings opened')
  assert.equal(openSection(), 'Help & about')
})

test('Settings already open on another section: the request moves it to Help & about', () => {
  const requests = mountWithRequests(WITH_HELP)
  openFromMenu()
  assert.notEqual(openSection(), 'Help & about')
  lib.act(() => requests.ask('tracy-help-about'))
  assert.equal(openSection(), 'Help & about')
})

test('asked before Help & about has registered (the app just opened): it opens once the section arrives', () => {
  const requests = lib.createSectionRequests()
  requests.ask('tracy-help-about')
  mountWithRequests(ROWS, requests)
  assert.ok(dialog(), 'Settings opened')
  requests.rerender(WITH_HELP)
  assert.equal(openSection(), 'Help & about')
})
