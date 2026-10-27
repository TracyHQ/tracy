/**
 * The words the app shell itself shows — the blocked screen (src/blocked.html) and its own system
 * notifications (update reminder, What's new, the minimum version warning) — in the eight interface
 * languages (CLAUDE.md §9: en, vi, de, it, fr, nl, zh, es). These are not a plugin's strings, so the
 * `interface-languages` gate does not see them; test/shell-strings.test.mjs holds every language to
 * every key and placeholder instead.
 *
 * The language is the system's (`app.getPreferredSystemLanguages()`): the shell speaks before any
 * Tracy page has loaded, and the blocked screen replaces every page. Product names stay as they are.
 */

// The table itself is data (src/shell-strings.json): translations are not code, and the
// `language` gate keeps every string in code English.
const STRINGS = require('./shell-strings.json')

const LANGUAGES = Object.freeze(Object.keys(STRINGS))

/**
 * The first of the system's preferred languages the shell speaks (`zh-Hans-CN` → zh), else English.
 * @param {readonly string[] | undefined} preferred
 * @returns {string}
 */
function shellLanguage(preferred) {
  for (const tag of preferred ?? []) {
    const base = String(tag).toLowerCase().split(/[-_]/)[0]
    if (Object.hasOwn(STRINGS, base)) return base
  }
  return 'en'
}

/**
 * The translator of one language: `{name}` placeholders filled from `params`, English for a key a
 * language lacks (the test forbids that).
 * @param {string} language
 * @returns {(key: string, params?: Record<string, string>) => string}
 */
function shellWords(language) {
  const table = STRINGS[language] ?? STRINGS.en
  return (key, params = {}) =>
    String(table[key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : whole
    )
}

module.exports = { STRINGS, LANGUAGES, shellLanguage, shellWords }
