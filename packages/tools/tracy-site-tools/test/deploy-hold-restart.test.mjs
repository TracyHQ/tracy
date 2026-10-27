/**
 * #517: a follow-up held during a deploy drain must survive the dsh restart the drain waits for, and
 * run once after it. Measured 28/09 on dev (`qaem643`): two messages held during a drain were gone
 * after the recreate; the third message's turn found nothing of them.
 *
 * Everything at the restart boundary is dsh's own, from the vendored build: `AgentLoop`, the JSONL
 * session store, the agent registry, a real turn driver. Only the model is a stand-in that answers
 * "ok" and records what it was asked. The hold and the release are the two calls
 * `@deepseek-ai/dsh-api-session-controller` makes (`commands.ts`: a held prompt is
 * `agent.send(message, 'next-turn', false)`; `releaseHeldPrompts` splices the queue and re-sends it,
 * waking on the last), and the plugin half is the shipped `lib/index.js`, wired to a real Context.
 *
 *   node --test packages/tools/tracy-site-tools/test/deploy-hold-restart.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { apply } from '../lib/index.js'
import {
  CUT,
  heldPrompts,
  keepHeldInbox,
  MAX_ATTEMPTS,
  messageFates,
  readHeldFile,
  wireDeployHold
} from '../src/host/deploy-hold.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
// dsh's agent loop and its test-time neighbours, from the vendored build (`pnpm dsh:build`).
const LOOP_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/agent-loop')
const fromLoop = createRequire(path.join(LOOP_DIR, 'package.json'))
const load = async (/** @type {string} */ name) => await import(pathToFileURL(fromLoop.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const llm = await load('@deepseek-ai/dsh-llm')
const LlmRuntime = llm.default
const { LlmAdapter, createUserMessage } = llm
const SessionStore = (await load('@deepseek-ai/dsh-session')).default
const SessionProjectionRegistry = (await load('@deepseek-ai/dsh-session-projection')).default
const SystemPrompt = (await load('@deepseek-ai/dsh-system-prompt')).default
const ToolRuntime = (await load('@deepseek-ai/dsh-tools')).default
const AgentRegistry = (await load('@deepseek-ai/dsh-agent')).default
const JsonlSessionPersistence = (await load('@deepseek-ai/dsh-session-persistence-jsonl')).default
const AgentLoop = (await import(pathToFileURL(path.join(LOOP_DIR, 'lib', 'index.js')).href)).default
// The question seam and the model-facing `ask_user_question` tool, from the same vendored build.
const INTERACTION = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/interaction')
const UserQuestionService = (
  await import(pathToFileURL(path.join(INTERACTION, 'user-questions', 'lib', 'index.js')).href)
).default
const toolAskUser = await import(
  pathToFileURL(path.join(INTERACTION, 'tool-ask-user', 'lib', 'index.js')).href
)

/**
 * A model that answers "ok" to every request and records the last text a PERSON sent it — this
 * plugin's own notices (the reply-language and plain-words rules ride after every person's message since 30/09) are
 * the machine talking, not the prompt the queue held.
 */
class RecordingModel extends LlmAdapter {
  /** @type {string[]} */
  asked = []
  /** While set, a request is recorded and then waits until its turn is cancelled (never answers). */
  hang = false
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options) {
    // The plugin's notices (`<system-reminder>…`: the site's facts, and since fix A of perf/round7 the day)
    // are user messages too, and the day rides AFTER the customer's words: what the customer said is the
    // last user message that is not one of them — nor the plain-words and reply-language rules.
    const users = (options.messages ?? []).filter(
      (m) =>
        m.role === 'user' &&
        m.source?.producer !== 'tracy-site-tools:reply-language' &&
        m.source?.producer !== 'tracy-site-tools:plain-reply' &&
        !(m.content ?? []).some((b) => b.type === 'text' && b.text.startsWith('<system-reminder>'))
    )
    const last = users.at(-1)
    this.asked.push(
      (last?.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
    )
    if (this.hang) {
      await new Promise((resolve) => {
        if (options.signal?.aborted) resolve(undefined)
        options.signal?.addEventListener('abort', () => resolve(undefined), { once: true })
      })
      options.signal?.throwIfAborted()
      throw new Error('hung request ended without an abort')
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * A model whose first answer calls `ask_user_question` and whose next ones say "ok". It records, for
 * each request, whether the session's chat lease file was there when the model was asked (#561).
 */
class AskingModel extends LlmAdapter {
  /** @type {boolean[]} */
  leaseSeen = []
  /** @type {string[]} */
  requests = []
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options) {
    this.leaseSeen.push(existsSync(chatLease()))
    this.requests.push(JSON.stringify(options.messages ?? []))
    if (this.leaseSeen.length === 1) {
      const args = JSON.stringify({
        questions: [{ id: 'go', question: 'Change the menu?', options: [{ label: 'Yes' }, { label: 'No' }] }]
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: 'ask-1',
        name: 'ask_user_question',
        argumentsDelta: args
      }
      yield {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'ask-1', name: 'ask_user_question', arguments: args }
      }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * The customer's side of a question: pending until the test answers it, rejected when the turn's
 * signal aborts (as the browser's answerer is). `asked` records whether the lease was there then.
 */
function desk() {
  /** @type {{ asked: { leaseHeld: boolean, request: any, resolve: (a: unknown) => void, reject: (e: unknown) => void }[], wake: null | (() => void), answer: (request: any) => Promise<unknown>, waitAsked: () => Promise<void> }} */
  const d = {
    asked: [],
    wake: null,
    answer(request) {
      return new Promise((resolve, reject) => {
        d.asked.push({ leaseHeld: existsSync(chatLease()), request, resolve, reject })
        const signal = request.signal
        const abort = () => reject(signal.reason ?? new Error('aborted'))
        if (signal?.aborted) abort()
        else signal?.addEventListener('abort', abort, { once: true })
        d.wake?.()
      })
    },
    waitAsked: () =>
      new Promise((resolve) => {
        if (d.asked.length > 0) resolve()
        else d.wake = resolve
      })
  }
  return d
}

let home
let root
let sites
const saved = {}
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), 'deploy-hold-restart-home-'))
  root = mkdtempSync(path.join(tmpdir(), 'deploy-hold-restart-sessions-'))
  sites = mkdtempSync(path.join(tmpdir(), 'deploy-hold-restart-sites-'))
  for (const key of ['DSH_HOME', 'TRACY_SITES_ROOT']) saved[key] = process.env[key]
  process.env.DSH_HOME = home
  process.env.TRACY_SITES_ROOT = sites
})
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const dir of [home, root, sites]) rmSync(dir, { recursive: true, force: true })
})

