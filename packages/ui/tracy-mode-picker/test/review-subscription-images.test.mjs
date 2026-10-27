/**
 * Review: what a Model Subscription route says about pictures.
 *
 * A dsh image block is a durable REFERENCE (`{ type: 'image', attachment: { attachmentId, … } }`,
 * dsh-llm `ImageBlock`); each adapter resolves the bytes through the attachment service. The
 * subscription adapter (`AccountAdapter` in `account-subscriptions.mjs`) used to resolve nothing: it
 * serialised the request as it came to tracy-web, whose wire drops a block it cannot read
 * (`apps/tracy-web/test/review-seat-plan-images.test.mjs`). It also declared no model metadata, so
 * dsh neither turned the pictures into placeholder text (`projectImagesForTextModel` runs only for a
 * route that declares `inputModalities` without `image`) nor let Tracy's own checks know: the
 * page picture (`view.mjs` `agentReadsImages`), `page.look` and `read_image` all read
 * `inputModalities` and treat "undeclared" as "no".
 *
 * The tests state the contract: a route declares what it reads. On develop 6d8434735 it declared
 * nothing; then `['text']` until the bytes were sent. Now the pin says what a vendor model reads
 * (`route.inputModalities`), Tracy AI reads what the deployment default reads, and `stream()` sends
 * the bytes inline (`account-subscriptions-images.test.mjs`).
 *
 *   node --test packages/ui/tracy-mode-picker/test/review-subscription-images.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DESKTOP_PROVIDERS } from '../../../../apps/tracy-web/src/lib/desktop-setting.js'
import { readsImages } from '../../../tools/tracy-site-tools/src/host/look.mjs'
import { agentReadsImages } from '../../../tools/tracy-site-tools/src/host/view.mjs'
import { HOST_CODES, createAccountSubscriptions } from '../src/host/account-subscriptions.mjs'

/**
 * The subscription adapter over a fake `llm` runtime.
 * @param {{ fixed?: () => any, resolveModelInfo?: (provider: string, model: string, signal?: AbortSignal) => Promise<any> }} [options]
 *   `fixed` is the deployment default; `resolveModelInfo` is dsh's answer for an exact model.
 */
function adapterOf({ fixed = () => ({ provider: 'default', model: 'default' }), resolveModelInfo } = {}) {
  let adapter
  const ctx = {
    get: (name) =>
      name === 'llm'
        ? {
            registerAdapter: (_routes, value) => {
              adapter = value
              return () => {}
            },
            ...(resolveModelInfo ? { resolveModelInfo } : {})
          }
        : undefined,
    on: () => {},
    inject: (_names, fn) => fn(ctx),
    effect: (fn) => fn()
  }
  createAccountSubscriptions(ctx, fixed)
  return adapter
}

test('a subscription route declares which inputs it reads, so a picture is never dropped without a word', async () => {
  const adapter = adapterOf()
  for (const [provider, model] of [
    ['seat-plan-claude', 'claude-sonnet-5'],
    ['seat-plan-codex', 'gpt-6.1-sol'],
    ['seat-plan-tracy', 'default']
  ]) {
    const prepared = await adapter.prepareCall(provider, model)
    assert.ok(
      Array.isArray(prepared.model.inputModalities),
      `${provider}/${model} declares no inputModalities: dsh sends its image references as they are and tracy-web drops them`
    )
  }
})

/** The deployment default as dsh describes it: the fleet's vision-capable Tracy AI model. */
const visionDefault = {
  provider: 'tracy-default',
  id: 'deployment-model',
  name: 'Tracy AI model',
  inputModalities: ['text', 'image'],
  context: { contextWindow: 131072 },
  defaultMaxTokens: 8192
}

