/**
 * User Data Analytics › Usage's doors (`apps/tracy-web/src/ops/usage.js`): what customers' chat requests and the Add
 * site form did, by CMS, and a sample of turns with the words for the named readers. Codes and values
 * only; `./strings.ts` words them.
 */
import type { Answer } from './api'

/** `a` of `b`; `rate` and its 95% interval only once `b` reaches the door's floor (20). */
export interface Rate {
  a: number
  b: number
  rate: number | null
  low: number | null
  high: number | null
}

/** Seconds (or counts); the median needs 20 values, the 90th percentile 100 — null below. */
export interface Quantiles {
  n: number
  p50: number | null
  p90: number | null
}

export type Platform = 'wordpress' | 'joomla' | 'emdash' | 'unknown' | 'all'

export interface TokenCoverage {
  measuredRequests: number
  requests: number
  partialRequests: number
}

export interface TokenFigures extends TokenCoverage {
  total: number | null
  perRequest: { n: number; median: number | null; p90: number | null }
}

export interface TurnFigures {
  turns: number
  tokens?: TokenFigures
  endings: Record<
    | 'completed'
    | 'max-tokens'
    | 'error'
    | 'aborted'
    | 'blocked'
    | 'interrupted'
    | 'running'
    | 'stale'
    | 'unknown',
    number
  >
  changes: Record<
    | 'changed'
    | 'added'
    | 'text'
    | 'image'
    | 'look'
    | 'delete'
    | 'files'
    | 'other'
    | 'outcomeUnknown'
    | 'unchangedCut'
    | 'unchangedCompleted'
    | 'unchangedCompletedRefused'
    | 'unchangedNotCompleted',
    number
  >
  time: { turn: Quantiles; firstWrite: Quantiles }
  work: { known: number; steps: Quantiles; calls: Quantiles; withFailedCalls: Rate }
  visual: Record<'changed' | 'shown' | 'not_shown' | 'broken' | 'cannot_tell' | 'skipped' | 'unknown', number>
  feedback: { coverage: Rate; positive: number; negative: number; bad: Rate }
  undo: { within24h: Rate; fromChat: number; fromSiteChanges: number }
  followUp: Rate
  rework: Rate
}

export interface FunnelFigures {
  created: number
  built: { done: number; failed: number; pending: number }
  ready: Quantiles
  warm: number
  readyUnknown?: number
  customize: { none: number; applied: number; failed: number; inProgress: number }
  entered: Rate
  firstRequestWithin24h: Rate
  returnedAnotherDay: Rate
}

export interface UsageDay {
  day: string
  tokens?: number | null
  tokenCoverage?: TokenCoverage
  requests: number
  changed: number
  negative: number
  undone: number
}

export interface UsageCustomer {
  email: string
  tokens?: number | null
  tokenCoverage?: TokenCoverage
  tokensPerRequest?: TokenFigures['perRequest']
  sitesChanged?: number
  requests: number
  changed: number
  good: number
  bad: number
  undone: number
  followUps: number
  reworks: number
  siteCount: number
  platforms: string[]
  lastRequestAt: string | null
}

export interface UsageFilters {
  days: string
  start: string
  end: string
  cms: Platform
  audience: 'customers' | 'staff' | 'all'
  demo: 'exclude' | 'include' | 'only'
  compare: boolean
}

export interface Usage {
  readAt: string
  days: number
  since: string
  rules: { minForRate: number; minForP90: number }
  platforms: Platform[]
  turns: Record<Platform, TurnFigures>
  siteUndos: { restores: number; rowReverts: number }
  funnel: {
    wizard: {
      opened: number
      reachedCreate: number
      pending: number
      leftBeforeCreate: number
      reachedCreateRate: Rate
    }
    byPlatform: Record<Platform, FunnelFigures>
  }
  range?: {
    start: string | null
    end: string
    previousStart: string | null
    previousEnd: string | null
    timeZone: string
    partialEnd: boolean
    bucket?: 'hour' | 'day'
    preset?: string
    startAt?: string | null
    endAt?: string
  }
  filters?: { cms: Platform; audience: string; demo: string }
  previous?: {
    turns: Record<Platform, TurnFigures>
    funnel: Usage['funnel']
    siteUndos: Usage['siteUndos']
  } | null
  daily?: UsageDay[] | null
  previousDaily?: UsageDay[]
  customers?: UsageCustomer[] | null
  tokenCustomers?: UsageCustomer[]
  research?: ResearchUsage
  limitations?: {
    unknownRequestClassification?: number
    unknownSiteClassification?: number
    excludedLegacyTimings?: number
    messages?: string[]
  }
  canReadText: boolean
}

