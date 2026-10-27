/**
 * What the QS Inventory screen holds from its doors, and the only transitions that change it.
 *
 * The pools (`GET /api/ops/inventory`) and the instances of a pool
 * (`GET /api/ops/inventory/instances?pool=`) are separate doors. A screen that writes each answer
 * where it lands ends up with a count from one read beside rows from another, and with a "could
 * not be read" mark that an unrelated read wipes. So nothing here is written piecemeal:
 *
 *   - A read takes a number and a fixed list of pools when it STARTS (`begin`).
 *   - Its answers are checked whole (`poolsAnswer`, `instancesAnswer`) and applied in one step
 *     (`settle`): the pools together with the instances of every pool it covered, or nothing.
 *   - The ledger of what could not be read is kept per resource — the list, and each pool's
 *     instances — and a mark is only cleared by an applied read that carried THAT resource and
 *     started after the failure.
 *
 * 🔒 TWO DOORS ARE STILL TWO REQUESTS. Applying them together keeps the screen from contradicting
 * itself; it does not make them one database snapshot.
 *
 * No React in here: the component keeps one of these and draws it.
 */
import {
  type EligibleRow,
  type InstanceRow,
  type Policy,
  type PoolRow,
  type Supply,
  type Sweep,
  sameReview
} from './inventory-api'

/** One applied read: the pools, and the instances of exactly the pools that read covered. */
export interface Snapshot {
  /** The number of the read this came from. */
  seq: number
  pools: PoolRow[]
  sweep: Sweep | null
  /** A pool that is not a key here was not covered: it has no rows, not older ones. */
  instances: Record<string, InstanceRow[]>
}

/**
 * Why an instance cannot be approved right now.
 *
 * `sending` is the request on its way. `settling` is answered and not read again yet: `since` is
 * the number of the last read started before the answer, so only a read started later, applied,
 * and carrying the instances of `poolKey` can show where the instance stands.
 */
export type Hold = { phase: 'sending' } | { phase: 'settling'; poolKey: string; since: number }

export interface ReadState {
  /** How many reads were started; the next one takes `started + 1`. */
  started: number
  snapshot: Snapshot | null
  /** The latest read that could not be applied and that no applied read has followed; 0 = none. */
  listFailed: number
  /** Per pool: the latest read covering it that could not be applied, until one that could follows. */
  poolFailed: Record<string, number>
  /** Per pool: the latest applied read that carried its instances. */
  poolRead: Record<string, number>
  holds: Record<string, Hold>
}

/** One read, fixed when it starts. */
export interface Ticket {
  readonly seq: number
  readonly covered: readonly string[]
}

export const NOTHING_READ: ReadState = {
  started: 0,
  snapshot: null,
  listFailed: 0,
  poolFailed: {},
  poolRead: {},
  holds: {}
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const unique = (keys: string[]) => new Set(keys).size === keys.length

/**
 * 🔒 EVERY FIELD OF A ROW HAS ONE CHECK, AND THE COMPILER COUNTS THEM. `Shape<T>` asks for a check
 * per field of the type the screen draws from, so a field added to `PoolRow`, `InstanceRow`,
 * `Sweep` or `EligibleRow` does not build until it says what it accepts. Picking by hand "the
 * fields the screen dereferences" is how `supply: {}` drew `undefined / undefined ready` and a
 * `label` that was an object took the screen down.
 *
 * The checks are the door's own types (`ops/inventory.js`, migrations 026 and 027): nothing is
 * coerced, defaulted or dropped. A row that fails any of them makes the whole answer "not read".
 */
type Check = (value: unknown) => boolean
type Shape<T> = { [K in keyof Required<T>]: Check }

const str: Check = (value) => typeof value === 'string'
const text: Check = (value) => typeof value === 'string' && value !== ''
const flag: Check = (value) => typeof value === 'boolean'
/** A count or a threshold: a whole number, never negative. */
const count: Check = (value) => Number.isSafeInteger(value) && (value as number) >= 0
/** A time as the door serialises it: text that is a date. */
const stamp: Check = (value) => typeof value === 'string' && Number.isFinite(new Date(value).getTime())
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value)
const record: Check = isRecord
/** A field the screen never draws from a row as read: `reviewable` decides before anything uses it. */
const anything: Check = () => true
const shaped =
  <T>(shape: Shape<T>): Check =>
  (value) =>
    isRecord(value) && (Object.entries(shape) as [string, Check][]).every(([key, check]) => check(value[key]))

const POLICY: Shape<Policy> = {
  enabled: flag,
  lowWatermark: count,
  targetReady: count,
  maxStock: count,
  maxConcurrentPrepares: count,
  reviewHold: flag,
  maxAttempts: count,
  healthTtlSeconds: count,
  paused: flag,
  pausedReason: orNull(str)
}

