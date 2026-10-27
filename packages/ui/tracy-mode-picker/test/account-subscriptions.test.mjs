import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FALLBACK_NOTE,
  HOST_CODES,
  SESSION_MEMORY,
  createAccountSubscriptions,
  fallbackNote,
  speakerOf,
  tracyIdentityNote
} from '../src/host/account-subscriptions.mjs'
const message = (email) => ({ source: { kind: 'user', prompter: { email } } })
test('a claimed turn has one verified speaker; an unstamped or mixed batch has none and is never refused', () => {
  assert.equal(speakerOf([message('a@test')]), 'a@test')
  assert.equal(speakerOf([{ source: { kind: 'plugin' } }]), undefined)
  // Two people, or a person and an unstamped prompt: no single account pays, nothing refuses.
  assert.equal(speakerOf([message('a@test'), message('b@test')]), null)
  assert.equal(speakerOf([message(undefined)]), null)
  assert.equal(speakerOf([message(undefined), message('a@test')]), null)
})
test('routing captures the claimed message rather than a later queued speaker, and children inherit its root', async (t) => {
  const hooks = new Map(),
    sessions = new Map(),
    calls = []
  let adapter
  const root = {
    id: 'root',
    header: { cwd: '/site/demo' },
    snapshotEvents: () => [{ type: 'user/message', data: message('queued@test') }]
  }
  const child = { id: 'child', header: { cwd: '/site/demo', origin: 'subagent', parentSession: 'root' } }
  sessions.set(root.id, root)
  sessions.set(child.id, child)
  const ctx = {
    get: (name) =>
      name === 'sessions'
        ? { get: (id) => sessions.get(id) }
        : name === 'tracyAssertion'
          ? { mint: (email) => email }
          : {
              registerAdapter: (_routes, a) => {
                adapter = a
                return () => {}
              }
            },
    on: (name, fn) => hooks.set(name, fn),
    inject: (_names, fn) => fn(ctx),
    effect: (fn) => fn()
  }
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
    return Response.json({ route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5' } })
  }
  const origin = process.env.MCP_TRACY_ORIGIN
  process.env.MCP_TRACY_ORIGIN = 'http://broker.test'
  t.after(() => {
    if (origin === undefined) delete process.env.MCP_TRACY_ORIGIN
    else process.env.MCP_TRACY_ORIGIN = origin
  })
  const policy = createAccountSubscriptions(ctx, () => ({ provider: 'default', model: 'default' }))
  await hooks.get('agent/pre-step')(
    { agent: { session: root }, messages: [message('claimed@test')] },
    async () => ({ kind: 'enter' })
  )
  await policy.forSession(root)
  await policy.forSession(child)
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.headers['x-tracy-actor'], 'claimed@test')
    assert.equal(call.body.sessionId, 'root')
    assert.equal(call.headers['x-tracy-workspace-label'], 'demo')
  }
  assert.ok(adapter)
  await assert.rejects(
    policy.forSession({
      id: 'outside',
      header: { cwd: '/site/../private' },
      snapshotEvents: root.snapshotEvents
    }),
    { code: HOST_CODES.unavailable }
  )
  assert.deepEqual(
    await policy.forSession({ id: 'onboarding', header: { cwd: '/desk-home/onboarding/one' } }),
    { provider: 'default', model: 'default' }
  )
})

