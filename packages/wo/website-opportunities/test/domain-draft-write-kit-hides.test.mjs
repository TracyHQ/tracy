// The hide keys the draft write reads besides `by` and `element` (ticket #597): a control's `scope` and `from` (a
// button the template prints on every card from the first card's words) and an omit list's `order: "packed"`. An
// invented block of three cards (a card's own words that never print are skipped, `CONTROL_FROM_FIRST`), each with a label and an address, and an invented list of rows in one HTML value.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-hides.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTROL_FROM_FIRST, emptyControl, omitRows } from '../domain/draft-write-plan-hides.mjs'
import { put, recordOf, sinkOf } from '../domain/draft-write-sink.mjs'

const at = (field, i) => ({ entity: 'module-9', column: 'params', jsonPath: ['cards', field, i] })
const CARDS = {
  itemFields: { label: [0, 1, 2].map((i) => at('label', i)), link: [0, 1, 2].map((i) => at('link', i)) }
}
const stateOf = (blocks) => ({ kit: { mapping: { blocks } }, sink: sinkOf() })
const cardsWith = (words) => {
  const state = stateOf({ 'block-9': CARDS })
  const record = recordOf(state.sink, 'copy:p.b', { kind: 'copy', block: 'block-9' })
  words.forEach((w, i) => {
    if (!w) return
    put(state.sink, record.key, at('label', i), w, { entry: `card-${i}.label` })
    put(state.sink, record.key, at('link', i), 'https://example.test/', { entry: `card-${i}.link` })
  })
  return { state, record }
}
const control = (extra = {}) => ({ control: ['label', 'link'], by: 'empty', why: 'invented', ...extra })
const valueAt = (record, field, i) =>
  [...record.values.values()].find(
    (v) => JSON.stringify(v.loc.jsonPath) === JSON.stringify(['cards', field, i])
  )
const codeOf = (run) => {
  try {
    run()
  } catch (error) {
    return error.code
  }
  return 'passed'
}
const SHARED = { scope: 'block', from: 'first-item' }

test('from the first item: its words are written into every card, as the template prints them', () => {
  const { state, record } = cardsWith(['Book now', null, null])
  emptyControl(state, record, control(SHARED))
  for (const i of [1, 2]) {
    assert.equal(valueAt(record, 'label', i).value, 'Book now')
    assert.equal(valueAt(record, 'label', i).rule, 'hides.from_first_item')
  }
  assert.ok(!state.sink.unproven.some((u) => u.code === 'control_shared_by_items'))
})

test('from the first item: an empty first card stops the plan', () => {
  assert.equal(
    codeOf(() => {
      const { state, record } = cardsWith([null, 'Book now', null])
      emptyControl(state, record, control(SHARED))
    }),
    'control_first_item_empty'
  )
})

test('from the first item: a card with other words takes the first words, its own skipped typed; the plan goes on', () => {
  const { state, record } = cardsWith(['Book now', 'Call us', null])
  emptyControl(state, record, control(SHARED))
  for (const i of [1, 2]) assert.equal(valueAt(record, 'label', i).value, 'Book now')
  assert.deepEqual(
    state.sink.skipped.map((s) => [s.entry, s.reason, s.by]),
    [['card-1.label', CONTROL_FROM_FIRST, 'card-0.label']]
  )
  // The card's address agreed with the first: written, not skipped.
  assert.equal(state.sink.consumed.get('card-1.link'), record.key)
  assert.ok(!state.sink.consumed.has('card-1.label'))
})

test('scope item: each card prints its own, so other words are fine; no scope keeps the older flag', () => {
  const own = cardsWith(['Book now', 'Call us', null])
  emptyControl(own.state, own.record, control({ scope: 'item' }))
  assert.equal(valueAt(own.record, 'label', 2), undefined)
  assert.deepEqual(own.state.sink.unproven, [])
  const older = cardsWith(['Book now', 'Call us', null])
  emptyControl(older.state, older.record, control())
  assert.ok(older.state.sink.unproven.some((u) => u.code === 'control_shared_by_items'))
})

const ROWS = {
  lists: {
    rows: {
      fields: {
        text: [1, 2, 3].map((n) => ({
          entity: 'module-9',
          column: 'content',
          xpath: `/html/body/div/ul/li[${n}]/text()`
        }))
      }
    }
  }
}
const rowsWith = (filled, order) => {
  const state = stateOf({ 'block-9': ROWS })
  const record = recordOf(state.sink, 'copy:p.b', { kind: 'copy', block: 'block-9' })
  for (const n of filled)
    put(state.sink, record.key, ROWS.lists.rows.fields.text[n - 1], 'Row', { entry: `row-${n}` })
  return {
    state,
    record,
    run: () => omitRows(state, record, { rows: 'rows', by: 'omit', why: 'invented', order })
  }
}

test('omit packed: rows after the last filled one are taken out; a gap before a filled row is kept and listed', () => {
  const packed = rowsWith([1], 'packed')
  packed.run()
  assert.deepEqual(
    packed.record.removes.map((r) => r.xpath),
    ['/html/body/div/ul/li[3]', '/html/body/div/ul/li[2]']
  )
  const gap = rowsWith([1, 3], 'packed')
  gap.state.left = []
  assert.equal(codeOf(gap.run), 'passed')
  assert.deepEqual(
    gap.state.left.map((l) => l.code),
    ['omit_row_gap']
  )
  const older = rowsWith([1, 3])
  older.run()
  assert.ok(older.state.sink.unproven.some((u) => u.code === 'omit_row_gap'))
})
