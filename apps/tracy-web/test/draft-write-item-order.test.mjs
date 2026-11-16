// One order for one list of records (#597, gate run 7): the class cards of two pages showed the same records in two
// orders, because a created article carried no order and a list ordered by publish date, newest first (the kit's
// `itemsOrder` of class-list, news-list and featured-list), printed whatever a few seconds of writing left. Every
// created article now takes its rank in its list, the plan's order, as its `ordering`, and its publish date follows
// the same rank (rank 1 newest). A block whose kit declares another order (block-159 and block-160: title ascending, their
// module's own setting) keeps it, and the plan says so. Invented records only (the florist on the JA Boxing kit).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-item-order.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { blankSite, floristPlan, openStored } from './draft-write-fixtures.mjs'

const NOW = Date.parse('2026-03-04T05:06:07Z')
const created = floristPlan.ops.filter((op) => op.kind === 'article.create')

test('every created article carries its rank in its list, one list per page type, in the plan order', () => {
  const byList = new Map()
  for (const op of created) {
    assert.ok(op.listOrder, `${op.key} has a rank`)
    byList.set(op.listOrder.list, [...(byList.get(op.listOrder.list) ?? []), op])
  }
  for (const [name, ops] of byList) {
    assert.deepEqual(
      ops.map((op) => op.listOrder.rank),
      ops.map((_, i) => i + 1),
      `${name} ranks follow the plan`
    )
    for (const op of ops) assert.equal(op.listOrder.of, ops.length)
  }
})

test('the written records take the rank as their order and a publish date newest first', async () => {
  const memory = blankSite()
  const done = await runDraftWrite({
    plan: floristPlan,
    doors: memory.doors,
    record: {},
    openStored,
    now: () => NOW
  })
  assert.equal(done.status, 'done')
  const rows = [...memory.site.records.article.values()]
  const byList = new Map()
  for (const op of created) {
    const row = rows.find((r) => r.alias === op.fields.alias)
    assert.equal(row.ordering, op.listOrder.rank)
    const at = Date.parse(`${row.publish_up.replace(' ', 'T')}Z`)
    assert.ok(at <= NOW, 'published at once')
    byList.set(op.listOrder.list, [...(byList.get(op.listOrder.list) ?? []), { rank: op.listOrder.rank, at }])
  }
  // One date rule (`step-chain-draft-write-dates.js`): in a list, rank 1 is the newest and every next one older.
  for (const items of byList.values()) {
    const dates = items.sort((a, b) => a.rank - b.rank).map((i) => i.at)
    for (let i = 1; i < dates.length; i++) assert.ok(dates[i] < dates[i - 1], 'newest first, distinct')
  }
})

test('the plan names the order each placed list block shows: the plan order, or the kit declared one', () => {
  const orders = Object.fromEntries(floristPlan.itemOrders.map((o) => [o.block, o]))
  assert.equal(orders['class-list']?.follows, 'plan')
  for (const id of ['block-159', 'block-160'].filter((b) => orders[b])) {
    assert.equal(orders[id].follows, 'kit')
    assert.deepEqual([orders[id].by, orders[id].direction, orders[id].lists], ['title', 'asc', 'class-list'])
  }
})
