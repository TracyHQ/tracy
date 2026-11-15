// The tagline the owner marks as their own in the build chat (decision D46 as amended, #609): the one case where the
// owner's wording is the fact. A sentence holds one only when it says the words ARE the tagline, slogan, motto or
// strapline: "our motto is ...", "... is our slogan", "tagline: ...", the words quoted or running to the sentence end.
// A sentence that only holds the word ("we print slogans on mugs", "can you write us a tagline?") holds none. English
// marker words only (the doc says so). Pure, no imports.

const MARK = String.raw`(?:tag\s?line|slogan|motto|strap\s?line)`
const OWNER = String.raw`(?:our|my)\s+(?:own\s+|studio(?:'s)?\s+|shop(?:'s)?\s+|business(?:'s)?\s+)?`
const OPEN = `["“‘']`
const CLOSE = `["”’']`
const QUOTED = String.raw`${OPEN}([^"“”‘’]{2,120}?)${CLOSE}`
const BE = String.raw`(?:is|has\s+always\s+been|has\s+been|reads|says|remains|stays)`

/** Marked forms, each giving the tagline in its first group (quoted ones first: their ends are certain). */
const QUOTED_FORMS = [
  new RegExp(String.raw`\b${OWNER}${MARK}\s*(?:${BE})?\s*[:,-]?\s*${QUOTED}`, 'iu'),
  new RegExp(String.raw`${QUOTED}\s*(?:,\s*)?(?:${BE}|-|:)?\s*(?:${OWNER})${MARK}\b`, 'iu'),
  new RegExp(
    String.raw`\b(?:we\s+(?:live|go|work)\s+by|we\s+use)\s+(?:the\s+|our\s+)?${MARK}\s*:?\s*${QUOTED}`,
    'iu'
  ),
  new RegExp(String.raw`^\s*${MARK}\s*:\s*${QUOTED}`, 'iu')
]
/** Unquoted: "our motto is X" (or "our motto is simple: X") and "motto: X", X running to the sentence end. */
const OPEN_FORMS = [
  new RegExp(String.raw`\b${OWNER}${MARK}\s+${BE}\s+(?:(?:\p{L}+\s+){0,2}\p{L}+:\s*)?(.+)$`, 'iu'),
  new RegExp(String.raw`^\s*(?:${OWNER})?${MARK}\s*:\s*(.+)$`, 'iu')
]
/** First words of a phrase after "our motto is" that say something ABOUT the tagline, never the tagline itself. */
const NOT_A_TAGLINE =
  /^(?:not|n't|never|still|being|currently|changing|under|about|that|what|why|how|something|simple|short|on|in|at|from|printed|written|shown|above|below|a\s+work\s+in\s+progress|missing|unclear|outdated|old|new|the\s+same|too)\b/iu
/** The longest tagline taken, in words: a longer phrase is a sentence about the business, not its tagline. */
export const TAGLINE_MAX_WORDS = 12

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const wordCount = (s) => s.trim().split(/\s+/u).filter(Boolean).length

/** The sentences of a text, as written (split after `.`, `!`, `?` or at a line break). */
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean)

/** A tagline as written: its outer spaces and the sentence's own end mark off, its own words untouched. */
const cleaned = (raw) =>
  String(raw)
    .trim()
    .replace(/[.!?;,]+$/u, '')
    .trim()

/**
 * The tagline a text marks as the owner's own, word for word, or null (rules above). The first marked sentence wins.
 * @param {string | null | undefined} text a quote of the owner's statement, or the statement
 * @returns {string | null}
 */
export function taglineOf(text) {
  if (!isText(text)) return null
  for (const sentence of sentencesOf(text)) {
    for (const form of QUOTED_FORMS) {
      const m = form.exec(sentence)
      const found = m && cleaned(m[1])
      if (found && wordCount(found) <= TAGLINE_MAX_WORDS) return found
    }
    for (const form of OPEN_FORMS) {
      const m = form.exec(sentence)
      const found = m && cleaned(m[1])
      if (!found || NOT_A_TAGLINE.test(found) || /[?]$/u.test(sentence)) continue
      if (wordCount(found) <= TAGLINE_MAX_WORDS) return found
    }
  }
  return null
}