const SID = 'session-517-held'
const chatLease = () => path.join(home, 'leases', `chat-${SID}.json`)
const MODEL = { provider: 'mock', model: 'mock' }
const drainFile = () => path.join(home, 'draining')

/** One dsh process: its own Context over the same session root and `$DSH_HOME`. */
async function boot({ plugin = true, release = undefined, questions = false, answerer = undefined } = {}) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root })
  await ctx.plugin(AgentLoop, { agents: [] })
  if (questions) {
    await ctx.plugin(UserQuestionService)
    await ctx.plugin(toolAskUser)
  }
  // An answerer that is there before the plugin: the plugin's listener must still wrap it.
  if (answerer === 'first') ctx.on('user-questions/request', (request) => questions.answer(request))
  const model = questions ? new AskingModel() : new RecordingModel()
  ctx.llm.registerAdapter(['mock'], model)
  if (plugin === 'wired') {
    // The plugin's own wiring with its release pass in hand (`apply` runs the same on a timer).
    ctx.provide('sessionController', {
      releaseHeldPrompts: (/** @type {string} */ id) => (release ?? releaseHeldPrompts)(ctx, id)
    })
    const queue = heldPrompts({ dir: home, warn: () => {} })
    const { tick } = wireDeployHold(ctx, { queue, site: () => 'qaem643', warn: () => {} })
    return { ctx, model, queue, tick }
  }
  if (plugin) {
    // The shipped plugin, on the real event bus: `on` and `get` are the Context's own.
    apply({
      webServer: { register: () => () => {} },
      tools: { register: () => () => {} },
      effect: (setup) => ctx.effect(setup),
      on: (event, listener, options) => ctx.on(event, listener, options),
      get: (name) => ctx.get(name)
    })
  }
  if (answerer === 'last') ctx.on('user-questions/request', (request) => questions.answer(request))
  return { ctx, model }
}

/** What dsh's session controller does with one ordinary prompt (`commands.ts` prompt admission). */
function prompt(ctx, agent, text) {
  const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
  if (ctx.bail('api-session/prompt-hold', agent.id) === true) agent.send(message, 'next-turn', false)
  else agent.followup(message)
  return message.id
}

/** `sessionController.releaseHeldPrompts`, verbatim in behaviour, over the real registry. */
async function releaseHeldPrompts(ctx, sessionId) {
  if (ctx.bail('api-session/prompt-hold', sessionId) === true) return 0
  const agent =
    ctx.agents.get(sessionId) ??
    (await ctx.agents.resume({ resumeSessionId: sessionId, agentOptions: MODEL })).agent
  if (agent.status !== 'idle' || agent.inbox.nextTurn.length === 0) return 0
  const pending = agent.inbox.splice('next-turn', 0, Infinity, [])
  pending.forEach((message, index) => agent.send(message, 'next-turn', index === pending.length - 1))
  return pending.length
}

