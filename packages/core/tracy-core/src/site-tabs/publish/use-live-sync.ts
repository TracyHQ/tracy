/**
 * Sync from live as state (plan tasks/ke-hoach-dong-bo-tu-live.md): an imported site's live original
 * is read, merged into this copy and put in place, so the ZIP the customer takes at handover holds
 * their own work on the original site as well as Tracy's. The doors are `GET|POST
 * /api/sites/:key/sync` (`apps/tracy-web/src/sites/live-sync.js`).
 *
 * The logic of the panel that sat in the Export dialog of `@tracy/dsh-my-sites`, moved here
 * unchanged when Sync became a step of the Publish tab (23/10/2026): the same doors, asked at the
 * same moments, with the same answers followed. `SyncStep` draws what this returns.
 *
 * The customer is never asked to merge: where both sites changed one place, Tracy's version stays
 * (David, 20/10/2026), and the step lists those places once the sync is in place.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { followSyncToEnd } from './live-sync-follow'

const POLL_MS = 3000

export type SyncConflict = {
  id: string
  kind: string
  reason?: string | null
  path?: string
  setting?: string
  table?: string
  column?: string
  key?: Record<string, string>
  /** A JSON column merged key by key: the keys both sites changed (`a › b › c`), Tracy's kept there. */
  fields?: string[]
  /** … each with both sites' values, cut short. */
  fieldValues?: Array<{ path: string; ours: string | null; theirs: string | null }>
  /** A setting's PHP literal; for `order`, the items' names in each site's order. */
  ours?: string | string[] | null
  theirs?: string | string[] | null
  values?: Record<string, Record<string, { text?: string; null?: boolean }> | null> | null
}

export type SyncView = {
  id: string
  state: 'running' | 'needs_resolution' | 'applied' | 'failed'
  step: string | null
  error: string | null
  liveReadAt: string | null
  conflicts: SyncConflict[]
  /** Places both sites changed, where Tracy's version stayed. */
  kept: SyncConflict[]
  /** New live records the merge could not keep beside the copy's: nothing was applied. */
  held?: Array<SyncConflict & { points_at?: string | null; live?: number | null }>
  /** Applied: the live site's content records the copy did not take (held, then synced anyway). */
  dropped?: Array<SyncConflict & { points_at?: string | null; live?: number | null }>
  startedAt?: string
  /** Where the time went, while it runs too: each step's second since the start, and its stage. */
  timing?: { steps: Array<{ at: number; step: string; stage: string | null }> } | null
  /** LIVE_BUSY: which parts of the live site kept changing while it was read (`busy.parts`). */
  busy?: { parts: string[] } | null
  summary: {
    backup?: number | null
    files?: { fromTheirs?: number; merged?: number } | null
    database?: {
      rowsFromTheirs?: number
      rowsMerged?: number
      rowsDeleted?: number
      tablesFromTheirs?: number
      /** Records a person edits that came over (`live_sync.py` `records`); absent from an older host. */
      records?: number
    } | null
  } | null
}

type SyncAnswer = { available: boolean; why?: string; sync: SyncView | null }

/**
 * What the step says, one word for each thing a person can be looking at: still asking the door,
 * the door did not answer, this site has no sync (and why), never synced, a sync under way, up to
 * date, records waiting for a decision, the last sync failed. The footer's buttons follow it.
 */
export type SyncPhase =
  | 'loading'
  | 'unreadable'
  | 'unavailable'
  | 'never'
  | 'running'
  | 'applied'
  | 'held'
  | 'failed'

/** Everything the Sync step draws, and the two presses it can make. */
export interface LiveSync {
  phase: SyncPhase
  /** The last sync as the door said it, or null. */
  sync: SyncView | null
  /** Why there is no sync here (`not-imported` · `platform` · `not-connected`), or ''. */
  why: string
  /** The code the door answered with when it could not be read, or ''. */
  unreadable: string
  /** The code a press of Sync was refused with, or ''. */
  error: string
  /** A sync started from this step whose end has not been read yet. */
  starting: boolean
  /** Ask the door again (after it could not be read). */
  load: () => void
  /** Start a sync; `allowHeld` puts it in place even with held records ("Sync anyway"). */
  start: (allowHeld: boolean) => void
}

async function call(path: string, init?: RequestInit): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) },
    ...init
  })
  return { ok: response.ok, body: await response.json().catch(() => ({})) }
}

