// Opening hours the brief holds are always one left out line with a code (#575 walk: once the owner answered "Leave
// hours off the site", the newest plan said nothing of the hours). On the JA Boxing block store, which declares no
// hours field, the line is placement's own `no_place_in_design`, whatever held the hours; on a kit with an hours field
// it is the brief's case, or `owner_withheld` for the owner's choice. Invented facts, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-hours-left-out.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { briefLeftOutWithHoursOf, heldHoursLeftOutOf, kitShowsHours } from '../domain/held-hours-left-out.mjs'
import { boxingStore } from './fixtures/write-order/boxing-florist.mjs'

const ALL_WEEK = ['Monday: Open 24 hours', 'Tuesday: Open 24 hours']
const hoursFact = (more) => ({
  id: 'f-hours',
  field: 'hours',
  value: ALL_WEEK,
  evidence: [{ source: 'google' }],
  onSite: false,
  ...more
})
const unconfirmed = () => ({
  facts: [hoursFact({ decidedBy: 'rule', reasons: ['implausible-all-week-hours'] })],
  missing: [
    { field: 'hours', why: 'Only one source says...', withheld: [{ source: 'google', hours: ALL_WEEK }] }
  ]
})
const ownerLeft = () => ({
  facts: [hoursFact({ decidedBy: 'owner', reasons: ['owner-override'] })],
  missing: [{ field: 'hours', why: 'The owner chose to leave the opening hours off the site.' }]
})
const boxing = new Map(boxingStore.blocks.map((d) => [d.id, d]))
const withHours = new Map(
  [...boxing].map(([id, d]) =>
    id === 'contact-details'
      ? [id, { ...d, fields: [...d.fields, { name: 'hours', kind: 'contact.hours', type: 'text' }] }]
      : [id, d]
  )
)

test('the JA Boxing kit has no hours field', () => {
  assert.equal(kitShowsHours(boxing), false)
  assert.equal(kitShowsHours(withHours), true)
})

test('hours the owner left off, on a kit with no hours field: the design has no place for them', () => {
  assert.deepEqual(heldHoursLeftOutOf(ownerLeft(), boxing), {
    what: 'Opening hours',
    kind: 'feature',
    code: 'no_place_in_design',
    reason: 'Your design has no place that shows this.'
  })
  // Unconfirmed hours on the same kit read the same: the design could not show them in any case.
  assert.equal(heldHoursLeftOutOf(unconfirmed(), boxing).code, 'no_place_in_design')
})

test('on a kit with an hours field the line says why the brief holds them', () => {
  assert.equal(heldHoursLeftOutOf(ownerLeft(), withHours).code, 'owner_withheld')
  assert.equal(heldHoursLeftOutOf(unconfirmed(), withHours).code, 'hours_unconfirmed')
})

test('no hours found at all gives no line', () => {
  const none = {
    facts: [],
    missing: [{ field: 'hours', why: 'No opening hours were collected: show no hours.' }]
  }
  assert.equal(heldHoursLeftOutOf(none, boxing), null)
  assert.equal(heldHoursLeftOutOf({}, boxing), null)
})

test('the hook replaces the brief left out hours line, one hours line in all', () => {
  const brief = { ...unconfirmed(), contact: { whatsapp: { number: '+1 555 0100 222' } } }
  const lines = briefLeftOutWithHoursOf(brief, boxing)
  assert.deepEqual(
    lines.map((e) => e.code),
    ['no_place_for_whatsapp', 'no_place_in_design']
  )
  assert.equal(JSON.stringify(lines).includes('24 hours'), false)
  assert.deepEqual(
    briefLeftOutWithHoursOf(ownerLeft(), boxing).map((e) => e.code),
    ['no_place_in_design']
  )
})
