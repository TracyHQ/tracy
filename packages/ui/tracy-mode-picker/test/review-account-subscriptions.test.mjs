/**
 * Review of Model Subscription routing (`account-subscriptions.mjs`) after PR #1057.
 *
 * Two groups:
 *   - The two outage-shortcut tests hold what the commit itself promises ("a refusal is an answer,
 *     never an outage: a revoked seat stops even on the default"; a pin is the OWNER's). They failed on
 *     develop 6d8434735, where the shortcut (`plain`) was keyed by the conversation only and never
 *     cleared by a refusal; it is now keyed by conversation, speaker and site.
 *   - Coverage tests for behaviour the existing suite does not hold (all pass).
 *
 *   node --test packages/ui/tracy-mode-picker/test/review-account-subscriptions.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOST_CODES, createAccountSubscriptions, fallbackNote } from '../src/host/account-subscriptions.mjs'

const DEFAULT = Object.freeze({ provider: 'default', model: 'default' })
const message = (email) => ({ source: { kind: 'user', prompter: { user: 'u', email } } })
const sessionOf = (id, email, cwd = '/site/demo') => ({
  id,
  header: { cwd },
  snapshotEvents: () => [{ type: 'user/message', data: message(email) }]
})

/**
 * A host context with the pre-step hook captured, the sessions given, `fetch` answered by `broker`,
 * and an `llm` service whose `stream` records fallback calls.
 */
function harness(t, sessions, broker, { defaultModel = () => DEFAULT, llmStream } = {}) {
  const hooks = new Map()
  const calls = []
  let adapter
  const llmCalls = []
  const llm = {
    registerAdapter: (_providers, value) => {
      adapter = value
      return () => {}
    },
    stream:
      llmStream ??
      async function* (options) {
        llmCalls.push(options)
        yield { type: 'text-delta', index: 0, text: 'tracy' }
      }
  }
  const ctx = {
    get: (name) =>
      name === 'sessions'
        ? { get: (id) => sessions.get(id) }
        : name === 'tracyAssertion'
          ? { mint: (email) => `signed:${email}` }
          : llm,
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
    const call = {
      url: String(url),
      path: new URL(String(url)).pathname,
      actor: init.headers['x-tracy-actor'],
      site: init.headers['x-tracy-workspace-label'],
      body: JSON.parse(init.body)
    }
    calls.push(call)
    return broker(call)
  }
  const policy = createAccountSubscriptions(ctx, defaultModel)
  const speak = (session, ...emails) =>
    hooks.get('agent/pre-step')(
      { agent: { session }, messages: emails.map((e) => message(e)) },
      async () => ({ kind: 'enter' })
    )
  return { policy, hooks, calls, speak, adapter: () => adapter, llmCalls }
}

// ── holes ───────────────────────────────────────────────────────────────────────────────────────

test('a seat refused by tracy-web is not let through on the default when tracy-web then goes down', async (t) => {
  const session = sessionOf('plain', 'a@test')
  const sessions = new Map([[session.id, session]])
  let state = 'up'
  const { policy } = harness(t, sessions, () => {
    if (state === 'refused') return Response.json({ code: 'noAccess', message: 'No access' }, { status: 403 })
    if (state === 'down') throw new TypeError('fetch failed')
    return Response.json({ route: null })
  })
  // A conversation without a plan: remembered as `plain`.
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  // The seat is revoked: tracy-web answers with a refusal, and the turn stops (as designed).
  state = 'refused'
  await assert.rejects(policy.forSession(session), { code: 'tracy/subscription-noAccess' })
  // tracy-web restarts. The last word it said about this seat was "no access", so the outage
  // shortcut must not run the revoked seat on Tracy's own model.
  state = 'down'
  await assert.rejects(policy.forSession(session), { code: HOST_CODES.unavailable })
})

