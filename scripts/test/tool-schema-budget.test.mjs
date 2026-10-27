// The schemas of Tracy's tools that no step of a customer's conversation needs most of the time: how long
// each may be, and what each must still say.
//
// WHY (bench flow D, 05/10/2026: 55 runs of the site agent on WordPress, Joomla and EmDash, 445 steps).
// dsh sends every tool's schema on every step, and the tools array is ~57% of a step-1 prompt. Across the
// 55 runs the model never called `tracy_brand`, the three design tools, `tracy_find_definition`, or a
// `tracy_site_build_*` tool for a build (only EmDash's `request site.rebuild`, 5 times): 15k characters
// re-read 445 times. Nothing is removed — each tool keeps its parameters and its refusals — but its text
// says what the model needs to CHOOSE it and call it right; how a redesign uses it is the
// `tracy-design-inspiration` skill's, loaded when a redesign is asked for.
//
// The numbers are the packages' own registrations, rendered from `lib/index.js` as dsh receives them.

import assert from 'node:assert/strict'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Where each package's tools are registered. */
const PACKAGES = [
  'packages/design/tracy-brand-engine/lib/index.js',
  'packages/design/tracy-design-inspiration/lib/index.js',
  'packages/site/tracy-site-build-wordpress/lib/index.js',
  'packages/site/tracy-site-build-joomla/lib/index.js',
  'packages/site/tracy-site-build-emdash/lib/index.js'
]

/** Every tool the packages register, by name, as `{ description, parameters }`. */
async function registered() {
  /** @type {Map<string, { name: string, description: string, parameters: unknown }>} */
  const tools = new Map()
  const noop = () => () => {}
  const ctx = new Proxy(
    {
      on: noop,
      get: () => undefined,
      logger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
      webServer: { register: noop },
      tools: {
        register: (/** @type {any} */ tool) => {
          tools.set(tool.name, tool)
          return () => {}
        },
        schemas: () => []
      },
      effect: (/** @type {() => unknown} */ fn) => {
        fn()
        return () => {}
      }
    },
    {
      get: (target, prop) =>
        prop in target
          ? /** @type {any} */ (target)[prop]
          : prop === 'then'
            ? undefined
            : new Proxy(() => {}, { get: (_t, p) => (p === 'then' ? undefined : noop), apply: () => noop })
    }
  )
  const was = process.env.DSH_HOME
  process.env.DSH_HOME = ''
  try {
    for (const file of PACKAGES) {
      const mod = await import(pathToFileURL(join(ROOT, file)).href)
      await (mod.apply ?? mod.default?.apply ?? mod.default)(ctx, {})
    }
  } finally {
    if (was === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = was
  }
  return tools
}

const tools = await registered()
const size = (/** @type {string} */ name) => JSON.stringify(tools.get(name)).length

/** The size a tool's whole schema (name, description, parameters) may reach, in characters. */
const BUDGET = {
  tracy_brand: 1600,
  tracy_design_library: 520,
  tracy_design_copy: 1500,
  tracy_design_propose: 950,
  tracy_site_build_wordpress: 4400,
  tracy_site_build_joomla: 5200,
  tracy_site_build_emdash: 5700
}

test('every tool this change shortens is registered, and fits its budget', () => {
  for (const [name, budget] of Object.entries(BUDGET)) {
    assert.ok(tools.has(name), `${name} is registered`)
    assert.ok(size(name) <= budget, `${name}: ${size(name)} > ${budget}`)
  }
})

test('the three design tools and tracy_brand send the model to the skill that owns the workflow', () => {
  for (const name of ['tracy_brand', 'tracy_design_library', 'tracy_design_copy', 'tracy_design_propose'])
    assert.match(tools.get(name)?.description ?? '', /tracy-design-inspiration/, name)
})

test('tracy_brand keeps its three actions, its parameters and every refusal it can answer', () => {
  const tool = /** @type {any} */ (tools.get('tracy_brand'))
  assert.deepEqual(tool.parameters.properties.action.enum, ['read', 'extract', 'list'])
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [
    'action',
    'kind',
    'pages',
    'refresh',
    'url'
  ])
  assert.deepEqual(tool.parameters.required, ['action'])
  for (const part of [
    'NOT_EXTRACTED',
    'BAD_URL',
    'NO_MATERIAL',
    'reused',
    'refresh',
    '30 days',
    'brand:<host>'
  ])
    assert.ok(tool.description.includes(part), `tracy_brand still says ${part}`)
})

