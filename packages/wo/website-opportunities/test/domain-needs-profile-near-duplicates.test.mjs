// Near duplicate services in the needs profile (#609, a real run, here on an invented fight club): one page names the
// same course twice, once with a leading label and other punctuation; the profile keeps one service and records the
// merge, while two different courses that share words stay two. A scripted reading, no real business, no model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-near-duplicates.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { coreOfName, mergeNearDuplicates } from '../domain/needs-profile-near-duplicates.mjs'

const TEXT = [
  'Tidewater Fight Hall.',
  '6-week Pierline - Muay Thai Basics Course for new members.',
  "Tidewater's Sparring Course on Fridays.",
  'Muay Thai Sparring Course for members with a year of training.',
  'Boxing Classes and Kids Boxing Classes every day.'
].join(' ')
const site = (items) => ({ id: 'website', origin: 'website', language: 'en', text: TEXT, items })
const typed = (name, extra = {}) => ({
  kind: 'service',
  fields: { 'offering.name': name, ...extra },
  evidence: name
})
const names = (profile) => profile.items.service.map((s) => s.fields['offering.name'].value)
const reading = {
  facts: [
    {
      source: 'website',
      kind: 'business.name',
      value: 'Tidewater Fight Hall',
      evidence: 'Tidewater Fight Hall.'
    }
  ],
  items: [
    {
      source: 'website',
      kind: 'service',
      fields: {
        'offering.name': 'Pierline - Muay Thai Basics Course',
        'offering.duration_or_unit': '6-week'
      },
      evidence: '6-week Pierline - Muay Thai Basics Course'
    }
  ]
}

test('the same course named with a leading label and other punctuation is one service, its fields joined', () => {
  const profile = needsProfileOf({ sources: [site([typed('Muay-Thai Basics Course')])] }, reading)
  assert.deepEqual(names(profile), ['Muay-Thai Basics Course'])
  const [kept] = profile.items.service
  assert.equal(kept.fields['offering.duration_or_unit'].value, '6-week')
  assert.equal(profile.merged.length, 1)
  assert.equal(profile.merged[0].code, 'near_duplicate_merged')
  assert.equal(profile.merged[0].value, 'Pierline - Muay Thai Basics Course')
  assert.equal(profile.merged[0].into, kept.id)
  assert.match(profile.merged[0].reason, /same offer named twice/)
})

test("the business's own name before a course does not make it another course", () => {
  const profile = needsProfileOf(
    { sources: [site([typed("Tidewater's Sparring Course"), typed('Sparring Course')])] },
    { facts: reading.facts }
  )
  assert.deepEqual(names(profile), ['Sparring Course'])
  assert.equal(profile.merged[0].value, "Tidewater's Sparring Course")
})

test('the one with a price or a description is kept, even with the longer name', () => {
  const { items, merged } = mergeNearDuplicates({
    service: [
      {
        id: 'a',
        kind: 'service',
        sources: ['website'],
        fields: { 'offering.name': { value: 'Basics Course' } }
      },
      {
        id: 'b',
        kind: 'service',
        sources: ['website'],
        fields: { 'offering.name': { value: 'Pierline: Basics Course' }, 'offering.price': { value: '$90' } }
      }
    ]
  })
  assert.deepEqual(
    items.service.map((s) => s.id),
    ['b']
  )
  assert.equal(merged[0].id, 'a')
})

test('two different offers that share words stay two, and offers of different sources are never merged', () => {
  const profile = needsProfileOf(
    {
      sources: [
        site([
          typed('Muay Thai Basics Course'),
          typed('Muay Thai Sparring Course'),
          typed('Boxing Classes'),
          typed('Kids Boxing Classes')
        ])
      ]
    },
    { facts: reading.facts }
  )
  assert.deepEqual(names(profile), [
    'Muay Thai Basics Course',
    'Muay Thai Sparring Course',
    'Boxing Classes',
    'Kids Boxing Classes'
  ])
  assert.equal(profile.merged, undefined)
  const { items } = mergeNearDuplicates({
    service: [
      {
        id: 'a',
        kind: 'service',
        sources: ['website'],
        fields: { 'offering.name': { value: 'Basics Course' } }
      },
      {
        id: 'b',
        kind: 'service',
        sources: ['google'],
        fields: { 'offering.name': { value: 'Basics-Course' } }
      }
    ]
  })
  assert.equal(items.service.length, 2)
})

test('the items in are the items kept plus the items merged', () => {
  const input = {
    service: [
      'Basics Course',
      'Pierline - Basics Course',
      'Sparring Course',
      'Tidewater Sparring Course'
    ].map((name, n) => ({
      id: `s${n}`,
      kind: 'service',
      sources: ['website'],
      fields: { 'offering.name': { value: name } }
    }))
  }
  const { items, merged } = mergeNearDuplicates(input, { businessName: 'Tidewater Fight Hall' })
  assert.equal(items.service.length + merged.length, input.service.length)
  assert.equal(items.service.length, 2)
})

test('the core of a name sets aside case, punctuation, a leading label and the business name', () => {
  const words = new Set(['tidewater', 'fight', 'hall'])
  assert.equal(coreOfName('Pierline - Muay-Thai Basics Course!', words), 'muay thai basics course')
  assert.equal(coreOfName('Tidewater Fight Hall', words), 'tidewater fight hall')
})
