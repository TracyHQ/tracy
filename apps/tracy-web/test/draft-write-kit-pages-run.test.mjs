// The kit's page declarations as a run writes them on a blank site in memory (#597): a page item's declared link with
// its references filled by the ids the site gave, its template style and params; a page reached under its list page
// has no item and its address names the article, its category and the list page's item; a created article starts from
// the declared base columns and frame; the contact is filed in its own category; the fact place the kit leaves
// unwritten is listed in the report. The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-kit-pages-run.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolved } from '../src/step-chain-draft-write-ops.js'
import { blankSite, floristPlan, pageItemsOf, runOn } from './draft-write-fixtures.mjs'

const memory = blankSite()
const report = await runOn(memory)
const items = pageItemsOf(memory)
const records = memory.site.records
const byNote = (table, mark) => [...records[table].values()].find((r) => r.alias === mark || r.note === mark)
const opOf = (key) => floristPlan.ops.find((op) => op.key === key)
const category = (extension) => [...records.category.values()].find((c) => c.extension === extension)

test('a page item is written with the declared link, its category id filled in, and its template style', () => {
  const classes = items.classes
  assert.equal(
    classes.link,
    `index.php?option=com_content&view=category&layout=ja_boxing:classes&id=${category('com_content').id}`
  )
  assert.equal(Number(classes.template_style_id), 0)
  assert.equal(JSON.parse(classes.params).article_layout, 'ja_boxing:classes')
  assert.equal(Number(items.home.template_style_id), 13)
  assert.equal(items.plans.link, 'index.php?option=com_content&view=category&layout=blog&id=2')
})

test('a page reached under its list page has no item; its address names its article, category and list item', () => {
  assert.equal(items.class, undefined)
  const article = byNote('article', opOf('article:service-wild-meadow-bouquet').mark)
  const ctx = {
    plan: floristPlan,
    state: { ids: { ...memoryIds(), 'article:service-wild-meadow-bouquet': article.id } }
  }
  assert.equal(
    resolved({ ref: 'page:class', form: 'address' }, ctx),
    `index.php?option=com_content&view=article&id=${article.id}&catid=${article.catid}&Itemid=${items.classes.id}`
  )
  assert.equal(resolved({ ref: 'page:class', form: 'id' }, ctx), String(items.classes.id))
})

/** The ids the run gave the page items and categories, as its run record keeps them. */
function memoryIds() {
  const ids = {}
  for (const [page, row] of Object.entries(items))
    if (row) ids[`menuItem:${floristPlan.mainMenu}:${page}`] = row.id
  ids['category:class'] = category('com_content').id
  return ids
}

test('a created article starts from the declared base columns and is written into the declared frame', () => {
  const article = byNote('article', opOf('article:service-wild-meadow-bouquet').mark)
  const attribs = JSON.parse(article.attribs)
  assert.equal(attribs.article_layout, 'ja_boxing:classes')
  assert.ok(Object.hasOwn(attribs, 'classes-info'))
  // The full images value, even where no picture is written (without it the page prints PHP warnings, measured).
  assert.equal(JSON.parse(article.images).float_fulltext, '')
  assert.match(article.fulltext, /<div class="row row-cols-1 row-cols-md-2">/)
  assert.equal(Number(article.catid), category('com_content').id)
})

test('the contact is filed in a contact category of its own; the unwritten sender name is in the report', () => {
  const contact = [...records.contact.values()][0]
  assert.equal(Number(contact.catid), category('com_contact').id)
  assert.equal(report.status, 'done')
  assert.deepEqual(
    report.notWritten.map(({ fact, column }) => [fact, column]),
    [['name', 'fromname']]
  )
  assert.notEqual(memory.site.identity?.fromname, 'Larkspur Blooms')
})
