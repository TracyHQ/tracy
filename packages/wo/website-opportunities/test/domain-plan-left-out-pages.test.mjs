// The template's pages the plan does not keep are listed by code (#575 walk, fourth round): two identical walks gave 9
// and 16 left out lines because the model named pages in the owner's language and a matcher read English page names.
// Now the pages are the template's page types minus the plan's, a detail page never listed, the reason from the data,
// and the model's page entries never reach the plan, whatever their words. The JA Boxing recipes and block store; the
// invented florist. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-pages.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  PAGE_NOT_PLANNED,
  PAGE_NOTHING_TO_SHOW,
  detailPageTypesOf,
  kitPagesLeftOut,
  pageNameOf
} from '../domain/plan-left-out-pages.mjs'
import { boxingProfile, boxingRecipes, boxingStore } from './fixtures/write-order/boxing-florist.mjs'
import { composition, contactPage, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

const recipes = new Map(boxingRecipes.recipes.map((r) => [r.pageType, r]))
const blocks = new Map(boxingStore.blocks.map((b) => [b.id, b]))

test('the pages of one item each are the detail pages; list, home, about and contact pages are not', () => {
  const detail = detailPageTypesOf(recipes, blocks)
  for (const type of ['news-post', 'author', 'class', 'learning-post', 'trainer'])
    assert.ok(detail.has(type), type)
  for (const type of ['home', 'news', 'authors', 'trainers', 'learning-center', 'about', 'contact', 'plans'])
    assert.equal(detail.has(type), false, type)
})

test('the pages left out are the template page types the plan does not keep, each with the reason the data gives', () => {
  const data = contextOf(boxingProfile()).data
  const out = kitPagesLeftOut({
    recipes,
    blocks,
    data,
    pages: [{ pageType: 'home' }, { pageType: 'contact' }]
  })
  // In the template's page order; no detail page; the florist has services (the classes page) and no posts or people.
  assert.deepEqual(
    out.map((e) => [e.params.page, e.code]),
    [
      ['News', 'page_nothing_to_show'],
      ['Featured posts', 'page_nothing_to_show'],
      ['Authors', 'page_nothing_to_show'],
      ['Classes', 'page_not_planned'],
      ['Plans', 'page_nothing_to_show'],
      ['About', 'page_not_planned'],
      ['Learning center', 'page_nothing_to_show'],
      ['Trainers', 'page_nothing_to_show']
    ]
  )
  assert.deepEqual(out[3], {
    what: 'Classes page',
    kind: 'page',
    reason: PAGE_NOT_PLANNED.reason,
    code: PAGE_NOT_PLANNED.code,
    params: { page: 'Classes' }
  })
  assert.equal(out[0].reason, PAGE_NOTHING_TO_SHOW.reason)
  // A page type the caller reports already (one the owner removed) is not listed again.
  const except = new Set(['about', 'news'])
  const rest = kitPagesLeftOut({ recipes, blocks, data, pages: [{ pageType: 'home' }], except })
  assert.equal(
    rest.some((e) => ['About', 'News', 'Home'].includes(e.params.page)),
    false
  )
  assert.equal(pageNameOf('learning-center'), 'Learning center')
})

/** The florist's home and contact pages, with the model's left out page entries `pages`. */
function gated(pages) {
  const profile = boxingProfile()
  const c = composition([homeOf(profile), contactPage()])
  c.leftOut = pages
  return gatePlan(c, contextOf(profile))
}
const pagesOf = (result) => result.plan.leftOut.filter((e) => e.kind === 'page')

test('the model page entries, in any words or with a page type, never change the pages left out', () => {
  const none = gated([])
  const english = gated([
    { what: 'news-post page', kind: 'page', reason: 'No post was provided.' },
    { what: 'Trainer page', kind: 'page', pageType: 'trainer', reason: 'No trainer profile.' },
    { what: 'Classes page', kind: 'page', pageType: 'classes', reason: 'Your services are on the home page.' }
  ])
  // Invented words standing for the owner's language, the shape of the walk's second run: no page type, names no
  // matcher reads.
  const other = gated([
    { what: 'Zorvel nakti', kind: 'page', reason: 'Mira tolvan.' },
    { what: 'Zorvel pell vasko', kind: 'page', reason: 'Mira kesto.' },
    { what: 'Zorvel dunari', kind: 'page', reason: 'Mira oskel.' }
  ])
  for (const result of [none, english, other]) assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(pagesOf(english), pagesOf(none))
  assert.deepEqual(pagesOf(other), pagesOf(none))
  assert.equal(pagesOf(none).length, 8)
  // Every page line carries its name and a code the plan card translates; none is the model's sentence.
  for (const e of pagesOf(none)) {
    assert.ok(['page_nothing_to_show', 'page_not_planned'].includes(e.code), e.code)
    assert.equal(typeof e.params.page, 'string')
  }
  assert.equal(other.fixes.filter((f) => f.code === 'left_out_unkeyed').length, 3)
})

test('a page the model plans with an empty main section is listed by code, by the template name of its type', () => {
  const profile = boxingProfile()
  const c = composition([
    homeOf(profile),
    contactPage(),
    {
      pageType: 'about',
      name: 'Zorvel ardo',
      blocks: [{ block: 'block-183', label: 'x', data: [], reason: 'x' }]
    }
  ])
  const result = gatePlan(c, contextOf(profile))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const about = pagesOf(result).filter((e) => e.params.page === 'About')
  assert.deepEqual(about, [
    {
      what: 'About page',
      kind: 'page',
      reason: PAGE_NOT_PLANNED.reason,
      code: 'page_not_planned',
      params: { page: 'About' }
    }
  ])
  assert.equal(
    result.plan.leftOut.some((e) => e.what === 'Zorvel ardo'),
    false
  )
})
