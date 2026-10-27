/**
 * The tools a site conversation is sent only once their road starts (`deferred-tools.mjs`): what
 * lifts one, in every interface language, and what dsh does with a lifted one.
 *
 * 🔒 WHY THESE THREE HALVES.
 * - The triggers: a deferred tool missing at the step that needs it costs the customer a failed call,
 *   so every message the Design inspiration and Build tabs send must lift them — rendered here from the
 *   shipped strings of every interface language, so a reworded or newly added translation that stops
 *   matching fails here instead of on a customer's build. An ordinary edit must lift none.
 * - "Never hide a tool the agent is told to call": the site context is the cached prefix every step
 *   reads, and it may not name a deferred tool (it would send the model to a tool it cannot see).
 * - dsh's own mechanism: on dsh's ToolRuntime, the lifted tool joins the agent's view; on an
 *   `addition-only` route (`llm-deepseek` model row), dsh's projection keeps the declarations the
 *   conversation started with byte-identical and sends the new one `deferLoading` with its
 *   `tool-addition` block — the shape `llm-deepseek/src/serialize.ts` turns into `defer_loading` and
 *   `tool_addition`, so the cached prefix survives.
 *
 *   node --test packages/tools/tracy-site-tools/test/deferred-tools.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { apply } from '../lib/index.js'
import {
  composerAsksDesign,
  createToolDeferral,
  DEFERRED_NAMES,
  messageLifts,
  namedDeferredTools,
  resultLifts,
  toolsToDefer
} from '../src/host/deferred-tools.mjs'
import { siteBuildOpen } from '../src/host/site-context.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(here, '..', '..', '..', '..')

// ── the triggers ──────────────────────────────────────────────────────────────────────────────────

test('a deferred tool is named only by its whole name', () => {
  assert.deepEqual(namedDeferredTools('then tracy_site_build_joomla request language.add'), [
    'tracy_site_build_joomla'
  ])
  assert.deepEqual(namedDeferredTools('the card is tracy_design_inspiration.json'), [])
  assert.deepEqual(namedDeferredTools('tracy_brand_x and xtracy_brand'), [])
  assert.deepEqual(namedDeferredTools(undefined), [])
})

test('the design skill loaded lifts every deferred tool; another skill or a plain answer lifts none', () => {
  assert.deepEqual(resultLifts({ name: 'skill', arguments: { name: 'tracy-design-inspiration' } }, ''), [
    ...DEFERRED_NAMES
  ])
  assert.deepEqual(resultLifts({ name: 'skill', arguments: { name: 'emdash-site' } }, 'body'), [])
  assert.deepEqual(resultLifts({ name: 'tracy_site', arguments: {} }, '{"changed":[]}'), [])
})

/** Ordinary edits, as customers write them (bench v7 + flow D prompts): none lifts a deferred tool. */
const EDITS = [
  'change the phone number to 0901 234 567',
  'Change "Welcome to our site" to "Hello"',
  'đổi tiêu đề trang chủ thành "Cà phê Bến Cảng"',
  'Make the header button green',
  'thêm trang "Giới thiệu" vào menu',
  'Ändere den Text „Willkommen“ in „Hallo“',
  'add a second language, French',
  'hide the newsletter form on mobile'
]

test('an ordinary edit lifts nothing', () => {
  for (const text of EDITS) assert.deepEqual(messageLifts(text), [], text)
})

test('a message naming the design skill or a deferred tool lifts them', () => {
  assert.deepEqual(messageLifts('/tracy-design-inspiration'), [...DEFERRED_NAMES])
  assert.deepEqual(messageLifts('use tracy_brand on my site'), ['tracy_brand'])
})

/** The keys the Design inspiration and Build tabs post into the chat as the customer's message. */
const COMPOSER_KEYS = {
  'tracy-design-inspiration': ['msg.use', 'msg.createWith', 'msg.buildWith'],
  'tracy-site-build': ['msg.answered', 'msg.revised', 'msg.answeredName', 'msg.answeredTemplate']
}

