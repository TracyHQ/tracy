import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { before, beforeEach, after, test } from 'node:test'
import { prepareQualityRun, loadQualityPreparation } from '../src/opportunities-build/quality-preparation.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import {
  qualityExecutionProfile,
  qualityExecutionModel
} from '../src/opportunities-build/quality-execution-profile.js'
import { fileDb } from './_db.mjs'
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' },
  db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const accountId = randomUUID(),
  opportunityId = randomUUID(),
  revisionId = randomUUID(),
  actionId = randomUUID()
const args = () => ({
  frozen: {
    id: revisionId,
    account_id: accountId,
    opportunity_id: opportunityId,
    raw_sources: [{ body: 'Original evidence' }]
  },
  actionId,
  semanticInput: { accountId, opportunityId, sources: ['Original evidence'] },
  manifest: { hash: 'manifest' },
  questions: { languages: ['en'] },
  models: { editorial: { hash: 'model' } },
  mode: 'apply',
  policy: { maxAttempts: 32, accountDailyCapCents: 50, maxRunMs: 172800000 }
})
test(
  'two preparers persist one frozen envelope before calls and a restart reads the original evidence',
  opts,
  async () => {
    const [a, b] = await Promise.all([prepareQualityRun(db.pool, args()), prepareQualityRun(db.pool, args())])
    assert.equal(a.id, b.id)
    const row = await loadQualityPreparation(db.pool, { accountId, opportunityId, revisionId })
    assert.equal(row.input.frozen.raw_sources[0].body, 'Original evidence')
    assert.equal(row.input_hash, qualityHash(row.input))
    const changed = args()
    changed.frozen.raw_sources[0].body = 'Refreshed mutable source'
    await assert.rejects(prepareQualityRun(db.pool, changed), /PREPARATION_CHANGED/)
    assert.equal(
      await loadQualityPreparation(db.pool, { accountId: randomUUID(), opportunityId, revisionId }),
      null
    )
    await assert.rejects(
      loadQualityPreparation(db.pool, { accountId, opportunityId: randomUUID(), revisionId }),
      /PREPARATION_SCOPE/
    )
  }
)
test(
  'a rebuild gets its own revision envelope while sharing the original semantic allowance',
  opts,
  async () => {
    const a = await prepareQualityRun(db.pool, args()),
      next = args()
    next.frozen.id = randomUUID()
    next.actionId = randomUUID()
    next.models.editorial.hash = 'changed-model'
    const b = await prepareQualityRun(db.pool, next)
    assert.notEqual(a.id, b.id)
    assert.equal(a.intent_id, b.intent_id)
    assert.equal(b.input.frozen.id, next.frozen.id)
    assert.notEqual(a.revision_id, b.revision_id)
    assert.equal((await db.pool.query('select count(*)::int n from wo_quality_intent')).rows[0].n, 1)
  }
)
test('a failed revision reservation rolls back its new semantic generation too', opts, async () => {
  const a = await prepareQualityRun(db.pool, args()),
    changed = args()
  changed.frozen.id = randomUUID()
  changed.semanticInput.sources = ['Changed by the user']
  changed.expectedIntentId = a.intent_id
  // An invalid action id is rejected by the typed run insert after the root was tentatively added.
  changed.actionId = 'invalid-uuid'
  await assert.rejects(prepareQualityRun(db.pool, changed), /uuid/)
  assert.equal((await db.pool.query('select count(*)::int n from wo_quality_intent')).rows[0].n, 1)
  assert.equal((await db.pool.query('select count(*)::int n from wo_quality_run')).rows[0].n, 1)
})

test(
  'a new revision freezes the approved profile without reinterpreting a legacy revision or minting allowance',
  opts,
  async () => {
    const legacy = await prepareQualityRun(db.pool, args())
    const next = args()
    next.frozen.id = randomUUID()
    next.actionId = randomUUID()
    next.executionProfile = qualityExecutionProfile()
    next.models.editorial = qualityExecutionModel(next.models.editorial, next.executionProfile)
    const frozen = await prepareQualityRun(db.pool, next)
    assert.equal(frozen.intent_id, legacy.intent_id)
    assert.equal(frozen.input.executionProfile.hash, next.executionProfile.hash)
    assert.equal(frozen.input.models.editorial.executionProfile.hash, next.executionProfile.hash)
    assert.notEqual(frozen.input_hash, legacy.input_hash)
    assert.equal(
      (await loadQualityPreparation(db.pool, { accountId, opportunityId, revisionId })).input
        .executionProfile,
      undefined
    )
    assert.equal((await prepareQualityRun(db.pool, next)).id, frozen.id)
    const changed = structuredClone(next)
    changed.executionProfile = qualityExecutionProfile('legacy-v1')
    const { executionProfile: _old, hash: _hash, ...base } = changed.models.editorial
    changed.models.editorial = qualityExecutionModel(base, changed.executionProfile)
    await assert.rejects(prepareQualityRun(db.pool, changed), /PREPARATION_CHANGED/)
    const tampered = structuredClone(frozen.input)
    tampered.executionProfile.localReview.maxInputTokens++
    await assert.rejects(
      db.pool.query('update wo_quality_run set input=$2,input_hash=$3 where id=$1', [
        frozen.id,
        JSON.stringify(tampered),
        qualityHash(tampered)
      ]),
      /quality input is immutable/
    )
    assert.equal(
      (await loadQualityPreparation(db.pool, { accountId, opportunityId, revisionId: next.frozen.id })).input
        .executionProfile.hash,
      next.executionProfile.hash
    )
    assert.equal((await db.pool.query('select count(*)::int n from wo_quality_intent')).rows[0].n, 1)
  }
)
