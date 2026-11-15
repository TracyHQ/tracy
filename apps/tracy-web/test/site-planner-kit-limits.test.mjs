// The planner's answer gets each copy entry's missing maxCharacters from the kit before the checker reads it
// (plan-kit-limits.js), so R06 never sends a fix round for a number the spec says to copy.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { withKitCharacterLimits } from '../src/site-planner/plan-kit-limits.js'
import { brief, decisionOf, kit, plan } from './_site-plan-check.mjs'

const normalize = (value, k) => SITE_PLANNER_STEP.readAnswer(value, { ready: { kit: { doc: k } } })
const check = (value, k) => checkPlan({ plan: value, kit: k, brief: brief() })
const r06 = (value, k) => check(value, k).rules.find((rule) => rule.id === 'R06')

// The passing plan with maxCharacters left out of a block's own copy entry and of every list row's copy entry.
function withoutLimits() {
  const value = plan()
  const items = decisionOf(value, 'block-190')
  delete items.copy[0].maxCharacters
  for (const row of items.lists[0].items) for (const entry of row.copy) delete entry.maxCharacters
  decisionOf(value, 'block-163').lists[0].items[0].copy[1].maxCharacters = null
  return value
}

test('a copy entry without maxCharacters gets the kit limit R06 reads, and the plan passes every rule', () => {
  const k = kit()
  const value = withoutLimits()
  const before = structuredClone(value)
  const failing = r06(value, k)
  assert.equal(failing.status, 'fail')
  assert.equal(failing.failures.length, 6)
  assert.ok(failing.failures.every((f) => /maxCharacters is (missing|null)/.test(f.detail)))
  const result = normalize(value, k)
  assert.equal(r06(result, k).status, 'pass')
  assert.equal(check(result, k).summary.fail, 0)
  assert.deepEqual(result, plan(), 'the copied limits are the ones the passing plan writes by hand')
  assert.deepEqual(value, before, 'the answer is never modified in place')
  assert.strictEqual(normalize(result, k), result, 'a plan with every limit is returned as it is')
})

test('a number the plan gives is kept, so R06 still fails one above the kit limit', () => {
  const k = kit()
  const value = plan()
  const items = decisionOf(value, 'block-190')
  items.copy[0].maxCharacters = 99
  items.lists[0].items[0].copy[0].maxCharacters = 20
  const result = withKitCharacterLimits(value, k)
  assert.strictEqual(result, value)
  const failing = r06(result, k)
  assert.equal(failing.status, 'fail')
  assert.deepEqual(
    failing.failures.map((f) => f.detail),
    ['(a final-text limit) plan maxCharacters 99 is above the kit limit 37']
  )
})

test('a slot the kit gives no limit, a hidden block and a dropped page are left alone', () => {
  const k = kit()
  const value = plan()
  const items = decisionOf(value, 'block-190')
  items.copy.push({ slot: 'no-such-slot', says: 'a slot the kit does not know' })
  const hiddenBlock = {
    block: 'block-157',
    decision: 'hide',
    why: 'x',
    copy: [{ slot: 'block-157.0', says: 'x' }]
  }
  value.sharedBlocks.push(hiddenBlock)
  value.pages.push({
    id: 'page-dropped',
    decision: 'drop',
    blocks: [{ block: 'block-157', decision: 'keep', copy: [{ slot: 'block-157.0', says: 'x' }] }]
  })
  assert.strictEqual(withKitCharacterLimits(value, k), value)
})

test('the plan a fix round change list leaves gets the same limits', () => {
  const k = kit()
  const value = plan()
  const result = SITE_PLANNER_STEP.changes.applyValidChanges(
    value,
    {
      changes: [
        {
          block: 'block-190',
          field: 'copy',
          with: [{ slot: 'block-157.23', says: 'button to the classes', text: 'See classes', basis: 'trade' }]
        }
      ]
    },
    { ready: { kit: { doc: k } } }
  )
  assert.equal(result.ok, true)
  assert.equal(decisionOf(result.doc, 'block-190').copy[0].maxCharacters, 37)
  assert.equal(r06(result.doc, k).status, 'pass')
})
