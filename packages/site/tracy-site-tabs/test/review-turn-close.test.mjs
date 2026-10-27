/**
 * REVIEW (09/10/2026) — the turn close, driven by dsh's REAL agent loop rather than a hand-made log.
 *
 *   node --test packages/site/tracy-site-tabs/test/review-turn-close.test.mjs
 *
 * The shipped plugin (`lib/index.js`) runs on a real dsh Context (vendored build, `pnpm dsh:build`)
 * with a scripted model; `fetch` is stubbed, so what is asserted is exactly what tracy-web's
 * `POST /api/sites/:key/turn` and `/moment` receive.
 *
 * Two findings are pinned here (each test failed on develop 6d8434735; both are fixed in `turn-record.mjs`:
 * `stoppingReasonOf`, and the per-session `sweeps` the next turn waits for):
 *
 *  1. `endReason` is never sent for a turn that reaches `agent/turn-stopping` (every `completed` and
 *     every `max-tokens` turn). dsh dispatches `agent/turn-stopping` BEFORE it appends `turn/end`
 *     (`agent-loop/src/agent.ts`: the serial dispatch inside the step loop, `turn/end` in the
 *     `finally`), so `endReasonOf(events, turn)` in `turnStopping` reads a log that does not hold the
 *     turn's end yet, answers null, and the record is marked closed — the idle sweep skips closed
 *     records, so nothing ever sends it. `site_turn.end_reason` stays NULL for every normal turn.
 *     The existing test in `turn-record.test.mjs` passes only because it hands `turnStopping` a log
 *     that already contains `turn/end`, which dsh never does.
 *
 *  2. The idle sweep's close is fire-and-forget (`void book.idle(…)` in `watchHost`), so a turn
 *     that ended in an error or a cancel can still have its `/moment` in flight while the NEXT turn
 *     opens (its `/turn` seals the worktree) and the agent writes. `watchHost` promises "the turn's
 *     files are committed before the next turn's can mix in"; for a swept turn nothing enforces it.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { apply } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
const LOOP_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/agent-loop')
const fromLoop = createRequire(path.join(LOOP_DIR, 'package.json'))
const load = async (/** @type {string} */ name) => await import(pathToFileURL(fromLoop.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const llm = await load('@deepseek-ai/dsh-llm')
const { LlmAdapter, createUserMessage } = llm
const LlmRuntime = llm.default
const SessionStore = (await load('@deepseek-ai/dsh-session')).default
const SessionProjectionRegistry = (await load('@deepseek-ai/dsh-session-projection')).default
const SystemPrompt = (await load('@deepseek-ai/dsh-system-prompt')).default
const ToolRuntime = (await load('@deepseek-ai/dsh-tools')).default
const AgentRegistry = (await load('@deepseek-ai/dsh-agent')).default
const AgentLoop = (await import(pathToFileURL(path.join(LOOP_DIR, 'lib', 'index.js')).href)).default

const MODEL = { provider: 'mock', model: 'mock' }
const EMAIL = 'ada@example.com'

/** A model whose n-th request answers by `script[n]`: 'text', 'max-tokens', 'throw'. */
class ScriptedModel extends LlmAdapter {
  /** @param {string[]} script */
  constructor(script) {
    super()
    this.script = script
    /** @type {number[]} when each request arrived (Date.now()) */
    this.requests = []
  }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options) {
    this.requests.push(Date.now())
    const entry = this.script.shift() ?? 'text'
    if (entry === 'throw') throw new Error('DeepSeek Messages transport failed')
    if (entry === 'hang') {
      // Streams a little, then waits until the turn is cancelled.
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Working on' }
      await new Promise((_resolve, reject) => {
        if (options.signal?.aborted) reject(new Error('aborted'))
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })
      return
    }
    if (entry === 'wait') await this.gate
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'done' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: entry === 'max-tokens' ? 'max-tokens' : 'stop' } }
  }
}

let sites
const saved = {}
const realFetch = globalThis.fetch

before(() => {
  sites = mkdtempSync(path.join(tmpdir(), 'review-turn-close-'))
  mkdirSync(path.join(sites, 'qaem643'), { recursive: true })
  for (const name of ['TRACY_SITES_ROOT', 'MCP_TRACY_ORIGIN', 'MCP_TRACY_SITE_KEY', 'DSH_PASSWORDS_ENV_FILE'])
    saved[name] = process.env[name]
  process.env.TRACY_SITES_ROOT = sites
  process.env.MCP_TRACY_ORIGIN = 'http://tracy.test'
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})

after(() => {
  globalThis.fetch = realFetch
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  rmSync(sites, { recursive: true, force: true })
})

