/**
 * The Find box: one field takes either a place to search around, or a link to a restaurant's own
 * website or social page. What the person typed decides which door is asked.
 */
import type { Kind, PlaceRow } from '@tracy/wo-views'
import { daysSince } from '@tracy/wo-views/model'
import { scoreOpportunity } from 'website-opportunities/domain/opportunity-score.mjs'

export type LinkSource = 'website' | 'facebook' | 'instagram' | 'tiktok' | 'youtube'

export type FindInput =
  | { kind: 'empty' }
  | { kind: 'place'; query: string }
  | { kind: 'link'; url: string; source: LinkSource }

/** `label` names a point the person picked from the suggestions; the server then skips its geocoder. */
export type SearchArea =
  | { kind: 'place'; query: string }
  | { kind: 'point'; lat: number; lon: number; label?: string }
  | { kind: 'text'; query: string; placeId?: string; sessionToken?: string }

/** Radius choices; 50 km is Google's own cap and the server's. */
export const RADII_M: readonly number[] = [500, 1000, 2000, 3000, 5000, 10_000, 20_000, 30_000, 50_000]
export const DEFAULT_RADIUS_M = 3000
export const MAX_RADIUS_M = 50_000
/** Auto depth: Quick (one page of 20) up to this radius, Standard (up to 60) above. */
const QUICK_UP_TO_M = 3000

const SOCIAL_HOSTS: ReadonlyArray<[RegExp, LinkSource]> = [
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'youtube']
]

/** A host made of labels and a top-level domain: `phohoa.vn`, not `Hoi An`. */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/\S*)?$/i

export function classifyInput(raw: string): FindInput {
  const text = raw.trim()
  if (text === '') return { kind: 'empty' }
  const candidate = /^https?:\/\//i.test(text) ? text : BARE_HOST.test(text) ? `https://${text}` : null
  if (candidate === null) return { kind: 'place', query: text }
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { kind: 'place', query: text }
  }
  const host = url.hostname.toLowerCase()
  const social = SOCIAL_HOSTS.find(([pattern]) => pattern.test(host))
  return { kind: 'link', url: candidate, source: social ? social[1] : 'website' }
}

export type Depth = 'quick' | 'standard'

export function depthFor(radiusM: number): Depth {
  return radiusM <= QUICK_UP_TO_M ? 'quick' : 'standard'
}

/** Sent with the search: Google itself only returns places that match. */
export interface AdvancedOptions {
  depth?: Depth | 'auto'
  kinds?: Kind[]
  cuisines?: string[]
  minRating?: number
  priceLevels?: number[]
  openNow?: boolean
  includeChains?: boolean
}

export type WebsiteState = 'none' | 'social' | 'down' | 'slow' | 'fine'
export type HasChannel = 'phone' | 'email' | 'facebook' | 'instagram' | 'tiktok' | 'youtube'

/** Applied to what was found, without a new search. */
export interface ResultFilters {
  grades?: Array<'A' | 'B' | 'C'>
  website?: WebsiteState[]
  reviewsMin?: number
  reviewsMax?: number
  has?: HasChannel[]
  socialActiveDays?: number
  followersMin?: number
  /** CMS names as the site check reports them; `Other` = any detected CMS outside `NAMED_CMS`. */
  cms?: string[]
  copyrightBefore?: number
  /** Opt-in: hides `researched` and `demo`; existing research is visible by default. */
  hideResearched?: boolean
  /** Default true. */
  hideClosed?: boolean
}

export const NAMED_CMS = [
  'WordPress',
  'Wix',
  'Joomla',
  'Squarespace',
  'Blogger',
  'Webflow',
  'Shopify'
] as const

type SearchBody = ({ query: string } | { query?: string; lat: number; lon: number }) & {
  intent?: 'place'
  placeId?: string
  sessionToken?: string
  radiusM: number
  depth: Depth
  kinds?: Kind[]
  cuisines?: string[]
  minRating?: number
  priceLevels?: number[]
  openNow?: boolean
  includeChains?: boolean
}

export function searchBody(area: SearchArea, radiusM: number, advanced: AdvancedOptions = {}): SearchBody {
  const radius = Math.min(Math.max(1, Math.round(radiusM)), MAX_RADIUS_M)
  const depth = advanced.depth === undefined || advanced.depth === 'auto' ? depthFor(radius) : advanced.depth
  const where =
    area.kind === 'text'
      ? {
          query: area.query,
          intent: 'place' as const,
          ...(area.placeId ? { placeId: area.placeId } : {}),
          ...(area.sessionToken ? { sessionToken: area.sessionToken } : {})
        }
      : area.kind === 'place'
        ? { query: area.query }
        : { ...(area.label ? { query: area.label } : {}), lat: area.lat, lon: area.lon }
  return {
    ...where,
    radiusM: radius,
    depth,
    ...(advanced.kinds?.length ? { kinds: advanced.kinds } : {}),
    ...(advanced.cuisines?.length ? { cuisines: advanced.cuisines } : {}),
    ...(typeof advanced.minRating === 'number' && advanced.minRating > 0
      ? { minRating: advanced.minRating }
      : {}),
    ...(advanced.priceLevels?.length ? { priceLevels: advanced.priceLevels } : {}),
    ...(advanced.openNow === true ? { openNow: true } : {}),
    ...(advanced.includeChains === true ? { includeChains: true } : {})
  }
}

const WEB_STATE: Readonly<Record<string, WebsiteState>> = {
  'web.none': 'none',
  'web.socialOnly': 'social',
  'web.down': 'down',
  'web.slow': 'slow',
  'web.fine': 'fine'
}

