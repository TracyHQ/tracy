#!/usr/bin/env node
/**
 * The host policy that permits session model selection but keeps default initialization operator-owned.
 *
 * The door (`POST /api/session/selectModel`, `…/initializeDefaultModel`) is tested here as a Fetch
 * handler over every malformed shape a client can send; the request path is tested on dsh's OWN
 * cordis and `installModelSelection`. The same behavior is verified through a real dsh boot in
 * `model-policy-runtime.test.mjs`.
 *
 *   node --test packages/ui/tracy-mode-picker/test/model-policy.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as hostEntry from '../lib/index.js'
import {
  INITIALIZE_DEFAULT_MODEL,
  MODEL_LOCKED,
  SELECT_MODEL,
  deploymentDefault,
  isDeploymentDefault,
  onDefault,
  serveInitializeDefaultModel,
  serveSelectModel
} from '../src/host/model-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
// dsh's own event bus, scopes and per-Agent model selection, from the vendored build (`pnpm dsh:build`).
const AGENT_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/agent')
const fromAgent = createRequire(path.join(AGENT_DIR, 'package.json'))
const load = (/** @type {string} */ name) => import(pathToFileURL(fromAgent.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { createScope } = await load('@deepseek-ai/dsh-scope')
const { agentEvents, installModelSelection } = await import(
  pathToFileURL(path.join(AGENT_DIR, 'lib', 'index.js')).href
)

const FLASH = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' })
const PRO = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'max' })
const PAID = Object.freeze({ provider: 'openrouter', model: 'anthropic/claude-opus-4' })

/** A stand-in for `ctx.agentDefaultModel`, whose selection a test can change. */
function defaultSource(/** @type {unknown} */ selection) {
  return {
    selection,
    currentSelection() {
      if (this.selection instanceof Error) throw this.selection
      return this.selection
    }
  }
}

/** One RPC call as `client-connection` sends it. */
function rpcRequest(
  /** @type {string} */ endpoint,
  /** @type {unknown} */ body,
  /** @type {{ method?: string, contentType?: string | null, raw?: string }} */ options = {}
) {
  const headers = new Headers()
  if (options.contentType !== null) headers.set('content-type', options.contentType ?? 'application/json')
  const method = options.method ?? 'POST'
  return new Request(`http://127.0.0.1/api/${endpoint}`, {
    method,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: options.raw ?? JSON.stringify(body) })
  })
}

const envelope = (/** @type {unknown} */ request, method = SELECT_MODEL) => ({
  type: 'client-request',
  rpcId: 'r1',
  method,
  payload: { args: { request } }
})

/** Door deps that record every forwarded call. */
function doorDeps(
  /** @type {unknown} */ selection = FLASH,
  /** @type {((r: unknown) => Promise<unknown>) | undefined} */ invoke = undefined
) {
  /** @type {unknown[]} */
  const forwarded = []
  const source = defaultSource(selection)
  return {
    forwarded,
    source,
    deps: {
      // What the plugin wires on a profile without `customerRoutes`: every conversation's model is
      // the deployment default (`session-models.mjs`).
      sessionModel: async () => deploymentDefault(source),
      invoke: () => async (/** @type {unknown} */ request) => {
        forwarded.push(request)
        return invoke ? invoke(request) : { selected: { ...FLASH, reasoningEffort: 'high' } }
      }
    }
  }
}

async function json(/** @type {Response} */ response) {
  return /** @type {any} */ (await response.json())
}

