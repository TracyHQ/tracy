/**
 * The waits before a step run side by side (harness profile 09/10/2026, candidate 1): the design pull
 * (≤ 2.5 s, which the site facts are built from) and the "site changed" read (≤ 3 s) depend on nothing
 * of each other, so a step that carries the customer's words starts both before awaiting either, and
 * waits for the slower one — not their sum, as it did until 09/10.
 *
 *   node --test packages/tools/tracy-site-tools/test/pre-step-overlap.test.mjs
 *
 * Proved without a stopwatch: each door answers only once it has SEEN the other one asked, or after
 * `PATIENCE` ms. Run one after another, the first can never see the second, and says so.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { SITE_CHANGED_PLUGIN } from '../src/host/prompter.mjs'

const { apply } = await import('../lib/index.js')

const PATIENCE = 800
const LOOKED = Date.parse('2026-10-09T07:40:00Z')

function folder() {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-overlap-'))
  const dir = path.join(root, 'shop1')
  mkdirSync(path.join(dir, '.tracy'), { recursive: true })
  writeFileSync(
    path.join(dir, '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'shop1.tracy.test', platform: 'wordpress' })
  )
  return { root, dir }
}

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

test('🔒 the design pull and the "site changed" read are asked together, so the step waits for the slower only', async () => {
  const { root, dir } = folder()
  process.env.TRACY_SITES_ROOT = root
  const log = [
    {
      type: 'user/message',
      time: LOOKED - 1_000,
      data: {
        source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
        content: [{ type: 'text', text: 'change the heading' }]
      }
    },
    {
      type: 'tool/call',
      time: LOOKED,
      data: { name: 'tracy_site', arguments: { action: 'content.read', params: {} }, callId: 'c1' }
    }
  ]
  /** @type {Record<'design' | 'changed', { asked: boolean, sawOther: boolean | null }>} */
  const seen = { design: { asked: false, sawOther: null }, changed: { asked: false, sawOther: null } }
  /** Wait until the other door has been asked, or PATIENCE ms; note which. */
  const meet = async (self, other) => {
    seen[self].asked = true
    const until = Date.now() + PATIENCE
    while (!seen[other].asked && Date.now() < until) await new Promise((r) => setTimeout(r, 5))
    seen[self].sawOther = seen[other].asked
  }
  const savedFetch = globalThis.fetch
  // The design record is read with the global fetch (`design-sync.mjs` `fetchDesign`).
  globalThis.fetch = async (url) => {
    if (!String(url).endsWith('/api/sites/shop1.tracy.test/design')) return new Response('', { status: 404 })
    await meet('design', 'changed')
    return new Response(JSON.stringify({ design: null }), { status: 200 })
  }
  try {
    const listeners = new Map()
    apply(
      {
        webServer: { register: () => () => {} },
        tools: { register: () => () => {} },
        effect: (setup) => {
          setup()
        },
        on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
        get: (name) =>
          name === 'sessions'
            ? { get: () => ({ snapshotEvents: () => log }) }
            : name === 'tracyAssertion'
              ? { mint: (email) => `signed:${email}` }
              : undefined
      },
      {
        origin: 'http://door.test',
        now: () => new Date('2026-10-09T08:00:00Z'),
        fetch: async (url) => {
          if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
          await meet('changed', 'design')
          return new Response(
            JSON.stringify({ changedAt: '2026-10-09T07:50:00Z', byThisConversation: false }),
            {
              status: 200
            }
          )
        }
      }
    )
    const [hook] = listeners.get('agent/pre-step') ?? []
    const claimed = [
      { id: 'm', role: 'user', content: [{ type: 'text', text: 'and the title' }], source: { kind: 'user' } }
    ]
    const agent = {
      id: 'session-o',
      session: {
        id: 'session-o',
        header: { cwd: dir },
        seq: log.length,
        eventAt: (seq) => log[seq],
        surface: { nodes: log.map((_, seq) => seq) }
      }
    }
    const started = Date.now()
    const decision = await hook({ agent, messages: claimed }, async () => ({
      kind: 'enter',
      messages: [...claimed]
    }))
    const took = Date.now() - started
    assert.deepEqual(
      seen,
      { design: { asked: true, sawOther: true }, changed: { asked: true, sawOther: true } },
      'each read was asked while the other one was still out'
    )
    assert.ok(took < PATIENCE, `${took} ms: no read waited out its patience`)
    // What they found is still said, in its place: the facts before the words, the notice after.
    const producers = decision.messages.map((m) => m.source.producer ?? m.source.kind)
    assert.ok(
      producers.indexOf('tracy-site-tools:site-context') < producers.indexOf('user'),
      producers.join(', ')
    )
    assert.ok(producers.indexOf(SITE_CHANGED_PLUGIN) > producers.indexOf('user'), producers.join(', '))
  } finally {
    globalThis.fetch = savedFetch
  }
})