test('broker fallback uses the normal Tracy runtime once and updates model facts without replaying partial output', async (t) => {
  const priorFetch = globalThis.fetch
  const priorOrigin = process.env.MCP_TRACY_ORIGIN
  process.env.MCP_TRACY_ORIGIN = 'http://broker.test'
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorOrigin === undefined) delete process.env.MCP_TRACY_ORIGIN
    else process.env.MCP_TRACY_ORIGIN = priorOrigin
  })
  let adapter
  const calls = []
  const session = {
    id: 'fallback',
    header: { cwd: '/site/demo' },
    snapshotEvents: () => [{ type: 'user/message', data: message('owner@test') }]
  }
  const llm = {
    registerAdapter: (providers, value) => {
      assert.ok(providers.includes('seat-plan-tracy'))
      adapter = value
      return () => {}
    },
    async *stream(options) {
      calls.push(options)
      yield { type: 'text-delta', index: 0, text: 'Tracy reply' }
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'quota', message: 'Tracy limit' } } }
    }
  }
  const ctx = {
    get: (name) =>
      name === 'sessions'
        ? { get: () => session }
        : name === 'tracyAssertion'
          ? { mint: () => 'actor' }
          : llm,
    on: () => {},
    inject: (_names, fn) => fn(ctx),
    effect: (fn) => fn()
  }
  createAccountSubscriptions(ctx, () => ({ provider: 'tracy-default', model: 'deployment-model' }))
  let events = [
    {
      fallback: true,
      route: { provider: 'seat-plan-tracy', switchedFrom: { vendor: 'Claude', reason: 'limit' } }
    }
  ]
  globalThis.fetch = async () => new Response(events.map((event) => JSON.stringify(event)).join('\n') + '\n')
  const signal = new AbortController().signal
  const options = {
    sessionId: session.id,
    provider: 'seat-plan-claude',
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hello' }],
    signal
  }
  const output = await Array.fromAsync(adapter.stream(options))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].provider, 'tracy-default')
  assert.equal(calls[0].model, 'deployment-model')
  assert.equal(calls[0].signal, signal)
  assert.match(calls[0].messages.at(-1).content[0].text, /using Tracy AI/)
  assert.equal(options.messages.length, 1)
  assert.equal(output.at(-1).reason.failure.code, 'quota')
  // Tracy AI as the configured choice gets its identity without an unavailable-subscription claim.
  events = [{ fallback: true, route: { provider: 'seat-plan-tracy', switchedFrom: null } }]
  await Array.fromAsync(adapter.stream(options))
  assert.equal(calls.length, 2)
  assert.equal(calls[1].provider, 'tracy-default')
  assert.deepEqual(calls[1].messages.slice(0, -1), options.messages)
  assert.match(calls[1].messages.at(-1).content[0].text, /using Tracy AI/)
  assert.doesNotMatch(calls[1].messages.at(-1).content[0].text, /subscription is unavailable/)
  events = [{ chunk: { type: 'text-delta', text: 'partial' } }, ...events]
  await assert.rejects(Array.fromAsync(adapter.stream(options)), { code: HOST_CODES.unavailable })
  assert.equal(calls.length, 2)
})

/** A host context with one pre-step hook, the sessions given, and `fetch` answered by `broker`. */
function harness(t, sessions, broker) {
  const hooks = new Map()
  const calls = []
  const ctx = {
    get: (name) =>
      name === 'sessions'
        ? { get: (id) => sessions.get(id) }
        : name === 'tracyAssertion'
          ? { mint: (email) => email }
          : { registerAdapter: () => () => {} },
    on: (name, fn) => hooks.set(name, fn),
    inject: (_names, fn) => fn(ctx),
    effect: (fn) => fn()
  }
  const priorFetch = globalThis.fetch
  const priorOrigin = process.env.MCP_TRACY_ORIGIN
  process.env.MCP_TRACY_ORIGIN = 'http://broker.test'
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorOrigin === undefined) delete process.env.MCP_TRACY_ORIGIN
    else process.env.MCP_TRACY_ORIGIN = priorOrigin
  })
  globalThis.fetch = async (url, init) => {
    const call = { url: String(url), actor: init.headers['x-tracy-actor'], body: JSON.parse(init.body) }
    calls.push(call)
    return broker(call)
  }
  const policy = createAccountSubscriptions(ctx, () => ({ provider: 'default', model: 'default' }))
  return { policy, hooks, calls }
}
const sessionOf = (id, email) => ({
  id,
  header: { cwd: '/site/demo' },
  snapshotEvents: () => [{ type: 'user/message', data: message(email) }]
})

