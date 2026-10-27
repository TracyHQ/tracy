/**
 * Pure helpers of the `/ops/wo` › Places tab (`WoPlaces.tsx`): money, freshness, and the row
 * `@tracy/wo-views` draws. No imports with a runtime, so `node --test` loads it directly; words come
 * through the screen's `t`, numbers through its `locale` (`en` when left out).
 */
import type { PlaceRow, Provider } from '@tracy/wo-views'

import { formatNumber } from './i18n/format.ts'
import type { T } from './i18n/index.ts'

import type {
  AgainKeptReason,
  AgainRunReason,
  AgainTally,
  CostCents,
  PlaceError,
  PlaceSource,
  PlaceSummary,
  SearchedPage
} from './wo-places-api.ts'

/** US dollars in the screen's language, `fraction` decimals, no grouping (`en`: `$12.34`). */
export const formatUsd = (dollars: number, locale = 'en', fraction: [number, number] = [2, 2]) =>
  formatNumber(
    dollars,
    {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fraction[0],
      maximumFractionDigits: fraction[1],
      useGrouping: false
    },
    locale
  )

/** `$12.34` from cents; null/undefined → `—`. */
export function formatCents(cents: number | null | undefined, locale = 'en'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return '—'
  return formatUsd(cents / 100, locale)
}

/** Whole cents from a dollar amount typed by the operator (`20`, `20.5`, `$0.25`); null when not one. */
export function centsOfDollars(text: string): number | null {
  const m = /^\s*\$?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(text)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}

/** Spent + held + unreconciled: what the cap check counts. */
export const committedCents = (c: CostCents) => c.spentCents + c.reservedCents + c.unreconciledCents

/** The oldest successful collection among the place's sources (what "stale" is measured from). */
export function oldestCollection(place: Pick<PlaceSummary, 'sources'>): string | null {
  let oldest: string | null = null
  for (const s of place.sources) {
    if (!s.collectedAt) return null
    if (!oldest || s.collectedAt < oldest) oldest = s.collectedAt
  }
  return oldest
}

const PROVIDER_OF: Record<string, Provider> = { google: 'google-places', osm: 'osm' }

/**
 * A place as `@tracy/wo-views` draws a row. The library's search facts (score, kind, chain) do not
 * exist for a stored place: they are left empty rather than made up.
 */
export function placeRowOf(t: T, place: PlaceSummary): PlaceRow {
  const id = place.identities.find((i) => i.namespace !== 'url') ?? place.identities[0]
  const website = place.identities.find((i) => i.namespace === 'url')?.externalId ?? null
  return {
    key: place.id,
    provider: (id && PROVIDER_OF[id.namespace]) || 'google-places',
    providerId: id?.externalId ?? place.id,
    name: place.name || website || t('wo-places.unnamed'),
    branch: null,
    website,
    mapsUrl:
      id?.namespace === 'google'
        ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id.externalId)}`
        : null,
    kind: null,
    chain: false,
    chainSuspect: false,
    status: 'researched',
    score: { score: 0, grade: 'C', pending: true, reasons: [] }
  }
}

/** One line for a place job's error: its message, else its code. */
export function errorLine(error: PlaceError | null | undefined): string | null {
  if (!error) return null
  return error.message || error.code || null
}

/**
 * What one failed door said: a door that answered without a message of its own carries a dictionary
 * `key` and its HTTP `status` (`PlacesDoorError`, or a tally entry copied from one); else its message.
 */
export function failureText(t: T, failure: unknown): string {
  if (failure && typeof failure === 'object') {
    const key = 'key' in failure ? failure.key : undefined
    const status = 'status' in failure ? failure.status : undefined
    if (typeof key === 'string' && typeof status === 'number') return t(key, { status })
    if ('message' in failure && typeof failure.message === 'string') return failure.message
  }
  return String(failure)
}

/** Parts named after a network or a product: shown as written in every language. */
const PART_NAME: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  tripadvisor: 'Tripadvisor'
}
const PART_KEYS = new Set([
  'website',
  'facebook-search',
  'instagram-search',
  'google-places',
  'google-maps',
  'menu-file',
  'menu-photos',
  'logo'
])
/** A Research again part as the operator reads it; an unknown part shows its own name. */
export const partLabel = (t: T, part: string) =>
  PART_NAME[part] ?? (PART_KEYS.has(part) ? t(`wo-places.part.${part}`) : part)

const AGAIN_REASONS = new Set<string>([
  'never',
  'failed',
  'outdated',
  'rule-changed',
  'up-to-date',
  'none',
  'unavailable',
  'over-cap'
] satisfies (AgainRunReason | AgainKeptReason)[])
/** Why Research again runs or keeps a part; an unknown reason shows its own code. */
export const againReasonLabel = (t: T, reason: string) =>
  AGAIN_REASONS.has(reason) ? t(`wo-places.reason.${reason}`) : reason

/** The pages a social search left for an operator to check. */
export const pagesToJudge = (source: Pick<PlaceSource, 'pages'>): SearchedPage[] =>
  (source.pages ?? []).filter((p) => p.verdict === 'pending')

/** One line after a bulk Research again: `2 ran, 1 up to date, 1 failed: <first message>`. */
export function againTallyLine(t: T, tally: AgainTally): string {
  const parts: string[] = []
  if (tally.ran) parts.push(t('wo-places.tally.ran', { count: tally.ran }))
  if (tally.upToDate) parts.push(t('wo-places.tally.upToDate', { count: tally.upToDate }))
  if (tally.failed.length)
    parts.push(
      t('wo-places.tally.failed', { count: tally.failed.length, message: failureText(t, tally.failed[0]) })
    )
  return parts.join(', ') || t('wo-places.tally.nothing')
}
