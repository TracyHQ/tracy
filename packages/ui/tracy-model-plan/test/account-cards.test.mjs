/**
 * The shared AI-account cards and connect panel (`src/client/account-cards/AccountCards.tsx`,
 * exported as `@tracy/dsh-model-plan/account-cards`): Settings › AI accounts and the Getting started
 * screen draw the same parts from it, each binding its own translated labels. Pure React: no locale,
 * no fetch; everything arrives through props, so this test hands it English labels and reads the
 * markup back.
 *
 *   node --test packages/ui/tracy-model-plan/test/account-cards.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const clientDir = path.join(here, '..', 'src', 'client', 'account-cards')
const require = createRequire(import.meta.url)

/** jsdom, from a workspace member that declares it. */
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

const SOURCE = `
  import { createElement, act } from 'react'
  import { createRoot } from 'react-dom/client'
  import { renderToStaticMarkup } from 'react-dom/server'
  import { CardsGrid, ConnectPanel } from './index'
  export { act }
  export function grid(props) { return renderToStaticMarkup(createElement(CardsGrid, props)) }
  export function panel(props) { return renderToStaticMarkup(createElement(ConnectPanel, props)) }
  export function mountGrid(container, props) {
    const root = createRoot(container)
    act(() => root.render(createElement(CardsGrid, props)))
    return () => act(() => root.unmount())
  }
`

/** The labels Settings binds (brief-common § Labels); the Getting started screen binds the same words. */
const LABELS = {
  included: 'Included with your Tracy account',
  found: 'Found on this computer',
  popular: 'Popular',
  refresh: 'Refresh',
  showMore: (n) => `Show ${n} more →`,
  showLess: 'Show fewer',
  badge: { default: 'Default', connected: 'Connected', included: 'Included' },
  picked: 'Selected'
}

const TRACY = { id: 'tracy', name: 'Tracy AI', builtin: true }
const CLAUDE = { id: 'claude', name: 'Claude', found: true }
const CODEX = { id: 'codex', name: 'ChatGPT Codex', found: true }
const COPILOT = { id: 'copilot', name: 'GitHub Copilot' }
const KIMI = { id: 'kimi', name: 'Kimi', keyVendor: true }

/** The grid's props with nothing picked, nothing badged, web mode. */
function gridProps(extra = {}) {
  return {
    labels: LABELS,
    tracy: TRACY,
    found: [CLAUDE, CODEX],
    more: [COPILOT, KIMI],
    scanning: false,
    expanded: false,
    onToggleMore: () => {},
    picked: null,
    onPick: () => {},
    badgeOf: () => null,
    mark: (id) => `<${id}>`,
    ...extra
  }
}

let outDir = ''
let file = ''
/** @type {any} */
let lib
/** @type {any} */
let JSDOM
/** @type {any} */
let dom

before(async () => {
  JSDOM = loadJsdom().JSDOM
  outDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'tracy-account-cards-')))
  file = path.join(outDir, 'cards.cjs')
  await require('esbuild').build({
    stdin: { contents: SOURCE, resolveDir: clientDir, loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile: file,
    logLevel: 'silent'
  })
  lib = require(file)
})

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'MouseEvent']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  dom?.window.close()
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** The text of the markup, tags stripped. */
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
/** The vendor ids of the cards, in markup order. */
const cards = (html) => [...html.matchAll(/data-agent="([^"]+)"/g)].map((m) => m[1])
/** One card's markup. */
function card(html, id) {
  const at = html.indexOf(`data-agent="${id}"`)
  assert.notEqual(at, -1, `card ${id}`)
  return html.slice(html.lastIndexOf('<button', at), html.indexOf('</button>', at))
}

test('the built-in card comes first, under "Included with your Tracy account"; then the found ones; the rest wait behind "Show N more"', () => {
  const html = lib.grid(gridProps({ scanning: true }))
  assert.deepEqual(cards(html), ['tracy', 'claude', 'codex'])
  const t = text(html)
  assert.ok(t.indexOf(LABELS.included) < t.indexOf('Tracy AI'))
  assert.ok(t.indexOf('Tracy AI') < t.indexOf(LABELS.found))
  assert.match(html, /Found on this computer<\/span><span class="tv-ob-count">2</)
  assert.match(html, /aria-expanded="false"[^>]*>Show 2 more →</)
  assert.doesNotMatch(html, /data-agent="copilot"/)
})

