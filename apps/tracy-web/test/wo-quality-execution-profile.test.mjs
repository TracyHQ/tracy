import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { qualityBudgetSlots } from '../src/opportunities-build/quality-budget.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import {
  qualityExecutionBudget,
  qualityExecutionInput,
  qualityExecutionLimits,
  qualityExecutionModel,
  qualityExecutionOf,
  qualityExecutionProfile,
  validateQualityExecutionProfile
} from '../src/opportunities-build/quality-execution-profile.js'
import { qualityCallBudget } from '../src/opportunities-build/quality-model.js'
import { QUALITY_REVIEW_SYSTEM } from '../src/opportunities-build/quality-review.js'
import { qualityReviewBatches } from '../src/opportunities-build/quality-site-review.js'

const models = Object.fromEntries(
  ['facts', 'observations', 'plan', 'review'].map((role) => [
    role,
    {
      role,
      hash: `old-${role}`,
      price: ['facts', 'plan'].includes(role)
        ? { inputCentsPerM: 132, outputCentsPerM: 396 }
        : { inputCentsPerM: 30, outputCentsPerM: 120 }
    }
  ])
)

test('the approved complete profile forecasts 197 cents including all three D rounds and both repairs', () => {
  const profile = qualityExecutionProfile('bounded-v2')
  const frozen = Object.fromEntries(
    Object.entries(models).map(([role, config]) => [role, qualityExecutionModel(config, profile)])
  )
  const forecast = qualityBudgetSlots({ models: frozen, observationBatches: 4, executionProfile: profile })
  assert.equal(forecast.ceilingCents, 197)
  assert.equal(forecast.totalCalls, 44)
  assert.equal(forecast.executionProfileHash, profile.hash)
  assert.equal(
    forecast.slots
      .filter((slot) => slot.stage.startsWith('d-'))
      .reduce((sum, slot) => sum + slot.ceilingCents, 0),
    60
  )
  assert.equal(forecast.slots.filter((slot) => slot.stage.startsWith('c2-')).length, 8)
  assert.equal(profile.maxDetailPages, 4)
  assert.equal(profile.maxCaptureSlices, 48)
  assert.deepEqual(qualityExecutionLimits(profile, 'd-r0-8'), {
    maxInputTokens: 54000,
    maxTokens: 3000,
    maxImages: 6
  })
  assert.deepEqual(qualityExecutionLimits(profile, 'd-r0-9'), {
    maxInputTokens: 120000,
    maxTokens: 3000,
    maxImages: 6
  })
  for (const stage of ['c2-9', 'd-r0-10', 'd-r3-1', 'patch-3'])
    assert.throws(() => qualityExecutionLimits(profile, stage), /UNPLANNED_CALL/)
  assert.throws(
    () => qualityBudgetSlots({ models, observationBatches: 4, executionProfile: profile, maxFieldCalls: 9 }),
    /FORECAST_POLICY/
  )
})

test('new revisions bound facts reasoning at 12000 output tokens while old profile hashes stay fixed', () => {
  const profile = qualityExecutionProfile()
  assert.equal(profile.id, 'bounded-v3')
  assert.deepEqual(qualityExecutionLimits(profile, 'a-facts'), {
    maxInputTokens: 70000,
    maxTokens: 12000,
    maxImages: 0
  })
  const forecast = qualityBudgetSlots({ models, observationBatches: 4, executionProfile: profile })
  assert.equal(forecast.ceilingCents, 200)
  assert.equal(forecast.totalCalls, 44)
  assert.equal(forecast.slots.find((s) => s.stage === 'a-facts').ceilingCents, 14)
  for (const [id, hash] of [
    ['legacy-v1', '374adb25c3b299c0447356f0aeea8bd50456e4971a2364cb415399dc88807867'],
    ['bounded-v2', '7489fcdd7d489284e90013887afcc3d12e537f750696e420693164801843fa9d']
  ]) {
    const old = qualityExecutionProfile(id)
    assert.equal(old.hash, hash)
    assert.equal(qualityExecutionLimits(old, 'a-facts').maxTokens, 4000)
  }
})

test('missing profiles preserve legacy configuration hashes and the 11/9/20k limits', () => {
  const input = { models: structuredClone(models) },
    before = qualityHash(input)
  const legacy = qualityExecutionOf(input)
  assert.equal(legacy.id, 'legacy-v1')
  assert.equal(legacy.maxFieldCalls, 11)
  assert.equal(legacy.maxLocalReviewCalls, 9)
  assert.equal(qualityExecutionLimits(legacy, 'd-r0-10').maxInputTokens, 20000)
  assert.equal(qualityHash(input), before)
  assert.equal(qualityBudgetSlots({ models: input.models, observationBatches: 4 }).ceilingCents, 194)
})

