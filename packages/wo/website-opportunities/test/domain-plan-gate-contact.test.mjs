// Contact channels on the contact page (P13, #593 review): places are counted per kind per block, a channel beyond the
// places is left out or placed elsewhere instead of failing the plan, and a block that needs items (the library reviews
// block) is no place for a channel. Real JA Boxing recipes, invented florist. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-contact.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'
import { ANSWERED_LABEL } from './fixtures/write-order/invented-florist.mjs'

const ADDRESSES = ['contact-address', 'contact-address-2', 'contact-address-3']
const contextOf = (profile, recipes = boxingRecipes) =>
  composerContextOf({
    profile,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: recipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true
  })
const codes = (result) => (result.problems ?? []).map((p) => p.code)
const contactPage = (c) => c.pages.find((p) => p.pageType === 'contact')

test('three addresses and one address place per block: the extra ones are no failure, never shown twice in a place', () => {
  const profile = boxingProfile()
  const { sources } = profile.facts['contact.address'][0]
  profile.facts['contact.address'] = ['7 Wrenfield Row', '2 Moss Lane', '3 Reed Court'].map((value) => ({
    value,
    sources,
    confidence: 'single-source'
  }))
  const c = boxingComposition(profile)
  contactPage(c)
    .blocks.find((b) => b.block === 'contact-details')
    .data.push('contact-address-2', 'contact-address-3')
  const result = gatePlan(c, contextOf(profile))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const details = result.plan.pages
    .find((p) => p.pageType === 'contact')
    .blocks.find((b) => b.block === 'contact-details')
  assert.deepEqual(
    details.data.filter((id) => ADDRESSES.includes(id)),
    ['contact-address']
  )
  // An address the places cannot hold is left out with a true reason: none is lost without a word.
  const shown = new Set(result.plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const left = result.plan.leftOut.filter((e) => e.what === 'Address')
  assert.equal(left.length, ADDRESSES.filter((id) => !shown.has(id)).length)
  assert.deepEqual(left[0], {
    what: 'Address',
    kind: 'feature',
    reason: 'Every place the template has for your address on the pages of your site is taken already.'
  })
})

test('social links with no fact block for them on the template: no contact_channel_missing; with one, it is named', () => {
  const profile = boxingProfile()
  delete profile.items.quote
  const recipes = structuredClone(boxingRecipes)
  for (const r of recipes.recipes) {
    r.blocks = r.blocks.filter((id) => id !== 'block-171')
    for (const v of r.variants ?? []) v.blocks = v.blocks.filter((id) => id !== 'block-171')
  }
  const without = boxingComposition(profile)
  for (const p of without.pages) p.blocks = p.blocks.filter((b) => b.block !== 'block-171')
  const result = gatePlan(without, contextOf(profile, recipes))
  assert.equal(codes(result).includes('contact_channel_missing'), false, JSON.stringify(result.problems))
  // The real recipes list block-171 on the contact page: the message names it, and doing so passes.
  const refused = gatePlan(without, contextOf(profile)).problems.filter(
    (p) => p.code === 'contact_channel_missing'
  )
  assert.equal(refused.length, 3)
  assert.match(refused[0].message, /block block-171 of that page has a free place for it/)
  assert.equal(gatePlan(boxingComposition(profile), contextOf(profile)).ok, true)
})
