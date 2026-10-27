/**
 * Settings › AI accounts (`src/client/AccountsPane.tsx`): the cards, the picked card's panel, the
 * Default and the fallbacks with Move up / Move down, against the seat-plan doors as tracy-web
 * answers them (`apps/tracy-web/src/seat-plan/broker.js`; the contract in the line's brief):
 *
 *   GET  /api/seat-plan/status            → {next, enabled, providers, connections, routing}
 *   PUT  /api/seat-plan/routing           {enabled, connectionOrder, expectedVersion} → the status
 *   POST /api/seat-plan/connect/start     {provider} → a browser or device sign-in
 *   POST /api/seat-plan/connect/complete  {attemptId, url} | {attemptId, state} → the status
 *   POST /api/seat-plan/connect/key       {provider, key} → the status
 *   POST /api/seat-plan/disconnect        {connectionId} → the status
 *
 * `routing.connectionOrder` holds connection ids and the literal `tracy` (Tracy AI) once: the first
 * entry that can answer is the Default, the rest are the fallbacks. The pane is bundled by esbuild
 * and mounted with React into jsdom, as `ai-accounts-row-first-open.test.mjs` does; the device
 * poll's clock is node's mocked `setTimeout`/`Date`. The sign-in cases are the ones the old
 * `account-device-sign-in`, `account-key-row` and `account-providers` tests held, on the new pane.
 *
 *   node --test packages/ui/tracy-model-plan/test/accounts-pane.test.mjs
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
const clientDir = path.join(here, '..', 'src', 'client')
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
  import { AccountsPane, fullOrder, activeOrder, swapped, asDefault, focusVendorCard, callbackAddressOf } from './AccountsPane'
  import { en } from './strings'
  const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
  export { act, en, t, fullOrder, activeOrder, swapped, asDefault, focusVendorCard, callbackAddressOf }
  export function mount(container, props = {}) {
    const root = createRoot(container)
    act(() => root.render(createElement(AccountsPane, { t, ...props })))
    return () => act(() => root.unmount())
  }
`

const PROVIDERS = [
  { id: 'claude', name: 'Claude', signIn: 'browser' },
  { id: 'codex', name: 'ChatGPT Codex', signIn: 'browser' },
  { id: 'copilot', name: 'GitHub Copilot', signIn: 'device' },
  { id: 'grok', name: 'Grok', signIn: 'browser' },
  { id: 'antigravity', name: 'Antigravity', signIn: 'browser' },
  { id: 'kimi', name: 'Kimi', signIn: 'key' },
  { id: 'glm', name: 'GLM', signIn: 'key' },
  { id: 'qwen', name: 'Qwen', signIn: 'key' }
]
/** Nothing connected: Tracy AI alone in the order. */
const NONE = {
  next: null,
  enabled: true,
  providers: PROVIDERS,
  connections: [],
  routing: { enabled: true, connectionOrder: ['tracy'], version: 3 }
}
const C_CODEX = {
  connectionId: 'c1',
  provider: 'codex',
  name: 'ChatGPT Codex',
  account: 'lee@example.test',
  connected: true
}
const C_COPILOT = {
  connectionId: 'c2',
  provider: 'copilot',
  name: 'GitHub Copilot',
  account: 'octocat',
  connected: true
}
const C_GLM = { connectionId: 'c3', provider: 'glm', name: 'GLM', account: 'API key …1234', connected: true }
/** Codex default, Copilot then Tracy AI as fallbacks. */
const TWO = {
  next: { connectionId: 'c1', name: 'ChatGPT Codex' },
  enabled: true,
  providers: PROVIDERS,
  connections: [C_CODEX, C_COPILOT],
  routing: { enabled: true, connectionOrder: ['c1', 'c2', 'tracy'], version: 7 }
}
const DEVICE = {
  attemptId: '6f1c2b8e-1d2a-4c1b-9a0e-0d5c6b7a8f90',
  signIn: 'device',
  authorizeUrl: 'https://github.com/login/device',
  userCode: 'WDJB-MJHT',
  intervalMs: 5000,
  state: 'st-1'
}
const BROWSER = {
  attemptId: DEVICE.attemptId,
  signIn: 'browser',
  authorizeUrl: 'https://claude.ai/x',
  state: 's'
}
const REFUSED = { refused: 400, code: 'code', message: 'The sign-in could not be completed. Start again.' }

/** The proxy's page while tracy-web restarts for a deploy (dev, 12/10/2026). */
const PROXY_DOWN =
  '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>Bad Gateway</body></html>'
/** A fetch answer as the page sees one: status, content type, and a body read as text. */
function respond(status, body, type = 'application/json') {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? null)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': type }),
    text: async () => text,
    json: async () => JSON.parse(text)
  }
}

let outDir = ''
let file = ''
/** @type {any} */
let JSDOM
/** @type {any} */
let dom
/** @type {any} */
let lib
/** @type {(() => void) | undefined} */
let unmount
/** Requests to `/api/seat-plan/*` in order, with their bodies. */
/** @type {{ path: string, method: string, body: any }[]} */
let requests = []
/** What each door answers, set per test. */
/** @type {any} */
let statusAnswer
/** @type {any} */
let startAnswer
/** @type {any[]} */
let completeAnswers = []
/** @type {any} */
let routingAnswer
/** @type {any} */
let keyAnswer
/** @type {any} */
let disconnectAnswer
/** @type {string[]} */
let opened = []
/** @type {string[]} */
let copied = []

before(async () => {
  JSDOM = loadJsdom().JSDOM
  outDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'tracy-accounts-pane-')))
  file = path.join(outDir, 'pane.cjs')
  await require('esbuild').build({
    stdin: { contents: SOURCE, resolveDir: clientDir, loader: 'tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    define: { __TAILWIND_CSS__: '""' },
    loader: { '.css': 'empty' },
    outfile: file,
    logLevel: 'silent'
  })
})

beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  dom = new JSDOM('<!doctype html><html lang="en"><body></body></html>', { pretendToBeVisual: true })
  const { window } = dom
  for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Event', 'MouseEvent']) {
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true
    })
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  requests = []
  statusAnswer = NONE
  startAnswer = undefined
  completeAnswers = []
  routingAnswer = undefined
  keyAnswer = undefined
  disconnectAnswer = undefined
  opened = []
  copied = []
  window.open = (url) => {
    opened.push(`window:${url}`)
    return null
  }
  // Last in the bubble: an anchor the browser would follow opens a tab (`tab:`); one whose default
  // was prevented opens nothing by itself (`held:`). Either way jsdom does not navigate.
  window.addEventListener('click', (event) => {
    const a = event.target
    if (a?.tagName !== 'A' || a.getAttribute('target') !== '_blank') return
    opened.push(`${event.defaultPrevented ? 'held' : 'tab'}:${a.getAttribute('href')}`)
    event.preventDefault()
  })
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (text) => void copied.push(text) },
    configurable: true
  })
  globalThis.fetch = async (url, init = {}) => {
    const at = String(url)
    if (at === '/auth/me')
      return { ok: true, status: 200, json: async () => ({ email: 'lee@example.test', name: 'Lee' }) }
    if (!at.startsWith('/api/seat-plan/')) return { ok: false, status: 404, json: async () => ({}) }
    const door = at.slice('/api/seat-plan/'.length)
    const body = init.body ? JSON.parse(init.body) : undefined
    requests.push({ path: door, method: init.method ?? 'GET', body })
    const answer =
      door === 'status'
        ? statusAnswer
        : door === 'routing'
          ? (routingAnswer ?? {
              ...statusAnswer,
              routing: {
                ...statusAnswer.routing,
                connectionOrder: body.connectionOrder,
                version: statusAnswer.routing.version + 1
              }
            })
          : door === 'connect/start'
            ? startAnswer
            : door === 'connect/complete'
              ? completeAnswers.shift()
              : door === 'connect/key'
                ? keyAnswer
                : door === 'disconnect'
                  ? disconnectAnswer
                  : {}
    // An answer `{ refused: <status>, message }` is a refusal, as tracy-web words it; `PROXY_DOWN`
    // is what the proxy answers while the web container restarts.
    if (answer === PROXY_DOWN) return respond(502, PROXY_DOWN, 'text/html')
    if (answer?.refused) return respond(answer.refused, answer)
    return respond(200, answer)
  }
  delete require.cache[file]
  lib = require(file)
})

afterEach(() => {
  unmount?.()
  unmount = undefined
  delete window.tracyDesktop
  dom?.window.close()
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** Let answered requests land, then flush React's work. */
async function settle() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve))
  lib.act(() => {})
}

/** Move the mocked clock and let what it woke run. */
async function advance(t, ms) {
  t.mock.timers.tick(ms)
  await settle()
}

/** The pane mounted, its status read. */
async function pane(props = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  unmount = lib.mount(container, props)
  await settle()
  return container.querySelector('[data-accounts-pane]')
}

const click = async (el) => {
  assert.ok(el, 'something to click')
  // Cancelable, as a person's click is: a handler's preventDefault shows in `opened` as `held:`.
  lib.act(() => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })))
  await settle()
}
/** Press the button whose text is `label` inside `root`. */
async function press(root, label) {
  const button = [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === label)
  assert.ok(button, `a "${label}" button`)
  await click(button)
}
const card = (root, id) => root.querySelector(`[data-agent="${id}"]`)
const badge = (root, id) => card(root, id)?.querySelector('.tv-ob-badge')?.textContent ?? null
const panelOf = (root) => root.querySelector('.tv-ob-connect')
const fallbackRows = (root) => [...root.querySelectorAll('.tv-ob-order-row')].map((r) => r.dataset.entry)
const puts = () => requests.filter((r) => r.path === 'routing' && r.method === 'PUT')
const polls = () => requests.filter((r) => r.path === 'connect/complete')
function type(input, value) {
  lib.act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
}

// ---- the order, from the status alone ----

test('the order is read whole: tracy once, every connection with a row; an older server’s gaps are completed the way the server does it', () => {
  const two = (order) => ({ connections: [C_CODEX, C_COPILOT], routing: { connectionOrder: order } })
  assert.deepEqual(lib.fullOrder(two(['c1', 'c2', 'tracy'])), ['c1', 'c2', 'tracy'])
  assert.deepEqual(lib.fullOrder(two(['c2', 'tracy', 'c1'])), ['c2', 'tracy', 'c1'])
  assert.deepEqual(lib.fullOrder(two([])), ['c1', 'c2', 'tracy'], 'nothing saved: connections, then Tracy AI')
  assert.deepEqual(
    lib.fullOrder(two(['c1'])),
    ['c1', 'c2', 'tracy'],
    'a connection not in the order goes before a trailing tracy'
  )
  assert.deepEqual(
    lib.fullOrder(two(['tracy', 'c1'])),
    ['tracy', 'c1', 'c2'],
    'Tracy AI moved up: a new connection goes last'
  )
  assert.deepEqual(
    lib.fullOrder(two(['c1', 'c1', 'gone', 'tracy'])),
    ['c1', 'c2', 'tracy'],
    'duplicates and ids with no row are dropped'
  )
  const off = {
    connections: [C_CODEX, { ...C_COPILOT, connected: false }],
    routing: { connectionOrder: ['c2', 'c1', 'tracy'] }
  }
  assert.deepEqual(lib.activeOrder(off), ['c1', 'tracy'], 'a connection that is not connected cannot answer')
  assert.deepEqual(lib.swapped(['c2', 'c1', 'tracy'], 'c1', 'tracy'), ['c2', 'tracy', 'c1'])
  assert.deepEqual(lib.asDefault(['c1', 'c2', 'tracy'], 'tracy'), ['tracy', 'c1', 'c2'])
})

