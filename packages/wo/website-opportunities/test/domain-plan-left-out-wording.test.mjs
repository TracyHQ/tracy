// The left out list as the customer reads it (#609 defects of a real run): an entry the model names by a block store
// id is named by its section, its reason is the one code knows from the block and the data, with a stable code; a page
// entry of the model is dropped (code lists the pages, a single post page never); a reason with a build word the gate
// cannot replace goes back to the model. The invented
// florist on the JA Boxing block store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-wording.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { PAGE_NOTHING_TO_SHOW } from '../domain/plan-left-out-pages.mjs'
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
    { what: 'featured-posts page', kind: 'page', reason: 'No post was provided for its main block.' },
    { what: 'news-post page', kind: 'page', reason: 'No post was provided for its main block.' }
  ])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const model = result.plan.leftOut.filter((e) => e.kind !== 'page')
  const pages = result.plan.leftOut.filter((e) => e.kind === 'page')
  assert.deepEqual(model.slice(0, 2), [
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
    }
  ])
  // The featured posts page is listed by code, from the template's page types and the data, never from the entry.
  assert.deepEqual(
    pages.find((e) => e.params.page === 'Featured posts'),
    {
      what: 'Featured posts page',
      kind: 'page',
      reason: PAGE_NOTHING_TO_SHOW.reason,
      code: 'page_nothing_to_show',
      params: { page: 'Featured posts' }
    }
  )
  // A single post page is never listed: the posts page says it (`plan-left-out-pages.mjs`).
  assert.equal(
    result.plan.leftOut.some((e) => /news post/i.test(e.what)),
    false
  )
  for (const e of result.plan.leftOut) {
    assert.doesNotMatch(`${e.what} ${e.reason}`, BUILD_WORDS)
    assert.equal(typeof e.code, 'string')
  }
  assert.deepEqual(
    result.fixes.filter((f) => !f.code.startsWith('end_action')).map((f) => `${f.code}@${f.at}`),
    [
      'left_out_unkeyed@leftOut[2]',
      'left_out_unkeyed@leftOut[3]',
      'left_out_internal_name@leftOut[0].what',
      'left_out_reason_derived@leftOut[0].reason',
      'left_out_internal_name@leftOut[1].what',
      'left_out_reason_derived@leftOut[1].reason'
    ]
  )
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('a reason with a build word is replaced by code; a section name with one goes back to the model', () => {
  const fixed = gated([{ what: 'Booking strip', kind: 'block', reason: 'No contact CTA URL was provided.' }])
  assert.equal(fixed.ok, true, JSON.stringify(fixed.problems))
  assert.equal(fixed.plan.leftOut.find((e) => e.what === 'Booking strip').code, 'left_out_neutral')
  const result = gated([{ what: 'CTA strip', kind: 'block', reason: 'Nothing to say here.' }])
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => `${p.code}@${p.at}`),
    ['left_out_internal_wording@leftOut[0].what']
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
    leftOut: [{ what: 'Price list', kind: 'feature', reason: 'You removed it.' }]
  }
  const result = gatePlan(composition([homeOf(profile), contact()]), context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const at = result.plan.leftOut.findIndex((e) => e.what === 'Price list')
  assert.equal(result.plan.leftOut[at].code, 'stated')
  const plan = structuredClone(result.plan)
  plan.leftOut[at] = { ...plan.leftOut[at], item: 'no-such-fact', code: 'Not A Code' }
  assert.deepEqual(
    checkBuildDocument(plan)
      .problems.map((p) => p.at)
      .sort(),
    [`leftOut[${at}].code`, `leftOut[${at}].item`]
  )
})
