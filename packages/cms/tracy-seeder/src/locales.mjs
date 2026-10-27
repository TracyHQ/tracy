/**
 * One spelling for a language, everywhere: the Joomla language tag (`zh-CN`, `fr-FR`).
 *
 * Three different spellings reach this module and they must not each grow their own branch
 * downstream:
 *
 *  - the Build form's `languages` answer, historically two letters (`en`, `fr`);
 *  - what a customer says to the agent ("Chinese", "add zh");
 *  - the tag a Joomla language pack and every `language` column actually carry.
 *
 * Only the third one is real. A two-letter code is an ALIAS resolved here, once, so no handler
 * ever compares `'fr'` with `'fr-FR'` and quietly decides they are different languages.
 *
 * 🔒 AN AMBIGUOUS CODE IS NOT RESOLVED BY GUESSING. `zh` is Simplified for most of the world and
 * Traditional for a large part of it, and the two are different packs, different content, and a
 * different site. Picking one silently is the failure this module exists to prevent: the customer
 * would not see a wrong answer, they would see a finished Chinese site in the wrong Chinese.
 * The caller is told which choices exist and asks; it never defaults.
 */

/** The language every published quickstart is authored in. */
export const SOURCE_LOCALE = 'en-GB'

/**
 * Two-letter answers the Build form has always accepted, mapped to the tag Joomla uses. This is a
 * compatibility layer, not the catalog: a code here is not a claim that a pack exists for it.
 */
const ALIASES = Object.freeze({
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ru: 'ru-RU',
  vi: 'vi-VN'
})

/**
 * Codes that name a language but not a written form. Each must be answered by the customer before
 * anything is installed or translated.
 */
const AMBIGUOUS = Object.freeze({
  zh: ['zh-CN', 'zh-TW'],
  pt: ['pt-PT', 'pt-BR']
})

/** What a chooser shows next to each candidate, so the question can be asked in words. */
export const LOCALE_NAMES = Object.freeze({
  'en-GB': 'English',
  'fr-FR': 'French',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  'pt-PT': 'Portuguese (Portugal)',
  'pt-BR': 'Portuguese (Brazil)',
  'de-DE': 'German',
  'es-ES': 'Spanish',
  'it-IT': 'Italian',
  'nl-NL': 'Dutch',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'ru-RU': 'Russian',
  'vi-VN': 'Vietnamese'
})

/** A code that names a language but not its written form; `choices` are the tags to offer. */
export class AmbiguousLocaleError extends Error {
  /** @param {string} input @param {string[]} choices */
  constructor(input, choices) {
    super(
      `"${input}" does not say which written form: ask the customer for ${choices
        .map((tag) => `${tag} (${LOCALE_NAMES[tag] ?? tag})`)
        .join(' or ')}`
    )
    this.name = 'AmbiguousLocaleError'
    this.input = input
    this.choices = choices
  }
}

/**
 * The Joomla tag for whatever spelling arrived.
 *
 * Throws `AmbiguousLocaleError` for a code that names no written form, and a plain `Error` for a
 * string that is not a language tag at all. It does NOT check that a pack exists — that is the
 * catalog's job, and keeping the two apart is what lets a site be inspected for a locale before
 * anyone has decided whether Tracy can install it.
 *
 * @param {unknown} input
 * @returns {string}
 */
export function normaliseLocale(input) {
  if (typeof input !== 'string' || input.trim() === '') throw new Error('A language is required')
  const raw = input.trim().replace(/_/g, '-')
  const lower = raw.toLowerCase()
  if (AMBIGUOUS[lower]) throw new AmbiguousLocaleError(raw, AMBIGUOUS[lower])
  if (ALIASES[lower]) return ALIASES[lower]
  const parts = /^([a-z]{2,3})-([a-z]{2,4})$/.exec(lower)
  if (!parts) throw new Error(`"${raw}" is not a Joomla language tag such as fr-FR or zh-CN`)
  const tag = `${parts[1]}-${parts[2].toUpperCase()}`
  // `zh-Hans`/`zh-Hant` are valid BCP-47 and are NOT what Joomla files its packs under; sending
  // one on would look up a pack that cannot exist and report it as "no pack" rather than as the
  // spelling problem it is.
  if (/^(hans|hant)$/i.test(parts[2])) throw new AmbiguousLocaleError(raw, AMBIGUOUS.zh)
  return tag
}

