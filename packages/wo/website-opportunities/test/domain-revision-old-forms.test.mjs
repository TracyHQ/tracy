// The forms an old value of a plan revision is searched in, in the words a revision keeps (#599,
// `revision-old-forms.mjs`): number tokens, phone digits, addresses without a scheme, apostrophes and hyphens dropped,
// `ß` as `ss`, on top of the held matcher's forms; and a number never matches inside another number.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-revision-old-forms.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { oldValuesNamedIn } from '../domain/revision-old-forms.mjs'
import { oldValuesOf } from '../domain/revision-old-values.mjs'

/** [old value, kept text, named?]: invented values only. */
const CASES = [
  ['$42', 'Bouquets from 42 dollars', true],
  ['$42', 'Only $ 42', true],
  ['$42', 'Only 42.00', true],
  ['$42', 'Only US$42', true],
  ['$42', 'Since 2042 we tie stems', false],
  ['$42', 'Open until 10:42', false],
  ['$42', 'Weighs 4.42 kilos', false],
  ['$42', 'Call 0100 214 4242', false],
  ['42', 'Order number 1,042', false],
  ['020 7946 0525', 'Call +44 20 7946 0525', true],
  ['020 7946 0525', 'Call 020-7946-0525', true],
  ['020 7946 0525', 'Call (020) 7946 0525', true],
  ['020 7946 0525', 'Call 020 7946 0526', false],
  ['https://larkspur-florist.example/order', 'Order at larkspur-florist.example/order', true],
  ['https://larkspur-florist.example/order', 'Order at www.larkspur-florist.example/order/', true],
  ['https://larkspur-florist.example/order', 'Order at larkspur-florist.example/orders', false],
  ['www.larkspur-florist.example', 'Visit larkspur-florist.example today', true],
  ["O'Hara Flowers", 'OHara Flowers tie every stem', true],
  ["O'Hara Flowers", 'O’Hara Flowers', true],
  ['Saint-Clair Blooms', 'SaintClair Blooms', true],
  ['Straße Blumen', 'Strasse Blumen', true],
  ['Wild meadow bouquet', 'A wild meadow bouquet today', true],
  ['Wild meadow bouquet', 'A wild meadow posy today', false],
  ['Rose', 'Rosemary and thyme', false]
]

test('each old value is named in exactly the kept texts that show it', () => {
  for (const [old, text, named] of CASES)
    assert.equal(oldValuesNamedIn(text, [old]).length > 0, named, `${old} in ${text}`)
})

test('a plan label changed while the blocks still show the old name is not an old value', () => {
  const side = (label) => ({
    plan: { facts: [], items: [{ id: 'service-a', label }], pages: [] },
    profile: {}
  })
  const requests = (name) =>
    new Map([
      [
        'home',
        { blocks: [{ data: [{ id: 'service-a', kind: 'service', fields: { 'offering.name': name } }] }] }
      ]
    ])
  // The plan label changes; the name the blocks show stays: nothing the site shows is gone.
  assert.deepEqual(
    oldValuesOf(side('Meadow posy'), side('Meadow set'), requests('Meadow posy'), requests('Meadow posy')),
    []
  )
  // The name the blocks show changes too: the old text is gone from the site.
  assert.deepEqual(
    oldValuesOf(side('Meadow posy'), side('Meadow set'), requests('Meadow posy'), requests('Meadow set')),
    ['Meadow posy']
  )
})
