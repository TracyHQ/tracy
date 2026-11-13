// Page rules the gate restores from the locked planner (#593 follow up: P13, P14, P16, P21): one item per page, every
// contact channel on the contact page, a form only with somewhere to send it, a map only with the address. Invented
// club and template; the real JA Boxing store is checked for false positives. No model is called here.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-page-rules.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'
import { ANSWERED_LABEL } from './fixtures/write-order/invented-florist.mjs'

/** The invented store with a sign-up form and a map block the home recipe lists. */
function storeWithFormAndMap() {
  const store = blockStore()
  store.blocks.push(
    {
      id: 'signup-strip',
      type: 'newsletter',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [{ name: 'heading', type: 'text', kind: 'editorial.heading' }]
    },
    {
      id: 'map-home',
      type: 'map',
      items: { min: 1, max: 1 },
      noData: { rule: 'hide' },
      fields: [{ name: 'address', type: 'text', kind: 'contact.address' }]
    }
  )
  const recipes = pageRecipes()
  recipes.recipes[0].blocks.push('signup-strip', 'map-home')
  return { store, recipes }
}
const contextWith = ({ profile = clubProfile(), store = blockStore(), recipes = pageRecipes() } = {}) =>
  composerContextOf({
    profile,
    blockStore: store,
    pageRecipes: recipes,
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const codes = (composition, options) =>
  gatePlan(composition, contextWith(options)).problems.map((p) => p.code)
const block = (id, data) => ({ block: id, label: 'Part', data, reason: 'It fits your club.' })
const without = (kind) => {
  const profile = clubProfile()
  delete profile.facts[kind]
  return profile
}

test('the good composition passes every restored page rule', () => {
  assert.deepEqual(codes(goodComposition()), [])
})

test('P21: an item is shown by one block of a page, never two; another page may show it again', () => {
  const store = blockStore()
  store.blocks.push({
    ...structuredClone(store.blocks.find((b) => b.id === 'services-grid')),
    id: 'services-list'
  })
  const recipes = pageRecipes()
  recipes.recipes[0].blocks.push('services-list')
  const c = goodComposition()
  c.pages[0].blocks.splice(3, 0, block('services-list', [SERVICES[3], SERVICES[0]]))
  const result = gatePlan(c, contextWith({ store, recipes }))
  assert.deepEqual(
    result.problems.map((p) => [p.code, p.at]),
    [
      ['item_repeated_on_page', 'pages[0].blocks[3].data[0]'],
      ['item_repeated_on_page', 'pages[0].blocks[3].data[1]']
    ]
  )
  // The same review on two pages is not a repeat.
  const review = 'quote-my-two-kids-love-the-junior-coaching'
  const pages = goodComposition()
  pages.pages[0].blocks.splice(3, 0, block('tracy-reviews', [review]))
  pages.pages[1].blocks.push(block('tracy-reviews', [review]))
  assert.deepEqual(codes(pages), [])
})

test('P13: every contact channel with a place on the contact page is on it; a header kept on any page counts', () => {
  const c = goodComposition()
  c.pages[2].blocks[0].data = ['contact-phone']
  const result = gatePlan(c, contextWith())
  assert.deepEqual(
    result.problems.map((p) => [p.code, p.at]),
    [['contact_channel_missing', 'pages[2]']]
  )
  assert.match(result.problems[0].message, /contact-address/)
  // The booking link sits in the header of the home page, drawn on every page; the email has no field there.
  const header = goodComposition()
  header.pages[0].blocks[0].data = ['business-name']
  assert.deepEqual(codes(header), ['contact_channel_missing'])
  // A site with no contact page asks nothing.
  const noContact = goodComposition()
  noContact.pages.pop()
  assert.deepEqual(codes(noContact), [])
})

test('P16: a form is kept only when the business has an email its answers can go to', () => {
  const { store, recipes } = storeWithFormAndMap()
  const c = goodComposition()
  c.pages[0].blocks.push(block('signup-strip', ['business-name']))
  assert.deepEqual(codes(c, { store, recipes }), [])
  const noEmail = goodComposition()
  noEmail.pages[0].blocks.push(block('signup-strip', ['business-name']))
  noEmail.pages[2].blocks[0].data = ['contact-phone', 'contact-address']
  assert.deepEqual(codes(noEmail, { store, recipes, profile: without('contact.email') }), [
    'form_without_destination'
  ])
})

test('P14: a map block is kept only when it shows the address fact', () => {
  const { store, recipes } = storeWithFormAndMap()
  const c = goodComposition()
  c.pages[0].blocks.push(block('map-home', ['contact-address']))
  assert.deepEqual(codes(c, { store, recipes }), [])
  const noAddress = goodComposition()
  noAddress.pages[0].blocks.push(block('map-home', ['contact-phone']))
  assert.deepEqual(codes(noAddress, { store, recipes }), ['map_without_address'])
})

test('JA Boxing: the florist composition on the real block store passes the gate on its first attempt', async () => {
  const reply = JSON.stringify(boxingComposition(boxingProfile()))
  const { attempts } = await composePlan({
    profile: boxingProfile(),
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true,
    model: scriptedModel(reply)
  })
  assert.deepEqual(attempts, [{ problems: [] }])
  // Without its footer, the contact page loses the social profiles only the footer has a field for.
  const cut = boxingComposition(boxingProfile())
  cut.pages[0].blocks = cut.pages[0].blocks.filter((b) => b.block !== 'block-171')
  cut.pages[4].blocks = cut.pages[4].blocks.filter((b) => b.block !== 'block-171')
  const twice = await composePlan({
    profile: boxingProfile(),
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true,
    model: scriptedModel(JSON.stringify(cut), reply)
  })
  assert.deepEqual([...new Set(twice.attempts[0].problems.map((p) => p.code))], ['contact_channel_missing'])
  assert.equal(twice.attempts.length, 2)
})
