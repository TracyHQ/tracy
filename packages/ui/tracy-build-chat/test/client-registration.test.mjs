// The browser half's registration path (#609): the real `src/client/index.tsx` entry, bundled for node with dsh's
// primitives stubbed, applied to a recording context. With the switch `chat-build` on it registers its turn tails, the
// plan review bar and the tracy_build row; off, it registers no visible piece; outside a build chat session every
// piece draws nothing. The definitions fold the tool's recorded results onto the right turn.
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = mkdtempSync(path.join(tmpdir(), 'build-chat-client-'))
after(() => rmSync(out, { recursive: true, force: true }))

/** Every name the client imports from dsh's primitives, each a component that draws nothing. */
const clientDir = path.join(root, 'src/client')
const primitiveNames = new Set(
  readdirSync(clientDir).flatMap((f) =>
    [
      ...readFileSync(path.join(clientDir, f), 'utf8').matchAll(
        /import \{([^}]*)\} from '@deepseek-ai\/dsh-client-ui-primitives'/g
      )
    ].flatMap((m) =>
      m[1]
        .split(',')
        .map((n) => n.trim().replace(/^type\s+/, ''))
        .filter(Boolean)
    )
  )
)
const stubPrimitives = {
  name: 'stub-primitives',
  setup(b) {
    b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
      path: 'primitives',
      namespace: 'stub'
    }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `const C = () => null; export { ${[...primitiveNames].map((n) => `C as ${n}`).join(', ')} }`,
      loader: 'js'
    }))
  }
}
const bundled = await build({
  entryPoints: [path.join(root, 'src/client/index.tsx')],
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  write: false,
  logLevel: 'silent',
  // Read at run time through dsh's module loader (`locale-packages.ts`); in node the require throws and is caught.
  external: ['@tracy/dsh-tracy-locale-vi', '@tracy/dsh-tracy-locales'],
  plugins: [stubPrimitives]
})
const file = path.join(out, 'client.mjs')
writeFileSync(file, bundled.outputFiles[0].text)
const client = await import(pathToFileURL(file).href)

const BUILD = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const OTHER = 'session-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'

/** A switch board with one switch the test can flip. */
function switchBoard(on) {
  const listeners = new Set()
  return {
    isShown: (id) => (id === 'chat-build' ? on : true),
    subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    flip(next) {
      on = next
      for (const l of listeners) l()
    }
  }
}

/** A context that records what the plugin registers; effects run, the DOM one is skipped in node. */
function recorder() {
  const live = new Set()
  const definitions = []
  const ctx = {
    effect(fn) {
      try {
        fn()
      } catch {
        // the styles effect needs a document
      }
    },
    locale: { register: () => {} },
    uiConversation: { events: { register: (d) => definitions.push(d) } },
    slots: {
      inject: (_name, cb) => cb(),
      register(options, component) {
        const entry = { options, component }
        live.add(entry)
        return () => live.delete(entry)
      }
    }
  }
  const of = (name) => [...live].filter((e) => e.options.name === name)
  return { ctx, live, definitions, of }
}

test('switch on: five turn tails, the review bar ahead of dsh, the working line, the tracy_build row', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  assert.deepEqual(
    r.of('conversation.chat.turnTail').map((e) => e.options.id),
    [
      'tracy-build-chat-templates',
      'tracy-build-chat-plan',
      'tracy-build-chat-retry',
      'tracy-build-chat-run',
      'tracy-build-chat-handoff'
    ]
  )
  assert.equal(r.of('conversation.composer')[0].options.priority, -20)
  assert.equal(r.of('tool.call.toolview')[0].options.key, 'tracy_build')
  assert.deepEqual(
    r.of('conversation.input.dock').map((e) => e.options.id),
    ['tracy-build-chat-working']
  )
  assert.deepEqual(
    r.definitions.map((d) => d.kind),
    [
      'tracy_build:templates',
      'tracy_build:plan',
      'tracy_build:working',
      'tracy_build:retry',
      'tracy_build:build',
      'tracy_build:history',
      'tracy_build:handoff'
    ]
  )
})

test('switch off: no visible piece is registered, and turning it off takes them away', () => {
  const off = recorder()
  client.applyWith(off.ctx, { switches: switchBoard(false) })
  // Only the quiet tracy_build row stays: an existing build session must never fall back to the raw tool JSON.
  assert.deepEqual(
    [...off.live].map((e) => e.options.name),
    ['tool.call.toolview']
  )
  const flipped = recorder()
  const board = switchBoard(true)
  client.applyWith(flipped.ctx, { switches: board })
  assert.equal(flipped.live.size, 8)
  board.flip(false)
  assert.equal(flipped.live.size, 1)
  board.flip(true)
  assert.equal(flipped.live.size, 8)
})

