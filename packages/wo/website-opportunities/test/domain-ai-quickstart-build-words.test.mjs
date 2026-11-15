// The closed words of the build declarations and the rule of a menu block's pages (`ai-quickstart-build-words.mjs`,
// `ai-quickstart-menu-items.mjs`): each word broken on the invented fixture, the menu rule on invented plan pages,
// and the keyed row of JA Boxing's masthead against its own locations.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { keyedRowProblems } from '../domain/ai-quickstart-build-words.mjs'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { menuItemPagesOf } from '../domain/ai-quickstart-menu-items.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const valid = () => ({
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
})
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const BOXING = '../../../cms/tracy-joomla-quickstart/ai-quickstarts/ja-boxing/j6/1.0.11/'
const boxing = (name) => JSON.parse(readFileSync(new URL(BOXING + name, import.meta.url), 'utf8'))

test('the fixture passes with the closed words', () => {
  assert.deepEqual(problemsOf(valid()), [])
})

test('the accent module content and the order value of each side are closed words', () => {
  const set = valid()
  set.mapping.look.accent.writtenAs.content = 'one style element'
  set.mapping.look.accent.sides.values = { light: 'accent', dark: 'accent' }
  const problems = problemsOf(set)
  assert.ok(problems.some((p) => p.startsWith('look.accent.writtenAs.content: content is "accent-module"')))
  assert.ok(problems.some((p) => p.startsWith('look.accent.sides.values: values is {light: "accent"')))
})

const PLAN = [
  { id: 'p-home', pageType: 'home' },
  { id: 'p-team', pageType: 'team' },
  { id: 'p-blog', pageType: 'blog' },
  { id: 'p-about', pageType: 'about' },
  { id: 'p-post-1', pageType: 'post' },
  { id: 'p-post-2', pageType: 'post' },
  { id: 'p-legal', pageType: 'legal' }
]
const MAPPING = {
  pages: {
    home: { menuItem: {} },
    team: { menuItem: { parent: 'about' } },
    blog: { menuItem: {} },
    about: { menuItem: {} },
    post: { under: { page: 'blog' } },
    legal: { menuItem: { parent: 'about' } }
  }
}
const ids = (pages) => pages.map((p) => p.id)

test('a menu of top level pages in main menu order: home left out, the plus pages after, at most max', () => {
  const items = {
    from: 'pages',
    level: 1,
    except: ['home'],
    order: 'main-menu',
    max: 3,
    link: 'page-address'
  }
  assert.deepEqual(ids(menuItemPagesOf(items, PLAN, MAPPING)), ['p-blog', 'p-about'])
  assert.deepEqual(ids(menuItemPagesOf({ ...items, plus: ['legal'] }, PLAN, MAPPING)), [
    'p-blog',
    'p-about',
    'p-legal'
  ])
  assert.deepEqual(ids(menuItemPagesOf({ ...items, plus: ['legal'], max: 2 }, PLAN, MAPPING)), [
    'p-blog',
    'p-about'
  ])
  // Main menu order: a parent before its children, depth first.
  assert.deepEqual(ids(menuItemPagesOf({ from: 'pages', order: 'main-menu', max: 9 }, PLAN, MAPPING)), [
    'p-home',
    'p-blog',
    'p-about',
    'p-team',
    'p-legal',
    'p-post-1',
    'p-post-2'
  ])
})

test('a menu of the item pages of one type, in plan order; with no list page they are top level', () => {
  const items = { from: 'pages', pageTypes: ['post'], order: 'plan', max: 1, link: 'page-address' }
  assert.deepEqual(ids(menuItemPagesOf(items, PLAN, MAPPING)), ['p-post-1'])
  const level = { from: 'pages', level: 1, pageTypes: ['post'], order: 'plan', max: 5 }
  assert.deepEqual(ids(menuItemPagesOf(level, PLAN, MAPPING)), [])
  const noBlog = PLAN.filter((p) => p.pageType !== 'blog')
  assert.deepEqual(ids(menuItemPagesOf(level, noBlog, MAPPING)), ['p-post-1', 'p-post-2'])
  assert.deepEqual(menuItemPagesOf({ from: 'main-menu' }, PLAN, MAPPING), [])
})

test('a menu of pages names its link, a known level and page types of the recipes', () => {
  const set = {
    blockStore: boxing('block-store.json'),
    pageRecipes: boxing('page-recipes.json'),
    mapping: boxing('mapping.json')
  }
  const entry = set.mapping.placements['block-174']
  entry.menu.items = {
    from: 'pages',
    level: 2,
    plus: 'legal',
    order: 'plan',
    max: 3,
    link: 'alias',
    why: 'x'
  }
  const problems = problemsOf(set)
  for (const pattern of [
    /\.menu\.items\.link: link is page-address/,
    /\.menu\.items\.level: level is 1/,
    /\.menu\.items\.plus: plus is a list of page types/
  ])
    assert.ok(
      problems.some((p) => pattern.test(p)),
      `${pattern}\n${problems.join('\n')}`
    )
})

test('a container copy is kept by a closed word; a category title names a page type', () => {
  const set = {
    blockStore: boxing('block-store.json'),
    pageRecipes: boxing('page-recipes.json'),
    mapping: boxing('mapping.json')
  }
  assert.deepEqual(problemsOf(set), [])
  set.mapping.placements['block-184'].holds.copies.keptWhen = 'a block it holds is kept on the page'
  set.mapping.pages.class.record.category.title = { from: 'the menu label of the classes page' }
  const problems = problemsOf(set)
  assert.ok(
    problems.includes('placements[block-184].holds.copies.keptWhen: keptWhen is "any-held-block-kept"')
  )
  assert.ok(
    problems.some((p) => p.startsWith('pages.class.record.category.title: title is {from: "page-name"'))
  )
})

test('the keyed row of the masthead agrees with the locations of its fields', () => {
  const mapping = boxing('mapping.json')
  const k = mapping.placements['block-162'].keyedRow
  const problems = []
  const report = (at, message) => problems.push(`${at}: ${message}`)
  keyedRowProblems('block-162', k, mapping, report)
  assert.deepEqual(problems, [])
  keyedRowProblems('block-162', { ...k, row: 13 }, mapping, report)
  assert.ok(problems.some((p) => p.includes('stat-title is no field of block-162 written at row 13')))
  assert.ok(problems.some((p) => p.includes('a row of the list pages sits at row 13')))
  problems.length = 0
  keyedRowProblems('block-162', { ...k, fields: k.fields.filter((f) => f !== 'stat-value') }, mapping, report)
  assert.deepEqual(problems, [
    'placements[block-162].keyedRow.fields: stat-value is written at row 14 and is not named'
  ])
  problems.length = 0
  keyedRowProblems('block-162', { ...k, pageType: 'plans' }, mapping, report)
  assert.deepEqual(problems, [
    'placements[block-162].keyedRow.pageType: stat-page keys the row to classes, not plans'
  ])
})
