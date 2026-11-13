// The forms one held person is matched by for callers that match plain texts (`held-person-forms.mjs`, #609, decision
// D46): the full name, the first name alone under the reading's rule, `First L` and `F Last`; a common word first name
// is left to the matcher's capital and context rule. Invented names only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-held-person-forms.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldPersonFormsOf } from '../domain/held-person-forms.mjs'
import { heldNamesIn } from '../domain/held-reviews.mjs'

test('a held person gives the full name, the first name alone, First L and F Last', () => {
  assert.deepEqual(heldPersonFormsOf("Siobhan O'Neill"), {
    forms: ["Siobhan O'Neill", 'Siobhan', 'Siobhan O', "S O'Neill"],
    firstCased: null
  })
  assert.deepEqual(heldPersonFormsOf('  Jean-Luc   Marchand ').forms, [
    'Jean-Luc Marchand',
    'Jean-Luc',
    'Jean-Luc M',
    'J Marchand'
  ])
})

test('a first name of two letters, a common word, a one word name or a name without spaces gives no first name', () => {
  assert.deepEqual(heldPersonFormsOf('Ed Lee').forms, ['Ed Lee', 'Ed L', 'E Lee'])
  assert.deepEqual(heldPersonFormsOf('Will Tanner'), {
    forms: ['Will Tanner', 'Will T', 'W Tanner'],
    firstCased: 'Will'
  })
  assert.deepEqual(heldPersonFormsOf('Brannoch').forms, ['Brannoch'])
  assert.deepEqual(heldPersonFormsOf('山田 花子').forms, ['山田 花子'])
  assert.deepEqual(heldPersonFormsOf('김 민지').forms, ['김 민지'])
  assert.deepEqual(heldPersonFormsOf(''), { forms: [], firstCased: null })
  assert.deepEqual(heldPersonFormsOf(null), { forms: [], firstCased: null })
})

test('a plain caller holds the first name alone only when it matches these forms', () => {
  const text = 'Book a raku night with Siobhan.'
  assert.deepEqual(heldNamesIn(text, ["Siobhan O'Neill"]), [])
  assert.deepEqual(heldNamesIn(text, heldPersonFormsOf("Siobhan O'Neill").forms), ['Siobhan'])
  assert.deepEqual(heldNamesIn('Signed, Siobhan O.', heldPersonFormsOf("Siobhan O'Neill").forms), [
    'Siobhan',
    'Siobhan O'
  ])
  // A common word first name is no plain form: "will" in a sentence stays a word.
  assert.deepEqual(heldNamesIn('We will fire the kiln.', heldPersonFormsOf('Will Tanner').forms), [])
})