const SUPPLY: Shape<Supply> = {
  ready: count,
  preparing: count,
  awaitingReview: count,
  reserved: count,
  assigned: count,
  quarantined: count,
  draining: count,
  stock: count,
  handedOver: count
}

const POOL: Shape<PoolRow> = {
  poolKey: text,
  environment: str,
  host: str,
  platform: str,
  quickstartTag: text,
  quickstartVersion: str,
  generation: text,
  policy: shaped(POLICY),
  revision: count,
  supply: shaped(SUPPLY)
}

/** What a run of the timer did: each number is there or it is not, never something else. */
const OUTCOME: Shape<NonNullable<Sweep['lastOutcome']>> = {
  advanced: (value) => value === undefined || count(value),
  ready: (value) => value === undefined || count(value),
  retired: (value) => value === undefined || count(value),
  enqueued: (value) => value === undefined || count(value),
  started: (value) => value === undefined || count(value),
  failed: (value) => value === undefined || count(value)
}

const SWEEP: Shape<Sweep> = {
  // The period is divided by and counted against; zero is not a period.
  periodMs: (value) => count(value) && (value as number) > 0,
  lastStartedAt: orNull(stamp),
  lastFinishedAt: orNull(stamp),
  lastError: orNull(str),
  lastOutcome: orNull(shaped(OUTCOME)),
  revision: count,
  updatedBy: orNull(str),
  updatedAt: orNull(stamp)
}

const INSTANCE: Shape<InstanceRow> = {
  id: text,
  poolKey: text,
  siteKey: str,
  label: str,
  url: orNull(str),
  host: str,
  // Empty is drawn (the row cannot be approved, and says so); anything that is not text is not.
  generation: str,
  state: text,
  jobId: orNull(str),
  attempts: count,
  nextAttemptAt: orNull(stamp),
  healthOk: orNull(flag),
  healthCheckedAt: orNull(stamp),
  healthDetail: orNull(record),
  hashes: anything,
  reserved: flag,
  reservedAt: orNull(stamp),
  lastError: orNull(str),
  createdAt: stamp,
  updatedAt: stamp
}

const ELIGIBLE: Shape<EligibleRow> = {
  tag: text,
  platform: orNull(str),
  attestedVersion: orNull(str),
  currentVersion: orNull(str),
  eligible: flag,
  drift: orNull(str),
  reason: orNull(str)
}

const isPool = shaped(POOL)
const isSweep = shaped(SWEEP)
const isInstance = shaped(INSTANCE)
const isEligible = shaped(ELIGIBLE)

/**
 * The pools door's answer, or null when it is not one the screen can draw.
 *
 * 🔒 NOTHING IS REPAIRED. A refusal (`code`), an empty or broken body, an envelope of another
 * type, and a row with any field that is not what the door declares are all "not read" — never an
 * empty list, and never a row with holes in it.
 */
export function poolsAnswer(body: unknown): { pools: PoolRow[]; sweep: Sweep | null } | null {
  if (!isRecord(body) || body.code !== undefined || !Array.isArray(body.pools)) return null
  const pools = body.pools as unknown[]
  if (!pools.every(isPool) || !unique((pools as PoolRow[]).map((row) => row.poolKey))) return null
  const sweep = body.sweep ?? null
  if (sweep !== null && !isSweep(sweep)) return null
  return { pools: pools as PoolRow[], sweep: sweep as Sweep | null }
}

/** The instances door's answer for `poolKey`, or null — by the same rule as `poolsAnswer`. */
export function instancesAnswer(body: unknown, poolKey: string): InstanceRow[] | null {
  if (!isRecord(body) || body.code !== undefined || !Array.isArray(body.instances)) return null
  const rows = body.instances as unknown[]
  const drawable = rows.every((row) => isInstance(row) && (row as InstanceRow).poolKey === poolKey)
  if (!drawable || !unique((rows as InstanceRow[]).map((row) => row.id))) return null
  return rows as InstanceRow[]
}

/**
 * The eligible door's answer, or null — by the same rule. It is not part of a read: what may be
 * stocked is drawn beside the pools, and a list that could not be read is no list.
 */
export function eligibleAnswer(body: unknown): EligibleRow[] | null {
  if (!isRecord(body) || body.code !== undefined || !Array.isArray(body.quickstarts)) return null
  const rows = body.quickstarts as unknown[]
  if (!rows.every(isEligible) || !unique((rows as EligibleRow[]).map((row) => row.tag))) return null
  return rows as EligibleRow[]
}

