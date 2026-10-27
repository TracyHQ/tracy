import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  callQualityModel,
  qualityCallBudget,
  qualityUsageCost
} from '../src/opportunities-build/quality-model.js'

const imageBytes = Buffer.from('synthetic encoded image bytes')
const image = {
  id: 'pixels',
  sha256: createHash('sha256').update(imageBytes).digest('hex'),
  dataUrl: `data:image/png;base64,${imageBytes.toString('base64')}`
}
const config = {
  providerId: 'configured',
  endpointHost: 'api.deepseek.com',
  model: 'configured-model',
  role: 'observations',
  hash: 'model-config',
  capabilities: { vision: true, reasoning: true },
  reasoning: {
    enabled: true,
    effort: 'high',
    parameter: 'reasoning_effort',
    profile: 'deepseek-chat-thinking/1'
  },
  price: {
    inputCentsPerM: 30,
    cacheCentsPerM: 0.6,
    outputCentsPerM: 120,
    maxImageTokens: 1024,
    validUntil: '2026-10-27T00:00:00Z'
  }
}
const budgetArgs = {
  config,
  system: 'Observe images',
  input: { id: 'pixels' },
  images: [image],
  maxTokens: 2000,
  maxInputTokens: 20000,
  maxImages: 4
}
test('vision requires actual image input and matching transmitted bytes, never captions alone', () => {
  assert.throws(() => qualityCallBudget({ ...budgetArgs, images: [] }), /VISION_INPUT_MISSING/)
  assert.throws(
    () => qualityCallBudget({ ...budgetArgs, images: [{ ...image, sha256: 'a'.repeat(64) }] }),
    /IMAGE_HASH_MISMATCH/
  )
  assert.throws(
    () => qualityCallBudget({ ...budgetArgs, config: { ...config, capabilities: { vision: false } } }),
    /VISION_UNSUPPORTED/
  )
})
test('text/output/image bounds are checked before a paid call', () => {
  for (const change of [{ maxTokens: 0 }, { maxTokens: 40000 }, { maxInputTokens: 10 }, { maxImages: 0 }])
    assert.throws(() => qualityCallBudget({ ...budgetArgs, ...change }))
  assert.ok(qualityCallBudget(budgetArgs).maxCents > 0)
})
test('the adapter sends pixel blocks with reasoning enabled and preserves usage on malformed JSON', async () => {
  let sent
  const response = await callQualityModel({
    model: { config, credential: { baseUrl: 'https://api.deepseek.com', apiKey: 'synthetic-private-key' } },
    ...budgetArgs,
    budget: qualityCallBudget(budgetArgs),
    now: () => Date.parse('2026-10-20T12:00:00Z'),
    fetchImpl: async (_url, init) => {
      sent = JSON.parse(init.body)
      return Response.json({
        id: 'paid',
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'invalid json', reasoning_content: 'do not persist this' }
          }
        ]
      })
    }
  })
  assert.equal(sent.thinking.type, 'enabled')
  assert.equal(sent.reasoning_effort, 'high')
  assert.equal(response.receipt.reasoningEffort, 'high')
  assert.equal(sent.max_tokens, 2000)
  assert.ok(sent.messages[1].content.some((p) => p.type === 'image_url' && p.image_url.url === image.dataUrl))
  assert.equal(response.error, 'QUALITY_MODEL_JSON_INVALID')
  assert.equal(response.receipt.usage.completion_tokens, 500)
  assert.equal(JSON.stringify(response).includes('do not persist this'), false)
  assert.equal(JSON.stringify(response).includes('synthetic-private-key'), false)
})
test('cost bounds actual usage at peak pricing and refuses unknown usage or expired pricing', () => {
  const result = {
    receipt: {
      model: config.model,
      startedAt: '2026-10-20T12:00:00Z',
      usage: { prompt_tokens: 10000, prompt_cache_hit_tokens: 5000, completion_tokens: 1000 }
    }
  }
  assert.equal(qualityUsageCost(result, config), 0.273)
  for (const startedAt of ['2026-10-20T03:59:59Z', '2026-10-20T04:00:00Z', '2026-10-20T04:00:01Z'])
    assert.equal(qualityUsageCost({ receipt: { ...result.receipt, startedAt } }, config), 0.273)
  assert.equal(qualityUsageCost({ receipt: { ...result.receipt, usage: null } }, config), null)
  assert.equal(
    qualityUsageCost({ receipt: { ...result.receipt, startedAt: '2026-10-28T12:00:00Z' } }, config),
    null
  )
})
