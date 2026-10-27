/**
 * The tab's navigation and the Find step's picks, as one pure reducer.
 *
 * Views: My opportunities (`list`, where the tab opens) → Find → one opportunity (`detail`) → one of
 * its site briefs (`revision`). `back` walks that chain up; jobs and builds live on the server, not here.
 * The Find results' sort, kind tab, view, columns and site checks live here too.
 */
import { freshestPostAt } from '@tracy/wo-views/model'
import { SOCIAL_NETWORKS } from '@tracy/wo-views/model'
import type {
  ColumnId,
  Kind,
  PlaceRow,
  SiteCheck,
  SocialNetwork,
  SocialStat,
  SortKey,
  ViewMode
} from '@tracy/wo-views'
import { scoreOpportunity } from 'website-opportunities/domain/opportunity-score.mjs'
import { withSiteSocials } from 'website-opportunities/domain/site-socials.mjs'

export type { PlaceRow } from '@tracy/wo-views'

export type MapProvider = 'google-places' | 'google-maps' | 'osm'

export type View =
  | { name: 'list' }
  | { name: 'find' }
  | { name: 'detail'; id: string }
  | { name: 'revision'; id: string; revisionId: string }

export interface Search {
  phase: 'idle' | 'searching' | 'done' | 'failed'
  code?: string
  candidates: PlaceRow[]
  /** Which map answered; `fellBack` when the first choice failed and another answered instead. */
  provider?: MapProvider | null
  fellBack?: boolean
  /** Chains the server left out (Advanced › Include chains brings them back). */
  hiddenChains?: number
  pages?: number | null
  center?: { lat: number; lon: number } | null
  /** Rows preselected from a `/find` hand-over (`public-pick.ts`); absent otherwise. */
  preselected?: number
}

export interface Results {
  sort: SortKey
  dir: 1 | -1
  kind: Kind | null
  view: ViewMode
  hidden: ReadonlySet<ColumnId>
  /** Every site check heard so far, by the website URL the row carries. */
  checks: Readonly<Record<string, SiteCheck>>
}

export interface Flow {
  view: View
  search: Search
  /** `candidateKey` of each pick, in the order picked. */
  selected: string[]
  results: Results
}

export type FlowAction =
  | { type: 'open'; view: View }
  | { type: 'back' }
  | { type: 'search-start' }
  | ({ type: 'search-done'; candidates: PlaceRow[] } & Partial<Omit<Search, 'phase' | 'code' | 'candidates'>>)
  | { type: 'research-refreshed'; candidates: PlaceRow[] }
  /** The public Find: shared research published for these place ids (`public-research.ts`). */
  | {
      type: 'public-researched'
      places: Readonly<Record<string, { researchedAt: string; canBuild: boolean }>>
    }
  | { type: 'search-failed'; code: string }
  /** `max`: the most picks this view allows (the public Find's 10); adding past it does nothing. */
  | { type: 'toggle'; key: string; max?: number }
  | { type: 'clear-selection' }
  | { type: 'preselect'; providerIds: readonly string[] }
  | { type: 'add-found'; candidates: PlaceRow[] }
  | { type: 'sent' }
  | { type: 'results-sort'; key: SortKey }
  | { type: 'results-kind'; kind: Kind | null }
  | { type: 'results-view'; view: ViewMode }
  | { type: 'results-column'; column: ColumnId }
  | { type: 'checks-merged'; checks: Readonly<Record<string, SiteCheck>> }
  | { type: 'social-merged'; stats: Readonly<Record<string, unknown>> }

/** Provider and its id: two branches with one name are two candidates. */
export function candidateKey(candidate: Pick<PlaceRow, 'provider' | 'providerId'>): string {
  return `${candidate.provider}:${candidate.providerId}`
}

