/**
 * `/ops/wo` › Places: the doors of `apps/tracy-web/src/ops/wo-places.js` (tasks/todo-wo-shared-research.md
 * P4). Amounts are whole US cents on the wire; `wo-places-format.ts` shows them.
 */
import { fetchWoQueue, saveWoSettings } from './wo-api.ts'
import type { WoOpsSettings } from './wo-api.ts'

export type PlaceFilter = 'all' | 'stale' | 'failing' | 'revoked' | 'merge'
export const PLACE_FILTERS: readonly PlaceFilter[] = ['all', 'stale', 'failing', 'revoked', 'merge']

export interface CostCents {
  spentCents: number
  reservedCents: number
  unreconciledCents: number
}
export interface PlaceError {
  code?: string
  message?: string
}
export interface PlaceSource {
  source: string
  ref: string | null
  status: string
  collectedAt: string | null
  attemptedAt: string | null
  lastError: PlaceError | null
  stale: boolean
  /** Only on `facebook-search` / `instagram-search` rows of the detail: the pages that search found. */
  pages?: SearchedPage[]
}
export interface SearchedPage {
  url: string
  network: string
  verdict: 'confirmed' | 'pending' | 'rejected' | string
  provider?: string | null
  evidence?: {
    query?: string
    title?: string
    proofs?: string[]
    reasons?: string[]
    page?: Record<string, unknown>
  } | null
  judgedBy?: string
  judgedAt?: string
}
export interface PlaceIdentity {
  namespace: string
  externalId: string
  source?: string
}
export interface PlaceJob {
  id: string
  state: string
  stage: string
  force: boolean
  updatedAt: string | null
  lastError: PlaceError | null
}
export interface PlaceSummary {
  id: string
  name: string | null
  createdAt: string | null
  updatedAt: string | null
  identities: PlaceIdentity[]
  snapshot: { id: string; state: string; publishedAt: string | null } | null
  freshness: 'fresh' | 'stale' | 'never'
  failing: boolean
  sources: PlaceSource[]
  accounts: number
  opportunities: number
  cost: { today: CostCents; last30: CostCents }
  lastJob: PlaceJob | null
  nextRunQueued: boolean
  media: { total: number; revoked: number }
  mergeCandidates: number
  mergedInto?: string | null
}
export interface ResearchCaps {
  dailyCapCents: number | null
  jobCapCents: number | null
  newPlacesPerAccountPerDay: number | null
}
export interface PlacesPage {
  places: PlaceSummary[]
  nextCursor: string | null
  counts: Record<PlaceFilter, number>
  today: CostCents
  caps: ResearchCaps
  writable: boolean
}
export interface PlaceMedia {
  id: string
  sha256: string
  kind: 'image' | 'video'
  mime: string | null
  bytes: number | null
  width: number | null
  height: number | null
  status: string
  category: string | null
  caption: string | null
  source: string
  sourceUrl: string
  provider: string | null
  credit: unknown
  postedAt: string | null
  collectedAt: string | null
  jobId: string | null
  inCurrentSnapshot: boolean
  revokedAt: string | null
  revokeReason: string | null
}
export interface MergeCandidate {
  id: string
  state: 'pending' | 'approved' | 'rejected'
  score: number
  evidence: Record<string, unknown>
  createdAt: string | null
  decidedBy: string | null
  decidedAt: string | null
  appliedAt: string | null
  applyError: string | null
  urlPlace: { id: string; name: string | null; identities: string[] }
  googlePlace: { id: string; name: string | null; identities: string[] }
}
export interface PlaceDetail {
  place: PlaceSummary
  links: { kind: string; url: string; verifiedBy: string; createdAt: string | null }[]
  media: PlaceMedia[]
  snapshots: {
    id: string
    state: string
    jobId: string | null
    createdAt: string | null
    publishedAt: string | null
    sources: number
    media: number
  }[]
  jobs: (PlaceJob & { attempt: number; createdAt: string | null })[]
  accounts: {
    accountId: string
    email: string
    name: string | null
    opportunities: number
    lastSeenAt: string | null
  }[]
  mergedPlaces: { id: string; name: string | null; identities: PlaceIdentity[] }[]
  history: {
    id: string
    placeId: string
    action: string
    actor: string
    detail: Record<string, unknown>
    createdAt: string | null
  }[]
  mergeCandidates: MergeCandidate[]
  costByOperation: (CostCents & { provider: string; operation: string; calls: number })[]
  /** The menu read for the place (the `menu` data contract of the WO menu-items plan); null: not a food place. */
  menu?: PlaceMenu | null
}

export type MenuState = 'never' | 'read' | 'partial' | 'none' | 'off'
export type MenuReason = 'photo-reading-off' | 'vision-not-tested' | 'no-menu-found' | 'not-food'
export type MenuPhotoResult =
  | 'menu'
  | 'not-menu'
  | 'unreadable'
  | 'same-menu'
  | 'over-limit'
  | 'stopped-early'
  | 'unread'