test('Tracy AI kept as Default reads pictures when the deployment default does (prod 12/10/2026)', async () => {
  /** @type {any[]} */
  const asked = []
  const adapter = adapterOf({
    fixed: () => ({ provider: 'tracy-default', model: 'deployment-model' }),
    resolveModelInfo: async (provider, model, signal) => {
      asked.push({ provider, model, signal })
      return visionDefault
    }
  })
  const signal = new AbortController().signal
  const prepared = await adapter.prepareCall('seat-plan-tracy', 'default', signal)
  // `seat-plan-tracy` is answered by the deployment default (tracy-web `run` says `fallback` at
  // once), whose own adapter reads the store references: dsh must not turn the picture into text.
  assert.deepEqual(prepared.model, { ...visionDefault, provider: 'seat-plan-tracy', id: 'default' })
  assert.deepEqual(asked, [{ provider: 'tracy-default', model: 'deployment-model', signal }])
})

test('Tracy AI kept as Default stays text-only when no deployment default can be described', async () => {
  const cases = [
    adapterOf({ fixed: () => undefined, resolveModelInfo: async () => visionDefault }),
    // A default that is itself a subscription route would describe this adapter by itself.
    adapterOf({
      fixed: () => ({ provider: 'seat-plan-claude', model: 'm' }),
      resolveModelInfo: async () => visionDefault
    }),
    adapterOf({
      fixed: () => ({ provider: 'tracy-default', model: 'deployment-model' }),
      resolveModelInfo: async () => {
        throw new Error('no route')
      }
    }),
    adapterOf({ fixed: () => ({ provider: 'tracy-default', model: 'deployment-model' }) })
  ]
  for (const adapter of cases) {
    const prepared = await adapter.prepareCall('seat-plan-tracy', 'default')
    assert.deepEqual(prepared.model.inputModalities, ['text'])
    assert.equal(prepared.model.provider, 'seat-plan-tracy')
    assert.equal(prepared.model.id, 'default')
  }
})

test('a Tracy AI pin hands the deployment default the picture as the store reference it reads itself', async (t) => {
  const pasted = {
    type: 'image',
    attachment: {
      attachmentId: `sha256:${'ab'.repeat(32)}`,
      mediaType: 'image/png',
      bytes: 10,
      width: 4,
      height: 4
    }
  }
  /** @type {any[]} */
  const streamed = []
  let adapter
  const ctx = {
    get: (name) =>
      name === 'llm'
        ? {
            registerAdapter: (_routes, value) => {
              adapter = value
              return () => {}
            },
            async *stream(options) {
              streamed.push(options)
              yield { type: 'finish', reason: { kind: 'stop' } }
            }
          }
        : name === 'sessions'
          ? { get: () => session('tracy') }
          : name === 'tracyAssertion'
            ? { mint: (e) => e }
            : name === 'attachments'
              ? {
                  readImageRequest: async (ref, target) => ({
                    attachment: ref,
                    data: new Uint8Array(3),
                    mediaType: 'image/png',
                    bytes: 3,
                    width: Math.min(target.width, 4),
                    height: Math.min(target.height, 4)
                  })
                }
              : undefined,
    on: () => {},
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
  // tracy-web answers a Tracy AI pin with `fallback` before any vendor is asked.
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ fallback: true, route: { provider: 'seat-plan-tracy', switchedFrom: null } }) + '\n'
    )
  createAccountSubscriptions(ctx, () => ({ provider: 'tracy-default', model: 'deployment-model' }))
  const messages = [{ role: 'user', content: [{ type: 'text', text: 'what is this?' }, pasted] }]
  await Array.fromAsync(
    adapter.stream({ sessionId: 'tracy', provider: 'seat-plan-tracy', model: 'default', messages })
  )
  assert.equal(streamed.length, 1)
  assert.equal(streamed[0].provider, 'tracy-default')
  assert.deepEqual(streamed[0].messages.slice(0, -1), messages, 'the reference goes as it came')
  assert.match(streamed[0].messages.at(-1).content[0].text, /Trusted runtime model context/)
})

test('a subscription vendor route stays text-only until its bytes are sent', async () => {
  const adapter = adapterOf({
    fixed: () => ({ provider: 'tracy-default', model: 'deployment-model' }),
    resolveModelInfo: async () => visionDefault
  })
  for (const [provider, model] of [
    ['seat-plan-claude', 'claude-sonnet-5'],
    ['seat-plan-glm', 'glm-5']
  ]) {
    assert.deepEqual((await adapter.prepareCall(provider, model)).model.inputModalities, ['text'])
  }
})

