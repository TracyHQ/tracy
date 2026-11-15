// The item counts of a structure variant (ticket #586, run3 observation items_not_at_shape): the main block of a list
// page shows the list (its items counted as the order shows them), not one record; and a block with no item fields
// shows items the site draws itself (related posts, a fixed card), which the build's count cannot measure, so it is
// recorded as not counted, never as a block shown at the wrong count. Invented kit and order.
import assert from 'node:assert/strict'
import test from 'node:test'
import { itemCountsOf, unexplainedItems } from '../ai-quickstart/gate/structure-items.mjs'

const kit = {
  blockStore: {
    blocks: [
      {
        id: 'post-list',
        type: 'posts',
        placement: 'created',
        items: { min: 2, max: 6 },
        itemFields: [{ name: 'title' }]
      },
      {
        id: 'post',
        type: 'posts',
        placement: 'created',
        items: { min: 1, max: 1 },
        itemFields: [{ name: 'title' }]
      },
      { id: 'related', type: 'posts', placement: 'copy', items: { min: 1, max: 2 }, itemFields: [] }
    ]
  },
  pageRecipes: {
    recipes: [
      { pageType: 'news', mainBlock: 'post-list' },
      { pageType: 'news-post', mainBlock: 'post' }
    ]
  }
}
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i }))
const built = {
  order: {
    pages: [
      {
        id: 'news',
        pageType: 'news',
        blocks: [{ block: 'post-list', items: items(6), counts: { shown: 6, available: 6 } }]
      },
      {
        id: 'news-post',
        pageType: 'news-post',
        blocks: [
          { block: 'post', items: [], counts: { shown: 0, available: 0 } },
          { block: 'related', items: [], counts: { shown: 0, available: 0 } }
        ]
      }
    ]
  }
}

test('a list page main block counts its items; a block with no item fields is not counted by the build', () => {
  const rows = itemCountsOf(built, kit, 'max')
  const at = (b) => rows.find((r) => r.block === b)
  assert.equal(at('post-list').items, 6)
  assert.equal(at('post').counted, 'page_record')
  assert.equal(at('related').counted, 'site_draws')
  assert.deepEqual(unexplainedItems(rows), [])
})
