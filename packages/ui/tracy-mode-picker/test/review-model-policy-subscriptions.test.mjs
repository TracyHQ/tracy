/**
 * Review coverage: `installModelPolicy` on the fleet profile (`accountSubscriptions: true`,
 * `packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml`). The existing suite drives
 * the policy only without that key; these hold the request hook, the prompt hook and the model door
 * on the routing tracy-web answers.
 *
 *   node --test packages/ui/tracy-mode-picker/test/review-model-policy-subscriptions.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SELECT_MODEL, installModelPolicy } from '../src/host/model-policy.mjs'

const FLASH = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' })
const PLAN = Object.freeze({ provider: 'seat-plan-claude', model: 'claude-sonnet-5' })
const message = (email) => ({ source: { kind: 'user', prompter: { user: 'u', email } } })
const sessionOf = (id, email) => ({
  id,
  header: { cwd: '/site/demo' },
  snapshotEvents: () => [{ type: 'user/message', data: message(email) }]
})

function fleetHost(t, sessions, route) {
  const hooks = new Map()
  const routes = new Map()
  const forwarded = []
  const ctx = {
    get: (name) => {
      if (name === 'agentDefaultModel') return { currentSelection: () => FLASH }
      if (name === 'sessions') return { get: (id) => sessions.get(id) }
      if (name === 'tracyAssertion') return { mint: (email) => email }
      if (name === 'typertGateway')
        return {
          invoke: async (request) => {
            forwarded.push(request)
            return { ok: true }
          }
        }
      if (name === 'llm') return { registerAdapter: () => () => {} }
      return undefined
    },
    on: (name, fn) => hooks.set(name, fn),
    inject: (_names, fn) => fn(ctx),
    effect: (fn) => fn(),
    connection: { fetch: { register: (r) => routes.set(r.path, r) } }
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
    if (String(url).endsWith('/api/seat-plan/models'))
      return Response.json({ groups: [{ id: PLAN.provider, models: [{ id: PLAN.model }] }] })
    if (String(url).endsWith('/api/seat-plan/model')) return Response.json({ ok: true })
    return Response.json({ route: route(JSON.parse(init.body).sessionId) })
  }
  installModelPolicy(ctx, { accountSubscriptions: true })
  return { hooks, routes, forwarded }
}

const select = (sessionId, selection) =>
  new Request('http://127.0.0.1/api/session/selectModel', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tracy-session': 'test-viewer',
      'x-forwarded-prefix': '/demo.test'
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'r1',
      method: SELECT_MODEL,
      payload: { args: { request: { sessionId, ...selection } } }
    })
  })

test('planned requests use their account route; plain requests retain the selected model', async (t) => {
  const planned = sessionOf('planned', 'a@test')
  const plain = sessionOf('plain', 'b@test')
  const sessions = new Map([planned, plain].map((s) => [s.id, s]))
  const { hooks } = fleetHost(t, sessions, (id) => (id === 'planned' ? PLAN : null))
  const request = hooks.get('agent/request')
  const seed = { provider: 'openrouter', model: 'x', reasoningEffort: 'max', maxTokens: 9 }
  assert.deepEqual(await request({ agent: { session: planned } }, async () => seed), {
    ...PLAN,
    maxTokens: 9
  })
  assert.deepEqual(await request({ agent: { session: plain } }, async () => seed), seed)
})

test('the prompt hook leaves the prompt as dsh assembled it on the fleet profile', async (t) => {
  const { hooks } = fleetHost(t, new Map(), () => PLAN)
  const assembled = { sections: [], variables: { provider: 'p', model: 'm' } }
  assert.equal(await hooks.get('system-prompt/assemble')({}, {}, async () => assembled), assembled)
})

test('the model door permits switching between deployment and connected account models', async (t) => {
  const planned = sessionOf('planned', 'a@test')
  const sessions = new Map([[planned.id, planned]])
  const { routes, forwarded } = fleetHost(t, sessions, () => PLAN)
  const door = routes.get(`/api/${SELECT_MODEL}`)
  const deployment = await (await door.fetch(select('planned', FLASH))).json()
  assert.equal(deployment.result.ok, true)
  assert.deepEqual(forwarded.at(-1).args.request, { sessionId: 'planned', ...FLASH })
  const account = await (await door.fetch(select('planned', PLAN))).json()
  assert.equal(account.result.ok, true)
  assert.deepEqual(forwarded.at(-1).args.request, { sessionId: 'planned', ...PLAN })
  const unknown = await (await door.fetch(select('planned', { ...PLAN, model: 'unlisted' }))).json()
  assert.equal(unknown.result.ok, false)
  assert.equal(forwarded.length, 2)
})
