/**
 * How long ago, compact: "5m", "2h", "3d" (Akemi 03/10: no "min." / "hr." / "ago"). The runtime
 * owns each language's short unit (`Intl.NumberFormat` with `unitDisplay: 'narrow'`), so nothing
 * here needs translating; under a minute reads as the language's own "now". The caller passes
 * `interfaceLocale()` (`@tracy/core/interface-languages`), which follows Settings › Language rather
 * than the browser's own language.
 * @param iso - when it happened.
 * @param now - the moment to measure from (ms).
 * @param locale - a BCP 47 tag, or undefined for the runtime default.
 * @returns the phrase, or '' for a stamp that does not parse.
 */
export function relativeTime(iso: string, now: number, locale: string | undefined): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((now - at) / 60_000))
  if (minutes < 1) return nowWord(locale)
  if (minutes < 60) return unit(locale, 'minute', minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return unit(locale, 'hour', hours)
  const days = Math.round(hours / 24)
  if (days < 7) return unit(locale, 'day', days)
  const weeks = Math.round(days / 7)
  if (weeks < 5) return unit(locale, 'week', weeks)
  return unit(locale, 'month', Math.round(days / 30))
}

function unit(
  locale: string | undefined,
  name: 'minute' | 'hour' | 'day' | 'week' | 'month',
  n: number
): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(n)
  } catch {
    return new Intl.NumberFormat(undefined, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(n)
  }
}

function nowWord(locale: string | undefined): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' }).format(0, 'second')
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' }).format(0, 'second')
  }
}
