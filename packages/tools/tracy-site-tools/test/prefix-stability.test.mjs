/**
 * The cached prefix — the system text [1] and the tools array [2] — is the same bytes for every site
 * of a class and every conversation on a site, and nothing re-decides it once the agent is made
 * (PLAN v2.1 §0.7: T-B and the session-event half of T-D, cache rules CS1/CS2).
 *
 * 🔒 WHY THIS MATTERS MORE THAN ANY ONE TEXT. DeepSeek caches automatically, by prefix, in 64-token
 * blocks, and its template puts the tools right after the system text: ONE site byte in [1] or [2]
 * re-sends everything after it uncached, on every step of every conversation. Measured over 177 r2
 * and historical sessions, every `request/header` reason was `initial` — no mid-session change. This
 * suite keeps both halves of that true now that `tracy_site` is described per surface and two system
 * sections go blank per agent (`agent/created`, `index.ts`).
 *
 * The system text is assembled by dsh's OWN `SystemPrompt` (the built vendored package), so "an
 * agent-scoped section shadows the global one" is measured, not assumed; the tools array is built the
 * way dsh builds it for one agent — the global tools, minus the agent's restrictions, plus its own
 * registrations shadowing a name, in name order (CS4).
 *
 *   node --test packages/tools/tracy-site-tools/test/prefix-stability.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { apply } from '../lib/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')
// dsh's own prompt registry, from the vendored build (`pnpm dsh:build`; CI builds it before the gates).
const SP_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/system-prompt')
const fromSystemPrompt = createRequire(path.join(SP_DIR, 'package.json'))
const load = (/** @type {string} */ name) => import(pathToFileURL(fromSystemPrompt.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { bindScopeParent, createScope, scopeOf } = await load('@deepseek-ai/dsh-scope')
const systemPromptModule = await import(pathToFileURL(path.join(SP_DIR, 'lib', 'index.js')).href)
const SystemPrompt = systemPromptModule.default
const { renderPrompt } = systemPromptModule
// dsh's own tool registry (restrictions, agent-scoped registrations, scope parents), same build.
const ToolRuntime = (
  await import(
    pathToFileURL(path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/tools/lib/index.js')).href
  )
).default

// The 27 tools a designer conversation was sent on every site in the ja-business suite (r2, 24/09/2026).
const DESIGNER = [
  'ask_user_question',
  'bash',
  'edit',
  'exit_plan_mode',
  'glob',
  'grep',
  'job_kill',
  'job_list',
  'job_output',
  'read',
  'read_image',
  'skill',
  'todo_write',
  'tracy_brand',
  'tracy_design_copy',
  'tracy_design_library',
  'tracy_design_propose',
  'tracy_emdash',
  'tracy_find_definition',
  'tracy_site',
  'tracy_site_build_emdash',
  'tracy_site_build_joomla',
  'tracy_site_build_wordpress',
  'tracy_site_profile',
  'web_fetch',
  'web_search',
  'write'
]

/** The two dsh sections a site agent must not read — their real wording's site-bound parts. */
const HARNESS_SOURCE =
  'The DeepSeek Harness implementation checkout is at /opt/dsh. The checkout location and current working directory are separate values and may differ.'
const WEB_SURFACE =
  'You are running inside the DeepSeek Harness Web GUI at http://127.0.0.1:51731/. Start servers with pnpm run dev:web.'

/**
 * dsh's prompt registry with its global sections, and this plugin applied to a host whose global
 * tools are the designer roster (the plugin's own two registered for real).
 */
async function host() {
  const promptCtx = new Context()
  await promptCtx.plugin(SystemPrompt, { personaPrefix: 'You are Tracy, working on a customer’s website.' })
  promptCtx.systemPrompt.section({
    name: 'harness:source',
    order: promptCtx.systemPrompt.getSectionOrder('HARNESS_SOURCE'),
    text: HARNESS_SOURCE
  })
  promptCtx.systemPrompt.section({
    name: 'app:web-surface',
    order: promptCtx.systemPrompt.getSectionOrder('WEB_SURFACE'),
    text: WEB_SURFACE
  })
  const global = new Map(
    DESIGNER.map((name) => [name, { name, description: `the ${name} tool`, parameters: { type: 'object' } }])
  )
  const listeners = new Map()
  let globalRegistrations = 0
  const ctx = {
    webServer: { register: () => () => {} },
    tools: {
      register: (t) => {
        globalRegistrations += 1
        global.set(t.name, t)
        return () => {}
      },
      schemas: () => [...global.keys()].map((name) => ({ name }))
    },
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: () => undefined
  }
  apply(ctx, { emdash: { cms: async () => '' } })
  return { promptCtx, global, listeners, registrations: () => globalRegistrations }
}

/**
 * One agent, as dsh makes it: its own prompt scope (a real dsh scope), and a tool scope that records
 * every restriction and registration — with a count of each, so a later one shows.
 */
async function agentOn(promptCtx, cwd, sessionId) {
  /** @type {any} */
  let scope
  await promptCtx.plugin(
    Object.assign(
      (/** @type {any} */ inner) => {
        scope = createScope(inner, { name: sessionId })
      },
      { inject: ['systemPrompt'] }
    )
  )
  const denied = new Set()
  const own = new Map()
  const counts = { restrict: 0, register: 0, section: 0 }
  const prompt = scope.ctx.systemPrompt
  /** The session log, as dsh keeps it: what `record` writes back is what the next step reads. */
  const events = []
  const agent = {
    id: sessionId,
    session: {
      id: sessionId,
      header: { cwd },
      get seq() {
        return events.length
      },
      eventAt: (seq) => events[seq],
      surface: {
        get nodes() {
          return events.map((_, seq) => seq)
        }
      }
    },
    ctx: {
      tools: {
        restrict: (filter) => {
          counts.restrict += 1
          for (const name of filter.deny) denied.add(name)
          return () => {}
        },
        register: (tool) => {
          counts.register += 1
          own.set(tool.name, tool)
          return () => {}
        }
      },
      systemPrompt: {
        section: (section) => {
          counts.section += 1
          return prompt.section(section)
        },
        getSectionOrder: (name) => prompt.getSectionOrder(name)
      }
    }
  }
  /** Write the messages a step sent into the log, as dsh does before the next step. */
  const record = (messages) => {
    for (const message of messages)
      events.push({
        type: 'user/message',
        seq: events.length,
        data: { source: message.source, content: message.content }
      })
  }
  return { agent, scope, denied, own, counts, record }
}

/** A build job for the site in `folder`, where the build pipeline files it. */
function writeJob(folder, siteKey, job) {
  mkdirSync(path.join(folder, 'docs', 'agents', 'build', 'sites'), { recursive: true })
  writeFileSync(
    path.join(folder, 'docs', 'agents', 'build', 'sites', `${siteKey}.json`),
    JSON.stringify({ job: 'build-one', ...job })
  )
}

/** What dsh sends this agent: [1] the rendered system text, [2] the tools array, in name order. */
async function prefixOf(h, one) {
  const system = renderPrompt(await h.promptCtx.systemPrompt.assemble({ scope: scopeOf(one.scope.ctx) }))
  const tools = [...h.global.values()]
    .filter((tool) => !one.denied.has(tool.name))
    .map((tool) => one.own.get(tool.name) ?? tool)
    .map(({ name, description, parameters }) => ({ name, description, parameters }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  return { system, tools: JSON.stringify(tools) }
}

/** A sealed site of `platform` under a fresh sites root. */
function sealedSite(label, platform) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-prefix-'))
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
  )
  mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
  writeFileSync(path.join(root, '.content-contracts', `${label}.json`), '{}')
  process.env.TRACY_SITES_ROOT = root
  return { root, folder }
}

test.beforeEach(() => {
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

/** The agent-created listener(s), as dsh runs them: serially, awaited. */
async function created(h, agent) {
  for (const fn of h.listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
}

test('🔒 L1 precedence, on dsh’s own registry: the agent-scoped empty section shadows the global one, for that agent only', async () => {
  const h = await host()
  const { folder } = sealedSite('shadow1', 'joomla')
  const one = await agentOn(h.promptCtx, folder, 'session-a1')
  await created(h, one.agent)
  const scoped = renderPrompt(await h.promptCtx.systemPrompt.assemble({ scope: scopeOf(one.scope.ctx) }))
  const unscoped = renderPrompt(await h.promptCtx.systemPrompt.assemble())
  assert.doesNotMatch(scoped, /\/opt\/dsh|127\.0\.0\.1|dev:web/)
  assert.match(scoped, /You are Tracy/, 'the rest of the system text stays')
  assert.match(unscoped, /\/opt\/dsh/, 'nobody else loses it')
  assert.match(unscoped, /127\.0\.0\.1/)
})

for (const platform of ['joomla', 'wordpress']) {
  test(`🔒 T-B (${platform}): two sites of one class and two conversations on one site get byte-identical [1] and [2], and neither names a site`, async () => {
    const h = await host()
    const a = sealedSite('jx7k2qa', platform)
    const first = await agentOn(h.promptCtx, a.folder, 'session-a1b2c3')
    await created(h, first.agent)
    const second = await agentOn(h.promptCtx, a.folder, 'session-z9y8x7')
    await created(h, second.agent)
    const b = sealedSite('pq4m8vb', platform)
    const other = await agentOn(h.promptCtx, b.folder, 'session-q1w2e3')
    await created(h, other.agent)
    const [p1, p2, p3] = [await prefixOf(h, first), await prefixOf(h, second), await prefixOf(h, other)]
    assert.equal(p1.system, p2.system, 'two conversations, one site: [1]')
    assert.equal(p1.tools, p2.tools, 'two conversations, one site: [2]')
    assert.equal(p1.system, p3.system, 'two sites, one class: [1]')
    assert.equal(p1.tools, p3.tools, 'two sites, one class: [2]')
    // The invariant, not a word list (CS2): nothing that differs between sites or sessions. The
    // literal placeholder `<label>` is the same bytes everywhere and is allowed.
    for (const [part, text] of [
      ['[1]', p1.system],
      ['[2]', p1.tools]
    ]) {
      for (const label of ['jx7k2qa', 'pq4m8vb']) assert.ok(!text.includes(label), `${part} names ${label}`)
      assert.ok(!text.includes('tracy.test'), `${part} names the domain`)
      assert.doesNotMatch(text, /[a-z0-9]-web-1/, `${part} names a container`)
      assert.doesNotMatch(text, /session-[a-z0-9]/, `${part} names a session`)
      assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}/, `${part} carries a date`)
      assert.doesNotMatch(text, /\b\d{1,2}:\d{2}(:\d{2})?\b/, `${part} carries a clock time`)
    }
    // L1 shipped: the dsh-developer lines are gone from [1].
    assert.doesNotMatch(p1.system, /\/opt\/dsh|127\.0\.0\.1/)
  })
}

test('🔒 T-D: once the agent is made, nothing re-registers, re-masks or re-describes — not a new turn, a call, a build moving, a seal appearing, a platform change or the facts memo expiring', async () => {
  const h = await host()
  const { root, folder } = sealedSite('evt1', 'joomla')
  // Start OPEN: the seal marker appears mid-session below.
  rmSync(path.join(root, '.content-contracts'), { recursive: true, force: true })
  // A build is running on the site; its stage moves between the two customer messages (CS1).
  const stages = (running) =>
    ['check', 'install', 'seed', 'copy'].map((name, at) => ({
      name,
      status: at < running ? 'done' : at === running ? 'running' : 'pending'
    }))
  writeJob(folder, 'evt1.tracy.test', { status: 'running', stages: stages(1) })
  const one = await agentOn(h.promptCtx, folder, 'session-evt1')
  await created(h, one.agent)
  const before = { ...one.counts, global: h.registrations(), prefix: await prefixOf(h, one) }
  // One platform mask, and one restriction per deferred tool (`deferred-tools.mjs`): the design road's
  // five (with `tracy_design_system`, 11/10/2026). The Joomla build tool is NOT deferred: this site's
  // build is running, so the conversation may need it from the first step (`siteBuildOpen`).
  assert.ok(before.register === 1 && before.restrict === 6 && before.section === 2, JSON.stringify(before))
  const stateNotices = (/** @type {any} */ decision) =>
    decision.messages.filter((m) => m.source?.producer === 'tracy-site-tools:site-state')
  /**
   * One step as dsh runs it: the customer's message is claimed, so the hook takes the branch that
   * reads the site again and sends the context and the build's state (`decision.messages` not empty).
   */
  const step = async (text) => {
    const message = {
      id: `m-${text}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' }
    }
    let decision = { kind: 'enter', messages: [message] }
    for (const fn of h.listeners.get('agent/pre-step') ?? [])
      decision = await fn({ agent: one.agent, messages: [message] }, async () => ({
        kind: 'enter',
        messages: [message]
      }))
    one.record(decision.messages)
    return decision
  }
  // 🔒 THE AGENT dsh PASSES IS THE REAL ONE, ctx INCLUDED (`tools` `exec.agent`): a re-register or a
  // re-mask made from inside a call or a result listener would reach it, so the fake gets it too.
  const call = (args) => h.global.get('tracy_site').execute(args, { agent: one.agent })
  const emdash = (args) => h.global.get('tracy_emdash').execute(args, { agent: one.agent })
  const first = await step('change the phone')
  assert.equal(stateNotices(first).length, 1, 'the build’s state is said on the first step')
  await call({ action: 'help' })
  await emdash({ tool: 'content_list', arguments: { collection: 'pages' } })
  // The site's facts change under the conversation: the build moves on, the site is sealed, its
  // platform changes, and the memo expires.
  writeJob(folder, 'evt1.tracy.test', { status: 'running', stages: stages(2) })
  mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
  writeFileSync(path.join(root, '.content-contracts', 'evt1.json'), '{}')
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'evt1.tracy.test', platform: 'wordpress' })
  )
  const realNow = Date.now
  Date.now = () => realNow() + 6 * 60_000
  try {
    await call({ action: 'help' })
    await emdash({ tool: 'content_list', arguments: { collection: 'pages' } })
    const second = await step('and the title')
    // The change reached the model as a message — the stage that moved — and nothing else moved.
    assert.equal(stateNotices(second).length, 1, 'the build moving on is said as a notice')
    assert.notEqual(stateNotices(second)[0].content[0].text, stateNotices(first)[0].content[0].text)
    for (const fn of h.listeners.get('tools/result') ?? [])
      fn({ name: 'tracy_site_build_joomla', arguments: {}, agent: one.agent }, { isError: false })
    for (const fn of h.listeners.get('tools/result') ?? [])
      fn({ name: 'ask_user_question', arguments: {}, agent: one.agent }, { isError: false })
  } finally {
    Date.now = realNow
  }
  assert.deepEqual(
    { ...one.counts, global: h.registrations() },
    {
      register: before.register,
      restrict: before.restrict,
      section: before.section,
      global: before.global
    }
  )
  assert.deepEqual(
    await prefixOf(h, one),
    before.prefix,
    'the prefix this conversation started with is the one it keeps'
  )
})

/**
 * 🔒 S4 — [3], THE FIRST STEP'S OWN MESSAGES. After [1] and [2], the first byte that differs between
 * two conversations ends the cached part. The site's facts are the same bytes for every conversation
 * on a site and the customer's message never is, so the facts go in front of it; the build's state
 * changes within a conversation, so it goes behind it (CS3).
 */
test('🔒 S4: step 1 sends the site facts before the customer’s message — the same bytes for two conversations on one site — and the build state after it', async () => {
  const h = await host()
  const { folder } = sealedSite('s4one', 'joomla')
  writeJob(folder, 's4one.tracy.test', {
    status: 'running',
    stages: [
      { name: 'check', status: 'done' },
      { name: 'install', status: 'running' }
    ]
  })
  const firstStep = async (/** @type {string} */ sessionId, /** @type {string} */ text) => {
    const one = await agentOn(h.promptCtx, folder, sessionId)
    await created(h, one.agent)
    const message = {
      id: `m-${sessionId}`,
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' }
    }
    /** @type {any} */
    let decision = { kind: 'enter', messages: [message] }
    for (const fn of h.listeners.get('agent/pre-step') ?? [])
      decision = await fn({ agent: one.agent, messages: [message] }, async () => ({
        kind: 'enter',
        messages: [message]
      }))
    const at = decision.messages.indexOf(message)
    const producers = decision.messages.map((/** @type {any} */ m) => m.source?.producer ?? m.source?.kind)
    const before = JSON.stringify(
      decision.messages.slice(0, at).map((/** @type {any} */ m) => ({ role: m.role, content: m.content }))
    )
    return { producers, before }
  }
  const a = await firstStep('session-s4a', 'change the phone number')
  const b = await firstStep('session-s4b', 'what does the home page say?')
  // The day (fix A of perf/round7) changes once every 24 hours, so like the build's state it goes BEHIND
  // the customer's words: a date in front of them would end the cached part for every site at midnight.
  // The plain-words rule (V4S-3) and the reply-language rule (bug 30/09) come after it too.
  assert.deepEqual(a.producers, [
    'tracy-site-tools:site-context',
    'user',
    'tracy-site-tools:site-state',
    'tracy-site-tools:today',
    'tracy-site-tools:plain-reply',
    'tracy-site-tools:reply-language'
  ])
  assert.deepEqual(b.producers, a.producers)
  assert.equal(b.before, a.before, 'two conversations, one site: the same bytes up to the customer')
  assert.match(a.before, /s4one/, 'the facts are this site’s')
})

/** A tool as dsh's registry takes it. */
const dshTool = (name) => ({
  name,
  description: `the ${name} tool`,
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
  execute: async () => `ran:${name}`
})

test('🔒 T-D: a preset re-link before turn 1 keeps the scoped tracy_site, the mask and the blank sections — on dsh’s own registry', async () => {
  // dsh's own ToolRuntime and SystemPrompt, and its own scope parents: an agent is parented to its
  // preset's standing mount (`agent-preset-registry` `mount` → `bindScopeParent`), and a re-link before turn
  // 1 moves that parent (`rebind`). The agent's own layer — this plugin's work — must survive it.
  const app = new Context()
  await app.plugin(SystemPrompt, { personaPrefix: 'You are Tracy, working on a customer’s website.' })
  await app.plugin(ToolRuntime)
  app.systemPrompt.section({
    name: 'harness:source',
    order: app.systemPrompt.getSectionOrder('HARNESS_SOURCE'),
    text: HARNESS_SOURCE
  })
  app.systemPrompt.section({
    name: 'app:web-surface',
    order: app.systemPrompt.getSectionOrder('WEB_SURFACE'),
    text: WEB_SURFACE
  })
  const listeners = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => app.tools.register(t), schemas: (scope) => app.tools.schemas(scope) },
      effect: (setup) => {
        setup()
      },
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: () => undefined
    },
    { emdash: { cms: async () => '' } }
  )
  const mint = async (key) => {
    let scope
    await app.plugin(
      Object.assign(
        (inner) => {
          scope = createScope(inner, key)
        },
        { inject: ['tools', 'systemPrompt'] }
      )
    )
    return scope
  }
  // Two presets' standing mounts carry the model-facing rows, as in every preset deployment.
  const designerKey = { id: 'preset-designer' }
  const writerKey = { id: 'preset-writer' }
  const designer = await mint(designerKey)
  const writer = await mint(writerKey)
  const own = new Set(['tracy_site', 'tracy_emdash'])
  for (const name of DESIGNER.filter((n) => !own.has(n))) designer.ctx.tools.register(dshTool(name))
  for (const name of DESIGNER.filter((n) => !own.has(n) && n !== 'web_search'))
    writer.ctx.tools.register(dshTool(name))
  const { folder } = sealedSite('relink1', 'joomla')
  const agent = {
    id: 'session-relink1',
    session: {
      id: 'session-relink1',
      header: { cwd: folder },
      seq: 0,
      eventAt: () => undefined,
      surface: { nodes: [] }
    }
  }
  const binding = bindScopeParent(agent, designerKey)
  const scope = await mint(agent)
  agent.ctx = scope.ctx
  for (const fn of listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
  const view = async () => ({
    tools: new Map(app.tools.schemas(agent).map((t) => [t.name, t.description])),
    system: renderPrompt(await app.systemPrompt.assemble({ scope: scopeOf(scope.ctx) }))
  })
  const made = await view()
  const scopedDescription = made.tools.get('tracy_site')
  assert.ok(
    scopedDescription &&
      scopedDescription !== app.tools.schemas().find((t) => t.name === 'tracy_site')?.description
  )
  const hidden = ['tracy_emdash', 'tracy_site_build_emdash', 'tracy_site_build_wordpress']
  for (const name of hidden) assert.ok(!made.tools.has(name), `${name} hidden on a Joomla site`)
  assert.doesNotMatch(made.system, /\/opt\/dsh|127\.0\.0\.1/)
  // The re-link: the same agent, now under the writer preset.
  binding.rebind(writerKey)
  const relinked = await view()
  assert.ok(!relinked.tools.has('web_search'), 'the re-link took: the writer preset’s roster')
  assert.equal(relinked.tools.get('tracy_site'), scopedDescription, 'the scoped tracy_site survives')
  for (const name of hidden) assert.ok(!relinked.tools.has(name), `${name} still hidden`)
  assert.doesNotMatch(relinked.system, /\/opt\/dsh|127\.0\.0\.1/, 'the blank sections survive')
  assert.match(relinked.system, /You are Tracy/)
})