test('tracy_design_copy keeps form and write, every parameter, and the preview-only rule', () => {
  const tool = /** @type {any} */ (tools.get('tracy_design_copy'))
  assert.deepEqual(tool.parameters.properties.action.enum, ['form', 'write'])
  assert.deepEqual(Object.keys(tool.parameters.properties).sort(), [
    'action',
    'brief',
    'chip',
    'id',
    'lang',
    'slots',
    'title'
  ])
  assert.deepEqual(tool.parameters.required, ['action', 'id'])
  assert.match(tool.description, /PREVIEW/)
  assert.match(tool.description, /never a change to the live site/)
  assert.match(tool.description, /refused by name/)
})

test('tracy_design_library and tracy_design_propose keep their parameters and rules', () => {
  const library = /** @type {any} */ (tools.get('tracy_design_library'))
  assert.deepEqual(Object.keys(library.parameters.properties), ['id'])
  assert.match(library.description, /design systems are off/)
  const propose = /** @type {any} */ (tools.get('tracy_design_propose'))
  assert.deepEqual(propose.parameters.required, ['picks'])
  assert.deepEqual(Object.keys(propose.parameters.properties.picks.items.properties), ['id', 'why'])
  assert.match(propose.description, /never describe or paste/)
  assert.match(propose.description, /brand:<host>/)
})

test('each build tool keeps its three turns, its review rules and its not-for line', () => {
  for (const [name, platform] of [
    ['tracy_site_build_wordpress', 'WordPress'],
    ['tracy_site_build_joomla', 'Joomla'],
    ['tracy_site_build_emdash', 'EmDash']
  ]) {
    const tool = /** @type {any} */ (tools.get(name))
    const text = tool.description
    assert.match(text, new RegExp(`Build "<name>" \\(<id>\\) with ${platform} on this site\\.`), name)
    for (const action of ['ask', 'start', 'revise', 'rerun', 'status', 'review'])
      assert.ok(text.includes(`\`${action}\``), `${name} names ${action}`)
    assert.match(text, /Not for the words, menus or pictures of a site already built/, name)
    // The review's rules: evidence for a verdict, nothing invented, the owner's decisions only.
    assert.match(text, /evidence/, name)
    assert.match(text, /never invented/, name)
    assert.match(text, /decisions only the owner can make/, name)
    // `ask` first, and no questions in the chat: the Build message's whole contract.
    assert.match(text, /FIRST/, name)
    assert.match(text, /never its questions in the chat/, name)
    assert.deepEqual(
      tool.parameters.properties.action.enum.slice(0, 6),
      ['ask', 'start', 'status', 'rerun', 'revise', 'review'],
      name
    )
  }
  // EmDash's and Joomla's `request` still lists its operations in the schema, where a model picks one.
  for (const name of ['tracy_site_build_joomla', 'tracy_site_build_emdash']) {
    const input = /** @type {any} */ (tools.get(name)).parameters.properties.input.description
    assert.match(input, /content\.revise/, name)
  }
  assert.match(
    /** @type {any} */ (tools.get('tracy_site_build_emdash')).parameters.properties.input.description,
    /site\.rebuild/
  )
  assert.match(
    /** @type {any} */ (tools.get('tracy_site_build_joomla')).parameters.properties.input.description,
    /language\.add/
  )
})
