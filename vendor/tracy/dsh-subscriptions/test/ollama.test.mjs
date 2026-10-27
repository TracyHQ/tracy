import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OllamaAdapter, ollamaAlive, ollamaModels } from '../lib/ollama.js'
import { SubscriptionAdapter } from '../lib/adapter.js'

function sseResponse(chunks) {
  const text = chunks.map((c) => 'data: ' + JSON.stringify(c) + '\n\n').join('') + 'data: [DONE]\n\n'
  return { ok: true, status: 200, body: text, text: async () => text }
}

test('ollamaAlive: true on ok tags, false on error/throw', async () => {
  assert.equal(await ollamaAlive('http://x', async () => ({ ok: true })), true)
  assert.equal(await ollamaAlive('http://x', async () => ({ ok: false })), false)
  assert.equal(await ollamaAlive('http://x', async () => { throw new Error('down') }), false)
})

test('ollamaModels: maps /api/tags names', async () => {
  const models = await ollamaModels('http://x', async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen2.5-coder:7b', details: { parameter_size: '7B' } }, { name: 'llama3.1' }] }) }))
  assert.deepEqual(models, [
    { id: 'qwen2.5-coder:7b', name: 'qwen2.5-coder:7b', description: '7B' },
    { id: 'llama3.1', name: 'llama3.1' },
  ])
})

test('OllamaAdapter.stream: openai-compatible SSE becomes deltas', async () => {
  const adapter = new OllamaAdapter({
    baseUrl: () => 'http://x',
    fallbackModel: () => 'qwen2.5-coder',
    fetchImpl: async (url, opts) => {
      assert.ok(url.endsWith('/v1/chat/completions'))
      const body = JSON.parse(opts.body)
      assert.equal(body.model, 'qwen2.5-coder')
      assert.ok(Array.isArray(body.messages))
      return sseResponse([
        { choices: [{ delta: { content: 'Hello' } }] },
        { choices: [{ delta: { content: ' world' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ])
    },
  })
  const out = []
  for await (const ev of adapter.stream({ provider: 'ollama', model: 'qwen2.5-coder', messages: [{ role: 'user', content: 'hi' }] })) out.push(ev)
  const text = out.filter((e) => e.type === 'text-delta').map((e) => e.text).join('')
  assert.equal(text, 'Hello world')
  assert.ok(out.some((e) => e.type === 'finish'))
})

test('SubscriptionAdapter: exhausted pool falls back to ollama with no prior output', async () => {
  let fallbackCalled = null
  async function* fakeFallback({ provider, err }) {
    fallbackCalled = { provider, code: err && err.code }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'local answer' }
  }
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1', cooldownUntil: Date.now() + 600000 }],
    refreshUsage: async () => {},
    cooldownMs: () => 60000,
    switchAtRemaining: () => 0,
    ollamaFallback: fakeFallback,
  })
  const out = []
  for await (const ev of adapter.stream({ provider: 'codex', model: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })) out.push(ev)
  assert.ok(fallbackCalled, 'fallback used')
  assert.equal(fallbackCalled.provider, 'codex')
  assert.ok(out.some((e) => e.type === 'text-delta' && e.text === 'local answer'))
})

test('SubscriptionAdapter: fallback not used when disabled', async () => {
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1', cooldownUntil: Date.now() + 600000 }],
    refreshUsage: async () => {},
    cooldownMs: () => 60000,
    switchAtRemaining: () => 0,
    ollamaFallback: undefined,
  })
  await assert.rejects(async () => {
    for await (const ev of adapter.stream({ provider: 'codex', model: 'gpt-5.1-codex', messages: [{ role: 'user', content: 'hi' }] })) void ev
  })
})
