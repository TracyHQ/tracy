// The words of a change request as code compares them (ticket #617, review of 2026-11-14). A text is read as a list of
// words, the same way for the customer's request and for a quote of it, so an honest quote is never refused for its
// typing and a dishonest one never passes for a piece of a word:
// - NFKC, then case folding (`ß` is `ss`), so `STRASSE` and `straße`, a decomposed and a composed accent, compare equal;
// - a zero width space is a word break; every other format character (a joiner, a byte order mark) is dropped;
// - every quote mark, dash and other punctuation separates words, so curly and straight apostrophes and double quotes,
//   a dropped inner comma and a dash typed for a hyphen compare equal;
// - a word is a run of letters, marks and digits; in a script written without spaces (Chinese, Japanese, Thai, Lao,
//   Khmer, Myanmar) every character is a word, so a quote of such a request still ends on word boundaries.
// Pure.

const NO_SPACE_SCRIPT =
  /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}ー々]/gu
const WORD = /[\p{L}\p{M}\p{N}]+/gu

/** The words of a text, folded for comparison. */
export function wordsOf(text) {
  const folded = String(text ?? '')
    .normalize('NFKC')
    .replace(/​/g, ' ')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKC')
    .replace(NO_SPACE_SCRIPT, ' $& ')
  return folded.match(WORD) ?? []
}

/** Where `words` stand as a run in `text` (both lists of words), or -1. */
const runAt = (text, words) => {
  if (words.length === 0) return -1
  for (let i = 0; i + words.length <= text.length; i++) if (words.every((w, j) => text[i + j] === w)) return i
  return -1
}

/** Whether `phrase` stands in `text` as whole words (case folded, `wordsOf`). */
export const namesWords = (text, phrase) => runAt(wordsOf(text), wordsOf(phrase)) !== -1

/** Whether two texts are the same words. */
export const sameWords = (a, b) => wordsOf(a).join(' ') === wordsOf(b).join(' ')

/**
 * Whether `quote` is words of `request`: whole words, two at least, or the whole request when it is one word.
 * @returns {boolean}
 */
export function quotesRequest(quote, request) {
  const words = wordsOf(quote)
  const all = wordsOf(request)
  if (words.length === 0 || runAt(all, words) === -1) return false
  return words.length >= 2 || all.length === 1
}
