/**
 * The Site content brief checklist model (#537, option E): every item of the brief lands in one of five steps by its
 * kind, a kind the mapping does not know lands in the default step, a step stays reviewed only while its content
 * reads the same, and an approved brief reads as all reviewed.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-brief-steps.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_BRIEF_STEP,
  briefReview,
  briefReviewKey,
  briefStepOf,
  briefSteps,
  firstOpenStep,
  leftOffKeys,
  markStep,
  parseMarks,
  stepAfterMark
} from '../src/client/brief-steps-model.ts'

const row = (id, field, extra = {}) => ({
  id,
  field,
  label: field ?? 'Other',
  value: `${id} value`,
  source: 'From Google',
  onSite: true,
  ownerChoice: false,
  notes: [],
  ...extra
})

// A made-up bakery: one item of every kind the brief states today, plus one kind no step names.
const rows = [
  row('f_name', 'name'),
  row('f_phone', 'phone'),
  row('f_hours', 'hours', { onSite: false, noteKeys: ['facts.reason.implausible-all-week-hours'] }),
  row('f_area', 'serviceAreas'),
  row('f_wa', 'whatsapp'),
  row('f_chan', 'contactChannels'),
  row('f_s1', 'services'),
  row('f_s2', 'services'),
  row('f_story', 'story'),
  row('f_aud', 'audience'),
  row('f_team', 'team', { onSite: false, noteKeys: ['facts.reason.review-only-person'] }),
  row('f_rating', 'googleRating', { onSite: false }),
  row('f_social', 'socials'),
  row('f_fig', 'socialFigures'),
  row('photos', 'photos', { readOnly: true }),
  row('brand', 'brand', { readOnly: true }),
  row('f_odd', 'deliveryZones'),
  row('f_null', null)
]

test('each kind lands in its step and the steps keep the given order', () => {
  const steps = briefSteps(rows)
  assert.deepEqual(
    steps.map((s) => s.n),
    [1, 2, 3, 4, 5]
  )
  const ids = (n) => steps[n - 1].items.map((r) => r.id)
  assert.deepEqual(ids(1), ['f_name', 'f_phone', 'f_hours', 'f_area', 'f_wa', 'f_chan'])
  assert.deepEqual(ids(2), ['f_s1', 'f_s2'])
  assert.deepEqual(ids(4), ['f_team', 'f_rating'])
  assert.deepEqual(ids(5), ['f_social', 'f_fig', 'photos', 'brand'])
  assert.equal(steps[0].titleKey, 'brief.steps.1')
})

test('a kind no step names goes to the default step, so no item is dropped', () => {
  // test-quality: contract the brief opens on its third step, as the owner approved (#522)
  assert.equal(DEFAULT_BRIEF_STEP, 3)
  assert.equal(briefStepOf('deliveryZones'), 3)
  assert.equal(briefStepOf(null), 3)
  const steps = briefSteps(rows)
  assert.deepEqual(
    steps[2].items.map((r) => r.id),
    ['f_story', 'f_aud', 'f_odd', 'f_null']
  )
  assert.equal(
    steps.reduce((n, s) => n + s.items.length, 0),
    rows.length
  )
})

test('the chip counts the items the site says', () => {
  const [business, , , team] = briefSteps(rows)
  assert.equal(business.on, 5)
  assert.equal(business.items.length, 6)
  assert.equal(team.on, 0)
})

test('marking a step reviews it, and only it', () => {
  const steps = briefSteps(rows)
  let review = briefReview(steps, {})
  assert.equal(review.count, 0)
  assert.equal(review.all, false)
  assert.equal(firstOpenStep(review), 1)
  const marks = markStep({}, steps[0])
  review = briefReview(steps, marks)
  assert.equal(review.reviewed[1], true)
  assert.equal(review.reviewed[2], false)
  assert.equal(review.count, 1)
  assert.equal(firstOpenStep(review), 2)
})

test('an edit or a switch in a reviewed step clears its tick; other steps keep theirs', () => {
  const steps = briefSteps(rows)
  const marks = steps.reduce((m, s) => markStep(m, s), {})
  assert.equal(briefReview(steps, marks).all, true)
  // The phone was edited.
  const edited = briefSteps(rows.map((r) => (r.id === 'f_phone' ? { ...r, value: '+1 555 0199' } : r)))
  let review = briefReview(edited, marks)
  assert.equal(review.reviewed[1], false)
  assert.equal(review.reviewed[2], true)
  assert.equal(review.all, false)
  // A service was switched off.
  const switched = briefSteps(rows.map((r) => (r.id === 'f_s2' ? { ...r, onSite: false } : r)))
  review = briefReview(switched, marks)
  assert.equal(review.reviewed[2], false)
  assert.equal(review.reviewed[1], true)
})

test('an approved brief reads as every step reviewed, whatever was stored', () => {
  const review = briefReview(briefSteps(rows), {}, true)
  assert.equal(review.all, true)
  assert.equal(review.count, 5)
})

test('Mark reviewed moves on; on the last step it goes back to the first open one', () => {
  const steps = briefSteps(rows)
  const none = briefReview(steps, {})
  assert.equal(stepAfterMark(1, none), 2)
  assert.equal(stepAfterMark(4, none), 5)
  const lastOnly = briefReview(steps, markStep({}, steps[4]))
  assert.equal(stepAfterMark(5, lastOnly), 1)
  const all = briefReview(steps, {}, true)
  assert.equal(stepAfterMark(5, all), 5)
})

test('the marks are kept per opportunity and brief revision, and bad storage reads as none', () => {
  assert.equal(briefReviewKey('opp-1', 'rev-2'), 'tracy-wo-brief-reviewed:opp-1:rev-2')
  assert.notEqual(briefReviewKey('opp-1', 'rev-2'), briefReviewKey('opp-1', 'rev-3'))
  assert.deepEqual(parseMarks(null), {})
  assert.deepEqual(parseMarks('not json'), {})
  assert.deepEqual(parseMarks('[1,2]'), {})
  assert.deepEqual(parseMarks('{"1":"abc","2":5}'), { 1: 'abc' })
})

test('an item left off says why in plain words; one the site says has no such line', () => {
  assert.deepEqual(leftOffKeys(rows[2]), ['brief.leftOff.implausible-all-week-hours'])
  assert.deepEqual(leftOffKeys(rows[11]), ['brief.leftOff.other'])
  assert.deepEqual(leftOffKeys({ ...rows[1], onSite: false, ownerChoice: true }), ['brief.leftOff.owner'])
  assert.deepEqual(leftOffKeys(rows[0]), [])
  assert.deepEqual(leftOffKeys({ ...rows[14], onSite: false }), [])
})