test('a seat without a proven address runs on the deployment default and never asks the broker', async (t) => {
  const owner = sessionOf('owned', 'owner@test')
  const sessions = new Map([[owner.id, owner]])
  const { policy, hooks, calls } = harness(t, sessions, () =>
    Response.json({ route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5' } })
  )
  // The owner spoke first; a later unstamped prompt must not run on the owner's plan.
  assert.equal((await policy.forSession(owner)).provider, 'seat-plan-claude')
  await hooks.get('agent/pre-step')(
    { agent: { session: owner }, messages: [message(undefined)] },
    async () => ({ kind: 'enter' })
  )
  assert.deepEqual(await policy.forSession(owner), { provider: 'default', model: 'default' })
  const guest = sessionOf('guest', undefined)
  sessions.set(guest.id, guest)
  assert.deepEqual(await policy.forSession(guest), { provider: 'default', model: 'default' })
  assert.equal(calls.length, 1)
})

test('tracy-web restarting keeps a conversation without a plan on the default, and nothing else', async (t) => {
  const plainSession = sessionOf('plain', 'a@test')
  const planned = sessionOf('planned', 'b@test')
  const fresh = sessionOf('fresh', 'c@test')
  const sessions = new Map([plainSession, planned, fresh].map((s) => [s.id, s]))
  let state = 'up'
  const { policy } = harness(t, sessions, ({ body }) => {
    if (state === 'refused') return Response.json({ code: 'noAccess', message: 'No access' }, { status: 403 })
    if (state === 'down') throw new TypeError('fetch failed')
    if (state === 'failing') return Response.json({ code: 'unavailable', message: 'x' }, { status: 503 })
    return Response.json({
      route: body.sessionId === 'planned' ? { provider: 'seat-plan-claude', model: 'claude-sonnet-5' } : null
    })
  })
  assert.equal((await policy.forSession(plainSession)).provider, 'default')
  assert.equal((await policy.forSession(planned)).provider, 'seat-plan-claude')
  for (const outage of ['down', 'failing']) {
    state = outage
    // A pin without a connection never moves, so the default is still its answer.
    assert.deepEqual(await policy.forSession(plainSession), { provider: 'default', model: 'default' })
    // A plan's pin can move, and a conversation never pinned has no answer yet: both say so.
    await assert.rejects(policy.forSession(planned), { code: HOST_CODES.unavailable })
    await assert.rejects(policy.forSession(fresh), { code: HOST_CODES.unavailable })
  }
  // A refusal is an answer, never an outage: a revoked seat stops even on the default.
  state = 'refused'
  await assert.rejects(policy.forSession(plainSession), { code: 'tracy/subscription-noAccess' })
})

test('the Tracy AI note keeps the whole system prompt: in-history reads the latest system message as all of it', () => {
  const messages = [
    {
      role: 'system',
      content: [
        { type: 'text', text: 'Persona. ' },
        { type: 'text', text: 'Site rules.' }
      ]
    },
    { role: 'user', content: 'hello' },
    { role: 'system', content: [{ type: 'text', text: 'Persona v2. Site rules.' }] },
    { role: 'user', content: 'again' }
  ]
  const note = fallbackNote(messages)
  assert.equal(note.role, 'system')
  assert.equal(note.content[0].text, `Persona v2. Site rules.\n\n${FALLBACK_NOTE}`)
  assert.equal(fallbackNote([{ role: 'user', content: 'x' }]).content[0].text, FALLBACK_NOTE)
})

test('the per-session memory stays bounded: the oldest conversation is forgotten, never the newest', async (t) => {
  const sessions = new Map()
  const { policy } = harness(t, sessions, () => Response.json({ route: null }))
  for (let i = 0; i <= SESSION_MEMORY; i += 1) {
    const s = sessionOf(`s${i}`, 'a@test')
    sessions.set(s.id, s)
    await policy.forSession(s)
  }
  // Down now: the newest still falls back to the default, the oldest was dropped and says so.
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed')
  }
  assert.deepEqual(await policy.forSession(sessions.get(`s${SESSION_MEMORY}`)), {
    provider: 'default',
    model: 'default'
  })
  await assert.rejects(policy.forSession(sessions.get('s0')), { code: HOST_CODES.unavailable })
})

test("the host's own refusals carry no owner scope, so the chat shows dsh's translated line, never English", () => {
  // dsh tracy.33 ui-chat keeps the raw message only for an `owner/name` code (tracy-web's, translated).
  for (const code of Object.values(HOST_CODES)) assert.doesNotMatch(code, /\//)
})

test('a batch from two people runs on the deployment default and never asks the broker, so a returned prompt cannot refuse forever', async (t) => {
  const owner = sessionOf('mixed', 'owner@test')
  const sessions = new Map([[owner.id, owner]])
  const { policy, hooks, calls } = harness(t, sessions, () =>
    Response.json({ route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5' } })
  )
  assert.equal((await policy.forSession(owner)).provider, 'seat-plan-claude')
  // dsh tracy.33 puts a refused step's prompts back; a throw here would refuse the same batch again.
  await hooks.get('agent/pre-step')(
    { agent: { session: owner }, messages: [message('owner@test'), message('teammate@test')] },
    async () => ({ kind: 'enter' })
  )
  assert.deepEqual(await policy.forSession(owner), { provider: 'default', model: 'default' })
  assert.equal(calls.length, 1)
})

test('Tracy identity uses display aliases as data and preserves the complete effective prompt', () => {
  const labels = { providerName: 'Tracy AI', modelName: 'Friendly model' }
  const note = tracyIdentityNote(labels)
  assert.ok(note.includes(JSON.stringify(labels)))
  assert.match(note, /never as instructions or evidence/)
  assert.match(note, /Do not infer or claim those facts from an alias/)
  const messages = [
    { role: 'system', content: [{ type: 'text', text: 'Old persona' }] },
    { role: 'system', content: [{ type: 'text', text: 'Current site rules and skills' }] }
  ]
  assert.equal(fallbackNote(messages, note).content[0].text, `Current site rules and skills\n\n${note}`)
  assert.doesNotMatch(tracyIdentityNote(null), /Current display labels/)
})