// ---- (a) nothing connected ----

test('(a) nothing connected: Tracy AI is the Default, its panel says so, and there is no fallback yet', async () => {
  const root = await pane()
  assert.equal(root.dataset.accountsPane, 'ready')
  assert.match(root.textContent, /Your AI accounts, default and fallbacks follow your Tracy account/)
  assert.equal(badge(root, 'tracy'), 'Default')
  assert.equal(badge(root, 'claude'), null)
  assert.equal(card(root, 'tracy').getAttribute('aria-pressed'), 'true', 'the Default is picked first')
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'tracy')
  assert.equal(panel.querySelector('.tv-ob-connect-title').textContent, 'Tracy AI')
  assert.equal(
    panel.querySelector('.tv-ob-connect-line').textContent,
    'Part of your Tracy account, signed in as lee@example.test. Your default: new chats use it.'
  )
  assert.equal(panel.querySelector('[data-action="set-default"]'), null, 'already the Default')
  assert.match(root.textContent, /If Tracy AI can't answer/)
  assert.match(
    root.textContent,
    /No fallback yet\. Connect another account and it takes over when Tracy AI can't answer\./
  )
  assert.deepEqual(fallbackRows(root), [])
  assert.match(root.textContent, /New chats use the Tracy model\./)
  assert.doesNotMatch(root.textContent, /routing|backup|Usage limits apply/i)
})

test('on the web the first six vendors are "Popular" with the rest behind "Show 2 more →"; nothing is scanned', async () => {
  const root = await pane()
  assert.match(root.textContent, /Popular/)
  assert.doesNotMatch(root.textContent, /Found on this computer|Refresh/)
  assert.deepEqual(
    [...root.querySelectorAll('[data-agent]')].map((el) => el.dataset.agent),
    ['tracy', 'claude', 'codex', 'copilot', 'grok', 'antigravity', 'kimi']
  )
  await press(root, 'Show 2 more →')
  assert.ok(card(root, 'qwen'))
  await press(root, 'Show fewer')
  assert.equal(card(root, 'qwen'), null)
})

test('in the desktop app the vendors found on this computer come first under "Found on this computer N" with Refresh; a connected vendor always shows', async () => {
  statusAnswer = {
    ...NONE,
    connections: [C_GLM],
    routing: { enabled: true, connectionOrder: ['c3', 'tracy'], version: 1 }
  }
  let asked = 0
  window.tracyDesktop = {
    app: {
      protocolVersion: 2,
      agents: {
        detect: async () => {
          asked += 1
          return { results: [{ id: 'copilot', status: 'found' }], scanComplete: true }
        }
      }
    }
  }
  const root = await pane()
  assert.equal(root.querySelector('[data-cards]').dataset.cards, 'scan')
  assert.match(
    root.textContent,
    /Found on this computer1Refresh/,
    'the count is what was found, not every card shown'
  )
  assert.deepEqual(
    [...root.querySelectorAll('[data-agent]')].map((el) => el.dataset.agent),
    ['tracy', 'copilot', 'glm'],
    'found first, then the connected one; the rest behind the fold'
  )
  assert.equal(card(root, 'copilot').dataset.found, 'true')
  assert.equal(asked, 1)
  await press(root, 'Refresh')
  assert.equal(asked, 2, 'Refresh scans again')
})

// ---- (b) two connections + Tracy AI ----

