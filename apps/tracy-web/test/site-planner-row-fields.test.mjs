// A field of a kept list row that the decision both writes and hides is written (site-planner/plan-row-fields.js):
// R23 keeps every printed field of a kept row and R10g decides nothing twice. Dev corpus, 16/11/2026: a JA Boxing
// class article's three feature descriptions were written and hidden at once (8 R10g and 6 R23 failures).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { withWrittenRowFieldsShown } from '../src/site-planner/plan-row-fields.js'

const kit = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)
const block = 'body-classes_group-boxing'
const write = (slot) => ({ slot, says: 'the feature', text: 'Footwork drills', basis: 'trade', factIds: [] })
const planOf = (decision) => ({
  sharedBlocks: [],
  pages: [{ id: 'page-classes_group-boxing', decision: 'keep', blocks: [decision] }]
})

test('a written field of a row the decision keeps is no longer hidden; the rest of the decision stays', () => {
  const decision = {
    block,
    decision: 'keep',
    copy: [write('article-2.18'), write('article-2.21')],
    hiddenSlots: [
      { slot: 'article-2.21', why: 'Demo first-visit timing has no brief fact.' },
      { slot: 'article-2.15', why: 'no video of the business' }
    ]
  }
  const value = planOf(decision)
  const out = withWrittenRowFieldsShown(value, kit).pages[0].blocks[0]
  assert.deepEqual(
    out.hiddenSlots.map((h) => h.slot),
    ['article-2.15']
  )
  assert.deepEqual(out.copy, decision.copy)
  assert.equal(value.pages[0].blocks[0].hiddenSlots.length, 2, 'the plan is never changed in place')
})

test('a row the decision does not show, a slot it only hides and a dropped page stay as the planner left them', () => {
  // Row 0 shows nothing but the doubly decided slot: the row is not kept, so nothing says the field must print.
  const lonely = {
    block,
    decision: 'keep',
    copy: [write('article-2.21')],
    hiddenSlots: [{ slot: 'article-2.21', why: 'no fact' }]
  }
  const value = planOf(lonely)
  assert.strictEqual(withWrittenRowFieldsShown(value, kit), value)
  const onlyHidden = {
    block,
    decision: 'keep',
    copy: [write('article-2.18')],
    hiddenSlots: [{ slot: 'article-2.21', why: 'x' }]
  }
  assert.strictEqual(withWrittenRowFieldsShown(planOf(onlyHidden), kit).pages[0].blocks[0], onlyHidden)
  const dropped = { sharedBlocks: [], pages: [{ id: 'page-x', decision: 'drop', why: 'not needed' }] }
  assert.strictEqual(withWrittenRowFieldsShown(dropped, kit), dropped)
})
