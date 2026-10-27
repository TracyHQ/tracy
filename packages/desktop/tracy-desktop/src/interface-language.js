/**
 * The language the app's own local pages speak (the sign-in waiting page): the first
 * operating-system language (`app.getPreferredSystemLanguages()`) that is one of the eight interface
 * languages, else English (tasks/todo-desktop-onboard-v2.md, contract 4).
 *
 * Matching is tracy-web's `matchLanguage` (apps/tracy-web/src/lib/i18n/index.js): exact id, then
 * the primary subtag; Traditional Chinese (`zh-TW`, `zh-HK`, `zh-MO`, any `Hant`) never lands on
 * Simplified `zh` and falls through to the next tag. The list repeats `INTERFACE_LANGUAGES` of
 * `@tracy/core/interface-languages`: this package ships no workspace code into the app bundle.
 */

/** Same ids, same order as `@tracy/core/interface-languages`. */
const INTERFACE_LANGUAGES = Object.freeze(['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es'])

const TRADITIONAL_CHINESE = /^zh-(?:.*-)?(?:tw|hk|mo|hant)(?:-|$)/

/**
 * @param {unknown} tag - one language tag (`de-AT`, `pt_BR`).
 * @returns {string | null} one of the eight, or null.
 */
function matchLanguage(tag) {
  if (typeof tag !== 'string') return null
  const lower = tag.trim().toLowerCase().replace(/_/g, '-')
  if (!lower || lower.length > 35) return null
  if (INTERFACE_LANGUAGES.includes(lower)) return lower
  const primary = lower.split('-')[0]
  if (primary === 'zh' && TRADITIONAL_CHINESE.test(lower)) return null
  return INTERFACE_LANGUAGES.includes(primary) ? primary : null
}

/**
 * @param {unknown} tags - the operating system's languages, most preferred first.
 * @returns {string} one of the eight interface languages; English when none matches.
 */
function pickInterfaceLanguage(tags) {
  if (!Array.isArray(tags)) return 'en'
  for (const tag of tags) {
    const match = matchLanguage(tag)
    if (match !== null) return match
  }
  return 'en'
}

module.exports = { INTERFACE_LANGUAGES, matchLanguage, pickInterfaceLanguage }