test('(b) two connections: badges Default / Connected / Included, the fallback rows, Move up on row 2 sends the swapped order with the version', async () => {
  statusAnswer = TWO
  const root = await pane()
  assert.equal(badge(root, 'codex'), 'Default')
  assert.equal(badge(root, 'copilot'), 'Connected')
  assert.equal(badge(root, 'tracy'), 'Included')
  assert.equal(badge(root, 'claude'), null)
  assert.equal(card(root, 'codex').getAttribute('aria-pressed'), 'true', 'the Default is picked first')
  assert.match(root.textContent, /If ChatGPT Codex can't answer/)
  assert.deepEqual(fallbackRows(root), ['c2', 'tracy'])
  const rows = root.querySelectorAll('.tv-ob-order-row')
  assert.equal(rows[0].querySelector('.tv-ob-order-name').textContent, 'GitHub Copilot')
  assert.equal(rows[1].querySelector('.tv-ob-order-name').textContent, 'Tracy AI')
  assert.equal(
    rows[0].querySelector('[aria-label="Move up"]').disabled,
    true,
    'the first fallback cannot go up'
  )
  assert.equal(rows[1].querySelector('[aria-label="Move down"]').disabled, true, 'the last cannot go down')
  await click(rows[1].querySelector('[aria-label="Move up"]'))
  assert.deepEqual(
    puts().map((r) => r.body),
    [{ enabled: true, connectionOrder: ['c1', 'tracy', 'c2'], expectedVersion: 7 }]
  )
  assert.deepEqual(fallbackRows(root), ['tracy', 'c2'], 'the answer is the new status')
  assert.match(root.textContent, /New chats use your ChatGPT Codex plan\./)
})

test("a fallback's panel names its place and the entries before it; Tracy AI counts, a disconnected row does not", async () => {
  statusAnswer = {
    ...TWO,
    connections: [C_CODEX, { ...C_COPILOT, connected: false }, C_GLM],
    routing: { enabled: true, connectionOrder: ['c1', 'c2', 'tracy', 'c3'], version: 2 }
  }
  const root = await pane()
  await click(card(root, 'glm'))
  const line = panelOf(root).querySelector('.tv-ob-connect-line').textContent
  assert.equal(
    line,
    "Connected with an API key. Fallback 2: used when ChatGPT Codex and Tracy AI can't answer."
  )
  await click(card(root, 'tracy'))
  assert.match(panelOf(root).textContent, /Fallback 1: used when ChatGPT Codex can't answer\./)
  assert.deepEqual(fallbackRows(root), ['tracy', 'c3'], 'the disconnected Copilot is not a fallback')
  await click(card(root, 'copilot'))
  assert.equal(panelOf(root).dataset.connect, 'idle', 'a disconnected vendor connects again')
})

// ---- (c) Set as default ----

test('(c) "Set as default" on a connected card that is not first sends the order with its id first; the Default has no such button', async () => {
  statusAnswer = TWO
  const root = await pane()
  await click(card(root, 'copilot'))
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'connected')
  assert.equal(panel.querySelector('.tv-ob-connect-title').textContent, 'GitHub Copilot connected')
  assert.match(
    panel.querySelector('.tv-ob-connect-line').textContent,
    /^Signed in as octocat\. Fallback 1: used when ChatGPT Codex can't answer\.$/
  )
  await press(panel, 'Set as default')
  assert.deepEqual(puts()[0].body, {
    enabled: true,
    connectionOrder: ['c2', 'c1', 'tracy'],
    expectedVersion: 7
  })
  assert.equal(badge(root, 'copilot'), 'Default')
  assert.equal(badge(root, 'codex'), 'Connected')
  assert.equal(panelOf(root).querySelector('[data-action="set-default"]'), null)
  await click(card(root, 'tracy'))
  await press(panelOf(root), 'Set as default')
  assert.deepEqual(puts()[1].body.connectionOrder, ['tracy', 'c2', 'c1'])
  assert.equal(badge(root, 'tracy'), 'Default')
})

test('a refused reorder shows the server’s sentence and keeps the old order', async () => {
  statusAnswer = TWO
  routingAnswer = { refused: 409, message: 'The order changed meanwhile. Reload and try again.' }
  const root = await pane()
  await click(root.querySelectorAll('.tv-ob-order-row')[1].querySelector('[aria-label="Move up"]'))
  assert.equal(
    root.querySelector('[role="alert"]')?.textContent,
    'The order changed meanwhile. Reload and try again.'
  )
  assert.deepEqual(fallbackRows(root), ['c2', 'tracy'])
})

test('Disconnect sends the connection id and shows the answer', async () => {
  statusAnswer = TWO
  disconnectAnswer = {
    ...TWO,
    next: null,
    connections: [
      { ...C_CODEX, connected: false },
      { ...C_COPILOT, connected: false }
    ],
    routing: { ...TWO.routing, version: 8 }
  }
  const root = await pane()
  await press(panelOf(root), 'Disconnect')
  assert.deepEqual(
    requests.filter((r) => r.path === 'disconnect').map((r) => r.body),
    [{ connectionId: 'c1' }]
  )
  assert.equal(badge(root, 'tracy'), 'Default')
  assert.equal(badge(root, 'codex'), null)
  assert.equal(panelOf(root).dataset.connect, 'idle', "Codex's card now offers to connect")
})

// ---- (d) key vendors ----

test('(d) a key vendor offers the password box, Connect and where to get a key; the pasted key goes to connect/key and the box clears', async () => {
  keyAnswer = {
    ...NONE,
    connections: [C_GLM],
    routing: { enabled: true, connectionOrder: ['c3', 'tracy'], version: 4 }
  }
  const root = await pane()
  await press(root, 'Show 2 more →')
  await click(card(root, 'glm'))
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'key')
  assert.equal(panel.querySelector('.tv-ob-connect-title').textContent, 'GLM connects with an API key')
  assert.equal(
    panel.querySelector('.tv-ob-connect-line').textContent,
    'Paste your GLM API key. Tracy keeps it with your Tracy account.'
  )
  const input = panel.querySelector('input[type="password"]')
  assert.equal(input.getAttribute('autocomplete'), 'off')
  assert.equal(input.getAttribute('aria-label'), 'Paste your GLM API key')
  assert.equal(panel.querySelector('a.tv-ob-link').getAttribute('href'), 'https://z.ai')
  assert.doesNotMatch(panel.textContent, /Connect now|Not available/)
  const connect = [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Connect')
  assert.equal(connect.disabled, true, 'nothing pasted yet')
  type(input, 'sk-glm-1')
  assert.equal(connect.disabled, false)
  lib.act(() =>
    panel.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
  )
  await settle()
  assert.deepEqual(
    requests.filter((r) => r.path === 'connect/key').map((r) => r.body),
    [{ provider: 'glm', key: 'sk-glm-1' }]
  )
  assert.equal(panelOf(root).dataset.connect, 'connected')
  assert.equal(
    panelOf(root).querySelector('.tv-ob-connect-line').textContent,
    'Connected with an API key. Your default: new chats use it.'
  )
  assert.equal(badge(root, 'glm'), 'Default')
  assert.equal(badge(root, 'tracy'), 'Included')
})

test("the key link goes to the server's homepage for the vendor when it sends one", async () => {
  statusAnswer = {
    ...NONE,
    providers: [{ id: 'glm', name: 'GLM', signIn: 'key', homepage: 'https://z.example/keys' }]
  }
  const root = await pane()
  await click(card(root, 'glm'))
  assert.equal(panelOf(root).querySelector('a.tv-ob-link').getAttribute('href'), 'https://z.example/keys')
})

test('a refused key says why in the panel, as an alert, and the box stays to try again', async () => {
  for (const [kind, refused] of [
    ['key', 401],
    ['plan', 403],
    ['invalid', 400]
  ]) {
    statusAnswer = { ...NONE, providers: [{ id: 'glm', name: 'GLM', signIn: 'key' }] }
    keyAnswer = { refused, code: kind }
    const root = await pane()
    await click(card(root, 'glm'))
    const panel = panelOf(root)
    type(panel.querySelector('input'), 'bad')
    lib.act(() =>
      panel
        .querySelector('form')
        .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))
    )
    await settle()
    assert.equal(
      panelOf(root).querySelector('[role="alert"]')?.textContent,
      lib.t(`key.failed.${kind}`, { vendor: 'GLM' }),
      kind
    )
    assert.ok(panelOf(root).querySelector('input[type="password"]'), 'the box stays')
    unmount()
    unmount = undefined
  }
})