export interface MenuItem {
  name: string
  price: string | null
  currency: string | null
  currencyAssumed: boolean
  section: string | null
  size: string | null
  source: { kind: 'file' | 'photo'; url: string; mediaId: string | null }
  verified: false
  /** What the menu says its numbers mean: 1 full; 1000, 10000, 1000000 shortened ("110" = 110,000); null or absent unknown. */
  priceScale?: number | null
  /** Other prices photos printed for the same dish: the conflict is shown, never resolved by guessing. */
  otherPrices: { price: string; mediaId: string | null; priceScale?: number | null }[]
}
export interface MenuPhoto {
  mediaId: string
  result: MenuPhotoResult
  items: number
  sameAs: string | null
  costCents?: number
  model?: string
}
export interface PlaceMenu {
  applicable: boolean
  state: MenuState
  reason: MenuReason | null
  readAt: string | null
  currency: string | null
  counts: { file: number; photo: number; photosRead: number; photosTotal: number; limit: number }
  items: MenuItem[]
  files: { url: string; name: string; items: number; readAt: string | null }[]
  photos: MenuPhoto[]
}

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' }

/** A door that failed with no message of its own: `key` (`wo-places.error.*`) words it on screen. */
export class PlacesDoorError extends Error {
  readonly key: string
  readonly status: number
  constructor(key: string, status: number) {
    super(`${key} (HTTP ${status})`)
    this.key = key
    this.status = status
  }
}

async function answer<T>(res: Response, what: string): Promise<T> {
  if (res.ok) return res.json()
  const err = await res.json().catch(() => ({}))
  const said = err?.message || err?.error
  throw said ? new Error(said) : new PlacesDoorError(`wo-places.error.${what}`, res.status)
}

export async function fetchPlaces(
  query: { q?: string; state?: PlaceFilter; cursor?: string | null; limit?: number },
  fetchImpl: typeof fetch = fetch
): Promise<PlacesPage> {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.state && query.state !== 'all') params.set('state', query.state)
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  const qs = params.toString()
  const res = await fetchImpl(`/api/ops/wo/places${qs ? `?${qs}` : ''}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  return answer(res, 'loadPlaces')
}

export async function fetchPlace(id: string, fetchImpl: typeof fetch = fetch): Promise<PlaceDetail> {
  const res = await fetchImpl(`/api/ops/wo/places/${encodeURIComponent(id)}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  return answer(res, 'loadPlace')
}

/** `waiting` = approved but not merged yet (a place was busy, or the merge failed). */
export async function fetchMergeQueue(
  state: 'pending' | 'waiting' = 'pending',
  fetchImpl: typeof fetch = fetch
): Promise<MergeCandidate[]> {
  const res = await fetchImpl(`/api/ops/wo/places/merge-queue?state=${state}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  return (await answer<{ candidates: MergeCandidate[] }>(res, 'loadMergeQueue')).candidates
}

async function post<T>(path: string, body: unknown, what: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(body ?? {})
  })
  return answer(res, what)
}

const placePath = (id: string) => `/api/ops/wo/places/${encodeURIComponent(id)}`

export const refreshPlace = (id: string, fetchImpl: typeof fetch = fetch) =>
  post<{ ok: true; job: { id: string; state: string }; outcome: string }>(
    `${placePath(id)}/refresh`,
    {},
    'refresh',
    fetchImpl
  )

export const setMediaRevoked = (
  placeId: string,
  mediaId: string,
  revoked: boolean,
  reason = '',
  fetchImpl: typeof fetch = fetch
) =>
  post<{ ok: true; media: { id: string; revokedAt: string | null } }>(
    `${placePath(placeId)}/media/${encodeURIComponent(mediaId)}/${revoked ? 'revoke' : 'unrevoke'}`,
    revoked ? { reason } : {},
    revoked ? 'revoke' : 'unrevoke',
    fetchImpl
  )

export const mergePlace = (id: string, into: string, fetchImpl: typeof fetch = fetch) =>
  post<{ ok: true; into: string; opportunities: number }>(
    `${placePath(id)}/merge`,
    { into },
    'merge',
    fetchImpl
  )

export const splitPlace = (id: string, identity: PlaceIdentity, fetchImpl: typeof fetch = fetch) =>
  post<{ ok: true; place: string; restored: boolean; opportunities: number }>(
    `${placePath(id)}/split`,
    { identity: { namespace: identity.namespace, externalId: identity.externalId } },
    'split',
    fetchImpl
  )

export const decideMerge = (
  candidateId: string,
  decision: 'approve' | 'reject',
  fetchImpl: typeof fetch = fetch
) =>
  post<{ ok: true; candidate: { id: string; state: string; applied: boolean } }>(
    `/api/ops/wo/places/merge-queue/${encodeURIComponent(candidateId)}/${decision}`,
    {},
    decision === 'approve' ? 'approveMerge' : 'rejectMerge',
    fetchImpl
  )

/** The research caps as `/ops/wo` settings fields (P2, `website-opportunities/src/wo-settings.js`). */
export interface ResearchCapSettings {
  researchDailyCapCents: number
  researchJobCapCents: number
  newPlacesPerAccountPerDay: number
}

/**
 * Save the caps through the settings door, which replaces the whole settings object: read it, change
 * only the three fields, write it back.
 */
export async function saveResearchCaps(caps: ResearchCapSettings, fetchImpl: typeof fetch = fetch) {
  const { settings } = await fetchWoQueue(fetchImpl)
  const next: Partial<WoOpsSettings> & ResearchCapSettings = { ...settings, ...caps }
  return saveWoSettings({ settings: next }, fetchImpl)
}

/** Research again (tasks/todo-wo-research-again.md): which parts would run and why, and the cost ceiling. */
export type AgainRunReason = 'never' | 'failed' | 'outdated' | 'rule-changed'
export type AgainKeptReason = 'up-to-date' | 'none' | 'unavailable' | 'over-cap'
export interface AgainPlan {
  run: { part: string; reason: AgainRunReason; ceilingCents: number }[]
  kept: { part: string; reason: AgainKeptReason; detail?: string }[]
  ceilingCents: number
}
export interface AgainPreview {
  plan: AgainPlan
  payer: 'operator'
}
export type AgainResult =
  | { outcome: 'ran'; job: { id: string; state: string; force: boolean }; joined: boolean; plan: AgainPlan }
  | { outcome: 'up-to-date'; plan: AgainPlan | null }

/** `parts` limits the plan to those parts (Read menu again: `MENU_PARTS`); left out, every part may run. */
export async function fetchAgainPreview(
  id: string,
  fetchImpl: typeof fetch = fetch,
  parts?: readonly string[]
): Promise<AgainPreview> {
  const qs = parts?.length ? `?${new URLSearchParams({ parts: parts.join(',') })}` : ''
  const res = await fetchImpl(`${placePath(id)}/research-again${qs}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  })
  return answer(res, 'loadAgain')
}

