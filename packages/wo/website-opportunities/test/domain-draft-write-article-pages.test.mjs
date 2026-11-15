// Where a created article prints (ticket #597, "Page facts" of the door measurements): an article with no menu item of
// its own takes the home page's layout and prints nothing, and the detail positions (`detail-bottom-1`,
// `main-bottom-2`) print only under the list page's menu item, never on the article's own. The plan reaches every
// article page under its list page when the plan has one (`pages.<type>.under`), else on an item of its own
// (`ownItem`), and reports what would print nothing: a block that sits only in a detail position on a page with an item
// of its own (`detail_position_not_printed`), an article with no page (`article_without_page`).
// Invented data (the JA Boxing florist).
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-article-pages.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DETAIL_POSITIONS, unprintedBlocksOf } from '../domain/draft-write-plan-pages.mjs'
import { kit, plan } from './fixtures/draft-write/guarded.mjs'

test('every created article is reached under its list page, as the kit declares (pages.class.under)', () => {
  const articles = plan.ops.filter((op) => op.kind === 'article.create')
  assert.ok(articles.length >= 2)
  for (const article of articles) {
    const [page] = Object.entries(plan.under).find(([, u]) => u.link.refs.record?.ref === article.key) ?? []
    assert.ok(page, article.key)
    assert.equal(plan.under[page].list, 'classes')
    assert.equal(
      plan.under[page].link.template,
      'index.php?option=com_content&view=article&id={record}&catid={category}&Itemid={page:classes}'
    )
    assert.ok(!plan.ops.some((op) => op.key === `menuItem:${plan.mainMenu}:${page}`), 'no item of its own')
  }
  const codes = plan.unproven.map((u) => u.code)
  assert.ok(!codes.includes('article_without_page'))
  assert.ok(!codes.includes('detail_position_not_printed'))
})

test('a block only in a detail position prints nothing on an article page of its own: reported, by block', () => {
  assert.deepEqual(DETAIL_POSITIONS, ['detail-bottom-1', 'main-bottom-2'])
  const page = {
    id: 'class',
    blocks: [
      { id: 'related', block: 'block-159' },
      { id: 'more', block: 'block-191' },
      { id: 'call', block: 'block-176' },
      { id: 'hidden', block: 'block-159', state: 'hidden' }
    ]
  }
  assert.deepEqual(unprintedBlocksOf(kit, page, { ref: 'article:x', form: 'articleLink' }), [
    'related',
    'more'
  ])
  // On a page that is no article of its own (a list page), the same blocks are not reported here.
  assert.deepEqual(unprintedBlocksOf(kit, page, { fixed: 'index.php?option=com_content&view=featured' }), [])
})
