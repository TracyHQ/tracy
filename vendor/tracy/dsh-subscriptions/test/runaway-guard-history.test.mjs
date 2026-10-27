import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReadableStream } from 'node:stream/web'
import { SubscriptionAdapter } from '../lib/adapter.js'

test('runaway guard: default stream and guard-disabled stream both yield exactly 1 completed history record (#456)', async () => {
  const historyDefault = []
  const historyDisabled = []

  const sseResponse = (text) => new Response(
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\ndata: {"type":"response.completed"}\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

  const makeAdapter = (historyList) => new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1' }],
    vendorConfig: () => ({ models: ['gpt-5.4-mini'] }),
    ensureFresh: async (_p, b) => b,
    loadBlob: async () => ({ accessToken: 'tok' }),
    cooldownMs: () => 1000,
    rememberCooldown: () => {},
    saveBlob: () => {},
    recordSuccess: () => {},
    recordHistory: (entry) => historyList.push(entry),
    fetchImpl: async () => sseResponse('hello world'),
  })

  // 1. Default stream (runaway guard enabled by default)
  const adapter1 = makeAdapter(historyDefault)
  for await (const _chunk of adapter1.stream({
    provider: 'codex',
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: 'hi' }],
  })) {
    // drain
  }

  assert.equal(historyDefault.length, 1, 'default stream must yield exactly 1 history record')
  assert.equal(historyDefault[0].status, 200)
  assert.equal(historyDefault[0].outcome, 'success')
  assert.equal(historyDefault[0].kind, 'stream')

  // 2. Stream with runaway guard explicitly disabled
  const adapter2 = makeAdapter(historyDisabled)
  for await (const _chunk of adapter2.stream({
    provider: 'codex',
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: 'hi' }],
    runawayGuard: { enabled: false },
  })) {
    // drain
  }

  assert.equal(historyDisabled.length, 1, 'disabled guard stream must yield exactly 1 history record')
  assert.equal(historyDisabled[0].status, 200)
  assert.equal(historyDisabled[0].outcome, 'success')
  assert.equal(historyDisabled[0].kind, 'stream')
})

test('runaway guard: looping stream cutoff records runaway outcome (#456)', async () => {
  const history = []
  let infiniteCount = 0
  const sseLoop = () => {
    const stream = new ReadableStream({
      pull(controller) {
        if (infiniteCount++ < 100) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'cycle ' })}\n\n`))
        } else {
          controller.close()
        }
      }
    })
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }

  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1' }],
    vendorConfig: () => ({ models: ['gpt-5.4-mini'] }),
    ensureFresh: async (_p, b) => b,
    loadBlob: async () => ({ accessToken: 'tok' }),
    cooldownMs: () => 1000,
    rememberCooldown: () => {},
    saveBlob: () => {},
    recordSuccess: () => {},
    recordHistory: (entry) => history.push(entry),
    fetchImpl: async () => sseLoop(),
  })

  const chunks = []
  for await (const chunk of adapter.stream({
    provider: 'codex',
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: 'hi' }],
    runawayGuard: { maxPatternRepetitions: 4, minPatternLength: 4 },
  })) {
    chunks.push(chunk)
  }

  assert.equal(history.length, 1, 'runaway stream must yield exactly 1 history record')
  assert.equal(history[0].outcome, 'runaway')
  assert.equal(history[0].status, 200)
})

test('runaway guard: consumer break/return records cancel outcome (#456)', async () => {
  const history = []
  const sseMulti = () => new Response(
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'chunk1' })}\n\n` +
    `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'chunk2' })}\n\n` +
    `data: {"type":"response.completed"}\n\n`,
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )

  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1' }],
    vendorConfig: () => ({ models: ['gpt-5.4-mini'] }),
    ensureFresh: async (_p, b) => b,
    loadBlob: async () => ({ accessToken: 'tok' }),
    cooldownMs: () => 1000,
    rememberCooldown: () => {},
    saveBlob: () => {},
    recordSuccess: () => {},
    recordHistory: (entry) => history.push(entry),
    fetchImpl: async () => sseMulti(),
  })

  for await (const chunk of adapter.stream({
    provider: 'codex',
    model: 'gpt-5.4-mini',
    messages: [{ role: 'user', content: 'hi' }],
  })) {
    if (chunk.type === 'text-delta') {
      break // Consumer aborts early
    }
  }

  assert.equal(history.length, 1, 'cancelled stream must yield exactly 1 history record')
  assert.equal(history[0].outcome, 'cancel')
  assert.equal(history[0].status, 499)
})

test('runaway guard: upstream error records error outcome (#456)', async () => {
  const history = []
  const adapter = new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CODEX_OAUTH_1' }],
    vendorConfig: () => ({ models: ['gpt-5.4-mini'] }),
    ensureFresh: async (_p, b) => b,
    loadBlob: async () => ({ accessToken: 'tok' }),
    cooldownMs: () => 1000,
    rememberCooldown: () => {},
    saveBlob: () => {},
    recordSuccess: () => {},
    recordHistory: (entry) => history.push(entry),
    fetchImpl: async () => new Response('Internal error', { status: 500 }),
  })

  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream({
      provider: 'codex',
      model: 'gpt-5.4-mini',
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      // drain
    }
  })

  assert.equal(history.length, 1, 'failed stream must yield exactly 1 history record')
  assert.equal(history[0].outcome, 'error')
  assert.equal(history[0].status, 500)
})
