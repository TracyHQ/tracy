/**
 * Site changes on its new default and the one undo of a Chat row (plan `tasks/undo-change/plan.md`
 * PR 2, door d3 of `plan-verified.html`, approved 06/10/2026):
 *
 *   - the list opens on Type: People and Tracy, asked of the SERVER (`filter=people`), with one line
 *     that says how many automatic updates it holds back; Show is today's Type: All;
 *   - a Chat row is titled by the person's request, quoted, and says what changed under it;
 *   - an opened Chat row has ONE undo button that runs the chat card's engine (`GET …/turns`,
 *     `POST …/turns/undo`, `@tracy/core/turn-undo`), confirmed in a dialog that says what goes back;
 *   - a turn the engine blocks says why in the chat card's own sentence, with Ask Tracy to revert;
 *   - a turn the engine does not list keeps the row's actions of before.
 *
 * The REAL `ChangesView` is bundled by esbuild and mounted with React into jsdom over a fake server
 * (`fetch` is the one thing replaced); the words are the real English of `@tracy/dsh-site-tabs`.
 *
 *   node --test packages/core/tracy-core/test/site-changes-undo-request.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, afterEach, before, describe, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const PACKAGE = 'packages/core/tracy-core'
const require = createRequire(path.join(repo, PACKAGE, 'package.json'))

const { en } = await import(
  pathToFileURL(path.join(repo, 'packages/site/tracy-site-tabs/src/client/strings.ts')).href
)
const { putsBackOf, readTurnsAnswer } = await import(
  pathToFileURL(path.join(repo, PACKAGE, 'src/turn-undo/index.mjs')).href
)
// The TypeScript halves import without extensions (bundler resolution): read from the bundle below.
const requestTitleOf = (...a) => lib.requestTitleOf(...a)
const requestUndoOf = (...a) => lib.requestUndoOf(...a)

/** The plugin's own English, `{name}` filled; a key the table lacks reads as `⟦key⟧`, never as text. */
const t = (key, params) =>
  Object.hasOwn(en, key) ? en[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? '')) : `⟦${key}⟧`

const SITE = 'demo.tracy.test'
const REQUEST = 'Change the homepage hero heading "Building the groundwork for" to something warmer'

const group = (resources = [], operations = 0) => ({ resources, operations })
const effects = (over = {}) => ({
  content: group(),
  settings: group(),
  files: { count: null, sha: null, state: 'not-linked' },
  other: { operations: 0, actions: [] },
  coverage: { files: 'not-linked', content: 'recorded' },
  ...over
})
/** A Chat row: Mai's request, one write to post 42, from chat `session-1` turn 1. */
const chatRow = (over = {}) => ({
  id: 'session-1:1',
  kind: 'turn',
  origin: { source: 'chat', evidence: 'confirmed', cms: 'wordpress' },
  actor: { type: 'person', id: 'tracy:mai@example.test', name: 'Mai Tran', role: 'requester' },
  description: { key: 'resource.op', params: { op: 'update', type: 'post', id: '42' }, isRequestOnly: false },
  occurredAt: '2026-10-05T13:23:00.000Z',
  detectedAt: null,
  timeBasis: 'occurred',
  effects: effects({ content: group([{ type: 'post', id: '42', title: null, ops: ['update'] }]) }),
  request: { text: REQUEST, state: 'full' },
  reversal: { state: 'none' },
  capabilities: { canDiff: false, canUndoFiles: false, reasons: ['no-files'] },
  evidence: { turnId: 'session-1:1' },
  conversation: { sessionId: 'session-1', turn: 1, promptMessageId: null, mine: true },
  reply: null,
  recordedAt: '2026-10-05T13:24:00.000Z',
  unseen: false,
  ...over
})
const page = (items, counts = {}) => ({
  schemaVersion: 2,
  items,
  nextCursor: null,
  readAt: new Date().toISOString(),
  seenBefore: null,
  unseenCount: null,
  counts: {
    all: 0,
    chat: 0,
    comment: 0,
    'design-system': 0,
    setup: 0,
    api: 0,
    'cms-admin': 0,
    automatic: 0,
    deployment: 0,
    'site-changes': 0,
    unknown: 0,
    complete: true,
    reasons: [],
    ...counts
  },
  coverage: { git: 'read', gitTruncated: false, since: null, fileHistory: true, cmsLog: null }
})
const POST42 = {
  applyId: 'r1',
  action: 'content.update',
  target: { kind: 'post', id: '42', title: null },
  at: null
}
const turnRow = (undo, over = {}) => ({
  turnId: 'session-1:1',
  turn: 1,
  title: REQUEST,
  openedAt: '2026-10-05T13:23:00.000Z',
  closedAt: '2026-10-05T13:24:00.000Z',
  changed: true,
  files: { count: 0, commits: [], zones: {} },
  content: [POST42],
  undo: { state: 'available', latest: true, reasons: [], needs: { code: false, content: true }, ...undo },
  ...over
})
const turnsAnswer = (turns, over = {}) => ({ cms: 'wordpress', siteBusy: false, turns, ...over })