test('the outage shortcut belongs to the speaker tracy-web answered, not to every speaker of the conversation', async (t) => {
  const session = sessionOf('shared', 'owner@test')
  const sessions = new Map([[session.id, session]])
  let state = 'up'
  const { policy, speak } = harness(t, sessions, ({ actor }) => {
    if (state === 'down') throw new TypeError('fetch failed')
    // The pin is the owner's: tracy-web refuses anyone else (`broker.js` pin → notOwner).
    if (actor !== 'signed:owner@test')
      return Response.json({ code: 'notOwner', message: 'Not yours' }, { status: 403 })
    return Response.json({ route: null })
  })
  await speak(session, 'owner@test')
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  // Proof of the rule while tracy-web is up: another seat is refused in the owner's conversation.
  await speak(session, 'other@test')
  await assert.rejects(policy.forSession(session), { code: 'tracy/subscription-notOwner' })
  // tracy-web restarts. tracy-web never answered for `other@test` on this conversation, and its
  // only answer for it was a refusal: it must not run on the default because the OWNER's pin was
  // plain.
  state = 'down'
  await assert.rejects(policy.forSession(session), { code: HOST_CODES.unavailable })
})

// ── coverage ────────────────────────────────────────────────────────────────────────────────────

test('a plain conversation whose pin later moves onto a route loses the outage shortcut', async (t) => {
  const session = sessionOf('moving', 'a@test')
  const sessions = new Map([[session.id, session]])
  let state = 'plain'
  const { policy } = harness(t, sessions, () => {
    if (state === 'down') throw new TypeError('fetch failed')
    if (state === 'tracy')
      return Response.json({ route: { provider: 'seat-plan-tracy', model: 'default', connectionId: null } })
    return Response.json({ route: null })
  })
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  state = 'tracy'
  assert.equal((await policy.forSession(session)).provider, 'seat-plan-tracy')
  state = 'down'
  await assert.rejects(policy.forSession(session), { code: HOST_CODES.unavailable })
})

test('an answer without a code below 500 is a refusal, never an outage, even for a plain conversation', async (t) => {
  const session = sessionOf('p404', 'a@test')
  const sessions = new Map([[session.id, session]])
  let state = 'up'
  const { policy } = harness(t, sessions, () =>
    state === 'up' ? Response.json({ route: null }) : new Response('not found', { status: 404 })
  )
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  state = 'missing'
  await assert.rejects(policy.forSession(session), { code: HOST_CODES.unavailable })
  // The refusal did not end the conversation: tracy-web answering again restores it.
  state = 'up'
  assert.deepEqual(await policy.forSession(session), DEFAULT)
})

test('a 5xx without a code (proxy page) counts as an outage for a plain conversation', async (t) => {
  const session = sessionOf('p502', 'a@test')
  const sessions = new Map([[session.id, session]])
  let state = 'up'
  const { policy } = harness(t, sessions, () =>
    state === 'up'
      ? Response.json({ route: null })
      : new Response('<html>Bad gateway</html>', { status: 502 })
  )
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  state = 'proxy'
  assert.deepEqual(await policy.forSession(session), DEFAULT)
})

test('without MCP_TRACY_ORIGIN nothing is sent and even a plain conversation stops', async (t) => {
  const session = sessionOf('noorigin', 'a@test')
  const sessions = new Map([[session.id, session]])
  const { policy, calls } = harness(t, sessions, () => Response.json({ route: null }))
  assert.deepEqual(await policy.forSession(session), DEFAULT)
  delete process.env.MCP_TRACY_ORIGIN
  await assert.rejects(policy.forSession(session), { code: HOST_CODES.unavailable })
  assert.equal(calls.length, 1)
})

test('the pin asks with the speaker of the step, the site folder of the conversation, and its root id', async (t) => {
  const priorRoot = process.env.TRACY_SITES_ROOT
  t.after(() => {
    if (priorRoot === undefined) delete process.env.TRACY_SITES_ROOT
    else process.env.TRACY_SITES_ROOT = priorRoot
  })
  process.env.TRACY_SITES_ROOT = '/srv/sites'
  const root = sessionOf('root', 'a@test', '/srv/sites/shop-1/.webroot/wp-content')
  const sessions = new Map([[root.id, root]])
  const { policy, calls, speak } = harness(t, sessions, () => Response.json({ route: null }))
  await speak(root, 'b@test')
  await policy.forSession(root)
  assert.equal(calls[0].path, '/internal/seat-plan/pin')
  assert.equal(calls[0].actor, 'signed:b@test')
  assert.equal(calls[0].site, 'shop-1')
  assert.deepEqual(calls[0].body, { sessionId: 'root' })
  // A cwd outside the sites root names no site: refused before anything is sent.
  const outside = sessionOf('outside', 'a@test', '/site/shop-1')
  sessions.set(outside.id, outside)
  await assert.rejects(policy.forSession(outside), { code: HOST_CODES.unavailable })
  assert.equal(calls.length, 1)
})