const texts = (agent) => agent.inbox.nextTurn.map((m) => m.content.map((b) => b.text).join(''))
const idle = (agent) => agent.whenIdle()

async function createHeld(ctx) {
  const cwd = path.join(sites, 'qaem643')
  const { agent } = await ctx.agents.create({
    sessionId: SID,
    agentOptions: MODEL,
    meta: { cwd }
  })
  return agent
}

test('dsh alone: disposing an agent cancels its held queue for good (the #517 loss)', async () => {
  const first = await boot({ plugin: false })
  const agent = await createHeld(first.ctx)
  first.ctx.on('api-session/prompt-hold', () => true)
  prompt(first.ctx, agent, 'one')
  prompt(first.ctx, agent, 'two')
  assert.deepEqual(texts(agent), ['one', 'two'], 'held in the durable queue before the restart')
  await first.ctx.fiber.dispose()

  const second = await boot({ plugin: false })
  const { agent: resumed } = await second.ctx.agents.resume({ resumeSessionId: SID, agentOptions: MODEL })
  // This is the first place the prompts are lost: the disposal wrote a cancelling splice.
  assert.deepEqual(texts(resumed), [])
  const fates = messageFates(resumed.session.snapshotEvents())
  assert.deepEqual([...fates.values()], ['canceled', 'canceled'])
  await second.ctx.fiber.dispose()
})

test('held during a drain: the queue survives the restart and each message runs once, in order', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const ids = [prompt(first.ctx, agent, 'one'), prompt(first.ctx, agent, 'two')]
  assert.deepEqual(texts(agent), ['one', 'two'])
  assert.equal(first.model.asked.length, 0, 'no turn starts while the deploy drains')
  const file = readHeldFile(home)
  assert.equal(file.ok, true)
  assert.deepEqual(file.sessions.get(SID)?.messages, ids)
  assert.equal(file.sessions.get(SID)?.site, 'qaem643')
  await first.ctx.fiber.dispose()

  // The deploy recreates dsh; the drain file goes with the old one.
  rmSync(drainFile())
  const second = await boot()
  const { agent: resumed } = await second.ctx.agents.resume({ resumeSessionId: SID, agentOptions: MODEL })
  assert.deepEqual(texts(resumed), ['one', 'two'], 'the queue came back with the session')
  const released = await releaseHeldPrompts(second.ctx, SID)
  assert.equal(released, 2)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['one', 'two'])
  const fates = messageFates(resumed.session.snapshotEvents())
  assert.deepEqual(
    ids.map((id) => fates.get(id)),
    ['ran', 'ran']
  )
  // Released again: nothing left to run twice.
  assert.equal(await releaseHeldPrompts(second.ctx, SID), 0)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['one', 'two'])
  await second.ctx.fiber.dispose()
})

test('a message the author removed while held stays removed across the restart', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const [, removed] = [prompt(first.ctx, agent, 'keep'), prompt(first.ctx, agent, 'drop')]
  assert.equal(agent.inbox.remove(removed), true)
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot()
  const { agent: resumed } = await second.ctx.agents.resume({ resumeSessionId: SID, agentOptions: MODEL })
  assert.deepEqual(texts(resumed), ['keep'])
  assert.equal(await releaseHeldPrompts(second.ctx, SID), 1)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['keep'])
  await second.ctx.fiber.dispose()
})

test('the stop button and archive still clear a held queue; only disposal is changed', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'one')
  agent.cancel({ kind: 'user' })
  assert.deepEqual(texts(agent), [], 'a user cancel without keepInbox is dsh’s own')
  await first.ctx.fiber.dispose()
})

test('the queue is kept only while the session is held: after release, disposal is dsh’s own', async () => {
  const calls = []
  const agent = {
    cancel(cause, options) {
      calls.push([cause.kind, options?.keepInbox === true])
    }
  }
  let keeps = true
  assert.equal(
    keepHeldInbox(agent, () => keeps),
    true
  )
  assert.equal(
    keepHeldInbox(agent, () => keeps),
    true,
    'a second install swaps, never stacks'
  )
  agent.cancel({ kind: 'disposed' })
  agent.cancel({ kind: 'user' })
  keeps = false
  agent.cancel({ kind: 'disposed' })
  assert.deepEqual(calls, [
    ['disposed', true],
    ['user', false],
    ['disposed', false]
  ])
  assert.equal(
    keepHeldInbox(null, () => true),
    false
  )
  assert.equal(
    keepHeldInbox({}, () => true),
    false
  )
})

