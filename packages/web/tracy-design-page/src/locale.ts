/**
 * The language the public Design inspiration page speaks (#811 F-S5-004).
 *
 * The page is not inside dsh, so no locale service hands it a language or a dictionary. It picks
 * one the way tracy-web's own pages do (`apps/tracy-web/src/lib/i18n/index.js`): `?lang=`, then the
 * `tracy_lang` pick, then the browser's languages in their order, then English — and wears the
 * dictionaries the plugin's namespace already has (`tracy-design-inspiration`, the same files dsh
 * registers), so the gallery and the preview read here as they do in a lane.
 *
 * 🔒 THE RULE IS SHARED, NOT COPIED HERE. tracy-web's module reads its dictionaries with `node:fs` and
 * cannot be bundled for a browser, so its rule lives once more in `@tracy/core/interface-languages/resolve`
 * (also read by `/ops`) — Traditional Chinese is never mapped to `zh` — and `test/public-locale.test.mjs`
 * compares the two over a table of tags, so a change on one side fails there.
 *
 * A key the picked language does not have falls back to English, never to the key. The words that
 * are this page's own (`PAGE_WORDS`) have no translation yet and are English in every language.
 */
import { SHOWN_LANGUAGE_IDS } from '@tracy/core/interface-languages'
import {
  cookieValue,
  DEFAULT_LANGUAGE,
  htmlLang,
  interpolate,
  LANGUAGE_COOKIE,
  matchLanguage,
  resolveLanguage,
  textOf,
  translate
} from '@tracy/core/interface-languages/resolve'

import { en } from '../../../design/tracy-design-inspiration/src/client/strings'
import type { Translate } from '../../../design/tracy-design-inspiration/src/client/strings'
import vi from '../../../locale/tracy-locale-vi/vi/tracy-design-inspiration.json'
import de from '../../../locale/tracy-locales/de/tracy-design-inspiration.json'
import es from '../../../locale/tracy-locales/es/tracy-design-inspiration.json'
import fr from '../../../locale/tracy-locales/fr/tracy-design-inspiration.json'
import it from '../../../locale/tracy-locales/it/tracy-design-inspiration.json'
import nl from '../../../locale/tracy-locales/nl/tracy-design-inspiration.json'
import zh from '../../../locale/tracy-locales/zh/tracy-design-inspiration.json'

export { cookieValue, DEFAULT_LANGUAGE, htmlLang, LANGUAGE_COOKIE, matchLanguage, resolveLanguage }

/** The languages a visitor can be answered in: the shown interface languages, in their order. */
export const PAGE_LANGUAGES: readonly string[] = SHOWN_LANGUAGE_IDS

/** The namespace's dictionary per language; English is `en` in the plugin's `strings.ts`. */
const DICTIONARIES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  vi,
  de,
  es,
  fr,
  it,
  nl,
  zh
}

/** The language of this page load, read off the address, the cookie and the browser. */
export function pageLanguage(): string {
  let query: string | null = null
  try {
    query = new URLSearchParams(location.search).get('lang')
  } catch {
    query = null
  }
  let cookie: string | null = null
  try {
    cookie = cookieValue(document.cookie, LANGUAGE_COOKIE)
  } catch {
    cookie = null
  }
  const browser =
    typeof navigator === 'undefined'
      ? []
      : Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language]
  return resolveLanguage({ query, cookie, browser })
}

/** The plugin's strings in one language, read the way its `t` reads them; English where it has none. */
export function translatorFor(lang: string): Translate {
  const table = DICTIONARIES[lang]
  return ((key: string, params?: Record<string, string | number>) =>
    translate([table, en], key, params)) as Translate
}

/**
 * The words that are this page's own. None of them has a translation in the repository yet, so
 * they are English whatever the language — listed in one place so the day they are translated is
 * one change, and so nothing here is mistaken for translated. The one exception is `title` in
 * Vietnamese: see `pageTitle`.
 */
export const PAGE_WORDS = {
  /** The page's own name (12/10/2026), singular, capital T; the in-app tab stays "Design templates". */
  title: 'Design Template',
  placeholder: 'Your domain, or one sentence about your business',
  go: 'Show me',
  reading: 'Reading {host}…',
  readFailed: 'Could not read words from this site.',
  adviceBlocked: 'Describe the business instead.',
  adviceUnreachable: 'Check the address, or describe the business instead.',
  partial: '{host} answered slowly — these are the words that arrived before it ran out of time.',
  sentenceAsIs: 'Wearing your sentence as it is — the writer is not switched on here.'
} as const

/** One of the page's own sentences with its values in. */
export function pageWords(key: keyof typeof PAGE_WORDS, params?: Record<string, string>): string {
  return interpolate(PAGE_WORDS[key], params)
}

/**
 * The languages whose `tab.title` the page reads as its own name. Only Vietnamese: its tab title
 * ("Template thiết kế") is the one form vocabulary.md gives for "Design template". The page's
 * other words are English in every language (`PAGE_WORDS`), so its name stays English beside them
 * until they are translated together.
 */
const SINGULAR_TITLE_LANGUAGES: readonly string[] = ['vi']

/**
 * The page's name in the header: "Design Template" (12/10/2026). A language outside
 * `SINGULAR_TITLE_LANGUAGES` reads the English name.
 */
export function pageTitle(lang: string): string {
  if (!SINGULAR_TITLE_LANGUAGES.includes(lang)) return PAGE_WORDS.title
  return textOf(DICTIONARIES[lang], 'tab.title') ?? PAGE_WORDS.title
}
