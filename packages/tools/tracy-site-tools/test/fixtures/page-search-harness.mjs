/** Real dsh loop fixture; all unrelated network calls are isolated, and owned contexts are disposed. */
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { apply } from '../../lib/index.js'
const loop = fileURLToPath(
  new URL('../../../../../vendor/tracy/deepseek-harness/packages/core/agent-loop', import.meta.url)
)
const require = createRequire(join(loop, 'package.json'))
const load = async (name) => import(pathToFileURL(require.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { LlmAdapter, createUserMessage, default: LlmRuntime } = await load('@deepseek-ai/dsh-llm')
const SessionStore = (await load('@deepseek-ai/dsh-session')).default
const Projection = (await load('@deepseek-ai/dsh-session-projection')).default
const SystemPrompt = (await load('@deepseek-ai/dsh-system-prompt')).default
const ToolRuntime = (await load('@deepseek-ai/dsh-tools')).default
const Registry = (await load('@deepseek-ai/dsh-agent')).default
const AgentLoop = (await import(pathToFileURL(join(loop, 'lib/index.js')).href)).default

class Model extends LlmAdapter {
  requests = []
  constructor(calls, respond, streamRespond) {
    super()
    this.calls = calls
    this.respond = respond
    this.streamRespond = streamRespond
  }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model })
  }
  async *stream(options) {
    this.requests.push(options)
    if (this.streamRespond) {
      yield* this.streamRespond(options, this.requests.length)
      return
    }
    const reply = this.respond ? await this.respond(options, this.requests.length) : null
    const calls = reply?.calls ?? (this.requests.length === 1 ? this.calls : [])
    for (let i = 0; i < calls.length; i++) {
      const args = JSON.stringify(calls[i].arguments ?? calls[i])
      const name = calls[i].name ?? 'tracy_site'
      yield { type: 'block-start', index: i, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index: i,
        id: `call-${this.requests.length}-${i}`,
        name,
        argumentsDelta: args
      }
      yield {
        type: 'block-end',
        index: i,
        block: { type: 'tool-call', id: `call-${this.requests.length}-${i}`, name, arguments: args }
      }
    }
    if (!calls.length || reply?.text) {
      yield { type: 'block-start', index: calls.length, blockType: 'text' }
      yield { type: 'block-end', index: calls.length, block: { type: 'text', text: reply?.text ?? 'done' } }
    }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: calls.length ? 'tool-calls' : 'stop' } }
  }
}
export async function runPageSearchHarness(
  calls,
  {
    denied = false,
    lane = false,
    lookup = null,
    platform = 'wordpress',
    plugin = apply,
    respond = null,
    streamRespond = null,
    pluginConfig = {},
    transport = null,
    actorMint = (email) => `signed:${email}`,
    userText = 'Find Alpha and Beta'
  } = {}
) {
  const savedFetch = globalThis.fetch
  globalThis.fetch = async () =>
    Response.json({ ok: false, code: 'BENCHMARK_DOOR_UNAVAILABLE' }, { status: 404 })
  const root = mkdtempSync(join(tmpdir(), 'tracy-page-harness-'))
  const saved = {}
  for (const key of [
    'DSH_HOME',
    'TRACY_SITES_ROOT',
    'MCP_TRACY_SITE_KEY',
    'MCP_TRACY_SITE_LABEL',
    'DSH_PASSWORDS_ENV_FILE'
  ]) {
    saved[key] = process.env[key]
    delete process.env[key]
  }
  if (lane) {
    process.env.MCP_TRACY_SITE_KEY = 'owned.tracy.test'
    process.env.MCP_TRACY_SITE_LABEL = 'owned'
  }
  process.env.DSH_HOME = join(root, 'home')
  process.env.TRACY_SITES_ROOT = join(root, 'sites')
  mkdirSync(join(root, 'sites', 'owned', '.tracy'), { recursive: true })
  writeFileSync(
    join(root, 'sites', 'owned', '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'owned.tracy.test', platform })
  )
  mkdirSync(join(root, 'sites', 'owned', '.webroot'), { recursive: true })
  const ctx = new Context(),
    sent = [],
    cleanups = []
  try {
    for (const plugin of [LlmRuntime, SessionStore, Projection, SystemPrompt, ToolRuntime, Registry])
      await ctx.plugin(plugin)
    await ctx.plugin(AgentLoop, { agents: [] })
    const model = new Model(calls, respond, streamRespond)
    ctx.llm.registerAdapter(['mock'], model)
    plugin(
      {
        webServer: { register: () => () => {} },
        tools: ctx.tools,
        effect: (setup) => {
          const cleanup = setup()
          if (typeof cleanup === 'function') cleanups.push(cleanup)
          return () => {}
        },
        on: (...args) => ctx.on(...args),
        get: (name) => (name === 'tracyAssertion' ? { mint: actorMint } : ctx.get(name))
      },
      {
        origin: 'http://tracy-web.test',
        ...pluginConfig,
        fetch: async (url, options = {}) => {
          if (transport && !String(url).endsWith('/apply')) return transport(url, options)
          if (!String(url).endsWith('/apply'))
            return Response.json({ ok: false, code: 'BENCHMARK_DOOR_UNAVAILABLE' }, { status: 404 })
          const body = JSON.parse(options.body)
          if (body.action === 'demo.research')
            return Response.json({ ok: false, code: 'AGENT_DEMO_NOT_GRANTED' }, { status: 403 })
          sent.push({ url: String(url), body, headers: options.headers })
          if (transport) return transport(url, options)
          if (lookup) return Response.json(await lookup(body.params, body.action))
          if (denied) return Response.json({ ok: false, code: 'SEAT_REVOKED' }, { status: 403 })
          return Response.json({
            schemaVersion: 'tracy-content-pages/v1',
            site: { url: 'https://owned.test', defaultLocale: 'en', locales: ['en'] },
            pages: [
              {
                id: 'opaque-alpha',
                title: 'Alpha',
                path: '/alpha',
                url: 'https://owned.test/alpha',
                locale: 'en',
                type: 'page',
                status: 'published',
                native: [{ kind: 'post', id: 1 }]
              },
              {
                id: 'opaque-beta',
                title: 'Beta',
                path: '/beta',
                url: 'https://owned.test/beta',
                locale: 'en',
                type: 'page',
                status: 'published',
                native: [{ kind: 'post', id: 2 }]
              },
              {
                id: 'opaque-other',
                title: 'Other',
                path: '/other',
                url: 'https://owned.test/other',
                locale: 'en',
                type: 'page',
                status: 'published',
                native: [{ kind: 'post', id: 3 }]
              }
            ],
            truncated: false
          })
        }
      }
    )
    const { agent } = await ctx.agents.create({
      sessionId: 'page-search-harness',
      agentOptions: { provider: 'mock', model: 'mock' },
      meta: { cwd: join(root, 'sites', 'owned') }
    })
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: userText }],
        source: { kind: 'user', prompter: { email: 'editor@example.test', user: 'editor' } }
      })
    )
    await agent.whenIdle()
    return { sent, requests: model.requests, events: agent.session.snapshotEvents() }
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup()
    await ctx.fiber.dispose()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    globalThis.fetch = savedFetch
    rmSync(root, { recursive: true, force: true })
  }
}
