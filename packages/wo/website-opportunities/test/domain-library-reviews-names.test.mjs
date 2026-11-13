// How the Tracy reviews block names a reviewer (ticket #596): first name and the initial of the last name part, titles
// and suffixes dropped, Google's anonymous placeholder and an empty name refused, the author limit enforced on the name
// shown. Invented names only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tracyLibraryBlock } from '../domain/library.mjs'
import { reviewsToShow } from '../domain/library-reviews-content.mjs'
import { reviewerName, reviewerNameProblem } from '../domain/library-reviews-names.mjs'

const AUTHOR_LIMIT = tracyLibraryBlock('tracy-reviews').itemFields.find((f) => f.name === 'author').limit

// [as the review gives it, as the block shows it]
const SHOWN = [
  ['Mara', 'Mara'],
  ['mara', 'Mara'],
  ['Mara Ann Telling', 'Mara T.'],
  ['mara telling', 'Mara T.'],
  ['  Mara Telling  ', 'Mara T.'],
  ['Mara Telling', 'Mara T.'],
  ['Mara​ Telling', 'Mara T.'],
  ['Mara T', 'Mara T.'],
  ['Jun K.', 'Jun K.'],
  ['osric van vale', 'Osric V.'],
  ['Tamsin Brook-Hale \u{1F3BE}', 'Tamsin B.'],
  ['M. Telling', 'M. T.'],
  ['J. R. Quill', 'J. Q.'],
  ['Mara-Ann Telling', 'Mara-Ann T.'],
  ["O'Neil Telling", "O'Neil T."],
  ["Mara O'Neil", 'Mara O.'],
  ['Mara de la Cruz', 'Mara C.'],
  ['Mara (Mum of two) Telling', 'Mara T.'],
  ['Mara Telling-', 'Mara T.'],
  ['Mara .', 'Mara'],
  ['Mara 123', 'Mara'],
  ['Mara Telling \u{1F3BE}', 'Mara T.'],
  ['\u{1F3BE} Mara Telling', 'Mara T.'],
  ['Bob <b>', 'Bob'],
  ['<script>alert(1)</script> Bob', 'Alert B.'],
  // Titles before the name and suffixes after it are dropped, with or without a comma or a period.
  ['Dr Mara Telling', 'Mara T.'],
  ['Dr. Mara Telling', 'Mara T.'],
  ['Mr Osric Vale', 'Osric V.'],
  ['Mrs Mara Telling', 'Mara T.'],
  ['Ms. mara telling', 'Mara T.'],
  ['Miss Mara Telling', 'Mara T.'],
  ['Prof. Mara Telling', 'Mara T.'],
  ['Mara Telling Jr.', 'Mara T.'],
  ['Mara Telling, Jr', 'Mara T.'],
  ['Osric Vale Sr', 'Osric V.'],
  ['Osric Vale II', 'Osric V.'],
  ['Mara Telling III', 'Mara T.'],
  ['Osric Vale IV', 'Osric V.'],
  ['Mara Telling, PhD', 'Mara T.'],
  ['Mara Telling Ph.D.', 'Mara T.'],
  ['Dr. Osric Vale, MD', 'Osric V.'],
  ['Mr T', 'T'],
  // Letters of any script; capital letters only where the script has case, and only when one letter stays one letter.
  ['Élodie Ørsted', 'Élodie Ø.'],
  ['İlke Özbay', 'İlke Ö.'],
  ['ß straße', 'ß S.'],
  ['Ǆoe ǆoe', 'Ǆoe Ǆ.'],
  ['ﬀ quill', 'ﬀ Q.'],
  ['Мара Теллинг', 'Мара Т.'],
  ['سارة نور', 'سارة ن.'],
  // Scripts written without spaces, or family name first: the simple rule (see library-reviews-names.mjs).
  ['林晓岚', '林晓岚'],
  ['林 晓岚', '林 晓.'],
  ['森川 透', '森川 透.']
]

test('every name the reviewer table lists is shown as first name and initial', () => {
  for (const [given, shown] of SHOWN) assert.equal(reviewerName(given), shown, JSON.stringify(given))
})

test("Google's anonymous placeholder and an empty name are refused, with the reason", () => {
  for (const given of ['A Google User', 'a google user', 'A GOOGLE  USER', ' a Google user '])
    assert.match(reviewerNameProblem(given), /anonymous/, given)
  for (const given of ['', '   ', '\u{1F3BE}', '123', 'Dr.', 'Mr Jr', null, undefined])
    assert.match(reviewerNameProblem(given), /no reviewer name/, String(given))
  for (const given of ['A Google User', '', 'Dr.']) assert.equal(reviewerName(given), null, given)
})

test('a name longer than the declared author limit is refused, never cut', () => {
  assert.equal(AUTHOR_LIMIT, 40)
  const long = 'x'.repeat(200)
  assert.match(reviewerNameProblem(long, { limit: AUTHOR_LIMIT }), /longer than the section holds/)
  assert.equal(reviewerNameProblem('x'.repeat(AUTHOR_LIMIT), { limit: AUTHOR_LIMIT }), null)
  // The limit applies to the name shown: a long full name shortened under the limit is shown.
  assert.equal(reviewerNameProblem(`Mara ${'Telling'.repeat(10)}`, { limit: AUTHOR_LIMIT }), null)
  const { shown, setAside } = reviewsToShow(
    [
      { text: 'Fine coaching.', author: long, rating: 5, origin: 'google' },
      { text: 'Lovely courts.', author: 'A Google User', rating: 5, origin: 'google' },
      { text: 'Good club.', author: 'Mara Telling', rating: 5, origin: 'google' }
    ],
    { authorLimit: AUTHOR_LIMIT }
  )
  assert.deepEqual(
    shown.map((r) => r.author),
    ['Mara T.']
  )
  assert.deepEqual(
    setAside.map((s) => s.index),
    [0, 1]
  )
  assert.match(setAside[0].reason, /longer than the section holds/)
  assert.match(setAside[1].reason, /anonymous/)
})
