/**
 * Data shapes of the Website Opportunities views (contract: tasks/contract-wo-views.md §1).
 * Pure data: the library never fetches; each consumer adapts its own answers into `PlaceRow`.
 */
import type { ReactNode } from 'react'

export type Kind = 'restaurants' | 'cafes' | 'fast-food' | 'bakeries' | 'bars' | 'nightlife'

/** Same order as the plugin's `domain/place-kinds.mjs`. */
export const KINDS: readonly Kind[] = Object.freeze([
  'restaurants',
  'cafes',
  'fast-food',
  'bakeries',
  'bars',
  'nightlife'
])

export type SocialNetwork = 'facebook' | 'instagram' | 'tiktok' | 'youtube'
export const SOCIAL_NETWORKS: readonly SocialNetwork[] = Object.freeze([
  'facebook',
  'instagram',
  'tiktok',
  'youtube'
])

export type ChatApp = 'zalo' | 'whatsapp' | 'messenger' | 'line'

export type SiteCheckStatus = 'queued' | 'done' | 'down' | 'blocked' | 'failed' | 'not_queued'

export interface SiteCheck {
  status: SiteCheckStatus
  /** 0–100 */
  performance?: number | null
  seo?: number | null
  lcpMs?: number | null
  https?: boolean | null
  mobileFriendly?: boolean | null
  cms?: string | null
  cmsVersion?: string | null
  copyrightYear?: number | null
  emails?: string[]
  socials?: Partial<Record<SocialNetwork, string>>
  checkedAt?: string | null
}

/**
 * One social page's numbers. Missing data is `null`, never 0; ages are derived at read time from
 * `lastPostAt` (`daysSince`). `coverage: 'partial'` = `postsPerMonth` counts only the posts the
 * provider returned; `status` is absent while nothing has been asked yet, `queued`/`not_queued` while
 * the server has not fetched it (the auto budget left `not_queued` ones for the row's button).
 */
export interface SocialStat {
  url: string
  followers?: number | null
  posts?: number | null
  /** ISO timestamp of the latest post. */
  lastPostAt?: string | null
  /** Posts in the last 90 days ÷ 3. */
  postsPerMonth?: number | null
  coverage?: 'complete' | 'partial'
  fetchedAt?: string | null
  stale?: boolean
  /** Provider id the server answered with (`facebook/scraper3`, `youtube/official`…). */
  provider?: string | null
  status?: 'ok' | 'queued' | 'not_queued' | 'not_discovered' | 'not_found' | 'error'
  /** ISO; a `queued` page the daily budget put off until then: nothing is fetched before it. */
  deferredUntil?: string | null
}
export type SocialStats = Partial<Record<SocialNetwork, SocialStat>>

export type ScoreReason = [key: string, points: number | null, params?: Record<string, unknown>]
export type Grade = 'A' | 'B' | 'C'
export interface Score {
  score: number
  grade: Grade
  pending: boolean
  reasons: ScoreReason[]
}

export type PlaceStatus = 'new' | 'seen' | 'researched' | 'demo'
export type Provider = 'google-places' | 'google-maps' | 'osm'

export interface PlaceRow {
  /** `${provider}:${providerId}` */
  key: string
  provider: Provider
  providerId: string
  name: string
  branch?: string | null
  address?: string | null
  phone?: string | null
  lat?: number | null
  lon?: number | null
  /** Absent/null when the only "site" is a social page. */
  website?: string | null
  socials?: Partial<Record<SocialNetwork, string | null>> | null
  contacts?: Partial<Record<ChatApp, string | null>> | null
  /** Google primaryTypeDisplayName, e.g. "Vietnamese Restaurant". */
  category?: string | null
  tripadvisor?: { rating: number | null; reviews: number | null; url: string; checkedAt: string } | null
  rating?: number | null
  reviews?: number | null
  mapsUrl?: string | null
  temporarilyClosed?: boolean
  primaryType?: string | null
  kind: Kind | null
  cuisine?: string | null
  distanceM?: number | null
  priceLevel?: 0 | 1 | 2 | 3 | 4 | null
  openNow?: boolean | null
  photo?: { name: string; credit: string | null } | null
  chain: boolean
  chainSuspect: boolean
  status: PlaceStatus
  research?: { researchedAt: string; canBuild: boolean } | null
  findAction?: { kind: 'research' | 'build' | 'view' | 'building'; opportunityId?: string; siteKey?: string }
  siteCheck?: SiteCheck | null
  score: Score
  /** null until the social-stats line lands. */
  social?: SocialStats | null
  /** First of siteCheck.emails, lifted by the adapter. */
  email?: string | null
}

export type SortKey = 'score' | 'web' | 'google' | 'social'
export const SORT_KEYS: readonly SortKey[] = Object.freeze(['score', 'web', 'google', 'social'])
export type ViewMode = 'table' | 'grid' | 'map'
export type ColumnId = 'type' | 'score' | 'web' | 'google' | 'social' | 'contact' | 'status'
/** Every hideable column, in table order. Place and the checkbox always show. */
export const COLUMN_IDS: readonly ColumnId[] = Object.freeze([
  'type',
  'score',
  'web',
  'google',
  'social',
  'contact',
  'status'
])
/** Lee 18/10: Type off by default. */
export const DEFAULT_HIDDEN_COLUMNS: readonly ColumnId[] = Object.freeze(['type'])

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface RowActions {
  onToggle(key: string): void
  onOpen?(row: PlaceRow): void
  onResearch?(row: PlaceRow): void
  onGetSocial?(row: PlaceRow): void
  photoUrl?(row: PlaceRow, width: number): string | null
  /** Called when the photo from `photoUrl` fails to load; return a second URL to try, or null. */
  photoFallbackUrl?(row: PlaceRow, width: number): string | null
}

/** A consumer-owned column (for /ops/wo: Account, Stage, Issue…; My opportunities: Research, Action…). */
export interface ExtraColumn {
  id: string
  header: string
  cell(row: PlaceRow): ReactNode
  width?: string
  /** `start` = right after Place; `end` (default) = after the built-in columns. */
  position?: 'start' | 'end'
  /** Right behind this built-in column (in its place when it is hidden); wins over `position`. */
  after?: ColumnId
  /** Class on its header and cells. */
  className?: string
  /** A sortable header; the consumer owns the order (`dir` null = not the current sort). */
  sort?: { dir: 1 | -1 | null; onSort(): void }
  /** Listed in the narrow layout's card facts (default true); false when the card's footer draws it. */
  inCard?: boolean
}

/** How a consumer's cards differ from Find's (My opportunities: no score, its own footer). */
export interface CardOptions {
  /** The Opportunity score beside the name (default true). */
  score?: boolean
  /** The Website / Google / Social / Contact lines (default true). */
  facts?: boolean
  /** Optional content directly under the place name, before metadata. */
  underName?(row: PlaceRow): ReactNode
  /** Replaces the footer (Status badge and Research button). */
  foot?(row: PlaceRow): ReactNode
  /** A line under Website, the table's Demo column in card form (My opportunities). */
  demo?: { label: string; cell(row: PlaceRow): ReactNode }
}

/** A pin's own label and colour on the map, in place of its grade (`tone` reuses the grade colours). */
export interface MapPin {
  label: string
  tone: Grade | null
  /** The marker's accessible name. */
  title: string
}