test('the deployment default is read as one complete route, or not at all', () => {
  assert.deepEqual(deploymentDefault(defaultSource(FLASH)), FLASH)
  assert.deepEqual(deploymentDefault(defaultSource({ ...FLASH, reasoningEffort: 'off' })), {
    ...FLASH,
    reasoningEffort: 'off'
  })
  for (const broken of [
    undefined,
    null,
    'deepseek-flash',
    [],
    {},
    { provider: 'deepseek-official' },
    { provider: '', model: 'deepseek-flash' },
    { provider: 'deepseek-official', model: '   ' },
    { provider: 'deepseek-official', model: 42 },
    { ...FLASH, reasoningEffort: 3 },
    { ...FLASH, reasoningEffort: '' },
    new Error('config not ready')
  ]) {
    assert.equal(deploymentDefault(defaultSource(broken)), undefined, String(broken))
  }
  assert.equal(deploymentDefault(undefined), undefined)
  assert.equal(deploymentDefault(/** @type {any} */ ({})), undefined)
})

test('only the default route matches; a named effort must be the default one', () => {
  assert.equal(isDeploymentDefault(FLASH, FLASH), true)
  assert.equal(isDeploymentDefault({ ...FLASH, reasoningEffort: 'high' }, FLASH), false)
  assert.equal(
    isDeploymentDefault({ ...FLASH, reasoningEffort: 'high' }, { ...FLASH, reasoningEffort: 'high' }),
    true
  )
  assert.equal(isDeploymentDefault(FLASH, { ...FLASH, reasoningEffort: 'high' }), true)
  assert.equal(isDeploymentDefault(PRO, FLASH), false)
  assert.equal(isDeploymentDefault(PAID, FLASH), false)
  assert.equal(isDeploymentDefault({ provider: 'openrouter', model: 'deepseek-flash' }, FLASH), false)
})

test('a request config is put on the default, inherited effort dropped unless the default names one', () => {
  const config = { ...PAID, reasoningEffort: 'max', maxTokens: 900 }
  assert.deepEqual(onDefault(config, FLASH), { ...FLASH, maxTokens: 900 })
  assert.deepEqual(onDefault(config, { ...FLASH, reasoningEffort: 'off' }), {
    ...FLASH,
    reasoningEffort: 'off',
    maxTokens: 900
  })
})

test('selectModel forwards the requested session-local model', async () => {
  const { deps, forwarded } = doorDeps({ ...FLASH, reasoningEffort: 'off' })
  const response = await serveSelectModel(
    rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...FLASH })),
    deps
  )
  const body = await json(response)
  assert.equal(body.type, 'server-response')
  assert.equal(body.rpcId, 'r1')
  assert.equal(body.result.ok, true)
  assert.equal(forwarded.length, 1)
  const call = /** @type {any} */ (forwarded[0])
  assert.equal(call.namespace, 'session')
  assert.equal(call.method, 'selectModel')
  assert.deepEqual(call.args, { request: { sessionId: 's1', ...FLASH } })
  assert.ok(call.signal instanceof AbortSignal)
})

test('selectModel forwards any requested route for dsh to validate', async () => {
  for (const asked of [
    PRO,
    PAID,
    { ...FLASH, reasoningEffort: 'max' },
    { provider: 'openrouter', model: FLASH.model }
  ]) {
    const { deps, forwarded } = doorDeps()
    const body = await json(
      await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...asked })), deps)
    )
    assert.equal(body.result.ok, true, JSON.stringify(asked))
    assert.equal(forwarded.length, 1)
    assert.deepEqual(forwarded[0].args, { request: { sessionId: 's1', ...asked } })
  }
})

test('model picks do not depend on a configured deployment default', async () => {
  for (const broken of [null, { provider: '', model: '' }, new Error('not ready')]) {
    const { deps, forwarded } = doorDeps(broken)
    for (const asked of [FLASH, PAID]) {
      const body = await json(
        await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...asked })), deps)
      )
      assert.equal(body.result.ok, true)
    }
    assert.equal(forwarded.length, 2)
  }
  // No agent-default-model service at all.
  const body = await json(
    await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...FLASH })), {
      sessionModel: async () => undefined,
      invoke: () => undefined
    })
  )
  assert.equal(body.result.error.code, 'gateway/service-unavailable')
})

