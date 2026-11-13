// The brand step before the site exists (ticket #616): the brand file of the existing brand step, read with the stored
// research brief, is the look the plan shows. The template's accent is shown only for a business with no logo, said as
// such; the black and white case is in domain-brand-look-no-hue.test.mjs. The brand step is scripted; no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { BrandStepError, brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { PlanComposerError, composePlan } from '../domain/plan-composer.mjs'
import {
  fernAndFoxglove,
  harrowLaneBakery,
  quaysidePianoCare,
  saltmarshKayaks
} from './fixtures/plan-composer/invented-brands.mjs'
import {
  blockStore,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const TEMPLATE_ACCENT = template().accent
const compose = (record, extra = {}) => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const run = composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: record,
    model,
    ...extra
  })
  return { model, run }
}

test('a website logo with a dark colour: the lifted accent and the own logo, each with where it came from', async () => {
  const record = brandLookOf(harrowLaneBakery())
  assert.deepEqual(record.accent, {
    hex: '#8a2c6c',
    from: 'logo',
    brandColour: '#3b0f2e',
    say: 'Your plum was made lighter, same hue, so buttons stand out.',
    why: 'The plum of the logo has a visible hue.'
  })
  assert.deepEqual(record.logo, {
    kind: 'own',
    from: 'website',
    source: 'Website',
    mediaId: 'logo-hlb',
    mark: 'cut'
  })
  const { plan, lookSources } = await compose(record).run
  assert.equal(plan.look.accent, '#8a2c6c')
  assert.deepEqual(plan.look.logo, { kind: 'own', source: 'Website' })
  assert.deepEqual(lookSources, {
    accent: { from: 'logo', name: 'Your logo' },
    logo: { from: 'website', name: 'Website' }
  })
  assert.deepEqual(
    plan.assumptions.filter((a) => a.field.startsWith('look.')).map((a) => a.said),
    ['Your plum was made lighter, same hue, so buttons stand out.']
  )
  assert.equal(checkBuildDocument(plan).ok, true)
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources }), [])
})

test('a words only logo found on Instagram: the logo colour as it is, the logo named by its source', async () => {
  const record = brandLookOf(fernAndFoxglove())
  assert.equal(record.accent.hex, '#2f7d5b')
  assert.equal(record.accent.say, null)
  assert.deepEqual(record.logo, {
    kind: 'own',
    from: 'instagram',
    source: 'Instagram profile',
    mediaId: 'logo-ff',
    mark: 'icon'
  })
  const { plan } = await compose(record).run
  assert.equal(plan.look.accent, '#2f7d5b')
  assert.deepEqual(plan.look.logo, { kind: 'own', source: 'Instagram profile' })
  assert.equal(plan.assumptions.filter((a) => a.field.startsWith('look.')).length, 0)
})

test('no logo at all: the made logo and the template accent, each said and recorded as the no logo case', async () => {
  const record = brandLookOf(quaysidePianoCare())
  assert.equal(record.accent.from, 'template-accent-no-logo')
  assert.equal(record.accent.hex, TEMPLATE_ACCENT)
  assert.deepEqual(record.logo, { kind: 'text', from: 'business-name', mark: 'icon' })
  const { plan, lookSources } = await compose(record).run
  assert.equal(plan.look.accent, TEMPLATE_ACCENT)
  assert.equal(plan.look.accentDark, undefined)
  assert.deepEqual(plan.look.logo, { kind: 'text' })
  assert.deepEqual(lookSources.accent, {
    from: 'template-accent-no-logo',
    name: 'The template, as you have no logo'
  })
  assert.deepEqual(
    plan.assumptions.filter((a) => a.field.startsWith('look.')).map((a) => [a.field, a.said]),
    [
      [
        'look.logo',
        "No logo was found, so one was made for you: a simple icon of your trade with your business name, in the template's accent colour."
      ]
    ]
  )
  assert.equal(checkBuildDocument(plan).ok, true)
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources }), [])
  // The same plan with a source that is not the no logo case shows the template's look: flagged.
  assert.deepEqual(
    lookProblemsOf({ plan, template: template(), lookSources: { accent: { from: 'logo' } } }).map(
      (p) => p.code
    ),
    ['template_accent', 'template_look_said']
  )
})

test('a logo with a hue the step could not wear: no rule covers it, so no plan and no model call', async () => {
  const record = brandLookOf(saltmarshKayaks())
  assert.equal(record.accent.from, 'unsettled-kept-template')
  assert.equal(JSON.stringify(record).includes(TEMPLATE_ACCENT), false)
  const { model, run } = compose(record)
  await assert.rejects(
    run,
    (e) => e instanceof PlanComposerError && e.code === 'brand_accent_unsettled' && e.noRerun === true
  )
  assert.equal(model.calls.length, 0)
})

test('a file that is not a brand file of version 10 is refused with a code', () => {
  for (const brandFile of [null, { kind: 'plan' }, { ...harrowLaneBakery().brandFile, version: 9 }])
    assert.throws(
      () => brandLookOf({ brandFile, brief: {} }),
      (e) => e instanceof BrandStepError && e.code === 'brand_file_unreadable'
    )
  const broken = harrowLaneBakery().brandFile
  broken.colours.decision = 'surprise'
  assert.throws(
    () => brandLookOf({ brandFile: broken, brief: {} }),
    (e) => e.code === 'brand_file_unreadable'
  )
})

test('without a record the look is brand_missing, never the template', () => {
  for (const record of [null, undefined, {}, { website: { colors: [{ hex: '#112233' }] } }])
    assert.throws(
      () => lookOfBrandRecord(template(), record),
      (e) => e instanceof PlanComposerError && e.code === 'brand_missing' && e.noRerun === true
    )
})
