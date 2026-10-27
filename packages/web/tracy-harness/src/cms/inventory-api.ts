/**
 * What `/api/ops/inventory/*` answers, and the calls the QS Inventory screen makes.
 *
 * 🔒 A POOL IS NOT A QUICKSTART. Its key is
 * `environment : host : platform : tag : version : generation`, and `generation` is a checksum of
 * what actually gets installed. So publishing a release under the same tag makes a NEW pool with
 * default thresholds — the screen has to say that, or somebody sets `targetReady: 5` and silently
 * gets 1 back after the next publish.
 */

export type InstanceState =
  | 'queued'
  | 'preparing'
  | 'verifying'
  | 'awaiting_review'
  | 'ready'
  | 'reserved'
  | 'assigning'
  | 'assigned'
  | 'draining'
  | 'retired'
  | 'quarantined'

export interface Policy {
  enabled: boolean
  lowWatermark: number
  targetReady: number
  maxStock: number
  maxConcurrentPrepares: number
  reviewHold: boolean
  maxAttempts: number
  healthTtlSeconds: number
  paused: boolean
  pausedReason: string | null
}

/** `ready` here already excludes anything whose health check has aged past the pool's TTL — the
 * door counts it that way, so the screen must not add its own arithmetic on top. */
export interface Supply {
  ready: number
  preparing: number
  awaitingReview: number
  reserved: number
  assigned: number
  quarantined: number
  draining: number
  stock: number
  handedOver: number
}

export interface PoolRow {
  poolKey: string
  environment: string
  host: string
  platform: string
  quickstartTag: string
  quickstartVersion: string
  generation: string
  policy: Policy
  revision: number
  supply: Supply
}

