import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sealSecret } from '../src/lib/secret-box.js'
import {
  qualityModelFor,
  qualityCallBudget,
  qualityUsageCost
} from '../src/opportunities-build/quality-model.js'

const now = () => Date.parse('2026-11-10T00:00:00Z')
const secret = 'fixture-secret'.repeat(4)
async function modelFor(model) {
  const row = {
    id: 'fixture',
    preset_id: 'deepseek',
    base_url: 'https://api.deepseek.com',
    enabled: true,
    api_key_cipher: await sealSecret('fixture-key', secret),
    door_model: model,
    revision: 1,
    assignment_revision: 1,
    assignment_updated_at: new Date(now()),
    reasoning_effort: 'high',
    models: [{ id: model, vision: true, reasoning: true, reasoningEfforts: ['low', 'high', 'max'] }]
  }
  return qualityModelFor({ pool: { query: async () => ({ rows: [row] }) }, secret, role: 'vision-test', now })
}

for (const id of ['deepseek-flash', 'unlisted-vision-model'])
  test(`a stale or missing price permits a capped call and marks unknown spend: ${id}`, async () => {
    const model = await modelFor(id)
    assert.equal(model.config.price.costBasis, 'unverified-conservative-upper-bound')
    assert.match(model.config.price.warning, /price/i)
    const budget = qualityCallBudget({
      config: { ...model.config, role: 'facts' },
      system: 'Read the logo.',
      input: {},
      maxTokens: 2048,
      maxInputTokens: 10000,
      maxImages: 0
    })
    assert.ok(budget.maxCents >= 7)
    assert.equal(
      qualityUsageCost(
        {
          receipt: {
            model: id,
            startedAt: new Date(now()).toISOString(),
            usage: { prompt_tokens: 100, completion_tokens: 10 }
          }
        },
        model.config
      ),
      null
    )
  })