export type SampleGroup = 'bad' | 'good' | 'unrated' | 'undone' | 'failed' | 'not-shown'

export interface SampleTurn {
  turnId: string
  siteKey: string
  platform: string
  source: string
  request: string
  reply: string | null
  openedAt: string | null
  seconds: number | null
  ending: string
  changed: string[]
  steps: number | null
  calls: number | null
  failedCalls: number | null
  visual: string | null
  visualNote: string | null
  rating: 'positive' | 'negative' | null
  undone: boolean
}

export interface Sample {
  group: SampleGroup
  days: number
  turns: SampleTurn[]
}

async function read<T>(path: string, signal?: AbortSignal): Promise<Answer<T>> {
  try {
    const response = await fetch(path, {
      signal,
      headers: { accept: 'application/json' },
      redirect: 'manual'
    })
    if (!response.ok) {
      return {
        ok: false,
        status: String(response.status || 'redirect')
      }
    }
    return { ok: true, body: (await response.json()) as T }
  } catch (e) {
    return { ok: false, status: e instanceof Error ? e.message : String(e) }
  }
}

export const usageQuery = (filters: UsageFilters) => {
  const params = new URLSearchParams()
  if (filters.days === 'custom') {
    params.set('start', filters.start)
    params.set('end', filters.end)
  } else params.set('days', filters.days)
  params.set('cms', filters.cms)
  params.set('audience', filters.audience)
  params.set('demo', filters.demo)
  params.set('compare', filters.compare ? '1' : '0')
  return params.toString()
}

export const fetchUsage = (filters: UsageFilters, signal?: AbortSignal) =>
  read<Usage>(`/api/ops/usage?${usageQuery(filters)}`, signal)

export const fetchSample = (filters: UsageFilters, group: SampleGroup, signal?: AbortSignal) =>
  read<Sample>(`/api/ops/usage/turns?${usageQuery(filters)}&group=${group}`, signal)

/** Every load, including manual refresh, shares cancellation and latest-response protection. */
export function createUsageReader() {
  let revision = 0
  let controller: AbortController | null = null
  return {
    cancel() {
      revision += 1
      controller?.abort()
    },
    async read(filters: UsageFilters): Promise<Answer<Usage> | null> {
      const current = ++revision
      controller?.abort()
      const request = new AbortController()
      controller = request
      const answer = await fetchUsage(filters, request.signal)
      return current === revision && !request.signal.aborted ? answer : null
    }
  }
}

export interface ResearchFigures {
  requests: number
  measuredRequests: number
  partialRequests: number
  tokens: {
    total: number | null
    prompt: number | null
    completion: number | null
    reasoning: number | null
  } | null
  perRequest: { n: number; median: number | null; p90: number | null }
  cents: number
}

export type ResearchPurpose = 'menu-photos' | 'logo' | 'picture-labels' | 'demo-look' | 'other'
export type ResearchPayer = 'account' | 'public' | 'operator' | 'campaign' | 'none' | 'unrecorded'

export interface ResearchUsage {
  kind: 'research'
  filters: { audience: string; cms: 'not-applied'; demo: 'not-applied' }
  all: ResearchFigures
  byPurpose: Partial<Record<ResearchPurpose, ResearchFigures>>
  byPayer: Partial<Record<ResearchPayer, ResearchFigures>>
  accounts: Array<ResearchFigures & { email: string }>
}