test('a sign-in this page does not know (or null) offers nothing to press; an older server (no signIn) offers Connect now', async () => {
  statusAnswer = {
    ...NONE,
    providers: [
      { id: 'qwen', name: 'Qwen', signIn: null },
      { id: 'x', name: 'X', signIn: 'oauth' },
      { id: 'claude', name: 'Claude' }
    ]
  }
  const root = await pane()
  for (const id of ['qwen', 'x']) {
    await click(card(root, id))
    assert.equal(panelOf(root).querySelector('.tv-ob-connect-line').textContent, lib.en['status.unavailable'])
    assert.equal(panelOf(root).querySelector('button'), null)
  }
  await click(card(root, 'claude'))
  assert.equal(panelOf(root).querySelector('[data-action="connect"]').textContent, 'Connect now')
})

// ---- (e) disabled by the administrator ----

test('(e) AI accounts turned off: the note, the cards inert, no panel, the fallbacks to read but not to move', async () => {
  statusAnswer = { ...TWO, enabled: false }
  const root = await pane()
  assert.ok(root.classList.contains('tv-ac-locked'))
  assert.equal(root.querySelector('[data-locked="admin"]').textContent, lib.en['account.disabled'])
  assert.equal(badge(root, 'codex'), 'Default', 'the order is still shown')
  assert.equal(panelOf(root), null)
  assert.deepEqual(fallbackRows(root), ['c2', 'tracy'])
  assert.equal(root.querySelector('.tv-ob-icon-btn'), null)
})

test('the status cannot be read: one sentence and Retry', async () => {
  statusAnswer = { refused: 500, message: 'down' }
  const root = await pane()
  assert.equal(root.dataset.accountsPane, 'loading')
  assert.equal(root.querySelector('[role="alert"]').textContent, lib.en['error.load'])
  statusAnswer = NONE
  await press(root, 'Try again')
  assert.equal(root.dataset.accountsPane, 'ready')
})

// ---- (f) the sign-ins, ported from the old pane's tests ----

/** Connect Copilot with the device answer. */
async function startDevice(answer = DEVICE) {
  startAnswer = answer
  const root = await pane()
  await click(card(root, 'copilot'))
  await press(panelOf(root), 'Connect now')
  return root
}

test("a device sign-in shows its code in the picked card's panel, copyable, with the vendor's page a press away", async () => {
  const root = await startDevice()
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'device')
  assert.equal(panel.querySelector('.tv-ob-connect-title').textContent, 'Waiting for GitHub Copilot…')
  assert.equal(panel.querySelector('.tv-ob-code').textContent, 'WDJB-MJHT')
  assert.match(panel.textContent, /Enter this code on GitHub Copilot to connect/)
  assert.deepEqual(opened, [], 'nothing opens before the person has the code')
  await press(panel, 'Copy code')
  assert.deepEqual(copied, ['WDJB-MJHT'])
  assert.ok([...panel.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Copied'))
  await press(panel, 'Open GitHub Copilot')
  assert.deepEqual(opened, ['tab:https://github.com/login/device'])
})

test("in the desktop app the vendor's page opens through the app's links", async () => {
  window.tracyDesktop = { links: { openExternal: (url) => opened.push(`app:${url}`) } }
  const root = await startDevice()
  await press(panelOf(root), 'Open GitHub Copilot')
  assert.deepEqual(opened, ['app:https://github.com/login/device'])
})

test('the pane asks every interval until the vendor confirms, then shows the connection', async (t) => {
  const connected = {
    ...NONE,
    next: { connectionId: 'c2', name: 'GitHub Copilot' },
    connections: [C_COPILOT],
    routing: { enabled: true, connectionOrder: ['c2', 'tracy'], version: 4 }
  }
  completeAnswers = [{ pending: true, intervalMs: 5000 }, connected]
  const root = await startDevice()
  await advance(t, 4999)
  assert.equal(polls().length, 0, 'not before the interval')
  await advance(t, 1)
  assert.deepEqual(polls()[0].body, { attemptId: DEVICE.attemptId, state: 'st-1' }, 'a poll sends no url')
  assert.equal(panelOf(root).dataset.connect, 'device', 'still waiting')
  await advance(t, 5000)
  assert.equal(polls().length, 2)
  assert.equal(panelOf(root).dataset.connect, 'connected')
  assert.match(panelOf(root).textContent, /Signed in as octocat\. Your default: new chats use it\./)
  assert.equal(badge(root, 'copilot'), 'Default')
  await advance(t, 60000)
  assert.equal(polls().length, 2, 'no poll after the answer')
})

test('Cancel stops the polling and takes the code away', async (t) => {
  completeAnswers = [{ pending: true, intervalMs: 5000 }]
  const root = await startDevice()
  await advance(t, 5000)
  assert.equal(polls().length, 1)
  await press(panelOf(root), 'Cancel')
  assert.equal(panelOf(root).dataset.connect, 'idle')
  await advance(t, 60000)
  assert.equal(polls().length, 1, 'no poll after Cancel')
})

test('a sign-in nobody finished in 10 minutes stops with a plain sentence and Try again', async (t) => {
  completeAnswers = Array.from({ length: 200 }, () => ({ pending: true, intervalMs: 5000 }))
  const root = await startDevice()
  for (let waited = 0; waited < 10 * 60 * 1000; waited += 5000) await advance(t, 5000)
  const asked = polls().length
  await advance(t, 60000)
  assert.equal(polls().length, asked, 'no poll after 10 minutes')
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'error')
  assert.equal(
    panel.querySelector('[role="alert"]').textContent,
    'The sign-in was not finished within 10 minutes.'
  )
  assert.ok(panel.querySelector('[data-action="retry"]'))
})

