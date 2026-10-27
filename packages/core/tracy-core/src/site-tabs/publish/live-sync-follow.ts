import { announceSiteSynced } from '../../turn-undo/index.mjs'

/** The part of a sync's answer this reads (`apps/tracy-web/src/sites/live-sync.js` `view()`). */
type Followed = {
  id: string
  state: string
  summary?: {
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
} | null

/** Whether an applied sync brought anything from the live site: a file, a record or a whole table. */
export function broughtChanges(summary: NonNullable<Followed>['summary']): boolean {
  const f = summary?.files
  const d = summary?.database
  return [
    f?.fromTheirs,
    f?.merged,
    d?.rowsFromTheirs,
    d?.rowsMerged,
    d?.rowsDeleted,
    d?.tablesFromTheirs
  ].some((n) => typeof n === 'number' && n > 0)
}

/** Answers in a row that may fail (a dropped connection) before the follow gives up. */
const MISSES = 5
/** The syncs already followed on this page: one follow, and one reload, per sync. */
const followed = new Set<string>()

/**
 * Follow a sync this page started until it ends, whether or not its dialog is still open (a person
 * closes it and goes back to the page while the sync runs for minutes), and say it on the page when
 * it was applied and brought something (`tracy:site-synced`): the open previews of the site reload.
 * Stops on another sync's answer, on none, or after MISSES failed reads in a row.
 */
export function followSyncToEnd(
  siteKey: string,
  syncId: string,
  read: () => Promise<Followed>,
  waitMs: number
): void {
  if (followed.has(syncId)) return
  followed.add(syncId)
  let misses = 0
  const step = async (): Promise<void> => {
    let view: Followed
    try {
      view = await read()
      misses = 0
    } catch {
      if (++misses < MISSES) setTimeout(() => void step(), waitMs)
      return
    }
    if (!view || view.id !== syncId) return
    if (view.state === 'running') {
      setTimeout(() => void step(), waitMs)
      return
    }
    if (view.state === 'applied' && broughtChanges(view.summary)) announceSiteSynced({ siteKey, syncId })
  }
  setTimeout(() => void step(), waitMs)
}
