/**
 * Words the User Data Analytics screens share, read through the `beta` dictionary
 * (`i18n/ns/beta.ts`). Codes from the doors are worded on the client, never on the server.
 */
import { exactTime } from '../ci-api'
import { formatWith } from '../i18n/format.ts'
import type { T } from '../i18n'
import type { SourceBucket } from './api'
import { formatNumber } from './signals-data'

const SOURCE_KEYS: Record<SourceBucket, string> = {
  email: 'beta.source.email',
  blog: 'beta.source.blog',
  demo: 'beta.source.demo',
  site: 'beta.source.site',
  forum: 'beta.source.forum',
  'product-page': 'beta.source.productPage',
  helpdesk: 'beta.source.helpdesk',
  social: 'beta.source.social',
  video: 'beta.source.video',
  owned: 'beta.source.owned',
  other: 'beta.source.other',
  none: 'beta.source.none'
}

/** A sign-in channel's name. */
export const sourceLabel = (t: T, bucket: SourceBucket) => t(SOURCE_KEYS[bucket])

/** Plural params for a count shown with digit grouping: the text reads `{n}`. */
export const counted = (count: number) => ({ count, n: formatNumber(count) })

/** "12 min ago" style, from an ISO time and now; a dash when there is no time. */
export function relativeText(t: T, time: string | null, now = Date.now()): string {
  if (!time) return '—'
  const seconds = Math.max(0, (now - Date.parse(time)) / 1000)
  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return t('beta.time.justNow')
  if (seconds < 3600) return t('beta.time.minutesAgo', { n: Math.floor(seconds / 60) })
  if (seconds < 86400) return t('beta.time.hoursAgo', { n: Math.floor(seconds / 3600) })
  return t('beta.time.daysAgo', { n: Math.floor(seconds / 86400) })
}

/** An ISO time in UTC, or "Unknown". */
export const exactText = (t: T, time: string | null) => (time ? exactTime(time) : t('beta.common.unknown'))

/** An ISO time as day, month and clock ("08/10, 21:42" in English) in Vietnam time. */
export function vnTime(iso: string): string {
  return formatWith(iso, {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}
