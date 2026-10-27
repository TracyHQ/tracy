/**
 * The built plugin's `agent/pre-step` hook on the host's one dsh, when the person undid earlier
 * requests of the conversation from the chat (06/10/2026): the turn door's answer names them
 * (`undone`), and the step then carries ONE agent-only notice right after the person's message.
 *
 *   node --test packages/site/tracy-site-tabs/test/turn-undone-hook.test.mjs
 *
 * Driven through `lib/index.js` (what the image ships) with `fetch` swapped for the turn door.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const GATEWAY_ENV = ['MCP_TRACY_SITE_KEY', 'MCP_TRACY_ORIGIN', 'DSH_PASSWORDS_ENV_FILE', 'TRACY_SITES_ROOT']

const person = {
  id: 'm-1',
  role: 'user',
  content: [{ type: 'text', text: 'Change the heading again' }],
  source: { kind: 'user', prompter: { user: 'Ada', email: 'ada@example.com' } }
}
const context = {
  id: 'c-1',
  role: 'user',
  content: [{ type: 'text', text: 'AGENTS.md' }],
  source: { kind: 'tracy-site', producer: 'x', form: 'notice', summary: 'x' }
}

/**
 * The built plugin on a host dsh standing in a `lantern` site folder, with `fetch` answering every
 * door call through `door(url)`. Runs one step of turn 4 claiming `messages`, and answers what the
 * pre-step waterfall returned.
 */
async function stepWith(instance, door, messages) {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-undone-'))
  mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
  writeFileSync(
    path.join(root, 'lantern', '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'lantern.tracy.ai', platform: 'wordpress' })
  )
  const savedFetch = globalThis.fetch
  const savedEnv = Object.fromEntries(GATEWAY_ENV.map((name) => [name, process.env[name]]))
  const savedWarn = console.warn
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    return door(String(url))
  }
  for (const name of GATEWAY_ENV) delete process.env[name]
  Object.assign(process.env, {
    MCP_TRACY_SITE_KEY: '',
    MCP_TRACY_ORIGIN: 'https://cowork.tracy.ai',
    TRACY_SITES_ROOT: root
  })
  console.warn = () => {}
  try {
    const mod = await import(new URL(`../lib/index.js?${instance}`, import.meta.url).href)
    const handlers = {}
    const agent = {
      ctx: {
        on: (event, handler) => {
          handlers[event] = handler
          return () => {}
        }
      },
      session: { id: 'session-u1', header: { cwd: path.join(root, 'lantern') }, snapshotEvents: () => [] }
    }
    mod.apply({
      webServer: { register: () => () => {} },
      agents: { roots: () => [agent] },
      on: () => () => {},
      effect: (setup) => {
        setup()
      },
      get: (name) => (name === 'tracyAssertion' ? { mint: (email) => `signed:${email}` } : undefined)
    })
    const decision = await handlers['agent/pre-step']({ turn: 4, step: 1, messages }, async () => ({
      kind: 'enter',
      messages
    }))
    return { decision, urls }
  } finally {
    globalThis.fetch = savedFetch
    console.warn = savedWarn
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
}

const answer = (body) => new Response(JSON.stringify(body), { status: 200 })

test('the turn door names an undone request: one notice right after the person’s message', async () => {
  const { decision, urls } = await stepWith(
    'undone',
    () => answer({ ok: true, undone: [{ turn: 3, title: 'Make the heading say Welcome', complete: true }] }),
    [context, person]
  )
  // The list is read early from the read-only `turn/undone` door (#1403,
  // `REG-PR-1403-undone-read-early`): the step answers from it, and may be in before the open is
  // even sent. The notice is still one.
  assert.ok(urls.includes('https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn/undone'), String(urls))
  assert.ok(
    urls.every((u) => /\/api\/sites\/lantern\.tracy\.ai\/turn(\/undone)?$/.test(u)),
    String(urls)
  )
  assert.equal(decision.kind, 'enter')
  assert.equal(decision.messages.length, 3)
  assert.equal(decision.messages[0], context)
  assert.equal(decision.messages[1], person)
  const notice = decision.messages[2]
  assert.equal(notice.role, 'user')
  assert.equal(typeof notice.id, 'string')
  assert.deepEqual(notice.source, {
    kind: 'tracy-site',
    producer: 'tracy-site-tabs:turn-undone',
    form: 'notice',
    summary: 'Earlier request undone'
  })
  assert.match(
    notice.content[0].text,
    /^Since your last reply, the person undid 1 of your earlier requests from the chat: request 3 "Make the heading say Welcome" \(fully undone\)\. /
  )
})

test('nothing undone: the step goes in exactly as it came', async () => {
  const messages = [context, person]
  const { decision } = await stepWith('none', () => answer({ ok: true, undone: [] }), messages)
  assert.equal(decision.messages, messages)
})

test('the turn door fails (refused, unreachable): no notice, and the step is never refused', async () => {
  const messages = [person]
  const refused = await stepWith('refused', () => new Response('{}', { status: 502 }), messages)
  assert.equal(refused.decision.kind, 'enter')
  assert.equal(refused.decision.messages, messages)
  const down = await stepWith(
    'down',
    () => {
      throw new Error('ECONNREFUSED')
    },
    messages
  )
  assert.equal(down.decision.kind, 'enter')
  assert.equal(down.decision.messages, messages)
  const garbled = await stepWith('garbled', () => new Response('not json', { status: 200 }), messages)
  assert.equal(garbled.decision.messages, messages)
})
