import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanErrorMessage } from '../lib/mask.js'

test('cleanErrorMessage extracts error.message from JSON string', () => {
  const jsonErr = JSON.stringify({ error: { code: 'resource_exhausted', message: 'Quota exceeded for 5h window' } })
  assert.equal(cleanErrorMessage(jsonErr), 'Quota exceeded for 5h window')
})

test('cleanErrorMessage extracts top-level message', () => {
  const jsonErr = JSON.stringify({ message: 'Rate limit hit' })
  assert.equal(cleanErrorMessage(jsonErr), 'Rate limit hit')
})

test('cleanErrorMessage truncates long strings to <= 160 chars', () => {
  const longErr = 'A'.repeat(200)
  const cleaned = cleanErrorMessage(longErr)
  assert.equal(cleaned.length, 160)
  assert.ok(cleaned.endsWith('...'))
})

test('cleanErrorMessage takes first line only', () => {
  const multiLine = 'First line error\nSecond line stack trace\nThird line'
  assert.equal(cleanErrorMessage(multiLine), 'First line error')
})
