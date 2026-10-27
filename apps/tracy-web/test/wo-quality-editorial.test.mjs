import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { createCostLedger } from 'website-opportunities/src/cost-ledger.js'
import { acceptDemoActions } from '../src/opportunities-build/demo-actions.js'
import { prepareQualityAssets, qualityAssetPixels } from '../src/opportunities-build/quality-assets.js'
import { createQualityHeadroom } from '../src/opportunities-build/quality-budget.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import { createQualityEditorial } from '../src/opportunities-build/quality-editorial.js'
import { qualityExecutionInput } from '../src/opportunities-build/quality-execution-profile.js'
import { callQualityModel } from '../src/opportunities-build/quality-model.js'
import { qualityManifest } from '../src/opportunities-build/quality-plan.js'
import { prepareQualityRun } from '../src/opportunities-build/quality-preparation.js'
import { QUALITY_REVIEW_SYSTEM } from '../src/opportunities-build/quality-review.js'
import { qualityRunStore } from '../src/opportunities-build/quality-runs.js'
import { qualityReviewBatches } from '../src/opportunities-build/quality-site-review.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' },
  db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const sha = 'a'.repeat(64),
  tag = 'synthetic/emdash'
const manifest = qualityManifest({
  release: { tag, setting: { version: '1' }, pages: [{ id: 'home', home: true, label: 'Home' }] },
  capabilities: { hash: 'caps', release: { tag, version: '1', parts: { state: sha } } },
  seedSha256: sha,
  archiveSha256: sha,
  seed: {
    defaultLocale: 'en',
    collections: [
      {
        slug: 'home',
        fields: [
          { slug: 'title', type: 'string', required: true },
          { slug: 'hero_text', type: 'text' },
          { slug: 'hero_image', type: 'image' }
        ]
      }
    ],
    content: {
      home: [{ slug: 'home', data: { title: 'Home', hero_text: 'Industrial sample', hero_image: 'sample' } }]
    },
    menus: [{ id: 'primary', name: 'primary', locale: 'en', items: [{ url: '/', label: 'Home' }] }]
  }
})
const source = { id: 'own', kind: 'official-website', body: 'Coffee by the river.' }
async function world() {
  const account = (
    await db.pool.query("insert into account(email)values('editorial-test@example.test')returning id")
  ).rows[0]
  const opp = (
    await db.pool.query(
      "insert into wo_opportunity(account_id,name,provider,provider_id,candidate)values($1,'Synthetic cafe','url','https://synthetic.invalid','{}')returning id",
      [account.id]
    )
  ).rows[0]
  await acceptDemoActions(db.pool, {
    accountId: account.id,
    protocol: 'quality-v1',
    entries: [{ opportunityId: opp.id, requestId: 'test-editorial' }]
  })
  const action = (
    await db.pool.query('update wo_demo_action set lease_token=1,lease_until=$1 returning *', [
      new Date(Date.now() + 10 * 60_000)
    ])
  ).rows[0]
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#79583d' } })
    .png()
    .toBuffer()
  const row = {
    id: randomUUID(),
    kind: 'image',
    mime: 'image/png',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    object_key: 'synthetic-picture',
    source: 'website',
    source_url: 'https://synthetic.invalid/picture.png'
  }
  const frozen = {
    id: action.revision_id,
    account_id: account.id,
    opportunity_id: opp.id,
    overlay: { name: 'Synthetic cafe' },
    place_snapshot_id: null,
    asset_manifest: [{ id: row.id, kind: 'image', sha256: row.sha256 }],
    raw_sources: [source]
  }
  const objects = { get: async () => new Response(bytes) },
    readRows = async () => [row]
  const ledger = createCostLedger({
    pool: db.pool,
    caps: async () => ({ dailyCapCents: 2000, jobCapCents: 200 })
  })
  const store = qualityRunStore({ pool: db.pool }),
    calls = []
  const state = { failure: null, stopped: false, corruptObservations: false }
  const deps = {
    pool: db.pool,
    secret: 'synthetic-secret',
    ledger,
    objects,
    readInputs: async (input) => {
      assert.equal(input.id, frozen.id)
      return {
        manifest,
        questions: { synthetic: true, languagePolicy: { locales: ['en'] } },
        sources: [source],
        semanticBase: { source, manifest: manifest.hash }
      }
    },
    policyFor: async () => ({ maxAttempts: 64, maxRunMs: 172800000, accountDailyCapCents: 400 }),
    prepareAssets: (args) => prepareQualityAssets({ ...args, readRows }),
    readPixels: (args) => qualityAssetPixels({ ...args, readRows }),
    headroom: createQualityHeadroom({ pool: db.pool, ledger, store }),
    loadModel: async ({ role }) => ({
      credential: { baseUrl: 'https://synthetic.invalid', apiKey: 'synthetic-key' },
      config: {
        role,
        hash: role,
        providerId: 'synthetic',
        model: 'synthetic-model',
        capabilities: { reasoning: true, vision: ['observations', 'review'].includes(role) },
        reasoning: {
          enabled: true,
          effort: 'high',
          parameter: 'reasoning_effort',
          profile: 'deepseek-chat-thinking/1'
        },
        price: {
          inputCentsPerM: ['facts', 'plan'].includes(role) ? 132 : 30,
          outputCentsPerM: ['facts', 'plan'].includes(role) ? 396 : 120,
          cacheCentsPerM: 0.6,
          maxImageTokens: 1024,
          validUntil: '2099-01-01T00:00:00Z'
        }
      }
    }),
    providerCall: async ({ model, input, images }) => {
      // The envelope and action link must be durable before any paid egress.
      const saved = (await db.pool.query('select * from wo_quality_run where revision_id=$1', [frozen.id]))
        .rows[0]
      assert.equal(saved.input.frozen.asset_manifest[0].sha256, row.sha256)
      assert.equal(
        (
          await db.pool.query('select count(*)::int n from wo_quality_action_link where run_id=$1', [
            saved.id
          ])
        ).rows[0].n,
        1
      )
      const stage = model.config.role === 'plan' ? (input.batch ? 'fields' : 'outline') : model.config.role
      calls.push(stage)
      if (state.failure === stage)
        throw Object.assign(new Error('Synthetic interrupted connection'), { code: 'SYNTHETIC_DISCONNECT' })
      let result
      if (stage === 'facts') result = { facts: [], unresolved: [] }
      if (stage === 'observations') {
        assert.equal(images.length, 1)
        assert.deepEqual(Buffer.from(images[0].dataUrl.split(',')[1], 'base64'), bytes)
        result = {
          schemaVersion: 'tracy-wo-observations/v1',
          inputHash: input.inputHash,
          pictures: state.corruptObservations
            ? []
            : [
                {
                  id: row.id,
                  contentHash: row.sha256,
                  tags: ['coffee'],
                  description: 'A brown test image.',
                  uncertain: ['Synthetic test image'],
                  quality: 'good',
                  focalPoint: { x: 0.5, y: 0.5 }
                }
              ]
        }
      }
      if (stage === 'outline')
        result = {
          schemaVersion: 'tracy-wo-outline/v1',
          inputHash: input.dossier.inputHash,
          manifestHash: manifest.hash,
          observationHash: input.observations.hash,
          locale: 'en',
          otherLocales: 'empty-by-policy',
          message: 'Coffee by the river',
          records: [
            {
              key: 'home/home@en',
              state: 'planned',
              reason: 'Main page',
              direction: 'Show supported copy',
              claimIds: [],
              sourceSpanIds: ['own:0'],
              imageIntents: [
                {
                  field: 'hero_image',
                  intent: 'Coffee',
                  candidateAssetIds: [row.id],
                  requiredTags: ['coffee']
                }
              ]
            }
          ],
          navigation: [{ menuId: 'primary', items: [{ label: 'Home', url: '/' }], reason: 'Main page' }],
          terms: [],
          unresolved: []
        }
      if (stage === 'fields')
        result = {
          schemaVersion: 'tracy-wo-fields/v1',
          outlineHash: input.outline.hash,
          batchHash: input.batch.hash,
          unresolved: [],
          fields: input.batch.groups.flatMap((group) =>
            group.fields.map((field) => ({
              key: group.key,
              field,
              ...(field === 'title'
                ? { action: 'preserve' }
                : field === 'hero_image'
                  ? { action: 'image', assetId: row.id, imageIntent: 'Coffee' }
                  : {
                      action: 'set',
                      value: source.body,
                      copyPolicy: 'source-exact',
                      sourceSpanIds: ['own:0']
                    }),
              reason: 'Frozen outline',
              claimIds: [],
              ...(field === 'hero_text' ? {} : { sourceSpanIds: [] })
            }))
          )
        }
      return {
        result,
        receipt: {
          requestId: `synthetic-${calls.length}`,
          model: model.config.model,
          modelConfigHash: model.config.hash,
          startedAt: new Date().toISOString(),
          usage: { prompt_tokens: 100, completion_tokens: 50 }
        }
      }
    }
  }
  const context = {
    action,
    lease: { token: 1 },
    mode: 'apply',
    checkAllowed: async () => {
      if (state.stopped) throw Object.assign(new Error('Stopped'), { code: 'QUALITY_STOPPED' })
    }
  }
  return { deps, context, frozen, calls, ledger, state }
}
test(
  'A/B/C freeze evidence before calls, pass actual pixels and resume from the same immutable plan',
  opts,
  async () => {
    const { deps, context, frozen, calls, ledger } = await world()
    const result = await createQualityEditorial(deps).editorialFor(context)(frozen)
    assert.equal(result.reference.state, 'validated')
    assert.deepEqual(calls, ['facts', 'observations', 'outline', 'fields'])
    const saved = (await db.pool.query('select * from wo_quality_run where id=$1', [result.reference.runId]))
      .rows[0]
    assert.equal(saved.artifacts['call-forecast'].ceilingCents, 194)
    assert.equal(saved.input.executionProfile.id, 'bounded-v3')
    assert.equal(saved.input.executionProfile.maxDetailPages, 4)
    assert.equal(
      saved.artifacts.plan.operations.find((o) => o.kind === 'update').fields.hero_text,
      source.body
    )
    assert.equal(Object.keys(saved.artifacts).filter((k) => k.startsWith('paid-slot:')).length, 4)
    const resumed = await createQualityEditorial(deps).editorialFor(context)(frozen)
    assert.deepEqual(resumed, result)
    assert.equal(calls.length, 4)
    assert.equal((await ledger.summary()).spentCents, 4)
    const changed = structuredClone(frozen)
    changed.overlay.name = 'Changed after acceptance'
    await assert.rejects(createQualityEditorial(deps).editorialFor(context)(changed), /PREPARATION_CHANGED/)
  }
)
test(
  'a prepared revision without a profile retains its original limits, hashes and cache on resume',
  opts,
  async () => {
    const { deps, context, frozen, calls } = await world()
    const models = {}
    for (const role of ['facts', 'observations', 'plan', 'review'])
      models[role] = (await deps.loadModel({ role })).config
    const legacy = await prepareQualityRun(db.pool, {
      frozen,
      actionId: context.action.id,
      semanticInput: { asOf: new Date().toISOString(), source: 'legacy fixture' },
      manifest,
      questions: { synthetic: true },
      sources: [source],
      models,
      assets: await deps.prepareAssets({ pool: db.pool, objects: deps.objects, frozen, maxPictures: 24 }),
      policy: await deps.policyFor(),
      mode: 'apply'
    })
    const result = await createQualityEditorial(deps).editorialFor(context)(frozen)
    assert.equal(result.reference.runId, legacy.id)
    const saved = (await db.pool.query('select * from wo_quality_run where id=$1', [legacy.id])).rows[0]
    assert.equal(saved.input.executionProfile, undefined)
    assert.equal(saved.input.models.plan.hash, 'plan')
    assert.equal(saved.artifacts['call-forecast'].ceilingCents, 188)
    assert.equal(saved.artifacts['call-forecast'].assumptions.maxFieldCalls, 11)
    assert.equal(saved.artifacts['call-forecast'].assumptions.reviewCalls, 10)
    assert.deepEqual(await createQualityEditorial(deps).editorialFor(context)(frozen), result)
    assert.equal(calls.length, 4)
  }
)

