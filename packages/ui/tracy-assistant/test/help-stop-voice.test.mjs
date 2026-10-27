/**
 * Help's stop and the microphone share dsh's `conversation.input.activity` (#1379). Seen 15/10/2026 on
 * the dev deployment: while a /help answer streamed, the seat was empty and nothing could stop Help.
 * The seat is a dsh `single` slot: only its lowest-priority registration renders, and one that draws
 * nothing still holds it (`SlotCore.entriesOfSlot` in the fork's `ui-slots`). The microphone sits at
 * -1, so a registration of Help's own there never rendered.
 *
 * Pinned here with both real plugins: each `apply` runs over a stand-in dsh whose seat keeps that
 * rule, the winner is rendered with `react-dom/client` into a linkedom document, and the page's
 * `/api/speech` and `/api/ui` answers decide whether voice is available. The two plugins are built
 * as two bundles sharing one React, as on the page, so what they share has to cross bundles too.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const assistantRoot = path.join(here, '..')
const chatInputRoot = path.resolve(assistantRoot, '..', 'tracy-chat-input')
const corePkg = path.resolve(assistantRoot, '..', '..', 'core', 'tracy-core')
const require = createRequire(import.meta.url)
const { parseHTML } = createRequire(path.join(assistantRoot, '..', '..', '..', 'package.json'))('linkedom')
const SEAT = 'conversation.input.activity'
const VOICE_SWITCH = 'composer-voice-input'

let outDir = ''
let assistantFile = ''
let chatInputFile = ''

/** One React for both bundles, as dsh's host shares one: every import of it is the same file. */
const oneReact = {
  name: 'one-react',
  setup(build) {
    const fromCore = createRequire(path.join(corePkg, 'package.json'))
    build.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (args) => ({
      path: fromCore.resolve(args.path),
      external: true
    }))
  }
}

const bundle = (root, contents, outfile) =>
  require('esbuild').build({
    stdin: { contents, resolveDir: path.join(root, 'src', 'client'), loader: 'tsx' },
    absWorkingDir: root,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    loader: { '.css': 'local-css' },
    plugins: [oneReact],
    outfile,
    logLevel: 'silent'
  })

before(async () => {
  // The real path: `require.cache` keys by it, and macOS's tmpdir is a symlink.
  outDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'tracy-help-stop-voice-')))
  assistantFile = path.join(outDir, 'assistant.cjs')
  chatInputFile = path.join(outDir, 'chat-input.cjs')
  await bundle(
    assistantRoot,
    `
      export { apply } from './index'
      export { helpFor, HELP_KIND } from './help'
    `,
    assistantFile
  )
  await bundle(chatInputRoot, `export { apply } from './index'`, chatInputFile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** English for Help's strings; a key English lacks comes back as itself. */
const t = (key) => String(en[key] ?? key)

/**
 * A fresh page: a linkedom document, the two doors voice reads, and both plugins loaded anew (their
 * per-page reads, such as `/api/speech`, start over).
 */
function page({ speech, hidden = [] }) {
  const { window, document } = parseHTML('<!doctype html><html><head></head><body></body></html>')
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
  globalThis.getComputedStyle = () => ({ overflowY: 'visible' })
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u === '/api/speech')
      return Response.json({ available: speech, sessionSeconds: 120, silenceSeconds: 10 })
    if (u.startsWith('/api/ui')) return Response.json({ hidden })
    return new Response('not found', { status: 404 })
  }
  for (const file of [assistantFile, chatInputFile]) delete require.cache[file]
  return { assistant: require(assistantFile), chatInput: require(chatInputFile) }
}

/** A stand-in dsh with the seat's rule: per slot, the lowest priority renders; ties keep the first. */
function standIn() {
  const entries = new Map()
  const effects = []
  const register = (spec, component) => {
    const list = entries.get(spec.name) ?? []
    list.push({ priority: spec.priority ?? 0, component })
    list.sort((a, b) => a.priority - b.priority)
    entries.set(spec.name, list)
    return () => {}
  }
  const slots = { inject: (_name, fn) => fn(), register }
  return {
    slots,
    effects,
    winner: (name) => entries.get(name)?.[0]?.component
  }
}

/** Apply both plugins (or Help alone) over one stand-in; Help's rows of session `s1` are `nodes`. */
function applyBoth(lib, { chatInput = true } = {}) {
  const dsh = standIn()
  const nodes = []
  lib.assistant.apply({
    effect: (fn) => dsh.effects.push(fn),
    get: () => undefined,
    slots: dsh.slots,
    locale: { register: () => () => {}, bind: () => t, subscribe: () => () => {} },
    commandUi: { register: () => () => {} },
    chatLocal: {
      AnswerActions: () => null,
      for: () => ({
        upsert() {},
        remove() {},
        tailSeq: () => 0,
        nodes: { subscribe: () => () => {}, getSnapshot: () => nodes }
      })
    },
    sessions: { subagentAddress: () => 'subagent' }
  })
  if (chatInput)
    lib.chatInput.apply({
      // chat-input's effects touch the page (style tags, shell trim, listeners); its seat needs none.
      effect: () => {},
      betterSidebar: { getTab: () => undefined, openTab: () => {}, subscribe: () => () => {} },
      sessions: { binding: () => undefined },
      conversation: { sendSession: async () => ({ kind: 'sent' }) },
      uiConversation: { userTextFolds: { register: () => () => {} } },
      slots: dsh.slots,
      locale: { register: () => () => {}, bind: () => (key) => key }
    })
  // Help's effects: the dictionaries, the stylesheet, the /help command, and its piece of the seat.
  for (const fn of dsh.effects) fn()
  return { seat: dsh.winner(SEAT), nodes }
}

