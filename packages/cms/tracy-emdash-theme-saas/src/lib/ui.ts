// The site's language for the words the template says itself (server only: it reads display-locale.json).
//
// The stored locale is `en`; the language a visitor reads is the display tag `personalize` wrote (`{ "en": "vi-VN" }`,
// `src/lib/display-locale.ts`), or `en` itself. Every view takes its words and dates from here, so a root written in
// German says "Zurück" and "8. Juli 2026", not "Back" and "Jul 8, 2026".
import { displayLocaleOf } from './display-locale'
import { LOCALES, type Locale } from './i18n'
import { uiWords, type UiWords } from './ui-words'

/** The display tag of a stored locale: what `<html lang>` prints and what the words and dates follow. */
export function uiTag(locale: Locale | string): string {
  return displayLocaleOf(locale, LOCALES)
}

/** The tag and the template's words for a stored locale. */
export function ui(locale: Locale | string): { tag: string; w: UiWords } {
  const tag = uiTag(locale)
  return { tag, w: uiWords(tag) }
}
