// The character that looks the same for each mark a place cannot show as written (#575, part of
// `draft-write-escape.mjs`). Legal owner text is never refused and never loses a character: a business name with `&`
// stopped every page's search title, because no escape reads right at a place one print escapes once and another
// twice or prints raw (T4 Open Graph and the meta title, the main menu and its hidden list page heading, measured in
// the kit's `escapes`). So such a mark is written as its look-alike: a straight quote as a typographic one, `&` as
// the fullwidth ampersand, `<` and `>` as the fullwidth angle brackets, and an `&` that would read as a character
// reference keeps its own `&` with a word joiner (U+2060) right after it, the rule `draft-write-text-clean.mjs` uses
// for a plugin code brace. A text holding a tag keeps its angle brackets: a tag at a plain or neutral place is markup,
// not words, and the guard still refuses it. Pure.

export const QUOTES = ['"', "'"]

/** Straight quotes as typographic ones: double quotes open and close in turn, a single quote is an apostrophe. */
export function typographic(text) {
  let open = true
  return String(text)
    .replace(/"/g, () => {
      const mark = open ? '“' : '”'
      open = !open
      return mark
    })
    .replace(/(^|[\s([{])'/g, '$1‘')
    .replace(/'/g, '’')
}

/** What a neutral place cannot show as written: it prints raw somewhere and escaped elsewhere. */
export const NEUTRAL_MARKS = new Set(['"', "'", '<', '>', 'reference'])
/** What an xpath piece cannot show as written: the DOM leaves a quote in a text node and reads a reference. */
export const PIECE_MARKS = new Set(['"', "'", 'reference'])
const FULLWIDTH = { '&': '\uff06', '<': '\uff1c', '>': '\uff1e' }
const WORD_JOINER = '\u2060'
/** A tag start: markup, not words; left as it is so the guard refuses it. */
const TAG_START = /<[a-zA-Z/!?]/

/**
 * The words with each mark of `marks` the place cannot show as written in the character that looks the same:
 * typographic quotes, the fullwidth `&`, `<` and `>`; an `&` that reads as a character reference keeps its `&`
 * with a word joiner after it, so no print reads a reference. A text holding a tag keeps its angle brackets.
 */
export function lookAlike(text, marks) {
  let out = String(text)
  if (QUOTES.some((q) => marks.has(q))) out = typographic(out)
  if (marks.has('&')) out = out.replace(/&/g, FULLWIDTH['&'])
  else out = out.replace(/&(?=[#A-Za-z])/g, `&${WORD_JOINER}`)
  if (!TAG_START.test(out))
    for (const m of ['<', '>']) if (marks.has(m)) out = out.replaceAll(m, FULLWIDTH[m])
  return out
}