/**
 * The same normalisation for a list, with duplicates collapsed and the source language first.
 * The Build form's `languages` answer is such a list, and it is the one place where "en" and
 * "en-GB" both arriving must not produce two languages.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function normaliseLocales(value) {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  const tags = []
  for (const item of list) {
    // A variant of the source language IS the source language (Lee, 23/09/2026): en-US beside en-GB
    // would be a copy of English into English, and the archive ships no `tb-main-en-us` menu for it.
    const normalised = normaliseLocale(item)
    const tag = primaryOf(normalised) === primaryOf(SOURCE_LOCALE) ? SOURCE_LOCALE : normalised
    if (!tags.includes(tag)) tags.push(tag)
  }
  if (!tags.includes(SOURCE_LOCALE)) tags.unshift(SOURCE_LOCALE)
  return [SOURCE_LOCALE, ...tags.filter((tag) => tag !== SOURCE_LOCALE)]
}

/**
 * The variant of the source language the customer writes in, when it is not the published one:
 * `en-US` from `['en-us', 'vi']`, null from `['en', 'vi']` or `['en-GB']`. The first English answer
 * decides; a site has one English edition.
 *
 * It is not a second language (`normaliseLocales` folds it into the source): the Build's `language`
 * stage RELABELS the source edition with it (`sourceLanguage.set`) before any other edition is made.
 * @param {unknown} value - the Build form's `languages` answer
 * @returns {string | null}
 */
export function sourceVariant(value) {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  for (const item of list) {
    const tag = normaliseLocale(item)
    if (primaryOf(tag) === primaryOf(SOURCE_LOCALE)) return tag === SOURCE_LOCALE ? null : tag
  }
  return null
}

/** The short code Joomla uses in a URL prefix and in `#__languages.sef`, derived from the tag. */
export function sefOf(tag) {
  return tag.split('-')[0].toLowerCase()
}

/** A tag's primary subtag, lower-cased: `en-GB`, `en-us` and `en` are all `en`. */
export const primaryOf = (tag) => String(tag).toLowerCase().split('-')[0]

/**
 * The languages a build writes the customer's words into, as primary subtags: the ones the
 * customer chose, or the source language when they chose none.
 *
 * 🔒 NO CHOICE MEANS ENGLISH, NOT EVERY EDITION (David, 23/09/2026). A quickstart may ship editions
 * nobody asked for — `tracy-business/wp7` carries 41 Polylang editions of one site — and a
 * WordPress build with no `languages` answer planned every one of them: the brief written into
 * languages the customer never named. The planner never writes the editions left out; whether a
 * site still shows them is its language stage's decision, not this one's (Joomla retires them since
 * #267). A Joomla build never arrives here empty: `normaliseLocales` puts the source language first
 * in every list.
 *
 * Matching is by PRIMARY SUBTAG, because the three CMS answered `en-gb`, `en-us` and `en` for the
 * same English on the same day (measured 22/09/2026). Comparing full tags would leave the English
 * edition untouched on two of the three.
 * @param {{ languages?: unknown } | null | undefined} site - the design preview's site block
 * @returns {Set<string>}
 */
export function languageScope(site) {
  const chosen = new Set(
    (Array.isArray(site?.languages) ? site.languages : [])
      .filter((l) => typeof l === 'string' && l !== '')
      .map(primaryOf)
  )
  return chosen.size > 0 ? chosen : new Set([primaryOf(SOURCE_LOCALE)])
}

/**
 * Whether content in `lang` is rewritten on a site whose scope is `scope`.
 *
 * 🔒 ANYTHING UNKNOWN IS WRITTEN. No language on the entity, `*`, a map that could not be read: the
 * content cannot be filtered by language, so it stays in the plan (David, 23/09/2026) — dropping
 * content on a guess is the one failure this may not have. Only a language positively outside the
 * scope keeps the quickstart's words.
 * @param {string | null | undefined} lang @param {Set<string>} scope - from `languageScope`
 */
export function languageWanted(lang, scope) {
  if (typeof lang !== 'string' || lang === '' || lang === '*') return true
  return scope.has(primaryOf(lang))
}
