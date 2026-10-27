import assert from 'node:assert/strict'
import { test } from 'node:test'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'
import {
  blindReviewInput,
  qualityGate,
  validateQualityReview
} from '../src/opportunities-build/quality-review.js'

const content = { hero: 'Cafe', about: 'Open 7AM to 10PM' },
  contentHash = qualityHash(content)
const render = {
  hash: 'render',
  captures: [1440, 390].map((width) => ({
    route: '/',
    width,
    status: 200,
    imageHash: `image-${width}`,
    textHash: 'text',
    captureComplete: true,
    contentHash
  }))
}
const input = blindReviewInput({
  dossier: { accountId: 'a', facts: [{ id: 'opening-hours' }] },
  observations: { pictures: [] },
  content,
  render,
  planner: { verdict: 'pass' }
})
const report = () => ({
  schemaVersion: 'tracy-wo-review/v1',
  contentHash,
  renderHash: render.hash,
  coverage: render.captures.map(({ route, width, imageHash }) => ({ route, width, imageHash })),
  findings: [],
  verdict: 'pass'
})
test('initial review input contains actual content/evidence and no planner verdict', () => {
  assert.equal(Object.hasOwn(input, 'planner'), false)
  assert.equal(
    validateQualityReview(report(), input, { requiredRoutes: ['/'] }).artifact.state,
    'ready-for-human'
  )
})
test('missing screenshots, missing mobile coverage, stale content and invalid JSON cannot pass', () => {
  for (const r of [
    null,
    { ...report(), contentHash: 'stale' },
    { ...report(), coverage: report().coverage.slice(0, 1) }
  ])
    assert.equal(validateQualityReview(r, input, { requiredRoutes: ['/'] }).artifact.state, 'needs-attention')
  const missing = { ...input, render: { ...render, captures: render.captures.slice(0, 1) } }
  assert.equal(
    validateQualityReview(report(), missing, { requiredRoutes: ['/'] }).artifact.state,
    'needs-attention'
  )
})
test('happy-hour and whisky findings need real render evidence and prevent a pass', () => {
  const r = report()
  r.findings = [
    {
      id: 'happyhour',
      severity: 'critical',
      dimension: 'facts',
      message: 'Opening hours were called happy hour',
      route: '/',
      width: 390,
      imageHash: 'image-390',
      evidence: 'About says happy hour 7AM–10PM; source says opening hours',
      selector: '.about',
      claimRefs: ['opening-hours']
    },
    {
      id: 'whisky',
      severity: 'major',
      dimension: 'pictures',
      message: 'A wine scene illustrates whisky',
      route: '/',
      width: 1440,
      imageHash: 'image-1440',
      evidence: 'The screenshot shows red wine and a meal',
      selector: '.story-card',
      claimRefs: []
    }
  ]
  const checked = validateQualityReview(r, input, { requiredRoutes: ['/'] })
  assert.equal(checked.ok, true)
  assert.equal(checked.artifact.state, 'needs-attention')
  r.findings[0].imageHash = 'invented'
  assert.equal(validateQualityReview(r, input, { requiredRoutes: ['/'] }).ok, false)
})
test('a reviewer cannot smuggle a write or call a crop failure without location evidence', () => {
  const r = report()
  r.findings = [
    {
      id: 'crop',
      severity: 'major',
      dimension: 'mobile',
      message: 'Unreadable crop',
      route: '/',
      width: 390,
      imageHash: 'image-390',
      evidence: 'Subject cut off',
      sql: 'update'
    }
  ]
  const checked = validateQualityReview(r, input, { requiredRoutes: ['/'] })
  assert.ok(checked.errors.includes('REVIEW_FINDING_AUTHORITY'))
  assert.ok(checked.errors.includes('REVIEW_FINDING_EVIDENCE'))
})
test('mechanical success alone, incomplete coverage or later edits keep the demo at attention', () => {
  const semantic = validateQualityReview(report(), input, { requiredRoutes: ['/'] }).artifact
  const mechanical = { pass: true, complete: true }
  assert.equal(qualityGate({ mechanical, currentContentHash: contentHash }).state, 'needs-attention')
  assert.equal(qualityGate({ mechanical, semantic, currentContentHash: 'new-edit' }).state, 'needs-attention')
  assert.equal(
    qualityGate({ mechanical, semantic, currentContentHash: contentHash, requiredCoverageBlocked: true })
      .state,
    'needs-attention'
  )
  const good = qualityGate({ mechanical, semantic, currentContentHash: contentHash })
  assert.equal(good.state, 'ready-for-human')
  assert.equal(good.humanAcceptance, 'pending')
  assert.equal(good.outreach, false)
})

test('unsupported booking can be reported without inventing a source claim, but invented IDs fail', () => {
  const r = report()
  r.findings = [
    {
      id: 'booking',
      severity: 'major',
      dimension: 'cta',
      message: 'Booking promise has no verified booking channel',
      route: '/',
      width: 390,
      imageHash: 'image-390',
      evidence:
        'The visible Book now button promises a reservation; the complete dossier has no booking fact.',
      selector: 'a.booking',
      claimRefs: []
    }
  ]
  assert.equal(validateQualityReview(r, input, { requiredRoutes: ['/'] }).ok, true)
  assert.equal(validateQualityReview(r, input, { requiredRoutes: ['/'] }).artifact.state, 'needs-attention')
  r.findings[0].claimRefs = ['invented-booking']
  assert.ok(
    validateQualityReview(r, input, { requiredRoutes: ['/'] }).errors.includes('REVIEW_FINDING_CLAIM_UNKNOWN')
  )
})

test('identical pixel hashes at different slice positions still require each image ID, and malformed coverage is invalid data', () => {
  const requiredImages = ['slice-top', 'slice-bottom'].map((imageId) => ({
    route: '/',
    width: 390,
    imageHash: 'same-pixels',
    imageId
  }))
  const slicedInput = { ...input, render: { ...input.render, reviewImages: requiredImages } }
  const missing = { ...report(), coverage: requiredImages.slice(0, 1) }
  assert.equal(validateQualityReview(missing, slicedInput, { requiredImages }).ok, false)
  assert.equal(
    validateQualityReview({ ...missing, coverage: requiredImages }, slicedInput, { requiredImages }).ok,
    true
  )
  assert.equal(
    validateQualityReview({ ...report(), coverage: [null] }, input, { requiredRoutes: ['/'] }).ok,
    false
  )
})
