// Item counts of the AI quickstart draft (#583): every count states its source, a minimum the kit only copied from
// the demo is refused, and an item field stored for fewer items than the maximum leaves the item fields only when
// the decisions say what it is instead. Invented blocks only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyItems, maxSourceOf, minSourceOf } from '../ai-quickstart/lib/draft-items.mjs'

const report = () => ({ problems: [], sparse: [] })
const measuredList = {
  min: 1,
  max: 3,
  minSource: 'measured',
  minEvidence: { layoutOkAt: [1, 2, 3] },
  maxFrom: 'demo-count'
}
const repeating = (slotsPerField) => ({
  id: 'cards',
  itemFields: Object.entries(slotsPerField).map(([name, n]) => ({
    name,
    type: 'text',
    slots: Array.from({ length: n }, (_, i) => `article-${i + 1}.${name.length}`)
  }))
})

test('a minimum the kit measured and a maximum of stored places carry their sources', () => {
  assert.match(minSourceOf(measuredList), /^measured by the kit .* with 1, 2, 3 item\(s\)/)
  assert.match(maxSourceOf(measuredList), /places the template stores/)
  const block = repeating({ name: 3 })
  const out = report()
  applyItems(block, {}, { items: { min: 1, max: 3 }, from: { min: 'a', max: 'b' } }, out)
  assert.deepEqual(block.items, { min: 1, max: 3 })
  assert.deepEqual(block.itemsFrom, { min: 'a', max: 'b' })
  assert.deepEqual(out.problems, [])
})

test('a minimum copied from the demo count has no source and is refused', () => {
  assert.equal(minSourceOf({ min: 6, minSource: 'demo count (not measured)' }), null)
  const block = repeating({ photo: 6 })
  const out = report()
  applyItems(block, {}, { items: { min: 6, max: 6 }, from: { min: null, max: 'stored' } }, out)
  assert.match(out.problems[0].problem, /item minimum 6 has no source/)
})

test('decided counts need their sources too; with them the draft takes the decision', () => {
  const out = report()
  const block = repeating({ photo: 6 })
  applyItems(
    block,
    { items: { min: 1, max: 6 } },
    { items: { min: 6, max: 6 }, from: { min: null, max: 'x' } },
    out
  )
  assert.deepEqual(
    out.problems.map((p) => p.problem.split(':')[0]),
    ['item minimum 1 has no source', 'item maximum 6 has no source']
  )
  const ok = report()
  const decided = repeating({ photo: 6 })
  applyItems(
    decided,
    {
      items: { min: 1, max: 6 },
      itemsFrom: { min: 'invented: measured at 390 px', max: 'invented: stored' }
    },
    { items: { min: 6, max: 6 }, from: {} },
    ok
  )
  assert.deepEqual(ok.problems, [])
  assert.equal(decided.itemsFrom.min, 'invented: measured at 390 px')
})

test('a block that shows one thing counts one, and says so', () => {
  const block = { id: 'intro', fields: [] }
  const out = report()
  applyItems(block, {}, { items: null, from: null }, out)
  assert.deepEqual(block.items, { min: 1, max: 1 })
  assert.equal(block.itemsFrom.min, 'the block shows one thing')
  assert.deepEqual(out.problems, [])
})

test('an item field stored for fewer items than the maximum is a problem until the decisions name it', () => {
  const block = repeating({ name: 3, note: 2 })
  const out = report()
  applyItems(block, {}, { items: { min: 1, max: 3 }, from: { min: 'a', max: 'b' } }, out)
  assert.equal(out.problems.length, 1)
  assert.match(out.problems[0].problem, /item field note is stored for 2 of max 3 items/)
  assert.equal(block.itemFields.length, 2, 'kept, so the contract check fails too')
})

test('a named sparse field leaves the item fields, recorded with what it is instead', () => {
  const block = repeating({ name: 3, note: 2 })
  const out = report()
  const decision = { sparse: { 'article-1.4': 'invented: a row only some items store' } }
  applyItems(block, decision, { items: { min: 1, max: 3 }, from: { min: 'a', max: 'b' } }, out)
  assert.deepEqual(out.problems, [])
  assert.deepEqual(
    block.itemFields.map((f) => f.name),
    ['name']
  )
  assert.deepEqual(out.sparse, [
    {
      block: 'cards',
      field: 'note',
      slots: ['article-1.4', 'article-2.4'],
      max: 3,
      why: 'invented: a row only some items store'
    }
  ])
})

test('lowering the maximum to the stored places keeps the field', () => {
  const block = repeating({ name: 7 })
  const out = report()
  applyItems(
    block,
    { items: { min: 4, max: 7 }, itemsFrom: { min: 'invented min', max: 'invented: seven stored' } },
    { items: { min: 4, max: 8 }, from: {} },
    out
  )
  assert.deepEqual(out.problems, [])
  assert.equal(block.itemFields.length, 1)
})
