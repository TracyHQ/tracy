// Shared with the copy inputs index (inputs-index.js), so it lives in lib/ with it (module-graph.test.mjs).
// Small text helpers shared by the copy check rules. Pure, no input is modified.
const WORD = '[\\p{L}\\p{N}]'

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The form W06 and W07 compare in, and the sentences of a text: shared with the AI quickstart page writer.
export { sentencesOf, wordsOf } from 'website-opportunities/domain/copy-repeats.mjs'

// Whole-phrase, case-insensitive match: the phrase may not start or end inside a longer word.
export function hasPhrase(haystack, phrase) {
  const p = String(phrase).trim()
  if (!p) return false
  return new RegExp(`(?<!${WORD})${escapeRegExp(p)}(?!${WORD})`, 'iu').test(String(haystack))
}

// A demo sample may end in an ellipsis where the kit cut it.
export const stripEllipsis = (s) => String(s).replace(/(…|\.\.\.)\s*$/, '')

// The strings of a value, however it is nested: a fact value may be text, a number or an object.
export function textOfValue(v) {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(textOfValue).join(' ')
  if (v && typeof v === 'object') return Object.values(v).map(textOfValue).join(' ')
  return ''
}
