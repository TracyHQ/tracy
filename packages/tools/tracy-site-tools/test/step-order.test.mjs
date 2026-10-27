/**
 * The order of one step's messages, for DeepSeek's prefix cache (harness profile 09/10/2026, candidate
 * 2, `step-order.mjs`): on a conversation's first step, dsh's stable context — the site's AGENTS.md,
 * the runtime context, the skill catalog — and Tracy's site facts go in FRONT of the customer's words,
 * the per-turn notices behind them, an explicitly invoked skill last; and nothing already logged ever
 * moves, so the prompt stays append-only within a turn and across turns.
 *
 *   node --test packages/tools/tracy-site-tools/test/step-order.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { isStableContext, orderStepMessages, STABLE_CONTEXT_KINDS } from '../src/host/step-order.mjs'

const { apply } = await import('../lib/index.js')

/** A message of `kind`, named `id` so an order reads at a glance. */
const msg = (id, kind, text = id) => ({
  id,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind }
})
const isCustomer = (m) => m?.source?.kind === 'user'
const ids = (messages) => messages.map((m) => m.id)

// ── the pure order ────────────────────────────────────────────────────────────────────────────────

test('orderStepMessages: stable context and facts before the customer, per-turn notices after, an invoked skill last', () => {
  const customer = msg('customer', 'user')
  const agents = msg('agents', 'agent-instructions')
  const runtime = msg('runtime', 'runtime-context')
  const catalog = msg('catalog', 'skill-catalog')
  const skill = msg('skill', 'skill-invocation')
  const undone = msg('undone', 'tracy-site')
  const queued = msg('queued', 'tracy-site')
  const facts = [msg('facts', 'tracy-site')]
  const added = [msg('today', 'tracy-site'), msg('plain', 'tracy-site')]
  const cases = [
    // [what the inner listeners left, facts, added, expected order]
    [
      [customer, agents, runtime, catalog],
      facts,
      added,
      ['agents', 'runtime', 'catalog', 'facts', 'customer', 'today', 'plain']
    ],
    // The undone notice stays right after the customer's message; the catalog joins the stable block.
    [
      [customer, undone, agents, runtime, catalog, skill],
      facts,
      added,
      ['agents', 'runtime', 'catalog', 'facts', 'customer', 'undone', 'today', 'plain', 'skill']
    ],
    // What came before the customer stays first.
    [[queued, customer, agents], facts, added, ['queued', 'agents', 'facts', 'customer', 'today', 'plain']],
    // No facts (they were sent already): the stable context still moves in front.
    [[customer, runtime], [], added, ['runtime', 'customer', 'today', 'plain']],
    // A step with no customer message (a tool continuation) keeps dsh's order; Tracy's join its end.
    [[agents, runtime], facts, added, ['agents', 'runtime', 'facts', 'today', 'plain']],
    [[], [], added, ['today', 'plain']]
  ]
  for (const [messages, f, a, expected] of cases) {
    assert.deepEqual(ids(orderStepMessages(messages, f, a, isCustomer)), expected, expected.join(','))
  }
})

test('orderStepMessages: nothing to add or move hands back the same array', () => {
  const customer = msg('customer', 'user')
  for (const messages of [
    [customer],
    [customer, msg('skill', 'skill-invocation')],
    [msg('runtime', 'runtime-context')],
    []
  ]) {
    assert.equal(orderStepMessages(messages, [], [], isCustomer), messages)
  }
})

test('isStableContext: only dsh’s three stable kinds', () => {
  assert.deepEqual([...STABLE_CONTEXT_KINDS], ['agent-instructions', 'runtime-context', 'skill-catalog'])
  for (const kind of STABLE_CONTEXT_KINDS) assert.equal(isStableContext(msg('x', kind)), true)
  for (const kind of ['user', 'tracy-site', 'skill-invocation', 'time-context', 'session-reference'])
    assert.equal(isStableContext(msg('x', kind)), false, kind)
  assert.equal(isStableContext(null), false)
})

// ── the host's own pre-step ───────────────────────────────────────────────────────────────────────

function folder() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-order-'))
  const dir = path.join(root, 'shop1')
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'shop1.tracy.test', platform: 'wordpress' })
  )
  return { root, dir }
}

/**
 * The built plugin on a host dsh; `conversation(id)` answers a `step(text, inner)` that runs this
 * plugin's pre-step the way dsh's waterfall does — `inner` stands for what every other listener left —
 * and appends what the step enters with to that conversation's log, as dsh does (`agent.ts` `step`).
 */
