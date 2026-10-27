/**
 * The language the public Find speaks: `?lang=`, then the `tracy_lang` pick, then the browser's
 * languages, then English — tracy-web's own rule (`apps/tracy-web/src/lib/i18n/index.js`), copied
 * because that module reads its dictionaries with `node:fs`. `test/public-locale.test.mjs` compares
 * the two. Words come from the plugin's own namespace, the files dsh registers in the tab.
 */
import { SHOWN_LANGUAGE_IDS } from '@tracy/core/interface-languages'
import { en, type Translate } from '@tracy/dsh-website-opportunities/strings'

import vi from '../../../locale/tracy-locale-vi/vi/tracy-website-opportunities.json' with { type: 'json' }
import de from '../../../locale/tracy-locales/de/tracy-website-opportunities.json' with { type: 'json' }
import es from '../../../locale/tracy-locales/es/tracy-website-opportunities.json' with { type: 'json' }
import fr from '../../../locale/tracy-locales/fr/tracy-website-opportunities.json' with { type: 'json' }
import it from '../../../locale/tracy-locales/it/tracy-website-opportunities.json' with { type: 'json' }
import nl from '../../../locale/tracy-locales/nl/tracy-website-opportunities.json' with { type: 'json' }
import zh from '../../../locale/tracy-locales/zh/tracy-website-opportunities.json' with { type: 'json' }

export const DEFAULT_LANGUAGE = 'en'
export const LANGUAGE_COOKIE = 'tracy_lang'
export const PAGE_LANGUAGES: readonly string[] = SHOWN_LANGUAGE_IDS

const DICTIONARIES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  vi,
  de,
  es,
  fr,
  it,
  nl,
  zh
}
const TRADITIONAL_CHINESE = /^zh-(?:.*-)?(?:tw|hk|mo|hant)(?:-|$)/

/** One language tag → one of `PAGE_LANGUAGES`, or null. Traditional Chinese is never `zh`. */
export function matchLanguage(tag: unknown): string | null {
  if (typeof tag !== 'string') return null
  const lower = tag.trim().toLowerCase().replace(/_/g, '-')
  if (!lower || lower.length > 35) return null
  if (PAGE_LANGUAGES.includes(lower)) return lower
  const primary = lower.split('-')[0] ?? ''
  if (primary === 'zh' && TRADITIONAL_CHINESE.test(lower)) return null
  return PAGE_LANGUAGES.includes(primary) ? primary : null
}

export function resolveLanguage({
  query,
  cookie,
  browser
}: {
  query?: string | null
  cookie?: string | null
  browser?: readonly unknown[] | null
} = {}): string {
  for (const tag of [query, cookie, ...(Array.isArray(browser) ? browser : [])]) {
    const matched = matchLanguage(tag)
    if (matched) return matched
  }
  return DEFAULT_LANGUAGE
}

export function cookieValue(header: unknown, name: string): string | null {
  if (typeof header !== 'string') return null
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at === -1 || part.slice(0, at).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(at + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

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
  const browser = navigator.languages?.length ? navigator.languages : [navigator.language]
  return resolveLanguage({ query, cookie, browser })
}

/** `<html lang>`: BCP 47, `zh` written the way dsh writes it. */
export function htmlLang(lang: string): string {
  return lang === 'zh' ? 'zh-CN' : lang
}

function textOf(table: Readonly<Record<string, unknown>> | undefined, key: string): string | null {
  if (!table || !Object.hasOwn(table, key)) return null
  const value = table[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/** The plugin's words in one language; English where it has none, never the raw key unless English lacks it. */
export function translatorFor(lang: string): Translate {
  const table = DICTIONARIES[lang]
  return (key, params) =>
    (textOf(table, key) ?? textOf(en, key) ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
      params && Object.hasOwn(params, name) ? String(params[name]) : m
    )
}
