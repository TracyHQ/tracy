/**
 * The blog categories of a demo, named for the customer's trade: one ask per site, shared by WordPress (`wp-posts.js`) and
 * Joomla (`joomla-categories.js`).
 *
 * 🔒 ON A FULL SITE THE BLOG CATEGORIES ARE RENAMED FOR THE CUSTOMER'S TRADE (product owner, decision (3) of 12/10/2026, TCH
 * #1013). A bakery's JA Essence blog filed its rewritten posts under "Health", "Design" and "Fashion" (or their translation):
 * another company's topics. With About given, each demo category takes a distinct, plausible category name of the business,
 * in the site's language. Only the NAME changes: how many categories there are, which posts each holds, and their slugs,
 * aliases, paths and addresses stay, so every page that lists a category (a kit's "Category Style N" page) keeps working.
 * Tags keep today's behaviour (translated), and About left blank keeps the demo's names.
 *
 * The answer is refused when two names are one, a name says the business name, is a placeholder, says a demo topic (the
 * demo's name or its translation: a translation is not a rename), or is long; refused, it is asked once more, told why; refused
 * again, the caller keeps today's names (the translation) and says so.
 */
import { fillerIn, namesBusiness, wordsOf } from './post-title-faults.js'
import { jsonObjectIn } from './shared.js'
import WORDS from './post-title-words.json' with { type: 'json' }

/** The longest a category name may be, in characters and in words. */
const NAME_MOST = 40
const WORDS_MOST = 6
/** Whether a name is only a catch-all ("General", "Other", "Blog"), in the site's language or English (`post-title-words.json`). */
function catchAll(/** @type {string} */ said, /** @type {string | null} */ language) {
  const base = String(language ?? 'en')
    .toLowerCase()
    .split(/[-_]/)[0]
  return [base, 'en'].some((tag) =>
    String(/** @type {Record<string, string>} */ (WORDS.catchall)[tag] ?? '')
      .split('|')
      .some((phrase) => phrase !== '' && ` ${wordsOf(phrase).join(' ')} ` === said)
  )
}

/** The instruction of the ask. Its first words tell it apart in a test double. */
export const CATEGORY_SYSTEM =
  'You name the blog categories of a small business website. "categories" are the categories of the template\'s demo ' +
  'blog, each with "key", its demo "name" (another company\'s topic) and how many "posts" it holds. Give EACH key a new ' +
  'category name for THIS business, from its description in "about" and the blog\'s article "topics": a short noun ' +
  'phrase (1 to 4 words) a visitor would file such articles under. Every name differs from every other one; never the ' +
  'business name in "avoidName", never a placeholder ("General", "Other", "Blog", "News", a number), never the demo name ' +
  'or its translation, never a word of a demo topic in "avoid". Write in the language named in "language" (a BCP 47 ' +
  'tag). A "refused" list says why an earlier answer was refused. Answer with JSON only: {"names": {"<key>": "<name>"}}.'

/** One phrase as compared: its words, lower case, one space. */
const phrase = (/** @type {unknown} */ text) => ` ${wordsOf(text).join(' ')} `

/**
 * Why a set of names cannot be written, or an empty list.
 * @param {Record<string, unknown>} names - key → the model's name
 * @param {{ keys: string[], name: unknown, about: string, language: string | null, avoid: string[] }} rules - `avoid`: the
 *   demo names and their translations
 * @returns {string[]}
 */
export function categoryFaults(names, { keys, name, about, language, avoid }) {
  const why = new Set()
  const seen = new Set()
  const avoided = avoid.map(phrase).filter((p) => p.trim() !== '')
  // Two words of the business name in a row ("Golden Crust" of "Golden Crust Bakery") name it too.
  const own = wordsOf(name)
  const pairs = own.slice(1).map((word, i) => ` ${own[i]} ${word} `)
  for (const key of keys) {
    const value = String(names?.[key] ?? '').trim()
    const said = phrase(value)
    if (said.trim() === '') {
      why.add('a category has no name')
      continue
    }
    if ([...value].length > NAME_MOST || wordsOf(value).length > WORDS_MOST)
      why.add(`a name is longer than ${WORDS_MOST} words or ${NAME_MOST} characters`)
    if (seen.has(said)) why.add('two categories have the same name')
    seen.add(said)
    if (namesBusiness(value, name, about, language) || pairs.some((pair) => said.includes(pair)))
      why.add('a name says the business name')
    if (catchAll(said, language) || /\p{N}/u.test(value) || fillerIn(value, language))
      why.add('a name is a placeholder')
    if (avoided.some((demo) => said.includes(demo)))
      why.add('a name is the demo topic or its translation, not a category of this business')
  }
  return [...why]
}

/**
 * New names for the demo's blog categories, or null with why. Never rejects.
 * @param {object} input
 * @param {Array<{ key: string, name: string, posts: number }>} input.categories - the demo's categories, by distinct name
 * @param {string} input.about - the business description
 * @param {unknown} input.name - the business name, never a category's
 * @param {string[]} [input.topics] - the blog's article topics; none since the demo posts are translated, never rewritten
 *   (decision 1 after g65, 12/10/2026): their topics are the demo's, which no category may take
 * @param {string | null} input.language - the language the site is written in
 * @param {string[]} [input.translations] - the demo names said in the site's language: a translation is not a rename
 * @param {((call: { system: string, input: unknown }) => Promise<string>) | null} input.generate
 * @returns {Promise<{ names: Record<string, string> | null, why: string | null }>}
 */
export async function tradeCategoryNames({
  categories,
  about,
  name,
  topics = [],
  language,
  translations = [],
  generate
}) {
  if (categories.length === 0) return { names: null, why: null }
  if (!generate) return { names: null, why: 'no text model is set' }
  const keys = categories.map((c) => c.key)
  const avoid = [...categories.map((c) => c.name), ...translations]
  /** @type {string[]} */
  let refused = []
  let why = 'the text model gave no answer'
  for (let round = 0; round < 2; round += 1) {
    try {
      const body = jsonObjectIn(
        await generate({
          system: CATEGORY_SYSTEM,
          input: {
            language,
            about,
            avoidName: String(name ?? ''),
            topics: topics.slice(0, 40),
            categories,
            avoid,
            ...(refused.length > 0 ? { refused } : {})
          }
        })
      )
      const got =
        body?.names && typeof body.names === 'object'
          ? /** @type {Record<string, unknown>} */ (body.names)
          : {}
      const faults = categoryFaults(got, { keys, name, about, language, avoid })
      if (faults.length === 0)
        return { names: Object.fromEntries(keys.map((key) => [key, String(got[key]).trim()])), why: null }
      refused = faults
      why = faults.join('; ')
    } catch (error) {
      why = `the text model was unavailable (${error instanceof Error ? error.message : error})`
    }
  }
  return { names: null, why }
}
