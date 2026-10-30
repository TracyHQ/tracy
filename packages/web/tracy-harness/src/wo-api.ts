/**
 * API client and pure queue state helpers for `/ops/wo` (Website Opportunities Operations:
 * Live Queue across all accounts + Provider Keys & Pipeline Settings).
 */
import type { Score } from '@tracy/wo-views'
import { tr } from './i18n/index.ts'
import type { WoCapabilityGroup, WoProviderOrder } from './wo-provider-order.ts'

export type WoStage =
  | '0-pin'
  | '1-queued'
  | '2-waiting'
  | '3-researching'
  | '4-brief-ready'
  | '5-provisioning'
  | '6-uploading'
  | '7-live'

export type WoCustomerStage = 'research' | 'demo' | 'outreach' | 'cancelled'
export type WoFilter = 'all' | WoStage | WoCustomerStage | 'attention'
export const WO_CUSTOMER_STAGES: readonly WoCustomerStage[] = ['research', 'demo', 'outreach', 'cancelled']
/** Dictionary key of each milestone's label (namespace `wo`). */
export const WO_CUSTOMER_LABEL_KEY: Record<WoCustomerStage, string> = {
  research: 'wo.customerStage.research',
  demo: 'wo.customerStage.demo',
  outreach: 'wo.customerStage.outreach',
  cancelled: 'wo.customerStage.cancelled'
}
export function woNeedsAttention(row: WoOpportunityRow): boolean {
  return row.customerAttention ?? row.needsAttention
}

export type WoCms = 'joomla' | 'wordpress' | 'emdash'

export type WoSortKey =
  | 'number'
  | 'step'
  | 'name'
  | 'research'
  | 'duration'
  | 'user'
  | 'time'
  | 'queue'
  | 'status'
  | 'cms'

export interface WoCollectorItem {
  name: string
  provider: string
  status: 'success' | 'failure' | 'running' | 'pending' | 'skipped'
  durationSec: number
  detail: string
  /** The QA row only: what the residue sweep left unresolved, capped; `unresolvedMore` counts the rest. */
  unresolved?: { field: string; page: string | null; why: string }[]
  unresolvedMore?: number
}

