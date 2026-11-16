/**
 * The build chat's translated tables on the host (#609): the question card is worded here, before the request is
 * handed to the agent (`ask-words.mjs`), so the host bundle (`lib/index.js`) embeds this plugin's own
 * `tracy-build-chat` tables, the same JSON the locale packages register in the browser. Only the host imports this
 * module: the client bundle reads the same tables from the locale packages (`../client/locale-tables.ts`).
 */
import de from '../../../../locale/tracy-locales/de/tracy-build-chat.json' with { type: 'json' }
import es from '../../../../locale/tracy-locales/es/tracy-build-chat.json' with { type: 'json' }
import fr from '../../../../locale/tracy-locales/fr/tracy-build-chat.json' with { type: 'json' }
import it from '../../../../locale/tracy-locales/it/tracy-build-chat.json' with { type: 'json' }
import nl from '../../../../locale/tracy-locales/nl/tracy-build-chat.json' with { type: 'json' }
import zh from '../../../../locale/tracy-locales/zh/tracy-build-chat.json' with { type: 'json' }
import vi from '../../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }
import { chatLanguageTagOf, wordsOver } from '../chat-words.mjs'

/** @type {Record<string, Record<string, string>>} The translated tables, by language. */
const TABLES = { de, es, fr, it, nl, zh, vi }

/** The languages the build chat can speak: English and every translated table. */
export const CHAT_LANGUAGES = Object.freeze(['en', ...Object.keys(TABLES)])

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
 * The words of one language over an English source (`wordsOver`), or null for a language the build chat has no table
 * of.
 * @param {unknown} language
 * @param {Record<string, string>} english
 * @returns {((key: string, vars?: Record<string, unknown>) => string | null) | null}
 */
export function chatWordsIn(language, english) {
  if (typeof language !== 'string' || !CHAT_LANGUAGES.includes(language)) return null
  return wordsOver(TABLES[language] ?? {}, english)
}
