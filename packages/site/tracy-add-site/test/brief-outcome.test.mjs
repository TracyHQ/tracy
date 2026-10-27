import assert from 'node:assert/strict'
import test from 'node:test'

import { briefOutcomeOf } from '../src/client/brief-outcome.mjs'

test('the ready screen stays only for Customize answers that did not all go in', () => {
  // a run that wrote nothing, or ran out of time part-way, ends `failed` in tracy-web's brief-build.js
  assert.equal(briefOutcomeOf('failed'), 'failed')
  assert.equal(briefOutcomeOf('applied'), 'applied')
  // a site made without answers, an older tracy-web, anything unreadable: no outcome, the landing as before
  for (const none of [undefined, null, '', 'writing', 'applying', 42, {}])
    assert.equal(briefOutcomeOf(none), null)
})