test('a failure behind the door is reported as the gateway would, without another route', async () => {
  const remote = Object.assign(new Error('Session "s1" was not found'), {
    code: 'session/not-found',
    details: { sessionId: 's1' }
  })
  let { deps } = doorDeps(FLASH, () => Promise.reject(remote))
  let body = await json(
    await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...FLASH })), deps)
  )
  assert.deepEqual(body.result, {
    ok: false,
    error: { code: 'session/not-found', message: remote.message, details: { sessionId: 's1' } }
  })
  ;({ deps } = doorDeps(FLASH, () => Promise.reject(new Error('socket hang up'))))
  body = await json(
    await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...FLASH })), deps)
  )
  assert.deepEqual(body.result, {
    ok: false,
    error: { code: 'gateway/internal', message: 'socket hang up', details: {} }
  })
  body = await json(
    await serveSelectModel(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...FLASH })), {
      sessionModel: async () => FLASH,
      invoke: () => undefined
    })
  )
  assert.equal(body.result.error.code, 'gateway/service-unavailable')
})

const good = { sessionId: 's1', ...FLASH }

/** Every malformed call a client can make, each with the kind of answer dsh itself gives. */
const MALFORMED = /** @type {[string, Request, number | string][]} */ ([
  ['GET', rpcRequest(SELECT_MODEL, undefined, { method: 'GET' }), 404],
  ['PUT', rpcRequest(SELECT_MODEL, envelope(good), { method: 'PUT' }), 404],
  ['no content type', rpcRequest(SELECT_MODEL, envelope(good), { contentType: null }), 415],
  ['text/plain', rpcRequest(SELECT_MODEL, envelope(good), { contentType: 'text/plain' }), 415],
  ['empty body', rpcRequest(SELECT_MODEL, undefined, { raw: '' }), 400],
  ['broken JSON', rpcRequest(SELECT_MODEL, undefined, { raw: '{"type":' }), 400],
  ['null body', rpcRequest(SELECT_MODEL, null), 'gateway/bad-request'],
  ['array body', rpcRequest(SELECT_MODEL, [envelope(good)]), 'gateway/bad-request'],
  [
    'wrong type',
    rpcRequest(SELECT_MODEL, { ...envelope(good), type: 'server-response' }),
    'gateway/bad-request'
  ],
  ['numeric rpcId', rpcRequest(SELECT_MODEL, { ...envelope(good), rpcId: 7 }), 'gateway/bad-request'],
  [
    'no payload',
    rpcRequest(SELECT_MODEL, { type: 'client-request', rpcId: 'r1', method: SELECT_MODEL }),
    'gateway/bad-request'
  ],
  ['method mismatch', rpcRequest(SELECT_MODEL, envelope(good, 'session/prompt')), 'gateway/bad-request'],
  [
    'null payload',
    rpcRequest(SELECT_MODEL, { ...envelope(good), payload: null }),
    'gateway/arguments-invalid'
  ],
  [
    'array payload',
    rpcRequest(SELECT_MODEL, { ...envelope(good), payload: [] }),
    'gateway/arguments-invalid'
  ],
  [
    'payload extra key',
    rpcRequest(SELECT_MODEL, { ...envelope(good), payload: { args: { request: good }, x: 1 } }),
    'gateway/arguments-invalid'
  ],
  [
    'args extra key',
    rpcRequest(SELECT_MODEL, { ...envelope(good), payload: { args: { request: good, other: {} } } }),
    'gateway/arguments-invalid'
  ],
  [
    'args array',
    rpcRequest(SELECT_MODEL, { ...envelope(good), payload: { args: [] } }),
    'gateway/arguments-invalid'
  ],
  ['null request', rpcRequest(SELECT_MODEL, envelope(null)), 'gateway/arguments-invalid'],
  ['array request', rpcRequest(SELECT_MODEL, envelope([])), 'gateway/arguments-invalid'],
  ['no sessionId', rpcRequest(SELECT_MODEL, envelope({ ...FLASH })), 'gateway/arguments-invalid'],
  [
    'blank sessionId',
    rpcRequest(SELECT_MODEL, envelope({ ...good, sessionId: ' ' })),
    'gateway/arguments-invalid'
  ],
  [
    'numeric sessionId',
    rpcRequest(SELECT_MODEL, envelope({ ...good, sessionId: 1 })),
    'gateway/arguments-invalid'
  ],
  [
    'numeric provider',
    rpcRequest(SELECT_MODEL, envelope({ ...good, provider: 1 })),
    'gateway/arguments-invalid'
  ],
  [
    'no model',
    rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', provider: FLASH.provider })),
    'gateway/arguments-invalid'
  ],
  [
    'numeric effort',
    rpcRequest(SELECT_MODEL, envelope({ ...good, reasoningEffort: 2 })),
    'gateway/arguments-invalid'
  ]
])