// ── Pure: the row's title and which undo it offers ──────────────────────────────────────────────

describe('pure', () => {
  test('a Chat row is titled by its request, in one line, cut; other rows keep their Description', () => {
    assert.equal(
      requestTitleOf(chatRow({ request: { text: 'Make the logo bigger', state: 'full' } })),
      'Make the logo bigger'
    )
    const long = requestTitleOf(chatRow(), 40)
    assert.equal(long.length, 40)
    assert.ok(long.endsWith('…'))
    assert.equal(
      requestTitleOf(chatRow({ request: { text: 'First line\nsecond line', state: 'full' } })),
      'First line…'
    )
    assert.equal(
      requestTitleOf(chatRow({ request: { text: 'Cut when stored', state: 'truncated' } })),
      'Cut when stored…'
    )
    assert.equal(requestTitleOf(chatRow({ request: { state: 'none' } })), null)
    assert.equal(requestTitleOf(chatRow({ origin: { source: 'comment', evidence: 'confirmed' } })), null)
    assert.equal(
      requestTitleOf(chatRow({ kind: 'cms-change', origin: { source: 'cms-admin', evidence: 'confirmed' } })),
      null
    )
  })

  test('which undo a row shows: the engine for a listed chat turn, today’s actions otherwise', () => {
    const ready = (answer) => ({
      status: 'ready',
      answer,
      signal: '',
      startedAt: 1,
      answerFrom: 1,
      undoing: false
    })
    assert.equal(requestUndoOf(chatRow(), undefined).kind, 'loading')
    assert.equal(requestUndoOf(chatRow(), { ...ready(null), status: 'failed', answer: null }).kind, 'legacy')
    // Not a chat turn, or no conversation: never asked.
    assert.equal(requestUndoOf(chatRow({ kind: 'cms-change' }), undefined).kind, 'legacy')
    assert.equal(requestUndoOf(chatRow({ conversation: null }), undefined).kind, 'legacy')
    // Someone else's chat the engine does not list for this seat: today's actions.
    assert.equal(requestUndoOf(chatRow(), ready(turnsAnswer([]))).kind, 'legacy')
    const latest = requestUndoOf(chatRow(), ready(turnsAnswer([turnRow({})])))
    assert.equal(latest.kind, 'engine')
    assert.equal(latest.card.kind, 'ready')
    assert.equal(latest.card.action, 'undo')
    const older = requestUndoOf(chatRow(), ready(turnsAnswer([turnRow({ latest: false })])))
    assert.equal(older.card.action, 'goBack')
    const emdash = requestUndoOf(chatRow(), ready(turnsAnswer([turnRow({})], { cms: 'emdash' })))
    assert.equal(emdash.card.kind, 'emdash')
  })

  test('Puts back: the files as the card says them, then each page by name, then "Content" once', () => {
    const turn = readTurnsAnswer(200, {
      turns: [
        turnRow(
          {},
          {
            files: { count: 2, commits: ['a'.repeat(40)], zones: { design: 2 } },
            content: [
              POST42,
              { ...POST42, applyId: 'r2' },
              { applyId: 'r3', action: 'content.contract', target: null }
            ]
          }
        )
      ]
    }).turns[0]
    assert.deepEqual(putsBackOf(turn, t), ['Design · 2 files', 'a page or post', 'Content'])
  })

  test('Puts back never names a record by its id: its kind and title, records that read the same counted', () => {
    // Council D1 (20/10/2026): "article 4" is a number the customer cannot look up from the chat.
    const article = (applyId, id, title = null) => ({
      applyId,
      action: 'content.update',
      target: { kind: 'article', id, title },
      at: null
    })
    const turn = readTurnsAnswer(200, {
      turns: [
        turnRow(
          {},
          { content: [article('r1', '4', 'Yêu chính mình'), article('r2', '5'), article('r3', '6')] }
        )
      ]
    }).turns[0]
    assert.deepEqual(putsBackOf(turn, t), ['article “Yêu chính mình”', 'an article', '+1 more'])
  })
})

