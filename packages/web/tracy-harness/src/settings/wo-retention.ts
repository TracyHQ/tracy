/**
 * The Website Opportunity panel's data: the demo retention keys and the public Find cap of
 * `/api/ops/wo` settings, read with their counts from `GET /api/ops/wo/demos/summary` and saved through
 * `PUT /api/ops/wo/settings` (only these keys are sent; the server keeps the rest as saved).
 * Words come from the `settings` dictionary through the `t` each helper is given.
 */
import type { T } from '../i18n'

export interface DemoRetention {
  demoBuildsPerAccountPerDay: number
  ownSiteBuildsPerAccountPerDay: number
  demoRetentionEnabled: boolean
  demoTtlDays: number
  demoReviewTtlDays: number
  demoFreezeGraceDays: number
  demoMaxPerAccount: number
  demoMaxPerHost: number
  demoDiskHighWaterPct: number
  demoSweepBatch: number
}

export interface DemoCounts {
  live: number
  frozen: number
  expiringSoon: number
  deleted: number
}

export interface DemoSummary {
  retention: DemoRetention
  /** The sign-in-free `/find` page's limits (`website-opportunities/src/wo-settings.js` PUBLIC_FIND_RANGES). */
  publicFind: PublicFindLimits
  counts: DemoCounts
  writable: boolean
}

export interface PublicFindLimits {
  publicFindSearchesPerDay: number
  publicFindSearchesPerAddressHour: number
  publicFindSearchesPerAddressMinute: number
  publicFindSearchesPerMinute: number
  publicFindSuggestPerDay: number
  publicFindSuggestPerAddressHour: number
  publicFindSuggestPerAddressMinute: number
  publicFindSuggestPerMinute: number
  placesCacheDays: number
  placesCacheCellMeters: number
  publicResearchNewPlacesPerAddressDay: number
  publicResearchNewPlacesPerDay: number
  researchPublicDailyCapCents: number
}

/** A field's label key in the `settings` dictionary. */
export const fieldLabelKey = (key: string) => `settings.wo.field.${key}`

/** Each limit and the range the server accepts (only a day cap takes 0 = closed). */
export const PUBLIC_FIND_FIELDS: ReadonlyArray<{
  key: keyof PublicFindLimits
  min: number
  max: number
}> = [
  {
    key: 'publicFindSearchesPerDay',
    min: 0,
    max: 1_000_000
  },
  {
    key: 'publicFindSearchesPerMinute',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'publicFindSearchesPerAddressHour',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'publicFindSearchesPerAddressMinute',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'publicFindSuggestPerDay',
    min: 0,
    max: 1_000_000
  },
  {
    key: 'publicFindSuggestPerMinute',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'publicFindSuggestPerAddressHour',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'publicFindSuggestPerAddressMinute',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'placesCacheDays',
    min: 0,
    max: 3650
  },
  {
    key: 'placesCacheCellMeters',
    min: 0,
    max: 20_000
  },
  {
    key: 'publicResearchNewPlacesPerDay',
    min: 0,
    max: 1_000_000
  },
  {
    key: 'publicResearchNewPlacesPerAddressDay',
    min: 1,
    max: 1_000_000
  },
  {
    key: 'researchPublicDailyCapCents',
    min: 0,
    max: 1_000_000
  }
]

/** The first limit out of its range, said as the form shows it; null when the server would accept all. */
export function publicFindInputError(t: T, limits: PublicFindLimits): string | null {
  return firstOutOfRange(t, PUBLIC_FIND_FIELDS, limits)
}

function firstOutOfRange<K extends string>(
  t: T,
  fields: ReadonlyArray<{ key: K; min: number; max: number }>,
  values: Record<K, number>
): string | null {
  for (const f of fields) {
    const v = values[f.key]
    const field = t(fieldLabelKey(f.key))
    if (!Number.isInteger(v)) return t('settings.wo.field.wholeNumber', { field })
    if (v < f.min || v > f.max) return t('settings.wo.field.range', { field, min: f.min, max: f.max })
  }
  return null
}

