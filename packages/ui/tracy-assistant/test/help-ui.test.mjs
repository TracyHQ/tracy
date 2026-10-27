/**
 * What a bare /help, a Help row, its stop and a Copy box are made of: the real components rendered
 * (`HelpNode.tsx`, `HelpStop.tsx`, and the slot entries `index.tsx` registers, built with esbuild and
 * rendered with `react-dom/client` into a linkedom document), and the stylesheet they ship (`styles.ts`). The stylesheet is
 * read as the value the plugin injects: no layout engine runs here (the browser check of the strip is
 * `e2e/help-strip-scroll.test.mjs`).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en } from '../src/client/strings.ts'
import { CSS } from '../src/client/styles.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
const require = createRequire(import.meta.url)
const { parseHTML } = createRequire(path.join(here, '..', '..', '..', '..', 'package.json'))('linkedom')
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  const { window, document } = parseHTML('<!doctype html><html><head></head><body></body></html>')
  Object.assign(globalThis, { window, document, IS_REACT_ACT_ENVIRONMENT: true })
  // linkedom lays nothing out: no element scrolls, so the dock's fit (dock-fit.ts) finds no scroller.
  globalThis.getComputedStyle = () => ({ overflowY: 'visible' })
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-help-ui-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { act, createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        export { createElement as h }
        /** Mount an element, read what it drew, unmount it. */
        export function markup(element) {
          const container = document.createElement('div')
          const root = createRoot(container)
          act(() => root.render(element))
          const html = container.innerHTML
          act(() => root.unmount())
          return html
        }
        export { HelpNode } from './HelpNode'
        export { HelpStop } from './HelpStop'
        export { helpFor, forgetHelp, HELP_KIND } from './help'
        export { apply } from './index'
        export { uiSwitches } from '@tracy/core/ui-switches'
        export { OnboardingComposer } from './OnboardingComposer'
        export { act } from 'react'
        export const propsOf = (node) => node[Object.keys(node).find((key) => key.startsWith('__reactProps$'))]
        export function mount(element) {
          const container = document.createElement('div'); document.body.appendChild(container)
          const root = createRoot(container)
          act(() => root.render(element))
          return { container, update: (element) => act(() => root.render(element)), stop: () => { act(() => root.unmount()); container.remove() } }
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    plugins: [
      {
        name: 'native-react',
        setup(build) {
          build.onResolve({ filter: /^react(?:-dom)?(?:\/.*)?$/ }, (args) => ({
            path: require.resolve(args.path),
            external: true
          }))
        }
      }
    ],
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** English, with `{name}` holes filled; a key English lacks comes back as itself. */
const t = (key, params = {}) =>
  String(en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''))
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/** One Help row's data; `over` replaces any field. */
const row = (over = {}) => ({
  variant: 'turn',
  sessionId: 's1',
  rowId: 'r1',
  question: 'How do I add a page?',
  answer: '',
  status: 'done',
  links: [],
  ...over
})

/** A row drawn by `HelpNode`, with a stand-in for dsh's action row that records what it was given. */
function drawRow(data, deps = {}) {
  const actions = []
  const Actions = (props) => {
    actions.push(props)
    return null
  }
  const html = lib.markup(lib.h(lib.HelpNode, { node: { data, anchorSeq: 7 }, t, Actions, ...deps }))
  return { html, actions }
}

/** A real controller for session `id`, its stop and rating swapped for recorders. */
function recordingController(id) {
  const calls = []
  const controller = lib.helpFor({
    sessionId: id,
    rows: { upsert() {}, remove() {}, tailSeq: () => 0 },
    fetch: async () => {
      throw new Error('no network in this test')
    },
    site: () => null,
    transcriptShown: () => false,
    report: { t, env: () => ({}) }
  })
  controller.stopAll = () => calls.push(['stopAll'])
  controller.rate = (rowId, value) => calls.push(['rate', rowId, value])
  return calls
}

/** `apply` over a stand-in dsh: what it registers, by slot, and the /help command it adds. */
function applied({ onboarding = false, subagent = true } = {}) {
  if (onboarding) lib.forgetHelp('tracy-onboarding-help')
  let base = document.querySelector('base')
  if (!base) {
    base = document.createElement('base')
    document.head.appendChild(base)
  }
  base.setAttribute(
    'href',
    onboarding ? 'http://tracy.test:51710/new/' : 'http://tracy.test:51710/example.com/'
  )
  const effects = new Map()
  const injected = new Map()
  const registered = new Map()
  let command
  const actions = []
  const AnswerActions = (props) => {
    actions.push(props)
    return null
  }
  const nodes = []
  let snapshot = nodes
  const listeners = new Set()
  const notifyNodes = () =>
    lib.act(() => {
      snapshot = nodes.slice()
      for (const listener of listeners) listener()
    })
  const ctx = {
    effect: (fn, label) => effects.set(label, fn),
    get: () => undefined,
    slots: {
      inject: (name, fn) => injected.set(name, fn),
      register: (spec, component) => {
        registered.set(spec.name, { spec, component })
        return () => {}
      }
    },
    locale: {
      register: () => {},
      bind: (ns) => (ns === 'feedback' ? (key) => `feedback:${key}` : t),
      subscribe: () => () => {}
    },
    commandUi: {
      register: (contribution) => {
        command = contribution
        return () => {}
      }
    },
    chatLocal: {
      AnswerActions,
      for: () => ({
        upsert() {},
        remove() {},
        tailSeq: () => 0,
        nodes: {
          subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
          getSnapshot: () => snapshot
        }
      })
    },
    // Every session reads as a subagent's, so nothing restores Help rows over the network.
    sessions: { subagentAddress: () => (subagent ? 'subagent' : undefined) }
  }
  lib.apply(ctx)
  effects.get('tracy-assistant: /help command')()
  for (const fn of injected.values()) fn()
  return { registered, command, actions, nodes, effects, notifyNodes }
}

