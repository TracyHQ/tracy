/**
 * The build chat's words in the language of the conversation (#609, decided rule: the build chat asks in the language
 * the person is chatting in). The chat agent names the language the owner writes in on every `tracy_build` call
 * (`language`); when this plugin has a table for it, every text the code draws in the build chat (the question card,
 * the template card, the bubble said for the owner, the plan card) uses that language, otherwise the account's
 * interface language. The account's interface language for the rest of the app is not changed.
 *
 * The tables are this plugin's own `tracy-build-chat` namespace, the same JSON the browser loads for the interface
 * language, bundled into both halves (`lib/index.js` and `lib/client.js`): dsh's locale service translates in its
 * active language only. Pure: no React, no DOM, no dsh import.
 */
import de from '../../../locale/tracy-locales/de/tracy-build-chat.json' with { type: 'json' }
import es from '../../../locale/tracy-locales/es/tracy-build-chat.json' with { type: 'json' }
import fr from '../../../locale/tracy-locales/fr/tracy-build-chat.json' with { type: 'json' }
import it from '../../../locale/tracy-locales/it/tracy-build-chat.json' with { type: 'json' }
import nl from '../../../locale/tracy-locales/nl/tracy-build-chat.json' with { type: 'json' }
import zh from '../../../locale/tracy-locales/zh/tracy-build-chat.json' with { type: 'json' }
import vi from '../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }

/** @type {Record<string, Record<string, string>>} The translated tables, by language. */
const TABLES = { de, es, fr, it, nl, zh, vi }

/** The languages the build chat can speak: English and every translated table. */
export const CHAT_LANGUAGES = Object.freeze(['en', ...Object.keys(TABLES)])

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
 * The language the code draws the build chat in: the conversation's language when the build chat has words for it,
 * else the interface language, else null.
 * @param {unknown} spoken - the language the owner writes in, as the chat agent named it
 * @param {unknown} interfaceLanguage - the account's interface language
 * @returns {string | null}
 */
export function chatLanguageOf(spoken, interfaceLanguage) {
  const said = chatLanguageTagOf(spoken)
  if (said !== null && CHAT_LANGUAGES.includes(said)) return said
  return chatLanguageTagOf(interfaceLanguage)
}

/**
 * The words of one language over an English source: the text of `key` with `vars` filled in, its English when the
 * language's table lacks it, and null for a key the English source does not hold either. Null for a language the
 * build chat has no table of.
 * @param {unknown} language
 * @param {Record<string, string>} english
 * @returns {((key: string, vars?: Record<string, unknown>) => string | null) | null}
 */
export function chatWordsIn(language, english) {
  if (typeof language !== 'string' || !CHAT_LANGUAGES.includes(language)) return null
  const table = TABLES[language] ?? {}
  return (key, vars = {}) => {
    const text = Object.hasOwn(table, key) ? table[key] : Object.hasOwn(english, key) ? english[key] : null
    return text === null
      ? null
      : text.replace(/\{(\w+)\}/g, (_, name) => String(/** @type {any} */ (vars)[name] ?? ''))
  }
}
