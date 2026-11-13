// The forms a caller should match for one held person (#609, decision D46), for the callers of the held text matcher
// that match plain texts (`heldNamesIn`, `heldSlugsIn`, `namesHeldInAnyForm`, the write guard's `heldInLeaf`) and so
// never see the reading's first name rule (`held-text-match.mjs heldEntriesOf`, option `people`). Pure.
//   - the full name, as given;
//   - the first name alone, under the reading's rule: a person of two words or more, a first name of three letters or
//     more, in a script written with spaces and not Hangul (there the family name leads). A first name that is also a
//     common word (`Will`, `Rose`) is NOT given here: matched as a plain text it would hold every `will` of a sentence;
//     it is held only where the capital and the words around it say it is a name, which only `heldSpansIn` with
//     `{people, casedCommon: true}` reads (`firstCased` says a caller is leaving one aside);
//   - the short forms a block renders a person by: `First L` and `F Last` (as `revision-text-forms.mjs withShortForms`),
//     for a name in a script written with spaces.
import { HANGUL, UNSPACED, isCommonNameWord } from './held-name-context.mjs'
import { foldHeld } from './held-text-match.mjs'

/**
 * The forms of one held person a caller should match (the rules above), most specific first.
 * @param {string} person a held person's name as the brief keeps it
 * @returns {{forms: string[], firstCased: string | null}} `forms`: plain texts to match; `firstCased`: a common word
 *   first name left out of `forms`, held only by the matcher's capital and context rule
 */
export function heldPersonFormsOf(person) {
  if (typeof person !== 'string' || !person.trim()) return { forms: [], firstCased: null }
  const name = person.trim().replace(/\s+/gu, ' ')
  const parts = name.split(' ')
  const forms = new Set([name])
  if (parts.length < 2) return { forms: [...forms], firstCased: null }
  const [first, last] = [parts[0], parts.at(-1)]
  // In a script without spaces, or Hangul, the family name leads: no first name and no short form.
  if (UNSPACED.test(name) || HANGUL.test(name)) return { forms: [...forms], firstCased: null }
  const letters = foldHeld(first).replace(/[^\p{L}\p{N}]+/gu, '')
  let firstCased = null
  if ([...letters].length > 2) {
    if (isCommonNameWord(letters)) firstCased = first
    else forms.add(first)
  }
  if (/^\p{L}/u.test(last)) forms.add(`${first} ${[...last][0]}`)
  if (/^\p{L}/u.test(first)) forms.add(`${[...first][0]} ${last}`)
  return { forms: [...forms], firstCased }
}
