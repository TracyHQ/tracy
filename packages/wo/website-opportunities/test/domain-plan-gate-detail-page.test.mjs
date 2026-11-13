// P21 on a detail page (#593 follow up): a page that describes one item shows its subject in several blocks (a class
// and its schedule), so the subject is no repeat; any other item shown twice is, and a list page still shows an item
// once. Invented club and template; the real JA Boxing compositions are counted per page type. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-detail-page.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { detailSubjectOf, pageRuleProblems } from '../domain/plan-gate-page-rules.mjs'
import {
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'
import { ANSWERED_LABEL } from './fixtures/write-order/invented-florist.mjs'

/** The invented store with a service detail page type and a second services block. */
function detailContext() {
  const store = blockStore()
  const grid = store.blocks.find((b) => b.id === 'services-grid')
  store.blocks.push(
    { ...structuredClone(grid), id: 'services-list' },
    { ...structuredClone(grid), id: 'service-detail', items: { min: 1, max: 1 } }
  )
  const recipes = pageRecipes()
  recipes.recipes[0].blocks.push('services-list')
  recipes.recipes.push({
    pageType: 'service',
    mainBlock: 'service-detail',
    blocks: ['header-main', 'service-detail', 'services-grid', 'services-list', 'footer-main']
  })
  return composerContextOf({
    profile: clubProfile(),
    blockStore: store,
    pageRecipes: recipes,
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
}
const block = (id, data) => ({ block: id, label: 'Part', data, reason: 'It fits your club.' })
const withDetail = (...blocks) => {
  const c = goodComposition()
  c.pages.push({ pageType: 'service', name: 'Junior coaching', blocks })
  return c
}
const repeats = (c, context = detailContext()) =>
  gatePlan(c, context)
    .problems.filter((p) => p.code === 'item_repeated_on_page')
    .map((p) => p.at)

test('a detail page shows its subject in two blocks: no repeat', () => {
  const c = withDetail(
    block('service-detail', [SERVICES[0]]),
    block('services-grid', [SERVICES[0], SERVICES[1]])
  )
  const context = detailContext()
  assert.equal(detailSubjectOf(c.pages[3], context), SERVICES[0])
  const result = gatePlan(c, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
})

test('another item shown twice on a detail page is still a repeat', () => {
  const c = withDetail(
    block('service-detail', [SERVICES[0]]),
    block('services-grid', [SERVICES[0], SERVICES[1]]),
    block('services-list', [SERVICES[1], SERVICES[2]])
  )
  assert.deepEqual(repeats(c), ['pages[3].blocks[2].data[0]'])
})

test('a list page still shows an item once: the home page is no detail page', () => {
  const c = goodComposition()
  c.pages[0].blocks.splice(3, 0, block('services-list', [SERVICES[3], SERVICES[0]]))
  const context = detailContext()
  assert.equal(detailSubjectOf(c.pages[0], context), null)
  assert.deepEqual(repeats(c, context), ['pages[0].blocks[3].data[0]', 'pages[0].blocks[3].data[1]'])
})

test('JA Boxing: no item_repeated_on_page on the real compositions, per page type', () => {
  const context = composerContextOf({
    profile: boxingProfile(),
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true
  })
  const { profile } = context
  const plain = boxingComposition(boxingProfile())
  // The write order case: a class page shows its class in the class block and in its schedule block.
  const schedule = boxingComposition(boxingProfile())
  schedule.pages[2].blocks.push(block('block-159', [profile.items.service[0].id]))
  const counts = {}
  for (const composition of [plain, schedule]) {
    const problems = []
    pageRuleProblems(composition, context, (code, at) => problems.push({ code, at }))
    composition.pages.forEach((page, i) => {
      const n = problems.filter(
        (p) => p.code === 'item_repeated_on_page' && p.at.startsWith(`pages[${i}].`)
      ).length
      counts[page.pageType] = (counts[page.pageType] ?? 0) + n
    })
  }
  console.log(`JA Boxing item_repeated_on_page per page type: ${JSON.stringify(counts)}`)
  assert.deepEqual(counts, { home: 0, classes: 0, class: 0, contact: 0 })
  assert.equal(detailSubjectOf(schedule.pages[2], context), profile.items.service[0].id)
})

test('a trainer page: its one trainer in two blocks is no repeat; with two in its main block, no subject', () => {
  const profile = boxingProfile()
  profile.items.person = ['Tamsin Reed', 'Odile Brask'].map((name) => ({
    id: `person-${name.toLowerCase().replace(' ', '-')}`,
    kind: 'person',
    fields: { 'person.name': { value: name, sources: ['site'] } },
    sources: ['site']
  }))
  const context = composerContextOf({
    profile,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true
  })
  const [one, two] = profile.items.person.map((p) => p.id)
  const trainer = (main, more) => {
    const c = boxingComposition(profile)
    c.pages.push({
      pageType: 'trainer',
      name: 'Trainer',
      blocks: [block('block-180', main), block('block-182', more)]
    })
    return c
  }
  const single = trainer([one], [one, two])
  assert.equal(detailSubjectOf(single.pages[5], context), one)
  assert.deepEqual(repeats(single, context), [])
  const pair = trainer([one, two], [one])
  assert.equal(detailSubjectOf(pair.pages[5], context), null)
  assert.deepEqual(repeats(pair, context), ['pages[5].blocks[1].data[0]'])
})
