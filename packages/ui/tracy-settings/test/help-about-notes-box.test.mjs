/**
 * The What's new box keeps its height cap once mounted (follow-up to #1097).
 *
 * The box measures its text in a layout effect: it sets `height: auto`, reads `scrollHeight`, then
 * puts the inline height back. Measured on dev (10/10/2026): with long notes the box opened at the
 * stylesheet's 480px ceiling instead of 150px, because the effect cleared the inline height React had
 * already written, and the state it then set (150, the cap) equalled the state it started from, so
 * React never wrote it again. The pure helper's test could not see that; this file mounts the real
 * view with React into jsdom.
 *
 * jsdom lays nothing out, so `scrollHeight` is given per case: what the text needs while the box has
 * no fixed height. Whether a browser measures the same is the regression case's claim, not this file's.
 *
 *   node --test packages/ui/tracy-settings/test/help-about-notes-box.test.mjs
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
/** What the notes need, in px, while the box has no fixed height. */
let needed = 0

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['document', 'Node', 'HTMLElement', 'Event']) {
    Object.defineProperty(globalThis, name, { value: window[name], configurable: true })
  }
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // A box with no fixed height is as tall as its text; a fixed one reports at least its height.
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (!this.classList.contains('ts-help-notes-box')) return 0
      const fixed = Number.parseFloat(this.style.height)
      return Number.isFinite(fixed) ? Math.max(fixed, needed) : needed
    }
  })

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'ts-notes-'))
  const outfile = path.join(outDir, 'notes.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { HelpAboutView, HelpAboutSection } from './help-about-section'
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
})

const t = (key, params) =>
  (lib.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) =>
    params && name in params ? String(params[name]) : m
  )

/** The app surface with a downloaded version waiting and these notes. */
const surface = (releaseNotes) => ({
  kind: 'app',
  info: { protocolVersion: 1, version: '0.3.0', arch: 'arm64', channel: 'dev', updates: true },
  state: {
    revision: 1,
    status: 'downloaded',
    version: '0.4.0',
    percent: null,
    releaseNotes,
    lastCheckedAt: null,
    nextRetryAt: null,
    autoCheck: true
  },
  saveFailed: false
})

/** Mount the view, then hand back the notes box. */
function mountBox(notes) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  const props = {
    t,
    locale: 'en',
    now: Date.UTC(2026, 9, 10, 12, 0, 0),
    build: null,
    surface: surface(notes),
    onAction: () => {},
    onToggle: () => {},
    onOpen: () => {}
  }
  lib.act(() => root.render(lib.createElement(lib.HelpAboutView, props)))
  const box = host.querySelector('.ts-help-notes-box')
  assert.ok(box, 'the notes box is rendered')
  return box
}

test('long notes: the box stays at the 150px cap after it measures them', () => {
  needed = 820
  const box = mountBox(Array.from({ length: 40 }, (_, i) => `- Change ${i + 1}`).join('\n'))
  assert.equal(box.style.height, '150px')
})

test('short notes: the box has no fixed height, so it is as tall as its text', () => {
  needed = 60
  const box = mountBox('- One\n- Two')
  assert.equal(box.style.height, '')
})

// ── the section, wired to the app: What's new is marked seen when it is on screen ─────────────────

/** An update source like desktop-updates.ts's, driven by the test. */
function fakeSource(initial) {
  const listeners = new Set()
  let snapshot = {
    info: {
      protocolVersion: 3,
      version: '0.6.0',
      arch: 'arm64',
      channel: 'stable',
      updates: true,
      installMode: 'quit',
      releaseNotes: 'Highlights\n- one',
      notesPage: '0.6'
    },
    state: initial,
    saveFailed: false,
    notifySaveFailed: false
  }
  const source = {
    calls: [],
    present: true,
    canOpenChangelog: true,
    getSnapshot: () => snapshot,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    start: () => () => {},
    act: async () => {},
    setAutoCheck: async () => true,
    seen: async () => {
      source.calls.push('seen')
    },
    setNotify: async (on) => {
      source.calls.push(`notify:${on}`)
      return true
    },
    openChangelog: async () => {
      source.calls.push('changelog')
    },
    onOpenHelp: () => () => {},
    /** The app pushes a new state. */
    push(state) {
      snapshot = { ...snapshot, state }
      lib.act(() => {
        for (const fn of listeners) fn()
      })
    }
  }
  return source
}

const current = (over = {}) => ({
  revision: 1,
  status: 'current',
  version: null,
  percent: null,
  releaseNotes: null,
  lastCheckedAt: Date.UTC(2026, 9, 11, 9, 0, 0),
  nextRetryAt: null,
  autoCheck: true,
  showWhatsNew: true,
  ...over
})
const PENDING = { pending: true, from: '0.5.1', to: '0.6.0', page: '0.6' }

function mountSection(source) {
  // The section reads `GET /api/build`; there is no server here, so the read fails the way a
  // signed-out page's does.
  globalThis.fetch = async () => {
    throw new TypeError('no server in this test')
  }
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  lib.act(() => root.render(lib.createElement(lib.HelpAboutSection, { t, updates: source })))
  return host
}

/**
 * Let the effects' promises settle. Not through an async `act`: bundled, React's async act falls back
 * to a MessageChannel whose ports keep the test process alive. Effects run inside the sync `act` of
 * each mount and push, so every call the assertions count has been made by then.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('What’s new pending: shown once, marked seen once — and again only when it is pending again', async () => {
  const source = fakeSource(current({ whatsNew: PENDING }))
  mountSection(source)
  await settle()
  assert.deepEqual(source.calls, ['seen'])
  // Another state while still pending (the app has not answered yet): no second call.
  source.push(current({ revision: 2, whatsNew: PENDING, lastCheckedAt: Date.UTC(2026, 9, 11, 10) }))
  await settle()
  assert.deepEqual(source.calls, ['seen'])
  source.push(current({ revision: 3, whatsNew: { ...PENDING, pending: false } }))
  await settle()
  source.push(current({ revision: 4, whatsNew: { pending: true, from: '0.6.0', to: '0.7.0', page: '0.7' } }))
  await settle()
  assert.deepEqual(source.calls, ['seen', 'seen'])
})

test('nothing pending, or an app without What’s new: seen is never called', async () => {
  const quiet = fakeSource(current({ whatsNew: { ...PENDING, pending: false } }))
  mountSection(quiet)
  const old = fakeSource(current({ showWhatsNew: undefined }))
  mountSection(old)
  await settle()
  assert.deepEqual(quiet.calls, [])
  assert.deepEqual(old.calls, [])
})

test('a window in the background is not "seen": the call waits until it is shown', async () => {
  let visibility = 'hidden'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  try {
    const source = fakeSource(current({ whatsNew: PENDING }))
    mountSection(source)
    await settle()
    assert.deepEqual(source.calls, [])
    visibility = 'visible'
    lib.act(() => {
      document.dispatchEvent(new window.Event('visibilitychange'))
    })
    await settle()
    assert.deepEqual(source.calls, ['seen'])
  } finally {
    delete document.visibilityState
  }
})

test('Full changelog goes to the app while update preferences stay hidden', async () => {
  const source = fakeSource(current())
  const host = mountSection(source)
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Full changelog')
  assert.ok(button, 'a Full changelog button')
  lib.act(() => button.click())
  const switches = host.querySelectorAll('[role="switch"]')
  assert.equal(switches.length, 0)
  await settle()
  assert.deepEqual(source.calls, ['changelog'])
})
