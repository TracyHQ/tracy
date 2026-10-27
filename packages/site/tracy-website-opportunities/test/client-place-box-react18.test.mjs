/**
 * The Find box on React 18, the React dsh's page runs (18.3.1): when the suggestions open, focus
 * stays in the text field and the list is a `listbox`, so typing, ↓ and Enter keep working.
 *
 * React 18 drops a `ref` given to a function component without `forwardRef`. If the field Base UI
 * renders is such a component, Base UI never learns which element is the input, takes the popup for
 * a dialog with its own input (`role="dialog"`) and moves focus into it: the stand measured the
 * typed characters going nowhere (tasks/evidence-wo-find-autocomplete/ux-stand-wo2.md, F1). React 19
 * passes `ref` as a prop and hides the bug, so this file bundles the real component with React 18
 * from the pnpm store and mounts it in jsdom.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-place-box-react18.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

/** `<store>/<prefix>…/node_modules/<name>`; the first match, or a failure that names what is missing. */
function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

const REACT = fromStore('react@18.3.1', 'react')
const REACT_DOM = fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom

let pendingScheduler
before(async () => {
  // React's unreferenced MessageChannel still needs a live event loop while act settles.
  pendingScheduler = setInterval(() => {}, 1000)
  const { JSDOM } = createRequire(path.join(fromStore('jsdom@', 'jsdom'), 'package.json'))('jsdom')
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'KeyboardEvent',
    'MouseEvent',
    'FocusEvent',
    'Event',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame'
  ]) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  }
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  for (const target of [globalThis, window]) target.ResizeObserver ??= ResizeObserver
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // React 18's async `act` queues through a MessageChannel when bundled; its port would keep the run alive.
  const Channel = globalThis.MessageChannel
  globalThis.MessageChannel = class extends Channel {
    constructor() {
      super()
      queueMicrotask(() => this.port1.unref())
    }
  }

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-place-box-'))
  const outfile = path.join(outDir, 'place-box.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, createRef, act, version } from 'react'
        export { createRoot } from 'react-dom/client'
        export { PlaceBox } from './place-box.tsx'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    // Every importer (the plugin, @tracy/ui, Base UI) gets the one React 18.
    alias: { react: REACT, 'react-dom': REACT_DOM },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  clearInterval(pendingScheduler)
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const SUGGESTIONS = [
  {
    placeId: 'ChIJdn',
    text: 'Da Nang, Vietnam',
    mainText: 'Da Nang',
    secondaryText: 'Vietnam',
    types: ['locality']
  },
  {
    placeId: 'ChIJhc',
    text: 'Hai Chau, Da Nang',
    mainText: 'Hai Chau',
    secondaryText: 'Da Nang',
    types: ['sublocality']
  }
]

/** A node in a failure message: jsdom nodes must never reach assert's own diff (it walks the window). */
const describe = (el) =>
  el
    ? `<${el.tagName.toLowerCase()}${el.id ? ` id=${el.id}` : ''} role=${el.getAttribute('role')}>`
    : 'nothing'

const frames = (n = 4) => lib.act(() => new Promise((r) => setTimeout(r, n * 20)))

test('the bundle runs React 18', () => {
  assert.match(lib.version, /^18\./)
})

test('the suggestions open under the field: focus stays in it, the list is a listbox, not a dialog', async () => {
  const { createElement: h, createRef, act, createRoot, PlaceBox } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const anchor = createRef()
  const props = {
    id: 'place',
    placeholder: 'A city or an address',
    listLabel: 'Suggested places',
    anchor,
    text: 'da n',
    suggestions: [],
    open: false,
    onOpenChange: () => {},
    onType: () => {},
    onPick: () => {}
  }
  // Unmounted even on failure: a popup left open keeps Base UI's focus guards running and the run never ends.
  try {
    act(() => root.render(h(PlaceBox, props)))
    const input = document.getElementById('place')
    assert.equal(input instanceof window.HTMLInputElement, true, 'the field is a real <input>')
    act(() => input.focus())
    assert.equal(describe(document.activeElement), describe(input))

    act(() => root.render(h(PlaceBox, { ...props, suggestions: SUGGESTIONS, open: true })))
    await frames()

    const list = document.querySelector('[aria-label="Suggested places"]')
    assert.equal(list !== null, true, 'the list is open')
    assert.equal(
      describe(document.querySelector('[role="dialog"]')),
      'nothing',
      'no part of the popup is a dialog'
    )
    assert.equal(list.getAttribute('role'), 'listbox')
    assert.equal(describe(document.activeElement), describe(input), 'focus stays in the field')
    assert.equal(input.getAttribute('role'), 'combobox')
    assert.equal(input.getAttribute('aria-expanded'), 'true')
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})

test('the list never scrolls sideways, a highlighted row shows, and no empty addon pads the field', async () => {
  const { createElement: h, createRef, act, createRoot, PlaceBox } = lib
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const props = {
    id: 'place2',
    placeholder: '',
    listLabel: 'Suggested places',
    anchor: createRef(),
    text: 'da n',
    suggestions: SUGGESTIONS,
    open: true,
    onOpenChange: () => {},
    onType: () => {},
    onPick: () => {}
  }
  try {
    act(() => root.render(h(PlaceBox, props)))
    await frames()
    const list = document.querySelector('[aria-label="Suggested places"]')
    assert.match(list.className, /\boverflow-x-hidden\b/)
    const item = list.querySelector('[data-slot="combobox-item"]')
    const classes = item.className.split(/\s+/)
    // No check mark is ever drawn (nothing stays selected), so no room is kept for one.
    assert.equal(classes.includes('pr-8'), false)
    // dsh paints --accent, --muted and --popover with one colour: the highlight is a mix of the text colour.
    assert.equal(classes.includes('data-highlighted:bg-accent'), false)
    assert.equal(classes.includes('data-highlighted:bg-foreground/6'), true)
    // The combobox's own end addon (trigger and clear both off) is empty; the field hides it.
    const group = document.getElementById('place2').closest('[data-slot="input-group"]')
    assert.match(group.className, /\[&>\[data-slot=input-group-addon\]:empty\]:hidden/)
    assert.equal(group.querySelectorAll('[data-slot="input-group-addon"]:empty').length, 1)
  } finally {
    act(() => root.unmount())
    host.remove()
  }
})
