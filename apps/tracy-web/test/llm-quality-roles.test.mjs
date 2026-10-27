import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { capabilitiesOf } from '../src/lib/llm-capabilities.js'
import { effortOptions } from '../src/lib/llm-effort.js'
import {
  assignDoor,
  clearDoor,
  lookupDoor,
  readAssignments,
  readProviders,
  saveModels,
  saveProvider
} from '../src/lib/llm-store.js'
import {
  currentVisionProof,
  runVisionTest,
  VISION_TEST_SYSTEM,
  validateVisionTest,
  visionFingerprint,
  visionTestInput,
  visionTestStore
} from '../src/lib/llm-vision-test.js'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import {
  callQualityModel,
  qualityCallBudget,
  qualityModelFor,
  qualityUsageCost
} from '../src/opportunities-build/quality-model.js'
import { createQualityVisionTests } from '../src/opportunities-build/quality-vision-test.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const secret = 's'.repeat(32),
  actor = 'pilot@example.test'
const metadata = (id, vision) => ({
  id,
  name: id,
  ...capabilitiesOf(
    {
      id,
      input_modalities: vision ? ['text', 'image'] : ['text'],
      output_modalities: ['text'],
      effort: { supported_levels: ['low', 'high', 'max'] },
      context_window: 1048576
    },
    'deepseek'
  )
})
const models = [metadata('deepseek-flash', true), metadata('deepseek-v4-pro', false)]
async function setup() {
  const accountId = (await db.pool.query('insert into account(email) values($1) returning id', [actor]))
    .rows[0].id
  await saveProvider(
    db.pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-private-fixture', enabled: true },
    secret,
    actor
  )
  await saveModels(db.pool, 'deepseek', models)
  await assignDoor(db.pool, 'seedText', { providerId: 'deepseek', model: 'legacy-text' }, actor)
  await assignDoor(db.pool, 'seedImage', { providerId: 'deepseek', model: 'legacy-draw' }, actor)
  await assignDoor(db.pool, 'vision', { providerId: 'deepseek', model: 'deepseek-flash' }, actor)
  await assignDoor(db.pool, 'woEditorial', { providerId: 'deepseek', model: 'deepseek-v4-pro' }, actor)
  return accountId
}
// Price-fixture validity and proof TTLs share an explicit clock, independent of the wall clock.
const fixtureNow = () => Date.parse('2026-10-21T12:00:00Z')
const load = (role) => qualityModelFor({ pool: db.pool, secret, role, now: fixtureNow })
const noOp = async () => {}

test('vision pixel controls reject a different image, missing pixels and invented transcriptions', async () => {
  const a = await visionTestInput(),
    b = await visionTestInput()
  assert.equal(validateVisionTest(a.expected, a), true)
  assert.equal(validateVisionTest(a.expected, b), false)
  assert.equal(validateVisionTest({}, a), false)
  assert.equal(VISION_TEST_SYSTEM.includes(a.expected.nonce), false)
  assert.notEqual(a.images[0].sha256, b.images[0].sha256)
})

test('effort choices use declared canonical provider levels, never a universal xhigh enum', () => {
  const input = { presetId: 'deepseek', baseUrl: 'https://api.deepseek.com', metadata: models[0] }
  assert.deepEqual(effortOptions(input).choices, ['low', 'high', 'max'])
  assert.deepEqual(effortOptions({ ...input, presetId: 'other' }).choices, [])
  assert.equal(effortOptions({ ...input, metadata: {} }).mode, 'unknown')
  assert.deepEqual(effortOptions({ ...input, baseUrl: 'https://gateway.example/v1' }).choices, [])
})

