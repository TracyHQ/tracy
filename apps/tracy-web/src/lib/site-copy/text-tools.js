// Shared with the copy inputs index (inputs-index.js), so it lives in lib/ with it (module-graph.test.mjs).
// Small text helpers shared by the copy check rules. Pure, no input is modified.
const WORD = '[\\p{L}\\p{N}]'

export const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Lowercase words with punctuation stripped: the form W06 and W07 compare in.
export const wordsOf = (s) =>
  String(s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

// Sentences of a text: split after . ! ? and at line breaks.
export const sentencesOf = (s) =>
  String(s)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean)

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
