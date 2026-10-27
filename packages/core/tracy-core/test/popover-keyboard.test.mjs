/**
 * The self-placing menu and the keyboard (`src/site-tabs/Popover.tsx`): the WAI-ARIA menu pattern
 * the account menu needs (plan `tasks/todo-account-menu.md` B2).
 *
 * Opening moves focus to the first item; ArrowUp/ArrowDown move between items and wrap, Home/End
 * jump; a submenu row opens a side panel on ArrowRight or Enter and focuses its first item;
 * ArrowLeft or Escape in the submenu goes back to its row; Tab closes without choosing anything.
 * A panel that holds a form or a list of its own (Design inspiration's filter and prompt) has no
 * menu items, and every key there is left alone.
 *
 * Same harness as `popover-escape.test.mjs`: the component is bundled by esbuild and mounted with
 * React into jsdom; keys are real DOM events on the focused element. jsdom never moves focus on Tab
 * by itself, so the Tab case asserts what the menu did, not where a browser would go next.
 *
 *   node --test packages/core/tracy-core/test/popover-keyboard.test.mjs
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

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'KeyboardEvent',
    'MouseEvent',
    'PointerEvent',
    'Event'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'popover-keyboard-'))
  const outfile = path.join(outDir, 'popover.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Popover, PopoverItem, PopoverSeparator, PopoverSubmenu } from './Popover'
      `,
      resolveDir: path.join(here, '..', 'src', 'site-tabs'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
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

/** What each row did when chosen, in order. */
let chosen = []

/**
 * Mount one menu behind `#trigger`: rows One, Two (disabled), Three, a submenu "Look" holding three
 * radio rows, then Four. `children` replaces that content.
 */
function mountMenu(children) {
  chosen = []
  const { createElement: h, act, createRoot, Popover, PopoverItem, PopoverSeparator, PopoverSubmenu } = lib
  const pick = (name) => () => chosen.push(name)
  const content =
    children ??
    ((menu) => [
      h(PopoverItem, { key: '1', onClick: pick('one') }, 'One'),
      h(PopoverItem, { key: '2', onClick: pick('two'), disabled: true }, 'Two'),
      h(PopoverItem, { key: '3', onClick: pick('three') }, 'Three'),
      h(
        PopoverSubmenu,
        { key: 'look', label: 'Look' },
        h(PopoverItem, { selected: true, onClick: pick('light') }, 'Light'),
        h(PopoverItem, { selected: false, onClick: pick('dark') }, 'Dark'),
        h(PopoverItem, { selected: false, onClick: pick('system') }, 'System')
      ),
      h(PopoverSeparator, { key: 'sep' }),
      h(PopoverItem, { key: '4', onClick: () => (chosen.push('four'), menu.close()) }, 'Four')
    ])
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(
        Popover,
        { trigger: (props) => h('button', { type: 'button', id: 'trigger', ...props }, 'Open') },
        content
      )
    )
  })
  mounted.push({ root, host })
}

const trigger = () => document.getElementById('trigger')
const menus = () => [...document.querySelectorAll('[role="menu"]')]
const click = (element) => lib.act(() => element.click())
const label = (node) => (node?.textContent ?? '').trim()

const describeNode = (node) =>
  node == null
    ? String(node)
    : `<${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}> "${label(node).slice(0, 40)}"`

/** Focus is on the row whose text is `text`, or on `text` itself when it is an element. */
function focusIs(expected, message = 'focus') {
  const active = document.activeElement
  const ok = typeof expected === 'string' ? label(active) === expected : active === expected
  assert.ok(
    ok,
    `${message}: focus is on ${describeNode(active)}, expected ${typeof expected === 'string' ? `"${expected}"` : describeNode(expected)}`
  )
}

function press(key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  lib.act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  })
  return event
}

test('opening the menu focuses its first item', () => {
  mountMenu()
  click(trigger())
  focusIs('One')
})

test('ArrowDown and ArrowUp move between enabled items and wrap at both ends', () => {
  mountMenu()
  click(trigger())
  const down = press('ArrowDown')
  assert.equal(down.defaultPrevented, true, 'the arrow also scrolled the page')
  focusIs('Three', 'the disabled row was not skipped')
  press('ArrowDown')
  focusIs('Look')
  press('ArrowDown')
  focusIs('Four')
  press('ArrowDown')
  focusIs('One', 'ArrowDown did not wrap')
  press('ArrowUp')
  focusIs('Four', 'ArrowUp did not wrap')
})

