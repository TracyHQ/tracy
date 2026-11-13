// A logo in black, white or grey only (ticket #616, the product owner's rule of 13/11): the accent is black on the light
// theme and white on the dark theme, never the template's; the words on an accent button take the template's own colour
// that reads 3:1 on it. The brand step is scripted; no model is called.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { BrandStepError, brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
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
  // Not black on light and white on dark: grey, or the same black on both, is flagged.
  for (const look of [
    { accent: '#808080', accentDark: '#ffffff' },
    { accent: '#000000', accentDark: '#000000' }
  ])
    assert.deepEqual(
      lookProblemsOf({
        plan: { ...plan, look: { ...plan.look, ...look } },
        template: template(),
        lookSources
      }).map((p) => p.code),
      ['neutral_accent']
    )
})

test('3:1 holds: plain words when no template words colour reads; a ground too dark for black stops', () => {
  const plain = brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit({ wordsOn: ['#555555'] }) })
  // #555555 reads on white (the dark theme accent) but not on black: plain white there.
  assert.deepEqual(plain.accent.onAccent, { light: '#ffffff', dark: '#555555' })
  assert.throws(
    () => brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit({ lightGround: '#3a3a3a' }) }),
    (e) => e instanceof BrandStepError && e.code === 'brand_file_unreadable' && /reads/.test(e.message)
  )
})

test('a template with one theme gets that theme colour only: black for light only, white for dark only', () => {
  const light = brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit({ themes: ['light'] }) })
  assert.equal(light.accent.hex, '#000000')
  assert.equal(light.accent.dark, undefined)
  const dark = brandLookOf({ ...inkwellBindery(), kit: lightAndDarkKit({ themes: ['dark'] }) })
  assert.equal(dark.accent.hex, '#ffffff')
  assert.equal(dark.accent.dark, undefined)
  assert.deepEqual(dark.accent.onAccent, { dark: '#000000' })
  const { look, assumptions } = lookOfBrandRecord(template(), dark)
  assert.equal(look.accent, '#ffffff')
  assert.equal('accentDark' in look, false)
  assert.equal(assumptions[0].said, 'Your logo has no colour, so buttons and links are white.')
})

test('without the kit a logo with no hue is not read: the themes and the button words are unknown', () => {
  assert.throws(
    () => brandLookOf(inkwellBindery()),
    (e) => e instanceof BrandStepError && e.code === 'brand_file_unreadable' && e.noRerun === true
  )
})

test('logo colours written without # are read as the step reads them', () => {
  const bare = inkwellBindery()
  bare.brief.brand.colors = bare.brief.brand.colors.map((c) => ({ ...c, hex: c.hex.slice(1) }))
  assert.equal(brandLookOf({ ...bare, kit: lightAndDarkKit() }).accent.from, 'logo-without-hue')
  assert.equal(isNeutral('8a8a8a'), true)
  assert.equal(contrastOf('000000', 'ffffff'), 21)
})