test('the next process releases what the file holds once, even when two passes race, then forgets it', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'one')
  prompt(first.ctx, agent, 'two')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())

  const second = await boot({ plugin: 'wired' })
  assert.deepEqual(second.queue.pending(), [SID])
  const counts = await Promise.all([second.tick(), second.tick()])
  assert.equal(counts[0] + counts[1], 2, 'released once between the two passes')
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['one', 'two'])
  assert.equal(second.queue.status(SID, 'qaem643').state, 'released')
  assert.equal(second.queue.status(SID, 'qaem643').count, 2)
  // The next pass reads the log: both claimed, the record ends.
  assert.equal(await second.tick(), 0)
  assert.deepEqual(second.queue.pending(), [])
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none')
  const file = readHeldFile(home)
  assert.equal(file.ok && file.sessions.has(SID), false)
  assert.deepEqual(second.model.asked, ['one', 'two'])
  await second.ctx.fiber.dispose()
})

test('a drain that ends without a restart: the same process releases them, in order, once', async () => {
  writeFileSync(drainFile(), '')
  const only = await boot({ plugin: 'wired' })
  const agent = await createHeld(only.ctx)
  prompt(only.ctx, agent, 'one')
  prompt(only.ctx, agent, 'two')
  assert.equal(await only.tick(), 0, 'nothing is released while the drain is on')
  assert.equal(only.queue.status(SID, 'qaem643').state, 'held')
  assert.deepEqual(only.model.asked, [])
  rmSync(drainFile())
  assert.equal(await only.tick(), 2)
  await idle(agent)
  assert.equal(await only.tick(), 0)
  assert.deepEqual(only.model.asked, ['one', 'two'])
  assert.deepEqual(only.queue.pending(), [])
  await only.ctx.fiber.dispose()
})

test('a queued message edited while held: only the edited text runs after the restart', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'draft')
  const edited = createUserMessage({ content: [{ type: 'text', text: 'final' }], source: { kind: 'user' } })
  assert.equal(agent.inbox.replace(id, edited), true)
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot({ plugin: 'wired' })
  assert.equal(await second.tick(), 1)
  await idle(second.ctx.agents.get(SID))
  assert.equal(await second.tick(), 0)
  assert.deepEqual(second.model.asked, ['final'])
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none')
  await second.ctx.fiber.dispose()
})

test('the first deploy of this fix: a version 1 record whose queue dsh already cancelled is told to its author on its site', async () => {
  // What production holds when this lands: a version 1 file written by the process the deploy
  // replaces (no site, no message ids), and a queue that process's disposal cancelled.
  const first = await boot({ plugin: false })
  const agent = await createHeld(first.ctx)
  first.ctx.on('api-session/prompt-hold', () => true)
  prompt(first.ctx, agent, 'lost')
  await first.ctx.fiber.dispose()
  writeFileSync(path.join(home, 'held-prompts.json'), JSON.stringify({ sessions: [SID] }))
  const second = await boot({ plugin: 'wired' })
  assert.equal(await second.tick(), 0)
  assert.deepEqual(second.model.asked, [])
  // dsh loaded the session for the release: the record learned its site, and the page of that
  // site is told — by its own record, with no message count to go by.
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'unknown',
    count: 0,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  assert.equal(second.queue.status(SID, 'wp-other').state, 'none')
  assert.equal(readHeldFile(home).ok && readHeldFile(home).sessions.get(SID)?.site, 'qaem643')
  await second.ctx.fiber.dispose()
})

test('the first deploy of this fix: a version 1 record whose queue survived is released and followed by id', async () => {
  const first = await boot({ plugin: false })
  const agent = await createHeld(first.ctx)
  first.ctx.on('api-session/prompt-hold', () => true)
  prompt(first.ctx, agent, 'one')
  prompt(first.ctx, agent, 'two')
  // A queue that survived its disposal (a drain that ended with no restart, then an upgrade).
  keepHeldInbox(agent, () => true)
  await first.ctx.fiber.dispose()
  writeFileSync(path.join(home, 'held-prompts.json'), JSON.stringify({ sessions: [SID] }))
  const second = await boot({ plugin: 'wired' })
  assert.equal(await second.tick(), 2)
  await idle(second.ctx.agents.get(SID))
  assert.deepEqual(second.model.asked, ['one', 'two'])
  assert.equal(second.queue.status(SID, 'qaem643').count, 2, 'the release taught the record its ids')
  assert.equal(await second.tick(), 0)
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none', 'both claimed: the record ends')
  await second.ctx.fiber.dispose()
})

test('a release that keeps failing on a loaded session keeps the held message queued, shown delayed, and runs it once when the release recovers', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  let failing = true
  const second = await boot({
    plugin: 'wired',
    release: async (ctx, id) => {
      // dsh loads the session, then refuses to send (a model it cannot reach for a while).
      if (!failing) return releaseHeldPrompts(ctx, id)
      if (!ctx.agents.get(id)) await ctx.agents.resume({ resumeSessionId: id, agentOptions: MODEL })
      throw new Error('prompt rejected')
    }
  })
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await second.tick()
  const resumed = second.ctx.agents.get(SID)
  assert.deepEqual(texts(resumed), ['held'], 'still queued: failed tries take nothing out')
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'delayed',
    count: 1,
    recorded: true,
    settled: false,
    id: null,
    earlier: []
  })
  assert.deepEqual(second.model.asked, [])
  failing = false
  assert.equal(await second.tick(), 1)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['held'])
  assert.equal(await second.tick(), 0)
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none')
  assert.deepEqual(second.model.asked, ['held'], 'once')
  await second.ctx.fiber.dispose()
})

