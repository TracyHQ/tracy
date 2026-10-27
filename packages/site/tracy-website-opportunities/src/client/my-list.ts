/**
 * My opportunities' list without the screen: one page answer, the query of each filter, which rows the
 * poll asks about, how polled and new rows join the ones on screen without moving them, the jobs of a
 * bulk press, the old-server fallback, and a saved opportunity as the row `@tracy/wo-views` draws.
 *
 * The list is newest first and never re-sorted on screen (council 19/10): a row whose stage changes
 * keeps its place and only changes its label; the filter is applied again when the person presses it.
 */
import type {
  Kind,
  PlaceRow,
  PlaceStatus,
  Provider,
  Score,
  SiteCheck,
  SocialNetwork,
  SocialStat
} from '@tracy/wo-views'
import { KINDS, SOCIAL_NETWORKS, freshestPostAt } from '@tracy/wo-views/model'

import { scoreOpportunity } from 'website-opportunities/domain/opportunity-score.mjs'
import { toSocialStat } from './flow.ts'

import type { FilterValue, SubTab } from './my-address.ts'
import { type OpportunityListRow, STAGES, needsAttention, stageOf } from './opportunity-row.ts'

export type Counts = Record<'all' | 'research' | 'demo' | 'outreach' | 'cancelled' | 'attention', number>

/** The account's counts as the tab keeps them (`tab.tsx`), shared by the sub-tab and the stage bar. */
export interface AccountCounts {
  /** Counts over every opportunity of the account (no search); null until first answered. */
  counts: Counts | null
  /** The server answered the old whole list: no paging, no bulk "select all matching". */
  legacy: boolean
  refresh: () => Promise<void>
}

export interface PageAnswer {
  rows: OpportunityListRow[]
  /** False for an old server (no `counts`/`nextCursor`): every row came at once, unfiltered. */
  paged: boolean
  counts: Counts | null
  nextCursor: string | null
  /** Rows matching the filter and search, across every page. */
  total: number | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0)
const COUNT_KEYS = ['all', ...STAGES, 'attention'] as const

function countsFrom(read: (key: (typeof COUNT_KEYS)[number]) => number): Counts {
  return {
    all: read('all'),
    research: read('research'),
    outreach: read('outreach'),
    demo: read('demo'),
    cancelled: read('cancelled'),
    attention: read('attention')
  }
}

function countsOf(raw: unknown): Counts | null {
  return isRecord(raw) ? countsFrom((k) => count(raw[k])) : null
}

const isRow = (v: unknown): v is OpportunityListRow => isRecord(v) && typeof v.id === 'string' && v.id !== ''

export function pageAnswer(body: unknown): PageAnswer | null {
  if (!isRecord(body) || !Array.isArray(body.opportunities)) return null
  const paged = 'counts' in body || 'nextCursor' in body
  return {
    rows: body.opportunities.filter(isRow),
    paged,
    counts: countsOf(body.counts),
    nextCursor: typeof body.nextCursor === 'string' && body.nextCursor !== '' ? body.nextCursor : null,
    total: typeof body.total === 'number' && Number.isInteger(body.total) ? body.total : null
  }
}

/** The list door's query for a filter, a search and the next page. */
export function listParams({
  filter,
  q,
  cursor,
  limit
}: {
  filter: FilterValue
  q: string
  cursor?: string | null
  limit: number
}): string {
  const params = new URLSearchParams()
  if (filter === 'attention') params.set('attention', '1')
  else if (filter !== 'all') params.set('stage', filter)
  const query = q.trim()
  if (query !== '') params.set('q', query)
  if (cursor) params.set('cursor', cursor)
  params.set('limit', String(limit))
  return params.toString()
}

/** The bulk door's `filter` for "Select all N matching this filter". */
export function bulkFilter(
  filter: FilterValue,
  q: string
): { stage?: string; attention?: boolean; q?: string } {
  const out: { stage?: string; attention?: boolean; q?: string } = {}
  if (filter === 'attention') out.attention = true
  else if (filter !== 'all') out.stage = filter
  if (q.trim() !== '') out.q = q.trim()
  return out
}

const RESEARCH_MOVING = new Set(['queued', 'running'])
const BUILD_STOPPED = new Set(['failed', 'cancelled', 'blocked', 'refused', 'completed', 'done'])

function buildMoving(build: OpportunityListRow['latestBuild']): boolean {
  if (!build || typeof build.id !== 'string') return false
  return build.done !== true && !BUILD_STOPPED.has(build.state ?? '')
}