test('Home and End jump to the first and last item', () => {
  mountMenu()
  click(trigger())
  press('End')
  focusIs('Four')
  press('Home')
  focusIs('One')
})

test('ArrowDown on the closed trigger opens the menu on its first item, ArrowUp on its last', () => {
  mountMenu()
  trigger().focus()
  press('ArrowDown')
  assert.equal(menus().length, 1)
  focusIs('One')
  press('Escape')
  focusIs(trigger())
  press('ArrowUp')
  focusIs('Four')
})

test('a submenu row says it opens a menu, and ArrowRight opens it on its first item', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  focusIs('Look')
  const row = document.activeElement
  assert.equal(row.getAttribute('aria-haspopup'), 'menu')
  assert.equal(row.getAttribute('aria-expanded'), 'false')
  press('ArrowRight')
  assert.equal(menus().length, 2, 'no side panel opened')
  assert.equal(row.getAttribute('aria-expanded'), 'true')
  assert.equal(row.getAttribute('aria-controls'), menus()[1].id)
  focusIs('Light')
})

test('submenu choices are radio items that say which one is checked', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('Enter')
  const rows = [...menus()[1].querySelectorAll('button')]
  assert.deepEqual(
    rows.map((row) => [label(row), row.getAttribute('role'), row.getAttribute('aria-checked')]),
    [
      ['Light', 'menuitemradio', 'true'],
      ['Dark', 'menuitemradio', 'false'],
      ['System', 'menuitemradio', 'false']
    ]
  )
  focusIs('Light', 'Enter on the submenu row did not open it')
})

test('arrows move inside the submenu only, and ArrowLeft goes back to its row', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  press('ArrowDown')
  focusIs('Dark')
  press('ArrowUp')
  press('ArrowUp')
  focusIs('System', 'the submenu did not wrap on its own items')
  const left = press('ArrowLeft')
  assert.equal(left.defaultPrevented, true)
  assert.equal(menus().length, 1, 'the side panel stayed open')
  focusIs('Look')
})

test('Escape in the submenu closes only the submenu; the next Escape closes the menu', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  press('Escape')
  assert.equal(menus().length, 1)
  focusIs('Look')
  press('Escape')
  assert.equal(menus().length, 0)
  focusIs(trigger())
})

test('choosing a submenu row runs it and closes the whole menu', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  press('ArrowDown')
  click(document.activeElement)
  assert.deepEqual(chosen, ['dark'])
  assert.equal(menus().length, 0)
})

test('a pointer press inside the submenu is not a press outside the menu', () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  const inside = menus()[1].querySelector('button')
  lib.act(() => {
    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  assert.equal(menus().length, 2, 'the menu closed under the pointer')
})

test('Tab closes the menu without choosing, and leaves the press to the browser from the trigger', () => {
  mountMenu()
  click(trigger())
  press('ArrowDown')
  const tab = press('Tab')
  assert.equal(tab.defaultPrevented, false, 'the menu kept Tab from moving focus on')
  assert.equal(menus().length, 0)
  assert.deepEqual(chosen, [])
  focusIs(trigger(), 'Tab did not continue from the trigger')
})

test('a row can close the menu itself through the render-prop children', () => {
  mountMenu()
  click(trigger())
  press('End')
  // Enter on a button is the browser's click; jsdom does not synthesise it, so click.
  click(document.activeElement)
  assert.deepEqual(chosen, ['four'])
  assert.equal(menus().length, 0)
})

test('a panel with no menu items (a form) keeps its keys and its focus', () => {
  const { createElement: h } = lib
  mountMenu(h('textarea', { id: 'field' }))
  click(trigger())
  assert.equal(
    menus()[0].contains(document.activeElement),
    false,
    'focus moved into a panel that has no item to land on'
  )
  document.getElementById('field').focus()
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Tab', 'ArrowLeft']) {
    const event = press(key)
    assert.equal(event.defaultPrevented, false, key)
  }
  assert.equal(menus().length, 1, 'a key typed in the form closed the panel')
})

/** Rest the pointer on `element`, as a pointer arriving from the page does. */
const point = (element) =>
  lib.act(() => {
    element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: document.body }))
  })
