// Stable codes beside the English sentences code writes into plan data (pictures estimate, source kinds of own
// pictures, the logo source line and the logo assumptions), and the optional keys of Contract B that carry them.
// Invented businesses only; no model is called except the scripted fake one.
import assert from 'node:assert/strict'
import test from 'node:test'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { generatedOf, lookOf } from '../domain/plan-look-pictures.mjs'
import {
  fernAndFoxglove,
  harrowLaneBakery,
  quaysidePianoCare
} from './fixtures/plan-composer/invented-brands.mjs'
import { firstPlan } from './fixtures/plan-composer/plan-request.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

const look = (file) => lookOfBrandRecord(template(), brandLookOf(file))
const problemsOf = (plan) => checkBuildDocument(plan).problems.map((p) => `${p.at}: ${p.message}`)

test('the pictures estimate has a code and the count, one sentence for one picture and for many', () => {
  const many = generatedOf(4)
  assert.deepEqual([many.code, many.params, many.frames], ['pictures_generated_estimate', { count: 4 }, 4])
  assert.match(many.reason, /^About 4 pictures will be created where you have no suitable photo\./)
  const one = generatedOf(1)
  assert.deepEqual(one.params, { count: 1 })
  assert.match(one.reason, /^About 1 picture will be created/)
  assert.deepEqual(generatedOf(0), { frames: 0 })
})

test('a composed plan carries the estimate code with the real count and the kinds of the own photo sources', async () => {
  const { plan } = await firstPlan()
  const { generated, own } = plan.pictures
  assert.equal(generated.code, 'pictures_generated_estimate')
  assert.deepEqual(generated.params, { count: generated.frames })
  assert.equal(own.fromKinds.length, own.from.length)
  assert.deepEqual(own.fromKinds, ['website', 'google', 'social'])
  assert.deepEqual(problemsOf(plan), [])
})

test('a drawn logo: its source line has a code and the source kind, its assumption a code and parameters', () => {
  const { look: planLook, assumptions } = look(fernAndFoxglove())
  assert.deepEqual([planLook.logo.code, planLook.logo.sourceKind], ['logo_source_drawn', 'instagram'])
  const said = assumptions.find((a) => a.field === 'look.logo')
  assert.equal(said.code, 'logo_drawn')
  assert.deepEqual(said.params, { reason: 'new-symbol-drawn', sourceKind: 'instagram' })
  const bakery = look(harrowLaneBakery())
  assert.equal(bakery.look.logo.sourceKind, 'website')
  assert.equal(bakery.assumptions.find((a) => a.field === 'look.logo').params.reason, 'symbol-cut-from-logo')
})

test('a made logo: a text logo with no source line, its assumption says it is temporary by code', () => {
  const { look: planLook, assumptions } = look(quaysidePianoCare())
  assert.deepEqual(planLook.logo, { kind: 'text' })
  const said = assumptions.find((a) => a.field === 'look.logo')
  assert.equal(said.code, 'logo_made')
  assert.deepEqual(said.params, { found: false, mark: 'icon' })
})

test('the old fallback look (tests only) names an own logo by code and source kind', () => {
  const brand = { logoResearch: { chosen: { source: 'facebook' } } }
  const { look: fallback } = lookOf(template(), brand, { allowTemplateLook: true })
  assert.deepEqual(fallback.logo, {
    kind: 'own',
    source: 'Facebook page',
    code: 'logo_source_own',
    sourceKind: 'facebook'
  })
})

test('Contract B takes the new keys, keeps a plan without them valid, and refuses a bad code or parameter', async () => {
  const { plan } = await firstPlan()
  const bare = structuredClone(plan)
  delete bare.pictures.generated.code
  delete bare.pictures.generated.params
  delete bare.pictures.own.fromKinds
  for (const a of bare.assumptions) {
    delete a.code
    delete a.params
  }
  delete bare.look.logo.code
  delete bare.look.logo.sourceKind
  assert.deepEqual(problemsOf(bare), [])
  const bad = structuredClone(plan)
  bad.pictures.generated.code = 'Has Spaces'
  bad.pictures.generated.params = { count: 1.5 }
  bad.pictures.own.fromKinds = ['Web Site']
  bad.assumptions[0].params = { a: 1 }
  const found = problemsOf(bad).join('\n')
  for (const at of ['generated.code', 'generated.params.count', 'own.fromKinds', 'assumptions['])
    assert.ok(found.includes(at), at)
  assert.ok(found.includes('belong to a code'))
})
