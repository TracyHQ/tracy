// The page recipe half of the AI quickstart draft (#583): one recipe per page type, in the author's block order,
// read from the kit's pages. Invented template only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { draftRecipes } from '../ai-quickstart/lib/draft-recipes.mjs'

const page = (id, group, path, wide, narrow = wide) => ({
  id,
  group,
  path,
  blocks: { 390: narrow, 1440: wide }
})
const kit = {
  pageGroups: [
    { id: 'group-home', root: 'page-home', children: [] },
    { id: 'group-news', root: 'page-news', children: ['page-news_a', 'page-news_b', 'page-news_c'] },
    { id: 'group-login', root: 'page-login', children: [] }
  ],
  pages: [
    page(
      'page-home',
      'group-home',
      '/',
      ['header', 'block-1', 'block-2', 'block-9'],
      ['header', 'block-2', 'block-1', 'block-9']
    ),
    page('page-news', 'group-news', '/news', ['header', 'body-news', 'block-9']),
    page('page-news--start-6', 'group-news', '/news?start=6', ['header', 'body-news--start-6', 'block-9']),
    page('page-news_a', 'group-news', '/news/a', ['header', 'body-news_a', 'block-4', 'block-9']),
    page('page-news_b', 'group-news', '/news/b', ['header', 'body-news_b', 'block-3', 'block-9']),
    page('page-news_c', 'group-news', '/news/c', ['header', 'body-news_c', 'block-3', 'block-9']),
    page('page-login', 'group-login', '/login', ['header', 'body-login', 'block-9'])
  ],
  blocks: [
    { id: 'header', role: 'header', shared: true },
    { id: 'block-1', role: 'hero', shared: false },
    { id: 'block-2', role: 'section', shared: false },
    { id: 'block-3', role: 'section', shared: true },
    { id: 'block-4', role: 'section', shared: false },
    { id: 'block-9', role: 'footer', shared: true },
    { id: 'body-news', role: 'page-body' },
    { id: 'body-news_a', role: 'page-body' },
    { id: 'body-news_b', role: 'page-body' },
    { id: 'body-news_c', role: 'page-body' },
    { id: 'body-login', role: 'page-body' }
  ]
}
const storeIdOf = {
  header: 'header',
  'block-1': 'block-1',
  'block-2': 'block-2',
  'block-3': 'block-3',
  'block-4': 'block-4',
  'block-5': 'block-5',
  'block-9': 'block-9',
  'body-news': 'news-list',
  'body-news_a': 'news-post',
  'body-news_b': 'news-post',
  'body-news_c': 'news-post'
}
const blocks = Object.values(storeIdOf).map((id) => ({
  id,
  positions: id === 'block-5' ? ['inside:block-2'] : ['x']
}))
const decisions = {
  pageTypes: {
    'group-home': { listing: 'home' },
    'group-news': { listing: 'news', item: 'news-post' },
    'group-login': { skip: 'a system page the build never creates' }
  }
}
const run = (over = {}) => draftRecipes({ kit, storeIdOf, blocks, decisions: { ...decisions, ...over } })
const recipeOf = (res, type) => res.recipes.find((r) => r.pageType === type)

test('the author order is the widest width, where blocks sit in their layout positions', () => {
  assert.deepEqual(recipeOf(run(), 'home').blocks, ['header', 'block-1', 'block-2', 'block-5', 'block-9'])
})

test('a block placed inside another follows its container', () => {
  assert.deepEqual(recipeOf(run(), 'home').blocks.slice(2, 4), ['block-2', 'block-5'])
})

test('the main block is the page body, else the first block of the page that is not shared', () => {
  assert.equal(recipeOf(run(), 'home').mainBlock, 'block-1')
  assert.equal(recipeOf(run(), 'news').mainBlock, 'news-list')
})

test('item pages of a group are one page type, ordered as most of them are', () => {
  const item = recipeOf(run(), 'news-post')
  assert.deepEqual(item.blocks, ['header', 'news-post', 'block-3', 'block-9'])
  assert.equal(item.pages, 2)
  assert.deepEqual(item.variants, [{ blocks: ['header', 'news-post', 'block-4', 'block-9'], pages: 1 }])
})

test('a pager page is the same page type, not a recipe of its own', () => {
  assert.equal(run().recipes.length, 3)
})

test('a skipped page type is listed with its reason', () => {
  assert.deepEqual(run().excluded, [
    { group: 'group-login', reason: 'a system page the build never creates' }
  ])
})

test('a decided main block wins', () => {
  const res = run({
    pageTypes: { ...decisions.pageTypes, 'group-home': { listing: 'home', mainBlock: 'block-2' } }
  })
  assert.equal(recipeOf(res, 'home').mainBlock, 'block-2')
})

test('a block every page shows outside the page flow follows the first block of each recipe', () => {
  const res = run({ onEveryPage: ['block-4'] })
  assert.deepEqual(recipeOf(res, 'home').blocks.slice(0, 2), ['header', 'block-4'])
  assert.deepEqual(
    recipeOf(res, 'news-post').variants[0].blocks.filter((b) => b === 'block-4'),
    ['block-4']
  )
})
