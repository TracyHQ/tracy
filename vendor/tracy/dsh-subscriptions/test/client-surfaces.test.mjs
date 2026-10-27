import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Loads lib/client.js the way the dsh web client does (through window.__ModuleLoader__)
// and records which slots and composer commands it registers for a given /ui answer.
const SRC = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  Component: class {},
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useMemo: (f) => f(),
  useCallback: (f) => f,
}

async function boot(uiAnswer) {
  let definition
  const requested = []
  const fetch = async (url) => {
    requested.push(String(url))
    if (String(url).startsWith('/dsh-subscriptions/ui')) {
      if (uiAnswer instanceof Error) throw uiAnswer
      if (uiAnswer === 404) return { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ ok: true, ui: uiAnswer }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  }
  const sandbox = {
    window: { __ModuleLoader__: { load: (d) => { definition = d } } },
    fetch, console, setTimeout, clearTimeout, setInterval, clearInterval, Promise,
  }
  vm.runInNewContext(SRC, sandbox)
  const mod = definition.factory((name) => (name === 'react' ? React : {}))
  const slots = []
  const commands = []
  const disposers = []
  const ctx = {
    locale: { register: () => () => {}, bind: () => (k) => k },
    effect: (fn) => { const off = fn(); if (typeof off === 'function') disposers.push(off) },
    inject: () => {},
    get: (name) => (name === 'inputTriggers'
      ? { registerSource: (src) => { commands.push(src.name); return () => {} } }
      : null),
    slots: {
      inject: (_name, fn) => fn(),
      register: (opts, component) => { slots.push({ ...opts, component }); return () => {} },
    },
  }
  mod.apply(ctx)
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  return { slots, commands, requested, names: slots.map((s) => s.name) }
}

const PLUGINS_SEATS = ['plugins.item', 'plugins.bundle.config', 'plugins.row.config']

test('by default the client registers exactly the upstream surfaces', async () => {
  const { names, commands } = await boot({ cardPlacement: 'plugins', headerPill: true, slashCommands: true })
  for (const seat of PLUGINS_SEATS) assert.ok(names.includes(seat), seat)
  assert.ok(!names.includes('settings.section'))
  assert.ok(names.includes('conversation.session.header.actions'))
  assert.ok(names.includes('conversation.input.right'))
  assert.deepEqual(commands, ['login', 'logout'])
})

test('a host without the /ui door (older plugin host) gets the upstream surfaces', async () => {
  for (const answer of [404, new Error('offline')]) {
    const { names, commands } = await boot(answer)
    for (const seat of PLUGINS_SEATS) assert.ok(names.includes(seat), seat)
    assert.ok(names.includes('conversation.session.header.actions'))
    assert.deepEqual(commands, ['login', 'logout'])
  }
})

test("cardPlacement 'settings' registers the card as its own Settings entry and leaves the Plugins page alone", async () => {
  const { slots, names } = await boot({ cardPlacement: 'settings', headerPill: true, slashCommands: true })
  for (const seat of PLUGINS_SEATS) assert.ok(!names.includes(seat), seat)
  const entry = slots.find((s) => s.name === 'settings.section')
  assert.ok(entry, 'settings.section registered')
  assert.equal(entry.id, 'dsh-subscriptions')
  assert.equal(entry.locale, 'dsh-subscriptions')
  assert.equal(entry.label(), 'title')
  // dsh orders Account at -10 and General at 0: the entry sits right below Account.
  assert.ok(entry.order > -10 && entry.order < 0, 'order ' + entry.order)
})

test("cardPlacement 'both' registers the Plugins seats and the Settings entry", async () => {
  const { names } = await boot({ cardPlacement: 'both', headerPill: true, slashCommands: true })
  for (const seat of PLUGINS_SEATS) assert.ok(names.includes(seat), seat)
  assert.ok(names.includes('settings.section'))
})

test("cardPlacement 'none' registers the card nowhere: no Settings entry, no Plugins seats", async () => {
  const { names } = await boot({ cardPlacement: 'none', headerPill: false, slashCommands: false })
  for (const seat of PLUGINS_SEATS) assert.ok(!names.includes(seat), seat)
  assert.ok(!names.includes('settings.section'))
  assert.ok(!names.includes('conversation.session.header.actions'))
})

test('the Settings entry renders the card in page view inside a settings-styled root', async () => {
  const { slots } = await boot({ cardPlacement: 'settings', headerPill: true, slashCommands: true })
  const entry = slots.find((s) => s.name === 'settings.section')
  const tree = entry.component({ t: (k) => k, close: () => {} })
  assert.equal(tree.props.className, 'dsub-settings')
  const card = tree.children[0]
  assert.equal(card.props.view, 'page')
})

test('headerPill false drops the chat-header pill and keeps the composer quota seat', async () => {
  const { names } = await boot({ cardPlacement: 'plugins', headerPill: false, slashCommands: true })
  assert.ok(!names.includes('conversation.session.header.actions'))
  assert.ok(names.includes('conversation.input.right'))
})

test('slashCommands false registers no composer commands', async () => {
  const { commands } = await boot({ cardPlacement: 'plugins', headerPill: true, slashCommands: false })
  assert.deepEqual(commands, [])
})

// The CSS string the client injects, split into rules.
const CSS_RULES = (() => {
  const start = SRC.indexOf('const CSS =')
  const end = SRC.indexOf('const cssId')
  const literals = SRC.slice(start, end).match(/'[^']*'/g) || []
  return literals.map((l) => l.slice(1, -1)).join('').split('}').map((r) => r.trim()).filter(Boolean).map((r) => r + '}')
})()

test('inside the Settings dialog, focus is a 1px border-colour change: no thick outline, no glow ring', () => {
  const scoped = CSS_RULES.filter((r) => r.startsWith('.dsub-settings') && /:focus/.test(r))
  assert.ok(scoped.length > 0, 'scoped focus rules exist')
  for (const rule of scoped) {
    assert.doesNotMatch(rule, /outline:\s*[2-9]px/, rule)
    assert.doesNotMatch(rule, /box-shadow:\s*0 0 0 [1-9]/, rule)
  }
  // Every focusable element (bordered or not) gets one 1px line in the accent colour,
  // inset onto the border; mouse focus on text fields shows it too.
  const ring = scoped.find((r) => /outline:1px solid var\(--dsw-alias-brand-primary\)/.test(r))
  assert.ok(ring, '1px accent outline rule')
  assert.match(ring, /^\.dsub-settings :focus-visible,/)
  assert.match(ring, /outline-offset:-1px/)
})

test('the Settings-dialog look uses only dsh tokens, never raw colours', () => {
  const scoped = CSS_RULES.filter((r) => r.startsWith('.dsub-settings'))
  assert.ok(scoped.length > 0)
  for (const rule of scoped) assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i, rule)
})
