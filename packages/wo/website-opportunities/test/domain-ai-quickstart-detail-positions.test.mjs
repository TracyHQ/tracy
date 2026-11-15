// The detail positions of a page reached under its list page (`pages.<type>.under.detailPositions`,
// `ai-quickstart-detail-positions.mjs`), on an invented mapping file: every `under` declares them, nothing else
// does, and a block that sits only in a detail position is placed only where it prints. The last case reads the
// JA Boxing kit.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  allDetailPositions,
  detailPositionProblems,
  detailPositionsOf
} from '../domain/ai-quickstart-detail-positions.mjs'

const BLOCKS = [
  { id: 'list-intro', positions: ['content'] },
  { id: 'more-items', positions: ['item-bottom'] },
  { id: 'tabbed', positions: ['inside:tabs-1', 'item-bottom'] }
]
const RECIPES = {
  recipes: [
    { pageType: 'items', blocks: ['list-intro'] },
    { pageType: 'item', blocks: ['more-items', 'tabbed'] }
  ]
}
const invented = () => ({
  pages: {
    items: {
      menuItem: { link: 'index.php?option=com_content&view=category&id={category:item}', why: 'invented' }
    },
    item: {
      under: {
        page: 'items',
        address: 'index.php?option=com_content&view=article&id={record}&Itemid={page:items}',
        detailPositions: {
          positions: ['item-bottom'],
          assignTo: 'list-page',
          why: 'invented: the detail layout prints item-bottom only under the list page'
        },
        why: 'invented'
      },
      ownItem: { link: 'index.php?option=com_content&view=article&id={record}', why: 'invented' }
    }
  }
})
const problemsOf = (mapping, recipes = RECIPES) => {
  const out = []
  detailPositionProblems(mapping, BLOCKS, {
    report: (at, message) => out.push(`${at}: ${message}`),
    pageRecipes: recipes
  })
  return out
}

test('an invented item page under its list page declares its detail positions, and passes', () => {
  const mapping = invented()
  assert.deepEqual(problemsOf(mapping), [])
  assert.deepEqual(detailPositionsOf(mapping, 'item'), ['item-bottom'])
  assert.deepEqual(detailPositionsOf(mapping, 'items'), [])
  assert.deepEqual([...allDetailPositions(mapping)], ['item-bottom'])
})

test('an under entry without detail positions fails', () => {
  const mapping = invented()
  delete mapping.pages.item.under.detailPositions
  assert.deepEqual(problemsOf(mapping), [
    'pages.item.under.detailPositions: declare the positions this page prints only under its list page: {positions, assignTo, why}'
  ])
})

test('detail positions are {positions, assignTo: "list-page", why}', () => {
  const mapping = invented()
  mapping.pages.item.under.detailPositions = { positions: 'item-bottom', assignTo: 'page', why: '' }
  assert.deepEqual(problemsOf(mapping), [
    'pages.item.under.detailPositions.positions: positions is a list of template positions (may be empty)',
    'pages.item.under.detailPositions.assignTo: a copy at a detail position is assigned to the list page: "list-page"',
    'pages.item.under.detailPositions.why: say how the detail positions were measured'
  ])
})

test('a menu item of its own prints no detail position, so it declares none', () => {
  const mapping = invented()
  mapping.pages.item.ownItem.detailPositions = { positions: ['item-bottom'], assignTo: 'list-page', why: 'x' }
  assert.deepEqual(problemsOf(mapping), [
    'pages.item.ownItem.detailPositions: only a page reached under its list page has detail positions'
  ])
})

test('a block that sits only in a detail position, placed on a page that does not print it, fails', () => {
  const mapping = invented()
  const recipes = structuredClone(RECIPES)
  recipes.recipes[0].blocks.push('more-items')
  assert.deepEqual(problemsOf(mapping, recipes), [
    'pages.items: the recipe (recipes[0].blocks[1]) places "more-items", which sits only in a detail position (item-bottom) this page type does not print: it would print nothing'
  ])
})

test('JA Boxing: the class, post and lesson pages declare the detail positions their blocks sit in', () => {
  const kit = new URL(
    '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/',
    import.meta.url
  )
  const json = (name) => JSON.parse(readFileSync(new URL(name, kit), 'utf8'))
  const mapping = json('mapping.json')
  const blocks = json('block-store.json').blocks
  const pageRecipes = json('page-recipes.json')
  const run = (m) => {
    const out = []
    detailPositionProblems(m, blocks, { report: (at, message) => out.push(`${at}: ${message}`), pageRecipes })
    return out
  }
  assert.deepEqual(run(mapping), [])
  assert.deepEqual(detailPositionsOf(mapping, 'class'), ['detail-bottom-1'])
  assert.deepEqual(detailPositionsOf(mapping, 'news-post'), ['main-bottom-2'])
  assert.deepEqual(detailPositionsOf(mapping, 'learning-post'), ['main-bottom-2'])
  const misplaced = structuredClone(pageRecipes)
  misplaced.recipes.find((r) => r.pageType === 'news-post').blocks.push('block-159')
  const out = []
  detailPositionProblems(mapping, blocks, {
    report: (at, message) => out.push(`${at}: ${message}`),
    pageRecipes: misplaced
  })
  assert.match(
    out.join('\n'),
    /pages\.news-post: the recipe .* places "block-159", which sits only in a detail position \(detail-bottom-1\)/
  )
})
