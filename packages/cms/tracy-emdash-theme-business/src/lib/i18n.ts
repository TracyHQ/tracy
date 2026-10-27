// Locale helpers. EN is unprefixed, every other locale is `/<locale>/...` (DECISIONS D4).
//
// The locales are DATA: `template.config.json` lists them once, and this file, astro.config and
// the language switcher all read that list. Adding a language is an entry there, its words in
// `locale-words.ts`, and its seed — not a search for every `'ru'` in the source (15/09).
import config from '../../template.config.json'
import { wordsOf } from './locale-words'

export const LOCALES: readonly string[] = config.locales
export type Locale = string
export const DEFAULT_LOCALE: Locale = config.defaultLocale ?? 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Prefix a site-relative path for a locale: `href("ru", "/about")` -> `/ru/about`. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (locale === DEFAULT_LOCALE) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}

/** Split a request pathname into locale + site-relative path (`/ru/about` -> ru, `/about`). */
export function splitPath(pathname: string): { locale: Locale; path: string } {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length && isLocale(segs[0]) && segs[0] !== DEFAULT_LOCALE) {
    return { locale: segs[0], path: `/${segs.slice(1).join('/')}` }
  }
  return { locale: DEFAULT_LOCALE, path: `/${segs.join('/')}` }
}

/** The date shape of each locale: EN `12 Aug 2026`, RU `12.08.2026`, VI `12/08/2026`. */
export function formatDate(value: string | Date | null | undefined, locale: Locale): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  const day = d.getUTCDate()
  const month = d.getUTCMonth()
  const year = d.getUTCFullYear()
  return wordsOf(locale).date(day, month, year)
}

/** Reading-time label in the source's own words: `7 min read` / `7 мин чтения`. */
export function readingLabel(minutes: number | null | undefined, locale: Locale): string {
  if (!minutes) return ''
  return wordsOf(locale).minRead(minutes)
}

/** Replace `{name}` placeholders in a CMS label. */
export function fill(template: string | null | undefined, values: Record<string, string | number>): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`))
}