/** Runs only the parts due; NOTHING_DUE is an answer (`up-to-date`), not an error. */
export async function researchAgain(
  id: string,
  fetchImpl: typeof fetch = fetch,
  parts?: readonly string[]
): Promise<AgainResult> {
  const res = await fetchImpl(`${placePath(id)}/research-again`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(parts?.length ? { parts } : {})
  })
  if (res.status === 409) {
    const err = await res
      .clone()
      .json()
      .catch(() => ({}))
    if (err?.error === 'NOTHING_DUE') return { outcome: 'up-to-date', plan: err.plan ?? null }
  }
  const out = await answer<{
    job: { id: string; state: string; force: boolean }
    joined: boolean
    plan: AgainPlan
  }>(res, 'researchAgain')
  return { outcome: 'ran', job: out.job, joined: Boolean(out.joined), plan: out.plan }
}

export interface AgainTally {
  ran: number
  upToDate: number
  /** `key` + `status`: the door said nothing of its own (`PlacesDoorError`). */
  failed: { id: string; message: string; key?: string; status?: number }[]
}

/** Research again on each place, `concurrency` at a time (the server checks the budget per call). */
export async function researchAgainMany(
  ids: readonly string[],
  fetchImpl: typeof fetch = fetch,
  concurrency = 3
): Promise<AgainTally> {
  const tally: AgainTally = { ran: 0, upToDate: 0, failed: [] }
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        const r = await researchAgain(id, fetchImpl)
        if (r.outcome === 'ran') tally.ran += 1
        else tally.upToDate += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        tally.failed.push(
          error instanceof PlacesDoorError
            ? { id, message, key: error.key, status: error.status }
            : { id, message }
        )
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker))
  return tally
}

/** An operator's verdict on a page a social search left for a person to check. */
export const judgeSocialPage = (
  placeId: string,
  url: string,
  verdict: 'confirm' | 'reject',
  fetchImpl: typeof fetch = fetch
) =>
  post<{ ok: true; page: SearchedPage }>(
    `${placePath(placeId)}/social-pages`,
    { url, verdict },
    verdict === 'confirm' ? 'confirmPage' : 'rejectPage',
    fetchImpl
  )

/** A social page of the place no search found: the server checks the address and names it for the next run. */
export const addSocialPage = (placeId: string, url: string, fetchImpl: typeof fetch = fetch) =>
  post<{ ok: true; link: { kind: string; url: string }; added: boolean }>(
    `${placePath(placeId)}/social-pages/add`,
    { url: url.trim() },
    'addPage',
    fetchImpl
  )