test('the subscription adapter starts on the routes every broker serves', () => {
  const { routes } = registration()
  createAccountSubscriptions(routes.ctx, () => undefined)
  // `broker.js` `publicPin`: `seat-plan-${provider}` for a connection, `seat-plan-tracy` for a pin
  // switched to Tracy AI. Claude and Codex are served before any pin is read.
  assert.deepEqual([...routes.current].sort(), ['seat-plan-claude', 'seat-plan-codex', 'seat-plan-tracy'])
})

test('every provider the broker offers gets a route before its pin is handed to dsh', async (t) => {
  const { routes } = registration()
  let pinned = ''
  const policy = withBroker(t, routes, () =>
    Response.json({ route: { provider: `seat-plan-${pinned}`, model: 'm' } })
  )
  for (const { id } of DESKTOP_PROVIDERS) {
    pinned = id
    const route = await policy.forSession(session(id))
    assert.equal(route.provider, `seat-plan-${id}`)
    assert.ok(routes.current.includes(`seat-plan-${id}`), `seat-plan-${id} is served when dsh gets it`)
  }
  assert.equal(new Set(routes.current).size, routes.current.length, 'no route twice')
  assert.ok(routes.current.includes('seat-plan-tracy'))
})

test('a pin naming no route dsh could serve is refused, not registered', async (t) => {
  const { routes } = registration()
  const policy = withBroker(t, routes, () =>
    Response.json({ route: { provider: 'seat-plan-../x', model: 'm' } })
  )
  await assert.rejects(policy.forSession(session('odd')), { code: HOST_CODES.unavailable })
  assert.deepEqual([...routes.current].sort(), ['seat-plan-claude', 'seat-plan-codex', 'seat-plan-tracy'])
})

test('a pinned vendor model declares what tracy-web says it reads: Claude pictures, GLM text', async (t) => {
  const { routes } = registration()
  const policy = withBroker(t, routes, ({ sessionId }) =>
    Response.json({
      route:
        sessionId === 'claude'
          ? { provider: 'seat-plan-claude', model: 'claude-sonnet-5', inputModalities: ['text', 'image'] }
          : { provider: 'seat-plan-glm', model: 'glm-5', inputModalities: ['text'] }
    })
  )
  // Two conversations pinned at once: each model keeps its own answer.
  const [claude, glm] = await Promise.all([
    policy.forSession(session('claude')),
    policy.forSession(session('glm'))
  ])
  // The route is handed to dsh only now: what it reads must already be known.
  assert.deepEqual((await routes.adapter.prepareCall(claude.provider, claude.model)).model.inputModalities, [
    'text',
    'image'
  ])
  assert.deepEqual((await routes.adapter.prepareCall(glm.provider, glm.model)).model.inputModalities, [
    'text'
  ])
})

test('a pin that says nothing about pictures, or nonsense, leaves the model text-only', async (t) => {
  const { routes } = registration()
  let said = /** @type {any} */ (undefined)
  const policy = withBroker(t, routes, () =>
    Response.json({
      route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5', inputModalities: said }
    })
  )
  for (const [value, expected] of [
    [
      ['text', 'image'],
      ['text', 'image']
    ],
    // Each answer replaces the last one: a later silent pin does not keep an old "image".
    [undefined, ['text']],
    ['image', ['text']],
    [['image', 7], ['text']],
    [['text', 'video'], ['text']]
  ]) {
    said = value
    await policy.forSession(session('one'))
    assert.deepEqual(
      (await routes.adapter.prepareCall('seat-plan-claude', 'claude-sonnet-5')).model.inputModalities,
      expected,
      `pin said ${JSON.stringify(value)}`
    )
  }
})

