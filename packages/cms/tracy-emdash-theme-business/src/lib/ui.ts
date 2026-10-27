// Which locale's theme words a page uses (server only: it reads display-locale.json).
//
// The words (`locale-words.ts`) are keyed by stored locale. A root written in another language (`personalize`
// `as: { en: 'vi' }`, `display-locale.json` `{ "en": "vi-VN" }`) is still stored as `en`, so its menu button, dates and
// reading time would be English. This answers the locale whose words match the language the page is written in.
import { displayLocaleOf } from './display-locale'
import { LOCALES, type Locale } from './i18n'
import { WORDS } from './locale-words'

/** The locale whose theme words the page shows: the display language when the theme has its words, else the locale. */
export function uiLocale(locale: Locale): Locale {
  const language = displayLocaleOf(locale, LOCALES).split('-')[0].toLowerCase()
  return WORDS[language] ? language : locale
}
