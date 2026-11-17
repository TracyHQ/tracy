// The model's left out pages as the owner reads them (#575 walk, second round): matched to the template's page type,
// a detail page (a single post, a single author, a single trainer) never listed, a page with nothing of the business to
// show given code's reason. The JA Boxing recipes and block store; the invented florist. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-pages.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detailPageTypesOf,
  PAGE_NOTHING_TO_SHOW,
  pageLeftOutOf,
  pageTypeOfEntry
} from '../domain/plan-left-out-pages.mjs'
import { boxingRecipes, boxingStore } from './fixtures/write-order/boxing-florist.mjs'

const recipes = new Map(boxingRecipes.recipes.map((r) => [r.pageType, r]))
const blocks = new Map(boxingStore.blocks.map((b) => [b.id, b]))

test('the pages of one item each are the detail pages; list, home, about and contact pages are not', () => {
  const detail = detailPageTypesOf(recipes, blocks)
  for (const type of ['news-post', 'author', 'class', 'learning-post', 'trainer'])
    assert.ok(detail.has(type), type)
  for (const type of ['home', 'news', 'authors', 'trainers', 'learning-center', 'about', 'contact', 'plans'])
    assert.equal(detail.has(type), false, type)
})

test('a page entry names its page type by slug or by words, with or without the word page', () => {
  assert.equal(pageTypeOfEntry('news-post page', recipes), 'news-post')
  assert.equal(pageTypeOfEntry('Featured posts page', recipes), 'featured-posts')
  assert.equal(pageTypeOfEntry('Plans', recipes), 'plans')
  assert.equal(pageTypeOfEntry('Prices page', recipes), null)
})

test('a detail page is not listed; a page with no item of its kind takes the shared reason', () => {
  const fixes = []
  const context = { recipes, blocks, data: { items: [] }, at: 'leftOut[0]', fix: (f) => fixes.push(f) }
  assert.equal(pageLeftOutOf({ what: 'Trainer page', reason: 'x' }, context), null)
  assert.equal(fixes[0].code, 'left_out_detail_page')
  assert.deepEqual(pageLeftOutOf({ what: 'trainers page', reason: 'x' }, context), {
    what: 'Trainers page',
    page: 'Trainers',
    derived: PAGE_NOTHING_TO_SHOW
  })
  // A page of no item kind keeps the model's reason; an unknown page keeps its words.
  assert.deepEqual(pageLeftOutOf({ what: 'About page', reason: 'x' }, context), {
    what: 'About page',
    page: 'About'
  })
  assert.deepEqual(pageLeftOutOf({ what: 'Prices page', reason: 'x' }, context), { what: 'Prices page' })
})

test('a page whose kind of item the business has keeps the model reason', () => {
  const data = { items: [{ id: 'p1', kind: 'package' }] }
  const read = pageLeftOutOf(
    { what: 'Plans page', reason: 'x' },
    { recipes, blocks, data, at: 'a', fix: () => {} }
  )
  assert.equal(read.derived, undefined)
})