test('a malformed selectModel call is answered and never forwarded', async () => {
  for (const [name, request, expected] of MALFORMED) {
    const { deps, forwarded } = doorDeps()
    const response = await serveSelectModel(request, deps)
    if (typeof expected === 'number') {
      assert.equal(response.status, expected, name)
    } else {
      assert.equal(response.status, 200, name)
      const body = await json(response)
      assert.equal(body.result.ok, false, name)
      assert.equal(body.result.error.code, expected, name)
    }
    assert.equal(forwarded.length, 0, name)
  }
})

test('initializeDefaultModel is refused, however it is asked', async () => {
  const ok = await json(
    await serveInitializeDefaultModel(
      rpcRequest(INITIALIZE_DEFAULT_MODEL, {
        type: 'client-request',
        rpcId: 'r9',
        method: INITIALIZE_DEFAULT_MODEL,
        payload: { args: {} }
      })
    )
  )
  assert.equal(ok.result.ok, false)
  assert.equal(ok.result.error.code, MODEL_LOCKED)
  assert.equal(ok.rpcId, 'r9')
  assert.equal(
    (await serveInitializeDefaultModel(rpcRequest(INITIALIZE_DEFAULT_MODEL, undefined, { raw: 'x' }))).status,
    400
  )
  assert.equal(
    (await serveInitializeDefaultModel(rpcRequest(INITIALIZE_DEFAULT_MODEL, undefined, { method: 'GET' })))
      .status,
    404
  )
  const mismatch = await json(
    await serveInitializeDefaultModel(rpcRequest(INITIALIZE_DEFAULT_MODEL, envelope(good)))
  )
  assert.equal(mismatch.result.error.code, 'gateway/bad-request')
})

/**
 * A host with the policy loaded through the package's own entry, on dsh's cordis.
 * @param {unknown} selection - what `agentDefaultModel.currentSelection()` answers.
 */
async function host(selection) {
  const ctx = new Context()
  const source = defaultSource(selection)
  ctx.provide('agentDefaultModel', source)
  const routes = new Map()
  /** @type {any[]} */
  const forwarded = []
  ctx.provide('typertGateway', {
    invoke: async (/** @type {any} */ request) => {
      forwarded.push(request)
      return { selected: request.args.request }
    }
  })
  ctx.provide('connection', {
    fetch: {
      register(/** @type {any} */ route) {
        routes.set(route.path, route)
        return async () => {
          routes.delete(route.path)
        }
      }
    }
  })
  const fiber = ctx.plugin(hostEntry)
  await fiber
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { ctx, source, routes, forwarded, fiber }
}

/**
 * One Agent as dsh makes it: an agent-scoped context whose `installModelSelection` holds `picked`,
 * already assembled (what `system-prompt/assemble` does before the request).
 */
