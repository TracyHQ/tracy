/**
 * The build chat's words in the language of the conversation (#609, decided rule: the build chat asks in the language
 * the person is chatting in). The chat agent names the language the owner writes in on every `tracy_build` call
 * (`language`); when the build chat has a table for it, every text the code draws in the build chat (the question card,
 * the template card, the bubble said for the owner, the plan card) uses that language, otherwise the account's
 * interface language. The account's interface language for the rest of the app is not changed.
 *
 * The tables are this plugin's own `tracy-build-chat` namespace, the same JSON the browser loads for the interface
 * language. This module holds no table: the host bundles them (`host/chat-tables.mjs`, for the question card), and
 * the browser reads them from the locale packages dsh already ships (`client/locale-tables.ts`), so the client bundle
 * stays English only. Pure: no React, no DOM, no dsh import.
 */

/**
 * A language tag as the build chat keeps it: its primary subtag, two lower case letters ("vi-VN" reads "vi"), or null
 * for anything that is not a language tag.
 * @param {unknown} tag
 * @returns {string | null}
 */
export function chatLanguageTagOf(tag) {
  if (typeof tag !== 'string') return null
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2}$/.test(primary) ? primary : null
}

/**
 * The words of one table over an English source: the text of `key` with `vars` filled in, its English when the table
 * lacks it, and null for a key the English source does not hold either.
 * @param {Readonly<Record<string, string>>} table - one language's table (empty for English)
 * @param {Readonly<Record<string, string>>} english
 * @returns {(key: string, vars?: Record<string, unknown>) => string | null}
 */
export function wordsOver(table, english) {
  return (key, vars = {}) => {
    const text = Object.hasOwn(table, key) ? table[key] : Object.hasOwn(english, key) ? english[key] : null
    return text === null
      ? null
      : text.replace(/\{(\w+)\}/g, (_, name) => String(/** @type {any} */ (vars)[name] ?? ''))
  }
}