test(
  'roles and effort persist on reload without changing seedText or draw-image assignments',
  opts,
  async () => {
    await setup()
    const assignments = await readAssignments(db.pool)
    assert.equal(assignments.woEditorial.effort, 'high')
    assert.equal(assignments.seedText.model, 'legacy-text')
    assert.equal(assignments.seedImage.model, 'legacy-draw')
    assert.equal(assignments.vision.model, 'deepseek-flash')
    const high = await load('plan')
    assert.equal(high.config.door, 'woEditorial')
    assert.equal(high.config.reasoning.effort, 'high')
    assert.equal((await load('facts')).config.door, 'woEditorial')
    assert.equal(
      (
        await assignDoor(
          db.pool,
          'woEditorial',
          { providerId: 'deepseek', model: 'deepseek-v4-pro', effort: 'xhigh' },
          actor
        )
      ).error,
      'MODEL_EFFORT_UNSUPPORTED'
    )
    assert.equal(
      (
        await assignDoor(
          db.pool,
          'seedText',
          { providerId: 'deepseek', model: 'legacy-text', effort: 'max' },
          actor
        )
      ).error,
      'DOOR_EFFORT_UNSUPPORTED'
    )
    await assignDoor(
      db.pool,
      'woEditorial',
      { providerId: 'deepseek', model: 'deepseek-v4-pro', effort: 'max' },
      actor
    )
    const max = await load('plan')
    assert.notEqual(high.config.hash, max.config.hash)
    assert.equal((await readAssignments(db.pool)).woEditorial.effort, 'max')
    assert.deepEqual((await readProviders(db.pool, secret))[0].effortOptions['deepseek-v4-pro'].choices, [
      'low',
      'high',
      'max'
    ])
    assert.equal(JSON.stringify(max.config).includes('sk-private-fixture'), false)
  }
)

test(
  'outbound effort, frozen hash, budget and receipt agree; changing the budget profile is refused',
  opts,
  async () => {
    await setup()
    for (const effort of ['high', 'max']) {
      await assignDoor(
        db.pool,
        'woEditorial',
        { providerId: 'deepseek', model: 'deepseek-v4-pro', effort },
        actor
      )
      const model = await load('plan')
      const args = {
        config: model.config,
        system: 'Return JSON.',
        input: {},
        maxTokens: 1000,
        maxInputTokens: 10000,
        maxImages: 0
      }
      const budget = qualityCallBudget(args)
      let sent
      const answer = await callQualityModel({
        model,
        ...args,
        budget,
        fetchImpl: async (_url, init) => {
          sent = JSON.parse(init.body)
          return Response.json({
            model: model.config.model,
            id: 'paid',
            usage: { prompt_tokens: 100, completion_tokens: 100 },
            choices: [{ finish_reason: 'stop', message: { content: '{}' } }]
          })
        }
      })
      assert.equal(sent.reasoning_effort, effort)
      assert.equal(sent.thinking.type, 'enabled')
      assert.equal(budget.reasoningEffort, effort)
      assert.equal(answer.receipt.reasoningEffort, effort)
      await assert.rejects(
        callQualityModel({ model, ...args, budget: { ...budget, reasoningEffort: 'low' } }),
        /PROFILE_MISMATCH/
      )
    }
  }
)

test('missing/disabled read assignment and draws capability never authorize WO vision', opts, async () => {
  await setup()
  await assert.rejects(load('observations'), /PIXEL_TEST_REQUIRED/)
  await clearDoor(db.pool, 'vision')
  await assert.rejects(load('observations'), /MODEL_UNCONFIGURED/)
  await assignDoor(db.pool, 'vision', { providerId: 'deepseek', model: 'deepseek-v4-pro' }, actor)
  await assert.rejects(load('review'), /CAPABILITY_UNKNOWN/)
  await saveProvider(db.pool, { id: 'deepseek', presetId: 'deepseek', enabled: false }, secret, actor)
  await assert.rejects(load('review'), /MODEL_UNCONFIGURED/)
})

