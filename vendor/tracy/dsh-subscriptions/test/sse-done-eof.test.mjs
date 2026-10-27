import { ReadableStream } from 'node:stream/web'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iterateSse } from '../lib/sse.js'
import { openaiChatStream } from '../lib/wire.js'
import { streamResponses } from '../lib/responses-stream.js'

test('iterateSse: data: [DONE] terminates immediately on open stream without timeout (#450)', async () => {
  // A ReadableStream that emits [DONE] but never closes or resolves done
  let pushChunk
  const stream = new ReadableStream({
    start(controller) {
      pushChunk = (data) => controller.enqueue(new TextEncoder().encode(data))
    }
  })

  // Enqueue initial chunk and DONE
  pushChunk('data: {"text":"hello"}\n\ndata: [DONE]\n\n')

  const collected = []
  const start = Date.now()

  // With a small idleTimeoutMs of 50ms, if it stayed waiting for more chunks, it would fail
  for await (const chunk of iterateSse(stream, { idleTimeoutMs: 50 })) {
    collected.push(chunk)
  }

  const duration = Date.now() - start
  assert.ok(duration < 40, `took ${duration}ms, should complete immediately on DONE`)
  assert.equal(collected.length, 2)
  assert.equal(collected[0], '{"text":"hello"}')
  assert.equal(collected[1], '[DONE]')
})

test('iterateSse: ignores events emitted after [DONE] (#450)', async () => {
  const text = 'data: 1\n\ndata: [DONE]\n\ndata: 2\n\n'
  const chunks = []
  for await (const c of iterateSse(text)) chunks.push(c)
  assert.deepEqual(chunks, ['1', '[DONE]'])
})

test('openaiChatStream: abrupt EOF with partial content without terminal marker emits error (#450)', async () => {
  // Partial content without finish_reason and without [DONE]
  const text = 'data: {"choices":[{"delta":{"content":"Unfinished partial content"}}]}\n\n'
  const chunks = []
  for await (const c of openaiChatStream(text)) chunks.push(c)

  const finish = chunks.find(c => c.type === 'finish')
  assert.ok(finish, 'finish chunk exists')
  assert.equal(finish.reason.kind, 'error')
  assert.equal(finish.reason.failure.code, 'INCOMPLETE')
})

test('openaiChatStream: terminal marker [DONE] cleanly finishes with stop (#450)', async () => {
  const text = 'data: {"choices":[{"delta":{"content":"Finished content"}}]}\n\ndata: [DONE]\n\n'
  const chunks = []
  for await (const c of openaiChatStream(text)) chunks.push(c)

  const finish = chunks.find(c => c.type === 'finish')
  assert.ok(finish)
  assert.equal(finish.reason.kind, 'stop')
})

test('streamResponses: abrupt EOF before response.completed emits INCOMPLETE error (#450)', async () => {
  const text = 'data: {"type":"response.output_item.added","item":{"id":"item_1"}}\n\n'
  const chunks = []
  for await (const c of streamResponses(text)) chunks.push(c)

  const finish = chunks.find(c => c.type === 'finish')
  assert.ok(finish)
  assert.equal(finish.reason.kind, 'error')
  assert.equal(finish.reason.failure.code, 'INCOMPLETE')
})

test('iterateSse: cancellation via AbortSignal throws AbortError rather than silent stop (#450)', async () => {
  const controller = new AbortController()
  controller.abort()

  const asyncIterable = (async function* () {
    yield 'data: 1\n\n'
  })()

  await assert.rejects(
    async () => {
      for await (const _ of iterateSse(asyncIterable, { signal: controller.signal })) {}
    },
    (err) => err.name === 'AbortError'
  )
})
