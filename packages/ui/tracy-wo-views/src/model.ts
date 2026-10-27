/**
 * The pure half of the views: sorting, kind tabs, score lines, the website summary, formatting.
 * No React here, so `test/model.test.mjs` runs it straight under node.
 */
import { KINDS, SOCIAL_NETWORKS } from './types.ts'
import type { Kind, PlaceRow, ScoreReason, SocialNetwork, SocialStat, SortKey, Translate } from './types.ts'

/** Re-exported so a consumer's node-run code can read the network order without the React entry. */
export { KINDS, SOCIAL_NETWORKS }

/** `noScore`: checked (CMS, ©, HTTPS known) but PageSpeed returned no performance score. */
export type WebsiteKind =
  | 'none'
  | 'social'
  | 'down'
  | 'blocked'
  | 'checking'
  | 'score'
  | 'noScore'
  | 'unknown'
/** Short facts after the website score; the cell reads each as `cell.website.note.<id>`. */
export type WebsiteNote = 'notMobileFriendly' | 'noHttps' | 'copyright' | 'fine'
export interface WebsiteSummary {
  kind: WebsiteKind
  score?: number
  notes: WebsiteNote[]
  host?: string
  cms?: string | null
  /** Set with the `copyright` note. */
  copyrightYear?: number
  /** For `social`: the first network the place has a page on. */
  network?: SocialNetwork
}

/** A website score under this reads as weak (red), like the score's own slow threshold. */
export const LOW_WEBSITE_SCORE = 50
/** A copyright line this many years old reads as stale. */
export const STALE_COPYRIGHT_YEARS = 5

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** `https://www.example.com/a` → `example.com`; anything unparsable comes back trimmed. */
export function hostOf(url: string): string {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return url.trim()
  }
}

/** The first social network with a page link, in SOCIAL_NETWORKS order. */
export function firstSocial(row: PlaceRow): SocialNetwork | undefined {
  return SOCIAL_NETWORKS.find((n) => Boolean(row.socials?.[n]))
}

/** What the website cell shows, decided once for the table, the grid, the map card and sorting. */
export function websiteSummary(row: PlaceRow, now: Date = new Date()): WebsiteSummary {
  if (!row.website) {
    const network = firstSocial(row)
    return network ? { kind: 'social', notes: [], network } : { kind: 'none', notes: [] }
  }
  const host = hostOf(row.website)
  const check = row.siteCheck
  if (!check || check.status === 'queued') return { kind: 'checking', notes: [], host }
  if (check.status === 'down') return { kind: 'down', notes: [], host }
  if (check.status === 'blocked') return { kind: 'blocked', notes: [], host }
  if (check.status !== 'done') return { kind: 'unknown', notes: [], host }
  const notes: WebsiteNote[] = []
  if (check.mobileFriendly === false) notes.push('notMobileFriendly')
  if (check.https === false) notes.push('noHttps')
  const year = isNum(check.copyrightYear) ? check.copyrightYear : undefined
  const stale = year !== undefined && year <= now.getFullYear() - STALE_COPYRIGHT_YEARS
  if (stale) notes.push('copyright')
  const score = isNum(check.performance) ? check.performance : undefined
  // "Fine" needs a measured speed; without one we only report what was seen.
  if (!notes.length && score !== undefined && score >= LOW_WEBSITE_SCORE) notes.push('fine')
  return {
    kind: score === undefined ? 'noScore' : 'score',
    ...(score === undefined ? {} : { score }),
    notes,
    host,
    cms: check.cms ?? null,
    ...(stale ? { copyrightYear: year } : {})
  }
}

// Website rank: a better site ranks higher; places with nothing to rank yet sort last.
const WEB_RANK: Partial<Record<WebsiteKind, number>> = { none: -3, social: -2, down: -1 }
const webRank = (row: PlaceRow): number | null => {
  const s = websiteSummary(row)
  return s.kind === 'score' ? (s.score ?? null) : (WEB_RANK[s.kind] ?? null)
}

// Reviews are whole numbers and a rating is at most 5, so rating/10 only ever breaks a tie.
const googleRank = (row: PlaceRow): number | null =>
  isNum(row.reviews) ? row.reviews + (isNum(row.rating) ? row.rating / 10 : 0) : null

