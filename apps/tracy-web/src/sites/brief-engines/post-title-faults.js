/**
 * The word rules the blog category names are checked by (`blog-categories.js`): the words of a text, whether a line is a
 * placeholder or Latin filler, and whether a name is the business's own.
 *
 * Until 12/10/2026 these were part of the rules a rewritten post title was checked by; the demo posts are translated now, never
 * rewritten (product owner, decision 1 after the g65 builds), and only the rules the category names still need are left.
 */
import { titleWords } from './post-titles.js'
import WORDS from './post-title-words.json' with { type: 'json' }

/** A language's word list from `post-title-words.json`, as a set; empty for a language it does not name. */
function listOf(
  /** @type {Record<string, string>} */ table,
  /** @type {string | null | undefined} */ language
) {
  const base = String(language ?? 'en')
    .toLowerCase()
    .split(/[-_]/)[0]
  return new Set((table[base] ?? '').split(/\s+/).filter(Boolean))
}

/** The words of a text, in order: one case, letters and digits only, accents kept. */
export const wordsOf = (/** @type {unknown} */ text) =>
  String(text ?? '')
    .normalize('NFC')
    .toLocaleLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? []

/**
 * Whether a line is a placeholder or Latin filler, not words of a post: a phrase of the site language's (or English's)
 * `filler` list inside it, or two words of `lorem`.
 * @param {unknown} text @param {string | null | undefined} language
 */
export function fillerIn(text, language) {
  const said = ` ${wordsOf(text).join(' ')} `
  const base = String(language ?? 'en')
    .toLowerCase()
    .split(/[-_]/)[0]
  const phrases = [base, 'en'].flatMap((tag) =>
    String(/** @type {Record<string, string>} */ (WORDS.filler)[tag] ?? '')
      .split('|')
      .map((phrase) => wordsOf(phrase).join(' '))
      .filter(Boolean)
  )
  if (phrases.some((phrase) => said.includes(` ${phrase} `))) return true
  const lorem = new Set(String(WORDS.lorem).split(/\s+/))
  return wordsOf(text).filter((word) => lorem.has(word)).length >= 2
}

/**
 * Whether a title is (part of) the business's name: only its words, a distinctive word of it (one the description does not
 * use), or the whole name inside it.
 * @param {string} title @param {unknown} name @param {unknown} about @param {string | null | undefined} language
 */
export function namesBusiness(title, name, about, language) {
  const own = titleWords(name)
  const words = titleWords(title)
  if (own.size === 0 || words.size === 0) return false
  if ([...words].every((word) => own.has(word))) return true
  const skip = listOf(WORDS.function, language)
  const said = titleWords(about)
  const distinctive = [...own].filter((word) => word.length >= 2 && !skip.has(word) && !said.has(word))
  if (distinctive.length > 0) return distinctive.some((word) => words.has(word))
  return ` ${wordsOf(title).join(' ')} `.includes(` ${wordsOf(name).join(' ')} `)
}