const rowNamed = (text) =>
  [...document.querySelectorAll('[role^="menuitem"]')].find((r) => label(r).startsWith(text))

/** Fake `setTimeout` for one test: the side panel's grace period runs on it. */
function fakeTimers(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  return (ms) => lib.act(() => t.mock.timers.tick(ms))
}

test('pointing at the submenu row opens it; resting on another row puts it away after a moment', (t) => {
  const tick = fakeTimers(t)
  mountMenu()
  click(trigger())
  point(rowNamed('Look'))
  assert.equal(menus().length, 2, 'resting the pointer on the row did not open its side panel')
  focusIs('One', 'pointing moved focus')
  point(rowNamed('Three'))
  assert.equal(menus().length, 2, 'crossing another row closed the side panel at once')
  tick(300)
  assert.equal(menus().length, 1, 'resting on another row left the side panel open')
})

test('a pointer that crosses another row on its way into the side panel keeps it open', (t) => {
  const tick = fakeTimers(t)
  mountMenu()
  click(trigger())
  point(rowNamed('Look'))
  point(rowNamed('Three'))
  tick(100)
  point(rowNamed('Dark'))
  tick(500)
  assert.equal(menus().length, 2, 'the side panel closed under the pointer')
})

test('a pointer that comes back to the submenu row keeps the side panel open', (t) => {
  const tick = fakeTimers(t)
  mountMenu()
  click(trigger())
  point(rowNamed('Look'))
  point(rowNamed('Three'))
  tick(100)
  point(rowNamed('Look'))
  tick(500)
  assert.equal(menus().length, 2, 'the side panel closed though the pointer came back')
})

test('opening a menu whose rows are a choice focuses the checked row, not the first', () => {
  const { createElement: h } = lib
  const { PopoverItem } = lib
  mountMenu([
    h(PopoverItem, { key: 'a', selected: false }, 'All'),
    h(PopoverItem, { key: 'b', selected: true }, 'Mine'),
    h(PopoverItem, { key: 'c', selected: false }, 'Others')
  ])
  click(trigger())
  focusIs('Mine')
})

test('a submenu opens on its checked row', () => {
  const { createElement: h, PopoverItem, PopoverSubmenu } = lib
  mountMenu([
    h(
      PopoverSubmenu,
      { key: 'look', label: 'Look' },
      h(PopoverItem, { selected: false }, 'Light'),
      h(PopoverItem, { selected: true }, 'Dark'),
      h(PopoverItem, { selected: false }, 'System')
    )
  ])
  click(trigger())
  focusIs('Look')
  press('ArrowRight')
  focusIs('Dark')
})

/**
 * Wait for the frame after a choice: focus goes back to the button once the row is gone. Not an
 * async `act`: from a bundle it leaves a MessageChannel open that keeps the process alive
 * (`error-next-step.test.mjs`), and moving focus is no React update.
 */
const nextFrame = () =>
  new Promise((resolve) => window.requestAnimationFrame(() => setTimeout(() => setTimeout(resolve, 0), 0)))

test('choosing a row from the keyboard gives focus back to the button, not to the page', async () => {
  mountMenu()
  click(trigger())
  focusIs('One')
  click(document.activeElement)
  assert.deepEqual(chosen, ['one'])
  assert.equal(menus().length, 0)
  await nextFrame()
  focusIs(trigger(), 'focus fell to the page when the chosen row left it')
})

test('choosing a submenu row from the keyboard gives focus back to the button', async () => {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  click(document.activeElement)
  assert.equal(menus().length, 0)
  await nextFrame()
  focusIs(trigger())
})

test('a row whose action focuses something else (a dialog) keeps that focus', async () => {
  const { createElement: h, PopoverItem } = lib
  const field = document.createElement('input')
  field.id = 'dialog-field'
  // The dialog takes focus after the click, as a dialog mounted by the row's action does.
  const openDialog = () => {
    queueMicrotask(() => {
      document.body.append(field)
      field.focus()
    })
  }
  mountMenu([h(PopoverItem, { key: 's', onClick: openDialog }, 'Settings')])
  click(trigger())
  focusIs('Settings')
  click(document.activeElement)
  await nextFrame()
  focusIs(field, 'the menu took focus back from the dialog')
})

