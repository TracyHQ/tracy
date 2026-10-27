/**
 * A Good or Bad on Tracy's answer, sent to the turn it answered (#1403 item 13, `src/host/rating.mjs`). The thumbs
 * under an answer lived only in the conversation's log, so answers could not be measured beside their turns.
 *
 *   node --test packages/site/tracy-site-tabs/test/rating.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { ratedTurn, ratingOf } from '../src/host/rating.mjs'

const put = (item) => ({ type: 'feedback/message-put', data: { sessionId: 'session-r1', item } })
const item = (over = {}) => ({
  messageId: 'm-2',
  rating: 'negative',
  categories: ['task-result'],
  version: '00000000-0000-4000-8000-000000000001',
  createdAt: 1,
  updatedAt: 1,
  note: 'The heading is still English',
  ...over
})

test('ratingOf: the rating and its categories, never the note; a delete takes it back; anything else is none', () => {
  assert.deepEqual(ratingOf(put(item())), {
    messageId: 'm-2',
    rating: 'negative',
    categories: ['task-result']
  })
  assert.deepEqual(ratingOf(put(item({ categories: undefined, category: 'other' }))).categories, ['other'])
  assert.deepEqual(ratingOf({ type: 'feedback/message-delete', data: { messageId: 'm-2' } }), {
    messageId: 'm-2',
    rating: null,
    categories: []
  })
  assert.equal(ratingOf(put(item({ rating: 'meh' }))), null)
  assert.equal(ratingOf({ type: 'assistant/message', data: {} }), null)
  assert.equal(ratingOf(null), null)
})

const typed = (email, id) => ({
  type: 'user/message',
  data: { id, source: { kind: 'user', prompter: { user: 'u', email } } }
})
const answered = (turn, id) => ({ type: 'assistant/message', data: { turn, step: 1, message: { id } } })

test('ratedTurn: the turn whose answer was rated, and who typed the request before it', () => {
  const events = [
    typed('ada@example.com', 'u-1'),
    answered(1, 'm-1'),
    typed('bo@example.com', 'u-2'),
    answered(2, 'm-2')
  ]
  assert.deepEqual(ratedTurn(events, 'm-2'), { turn: 2, email: 'bo@example.com' })
  assert.deepEqual(ratedTurn(events, 'm-1'), { turn: 1, email: 'ada@example.com' })
  assert.equal(ratedTurn(events, 'm-9'), null, 'no such answer')
  assert.equal(ratedTurn([answered(1, 'm-1')], 'm-1'), null, 'nobody with an address typed')
})

const GATEWAY_ENV = ['MCP_TRACY_SITE_KEY', 'MCP_TRACY_ORIGIN', 'DSH_PASSWORDS_ENV_FILE', 'TRACY_SITES_ROOT']

test('the built plugin sends a rating of an open conversation, and of one dsh had not loaded, to the turn it answered', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'site-tabs-rating-'))
  mkdirSync(path.join(root, 'lantern', '.tracy'), { recursive: true })
  writeFileSync(
    path.join(root, 'lantern', '.tracy', 'site.json'),
    JSON.stringify({ siteKey: 'lantern.tracy.ai', platform: 'joomla' })
  )
  const saved = {
    fetch: globalThis.fetch,
    env: Object.fromEntries(GATEWAY_ENV.map((n) => [n, process.env[n]]))
  }
  const sent = []
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
    return new Response('{"ok":true}')
  }
  for (const name of GATEWAY_ENV) delete process.env[name]
  Object.assign(process.env, {
    MCP_TRACY_SITE_KEY: '',
    MCP_TRACY_ORIGIN: 'https://cowork.tracy.ai',
    TRACY_SITES_ROOT: root
  })
  try {
    const mod = await import(new URL('../lib/index.js?rating', import.meta.url).href)
    const handlers = {}
    mod.apply({
      webServer: { register: () => () => {} },
      agents: { roots: () => [] },
      on: (event, handler) => {
        handlers[event] = handler
        return () => {}
      },
      effect: (setup) => {
        setup()
      },
      get: (name) => (name === 'tracyAssertion' ? { mint: (email) => `signed:${email}` } : undefined)
    })
    const cwd = path.join(root, 'lantern')
    const events = [typed('bo@example.com', 'u-2'), answered(2, 'm-2')]
    const rating = put(item())
    handlers['session/event'](
      { id: 'session-r1', header: { cwd }, snapshotEvents: () => [...events, rating] },
      rating
    )
    handlers['session/event'](
      { id: 'session-r1', header: { cwd }, snapshotEvents: () => events },
      answered(3, 'm-3')
    )
    handlers['feedback/committed']({
      meta: { id: 'session-r2', cwd },
      events: [...events, { type: 'feedback/message-delete', data: { messageId: 'm-2' } }]
    })
    for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 5))
    assert.equal(sent.length, 2, 'one per rating event, nothing for any other event')
    // The two conversations' sends are independent, so they may land in either order.
    assert.deepEqual(
      sent
        .map((s) => [s.url, s.headers['x-tracy-actor'], s.body])
        .sort((a, b) => a[2].turnId.localeCompare(b[2].turnId)),
      [
        [
          'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn/rating',
          'signed:bo@example.com',
          { turnId: 'session-r1:2', rating: 'negative', categories: ['task-result'] }
        ],
        [
          'https://cowork.tracy.ai/api/sites/lantern.tracy.ai/turn/rating',
          'signed:bo@example.com',
          { turnId: 'session-r2:2', rating: null, categories: [] }
        ]
      ]
    )
    assert.ok(!JSON.stringify(sent).includes('still English'), 'the note never leaves the conversation')
  } finally {
    globalThis.fetch = saved.fetch
    for (const [name, value] of Object.entries(saved.env)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(root, { recursive: true, force: true })
  }
})
