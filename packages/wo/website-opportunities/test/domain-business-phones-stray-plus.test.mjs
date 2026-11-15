// A "+" a website writes before a national number ("+ 720-555-0160") is not a country code (#617 review, 2026-11-14):
// read as one, the number became +7 (Russia) and the brief showed "+ 720-555-0160". Such a number is shown in its
// national form without the stray plus, read in the place's own country when it is known, and never given a country
// code nobody stated. Invented numbers in the 555 range.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-business-phones-stray-plus.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { decidePhones, normalizePhone, withoutStrayPlus } from '../domain/business-phones.mjs'

const STRAY = '+ 720-555-0160'
const site = (value) => ({ evidence: { phone: [{ value, sources: ['website'] }] } })

test('a plus with no country code after it is dropped; a real country code is kept', () => {
  assert.equal(withoutStrayPlus(STRAY), '720-555-0160')
  assert.equal(withoutStrayPlus('+7205550160'), '7205550160')
  assert.equal(withoutStrayPlus('+ 44 20 7946 0000'), '+ 44 20 7946 0000')
  assert.equal(withoutStrayPlus('+1 720 555 0160'), '+1 720 555 0160')
  assert.equal(withoutStrayPlus('+7 495 555 0160'), '+7 495 555 0160')
  assert.equal(withoutStrayPlus('720-555-0160'), '720-555-0160')
})

test('normalizePhone reads a stray plus number in the place country, else not at all', () => {
  assert.equal(normalizePhone(STRAY, { callingCode: '1', bare: true }), '+17205550160')
  assert.equal(normalizePhone(STRAY), null)
  assert.equal(normalizePhone('+ 44 20 7946 0000'), '+442079460000')
})

test('the brief phone is the national form, read in the candidate country', () => {
  const { main } = decidePhones({ profile: site(STRAY), opportunity: { candidate: { country: 'US' } } })
  assert.equal(main.phone, '720-555-0160')
  assert.equal(main.e164, '+17205550160')
})

test('with no country known the number is still shown, without the plus and with no invented code', () => {
  const { main } = decidePhones({ profile: site(STRAY) })
  assert.equal(main.phone, '720-555-0160')
  assert.ok(!String(main.e164).startsWith('+7'))
})