test('a pointer press outside closes the menu without moving focus to the button', async () => {
  mountMenu()
  const outside = document.createElement('input')
  document.body.append(outside)
  click(trigger())
  lib.act(() => {
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    outside.focus()
  })
  assert.equal(menus().length, 0)
  await nextFrame()
  focusIs(outside)
})

/**
 * Lay the page out by hand (jsdom has no layout): a 280px menu at x 8–288 whose "Look" row spans
 * y 400–432, and a 176×112 side panel. Restored when the test ends.
 */
function layOut(t, { width, height }) {
  const ROW = { left: 12, right: 284, top: 400, bottom: 432 }
  const MENU = { left: 8, right: 288, top: 300, bottom: 560 }
  const SIDE = { width: 176, height: 112 }
  const isSide = (el) =>
    el.getAttribute('role') === 'menu' &&
    el.id !== '' &&
    document.querySelector(`[role="menuitem"][aria-controls="${el.id}"]`) !== null
  const rect = ({ left, right, top, bottom }) => ({
    left,
    right,
    top,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON() {}
  })
  const proto = window.Element.prototype
  const html = window.HTMLElement.prototype
  const saved = {
    rect: proto.getBoundingClientRect,
    ow: Object.getOwnPropertyDescriptor(html, 'offsetWidth'),
    oh: Object.getOwnPropertyDescriptor(html, 'offsetHeight'),
    iw: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
    ih: Object.getOwnPropertyDescriptor(window, 'innerHeight')
  }
  proto.getBoundingClientRect = function () {
    if (this.getAttribute('role') === 'menuitem' && this.getAttribute('aria-haspopup') === 'menu')
      return rect(ROW)
    if (this.getAttribute('role') === 'menu' && !isSide(this)) return rect(MENU)
    return rect({ left: 0, right: 0, top: 0, bottom: 0 })
  }
  Object.defineProperty(html, 'offsetWidth', {
    configurable: true,
    get() {
      return isSide(this) ? SIDE.width : 0
    }
  })
  Object.defineProperty(html, 'offsetHeight', {
    configurable: true,
    get() {
      return isSide(this) ? SIDE.height : 0
    }
  })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  t.after(() => {
    proto.getBoundingClientRect = saved.rect
    for (const [target, name, d] of [
      [html, 'offsetWidth', saved.ow],
      [html, 'offsetHeight', saved.oh],
      [window, 'innerWidth', saved.iw],
      [window, 'innerHeight', saved.ih]
    ]) {
      if (d) Object.defineProperty(target, name, d)
      else delete target[name]
    }
  })
  return { ROW, SIDE }
}

/** Open the "Look" submenu from the keyboard and read where its side panel was put. */
function openLookAndRead() {
  mountMenu()
  click(trigger())
  press('End')
  press('ArrowUp')
  press('ArrowRight')
  const side = menus()[1]
  assert.ok(side, 'no side panel opened')
  return { left: parseFloat(side.style.left), top: parseFloat(side.style.top) }
}

test('the side panel opens to the right of the menu when it fits there', (t) => {
  layOut(t, { width: 1280, height: 800 })
  const spot = openLookAndRead()
  assert.equal(spot.left, 288 + 4, 'not beside the right edge of the menu')
})

test('on a phone width where neither side fits, the side panel opens below its row, not over it', (t) => {
  const { ROW, SIDE } = layOut(t, { width: 360, height: 740 })
  const spot = openLookAndRead()
  const box = {
    left: spot.left,
    right: spot.left + SIDE.width,
    top: spot.top,
    bottom: spot.top + SIDE.height
  }
  const overRow = box.left < ROW.right && box.right > ROW.left && box.top < ROW.bottom && box.bottom > ROW.top
  assert.equal(
    overRow,
    false,
    `the side panel ${JSON.stringify(box)} covers its own row ${JSON.stringify(ROW)}`
  )
  assert.ok(
    box.top >= ROW.bottom,
    `the side panel starts at y ${box.top}, above the row's foot ${ROW.bottom}`
  )
  assert.ok(
    box.left >= 8 && box.right <= 360 - 8,
    `the side panel ${JSON.stringify(box)} leaves the viewport`
  )
  assert.ok(box.bottom <= 740 - 8, `the side panel ${JSON.stringify(box)} leaves the viewport`)
})
