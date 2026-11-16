/**
 * The question words in the owner's interface language, on the host (#609). dsh's question card draws the labels the
 * `ask_user_question` request carries and the model passes the request on unchanged, so the words of a question are
 * chosen here, before the request is handed out (`localizedAskOf`). They are the `ask.*` keys of this plugin's own
 * `tracy-build-chat` tables: English from `ASK_STRINGS` (`@tracy/core/build-chat`, spread into `strings.ts`), every
 * other language from the same JSON tables the browser loads, bundled into `lib/index.js`, as the design inspiration's
 * host bundles a table of another package.
 */
import { ASK_STRINGS } from '@tracy/core/build-chat'
import de from '../../../../locale/tracy-locales/de/tracy-build-chat.json' with { type: 'json' }
import es from '../../../../locale/tracy-locales/es/tracy-build-chat.json' with { type: 'json' }
import fr from '../../../../locale/tracy-locales/fr/tracy-build-chat.json' with { type: 'json' }
import it from '../../../../locale/tracy-locales/it/tracy-build-chat.json' with { type: 'json' }
import nl from '../../../../locale/tracy-locales/nl/tracy-build-chat.json' with { type: 'json' }
import zh from '../../../../locale/tracy-locales/zh/tracy-build-chat.json' with { type: 'json' }
import vi from '../../../../locale/tracy-locale-vi/vi/tracy-build-chat.json' with { type: 'json' }

/** @type {Record<string, Record<string, string>>} The translated tables, by interface language. */
const TABLES = { de, es, fr, it, nl, zh, vi }

/** The interface languages this host can word a question in: English and every translated table. */
export const ASK_LANGUAGES = Object.freeze(['en', ...Object.keys(TABLES)])

/**
 * The question words of one interface language, or null for a language this host has no table of. A key the table
 * lacks reads its English, and a key no table has reads null (the question keeps its own text).
 * @param {unknown} language
 * @returns {import('@tracy/core/build-chat').AskWords | null}
 */
export function askWordsFor(language) {
  if (typeof language !== 'string' || !ASK_LANGUAGES.includes(language)) return null
  const table = TABLES[language] ?? {}
  /** @type {Record<string, string>} */
  const english = ASK_STRINGS
  return (key, vars = {}) => {
    const text = Object.hasOwn(table, key) ? table[key] : Object.hasOwn(english, key) ? english[key] : null
    return text === null
      ? null
      : text.replace(/\{(\w+)\}/g, (_, name) => String(/** @type {any} */ (vars)[name] ?? ''))
  }
}