test(
  'the actual request and settled attempt bind the frozen profile and reject changed limits before egress',
  opts,
  async () => {
    const { deps, context, frozen } = await world()
    const proposed = deps.providerCall
    const sent = []
    deps.providerCall = async (args) =>
      callQualityModel({
        ...args,
        fetchImpl: async (_url, init) => {
          const body = JSON.parse(init.body)
          sent.push(body)
          assert.equal(
            JSON.parse(body.messages[1].content[0].text).executionProfile.hash,
            args.model.config.executionProfile.hash
          )
          assert.equal(args.budget.executionProfileHash, args.model.config.executionProfile.hash)
          assert.equal(body.max_tokens, args.budget.maxOutputTokens)
          assert.equal(body.reasoning_effort, 'high')
          const answer = await proposed(args)
          return Response.json({
            id: answer.receipt.requestId,
            model: args.model.config.model,
            usage: answer.receipt.usage,
            choices: [{ message: { content: JSON.stringify(answer.result) }, finish_reason: 'stop' }]
          })
        }
      })
    const editorial = createQualityEditorial(deps)
    const result = await editorial.editorialFor(context)(frozen)
    const run = (await db.pool.query('select * from wo_quality_run where id=$1', [result.reference.runId]))
      .rows[0]
    const attempts = (await db.pool.query('select * from wo_quality_attempt where run_id=$1', [run.id])).rows
    assert.equal(sent.length, 4)
    assert.equal(sent[0].max_tokens, 12000)
    for (const attempt of attempts) {
      assert.equal(attempt.model_config.executionProfile.hash, run.input.executionProfile.hash)
      assert.equal(attempt.receipt.executionProfileHash, run.input.executionProfile.hash)
      assert.equal(attempt.receipt.budget.executionProfileHash, run.input.executionProfile.hash)
      assert.equal(attempt.input.budget.executionProfileHash, run.input.executionProfile.hash)
    }
    await assert.rejects(
      editorial.paidFor(context, run)('facts', 'a-facts', 'test', {}, [], {
        maxTokens: 4000,
        maxInputTokens: 70001,
        maxImages: 0
      }),
      /EXECUTION_LIMITS_CHANGED/
    )
    assert.equal(sent.length, 4)
  }
)
test(
  'a trusted authority owns the whole paid lifecycle while local preparation needs no provider credential',
  opts,
  async () => {
    const { deps, context, frozen, calls } = await world()
    const load = deps.loadModel
    let remoteCalls = 0
    const editorial = createQualityEditorial({
      ...deps,
      loadModel: async (args) => ({ config: (await load(args)).config }),
      headroom: async ({ context: current }) => {
        assert.equal(current.action.id, context.action.id)
        return { authorityChecked: true }
      },
      paidExecutorFor:
        (current, run) =>
        async (role, _stage, _system, input, images = []) => {
          await current.checkAllowed()
          assert.equal(run.account_id, current.action.account_id)
          remoteCalls++
          return (
            await deps.providerCall({
              model: { config: run.input.models[role] },
              input: qualityExecutionInput(input, run.input.executionProfile),
              images
            })
          ).result
        }
    })
    const result = await editorial.editorialFor(context)(frozen)
    assert.equal(result.reference.state, 'validated')
    assert.equal(remoteCalls, 4)
    assert.deepEqual(calls, ['facts', 'observations', 'outline', 'fields'])
    assert.equal((await db.pool.query('select count(*)::int n from wo_quality_attempt')).rows[0].n, 0)
    assert.equal((await db.pool.query('select count(*)::int n from wo_cost_ledger')).rows[0].n, 0)
  }
)
test(
  'a 54000-token preflight dispatches the identical task, input hash and budget through paidFor',
  opts,
  async () => {
    const { deps, context, frozen } = await world()
    const editorial = createQualityEditorial(deps)
    const result = await editorial.editorialFor(context)(frozen)
    const run = (await db.pool.query('select * from wo_quality_run where id=$1', [result.reference.runId]))
      .rows[0]
    const pixels = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRz8AAAAASUVORK5CYII=',
      'base64'
    )
    const imageHash = createHash('sha256').update(pixels).digest('hex')
    const batchFor = async (length) =>
      (
        await qualityReviewBatches({
          render: {
            hash: 'render',
            contentHash: 'content',
            captures: [{ slices: [{ id: 'slice', route: '/', width: 390, imageHash }] }]
          },
          current: { content: { body: 'x'.repeat(length) } },
          dossier: run.artifacts.dossier,
          observations: run.artifacts.observations,
          modelConfig: run.input.models.review,
          executionProfile: run.input.executionProfile,
          getPixels: async () => pixels
        })
      )[0]
    const base = await batchFor(0)
    const batch = await batchFor(54000 - base.budget.maxInputTokens)
    const inputHash = qualityHash(batch.input),
      inputBytes = JSON.stringify(batch.input)
    assert.equal(batch.budget.maxInputTokens, 54000)
    let requests = 0
    deps.providerCall = async (args) => {
      assert.deepEqual(args.budget, batch.budget)
      assert.equal(JSON.stringify(args.input), inputBytes)
      assert.equal(qualityHash(args.input), inputHash)
      return callQualityModel({
        ...args,
        fetchImpl: async (_url, init) => {
          requests++
          const body = JSON.parse(init.body)
          assert.equal(body.messages[1].content[0].text, inputBytes)
          assert.equal(body.max_tokens, 3000)
          return Response.json({
            model: args.model.config.model,
            id: 'exact-boundary',
            usage: { prompt_tokens: 100, completion_tokens: 50 },
            choices: [{ message: { content: '{"verdict":"pass"}' }, finish_reason: 'stop' }]
          })
        }
      })
    }
    const paid = createQualityEditorial(deps).paidFor(context, run)
    assert.deepEqual(
      await paid(
        'review',
        'd-r0-1',
        QUALITY_REVIEW_SYSTEM,
        batch.input,
        batch.images,
        run.input.executionProfile.localReview
      ),
      { verdict: 'pass' }
    )
    const attempt = (
      await db.pool.query("select * from wo_quality_attempt where run_id=$1 and stage='d-r0-1'", [run.id])
    ).rows[0]
    assert.equal(qualityHash(attempt.input.task), inputHash)
    assert.deepEqual(attempt.input.budget, batch.budget)
    assert.deepEqual(attempt.receipt.budget, batch.budget)
    await paid(
      'review',
      'd-r0-1',
      QUALITY_REVIEW_SYSTEM,
      batch.input,
      batch.images,
      run.input.executionProfile.localReview
    )
    assert.equal(requests, 1)
  }
)

