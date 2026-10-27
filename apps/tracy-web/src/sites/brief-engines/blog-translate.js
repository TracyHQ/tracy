/**
 * The demo blog of a FULL site in the site's language: translated, never rewritten. Shared by WordPress (`wp-posts.js`) and
 * Joomla (`joomla.js`).
 *
 * 🔒 DEMO POSTS ON FULL ARE TRANSLATED ONLY (product owner, decision 1 after the g65 builds, 12/10/2026, TCH #1013). Rewriting
 * every demo post for the customer's business cost a model call per story and more for its title, and the customer rewrites
 * the posts anyway: on dev g65-ess-wp-full (JA Essence WordPress, Vietnamese) the build ran out of time with 7 posts left in
 * English. The posts' titles, excerpts and words are now translated into the site's language, as demo content. Accepted
 * limits, said in the spec: the demo's topics stay, titles repeat where the demo repeats them, and Latin filler stays.
 *
 * The demo's copies share their text (JA Essence: 46 WordPress posts with one excerpt and 9 bodies; 51 Joomla articles with 39
 * distinct lines), so each distinct text is asked ONCE, through `translateLines` (asked again, split, then line by line; an
 * answer that keeps the English counts as none; every line left in the template's language is said with why). Latin filler
 * ("Lorem ipsum dolor sit amet") has no meaning to translate: it keeps the demo's words, said in one note.
 */
import { translatable } from './joomla-kit.js'
import { translateLines } from './translate-lines.js'
import WORDS from './post-title-words.json' with { type: 'json' }

/** How many distinct lines one translation of the blog asks at a time. */
const BLOG_BATCH = 30
/** The words of Latin filler text (`post-title-words.json`). */
const LOREM = new Set(String(WORDS.lorem).split(/\s+/))

/**
 * Whether a line is Latin filler: two different words of `lorem`, and at least a quarter of its words of it.
 * @param {unknown} text
 */
export function loremIn(text) {
  const words =
    String(text ?? '')
      .toLowerCase()
      .match(/\p{L}+/gu) ?? []
  const latin = words.filter((word) => LOREM.has(word))
  return new Set(latin).size >= 2 && latin.length * 4 >= words.length
}

/**
 * The lines of the demo blog in `locale`, each distinct text asked once. Never rejects: a line no answer could be used for
 * keeps the template's words, said (`translateLines`).
 * @param {object} input
 * @param {Array<{ key: string, sample: string, maxCharacters: number }>} input.lines - every line of the blog, copies included
 * @param {string} input.locale - the language the site is written in
 * @param {{ chat: Function } | null} input.model
 * @param {AbortSignal} [input.signal]
 * @param {(note: string) => void} input.note
 * @param {string[]} [input.keep] - the names the customer gave, kept as written
 * @param {string} [input.what] - what the lines are, for the notes
 * @returns {Promise<Record<string, string>>} line key → its words in `locale`
 */
export async function translateBlog({
  lines,
  locale,
  model,
  signal,
  note,
  keep = [],
  what = 'the demo blog posts'
}) {
  const words = lines.filter((line) => translatable(line.sample))
  if (words.length === 0) return {}
  if (!model) {
    note(`no text model is set, so ${what} keep the template’s language`)
    return {}
  }
  const lorem = words.filter((line) => loremIn(line.sample))
  if (lorem.length > 0)
    note(`${lorem.length} line(s) of ${what} are Latin filler (lorem ipsum) and keep the demo’s words`)
  /** @type {Map<string, typeof lines>} one group per distinct text */
  const groups = new Map()
  for (const line of words)
    if (!loremIn(line.sample)) groups.set(line.sample, [...(groups.get(line.sample) ?? []), line])
  const unique = [...groups].map(([sample, same], i) => ({
    key: `blog-${i}`,
    type: 'text',
    sample,
    // Every copy's limit holds: the tightest one.
    maxCharacters: Math.min(...same.map((line) => line.maxCharacters))
  }))
  if (unique.length === 0) return {}
  const said = await translateLines({
    lines: unique,
    locale,
    shipped: new Map(),
    model,
    signal,
    note,
    what,
    batch: BLOG_BATCH,
    keep
  })
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of unique) {
    const value = said[line.key]
    if (typeof value === 'string') for (const copy of groups.get(line.sample) ?? []) out[copy.key] = value
  }
  return out
}