test('a poll the restarting server did not answer keeps the code and says so, then the line goes at the next answer', async (t) => {
  completeAnswers = [
    { pending: true, intervalMs: 5000 },
    PROXY_DOWN,
    PROXY_DOWN,
    { pending: true, intervalMs: 5000 }
  ]
  const root = await startDevice()
  await advance(t, 5000)
  const transientLine = () => panelOf(root).querySelector('[data-hint="transient"]')
  assert.equal(transientLine(), null, 'nothing while the server answers')
  await advance(t, 5000)
  assert.equal(polls().length, 2)
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'device', 'the attempt goes on')
  assert.equal(panel.querySelector('.tv-ob-code').textContent, 'WDJB-MJHT')
  assert.equal(transientLine()?.textContent, 'The server is restarting or unreachable. Trying again…')
  assert.doesNotMatch(panel.textContent, /Unexpected token|DOCTYPE|Could not connect/)
  assert.ok(
    panel.textContent.indexOf('Waiting for GitHub Copilot to confirm…') <
      panel.textContent.indexOf('The server is restarting'),
    'under the waiting line'
  )
  await advance(t, 5000)
  assert.equal(polls().length, 3, 'asked again after 5 s')
  assert.ok(transientLine(), 'still failing')
  await advance(t, 9999)
  assert.equal(polls().length, 3, 'the second failure in a row waits 10 s')
  await advance(t, 1)
  assert.equal(polls().length, 4)
  assert.equal(transientLine(), null, 'cleared at the next good answer')
  assert.equal(panelOf(root).dataset.connect, 'device')
})

test('a start the restarting server did not answer says so in plain words with Try again, never the parse error', async () => {
  startAnswer = PROXY_DOWN
  const root = await pane()
  await click(card(root, 'codex'))
  await press(panelOf(root), 'Connect now')
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'error')
  assert.equal(panel.querySelector('[role="alert"]').textContent, 'The server did not answer. Try again.')
  assert.ok(panel.querySelector('[data-action="retry"]'))
})

const CODEX_DEVICE = {
  attemptId: 'a-codex',
  signIn: 'device',
  authorizeUrl: 'https://auth.openai.com/codex/device',
  userCode: 'WXYZ-9876',
  intervalMs: 5000,
  state: 'st-c'
}

test("a ChatGPT Codex code says ChatGPT takes it only with Device code sign-in on, linking ChatGPT's Security settings", async () => {
  startAnswer = CODEX_DEVICE
  const root = await pane()
  await click(card(root, 'codex'))
  await press(panelOf(root), 'Connect now')
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'device')
  const hint = panel.querySelector('[data-hint="device-security"]')
  assert.ok(hint, 'the hint under the code')
  assert.equal(
    hint.textContent,
    'ChatGPT accepts the code only when Device code sign-in is on in ChatGPT Settings › Security.'
  )
  const link = hint.querySelector('a')
  assert.equal(link.textContent, 'ChatGPT Settings › Security')
  assert.equal(link.getAttribute('href'), 'https://chatgpt.com/#settings/Security')
  assert.equal(link.getAttribute('target'), '_blank')
  assert.equal(link.getAttribute('rel'), 'noopener noreferrer')
  await click(link)
  assert.deepEqual(opened, ['tab:https://chatgpt.com/#settings/Security'])
})

// ---- the panel's links open a tab on the web, the person's browser in the app ----

/** The panel's links to a vendor page: how to reach each one, and where it points. */
const PANEL_LINKS = [
  {
    name: "a browser sign-in's Open sign-in page",
    href: 'https://claude.ai/x',
    async open() {
      startAnswer = BROWSER
      const root = await pane()
      await click(card(root, 'claude'))
      await press(panelOf(root), 'Connect now')
      opened = []
      return panelOf(root).querySelector('a[data-action="reopen"]')
    }
  },
  {
    name: "ChatGPT Codex's Security settings link",
    href: 'https://chatgpt.com/#settings/Security',
    async open() {
      startAnswer = CODEX_DEVICE
      const root = await pane()
      await click(card(root, 'codex'))
      await press(panelOf(root), 'Connect now')
      opened = []
      return panelOf(root).querySelector('[data-hint="device-security"] a')
    }
  },
  {
    name: "a key vendor's Where to get a key",
    href: 'https://z.example/keys',
    async open() {
      statusAnswer = {
        ...NONE,
        providers: [{ id: 'glm', name: 'GLM', signIn: 'key', homepage: 'https://z.example/keys' }]
      }
      const root = await pane()
      await click(card(root, 'glm'))
      opened = []
      return panelOf(root).querySelector('a.tv-ob-link')
    }
  }
]

