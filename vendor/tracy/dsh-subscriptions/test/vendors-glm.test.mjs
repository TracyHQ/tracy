import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as glm from '../lib/vendors/glm.js'

test('glm providerInfo and defaults', () => {
  assert.equal(glm.id, 'glm')
  assert.equal(glm.providerInfo().name, 'Zhipu GLM')
  const defs = glm.defaults()
  assert.ok(defs.models.includes('glm-4-plus'))
})

test('glm streamOnce sends User-Agent and coding boost', async () => {
  let capturedHeaders = null
  const fetchImpl = async (url, init) => {
    capturedHeaders = init.headers
    return {
      ok: true,
      body: (async function* () {
        yield Buffer.from('data: ' + JSON.stringify({ choices: [{ delta: { content: 'glm response' } }] }) + '\n\n')
        yield Buffer.from('data: [DONE]\n\n')
      })(),
    }
  }

  const chunks = []
  for await (const c of glm.streamOnce({
    blob: { accessToken: 'glm-key-123' },
    options: { model: 'glm-4-plus', messages: [{ role: 'user', content: 'test' }] },
    fetchImpl,
    headers: {},
    config: {},
  })) {
    chunks.push(c)
  }
  assert.equal(capturedHeaders['X-Coding-Plan-Boost'], '1.5')
  const textChunk = chunks.find((c) => c.type === 'text-delta')
  assert.equal(textChunk.text, 'glm response')
})
