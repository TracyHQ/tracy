import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamResponses } from '../lib/responses-stream.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

test('output_item.done synthesizes text when no deltas arrived', async () => {
  const body = sse([
    JSON.stringify({
      type: 'response.output_item.done',
      item: {
        id: 'msg_1',
        type: 'message',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    }),
    JSON.stringify({ type: 'response.completed', response: {} }),
  ])
  const chunks = []
  for await (const chunk of streamResponses(body)) chunks.push(chunk)
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hello'))
  assert.ok(chunks.some((c) => c.type === 'finish'))
})

test('reasoning and output_text deltas stay separate', async () => {
  const body = sse([
    JSON.stringify({ type: 'response.reasoning_text.delta', item_id: 'msg_1', delta: 'think' }),
    JSON.stringify({ type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'hello' }),
    JSON.stringify({ type: 'response.completed', response: {} }),
  ])
  const chunks = []
  for await (const chunk of streamResponses(body)) chunks.push(chunk)
  assert.ok(chunks.some((c) => c.type === 'reasoning-delta' && c.text === 'think'))
  assert.ok(chunks.some((c) => c.type === 'text-delta' && c.text === 'hello'))
})