/** Rows whose research or demo site is still moving: the only ones the poll asks about. */
export function movingIds(rows: readonly OpportunityListRow[]): string[] {
  return rows
    .filter(
      (r) =>
        RESEARCH_MOVING.has(r.job?.state ?? '') ||
        r.demoAction?.state === 'queued' ||
        ['pending', 'retry'].includes(r.latestBuild?.qa ?? r.demo?.qa ?? '') ||
        buildMoving(r.latestBuild)
    )
    .map((r) => r.id)
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Polled rows replace theirs in place; a row the poll did not answer, or that is not shown, is left alone. */
export function mergePolled(
  rows: OpportunityListRow[],
  polled: readonly OpportunityListRow[]
): OpportunityListRow[] {
  if (polled.length === 0) return rows
  const byId = new Map(polled.map((r) => [r.id, r]))
  let changed = false
  const next = rows.map((r) => {
    const fresh = byId.get(r.id)
    if (fresh === undefined) return r
    changed = true
    return fresh
  })
  return changed ? next : rows
}

/** A fresh first page joins the rows on screen: rows not shown yet go on top, shown ones are refreshed. */
export function prependNew(
  rows: OpportunityListRow[],
  firstPage: readonly OpportunityListRow[]
): OpportunityListRow[] {
  const shown = new Set(rows.map((r) => r.id))
  const added = firstPage.filter((r) => !shown.has(r.id))
  const refreshed = mergePolled(
    rows,
    firstPage.filter((r) => shown.has(r.id))
  )
  return added.length === 0 ? refreshed : [...added, ...refreshed]
}

function matches(row: OpportunityListRow, filter: FilterValue): boolean {
  if (filter === 'all') return true
  if (filter === 'attention') return needsAttention(row)
  return stageOf(row) === filter && !needsAttention(row)
}

function matchesQuery(row: OpportunityListRow, q: string): boolean {
  const query = q.trim().toLowerCase()
  if (query === '') return true
  const address =
    isRecord(row.candidate) && typeof row.candidate.address === 'string' ? row.candidate.address : ''
  return [row.name ?? '', row.branch ?? '', address].some((text) => text.toLowerCase().includes(query))
}

/** An old server's whole list, filtered, searched and counted here the way the new server does. */
export function legacyView(
  rows: readonly OpportunityListRow[],
  filter: FilterValue,
  q: string
): { rows: OpportunityListRow[]; counts: Counts } {
  const searched = rows.filter((r) => matchesQuery(r, q))
  const counts = countsFrom((k) => searched.filter((r) => matches(r, k)).length)
  return { rows: searched.filter((r) => matches(r, filter)), counts }
}

const RESUMABLE = new Set(['paused', 'blocked', 'failed', 'cancelled'])
const CANCELLABLE = new Set(['queued', 'running', 'paused', 'blocked'])

/** The job ids a bulk Resume and a bulk Cancel act on, from the picked rows. */
export function selectionJobs(
  rows: readonly OpportunityListRow[],
  picked: ReadonlySet<string>
): { resume: string[]; cancel: string[] } {
  const resume: string[] = []
  const cancel: string[] = []
  for (const r of rows) {
    const id = r.job?.id
    if (!picked.has(r.id) || typeof id !== 'string' || id === '') continue
    const state = r.job?.state ?? ''
    if (RESUMABLE.has(state)) resume.push(id)
    if (CANCELLABLE.has(state)) cancel.push(id)
  }
  return { resume, cancel }
}

/** Drops late answers: each question takes a token, and only the newest token's answer is used. */
export function createLatest(): { next(): number; isCurrent(token: number): boolean } {
  let latest = 0
  return {
    next: () => ++latest,
    isCurrent: (token) => token === latest
  }
}

/** The sub-tab to open: the address's, else My opportunities when the account has any; null = not known yet. */
export function startingSubTab(asked: SubTab | null, accountTotal: number | null): SubTab | null {
  if (asked !== null) return asked
  if (accountTotal === null) return null
  return accountTotal > 0 ? 'mine' : 'find'
}

const PROVIDERS: readonly Provider[] = ['google-places', 'google-maps', 'osm']
const PRICES: readonly NonNullable<PlaceRow['priceLevel']>[] = [0, 1, 2, 3, 4]
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const isProvider = (v: unknown): v is Provider => PROVIDERS.some((p) => p === v)
const isKind = (v: unknown): v is Kind => KINDS.some((k) => k === v)
const isPrice = (v: unknown): v is NonNullable<PlaceRow['priceLevel']> => PRICES.some((p) => p === v)

function textRecord(v: unknown): Record<string, string | null> | null {
  if (!isRecord(v)) return null
  return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, str(value)]))
}