test('outside a build chat session every piece draws nothing', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  const value = { turn: 0, seq: 1, id: 'plan-1', revision: 1, options: [], none: false }
  const owner = (sessionId) => ({ sessionId, seq: 9, turn: { turn: 0, data: { get: () => value } } })
  for (const entry of r.of('conversation.chat.turnTail')) {
    assert.equal(entry.component(owner(OTHER)), null, entry.options.id)
    assert.equal(entry.component({ ...owner(OTHER), sessionId: undefined }), null)
  }
  // The site chat's first turn carried from the build chat (#611) draws its earlier conversation, outside a build
  // session only.
  const handoff = r.of('conversation.chat.turnTail').find((e) => e.options.id === 'tracy-build-chat-handoff')
  const carried = {
    turn: 0,
    conversation: [{ role: 'user', text: 'Build my site.' }],
    plan: null,
    site: null
  }
  const site = (sessionId) => ({ sessionId, seq: 9, turn: { turn: 0, data: { get: () => carried } } })
  assert.notEqual(handoff.component(site(OTHER)), null)
  assert.equal(handoff.component(site(BUILD)), null)
  // In the build session the plan and template tails draw (the run tail draws its own empty feed as nothing).
  assert.notEqual(r.of('conversation.chat.turnTail')[1].component(owner(BUILD)), null)
  const view = { phase: 'result', block: { call: { argsRaw: '{"action":"plan"}' }, content: [] } }
  assert.equal(r.of('tool.call.toolview')[0].component({ ...view, sessionId: OTHER }), null)
  assert.notEqual(r.of('tool.call.toolview')[0].component({ ...view, sessionId: BUILD }), null)
  const pending = (sessionId, id = 'plan-review:plan-1:1') => ({
    sessionId,
    key: 'k',
    questions: [
      { id, question: 'Approve this plan?', options: [{ label: 'Approve' }, { label: 'Change the plan' }] }
    ],
    answer: async () => {},
    dismiss: async () => {},
    snapshot: () => ({ channel: 'waterfall' })
  })
  const select = r.of('conversation.composer')[0].options.select
  assert.equal(select({ pendingInteraction: pending(OTHER) }), null)
  assert.equal(
    select({ pendingInteraction: pending(BUILD, 'main-button') }),
    null,
    "the engine's questions stay dsh's"
  )
  assert.equal(select({ pendingInteraction: pending(BUILD) })?.sessionId, BUILD)
  assert.equal(
    select({ pendingInteraction: pending(BUILD, 'plan-review') }),
    null,
    'a review that names no plan revision is not the plan review'
  )
})

test('the definitions publish the latest templates and plan on their own turn, and move with a newer plan', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  const [templates, plan] = r.definitions
  let seq = 0
  const call = (turn, callId, args) => ({
    type: 'tool/call',
    seq: ++seq,
    data: { turn, name: 'tracy_build', callId, arguments: JSON.stringify(args) }
  })
  const result = (turn, callId, value) => ({
    type: 'tool/result',
    seq: ++seq,
    surfaceOp: 'append',
    data: { turn, message: { source: { callId }, content: [{ type: 'text', text: JSON.stringify(value) }] } }
  })
  // A small engine: one context per definition and id, start then update, publish per turn.
  const run = (definition, events) => {
    let state
    let published = null
    for (const event of events) {
      const m = definition.match(event)
      if (m === null) continue
      state =
        state === undefined
          ? definition.start({}, { event, role: m.role })
          : definition.update({ state }, { event })
      published = definition.buildLocationData({ state }, 'turn', published)
      assert.equal(definition.buildLocationData({ state }, 'step', null), null)
    }
    return published
  }
  const review = { questions: [{ id: 'plan-review', question: 'Approve this plan?', options: [] }] }
  const events = [
    call(1, 'a', { action: 'templates' }),
    result(1, 'a', { options: [{ slug: 'ja-boxing' }], none: false }),
    call(2, 'b', { action: 'plan' }),
    result(2, 'b', { plan: { id: 'plan-1', revision: 1 }, review })
  ]
  assert.equal(run(templates, events).turn, 1)
  assert.deepEqual(run(plan, events), {
    kind: 'turn',
    turn: 2,
    key: 'tracy_build:plan',
    value: { turn: 2, seq: 4, id: 'plan-1', revision: 1 }
  })
  const later = [
    ...events,
    call(4, 'c', { action: 'edit' }),
    result(4, 'c', { plan: { id: 'plan-1', revision: 2 }, review })
  ]
  assert.equal(run(plan, later).turn, 4, 'one living plan: the older turn loses its card')
  assert.equal(run(templates, later).turn, 1)
})