function agentOn(/** @type {any} */ ctx, /** @type {unknown} */ picked) {
  const agent = { id: `agent-${Math.random().toString(36).slice(2)}` }
  const scope = createScope(ctx, agent)
  const selection = { current: picked, assembled: picked }
  installModelSelection(scope.ctx, selection)
  const request = (/** @type {object} */ seed) =>
    agentEvents(ctx, /** @type {any} */ (agent)).waterfall(
      'agent/request',
      { turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve(seed)
    )
  return { agent, scope, selection, request }
}

test('agent requests retain their selected route', async () => {
  const { ctx } = await host(FLASH)
  // An Agent made after the policy loaded, with a pending paid pick (dsh appends its listener).
  const first = agentOn(ctx, PAID)
  assert.deepEqual(await first.request({ ...PRO, maxTokens: 10 }), { ...PAID, maxTokens: 10 })
  // A second Agent, e.g. a subagent under another scope, with an effort of its own.
  const child = agentOn(ctx, PRO)
  assert.deepEqual(await child.request({ ...PRO }), { ...PRO })
  // Later listeners can still adjust the request in the ordinary dsh waterfall.
  child.scope.ctx.on('agent/request', async (/** @type {any} */ _p, /** @type {any} */ next) => ({
    ...(await next()),
    provider: 'openrouter',
    model: 'x-ai/grok-4'
  }))
  assert.deepEqual(await child.request({ ...FLASH }), { ...PRO })
  // Concurrent requests retain their session selections.
  const late = agentOn(ctx, PAID)
  late.scope.ctx.on('agent/request', async (/** @type {any} */ _p, /** @type {any} */ next) => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    return next()
  })
  const sent = await Promise.all(Array.from({ length: 8 }, () => late.request({ ...PAID })))
  for (const config of sent) assert.deepEqual(config, { ...PAID })
})

test('the deployment default does not override an existing session selection', async () => {
  const { ctx, source } = await host(FLASH)
  const { request } = agentOn(ctx, PAID)
  assert.equal((await request({ ...PAID })).model, PAID.model)
  source.selection = { provider: 'deepseek-official', model: 'deepseek-v4-pro', reasoningEffort: 'off' }
  assert.deepEqual(await request({ ...PAID, reasoningEffort: 'max' }), { ...PAID })
})

test('an inner failure is passed on, not rerouted', async () => {
  const { ctx } = await host(FLASH)
  const { scope, request } = agentOn(ctx, PAID)
  scope.ctx.on('agent/request', async () => {
    throw new Error('adapter offline')
  })
  await assert.rejects(request({ ...PAID }), /adapter offline/)
})

test('the prompt keeps dsh assembled model variables', async () => {
  const { ctx } = await host(FLASH)
  const scope = createScope(ctx, { id: 'prompted' })
  installModelSelection(scope.ctx, { current: PAID, assembled: undefined })
  const assembled = await ctx.waterfall('system-prompt/assemble', {}, {}, () =>
    Promise.resolve({ sections: [], variables: { cwd: '/site', provider: 'x', model: 'y' } })
  )
  assert.equal(assembled.variables.provider, PAID.provider)
  assert.equal(assembled.variables.model, PAID.model)
  assert.equal(assembled.variables.cwd, '/site')
  // An assembly that names no model is left as it is (no Agent installed a selection here).
  const { ctx: bareHost } = await host(FLASH)
  const bare = await bareHost.waterfall('system-prompt/assemble', {}, {}, () =>
    Promise.resolve({ sections: [], variables: { cwd: '/site' } })
  )
  assert.deepEqual(bare.variables, { cwd: '/site' })
})

test('the plugin registers both doors on the shared /api channel through its own entry', async () => {
  const { routes, forwarded, fiber } = await host(FLASH)
  assert.deepEqual([...routes.keys()].sort(), [`/api/${INITIALIZE_DEFAULT_MODEL}`, `/api/${SELECT_MODEL}`])
  for (const route of routes.values()) {
    assert.deepEqual(route.methods, ['POST'])
    assert.equal(route.requestBody, 'buffered')
  }
  const select = routes.get(`/api/${SELECT_MODEL}`)
  const selected = await json(
    await select.fetch(rpcRequest(SELECT_MODEL, envelope({ sessionId: 's1', ...PAID })))
  )
  assert.equal(selected.result.ok, true)
  assert.equal(forwarded.length, 1)
  await fiber.dispose()
})