test('profile and model tampering fail even after recomputing the supplied profile hash', () => {
  const profile = qualityExecutionProfile(),
    config = qualityExecutionModel(models.review, profile)
  assert.equal(
    qualityExecutionOf({ executionProfile: profile, models: { review: config } }).hash,
    profile.hash
  )
  const changed = structuredClone(profile)
  changed.localReview.maxInputTokens++
  const { hash: _hash, ...body } = changed
  changed.hash = qualityHash(body)
  assert.throws(() => validateQualityExecutionProfile(changed), /PROFILE_CHANGED/)
  assert.throws(() => qualityExecutionOf({ models: { review: config } }), /PROFILE_CHANGED/)
  assert.throws(() => qualityExecutionOf({ executionProfile: profile, models }), /PROFILE_CHANGED/)
  const modelChanged = structuredClone(config)
  modelChanged.price.inputCentsPerM = 0
  assert.throws(
    () => qualityExecutionOf({ executionProfile: profile, models: { review: modelChanged } }),
    /MODEL_CHANGED/
  )
  assert.notEqual(config.hash, models.review.hash)
  assert.equal(qualityExecutionModel(config, profile).hash, config.hash)
  profile.localReview.maxInputTokens = 1
  assert.equal(qualityExecutionProfile().localReview.maxInputTokens, 54000)
})

test('review preflight and dispatch use identical input bytes, hashes and budgets at the exact frozen boundary', async () => {
  const pixels = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRz8AAAAASUVORK5CYII=',
    'base64'
  )
  const imageHash = createHash('sha256').update(pixels).digest('hex')
  for (const executionProfile of [qualityExecutionProfile(), null]) {
    const profile = executionProfile ?? qualityExecutionProfile('legacy-v1')
    const plain = {
      ...models.review,
      capabilities: { vision: true },
      price: { ...models.review.price, maxImageTokens: 1024 }
    }
    const config = executionProfile ? qualityExecutionModel(plain, executionProfile) : plain
    const batchFor = async (length) =>
      (
        await qualityReviewBatches({
          render: {
            hash: 'render',
            contentHash: 'content',
            captures: [{ slices: [{ id: 'slice', route: '/', width: 390, imageHash }] }]
          },
          current: { content: { title: 'Cà phê ☕', body: 'x'.repeat(length) } },
          dossier: { accountId: 'account', inputHash: 'dossier', facts: [], conflicts: [], missing: [] },
          observations: { pictures: [] },
          modelConfig: config,
          executionProfile,
          getPixels: async () => pixels
        })
      )[0]
    const base = await batchFor(0)
    const length = profile.localReview.maxInputTokens - base.budget.maxInputTokens
    const batch = await batchFor(length)
    assert.equal(batch.budget.maxInputTokens, profile.localReview.maxInputTokens)
    const before = JSON.stringify(batch.input)
    const wire = qualityExecutionInput(batch.input, executionProfile)
    assert.strictEqual(wire, batch.input, 'the already prepared input is idempotent')
    assert.equal(JSON.stringify(wire), before)
    assert.equal(qualityHash(wire), qualityHash(batch.input))
    const budget = qualityExecutionBudget(
      qualityCallBudget({
        config,
        system: QUALITY_REVIEW_SYSTEM,
        input: wire,
        images: batch.images,
        ...profile.localReview
      }),
      executionProfile
    )
    assert.deepEqual(budget, batch.budget)
    assert.equal(Object.hasOwn(wire, 'executionProfile'), Boolean(executionProfile))
    assert.equal(Object.hasOwn(budget, 'executionProfileHash'), Boolean(executionProfile))
    await assert.rejects(batchFor(length + 1), /QUALITY_REVIEW_INPUT_TOO_LARGE/)
  }
})

test('legacy wire helpers are byte-neutral and frozen profile references cannot be overwritten', () => {
  const legacy = { text: 'Cà phê ☕', values: [null, false, { n: 1 }] },
    budget = { maxCents: 2 }
  const bytes = Buffer.from(JSON.stringify(legacy))
  assert.strictEqual(qualityExecutionInput(legacy), legacy)
  assert.deepEqual(Buffer.from(JSON.stringify(qualityExecutionInput(legacy))), bytes)
  assert.strictEqual(qualityExecutionBudget(budget), budget)
  const profile = qualityExecutionProfile()
  assert.throws(
    () => qualityExecutionInput({ executionProfile: { id: profile.id, hash: 'wrong' } }, profile),
    /PROFILE_CHANGED/
  )
  assert.throws(() => qualityExecutionBudget({ executionProfileHash: 'wrong' }, profile), /PROFILE_CHANGED/)
})
