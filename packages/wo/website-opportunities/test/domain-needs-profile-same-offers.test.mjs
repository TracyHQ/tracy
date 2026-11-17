// One offer named twice under different names (#575, plan stage inputs, P8): a short and a long name of one lesson, or
// two wordings of one fitness class, read from different sources. Whether two names are one offer is the needs profile
// model's reading (`sameOffers` of its reply), never a word list in code; code only checks the reply's structure: every
// name is a service or package of the profile, all of one kind. The fuller entry is kept, the other is recorded as
// merged with the model's why and the whole record it had, so a wrong merge can be undone. An invented racquet club, a
// scripted reading, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-same-offers.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf, needsProfileRequest } from '../domain/needs-profile.mjs'
import { mergeSameOffers, SAME_OFFER_CODE } from '../domain/needs-profile-same-offers.mjs'

const SITE_TEXT =
  'Quillmere Racquet Club. Tennis lessons for every level, 60 minutes. Personal fitness sessions.'
const SOCIAL_TEXT = 'Tennis on the north courts. Tailored fitness lessons for players. Padel nights.'
const sources = () => [
  {
    id: 'website',
    origin: 'website',
    text: SITE_TEXT,
    items: [{ kind: 'service', fields: { 'offering.name': 'Tennis lessons' }, evidence: 'Tennis lessons' }]
  },
  { id: 'instagram', origin: 'social', text: SOCIAL_TEXT }
]
const item = (source, name, evidence, more = {}) => ({
  source,
  kind: 'service',
  fields: { 'offering.name': name, ...more },
  evidence
})
const reading = (sameOffers) => ({
  facts: [
    {
      source: 'website',
      kind: 'business.name',
      value: 'Quillmere Racquet Club',
      evidence: 'Quillmere Racquet Club.'
    }
  ],
  items: [
    item('website', 'Tennis lessons', 'Tennis lessons for every level, 60 minutes', {
      'offering.duration_or_unit': '60 minutes'
    }),
    item('website', 'Personal fitness sessions', 'Personal fitness sessions.'),
    item('instagram', 'Tennis', 'Tennis on the north courts.'),
    item('instagram', 'Tailored fitness lessons', 'Tailored fitness lessons for players.'),
    item('instagram', 'Padel nights', 'Padel nights.')
  ],
  ...(sameOffers ? { sameOffers } : {})
})
const names = (profile) => profile.items.service.map((s) => s.fields['offering.name'].value)

test('the request shows the model the offers already read from each source, so it can pair them', () => {
  const { user, system } = needsProfileRequest(sources())
  const read = JSON.parse(user).sources
  assert.deepEqual(read[0].offers, ['Tennis lessons'])
  assert.equal(read[1].offers, undefined)
  assert.match(system, /sameOffers/)
})

test('two names the model reads as one offer become one service: the fuller entry is kept', () => {
  const profile = needsProfileOf(
    { sources: sources() },
    reading([
      { names: ['Tennis lessons', 'Tennis'], why: 'the same tennis coaching, one name shorter' },
      {
        names: ['Tailored fitness lessons', 'Personal fitness sessions'],
        why: 'one fitness class, two wordings'
      }
    ])
  )
  assert.deepEqual(names(profile), ['Tennis lessons', 'Personal fitness sessions', 'Padel nights'])
  const tennis = profile.items.service[0]
  assert.deepEqual(tennis.sources.sort(), ['instagram', 'website'])
  assert.equal(tennis.fields['offering.duration_or_unit'].value, '60 minutes')
  const merged = profile.merged.filter((m) => m.code === SAME_OFFER_CODE)
  assert.deepEqual(
    merged.map((m) => [m.value, m.into, m.why]),
    [
      ['Tennis', tennis.id, 'the same tennis coaching, one name shorter'],
      ['Tailored fitness lessons', profile.items.service[1].id, 'one fitness class, two wordings']
    ]
  )
  // The whole record merged away is kept, so a wrong merge can be undone.
  assert.equal(merged[0].item.fields['offering.name'].value, 'Tennis')
  assert.deepEqual(merged[0].item.sources, ['instagram'])
  // A merged offer is never a dropped one: nothing about it reads as left out.
  assert.equal(
    profile.dropped.some((d) => d.value === 'Tennis'),
    false
  )
})

test('a pair naming an offer the profile does not hold, or one of each kind, merges nothing and is recorded', () => {
  const base = { sources: sources() }
  const unknown = needsProfileOf(base, reading([{ names: ['Tennis lessons', 'Squash'], why: 'x' }]))
  assert.equal(unknown.items.service.length, 5)
  assert.ok(unknown.dropped.some((d) => d.code === 'same_offer_unknown_name'))
  const withPackage = reading([{ names: ['Tennis', 'Court pass'], why: 'x' }])
  withPackage.items.push({
    source: 'instagram',
    kind: 'package',
    fields: { 'package.name': 'Court pass' },
    evidence: 'Court pass'
  })
  const kinds = needsProfileOf(
    { sources: [sources()[0], { ...sources()[1], text: `${SOCIAL_TEXT} Court pass.` }] },
    withPackage
  )
  assert.equal(kinds.items.service.length, 5)
  assert.ok(kinds.dropped.some((d) => d.code === 'same_offer_kinds_differ'))
  const odd = needsProfileOf(base, reading([{ names: ['Tennis'] }, 'Tennis', { names: 'Tennis, Padel' }]))
  assert.equal(odd.items.service.length, 5)
  assert.equal(odd.dropped.filter((d) => d.code === 'same_offer_unreadable').length, 3)
})

test('an item with a conflict in its fields is never merged away: the owner settles the conflict first', () => {
  const items = {
    service: [
      {
        id: 'service-tennis-lessons',
        kind: 'service',
        fields: { 'offering.name': { value: 'Tennis lessons', sources: ['website'] } },
        sources: ['website']
      },
      {
        id: 'service-tennis',
        kind: 'service',
        fields: {
          'offering.name': { value: 'Tennis', sources: ['instagram'] },
          'offering.price': { value: '40', sources: ['instagram'], conflict: 'conflict-1' }
        },
        sources: ['instagram']
      }
    ]
  }
  const out = mergeSameOffers(items, [{ names: ['Tennis', 'Tennis lessons'], why: 'same' }])
  assert.equal(out.items.service.length, 2)
  assert.deepEqual(
    out.dropped.map((d) => d.code),
    ['same_offer_conflicted']
  )
})
