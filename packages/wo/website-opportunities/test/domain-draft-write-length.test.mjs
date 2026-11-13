// The one unit of every text limit (ticket #597, `draft-write-length.mjs`): what a visitor reads, in code points, NFC.
// The writer check (`charCount`), the order check and the write guard count the same, so a value the writer and the
// order check let through is never refused at the last guard for its length; the guard alone also holds a contract
// slot to the plugin door's own count (`doorLength`: a fixed width column counts its raw value), and the memory site
// refuses by that count. And held names hidden by double encoding or percent escapes are caught (`heldInLeaf`).
// Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-length.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCountsOf } from '../domain/draft-write-coverage.mjs'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { heldInLeaf, leafStringsOf } from '../domain/draft-write-held.mjs'
import { doorLength, visibleLength } from '../domain/draft-write-length.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { charCount } from '../domain/page-copy-check.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { checkContract } from '../domain/write-order-memory-rules.mjs'
import { fieldEntry, kit, plan, site, valueWhere } from './fixtures/draft-write/guarded.mjs'

const HEADING = 'home.home-b4.heading'
const LIMIT = fieldEntry(site.order, HEADING).limit
/** [case, a value of `n` visible characters]. */
const UNITS = [
  ['letters', (n) => 'a'.repeat(n)],
  ['emoji', (n) => '\u{1F338}'.repeat(n)],
  ['mathematical letters', (n) => '\u{1D401}'.repeat(n)],
  ['composed accents', (n) => 'é'.repeat(n)],
  ['decomposed accents', (n) => 'é'.repeat(n)],
  ['entities', (n) => '&amp;'.repeat(n)],
  ['a line break tag', (n) => `a<br>${'b'.repeat(n - 2)}`]
]
const orderOver = (value) => {
  const order = structuredClone(site.order)
  fieldEntry(order, HEADING).value = value
  return checkWriteOrder(order).some((p) => p.code === 'text_over_limit' && p.at === HEADING)
}
function guardOver(value) {
  const p = structuredClone(plan)
  valueWhere(p, (_, v) => v.entry === HEADING).value = value
  try {
    guardPlan(p, { order: site.order, kit })
  } catch (error) {
    return error.details.problems.some((x) => x.code === 'text_over_limit')
  }
  return false
}

test('the writer, the order check and the guard count every case alike, at the limit and one over', () => {
  for (const [name, make] of UNITS) {
    const at = make(LIMIT)
    assert.equal(charCount(at), LIMIT, name)
    assert.equal(visibleLength(at), LIMIT, name)
    assert.equal(orderOver(at), false, `${name}: order check at the limit`)
    assert.equal(guardOver(at), false, `${name}: guard at the limit`)
    const over = make(LIMIT + 1)
    assert.equal(orderOver(over), true, `${name}: order check over`)
    assert.equal(guardOver(over), true, `${name}: guard over`)
  }
})

test('a contract slot is held to the door count too: a title column counts its raw value', () => {
  const slot = { type: 'text', column: 'title', maxCharacters: 10 }
  assert.equal(doorLength(slot, '&amp;'.repeat(5)), 25)
  assert.equal(doorLength({ ...slot, column: 'content' }, '&amp;'.repeat(5)), 5)
  // The plugin reads an entity only with its semicolon.
  assert.equal(doorLength({ ...slot, column: 'content' }, '&copy 2026'), 10)
  const p = structuredClone(plan)
  const title = valueWhere(
    p,
    (o, v) => o.kind === 'contract.apply' && kit.slots.get(v.loc.slot)?.column === 'title'
  )
  const max = kit.slots.get(title.loc.slot).maxCharacters
  title.value = '&amp;'.repeat(Math.floor(max / 2))
  assert.throws(
    () => guardPlan(p, { order: site.order, kit }),
    (error) => error.details.problems.some((x) => x.code === 'text_over_limit' && x.unit === 'door')
  )
  const refuse = (text, s) => () =>
    checkContract(
      { expectedRevision: 1, changes: { k: text }, removes: [] },
      { slots: new Map([['k', { sample: 'x', entity: 'article-1', ...s }]]), revision: 1, modules: new Map() }
    )
  assert.throws(refuse('&amp;'.repeat(3), { ...slot, maxCharacters: 5 }), /SLOT_TOO_LONG/)
  assert.doesNotThrow(refuse('&amp;'.repeat(3), { ...slot, column: 'content', maxCharacters: 5 }))
})

test('the write plan sends NFC text: the door counts a decomposed accent once', () => {
  const order = structuredClone(site.order)
  fieldEntry(order, HEADING).value = 'Café stems'
  const made = writePlanOf(order, site.aiq, { stored: site.stored })
  assert.equal(valueWhere(made, (_, v) => v.entry === HEADING).value, 'Café stems')
})

test('held names hidden by double encoding or percent escapes are caught in any leaf', () => {
  const held = ["Siobhan O'Neill"]
  for (const leaf of [
    'Siobhan O&amp;#39;Neill',
    'Siobhan O&amp;amp;amp;#39;Neill',
    'Siobhan&amp;nbsp;O&#39;Neill',
    'https://example.test/team/Siobhan%20O%27Neill',
    'https://example.test/siobhan%2Do%2Dneill',
    'https://example.test/?q=Siobhan+O%27Neill',
    'Sio&shy;bhan O&#39;Neill'
  ])
    assert.equal(heldInLeaf(leaf, held), true, leaf)
  assert.equal(heldInLeaf('50% off for Siobhan fans', held), false)
  assert.equal(heldInLeaf('anything', []), false)
  assert.deepEqual(leafStringsOf({ a: ['x', { b: 'y' }], c: 1 }), ['x', 'y'])
  const p = structuredClone(plan)
  valueWhere(p, (_, v) => v.entry === HEADING).value = 'Siobhan O&amp;#39;Neill'
  assert.throws(
    () => guardPlan(p, { order: site.order, kit, withheld: { people: held } }),
    (error) => error.code === 'held_text_in_value'
  )
})

test('counts: every entry of the order, of every kind, is written, skipped or conflicted, once', () => {
  const counts = planCountsOf(plan)
  const { in: all, ...kinds } = counts.entries
  assert.equal(counts.in, all)
  assert.equal(
    Object.values(kinds).reduce((a, b) => a + b, 0),
    all
  )
  assert.equal(counts.written + counts.skipped + counts.conflicted, all)
  assert.ok(kinds.field < all, 'the order holds more entries than its field entries')
})
