/**
 * The "Added" cell of My opportunities (#537, header C): when the place was added, in words relative to now
 * ("3 hours ago", "yesterday", "3 days ago"), and the exact date and time for the tooltip ("10 Nov 2026, 14:05").
 * Older than seven days, the words give way to the short date. Both use the interface locale the caller passes.
 * Pure: no clock read (callers pass `now`).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface AddedAgo {
  /** Relative words, or the short date once older than seven days. */
  text: string
  /** The exact date and time, for the `title`. */
  exact: string
}

/** `timeZone` is for tests; the screen leaves it out and shows the viewer's own clock. */
export function addedAgo(
  iso: string | null | undefined,
  now: number,
  locale: string,
  timeZone?: string
): AddedAgo | null {
  const then = typeof iso === 'string' ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(then)) return null
  const exact = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone
  }).format(then)
  const ago = Math.max(0, now - then)
  if (ago > 7 * DAY) {
    const date = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone
    })
    return { text: date.format(then), exact }
  }
  const words = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const text =
    ago < HOUR
      ? words.format(-Math.max(1, Math.floor(ago / MINUTE)), 'minute')
      : ago < DAY
        ? words.format(-Math.floor(ago / HOUR), 'hour')
        : words.format(-Math.floor(ago / DAY), 'day')
  return { text, exact }
}