test('a different message sent while the held one is delayed: the held one runs first, each once, nothing withdrawn', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'old')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  // The session cannot be loaded during the release passes (dsh refuses before loading it).
  const second = await boot({
    plugin: 'wired',
    release: async (ctx, id) => {
      if (!ctx.agents.get(id)) throw new Error('session not found')
      return releaseHeldPrompts(ctx, id)
    }
  })
  for (let i = 0; i < MAX_ATTEMPTS; i++) await second.tick()
  assert.equal(second.queue.status(SID, 'qaem643').state, 'delayed')
  // The author opens it and asks something else: dsh resumes it with the old message still queued.
  const { agent: resumed } = await second.ctx.agents.resume({ resumeSessionId: SID, agentOptions: MODEL })
  assert.deepEqual(texts(resumed), ['old'])
  prompt(second.ctx, resumed, 'new')
  await idle(resumed)
  assert.equal(second.model.asked.at(-1), 'new')
  assert.ok(
    second.model.asked.length === 1 || JSON.stringify(second.model.asked) === JSON.stringify(['old', 'new']),
    `the old message ran ahead of the new one, not dropped: ${JSON.stringify(second.model.asked)}`
  )
  const log = messageFates(resumed.session.snapshotEvents())
  assert.equal([...log.values()].filter((f) => f === 'ran').length, 2, 'both ran')
  assert.equal(await second.tick(), 0)
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none', 'the log shows it ran: the record ends')
  await second.ctx.fiber.dispose()
})

test('a session dsh keeps refusing past the retries, across one more restart, still runs its held message once dsh takes it', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'old')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const refusing = await boot({
    plugin: 'wired',
    release: async () => {
      // dsh refuses before loading the session (not ready yet), past the fifth pass.
      throw new Error('session not found')
    }
  })
  for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await refusing.tick()
  assert.equal(refusing.queue.status(SID, 'qaem643').state, 'delayed', 'its author is told meanwhile')
  assert.deepEqual(refusing.model.asked, [])
  await refusing.ctx.fiber.dispose()
  // The next process finds the session cold and still held: its release loads it and runs it.
  const third = await boot({ plugin: 'wired' })
  assert.equal(third.queue.status(SID, 'qaem643').state, 'delayed')
  assert.equal(await third.tick(), 1)
  const resumed = third.ctx.agents.get(SID)
  await idle(resumed)
  assert.deepEqual(third.model.asked, ['old'])
  assert.equal(await third.tick(), 0)
  assert.equal(third.queue.status(SID, 'qaem643').state, 'none')
  assert.equal(await third.tick(), 0)
  assert.deepEqual(third.model.asked, ['old'], 'once')
  await third.ctx.fiber.dispose()
})

test('a message its author removes while a release awaits is the author’s removal, not a message that did not run', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  prompt(first.ctx, agent, 'keep')
  const drop = prompt(first.ctx, agent, 'drop')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  /** @type {() => void} */
  let open = () => {}
  const gate = new Promise((resolve) => {
    open = resolve
  })
  const second = await boot({
    plugin: 'wired',
    release: async (ctx, id) => {
      await gate
      return releaseHeldPrompts(ctx, id)
    }
  })
  const { agent: resumed } = await second.ctx.agents.resume({ resumeSessionId: SID, agentOptions: MODEL })
  const passing = second.tick()
  await new Promise((r) => setImmediate(r))
  assert.equal(resumed.inbox.remove(drop), true)
  await new Promise((r) => setImmediate(r))
  open()
  assert.equal(await passing, 1)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['keep'])
  assert.equal(await second.tick(), 0)
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'none',
    count: 0,
    recorded: false,
    settled: true,
    id: null,
    earlier: []
  })
  await second.ctx.fiber.dispose()
})

