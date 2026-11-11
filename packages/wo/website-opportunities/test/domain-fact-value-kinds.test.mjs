import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FACT_EDITS_MAX,
  FACT_VALUE_NEXT,
  editedFactValue,
  factValueKindOf,
  nextFactEdits,
  readFactValue
} from '../domain/fact-value-kinds.mjs'

const kind = (path, value) => factValueKindOf(path, { value })

test('a fact takes the kind its value has, a record the kind of its one plain part', () => {
  assert.equal(kind(['business', 'hours'], ['Monday: 9:00 AM to 5:00 PM']), 'hours')
  assert.equal(kind(['business', 'address'], '12 Example Lane'), 'text')
  assert.equal(kind(['business', 'serviceAreas'], ['Sampletown']), 'list')
  assert.equal(kind(['business', 'reservable'], true), 'boolean')
  assert.equal(kind(['business', 'amenities'], { wheelchairAccessibleEntrance: true }), 'flags')
  assert.equal(kind(['links', '0'], { kind: 'instagram', url: 'https://www.instagram.com/x' }), 'url')
  assert.equal(kind(['claims', 'statistics', '0'], { amount: 4.8, label: 'rating', scope: 'g' }), 'number')
  assert.equal(kind(['people', '0'], { name: 'Mira', relationship: 'team' }), 'text')
  assert.equal(kind(['offerings', '0'], { kind: 'class', name: 'Yoga', variants: [] }), 'text')
  assert.equal(kind(['quotes', '0'], { kind: 'story', text: 'Our story', restrictions: [] }), 'text')
  assert.equal(kind(['extensions', 'research:priceLevel'], 'PRICE_LEVEL_MODERATE'), 'text')
  // No kind: a location, address components, a list of records.
  assert.equal(kind(['business', 'location'], { latitude: 1, longitude: 2 }), null)
  assert.equal(kind(['business', 'addressComponents'], [{ longText: 'X' }]), null)
  assert.equal(kind(['extensions', 'research:otherPhones'], [{ phone: '+1 555' }]), null)
})

test('each kind takes its own shape, and says the shape it expects otherwise', () => {
  const ok = (k, v, path) => readFactValue(k, v, path).value
  const bad = (k, v, path) => readFactValue(k, v, path)
  assert.equal(ok('text', '  Lumen  Yoga '), 'Lumen  Yoga')
  assert.equal(ok('text', ' Lumen   Yoga ', ['business', 'name']), 'Lumen Yoga')
  assert.deepEqual(bad('text', '', []), { error: 'INVALID_VALUE', next: FACT_VALUE_NEXT.text })
  assert.deepEqual(bad('text', 'x'.repeat(201), ['people', '0']), {
    error: 'INVALID_VALUE',
    next: FACT_VALUE_NEXT.name
  })
  assert.deepEqual(ok('list', [' Sampletown ', 'Old Town']), ['Sampletown', 'Old Town'])
  assert.equal(bad('list', []).error, 'INVALID_VALUE')
  assert.equal(bad('list', ['ok', 3]).next, FACT_VALUE_NEXT.list)
  assert.deepEqual(ok('hours', ['Monday: 9:00 AM to 5:00 PM']), ['Monday: 9:00 AM to 5:00 PM'])
  assert.equal(
    bad(
      'hours',
      Array.from({ length: 15 }, () => 'Monday: closed')
    ).next,
    FACT_VALUE_NEXT.hours
  )
  assert.equal(ok('boolean', false), false)
  assert.equal(bad('boolean', 'false').next, FACT_VALUE_NEXT.boolean)
  assert.equal(ok('number', 4.5), 4.5)
  assert.equal(bad('number', Number.NaN).next, FACT_VALUE_NEXT.number)
  assert.equal(ok('url', ' https://www.instagram.com/lumen '), 'https://www.instagram.com/lumen')
  assert.equal(bad('url', 'javascript:alert(1)').next, FACT_VALUE_NEXT.url)
  assert.deepEqual(ok('flags', { outdoorSeating: true }), { outdoorSeating: true })
  assert.equal(bad('flags', { outdoorSeating: 'yes' }).next, FACT_VALUE_NEXT.flags)
  assert.equal(bad('flags', {}).next, FACT_VALUE_NEXT.flags)
  assert.equal(bad(null, 'x').next, FACT_VALUE_NEXT.none)
})

test('an edit replaces a value, or the one plain part of a record', () => {
  const link = { value: { kind: 'other', url: 'https://a.example', label: 'Shop' } }
  assert.deepEqual(editedFactValue(['links', '0'], link, 'https://b.example'), {
    kind: 'other',
    url: 'https://b.example',
    label: 'Shop'
  })
  assert.deepEqual(editedFactValue(['business', 'hours'], { value: ['a'] }, ['b']), ['b'])
})

test('stored edits: null clears one, every other is kept, and they are capped', () => {
  const one = nextFactEdits({ fact_a: { value: 'A', at: 't0' } }, 'fact_b', 'B', 't1')
  assert.deepEqual(one, { fact_a: { value: 'A', at: 't0' }, fact_b: { value: 'B', at: 't1' } })
  assert.deepEqual(nextFactEdits(one, 'fact_a', null), { fact_b: { value: 'B', at: 't1' } })
  const full = Object.fromEntries(
    Array.from({ length: FACT_EDITS_MAX }, (_, i) => [`fact_${i}`, { value: i }])
  )
  assert.throws(() => nextFactEdits(full, 'fact_new', 1), { code: 'TOO_MANY_FACT_EDITS' })
  assert.doesNotThrow(() => nextFactEdits(full, 'fact_0', 2))
})
