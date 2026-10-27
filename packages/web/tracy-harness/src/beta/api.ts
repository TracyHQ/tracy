import type { SignalGrowth } from './signal-growth-api'
/**
 * The User Data Analytics group's doors (`apps/tracy-web/src/ops/beta.js`): what the three screens read, and the one
 * press. Codes and values only; `./strings.ts` words them.
 */

export type SourceBucket =
  | 'email'
  | 'blog'
  | 'demo'
  | 'site'
  | 'forum'
  | 'product-page'
  | 'helpdesk'
  | 'social'
  | 'video'
  | 'owned'
  | 'other'
  | 'none'

export interface Source {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

export interface Plan {
  id?: string
  name?: string
  until?: string
}

export interface Window {
  newUsers: number
  created: number
  imported: number
  waitlist: number
  stuck: number
  /** Discord members who proved an address (`discord.linked`). */
  discordLinked: number
  /** Bug reports those members posted on Discord (`discord.bug_report`). */
  discordBugs: number
  bySource: Record<SourceBucket, number>
}

export interface Day {
  day: string
  newUsers: number
  bySource: Record<SourceBucket, number>
  created: number
  imported: number
  stuck: number
  waitlist: number
  discordLinked: number
  discordBugs: number
}

export interface SignIn {
  at: string
  email: string | null
  badge: string | null
  plans: Plan[]
  via: string | null
  source: Source | null
}

export interface Signals {
  readAt: string
  days: number
  sources: SourceBucket[]
  totals: Window
  previous: Window
  byDay: Day[]
  latest: SignIn[]
}

export interface CustomerSite {
  siteKey: string
  kind: 'created' | 'imported'
  platform: string | null
  startedAt: string
  state: 'built' | 'stuck' | 'deleted' | 'pending'
  failures: number
  live: boolean
}

export interface Customer {
  email: string
  firstSignInAt: string
  badge: string | null
  source: Source | null
  sites: CustomerSite[]
  /** Requests the customer gave the agent (`site_turn`). */
  requests: number
  lastRequestAt: string | null
  /** What the agent changed (`site.edit`), by action code, and undos (`site.undo`). */
  edits: {
    done: number
    failed: number
    editUnknown?: number
    undone: number
    undoFailed?: number
    undoUnknown?: number
    actions: Record<string, number>
  }
  /** Vietnam days the customer was active, oldest first. */
  activeDays: string[]
  /** Recorded site-chat model tokens, including cache; null when no turn has usage. */
  tokens: number | null
  tokenCoverage?: { measuredTurns: number; partialTurns: number }
}

export interface Customers {
  growth?: SignalGrowth
  readAt: string
  days: number
  total: number
  rows: Customer[]
}

export interface StuckSite {
  operation: 'build' | 'import' | 'unknown'
  totalFailures: number
  episodeCount: number
  historyAvailable: boolean
  siteKey: string
  email: string | null
  plans: Plan[]
  source: Source | null
  platform: string | null
  step: string | null
  reason: string | null
  times: number
  firstAt: string
  lastAt: string | null
  open: boolean
  closed: { how: 'built' | 'deleted' | 'handled'; at: string; by: string | null } | null
}

export interface Stuck {
  readAt: string
  count: number
  open: StuckSite[]
  handledToday: StuckSite[]
  writable: boolean
  sites: StuckSite[]
  history: { episodes: StuckEpisode[]; activity: StuckActivity[] }
}

export interface StuckEpisode {
  lifetimeKey?: string
  siteKey: string
  platform: string | null
  operation: StuckSite['operation']
  step: string | null
  reason: string | null
  firstAt: string
  lastAt: string | null
  times: number
  closed: StuckSite['closed']
}
export interface StuckActivity {
  lifetimeKey?: string
  siteKey: string
  at: string
  platform: string | null
  operation: StuckSite['operation']
  step: string | null
  reason: string | null
  kind: 'started' | 'failed' | 'ready'
}

export interface WaitlistRow {
  email: string
  lastAt: string | null
  turnedAway: { times: number; firstAt: string; lastAt: string; via: string | null } | null
  /** `name` is null for a form sent before its answers were kept (only the mail knew it). */
  form: {
    at: string | null
    updatedAt: string | null
    name: string | null
    website: string | null
    platforms: string[]
    role: 'own' | 'clients' | null
    siteCount: string | null
    /** The `utm_*` of the tracy.ai form page, cleaned by Tracy; null when the plugin sent none. */
    source: Source | null
  } | null
  confirmation: { status: string; sentAt: string | null } | null
  signedInAt: string | null
}

export interface Waitlist {
  readAt: string
  days: number
  totals: { people: number; turnedAway: number; form: number; both: number; signedIn: number }
  rows: WaitlistRow[]
}

export type Answer<T> = { ok: true; body: T } | { ok: false; status: string }

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

export const fetchSignals = (days: number, signal?: AbortSignal) =>
  read<Signals>(`/api/ops/beta/signals?days=${days}`, signal)

export const fetchCustomers = (days: number, signal?: AbortSignal) =>
  read<Customers>(`/api/ops/beta/customers?days=${days}`, signal)

export const fetchWaitlist = (days: number, signal?: AbortSignal) =>
  read<Waitlist>(`/api/ops/beta/waitlist?days=${days}`, signal)

export const fetchStuck = (signal?: AbortSignal, query = '') =>
  read<Stuck>(`/api/ops/beta/stuck${query ? `?${query}` : ''}`, signal)

/** The rail's number: customers stuck right now, or null when the door refused. */
export async function fetchStuckCount(signal?: AbortSignal): Promise<number | null> {
  const answer = await fetchStuck(signal)
  return answer.ok && typeof answer.body.count === 'number' ? answer.body.count : null
}

/** Close a stuck row by hand, or open it again. Resolves to the door's code on a refusal. */
export async function pressHandled(
  siteKey: string,
  reopen = false
): Promise<{ ok: true } | { ok: false; code: string }> {
  try {
    const response = await fetch('/api/ops/beta/stuck/handled', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(reopen ? { siteKey, reopen: true } : { siteKey })
    })
    if (response.ok) {
      // Invalidate reads started before this change, including the sidebar's background read.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('tracy:stuck-changed'))
      return { ok: true }
    }
    const body = (await response.json().catch(() => null)) as { code?: unknown } | null
    return { ok: false, code: typeof body?.code === 'string' ? body.code : `HTTP ${response.status}` }
  } catch {
    return { ok: false, code: 'NO_ANSWER' }
  }
}
