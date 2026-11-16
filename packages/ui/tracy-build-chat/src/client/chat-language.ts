/**
 * The cards of a build chat in the language of its conversation (#609, decided rule: the build chat asks in the
 * language the person is chatting in). Every `tracy_build` answer names the language its cards use (`chatLanguage`:
 * the language the owner writes in when the build chat has words for it, else the interface language), and the fold
 * carries it on the values the cards read (`buildToolFoldOf`). A card drawn with a known language reads this plugin's
 * table of it from a table source (`locale-tables.ts`: the locale packages dsh already ships, so this bundle holds
 * English only); with none known yet, or a language the source has no table of, the account's interface language, as
 * dsh binds it.
 *
 * The language last seen per session is kept here, so a piece that reads no value of its own (the plan review bar,
 * the working line, the Try again button) speaks the same language as the cards around it.
 */
import { wordsOver } from '../chat-words.mjs'
import { en, type StringKey, type Translate } from './strings'

/** One language's `tracy-build-chat` table, or null when none can be read. */
export type TableSource = (language: string) => Readonly<Record<string, string>> | null

export interface ChatLanguages {
  /**
   * The translator of one build session's cards: `language` when given (and remembered for the session), else the
   * session's last known language, else the interface language.
   */
  t(sessionId?: string | null, language?: unknown): Translate
  /** The language last seen for a session, or null. */
  languageOf(sessionId?: string | null): string | null
}

/** A translator over the table of `language`, or null for a language the source has no table of. English needs none. */
export function translatorIn(language: unknown, tables: TableSource): Translate | null {
  if (typeof language !== 'string' || !/^[a-z]{2}$/.test(language)) return null
  const table = language === 'en' ? {} : tables(language)
  if (table === null) return null
  const words = wordsOver(table, en)
  return (key: StringKey, vars?: Record<string, string | number>) => words(key, vars) ?? key
}

/**
 * @param bound - the interface language's translator, as dsh binds it at the time of the call
 * @param tables - where the other languages' tables are read; without one, only English and the interface language
 */
export function createChatLanguages(bound: () => Translate, tables: TableSource = () => null): ChatLanguages {
  const seen = new Map<string, string>()
  const translators = new Map<string, Translate>()
  const inLanguage = (language: unknown): Translate | null => {
    if (typeof language !== 'string') return null
    let t = translators.get(language)
    if (!t) {
      const made = translatorIn(language, tables)
      if (made === null) return null
      translators.set(language, (t = made))
    }
    return t
  }
  const languageOf = (sessionId?: string | null) =>
    typeof sessionId === 'string' ? (seen.get(sessionId) ?? null) : null
  return {
    languageOf,
    t(sessionId, language) {
      const given = inLanguage(language)
      if (given !== null && typeof sessionId === 'string') seen.set(sessionId, language as string)
      return given ?? inLanguage(languageOf(sessionId)) ?? bound()
    }
  }
}