/** Type is off by default (Lee 18/10); `hidden` is the device's remembered choice when there is one. */
export function initialFlow(hidden: readonly ColumnId[] = ['type']): Flow {
  return {
    view: { name: 'list' },
    search: { phase: 'idle', candidates: [] },
    selected: [],
    results: { sort: 'score', dir: -1, kind: null, view: 'table', hidden: new Set(hidden), checks: {} }
  }
}

const firstEmail = (check: SiteCheck | null | undefined): string | null =>
  check?.emails?.find((e) => typeof e === 'string' && e !== '') ?? null

/** The freshest post across the row's social pages, which is what the marketing part scores. */
function socialForScore(row: PlaceRow): { lastPostAt: string } | null {
  const lastPostAt = freshestPostAt(row)
  return lastPostAt ? { lastPostAt } : null
}

function rescore(row: PlaceRow): PlaceRow {
  return {
    ...row,
    score: scoreOpportunity({
      candidate: row,
      siteCheck: row.siteCheck ?? null,
      social: socialForScore(row),
      status: row.status
    })
  }
}

/**
 * Pure: each row whose website has a new check takes it, its first email, the social pages the
 * check found on the site (a network the row already has is kept), and a new score.
 */
export function mergeChecks(rows: PlaceRow[], checks: Readonly<Record<string, SiteCheck>>): PlaceRow[] {
  let changed = false
  const next = rows.map((row) => {
    const check = row.website ? checks[row.website] : undefined
    if (check === undefined || sameCheck(row.siteCheck, check)) return row
    changed = true
    const socials = withSiteSocials(row.socials, check)
    return rescore({ ...row, siteCheck: check, email: row.email ?? firstEmail(check), socials })
  })
  return changed ? next : rows
}

function sameCheck(a: SiteCheck | null | undefined, b: SiteCheck): boolean {
  return a !== null && a !== undefined && JSON.stringify(a) === JSON.stringify(b)
}

/** `POST /social-stats`' per-URL status in the views' vocabulary (`SocialStat.status`). */
const SOCIAL_STATUS: Readonly<Record<string, NonNullable<SocialStat['status']>>> = {
  queued: 'queued',
  not_queued: 'not_queued',
  done: 'ok',
  ok: 'ok',
  not_found: 'not_found',
  not_discovered: 'not_discovered',
  failed: 'error',
  error: 'error'
}

const nullableNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== ''

/** One page's server answer as a `SocialStat`; fields it did not send (or sent unusable) stay absent. */
export function toSocialStat(url: string, raw: unknown): SocialStat | null {
  if (!isRecord(raw)) return null
  const status = typeof raw.status === 'string' ? SOCIAL_STATUS[raw.status] : undefined
  if (status === undefined) return null
  const stat: SocialStat = { url, status }
  if (nullableNumber(raw.followers)) stat.followers = raw.followers
  if (nullableNumber(raw.posts)) stat.posts = raw.posts
  if (nonEmpty(raw.lastPostAt) && Number.isFinite(Date.parse(raw.lastPostAt)))
    stat.lastPostAt = raw.lastPostAt
  if (nullableNumber(raw.postsPerMonth)) stat.postsPerMonth = raw.postsPerMonth
  if (raw.coverage === 'complete' || raw.coverage === 'partial') stat.coverage = raw.coverage
  if (nonEmpty(raw.fetchedAt)) stat.fetchedAt = raw.fetchedAt
  if (typeof raw.stale === 'boolean') stat.stale = raw.stale
  if (nonEmpty(raw.provider)) stat.provider = raw.provider
  if (status === 'queued' && nonEmpty(raw.deferredUntil) && Number.isFinite(Date.parse(raw.deferredUntil)))
    stat.deferredUntil = raw.deferredUntil
  return stat
}