/** Followers summed over every network that reported a count; null when none did. */
export function totalFollowers(row: PlaceRow): number | null {
  const counts = SOCIAL_NETWORKS.map((n) => row.social?.[n]?.followers).filter(isNum)
  return counts.length ? counts.reduce((a, b) => a + b, 0) : null
}

type Rank = (row: PlaceRow) => number | null

const RANK: Record<SortKey, Rank> = {
  score: (r) => r.score.score,
  web: webRank,
  google: googleRank,
  social: totalFollowers
}

/** A new array; rows without a value for `key` go last whatever `dir`; ties keep their order. */
export function sortRows(rows: PlaceRow[], key: SortKey, dir: 1 | -1): PlaceRow[] {
  const rank = RANK[key]
  return rows
    .map((row, i) => ({ row, i, v: rank(row) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1
      return a.v === b.v ? a.i - b.i : dir * (a.v - b.v)
    })
    .map((x) => x.row)
}

/** null = every row (the All tab). */
export function filterByKind(rows: PlaceRow[], kind: Kind | null): PlaceRow[] {
  return kind === null ? rows.slice() : rows.filter((r) => r.kind === kind)
}

/** One entry per kind that has rows, in KINDS order; rows without a kind count only toward All. */
export function kindCounts(rows: PlaceRow[]): Array<{ kind: Kind; count: number }> {
  const counts = new Map<Kind, number>()
  for (const r of rows) if (r.kind) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  return KINDS.filter((k) => counts.has(k)).map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
}

// ---- formatting (every helper takes the interface locale; 'en' when the consumer has none) ----

export function formatNumber(n: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale).format(n)
}

/** 8200 → "8.2K" */
export function formatCompact(n: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** A star rating with one decimal: 4.6 → "4.6". */
export function formatRating(n: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
}

/** Metres → "350 m" under a kilometre, "1.2 km" from there. */
export function formatDistance(m: number, locale = 'en'): string {
  return m < 1000
    ? new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', maximumFractionDigits: 0 }).format(
        Math.round(m / 10) * 10
      )
    : new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', maximumFractionDigits: 1 }).format(
        m / 1000
      )
}

/** Days (fractional) from an ISO timestamp to `now` (ms), never negative; null when there is no valid timestamp. */
export function ageInDays(at: string | null | undefined, now: number): number | null {
  const t = typeof at === 'string' ? Date.parse(at) : Number.NaN
  return Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : null
}

/** Whole days from an ISO timestamp to `now` (ms), never negative; null when there is no valid timestamp. */
export function daysSince(at: string | null | undefined, now: number): number | null {
  const age = ageInDays(at, now)
  return age === null ? null : Math.floor(age)
}

/** The latest `lastPostAt` over every network of the row; null when none reported one. */
export function freshestPostAt(row: PlaceRow): string | null {
  let best: string | null = null
  for (const n of SOCIAL_NETWORKS) {
    const at = row.social?.[n]?.lastPostAt
    if (
      typeof at === 'string' &&
      Number.isFinite(Date.parse(at)) &&
      (best === null || Date.parse(at) > Date.parse(best))
    )
      best = at
  }
  return best
}

// ---- the social cell ----

/** One page with numbers, as the cell, the card and the detail page draw it. */
export interface SocialLine {
  network: SocialNetwork
  url: string
  followers: number | null
  /** Days since the last post, fractional (the cell may say hours). */
  days: number | null
  perMonth: number | null
  /** `postsPerMonth` counts only the posts the provider returned: read it as "at least". */
  partial: boolean
  stale: boolean
  provider: string | null
  fetchedAt: string | null
}

export interface SocialView {
  lines: SocialLine[]
  /** Pages the row links that have no numbers (yet). */
  links: Array<{ network: SocialNetwork; href: string }>
  /** A page is queued on the server and will be fetched now. */
  pending: boolean
  /** ISO; the earliest a page put off by the daily budget is fetched, when nothing else is pending. */
  deferredUntil: string | null
  /** Something is missing, failed or stale, and nothing is queued: "Get social stats" has work. */
  canFetch: boolean
  /** With no numbers: `none` = no page; `notFound` = every linked page was not found; `failed` = a fetch failed. */
  verdict: 'none' | 'notFound' | 'failed' | null
}