/**
 * `onReady` is called once a sync started here has been applied; `onStopped` once one started here
 * ended without being applied (refused or failed). `enabled: false` asks nothing (a site that has
 * no sync, or whose sites list has not answered yet); the door is read once it turns true.
 */
export function useLiveSync({
  siteKey,
  enabled = true,
  onAvailable,
  onReady,
  onStopped
}: {
  siteKey: string
  enabled?: boolean
  onAvailable?: (available: boolean) => void
  onReady?: () => void
  onStopped?: () => void
}): LiveSync {
  const base = `/api/sites/${encodeURIComponent(siteKey)}/sync`
  const [available, setAvailable] = useState<boolean | null>(null)
  const [why, setWhy] = useState('')
  const [unreadable, setUnreadable] = useState('')
  const [sync, setSync] = useState<SyncView | null>(null)
  const [error, setError] = useState('')
  // The sync this step started, by id: until its door answers, an earlier sync's `applied` on
  // screen must not read as this one done (it sent the export off before the new sync ran).
  const started = useRef<string | null>(null)
  const [starting, setStarting] = useState(false)
  // The callbacks of the latest render, read when an answer lands.
  const told = useRef({ onAvailable, onReady, onStopped })
  told.current = { onAvailable, onReady, onStopped }

  const read = useCallback(async (): Promise<SyncView | null> => {
    const { ok, body } = await call(base)
    if (!ok) throw new Error(body?.code ?? 'SYNC_FAILED')
    const answer = body as SyncAnswer
    setUnreadable('')
    setAvailable(answer.available)
    setWhy(answer.why ?? '')
    told.current.onAvailable?.(answer.available)
    setSync(answer.sync)
    return answer.sync
  }, [base])

  // A door that does not answer is said, with a way to ask again — never an empty step.
  const load = useCallback(() => {
    read().catch((e: unknown) => {
      setUnreadable(e instanceof Error ? e.message : 'SYNC_FAILED')
      told.current.onAvailable?.(false)
    })
  }, [read])

  useEffect(() => {
    if (enabled) load()
  }, [load, enabled])

  const start = useCallback(
    (allowHeld: boolean) => {
      started.current = 'pending'
      setStarting(true)
      setError('')
      void (async () => {
        const { ok, body } = await call(base, {
          method: 'POST',
          ...(allowHeld ? { body: JSON.stringify({ allowHeld: true }) } : {})
        })
        if (!ok && body?.code !== 'SYNC_RUNNING') {
          setError(body?.code ?? 'SYNC_FAILED')
          started.current = null
          setStarting(false)
          told.current.onStopped?.()
          return
        }
        started.current = body?.sync?.id ?? body?.syncId ?? null
        // To its end even with the tab closed: an applied sync that brought something reloads
        // the site's open previews (David 23/10/2026: the page did not show what the sync brought).
        if (started.current)
          followSyncToEnd(
            siteKey,
            started.current,
            async () => {
              const { ok, body: answer } = await call(base)
              if (!ok) throw new Error(answer?.code ?? 'SYNC_FAILED')
              return (answer as SyncAnswer).sync
            },
            POLL_MS
          )
        else setStarting(false)
        if (body?.sync) setSync(body.sync)
        else void read().catch(() => {})
      })()
    },
    [base, siteKey, read]
  )

  // Follow a running sync; say it once the one started here is applied or failed.
  useEffect(() => {
    if (!sync) return
    if (sync.state === 'running') {
      const timer = setTimeout(() => void read().catch(() => {}), POLL_MS)
      return () => clearTimeout(timer)
    }
    const mine = started.current !== null && started.current === sync.id
    if (sync.state === 'applied' && mine) {
      started.current = null
      setStarting(false)
      told.current.onReady?.()
    }
    if (sync.state === 'failed' && mine) {
      started.current = null
      setStarting(false)
      told.current.onStopped?.()
    }
    return undefined
  }, [sync, read])

  const busy = sync?.state === 'running'
  const phase: SyncPhase = unreadable
    ? 'unreadable'
    : available === null
      ? 'loading'
      : !available
        ? 'unavailable'
        : busy
          ? 'running'
          : error
            ? 'failed'
            : !sync
              ? 'never'
              : sync.state === 'applied'
                ? 'applied'
                : sync.state === 'needs_resolution'
                  ? 'held'
                  : 'failed'

  return { phase, sync, why, unreadable, error, starting, load, start }
}
