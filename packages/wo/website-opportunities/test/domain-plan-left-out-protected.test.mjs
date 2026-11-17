// The model never leaves out a fact the owner answered, nor the business name, phone, address or main button (#575
// walk, second round: the card lost its "Business name" and "Main button" rows to model entries saying "handled at the
// brand step" and "no verified link"). The entry is dropped as a recorded fix and the fact is placed by code. The
// invented florist on the JA Boxing block store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-protected.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { gatePlan } from '../domain/plan-gate.mjs'
import { isProtectedFact, withoutProtectedLeftOut } from '../domain/plan-left-out-protected.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { composition, contactPage, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

/** The florist's plan with no block showing `hidden`, and the model's left out entries. */
function gated(leftOut, hidden, extra = {}) {
  const profile = boxingProfile()
  // A name short enough for every business name field of the store, so placement has a place for it.
  profile.facts['business.name'][0].value = 'Larkspur'
  const pages = [homeOf(profile), contactPage()]
  for (const block of pages.flatMap((p) => p.blocks))
    block.data = block.data.filter((id) => !hidden.includes(id))
  const c = composition(pages)
  c.leftOut = leftOut
  return gatePlan(c, { ...contextOf(profile), ...extra })
}
const shownIds = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))

test('the business name the model leaves out by its id stays on the plan, placed by code', () => {
  const entry = { item: 'business-name', kind: 'item', reason: 'The name is set at the brand step.' }
  const result = gated([entry], ['business-name'])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.leftOut.some((e) => e.item === 'business-name'),
    false
  )
  assert.ok(shownIds(result.plan).has('business-name'))
  assert.ok(result.fixes.some((f) => f.code === 'left_out_protected_fact' && f.now === 'business-name'))
})

test('the main button named by its id in what (the walk shape) is never a left out line', () => {
  const entry = { what: 'contact-cta-label', kind: 'feature', reason: 'No verified link for this button.' }
  const result = gated([entry], ['contact-cta-label'])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.leftOut.some((e) => e.item === 'contact-cta-label' && e.code === 'model_reason'),
    false
  )
  assert.ok(result.fixes.some((f) => f.code === 'left_out_protected_fact'))
})

test('an entry naming a protected fact by its label is dropped too', () => {
  const entry = { what: 'Main button', kind: 'feature', reason: 'Not needed.' }
  const result = gated([entry], ['contact-cta-label'])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.leftOut.some((e) => e.what === 'Main button' && e.code === 'model_reason'),
    false
  )
})

test('a fact that is neither identity nor answered may still be left out by the model', () => {
  const entry = { item: 'contact-hours', kind: 'item', reason: 'The hours change every season.' }
  const result = gated([entry], ['contact-hours'])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.ok(result.plan.leftOut.some((e) => e.item === 'contact-hours'))
})

test('an entry the owner asked for on a change request stays', () => {
  const reason = 'You asked to take this off.'
  const reply = { leftOut: [{ item: 'contact-phone', kind: 'item', reason }] }
  const data = { byId: new Map([['contact-phone', { what: 'fact', kind: 'contact.phone', entry: {} }]]) }
  const fixes = []
  const out = withoutProtectedLeftOut(reply, data, (f) => fixes.push(f), new Set([reason]))
  assert.equal(out.leftOut.length, 1)
  assert.equal(fixes.length, 0)
})

test('a fact the owner answered is protected whatever its kind; a withheld one is not', () => {
  const answered = { what: 'fact', kind: 'business.tagline', entry: { sources: [{ kind: 'answer' }] } }
  const read = { what: 'fact', kind: 'business.tagline', entry: { sources: [{ kind: 'website' }] } }
  const name = { what: 'fact', kind: 'business.name', entry: { sources: [{ kind: 'website' }] } }
  const data = {
    byId: new Map([
      ['a', answered],
      ['b', read],
      ['n', name]
    ]),
    withheld: new Set(['n'])
  }
  assert.equal(isProtectedFact('a', data), true)
  assert.equal(isProtectedFact('b', data), false)
  assert.equal(isProtectedFact('n', data), false)
})
