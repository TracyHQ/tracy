// Locale helpers. The source site is English only (DECISIONS D3); the shape is kept locale-aware
// so a second locale is one entry in LOCALES plus translated content, not a rewrite of the views.
import { isEnglish, uiDate } from './ui-words'

export const LOCALES = ['en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Prefix a site-relative path for a locale: the default locale is never prefixed. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (locale === DEFAULT_LOCALE) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}

/** Split a request pathname into locale + site-relative path. */
export function splitPath(pathname: string): { locale: Locale; path: string } {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length && isLocale(segs[0]) && segs[0] !== DEFAULT_LOCALE) {
    return { locale: segs[0] as Locale, path: `/${segs.slice(1).join('/')}` }
  }
  return { locale: DEFAULT_LOCALE, path: `/${segs.join('/')}` }
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]

/**
 * The date shape the source renders on articles: `12 August 2026`; in another language its own long date (`tag` is
 * the display tag, `uiTag` in `src/lib/ui.ts`: `8. Juli 2026`, `8 tháng 7, 2026`).
 */
export function formatDate(value: string | Date | null | undefined, tag = 'en'): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return ''
  if (!isEnglish(tag)) return uiDate(tag, d, { day: 'numeric', month: 'long', year: 'numeric' })
  return `${d.getUTCDate()} ${MONTHS_EN[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Replace `{name}` placeholders in a CMS label. */
export function fill(template: string | null | undefined, values: Record<string, string | number>): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`))
}
