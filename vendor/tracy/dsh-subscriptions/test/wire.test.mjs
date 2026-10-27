import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpError } from '../lib/wire.js'

test('vendor 401 stays VENDOR so the UI does not say API key is invalid', () => {
  const err = httpError(401, '{"error":{"message":"UNAUTHENTICATED"}}')
  assert.equal(err.code, 'VENDOR')
  assert.match(err.message, /401/)
})

test('429 is RATE_LIMIT', () => {
  const err = httpError(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')
  assert.equal(err.code, 'RATE_LIMIT')
})

import { googleStream, anthropicStream } from '../lib/wire.js'

test('googleStream emits tool-call-delta with string id and distinct indexes (#390 / GH #8)', async () => {
  const sseData = [
    'data: ' + JSON.stringify({
      response: {
        candidates: [{
          content: {
            parts: [
              { text: 'calling tools' },
              { functionCall: { name: 'get_weather', args: { city: 'Paris' } } },
              { functionCall: { name: 'get_time', args: { tz: 'UTC' } } },
            ],
          },
        }],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25,
        },
      },
    }) + '\n\n',
  ].join('')

  const chunks = []
  for await (const chunk of googleStream(sseData)) {
    chunks.push(chunk)
  }

  const toolStarts = chunks.filter((c) => c.type === 'block-start' && c.blockType === 'tool-call')
  const toolDeltas = chunks.filter((c) => c.type === 'tool-call-delta')
  const usageChunk = chunks.find((c) => c.type === 'usage')

  assert.equal(toolStarts.length, 2)
  assert.equal(toolDeltas.length, 2)

  // Indexes must be distinct
  assert.notEqual(toolStarts[0].index, toolStarts[1].index)
  assert.equal(toolStarts[0].index, toolDeltas[0].index)
  assert.equal(toolStarts[1].index, toolDeltas[1].index)

  // id must be non-empty string on both deltas
  assert.equal(typeof toolDeltas[0].id, 'string')
  assert.ok(toolDeltas[0].id.length > 0)
  assert.equal(typeof toolDeltas[1].id, 'string')
  assert.ok(toolDeltas[1].id.length > 0)
  assert.notEqual(toolDeltas[0].id, toolDeltas[1].id)

  // usage must be lossless numbers
  assert.ok(usageChunk)
  assert.equal(usageChunk.usage.input, 15)
  assert.equal(usageChunk.usage.output, 25)
})

test('anthropicStream preserves tool_use id across input_json_delta (#390 / GH #8)', async () => {
  const sseData = [
    'data: ' + JSON.stringify({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_123', name: 'search' },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"q":' },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '"test"}' },
    }) + '\n\n',
    'data: ' + JSON.stringify({
      type: 'message_delta',
      usage: { output_tokens: 10 },
    }) + '\n\n',
  ].join('')

  const chunks = []
  for await (const chunk of anthropicStream(sseData)) {
    chunks.push(chunk)
  }

  const toolDeltas = chunks.filter((c) => c.type === 'tool-call-delta')
  assert.equal(toolDeltas.length, 3)
  for (const delta of toolDeltas) {
    assert.equal(delta.id, 'toolu_123')
    assert.equal(delta.index, 1)
  }

  const usageChunk = chunks.find((c) => c.type === 'usage')
  assert.ok(usageChunk)
  assert.equal(usageChunk.usage.input, 0)
  assert.equal(usageChunk.usage.output, 10)
})