const rule = (selector) => {
  const start = CSS.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `${selector} has a rule`)
  return CSS.slice(start, CSS.indexOf('}', start))
}

test('a bare /help carries no sentence of its own: the chat box hint already says how to type /help', () => {
  assert.equal('greeting.hello' in en, false)
  assert.equal('greeting.hint' in en, false)
  // Only the questions to press and the way to a person.
  const { html } = drawRow(row({ variant: 'greeting', question: '' }))
  assert.equal(
    text(html),
    ['chip.what', 'chip.undo', 'chip.sites', 'chip.report', 'discord.label'].map((key) => t(key)).join(' ')
  )
})

test('a Copy box is one row: text and the button side by side, no room kept under the text', () => {
  const box = rule('.tv-help-copy')
  assert.match(box, /display: flex/)
  assert.match(box, /align-items: flex-start/)
  const text = rule('.tv-help-copy pre')
  // Lines stay as written and a long one scrolls inside the box, so a one-line sample stays one line.
  assert.match(text, /white-space: pre;/)
  assert.match(text, /overflow-x: auto/)
  assert.match(text, /min-width: 0/)
  assert.doesNotMatch(text, /padding: [^;]*34px/)
  const button = rule('.tv-help-copy-button')
  assert.match(button, /flex: none/)
  assert.doesNotMatch(button, /position: absolute/)
})

test('one gap separates any two blocks of an answer, a Copy box included', () => {
  assert.match(CSS, /\.tv-help-answer > \* \+ \* \{ margin-top: 8px; \}/)
  // The gap only works if nothing of equal or higher specificity zeroes the margin of a paragraph or a list
  // (measured 08/10/2026: `.tv-help-answer p { margin: 0 }` did, and the paragraphs of an answer ran together).
  assert.match(CSS, /\.tv-help-answer :where\(p, ul, ol\) \{ margin: 0; \}/)
  assert.doesNotMatch(CSS, /\.tv-help-answer (p|ul|ol)(, \.tv-help-answer (p|ul|ol))* \{[^}]*margin: 0/)
})

test('the Help strip has no height cap of its own: the start cards are gone by then', () => {
  assert.doesNotMatch(rule('.tv-help-dock'), /max-height/)
})

test("the Help strip is as wide as the chat box: dsh's own cap and clearance, not a fixed width", () => {
  const dock = rule('.tv-help-dock')
  // The chat box is capped by --dsh-composer-card-max-width, which grows with the column (680 to 952px); a fixed
  // width put the Help rows 59px right of the box at 1440 and 44px left of it at 1000.
  assert.match(
    dock,
    /max-width: calc\(var\(--dsh-composer-card-max-width, \d+px\) \+ 2 \* var\(--dsh-composer-side-clearance, \d+px\)\)/
  )
  assert.match(dock, /padding: 0 calc\(var\(--dsh-composer-side-clearance, \d+px\) \+ 16px\)/)
  assert.doesNotMatch(dock, /max-width: \d+px/)
})

test('a Help row has no stop button of its own: stopping an answer is the chat box button', () => {
  const { html } = drawRow(row({ status: 'streaming', answer: 'Open Pages' }))
  assert.doesNotMatch(html, /<button/)
  // The chat box's seat right before Stop/Send holds the stop, and only while an answer is written. The
  // stop goes into the page's `@tracy/core/input-activity` list, which chat-input's microphone (-1) draws
  // after itself; Help's own registration, at the default priority, draws the list when chat-input is
  // not loaded (#1379; both plugins together: `help-stop-voice.test.mjs`).
  const { registered, nodes, effects } = applied()
  const seat = registered.get('conversation.input.activity')
  assert.ok(seat, 'Help registers no fallback in conversation.input.activity')
  assert.equal(seat.spec.priority, undefined)
  effects.get('tracy-assistant: help stop')()
  const pieces = document[Symbol.for('tracy.input-activity')].list()
  const Stop = pieces.find((p) => p.id === 'tracy-help-stop')?.Component
  assert.ok(Stop, 'Help stop is not in the input-activity list')
  assert.equal(lib.markup(lib.h(Stop, { sessionId: 's2' })), '')
  nodes.push({
    key: 'r9',
    kind: lib.HELP_KIND,
    data: row({ sessionId: 's2', rowId: 'r9', status: 'streaming' })
  })
  const stop = lib.markup(lib.h(Stop, { sessionId: 's2' }))
  assert.match(stop, /class="tv-help-stop"/)
  assert.match(stop, new RegExp(`aria-label="${t('action.stopAnswer')}"`))
  // The fallback occupant draws exactly that, once.
  assert.equal(lib.markup(lib.h(seat.component, { sessionId: 's2' })), stop)
})