export interface WoExecution {
  jobId: string
  kind: string
  state: string
  stage: string
  attempt: number
  maxAttempts: number
  workerId: string | null
  leaseUntil: string | null
  heartbeatAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

export interface WoOpportunityRow {
  id: string
  number: number
  shortId: string
  slug: string
  name: string
  city?: string
  area?: string | null
  address?: string | null
  branch: string
  placeId: string | null
  websiteUrl: string | null
  /** Mobile PageSpeed Insights of the current website, measured by the research job. */
  pageSpeed?: WoPageSpeed | null
  /** Place Details the research job read for a Google Places candidate. */
  googlePlace?: WoGooglePlaceSummary | null
  cms: WoCms
  template: string
  stage: WoStage
  customerStage?: WoCustomerStage
  customerStatus?: string
  customerAttention?: boolean
  stepNum: number
  needsAttention: boolean
  attentionReason: string | null
  attentionCommand: string | null
  researchRollup: 'success' | 'failure' | 'pending' | 'paused' | 'none'
  currentStep: string
  worker: string
  durationSec: number
  user: {
    accountId: string
    login: string
    name: string
    email: string
  }
  revId: string
  revisionNumber: number
  demoSite: string | null
  demoUrl: string | null
  demoStatus: 'live' | 'provisioning' | 'uploading' | 'failed' | 'none'
  queueState: 'IDLE' | 'QUEUED' | 'LEASED' | 'PAUSED' | 'BLOCKED' | 'DONE'
  statusText: string
  notes: string
  read: boolean
  createdAt: string
  updatedAt: string
  builtAt: string | null
  collectors: WoCollectorItem[]
  execution: WoExecution | null
}

export interface WoGooglePlaceSummary {
  /** Amenities Google lists as offered. */
  amenities: number
  reviews: number
  /** Listing photos stored as media. */
  photos: number
  fetchedAt: string | null
}

export interface WoPageSpeed {
  /** Lighthouse scores, 0–100. */
  performance: number | null
  seo: number | null
  lcpMs: number | null
  https: boolean
  checkedAt: string
}

export interface WoMember {
  accountId: string
  login: string
  name: string
  email: string
  count: number
  attentionCount: number
  runningCount?: number
}

export interface WoCitySummary {
  city: string
  count: number
  attentionCount: number
  runningCount: number
}

export interface WoProviderKeyInfo {
  configured: boolean
  source: 'ops' | 'env' | null
  hint: string | null
}

export type WoProviderId =
  | 'deepseek'
  | 'firecrawl'
  | 'jina'
  | 'apify'
  | 'google'
  | 'rapidapi'
  | 'serpapi'
  | 'litescrape'
  | 'scrapecreators'
  | 'monid'

/** The provider budgets of social stats (`website-opportunities/src/social-stats.js`), each capped per day. */
export type WoSocialBudgetId =
  | 'facebook-scraper3'
  | 'facebook-scrapecreators'
  | 'facebook-apify'
  | 'instagram-scrapecreators'
  | 'instagram-apify'
  | 'tiktok-scrapecreators'
  | 'tiktok-apify'
  | 'instagram-looter2'
  | 'instagram-stable'
  | 'tiktok-api23'
  | 'yt-api'
  | 'youtube-official'

/** Words shown for a budget: a dictionary key (namespace `wo`) and its parameters. */
export interface WoBudgetText {
  key: string
  params?: Readonly<Record<string, string>>
}

export interface WoSocialCapRow {
  id: WoSocialBudgetId
  network: 'facebook' | 'instagram' | 'tiktok' | 'youtube'
  listing: string
  freeTier: WoBudgetText | null
  unit?: 'runs' | 'units'
  pricing?: WoBudgetText
  cap: number
}

const SOCIAL_BUDGETS: readonly Omit<WoSocialCapRow, 'cap'>[] = [
  {
    id: 'facebook-scraper3',
    network: 'facebook',
    listing: 'krasnoludkolo/facebook-scraper3',
    freeTier: { key: 'wo.budget.perMonth', params: { n: '100' } }
  },
  {
    id: 'facebook-apify',
    network: 'facebook',
    listing: 'topapi/facebook-page-posts-scraper (Apify)',
    freeTier: null,
    unit: 'runs',
    pricing: { key: 'wo.budget.facebookApify' }
  },
  {
    id: 'facebook-scrapecreators',
    network: 'facebook',
    listing: 'ScrapeCreators Facebook profile + posts',
    freeTier: { key: 'wo.budget.freeCredits', params: { n: '100' } },
    pricing: { key: 'wo.budget.scrapecreators' }
  },
  {
    id: 'instagram-looter2',
    network: 'instagram',
    listing: 'irrors-apis/instagram-looter2',
    freeTier: { key: 'wo.budget.perMonth', params: { n: '150' } }
  },
  {
    id: 'instagram-stable',
    network: 'instagram',
    listing: 'thetechguy32744/instagram-scraper-stable-api',
    freeTier: { key: 'wo.budget.perMonth', params: { n: '20' } }
  },
  {
    id: 'instagram-apify',
    network: 'instagram',
    listing: 'apify/instagram-profile-scraper (Apify)',
    freeTier: null,
    unit: 'runs',
    pricing: { key: 'wo.budget.instagramApify' }
  },
  {
    id: 'instagram-scrapecreators',
    network: 'instagram',
    listing: 'ScrapeCreators Instagram profile + recent posts',
    freeTier: { key: 'wo.budget.freeCredits', params: { n: '100' } },
    pricing: { key: 'wo.budget.scrapecreators' }
  },
  {
    id: 'tiktok-api23',
    network: 'tiktok',
    listing: 'Lundehund/tiktok-api23',
    freeTier: { key: 'wo.budget.perMonth', params: { n: '100' } }
  },
  {
    id: 'tiktok-apify',
    network: 'tiktok',
    listing: 'mu0i/tiktok-profile-scraper (Apify)',
    freeTier: null,
    unit: 'runs',
    pricing: { key: 'wo.budget.tiktokApify' }
  },
  {
    id: 'tiktok-scrapecreators',
    network: 'tiktok',
    listing: 'ScrapeCreators TikTok profile + videos',
    freeTier: { key: 'wo.budget.freeCredits', params: { n: '100' } },
    pricing: { key: 'wo.budget.scrapecreators' }
  },
  {
    id: 'youtube-official',
    network: 'youtube',
    listing: 'YouTube Data API v3 (Google key)',
    unit: 'units',
    freeTier: { key: 'wo.budget.youtubeOfficial' }
  },
  {
    id: 'yt-api',
    network: 'youtube',
    listing: 'ytjar/yt-api',
    freeTier: { key: 'wo.budget.perMonth', params: { n: '300' } }
  }
]

/** The daily caps as rows for the settings form, in each network's chain order; missing = 0 (off). */
export function socialCapRows(caps: Partial<Record<WoSocialBudgetId, number>> | undefined): WoSocialCapRow[] {
  return SOCIAL_BUDGETS.map((b) => ({ ...b, cap: caps?.[b.id] ?? 0 }))
}

export interface WoOpsSettings {
  tripadvisorReviews: boolean
  defaultRadiusM: number
  gmapsMaxPlaces: number
  mapDiscoveryProvider: 'auto' | 'google' | 'apify' | 'osm'
  googlePlacesPhotos: boolean
  pageSpeedCheckEnabled: boolean
  googleMapsEmbed: boolean
  webSearchProvider: 'auto' | 'deepseek' | 'jina' | 'firecrawl' | 'off'
  websiteFetchChain: 'crawl-jina-firecrawl-deepseek' | 'crawl-firecrawl-jina' | 'crawl-only'
  autoCollectSources: {
    website: boolean
    facebook: boolean
    instagram: boolean
    tiktok: boolean
    youtube: boolean
  }
  depthPreset: 'fast' | 'standard' | 'deep'
  onPartialSource: 'complete' | 'pause'
  searchRunsPerDay: number
  researchRunsPerDay: number
  maxChargeUsdPerRun: number
  defaultCms: WoCms
  /** No template named: `strict` refuses a pin no longer offered; the fallback guesses a restaurant card. */
  templatePinPolicy: 'fallback-any-restaurant' | 'strict'
  /** One release tag per CMS (`tracy-base/wp7`) a revision builds when no template is named. */
  pinnedTemplates: {
    joomla: string
    wordpress: string
    emdash: string
  }
  visionEnabled: boolean
  maxVisionPictures: number
  missingHeroMode: 'outpaint-and-scene' | 'outpaint' | 'real-only'
  handoffMaxPictures: number
  autoHandoff: 'auto-draft' | 'manual'
  /** Maps JavaScript key the customer's browser loads (public, referrer-restricted); '' = no map view. */
  googleMapsBrowserKey: string
  /** Mobile PageSpeed score under which a current website counts as slow in the opportunity score (1–99). */
  slowSiteThreshold: number
  /** How many unchecked websites one `POST …/site-checks` call may queue (0–60). */
  siteChecksAutoLimit: number
  /** How many unknown social pages one `POST …/social-stats` call may queue (0–40). */
  socialStatsAutoLimit: number
  /** Billable social-stats calls one account may cause a day. */
  socialStatsPerAccountPerDay: number
  /** Billable calls a day per provider, deployment-wide; 0 switches that provider off. */
  socialStatsProviderDailyCap: Record<WoSocialBudgetId, number>
  socialStatsProviderCycle: Partial<
    Record<WoSocialBudgetId, { limit: number; used: number; startsAt: string; endsAt: string }>
  >
  socialStatsYouTubeDailyQuota: number
  /** Menu photos one place may have read by the vision model (0–60, default 24); 0 turns photo reading off. */
  menuPhotosPerPlace?: number
  /** Which provider each research capability asks first; a group left out runs its default, `[]` is off. */
  providerOrder?: WoProviderOrder
}

export interface WoTemplateStatus {
  cms: string
  slug: string
  title: string
  found: boolean
  inspirationHidden: boolean
  published: boolean
  /** Design inspiration offers this tag for this CMS, so a revision can build it. */
  offered: boolean
}

export interface WoPayload {
  origin: string
  uiEnabled: boolean
  writable: boolean
  viewerRole: string
  viewer: {
    accountId: string | null
    login: string
    name: string
    email: string
  } | null
  members: WoMember[]
  cities?: WoCitySummary[]
  opportunities: WoOpportunityRow[]
  settings: WoOpsSettings
  settingsMeta: {
    updatedBy: string | null
    updatedAt: string | null
  }
  providers: Record<WoProviderId, WoProviderKeyInfo>
  templateStatuses: WoTemplateStatus[]
  /** Capability groups with their provider order and each provider's state (absent on older servers). */
  capabilities?: WoCapabilityGroup[]
}

export interface WoApiProbe {
  ok: boolean
  latencyMs?: number
  detail: string
}

export interface WoProviderTestResult {
  ok: boolean
  provider: string
  status: string
  latencyMs?: number
  detail: string
  /** Google only: one probe per API the pipeline calls with the key. */
  apis?: { places: WoApiProbe; pagespeed: WoApiProbe; embed: WoApiProbe }
}

export const WO_STAGE_META: Record<
  WoStage,
  { num: string; labelKey: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' }
> = {
  '0-pin': { num: '0', labelKey: 'wo.stage.pin', tone: 'neutral' },
  '1-queued': { num: '1', labelKey: 'wo.stage.queued', tone: 'info' },
  '2-waiting': { num: '2', labelKey: 'wo.stage.waiting', tone: 'warning' },
  '3-researching': { num: '3', labelKey: 'wo.stage.researching', tone: 'info' },
  '4-brief-ready': { num: '4', labelKey: 'wo.stage.briefReady', tone: 'success' },
  '5-provisioning': { num: '5', labelKey: 'wo.stage.provisioning', tone: 'info' },
  '6-uploading': { num: '6', labelKey: 'wo.stage.uploading', tone: 'info' },
  '7-live': { num: '7', labelKey: 'wo.stage.live', tone: 'success' }
}

export function woProgressPercent(row: WoOpportunityRow): number {
  const map: Record<WoStage, number> = {
    '0-pin': 8,
    '1-queued': 18,
    '2-waiting': 28,
    '3-researching': 52,
    '4-brief-ready': 68,
    '5-provisioning': 82,
    '6-uploading': 92,
    '7-live': 100
  }
  return map[row.stage] ?? 0
}

export function filterWoRows(
  rows: readonly WoOpportunityRow[],
  options: {
    search?: string
    cmsScope?: 'all' | WoCms
    userFilter?: string
    cityFilter?: string
    stageFilter?: WoFilter
    dateField?: 'updated' | 'created' | 'built'
    dateRange?: '24h' | '7d' | '30d' | '90d' | 'any'
    nowMs?: number
  }
): WoOpportunityRow[] {
  const {
    search = '',
    cmsScope = 'all',
    userFilter = 'all',
    cityFilter = 'all',
    stageFilter = 'all',
    dateField = 'updated',
    dateRange = '7d',
    nowMs = Date.now()
  } = options

  const q = search.trim().toLowerCase()
  const rangeMsMap: Record<string, number> = {
    '24h': 24 * 3600_000,
    '7d': 7 * 24 * 3600_000,
    '30d': 30 * 24 * 3600_000,
    '90d': 90 * 24 * 3600_000
  }
  const maxAgeMs = rangeMsMap[dateRange] ?? null

  return rows.filter((row) => {
    if (cmsScope !== 'all' && row.cms !== cmsScope) return false
    if (userFilter !== 'all' && row.user.login !== userFilter && row.user.accountId !== userFilter) {
      return false
    }
    if (cityFilter !== 'all') {
      const rowCity = (row.city || row.branch || '').toLowerCase()
      if (rowCity !== cityFilter.toLowerCase()) return false
    }
    if (stageFilter === 'attention') {
      if (!woNeedsAttention(row)) return false
    } else if (WO_CUSTOMER_STAGES.includes(stageFilter as WoCustomerStage)) {
      if (row.customerStage !== stageFilter || woNeedsAttention(row)) return false
    } else if (stageFilter !== 'all' && row.stage !== stageFilter) {
      return false
    }
    if (dateField === 'built' && !row.builtAt) return false
    if (maxAgeMs !== null) {
      const stamp =
        dateField === 'created' ? row.createdAt : dateField === 'built' ? row.builtAt : row.updatedAt
      if (stamp) {
        const t = new Date(stamp).getTime()
        if (Number.isFinite(t) && nowMs - t > maxAgeMs) return false
      }
    }
    if (q) {
      const hay = [
        String(row.number),
        row.shortId,
        row.name,
        row.city ?? '',
        row.area ?? '',
        row.address ?? '',
        row.branch,
        row.user.login,
        row.user.name,
        row.user.email,
        row.demoSite ?? '',
        row.template,
        row.cms,
        row.statusText,
        row.customerStatus ?? '',
        row.notes
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export function sortWoRows(
  rows: readonly WoOpportunityRow[],
  sortKey: WoSortKey,
  sortDir: 'asc' | 'desc'
): WoOpportunityRow[] {
  const dir = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    switch (sortKey) {
      case 'number':
        return (a.number - b.number) * dir
      case 'step':
        return (
          ((a.customerStage ? WO_CUSTOMER_STAGES.indexOf(a.customerStage) : a.stepNum) -
            (b.customerStage ? WO_CUSTOMER_STAGES.indexOf(b.customerStage) : b.stepNum)) *
          dir
        )
      case 'name':
        return a.name.localeCompare(b.name) * dir
      case 'research':
        return a.researchRollup.localeCompare(b.researchRollup) * dir
      case 'duration':
        return (a.durationSec - b.durationSec) * dir
      case 'user':
        return a.user.login.localeCompare(b.user.login) * dir
      case 'time':
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir
      case 'queue':
        return a.queueState.localeCompare(b.queueState) * dir
      case 'status':
        return (a.customerStatus ?? a.statusText).localeCompare(b.customerStatus ?? b.statusText) * dir
      case 'cms':
        return `${a.cms}:${a.template}`.localeCompare(`${b.cms}:${b.template}`) * dir
      default:
        return 0
    }
  })
}

export async function fetchWoQueue(fetchImpl: typeof fetch = fetch): Promise<WoPayload> {
  const res = await fetchImpl('/api/ops/wo', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  if (!res.ok) {
    throw new Error(tr('wo.api.loadQueue', { status: res.status }))
  }
  return res.json()
}

export async function saveWoRead(
  opportunityId: string,
  read: boolean,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean }> {
  const res = await fetchImpl('/api/ops/wo/read', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ opportunityId, read })
  })
  if (!res.ok) throw new Error(tr('wo.api.saveRead', { status: res.status }))
  return res.json()
}

export async function saveWoSettings(
  payload: { settings?: Partial<WoOpsSettings>; uiEnabled?: boolean },
  fetchImpl: typeof fetch = fetch
): Promise<WoPayload> {
  const res = await fetchImpl('/api/ops/wo/settings', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || err?.error || tr('wo.api.saveSettings', { status: res.status }))
  }
  return res.json()
}

export async function saveWoProviderKey(
  provider: WoProviderId,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<WoPayload> {
  const res = await fetchImpl(`/api/ops/wo/keys/${provider}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ apiKey })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || tr('wo.api.saveKey', { provider, status: res.status }))
  }
  return res.json()
}

export async function testWoProviderKey(
  provider: WoProviderId,
  fetchImpl: typeof fetch = fetch
): Promise<WoProviderTestResult> {
  const res = await fetchImpl(`/api/ops/wo/keys/${provider}/test`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({})
  })
  return res.json()
}

export async function runWoAction(
  opportunityId: string,
  action: 'force-complete-brief' | 'reset-cap-resume' | 'reclaim-retry' | 'bump-queue' | 'cancel-job',
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; action: string; opportunityId: string; queue: WoPayload }> {
  const res = await fetchImpl(`/api/ops/wo/opportunities/${encodeURIComponent(opportunityId)}/action`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ action })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.message || err?.error || tr('wo.api.action', { action, status: res.status }))
  }
  return res.json()
}

export interface WoDubaiPrefetch {
  available: boolean
  campaign: {
    enabled: boolean
    seed_source: {
      url: string
      fetchedAt: string | null
      revision: string | null
      osmBase: string | null
      attribution: string
    }
    selection_rule: string
    last_tick_at: string | null
    next_tick_at: string
    tick_count: number
    last_error: string | null
  } | null
  seeds: Array<{
    external_id: string
    place_id: string
    job_id: string | null
    state: string | null
    stage: string | null
    attempt: number | null
    snapshot_id: string | null
    enrichment_scope: string | null
    media_count?: number
    images?: Array<{
      id: string
      caption: string | null
      credit: { provider?: string; authors?: Array<{ displayName?: string; uri?: string }> } | null
    }>
    published_at: string | null
    last_error: { code?: string; reason?: string } | null
    facts: {
      name: string
      website?: string | null
      sourceUrl: string
      fetchedAt: string
      opportunity?: Score
      rank?: number
      selected?: boolean
      rankingCheckedAt?: string | null
    }
    profile: { name?: string; bio?: string | null; phone?: string | null; address?: string | null } | null
    sources: Array<{
      source: string
      status: string
      reason: string | null
      fetchedAt: string | null
      coverage: { fetched?: number } | null
    }>
    socials: Array<{ network: string; url: string; verifiedBy: string; observedAt: string }>
  }>
  controls: {
    tickSeconds: number
    maxPlaces: number
    maxPrefetchConcurrency: number
    reservedUserSlots?: number
    websitePages: number
    providerStarts: number
    providerCostCents: number
    paidSocialEnabled: boolean
  }
  socialStatus: string
  sharedPlaceDistribution: string
}

export async function fetchWoDubaiPrefetch(fetchImpl: typeof fetch = fetch): Promise<WoDubaiPrefetch> {
  const res = await fetchImpl('/api/ops/wo/prefetch/dubai', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  if (!res.ok) throw new Error(tr('wo.api.loadPilot', { status: res.status }))
  return res.json()
}

export async function runWoDubaiPrefetch(
  action: 'seed' | 'start' | 'stop' | 'concurrency',
  fetchImpl: typeof fetch = fetch,
  concurrency?: number
): Promise<void> {
  const res = await fetchImpl('/api/ops/wo/prefetch/dubai', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, ...(action === 'concurrency' ? { concurrency } : {}) })
  })
  if (!res.ok) throw new Error(tr('wo.api.pilotAction', { status: res.status }))
}
