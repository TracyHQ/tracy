// Settings › Account (Akemi 04/10/2026, option A): the approved help line under the address.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { en } from '../src/client/strings.ts'

// A vocabulary rule, not a copy pin: the help line may be reworded, but never back to "seat", which
// gate vocabulary does not ban on its own.
test('the address line says what it is in plain words, with no "seat"', () => {
  assert.ok(en['account.emailNote'], 'the help line exists')
  assert.doesNotMatch(en['account.emailNote'], /seat/i)
})
