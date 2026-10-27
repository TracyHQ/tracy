/** Exercise the registered host waterfall, including the non-site onboarding return. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { apply } from '../lib/index.js'

const context = {
  schema: 'widget-imported-context/v1',
  source: 'widget-discovery',
  history: [{ role: 'user', text: 'Please keep my bakery brief.' }],
  brief: {
    name: 'Adopted Bakery',
    about: 'Fresh bread',
    goal: 'sell',
    style: 'modern',
    platform: 'wordpress'
  },
  selection: { template: 'real-template', designSystem: null, visibleTemplates: [], visibleSystems: [] }
}

test('native onboarding pre-step actually admits imported context and build facts before the model, once', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tracy-native-step-'))
  const home = path.join(root, 'onboarding'),
    cwd = path.join(home, 'verified-owner')
  mkdirSync(cwd, { recursive: true })
  const previous = { sites: process.env.TRACY_SITES_ROOT, home: process.env.ONBOARDING_HOME }
  process.env.TRACY_SITES_ROOT = path.join(root, 'sites')
  process.env.ONBOARDING_HOME = home
  const id = 'session-widget-00000000-0000-4000-8000-000000000001'
  const prompt = {
    id: 'prompt',
    role: 'user',
    source: { kind: 'user', prompter: { user: 'Owner', email: 'owner@example.test' } },
    content: [{ type: 'text', text: 'What business name did I choose?' }]
  }
  const events = [{ type: 'user/message', data: prompt }]
  const listeners = new Map(),
    calls = []
  let unavailable = false
  try {
    apply(
      {
        webServer: { register: () => () => {} },
        tools: { register: () => () => {} },
        effect: (setup) => setup(),
        on: (name, callback) => listeners.set(name, [...(listeners.get(name) || []), callback]),
        get: (name) =>
          name === 'sessions'
            ? { get: () => ({ snapshotEvents: () => events }) }
            : name === 'tracyAssertion'
              ? { mint: () => 'signed-test-owner' }
              : undefined
      },
      {
        origin: 'https://door.example.test',
        fetch: async (url, init) => {
          if (!new URL(url).pathname.endsWith('/api/widget-native/context'))
            return new Response('', { status: 404 })
          calls.push({
            session: new URL(url).searchParams.get('session'),
            actor: init.headers['x-tracy-actor']
          })
          if (unavailable) return new Response('', { status: 503 })
          return Response.json({
            context,
            contextHash: createHash('sha256').update(JSON.stringify(context)).digest('hex'),
            currentBuild: { state: 'missing', links: null }
          })
        }
      }
    )
    const [hook] = listeners.get('agent/pre-step')
    const agent = {
      id,
      session: {
        id,
        header: { cwd },
        seq: events.length,
        eventAt: (seq) => events[seq],
        surface: { nodes: [0] }
      }
    }
    const run = () => hook({ agent, messages: [prompt] }, async () => ({ kind: 'enter', messages: [prompt] }))
    const first = await run()
    const imported = first.messages.filter(
      (message) => message.source?.producer === 'tracy-site-tools:widget-context'
    )
    assert.equal(imported.length, 1, 'the non-site return must not discard the imported record')
    assert.match(imported[0].content[0].text, /Adopted Bakery/)
    assert.equal(
      first.messages.filter((message) => message.source?.producer === 'tracy-site-tools:widget-build').length,
      1
    )
    assert.ok(first.messages.includes(prompt))
    assert.deepEqual(calls[0], { session: id, actor: 'signed-test-owner' })
    events.push({ type: 'user/message', data: imported[0] })
    agent.session.surface.nodes = [0, 1]
    const retry = await run()
    assert.equal(
      retry.messages.filter((message) => message.source?.producer === 'tracy-site-tools:widget-context')
        .length,
      0
    )
    agent.session.surface.nodes = [0]
    const compacted = await run()
    assert.equal(
      compacted.messages.filter((message) => message.source?.producer === 'tracy-site-tools:widget-context')
        .length,
      1,
      'persisted but compacted notices must be visible to the model again'
    )
    unavailable = true
    await assert.rejects(run(), { message: 'WIDGET_NATIVE_CONTEXT_UNAVAILABLE' })
    unavailable = false
    agent.session.header.cwd = path.join(root, 'sites', 'another-site')
    const before = calls.length
    await assert.rejects(run(), { message: 'WIDGET_NATIVE_CONTEXT_UNAVAILABLE' })
    assert.equal(calls.length, before, 'a site workspace cannot import onboarding context')
    agent.session.id = 'session-ordinary'
    agent.session.header.cwd = cwd
    const unchanged = {
      kind: 'enter',
      messages: [
        prompt,
        {
          id: 'runtime',
          role: 'user',
          source: { kind: 'runtime-context' },
          content: [{ type: 'text', text: 'Existing runtime context' }]
        }
      ]
    }
    assert.equal(
      await hook({ agent, messages: [prompt] }, async () => unchanged),
      unchanged,
      'ordinary onboarding keeps the existing native decision unchanged'
    )
  } finally {
    for (const [name, value] of [
      ['TRACY_SITES_ROOT', previous.sites],
      ['ONBOARDING_HOME', previous.home]
    ]) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
})
