import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  centeredCrop,
  validateCrop,
  validateObservations,
  validatePlacement
} from '../src/opportunities-build/quality-pictures.js'
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/wo-quality-corpus.json', import.meta.url))
).cases.find((c) => c.id === 'wrong-image-and-crop')
const asset = { id: 'photo-wine', sha256: 'a'.repeat(64), width: 1200, height: 800, accountId: 'a' }
const observation = {
  id: asset.id,
  contentHash: asset.sha256,
  tags: ['people', 'red-wine', 'dining-board'],
  description: fixture.observation.description,
  uncertain: fixture.observation.uncertain,
  quality: 'good',
  focalPoint: { x: 0.05, y: 0.5 },
  visibleText: ''
}
const slot = { id: 'story', width: 400, height: 800, primary: true }
const placement = {
  slotId: 'story',
  assetId: asset.id,
  intent: 'whisky',
  requiredTags: ['drink'],
  alt: 'A whisky selection',
  caption: '',
  crop: { x: 400, y: 0, width: 400, height: 800 }
}
const args = {
  planHash: 'plan',
  accountId: 'a',
  slots: [slot],
  assets: [asset],
  observations: { hash: 'observed', pictures: [observation] },
  placements: [placement]
}
test('holdout whisky regression: a wine/dining scene cannot illustrate a whisky card', () => {
  const result = validatePlacement(args)
  assert.equal(result.ok, fixture.expect.imageAccepted)
  assert.ok(result.errors.includes('PLACEMENT_SUBJECT_MISMATCH'))
  assert.ok(result.errors.includes('PLACEMENT_IDENTITY_UNPROVEN'))
})
test('holdout crop regression: a narrow centre crop losing the observed subject is refused', () => {
  const result = validateCrop({ asset, slot, crop: placement.crop, focalPoint: observation.focalPoint })
  assert.equal(result.ok, fixture.expect.cropAccepted)
  assert.ok(result.errors.includes('CROP_LOSES_SUBJECT'))
})
test('honest generic intent and focus-preserving crop can pass', () => {
  const crop = centeredCrop(asset, slot, observation.focalPoint)
  // A focus at the image edge can still fail: do not silently claim a usable crop.
  assert.equal(validateCrop({ asset, slot, crop, focalPoint: observation.focalPoint }).ok, true)
  const p = {
    ...placement,
    intent: 'A shared meal',
    requiredTags: ['dining-board'],
    alt: 'A person pours wine beside a dining board',
    crop
  }
  assert.equal(validatePlacement({ ...args, placements: [p] }).ok, true)
})
test('main image reuse on different cards, foreign assets and missing slots are refused', () => {
  const p = {
    ...placement,
    intent: 'Meal',
    requiredTags: ['dining-board'],
    alt: 'Meal',
    crop: centeredCrop(asset, slot, observation.focalPoint)
  }
  assert.ok(
    validatePlacement({
      ...args,
      slots: [slot, { ...slot, id: 'hero' }],
      placements: [p, { ...p, slotId: 'hero' }]
    }).errors.includes('PLACEMENT_PRIMARY_DUPLICATE')
  )
  assert.equal(validatePlacement({ ...args, accountId: 'b' }).ok, false)
  assert.equal(validatePlacement({ ...args, placements: [] }).ok, false)
})
test('observations require every actual content hash, bounded focal point and no invented identity field', () => {
  const result = { schemaVersion: 'tracy-wo-observations/v1', inputHash: 'input', pictures: [observation] }
  const scope = { accountId: 'a', inputHash: 'input', modelConfigHash: 'model' }
  assert.equal(validateObservations(result, [asset], scope).ok, true)
  for (const change of [
    { pictures: [] },
    { inputHash: 'stale' },
    { pictures: [{ ...observation, verifiedIdentity: 'whisky' }] },
    { pictures: [{ ...observation, contentHash: 'b'.repeat(64) }] }
  ])
    assert.equal(validateObservations({ ...result, ...change }, [asset], scope).ok, false)
})
