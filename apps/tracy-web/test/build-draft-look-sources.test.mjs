// The draft the plan card reads carries where the plan's logo came from (#609): a logo the machine drew from the
// owner's logo is said as drawn on the card. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-look-sources.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftShape } from '../src/build-draft/rules.js'

const row = (brand) => ({
  id: 'draft-1',
  questions: null,
  answers: null,
  template: null,
  plan: { id: 'plan-x', revision: 1 },
  last_edit: null,
  undo_edit: null,
  brand,
  created_at: new Date(0),
  updated_at: new Date(0)
})

test('the draft shape carries the brand step look sources when it has them', () => {
  const lookSources = {
    logo: {
      from: 'drawn-from-logo',
      name: 'A logo Tracy drew, based on your logo',
      reason: 'symbol-cut-from-logo'
    }
  }
  assert.deepEqual(draftShape(row({ lookSources })).lookSources, lookSources)
})

test('the draft shape has no look sources before a brand step ran', () => {
  assert.equal('lookSources' in draftShape(row(null)), false)
  assert.equal('lookSources' in draftShape(row({})), false)
})
