/**
 * Escape and the self-placing menu (`src/site-tabs/Popover.tsx`), issue #807.
 *
 * The menu is portalled to `document.body` and listens on the document, and so does whatever dialog
 * it was opened from (Settings does). One press of Escape must close ONE layer: the menu, which then
 * hands focus back to its trigger; the dialog hears the next press. Before the fix both listeners
 * heard the same press and both layers closed.
 *
 * The component is bundled by esbuild and mounted with React into jsdom; events are real DOM events
 * dispatched on the focused element. jsdom is not a dependency of this package: it is resolved from
 * `vendor/tracy/dsh-better-sidebar` or the dsh submodule, both workspace members that declare it.
 * What jsdom does not do is lay out: the placement maths runs on zero-sized rectangles here and is
 * not what this file measures.
 *
 *   node --test packages/core/tracy-core/test/popover-escape.test.mjs
 */
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
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
/** A second copy of the same bundle: its own module state, as another plugin's client carries. */
/** @type {any} */
let otherLib
/** @type {any} */
let dom
/** Every `keydown` listener the document holds right now, as `{listener, capture}`. */
const keydownListeners = new Set()

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'KeyboardEvent', 'MouseEvent', 'Event']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  // Count what the component registers, so a leak is a number rather than a suspicion.
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

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'popover-escape-'))
  const outfile = path.join(outDir, 'popover.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { Popover, PopoverItem } from './Popover'
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
  const second = path.join(outDir, 'popover-other-bundle.cjs')
  copyFileSync(outfile, second)
  otherLib = require(second)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

/** Mounted roots of the running test, unmounted afterwards so one test cannot leak into the next. */
const mounted = []

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    lib.act(() => root.unmount())
    host.remove()
  }
  document.body.replaceChildren()
})

/** Mount `count` independent menus, each behind its own button `#trigger-<n>`. */
function mountMenus(count = 1) {
  const { createElement: h, act, createRoot, Popover, PopoverItem } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => {
    root.render(
      h(
        'div',
        null,
        Array.from({ length: count }, (_, index) =>
          h(
            Popover,
            {
              key: index,
              trigger: (props) =>
                h('button', { type: 'button', id: `trigger-${index}`, ...props }, `Menu ${index}`)
            },
            h(PopoverItem, { onClick: () => {} }, `Item ${index}`)
          )
        )
      )
    )
  })
  const entry = { root, host }
  mounted.push(entry)
  return entry
}

const trigger = (index = 0) => document.getElementById(`trigger-${index}`)
const menus = () => [...document.querySelectorAll('[role="menu"]')]
const click = (element) => lib.act(() => element.click())

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

/**
 * Press a key on whatever holds focus.
 * @returns {KeyboardEvent} the event, after dispatch
 */
function press(key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  lib.act(() => {
    ;(document.activeElement ?? document.body).dispatchEvent(event)
  })
  return event
}

/**
 * A listener registered the way a surrounding dialog registers its own: on the document, in the
 * bubble phase, before the menu opens.
 */
function parentListener() {
  const heard = []
  const listener = (event) => {
    if (event.key === 'Escape') heard.push(event.defaultPrevented)
  }
  document.addEventListener('keydown', listener)
  return { heard, stop: () => document.removeEventListener('keydown', listener) }
}

test('the menu is portalled to the body, outside the element that opened it', () => {
  const { host } = mountMenus()
  click(trigger())
  assert.equal(menus().length, 1)
  assert.equal(host.contains(menus()[0]), false)
  assert.equal(trigger().getAttribute('aria-expanded'), 'true')
  assert.equal(trigger().getAttribute('aria-controls'), menus()[0].id)
})

test('Escape closes the open menu, keeps the press from a parent listener, and returns focus to the trigger', () => {
  const parent = parentListener()
  try {
    mountMenus()
    click(trigger())
    menus()[0].querySelector('button').focus()

    const first = press('Escape')
    assert.equal(menus().length, 0, 'the menu is still open')
    assert.equal(first.defaultPrevented, true, 'the press was not consumed')
    assert.deepEqual(parent.heard, [], 'a parent listener heard the press that closed the menu')
    focusIs(trigger(), 'focus did not return to the trigger')
    assert.equal(trigger().getAttribute('aria-expanded'), 'false')

    const second = press('Escape')
    assert.equal(second.defaultPrevented, false, 'a closed menu consumed a press that is not its own')
    assert.deepEqual(parent.heard, [false], 'the parent did not hear the next press')
  } finally {
    parent.stop()
  }
})

test('Escape from the body, with nothing focused, still belongs to the open menu', () => {
  const parent = parentListener()
  try {
    mountMenus()
    click(trigger())
    document.body.focus()
    press('Escape')
    assert.equal(menus().length, 0)
    assert.deepEqual(parent.heard, [])
  } finally {
    parent.stop()
  }
})

// The arrows, Home/End and Tab are the menu's own since the account menu (popover-keyboard.test.mjs).
test('other keys pass through an open menu untouched', () => {
  mountMenus()
  click(trigger())
  for (const key of ['Enter', 'a', 'Shift']) {
    const event = press(key)
    assert.equal(event.defaultPrevented, false, key)
  }
  assert.equal(menus().length, 1)
})

