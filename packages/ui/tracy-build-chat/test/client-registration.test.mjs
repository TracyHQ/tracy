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

test('switch on: three turn tails, the review bar ahead of dsh, the tracy_build row', () => {
  const r = recorder()
  client.applyWith(r.ctx, { switches: switchBoard(true) })
  assert.deepEqual(
    r.of('conversation.chat.turnTail').map((e) => e.options.id),
    ['tracy-build-chat-templates', 'tracy-build-chat-plan', 'tracy-build-chat-run']
  )
  assert.equal(r.of('conversation.composer')[0].options.priority, -20)
  assert.equal(r.of('tool.call.toolview')[0].options.key, 'tracy_build')
  assert.deepEqual(
    r.definitions.map((d) => d.kind),
    ['tracy_build:templates', 'tracy_build:plan']
  )
})

test('switch off: no visible piece is registered, and turning it off takes them away', () => {
  const off = recorder()
  client.applyWith(off.ctx, { switches: switchBoard(false) })
  assert.equal(off.live.size, 0)
  const flipped = recorder()
  const board = switchBoard(true)
  client.applyWith(flipped.ctx, { switches: board })
  assert.equal(flipped.live.size, 5)
  board.flip(false)
  assert.equal(flipped.live.size, 0)
  board.flip(true)
  assert.equal(flipped.live.size, 5)
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
  // In the build session the plan and template tails draw (the run tail draws its own empty feed as nothing).
  assert.notEqual(r.of('conversation.chat.turnTail')[1].component(owner(BUILD)), null)
  const view = { phase: 'result', block: { call: { argsRaw: '{"action":"plan"}' }, content: [] } }
  assert.equal(r.of('tool.call.toolview')[0].component({ ...view, sessionId: OTHER }), null)
  assert.notEqual(r.of('tool.call.toolview')[0].component({ ...view, sessionId: BUILD }), null)
  const pending = (sessionId, id = 'plan-review') => ({
    sessionId,
    key: 'k',
    questions: [
      { id, question: 'Approve this plan?', options: [{ label: 'Approve' }, { label: 'Request changes' }] }
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
