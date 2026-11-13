// A logo in black, white or grey only (ticket #616, the product owner's rule of 13/11): the accent is black on the light
// theme and white on the dark theme, never the template's; the words on an accent button take the template's own colour
// that reads 3:1 on it. The brand step is scripted; no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { BrandStepError, brandLookOf } from '../domain/brand-before-site.mjs'
import { chromaOf, contrastOf, isNeutral } from '../domain/brand-hue.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { inkwellBindery, lightAndDarkKit } from './fixtures/plan-composer/invented-brands.mjs'
import {
  blockStore,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

test('the hue measure holds the values of the brand step it copies', () => {
  assert.equal(chromaOf('#042515'), 0.0495)
  assert.equal(chromaOf('#1a1a1a'), 0)
  assert.equal(isNeutral('#8a8a8a'), true)
  assert.equal(isNeutral('#042515'), false)
  assert.equal(contrastOf('#000000', '#ffffff'), 21)
})

test('a black and grey logo on a light and dark template: black on light, white on dark, with the words that read', async () => {
  const record = brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit() })
  assert.deepEqual(record.accent, {
    hex: '#000000',
    dark: '#ffffff',
    onAccent: { light: '#ffffff', dark: '#000000' },
    from: 'logo-without-hue',
    brandColour: null,
    say: null,
    why: 'Both logo colours have no visible hue, so the template accent stays.'
  })
  assert.equal(JSON.stringify(record).includes(template().accent), false)
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan, lookSources } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: record,
    model
  })
  assert.equal(plan.look.accent, '#000000')
  assert.equal(plan.look.accentDark, '#ffffff')
  assert.deepEqual(plan.look.logo, { kind: 'own', source: 'Facebook page' })
  assert.deepEqual(
    plan.assumptions.filter((a) => a.field.startsWith('look.')).map((a) => a.said),
    [
      'Your logo has no colour, so buttons and links are black on the light theme and white on the dark theme.'
    ]
  )
  assert.equal(checkBuildDocument(plan).ok, true)
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources }), [])
  // Black without its source, or without the dark theme's white, is flagged.
  assert.deepEqual(
    lookProblemsOf({ plan, template: template(), lookSources: { accent: { from: 'logo' } } }).map(
      (p) => p.code
    ),
    ['neutral_accent']
  )
  const single = { ...plan, look: { ...plan.look, accentDark: undefined } }
  assert.deepEqual(
    lookProblemsOf({ plan: single, template: template(), lookSources }).map((p) => p.code),
    ['neutral_accent']
  )
})

test('3:1 holds: no template words colour reads on the accent, or a light theme ground too dark for black', () => {
  for (const kit of [lightAndDarkKit({ wordsOn: ['#555555'] }), lightAndDarkKit({ lightGround: '#3a3a3a' })])
    assert.throws(
      () => brandLookOf({ ...inkwellBindery(), kit }),
      (e) => e instanceof BrandStepError && e.code === 'brand_file_unreadable' && /reads/.test(e.message)
    )
})

test('without the kit the pair is still black and white, with no words colour chosen', () => {
  const record = brandLookOf(inkwellBindery())
  assert.equal(record.accent.hex, '#000000')
  assert.equal(record.accent.dark, '#ffffff')
  assert.equal(record.accent.onAccent, undefined)
})