test('a desktop scan shows "Found on this computer" with Refresh; the web shows "Popular" with no Refresh and no count', () => {
  const desktop = lib.grid(gridProps({ scanning: true, onRefresh: () => {} }))
  assert.match(desktop, /tv-ob-count">2</, 'the count is the cards marked found')
  assert.match(
    lib.grid(gridProps({ scanning: true, found: [CLAUDE, COPILOT] })),
    /tv-ob-count">1</,
    'a connected card shown here is not counted'
  )
  assert.match(desktop, /tv-ob-text-btn[^>]*>.*?Refresh</)
  assert.doesNotMatch(desktop, /Popular/)
  const web = lib.grid(gridProps({ scanning: false, onRefresh: () => {} }))
  assert.match(web, />Popular</)
  assert.doesNotMatch(web, /Refresh/)
  assert.doesNotMatch(web, /Found on this computer/)
  assert.doesNotMatch(web, /tv-ob-count/)
})

test('the caller may say the count itself: a number shows as is, null hides the count, omitted = the cards marked found', () => {
  const given = lib.grid(gridProps({ scanning: true, count: 5 }))
  assert.match(given, /tv-ob-count">5</)
  const hidden = lib.grid(gridProps({ scanning: true, count: null, onRefresh: () => {} }))
  assert.doesNotMatch(hidden, /tv-ob-count/, 'an empty scan reads "Found on this computer Refresh", no 0')
  assert.match(hidden, /Refresh/)
  assert.match(lib.grid(gridProps({ scanning: true })), /tv-ob-count">2</)
  assert.match(
    lib.grid(gridProps({ scanning: false, count: 3 })),
    /Popular<\/span><span class="tv-ob-count">3</,
    'the caller’s count shows on the web too'
  )
})

test('a scan under way spins in the section head and Refresh waits', () => {
  const html = lib.grid(gridProps({ scanning: true, looking: true, onRefresh: () => {} }))
  assert.match(html, /tv-ob-section-head[^>]*><span class="tv-ob-spinner"/)
  assert.match(html, /tv-ob-text-btn[^>]*disabled=""/)
})

test('expanded: every vendor shows and the disclosure reads "Show fewer"', () => {
  const html = lib.grid(gridProps({ expanded: true }))
  assert.deepEqual(cards(html), ['tracy', 'claude', 'codex', 'copilot', 'kimi'])
  assert.match(html, /aria-expanded="true"[^>]*>Show fewer</)
})

test('no vendor behind the fold: no disclosure at all', () => {
  const html = lib.grid(gridProps({ more: [] }))
  assert.doesNotMatch(html, /tv-ob-disclosure/)
})

test('badges: Default is the plain badge, Connected and Included the muted one, none when the caller says null', () => {
  const badges = { claude: 'default', codex: 'connected', tracy: 'included' }
  const html = lib.grid(gridProps({ badgeOf: (id) => badges[id] ?? null, expanded: true }))
  assert.match(card(html, 'claude'), /<span class="tv-ob-badge" data-badge="default">Default<\/span>/)
  assert.match(
    card(html, 'codex'),
    /<span class="tv-ob-badge tv-ob-order" data-badge="connected">Connected<\/span>/
  )
  assert.match(
    card(html, 'tracy'),
    /<span class="tv-ob-badge tv-ob-order" data-badge="included">Included<\/span>/
  )
  assert.doesNotMatch(card(html, 'copilot'), /tv-ob-badge/)
})

test('the picked card is pressed and wears the check mark, named for a screen reader; the others are not', () => {
  const html = lib.grid(gridProps({ picked: 'codex' }))
  assert.match(card(html, 'codex'), /aria-pressed="true"/)
  assert.match(card(html, 'codex'), /<span class="tv-ob-check" aria-label="Selected"/)
  assert.match(card(html, 'claude'), /aria-pressed="false"/)
  assert.doesNotMatch(card(html, 'claude'), /tv-ob-check/)
  assert.doesNotMatch(card(html, 'tracy'), /tv-ob-check/)
})

test('each card wears the mark the caller supplies and names its vendor; a found vendor says so in data-found', () => {
  const html = lib.grid(gridProps({ scanning: true }))
  assert.match(card(html, 'claude'), /<span class="tv-ob-agent-icon">&lt;claude&gt;<\/span>/)
  assert.match(card(html, 'claude'), /<span class="tv-ob-agent-name">Claude<\/span>/)
  assert.match(card(html, 'claude'), /data-found="true"/)
  assert.match(card(html, 'tracy'), /data-found="false"/)
})

test('whatever the caller draws between the grid and the fold (the connect panel) lands there', () => {
  const html = lib.grid({ ...gridProps(), children: 'PANEL-HERE' })
  const t = text(html)
  assert.ok(t.indexOf('ChatGPT Codex') < t.indexOf('PANEL-HERE'), 'after the found grid')
  assert.ok(t.indexOf('PANEL-HERE') < t.indexOf('Show 2 more'), 'before the fold')
})

test('clicking a card picks it; the disclosure toggles; Refresh asks for a scan', () => {
  const picked = []
  let toggled = 0
  let refreshed = 0
  const container = document.createElement('div')
  document.body.append(container)
  const unmount = lib.mountGrid(
    container,
    gridProps({
      scanning: true,
      onPick: (id) => picked.push(id),
      onToggleMore: () => void (toggled += 1),
      onRefresh: () => void (refreshed += 1)
    })
  )
  const click = (el) => lib.act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  click(container.querySelector('[data-agent="codex"]'))
  click(container.querySelector('[data-agent="tracy"]'))
  assert.deepEqual(picked, ['codex', 'tracy'])
  click(container.querySelector('.tv-ob-disclosure'))
  assert.equal(toggled, 1)
  click(container.querySelector('.tv-ob-text-btn'))
  assert.equal(refreshed, 1)
  unmount()
})

test('the connect panel: title, line, the actions the caller renders, and what it draws under the row', () => {
  const html = lib.panel({
    state: 'idle',
    title: 'Connect Claude',
    line: 'Tracy works on your Claude plan. Sign in once in your browser.',
    actions: 'ACTIONS',
    children: 'UNDER'
  })
  assert.match(html, /class="tv-ob-connect" data-state="idle" data-connect="idle"/)
  assert.match(html, /<div class="tv-ob-connect-title">Connect Claude<\/div>/)
  assert.match(
    html,
    /<div class="tv-ob-connect-line">Tracy works on your Claude plan\. Sign in once in your browser\.<\/div>/
  )
  assert.match(html, /<div class="tv-ob-connect-actions">ACTIONS<\/div>/)
  assert.match(html, /<\/div>UNDER<\/div>$/)
  assert.doesNotMatch(lib.panel({ state: 'idle', title: 'T', line: 'L' }), /tv-ob-connect-actions/)
})

test('each panel state maps to the CSS state the stylesheet paints and carries a default icon', () => {
  const css = (state) =>
    lib.panel({ state, title: 'T', line: 'L' }).match(/data-state="([^"]+)" data-connect="([^"]+)"/)
  assert.deepEqual(css('idle').slice(1), ['idle', 'idle'])
  assert.deepEqual(css('pending').slice(1), ['pending', 'pending'])
  assert.deepEqual(css('device').slice(1), ['pending', 'device'])
  assert.deepEqual(css('error').slice(1), ['error', 'error'])
  assert.deepEqual(css('connected').slice(1), ['connected', 'connected'])
  assert.deepEqual(css('tracy').slice(1), ['connected', 'tracy'])
  assert.deepEqual(css('key').slice(1), ['idle', 'key'])
  for (const state of ['pending', 'device'])
    assert.match(
      lib.panel({ state, title: 'T', line: 'L' }),
      /tv-ob-connect-icon"><span class="tv-ob-spinner"/
    )
  for (const state of ['idle', 'error', 'connected', 'tracy', 'key'])
    assert.match(lib.panel({ state, title: 'T', line: 'L' }), /tv-ob-connect-icon"><svg/, state)
  assert.match(lib.panel({ state: 'idle', title: 'T', line: 'L', icon: 'MINE' }), /tv-ob-connect-icon">MINE</)
})

test('"off" is a plain note with the line, not a panel', () => {
  const html = lib.panel({ state: 'off', title: 'T', line: 'Connecting your own account is turned off.' })
  assert.equal(
    html,
    '<div class="tv-ob-note" data-connect="off">Connecting your own account is turned off.</div>'
  )
})
