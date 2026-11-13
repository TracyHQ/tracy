// Whether a quote proves a reported value (tickets #592, #615): a price compares by amount, an address on its words and
// digits, and part of a number is never a number of its own. Invented values only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-needs-profile-grounding.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { provenBy } from '../domain/needs-profile-grounding.mjs'

const proven = (role, value, evidence) => provenBy(role, value, evidence)

test('a price compares by amount: cents, decimal comma and currency position aside, 20 never 120', () => {
  assert.equal(proven('offering.price', '$20', 'Drop in class $20.00 per visit'), true)
  assert.equal(proven('offering.price', '€15', 'Monthly 15,00 € for members'), true)
  assert.equal(proven('package.price', '$1,200', 'Year pass $1,200'), true)
  assert.equal(proven('offering.price', '20', 'price 20:'), true)
  assert.equal(proven('offering.price', '$20', 'Drop in class $120 per visit'), false)
  assert.equal(proven('offering.price', '120', 'Drop in class $20 per visit'), false)
  assert.equal(proven('offering.price', '20 EUR', 'Classes 20,50 EUR'), false)
  // The currency sign and the words of the value must be in the quote too.
  assert.equal(proven('offering.price', '€20', 'Drop in class $20.00 per visit'), false)
  assert.equal(proven('offering.price', '$20 per month', 'Drop in class $20.00 per visit'), false)
})

test('an address compares on its words and digits, its punctuation aside, never part of a number', () => {
  assert.equal(proven('contact.address', 'Unit 4, 12 Fake Lane', 'Unit 4.12 Fake Lane'), true)
  assert.equal(proven('contact.address', '12 Fake Lane', '12 Fake Lane, Invented Town'), true)
  assert.equal(proven('contact.address', '4 Fake Lane', '14 Fake Lane'), false)
  assert.equal(proven('contact.address', '2 Fake Lane', 'Unit 4.12 Fake Lane'), false)
})

test('any other literal keeps a number whole: Class 2 is not inside Class 2.5', () => {
  assert.equal(proven('offering.name', 'Class 2', 'Class 2.5 Advanced'), false)
  assert.equal(proven('offering.name', 'Level 1', 'Level 1, 2 and 3'), true)
})