/** True once the website check can no longer add a social page it found on the site. */
const lookupSettled = (row: PlaceRow): boolean =>
  !row.website || (row.siteCheck != null && row.siteCheck.status !== 'queued')

const numOrNull = (v: unknown): number | null => (isNum(v) ? v : null)

/** One page's stat as a line; null when it carries no number to show. */
export function socialLine(network: SocialNetwork, s: SocialStat, now: number): SocialLine | null {
  const days = ageInDays(s.lastPostAt, now)
  if (!isNum(s.followers) && !isNum(s.postsPerMonth) && days === null) return null
  return {
    network,
    url: s.url,
    followers: numOrNull(s.followers),
    days,
    perMonth: numOrNull(s.postsPerMonth),
    partial: s.coverage === 'partial',
    stale: s.stale === true,
    provider: s.provider ?? null,
    fetchedAt: s.fetchedAt ?? null
  }
}

/** What the Social cell shows for a row, decided once for the table, the cards and the map. */
export function socialView(row: PlaceRow, now: number): SocialView {
  const lines: SocialLine[] = []
  const links: SocialView['links'] = []
  const statuses: Array<string | undefined> = []
  const deferred: number[] = []
  let canFetch = false
  for (const network of SOCIAL_NETWORKS) {
    const href = row.socials?.[network] ?? row.social?.[network]?.url
    if (!href) continue
    const s = row.social?.[network]
    const until = s?.status === 'queued' && s.deferredUntil ? Date.parse(s.deferredUntil) : Number.NaN
    // Put off by the daily budget: not spinning, and the button cannot fetch it sooner.
    if (until > now) deferred.push(until)
    else {
      statuses.push(s?.status)
      if (!s || s.status === 'not_queued' || s.status === 'error' || s.stale === true) canFetch = true
    }
    const line = s ? socialLine(network, { ...s, url: s.url || href }, now) : null
    if (line) lines.push(line)
    else links.push({ network, href })
  }
  const pending = statuses.includes('queued')
  const deferredUntil = !pending && deferred.length ? new Date(Math.min(...deferred)).toISOString() : null
  let verdict: SocialView['verdict'] = null
  if (!lines.length && !pending && !deferredUntil) {
    if (!statuses.length) verdict = lookupSettled(row) ? 'none' : null
    else if (statuses.every((s) => s === 'not_found')) verdict = 'notFound'
    else if (statuses.includes('error')) verdict = 'failed'
  }
  return { lines, links, pending, deferredUntil, canFetch: canFetch && !pending, verdict }
}

const PROVIDER_LABEL: Readonly<Record<string, string>> = {
  rapidapi: 'RapidAPI',
  // Bare RapidAPI tiers, as rows written before the server sent `<network>/<tier>` name them.
  scraper3: 'RapidAPI',
  looter2: 'RapidAPI',
  stable: 'RapidAPI',
  api23: 'RapidAPI',
  'yt-api': 'RapidAPI',
  youtube: 'YouTube Data API',
  official: 'YouTube Data API',
  apify: 'Apify'
}

/** A provider id (`facebook/scraper3`, `youtube/official`, `apify`) as the service's name; brand names, never translated. */
export function providerLabel(id: string): string {
  const tier = id.includes('/') ? id.slice(id.indexOf('/') + 1) : id
  return PROVIDER_LABEL[tier] ?? (id.includes('/') ? 'RapidAPI' : id)
}

/** Days in the past (fractional) → "14 hours ago" / "2 days ago" / "8 months ago" (`narrow`: "14h ago"). */
export function formatAgo(days: number, locale = 'en', style: 'long' | 'narrow' = 'long'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style })
  // Whole minutes first, so 14/24 of a day is 14 hours, not 13.99….
  const minutes = Math.round(days * 1440)
  const whole = Math.floor(minutes / 1440)
  // A score the server saved with whole days (older rows) arrives as exactly 0: that is today, not now.
  if (days === 0) return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style }).format(0, 'day')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (minutes < 1440) return rtf.format(-Math.floor(minutes / 60), 'hour')
  if (whole < 60) return rtf.format(-whole, 'day')
  if (whole < 365) return rtf.format(-Math.floor(whole / 30), 'month')
  return rtf.format(-Math.floor(whole / 365), 'year')
}