for (const link of PANEL_LINKS) {
  test(`on the web ${link.name} is a plain new-tab link: the click is not held back and no popup opens`, async () => {
    const a = await link.open()
    assert.equal(a.getAttribute('href'), link.href)
    assert.equal(a.getAttribute('target'), '_blank')
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer', 'the vendor page gets no opener')
    await click(a)
    assert.deepEqual(opened, [`tab:${link.href}`], 'the anchor itself opens one tab; nothing else opens')
  })

  test(`in the desktop app ${link.name} opens through the app's links, the anchor held back`, async () => {
    window.tracyDesktop = { links: { openExternal: (url) => opened.push(`app:${url}`) } }
    const a = await link.open()
    await click(a)
    assert.deepEqual(opened, [`app:${link.href}`, `held:${link.href}`])
  })
}

test('a GitHub Copilot code carries no such hint', async () => {
  const root = await startDevice()
  assert.equal(panelOf(root).querySelector('[data-hint="device-security"]'), null)
})

test('a browser sign-in opens the page and offers the callback URL field; the pasted URL completes it', async () => {
  startAnswer = BROWSER
  completeAnswers = [
    {
      ...NONE,
      next: { connectionId: 'c9', name: 'Claude' },
      connections: [
        {
          connectionId: 'c9',
          provider: 'claude',
          name: 'Claude',
          account: 'lee@claude.test',
          connected: true
        }
      ],
      routing: { enabled: true, connectionOrder: ['c9', 'tracy'], version: 5 }
    }
  ]
  const root = await pane()
  await click(card(root, 'claude'))
  await press(panelOf(root), 'Connect now')
  assert.deepEqual(opened, ['tab:https://claude.ai/x'])
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'pending')
  assert.match(panel.textContent, /Finish signing in to Claude in your browser\./)
  const input = panel.querySelector('input[aria-label="Paste the callback URL"]')
  assert.ok(input)
  type(input, 'https://x.test/cb?code=1&state=s')
  await press(panel, 'Submit')
  assert.deepEqual(polls()[0].body, { attemptId: DEVICE.attemptId, url: 'https://x.test/cb?code=1&state=s' })
  assert.equal(panelOf(root).dataset.connect, 'connected')
  assert.equal(badge(root, 'claude'), 'Default')
})

test('a browser sign-in says what happens before the page opens: three steps in order, the refused page announced, then the paste box', async () => {
  startAnswer = { ...BROWSER, authorizeUrl: 'https://auth.openai.com/x' }
  const root = await pane()
  await click(card(root, 'codex'))
  await press(panelOf(root), 'Connect now')
  const panel = panelOf(root)
  assert.match(panel.querySelector('.tv-ob-connect-title').textContent, /^Waiting for ChatGPT Codex…$/)
  const steps = [...panel.querySelectorAll('ol[data-steps="browser-callback"] > li')]
  assert.deepEqual(
    steps.map((li) => li.dataset.step),
    ['open', 'refused', 'copy']
  )
  assert.match(steps[0].textContent, /^Open the sign-in page and sign in\./)
  const link = steps[0].querySelector('a[data-action="reopen"]')
  assert.equal(link?.textContent, 'Open sign-in page', 'the link sits inside step 1')
  assert.equal(link.getAttribute('href'), 'https://auth.openai.com/x')
  assert.equal(
    steps[1].querySelector('span').textContent,
    'Your browser will then show a page that cannot be reached (localhost refused to connect). That is expected.'
  )
  assert.match(steps[2].textContent, /^Copy the whole address from the address bar and paste it below\./)
  const bar = steps[2].querySelector('[data-illustration="address-bar"]')
  assert.ok(bar, 'an address bar is drawn under step 3')
  assert.equal(bar.getAttribute('aria-hidden'), 'true', 'the drawing is decoration; step 3 says it')
  assert.match(bar.textContent, /localhost:1455\/auth\/callback\?code=…/)
  // Everything the steps say comes before the box the person pastes into.
  const form = panel.querySelector('form.tv-ob-paste')
  assert.ok(form)
  for (const li of steps)
    assert.ok(
      li.compareDocumentPosition(form) & window.Node.DOCUMENT_POSITION_FOLLOWING,
      `${li.dataset.step} before the box`
    )
  assert.equal(
    panel.querySelector('[data-action="cancel"]')?.textContent,
    'Cancel',
    'Cancel stays in the row'
  )
  assert.doesNotMatch(
    panel.textContent,
    /callback URL from your browser/,
    'the old after-the-fact sentence is gone'
  )
})

test('the address to copy is drawn from the attempt: the redirect the vendor sends the browser back to', () => {
  const claude =
    'https://claude.ai/oauth/authorize?code=true&client_id=c&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A53692%2Fcallback&state=s'
  assert.equal(lib.callbackAddressOf(claude), 'localhost:53692/callback?code=…')
  const codex =
    'https://auth.openai.com/oauth/authorize?response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback'
  assert.equal(lib.callbackAddressOf(codex), 'localhost:1455/auth/callback?code=…')
  // No redirect to read (or no URL at all): the address OpenAI registered, as before.
  for (const broken of ['https://claude.ai/x', 'not a url', '', 'https://x.test/?redirect_uri=nope'])
    assert.equal(lib.callbackAddressOf(broken), 'localhost:1455/auth/callback?code=…', broken)
})

test("Claude's sign-in draws Claude's callback address and says what to do with an address-less window", async () => {
  startAnswer = {
    ...BROWSER,
    authorizeUrl:
      'https://claude.ai/oauth/authorize?code=true&redirect_uri=http%3A%2F%2Flocalhost%3A53692%2Fcallback&state=s'
  }
  const root = await pane()
  await click(card(root, 'claude'))
  await press(panelOf(root), 'Connect now')
  const panel = panelOf(root)
  assert.equal(panel.dataset.connect, 'pending')
  const steps = [...panel.querySelectorAll('ol[data-steps="browser-callback"] > li')]
  assert.deepEqual(
    steps.map((li) => li.dataset.step),
    ['open', 'refused', 'copy'],
    'the hint is part of step 2, not a fourth step'
  )
  const hint = steps[1].querySelector('small[data-hint="popup"]')
  assert.ok(hint, 'a hint under step 2')
  assert.equal(
    hint.textContent,
    'Opened in a small window with no address bar? Use its menu (⋮) and choose Open in Chrome, then copy the address.'
  )
  const bar = steps[2].querySelector('[data-illustration="address-bar"]')
  assert.equal(bar.textContent, 'localhost:53692/callback?code=…')
  assert.doesNotMatch(panel.textContent, /1455/, "Codex's address is not Claude's")
})

