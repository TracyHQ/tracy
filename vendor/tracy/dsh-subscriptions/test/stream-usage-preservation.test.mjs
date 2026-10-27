import { test } from 'node:test'
import assert from 'node:assert/strict'
import { anthropicStream, googleStream, toTokenUsage } from '../lib/wire.js'

test('anthropicStream: preserves message_start input/cache usage across stream (#449)', async () => {
  const sseData = [
    'data: ' + JSON.stringify({
      type: 'message_start',
      message: {
        id: 'msg_1',
        usage: {
          input_tokens: 100,
          cache_read_input_tokens: 50,
        },
      },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: {
        output_tokens: 5,
      },
    }) + '\n\n',
  ].join('')

  const chunks = []
  for await (const chunk of anthropicStream(sseData)) {
    chunks.push(chunk)
  }

  const usageChunk = chunks.find((c) => c.type === 'usage')
  assert.ok(usageChunk, 'usage chunk must be emitted')
  const norm = toTokenUsage(usageChunk.usage)
  assert.ok(norm)
  assert.equal(norm.outputTokens, 5)
  assert.equal(norm.cacheReadTokens, 50)
  assert.equal(norm.inputTokens, 100)
})

test('googleStream: preserves prompt, cached, and candidates tokens (#449)', async () => {
  const sseData = [
    'data: ' + JSON.stringify({
      response: {
        candidates: [{
          content: { parts: [{ text: 'Response from gemini' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: {
          promptTokenCount: 100,
          cachedContentTokenCount: 60,
          candidatesTokenCount: 2,
        },
      },
    }) + '\n\n',
  ].join('')

  const chunks = []
  for await (const chunk of googleStream(sseData)) {
    chunks.push(chunk)
  }

  const usageChunk = chunks.find((c) => c.type === 'usage')
  assert.ok(usageChunk, 'usage chunk must be emitted')
  const norm = toTokenUsage(usageChunk.usage)
  assert.ok(norm)
  // In Gemini, 100 prompt - 60 cached = 40 uncached input
  assert.equal(norm.inputTokens, 40)
  assert.equal(norm.cacheReadTokens, 60)
  assert.equal(norm.outputTokens, 2)
})