/** An ISO time ahead of `now` → "in 20 minutes" / "in 5 hours" / "tomorrow" / "in 3 days"; null when unreadable. */
export function formatUntil(iso: string, now: number, locale = 'en'): string | null {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return null
  const minutes = Math.max(1, Math.round((at - now) / 60_000))
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (minutes < 60) return rtf.format(minutes, 'minute')
  if (minutes < 1440) return rtf.format(Math.floor(minutes / 60), 'hour')
  return rtf.format(Math.round(minutes / 1440), 'day')
}

/** "· 3/mo", or "· ≥3/mo" when the provider returned only some of the posts; the count in the locale's digits. */
export function perMonthText(
  t: Translate,
  line: Pick<SocialLine, 'perMonth' | 'partial'>,
  locale = 'en'
): string | null {
  if (line.perMonth === null) return null
  const count = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(line.perMonth)
  return t(line.partial ? 'cell.social.perMonthAtLeast' : 'cell.social.perMonth', { count })
}

/** Points with their sign: +40, 0, -45. */
export function formatPoints(points: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { signDisplay: 'exceptZero' }).format(points)
}

// ---- score reasons ----

/**
 * What Google said of a place's reviews: a rating is never 0 (Google's lowest is 1), and a count of 0 beside no rating
 * is a score made before unknown values were left out, so neither is shown as "0 reviews · ★0.0".
 */
function demandKnown(p: Record<string, unknown>): { reviews: boolean; rating: boolean } {
  const rating = isNum(p.rating) && p.rating > 0
  return { rating, reviews: isNum(p.reviews) && (p.reviews > 0 || rating) }
}

/** A reason worth showing as the short "why" under a grade: not a review count Google never gave. */
export function reasonShownAsWhy([key, , params]: ScoreReason): boolean {
  if (key !== 'demand.reviews') return true
  const known = demandKnown(params ?? {})
  return known.reviews || known.rating
}

/** The left half of a tooltip line: what the reason is about. */
export function reasonLabel(t: Translate, [key, , params]: ScoreReason, locale = 'en'): string {
  const p = params ?? {}
  if (key === 'demand.reviews') {
    const known = demandKnown(p)
    const reviews = known.reviews ? formatNumber(p.reviews as number, locale) : null
    const rating = known.rating ? formatRating(p.rating as number, locale) : null
    if (reviews !== null && rating !== null) return t('score.reason.demand.reviews', { reviews, rating })
    if (reviews !== null) return t('score.reason.demand.count', { reviews })
    if (rating !== null) return t('score.reason.demand.stars', { rating })
    return t('score.reason.demand.unknown')
  }
  if (key === 'marketing.lastPost' && isNum(p.days)) {
    return t('score.reason.marketing.lastPost', { ago: formatAgo(p.days, locale) })
  }
  return t(`score.reason.${key}`)
}

/** Reasons with no points that nothing in this round will ever fill in (social stats are not collected). */
const NOT_COLLECTED = new Set(['marketing.unknown'])

/** The right half: signed points, "not collected", or "checking…" while that part is not known yet. */
export function reasonPoints(t: Translate, [key, points]: ScoreReason, locale = 'en'): string {
  if (points !== null) return formatPoints(points, locale)
  return NOT_COLLECTED.has(key) ? t('score.notCollected') : t('score.pending')
}

/** One line: "No website +40", "1,234 reviews · ★4.6 +21", "Website checking…". */
export function reasonText(t: Translate, reason: ScoreReason, locale = 'en'): string {
  return t('score.line', { label: reasonLabel(t, reason, locale), points: reasonPoints(t, reason, locale) })
}

/** A cuisine id (`asian_fusion`) in the reader's language; without a dictionary entry, the id made readable. */
export function cuisineLabel(t: Translate, id: string): string {
  const key = `cuisine.${id}`
  const label = t(key)
  return label && label !== key ? label : id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