// ── Mounted: the list, the row, the dialog ──────────────────────────────────────────────────────

/** jsdom, from a workspace member that declares it. */
function loadJsdom() {
  for (const home of ['vendor/tracy/dsh-better-sidebar', 'vendor/tracy/deepseek-harness']) {
    try {
      return createRequire(path.join(repo, home, 'package.json'))('jsdom')
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error('jsdom is not installed; run pnpm install')
}

let outDir = ''
/** @type {any} */
let lib
/** @type {any} */
let dom
const realFetch = globalThis.fetch

before(async () => {
  const { JSDOM } = loadJsdom()
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: `http://tracy.test/${SITE}/`
  })
  const { window } = dom
  for (const name of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'KeyboardEvent',
    'MouseEvent',
    'Event',
    'CustomEvent',
    'FocusEvent',
    'DocumentFragment',
    'MutationObserver',
    'getComputedStyle'
  ])
    Object.defineProperty(globalThis, name, {
      value: name === 'window' ? window : window[name],
      configurable: true,
      writable: true
    })
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = window.ResizeObserver = Observer
  globalThis.PointerEvent = window.PointerEvent = window.MouseEvent
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window)
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window)
  globalThis.CSS ??= { escape: (s) => String(s).replace(/["\\]/g, '\\$&') }
  window.CSS ??= globalThis.CSS
  globalThis.IS_REACT_ACT_ENVIRONMENT = false

  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'core-undo-request-'))
  const outfile = path.join(outDir, 'changes.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { createRoot } from 'react-dom/client'
        export { ChangesView } from './site-tabs/ChangesView'
        export { requestTitleOf } from './site-tabs/activity-v2'
        export { requestUndoOf } from './site-tabs/request-undo'
      `,
      resolveDir: path.join(repo, PACKAGE, 'src'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    nodePaths: [path.join(repo, PACKAGE, 'node_modules')],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  globalThis.fetch = realFetch
  if (outDir) rmSync(outDir, { recursive: true, force: true })
  dom?.window.close()
})

const mounted = []
afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) {
    root.unmount()
    await settle()
    host.remove()
  }
  document.body.replaceChildren()
  globalThis.fetch = realFetch
})

async function settle() {
  for (let turn = 0; turn < 6; turn++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * A fake server: `activity(filter, n)` answers the n-th list read, `turns(n)` the n-th turns read,
 * `undo(body)` the POST. Every call is recorded.
 */
function server({
  activity,
  turns = () => turnsAnswer([turnRow({})]),
  undo = () => [200, { ok: true, complete: true, turns: [] }]
}) {
  const calls = []
  let lists = 0
  let reads = 0
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://tracy.test')
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({
      method,
      path: url.pathname,
      search: url.search,
      body: init.body ? JSON.parse(init.body) : null,
      headers: init.headers ?? {}
    })
    const base = `/api/sites/${SITE}`
    if (method === 'GET' && url.pathname === `${base}/activity`)
      return json(200, activity(url.searchParams.get('filter'), ++lists))
    if (method === 'GET' && url.pathname === `${base}/turns`) return json(200, turns(++reads))
    if (method === 'POST' && url.pathname === `${base}/turns/undo`) {
      const [status, body] = undo(JSON.parse(init.body))
      return json(status, body)
    }
    if (method === 'GET' && url.pathname === `${base}/backups`) return json(200, { rows: [] })
    if (method === 'PUT' && url.pathname === `${base}/activity/seen`)
      return json(200, { seenAt: new Date().toISOString() })
    return json(404, { code: 'NOT_FOUND' })
  }
  return calls
}

async function mount(props = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = lib.createRoot(host)
  mounted.push({ root, host })
  root.render(
    lib.createElement(lib.ChangesView, {
      siteKey: SITE,
      role: 'owner',
      sites: [{ siteKey: SITE, role: 'owner' }],
      onPick: () => {},
      onAskRevert: async () => 'sent',
      t,
      ...props
    })
  )
  await settle()
  return host
}

const buttons = () => [...document.querySelectorAll('button')]
function button(name) {
  const found = buttons().filter(
    (b) => b.textContent.trim() === name || b.getAttribute('aria-label') === name
  )
  assert.equal(
    found.length,
    1,
    `expected one "${name}" button, found ${found.length}: ${buttons()
      .map((b) => b.textContent.trim())
      .join(' | ')}`
  )
  return found[0]
}
async function click(target) {
  const el = typeof target === 'string' ? button(target) : target
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await settle()
}
const text = () => document.body.textContent
/** Open the Chat row (its Description is the toggle). */
async function openChatRow() {
  await click(document.querySelector('[data-event="session-1:1"] .tv-activity-toggle'))
}

const PEOPLE = (filter) =>
  filter === 'people'
    ? page([chatRow()], { all: 5, chat: 1, automatic: 4 })
    : page(
        [
          chatRow(),
          {
            ...chatRow({
              id: 'auto-1',
              kind: 'cms-change',
              origin: { source: 'automatic', evidence: 'confirmed' },
              conversation: null,
              request: { state: 'none' },
              description: { key: 'change.recorded', params: {}, isRequestOnly: false }
            })
          }
        ],
        { all: 5, chat: 1, automatic: 4 }
      )

describe('mounted', () => {
  test('the list opens on People and Tracy, asked of the server, with the hidden line; Show is Type: All', async () => {
    const calls = server({ activity: PEOPLE })
    await mount()
    const first = calls.find((c) => c.path.endsWith('/activity'))
    assert.equal(
      new URLSearchParams(first.search).get('filter'),
      'people',
      'filtered by the server, not the client'
    )
    assert.ok(
      text().includes(t('event.filter', { source: t('event.filterPeople') })),
      'Type: People and Tracy'
    )
    assert.ok(text().includes(t('event.totalPeople.one', { count: 1 })), '1 change by people and Tracy')
    const line = document.querySelector('[data-hidden-automatic]')
    assert.ok(line, 'the hidden line is drawn')
    assert.ok(line.textContent.includes(t('event.hiddenAutomatic.many', { count: 4 })))
    // The watermark moves on the default view: the badge must not stay lit forever.
    assert.ok(calls.some((c) => c.method === 'PUT' && c.path.endsWith('/activity/seen')))
    await click(t('event.hiddenAutomaticShow'))
    const last = calls.filter((c) => c.path.endsWith('/activity')).at(-1)
    assert.equal(new URLSearchParams(last.search).get('filter'), 'all')
    assert.ok(text().includes(t('event.filter', { source: t('event.filterAll') })), 'Type: All')
    assert.equal(document.querySelector('[data-hidden-automatic]'), null, 'no hidden line under All')
  })

  // E2E dev 04/10 E9.2b: the side card keeps every tab mounted, so a Site changes tab behind the
  // Browser tab read its list when the workspace opened and put the badge out unseen. Reading is
  // fine; only a list on screen moves the watermark.
  test('a list read while its pane is hidden does not mark it seen; shown again, it does', async () => {
    const calls = server({ activity: PEOPLE })
    let shown = false
    const props = { isShown: () => shown }
    await mount(props)
    assert.ok(
      calls.some((c) => c.path.endsWith('/activity')),
      'the hidden list still reads'
    )
    const seen = () => calls.filter((c) => c.method === 'PUT' && c.path.endsWith('/activity/seen'))
    assert.equal(seen().length, 0, 'nobody looked: the watermark stays')
    // The person picks the tab: the pane is shown again and the list reads again.
    shown = true
    const { root } = mounted.at(-1)
    root.render(
      lib.createElement(lib.ChangesView, {
        siteKey: SITE,
        role: 'owner',
        sites: [{ siteKey: SITE, role: 'owner' }],
        onPick: () => {},
        onAskRevert: async () => 'sent',
        t,
        ...props,
        reloadKey: 1
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 250))
    await settle()
    assert.equal(seen().length, 1, 'the list on screen moves the watermark')
  })

  test('a Chat row is titled by the request and says what changed under it', async () => {
    server({ activity: PEOPLE })
    await mount()
    const row = document.querySelector('[data-event="session-1:1"]')
    const title = row.querySelector('[data-request-title]')
    assert.ok(title, 'the request is the title')
    assert.ok(title.textContent.startsWith('Change the homepage hero heading'))
    assert.equal(row.querySelector('.tv-activity-chip'), null, 'no Request chip on a request title')
    assert.equal(row.querySelector('[data-scope]').textContent, 'Updated post 42')
  })

  test('an opened Chat row has ONE undo button; the dialog says what goes back; Undo calls the engine', async () => {
    let lists = 0
    const calls = server({
      activity: (f) => {
        lists += 1
        return PEOPLE(f)
      }
    })
    const undone = []
    await mount({ onUndone: (key) => undone.push(key) })
    await openChatRow()
    const read = calls.find((c) => c.path.endsWith('/turns'))
    assert.equal(new URLSearchParams(read.search).get('session'), 'session-1')
    assert.ok(button(t('event.undoRequest')))
    assert.ok(button(t('event.openChat')))
    assert.equal(
      buttons().filter((b) => b.textContent.trim() === t('event.askRevert')).length,
      0,
      'no Ask beside a working Undo'
    )
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoFiles')).length, 0)
    assert.equal(document.querySelector('[data-no-undo]'), null, 'no "can’t be undone from here" line')

    await click(t('event.undoRequest'))
    const dialog = document.querySelector('[data-undo-request]')
    assert.ok(dialog, 'the confirm dialog is open')
    assert.ok(dialog.textContent.includes(t('undo.confirmTitle')))
    const who = dialog.querySelector('[data-undo-request-who]').textContent
    assert.ok(who.startsWith('“Change the homepage hero heading'))
    assert.ok(who.includes('Mai Tran'))
    assert.ok(dialog.querySelector('[data-puts-back]').textContent.includes(t('undo.putsBackTitle')))
    assert.deepEqual(
      [...dialog.querySelectorAll('[data-puts-back] li')].map((li) => li.textContent),
      ['a page or post']
    )
    assert.equal(dialog.querySelector('[data-undo-scope]').textContent, t('undo.scope'))
    const before = lists
    await click(dialog.querySelector('[data-undo-request-confirm]'))
    const post = calls.find((c) => c.method === 'POST')
    assert.equal(post.path, `/api/sites/${SITE}/turns/undo`)
    assert.deepEqual(
      { ...post.body, idemKey: undefined },
      { session: 'session-1', turnId: 'session-1:1', scope: 'turn', idemKey: undefined }
    )
    assert.equal(post.headers['x-tracy-session'], 'session-1')
    assert.equal(document.querySelector('[data-undo-request]'), null, 'the dialog closed')
    assert.ok(lists > before, 'the list read itself again')
    assert.deepEqual(undone, [SITE], 'the previews of the site reload')
  })

  test('an older request: Go back to before this request, scope from-here, the later requests named', async () => {
    const calls = server({
      activity: PEOPLE,
      turns: () =>
        turnsAnswer([
          turnRow({ latest: false }),
          turnRow({}, { turnId: 'session-1:2', turn: 2, title: 'Then make it blue' })
        ])
    })
    await mount()
    await openChatRow()
    await click(t('event.goBackRequest'))
    const dialog = document.querySelector('[data-undo-request]')
    assert.ok(dialog.textContent.includes(t('undo.confirmGoBackTitle')))
    assert.ok(
      dialog.querySelector('[data-also-later]').textContent.includes(t('undo.alsoLater.one', { count: 1 }))
    )
    assert.ok(dialog.querySelector('[data-also-later] li').textContent.includes('Then make it blue'))
    await click(dialog.querySelector('[data-undo-request-confirm]'))
    assert.equal(calls.find((c) => c.method === 'POST').body.scope, 'from-here')
  })

  test('blocked: the chat card’s sentence with who, what and when, and Ask Tracy to revert; no undo', async () => {
    server({
      activity: PEOPLE,
      turns: () =>
        turnsAnswer([
          turnRow({
            state: 'blocked',
            reasons: [
              {
                code: 'CONTENT_CHANGED_AFTER',
                via: 'cms-admin',
                by: 'sam@example.test',
                at: '2026-10-05T13:26:00.000Z',
                target: { kind: 'page', id: '7', title: 'Home' }
              }
            ]
          })
        ])
    })
    await mount()
    await openChatRow()
    const said = document.querySelector('[data-undo-blocked]')
    assert.equal(said.getAttribute('data-undo-blocked'), 'CONTENT_CHANGED_AFTER')
    assert.match(
      said.textContent,
      /^The site's content was edited after it: page “Home” in WordPress admin by sam@example\.test at .+\.$/
    )
    assert.ok(button(t('event.askRevert')))
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoRequest')).length, 0)
  })

  test('a turn the engine does not list keeps the row’s actions of before', async () => {
    server({ activity: PEOPLE, turns: () => turnsAnswer([]) })
    await mount()
    await openChatRow()
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoRequest')).length, 0)
    assert.ok(button(t('event.askRevert')), 'Ask Tracy to revert, as before')
    assert.ok(document.querySelector('[data-no-undo]'), 'and the sentence why not, as before')
  })

  // One undo path per row (coordinator 06/10): a Chat row the engine speaks for has no Undo file
  // changes, in its menu or its detail; a row the engine does not speak for keeps it.
  const SHA = 'c'.repeat(40)
  const withFiles = (over = {}) =>
    chatRow({
      effects: effects({
        content: group([{ type: 'post', id: '42', title: null, ops: ['update'] }]),
        files: { count: 1, sha: SHA, state: 'recorded' }
      }),
      capabilities: { canDiff: true, canUndoFiles: true, reasons: [] },
      evidence: { turnId: 'session-1:1', commitSha: SHA },
      ...over
    })
  const cmsMoment = {
    ...withFiles(),
    id: SHA,
    kind: 'git',
    origin: { source: 'unknown', evidence: 'unknown' },
    conversation: null,
    request: { state: 'none' },
    evidence: { commitSha: SHA },
    description: { key: 'files.changed', params: { files: 1 }, isRequestOnly: false }
  }
  /** Open the ⋯ menu of one row the way a keyboard does (focus first, then press) and read it. */
  async function menuOf(id) {
    const more = document.querySelector(`[data-event="${id}"] button[aria-label="${t('action.more')}"]`)
    more.focus()
    await settle()
    await click(more)
    return [...document.querySelectorAll('[role^="menuitem"]')].map((b) => b.textContent.trim())
  }

  test('a Chat row the engine lists: no Undo file changes in its menu or its detail, one undo button', async () => {
    const calls = server({ activity: () => page([withFiles()], { all: 1, chat: 1 }) })
    await mount()
    const items = await menuOf('session-1:1')
    assert.ok(
      calls.some((c) => c.path.endsWith('/turns')),
      'the menu asked the engine'
    )
    assert.ok(items.includes(t('event.copySha')))
    assert.ok(!items.includes(t('event.undoFiles')), `menu: ${items.join(' | ')}`)
    document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    await openChatRow()
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoFiles')).length, 0)
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoRequest')).length, 1)
  })

  test('rows the engine does not speak for keep Undo file changes on the row: an unlisted turn, a non-chat moment', async () => {
    server({
      activity: () => page([withFiles(), cmsMoment], { all: 2, chat: 1, unknown: 1 }),
      turns: () => turnsAnswer([])
    })
    await mount()
    /** Reach a row by keyboard (the engine is asked then) and read its own Undo button. */
    const rowUndo = async (id) => {
      const head = document.querySelector(`[data-event="${id}"] .tv-row-head`)
      head.querySelector('button').focus()
      await settle()
      return head.querySelector('[data-row-undo]')?.textContent.trim()
    }
    assert.equal(await rowUndo('session-1:1'), t('event.undoFiles'), 'someone else’s turn, not listed')
    assert.equal(await rowUndo(SHA), t('event.undoFiles'), 'a moment that is not a chat turn')
  })
  // Toolbar contract §4: a Chat row the undo engine took back says "Undone" (or "Partly undone")
  // where "File changes undone" stood — one label, never two — and offers no undo of any kind.
  test('a request the engine undid: one "Undone" label in place of the files status, no undo button', async () => {
    const at = '2026-10-06T08:00:00.000Z'
    const undoneRow = withFiles({
      reversal: { state: 'undone' },
      undone: { at, complete: true },
      capabilities: { canDiff: true, canUndoFiles: false, reasons: ['undone'] }
    })
    server({
      activity: () => page([undoneRow], { all: 1, chat: 1 }),
      turns: () => turnsAnswer([turnRow({ state: 'undone', latest: false })])
    })
    await mount()
    const scope = document.querySelector('[data-event="session-1:1"] [data-scope]')
    assert.equal(scope.textContent, t('event.status.undone'))
    assert.ok(!text().includes(t('event.status.filesUndone')), 'never the files label beside it')
    await openChatRow()
    for (const name of [t('event.undoRequest'), t('event.goBackRequest'), t('event.undoFiles')])
      assert.equal(buttons().filter((b) => b.textContent.trim() === name).length, 0, `no "${name}"`)
  })

  test('part of the request stayed: "Partly undone"', async () => {
    const partly = chatRow({ undone: { at: '2026-10-06T08:00:00.000Z', complete: false } })
    server({
      activity: () => page([partly], { all: 1, chat: 1 }),
      turns: () => turnsAnswer([turnRow({ state: 'undone', latest: false })])
    })
    await mount()
    const scope = document.querySelector('[data-event="session-1:1"] [data-scope]')
    assert.equal(scope.textContent, t('event.status.partlyUndone'))
  })
  // Toolbar contract §3: an undo pressed at another door (the chat card, the preview's Undo) is said
  // on the page; the list and the engine's answer for that chat read again, and nothing is said back.
  test('an undo said by another door of this site: the list and the engine read again, no echo', async () => {
    let undone = false
    const calls = server({
      activity: () =>
        page([undone ? chatRow({ undone: { at: '2026-10-06T08:00:00.000Z', complete: true } }) : chatRow()], {
          all: 1,
          chat: 1
        }),
      turns: () => turnsAnswer([turnRow(undone ? { state: 'undone', latest: false } : {})])
    })
    await mount()
    await openChatRow()
    assert.ok(button(t('event.undoRequest')))
    const lists = calls.filter((c) => c.path.endsWith('/activity')).length
    const reads = calls.filter((c) => c.path.endsWith('/turns')).length
    const said = []
    const hear = (e) => said.push(e.detail)
    window.addEventListener('tracy:turn-undone', hear)
    undone = true
    window.dispatchEvent(
      new window.CustomEvent('tracy:turn-undone', {
        detail: { sessionId: 'session-1', siteKey: SITE, turnIds: ['session-1:1'] }
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 250))
    await settle()
    window.removeEventListener('tracy:turn-undone', hear)
    assert.ok(calls.filter((c) => c.path.endsWith('/activity')).length > lists, 'the list read again')
    assert.ok(calls.filter((c) => c.path.endsWith('/turns')).length > reads, 'the engine read again')
    assert.equal(said.length, 1, 'only the one said; a read never says it again')
    assert.equal(calls.filter((c) => c.method === 'POST').length, 0)
    assert.equal(
      document.querySelector('[data-event="session-1:1"] [data-scope]').textContent,
      t('event.status.undone')
    )
    assert.equal(buttons().filter((b) => b.textContent.trim() === t('event.undoRequest')).length, 0)
  })

  test('another site’s undo is not this list’s business', async () => {
    const calls = server({ activity: PEOPLE })
    await mount()
    const lists = calls.filter((c) => c.path.endsWith('/activity')).length
    window.dispatchEvent(
      new window.CustomEvent('tracy:turn-undone', {
        detail: { sessionId: 'session-1', siteKey: 'other.tracy.test', turnIds: [] }
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 250))
    assert.equal(calls.filter((c) => c.path.endsWith('/activity')).length, lists)
  })

  test('this list’s own undo is said on the page for the other doors', async () => {
    server({ activity: PEOPLE })
    const said = []
    const hear = (e) => said.push(e.detail)
    window.addEventListener('tracy:turn-undone', hear)
    await mount()
    await openChatRow()
    await click(t('event.undoRequest'))
    await click(document.querySelector('[data-undo-request-confirm]'))
    window.removeEventListener('tracy:turn-undone', hear)
    assert.deepEqual(said, [{ sessionId: 'session-1', siteKey: SITE, turnIds: ['session-1:1'] }])
  })
})