test('a released message whose turn the next deploy cut after dsh claimed it is unknown to its author, and never run again', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  // The drain is over: the release claims the message and the turn is asked… and never answers.
  const second = await boot({ plugin: 'wired' })
  second.model.hang = true
  assert.equal(await second.tick(), 1)
  const resumed = second.ctx.agents.get(SID)
  while (second.model.asked.length === 0) await new Promise((r) => setImmediate(r))
  assert.equal(messageFates(resumed.session.snapshotEvents()).get(id), 'entered')
  // Asked of the model by the running turn is not "ran": the record is still followed.
  assert.equal(await second.tick(), 0)
  assert.equal(second.queue.status(SID, 'qaem643').state, 'released')
  // The next deploy recreates dsh under that turn.
  await second.ctx.fiber.dispose()
  const third = await boot({ plugin: 'wired' })
  for (let i = 0; i < 3; i++) await third.tick()
  const again = third.ctx.agents.get(SID)
  assert.equal(messageFates(again.session.snapshotEvents()).get(id), 'interrupted')
  assert.deepEqual(third.queue.status(SID, 'qaem643'), {
    state: 'unknown',
    count: 1,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  assert.equal(readHeldFile(home).ok && readHeldFile(home).sessions.get(SID)?.reason, CUT)
  assert.deepEqual(third.model.asked, [], 'a turn that may have written to the site is never replayed')
  await third.ctx.fiber.dispose()
})

test('a released message a pre-step refuses never reached the model: its author is told it did not run', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot({ plugin: 'wired' })
  // dsh claims the message, then a pre-step refuses the step: the turn ends `blocked`, no step.
  second.ctx.on('agent/pre-step', async () => ({ kind: 'reject' }))
  assert.equal(await second.tick(), 1)
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  const events = resumed.session.snapshotEvents()
  assert.equal(
    events.findLast((e) => e.type === 'turn/end')?.data?.reason?.kind,
    'blocked',
    'the turn dsh ended'
  )
  assert.equal(messageFates(events).get(id), 'dropped')
  await second.tick()
  assert.deepEqual(second.model.asked, [], 'the model was never asked')
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'failed',
    count: 1,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  // Never released again: the queue is empty, and a notice is not a hold.
  assert.equal(await second.tick(), 0)
  assert.deepEqual(second.model.asked, [])
  await second.ctx.fiber.dispose()
})

for (const [label, hook, asked, end] of [
  [
    'a pre-step replaces the entry with another message',
    (/** @type {any} */ ctx) =>
      ctx.on('agent/pre-step', async (/** @type {any} */ _payload, /** @type {any} */ next) => {
        const decision = await next()
        if (decision.kind !== 'enter') return decision
        const text = [{ type: 'text', text: 'replacement' }]
        return { kind: 'enter', messages: [createUserMessage({ content: text, source: { kind: 'test' } })] }
      }),
    ['replacement'],
    'completed'
  ]
])
  test(`a released message that a step started without is not taken for run (${label}): its author is told it did not run`, async () => {
    writeFileSync(drainFile(), '')
    const first = await boot()
    const agent = await createHeld(first.ctx)
    const id = prompt(first.ctx, agent, 'held')
    await first.ctx.fiber.dispose()
    rmSync(drainFile())
    const second = await boot({ plugin: 'wired' })
    hook(second.ctx)
    assert.equal(await second.tick(), 1)
    const resumed = second.ctx.agents.get(SID)
    await idle(resumed)
    const events = resumed.session.snapshotEvents()
    assert.ok(
      events.some((e) => e.type === 'step/start'),
      'dsh opened a step'
    )
    assert.equal(events.findLast((e) => e.type === 'turn/end')?.data?.reason?.kind, end)
    assert.ok(!events.some((e) => e.type === 'user/message' && e.data?.id === id), 'never logged')
    assert.equal(messageFates(events).get(id), 'dropped')
    await second.tick()
    assert.deepEqual(second.model.asked, asked)
    assert.deepEqual(second.queue.status(SID, 'qaem643'), {
      state: 'failed',
      count: 1,
      recorded: true,
      settled: true,
      id: readHeldFile(home).sessions.get(SID).notice,
      earlier: []
    })
    await second.ctx.fiber.dispose()
  })

// dsh 0.2.0-rc.2-tracy.33 (fork row "Claimed prompt kept"): a person's prompt claimed for a step that
// fails before logging it goes back to the head of the queue instead of being dropped. So the released
// message is pending again, the queue still holds it (not "failed"), nothing asks the model, and dsh does
// not spin: one turn, and the prompt waits for the next send.
test('a released message whose step fails preparing its request goes back to the queue, held, and nothing retries it', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot({ plugin: 'wired' })
  second.ctx.on('agent/request', () => {
    throw new Error('request middleware failed')
  })
  assert.equal(await second.tick(), 1)
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  const events = resumed.session.snapshotEvents()
  assert.ok(
    events.some((e) => e.type === 'step/start'),
    'dsh opened a step'
  )
  assert.equal(events.findLast((e) => e.type === 'turn/end')?.data?.reason?.kind, 'error')
  assert.ok(!events.some((e) => e.type === 'user/message' && e.data?.id === id), 'never logged')
  assert.equal(messageFates(events).get(id), 'pending')
  await second.tick()
  assert.deepEqual(second.model.asked, [])
  assert.equal(resumed.session.snapshotEvents().filter((e) => e.type === 'turn/start').length, 1)
  const status = second.queue.status(SID, 'qaem643')
  assert.equal(status.state, 'held')
  assert.equal(status.settled, false)
  await second.ctx.fiber.dispose()
})