test('an interrupted C call remains held after restart and is never blindly sent twice', opts, async () => {
  const { deps, context, frozen, calls, state, ledger } = await world()
  state.failure = 'outline'
  await assert.rejects(createQualityEditorial(deps).editorialFor(context)(frozen), /interrupted connection/)
  state.failure = null
  await assert.rejects(createQualityEditorial(deps).editorialFor(context)(frozen), /UNCERTAIN/)
  assert.deepEqual(calls, ['facts', 'observations', 'outline'])
  assert.ok((await ledger.summary()).unreconciledCents > 0)
  assert.equal((await db.pool.query('select count(*)::int n from wo_quality_run')).rows[0].n, 1)
})
test(
  'missing picture coverage stops planning; Stop before preparation sends no provider request',
  opts,
  async () => {
    const { deps, context, frozen, calls, state } = await world()
    state.stopped = true
    await assert.rejects(createQualityEditorial(deps).editorialFor(context)(frozen), {
      code: 'QUALITY_STOPPED'
    })
    assert.equal(calls.length, 0)
    state.stopped = false
    state.corruptObservations = true
    await assert.rejects(createQualityEditorial(deps).editorialFor(context)(frozen), /OBSERVATIONS_INVALID/)
    assert.deepEqual(calls, ['facts', 'observations'])
    const saved = (await db.pool.query('select artifacts from wo_quality_run')).rows[0].artifacts
    assert.equal(saved['observations-invalid-1'].ok, false)
    assert.equal(saved.plan, undefined)
  }
)

for (const limit of [10, 80]) {
  test(
    `editorial honors picture ceiling ${limit}, still observes when curation is off, and keeps its 24-picture fence`,
    opts,
    async () => {
      const { deps, context, frozen, calls } = await world()
      frozen.brief = {
        picturePolicy: {
          visionEnabled: false,
          maxVisionPictures: limit,
          handoffMaxPictures: 60,
          missingHeroMode: 'outpaint-and-scene'
        }
      }
      const prepare = deps.prepareAssets
      let ceiling
      const result = await createQualityEditorial({
        ...deps,
        prepareAssets: (args) => {
          ceiling = args.maxPictures
          return prepare(args)
        }
      }).editorialFor(context)(frozen)
      assert.equal(ceiling, Math.min(limit, 24))
      assert.ok(calls.includes('observations'))
      const run = (
        await db.pool.query('select input from wo_quality_run where id=$1', [result.reference.runId])
      ).rows[0]
      assert.equal(run.input.frozen.brief.picturePolicy.maxVisionPictures, limit)
    }
  )
}
