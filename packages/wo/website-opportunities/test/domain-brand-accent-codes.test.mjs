// The accent line of a plan's assumptions carries a stable code (#575 walk: the accent line stayed English on a
// Vietnamese card while the logo line beside it was translated by its code). Invented brands; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-accent-codes.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { ACCENT_CODES, accentCodeOf } from '../domain/brand-accent-codes.mjs'
import { brandLookOf } from '../domain/brand-before-site.mjs'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { harrowLaneBakery } from './fixtures/plan-composer/invented-brands.mjs'
import {
  blockStore,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

test('a logo colour made lighter: the accent line says so by its code, with the direction', async () => {
  const { plan } = await composePlan({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brandLookOf(harrowLaneBakery()),
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  const accent = plan.assumptions.find((a) => a.id === 'accent')
  assert.equal(accent.code, ACCENT_CODES.moved)
  assert.deepEqual(accent.params, { direction: 'lighter' })
  // The plan's own sentence stays: an English card reads it as the brand step wrote it.
  assert.equal(accent.said, 'Your plum was made lighter, same hue, so buttons stand out.')
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('every accent source code knows a line for has a code', () => {
  const colours = { accent: '#111111', accentDark: null, brandColour: '#3b0f2e' }
  assert.deepEqual(accentCodeOf('logo', { ...colours, accent: '#2a0a20' }), {
    code: ACCENT_CODES.moved,
    params: { direction: 'darker' }
  })
  assert.deepEqual(accentCodeOf('logo', { ...colours, accent: '#3b0f2e' }), { code: ACCENT_CODES.same })
  assert.deepEqual(accentCodeOf('logo', { ...colours, brandColour: null }), {})
  assert.deepEqual(accentCodeOf('logo-without-hue', { ...colours, accentDark: '#ffffff' }), {
    code: ACCENT_CODES.noHue,
    params: { colours: 'both' }
  })
  assert.deepEqual(accentCodeOf('logo-hue-unreadable', { ...colours, accent: '#ffffff' }), {
    code: ACCENT_CODES.unreadable,
    params: { colours: 'white' }
  })
  assert.equal(accentCodeOf('logo-colours-unmeasured', colours).code, ACCENT_CODES.unmeasured)
  assert.equal(accentCodeOf('template-accent-kept', colours).code, ACCENT_CODES.templateKept)
})