/** A real Help controller for `s1`, its stop swapped for a recorder. */
function recordingStop(lib) {
  const calls = []
  const controller = lib.assistant.helpFor({
    sessionId: 's1',
    rows: { upsert() {}, remove() {}, tailSeq: () => 0 },
    fetch: async () => {
      throw new Error('no network in this test')
    },
    site: () => null,
    transcriptShown: () => false,
    report: { t, env: () => ({}) }
  })
  controller.stopAll = () => calls.push('stopAll')
  return calls
}

const streaming = (lib) => ({
  key: 'r1',
  kind: lib.assistant.HELP_KIND,
  data: {
    variant: 'turn',
    sessionId: 's1',
    rowId: 'r1',
    question: 'How?',
    answer: '',
    status: 'streaming',
    links: []
  }
})

/** Mount the seat's winner as dsh's composer would, let the page's reads answer, read what it drew. */
async function drawSeat(seat) {
  const { act, createElement } = require(createRequire(path.join(corePkg, 'package.json')).resolve('react'))
  const { createRoot } = require(
    createRequire(path.join(corePkg, 'package.json')).resolve('react-dom/client')
  )
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(seat, { sessionId: 's1', locked: false, onActiveChange: () => {}, t: (k) => k })
    )
  })
  // `/api/speech` and `/api/ui` answer on later ticks.
  for (let i = 0; i < 5; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
  return {
    container,
    html: () => container.innerHTML,
    unmount: () => act(() => root.unmount())
  }
}

test('Help streaming with voice registered but no speech key: the seat shows Help stop, and it stops Help', async () => {
  const lib = page({ speech: false })
  const { seat, nodes } = applyBoth(lib)
  assert.ok(seat, `nothing renders in ${SEAT}`)
  const calls = recordingStop(lib)
  nodes.push(streaming(lib))
  const drawn = await drawSeat(seat)
  const stop = drawn.container.querySelector('.tv-help-stop')
  assert.ok(stop, `no .tv-help-stop in the seat: ${drawn.html()}`)
  assert.equal(stop.getAttribute('aria-label'), t('action.stopAnswer'))
  assert.equal(drawn.container.querySelector('.tv-voice-mic'), null)
  stop.click()
  assert.deepEqual(calls, ['stopAll'])
  await drawn.unmount()
})

test('Help streaming with voice switched off by the operator: the seat shows Help stop only', async () => {
  const lib = page({ speech: true, hidden: [VOICE_SWITCH] })
  const { seat, nodes } = applyBoth(lib)
  nodes.push(streaming(lib))
  const drawn = await drawSeat(seat)
  assert.ok(drawn.container.querySelector('.tv-help-stop'), drawn.html())
  assert.equal(drawn.container.querySelector('.tv-voice-mic'), null)
  await drawn.unmount()
})

test('Help streaming with voice available: the microphone and, after it, Help stop', async () => {
  const lib = page({ speech: true })
  const { seat, nodes } = applyBoth(lib)
  nodes.push(streaming(lib))
  const drawn = await drawSeat(seat)
  assert.match(drawn.html(), /class="tv-voice-mic"[\s\S]*class="tv-help-stop"/)
  // One row holds both, so they stay side by side when dsh lays the seat out as a block while recording.
  const row = drawn.container.querySelector('.tv-voice-seat')
  assert.ok(row, drawn.html())
  assert.deepEqual(
    [...row.children].map((el) => el.className),
    ['tv-voice', 'tv-help-stop']
  )
  assert.equal(drawn.container.querySelectorAll('.tv-help-stop').length, 1)
  await drawn.unmount()
})

test('Help idle: the microphone alone when voice is available, an empty, hidden row when it is not', async () => {
  {
    const lib = page({ speech: true })
    const drawn = await drawSeat(applyBoth(lib).seat)
    assert.ok(drawn.container.querySelector('.tv-voice-mic'), drawn.html())
    assert.equal(drawn.container.querySelector('.tv-help-stop'), null)
    await drawn.unmount()
  }
  {
    const lib = page({ speech: false })
    const drawn = await drawSeat(applyBoth(lib).seat)
    // Only chat-input's empty row, which its stylesheet hides (`.tv-voice-seat:empty`).
    assert.equal(drawn.html(), '<div class="tv-voice-seat"></div>')
    await drawn.unmount()
  }
})

test('Help without chat-input on the profile: Help holds the seat itself and draws its stop once', async () => {
  const lib = page({ speech: true })
  const { seat, nodes } = applyBoth(lib, { chatInput: false })
  assert.ok(seat, `nothing renders in ${SEAT}`)
  const calls = recordingStop(lib)
  {
    const drawn = await drawSeat(seat)
    assert.equal(drawn.html(), '')
    await drawn.unmount()
  }
  nodes.push(streaming(lib))
  const drawn = await drawSeat(seat)
  const stops = drawn.container.querySelectorAll('.tv-help-stop')
  assert.equal(stops.length, 1, drawn.html())
  assert.equal(drawn.container.querySelector('.tv-voice-mic'), null)
  stops[0].click()
  assert.deepEqual(calls, ['stopAll'])
  await drawn.unmount()
})
