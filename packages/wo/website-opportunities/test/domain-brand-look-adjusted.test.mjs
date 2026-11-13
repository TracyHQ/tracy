// A logo with a hue the brand step could not wear (ticket #616, D44): the logo's hue is kept and only its lightness
// moves (its chroma only as far as the colour space needs) until buttons read 3:1 on every theme the template has, the
// light and the dark theme each on its own. No lightness that reads: black on light and white on dark (the no hue rule).
// Never the template's accent. Invented brands and kits; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-look-adjusted.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { BrandStepError, brandLookOf, lookOfBrandRecord } from '../domain/brand-before-site.mjs'
import { MIN_RATIO, contrastOf, hueDistance, oklchOf } from '../domain/brand-hue.mjs'
import { adjustedAccentOf, logoColourOf } from '../domain/brand-look-adjust.mjs'
import { lookProblemsOf } from '../domain/brand-look-problems.mjs'
import { PlanComposerError } from '../domain/plan-composer-error.mjs'
import { lemonGroveCider, lightAndDarkKit } from './fixtures/plan-composer/invented-brands.mjs'
import { template } from './fixtures/plan-composer/invented-club.mjs'

const LEMON = '#fff3a8'
const reads = (accent, ground) => contrastOf(accent, ground) >= MIN_RATIO
const sameHue = (a, b) => hueDistance(oklchOf(a).h, oklchOf(b).h) < 3

test('a pale lemon logo on a light and dark template: darker on light, as it is on dark, buttons read', () => {
  const record = brandLookOf({ ...lemonGroveCider(), kit: lightAndDarkKit() })
  const { accent } = record
  assert.equal(accent.from, 'logo-adjusted')
  assert.equal(accent.brandColour, LEMON)
  assert.ok(reads(accent.hex, '#fafafa') && reads(accent.onAccent.light, accent.hex), accent.hex)
  assert.ok(reads(accent.dark, '#141414') && reads(accent.onAccent.dark, accent.dark), accent.dark)
  assert.ok(sameHue(LEMON, accent.hex) && sameHue(LEMON, accent.dark))
  assert.ok(oklchOf(accent.hex).L < oklchOf(LEMON).L, 'darker on the light theme')
  assert.notEqual(accent.hex, template().accent)
  const { look, assumptions, sources } = lookOfBrandRecord(template(), record)
  assert.deepEqual([look.accent, look.accentDark], [accent.hex, accent.dark])
  assert.equal(sources.accent.from, 'logo-adjusted')
  const said = assumptions.find((a) => a.id === 'accent').said
  assert.match(said, /colour of your logo/)
  assert.match(said, /darker/)
  assert.match(said, /readable/)
  assert.deepEqual(
    lookProblemsOf({ plan: { look, assumptions }, template: template(), lookSources: sources }),
    []
  )
})

test('a pale lemon logo on a light only template: one accent, darker', () => {
  const record = brandLookOf({ ...lemonGroveCider(), kit: lightAndDarkKit({ themes: ['light'] }) })
  assert.equal(record.accent.from, 'logo-adjusted')
  assert.equal(record.accent.dark, undefined)
  assert.ok(reads(record.accent.hex, '#fafafa') && sameHue(LEMON, record.accent.hex))
  assert.equal('accentDark' in lookOfBrandRecord(template(), record).look, false)
})

test('a pale lemon logo on a dark only template: one accent, read on the dark ground', () => {
  const record = brandLookOf({ ...lemonGroveCider(), kit: lightAndDarkKit({ themes: ['dark'] }) })
  assert.equal(record.accent.from, 'logo-adjusted')
  assert.equal(record.accent.dark, undefined)
  assert.ok(reads(record.accent.hex, '#141414') && reads(record.accent.onAccent.dark, record.accent.hex))
  assert.ok(sameHue(LEMON, record.accent.hex))
})

test('no lightness of the hue reads (a stubbed requirement): black on light and white on dark, never the template', () => {
  const kit = lightAndDarkKit()
  assert.equal(
    adjustedAccentOf(LEMON, kit, { minRatio: 19 }),
    null,
    'no colour of the hue reads 19:1 on both sides'
  )
  const record = brandLookOf({ ...lemonGroveCider(), kit, minRatio: 19 })
  assert.deepEqual(
    [record.accent.hex, record.accent.dark, record.accent.from],
    ['#000000', '#ffffff', 'logo-hue-unreadable']
  )
  const { look, assumptions, sources } = lookOfBrandRecord(template(), record)
  assert.match(
    assumptions.find((a) => a.id === 'accent').said,
    /black on the light theme and white on the dark theme/
  )
  assert.deepEqual(
    lookProblemsOf({ plan: { look, assumptions }, template: template(), lookSources: sources }),
    []
  )
})

test('which logo colour: the one the brief marks as the accent, else the most chromatic', () => {
  const brand = (colors, accent) => ({ brand: { colorsFrom: 'logo', colors, ...(accent ? { accent } : {}) } })
  assert.equal(
    logoColourOf(
      brand([
        { hex: '#2a6f97', role: 'primary' },
        { hex: '#e8c547', role: 'accent' }
      ])
    ),
    '#e8c547'
  )
  assert.equal(logoColourOf(brand([{ hex: '#2a6f97' }], { hex: '#d0402b' })), '#d0402b')
  assert.equal(logoColourOf(brand([{ hex: '#8fa0a8' }, { hex: '#d0402b' }, { hex: '#222222' }])), '#d0402b')
  // A marked accent with no hue gives way to the most chromatic colour.
  assert.equal(logoColourOf(brand([{ hex: '#f5f5f5', role: 'accent' }, { hex: '#2a6f97' }])), '#2a6f97')
  assert.equal(logoColourOf({ brand: { colors: [{ hex: '#2a6f97' }] } }), null, 'not measured from the logo')
})

test('a logo whose colours were never measured stays an error, with a clear code and no rerun', () => {
  const unmeasured = lemonGroveCider()
  delete unmeasured.brief.brand.colorsFrom
  const record = brandLookOf({ ...unmeasured, kit: lightAndDarkKit() })
  assert.throws(
    () => lookOfBrandRecord(template(), record),
    (e) => e instanceof PlanComposerError && e.code === 'brand_logo_colours_unmeasured' && e.noRerun === true
  )
})

test('without the kit an adjusted accent is not read: the themes and the button words are unknown', () => {
  assert.throws(
    () => brandLookOf(lemonGroveCider()),
    (e) => e instanceof BrandStepError && e.code === 'brand_file_unreadable' && e.noRerun === true
  )
})

test('an adjusted colour equal to the template accent is the logo colour, not a template accent', () => {
  const plan = { look: { accent: template().accent }, assumptions: [] }
  const sources = { accent: { from: 'logo-adjusted', sameAsTemplate: true } }
  assert.deepEqual(lookProblemsOf({ plan, template: template(), lookSources: sources }), [])
  const unmarked = { accent: { from: 'logo-adjusted' } }
  assert.deepEqual(
    lookProblemsOf({ plan, template: template(), lookSources: unmarked }).map((p) => p.code),
    ['template_accent']
  )
})