test('after a host restart a model reads pictures again from its first pin', async (t) => {
  const answer = () =>
    Response.json({
      route: { provider: 'seat-plan-claude', model: 'claude-sonnet-5', inputModalities: ['text', 'image'] }
    })
  const before = registration()
  await withBroker(t, before.routes, answer).forSession(session('one'))
  // A new host knows nothing until the turn's own pin, which dsh asks before it resolves the model.
  const after = registration()
  const policy = withBroker(t, after.routes, answer)
  const cold = await after.routes.adapter.prepareCall('seat-plan-claude', 'claude-sonnet-5')
  assert.deepEqual(cold.model.inputModalities, ['text'])
  await policy.forSession(session('one'))
  const warm = await after.routes.adapter.prepareCall('seat-plan-claude', 'claude-sonnet-5')
  assert.deepEqual(warm.model.inputModalities, ['text', 'image'])
})

test("Tracy's own picture checks (page picture, page.look) see a Claude route read pictures, and a GLM route not", async (t) => {
  const { routes } = registration()
  const policy = withBroker(t, routes, ({ sessionId }) =>
    Response.json({
      route:
        sessionId === 'claude'
          ? { provider: 'seat-plan-claude', model: 'claude-sonnet-5', inputModalities: ['text', 'image'] }
          : { provider: 'seat-plan-glm', model: 'glm-5', inputModalities: ['text'] }
    })
  )
  // dsh's `resolveModelInfo` answers from the adapter's `resolveModel` for a registered route.
  const llm = {
    resolveModelInfo: async (/** @type {string} */ provider, /** @type {string} */ model) =>
      (await routes.adapter.prepareCall(provider, model)).model
  }
  const ctx = { get: (/** @type {string} */ name) => (name === 'llm' ? llm : undefined) }
  for (const [id, reads] of /** @type {const} */ ([
    ['claude', true],
    ['glm', false]
  ])) {
    const route = await policy.forSession(session(id))
    const agent = {
      session: { requestHeader: () => ({ config: { provider: route.provider, model: route.model } }) }
    }
    assert.equal(await agentReadsImages(ctx, agent), reads, `view.mjs agentReadsImages on ${id}`)
    assert.equal(
      readsImages(await llm.resolveModelInfo(route.provider, route.model)),
      reads,
      `look.mjs readsImages on ${id}`
    )
  }
})

/** An `llm` service that keeps the routes the adapter holds, `replace` included, like dsh-llm's handle. */
function registration() {
  const routes = {
    current: /** @type {string[]} */ ([]),
    ctx: /** @type {any} */ (undefined),
    adapter: /** @type {any} */ (undefined)
  }
  const llm = {
    registerAdapter: (/** @type {string[]} */ value, /** @type {any} */ adapter) => {
      routes.adapter = adapter
      routes.current = [...value]
      const handle = () => {}
      handle.replace = (/** @type {string[]} */ next) => {
        routes.current = [...next]
      }
      return handle
    }
  }
  routes.ctx = {
    get: (/** @type {string} */ name) =>
      name === 'llm' ? llm : name === 'tracyAssertion' ? { mint: (/** @type {string} */ e) => e } : undefined,
    on: () => {},
    inject: (/** @type {any} */ _names, /** @type {any} */ fn) => fn(routes.ctx),
    effect: (/** @type {any} */ fn) => fn()
  }
  return { routes }
}

/** The policy over `routes`, with tracy-web's pin door answered by `answer`. */
function withBroker(t, routes, answer) {
  const priorFetch = globalThis.fetch
  const priorOrigin = process.env.MCP_TRACY_ORIGIN
  process.env.MCP_TRACY_ORIGIN = 'http://broker.test'
  t.after(() => {
    globalThis.fetch = priorFetch
    if (priorOrigin === undefined) delete process.env.MCP_TRACY_ORIGIN
    else process.env.MCP_TRACY_ORIGIN = priorOrigin
  })
  globalThis.fetch = async (/** @type {any} */ _url, /** @type {any} */ init) => answer(JSON.parse(init.body))
  return createAccountSubscriptions(routes.ctx, () => ({ provider: 'default', model: 'default' }))
}

/** A conversation on site `demo` whose last prompt `a@test` typed. */
const session = (/** @type {string} */ id) => ({
  id,
  header: { cwd: '/site/demo' },
  snapshotEvents: () => [
    { type: 'user/message', data: { source: { kind: 'user', prompter: { email: 'a@test' } } } }
  ]
})
