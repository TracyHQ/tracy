// Rules the gate holds a composed plan to, beyond counts and kinds (ticket #593, review findings): recipes, one block
// per page, left out items, facts in item blocks, design typed fields, every dash. No model is called here.
import assert from 'node:assert/strict'
import test from 'node:test'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const context = () =>
  composerContextOf({
    profile: clubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const codes = (change) => {
  const c = goodComposition()
  change(c)
  return gatePlan(c, context()).problems.map((p) => p.code)
}

test('a block may not sit on a page type whose recipe does not list it; a library block may sit anywhere', () => {
  assert.deepEqual(
    codes((c) =>
      c.pages[1].blocks.push({
        block: 'hero-home',
        label: 'Top',
        data: ['business-name'],
        reason: 'Your name.'
      })
    ),
    ['block_not_in_recipe']
  )
  const lib = goodComposition()
  lib.pages[1].blocks.push({
    block: 'tracy-reviews',
    label: 'Reviews',
    data: ['quote-friendly-coaches-and-the-courts-are-always-swept'],
    reason: 'What players say about your coaches.'
  })
  assert.equal(gatePlan(lib, context()).ok, true)
})

test('a block may not appear twice on one page: Contract A declares no repetition', () => {
  assert.deepEqual(
    codes((c) =>
      c.pages[0].blocks.push({ ...structuredClone(c.pages[0].blocks[4]), data: ['contact-email'] })
    ),
    ['block_repeated']
  )
})

test('an item the model leaves out may not also be shown', () => {
  assert.deepEqual(
    codes((c) => c.leftOut.push({ item: SERVICES[0], reason: 'Not this one.' })),
    ['left_out_but_shown']
  )
})

test('a fact sits in an item block only where the block declares a field of its kind', () => {
  assert.deepEqual(
    codes((c) => c.pages[0].blocks[2].data.push('contact-phone')),
    ['fact_without_field']
  )
  assert.deepEqual(
    codes((c) => (c.pages[1].blocks[0].data = ['contact-phone'])),
    ['too_few_items', 'fact_without_field']
  )
})

test('no data of the kept plan can address a design typed field', () => {
  assert.deepEqual(
    codes((c) => (c.pages[0].blocks[1].targets = ['background'])),
    ['design_field']
  )
  // A key outside the block shape (here `fields`) is refused, not silently dropped.
  assert.deepEqual(
    codes((c) => (c.pages[0].blocks[1].fields = { background: 'red' })),
    ['reply_shape']
  )
  const { plan } = gatePlan(goodComposition(), context())
  for (const block of plan.pages.flatMap((p) => p.blocks))
    assert.deepEqual(Object.keys(block), ['id', 'type', 'block', 'source', 'label', 'data', 'reason'])
})

test('every dash is refused in customer text: en, em, figure, horizontal bar and minus', () => {
  for (const code of [0x2012, 0x2013, 0x2014, 0x2015, 0x2212]) {
    const dash = String.fromCharCode(code)
    assert.deepEqual(
      codes((c) => (c.pages[0].blocks[1].reason = `Your name${dash}first.`)),
      ['dash_in_text'],
      code.toString(16)
    )
    assert.deepEqual(
      codes((c) => (c.pages[0].name = `Home${dash}page`)),
      ['dash_in_text']
    )
    assert.deepEqual(
      codes((c) => (c.leftOut[0].reason = `None${dash}yet.`)),
      ['dash_in_text']
    )
  }
})

test('a fact standing for an item field is never placed in a block by the model', () => {
  const ctx = composerContextOf({
    profile: conflictedClubProfile(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand()
  })
  const c = goodComposition()
  c.pages[0].blocks[4].data.push('person-ilse-varrow-person-role')
  assert.deepEqual(
    gatePlan(c, ctx).problems.map((p) => p.code),
    ['item_field_fact']
  )
})
