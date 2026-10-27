import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tokenUsageOf } from '../src/host/token-usage.mjs'
import { createTurnBook } from '../src/host/turn-record.mjs'
const event = (seq, type, data) => ({ seq, type, data: { turn: 1, step: 1, ...data } })
const usage = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 30,
  cacheWriteTokens: 20,
  reasoningTokens: 3
}

test('usage counts disjoint cache once, reasoning stays within output, other turns and duplicate settlements are excluded', () => {
  const message = event(2, 'assistant/message', { usage, stream: [{ chunk: { type: 'usage', usage } }] })
  const got = tokenUsageOf(
    [event(1, 'step/start'), message, message, event(3, 'assistant/message', { turn: 2, usage })],
    1
  )
  assert.deepEqual(got, {
    version: 1,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 30,
    cacheWriteTokens: 20,
    totalTokens: 65,
    measured: 1,
    missing: 0,
    lastSeq: 2
  })
})
test('failed attempts use the last cumulative usage report; retries are distinct settlements; unknown attempts remain partial', () => {
  const got = tokenUsageOf(
    [
      event(1, 'step/start'),
      event(2, 'assistant/attempt', {
        stream: [
          { chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 0 } } },
          { chunk: { type: 'usage', usage } }
        ]
      }),
      event(3, 'assistant/message', { usage: { inputTokens: 2, outputTokens: 3 } }),
      event(4, 'assistant/attempt', { stream: [] }),
      event(5, 'step/start', { step: 2 })
    ],
    1
  )
  assert.equal(got.totalTokens, 70)
  assert.equal(got.measured, 2)
  assert.equal(got.missing, 2)
  assert.equal(got.lastSeq, 5)
})
test('missing, malformed and zero reports stay distinct; authoritative total wins', () => {
  assert.equal(tokenUsageOf([], 1), null)
  for (const bad of [
    undefined,
    { inputTokens: -1, outputTokens: 1 },
    { inputTokens: 1.5, outputTokens: 0 },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: NaN }
  ])
    assert.equal(tokenUsageOf([event(1, 'assistant/message', { usage: bad })], 1), null)
  assert.equal(
    tokenUsageOf([event(1, 'assistant/message', { usage: { inputTokens: 0, outputTokens: 0 } })], 1)
      .totalTokens,
    0
  )
  assert.equal(
    tokenUsageOf([event(1, 'assistant/message', { usage: { ...usage, totalTokens: 80 } })], 1).totalTokens,
    80
  )
})
test('normal close and aborted idle send usage snapshots on the existing moment path', async () => {
  for (const aborted of [false, true]) {
    const sent = []
    const book = createTurnBook({
      send: async (door, body) => {
        sent.push({ door, body })
        return { ok: true, status: 200 }
      },
      warn: () => {}
    })
    await book.stepEntered({
      sessionId: 's',
      turn: 1,
      cwd: '/site/demo',
      messages: [
        {
          id: 'u',
          content: [{ type: 'text', text: 'Hi' }],
          source: { kind: 'user', prompter: { email: 'a@b.test' } }
        }
      ]
    })
    const events = [event(1, 'step/start'), event(2, 'assistant/message', { usage })]
    if (aborted)
      await book.idle({
        sessionId: 's',
        events: [...events, event(3, 'turn/end', { reason: { kind: 'aborted' } })]
      })
    else await book.turnStopping({ sessionId: 's', turn: 1, events })
    assert.equal(sent.find((x) => x.door === 'moment').body.usage.totalTokens, 65)
  }
})