test('a released message logged in its step whose request fails before the model is asked is told as not run', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot({ plugin: 'wired' })
  // dsh logs the step's entered batch, then builds the request and opens the stream: a stream
  // middleware that throws fails the turn after `user/message` and before any model call.
  second.ctx.on('llm/stream', () => {
    throw new Error('stream middleware failed')
  })
  assert.equal(await second.tick(), 1)
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  const events = resumed.session.snapshotEvents()
  assert.ok(
    events.some((e) => e.type === 'user/message' && e.data?.id === id),
    'the step logged it'
  )
  assert.equal(events.findLast((e) => e.type === 'turn/end')?.data?.reason?.kind, 'error')
  assert.ok(
    !events.some((e) => e.type === 'assistant/message' || e.type === 'assistant/attempt'),
    'no model answer or attempt'
  )
  assert.equal(messageFates(events).get(id), 'dropped')
  await second.tick()
  assert.deepEqual(second.model.asked, [], 'the model was never asked')
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'failed',
    count: 1,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  await second.ctx.fiber.dispose()
})

test('a released message whose stream fails once started, with no answer, is told as not run', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const id = prompt(first.ctx, agent, 'held')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  const second = await boot({ plugin: 'wired' })
  // A stream that fails on its first read: dsh has started the attempt (`live.start()`), so it
  // logs `assistant/attempt`, yet the model never answered and no tool ran.
  second.ctx.on('llm/stream', () => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        throw new Error('stream failed after it started')
      }
    })
  }))
  assert.equal(await second.tick(), 1)
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  const events = resumed.session.snapshotEvents()
  assert.ok(
    events.some((e) => e.type === 'user/message' && e.data?.id === id),
    'the step logged it'
  )
  assert.ok(
    events.some((e) => e.type === 'assistant/attempt'),
    'dsh logged the failed attempt'
  )
  assert.ok(!events.some((e) => e.type === 'assistant/message'), 'no answer')
  assert.equal(events.findLast((e) => e.type === 'turn/end')?.data?.reason?.kind, 'error')
  assert.equal(messageFates(events).get(id), 'dropped')
  await second.tick()
  assert.deepEqual(second.model.asked, [], 'the model was never asked')
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'failed',
    count: 1,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  await second.ctx.fiber.dispose()
})

// #1403 item 11: the message the broken release could not send back never reached the model — the
// update's doing, not its author's. It is put back at the head of the queue once and runs once,
// instead of a notice asking the author to send it again.
test('a release that fails after taking the queue out: what it could not send back is sent once more and runs once, never taken for a removal', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const sent = prompt(first.ctx, agent, 'one')
  const lost = prompt(first.ctx, agent, 'two')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  let broken = true
  const second = await boot({
    plugin: 'wired',
    release: async (ctx, id) => {
      if (!broken) return releaseHeldPrompts(ctx, id)
      broken = false
      // dsh's release, failing half way: the queue is spliced out, the first sent back, then it throws.
      const held =
        ctx.agents.get(id) ?? (await ctx.agents.resume({ resumeSessionId: id, agentOptions: MODEL })).agent
      const pending = held.inbox.splice('next-turn', 0, Infinity, [])
      held.send(pending[0], 'next-turn', false)
      throw new Error('send failed')
    }
  })
  assert.equal(await second.tick(), 0)
  await new Promise((r) => setImmediate(r))
  // Both still followed: the release's own discards are not the author's removals.
  assert.deepEqual(readHeldFile(home).ok && readHeldFile(home).sessions.get(SID)?.messages, [sent, lost])
  assert.equal(await second.tick(), 1, 'what it sent back is released')
  const resumed = second.ctx.agents.get(SID)
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['one'])
  await second.tick()
  // Not a notice: the lost one is queued again, followed as a hold, written down as sent once more.
  assert.equal(second.queue.status(SID, 'qaem643').state, 'held')
  assert.deepEqual(
    resumed.inbox.nextTurn.map((m) => m.id),
    [lost]
  )
  const kept = readHeldFile(home).ok && readHeldFile(home).sessions.get(SID)
  assert.deepEqual([kept.messages, kept.resent], [[lost], true])
  assert.equal(await second.tick(), 1, 'the next pass releases it')
  await idle(resumed)
  assert.deepEqual(second.model.asked, ['one', 'two'], 'each ran exactly once')
  await second.tick()
  assert.equal(second.queue.status(SID, 'qaem643').state, 'none', 'nothing left to tell')
  await second.ctx.fiber.dispose()
})

