/**
 * The question words in the language of the build chat, on the host (#609). dsh's question card draws the labels the
 * `ask_user_question` request carries and the model passes the request on unchanged, so the words of a question are
 * chosen here, before the request is handed out (`localizedAskOf`). They are the `ask.*` keys of this plugin's own
 * `tracy-build-chat` tables (`./chat-tables.mjs`): English from `ASK_STRINGS` (`@tracy/core/build-chat`, spread into
 * `strings.ts`), every other language from the same JSON tables the browser loads, bundled into `lib/index.js`.
 */
import { ASK_STRINGS } from '@tracy/core/build-chat'
import { CHAT_LANGUAGES, chatWordsIn } from './chat-tables.mjs'

/** The languages this host can word a question in: English and every translated table. */
export const ASK_LANGUAGES = CHAT_LANGUAGES

/**
 * The question words of one language, or null for a language this host has no table of. A key the table lacks reads
 * its English, and a key no table has reads null (the question keeps its own text).
 * @param {unknown} language
 * @returns {import('@tracy/core/build-chat').AskWords | null}
 */
export function askWordsFor(language) {
  return chatWordsIn(language, ASK_STRINGS)
}