test('a pre-step that claims no person (a plugin notice, a tool echo) keeps the current speaker', async (t) => {
  const root = sessionOf('keep', 'a@test')
  const sessions = new Map([[root.id, root]])
  const { policy, calls, hooks } = harness(t, sessions, () => Response.json({ route: null }))
  await hooks.get('agent/pre-step')(
    { agent: { session: root }, messages: [message('b@test')] },
    async () => ({ kind: 'enter' })
  )
  await hooks.get('agent/pre-step')(
    { agent: { session: root }, messages: [{ source: { kind: 'plugin' } }] },
    async () => ({ kind: 'enter' })
  )
  await hooks.get('agent/pre-step')({ agent: { session: root }, messages: [] }, async () => ({
    kind: 'enter'
  }))
  await policy.forSession(root)
  assert.equal(calls[0].actor, 'signed:b@test')
})

test('two people claimed in one step run on the deployment default, and nothing is sent', async (t) => {
  // a36ec7031: no single proven address pays for the step, so neither person's plan does.
  const root = sessionOf('two', 'a@test')
  const sessions = new Map([[root.id, root]])
  const { policy, calls, speak } = harness(t, sessions, () => Response.json({ route: null }))
  await speak(root, 'a@test', 'b@test')
  assert.deepEqual(await policy.forSession(root), DEFAULT)
  assert.equal(calls.length, 0)
})

test('a subagent of another site never inherits the parent identity', async (t) => {
  const root = sessionOf('parent', 'a@test', '/site/one')
  const child = { id: 'kid', header: { cwd: '/site/two', origin: 'subagent', parentSession: 'parent' } }
  const sessions = new Map([
    [root.id, root],
    [child.id, child]
  ])
  const { policy, calls } = harness(t, sessions, () => Response.json({ route: null }))
  await assert.rejects(policy.forSession(child), { code: HOST_CODES.unavailable })
  assert.equal(calls.length, 0)
})

test('a subagent whose parent is not loaded, or is itself, stops', async (t) => {
  const orphan = { id: 'orphan', header: { cwd: '/site/demo', origin: 'subagent', parentSession: 'gone' } }
  const loop = { id: 'loop', header: { cwd: '/site/demo', origin: 'subagent', parentSession: 'loop' } }
  const sessions = new Map([
    [orphan.id, orphan],
    [loop.id, loop]
  ])
  const { policy } = harness(t, sessions, () => Response.json({ route: null }))
  await assert.rejects(policy.forSession(orphan), { code: HOST_CODES.unavailable })
  await assert.rejects(policy.forSession(loop), { code: HOST_CODES.unavailable })
})

