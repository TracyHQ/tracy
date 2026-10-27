// The contribution contract `wo-contribution/v1`: a closed field list, per-field values, and no private field anywhere.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HUB_FIELDS, parseContribution } from '../src/hub/observations.js'

const NOW = Date.parse('2026-10-24T12:00:00Z')
const subject = { identity: { namespace: 'google', externalId: 'ChIJ-one' } }
const google = { family: 'google_maps', objectId: 'ChIJ-one' }
const contribution = (observations, extra = {}) => ({
  schema: 'wo-contribution/v1',
  subject,
  observations,
  ...extra
})

test('a valid observation keeps its normalized value and the claimed source and time', () => {
  const out = parseContribution(
    contribution([
      {
        field: 'website',
        value: 'HTTPS://Example.COM',
        source: google,
        observedAtClaimed: '2026-10-24T09:00:00Z'
      }
    ]),
    { now: NOW }
  )
  assert.equal(out.ok, true)
  assert.deepEqual(out.subject, { namespace: 'google', externalId: 'ChIJ-one' })
  assert.deepEqual(out.observations, [
    {
      ordinal: 0,
      field: 'website',
      value: 'https://example.com/',
      source: { family: 'google_maps', objectId: 'ChIJ-one' },
      observedAtClaimed: '2026-10-24T09:00:00.000Z',
      status: 'pending',
      reason: null
    }
  ])
})

test('each observation is judged alone: a bad one is rejected with a reason, the rest stay pending', () => {
  const out = parseContribution(
    contribution([
      { field: 'phone', value: '+31 20 123 4567', source: google },
      { field: 'deal_status', value: 'won', source: google },
      { field: 'favourite_colour', value: 'red', source: google },
      { field: 'rating', value: { rating: 7, reviewCount: 3 }, source: google },
      { field: 'name', value: 'Cafe', source: { family: 'Google Maps!' } },
      { field: 'name', value: 'Cafe', source: google, observedAtClaimed: 'yesterday' }
    ]),
    { now: NOW }
  )
  assert.equal(out.ok, true)
  assert.deepEqual(
    out.observations.map((o) => [o.status, o.reason]),
    [
      ['pending', null],
      ['rejected', 'private_field'],
      ['rejected', 'field_not_allowed'],
      ['rejected', 'invalid_value'],
      ['rejected', 'invalid_source'],
      ['rejected', 'invalid_observed_at']
    ]
  )
  assert.equal(out.observations[0].value, '+31201234567')
  assert.equal(out.observations[1].value, null)
})

test('a pipeline or private field nested anywhere in an observation is refused', () => {
  const nested = [
    { field: 'location', value: { latitude: 1, longitude: 2, notes: 'call back' }, source: google },
    { field: 'name', value: 'Cafe', source: { ...google, meta: { pipeline: { stage: 'won' } } } },
    { field: 'name', value: 'Cafe', source: google, extra: [{ siteBrief: {} }] },
    { field: 'opening_hours', value: { weekdayText: ['Mon 9-5'], demoUrl: 'x' }, source: google }
  ]
  const out = parseContribution(contribution(nested), { now: NOW })
  assert.deepEqual(
    out.observations.map((o) => o.reason),
    ['private_field', 'private_field', 'private_field', 'private_field']
  )
})

test('a private field outside the observations refuses the whole contribution', () => {
  const out = parseContribution(
    contribution([{ field: 'name', value: 'Cafe', source: google }], {
      context: { deal: { status: 'won' } }
    }),
    { now: NOW }
  )
  assert.deepEqual(out, { ok: false, code: 'private_field', path: 'context.deal' })
  const subjectLeak = parseContribution(
    { ...contribution([]), subject: { identity: subject.identity, outreachDraft: 'hi' } },
    { now: NOW }
  )
  assert.equal(subjectLeak.code, 'private_field')
})

test('the envelope is checked: schema, subject, 1 to 50 observations', () => {
  const one = { field: 'name', value: 'Cafe', source: google }
  assert.equal(parseContribution(null, { now: NOW }).code, 'invalid_contribution')
  assert.equal(
    parseContribution({ ...contribution([one]), schema: 'v0' }, { now: NOW }).code,
    'unsupported_schema'
  )
  assert.equal(
    parseContribution({ ...contribution([one]), subject: {} }, { now: NOW }).code,
    'invalid_subject'
  )
  assert.equal(parseContribution(contribution([]), { now: NOW }).code, 'no_observations')
  assert.equal(
    parseContribution(contribution(Array.from({ length: 51 }, () => one)), { now: NOW }).code,
    'too_many_observations'
  )
  assert.equal(parseContribution(contribution([one], { colour: 1 }), { now: NOW }).code, 'unknown_key')
  assert.equal(parseContribution(contribution(Array.from({ length: 50 }, () => one)), { now: NOW }).ok, true)
})

test('the field list is closed and every field has a value check', () => {
  assert.deepEqual(Object.keys(HUB_FIELDS).sort(), [
    'address',
    'category',
    'email',
    'identity',
    'location',
    'name',
    'opening_hours',
    'phone',
    'photo_ref',
    'rating',
    'social_profile',
    'website'
  ])
  const ok = (field, value) =>
    parseContribution(contribution([{ field, value, source: google }]), { now: NOW }).observations[0]
  assert.deepEqual(ok('location', { latitude: 52.37, longitude: 4.89 }).value, {
    latitude: 52.37,
    longitude: 4.89
  })
  assert.equal(ok('location', { latitude: 91, longitude: 0 }).reason, 'invalid_value')
  assert.equal(ok('email', 'Hello@Cafe.Example').value, 'hello@cafe.example')
  assert.equal(ok('website', 'javascript:alert(1)').reason, 'invalid_value')
  assert.equal(ok('identity', { namespace: 'tripadvisor', externalId: 'd123' }).status, 'pending')
  assert.equal(
    ok('social_profile', { network: 'myspace', url: 'https://x.example/' }).reason,
    'invalid_value'
  )
  assert.equal(ok('phone', '12').reason, 'invalid_value')
  const at = (day, hour, minute) => ({ day, hour, minute })
  assert.deepEqual(
    ok('opening_hours', {
      periods: [
        { open: at(2, 8, 0), close: at(2, 17, 30) },
        { open: at(0, 0, 0) },
        { open: at(2, 8, 0), close: at(2, 17, 30) }
      ]
    }).value,
    { periods: ['0:0000-', '2:0800-2:1730'] }
  )
  assert.equal(ok('opening_hours', { periods: [{ open: at(7, 8, 0) }] }).reason, 'invalid_value')
  assert.equal(ok('opening_hours', { periods: [] }).reason, 'invalid_value')
  assert.equal(ok('opening_hours', {}).reason, 'invalid_value')
})

test('a claimed observation time far in the future is refused', () => {
  const out = parseContribution(
    contribution([
      { field: 'name', value: 'Cafe', source: google, observedAtClaimed: '2027-01-01T00:00:00Z' }
    ]),
    { now: NOW }
  )
  assert.equal(out.observations[0].reason, 'invalid_observed_at')
})
