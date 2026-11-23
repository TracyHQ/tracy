// The look guard's one opening for the emphasis stage (write-step/look-guard-emphasis.js): an update that changes only the form
// of emphasis passes, whatever spacing the writer gave a code. Dev lat30 (23/11/2026): JA Diner's reservation article took its
// emphasis and the guard read it as a change of the article's introtext, a blocking finding. Invented rows.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emphasisOnlyUpdate } from '../src/write-step/look-guard-emphasis.js'

const state = (introtext) => ({ rows: new Map([['article:28', { id: 28, introtext }]]) })

test('a code written with spaces, stored as its tag, is still only a change of emphasis form', () => {
  const held = '<div class="reservation"><h2>Book a ((br /))table at the ((span))house((/span))</h2></div>'
  const next = '<div class="reservation"><h2>Book a <br/>table at the <span>house</span></h2></div>'
  assert.equal(
    emphasisOnlyUpdate({ kind: 'article', id: 28, fields: { introtext: next } }, state(held)),
    true
  )
  // Another word is never an emphasis change.
  const changed = '<div class="reservation"><h2>Book a <br/>seat at the <span>house</span></h2></div>'
  assert.equal(
    emphasisOnlyUpdate({ kind: 'article', id: 28, fields: { introtext: changed } }, state(held)),
    false
  )
})