function host(root) {
  process.env.TRACY_SITES_ROOT = root
  const listeners = new Map()
  /** @type {Map<string, any[]>} */
  const logs = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (setup) => {
        setup()
      },
      on: (name, fn, prepend) => listeners.set(name, [...(listeners.get(name) ?? []), { fn, prepend }]),
      get: () => undefined
    },
    { origin: 'http://door.test', now: () => new Date('2026-10-09T08:00:00Z') }
  )
  const hooks = listeners.get('agent/pre-step') ?? []
  const conversation = (sessionId, cwd) => {
    const log = []
    logs.set(sessionId, log)
    const step = async (text, inner) => {
      const claimed = text === null ? [] : [msg(`customer-${log.length}`, 'user', text)]
      const events = log.map((message) => ({ type: 'user/message', data: message }))
      const agent = {
        id: sessionId,
        session: {
          id: sessionId,
          header: { cwd },
          seq: events.length,
          eventAt: (seq) => events[seq],
          surface: { nodes: events.map((_, seq) => seq) }
        }
      }
      const decision = await hooks[0].fn({ agent, messages: claimed, turn: 1 }, async () => ({
        kind: 'enter',
        messages: inner(claimed)
      }))
      log.push(...decision.messages)
      return decision.messages
    }
    return { step, log }
  }
  return { hooks, conversation }
}

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

/** What dsh's own listeners fold into a first step: the prompt, then AGENTS.md, the runtime context, the catalog. */
const dshFirstStep = (claimed) => [
  ...claimed,
  msg('agents', 'agent-instructions', '# AGENTS.md of shop1'),
  msg('runtime', 'runtime-context', 'Current runtime context: …'),
  msg('catalog', 'skill-catalog', '<available_skills>…</available_skills>')
]

const kinds = (messages) => messages.map((m) => m.source.producer ?? m.source.kind)

test('🔒 the listener is registered FIRST in the waterfall (prepend), so it sees the catalog every other listener adds', () => {
  const { root } = folder()
  const { hooks } = host(root)
  assert.equal(hooks.length, 1)
  assert.equal(hooks[0].prepend, true)
})

test('🔒 step 1: AGENTS.md, the runtime context, the catalog and the site facts go before the customer — the same bytes for two conversations on one site', async () => {
  const { root, dir } = folder()
  const h = host(root)
  const a = await h.conversation('session-a', dir).step('change the phone number', dshFirstStep)
  const b = await h.conversation('session-b', dir).step('what does the home page say?', dshFirstStep)
  const at = (messages) => messages.findIndex((m) => m.source.kind === 'user')
  assert.deepEqual(kinds(a).slice(0, at(a) + 1), [
    'agent-instructions',
    'runtime-context',
    'skill-catalog',
    'tracy-site-tools:site-context',
    'user'
  ])
  // Behind the customer: only what changes with the turn.
  for (const kind of kinds(a).slice(at(a) + 1)) {
    assert.ok(!STABLE_CONTEXT_KINDS.includes(kind) && kind !== 'tracy-site-tools:site-context', kind)
  }
  const before = (messages) => JSON.stringify(messages.slice(0, at(messages)).map((m) => [m.role, m.content]))
  assert.equal(before(a), before(b), 'everything before the customer’s words is shared by both conversations')
})

test('🔒 append-only: no step re-sends or reorders what is already in the log, within a turn and across turns', async () => {
  const { root, dir } = folder()
  const h = host(root)
  const { step, log } = h.conversation('session-c', dir)
  const serialized = () => JSON.stringify(log.map((m) => [m.id, m.content]))
  const snapshots = []
  // Turn 1, step 1; a tool continuation (dsh re-sends a changed runtime context mid-turn); turn 2.
  await step('change the phone number', dshFirstStep)
  snapshots.push(serialized())
  const continuation = await step(null, () => [
    msg('runtime-2', 'runtime-context', 'Current runtime context: changed')
  ])
  assert.deepEqual(
    ids(continuation).slice(0, 1),
    ['runtime-2'],
    'a step without the customer keeps dsh’s order'
  )
  snapshots.push(serialized())
  const second = await step('and the email', (claimed) => [
    ...claimed,
    msg('catalog-2', 'skill-catalog', '<available_skills> updated </available_skills>')
  ])
  assert.deepEqual(kinds(second).slice(0, 2), ['skill-catalog', 'user'])
  snapshots.push(serialized())
  for (let i = 1; i < snapshots.length; i++) {
    const previous = snapshots[i - 1].slice(0, -1)
    assert.ok(snapshots[i].startsWith(previous), `step ${i + 1} only appends to the prompt`)
  }
  const seen = new Set()
  for (const message of log) {
    assert.ok(!seen.has(message.id), `${message.id} entered twice`)
    seen.add(message.id)
  }
})
