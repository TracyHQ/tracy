// The forms an old value of a plan revision is searched in, in the words a revision keeps (ticket #599). Pure.
//
// The scan is defence in depth: the page copy check already refuses a writer that names a value its request does not
// carry, so a kept word naming an old value is a rare miss of that check. Every old value is searched as the held
// matcher reads a name (`textsNamedIn`: whole words in any case, accent, reference or slug form), and in the cheap
// forms a person writes it in:
//   - a number (no letter, fewer than seven digits: a price, a count): as a whole number token only, so `$42` names
//     `42` and `42.00` but not `2042`, `4.42` or `10:42` (a token joins digits by `.`, `,` and `:`);
//   - a phone (no letter, seven digits or more): by its digits, a leading trunk zero dropped, inside any run of phone
//     characters (`+44 100 214 5525` names `0100 214 5525`), and as the held matcher reads it;
//   - an address (`https://`, `www.`): without its scheme, `www.` and a closing slash;
//   - any text: with apostrophes and hyphens dropped and `ß` read as `ss` on both sides (`OHara` names `O'Hara`).
// Not searched (a writer would only reach them past the copy check): plurals, one word of a longer name, a phone or a
// time spelled out in words.
import { leavesOf, textsNamedIn } from './revision-text-forms.mjs'

const digitsOf = (text) => String(text).replace(/\D/g, '')
const isNumberLike = (old) => /\d/.test(old) && !/\p{L}/u.test(old)
const isPhoneLike = (old) => isNumberLike(old) && digitsOf(old).length >= 7

/** The number tokens of a text, `,` `.` `:` joining digits, a trailing zero fraction read away (`25.00` is `25`). */
const numbersOf = (text) =>
  (String(text).match(/\d+(?:[.,:]\d+)*/g) ?? []).map((t) => t.replace(/[.,]0+$/, ''))

/** Whether a number like old value is a whole number token of a text. */
function namesNumber(leaves, old) {
  const core = numbersOf(old)
  if (core.length !== 1) return false
  return leaves.some((leaf) => numbersOf(leaf).includes(core[0]))
}

/** Whether a phone like old value's digits stand in a run of phone characters of a text. */
function namesPhone(leaves, old) {
  const want = digitsOf(old).replace(/^0+/, '')
  return leaves.some((leaf) =>
    (String(leaf).match(/[+\d][\d\s().\-/]{5,}\d/g) ?? []).some((run) => digitsOf(run).includes(want))
  )
}

/** An address without its scheme, `www.` and closing slash, in lower case. */
const addressCoreOf = (text) =>
  String(text)
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')

/** Whether an address old value stands in a text without its scheme. */
function namesAddress(leaves, old) {
  const core = addressCoreOf(old)
  if (core.length < 4) return false
  return leaves.some((leaf) => {
    const text = String(leaf)
      .toLowerCase()
      .replace(/(^|[^a-z0-9.])www\./g, '$1')
    let at = text.indexOf(core)
    while (at !== -1) {
      const before = text[at - 1] ?? ' '
      const after = text[at + core.length] ?? ' '
      if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true
      at = text.indexOf(core, at + 1)
    }
    return false
  })
}

/** A text with apostrophes and hyphens dropped and `ß` read as `ss`. */
const dropped = (text) =>
  String(text)
    .replace(/['‘’ʼ`-]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')

/** The old values (of `olds`) any leaf of `value` names, in any of the forms above. */
export function oldValuesNamedIn(value, olds) {
  const list = (Array.isArray(olds) ? olds : []).filter((t) => typeof t === 'string' && t.trim())
  if (!list.length) return []
  const leaves = leavesOf(value)
  const plain = leaves.map(dropped)
  return list.filter((old) => {
    if (isNumberLike(old) && !isPhoneLike(old)) return namesNumber(leaves, old)
    if (isPhoneLike(old) && namesPhone(leaves, old)) return true
    if (textsNamedIn(leaves, [old]).length) return true
    if (/^(?:[a-z]+:\/\/|www\.)/i.test(old.trim()) && namesAddress(leaves, old.trim())) return true
    const bare = dropped(old)
    return bare !== old || plain.some((p, i) => p !== leaves[i])
      ? textsNamedIn(plain, [bare]).length > 0
      : false
  })
}
