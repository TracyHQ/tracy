/**
 * The `agent/created` listener of the SHIPPED bundle (`lib/index.js`): which tools one site's agent is
 * sent, what `tracy_site` says there, and which system sections go blank — decided once, when the
 * agent is made (PLAN v2.1 IX1 step 6; F5 §4.2).
 *
 * 🔒 WHY THROUGH THE BUNDLE. `surface.mjs` pins the texts and lists; this pins the WIRING: that the
 * listener reads the site with the same readers as the context and the fence, registers the scoped
 * copy only where the agent can see `tracy_site`, keeps the same `execute`, and never throws into agent
 * creation. A listener that fitted the wrong site, or handed a hidden tool back, would leave every
 * `surface.test.mjs` green.
 *
 *   node --test packages/tools/tracy-site-tools/test/surface-listener.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'
import {
  platformHiddenTools,
  siteToolDescription,
  siteToolParameters,
  SURFACE_ACTIONS
} from '../src/host/surface.mjs'
import { DEFERRED_NAMES, namedDeferredTools } from '../src/host/deferred-tools.mjs'

// The 27 tools a designer conversation was sent on EVERY site in the ja-business suite (r2, 24/09/2026).
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

/** The design road's tools, in the order the listener defers them (`DEFERRED_TOOLS`). */
const DESIGN_TOOLS = ['tracy_brand', 'tracy_design_library', 'tracy_design_copy', 'tracy_design_propose']

/** dsh's section placements the listener asks for (`getSectionOrder`). */
const ORDERS = { HARNESS_SOURCE: 10000, WEB_SURFACE: 10100 }

/**
 * The plugin, applied to a HostContext that records every listener and global registration, and whose
 * `tools.schemas(agent)` answers `names` (what the agent can see after its preset and masks).
 */
function boot({ names = DESIGNER } = {}) {
  const global = new Map()
  const listeners = new Map()
  const warnings = []
  const ctx = {
    webServer: { register: () => () => {} },
    tools: {
      register: (t) => (global.set(t.name, t), () => {}),
      // As dsh answers it: each tool's own description, so a deferred tool another one names stays.
      schemas: () => names.map((name) => ({ name, description: global.get(name)?.description }))
    },
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) => (name === 'logger' ? { warn: (line) => warnings.push(line) } : undefined)
  }
  apply(ctx, { emdash: { cms: async () => assert.fail('agent creation must not ask docker') } })
  return { global, listeners, warnings }
}

/** An agent standing in `cwd`, whose own scope records what the listener did to it. */
function agentAt(
  cwd,
  { restrictThrows = false, registerThrows = false, sessionId = 'session-a', sent } = {}
) {
  /** Every name a restriction denied when the agent was made, in order. */
  const denied = []
  /** The names still denied: a lifted restriction's disposer takes its names out. */
  const held = new Set()
  const scoped = new Map()
  const sections = []
  const agent = {
    session: {
      id: sessionId,
      header: { cwd },
      ...(sent === undefined ? {} : { requestHeader: () => ({ tools: sent.map((name) => ({ name })) }) })
    },
    ctx: {
      tools: {
        restrict: (filter) => {
          if (restrictThrows) throw new Error('restrict failed')
          denied.push(...filter.deny)
          for (const name of filter.deny) held.add(name)
          return () => {
            for (const name of filter.deny) held.delete(name)
          }
        },
        register: (tool) => {
          if (registerThrows) throw new Error('register failed')
          scoped.set(tool.name, tool)
          return () => {}
        }
      },
      systemPrompt: {
        section: (section) => {
          sections.push(section)
          return () => {}
        },
        getSectionOrder: (name) => ORDERS[name]
      }
    }
  }
  return { agent, denied, held, scoped, sections }
}

/** A sites root with one site, as Add site and provision leave it. */
function site({ label = 'site1', platform = null, sealed = false, artifact = false, marker = 'file' } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-surface-'))
  const folder = path.join(root, label)
  mkdirSync(folder, { recursive: true })
  if (platform !== null) {
    mkdirSync(path.join(folder, '.tracy'), { recursive: true })
    writeFileSync(
      path.join(folder, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `${label}.tracy.test`, platform })
    )
  }
  if (artifact) {
    mkdirSync(path.join(folder, 'template'), { recursive: true })
    writeFileSync(path.join(folder, 'template', 'artifact.json'), JSON.stringify({ cms: { name: 'emdash' } }))
  }
  if (sealed) {
    if (marker === 'enotdir')
      // `.content-contracts` a regular FILE: the fence's stat fails ENOTDIR, it cannot tell (and throws).
      writeFileSync(path.join(root, '.content-contracts'), 'not a directory')
    else {
      mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
      writeFileSync(
        path.join(root, '.content-contracts', `${label}.json`),
        marker === 'bound'
          ? // What `provision/platform/wordpress.sh` writes for a release that pins a Claude Cowork plugin (#337).
            JSON.stringify({
              contract: 'tracy-business/wp7/1.2.0',
              platform: 'wordpress',
              coworkContractVersion: '0.13.2'
            })
          : marker === 'garbled'
            ? '{not json'
            : '{}'
      )
    }
  }
  process.env.TRACY_SITES_ROOT = root
  return { root, cwd: folder }
}

