// Step 9b sends a phone number printed outside a tel: link (write-step/repair-pass/repair-kinds.js): the site agent can wrap
// it, and a visitor on a phone cannot call it otherwise. Dev arabian-tea-lat37b (27/11/2026): 7 such blocks were never sent.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { kindOfFailure, notSentOf, SENT_KINDS } from '../src/write-step/repair-pass/repair-kinds.js'

test('an uncallable phone is a kind 9b sends, with what should change', () => {
  const failure = {
    group: 'phone-callable',
    page: '/contact',
    reason: 'The page prints the phone number 04 123 4567 (span) outside a tel: link'
  }
  const kind = kindOfFailure(failure)
  assert.equal(kind, 'uncallable-phone')
  assert.equal(notSentOf({ source: 'site-check', group: 'phone-callable', kind, page: '/contact' }), null)
  assert.match(SENT_KINDS[kind](), /tel: link/)
})
