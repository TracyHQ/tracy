/**
 * The cards of a build chat in the language of its conversation (#609, decided rule: the build chat asks in the
 * language the person is chatting in). Every `tracy_build` answer names the language its cards use (`chatLanguage`:
 * the language the owner writes in when the build chat has words for it, else the interface language), and the fold
 * carries it on the values the cards read (`buildToolFoldOf`). A card drawn with a known language reads this plugin's
 * bundled table of it (`../chat-words.mjs`); with none known yet, the account's interface language, as dsh binds it.
 *
 * The language last seen per session is kept here, so a piece that reads no value of its own (the plan review bar,
 * the working line, the Try again button) speaks the same language as the cards around it.
 */
import { chatWordsIn } from '../chat-words.mjs'
import { en, type StringKey, type Translate } from './strings'

export interface ChatLanguages {
  /**
   * The translator of one build session's cards: `language` when given (and remembered for the session), else the
   * session's last known language, else the interface language.
   */
  t(sessionId?: string | null, language?: unknown): Translate
  /** The language last seen for a session, or null. */
  languageOf(sessionId?: string | null): string | null
}

/** A translator over this plugin's bundled table of `language`, or null for a language it has no table of. */
export function translatorIn(language: unknown): Translate | null {
  const words = chatWordsIn(language, en)
  if (words === null) return null
  return (key: StringKey, vars?: Record<string, string | number>) => words(key, vars) ?? key
}

/** @param bound - the interface language's translator, as dsh binds it at the time of the call */
export function createChatLanguages(bound: () => Translate): ChatLanguages {
  const seen = new Map<string, string>()
  const translators = new Map<string, Translate>()
  const inLanguage = (language: string | null): Translate | null => {
    if (language === null) return null
    let t = translators.get(language)
    if (!t) {
      const made = translatorIn(language)
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
      const given = typeof language === 'string' && translatorIn(language) !== null ? language : null
      if (given !== null && typeof sessionId === 'string') seen.set(sessionId, given)
      return inLanguage(given ?? languageOf(sessionId)) ?? bound()
    }
  }
}