/** A refresh that is still queued, or failed, keeps the numbers already on screen under its new status. */
function keepShownNumbers(shown: SocialStat | undefined, answered: SocialStat): SocialStat {
  const waiting =
    answered.status === 'queued' || answered.status === 'not_queued' || answered.status === 'error'
  if (!waiting || shown === undefined || shown.url !== answered.url) return answered
  const { deferredUntil: _was, ...numbers } = shown
  return answered.deferredUntil
    ? { ...numbers, status: answered.status, deferredUntil: answered.deferredUntil }
    : { ...numbers, status: answered.status }
}

/**
 * Pure: each row's social pages take the stats answered for their URL (`stats` is keyed by page URL,
 * as `/social-stats` answers) and the row is re-scored; rows nothing changed for are kept as they are.
 */
export function mergeSocialStats(rows: PlaceRow[], stats: Readonly<Record<string, unknown>>): PlaceRow[] {
  let changed = false
  const next = rows.map((row) => {
    let social: Partial<Record<SocialNetwork, SocialStat>> | null = null
    for (const network of SOCIAL_NETWORKS) {
      const url = row.socials?.[network]
      const answered = url ? toSocialStat(url, stats[url]) : null
      const stat = answered === null ? null : keepShownNumbers(row.social?.[network], answered)
      if (stat === null || JSON.stringify(row.social?.[network]) === JSON.stringify(stat)) continue
      social = { ...(social ?? row.social), [network]: stat }
    }
    if (social === null) return row
    changed = true
    return rescore({ ...row, social })
  })
  return changed ? next : rows
}

/** A row's stats as `/search` sent them (server vocabulary), in the views' vocabulary; unusable ones are dropped. */
function withViewSocial(row: PlaceRow): PlaceRow {
  if (!row.social) return row
  const social: Partial<Record<SocialNetwork, SocialStat>> = {}
  for (const network of SOCIAL_NETWORKS) {
    const raw: unknown = row.social[network]
    const url = row.socials?.[network] ?? (isRecord(raw) && nonEmpty(raw.url) ? raw.url : null)
    const stat = url ? toSocialStat(url, raw) : null
    if (stat) social[network] = stat
  }
  return { ...row, social }
}

function parent(view: View): View {
  if (view.name === 'revision') return { name: 'detail', id: view.id }
  return { name: 'list' }
}

export function flowReducer(state: Flow, action: FlowAction): Flow {
  switch (action.type) {
    case 'open':
      return { ...state, view: action.view }
    case 'back':
      return { ...state, view: parent(state.view) }
    case 'search-start':
      return {
        ...state,
        search: { phase: 'searching', candidates: [] },
        selected: [],
        results: { ...state.results, kind: null, checks: {} }
      }
    case 'search-done': {
      const { type: _type, candidates, ...rest } = action
      return {
        ...state,
        search: {
          ...rest,
          phase: 'done',
          candidates: candidates.map(withViewSocial),
          provider: action.provider ?? null,
          fellBack: action.fellBack === true
        },
        selected: []
      }
    }
    case 'research-refreshed':
      return { ...state, search: { ...state.search, candidates: action.candidates.map(withViewSocial) } }
    case 'public-researched': {
      const candidates = state.search.candidates.map((row) => {
        const research = action.places[row.providerId]
        return research ? { ...row, status: 'researched' as const, research } : row
      })
      return { ...state, search: { ...state.search, candidates } }
    }
    case 'search-failed':
      return { ...state, search: { phase: 'failed', code: action.code, candidates: [] }, selected: [] }
    case 'toggle': {
      if (!state.search.candidates.some((c) => c.key === action.key)) return state
      const picked = state.selected.includes(action.key)
      if (!picked && action.max !== undefined && state.selected.length >= action.max) return state
      const selected = picked
        ? state.selected.filter((key) => key !== action.key)
        : [...state.selected, action.key]
      return { ...state, selected }
    }
    case 'clear-selection':
      return state.selected.length === 0 ? state : { ...state, selected: [] }
    case 'add-found': {
      if (state.search.phase !== 'done') return state
      const known = new Set(state.search.candidates.map((c) => c.key))
      const added = action.candidates.map(withViewSocial).filter((c) => !known.has(c.key))
      return added.length === 0
        ? state
        : { ...state, search: { ...state.search, candidates: [...state.search.candidates, ...added] } }
    }
    case 'preselect': {
      const byId = new Map(state.search.candidates.map((c) => [c.providerId, c.key]))
      const selected = [...new Set(action.providerIds.flatMap((id) => byId.get(id) ?? []))]
      return { ...state, selected, search: { ...state.search, preselected: selected.length } }
    }
    case 'sent':
      return { ...state, selected: [], view: { name: 'list' } }
    case 'results-sort': {
      const { sort, dir } = state.results
      const next =
        sort === action.key
          ? { sort, dir: (dir === 1 ? -1 : 1) as 1 | -1 }
          : { sort: action.key, dir: -1 as const }
      return { ...state, results: { ...state.results, ...next } }
    }
    case 'results-kind':
      return { ...state, results: { ...state.results, kind: action.kind } }
    case 'results-view':
      return { ...state, results: { ...state.results, view: action.view } }
    case 'results-column': {
      const hidden = new Set(state.results.hidden)
      if (hidden.has(action.column)) hidden.delete(action.column)
      else hidden.add(action.column)
      return { ...state, results: { ...state.results, hidden } }
    }
    case 'checks-merged': {
      const candidates = mergeChecks(state.search.candidates, action.checks)
      return {
        ...state,
        search: candidates === state.search.candidates ? state.search : { ...state.search, candidates },
        results: { ...state.results, checks: { ...state.results.checks, ...action.checks } }
      }
    }
    case 'social-merged': {
      const candidates = mergeSocialStats(state.search.candidates, action.stats)
      return candidates === state.search.candidates
        ? state
        : { ...state, search: { ...state.search, candidates } }
    }
  }
}