function photoOf(v: unknown): PlaceRow['photo'] {
  if (!isRecord(v)) return null
  const name = str(v.name)
  return name === null ? null : { name, credit: str(v.credit) }
}

const GRADES: readonly string[] = ['A', 'B', 'C']

/** A score as the server's scorer answers it, or null. */
function scoreOf(v: unknown): Score | null {
  if (!isRecord(v) || !finite(v.score) || !GRADES.includes(String(v.grade)) || !Array.isArray(v.reasons))
    return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: score, grade and reasons were checked just above; `reasons` entries are drawn as the scorer wrote them.
  return {
    score: v.score,
    grade: v.grade as Score['grade'],
    pending: v.pending === true,
    reasons: v.reasons as Score['reasons']
  }
}

function siteCheckOf(v: unknown): SiteCheck | null {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the server's `checkShape`; the cells read every field optionally and the status was checked.
  return isRecord(v) && typeof v.status === 'string' ? (v as unknown as SiteCheck) : null
}

/** The server's per-network stats (its vocabulary) in the views' vocabulary, keyed by the row's page URLs. */
function socialOf(
  raw: unknown,
  socials: Record<string, string | null> | null
): Partial<Record<SocialNetwork, SocialStat>> | null {
  if (!isRecord(raw)) return null
  const out: Partial<Record<SocialNetwork, SocialStat>> = {}
  for (const network of SOCIAL_NETWORKS) {
    const stat = raw[network]
    const url = socials?.[network] ?? (isRecord(stat) && typeof stat.url === 'string' ? stat.url : null)
    const view = url ? toSocialStat(url, stat) : null
    if (view) out[network] = view
  }
  return Object.keys(out).length > 0 ? out : null
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

const STATUS_OF: Readonly<Record<string, PlaceStatus>> = {
  research: 'new',
  cancelled: 'new',
  demo: 'researched',
  outreach: 'demo'
}

/**
 * The saved candidate as the row the shared table, grid and map draw, keyed by the opportunity id,
 * with the score, site check and social stats the server read for it. Facts that were only true when
 * it was searched (open now) are left out.
 */
export function toPlaceRow(row: OpportunityListRow): PlaceRow {
  const c = isRecord(row.candidate) ? row.candidate : {}
  const socials = textRecord(row.socials) ?? textRecord(c.socials)
  const place: PlaceRow = {
    key: row.id,
    provider: isProvider(c.provider) ? c.provider : 'osm',
    providerId: str(c.providerId) ?? row.id,
    name: row.name ?? str(c.name) ?? '',
    branch: row.branch ?? str(c.branch),
    address: str(c.address),
    phone: str(c.phone),
    lat: num(c.lat),
    lon: num(c.lon),
    website: str(c.website),
    socials,
    contacts: textRecord(c.contacts),
    category: str(c.category),
    rating: num(c.rating),
    reviews: num(c.reviews),
    mapsUrl: str(c.mapsUrl),
    primaryType: str(c.primaryType),
    kind: isKind(c.kind) ? c.kind : null,
    cuisine: str(c.cuisine),
    distanceM: num(c.distanceM),
    priceLevel: isPrice(c.priceLevel) ? c.priceLevel : null,
    openNow: null,
    photo: photoOf(c.photo),
    chain: c.chain === true,
    chainSuspect: false,
    status: STATUS_OF[stageOf(row)] ?? 'new',
    siteCheck: siteCheckOf(row.siteCheck),
    social: socialOf(row.social, socials),
    score: { score: 0, grade: 'C', pending: true, reasons: [] }
  }
  // An older server sends no score: computed here from the saved candidate, as Find does for its rows.
  const lastPostAt = freshestPostAt(place)
  place.score =
    scoreOf(row.score) ??
    scoreOpportunity({
      candidate: place,
      siteCheck: place.siteCheck ?? null,
      social: lastPostAt ? { lastPostAt } : null,
      status: place.status
    })
  return place
}

const STEP: Readonly<Record<string, string>> = { research: '1', demo: '2', outreach: '3', cancelled: '–' }

/** A row's map pin: its step number, `!` when it waits for the customer; colours reuse the grade pins'. */
export function stagePin(row: OpportunityListRow): { label: string; tone: 'A' | 'B' | 'C' } {
  if (needsAttention(row)) return { label: '!', tone: 'A' }
  const stage = stageOf(row)
  return {
    label: STEP[stage] ?? '',
    tone: stage === 'research' && ['queued', 'running'].includes(row.job?.state ?? '') ? 'B' : 'C'
  }
}
