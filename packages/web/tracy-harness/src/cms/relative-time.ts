/**
 * "2 hours ago" from an ISO timestamp — the relative reading the Demos "Deployed" column shows for
 * a demo's latest deploy. The absolute `when()` in Demos.tsx stays for the per-row timestamps in the
 * history drawer; a column wants the shape of the age, not the wall-clock time.
 *
 * A null, missing, or unparseable stamp has NO relative time (a not-yet-deployed demo shows nothing,
 * never "NaN ago"). `now` is a parameter so it is testable and never reads a hidden clock. Words come
 * from the dictionary in the language on screen (`cms-screens.time.*`, plural by `count`).
 */
import { tr } from '../i18n/index.ts'

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return null
  const ageMs = Math.max(0, now - then)
  if (ageMs < 60_000) return tr('cms-screens.time.justNow')
  if (ageMs < 3_600_000) return tr('cms-screens.time.minutesAgo', { count: Math.floor(ageMs / 60_000) })
  if (ageMs < 86_400_000) return tr('cms-screens.time.hoursAgo', { count: Math.floor(ageMs / 3_600_000) })
  return tr('cms-screens.time.daysAgo', { count: Math.floor(ageMs / 86_400_000) })
}