/**
 * One host dsh with the shipped plugin installed, and a `fetch` that records every door call.
 * @param {string[]} script - the model's answers, in order.
 * @param {(door: string, body: any) => Promise<void> | void} [hold] - may delay a door's answer.
 */
async function boot(script, hold = () => {}) {
  /** @type {{ door: string, body: any, at: number, actor?: string, answeredAt?: number }[]} */
  const calls = []
  globalThis.fetch = async (url, init) => {
    const door = String(url).split('/').pop()
    const call = {
      door,
      body: JSON.parse(String(init.body)),
      at: Date.now(),
      actor: init.headers['x-tracy-actor']
    }
    calls.push(call)
    await hold(door, call.body)
    call.answeredAt = Date.now()
    return new Response(JSON.stringify({ ok: true, undone: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  const model = new ScriptedModel([...script])
  ctx.llm.registerAdapter(['mock'], model)
  apply({
    webServer: { register: () => () => {} },
    agents: ctx.agents,
    on: (event, listener, options) => ctx.on(event, listener, options),
    effect: (setup, label) => ctx.effect(setup, label),
    // The password gate's signer: any non-empty assertion.
    get: (name) => (name === 'tracyAssertion' ? { mint: (email) => `assertion-for-${email}` } : undefined)
  })
  const { agent } = await ctx.agents.create({
    sessionId: `review-close-${Math.random().toString(36).slice(2, 8)}`,
    agentOptions: MODEL,
    meta: { cwd: path.join(sites, 'qaem643') }
  })
  return { ctx, agent, model, calls }
}

/** What dsh's session controller queues when a signed-in person types. */
function type(agent, text) {
  agent.followup(
    createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user', prompter: { user: 'Ada', email: EMAIL } }
    })
  )
}

/** Let the plugin's un-awaited idle sweep finish its door calls. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

const endOf = (agent, turn) =>
  agent.session
    .snapshotEvents()
    .filter((e) => e.type === 'turn/end' && e.data.turn === turn)
    .map((e) => e.data.reason?.kind)

test('a turn that completed normally tells tracy-web it completed (endReason on /moment)', async () => {
  const { ctx, agent, calls } = await boot(['text'])
  type(agent, 'Change the heading')
  await agent.whenIdle()
  await settle()
  assert.deepEqual(endOf(agent, 1), ['completed'], 'dsh itself recorded the turn as completed')
  const moments = calls.filter((c) => c.door === 'moment')
  assert.equal(moments.length, 1, 'one close for the one turn')
  assert.equal(
    moments[0].body.endReason,
    'completed',
    'the close must carry the reason dsh logged; turn-stopping runs before turn/end, so it never does'
  )
  await ctx.fiber.dispose()
})

test('a turn cut at the output-token ceiling tells tracy-web so (endReason max-tokens on /moment)', async () => {
  const { ctx, agent, calls } = await boot(['max-tokens'])
  type(agent, 'Rewrite every page')
  await agent.whenIdle()
  await settle()
  assert.deepEqual(endOf(agent, 1), ['max-tokens'], 'dsh itself recorded the turn as max-tokens')
  const reasons = calls.filter((c) => c.door === 'moment').map((c) => c.body.endReason)
  assert.ok(
    reasons.includes('max-tokens'),
    `some close must say max-tokens; the doors received ${JSON.stringify(reasons)}`
  )
  await ctx.fiber.dispose()
})

test('control: a turn that errored is closed by the idle sweep WITH its reason', async () => {
  const { ctx, agent, calls } = await boot(['throw'])
  type(agent, 'Fix the footer')
  await agent.whenIdle()
  await settle()
  assert.deepEqual(endOf(agent, 1), ['error'])
  const moments = calls.filter((c) => c.door === 'moment')
  assert.deepEqual(
    moments.map((c) => c.body.endReason),
    ['error']
  )
  await ctx.fiber.dispose()
})

// Option A (#1403, `turn-open-hold.test.mjs`): the next turn's model may READ while the earlier close
// is out — its undone list comes from the read-only `turn/undone` door — but its open (the seal) and
// so its first write wait until that close is answered. What this test guards is the seal: opened
// early, it could commit turn 2's first edits under turn 1's Tracy-Turn trailer, or seal turn 1's
// files as made outside Tracy.
test("a swept turn's moment is answered before the next turn opens (no mixing of two turns' files); its model may read meanwhile", async () => {
  /** The first `/moment` (the errored turn's close) is held, as tracy-web holds it ~10 s on a busy host. */
  let release
  const held = new Promise((resolve) => {
    release = resolve
  })
  let firstMoment = true
  const { ctx, agent, model, calls } = await boot(['throw', 'text'], async (door) => {
    if (door === 'moment' && firstMoment) {
      firstMoment = false
      await held
    }
  })
  type(agent, 'Fix the footer')
  await agent.whenIdle()
  // The person types again right after the error, as Brian did on 03/10.
  type(agent, 'Try again please')
  // Give the second turn every chance to run while turn 1's close is still unanswered.
  await new Promise((resolve) => setTimeout(resolve, 300))
  const moment1 = calls.find((c) => c.door === 'moment' && c.body.turnId.endsWith(':1'))
  const openedWhileHeld = calls.some((c) => c.door === 'turn' && c.body.turnId.endsWith(':2'))
  const moment1Unanswered = moment1 !== undefined && moment1.answeredAt === undefined
  const turn2DoorsWhileHeld = calls.filter((c) => c.body?.turnId?.endsWith(':2')).map((c) => c.door)
  release()
  await until(() => model.requests.length >= 2)
  await agent.whenIdle()
  await settle()
  assert.ok(moment1, 'turn 1 (errored) was closed by the sweep')
  assert.ok(moment1Unanswered, "precondition: turn 1's close was still held when turn 2 was looked at")
  assert.equal(
    openedWhileHeld,
    false,
    "turn 2 opened (seal) while turn 1's /moment was still unanswered: the host may commit " +
      "turn 2's first edits under turn 1's Tracy-Turn trailer, or seal turn 1's files as outside"
  )
  // Read-only meanwhile: at most the undone list, never a door that writes or seals.
  assert.ok(
    turn2DoorsWhileHeld.every((door) => door === 'undone'),
    `turn 2 called ${JSON.stringify(turn2DoorsWhileHeld)} while turn 1's close was out`
  )
  const open2 = calls.find((c) => c.door === 'turn' && c.body.turnId.endsWith(':2'))
  assert.ok(open2, 'turn 2 was opened once turn 1 had closed')
  assert.ok(model.requests.length >= 2, "turn 2's model ran once turn 1 had closed")
  await ctx.fiber.dispose()
})