/** The English source of one plugin's strings, read off its `strings.ts` (`'key': 'text'` or "text"). */
function englishOf(file, keys) {
  const source = readFileSync(path.join(REPO, file), 'utf8')
  return Object.fromEntries(
    keys.map((key) => {
      const at = new RegExp(`'${key.replace('.', '\\.')}':\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(source)
      assert.ok(at, `${key} not found in ${file}`)
      return [key, at[1].replace(/\\'/g, "'")]
    })
  )
}

/** Every interface language's words for the composer keys: `{ lang → { key → template } }`. */
function composerTemplates() {
  /** @type {Record<string, Record<string, string>>} */
  const out = {
    en: {
      ...englishOf(
        'packages/design/tracy-design-inspiration/src/client/strings.ts',
        COMPOSER_KEYS['tracy-design-inspiration']
      ),
      ...englishOf(
        'packages/site/tracy-site-build-core/src/client/strings.ts',
        COMPOSER_KEYS['tracy-site-build']
      )
    }
  }
  const roots = [
    path.join(REPO, 'packages/locale/tracy-locales'),
    path.join(REPO, 'packages/locale/tracy-locale-vi')
  ]
  for (const root of roots)
    for (const lang of readdirSync(root)) {
      const folder = path.join(root, lang)
      const design = path.join(folder, 'tracy-design-inspiration.json')
      if (!existsSync(design)) continue
      const words = JSON.parse(readFileSync(design, 'utf8'))
      for (const cms of ['wordpress', 'joomla', 'emdash'])
        Object.assign(
          words,
          JSON.parse(readFileSync(path.join(folder, `tracy-site-build-${cms}.json`), 'utf8'))
        )
      out[lang] = Object.fromEntries(
        [...COMPOSER_KEYS['tracy-design-inspiration'], ...COMPOSER_KEYS['tracy-site-build']].map((key) => [
          key,
          words[key]
        ])
      )
    }
  return out
}

/** Sample answers, as the Build form fills a message in. */
const FILL = {
  name: 'Harbor Coffee',
  id: 'apple',
  platform: 'WordPress',
  business: 'Coffee shop',
  about: 'Specialty coffee by the harbour',
  pages: 'Home, Menu, Contact',
  tone: 'Warm',
  language: 'English',
  contact: 'hello@example.com'
}

test('🔒 every interface language: every message the Design inspiration and Build tabs send lifts the deferred tools', () => {
  const templates = composerTemplates()
  assert.ok(Object.keys(templates).length >= 8, `only ${Object.keys(templates).join(', ')} found`)
  for (const [lang, keys] of Object.entries(templates))
    for (const [key, template] of Object.entries(keys)) {
      assert.equal(typeof template, 'string', `${lang} ${key} is missing`)
      for (const platform of ['WordPress', 'Joomla', 'EmDash']) {
        const text = template.replace(/\{(\w+)\}/g, (_m, name) =>
          name === 'platform' ? platform : (FILL[name] ?? name)
        )
        assert.ok(composerAsksDesign(text), `${lang} ${key}: ${text}`)
        assert.deepEqual(messageLifts(text), [...DEFERRED_NAMES], `${lang} ${key}`)
      }
    }
})

// ── never hide a tool the agent is told to call ───────────────────────────────────────────────────

test('a deferred tool a visible description names, or one the conversation was already sent, is not deferred', () => {
  const visible = ['tracy_site', ...DEFERRED_NAMES]
  assert.deepEqual(toolsToDefer(visible, ['… tracy_site_build_joomla request language.add …'], null), [
    'tracy_brand',
    'tracy_design_library',
    'tracy_design_copy',
    'tracy_design_propose',
    'tracy_design_system',
    'tracy_site_build_wordpress'
  ])
  assert.deepEqual(toolsToDefer(visible, [], ['tracy_brand', 'tracy_site_build_wordpress']), [
    'tracy_design_library',
    'tracy_design_copy',
    'tracy_design_propose',
    'tracy_design_system',
    'tracy_site_build_joomla'
  ])
  assert.deepEqual(toolsToDefer(['tracy_site'], [], null), [], 'a tool the agent cannot see is not touched')
})

test('a road kept open keeps its tools from the first step; the other road still waits', () => {
  const visible = ['tracy_site', ...DEFERRED_NAMES]
  const design = [
    'tracy_brand',
    'tracy_design_library',
    'tracy_design_copy',
    'tracy_design_propose',
    'tracy_design_system'
  ]
  for (const { keep, deferred } of [
    { keep: [], deferred: [...design, 'tracy_site_build_wordpress', 'tracy_site_build_joomla'] },
    { keep: ['build'], deferred: design },
    { keep: ['design'], deferred: ['tracy_site_build_wordpress', 'tracy_site_build_joomla'] }
  ])
    assert.deepEqual(toolsToDefer(visible, [], null, keep), deferred, JSON.stringify(keep))
})

// ── a site whose build is still open keeps its build tool ─────────────────────────────────────────

/** A WordPress site folder, with a build on record in `status` (none when null). */
function siteWithBuild(root, label, status) {
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  const siteKey = `${label}.tracy.test`
  writeFileSync(path.join(folder, '.tracy', 'site.json'), JSON.stringify({ siteKey, platform: 'wordpress' }))
  if (status !== null) {
    const stage = status === 'done' ? 'done' : status === 'paused' ? 'pending' : status
    const sites = path.join(folder, 'docs', 'agents', 'build', 'sites')
    mkdirSync(sites, { recursive: true })
    writeFileSync(
      path.join(sites, `${siteKey}.json`),
      JSON.stringify({
        id: 'b1',
        platform: 'wordpress',
        status,
        stages: [
          { name: 'theme', status: 'done' },
          { name: 'seed', status: stage, ...(status === 'failed' ? { detail: 'the seeder stopped' } : {}) }
        ]
      })
    )
  }
  return folder
}

// Before the fix the build tool of a known platform was always deferred, and the site-state notice
// ("Build: failed at …") lifts nothing: "please try the build again" reached no tool.
const BUILD_STATES = [
  { status: null, open: false },
  { status: 'done', open: false },
  { status: 'running', open: true },
  { status: 'waiting', open: true },
  { status: 'paused', open: true },
  { status: 'failed', open: true }
]

test('the build is open while it runs, waits, pauses or failed; not with none on record or one done', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-build-open-'))
  for (const { status, open } of BUILD_STATES) {
    const label = `wpb${status ?? 'none'}`
    assert.equal(await siteBuildOpen(siteWithBuild(root, label, status), label), open, String(status))
  }
  assert.equal(await siteBuildOpen(path.join(root, 'no-such-site'), 'no-such-site'), false)
})

test('🔒 the site context and the turn notices name no deferred tool: the prefix never sends the model to a tool it cannot see', () => {
  for (const file of ['site-context.mjs', 'prompter.mjs', 'site-facts.mjs'])
    if (existsSync(path.join(here, '..', 'src', 'host', file)))
      assert.deepEqual(
        namedDeferredTools(readFileSync(path.join(here, '..', 'src', 'host', file), 'utf8')),
        [],
        `${file} names a deferred tool: name it where it is sent (an answer), or stop deferring it`
      )
})

test('the ledger lifts each tool once, and only the ones it holds', () => {
  const lifted = []
  const ledger = createToolDeferral({ warn: (line) => assert.fail(line) })
  const restrict = (filter) => () => lifted.push(...filter.deny)
  assert.deepEqual(ledger.defer('s1', restrict, ['tracy_brand', 'tracy_design_copy']), [
    'tracy_brand',
    'tracy_design_copy'
  ])
  assert.deepEqual(ledger.lift('s1', ['tracy_brand', 'tracy_site_build_joomla']), ['tracy_brand'])
  assert.deepEqual(ledger.lift('s1', ['tracy_brand']), [])
  assert.deepEqual(ledger.held('s1'), ['tracy_design_copy'])
  assert.deepEqual(lifted, ['tracy_brand'])
  ledger.forget('s1')
  assert.deepEqual(ledger.held('s1'), [])
  // A tool whose own text names another brings it along: never a lifted tool pointing at a hidden one.
  ledger.defer('s2', restrict, ['tracy_brand', 'tracy_design_library', 'tracy_design_propose'], {
    tracy_design_propose: ['tracy_brand', 'tracy_design_library']
  })
  assert.deepEqual(ledger.lift('s2', ['tracy_design_propose']).sort(), [
    'tracy_brand',
    'tracy_design_library',
    'tracy_design_propose'
  ])
  assert.deepEqual(ledger.held('s2'), [])
})

// ── dsh's own mechanism ───────────────────────────────────────────────────────────────────────────

// dsh's own registry and request projection, from the vendored build (`pnpm dsh:build`).
const SP_DIR = path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/system-prompt')
const fromSystemPrompt = createRequire(path.join(SP_DIR, 'package.json'))
const load = (/** @type {string} */ name) => import(pathToFileURL(fromSystemPrompt.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { createScope } = await load('@deepseek-ai/dsh-scope')
const SystemPrompt = (await import(pathToFileURL(path.join(SP_DIR, 'lib', 'index.js')).href)).default
const ToolRuntime = (
  await import(
    pathToFileURL(path.join(REPO, 'vendor/tracy/deepseek-harness/packages/core/tools/lib/index.js')).href
  )
).default
const { projectToolUpdates } = await import(
  pathToFileURL(path.join(REPO, 'vendor/tracy/deepseek-harness/packages/llm/llm/lib/index.js')).href
)

/** The tools a designer conversation is offered before any mask (r2 roster). */
const ROSTER = [
  'ask_user_question',
  'bash',
  'edit',
  'read',
  'skill',
  'tracy_brand',
  'tracy_design_copy',
  'tracy_design_library',
  'tracy_design_propose',
  'tracy_site_build_emdash',
  'tracy_site_build_joomla',
  'tracy_site_build_wordpress',
  'write'
]

/** A tool as dsh's registry takes it. */
const dshTool = (name) => ({
  name,
  description: `the ${name} tool`,
  parameters: { type: 'object', properties: {} },
  output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
  execute: async () => `ran:${name}`
})

test('🔒 on dsh’s own registry: the WordPress agent is made without the deferred tools, and the design skill puts them in its view', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-deferred-'))
  const folder = path.join(root, 'wpdefer1')
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(folder, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'wpdefer1.tracy.test', platform: 'wordpress' })
  )
  process.env.TRACY_SITES_ROOT = root
  delete process.env.MCP_TRACY_SITE_KEY
  try {
    const app = new Context()
    // ToolRuntime waits for the prompt registry, as in every dsh composition.
    await app.plugin(SystemPrompt, { personaPrefix: 'You are Tracy, working on a customer’s website.' })
    await app.plugin(ToolRuntime)
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
    for (const name of ROSTER) app.tools.register(dshTool(name))
    let scope
    const agent = { id: 'session-wpdefer1', session: { id: 'session-wpdefer1', header: { cwd: folder } } }
    await app.plugin(
      Object.assign(
        (inner) => {
          scope = createScope(inner, agent)
        },
        { inject: ['tools', 'systemPrompt'] }
      )
    )
    agent.ctx = scope.ctx
    for (const fn of listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
    const view = () => app.tools.schemas(agent).map((t) => t.name)
    const first = view()
    for (const name of [
      'tracy_brand',
      'tracy_design_copy',
      'tracy_design_library',
      'tracy_design_propose',
      'tracy_site_build_wordpress'
    ])
      assert.ok(!first.includes(name), `${name} is not sent on the first step`)
    assert.ok(first.includes('tracy_site') && first.includes('write'), 'the edit doors stay')

    // The skill loads at step N; its answer reaches the model at step N+1, assembled from this view.
    for (const fn of listeners.get('tools/result') ?? [])
      fn(
        { name: 'skill', arguments: { name: 'tracy-design-inspiration' }, agent },
        { isError: false, value: { name: 'tracy-design-inspiration' } }
      )
    const next = view()
    for (const name of ['tracy_brand', 'tracy_design_propose', 'tracy_site_build_wordpress'])
      assert.ok(next.includes(name), `${name} is sent from the next step`)
    assert.ok(!next.includes('tracy_site_build_joomla'), 'the platform mask stays')

    // What the DeepSeek route is sent (`toolUpdate: addition-only`): the first step's declarations,
    // byte for byte, then the added ones deferred, activated by the developer message dsh logged.
    const schema = (name) => app.tools.schemas(agent).find((t) => t.name === name)
    const initial = first.map((name) => schema(name) ?? { name })
    const additions = next.filter((name) => !first.includes(name)).map((name) => schema(name))
    const added = {
      id: 'dev-1',
      role: 'developer',
      source: { kind: 'tool-registry' },
      content: additions.map((tool) => ({ type: 'tool-addition', toolName: tool.name }))
    }
    const messages = [{ id: 'u-1', role: 'user', content: [{ type: 'text', text: 'redesign it' }] }, added]
    const projected = projectToolUpdates(messages, next.map(schema), 'addition-only', {
      tools: initial,
      updates: [{ messageId: 'dev-1', additions }]
    })
    const declared = projected.tools.map((tool) => tool.name)
    assert.deepEqual(
      declared.slice(0, initial.length),
      first,
      'the declarations the conversation started with lead, unchanged'
    )
    for (const tool of projected.tools.slice(0, initial.length)) assert.equal(tool.deferLoading, undefined)
    for (const tool of projected.tools.slice(initial.length)) assert.equal(tool.deferLoading, true, tool.name)
    assert.deepEqual(
      projected.messages.at(-1).content.map((block) => block.toolName),
      additions.map((tool) => tool.name),
      'each added tool is activated where it was added'
    )
  } finally {
    delete process.env.TRACY_SITES_ROOT
  }
})

test('🔒 on dsh’s own registry: a new conversation on a site whose build is open is sent its build tool from the first step', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-deferred-build-'))
  process.env.TRACY_SITES_ROOT = root
  delete process.env.MCP_TRACY_SITE_KEY
  try {
    for (const { status, open } of BUILD_STATES) {
      const label = `wpd${status ?? 'none'}`
      const folder = siteWithBuild(root, label, status)
      const app = new Context()
      await app.plugin(SystemPrompt, { personaPrefix: 'You are Tracy, working on a customer’s website.' })
      await app.plugin(ToolRuntime)
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
      for (const name of ROSTER) app.tools.register(dshTool(name))
      let scope
      const agent = { id: `session-${label}`, session: { id: `session-${label}`, header: { cwd: folder } } }
      await app.plugin(
        Object.assign(
          (inner) => {
            scope = createScope(inner, agent)
          },
          { inject: ['tools', 'systemPrompt'] }
        )
      )
      agent.ctx = scope.ctx
      for (const fn of listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
      const first = app.tools.schemas(agent).map((t) => t.name)
      assert.equal(first.includes('tracy_site_build_wordpress'), open, `build ${status}`)
      assert.ok(!first.includes('tracy_site_build_joomla'), 'the platform mask stays')
      assert.ok(!first.includes('tracy_design_propose'), 'the design road still waits')
    }
  } finally {
    delete process.env.TRACY_SITES_ROOT
  }
})
