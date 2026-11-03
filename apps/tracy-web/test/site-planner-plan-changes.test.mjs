// The finer changes of a fix round's change list (ADR 0041, #301 cost cuts): one field of a block, one entry added to
// a block's list, or one entry removed, so a fix to a few hidden slots no longer resends whole blocks. Pure: the plan
// is the invented Harbour Sport Club plan of the checker tests.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyChanges, CHANGES_INSTRUCTION } from '../src/site-planner/plan-changes.js'
import { plan } from './_site-plan-check.mjs'

/** The About page block with both copy and hidden slots, in a plan. */
const aboutBlock = (p) =>
  p.pages.find((x) => x.id === 'page-about-us').blocks.find((b) => b.block === 'block-190')

test('one field of a block is replaced without resending the block', () => {
  const previous = plan()
  const hidden = [{ slot: 'block-190.12', why: 'nothing true to say here' }]
  const out = applyChanges(previous, {
    changes: [{ block: 'block-190', field: 'hiddenSlots', with: hidden }]
  })
  assert.equal(out.ok, true, out.reason)
  const after = aboutBlock(out.plan)
  assert.deepEqual(after.hiddenSlots, hidden)
  assert.deepEqual(after.copy, aboutBlock(previous).copy, 'the other fields of the block changed')
  assert.equal(aboutBlock(previous).hiddenSlots.length, 4, 'the previous plan was modified')
})

test('an entry is added to a block list, and one is removed wherever it is', () => {
  const previous = plan()
  const entry = {
    slot: 'block-190.13',
    says: 'the club opening year',
    basis: 'brief',
    factIds: [],
    maxCharacters: 20
  }
  const out = applyChanges(previous, {
    changes: [
      { slot: 'block-190.13', remove: true },
      { block: 'block-190', add: 'copy', with: entry }
    ]
  })
  assert.equal(out.ok, true, out.reason)
  const after = aboutBlock(out.plan)
  assert.deepEqual(
    after.hiddenSlots.map((h) => h.slot),
    ['block-190.12', 'block-190.14', 'block-190.15']
  )
  assert.deepEqual(after.copy.at(-1), entry)
  assert.equal(after.copy.length, aboutBlock(previous).copy.length + 1)
})

test('a finer change that names nothing, or the wrong shape, is refused and nothing is applied', () => {
  const previous = plan()
  const cases = [
    [{ block: 'block-nowhere', field: 'copy', with: [] }, /block that does not exist/],
    [{ block: 'block-190', field: 'block', with: 'x' }, /cannot replace the block id/],
    [{ block: 'block-190', field: 'copy', with: {} }, /another type/],
    [{ block: 'block-190', add: 'copy', with: [] }, /one object/],
    [{ block: 'block-190', add: 'why', with: {} }, /not a list/],
    [{ block: 'block-190', field: 'copy', add: 'copy', with: [] }, /exactly one/],
    [{ slot: 'block-190.99', remove: true }, /slot that does not exist/],
    [{ slot: 'block-190.14', remove: 1 }, /remove must be true or a path/],
    [{ slot: 'block-190.14', remove: 'nowhere' }, /does not exist/],
    [{ slot: 'block-190.12', remove: true, with: {} }, /keys it should not/],
    [{ page: 'page-about-us', remove: true }, /cannot be removed/]
  ]
  for (const [change, reason] of cases) {
    const out = applyChanges(previous, { changes: [{ slot: 'block-190.12', remove: true }, change] })
    assert.equal(out.ok, false, JSON.stringify(change))
    assert.match(out.reason, reason, JSON.stringify(change))
  }
  assert.equal(aboutBlock(previous).hiddenSlots.length, 4)
})

test('the fix round instruction names the finer changes and keeps the whole part and section forms', () => {
  assert.match(CHANGES_INSTRUCTION, /"field"/)
  assert.match(CHANGES_INSTRUCTION, /"add"/)
  assert.match(CHANGES_INSTRUCTION, /"remove": true/)
  assert.match(CHANGES_INSTRUCTION, /"section"/)
  assert.match(CHANGES_INSTRUCTION, /in order/)
  assert.doesNotMatch(CHANGES_INSTRUCTION, /[\u2014\u2013]/)
})
