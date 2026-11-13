// The rules gate of the plan composer (ticket #593): a pure module, tested on compositions of an invented business
// against an invented template. No model is called here.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  COACH,
  PHOTOS,
  REVIEWS,
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const contextWith = ({ store = blockStore(), lib = library() } = {}) =>
  composerContextOf({
    profile: clubProfile(),
    blockStore: store,
    pageRecipes: pageRecipes(),
    library: lib,
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const gate = (composition, options) => gatePlan(composition, contextWith(options))
const codes = (result) => result.problems.map((p) => p.code)
const blocksOf = (plan) => plan.pages.flatMap((p) => p.blocks)
const home = (c) => c.pages[0].blocks
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)

test('a plan that passed the gate passes the Contract B check', () => {
  const result = gate(goodComposition())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('every kept block lists the data items it shows and a reason the customer can read', () => {
  const { plan } = gate(goodComposition())
  for (const block of blocksOf(plan)) {
    assert.ok(block.data.length > 0, block.id)
    assert.ok(block.reason.trim().length > 0 && !DASHES.test(block.reason), block.id)
  }
  const services = blocksOf(plan).find((b) => b.block === 'services-grid')
  assert.deepEqual(services.data, SERVICES)
})

test('rejects a data item that is not in the needs profile', () => {
  const c = goodComposition()
  home(c)[2].data.push('service-padel-nights')
  const result = gate(c)
  assert.equal(result.ok, false)
  assert.deepEqual(codes(result), ['invented_item'])
  assert.equal(result.problems[0].at, 'pages[0].blocks[2].data[4]')
  assert.equal(result.plan, undefined)
})

test('rejects a block with too few items and a block with too many', () => {
  const few = goodComposition()
  home(few)[2].data = [SERVICES[0]]
  assert.deepEqual(codes(gate(few)), ['too_few_items'])

  const store = blockStore()
  store.blocks.find((b) => b.id === 'services-grid').items.max = 3
  assert.deepEqual(codes(gate(goodComposition(), { store })), ['too_many_items'])
})

test('rejects an item of a kind the block type does not show', () => {
  const c = goodComposition()
  home(c)[2].data[3] = REVIEWS[0]
  assert.deepEqual(codes(gate(c)), ['wrong_item_kind'])
})

test('rejects a design typed field target and a field the block does not have', () => {
  const c = goodComposition()
  home(c)[1].targets = ['heading', 'background']
  home(c)[0].targets = ['menu_colour']
  assert.deepEqual(codes(gate(c)).sort(), ['design_field', 'unknown_field'])
})

test('rejects a block without a reason, and a dash in customer text', () => {
  const c = goodComposition()
  home(c)[2].reason = ''
  home(c)[3].reason = `Your photos ${String.fromCharCode(0x2014)} all of them.`
  assert.deepEqual(codes(gate(c)), ['no_reason', 'dash_in_text'])
})

test('a page without its main block is dropped and reported; with no page left the plan is rejected', () => {
  const c = goodComposition()
  c.pages[1].blocks = [
    { block: 'footer-main', label: 'Footer', data: ['business-name'], reason: 'Your name.' }
  ]
  const result = gate(c)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(
    result.plan.pages.map((p) => p.id),
    ['home', 'contact']
  )
  const dropped = result.plan.leftOut.find((e) => e.kind === 'page' && e.what === 'Coaches')
  assert.ok(dropped?.reason)
  // The coach lost the page that showed him: the team block is placed on the home page instead.
  assert.ok(result.placed.some((p) => p.item === COACH && p.how === 'template block of its type'))

  const none = goodComposition()
  none.pages = [none.pages[1]]
  none.pages[0].blocks = [
    { block: 'footer-main', label: 'Footer', data: ['business-name'], reason: 'Your name.' }
  ]
  assert.deepEqual(codes(gate(none)), ['no_pages'])
})

test('extra reviews with no block in the template go to the Tracy library block', () => {
  const { plan, placed } = gate(goodComposition())
  const reviews = blocksOf(plan).find((b) => b.type === 'reviews')
  assert.equal(reviews.source, 'library')
  assert.equal(reviews.block, 'tracy-reviews')
  assert.deepEqual(reviews.data, REVIEWS)
  assert.ok(reviews.reason.length > 0)
  assert.deepEqual(
    placed.map((p) => [p.item, p.how]),
    REVIEWS.map((id) => [id, 'Tracy library block'])
  )
  // Placed before the footer of the home page.
  const homeTypes = plan.pages[0].blocks.map((b) => b.type)
  assert.deepEqual(homeTypes.slice(-2), ['reviews', 'footer'])
})

test('extra reviews fill a template reviews block first, the rest go to the library block', () => {
  const store = blockStore()
  store.blocks.push({
    id: 'quote-single',
    type: 'reviews',
    positions: ['content'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [],
    itemFields: [{ name: 'text', kind: 'quote.text', type: 'text', limit: 200 }]
  })
  const { plan, placed } = gate(goodComposition(), { store })
  assert.deepEqual(
    placed.map((p) => p.how),
    ['template block of its type', 'Tracy library block']
  )
  assert.deepEqual(
    blocksOf(plan)
      .filter((b) => b.type === 'reviews')
      .map((b) => [b.block, b.data.length]),
    [
      ['quote-single', 1],
      ['tracy-reviews', 1]
    ]
  )
})

test('data with no place is reported in the left out list, never dropped silently', () => {
  const result = gate(goodComposition(), { lib: [] })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const reported = result.plan.leftOut.filter((e) => e.kind === 'item')
  assert.deepEqual(
    reported.map((e) => e.what),
    ['Review by Mara Telling', 'Review by Osric Vale']
  )
  for (const entry of reported) assert.match(entry.reason, /reviews/)
})

test('items with no block of their type go to a template block whose fields fit', () => {
  const store = blockStore()
  store.blocks = store.blocks.filter((b) => b.id !== 'services-grid')
  store.blocks.push({
    id: 'menu-list',
    type: 'menu',
    positions: ['content'],
    items: { min: 1, max: 6 },
    noData: { rule: 'hide' },
    fields: [],
    itemFields: [{ name: 'name', kind: 'offering.name', type: 'text', limit: 30 }]
  })
  const c = goodComposition()
  c.pages[0].blocks.splice(2, 1)
  const { plan, placed } = gate(c, { store })
  assert.deepEqual(
    new Set(placed.filter((p) => SERVICES.includes(p.item)).map((p) => p.how)),
    new Set(['template block whose fields fit'])
  )
  assert.deepEqual(blocksOf(plan).find((b) => b.block === 'menu-list').data, SERVICES)
})

test('the plan carries the look, the pictures summary, the assumptions and the left out list', () => {
  const { plan } = gate(goodComposition())
  assert.deepEqual(plan.look, {
    template: { slug: 'example-court', name: 'Example Court', version: '1.0.0' },
    accent: '#1f7a4d',
    logo: { kind: 'own', source: 'Instagram profile' }
  })
  // Frames: the hero photo, three gallery photos and one coach photo. Three own labelled photos, two generated.
  assert.deepEqual(plan.pictures.own, { frames: 3, from: ['Website', 'Google listing', 'Social profile'] })
  assert.equal(plan.pictures.generated.frames, 2)
  assert.ok(plan.pictures.generated.reason)
  // The phone differs between sources: the default taken is an assumption the customer can correct.
  assert.deepEqual(
    plan.assumptions.map((a) => a.field),
    ['facts[contact-phone].value', 'pages[team].name']
  )
  assert.deepEqual(
    plan.leftOut.map((e) => e.what),
    ['Prices page']
  )
  assert.equal(PHOTOS.length, 3)
})
