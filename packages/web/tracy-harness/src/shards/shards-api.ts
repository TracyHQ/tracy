// What /ops › Shards reads and sends: `GET /api/ops/shards`, `PATCH /api/ops/shards/:name`,
// `POST /api/ops/shards` (apps/tracy-web/src/shards/ops-routes.js; docs/sre/hop-dong-cua-shard.md
// §7, §8). Pure, so `node --test` reads it without a browser.

/** The heartbeat as the master keeps it (contract §7; `shards/check.js` `readHeartbeat`). */
export interface ShardHeartbeat {
  app_tag: string | null
  dsh_tag: string | null
  source_commit: string | null
  migration_head: string | null
  updater_version: string | null
  sites: number | null
  mem_available_mb: number | null
  disk_free_mb: number | null
  load1: number | null
  releases_read_at: string | null
  accepting: boolean | null
  updating: boolean
  last_update: {
    app_tag: string | null
    dsh_tag: string | null
    ok: boolean
    finished_at: string | null
    log_tail: string | null
    web_images_missing: boolean
  } | null
  last_backup: { at: string | null; ok: boolean } | null
}

export interface ShardRow {
  name: string
  origin: string
  provider: string | null
  region: 'asia' | 'america' | 'europe' | 'unknown'
  accepting: boolean
  pinned: boolean
  pinnedAppTag: string | null
  pinnedDshTag: string | null
  maxSites: number
  targetAppTag: string | null
  targetDshTag: string | null
  degradedUntil: string | null
  heartbeatAt: string | null
  silent: boolean
  lowMemBeats: number
  updateGrantedAt: string | null
  migrationHead: string | null
  heartbeat: ShardHeartbeat | null
  sites: number
  people: number
}

export interface MasterTags {
  appTag: string | null
  dshTag: string | null
  sourceCommit: string | null
  migrationHead: string | null
  people: number
}

export interface ShardsPayload {
  shards: ShardRow[]
  master: MasterTags
  adopt: 'everyone' | 'some' | 'off'
  dns: boolean
  writable: boolean
}

export type ShardChange = Partial<
  Pick<ShardRow, 'accepting' | 'pinned' | 'maxSites' | 'targetAppTag' | 'targetDshTag'>
>
export type ShardState = 'silent' | 'updating' | 'failed' | 'degraded' | 'pinned' | 'closed' | 'open'

/** What the Add form sends (contract §8 (b)); blank `provider`/`region` are left out / `unknown`. */
export interface ShardDraft {
  name: string
  origin: string
  secret: string
  tunnelId: string
  provider: string
  region: string
}

export const SHARD_REGIONS = ['asia', 'america', 'europe', 'unknown'] as const

/** One word for the row, the worst first. */
export function shardState(row: ShardRow, now: number = Date.now()): ShardState {
  if (row.silent) return 'silent'
  if (row.heartbeat?.updating) return 'updating'
  if (row.heartbeat?.last_update && !row.heartbeat.last_update.ok) return 'failed'
  if (row.degradedUntil && Date.parse(row.degradedUntil) > now) return 'degraded'
  if (row.pinned) return 'pinned'
  return row.accepting && row.heartbeat?.accepting !== false ? 'open' : 'closed'
}

/** The tags a shard should run: its pin, else its own target set here, else this master's. */
export function wantedTags(
  row: ShardRow,
  master: MasterTags
): { app: string | null; dsh: string | null; overridden: boolean } {
  if (row.pinned) return { app: row.pinnedAppTag, dsh: row.pinnedDshTag, overridden: true }
  return {
    app: row.targetAppTag ?? master.appTag,
    dsh: row.targetDshTag ?? master.dshTag,
    overridden: row.targetAppTag !== null || row.targetDshTag !== null
  }
}

/** Whether the shard runs what it should; null when either side does not know. */
export function onTarget(row: ShardRow, master: MasterTags): boolean | null {
  const want = wantedTags(row, master)
  const beat = row.heartbeat
  if (!beat?.app_tag || !beat.dsh_tag || !want.app || !want.dsh) return null
  return beat.app_tag === want.app && beat.dsh_tag === want.dsh
}

/** `10 / 200 (5 %)` — the shard's own count when it has spoken, else the directory's. */
export function fillText(row: ShardRow): string {
  const sites = row.heartbeat?.sites ?? row.sites
  return `${sites} / ${row.maxSites} (${Math.round((sites / row.maxSites) * 100)} %)`
}

const TAG = /^[A-Za-z0-9_.-]{1,128}$/

/** A typed target tag: blank follows the master again (null), a tag sets it, anything else is refused (undefined). */
export function targetFromInput(text: string): string | null | undefined {
  const value = text.trim()
  if (value === '') return null
  return TAG.test(value) ? value : undefined
}

export async function fetchShards(doFetch: typeof fetch): Promise<ShardsPayload> {
  const res = await doFetch('/api/ops/shards', { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status}`)
  return (await res.json()) as ShardsPayload
}

export async function saveShard(doFetch: typeof fetch, name: string, change: ShardChange): Promise<void> {
  const res = await doFetch(`/api/ops/shards/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(change)
  })
  if (!res.ok) throw new Error(`${res.status}`)
}

// The shapes of apps/tracy-web/src/lib/shard-shapes.js, repeated to warn early; the server decides.
const NAME = /^[a-z][a-z0-9]{0,15}$/
const SECRET = /^[0-9a-f]{64}$/
const TUNNEL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function originProblem(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (!['https:', 'http:'].includes(url.protocol)) return 'shards.problem.originScheme'
    return url.pathname === '/' && !url.search && !url.hash ? null : 'shards.problem.originOnly'
  } catch {
    return 'shards.problem.originExample'
  }
}

/**
 * What is wrong with each field of an Add draft, as a `shards` dictionary key (the region's takes
 * `{regions}`, `SHARD_REGIONS` joined); empty when it may be sent.
 */
export function draftProblems(draft: ShardDraft): Partial<Record<keyof ShardDraft, string>> {
  const out: Partial<Record<keyof ShardDraft, string>> = {}
  const name = draft.name.trim()
  if (!NAME.test(name) || name === 's0') out.name = 'shards.problem.name'
  const origin = originProblem(draft.origin.trim())
  if (origin) out.origin = origin
  if (!SECRET.test(draft.secret.trim())) out.secret = 'shards.problem.secret'
  if (!TUNNEL.test(draft.tunnelId.trim().toLowerCase())) out.tunnelId = 'shards.problem.tunnelId'
  const region = draft.region.trim()
  if (region !== '' && !(SHARD_REGIONS as readonly string[]).includes(region))
    out.region = 'shards.problem.region'
  return out
}

/** One POST of a new shard. A refusal throws `<status> <code>`. */
export async function addShard(doFetch: typeof fetch, draft: ShardDraft): Promise<void> {
  const provider = draft.provider.trim()
  const body = {
    name: draft.name.trim(),
    origin: draft.origin.trim(),
    secret: draft.secret.trim(),
    tunnelId: draft.tunnelId.trim(),
    ...(provider ? { provider } : {}),
    region: draft.region.trim() || 'unknown'
  }
  const res = await doFetch('/api/ops/shards', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code ?? ''
    throw new Error(`${res.status} ${code}`.trim())
  }
}
