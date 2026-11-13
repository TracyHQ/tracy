// Problems the model cannot fix are never sent to it (ticket #593): the look, the language, the block store (Contract
// A), the library and the needs profile are checked before the call, each with its own code and zero model calls. And
// `plan_gate_failed` carries `noRerun`: it already includes its own second attempt (#591). Scripted fake model only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PlanComposerError, composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const inputs = (model, overrides = {}) => ({
  profile: clubProfile(),
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club',
  model,
  ...overrides
})
const change = (make, edit) => {
  const value = make()
  edit(value)
  return value
}

const CASES = {
  // The template fallback (tests only) with a template that has no usable accent.
  look_incomplete: [
    {
      template: { slug: 'example-court', name: 'Example Court', version: '1.0.0' },
      brand: null,
      allowTemplateLook: true
    },
    { template: undefined },
    { template: { ...template(), accent: 'teal' }, brand: null, allowTemplateLook: true }
  ],
  // The product path: no brand step result, or one that is not the brand step's record (#616).
  brand_missing: [{ brand: null }, { brand: undefined }, { brand: { website: { colors: [] } } }],
  block_store_invalid: [
    {
      blockStore: change(
        blockStore,
        (s) => (s.blocks[1].fields[0].limit = { demo: 'Welcome to the demo club' })
      )
    },
    { blockStore: change(blockStore, (s) => (s.blocks[1].items.min = { demo: 'Welcome' })) },
    { pageRecipes: change(pageRecipes, (r) => r.recipes[0].blocks.push({ demo: 'Welcome' })) },
    { blockStore: change(blockStore, (s) => (s.blocks[1].fields[2].kind = 'business.tagline')) },
    { blockStore: null },
    { pageRecipes: { schema: 'tracy-ai-quickstart-page-recipes/v1', recipes: [null] } }
  ],
  library_invalid: [{ library: [{ id: 'tracy-reviews', type: 'reviews' }] }, { library: 'tracy-reviews' }],
  language_invalid: [{ profile: change(clubProfile, (p) => (p.language.value = 'Klingon dialect')) }],
  profile_empty: [
    { profile: change(clubProfile, (p) => (p.facts = {})) },
    { profile: change(clubProfile, (p) => Object.assign(p, { facts: {}, items: {} })) },
    { profile: change(clubProfile, (p) => (p.sources = [])) }
  ]
}

for (const [code, cases] of Object.entries(CASES))
  test(`${code}: a typed error before the model call, with zero calls and noRerun`, async () => {
    for (const overrides of cases) {
      const model = scriptedModel(JSON.stringify(goodComposition()), JSON.stringify(goodComposition()))
      await assert.rejects(
        composePlan(inputs(model, overrides)),
        (e) => e instanceof PlanComposerError && e.code === code && e.noRerun === true,
        JSON.stringify(Object.keys(overrides))
      )
      assert.equal(model.calls.length, 0)
    }
  })

test('demo strings planted in a broken block store never reach the model: the store is refused first', async () => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  await assert.rejects(
    composePlan(inputs(model, CASES.block_store_invalid[0])),
    (e) => e.code === 'block_store_invalid'
  )
  assert.equal(model.calls.length, 0)
})

test('plan_gate_failed carries noRerun; a model call that throws does not', async () => {
  const bad = goodComposition()
  bad.pages[0].blocks[2].data.push('service-padel-nights')
  await assert.rejects(
    composePlan(inputs(scriptedModel(JSON.stringify(bad), JSON.stringify(bad)))),
    (e) => e instanceof PlanComposerError && e.code === 'plan_gate_failed' && e.noRerun === true
  )
  const throwing = async () => {
    throw new Error('the model service is busy')
  }
  await assert.rejects(
    composePlan(inputs(throwing)),
    (e) => !(e instanceof PlanComposerError) && e.noRerun === undefined
  )
})