test('another tool answered before the first build call still lets every card publish (#575 no link walk)', () => {
  // dsh's assembler (ui-conversation): a context whose first match is an update throws when its start arrives, and
  // the session's cards never draw. Here the agent's own question tool answered before research was called.
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  let seq = 0
  const events = [
    {
      type: 'tool/result',
      seq: ++seq,
      surfaceOp: 'append',
      data: {
        turn: 1,
        message: { source: { callId: 'q' }, isError: true, content: [{ type: 'text', text: 'no' }] }
      }
    },
    {
      type: 'tool/call',
      seq: ++seq,
      data: { turn: 4, name: 'tracy_build', callId: 't', arguments: '{"action":"templates"}' }
    },
    {
      type: 'tool/result',
      seq: ++seq,
      surfaceOp: 'append',
      data: {
        turn: 4,
        message: {
          source: { callId: 't' },
          content: [{ type: 'text', text: '{"options":[{"slug":"ja-boxing"}],"none":false}' }]
        }
      }
    }
  ]
  for (const definition of r.definitions.filter((d) => d.kind.startsWith('tracy_build:') && d.match)) {
    let context = null
    let published = null
    for (const event of events) {
      const m = definition.match(event)
      if (m === null) continue
      if (context === null) {
        assert.equal(m.role, 'start', `${definition.kind}: the first match of a context must start it`)
        context = { state: definition.start({}, { event, role: m.role }) }
      } else context.state = definition.update(context, { event, role: m.role })
      published = definition.buildLocationData?.(context, 'turn', published) ?? published
    }
    if (definition.kind === 'tracy_build:templates') assert.equal(published?.turn, 4)
  }
})

test('a call answered running spins only while it waits: in the history its row is settled', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true), engine: null })
  const view = r.of('tool.call.toolview')[0].component
  const rowOf = (props) => {
    const element = view({ ...props, sessionId: BUILD })
    const tree = element.type(element.props)
    // The row is the first child; the link lines (#609) may follow it.
    return [tree.props.children].flat()[0].props
  }
  const call = { argsRaw: '{"action":"plan"}' }
  assert.equal(rowOf({ phase: 'running', block: { call, content: [] } }).running, true)
  const answered = {
    phase: 'result',
    block: {
      call,
      content: [{ type: 'text', text: JSON.stringify({ running: true, say: 'Still working.' }) }]
    }
  }
  assert.equal(rowOf(answered).running, false, 'no spinner left in the history')
})

test('a research call shows one line per link: reading while it runs, what came back once done (#609)', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true), engine: null })
  const view = r.of('tool.call.toolview')[0].component
  const linesOf = (props) => {
    const element = view({ ...props, sessionId: BUILD })
    const kids = [element.type(element.props).props.children].flat()
    const lines = kids[1]
    if (!lines) return []
    const list = lines.type(lines.props)
    return [list.props.children].flat().map((li) => li.props.children)
  }
  const call = {
    argsRaw: JSON.stringify({
      action: 'research',
      links: ['https://www.instagram.com/hollowmere.example/', 'https://www.google.com/maps/place/Hollowmere']
    })
  }
  assert.deepEqual(linesOf({ phase: 'running', block: { call, content: [] } }), [
    'Instagram: reading',
    'Google Maps: reading'
  ])
  const done = JSON.stringify({
    profile: { business: 'Hollowmere Bakery' },
    links: [
      { name: 'Instagram', state: 'read', facts: 18, pictures: 0, picturesLost: 12 },
      { name: 'Google Maps', state: 'failed', reason: 'Google did not answer for this place' }
    ]
  })
  assert.deepEqual(linesOf({ phase: 'result', block: { call, content: [{ type: 'text', text: done }] } }), [
    'Instagram: read, but its pictures could not be downloaded. 18 facts',
    'Google Maps: could not be read (Google did not answer for this place)'
  ])
})

test('every build call wakes the build run feed once, so a build approved again after a stop shows its new run', () => {
  const r = recorder()
  const woken = []
  const runs = { read: () => null, subscribe: () => () => {}, wake: (key) => woken.push(key) }
  client.applyWith(r.ctx, { switches: switchBoard(true), runs })
  const build = r.definitions.find((d) => d.kind === 'tracy_build:build')
  const call = (seq, callId, action) => ({
    type: 'tool/call',
    seq,
    data: { turn: seq, name: 'tracy_build', callId, arguments: JSON.stringify({ action }) }
  })
  let state = build.start({}, { event: call(1, 'a', 'plan'), role: 'start' })
  assert.deepEqual(woken, [], 'a plan call is no build')
  state = build.update({ state }, { event: call(2, 'b', 'build') })
  state = build.update({ state }, { event: call(3, 'c', 'status') })
  state = build.update({ state }, { event: call(4, 'd', 'build') })
  assert.deepEqual(woken, ['b', 'd'])
})

