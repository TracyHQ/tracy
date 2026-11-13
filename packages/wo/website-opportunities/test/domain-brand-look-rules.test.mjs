// The look rules of #616 the review asked for: a kept accent that is the logo's own colour, a logo the brand step made,
// the look check's cross checks, and the plan gate holding a model's line to the same check. Invented businesses; the
// model is scripted.
import assert from 'node:assert/strict'
import test from 'node:test'
import { brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { PlanComposerError, composePlan } from '../domain/plan-composer.mjs'
import {
  fernAndFoxglove,
  quaysidePianoCare,
  saltmarshKayaks
} from './fixtures/plan-composer/invented-brands.mjs'
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

const codes = (problems) => problems.map((p) => p.code)

test("a kept accent that is a colour measured from the logo is the logo's colour, not unsettled", () => {
  const kayaks = saltmarshKayaks()
  kayaks.brandFile.colours.accent = '#2A6F97'
  const record = brandLookOf(kayaks)
  assert.equal(record.accent.from, 'logo')
  assert.equal(record.accent.hex, '#2a6f97')
  assert.equal(lookOfBrandRecord(template(), record).look.accent, '#2a6f97')
})

test("a logo whose own colour is the template's accent composes a plan with it, recorded as the logo's", async () => {
  const kayaks = saltmarshKayaks()
  kayaks.brief.brand.colors = [{ hex: template().accent, role: 'primary' }]
  const record = brandLookOf(kayaks)
  assert.equal(record.accent.from, 'logo')
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan: composed, lookSources } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: record,
    model
  })
  assert.equal(composed.look.accent, template().accent)
  assert.deepEqual(lookProblemsOf({ plan: composed, template: template(), lookSources }), [])
  assert.deepEqual(codes(lookProblemsOf({ plan: composed, template: template(), lookSources: {} })), [
    'template_accent'
  ])
  assert.equal(lookSources.accent.sameAsTemplate, true)
  // A logo source that does not say the colour is the template's too is not enough.
  const unsaid = { accent: { from: 'logo' } }
  assert.deepEqual(codes(lookProblemsOf({ plan: composed, template: template(), lookSources: unsaid })), [
    'template_accent'
  ])
})

test('a lettermark, or any mark with the temporary logo task, is a made logo: a text logo said as temporary', () => {
  const lettermark = fernAndFoxglove()
  lettermark.brandFile.logo.mark.decision = 'lettermark'
  const tasked = fernAndFoxglove()
  tasked.brandFile.ownerTasks = [{ kind: 'replace-temporary-logo' }]
  for (const input of [lettermark, tasked]) {
    const record = brandLookOf(input)
    assert.equal(record.logo.kind, 'made')
    assert.equal(record.logo.mediaId, 'logo-ff')
    const { look, assumptions, sources } = lookOfBrandRecord(template(), record)
    assert.deepEqual(look.logo, { kind: 'text' })
    assert.equal(sources.logo.from, 'made-temporary')
    assert.match(
      assumptions.find((a) => a.field === 'look.logo').said,
      /^Your logo could not be used as it is/
    )
  }
})

const plan = (look, said = []) => ({
  look: { template: { slug: 'example-court', name: 'Example Court', version: '1.0.0' }, ...look },
  assumptions: said.map((s, i) => ({ id: `a${i}`, field: 'look.accent', said: s }))
})

test("the look check cross checks the logo's kind with its recorded source", () => {
  const own = { from: 'website' }
  const made = { from: 'made-temporary' }
  const accent = { accent: { from: 'logo' } }
  const ok = (look, logo) =>
    codes(lookProblemsOf({ plan: plan(look), template: template(), lookSources: { ...accent, logo } }))
  assert.deepEqual(ok({ accent: '#2f7d5b', logo: { kind: 'own', source: 'Website' } }, own), [])
  assert.deepEqual(ok({ accent: '#2f7d5b', logo: { kind: 'text' } }, made), [])
  assert.deepEqual(ok({ accent: '#2f7d5b', logo: { kind: 'own', source: 'Website' } }, made), [
    'template_logo'
  ])
  assert.deepEqual(ok({ accent: '#2f7d5b', logo: { kind: 'text' } }, own), ['template_logo'])
  assert.deepEqual(ok({ accent: '#2f7d5b', logo: { kind: 'own', source: 'Example Court' } }, own), [
    'template_logo'
  ])
})

test('a line about the demo logo or the template logo is caught, in every case', () => {
  for (const said of ['We kept the demo logo for now.', 'The logo of the template stays.']) {
    const problems = lookProblemsOf({
      plan: plan({ accent: '#225588', logo: { kind: 'text' } }, [said]),
      template: template(),
      lookSources: { accent: { from: 'template-accent-no-logo' }, logo: { from: 'made-temporary' } }
    })
    assert.deepEqual(codes(problems), ['template_look_said'])
  }
})

test('a no logo plan on a template whose own accent is black is not a neutral accent', () => {
  const black = { ...template(), accent: '#111111' }
  const problems = lookProblemsOf({
    plan: plan({ accent: '#111111', logo: { kind: 'text' } }),
    template: black,
    lookSources: { accent: { from: 'template-accent-no-logo' }, logo: { from: 'made-temporary' } }
  })
  assert.deepEqual(problems, [])
  const record = brandLookOf({ ...quaysidePianoCare() })
  record.accent.hex = '#111111'
  assert.equal(lookOfBrandRecord(black, record).look.accent, '#111111')
})

test("the plan gate holds the model's lines to the look check: a line naming the template accent is composed again", async () => {
  const naming = goodComposition()
  naming.assumptions.push({ field: 'look.accent', said: 'Buttons use the template accent #225588.' })
  const model = scriptedModel(JSON.stringify(naming), JSON.stringify(naming))
  await assert.rejects(
    composePlan({
      profile: clubProfile(),
      blockStore: blockStore(),
      pageRecipes: pageRecipes(),
      library: library(),
      template: template(),
      brand: brand(),
      model
    }),
    (e) =>
      e instanceof PlanComposerError &&
      e.code === 'plan_gate_failed' &&
      JSON.stringify(e.details).includes('template_look_said')
  )
  assert.equal(model.calls.length, 2)
})

test('the template fallback of the tests is not held to the look check', async () => {
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan: composed } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    allowTemplateLook: true,
    model
  })
  assert.equal(composed.look.accent, template().accent)
})
