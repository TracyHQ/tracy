import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildQualityDossier } from '../src/opportunities-build/quality-dossier.js'
import { qualityManifest } from '../src/opportunities-build/quality-plan.js'
import {
  mergeQualityBatches,
  qualityAttemptSchedule,
  qualityFieldBatches,
  validateQualityOutline
} from '../src/opportunities-build/quality-planner.js'

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
      home: [
        { slug: 'home', data: { title: 'Home', hero_text: 'Industrial sample', hero_image: 'sample-image' } }
      ]
    },
    menus: [{ id: 'primary', name: 'primary', locale: 'en', items: [{ url: '/', label: 'Home' }] }]
  }
})
const dossier = buildQualityDossier({
  accountId: 'a',
  at: '2026-10-20T00:00:00Z',
  sources: [{ id: 'own', kind: 'official-website', body: 'Coffee by the river.' }]
})
const observations = {
  hash: 'pixels',
  pictures: [
    { id: 'coffee', contentHash: sha, tags: ['coffee'] },
    { id: 'wine', contentHash: 'b'.repeat(64), tags: ['red-wine'] }
  ]
}
const context = { manifest, dossier, observations }
const draft = () => ({
  schemaVersion: 'tracy-wo-outline/v1',
  inputHash: dossier.inputHash,
  manifestHash: manifest.hash,
  observationHash: observations.hash,
  locale: 'en',
  otherLocales: 'empty-by-policy',
  message: 'Coffee by the river',
  records: [
    {
      key: 'home/home@en',
      state: 'planned',
      reason: 'Main page',
      direction: 'Show coffee honestly',
      claimIds: [],
      sourceSpanIds: ['own:0'],
      imageIntents: [
        { field: 'hero_image', intent: 'Coffee', candidateAssetIds: ['coffee'], requiredTags: ['coffee'] }
      ]
    }
  ],
  navigation: [{ menuId: 'primary', items: [{ label: 'Home', url: '/' }], reason: 'Main page' }],
  terms: [],
  unresolved: []
})
const outline = () => validateQualityOutline(draft(), context).artifact
const result = (batch, locked) => ({
  schemaVersion: 'tracy-wo-fields/v1',
  outlineHash: locked.hash,
  batchHash: batch.hash,
  unresolved: [],
  fields: batch.groups.flatMap((g) =>
    g.fields.map((field) => ({
      key: g.key,
      field,
      ...(field === 'title'
        ? { action: 'preserve' }
        : field === 'hero_image'
          ? { action: 'image', assetId: 'coffee', imageIntent: 'Coffee' }
          : {
              action: 'set',
              value: 'Coffee by the river.',
              copyPolicy: 'source-exact',
              sourceSpanIds: ['own:0']
            }),
      reason: 'Frozen outline',
      claimIds: [],
      ...(field === 'hero_text' ? {} : { sourceSpanIds: [] })
    }))
  )
})

test('C1 rejects invented evidence, missing image intent and wine substituted for coffee before C2', () => {
  const p = draft()
  assert.equal(validateQualityOutline(p, context).ok, true)
  p.records[0].claimIds = ['invented']
  assert.ok(validateQualityOutline(p, context).errors.includes('OUTLINE_EVIDENCE_SCOPE'))
  p.records[0].claimIds = []
  p.records[0].imageIntents[0].candidateAssetIds = ['wine']
  assert.ok(validateQualityOutline(p, context).errors.includes('OUTLINE_IMAGE_SCOPE'))
  p.records[0].imageIntents = []
  assert.ok(validateQualityOutline(p, context).errors.includes('OUTLINE_IMAGE_UNCOVERED'))
  assert.equal(validateQualityOutline({ records: {} }, context).ok, false)
})
test('bounded C2 preserves semantic field groups and merges only the complete locked outline', () => {
  const locked = outline(),
    batches = qualityFieldBatches({ outline: locked, manifest, maxEstimatedTokens: 1000 })
  const hero = batches.flatMap((b) => b.groups).find((g) => g.section === 'hero')
  assert.deepEqual(hero.fields, ['hero_text', 'hero_image'])
  const results = batches.map((b) => result(b, locked))
  const merged = mergeQualityBatches({ ...context, outline: locked, batches, results })
  assert.deepEqual(merged.errors, [])
  assert.equal(merged.artifact.operations[0].fields.hero_text, 'Coffee by the river.')
  const altered = structuredClone(results)
  altered.at(-1).fields.pop()
  assert.throws(
    () => mergeQualityBatches({ ...context, outline: locked, batches, results: altered }),
    /FIELD_MISSING/
  )
  const drift = structuredClone(results)
  drift[0].outlineHash = 'other'
  assert.throws(
    () => mergeQualityBatches({ ...context, outline: locked, batches, results: drift }),
    /BATCH_IDENTITY/
  )
})
test('C2 refuses evidence expansion and image reinterpretation, even with a valid asset id', () => {
  const locked = outline(),
    batches = qualityFieldBatches({ outline: locked, manifest })
  const results = batches.map((b) => result(b, locked))
  results[0].fields.find((f) => f.field === 'hero_image').assetId = 'wine'
  assert.throws(() => mergeQualityBatches({ ...context, outline: locked, batches, results }), /IMAGE_DRIFT/)
  results[0].fields.find((f) => f.field === 'hero_image').assetId = 'coffee'
  results[0].fields.find((f) => f.field === 'hero_text').claimIds = ['new-claim']
  assert.throws(
    () => mergeQualityBatches({ ...context, outline: locked, batches, results }),
    /EVIDENCE_DRIFT/
  )
})
test('call schedule leaves room for both shared repairs, review and one initial schema repair', () => {
  const schedule = qualityAttemptSchedule({ batchCount: 12, observationBatches: 4, reviewCalls: 2 })
  assert.equal(schedule.calls.repairs, 6)
  assert.equal(schedule.total, 27)
  assert.throws(
    () => qualityAttemptSchedule({ batchCount: 20, observationBatches: 6, reviewCalls: 4, maxAttempts: 32 }),
    /HEADROOM/
  )
  assert.equal(
    qualityAttemptSchedule({ batchCount: 11, observationBatches: 4, reviewCalls: 10, maxAttempts: 64 }).total,
    50
  )
})
