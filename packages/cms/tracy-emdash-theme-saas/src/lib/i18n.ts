// Locale helpers. The template ships one locale, unprefixed (DECISIONS D5); the helpers keep the
// same shape as Tracy Business so a second locale is data plus one entry in LOCALES.
import { isEnglish, uiDate } from './ui-words'

export const LOCALES = ['en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/** Prefix a site-relative path for a locale. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (locale === DEFAULT_LOCALE) return clean
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`
}

/** Split a request pathname into locale + site-relative path. */
export function splitPath(pathname: string): { locale: Locale; path: string } {
  const segs = pathname.split('/').filter(Boolean)
  if (segs.length && isLocale(segs[0]) && segs[0] !== DEFAULT_LOCALE) {
    return { locale: segs[0], path: `/${segs.slice(1).join('/')}` }
  }
  return { locale: DEFAULT_LOCALE, path: `/${segs.join('/')}` }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The date shape the source prints on cards and bylines: `Jul 12, 2026` in English, the language's own short date
 * elsewhere (`tag` is the display tag, `src/lib/ui.ts`).
 */
export function formatDate(value: string | Date | null | undefined, tag = 'en'): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value.replace(' ', 'T')) : value
  if (Number.isNaN(d.getTime())) return ''
  if (!isEnglish(tag)) return uiDate(tag, d, { day: 'numeric', month: 'short', year: 'numeric' })
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** Replace `{name}` placeholders in a label. */
export function fill(template: string | null | undefined, values: Record<string, string | number>): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, k) => (k in values ? String(values[k]) : `{${k}}`))
}
