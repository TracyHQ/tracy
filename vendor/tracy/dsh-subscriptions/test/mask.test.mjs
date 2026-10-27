import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskEmail, maskLabel } from '../lib/mask.js'

test('maskEmail: john@example.com -> j***n@example.com', () => {
  assert.equal(maskEmail('john@example.com'), 'j***n@example.com')
})

test('maskEmail: short local part keeps first char only', () => {
  assert.equal(maskEmail('ab@example.com'), 'a***@example.com')
  assert.equal(maskEmail('a@example.com'), 'a***@example.com')
})

test('maskEmail: value without @ passes through', () => {
  assert.equal(maskEmail('token123'), 'token123')
  assert.equal(maskEmail(''), '')
  assert.equal(maskEmail(null), '')
})

test('maskLabel: email masked, plain label untouched', () => {
  assert.equal(maskLabel('john@example.com'), 'j***n@example.com')
  assert.equal(maskLabel('work account'), 'work account')
  assert.equal(maskLabel(''), '')
})
