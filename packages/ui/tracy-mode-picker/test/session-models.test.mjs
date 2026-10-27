#!/usr/bin/env node
/**
 * The desktop app's per-conversation model (tasks/todo-desktop-surface.md part B, cases T5 and T6 of
 * tasks/evidence/desktop-llm/test-cases.md).
 *
 * With `customerRoutes` in the plugin's config, a NEW conversation runs on the first route whose
 * plan is connected (dsh-subscriptions holds a signed-in account for it), else on the deployment default.
 * The answer is decided once per conversation: connecting or disconnecting later never moves a
 * conversation already running. A conversation on a customer's plan whose plan went away stops with
 * a "reconnect" error instead of quietly answering on Tracy's model.
 *
 * Measured through the package's own entry on dsh's cordis and `agentEvents`, the same harness as
 * `model-policy.test.mjs`.
 *
 *   node --test packages/ui/tracy-mode-picker/test/session-models.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as hostEntry from '../lib/index.js'
import { PLAN_DISCONNECTED, SELECT_MODEL } from '../src/host/model-policy.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
const AGENT_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/agent')
const fromAgent = createRequire(path.join(AGENT_DIR, 'package.json'))
const load = (/** @type {string} */ name) => import(pathToFileURL(fromAgent.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { createScope } = await load('@deepseek-ai/dsh-scope')
const { agentEvents, installModelSelection } = await import(
  pathToFileURL(path.join(AGENT_DIR, 'lib', 'index.js')).href
)

const FLASH = Object.freeze({ provider: 'deepseek-official', model: 'deepseek-flash' })
const CLAUDE = Object.freeze({ provider: 'claude', model: 'claude-sonnet-5' })
const CODEX = Object.freeze({ provider: 'codex', model: 'gpt-5.3-codex' })

/** A stand-in for dsh-subscriptions' `subscriptions` service: only `available(provider)` is read. */
function credentialStore(/** @type {string[]} */ connected = []) {
  const signedIn = new Set(connected)
  return {
    /** @type {string[]} */
    asked: [],
    /** @type {(provider: string) => Promise<boolean>} */
    async available(provider) {
      this.asked.push(provider)
      return signedIn.has(provider)
    },
    connect(/** @type {string} */ provider) {
      signedIn.add(provider)
    },
    disconnect(/** @type {string} */ provider) {
      signedIn.delete(provider)
    }
  }
}

/**
 * A host with the policy loaded through the package's own entry and the given plugin config.
 * @param {{ config?: unknown, credentials?: ReturnType<typeof credentialStore> | null }} options
 */
async function host({ config, credentials = credentialStore() } = {}) {
  const ctx = new Context()
  ctx.provide('agentDefaultModel', { currentSelection: () => FLASH })
  if (credentials !== null) ctx.provide('subscriptions', credentials)
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
        return async () => routes.delete(route.path)
      }
    }
  })
  const fiber = ctx.plugin(hostEntry, config)
  await fiber
  await new Promise((resolve) => setTimeout(resolve, 0))
  return { ctx, routes, forwarded, fiber }
}

let sessions = 0

/**
 * One Agent driving one conversation, as dsh makes it.
 * @param {any} ctx
 * @param {{ id?: string, header?: object, logged?: object }} [session] - `logged` is the config of
 *   the session's last recorded request (`session.requestHeader().config`).
 */
function conversation(ctx, session = {}) {
  const id = session.id ?? `session-${++sessions}`
  const agent = {
    id: `agent-${id}`,
    session: {
      id,
      header: { id, ...session.header },
      requestHeader: () => (session.logged === undefined ? undefined : { config: session.logged })
    }
  }
  const scope = createScope(ctx, agent)
  installModelSelection(scope.ctx, { current: FLASH, assembled: FLASH })
  const request = () =>
    agentEvents(ctx, /** @type {any} */ (agent)).waterfall(
      'agent/request',
      { turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ ...FLASH, maxTokens: 10 })
    )
  const prompt = () =>
    ctx.waterfall('system-prompt/assemble', {}, { agent, scope: agent }, () =>
      Promise.resolve({ sections: [], variables: { cwd: '/site', provider: 'x', model: 'y' } })
    )
  return { id, request, prompt }
}

const routeOf = (/** @type {any} */ config) => ({ provider: config.provider, model: config.model })
const ROUTES = { customerRoutes: [CLAUDE, CODEX] }

test('without customerRoutes every conversation runs on the deployment default, credentials unread', async () => {
  const credentials = credentialStore(['claude'])
  const { ctx } = await host({ credentials })
  assert.deepEqual(await conversation(ctx).request(), { ...FLASH, maxTokens: 10 })
  assert.deepEqual(credentials.asked, [])
})

test('T5: a new conversation runs on the connected plan; with none connected, on the default', async () => {
  const credentials = credentialStore()
  const { ctx } = await host({ config: ROUTES, credentials })
  assert.deepEqual(routeOf(await conversation(ctx).request()), FLASH)
  credentials.connect('claude')
  assert.deepEqual(await conversation(ctx).request(), { ...CLAUDE, maxTokens: 10 })
})

test('T5: routes are tried in order, and only a connected one is taken', async () => {
  const credentials = credentialStore(['codex'])
  const { ctx } = await host({ config: ROUTES, credentials })
  assert.deepEqual(routeOf(await conversation(ctx).request()), CODEX)
  credentials.connect('claude')
  assert.deepEqual(routeOf(await conversation(ctx).request()), CLAUDE)
})