/** The row's website state from its score; null while the check runs or when it could not tell. */
function websiteState(row: PlaceRow): WebsiteState | null {
  const reason = (row.score?.reasons ?? []).find(([key]) => key.startsWith('web.'))
  const scored =
    reason === undefined
      ? scoreOpportunity({ candidate: row, siteCheck: row.siteCheck ?? null }).reasons[0]
      : reason
  return WEB_STATE[scored[0]] ?? null
}

/** A finished check's field: `undefined` while it is still unknown (filter passes), null when the place has no site. */
function checked<T>(
  row: PlaceRow,
  read: (check: NonNullable<PlaceRow['siteCheck']>) => T
): T | null | undefined {
  if (!row.website) return null
  const check = row.siteCheck
  if (!check || check.status === 'queued' || check.status === 'not_queued') return undefined
  return check.status === 'done' ? read(check) : null
}

function hasChannel(row: PlaceRow, channel: HasChannel): boolean | undefined {
  if (channel === 'phone') return Boolean(row.phone)
  if (channel === 'email') {
    if (row.email) return true
    const emails = checked(row, (c) => c.emails ?? [])
    return emails === undefined ? undefined : (emails?.length ?? 0) > 0
  }
  if (row.socials?.[channel]) return true
  const fromSite = checked(row, (c) => c.socials?.[channel] ?? null)
  return fromSite === undefined ? undefined : Boolean(fromSite)
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Pure. A filter that needs data the row does not have yet passes the row: a site still being
 * checked passes the Website/CMS/© filters, and the social filters (active within, followers) apply
 * only to rows that carry `social` — the stats arrive later for some rows only.
 */
export function applyResultFilters(
  rows: readonly PlaceRow[],
  filters: ResultFilters,
  now = Date.now()
): PlaceRow[] {
  const f = filters
  return rows.filter((row) => {
    if ((f.hideResearched ?? false) && (row.status === 'researched' || row.status === 'demo')) return false
    if ((f.hideClosed ?? true) && row.temporarilyClosed === true) return false
    if (f.grades?.length && !f.grades.includes(row.score.grade)) return false
    if (f.website?.length) {
      const state = websiteState(row)
      if (state !== null && !f.website.includes(state)) return false
    }
    const reviews = finite(row.reviews) ? row.reviews : 0
    if (finite(f.reviewsMin) && reviews < f.reviewsMin) return false
    if (finite(f.reviewsMax) && reviews > f.reviewsMax) return false
    for (const channel of f.has ?? []) if (hasChannel(row, channel) === false) return false
    if (f.cms?.length) {
      const cms = checked(row, (c) => c.cms ?? null)
      if (cms !== undefined) {
        const named = (NAMED_CMS as readonly string[]).includes(cms ?? '')
        const match = cms !== null && (f.cms.includes(cms) || (!named && f.cms.includes('Other')))
        if (!match) return false
      }
    }
    if (finite(f.copyrightBefore)) {
      const year = checked(row, (c) => c.copyrightYear ?? null)
      if (year !== undefined && !(finite(year) && year < f.copyrightBefore)) return false
    }
    const stats = row.social ? Object.values(row.social).filter((s) => s !== undefined) : null
    if (stats !== null) {
      if (
        finite(f.socialActiveDays) &&
        !stats.some((s) => {
          const days = daysSince(s.lastPostAt, now)
          return days !== null && days <= f.socialActiveDays!
        })
      )
        return false
      if (finite(f.followersMin) && !stats.some((s) => finite(s.followers) && s.followers >= f.followersMin!))
        return false
    }
    return true
  })
}

/** "N filters on": every advanced option that differs from its default (depth is shown on its own). */
export function activeFilterCount(advanced: AdvancedOptions, filters: ResultFilters): number {
  const on = [
    (advanced.kinds?.length ?? 0) > 0,
    (advanced.cuisines?.length ?? 0) > 0,
    finite(advanced.minRating) && advanced.minRating > 0,
    (advanced.priceLevels?.length ?? 0) > 0,
    advanced.openNow === true,
    advanced.includeChains === true,
    (filters.grades?.length ?? 0) > 0,
    (filters.website?.length ?? 0) > 0,
    finite(filters.reviewsMin),
    finite(filters.reviewsMax),
    (filters.has?.length ?? 0) > 0,
    finite(filters.socialActiveDays),
    finite(filters.followersMin),
    (filters.cms?.length ?? 0) > 0,
    finite(filters.copyrightBefore),
    filters.hideResearched === true,
    filters.hideClosed === false
  ]
  return on.filter(Boolean).length
}

/** The "N filters on" key in the language's plural form; dsh's locale has no plural rules of its own. */
/** Base UI empties a multiple combobox on Escape while its list is closed; the picked cuisines stay. */
export function nextCuisines(
  current: readonly string[],
  next: string[],
  reason: string | undefined
): string[] {
  return reason === 'escape-key' ? [...current] : next
}

export function filtersOnKey(
  count: number,
  locale?: string
): 'find.summary.filters.one' | 'find.summary.filters.other' {
  return new Intl.PluralRules(locale).select(count) === 'one'
    ? 'find.summary.filters.one'
    : 'find.summary.filters.other'
}

/** The city of an approximate location's label ("Hanoi, Hanoi, VN" → "Hanoi"); null for a bare coordinate or nothing. */
export function nearbyPlace(label: string | null | undefined): string | null {
  const first = (label ?? '').split(',')[0]?.trim() ?? ''
  return first === '' || /^-?\d+(\.\d+)?$/.test(first) ? null : first
}
