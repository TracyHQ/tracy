// tracy-web's copy of the kept-terms list (`src/lib/kept-terms.js`) must equal the original: the
// image copies only `apps/tracy-web/src`, so it cannot import `packages/locale/tracy-locale-vi/terms.ts`,
// and a copy that drifted would let a blurb translation drop a word every other screen keeps.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as original from '../../../packages/locale/tracy-locale-vi/terms.ts'
import { droppedTerms as originalDropped } from '../../../scripts/lib/dsh-locale-terms.ts'
import { droppedTerms, hasTerm, KEEP_VERBATIM_TERMS } from '../src/lib/kept-terms.js'

test('the kept-terms copy equals packages/locale/tracy-locale-vi/terms.ts', () => {
  assert.deepEqual([...KEEP_VERBATIM_TERMS], [...original.KEEP_VERBATIM_TERMS])
})

test('hasTerm and droppedTerms answer as the originals do', () => {
  const pairs = [
    ['Open the template preview', 'Open the Template-Vorschau'],
    ['Open the template preview', 'Open the Templatevorschau'],
    ['Two sites and their files', 'Two site and one file'],
    ['A deployment log', 'A deployment record'],
    ['Nothing kept here', 'Nothing']
  ]
  for (const [source, translated] of pairs) {
    assert.deepEqual(droppedTerms(source, translated), originalDropped(source, translated), source)
    for (const term of KEEP_VERBATIM_TERMS)
      assert.equal(hasTerm(translated, term), original.hasTerm(translated, term), `${term} in ${translated}`)
  }
})