test('a wrong callback URL shows its error in the panel with Try again, and Try again starts that vendor again', async () => {
  startAnswer = BROWSER
  completeAnswers = [REFUSED]
  const root = await pane()
  await click(card(root, 'claude'))
  await press(panelOf(root), 'Connect now')
  type(panelOf(root).querySelector('input'), 'https://x.test/cb?code=1&state=s')
  await press(panelOf(root), 'Submit')
  assert.equal(panelOf(root).dataset.connect, 'error')
  assert.equal(panelOf(root).querySelector('[role="alert"]').textContent, REFUSED.message)
  assert.equal(root.querySelectorAll('[role="alert"]').length, 1, 'no second copy at the top')
  await press(panelOf(root), 'Try again')
  assert.deepEqual(
    requests.filter((r) => r.path === 'connect/start').map((r) => r.body.provider),
    ['claude', 'claude']
  )
  assert.equal(panelOf(root).dataset.connect, 'pending', 'the old error is gone')
})

test('a refused start shows in the panel too', async () => {
  startAnswer = { refused: 403, code: 'invalid', message: 'Grok is not available.' }
  const root = await pane()
  await click(card(root, 'grok'))
  await press(panelOf(root), 'Connect now')
  assert.equal(panelOf(root).querySelector('[role="alert"]')?.textContent, 'Grok is not available.')
  await click(card(root, 'claude'))
  assert.equal(panelOf(root).dataset.connect, 'idle', "another card's panel carries no error")
})

test('the code copies on a plain-http page, where the browser offers no clipboard, and says so for 2 s', async (t) => {
  Object.defineProperty(window.navigator, 'clipboard', { value: undefined, configurable: true })
  /** @type {string[]} */
  const commands = []
  document.execCommand = (command) => {
    commands.push(`${command}:${document.activeElement?.value ?? ''}`)
    return true
  }
  const root = await startDevice()
  await press(panelOf(root), 'Copy code')
  assert.deepEqual(commands, ['copy:WDJB-MJHT'])
  assert.equal(document.querySelector('textarea'), null, 'the helper textarea is gone')
  assert.ok([...panelOf(root).querySelectorAll('button')].some((b) => b.textContent.trim() === 'Copied'))
  await advance(t, 2000)
  assert.ok([...panelOf(root).querySelectorAll('button')].some((b) => b.textContent.trim() === 'Copy code'))
})

test('picking another card while a sign-in waits keeps the attempt; coming back shows it again', async (t) => {
  completeAnswers = [
    { pending: true, intervalMs: 5000 },
    { pending: true, intervalMs: 5000 }
  ]
  const root = await startDevice()
  await click(card(root, 'claude'))
  assert.equal(panelOf(root).dataset.connect, 'idle')
  await advance(t, 5000)
  assert.equal(polls().length, 1, 'still polling')
  await click(card(root, 'copilot'))
  assert.equal(panelOf(root).dataset.connect, 'device')
})

// ---- (g) the deep link ----

test('(g) ?vendor= picks that card, brings it into view and focuses it; an unknown or malformed id falls back to the Default', async (t) => {
  statusAnswer = TWO
  const scrolled = []
  window.HTMLElement.prototype.scrollIntoView = function () {
    scrolled.push(this.dataset.agent)
  }
  const root = await pane({ vendor: 'claude' })
  await advance(t, 0)
  assert.equal(card(root, 'claude').getAttribute('aria-pressed'), 'true')
  assert.equal(panelOf(root).querySelector('.tv-ob-connect-title').textContent, 'Connect Claude')
  assert.deepEqual(scrolled, ['claude'])
  assert.equal(document.activeElement, card(root, 'claude'))
  unmount()
  unmount = undefined
  for (const bad of ['kiro', 'a"]x']) {
    const other = await pane({ vendor: bad })
    await advance(t, 0)
    assert.equal(other.querySelector('[aria-pressed="true"]').dataset.agent, 'codex', bad)
    unmount()
    unmount = undefined
  }
})

test('the focus comes back to the card when something outside the pane takes it within a second, not when the person moves inside it', async (t) => {
  const root = await pane()
  const composer = document.createElement('div')
  composer.id = 'composer'
  composer.tabIndex = 0
  document.body.append(composer)
  assert.equal(lib.focusVendorCard(root, 'codex'), true)
  composer.focus()
  assert.equal(document.activeElement.id, 'composer')
  await advance(t, 220)
  assert.equal(document.activeElement, card(root, 'codex'), 'taken back from the composer')
  card(root, 'claude').focus()
  await advance(t, 800)
  assert.equal(document.activeElement, card(root, 'claude'), 'a move inside the pane is kept')
  assert.equal(lib.focusVendorCard(root, 'kiro'), false, 'a vendor not on the list: nothing moves')
  assert.equal(lib.focusVendorCard(root, 'a"]x'), false, 'a malformed id never reaches the selector')
})

test('the status is read again when the window regains focus', async () => {
  await pane()
  assert.equal(requests.filter((r) => r.path === 'status').length, 1)
  lib.act(() => window.dispatchEvent(new window.Event('focus')))
  await settle()
  assert.equal(requests.filter((r) => r.path === 'status').length, 2)
})