export function selectedCandidates(state: Flow): PlaceRow[] {
  const byKey = new Map(state.search.candidates.map((c) => [c.key, c]))
  return state.selected.flatMap((key) => {
    const candidate = byKey.get(key)
    return candidate === undefined ? [] : [candidate]
  })
}

const PROVIDERS: readonly MapProvider[] = ['google-places', 'google-maps', 'osm']
const isProvider = (v: unknown): v is MapProvider => PROVIDERS.some((p) => p === v)

export interface SearchAnswer {
  candidates: PlaceRow[]
  provider: MapProvider | null
  fellBack: boolean
  hiddenChains: number
  pages: number | null
  center: { lat: number; lon: number } | null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const finiteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A server candidate as a row: its key, the first email lifted, and safe defaults for fields an older server leaves out. */
function toRow(raw: Record<string, unknown>, provider: MapProvider | null): PlaceRow {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the server sends PlaceRow-without-key (contract §3); the name and id are checked by the caller and every other field the views read is defaulted below.
  const c = raw as unknown as Omit<PlaceRow, 'key'> & { provider?: MapProvider }
  const row: PlaceRow = {
    ...c,
    provider: c.provider ?? provider ?? 'osm',
    key: '',
    kind: c.kind ?? null,
    chain: c.chain === true,
    chainSuspect: c.chainSuspect === true,
    status: c.status ?? 'new',
    email: c.email ?? firstEmail(c.siteCheck)
  }
  row.key = candidateKey(row)
  return isRecord(c.score) ? row : rescore(row)
}

/** `POST /search`'s answer (contract §3): the usable rows, which map they came from, and the extras the header shows. */
export function searchAnswer(body: unknown): SearchAnswer {
  const answer = isRecord(body) ? body : {}
  const provider = isProvider(answer.provider) ? answer.provider : null
  const list = Array.isArray(answer.candidates) ? answer.candidates : []
  const center =
    isRecord(answer.center) && finiteNumber(answer.center.lat) && finiteNumber(answer.center.lon)
      ? { lat: answer.center.lat, lon: answer.center.lon }
      : null
  return {
    candidates: list
      .filter(
        (c): c is Record<string, unknown> =>
          isRecord(c) && typeof c.providerId === 'string' && typeof c.name === 'string'
      )
      .map((c) => toRow(c, provider)),
    provider,
    fellBack: provider !== null && answer.fallbackFrom !== undefined && answer.fallbackFrom !== null,
    hiddenChains: finiteNumber(answer.hiddenChains) ? answer.hiddenChains : 0,
    pages: finiteNumber(answer.pages) ? answer.pages : null,
    center
  }
}

/** Rows with a website whose check has finished, of all rows with a website; null when none has one. */
export function checkProgress(flow: Flow): { done: number; total: number } | null {
  const withSite = flow.search.candidates.filter((c) => c.website)
  if (withSite.length === 0) return null
  const done = withSite.filter(
    (c) => c.siteCheck && c.siteCheck.status !== 'queued' && c.siteCheck.status !== 'not_queued'
  ).length
  return { done, total: withSite.length }
}

/** Websites still waiting for a check (none, queued or not queued yet), in the order given. */
export function uncheckedWebsites(rows: readonly PlaceRow[]): string[] {
  const urls = rows.flatMap((r) =>
    r.website && (!r.siteCheck || r.siteCheck.status === 'queued' || r.siteCheck.status === 'not_queued')
      ? [r.website]
      : []
  )
  return [...new Set(urls)]
}

/** One social page to ask `/social-stats` about. */
export interface SocialHandle {
  network: SocialNetwork
  url: string
}

/** Every page the row links, in network order (at most four: the `force` budget of one row). */
export function rowHandles(row: PlaceRow): SocialHandle[] {
  return SOCIAL_NETWORKS.flatMap((network) => {
    const url = row.socials?.[network]
    return url ? [{ network, url }] : []
  })
}

/**
 * Pages the poll still asks about: none heard yet, or queued. `not_queued` pages wait for the row's
 * button (the server's auto budget is spent); pages the daily budget put off wait for their date.
 * In the order given (score order), each URL once.
 */
export function socialToAsk(rows: readonly PlaceRow[], now = Date.now()): SocialHandle[] {
  const seen = new Set<string>()
  return rows.flatMap((row) =>
    rowHandles(row).filter(({ network, url }) => {
      const stat = row.social?.[network]
      const status = stat?.status
      const deferred = stat?.deferredUntil ? Date.parse(stat.deferredUntil) > now : false
      if (seen.has(url) || deferred || (status !== undefined && status !== 'queued')) return false
      seen.add(url)
      return true
    })
  )
}

/** `/social-stats`' stats, with every page that was asked and left out of the answer as `not_queued`. */
export function socialAnswer(sent: readonly SocialHandle[], body: unknown): Record<string, unknown> {
  const stats = isRecord(body) && isRecord(body.stats) ? body.stats : {}
  const out: Record<string, unknown> = {}
  for (const { url } of sent) out[url] = { status: 'not_queued' }
  return { ...out, ...stats }
}

/** Linked pages whose stats are settled (anything but none/queued/not queued), of all linked pages; null when no row links one. */
export function socialProgress(flow: Flow): { done: number; total: number; queued: number } | null {
  const stats = flow.search.candidates.flatMap((row) =>
    rowHandles(row).map(({ network }) => row.social?.[network]?.status)
  )
  if (stats.length === 0) return null
  const queued = stats.filter((s) => s === 'queued').length
  const done = stats.filter((s) => s !== undefined && s !== 'queued' && s !== 'not_queued').length
  return { done, total: stats.length, queued }
}

/** `/capabilities`' `socialStats`: offered when at least one provider is usable. */
export function socialStatsOffered(
  capabilities: { socialStats?: { providers?: unknown } } | null | undefined
): boolean {
  const providers = capabilities?.socialStats?.providers
  return isRecord(providers) && Object.values(providers).some((on) => on === true)
}