test('T5: decided once per conversation — connecting later does not move a running one', async () => {
  const credentials = credentialStore()
  const { ctx } = await host({ config: ROUTES, credentials })
  const before = conversation(ctx)
  assert.deepEqual(routeOf(await before.request()), FLASH)
  credentials.connect('claude')
  assert.deepEqual(routeOf(await before.request()), FLASH)
  assert.deepEqual(routeOf(await conversation(ctx).request()), CLAUDE)
})

test('T5: concurrent first requests of one conversation reach one answer', async () => {
  const credentials = credentialStore()
  const { ctx } = await host({ config: ROUTES, credentials })
  const chat = conversation(ctx)
  const first = chat.request()
  credentials.connect('claude')
  const second = chat.request()
  const [a, b] = await Promise.all([first, second])
  assert.deepEqual(routeOf(a), routeOf(b))
})

test('T6: a conversation on a plan that went away stops with "reconnect", never on the default', async () => {
  const credentials = credentialStore(['claude'])
  const { ctx } = await host({ config: ROUTES, credentials })
  const chat = conversation(ctx)
  assert.deepEqual(routeOf(await chat.request()), CLAUDE)
  credentials.disconnect('claude')
  await assert.rejects(chat.request(), (/** @type {any} */ error) => {
    assert.equal(error.code, PLAN_DISCONNECTED)
    assert.match(error.message, /reconnect/i)
    return true
  })
  // Connected again: the same conversation goes on, on the same plan.
  credentials.connect('claude')
  assert.deepEqual(routeOf(await chat.request()), CLAUDE)
  // A new conversation while disconnected runs on the default.
  credentials.disconnect('claude')
  assert.deepEqual(routeOf(await conversation(ctx).request()), FLASH)
})

test('T6: a plan service that cannot answer counts as not connected, for a new and a running conversation', async () => {
  const credentials = credentialStore(['claude'])
  const { ctx } = await host({ config: ROUTES, credentials })
  const chat = conversation(ctx)
  assert.deepEqual(routeOf(await chat.request()), CLAUDE)
  credentials.available = async () => {
    throw new Error('account store unreadable')
  }
  await assert.rejects(chat.request(), { code: PLAN_DISCONNECTED })
  assert.deepEqual(routeOf(await conversation(ctx).request()), FLASH)
})

test('a conversation that already ran keeps its logged route after a restart', async () => {
  const credentials = credentialStore()
  const { ctx } = await host({ config: ROUTES, credentials })
  // Logged on Claude before the restart, plan gone since: reconnect, not the default.
  await assert.rejects(conversation(ctx, { logged: CLAUDE }).request(), { code: PLAN_DISCONNECTED })
  // Logged on the default, plan connected since: stays on the default.
  credentials.connect('claude')
  assert.deepEqual(routeOf(await conversation(ctx, { logged: FLASH }).request()), FLASH)
  // Logged on a plan route the profile no longer lists (the operator dropped the vendor): it keeps that
  // route — reconnect, never another plan and never the default.
  const dropped = { provider: 'grok', model: 'grok-4' }
  await assert.rejects(conversation(ctx, { logged: dropped }).request(), { code: PLAN_DISCONNECTED })
  credentials.connect('grok')
  assert.deepEqual(routeOf(await conversation(ctx, { logged: dropped }).request()), dropped)
})

test('a subagent runs on its parent conversation’s model', async () => {
  const credentials = credentialStore()
  const { ctx } = await host({ config: ROUTES, credentials })
  const parent = conversation(ctx)
  assert.deepEqual(routeOf(await parent.request()), FLASH)
  credentials.connect('claude')
  const child = conversation(ctx, { header: { origin: 'subagent', parentSession: parent.id } })
  assert.deepEqual(routeOf(await child.request()), FLASH)
})

test('the prompt names the conversation’s own model', async () => {
  const { ctx } = await host({ config: ROUTES, credentials: credentialStore(['claude']) })
  const assembled = await conversation(ctx).prompt()
  assert.equal(assembled.variables.provider, CLAUDE.provider)
  assert.equal(assembled.variables.model, CLAUDE.model)
})

test('the door forwards a new session model for dsh validation', async () => {
  const { ctx, routes, forwarded } = await host({
    config: ROUTES,
    credentials: credentialStore(['claude'])
  })
  const chat = conversation(ctx)
  await chat.request()
  const select = routes.get(`/api/${SELECT_MODEL}`)
  const call = (/** @type {object} */ pick) =>
    select
      .fetch(
        new Request(`http://127.0.0.1/api/${SELECT_MODEL}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'r1',
            method: SELECT_MODEL,
            payload: { args: { request: { sessionId: chat.id, ...pick } } }
          })
        })
      )
      .then((/** @type {Response} */ r) => r.json())
  assert.equal((await call(FLASH)).result.ok, true)
  assert.deepEqual(forwarded.at(-1).args.request, { sessionId: chat.id, ...FLASH })
  assert.equal((await call(CLAUDE)).result.ok, true)
  assert.deepEqual(forwarded.at(-1).args.request, { sessionId: chat.id, ...CLAUDE })
})

test('a malformed customerRoutes refuses to load rather than guessing', async () => {
  for (const config of [
    { customerRoutes: 'claude' },
    { customerRoutes: [{ provider: 'claude' }] },
    { customerRoutes: [{ provider: '', model: 'claude-sonnet-5' }] }
  ]) {
    const ctx = new Context()
    ctx.provide('agentDefaultModel', { currentSelection: () => FLASH })
    assert.throws(() => hostEntry.apply(/** @type {any} */ (ctx), config), /customerRoutes/)
  }
})