export interface InstanceRow {
  id: string
  poolKey: string
  siteKey: string
  label: string
  /** Where a person can open it. Built by the server from its own origin, never assembled here. */
  url: string | null
  host: string
  generation: string
  state: InstanceState
  jobId: string | null
  attempts: number
  nextAttemptAt: string | null
  healthOk: boolean | null
  healthCheckedAt: string | null
  healthDetail: Record<string, unknown> | null
  hashes: Record<string, unknown>
  reserved: boolean
  reservedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

/** One quickstart as `/eligible` answers it (`inventory/eligibility.js`). */
export interface EligibleRow {
  tag: string
  /** Null when neither the release nor a demo says which CMS it is. */
  platform: string | null
  attestedVersion: string | null
  currentVersion: string | null
  eligible: boolean
  /** `'version'` when the demo vouched for another release than the current one. */
  drift: string | null
  reason: string | null
}

/**
 * 🔒 A REFUSAL WITH NO BODY MUST NOT READ AS SUCCESS. Measured 22/09: the same-origin guard
 * answers `403` with an EMPTY body, `response.json()` threw, this returned `null`, and every
 * caller checks `answer?.code` — so a press that changed nothing reported "Tore down 7 instances".
 * A status that is not ok now always produces a `code`, invented from the status when the door
 * did not send one.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers
      }
    })
    // A refusal usually carries a body worth showing (`AT_MAX_STOCK`, `TEARDOWN_REFUSED`,
    // `HAS_OWNER`); when it does not, the status IS the message.
    const body = (await response.json().catch(() => null)) as (T & { code?: string }) | null
    if (response.ok) return body
    return { ...body, code: body?.code ?? `HTTP_${response.status}` } as T
  } catch (error) {
    // The request never completed at all — a different thing from a refusal, and said so.
    return { code: 'NO_ANSWER', detail: String((error as Error)?.message ?? error) } as T
  }
}

/**
 * The refill timer's own row: how often it runs and what its last run did. Read before every tick
 * by the timer itself, so a saved period reaches every replica without a restart.
 */
export interface Sweep {
  periodMs: number
  /** Stamped before the passes run. Later than `lastFinishedAt` means a run is in progress, or hung. */
  lastStartedAt: string | null
  lastFinishedAt: string | null
  /** The message of the last run that threw; null after a clean run. */
  lastError: string | null
  lastOutcome: {
    advanced?: number
    ready?: number
    retired?: number
    enqueued?: number
    started?: number
    failed?: number
  } | null
  revision: number
  updatedBy: string | null
  updatedAt: string | null
}

/** The same bounds the table's CHECK holds — offered here so the field refuses what the door would. */
export const SWEEP_SECONDS = { min: 10, max: 3600 }

export const fetchPools = () => call<{ pools: PoolRow[]; sweep?: Sweep }>('/api/ops/inventory')

export const saveSweep = (periodMs: number, revision: number) =>
  call<{ sweep?: Sweep; code?: string; detail?: string }>('/api/ops/inventory/sweep', {
    method: 'PUT',
    body: JSON.stringify({ periodMs, revision })
  })

export const fetchInstances = (poolKey: string) =>
  call<{ instances: InstanceRow[] }>(`/api/ops/inventory/instances?pool=${encodeURIComponent(poolKey)}`)

export const fetchEligible = () =>
  call<{ recorded: number; quickstarts: EligibleRow[] }>('/api/ops/inventory/eligible')

export const savePolicy = (poolKey: string, revision: number, patch: Partial<Policy>) =>
  call<{ pool?: PoolRow; code?: string; detail?: string }>('/api/ops/inventory/policy', {
    method: 'PUT',
    body: JSON.stringify({ poolKey, revision, ...patch })
  })

export const prepareMore = (poolKey: string, count: number) =>
  call<{ enqueued?: number; capped?: boolean; code?: string; stock?: number; maxStock?: number }>(
    '/api/ops/inventory/prepare',
    { method: 'POST', body: JSON.stringify({ poolKey, count }) }
  )

/** `quarantined` keeps the site for a post-mortem; `retired` tears it down and frees the disk. */
export const retireInstance = (
  instanceId: string,
  to: 'quarantined' | 'draining' | 'retired',
  reason?: string
) =>
  call<{ instance?: InstanceRow; code?: string; state?: string; detail?: string; host?: string }>(
    '/api/ops/inventory/retire',
    { method: 'POST', body: JSON.stringify({ instanceId, to, ...(reason ? { reason } : {}) }) }
  )

export const createPool = (tag: string, host?: string) =>
  call<{ pool?: PoolRow; code?: string; detail?: string }>('/api/ops/inventory/pool', {
    method: 'POST',
    body: JSON.stringify({ tag, ...(host ? { host } : {}) })
  })

/** What `POST /api/ops/inventory/approve` answers; a refusal carries `code` instead. */
export interface ApproveAnswer {
  /** The only field that says this instance moved to `ready`. */
  released?: boolean
  /** The generation was approved before this press; the instance rides on that approval. */
  alreadyApproved?: boolean
  generation?: string
  approval?: unknown
  code?: string
  state?: string
  detail?: string
}

/**
 * Whether the screen holds everything an approval has to name: an instance waiting for review that
 * no customer holds, its id and generation, and the hashes that were read back from it.
 *
 * 🔒 NOTHING IS FILLED IN. The door compares `expectedHashes` with what it stored; an instance
 * whose hashes are missing, empty or not an object is not approved from here with `{}` in their
 * place — that would be approving a build nobody was shown.
 */
export function reviewable(row: InstanceRow | null | undefined): boolean {
  if (!row || row.state !== 'awaiting_review' || row.reserved !== false) return false
  if (typeof row.id !== 'string' || row.id === '') return false
  if (typeof row.generation !== 'string' || row.generation === '') return false
  const hashes: unknown = row.hashes
  if (hashes === null || typeof hashes !== 'object' || Array.isArray(hashes)) return false
  return Object.keys(hashes).length > 0
}

/** Two read-back values are the same JSON value, whatever order an object's keys came in. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => sameValue(item, b[i]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
}

/**
 * Whether the row the screen holds NOW is still the build a review was opened on: the same
 * instance in the same pool, still approvable, with the same generation and the same read-back
 * hashes.
 *
 * A review keeps the row as it was when it was opened, so that what is sent is what was shown.
 * Once the screen has read something else for that instance — another state, another pool or
 * generation, other hashes, a customer holding it, or no row at all — sending the old review can only be
 * refused, or approve a build the screen no longer shows.
 */
export function sameReview(now: InstanceRow | null | undefined, opened: InstanceRow): boolean {
  if (!now || !reviewable(now) || !reviewable(opened)) return false
  return (
    now.id === opened.id &&
    now.poolKey === opened.poolKey &&
    now.generation === opened.generation &&
    sameValue(now.hashes, opened.hashes)
  )
}

/**
 * Approve the generation of one instance that is waiting for review, and release that instance.
 * `expectedHashes` is what the person was shown; the door refuses (`HASH_MISMATCH`) when the
 * instance no longer carries exactly those.
 */
export const approveInstance = (instanceId: string, expectedHashes: Record<string, unknown>) =>
  call<ApproveAnswer>('/api/ops/inventory/approve', {
    method: 'POST',
    body: JSON.stringify({ instanceId, expectedHashes })
  })