test('a message sent once more that again does not run is told as not run — never a third time', async () => {
  writeFileSync(drainFile(), '')
  const first = await boot()
  const agent = await createHeld(first.ctx)
  const lost = prompt(first.ctx, agent, 'two')
  await first.ctx.fiber.dispose()
  rmSync(drainFile())
  let breaks = 0
  const second = await boot({
    plugin: 'wired',
    release: async (ctx, id) => {
      // Every release that finds something fails half way: the queue is spliced out and nothing is
      // sent back. With nothing queued it is dsh's own, which answers 0.
      const held =
        ctx.agents.get(id) ?? (await ctx.agents.resume({ resumeSessionId: id, agentOptions: MODEL })).agent
      if (held.inbox.nextTurn.length === 0) return releaseHeldPrompts(ctx, id)
      breaks++
      held.inbox.splice('next-turn', 0, Infinity, [])
      throw new Error('send failed')
    }
  })
  await second.tick()
  await new Promise((r) => setImmediate(r))
  await second.tick()
  assert.equal(second.queue.status(SID, 'qaem643').state, 'held', 'sent once more')
  await second.tick()
  await new Promise((r) => setImmediate(r))
  await second.tick()
  assert.deepEqual(second.queue.status(SID, 'qaem643'), {
    state: 'failed',
    count: 1,
    recorded: true,
    settled: true,
    id: readHeldFile(home).sessions.get(SID).notice,
    earlier: []
  })
  assert.deepEqual(readHeldFile(home).sessions.get(SID).messages, [lost])
  assert.equal(breaks, 2, 'released twice: the hold, then the one resend')
  assert.deepEqual(second.model.asked, [])
  await second.ctx.fiber.dispose()
})

// ── #561: a turn waiting only on its customer does not hold the deploy ─────────────────────────
//
// Measured 29/09 on dev: a turn that called `ask_user_question` at +51 s, on a site deleted half an
// hour before, held the dsh deploy for the full 1200 s drain. dsh reports such a turn `running`
// (`AgentStatus` is `idle | running`); the question's pending time is the `user-questions/request`
// waterfall dsh awaits inside the tool call. Everything here is dsh's own: the loop, the question
// service, the real `ask_user_question` tool and the shipped plugin.

for (const order of ['first', 'last']) {
  test(`#561: a turn waiting on its customer's answer holds no lease and takes it back before it goes on (answerer ${order})`, async () => {
    mkdirSync(path.join(sites, 'qaem643'), { recursive: true })
    const questions = desk()
    const { ctx, model } = await boot({ questions, answerer: order })
    const agent = await createHeld(ctx)
    prompt(ctx, agent, 'change the menu')
    await questions.waitAsked()
    assert.equal(model.leaseSeen[0], true, 'a working turn holds its lease')
    assert.equal(questions.asked[0].leaseHeld, false, 'no lease while only the customer can move the turn on')
    assert.equal(existsSync(chatLease()), false)
    assert.equal(agent.status, 'running', 'dsh still says running: status alone cannot tell')
    questions.asked[0].resolve({ answers: [{ id: 'go', selected: ['Yes'] }] })
    await idle(agent)
    assert.deepEqual(model.leaseSeen, [true, true], 'the lease is back before the next step asks the model')
    assert.match(model.requests[1], /\\"selected\\":\[\\"Yes\\"\]/, 'the answer reached the model unchanged')
    assert.equal(existsSync(chatLease()), false, 'a turn that ended holds nothing')
    await ctx.fiber.dispose()
  })
}

test('#561: a site delete stops a turn waiting on its question: the question ends with it and no lease is left', async () => {
  mkdirSync(path.join(sites, 'qaem643'), { recursive: true })
  const questions = desk()
  const { ctx, model } = await boot({ questions, answerer: 'last' })
  const agent = await createHeld(ctx)
  prompt(ctx, agent, 'change the menu')
  await questions.waitAsked()
  assert.equal(existsSync(chatLease()), false)
  // What dsh's `workspace/archiveSession` with `stopActivity` (the forget door, dsh-passwords
  // `forgetWorkspace`) dispatches once the archive is durable (`WorkspaceRegistry.stopSessionActivity`);
  // the agent registry answers it with the stop button's cancel (`archive-admission.ts`).
  await ctx.parallel('workspace/session-stop', { sessionId: SID })
  await idle(agent)
  assert.equal(agent.status, 'idle')
  assert.equal(questions.asked[0].request.signal.aborted, true, 'the pending question ended with the turn')
  assert.equal(model.leaseSeen.length, 1, 'the model was never asked again')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(
    existsSync(chatLease()),
    false,
    'the stopped turn left no lease for the deploy or the folder move'
  )
  await ctx.fiber.dispose()
})
