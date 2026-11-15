// The left out list as the customer reads it (#609 defects of a real run): an entry the model names by a block store
// id is named by its section, its reason is the one code knows from the block and the data, with a stable code; a page
// type slug reads as words; a reason with a build word the gate cannot replace goes back to the model. The invented
// florist on the JA Boxing block store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-wording.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { DERIVED_LEFT_OUT_REASONS, derivedReasonOf } from '../domain/plan-left-out-wording.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { SHARED, b, composition, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

/** The florist without an email address, and a contact page that holds what is left. */
function florist() {
  const profile = boxingProfile()
  delete profile.facts['contact.email']
  return profile
}
const contact = () => ({
  pageType: 'contact',
  name: 'Contact',
  blocks: [
    ...SHARED(),
    b('contact-details', ['contact-phone', 'contact-address']),
    b('block-171', ['contact-social-url', 'contact-social-url-2', 'contact-social-url-3'])
  ]
})
const gated = (leftOut) => {
  const profile = florist()
  const c = composition([homeOf(profile), contact()])
  c.leftOut = leftOut
  return gatePlan(c, contextOf(profile))
}
const BUILD_WORDS = /block-\d+|\bcta\b|\burl\b|\bfields?\b/i

test('a block the model names by its store id is named by its section, with the reason code knows', () => {
  const result = gated([
    {
      what: 'block-169 newsletter',
      kind: 'block',
      reason: 'No business email was provided to receive responses.'
    },
    {
      what: 'block-157 services block',
      kind: 'block',
      reason: 'Its item fields do not match the service data.'
    },
    { what: 'news-post page', kind: 'page', reason: 'No post was provided for its main block.' }
  ])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const model = result.plan.leftOut.slice(0, 3)
  assert.deepEqual(model, [
    {
      what: 'Newsletter',
      kind: 'block',
      reason: DERIVED_LEFT_OUT_REASONS.no_email_for_form,
      code: 'no_email_for_form'
    },
    {
      what: 'Services',
      kind: 'block',
      reason: DERIVED_LEFT_OUT_REASONS.shown_in_other_sections,
      code: 'shown_in_other_sections'
    },
    {
      what: 'News post page',
      kind: 'page',
      reason: 'No post was provided for its main section.',
      code: 'model_reason'
    }
  ])
  for (const e of result.plan.leftOut) {
    assert.doesNotMatch(`${e.what} ${e.reason}`, BUILD_WORDS)
    assert.equal(typeof e.code, 'string')
  }
  assert.deepEqual(
    result.fixes.map((f) => `${f.code}@${f.at}`),
    [
      'left_out_internal_name@leftOut[0].what',
      'left_out_reason_derived@leftOut[0].reason',
      'left_out_internal_name@leftOut[1].what',
      'left_out_reason_derived@leftOut[1].reason',
      'left_out_internal_name@leftOut[2].what',
      'left_out_wording@leftOut[2].reason'
    ]
  )
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('a reason with a build word the gate cannot replace goes back to the model', () => {
  const result = gated([{ what: 'Booking strip', kind: 'block', reason: 'No contact CTA URL was provided.' }])
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => `${p.code}@${p.at}`),
    ['left_out_internal_wording@leftOut[0].reason']
  )
})

test('the reason code knows: no booking link for a button, nothing of its kind to show', () => {
  const store = new Map(contextOf(florist()).blocks)
  const data = { facts: [{ id: 'business-name', kind: 'business.name' }], items: [] }
  assert.equal(derivedReasonOf(store.get('block-161'), { data, pages: [] }), 'no_booking_link')
  assert.equal(derivedReasonOf(store.get('block-176'), { data, pages: [] }), 'no_booking_link')
  assert.equal(derivedReasonOf(store.get('block-157'), { data, pages: [] }), 'no_items_to_show')
  const one = { ...data, items: [{ id: 's1', kind: 'service' }] }
  assert.equal(derivedReasonOf(store.get('block-157'), { data: one, pages: [] }), null)
})

test('a code made entry carries its code and the fact it reports, which the plan still lists', () => {
  const result = gated([])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  for (const e of result.plan.leftOut) assert.match(e.code, /^[a-z][a-z0-9_]*$/)
  const ids = new Set(
    [...result.plan.facts, ...result.plan.items, ...(result.plan.rows ?? [])].map((d) => d.id)
  )
  for (const e of result.plan.leftOut.filter((x) => x.item !== undefined)) assert.equal(ids.has(e.item), true)
})

test('an entry with no code of its own gets one, and Contract B refuses an item the plan does not list', () => {
  const profile = florist()
  const context = {
    ...contextOf(profile),
    leftOut: [{ what: 'About page', kind: 'page', reason: 'You removed it.' }]
  }
  const result = gatePlan(composition([homeOf(profile), contact()]), context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(result.plan.leftOut.find((e) => e.what === 'About page').code, 'stated')
  const plan = structuredClone(result.plan)
  plan.leftOut[0] = { ...plan.leftOut[0], item: 'no-such-fact', code: 'Not A Code' }
  assert.deepEqual(
    checkBuildDocument(plan)
      .problems.map((p) => p.at)
      .sort(),
    ['leftOut[0].code', 'leftOut[0].item']
  )
})
