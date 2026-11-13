// The wiring of the build chat's engine to #616's brand step before the site (`build-draft-wiring.js`): which inputs it
// hands the step, and the stop when the draft lacks one. The step itself is a fake; its own tests are
// `brand-before-site.test.mjs`. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-wiring.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftBrandStep, kitRefOf, noPreSiteResearch } from '../src/build-draft-wiring.js'

const template = { slug: 'example-court', name: 'Example Court', version: '1.0.0' }
const kits = [{ ref: 'example-court/j6/0.9.0' }, { ref: 'example-court/j6/1.0.0' }, { ref: 'other/j6/1.0.0' }]
const record = { schema: 'tracy-brand-look/v1', accent: { from: 'logo', hex: '#1f7a4d' } }

test('the kit ref of a template is the step chain kit of its slug and version, or null', () => {
  assert.equal(kitRefOf(template, kits), 'example-court/j6/1.0.0')
  assert.equal(kitRefOf({ ...template, version: '2.0.0' }, kits), null)
})

test('the brand step gets the research revision, the kit ref and the site language, and answers its record', async () => {
  const calls = []
  const step = draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('the fake run needs no steps'),
    brandBeforeSite: async (input) => (calls.push(input), { record, records: [] }),
    kitRefOf: (t) => kitRefOf(t, kits)
  })
  const research = {
    revisionId: '11111111-2222-4333-8444-555555555555',
    profile: { language: { value: 'en' } }
  }
  assert.deepEqual(await step({ research, template }), record)
  assert.deepEqual(calls, [
    { revisionId: research.revisionId, kitRef: 'example-court/j6/1.0.0', siteLanguage: 'en' }
  ])
})

test('without a research revision or a kit the step stops with brand_input_missing, never runs', async () => {
  const step = draftBrandStep({
    pool: null,
    stepsOf: () => assert.fail('no run starts'),
    kitRefOf: (t) => kitRefOf(t, kits)
  })
  await assert.rejects(step({ research: { profile: {} }, template }), {
    code: 'brand_input_missing',
    noRerun: true
  })
  await assert.rejects(step({ research: { revisionId: 'r' }, template: { ...template, version: '9.9.9' } }), {
    code: 'brand_input_missing'
  })
  await assert.rejects(noPreSiteResearch(), { code: 'research_unavailable', noRerun: true })
})
