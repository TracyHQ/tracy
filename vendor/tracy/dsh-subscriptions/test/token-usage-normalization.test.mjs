import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toTokenUsage } from '../lib/wire.js'
import { streamResponses } from '../lib/responses-stream.js'

function sse(lines) {
  return lines.map((l) => `data: ${l}\n\n`).join('') + 'data: [DONE]\n\n'
}

test('toTokenUsage: normalizes OpenAI Codex Responses payload with caching', () => {
  const raw = {
    input_tokens: 120,
    output_tokens: 45,
    total_tokens: 165,
    input_token_details: {
      cached_tokens: 20,
    },
    output_token_details: {
      reasoning_tokens: 10,
    },
  }
  const usage = toTokenUsage(raw)
  assert.ok(usage)
  assert.equal(usage.inputTokens, 100) // 120 total - 20 cached = 100 disjoint uncached
  assert.equal(usage.outputTokens, 45)
  assert.equal(usage.cacheReadTokens, 20)
  assert.equal(usage.reasoningTokens, 10)
  assert.equal(usage.totalTokens, 165)
})

test('toTokenUsage: normalizes OpenAI Chat Completions payload with prompt_tokens', () => {
  const raw = {
    prompt_tokens: 80,
    completion_tokens: 30,
    total_tokens: 110,
    prompt_tokens_details: {
      cached_tokens: 15,
    },
  }
  const usage = toTokenUsage(raw)
  assert.ok(usage)
  assert.equal(usage.inputTokens, 65) // 80 - 15 = 65
  assert.equal(usage.outputTokens, 30)
  assert.equal(usage.cacheReadTokens, 15)
  assert.equal(usage.totalTokens, 110)
})

test('toTokenUsage: normalizes Anthropic Claude usage (already uncached input)', () => {
  const raw = {
    input_tokens: 50,
    output_tokens: 25,
    cache_read_input_tokens: 10,
    cache_creation_input_tokens: 5,
  }
  const usage = toTokenUsage(raw)
  assert.ok(usage)
  assert.equal(usage.inputTokens, 50)
  assert.equal(usage.outputTokens, 25)
  assert.equal(usage.cacheReadTokens, 10)
  assert.equal(usage.cacheWriteTokens, 5)
})

test('toTokenUsage: normalizes Google Gemini usageMetadata', () => {
  const raw = {
    promptTokenCount: 100,
    candidatesTokenCount: 40,
    cachedContentTokenCount: 30,
    totalTokenCount: 140,
  }
  const usage = toTokenUsage(raw)
  assert.ok(usage)
  assert.equal(usage.inputTokens, 70) // 100 - 30 = 70
  assert.equal(usage.outputTokens, 40)
  assert.equal(usage.cacheReadTokens, 30)
  assert.equal(usage.totalTokens, 140)
})

test('toTokenUsage: guards against NaN, undefined, negative and string values', () => {
  const raw = {
    inputTokens: NaN,
    outputTokens: undefined,
    cacheReadTokens: -5,
    totalTokens: '42',
  }
  const usage = toTokenUsage(raw)
  assert.ok(usage)
  assert.equal(usage.inputTokens, 0)
  assert.equal(usage.outputTokens, 0)
  assert.equal(Number.isNaN(usage.inputTokens), false)
  assert.equal(Number.isNaN(usage.outputTokens), false)
  assert.equal(usage.totalTokens, 42)
})

test('toTokenUsage: returns null for invalid or non-token objects', () => {
  assert.equal(toTokenUsage(null), null)
  assert.equal(toTokenUsage(undefined), null)
  assert.equal(toTokenUsage('string'), null)
  assert.equal(toTokenUsage(123), null)
  assert.equal(toTokenUsage({}), null)
  assert.equal(toTokenUsage({ status: 'ok', id: '123' }), null)
})

test('streamResponses: yields normalized TokenUsage chunk when event has usage', async () => {
  const body = sse([
    JSON.stringify({
      type: 'response.output_item.done',
      item: {
        id: 'msg_1',
        type: 'message',
        content: [{ type: 'output_text', text: 'hello' }],
      },
    }),
    JSON.stringify({
      type: 'response.completed',
      response: {
        usage: {
          input_tokens: 50,
          output_tokens: 20,
        },
      },
    }),
  ])
  const chunks = []
  for await (const chunk of streamResponses(body)) chunks.push(chunk)

  const usageChunk = chunks.find((c) => c.type === 'usage')
  assert.ok(usageChunk, 'should have emitted a usage chunk')
  assert.equal(typeof usageChunk.usage.inputTokens, 'number')
  assert.equal(typeof usageChunk.usage.outputTokens, 'number')
  assert.equal(Number.isNaN(usageChunk.usage.inputTokens), false)
  assert.equal(Number.isNaN(usageChunk.usage.outputTokens), false)
  assert.equal(usageChunk.usage.inputTokens, 50)
  assert.equal(usageChunk.usage.outputTokens, 20)
})

test('streamResponses: omits usage chunk when response has no usage', async () => {
  const body = sse([
    JSON.stringify({
      type: 'response.completed',
      response: {},
    }),
  ])
  const chunks = []
  for await (const chunk of streamResponses(body)) chunks.push(chunk)

  const usageChunk = chunks.find((c) => c.type === 'usage')
  assert.equal(usageChunk, undefined, 'should NOT emit usage chunk when usage is missing')
})

test('dsh-token-meter compatibility: prevents NaN in uncachedInputTokens and outputTokens projection', () => {
  // Simulating the exact DSH dsh-token-meter bucketsFrom and addReplacing logic:
  const bucketsFrom = (usage) => ({
    uncachedInputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  })

  const addReplacing = (totals, previous, next) => ({
    uncachedInputTokens: totals.uncachedInputTokens - (previous?.uncachedInputTokens ?? 0) + next.uncachedInputTokens,
    outputTokens: totals.outputTokens - (previous?.outputTokens ?? 0) + next.outputTokens,
    cacheReadTokens: totals.cacheReadTokens - (previous?.cacheReadTokens ?? 0) + next.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0) + next.cacheWriteTokens,
  })

  const initialTotals = {
    uncachedInputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }

  // Codex raw usage passed through toTokenUsage:
  const rawCodexUsage = { input_tokens: 75, output_tokens: 35 }
  const normalized = toTokenUsage(rawCodexUsage)
  assert.ok(normalized)

  const buckets = bucketsFrom(normalized)
  const newTotals = addReplacing(initialTotals, undefined, buckets)

  assert.equal(Number.isNaN(newTotals.uncachedInputTokens), false, 'uncachedInputTokens must not be NaN')
  assert.equal(Number.isNaN(newTotals.outputTokens), false, 'outputTokens must not be NaN')
  assert.equal(newTotals.uncachedInputTokens, 75)
  assert.equal(newTotals.outputTokens, 35)

  // Verify non-negative integers:
  assert.ok(Number.isInteger(newTotals.uncachedInputTokens) && newTotals.uncachedInputTokens >= 0)
  assert.ok(Number.isInteger(newTotals.outputTokens) && newTotals.outputTokens >= 0)
})

test("toTokenUsage maps Gemini thoughtsTokenCount to reasoningTokens (#449)", () => {
  const usage = toTokenUsage({
    promptTokenCount: 100,
    candidatesTokenCount: 2,
    thoughtsTokenCount: 3,
  })
  assert.equal(usage.reasoningTokens, 3)
})