async function runner(extra = {}) {
  const accountId = await setup(),
    model = await load('vision-test')
  const clock = { now: fixtureNow() }
  const store = visionTestStore({ pool: db.pool, now: () => clock.now, leaseMs: 1000 })
  const ledger = createCostLedger({
    pool: db.pool,
    now: () => clock.now,
    caps: async () => ({ dailyCapCents: 200, jobCapCents: 100 })
  })
  let calls = 0
  const input = await visionTestInput()
  const config = {
    store,
    ledger,
    model,
    accountId,
    actor,
    requestKey: randomUUID(),
    accountDailyCapCents: 100,
    checkAllowed: noOp,
    makeInput: async () => input,
    budgetFor: () => ({ maxCents: 2 }),
    call: async () => {
      calls++
      return {
        result: input.expected,
        receipt: {
          requestId: 'paid',
          model: model.config.model,
          usage: { prompt_tokens: 1000, completion_tokens: 200 },
          imageHashes: input.images.map(({ id, sha256 }) => ({ id, sha256 }))
        }
      }
    },
    actualCents: () => 0.07,
    ...extra
  }
  return { config, clock, calls: () => calls }
}

test(
  'successful pixel proof admits both image roles and is invalidated by key, endpoint, metadata or assignment changes',
  opts,
  async () => {
    const r = await runner()
    const first = await runVisionTest(r.config)
    assert.equal(first.state, 'succeeded')
    assert.equal((await runVisionTest(r.config)).id, first.id)
    assert.equal(r.calls(), 1)
    const observation = await load('observations'),
      review = await load('review')
    assert.equal(observation.config.door, 'vision')
    assert.equal(observation.config.visionProof.id, first.id)
    assert.equal(review.config.visionProof.id, first.id)
    const found = await lookupDoor(db.pool, 'vision', secret)
    const fp = (snapshot, baseUrl = found.credential.baseUrl) =>
      visionFingerprint({ snapshot, baseUrl, model: found.credential.model })
    for (const snapshot of [
      { ...found.snapshot, providerRevision: 999 },
      { ...found.snapshot, assignmentRevision: 999 },
      { ...found.snapshot, metadata: { ...found.snapshot.metadata, vision: false } }
    ])
      assert.equal(
        await currentVisionProof({ pool: db.pool, fingerprint: fp(snapshot), now: fixtureNow }),
        null
      )
    assert.equal(
      await currentVisionProof({
        pool: db.pool,
        fingerprint: fp(found.snapshot, 'https://api.deepseek.com/other'),
        now: fixtureNow
      }),
      null
    )
    assert.equal(
      await currentVisionProof({
        pool: db.pool,
        fingerprint: observation.config.visionFingerprint,
        now: () => fixtureNow() + 8 * 86400000
      }),
      null
    )
    await saveProvider(db.pool, { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-rotated' }, secret, actor)
    await assert.rejects(load('review'), /PIXEL_TEST_REQUIRED/)
  }
)

test(
  'two concurrent pixel requests send one call; request-key collision with another config is refused',
  opts,
  async () => {
    const r = await runner()
    await Promise.all([runVisionTest(r.config), runVisionTest(r.config)])
    assert.equal(r.calls(), 1)
    await assert.rejects(
      runVisionTest({
        ...r.config,
        model: { ...r.config.model, config: { ...r.config.model.config, visionFingerprint: 'changed' } }
      }),
      /INPUT_CHANGED/
    )
  }
)

for (const kind of ['json', 'wrong-pixels', 'missing-usage', 'timeout'])
  test(`pixel ${kind} failure retains its charge and does not repeat after restart`, opts, async () => {
    const r = await runner()
    let calls = 0
    r.config.call = async () => {
      calls++
      if (kind === 'timeout') throw new Error('timeout')
      return {
        result: {},
        error: kind === 'json' ? 'QUALITY_MODEL_JSON_INVALID' : null,
        receipt: { requestId: 'paid' }
      }
    }
    if (kind === 'missing-usage') r.config.actualCents = () => null
    await runVisionTest(r.config).catch(() => {})
    const next = await runVisionTest(r.config)
    assert.equal(calls, 1)
    assert.equal(next.state, ['timeout', 'missing-usage'].includes(kind) ? 'uncertain' : 'failed')
    const ledger = (await db.pool.query('select state,actual_cents from wo_cost_ledger')).rows[0]
    assert.equal(ledger.state, ['timeout', 'missing-usage'].includes(kind) ? 'unreconciled' : 'settled')
  })

test(
  'crash after receipt settles on resume; crash after dispatch remains uncertain without a new call',
  opts,
  async () => {
    const r = await runner(),
      settle = r.config.ledger.settle
    r.config.ledger.settle = async () => {
      throw new Error('settlement crash')
    }
    await assert.rejects(runVisionTest(r.config), /settlement crash/)
    r.config.ledger.settle = settle
    await runVisionTest(r.config)
    assert.equal(r.calls(), 1)
    const second = { ...r.config, requestKey: randomUUID() }
    const held = await r.config.store.claim({
      accountId: second.accountId,
      actor,
      requestKey: second.requestKey,
      fingerprint: second.model.config.visionFingerprint,
      config: second.model.config,
      input: await second.makeInput()
    })
    const reserved = await r.config.ledger.reserve({
      provider: 'deepseek',
      operation: 'vision:pixel-test',
      maxCents: 2,
      accountId: second.accountId,
      accountDailyCapCents: 100,
      jobId: held.row.id
    })
    await r.config.store.dispatch(held.row, reserved.reservation)
    r.clock.now += 2000
    assert.equal((await runVisionTest(second)).state, 'uncertain')
    assert.equal(r.calls(), 1)
  }
)

test(
  'revoked permission after reserve releases only the unsent request and makes no call',
  opts,
  async () => {
    const r = await runner()
    let checks = 0
    r.config.checkAllowed = async () => {
      if (++checks === 2) throw new Error('permission revoked')
    }
    await assert.rejects(runVisionTest(r.config), /permission revoked/)
    assert.equal(r.calls(), 0)
    assert.equal((await db.pool.query('select state from wo_cost_ledger')).rows[0].state, 'released')
  }
)

test(
  'the ops pixel service transmits pixels through the same reasoning JSON adapter and returns no secrets',
  opts,
  async () => {
    await setup()
    let sent
    const service = createQualityVisionTests({
      pool: db.pool,
      now: fixtureNow,
      secret,
      fetchImpl: async (_url, init) => {
        sent = JSON.parse(init.body)
        const stored = (await db.pool.query("select input from llm_model_test where state='running'")).rows[0]
          .input
        assert.equal(
          JSON.stringify(sent.messages.filter((m) => m.role === 'system')).includes(stored.expected.nonce),
          false
        )
        return Response.json({
          model: 'deepseek-flash',
          id: 'paid',
          usage: { prompt_tokens: 1000, completion_tokens: 200 },
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(stored.expected), reasoning_content: 'private reasoning' }
            }
          ]
        })
      }
    })
    const result = await service.run({ actor, requestKey: randomUUID(), checkAllowed: noOp })
    assert.equal(result.state, 'succeeded')
    assert.equal(sent.reasoning_effort, 'high')
    assert.ok(sent.messages[1].content.some((p) => p.type === 'image_url'))
    assert.equal(JSON.stringify(result).includes('sk-private-fixture'), false)
    assert.equal(JSON.stringify(result).includes('private reasoning'), false)
    const stored = (await db.pool.query('select config,receipt from llm_model_test')).rows[0]
    assert.equal(stored.receipt.reasoningEffort, 'high')
    assert.ok(qualityUsageCost({ receipt: stored.receipt }, stored.config) > 0)
  }
)

test(
  'the vision door can carry "off" (menu photos without reasoning); any other effort is refused',
  opts,
  async () => {
    await setup()
    const vision = (effort) =>
      assignDoor(db.pool, 'vision', { providerId: 'deepseek', model: 'deepseek-flash', effort }, actor)
    assert.equal((await vision('high')).error, 'MODEL_EFFORT_UNSUPPORTED')
    assert.equal((await vision('off')).error, null)
    assert.equal((await readAssignments(db.pool)).vision.effort, 'off')
    assert.equal((await vision(undefined)).error, null)
    assert.equal((await readAssignments(db.pool)).vision.effort, null)
  }
)