test('a change request answer reaches the plan card note store, once per plan revision, and a dismissal sticks', () => {
  const r = recorder()
  const notes = client.createRevisionNotes()
  client.applyWith(r.ctx, { switches: switchBoard(true), notes })
  const plan = r.definitions.find((d) => d.kind === 'tracy_build:plan')
  const event = (type, data, extra = {}) => ({ type, seq: 1, surfaceOp: 'append', data, ...extra })
  const started = event('tool/call', {
    turn: 3,
    name: 'tracy_build',
    callId: 'c1',
    arguments: '{"action":"revise"}'
  })
  const answered = event('tool/result', {
    turn: 3,
    message: {
      source: { callId: 'c1' },
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            plan: { id: 'plan-1', revision: 5 },
            revision: {
              changed: ['Changed the tagline.'],
              notDone: [{ what: 'Move the logo', why: 'Not yet.' }]
            }
          })
        }
      ]
    }
  })
  let state = plan.start({}, { event: started, role: 'start' })
  assert.equal(notes.read('plan-1:5'), null, 'nothing before the answer')
  state = plan.update({ state }, { event: answered })
  assert.deepEqual(notes.read('plan-1:5'), {
    changed: ['Changed the tagline.'],
    notDone: [{ what: 'Move the logo', why: 'Not yet.' }]
  })
  assert.equal(notes.read('plan-1:6'), null, 'the note belongs to its own revision only')
  notes.dismiss('plan-1:5')
  plan.update({ state }, { event: answered })
  assert.equal(notes.read('plan-1:5'), null, 'folded again, still dismissed')
  // A later request that changed nothing answers the same revision with its own note: that note shows.
  const unchangedNote = { changed: [], notDone: [{ what: 'Shop', why: 'This design has no shop page.' }] }
  notes.put('plan-1:5', unchangedNote)
  assert.deepEqual(
    notes.read('plan-1:5'),
    unchangedNote,
    'a newer note replaces the old one, dismissal and all'
  )
  notes.put('plan-1:5', { ...unchangedNote })
  notes.dismiss('plan-1:5')
  notes.put('plan-1:5', { ...unchangedNote })
  assert.equal(notes.read('plan-1:5'), null, 'the same note again keeps its dismissal')
})

test('Try again: published on the turn of the stop, drawn only for a step that may be rerun and fewer than two retries', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  const retry = r.definitions.find((d) => d.kind === 'tracy_build:retry')
  const tail = r.of('conversation.chat.turnTail').find((e) => e.options.id === 'tracy-build-chat-retry')
  let seq = 0
  const call = (turn, callId, action) => ({
    type: 'tool/call',
    seq: ++seq,
    data: { turn, name: 'tracy_build', callId, arguments: JSON.stringify({ action }) }
  })
  const result = (turn, callId, value) => ({
    type: 'tool/result',
    seq: ++seq,
    surfaceOp: 'append',
    data: { turn, message: { source: { callId }, content: [{ type: 'text', text: JSON.stringify(value) }] } }
  })
  const stop = { stopped: true, say: 'Stopped.', step: 'compose', rerun: true }
  let state
  let published = null
  const feed = (event) => {
    const m = retry.match(event)
    state =
      state === undefined ? retry.start({}, { event, role: m.role }) : retry.update({ state }, { event })
    published = retry.buildLocationData({ state }, 'turn', published)
    return published
  }
  assert.equal(feed(call(1, 'a', 'plan')), null)
  assert.equal(feed(result(1, 'a', stop)).turn, 1)
  const owner = (value) => ({ sessionId: BUILD, seq: 9, turn: { turn: 1, data: { get: () => value } } })
  const drawn = tail.component(owner(published.value))
  assert.notEqual(drawn, null)
  assert.equal(tail.component(owner(null)), null)
  assert.equal(tail.component({ ...owner(published.value), sessionId: OTHER }), null)
  // The next call takes the button away at once; a second and third stop in a row bring it back, then take it for good.
  assert.equal(feed(call(2, 'b', 'plan')), null)
  assert.equal(feed(result(2, 'b', stop)).value.retries, 1)
  assert.equal(feed(call(3, 'c', 'plan')), null)
  assert.equal(feed(result(3, 'c', stop)).value.retries, 2)
  assert.equal(tail.component(owner(published.value)), null, 'only the sentence stays after two retries')
  assert.equal(
    tail.component(owner({ turn: 1, seq: 1, step: 'compose', rerun: false, retries: 0 })),
    null,
    'a stop that may not be rerun offers nothing'
  )
})
