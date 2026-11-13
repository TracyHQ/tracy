// Conflicts of the draft write plan (ticket #597): two entries with other words for one place. One conflict row per
// losing entry and place, never twice, also when the losing entry is written at another place (`written: true`); a
// menu item in other words than the item it would duplicate is a conflict too, never a silent `address_shared`. The
// coverage still closes: entries in = written + skipped + conflicted, each entry counted once. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-conflicts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftWriteCoverage, planCountsOf, writePlanOf } from '../domain/draft-write-plan.mjs'
import { put, recordOf, sinkOf } from '../domain/draft-write-sink.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

const TITLE = { entity: 'module-1', column: 'title' }
const CONTENT = { entity: 'module-1', column: 'content' }
/** The conflicts and the written entries of a sink after a list of puts `[entry, value, own?, loc?]`. */
function sinkAfter(puts) {
  const sink = sinkOf()
  recordOf(sink, 'r', { kind: 'copy' })
  for (const [entry, value, own = false, loc = TITLE] of puts) put(sink, 'r', loc, value, { entry, own })
  const rows = [...sink.conflicts.values()].map((c) => `${c.entry}<${c.by}:${c.kept}`)
  return { rows, written: [...sink.consumed.keys()].sort() }
}

test('an entry that fans out and loses one of its places is a conflict of that place, written all the same', () => {
  // a writes the content, then loses the title to b's other words.
  assert.deepEqual(
    sinkAfter([
      ['a', 'x', false, CONTENT],
      ['b', 'y'],
      ['a', 'x']
    ]),
    {
      rows: ['a<b:first'],
      written: ['a', 'b']
    }
  )
  // a holds both places, then b's own page words take the title: a stays written by the content.
  assert.deepEqual(
    sinkAfter([
      ['a', 'x', false, CONTENT],
      ['a', 'x'],
      ['b', 'y', true]
    ]),
    {
      rows: ['a<b:own_page'],
      written: ['a', 'b']
    }
  )
})

test('a second loss of one entry at one place is one conflict row, a loss at another place is another', () => {
  assert.deepEqual(
    sinkAfter([
      ['a', 'x'],
      ['b', 'y', true],
      ['a', 'x']
    ]).rows,
    ['a<b:own_page']
  )
  assert.deepEqual(
    sinkAfter([
      ['a', 'x'],
      ['b', 'y'],
      ['c', 'z']
    ]).rows,
    ['b<a:first', 'c<a:first']
  )
  const two = sinkAfter([
    ['a', 'x'],
    ['a', 'x', false, CONTENT],
    ['b', 'y'],
    ['b', 'w', false, CONTENT]
  ])
  assert.deepEqual(two, { rows: ['b<a:first', 'b<a:first'], written: ['a'] })
})

const blocksOf = (order, id) => order.pages.flatMap((p) => p.blocks.filter((b) => b.block === id))
const planOf = (order) => writePlanOf(order, site.aiq, { stored: site.stored })

test('a menu item in other words than the item it would duplicate is a listed conflict, the same words are shared', () => {
  const order = structuredClone(site.order)
  const [, onContact] = blocksOf(order, 'block-174')
  const label = onContact.items[0].fields.find((f) => f.type === 'text')
  label.value = 'Flowers'
  const plan = planOf(order)
  const row = plan.conflicts.find((c) => c.entry === label.place)
  assert.deepEqual(row && [row.kept, row.written, row.record], ['first', false, 'menuItem:site-map:classes'])
  assert.ok(!plan.skipped.some((s) => s.entry === label.place))
  // The phone menu draws the page items: a label in other words than the page's menu label is a conflict too.
  const [phone, link] = blocksOf(site.order, 'block-187')[0].items[0].fields
  const page = site.order.pages.find((p) => p.id === link.target.page)
  assert.notEqual(page.menu.label, phone.value)
  const base = planOf(site.order)
  assert.equal(base.conflicts.find((c) => c.entry === phone.place)?.kept, 'page_item')
  assert.equal(base.skipped.find((s) => s.entry === link.place)?.reason, 'menu_item_is_page_item')
  // The same footer words on two pages stay one shared item.
  const [, shared] = blocksOf(site.order, 'block-174')
  const sharedLabel = shared.items[0].fields.find((f) => f.type === 'text').place
  assert.equal(base.skipped.find((s) => s.entry === sharedLabel)?.reason, 'address_shared')
})

test('a menu item with a page but no label has its own reason', () => {
  const order = structuredClone(site.order)
  const [onHome] = blocksOf(order, 'block-174')
  const label = onHome.items[0].fields.find((f) => f.type === 'text')
  Object.assign(label, { value: '', action: 'hide' })
  const plan = planOf(order)
  assert.equal(plan.skipped.find((s) => s.entry === label.place)?.reason, 'menu_item_without_label')
})

test('the coverage closes and the run counts give each entry once: written, skipped or conflicted', () => {
  const plan = planOf(site.order)
  const c = draftWriteCoverage(site.order, plan)
  assert.deepEqual([c.unexplained, c.twice], [[], []])
  assert.equal(c.in, c.written + c.skipped + c.conflicted)
  const counts = planCountsOf(plan)
  assert.deepEqual([counts.written, counts.conflicted], [c.written, c.conflicted])
  assert.ok(!plan.skipped.some((s) => s.reason === 'address_conflict'))
  assert.equal(counts.conflicts.length, new Set(plan.conflicts.map((x) => x.entry)).size)
})
