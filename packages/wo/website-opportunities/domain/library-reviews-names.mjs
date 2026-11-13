// How the Tracy reviews block names a reviewer (ticket #596, spec #577 story 9): first name and the initial of the last
// name part, followed by a period ("Mara T."). Pure: the author as the review gives it in, the name shown (or why the
// review is left out) out.
//
// The steps, in order: markup and words in brackets are dropped; the name splits on white space and keeps only
// letters, marks, apostrophes, hyphens and periods; titles before the name (Dr, Mrs, Prof...) and suffixes after it
// (Jr, III, PhD...) are dropped, with or without a comma or a period; the first letter of the first name and the
// initial are capitals where the script has case and one letter stays one letter (so a German sharp s stays as it is).
// A single name part is shown alone.
//
// Scripts written without spaces (Chinese, Japanese) or with the family name first keep the same simple rule: a single
// part is shown as it is, two parts give the first part and the initial of the second. Telling a given name from a
// family name needs the reviewer's culture, which a review does not state; the simple rule never invents one and never
// shows more than the review gave.

const TITLES = new Set('dr mr mrs ms miss mx prof sir dame rev fr lady lord'.split(' '))
const SUFFIXES = new Set('jr sr ii iii iv phd md dds dmd esq mba cpa rn'.split(' '))
/** Google's name for a reviewer who chose not to show theirs. */
const ANONYMOUS = /^a google user$/i
const isAnonymous = (author) =>
  ANONYMOUS.test(
    String(author ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  )

const bare = (token) => token.replace(/[.,]/g, '').toLowerCase()
const isLetter = (c) => /\p{L}/u.test(c)

/** The first letter of `token` as a capital, when the script has case and the capital is one letter. */
function capitalised(token) {
  const chars = [...token]
  const at = chars.findIndex(isLetter)
  if (at === -1) return token
  const upper = chars[at].toLocaleUpperCase()
  if ([...upper].length === 1) chars[at] = upper
  return chars.join('')
}

/** The name parts of an author, titles and suffixes dropped. */
function nameParts(author) {
  const tokens = String(author ?? '')
    .normalize('NFC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .split(/[\s,]+/)
    .map((token) => token.replace(/[^\p{L}\p{M}'.-]/gu, '').replace(/^[.'-]+|[-']+$/g, ''))
    .filter((token) => /\p{L}/u.test(token))
  while (tokens.length > 0 && TITLES.has(bare(tokens[0]))) tokens.shift()
  while (tokens.length > 0 && SUFFIXES.has(bare(tokens[tokens.length - 1]))) tokens.pop()
  return tokens
}

/**
 * The reviewer as the block names them: "Mara T.", or the single name part. Null when the review gives no usable name.
 * @param {unknown} author
 * @returns {string | null}
 */
export function reviewerName(author) {
  if (isAnonymous(author)) return null
  const parts = nameParts(author)
  if (parts.length === 0) return null
  const first = capitalised(parts[0])
  if (parts.length === 1) return first
  const initial = [...parts[parts.length - 1]].find(isLetter)
  return `${first} ${capitalised(initial)}.`
}

/**
 * Why the block does not name this reviewer, or null when it does.
 * @param {unknown} author
 * @param {{limit?: number}} [options] the declared author limit, applied to the name shown: a longer one is never cut
 */
export function reviewerNameProblem(author, { limit = Number.POSITIVE_INFINITY } = {}) {
  if (isAnonymous(author)) return 'its reviewer is anonymous on Google'
  const name = reviewerName(author)
  if (!name) return 'it has no reviewer name'
  if ([...name].length > limit)
    return 'its reviewer name is longer than the section holds, and a name is never cut'
  return null
}