/** What the saved day caps do, in words. */
export function publicFindLine(t: T, limits: PublicFindLimits): string {
  if (limits.publicFindSearchesPerDay === 0 && limits.publicFindSuggestPerDay === 0)
    return t('settings.wo.find.closed')
  return t('settings.wo.find.open', {
    searches: limits.publicFindSearchesPerDay,
    suggestions: limits.publicFindSuggestPerDay
  })
}

export type RetentionNumberKey = Exclude<keyof DemoRetention, 'demoRetentionEnabled'>

/** Each number field and the range the server accepts (`website-opportunities/src/wo-settings.js` DEMO_RETENTION_RANGES). */
export const RETENTION_FIELDS: ReadonlyArray<{
  key: RetentionNumberKey
  min: number
  max: number
}> = [
  {
    key: 'demoBuildsPerAccountPerDay',
    min: 0,
    max: 100_000
  },
  {
    key: 'ownSiteBuildsPerAccountPerDay',
    min: 0,
    max: 1_000
  },
  { key: 'demoTtlDays', min: 1, max: 365 },
  { key: 'demoReviewTtlDays', min: 1, max: 365 },
  { key: 'demoFreezeGraceDays', min: 1, max: 365 },
  { key: 'demoMaxPerAccount', min: 0, max: 100_000 },
  { key: 'demoMaxPerHost', min: 0, max: 1_000_000 },
  { key: 'demoDiskHighWaterPct', min: 50, max: 95 },
  { key: 'demoSweepBatch', min: 1, max: 100 }
]

/** The rules the values make, one sentence each, as the panel's Milestones table shows them. */
export function retentionMilestones(t: T, r: DemoRetention): string[] {
  if (!r.demoRetentionEnabled) return [t('settings.wo.milestone.off')]
  const days = (count: number) => t('settings.wo.days', { count })
  const account = r.demoMaxPerAccount
  const host = r.demoMaxPerHost
  const caps =
    account === 0 && host === 0
      ? t('settings.wo.milestone.noCaps')
      : host === 0
        ? t('settings.wo.milestone.capsAccount', { account })
        : account === 0
          ? t('settings.wo.milestone.capsHost', { host })
          : t('settings.wo.milestone.capsBoth', { account, host })
  return [
    t('settings.wo.milestone.unused', { days: days(r.demoTtlDays) }),
    t('settings.wo.milestone.review', { days: days(r.demoReviewTtlDays) }),
    t('settings.wo.milestone.deleted', { days: days(r.demoFreezeGraceDays) }),
    caps,
    // The sweep takes a disk reading, but no deployment feeds it one yet: say so, promise nothing.
    t('settings.wo.milestone.disk', { pct: r.demoDiskHighWaterPct }),
    t('settings.wo.milestone.batch', { n: r.demoSweepBatch })
  ]
}

/** The first field out of its range, said as the form shows it; null when the server would accept all. */
export function retentionInputError(t: T, r: DemoRetention): string | null {
  return firstOutOfRange(t, RETENTION_FIELDS, r)
}

export async function fetchDemoSummary(t: T, fetchImpl: typeof fetch = fetch): Promise<DemoSummary> {
  const res = await fetchImpl('/api/ops/wo/demos/summary', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  if (!res.ok) throw new Error(t('settings.wo.readFailed', { status: res.status }))
  return res.json()
}

export async function saveDemoRetention(
  t: T,
  retention: DemoRetention,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  return saveSettings(t, retention, fetchImpl)
}

export async function savePublicFindLimits(
  t: T,
  limits: PublicFindLimits,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  return saveSettings(t, limits, fetchImpl)
}

async function saveSettings(t: T, settings: object, fetchImpl: typeof fetch): Promise<void> {
  const res = await fetchImpl('/api/ops/wo/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ settings })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // The server's own words when it gives any (relayed as sent), ours otherwise.
    throw new Error(err?.message || err?.error || t('settings.wo.saveFailed', { status: res.status }))
  }
}
