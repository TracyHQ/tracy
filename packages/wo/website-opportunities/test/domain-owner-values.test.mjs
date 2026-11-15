// The contact values the owner types in the build chat (decision D46 as amended, #609): a phone, an email, opening
// hours or a booking link is used on the site as a value, source "Your answer", taken exactly and never reworded.
// Invalid values are dropped with a reason; a held person's own phone or email never reaches anything; a value the
// owner gives meets a public one by the trust order (website, answer, google, social). Invented studio, invented club,
// scripted fakes, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-owner-values.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldPersonFormsOf } from '../domain/held-person-forms.mjs'
import { needsProfileOf, needsProfileRequest, sourcesOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { OWNER_VALUE_REASONS, ownerValuesOf } from '../domain/owner-values.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { ownerStatementRecordOf } from '../src/business-reading.js'
import { ownerPlan, writeOwnerPlan, factWriter } from './fixtures/owner-statement/club-owner-facts.mjs'

const values = (text) => ownerValuesOf(text)?.values.map((v) => [v.kind, v.value]) ?? []
const drops = (text) => ownerValuesOf(text)?.dropped.map((d) => [d.kind, d.code]) ?? []

test('each value is taken as typed, normalised only by the existing rules', () => {
  assert.deepEqual(
    values(
      'Call us on 0400 555 0101 any day. Email hello@kilnmere.example or book at https://kilnmere.example/book.'
    ),
    [
      ['contact.phone', '0400 555 0101'],
      ['contact.cta_url', 'https://kilnmere.example/book'],
      ['contact.email', 'hello@kilnmere.example']
    ]
  )
  // A plus no calling code follows is a stray mark (`withoutStrayPlus`); a real one stays.
  assert.deepEqual(values('Phone +000 10 000 2222.'), [['contact.phone', '000 10 000 2222']])
  assert.deepEqual(values('WhatsApp +44 20 7946 0958.'), [['contact.phone', '+44 20 7946 0958']])
  assert.deepEqual(values('Book a wheel at www.kilnmere.example/wheel.'), [
    ['contact.cta_url', 'https://www.kilnmere.example/wheel']
  ])
  assert.deepEqual(
    values('We are open Monday to Friday 9am to 5pm and Saturday 10:00 to 14:00. Sunday closed.'),
    [['contact.hours', 'Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su closed']]
  )
  assert.deepEqual(values('Open weekdays 9-5pm.'), [['contact.hours', 'Mo-Fr 09:00-17:00']])
  // No value at all: nothing, not an empty record.
  assert.equal(ownerValuesOf('We have run the studio since 1998-2005 in Velmora.'), null)
})

test('a value that is not one is dropped with its reason, never shown', () => {
  assert.deepEqual(drops('Phone 555-01 for now.'), [['contact.phone', 'not_a_phone']])
  assert.deepEqual(drops('Mail us at info@kilnmere.'), [['contact.email', 'not_an_email']])
  assert.deepEqual(drops('Book here: javascript:alert(1).'), [['contact.cta_url', 'unsafe_link']])
  assert.deepEqual(drops('Book at ftp://kilnmere.example/book today.'), [['contact.cta_url', 'unsafe_link']])
  assert.deepEqual(drops('Book at http://[::1]/book today.'), [['contact.cta_url', 'unsafe_link']])
  assert.deepEqual(drops('Book at https://user:pw@kilnmere.example/x today.'), [
    ['contact.cta_url', 'unsafe_link']
  ])
  assert.deepEqual(drops('Our site is www.kilnmere.example for photos.'), [
    ['contact.cta_url', 'link_not_booking']
  ])
  // Hours that do not read: no am or pm and running backwards, or no time at all; never a guess.
  assert.deepEqual(drops('We open 9 to 5 on weekdays.'), [['contact.hours', 'hours_unreadable']])
  assert.deepEqual(drops('Open studio night on Fridays.'), [['contact.hours', 'hours_unreadable']])
  assert.deepEqual(drops('Call 0400 555 0101 or call 0400 555 0199.'), [['contact.phone', 'second_value']])
  for (const [, code] of drops('Phone 555-01. Mail info@kilnmere.')) assert.ok(OWNER_VALUE_REASONS[code])
  // A year, a price or a count is never read as a phone without a phone word or a leading plus.
  assert.deepEqual(values('Founded 2009, 1200 students, kiln 1300 degrees.'), [])
})

test("a held person's own phone and email never reach the reading, the research or the profile request", () => {
  const held = 'Brannoch Vey'
  const statement =
    'Call the studio on 0400 555 0101. Call Brannoch Vey on 0400 999 1111 for raku. ' +
    'Write to brannoch@kilnmere.example about firings.'
  const record = ownerStatementRecordOf(statement, [held], [held])
  assert.deepEqual(
    record.ownerValues.values.map((v) => v.value),
    ['0400 555 0101']
  )
  const brief = { facts: [], reading: { ownerValues: record.ownerValues }, missing: [] }
  const research = researchOf(brief)
  const request = needsProfileRequest(sourcesOf(research))
  const all = JSON.stringify([record, research, request])
  const { forms, firstCased } = heldPersonFormsOf(held)
  for (const form of [...forms, firstCased].filter(Boolean))
    assert.ok(!all.toLowerCase().includes(form.toLowerCase()), `no "${form}"`)
  assert.ok(!all.includes('999 1111'))
})

/** The phone of a profile made from `fields` per source, with its conflict when there is one. */
function phoneOf(given) {
  const sources = Object.entries(given).map(([id, phone]) => ({
    id,
    origin: { 'owner-statement': 'answer', site: 'website', gmaps: 'google' }[id],
    fields: { 'contact.phone': phone }
  }))
  const profile = needsProfileOf({ sources }, {})
  const [fact] = profile.facts['contact.phone']
  const conflict = profile.conflicts.find((c) => c.kind === 'contact.phone')
  const data = planDataOf(profile).facts.find((f) => f.kind === 'contact.phone')
  return {
    shown: fact.value,
    from: data.sources.map((s) => s.name),
    conflict: conflict ? { default: conflict.default, asked: Boolean(conflict.question) } : null
  }
}

test('the owner value meets public ones by the trust order: the conflict table', () => {
  const OWNER = '0400 555 0101'
  assert.deepEqual(phoneOf({ 'owner-statement': OWNER }), {
    shown: OWNER,
    from: ['Your answer'],
    conflict: null
  })
  // The same number written another way: one fact, the website's wording, both sources.
  assert.deepEqual(phoneOf({ site: '+61 400 555 0101', 'owner-statement': OWNER }), {
    shown: '+61 400 555 0101',
    from: ['Website', 'Your answer'],
    conflict: null
  })
  // A different number on the website: the website's is shown until the customer answers, and the plan asks.
  assert.deepEqual(phoneOf({ site: '0400 555 0202', 'owner-statement': OWNER }), {
    shown: '0400 555 0202',
    from: ['Website'],
    conflict: { default: '0400 555 0202', asked: true }
  })
  // A different number on Google: the owner's is shown, and the plan asks.
  assert.deepEqual(phoneOf({ gmaps: '0400 555 0303', 'owner-statement': OWNER }), {
    shown: OWNER,
    from: ['Your answer'],
    conflict: { default: OWNER, asked: true }
  })
})

test('a value the owner types reaches the site as typed, never held to the echo guard', async () => {
  const statement =
    'We are open Monday to Friday 7am to 10pm and Saturday 8am to 6pm. Juniors train on Saturdays.'
  const record = ownerStatementRecordOf(statement)
  assert.deepEqual(record.ownerValues.values, [
    { kind: 'contact.hours', value: 'Mo-Fr 07:00-22:00; Sa 08:00-18:00' }
  ])
  const built = await ownerPlan({ facts: [], reading: { ownerValues: record.ownerValues } })
  const hours = built.plan.facts.find((f) => f.kind === 'contact.hours')
  // Google and the owner state the same hours: the plan shows them once, the owner among the sources.
  assert.ok(hours.sources.some((s) => s.name === 'Your answer'))
  const written = await writeOwnerPlan(built, factWriter(), statement)
  const field = written.pages.flatMap((p) => p.fields).find((f) => f.data === 'contact-hours')
  assert.equal(field.from, 'data')
  assert.equal(field.value, 'Mo-Fr 07:00-22:00; Sa 08:00-18:00')
})
