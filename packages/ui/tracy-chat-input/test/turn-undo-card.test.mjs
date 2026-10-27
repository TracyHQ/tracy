/**
 * The card under a chat turn, mounted (`TurnUndoCard.tsx`). It is bundled in memory and rendered
 * with react-dom on a linkedom document, over a fake turns door; what is proven is the card's own
 * behaviour (confirm inside the card, one POST, re-read, preview reload, Undone), not a live undo.
 * Harness copied from `interrupted-card.test.mjs`.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, afterEach, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const corePkg = path.resolve(pkgRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
const coreRequire = createRequire(path.join(corePkg, 'package.json'))
const { parseHTML } = createRequire(path.join(repoRoot, 'package.json'))('linkedom')

const SITE = 'demo.tracy.test'
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))
const GLOBALS = ['window', 'document', 'location', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']
const saved = new Map()
/** @type {any} */
let lib
/** @type {any} */
let dom
/** @type {(() => Promise<void>)[]} */
let cleanups = []

before(async () => {
  const built = await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement, act } from 'react'
        export { createRoot } from 'react-dom/client'
        export { TurnUndoCard } from './TurnUndoCard'
        export { createTurnsBook } from './turn-undo.mjs'
        export { en } from './strings'`,
      resolveDir: path.join(pkgRoot, 'src', 'client'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'],
    write: false,
    logLevel: 'silent'
  })
  for (const name of GLOBALS) saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  dom = parseHTML('<!doctype html><html><body></body></html>')
  const set = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
  set('window', dom.window)
  set('document', dom.document)
  set('location', { pathname: `/${SITE}/s/1` })
  set('IS_REACT_ACT_ENVIRONMENT', true)
  const mod = { exports: {} }
  const load = (id) => (id.startsWith('react-dom') ? coreRequire(id) : require(id))
  new Function('require', 'module', 'exports', built.outputFiles[0].text)(load, mod, mod.exports)
  lib = mod.exports
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

after(() => {
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete globalThis[name]
  }
})

const POST42 = { applyId: 'r1', action: 'content.update', target: { kind: 'post', id: '42', title: null } }
const turnRow = (undo, over = {}) => ({
  turnId: 'session-1:1',
  turn: 1,
  title: 'Change the hero heading',
  changed: true,
  files: { count: 0, commits: [], zones: {} },
  content: [POST42],
  undo: { latest: true, reasons: [], ...undo },
  ...over
})

/** Mount one card over a fake turns door whose answers come from `answers` in order (last repeats). */
async function mount({
  answers,
  undoAnswer = [200, { ok: true, complete: true, turns: [] }],
  props = {},
  turn = { turn: 1, end: { time: 1 } },
  book = lib.createTurnsBook(),
  /** Held until resolved: the POST answers only then. */
  postWait = null,
  /** Instead of `answers`: what the door says to the n-th read of `url` (may be a promise). */
  door = null,
  shared = null
}) {
  const reads = shared?.reads ?? []
  const posts = shared?.posts ?? []
  if (shared === null)
    globalThis.fetch = async (url, init) => {
      if (init?.method === 'POST') {
        posts.push({
          url: String(url),
          body: JSON.parse(init.body),
          session: init.headers['x-tracy-session']
        })
        if (postWait) await postWait
        return new Response(JSON.stringify(undoAnswer[1]), { status: undoAnswer[0] })
      }
      reads.push(String(url))
      const body = door
        ? await door(String(url), reads.length)
        : answers[Math.min(reads.length - 1, answers.length - 1)]
      return new Response(JSON.stringify(body), { status: 200 })
    }
  const reloads = []
  const host = dom.document.createElement('div')
  dom.document.body.appendChild(host)
  const root = lib.createRoot(host)
  let current = {}
  const render = (next = {}) =>
    lib.act(async () => {
      current = { ...current, ...next }
      root.render(
        lib.createElement(lib.TurnUndoCard, {
          turn,
          sessionId: 'session-1',
          book,
          view: () => {},
          openChanges: () => {},
          reloadPreviews: (id) => reloads.push(id),
          // No deploy record unless a test names one: the host half is not asked from here.
          readCut: async () => [],
          ...props,
          ...current
        })
      )
    })
  cleanups.push(async () => {
    await lib.act(async () => root.unmount())
    host.remove()
  })
  await render()
  await lib.act(async () => tick(10))
  const buttons = () => [...host.querySelectorAll('button')]
  const press = async (label) => {
    const button = buttons().find((b) => b.textContent === label)
    assert.ok(
      button,
      `no button "${label}" in: ${buttons()
        .map((b) => b.textContent)
        .join(' | ')}`
    )
    await lib.act(async () => {
      button.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
      await tick(10)
    })
    await lib.act(async () => tick(10))
  }
  /** Press the button labelled `label` `times` times in one tick, before React can redraw. */
  const pressMany = async (label, times) => {
    const button = buttons().find((b) => b.textContent === label)
    assert.ok(button, `no button "${label}"`)
    await lib.act(async () => {
      for (let i = 0; i < times; i += 1)
        button.dispatchEvent(new dom.window.Event('click', { bubbles: true, cancelable: true }))
      await tick(5)
    })
  }
  return {
    host,
    book,
    render,
    pressMany,
    reads,
    posts,
    reloads,
    buttons,
    press,
    state: () => host.querySelector('[data-undo-state]')?.getAttribute('data-undo-state')
  }
}

test('Undo asks inside the card, sends one POST for the latest turn, re-reads, reloads the preview, then shows Undone', async () => {
  const card = await mount({
    answers: [
      { cms: 'wordpress', turns: [turnRow({ state: 'available' })] },
      { cms: 'wordpress', turns: [turnRow({ state: 'undone', latest: false })] }
    ]
  })
  assert.equal(card.state(), 'ready')
  assert.match(card.host.textContent, /Changed on the site/)
  assert.match(card.host.textContent, /Content · a page or post/)
  await card.press('Undo')
  assert.equal(card.state(), 'confirm')
  assert.match(card.host.textContent, /Undo this request\?/)
  assert.match(card.host.textContent, /Puts back: Content · a page or post\./)
  assert.equal(card.posts.length, 0, 'nothing is sent before the confirmation')
  const confirm = card.buttons().filter((b) => b.textContent === 'Undo')
  assert.equal(confirm.length, 1)
  // Toolbar contract §3: the card's undo is said on the page for the other doors.
  const said = []
  const hear = (e) => said.push(e.detail)
  window.addEventListener('tracy:turn-undone', hear)
  await card.press('Undo')
  window.removeEventListener('tracy:turn-undone', hear)
  assert.deepEqual(said, [{ sessionId: 'session-1', siteKey: SITE, turnIds: ['session-1:1'] }])
  assert.equal(card.posts.length, 1)
  assert.deepEqual(
    [card.posts[0].url, card.posts[0].body.turnId, card.posts[0].body.scope, card.posts[0].session],
    [`/api/sites/${SITE}/turns/undo`, 'session-1:1', 'turn', 'session-1']
  )
  assert.equal(card.reads.length, 2, 'the turns are read again after the undo')
  assert.deepEqual(card.reloads, ['session-1'])
  assert.equal(card.state(), 'undone')
  assert.match(card.host.textContent, /Undone/)
  assert.equal(
    card.buttons().some((b) => b.textContent === 'Undo'),
    false,
    'no redo'
  )
})

test('Cancel sends nothing and goes back to the card', async () => {
  const card = await mount({ answers: [{ turns: [turnRow({ state: 'available' })] }] })
  await card.press('Undo')
  await card.press('Cancel')
  assert.equal(card.state(), 'ready')
  assert.equal(card.posts.length, 0)
})

test('an older turn goes back with scope from-here', async () => {
  const card = await mount({
    answers: [
      {
        turns: [
          turnRow({ state: 'available', latest: false }),
          turnRow({ state: 'available', latest: true }, { turn: 2, turnId: 'session-1:2' })
        ]
      }
    ]
  })
  await card.press('Go back to here')
  assert.match(card.host.textContent, /Also undoes 1 later request in this chat\./)
  await card.press('Go back')
  assert.equal(card.posts[0].body.scope, 'from-here')
})

test('a refusal leaves a line and reloads no preview', async () => {
  const card = await mount({
    answers: [{ turns: [turnRow({ state: 'available' })] }],
    undoAnswer: [409, { code: 'SITE_BUSY' }]
  })
  await card.press('Undo')
  await card.press('Undo')
  assert.deepEqual(card.reloads, [])
  assert.match(card.host.textContent, /Another change is running on this site/)
})

test('blocked: the warning, the sentence from the first reason, and Ask Tracy to revert sends to this chat', async () => {
  const sent = []
  const card = await mount({
    answers: [
      {
        cms: 'wordpress',
        turns: [
          turnRow({
            state: 'blocked',
            reasons: [{ code: 'LATER_TURN_BLOCKED' }]
          })
        ]
      }
    ],
    props: { askRevert: async (id, text) => (sent.push({ id, text }), 'sent') }
  })
  assert.equal(card.state(), 'blocked')
  assert.match(card.host.textContent, /Can't undo this request/)
  assert.match(card.host.textContent, /A later request in this chat can't be undone/)
  await card.press('Ask Tracy to revert')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].id, 'session-1')
  assert.ok(sent[0].text.startsWith('Revert “Change the hero heading”: only this change.'))
  assert.match(card.host.textContent, /Sent to Tracy/)
})

test('Tracy working: Undo is drawn off, with the sentence; a turn that changed nothing draws nothing', async () => {
  const card = await mount({
    answers: [{ siteBusy: true, turns: [turnRow({ state: 'blocked', reasons: [{ code: 'TURN_OPEN' }] })] }]
  })
  const undo = card.buttons().find((b) => b.textContent === 'Undo')
  assert.equal(undo?.hasAttribute('disabled'), true)
  assert.match(card.host.textContent, /Tracy is working on this site\. Undo is available when it finishes\./)
  const none = await mount({ answers: [{ turns: [turnRow({ state: 'none' }, { changed: false })] }] })
  assert.equal(none.host.textContent, '')
})

test('an interrupted turn: one card, with the interrupted line and Continue through the composer', async () => {
  const drafts = []
  let submitted = 0
  const asked = []
  const card = await mount({
    answers: [{ turns: [turnRow({ state: 'available' })] }],
    turn: {
      turn: 1,
      start: { time: 1_000 },
      end: { time: 9_000, data: { reason: { kind: 'interrupted' } } }
    },
    props: {
      inputActions: { setDraft: (text) => drafts.push(text), submit: () => (submitted += 1) },
      // A deploy cut a turn of this chat at 5 s, while this one ran (#1403 item 11).
      readCut: async (id) => {
        asked.push(id)
        return [5_000]
      }
    }
  })
  assert.deepEqual(asked, ['session-1'])
  assert.match(card.host.textContent, /This request was interrupted by a Tracy update\./)
  await card.press('Continue')
  await lib.act(async () => tick(80))
  assert.equal(submitted, 1)
  assert.match(drafts[0], /still on the site: r1\./)
})

// #1403 item 11: a crash or a host reboot is no update; the card blamed one for every interruption.
test('an interrupted turn no deploy cut: "when Tracy restarted", never an update', async () => {
  // No record; a cut after this turn's end; a cut long before it began.
  for (const cutAt of [[], [200_000], [100]]) {
    const card = await mount({
      answers: [{ turns: [turnRow({ state: 'available' })] }],
      turn: {
        turn: 1,
        start: { time: 10_000 },
        end: { time: 90_000, data: { reason: { kind: 'interrupted' } } }
      },
      props: { readCut: async () => cutAt }
    })
    assert.match(card.host.textContent, /This request was interrupted when Tracy restarted\./, String(cutAt))
    assert.doesNotMatch(card.host.textContent, /Tracy update/)
  }
})

test('NOTHING_TO_UNDO: no line, the turns are read again and the card redraws from the answer', async () => {
  const card = await mount({
    answers: [
      { turns: [turnRow({ state: 'available' })] },
      { turns: [turnRow({ state: 'undone', latest: false })] }
    ],
    undoAnswer: [409, { code: 'NOTHING_TO_UNDO' }]
  })
  await card.press('Undo')
  await card.press('Undo')
  assert.equal(card.reads.length, 2)
  assert.equal(card.state(), 'undone')
  assert.equal(card.host.querySelector('[role="status"]'), null)
})

test('in flight: a second confirm starts no second POST, and no other card of the chat can start an undo', async () => {
  let release
  const postWait = new Promise((resolve) => (release = resolve))
  const answer = {
    turns: [
      turnRow({ state: 'available', latest: false }),
      turnRow({ state: 'available', latest: true }, { turn: 2, turnId: 'session-1:2' })
    ]
  }
  const latest = await mount({ answers: [answer], postWait, turn: { turn: 2, end: { time: 2 } } })
  const older = await mount({
    answers: [answer],
    book: latest.book,
    shared: latest,
    turn: { turn: 1, end: { time: 1 } }
  })
  await older.press('Go back to here')
  assert.equal(older.state(), 'confirm')
  await latest.press('Undo')
  await latest.pressMany('Undo', 3)
  assert.equal(latest.posts.length, 1, 'one POST however often the confirm is pressed')
  assert.equal(latest.state(), 'undoing')
  const goBack = older.buttons().find((b) => b.textContent === 'Go back')
  assert.equal(goBack?.hasAttribute('disabled'), true, "another card's confirm is off while the undo runs")
  await older.pressMany('Go back', 2)
  assert.equal(latest.posts.length, 1, 'no second undo from another card of the chat')
  release()
  await lib.act(async () => tick(20))
  assert.equal(latest.posts.length, 1)
})

test('a card shown for another chat, or back to one, draws no Undo until a fresh read of that chat answered', async () => {
  /** @type {Map<string, (body: unknown) => void>} */
  const held = new Map()
  let holdNext = null
  const door = (url, n) => {
    const session = new URL(url, 'http://x').searchParams.get('session')
    const body = { turns: [turnRow({ state: 'available' }, { turnId: `${session}:1` })] }
    if (holdNext === session)
      return new Promise((resolve) => held.set(`${session}#${n}`, () => resolve(body)))
    return body
  }
  const card = await mount({ answers: [], door })
  assert.equal(card.state(), 'ready')
  const readsBefore = card.reads.length
  holdNext = 'session-2'
  await card.render({ sessionId: 'session-2' })
  await lib.act(async () => tick(10))
  assert.equal(card.host.textContent, '', 'nothing from session-1 is shown for session-2')
  assert.ok(card.reads.some((u) => u.includes('session=session-2')))
  // Back to session-1 before session-2 answered: the earlier session-1 answer is not reused.
  holdNext = 'session-1'
  await card.render({ sessionId: 'session-1' })
  await lib.act(async () => tick(10))
  assert.equal(card.host.textContent, '', 'the first visit to session-1 is not offered again')
  assert.ok(card.reads.length > readsBefore + 1, 'session-1 is read again')
  // The late session-2 answer arrives: still nothing drawn for session-1.
  for (const [key, resolve] of held) if (key.startsWith('session-2')) resolve()
  await lib.act(async () => tick(10))
  assert.equal(card.host.textContent, '')
  for (const [key, resolve] of held) if (key.startsWith('session-1')) resolve()
  await lib.act(async () => tick(10))
  assert.equal(card.state(), 'ready')
  const undo = card.buttons().find((b) => b.textContent === 'Undo')
  assert.equal(undo?.hasAttribute('disabled'), false)
})
