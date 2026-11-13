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
  assert.equal(proven('offering.price', '20', 'Drop in 20 EUR'), true)
  assert.equal(proven('offering.price', '$20', 'Drop in class $120 per visit'), false)
  assert.equal(proven('offering.price', '120', 'Drop in class $20 per visit'), false)
  assert.equal(proven('offering.price', '20 EUR', 'Classes 20,50 EUR'), false)
  // The currency sign and the words of the value must be in the quote too.
  assert.equal(proven('offering.price', '€20', 'Drop in class $20.00 per visit'), false)
  assert.equal(proven('offering.price', '$20 per month', 'Drop in class $20.00 per visit'), false)
})

test('a price is proven only by money in the quote, its decimals read as decimals', () => {
  // One or two digits after the last separator are decimals: 7.5 is not 75, 9,5 is not 95, 1.5 is not 15.
  assert.equal(proven('offering.price', '$7.5', 'Pass $75'), false)
  assert.equal(proven('offering.price', '€9,5', 'Pass 95 €'), false)
  assert.equal(proven('offering.price', '$1.5', 'Locker $15'), false)
  assert.equal(proven('offering.price', '$20.5', 'Locker $205'), false)
  assert.equal(proven('offering.price', '$1200', 'Year pass $1,200'), true)
  // An equal number that is not written as money proves nothing.
  assert.equal(proven('offering.price', '$20', 'A 20 minute class, $35 per visit'), false)
  assert.equal(proven('offering.price', '$3', '3 classes a week for $45'), false)
  assert.equal(proven('package.price', '$99', '$9.90 or 99 points'), false)
  assert.equal(proven('offering.price', '20', 'price 20:'), false)
  assert.equal(proven('offering.price', '$45', '3 classes for $45'), true)
  assert.equal(proven('offering.price', '20', 'Drop in 20 dollars'), true)
  // And a price never proves a year.
  assert.equal(proven('business.founded', '2010', 'Year pass $2010'), false)
  assert.equal(proven('business.founded', '2010', 'Founded in 2010, passes from $20'), true)
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

test('a currency sign, its code and its word are one currency; another currency never proves a price', () => {
  assert.equal(proven('offering.price', '20 USD', 'Drop in class $20 per visit'), true)
  assert.equal(proven('offering.price', '$20', 'Drop in 20 dollars'), true)
  assert.equal(proven('offering.price', '£20', 'Drop in GBP 20'), true)
  assert.equal(proven('offering.price', '1200 EUR', 'Year pass 1 200 €'), true)
  assert.equal(proven('offering.price', '€45', 'Shirt £45, gift card €10'), false)
  assert.equal(proven('offering.price', '20 USD', 'Drop in £20'), false)
})
