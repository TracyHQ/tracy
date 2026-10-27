import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getVendor } from '../lib/vendors/index.js'

// #288 follow-up: five OpenAI-compatible vendors had no streamOnce
// coverage. These tests pin the auth contract, the request shape and
// the stream translation with injected fetch, fully offline.

function sse(lines) {
  return lines.map((l) => 'data: ' + l + chr() + chr()).join('') + 'data: [DONE]' + chr() + chr()
}
function chr() { return String.fromCharCode(10) }

const CASES = [
  { id: 'cody', scheme: 'token ', tokenField: 'accessToken', altField: 'token', url: 'https://sourcegraph.com/.api/chat/completions', authError: /Cody not authenticated/ },
  { id: 'replit', scheme: 'Bearer ', tokenField: 'accessToken', altField: 'token', url: 'https://replit.com/api/v1/ai/chat/completions', authError: /Replit Core not authenticated/ },
  { id: 'perplexity', scheme: 'Bearer ', tokenField: 'accessToken', altField: 'apiKey', url: 'https://api.perplexity.ai/chat/completions', authError: /Perplexity API key or session token required/ },
  { id: 'jetbrains', scheme: 'Bearer ', tokenField: 'accessToken', altField: 'token', url: 'https://api.jetbrains.ai/v1/chat/completions', authError: /JetBrains AI Assistant not authenticated/ },
  { id: 'spark', scheme: 'Bearer ', tokenField: 'accessToken', altField: 'apiKey', url: 'https://spark-api-open.xf-yun.com/v1/chat/completions', authError: /iFlytek Spark requires API key/ },
]

for (const c of CASES) {
  test(c.id + ': streamOnce posts an OpenAI-compatible body with Bearer auth', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) })
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })]), {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const blob = { [c.tokenField]: 'tok-test' }
    const chunks = []
    for await (const chunk of getVendor(c.id).streamOnce({
      blob,
      options: { model: 'model-x', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] },
      fetchImpl,
      headers: {},
      config: {},
    })) chunks.push(chunk)

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, c.url)
    assert.equal(calls[0].headers.Authorization, c.scheme + 'tok-test')
    assert.equal(calls[0].body.model, 'model-x')
    assert.equal(calls[0].body.stream, true)
    assert.ok(Array.isArray(calls[0].body.messages) && calls[0].body.messages.length > 0)
    assert.ok(chunks.some((x) => x.type === 'text-delta' && x.text === 'hi'))
  })

  test(c.id + ': accepts the alternate credential field', async () => {
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), headers: init.headers })
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })]), {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const blob = { [c.altField]: 'alt-key' }
    for await (const _ of getVendor(c.id).streamOnce({
      blob, options: { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
      fetchImpl, headers: {}, config: {},
    })) { /* consume */ }
    assert.equal(calls[0].headers.Authorization, c.scheme + 'alt-key')
  })

  test(c.id + ': rejects without credentials before any fetch', async () => {
    await assert.rejects(async () => {
      for await (const _ of getVendor(c.id).streamOnce({
        blob: {},
        options: { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
        fetchImpl: async () => { throw new Error('must not fetch') },
        headers: {}, config: {},
      })) { /* consume */ }
    }, c.authError)
  })

  test(c.id + ': honors a config apiBase override', async () => {
    const calls = []
    const fetchImpl = async (url, _init) => {
      calls.push({ url: String(url) })
      return new Response(sse([JSON.stringify({ choices: [{ delta: { content: 'z' } }] })]), {
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
      })
    }
    const blob = { [c.tokenField]: 'k' }
    for await (const _ of getVendor(c.id).streamOnce({
      blob, options: { model: 'm', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] },
      fetchImpl, headers: {}, config: { apiBase: 'https://proxy.invalid/base' },
    })) { /* consume */ }
    assert.ok(calls[0].url.startsWith('https://proxy.invalid/base/'), c.id + ' must use config.apiBase')
  })
}