/** Start a read of the pools with the instances of `targets` and of the pool that is open. */
export function begin(
  state: ReadState,
  targets: readonly string[],
  open: string | null
): { state: ReadState; ticket: Ticket } {
  const seq = state.started + 1
  const covered = Object.freeze([...new Set([...targets, ...(open ? [open] : [])])])
  return { state: { ...state, started: seq }, ticket: Object.freeze({ seq, covered }) }
}

/**
 * What a finished read does to the state. `instances[i]` answers `ticket.covered[i]`; null is a
 * door that was not read.
 *
 * 🔒 APPLIED WHOLE OR NOT AT ALL, AND NEVER OVER A LATER ONE. Every door of the read answered and
 * no later read is on screen: its pools and its instances replace the snapshot together. Anything
 * else leaves the snapshot as it is.
 *
 * 🔒 A MARK IS CLEARED ONLY BY WHAT WAS ACTUALLY READ. The list's mark goes when a read started
 * after the failure is applied. A pool's mark — and the hold on an instance of that pool — goes
 * only when such a read also carried that pool's instances; a read of another pool says nothing
 * about this one. A read that could not be applied marks the list and every pool it covered,
 * unless a later read already confirmed them.
 */
export function settle(
  state: ReadState,
  ticket: Ticket,
  pools: { pools: PoolRow[]; sweep: Sweep | null } | null,
  instances: readonly (InstanceRow[] | null)[]
): { state: ReadState; applied: boolean } {
  const { seq, covered } = ticket
  const drawn = state.snapshot?.seq ?? 0
  const whole =
    pools !== null && instances.length === covered.length && instances.every((rows) => rows !== null)

  if (!whole) {
    const poolFailed = { ...state.poolFailed }
    for (const key of covered)
      if ((state.poolRead[key] ?? 0) < seq) poolFailed[key] = Math.max(poolFailed[key] ?? 0, seq)
    const listFailed = drawn < seq ? Math.max(state.listFailed, seq) : state.listFailed
    return { state: { ...state, listFailed, poolFailed }, applied: false }
  }
  // A later read is on screen: this one neither draws over it nor confirms anything.
  if (seq <= drawn) return { state, applied: false }

  const poolRead = { ...state.poolRead }
  const poolFailed = { ...state.poolFailed }
  for (const key of covered) {
    poolRead[key] = seq
    if ((poolFailed[key] ?? 0) < seq) delete poolFailed[key]
  }
  const holds = Object.fromEntries(
    Object.entries(state.holds).filter(
      ([, hold]) => !(hold.phase === 'settling' && covered.includes(hold.poolKey) && hold.since < seq)
    )
  )
  return {
    state: {
      started: state.started,
      snapshot: {
        seq,
        pools: pools.pools,
        sweep: pools.sweep,
        instances: Object.fromEntries(covered.map((key, i) => [key, instances[i] ?? []]))
      },
      listFailed: state.listFailed < seq ? 0 : state.listFailed,
      poolFailed,
      poolRead,
      holds
    },
    applied: true
  }
}

/** Put a hold on an instance, or change the one it has. */
export function withHold(state: ReadState, instanceId: string, hold: Hold): ReadState {
  return { ...state, holds: { ...state.holds, [instanceId]: hold } }
}

/** Nothing was ever read, and the only read so far failed: there is no older screen to keep. */
export const neverRead = (state: ReadState) => state.snapshot === null && state.listFailed > 0

/** The counts on screen are older than a read that could not be applied. */
export const listUnconfirmed = (state: ReadState) => state.snapshot !== null && state.listFailed > 0

/** Pools whose instances could not be read again since the last read that carried them. */
export const unconfirmedPools = (state: ReadState) => Object.keys(state.poolFailed)

/**
 * Why a review opened on `opened` cannot be sent right now; null when it can.
 *
 * 🔒 ONE RULE FOR THE BUTTON AND FOR THE PRESS. `sending`: a request for this instance is on its
 * way. `settling`: one was answered, and no applied read has carried its pool since — a finished
 * request or a failed re-read frees nothing. `moved`: the row the screen holds now is not the
 * build the review shows (another state, pool, generation or hashes, a customer holding it, or no
 * row at all).
 */
export function approvalBlock(
  state: ReadState,
  opened: InstanceRow,
  poolKey: string
): 'sending' | 'settling' | 'moved' | null {
  const hold = state.holds[opened.id]
  if (hold) return hold.phase
  const now = state.snapshot?.instances[poolKey]?.find((row) => row.id === opened.id)
  return opened.poolKey === poolKey && sameReview(now, opened) ? null : 'moved'
}