test('the run call carries the speaker captured before the stream starts, not a later speaker', async (t) => {
  const root = sessionOf('run', 'a@test')
  const sessions = new Map([[root.id, root]])
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const h = harness(t, sessions, async ({ path }) => {
    if (path === '/internal/seat-plan/pin')
      return Response.json({ route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5' } })
    await gate
    return new Response(`${JSON.stringify({ chunk: { type: 'text-delta', index: 0, text: 'hi' } })}\n`)
  })
  await h.speak(root, 'a@test')
  const pending = Array.fromAsync(
    h
      .adapter()
      .stream({ sessionId: 'run', provider: 'seat-plan-claude', model: 'claude-sonnet-5', messages: [] })
  )
  // A queued prompt of another person is claimed while the first request is in flight.
  await h.speak(root, 'b@test')
  release()
  const out = await pending
  assert.deepEqual(out, [{ type: 'text-delta', index: 0, text: 'hi' }])
  const run = h.calls.find((c) => c.path === '/internal/seat-plan/run')
  assert.equal(run.actor, 'signed:a@test')
  assert.equal(run.body.sessionId, 'run')
})

test('a broker error event ends the stream with its own code; a cut last line is unavailable', async (t) => {
  const root = sessionOf('err', 'a@test')
  const sessions = new Map([[root.id, root]])
  let body = ''
  const h = harness(t, sessions, () => new Response(body))
  await h.speak(root, 'a@test')
  const options = { sessionId: 'err', provider: 'seat-plan-claude', model: 'm', messages: [] }
  body = `${JSON.stringify({ error: { code: 'tracy/subscription-limit', message: 'Limit' } })}\n`
  await assert.rejects(Array.fromAsync(h.adapter().stream(options)), { code: 'tracy/subscription-limit' })
  body = `${JSON.stringify({ chunk: { type: 'text-delta', index: 0, text: 'a' } })}\n{"chunk":`
  await assert.rejects(Array.fromAsync(h.adapter().stream(options)), {
    code: HOST_CODES.unavailable
  })
})

test('the Tracy AI fallback never runs on a default that is missing or is itself a subscription route', async (t) => {
  const root = sessionOf('fb', 'a@test')
  const sessions = new Map([[root.id, root]])
  let fixed = undefined
  const h = harness(
    t,
    sessions,
    () => new Response(`${JSON.stringify({ fallback: true, route: { provider: 'seat-plan-tracy' } })}\n`),
    { defaultModel: () => fixed }
  )
  await h.speak(root, 'a@test')
  const options = { sessionId: 'fb', provider: 'seat-plan-claude', model: 'm', messages: [] }
  await assert.rejects(Array.fromAsync(h.adapter().stream(options)), {
    code: HOST_CODES.unavailable
  })
  fixed = { provider: 'seat-plan-tracy', model: 'default' }
  await assert.rejects(Array.fromAsync(h.adapter().stream(options)), {
    code: HOST_CODES.unavailable
  })
  assert.equal(h.llmCalls.length, 0)
})

test('the fallback request keeps the tools and the session, and swaps only the route', async (t) => {
  const root = sessionOf('fb2', 'a@test')
  const sessions = new Map([[root.id, root]])
  const h = harness(
    t,
    sessions,
    () =>
      new Response(
        `${JSON.stringify({ fallback: true, route: { provider: 'seat-plan-tracy', switchedFrom: { vendor: 'Claude', reason: 'limit' } } })}\n`
      ),
    {
      defaultModel: () => ({
        provider: 'deepseek-official',
        model: 'deepseek-flash',
        reasoningEffort: 'high'
      })
    }
  )
  await h.speak(root, 'a@test')
  const tools = [{ name: 'tracy_site' }]
  const system = { role: 'system', content: [{ type: 'text', text: 'Persona.' }] }
  await Array.fromAsync(
    h.adapter().stream({
      sessionId: 'fb2',
      provider: 'seat-plan-claude',
      model: 'claude-sonnet-5',
      tools,
      messages: [system, { role: 'user', content: [{ type: 'text', text: 'hi' }] }]
    })
  )
  const [sent] = h.llmCalls
  assert.equal(sent.provider, 'deepseek-official')
  assert.equal(sent.model, 'deepseek-flash')
  assert.equal(sent.reasoningEffort, 'high')
  assert.equal(sent.sessionId, 'fb2')
  assert.equal(sent.tools, tools)
  assert.equal(sent.messages.length, 3)
  assert.equal(sent.messages.filter((m) => m.role === 'system').length, 2)
  assert.match(sent.messages.at(-1).content[0].text, /^Persona\.\n\n/)
})

test('the fallback note reads only text blocks of the latest non-empty prompt', () => {
  const note = fallbackNote([
    {
      role: 'system',
      content: [
        { type: 'text', text: 'A' },
        { type: 'image', data: 'x' },
        { type: 'text', text: 'B' }
      ]
    }
  ])
  assert.match(note.content[0].text, /^AB\n\n/)
  assert.equal(note.content.length, 1)
})