test('the stop takes the seat of dsh primary while that is disabled, and turns quiet beside a live one', () => {
  const stop = rule('.tv-help-stop')
  assert.match(stop, /width: 32px; height: 32px/)
  assert.match(stop, /border-radius: 999px/)
  assert.match(stop, /background: var\(--dsw-alias-brand-primary, #bf5b3d\)/)
  assert.match(
    CSS,
    /\[data-slot="conversation\.composer\.bar"\] \[class\*="_trailing"\]:has\(\.tv-help-stop\) \[class\*="_primary"\]:disabled \{ display: none; \}/
  )
  const quiet = rule(
    '[data-slot="conversation.composer.bar"] [class*="_trailing"]:has([class*="_primary"]:not(:disabled) > svg > path) .tv-help-stop'
  )
  assert.match(quiet, /background: transparent/)
  assert.match(quiet, /box-shadow: inset 0 0 0 1px/)
  // Focus is one 1px stroke, never a halo.
  assert.match(rule('.tv-help-stop:focus-visible'), /outline: 1px solid/)
})

test('a bare /help after the chat began draws the person /help and one sentence, no suggestions', () => {
  const { html } = drawRow(row({ variant: 'askBack', question: '' }))
  assert.equal(text(html), `/help ${t('askBack.text')}`)
})

test('/help claims its token in the chat box with a translated ghost hint', () => {
  const { command } = applied()
  assert.equal(command.name, 'help')
  assert.equal(command.ui.takesText, true)
  assert.equal(command.ui.hint(), t('command.hint'))
})

test('one orange button: while Help runs, dsh stop buttons step aside, so a second press reaches the agent', () => {
  // dsh draws its stops (the primary as stop, and the independent stop beside Send) with a square <rect>;
  // Send draws an arrow <path>. Language-independent, unlike the buttons' labels.
  assert.match(
    CSS,
    /\[data-slot="conversation\.composer\.bar"\] \[class\*="_trailing"\]:has\(\.tv-help-stop\) \[class\*="_primary"\]:has\(> svg > rect\) \{ display: none; \}/
  )
  // The Help stop stops everything Help is doing, not only the answer being written.
  const calls = recordingController('s3')
  let press
  const Probe = (props) => {
    const button = lib.HelpStop(props)
    press = button?.props.onClick
    return button
  }
  const nodes = [{ key: 'r1', kind: lib.HELP_KIND, data: row({ sessionId: 's3', status: 'streaming' }) }]
  const local = { nodes: { subscribe: () => () => {}, getSnapshot: () => nodes } }
  lib.markup(lib.h(Probe, { sessionId: 's3', local, t }))
  press()
  assert.deepEqual(calls, [['stopAll']])
})

test("a finished answer ends with dsh's own action row: copy, thumbs, branch, clock (David, 12/10/2026)", () => {
  // No rating strings of Help's own: the row and its words are dsh's (the feedback namespace).
  for (const key of ['action.good', 'action.bad']) assert.equal(key in en, false, key)
  const calls = recordingController('s4')
  const { registered, actions } = applied()
  const Node = registered.get('conversation.chat.node')?.component
  assert.ok(Node, 'nothing registered in conversation.chat.node')
  const done = row({
    sessionId: 's4',
    rowId: 'r4',
    answer: 'Open **Pages**.',
    answerId: 5,
    at: 1700,
    rating: 1
  })
  const html = lib.markup(lib.h(Node, { node: { data: done, anchorSeq: 7 }, t }))
  assert.match(html, /<strong>Pages<\/strong>/)
  assert.equal(actions.length, 1)
  const [row4] = actions
  assert.deepEqual([row4.sessionId, row4.text, row4.time, row4.branchAt], ['s4', 'Open **Pages**.', 1700, 7])
  assert.equal(row4.feedback.rating, 'positive')
  assert.deepEqual(row4.feedback.labels, {
    like: 'feedback:action.like',
    likeActive: 'feedback:action.likeActive',
    dislike: 'feedback:action.dislike',
    dislikeActive: 'feedback:action.dislikeActive'
  })
  row4.feedback.rate('negative')
  assert.deepEqual(calls, [['rate', 'r4', -1]])
  // Only an answer the server stored can be rated; one still being written has no row at all. (That a
  // rating reaches tracy-web's door is help.test.mjs 'rating: the answer id comes from done, …'.)
  lib.markup(lib.h(Node, { node: { data: { ...done, answerId: undefined }, anchorSeq: 7 }, t }))
  assert.equal(actions[1].feedback, undefined)
  lib.markup(lib.h(Node, { node: { data: { ...done, status: 'streaming' }, anchorSeq: 7 }, t }))
  assert.equal(actions.length, 2)
})

test('on the start screen each Help row sits in a flow item of its own and cannot branch', () => {
  const { registered, nodes, actions } = applied()
  const Boot = registered.get('conversation.input.dock')?.component
  assert.ok(Boot, 'nothing registered in conversation.input.dock')
  // A row with a place in the transcript: on the start screen it still offers nothing to branch from.
  nodes.push({
    key: 'r5',
    kind: lib.HELP_KIND,
    anchorSeq: 3,
    data: row({ sessionId: 's5', rowId: 'r5', answer: 'Yes.', answerId: 6 })
  })
  const html = lib.markup(lib.h(Boot, { sessionId: 's5', session: { blank: true } }))
  const item = /<div class="tv-help-dock"><div ([^>]*)><section /.exec(html)?.[1] ?? ''
  assert.match(item, /data-chat-flow-kind="tracy-help"/, html)
  assert.match(item, /data-chat-local=""/, html)
  assert.equal(actions.length, 1)
  assert.equal(actions[0].branchAt, undefined, 'nothing to branch before the chat begins')
})

test("dsh's row sits as far under a Help answer as under an agent reply", () => {
  // The section's 8px gap, the row's own 4px (AnswerActions.module.css .actions) and these 4px: 16px, the agent's.
  assert.match(rule('.tv-help'), /gap: 8px/)
  assert.match(rule('.tv-help > [data-answer-actions]'), /margin-top: 4px/)
})

test('onboarding bar sends typed questions through existing Help without an agent turn; site keeps native bar', async () => {
  const requests = []
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    requests.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    return { ok: false, status: 503, json: async () => ({}) }
  }
  try {
    const { registered } = applied({ onboarding: true, subagent: false })
    const slot = registered.get('conversation.composer.bar')
    assert.ok(slot, 'creation workspace has no Help-only replacement')
    assert.equal(slot.spec.priority, -20)
    const mounted = lib.mount(lib.h(slot.component, {}))
    assert.equal(
      mounted.container.querySelector('textarea').disabled,
      false,
      'first use needs no agent session'
    )
    const first = mounted.container.querySelector('textarea')
    lib.act(() =>
      lib.propsOf(first).onChange({ target: { value: 'Can Tracy edit my existing Joomla site?' } })
    )
    lib.act(() => lib.propsOf(mounted.container.querySelector('form')).onSubmit({ preventDefault() {} }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const turns = requests.filter((r) => r.url === '/api/assistant/turns')
    assert.equal(turns.length, 1)
    assert.equal(turns[0].body.session.id, 'tracy-onboarding-help')
    assert.equal(turns[0].url, '/api/assistant/turns')
    assert.equal(turns[0].body.site, null)
    assert.equal(turns[0].body.message, 'Can Tracy edit my existing Joomla site?')
    assert.equal(
      requests.some((r) => /prompt|agent/.test(String(r.url))),
      false
    )
    const textarea = mounted.container.querySelector('textarea')
    assert.equal(textarea.getAttribute('placeholder'), t('onboarding.placeholder'))
    lib.act(() =>
      lib.propsOf(textarea).onChange({ target: { value: 'I need a WordPress site for my business' } })
    )
    lib.act(() => lib.propsOf(mounted.container.querySelector('form')).onSubmit({ preventDefault() {} }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const next = requests.filter((r) => r.url === '/api/assistant/turns')
    assert.equal(next.length, 2)
    assert.equal(next[1].body.message, 'I need a WordPress site for my business')
    assert.equal(next[1].body.site, null)
    assert.equal(textarea.value, '')
    mounted.stop()
    const site = applied({ onboarding: false, subagent: false })
    assert.equal(
      site.registered.has('conversation.composer.bar'),
      false,
      'site composer remains the native agent bar'
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('creation answers carry no action buttons: copy, thumbs and time only (Akemi 23/10/2026)', () => {
  const deps = { onboarding: true }
  const done = drawRow(row({ answer: 'You can create or import a site.' }), deps)
  assert.doesNotMatch(done.html, /tv-onboarding-actions|tv-start-card/)
  for (const label of ['Create a new site', 'Browse templates', 'Start from a template', 'Import your site'])
    assert.ok(!done.html.includes(label), label)
  assert.equal(done.actions.length, 1, "dsh's own copy and thumbs row stays")
  assert.equal(drawRow(row({ variant: 'tip' }), deps).html, '')
  // No command mark on /new/, and no stray space where it would have been.
  assert.match(done.html, /<div class="tv-help-me">How do I add a page\?<\/div>/)
})

test('conversation mode shows the three coloured start cards in one row above the composer', () => {
  const { registered, nodes, notifyNodes } = applied({ onboarding: true, subagent: false })
  const Composer = registered.get('conversation.composer.bar').component
  const mounted = lib.mount(lib.h(Composer, { sessionId: 'cards' }))
  const cards = () => [...mounted.container.querySelectorAll('.tv-onboarding-start .tv-start-card')]
  assert.equal(cards().length, 0, 'no row before the first question')
  nodes.push({
    key: 'q1',
    kind: lib.HELP_KIND,
    data: row({
      sessionId: 'tracy-onboarding-help',
      rowId: 'q1',
      question: 'Can Tracy edit my Joomla site?',
      answer: 'Yes.'
    })
  })
  nodes.push({
    key: 'q2',
    kind: lib.HELP_KIND,
    data: row({
      sessionId: 'tracy-onboarding-help',
      rowId: 'q2',
      question: 'And WordPress?',
      status: 'streaming'
    })
  })
  notifyNodes()
  assert.deepEqual(
    cards().map((card) => [
      card.querySelector('.tv-start-card-icon').getAttribute('data-tone'),
      card.getAttribute('aria-label'),
      card.getAttribute('title'),
      card.querySelector('.tv-start-card-full').textContent,
      card.querySelector('.tv-start-card-short').textContent
    ]),
    [
      ['create', 'Create a new site', 'Create a new site', 'Create a new site', 'New site'],
      ['template', 'Start from a template', 'Start from a template', 'Start from a template', 'Template'],
      ['import', 'Import your site', 'Import your site', 'Import your site', 'Import']
    ]
  )
  const row0 = mounted.container.querySelector('.tv-onboarding-start')
  const form = mounted.container.querySelector('form')
  assert.equal(row0.nextElementSibling, form, 'the row sits directly above the composer')
  const events = []
  const dispatch = window.dispatchEvent
  // linkedom cannot dispatch Node's CustomEvent: record what the press sends instead.
  window.dispatchEvent = (event) => {
    if (event.type === 'tracy:onboarding-start') events.push(event.detail)
    return true
  }
  try {
    for (const card of cards()) lib.act(() => card.click())
  } finally {
    window.dispatchEvent = dispatch
  }
  // The platform preselect reads the question of the latest finished answer, as the old buttons did.
  assert.deepEqual(events, [
    { action: 'create', question: 'Can Tracy edit my Joomla site?' },
    { action: 'templates', question: 'Can Tracy edit my Joomla site?' },
    { action: 'import', question: 'Can Tracy edit my Joomla site?' }
  ])
  mounted.stop()
})

test('the start card row stays on one line and scrolls sideways in a narrow column', () => {
  const base = rule('.tv-onboarding-start')
  assert.match(base, /flex-wrap: nowrap/)
  assert.match(base, /overflow-x: auto/)
  assert.match(base, /scrollbar-width: none/)
  const card = rule('.tv-onboarding-start > .tv-start-card')
  assert.match(card, /flex: none/)
  // Compact pill (Akemi 23/10/2026): the site cards' badge and label, 36px tall.
  assert.match(card, /height: 36px/)
  assert.match(card, /gap: 8px/)
  assert.match(card, /padding: 0 12px 0 6px/)
  assert.match(rule('.tv-onboarding-start > .tv-start-card .tv-start-card-icon'), /width: 24px; height: 24px/)
  assert.match(
    rule('.tv-onboarding-start > .tv-start-card .tv-start-card-icon svg'),
    /width: 13px; height: 13px/
  )
  assert.match(
    rule('.tv-onboarding-start > .tv-start-card .tv-start-card-title'),
    /font-size: 13px; font-weight: 500/
  )
  // Wide shows the full names; a column below 660px shows the short ones (Akemi 23/10/2026).
  assert.match(rule('.tv-start-card-short'), /display: none/)
  const narrow = CSS.slice(CSS.lastIndexOf('@container tracy-onboarding-hero (max-width: 660px)'))
  assert.match(narrow, /\.tv-onboarding-start \.tv-start-card-full \{ display: none; \}/)
  assert.match(narrow, /\.tv-onboarding-start \.tv-start-card-short \{ display: inline; \}/)
  assert.match(narrow, /\.tv-onboarding-start \{ gap: 6px; \}/)
  assert.match(narrow, /\.tv-onboarding-start > \.tv-start-card \{ gap: 6px; padding: 0 10px 0 6px; \}/)
  assert.match(rule('.tv-onboarding-start::-webkit-scrollbar'), /display: none/)
  assert.match(rule('.tv-onboarding-start[data-more-end]'), /mask-image/)
})

test('onboarding shares the native two-row card hooks and filled send icon, with no unsupported controls', () => {
  const html = lib.markup(lib.h(lib.OnboardingComposer, { enabled: true, t, ask() {} }))
  assert.match(html, /data-composer-card=""/)
  assert.match(html, /data-voice-composer=""/)
  assert.match(html, /data-input-scroll=""/)
  assert.match(html, /rows="1"/)
  assert.match(html, /class="tv-onboarding_trailing"/)
  assert.match(html, /viewBox="0 0 16 16"/)
  assert.match(html, /M8\.3125 0\.980183/)
  assert.doesNotMatch(html, /type="file"|conversation.input.model|tv-vm/)
})

test('onboarding follows dictation bridge loading and removal, inserts revisions safely and sends to Help', () => {
  const calls = []
  let voice
  const Mic = (props) => {
    voice = props
    return lib.h('button', { type: 'button', className: 'test-mic' })
  }
  const mounted = lib.mount(
    lib.h(lib.OnboardingComposer, { enabled: true, t, ask: (text) => calls.push(text) })
  )
  assert.equal(mounted.container.querySelector('.test-mic'), null)
  lib.act(() => {
    window.__TRACY_VOICE_INPUT__ = { version: 1, Component: Mic }
    window.dispatchEvent(new window.Event('tracy:voice-input-changed'))
  })
  assert.ok(mounted.container.querySelector('.test-mic'))
  const textarea = mounted.container.querySelector('textarea')
  lib.act(() => lib.propsOf(textarea).onChange({ target: { value: 'My site' } }))
  const span = voice.inputActions.captureInsertion()
  assert.deepEqual(span, { start: 7, end: 7, draftRev: 1 })
  lib.act(() => assert.equal(voice.inputActions.insertText(' needs pages', span), true))
  assert.equal(textarea.value, 'My site needs pages')
  assert.equal(
    voice.useInput((state) => state.draft),
    'My site needs pages'
  )
  assert.equal(voice.inputActions.insertText('stale', span), false)
  const beforeTyping = voice.inputActions.captureInsertion()
  lib.act(() => lib.propsOf(textarea).onChange({ target: { value: 'I edited this' } }))
  assert.equal(voice.inputActions.insertText('stale speech', beforeTyping), false)
  // Dictation starts after a selection, and cancellation removes only its own words.
  const activeElement = Object.getOwnPropertyDescriptor(document, 'activeElement')
  Object.defineProperty(document, 'activeElement', { configurable: true, value: textarea })
  textarea.selectionStart = 2
  textarea.selectionEnd = 8
  const selected = voice.inputActions.captureInsertion()
  assert.deepEqual(selected, { start: 2, end: 8, draftRev: 3 })
  lib.act(() =>
    assert.equal(voice.inputActions.insertText(' voice', { ...selected, start: selected.end }), true)
  )
  assert.equal(textarea.value, 'I edited voice this')
  const inserted = voice.inputActions.captureInsertion()
  lib.act(() =>
    assert.equal(voice.inputActions.insertText('', { start: 8, end: 14, draftRev: inserted.draftRev }), true)
  )
  assert.equal(textarea.value, 'I edited this')
  if (activeElement) Object.defineProperty(document, 'activeElement', activeElement)
  else delete document.activeElement
  lib.act(() => voice.inputActions.submit())
  assert.deepEqual(calls, ['I edited this'])
  assert.equal(textarea.value, '')
  lib.act(() => {
    window.__TRACY_VOICE_INPUT__ = { version: 2, Component: Mic }
    window.dispatchEvent(new window.Event('tracy:voice-input-changed'))
  })
  assert.equal(mounted.container.querySelector('.test-mic'), null, 'unknown bridge versions stay hidden')
  lib.act(() => {
    delete window.__TRACY_VOICE_INPUT__
    window.dispatchEvent(new window.Event('tracy:voice-input-changed'))
  })
  assert.equal(mounted.container.querySelector('.test-mic'), null)
  mounted.stop()
})

test('Help switched off keeps its no-site bar and disables all routes instead of falling through to the agent', () => {
  const switches = lib.uiSwitches()
  const isShown = switches.isShown
  switches.isShown = (id) => (id === 'ai-assistant' ? false : isShown(id))
  try {
    const { registered } = applied({ onboarding: true, subagent: false })
    const slot = registered.get('conversation.composer.bar')
    assert.ok(slot, 'the no-site replacement must stay registered while Help is disabled')
    const html = lib.markup(lib.h(slot.component, { sessionId: 'disabled-onboarding' }))
    assert.match(html, /<textarea[^>]*disabled(?:=""|\s|>)/)
    // The draft, the paperclip and Send: no way in while Help is off.
    assert.equal((html.match(/ disabled(?:=""|\s|>)/g) ?? []).length, 3)
    assert.ok(html.includes(t('error.unavailable')))
    const calls = []
    const mounted = lib.mount(
      lib.h(lib.OnboardingComposer, { enabled: false, t, ask: (text) => calls.push(text) })
    )
    const textarea = mounted.container.querySelector('textarea')
    lib.act(() => lib.propsOf(textarea).onChange({ target: { value: 'Ask a website question' } }))
    lib.act(() => lib.propsOf(mounted.container.querySelector('form')).onSubmit({ preventDefault() {} }))
    assert.deepEqual(calls, [])
    mounted.stop()
  } finally {
    switches.isShown = isShown
  }
})

test('the first typed question switches /new/ to conversation mode and it stays there', () => {
  const calls = []
  const props = { enabled: true, t, ask: (question) => calls.push(question) }
  const mounted = lib.mount(lib.h(lib.OnboardingComposer, props))
  const conversation = () => mounted.container.querySelector('[data-tracy-help-conversation]') !== null
  const submit = () =>
    lib.act(() => lib.propsOf(mounted.container.querySelector('form')).onSubmit({ preventDefault() {} }))
  const textarea = mounted.container.querySelector('textarea')
  assert.equal(conversation(), false)
  submit()
  lib.act(() => lib.propsOf(textarea).onChange({ target: { value: '   ' } }))
  submit()
  assert.equal(conversation(), false, 'empty drafts send nothing')
  lib.act(() => lib.propsOf(textarea).onChange({ target: { value: 'How do I start?' } }))
  submit()
  assert.deepEqual(calls, ['How do I start?'])
  assert.ok(conversation(), 'the first send switches layout before an answer arrives')
  mounted.update(lib.h(lib.OnboardingComposer, { ...props, enabled: false }))
  mounted.update(lib.h(lib.OnboardingComposer, props))
  assert.ok(conversation(), 'a completed or failed request keeps the conversation layout')
  mounted.stop()
})

test('no suggestion chips on /new/, before or after a question (Akemi 23/10/2026)', () => {
  const props = { enabled: true, t, ask() {} }
  for (const hasQuestion of [false, true]) {
    const html = lib.markup(lib.h(lib.OnboardingComposer, { ...props, hasQuestion }))
    assert.doesNotMatch(html, /tv-onboarding-chips/)
    for (const words of [
      'Can Tracy edit my existing Joomla or WordPress site?',
      'I need a new site for my business',
      'What will Tracy change on my site?'
    ])
      assert.ok(!html.includes(words), words)
  }
  assert.ok(!Object.keys(en).some((key) => key.startsWith('onboarding.chip.')))
  assert.doesNotMatch(CSS, /tv-onboarding-chips/)
})

test('conversation mode follows restored Help questions of this conversation only', () => {
  const { registered, nodes, notifyNodes } = applied({ onboarding: true, subagent: false })
  const Composer = registered.get('conversation.composer.bar').component
  const mounted = lib.mount(lib.h(Composer, { sessionId: 'tracy-onboarding-help' }))
  const conversation = () => mounted.container.querySelector('[data-tracy-help-conversation]') !== null
  nodes.push(
    { key: 'agent', kind: 'agent', data: row({ sessionId: 'tracy-onboarding-help' }) },
    { key: 'other', kind: lib.HELP_KIND, data: row({ sessionId: 'other-chips' }) },
    { key: 'tip', kind: lib.HELP_KIND, data: row({ sessionId: 'tracy-onboarding-help', variant: 'tip' }) },
    { key: 'empty', kind: lib.HELP_KIND, data: row({ sessionId: 'tracy-onboarding-help', question: '  ' }) }
  )
  notifyNodes()
  assert.equal(conversation(), false, 'only a nonempty Help turn in this session counts')
  nodes.push({
    key: 'question',
    kind: lib.HELP_KIND,
    data: row({ sessionId: 'tracy-onboarding-help', status: 'streaming' })
  })
  notifyNodes()
  assert.ok(conversation(), 'restored questions restore conversation layout')
  nodes[nodes.length - 1].data.status = 'error'
  notifyNodes()
  assert.ok(conversation())
  mounted.stop()
  const reloaded = lib.mount(lib.h(Composer, { sessionId: 'tracy-onboarding-help' }))
  assert.ok(reloaded.container.querySelector('[data-tracy-help-conversation]'))
  reloaded.stop()
  const changed = lib.mount(lib.h(Composer, { sessionId: 'different-agent-session' }))
  assert.ok(
    changed.container.querySelector('[data-tracy-help-conversation]'),
    'onboarding Help survives agent-session changes'
  )
  changed.stop()
})

test('onboarding follows the conversation scroller while streaming and preserves a reader who scrolls up', () => {
  const previousStyle = globalThis.getComputedStyle
  globalThis.getComputedStyle = (el) => ({
    overflowY: el.hasAttribute('data-conversation-scroll') ? 'auto' : 'visible'
  })
  try {
    const { registered, nodes, notifyNodes } = applied({ onboarding: true })
    const Boot = registered.get('conversation.composer.bar').component
    nodes.push({
      key: 'scroll-first',
      kind: lib.HELP_KIND,
      data: row({ sessionId: 'tracy-onboarding-help', status: 'streaming' })
    })
    const render = () =>
      lib.h(
        'div',
        { 'data-conversation-scroll': '' },
        lib.h(Boot, { sessionId: 's1', session: { blank: true } })
      )
    const mounted = lib.mount(render())
    const scroll = mounted.container.querySelector('[data-conversation-scroll]')
    Object.defineProperties(scroll, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { value: 400 }
    })
    scroll.scrollTop = 800
    nodes[0] = {
      ...nodes[0],
      data: row({ sessionId: 'tracy-onboarding-help', status: 'streaming', answer: 'More of the answer.' })
    }
    notifyNodes()
    assert.equal(scroll.scrollTop, 1200, 'streaming follows the outer conversation, not the old inner strip')
    scroll.scrollTop = 100
    lib.act(() => scroll.dispatchEvent(new window.Event('scroll')))
    nodes[0] = {
      ...nodes[0],
      data: row({ sessionId: 'tracy-onboarding-help', answer: 'The complete answer.' })
    }
    notifyNodes()
    assert.equal(scroll.scrollTop, 100, 'reading earlier messages stops automatic following')
    mounted.stop()
  } finally {
    globalThis.getComputedStyle = previousStyle
  }
})

test('onboarding conversation lets dsh size its answer buttons like the site transcript', () => {
  const buttons = rule(
    'html[data-tracy-scope="onboarding"] [class*="composerHero"]:has([data-tracy-help-conversation]) .tv-help [data-answer-actions] button'
  )
  assert.match(buttons, /min-width: 0/)
  assert.match(buttons, /min-height: 0/)
})

// ── the creation screen's chat (David, 26/10/2026) ──────────────────────────────────────────────

test('a start action in an answer is text to press that opens its step; with no handler it is plain text', async () => {
  const href = 'tracy-action:create?platform=wordpress'
  const data = {
    variant: 'turn',
    sessionId: 'act-1',
    rowId: 'q1',
    question: 'Make me a WordPress site',
    answer: `You can start here: [Create a WordPress site](${href}). Or [delete everything](tracy-action:delete).`,
    status: 'done',
    links: [{ href, label: 'Create a new WordPress site' }]
  }
  const pressed = []
  const mounted = lib.mount(lib.h(lib.HelpNode, { node: { data }, t, onAction: (h) => pressed.push(h) }))
  const buttons = [...mounted.container.querySelectorAll('button.tv-help-action')]
  assert.equal(buttons.length, 1, 'an action the server did not list is never drawn')
  assert.equal(buttons[0].textContent, 'Create a WordPress site')
  assert.equal(
    mounted.container.querySelector('a[href^="tracy-action:"]'),
    null,
    'never an address to follow'
  )
  await lib.act(async () => {
    await lib.propsOf(buttons[0]).onClick()
  })
  assert.deepEqual(pressed, [href])
  mounted.stop()
  const plain = lib.markup(lib.h(lib.HelpNode, { node: { data }, t }))
  assert.doesNotMatch(plain, /tv-help-action/)
  assert.match(plain, /Create a WordPress site/)
})

test('a question that carried files shows them under it, each opening from its own door', () => {
  const html = lib.markup(
    lib.h(lib.HelpNode, {
      node: {
        data: {
          variant: 'turn',
          sessionId: 'files-1',
          rowId: 'q1',
          question: '',
          answer: 'Thanks.',
          status: 'done',
          links: [],
          files: [
            {
              id: 'f-1',
              name: 'logo.png',
              type: 'image/png',
              bytes: 2048,
              url: '/api/assistant/attachments/f-1'
            },
            {
              id: 'f-2',
              name: 'menu.pdf',
              type: 'application/pdf',
              bytes: 4096,
              url: '/api/assistant/attachments/f-2'
            }
          ]
        }
      },
      t,
      onboarding: true
    })
  )
  assert.match(html, /tv-help-files/)
  assert.match(html, /<img[^>]*src="\/api\/assistant\/attachments\/f-1"/)
  const parsed = parseHTML(html).document
  assert.equal(
    parsed.querySelector('a[href="/api/assistant/attachments/f-2"]').getAttribute('download'),
    'menu.pdf'
  )
})

test('the creation chat box uploads a picked file, holds Send until it is stored, then sends its id', async () => {
  const asked = []
  let land
  const stored = {
    id: 'f-9',
    name: 'logo.png',
    type: 'image/png',
    bytes: 3,
    url: '/api/assistant/attachments/f-9'
  }
  const upload = () => new Promise((resolve) => (land = () => resolve({ ok: true, file: stored })))
  const mounted = lib.mount(
    lib.h(lib.OnboardingComposer, {
      enabled: true,
      t,
      upload,
      ask: (text, files) => asked.push({ text, files })
    })
  )
  const picker = mounted.container.querySelector('input[type="file"]')
  assert.ok(picker, 'the paperclip has its file picker')
  const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
  lib.act(() => lib.propsOf(picker).onChange({ target: { files: [file], value: 'logo.png' } }))
  assert.match(mounted.container.innerHTML, /data-state="uploading"/)
  const send = mounted.container.querySelector('button[type="submit"]')
  assert.equal(send.disabled, true, 'nothing goes while a file is on its way')
  await lib.act(async () => {
    land()
    await Promise.resolve()
  })
  assert.match(mounted.container.innerHTML, /data-state="done"/)
  assert.equal(
    mounted.container.querySelector('button[type="submit"]').disabled,
    false,
    'a file alone can be sent'
  )
  lib.act(() => lib.propsOf(mounted.container.querySelector('form')).onSubmit({ preventDefault() {} }))
  assert.deepEqual(asked, [{ text: '', files: [stored] }])
  assert.doesNotMatch(mounted.container.innerHTML, /tv-chip/, 'the chips leave with the question')
  mounted.stop()
})

test('a file the chat box cannot take is refused at once with its name, and never uploaded', () => {
  let uploads = 0
  const mounted = lib.mount(
    lib.h(lib.OnboardingComposer, {
      enabled: true,
      t,
      upload: async () => {
        uploads++
        return { ok: false, problem: 'file.failed' }
      },
      ask() {}
    })
  )
  const picker = mounted.container.querySelector('input[type="file"]')
  const page = new File(['<script>'], 'page.html', { type: 'text/html' })
  lib.act(() => lib.propsOf(picker).onChange({ target: { files: [page], value: '' } }))
  assert.equal(uploads, 0)
  assert.match(mounted.container.innerHTML, /data-state="error"/)
  assert.ok(mounted.container.textContent.includes(t('file.type', { name: 'page.html' })))
  mounted.stop()
})

test('a draft action locks duplicate clicks, shows failure and permits retry', async () => {
  let calls = 0
  let finish
  const data = {
    variant: 'turn',
    sessionId: 'draft-lock',
    userTurnId: '12',
    rowId: 'q',
    question: 'Create',
    answer: '[Continue](tracy-action:create)',
    status: 'done',
    links: [{ href: 'tracy-action:create', label: 'Create' }]
  }
  const mounted = lib.mount(
    lib.h(lib.HelpNode, {
      node: { data },
      t,
      onAction: async (href, turn) => {
        calls++
        assert.equal(turn.userTurnId, '12')
        await new Promise((resolve) => {
          finish = resolve
        })
        if (calls === 1) throw new Error('DRAFT_FAILED')
      }
    })
  )
  const click = () => lib.propsOf(mounted.container.querySelector('button.tv-help-action')).onClick()
  let pending
  lib.act(() => {
    pending = click()
    void click()
  })
  assert.equal(calls, 1)
  assert.equal(mounted.container.querySelector('button.tv-help-action').disabled, true)
  assert.ok(mounted.container.textContent.includes(t('draft.preparing')))
  await lib.act(async () => {
    finish()
    await pending
  })
  assert.ok(mounted.container.textContent.includes(t('draft.failed')))
  lib.act(() => {
    pending = click()
  })
  assert.equal(calls, 2)
  await lib.act(async () => {
    finish()
    await pending
  })
  assert.ok(!mounted.container.textContent.includes(t('draft.failed')))
  mounted.stop()
})
