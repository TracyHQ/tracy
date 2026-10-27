import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as kimi from '../lib/vendors/kimi.js'

test('kimi providerInfo and defaults', () => {
  assert.equal(kimi.id, 'kimi')
  assert.equal(kimi.providerInfo().name, 'Moonshot Kimi')
  const defs = kimi.defaults()
  assert.ok(defs.models.includes('kimi-for-coding'))
})

test('kimi listModels returns coding models with contextWindow', async () => {
  const models = await kimi.listModels()
  assert.ok(models.length >= 2)
  const coding = models.find((m) => m.id === 'kimi-for-coding')
  assert.equal(coding.contextWindow, 262144)
})

test('kimi streamOnce streams chat chunks', async () => {
  let capturedBody = null
  const fetchImpl = async (url, init) => {
    capturedBody = JSON.parse(init.body)
    return {
      ok: true,
      body: (async function* () {
        yield Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: 'hello' } }] }) + '\n\n')
        yield Buffer.from('data: [DONE]\n\n')
      })(),
    }
  }

  const chunks = []
  for await (const c of kimi.streamOnce({
    blob: { accessToken: 'tok-123' },
    options: { model: 'kimi-for-coding', messages: [{ role: 'user', content: 'test' }], reasoningEffort: 'high' },
    fetchImpl,
    headers: {},
    config: {},
  })) {
    chunks.push(c)
  }
  assert.equal(capturedBody.thinking.effort, 'high')
  const textChunk = chunks.find((c) => c.type === 'text-delta')
  assert.equal(textChunk.text, 'hello')
})