// ── Coverage on the real loop (these PASS on develop 6d8434735) ────────────────────────────────────

/** Until `predicate` holds, polling every 5 ms (at most ~2 s). */
async function until(predicate) {
  for (let i = 0; i < 400 && !predicate(); i++) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.ok(predicate(), 'condition never held')
}

test('coverage: a turn the person cancels is closed by the idle sweep as aborted, with the words it got out', async () => {
  const { ctx, agent, model, calls } = await boot(['hang'])
  type(agent, 'Redo the header')
  await until(() => model.requests.length === 1)
  agent.cancel({ kind: 'user' })
  await agent.whenIdle()
  await settle()
  assert.deepEqual(endOf(agent, 1), ['aborted'])
  const moments = calls.filter((c) => c.door === 'moment')
  assert.equal(moments.length, 1)
  assert.equal(moments[0].body.turnId.endsWith(':1'), true)
  assert.equal(moments[0].body.endReason, 'aborted')
  await ctx.fiber.dispose()
})

test('coverage: a second message typed into a running turn marks it steered — one row, one close, signed as the opener', async () => {
  const { ctx, agent, model, calls } = await boot(['wait', 'text'])
  let open
  model.gate = new Promise((resolve) => {
    open = resolve
  })
  type(agent, 'Change the heading')
  await until(() => model.requests.length === 1)
  agent.steer(
    createUserMessage({
      content: [{ type: 'text', text: 'and make it blue' }],
      source: { kind: 'user', prompter: { user: 'Bob', email: 'bob@example.com' } }
    })
  )
  open()
  await agent.whenIdle()
  await settle()
  const opens = calls.filter((c) => c.door === 'turn')
  assert.deepEqual(
    opens.map((c) => [c.body.turnId.split(':').pop(), c.body.title, c.body.steered === true]),
    [
      ['1', 'Change the heading', false],
      ['1', 'Change the heading', true]
    ]
  )
  const moments = calls.filter((c) => c.door === 'moment')
  assert.equal(moments.length, 1, 'one close for the one turn')
  assert.equal(moments[0].body.title, 'Change the heading')
  assert.deepEqual(
    [...opens, ...moments].map((c) => c.actor),
    [`assertion-for-${EMAIL}`, 'assertion-for-bob@example.com', `assertion-for-${EMAIL}`]
  )
  await ctx.fiber.dispose()
})

test('coverage: a turn that only answered still opens and closes (the host decides there was nothing to commit)', async () => {
  const { ctx, agent, calls } = await boot(['text'])
  type(agent, 'What does the footer say?')
  await agent.whenIdle()
  await settle()
  assert.deepEqual(
    calls.map((c) => c.door),
    ['turn', 'moment']
  )
  assert.equal(calls[1].body.reply, 'done')
  assert.equal(calls[1].body.replyState, 'full')
  await ctx.fiber.dispose()
})