test('a press something else already consumed is left alone', () => {
  mountMenus()
  click(trigger())
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  event.preventDefault()
  lib.act(() => {
    document.body.dispatchEvent(event)
  })
  assert.equal(menus().length, 1, 'the menu closed on a press that was not its own')
})

test('two open menus: one press closes the one opened last, the next press the other', () => {
  const parent = parentListener()
  try {
    mountMenus(2)
    // `click()` sends no pointerdown, which is how a keyboard opens the second menu beside the first.
    click(trigger(0))
    click(trigger(1))
    assert.equal(menus().length, 2)

    press('Escape')
    assert.equal(menus().length, 1, 'one press closed both menus, or neither')
    assert.equal(trigger(0).getAttribute('aria-expanded'), 'true', 'the older menu closed first')
    assert.equal(trigger(1).getAttribute('aria-expanded'), 'false')
    focusIs(trigger(1))

    press('Escape')
    assert.equal(menus().length, 0)
    focusIs(trigger(0))
    assert.deepEqual(parent.heard, [], 'the parent heard a press that closed a menu')

    press('Escape')
    assert.deepEqual(parent.heard, [false])
  } finally {
    parent.stop()
  }
})

test('two menus from two separate bundles: the one opened last still closes first', () => {
  assert.ok(otherLib.Popover !== lib.Popover, 'this case needs two copies of the module')
  /** Mount one menu from `from`, behind `#bundle-<name>`. */
  const mountFrom = (from, name) => {
    const { createElement: h, act, createRoot, Popover, PopoverItem } = from
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        h(
          Popover,
          { trigger: (props) => h('button', { type: 'button', id: `bundle-${name}`, ...props }, name) },
          h(PopoverItem, { onClick: () => {} }, `Item ${name}`)
        )
      )
    })
    // `afterEach` unmounts with the first bundle's `act`; this root belongs to its own React.
    mounted.push({ root: { unmount: () => from.act(() => root.unmount()) }, host })
  }
  /** One press, flushed in both Reacts. */
  const pressBoth = (key) => {
    let event
    otherLib.act(() => {
      event = press(key)
    })
    return event
  }
  const button = (name) => document.getElementById(`bundle-${name}`)

  for (const [first, second] of [
    [lib, otherLib],
    [otherLib, lib]
  ]) {
    const parent = parentListener()
    try {
      mountFrom(first, 'older')
      mountFrom(second, 'newer')
      // The older menu's listener is registered first, so it hears every press first.
      first.act(() => button('older').click())
      second.act(() => button('newer').click())
      assert.equal(menus().length, 2)

      pressBoth('Escape')
      assert.equal(button('older').getAttribute('aria-expanded'), 'true', 'the older menu closed first')
      assert.equal(button('newer').getAttribute('aria-expanded'), 'false', 'the newer menu stayed open')
      focusIs(button('newer'))

      pressBoth('Escape')
      assert.equal(menus().length, 0)
      focusIs(button('older'))
      assert.deepEqual(parent.heard, [], 'the parent heard a press that closed a menu')

      pressBoth('Escape')
      assert.deepEqual(parent.heard, [false])
    } finally {
      parent.stop()
      for (const { root, host } of mounted.splice(0)) {
        root.unmount()
        host.remove()
      }
    }
  }
})

test('a trigger that left the document is not focused when its menu closes', () => {
  mountMenus()
  click(trigger())
  const detached = trigger()
  let focused = 0
  detached.addEventListener('focus', () => focused++)
  // The side card switched panes under the menu: the trigger is gone, React still holds the menu.
  detached.parentElement.remove()
  assert.doesNotThrow(() => press('Escape'))
  assert.equal(focused, 0, 'focus was written to a node that is no longer in the document')
  focusIs(document.body)
})

test('a trigger that carries no menu-button props is closed without a focus write', () => {
  const { createElement: h, act, createRoot, Popover, PopoverItem } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  mounted.push({ root, host })
  act(() => {
    root.render(
      h(
        Popover,
        { trigger: (props) => h('button', { type: 'button', id: 'bare', onClick: props.onClick }, 'Bare') },
        h(PopoverItem, null, 'Item')
      )
    )
  })
  click(document.getElementById('bare'))
  assert.equal(menus().length, 1)
  assert.doesNotThrow(() => press('Escape'))
  assert.equal(menus().length, 0)
})

test('unmounting an open menu removes its listener: a later Escape reaches the parent', () => {
  const parent = parentListener()
  try {
    const before = keydownListeners.size
    const entry = mountMenus()
    click(trigger())
    assert.equal(keydownListeners.size, before + 1)
    lib.act(() => entry.root.unmount())
    assert.equal(keydownListeners.size, before, 'the menu left a keydown listener behind')
    const event = press('Escape')
    assert.equal(event.defaultPrevented, false)
    assert.deepEqual(parent.heard, [false])
  } finally {
    parent.stop()
  }
})

test('opening and closing repeatedly holds one listener while open and none while closed', () => {
  mountMenus()
  const idle = keydownListeners.size
  for (let round = 0; round < 4; round++) {
    click(trigger())
    assert.equal(keydownListeners.size, idle + 1, `round ${round}: while open`)
    press('Escape')
    assert.equal(keydownListeners.size, idle, `round ${round}: after closing`)
    assert.equal(menus().length, 0)
  }
  // Closed by its own trigger instead of the keyboard: same count.
  click(trigger())
  click(trigger())
  assert.equal(keydownListeners.size, idle)
})