/** Run the plugin's `agent/created` listener(s) for `agent`. */
async function created(listeners, agent) {
  for (const fn of listeners.get('agent/created') ?? []) await fn({ agent, source: 'startup' })
}

test.beforeEach(() => {
  delete process.env.MCP_TRACY_SITE_KEY
  delete process.env.DSH_PASSWORDS_ENV_FILE
})
test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('sealed Joomla: the other platforms’ tools are hidden and tracy_site says the sealed Joomla door, with the SAME execute', async () => {
  const { cwd } = site({ platform: 'joomla', sealed: true })
  const { global, listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  // The design road's tools wait for it; the Joomla build tool stays, since this tracy_site names it
  // (`tracy_site_build_joomla request language.add`).
  assert.deepEqual(one.denied, [
    'tracy_emdash',
    'tracy_find_definition',
    'tracy_site_build_emdash',
    'tracy_site_build_wordpress',
    ...DESIGN_TOOLS
  ])
  const scoped = one.scoped.get('tracy_site')
  assert.equal(scoped.description, siteToolDescription('joomla-sealed'))
  assert.deepEqual(scoped.parameters, siteToolParameters('joomla-sealed'))
  assert.deepEqual(scoped.parameters.properties.action.enum, [...SURFACE_ACTIONS['joomla-sealed']])
  // One door: a scoped copy that routed differently would be a second one.
  assert.equal(scoped.execute, global.get('tracy_site').execute)
  assert.equal(scoped.isConcurrencySafe, global.get('tracy_site').isConcurrencySafe)
})

test('sealed WordPress: no contract in the description, and the Joomla build tool hidden', async () => {
  const { cwd } = site({ platform: 'wordpress', sealed: true })
  const { listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.ok(one.denied.includes('tracy_site_build_joomla'))
  assert.equal(one.scoped.get('tracy_site').description, siteToolDescription('wordpress-sealed'))
  assert.doesNotMatch(one.scoped.get('tracy_site').description, /content\.contract/)
})

/**
 * 🔒 A WORDPRESS SITE PROVISION BOUND (#337) IS FITTED WITH THE CONTRACT ROAD, READ OFF THE MARKER BY THE
 * SAME FUNCTION THE CONTEXT READS (`contractDoorOf`); a marker that cannot be read leaves the full
 * description, because each WordPress surface refuses the other's write before the relay.
 */
test('bound WordPress: tracy_site says the WordPress contract door; a marker that cannot say keeps the full description', async () => {
  const { cwd } = site({ platform: 'wordpress', sealed: true, marker: 'bound' })
  const { global, listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.ok(one.denied.includes('tracy_site_build_joomla'))
  const scoped = one.scoped.get('tracy_site')
  assert.equal(scoped.description, siteToolDescription('wordpress-contract'))
  assert.deepEqual(scoped.parameters.properties.action.enum, [...SURFACE_ACTIONS['wordpress-contract']])
  assert.match(scoped.description, /content\.contract/)
  // Tracy ADR 0022: the open WordPress writes too.
  assert.match(scoped.description, /content\.update/)
  assert.match(scoped.description, /media\.draw \{prompt, slot\}/)
  assert.equal(scoped.execute, global.get('tracy_site').execute)

  const garbled = site({ label: 'site2', platform: 'wordpress', sealed: true, marker: 'garbled' })
  const two = agentAt(garbled.cwd)
  const again = boot()
  await created(again.listeners, two.agent)
  assert.ok(two.denied.includes('tracy_site_build_joomla'), 'the platform mask still applies')
  assert.equal(two.scoped.size, 0, 'no surface fitted to a guess')
})

test('EmDash, by its record or by its handoff file alone: the PHP-only tools hidden, tracy_emdash kept', async () => {
  for (const flavour of [{ platform: 'emdash' }, { artifact: true }]) {
    const { cwd } = site(flavour)
    const { listeners } = boot()
    const one = agentAt(cwd)
    await created(listeners, one.agent)
    assert.deepEqual(
      one.denied,
      [
        'tracy_find_definition',
        'tracy_site_build_joomla',
        'tracy_site_build_wordpress',
        'tracy_site_profile',
        ...DESIGN_TOOLS
      ],
      JSON.stringify(flavour)
    )
    assert.ok(!one.denied.includes('tracy_emdash'))
    assert.equal(one.scoped.get('tracy_site').description, siteToolDescription('emdash'))
  }
})

// ADR 0022 (26/09/2026): every EmDash site, a quickstart one included, gets the one global
// tracy_emdash and the EmDash tracy_site description — no copy fitted to say it is locked.
test('an EmDash quickstart keeps the global tracy_emdash and the open EmDash description', async () => {
  const { cwd } = site({ artifact: true })
  const { listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.equal(one.scoped.has('tracy_emdash'), false)
  assert.equal(one.scoped.get('tracy_site').description, siteToolDescription('emdash'))
  assert.match(one.scoped.get('tracy_site').description, /menus, settings/)
})

test('a site no file names keeps every tool and the full description; a cwd outside the sites root is left alone', async () => {
  const { cwd } = site()
  const { listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.deepEqual(one.denied, [])
  assert.equal(one.scoped.size, 0)
  const outside = agentAt('/desk-home/onboarding/x')
  await created(listeners, outside.agent)
  assert.deepEqual(outside.denied, [])
  assert.equal(outside.scoped.size, 0)
  // Not a customer's site agent: dsh's own sections stay.
  assert.deepEqual(outside.sections, [])
})

test('🔒 a seal the fence cannot read (ENOTDIR): the platform mask still applies, the description stays the full one', async () => {
  const { cwd } = site({ platform: 'joomla', sealed: true, marker: 'enotdir' })
  const { listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  // No surface fitted, so no description names the Joomla build tool: it waits with the design tools.
  assert.deepEqual(one.denied, [
    'tracy_emdash',
    'tracy_find_definition',
    'tracy_site_build_emdash',
    'tracy_site_build_wordpress',
    ...DESIGN_TOOLS,
    'tracy_site_build_joomla'
  ])
  assert.equal(one.scoped.size, 0)
})

test('🔒 an agent that could not see tracy_site still cannot: no scoped copy hands it back', async () => {
  const { cwd } = site({ platform: 'wordpress', sealed: true })
  const { listeners } = boot({ names: DESIGNER.filter((name) => name !== 'tracy_site') })
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.equal(one.scoped.has('tracy_site'), false)
})

test('a failing restrict does not stop the scoped description, and a failing register never escapes', async () => {
  const { cwd } = site({ platform: 'joomla', sealed: true })
  const { listeners, warnings } = boot()
  const one = agentAt(cwd, { restrictThrows: true })
  await created(listeners, one.agent)
  assert.equal(one.scoped.get('tracy_site').description, siteToolDescription('joomla-sealed'))
  const two = agentAt(cwd, { registerThrows: true })
  await created(listeners, two.agent) // must not throw into agent creation
  assert.ok(warnings.some((line) => /could not hide/.test(line)))
  assert.ok(warnings.some((line) => /could not fit tracy_site/.test(line)))
})

test('🔒 L1: a site agent’s harness:source and app:web-surface go blank for that agent, at their own placements', async () => {
  const { cwd } = site({ platform: 'wordpress', sealed: true })
  const { listeners } = boot()
  const one = agentAt(cwd)
  await created(listeners, one.agent)
  assert.deepEqual(one.sections, [
    { name: 'harness:source', order: ORDERS.HARNESS_SOURCE, text: '' },
    { name: 'app:web-surface', order: ORDERS.WEB_SURFACE, text: '' }
  ])
})

/** Fire one of the plugin's emit listeners, as dsh does. */
function fire(listeners, event, ...args) {
  for (const fn of listeners.get(event) ?? []) fn(...args)
}

/** A message as it reaches the agent's inbox. */
/** The deferred tools still held back from one WordPress agent (its platform mask stays, by design). */
const waitingOf = (one) =>
  [...one.held]
    .filter(
      (name) => DEFERRED_NAMES.includes(name) && !platformHiddenTools(DESIGNER, 'wordpress').includes(name)
    )
    .sort()

const inboxMessage = (text) => ({
  id: `m-${text}`,
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' }
})

/**
 * 🔒 THE EDIT PRESETS DO NOT REGAIN AN UNUSED TOOL (harness-opt candidate 4, 09/10/2026): on every
 * surface a site can have, the agent is made without the redesign/build road's tools — 0 calls in 341
 * bench turns of editing — except one a tool it can see names (the sealed Joomla `tracy_site` says
 * `tracy_site_build_joomla request language.add`). A new surface, a new tool text naming one, or a
 * listener change that hands them back fails here.
 */
test('🔒 every known surface is made without the deferred tools, except one a visible description names', async () => {
  const cases = [
    { platform: 'wordpress' },
    { platform: 'wordpress', sealed: true },
    { platform: 'wordpress', sealed: true, marker: 'bound' },
    { platform: 'joomla' },
    { platform: 'joomla', sealed: true },
    { platform: 'emdash' }
  ]
  for (const flavour of cases) {
    const { cwd } = site(flavour)
    const { listeners } = boot()
    const one = agentAt(cwd)
    await created(listeners, one.agent)
    const visible = DESIGNER.filter((name) => !one.held.has(name))
    const told = new Set(namedDeferredTools(one.scoped.get('tracy_site')?.description ?? ''))
    const sent = visible.filter((name) => DEFERRED_NAMES.includes(name))
    assert.deepEqual(
      sent.filter((name) => !told.has(name)),
      [],
      `${JSON.stringify(flavour)} is sent ${sent.join(', ')}`
    )
    // The doors an edit uses stay: tracy_site, the file tools, the skill loader.
    for (const name of ['tracy_site', 'read', 'write', 'edit', 'skill'])
      assert.ok(visible.includes(name), `${JSON.stringify(flavour)} keeps ${name}`)
  }
})

test('🔒 a deferred tool is there by the next step: the design skill loaded, an answer naming it, the tabs’ own words', async () => {
  const { cwd } = site({ platform: 'wordpress' })
  const { listeners } = boot()
  const waiting = [...DESIGN_TOOLS, 'tracy_site_build_wordpress']

  // The design skill loaded: every deferred tool comes back.
  const skill = agentAt(cwd, { sessionId: 'session-skill' })
  await created(listeners, skill.agent)
  assert.deepEqual(waitingOf(skill), [...waiting].sort())
  fire(
    listeners,
    'tools/result',
    { name: 'read', arguments: { path: 'x' }, agent: skill.agent },
    { isError: false, value: 'text' }
  )
  assert.equal(waitingOf(skill).length, waiting.length, 'an ordinary answer gives nothing back')
  fire(
    listeners,
    'tools/result',
    { name: 'skill', arguments: { name: 'tracy-design-inspiration' }, agent: skill.agent },
    { isError: false, value: { name: 'tracy-design-inspiration' } }
  )
  assert.deepEqual(waitingOf(skill), [])

  // An answer that names one (a refusal's next): that one alone.
  const named = agentAt(cwd, { sessionId: 'session-named' })
  await created(listeners, named.agent)
  fire(
    listeners,
    'tools/result',
    { name: 'tracy_site', arguments: {}, agent: named.agent },
    {
      isError: true,
      content: [{ type: 'text', text: 'to add one, tracy_site_build_wordpress request language.add' }]
    }
  )
  assert.deepEqual(waitingOf(named), [...DESIGN_TOOLS].sort())

  // The Design inspiration tab's Build button, in the customer's language: every one, before the step.
  const button = agentAt(cwd, { sessionId: 'session-button' })
  await created(listeners, button.agent)
  fire(listeners, 'agent/inbox/inserted', {
    agent: button.agent,
    message: inboxMessage('đổi số điện thoại thành 0901 234 567')
  })
  assert.equal(waitingOf(button).length, waiting.length, 'an edit asks for none of them')
  fire(listeners, 'agent/inbox/inserted', {
    agent: button.agent,
    message: inboxMessage('Dựng "Apple" (apple) bằng WordPress trên site này.')
  })
  assert.deepEqual(waitingOf(button), [])

  // The agent leaves: its ledger goes with it.
  fire(listeners, 'agent/disposed', { agent: button.agent })
})

test('🔒 a resumed conversation keeps every tool it was already sent: no removal of a tool in its history', async () => {
  const { cwd } = site({ platform: 'wordpress' })
  const { listeners } = boot()
  const one = agentAt(cwd, {
    sessionId: 'session-resumed',
    sent: DESIGNER.filter((n) => n !== 'tracy_brand')
  })
  await created(listeners, one.agent)
  assert.deepEqual(waitingOf(one), ['tracy_brand'])
})
