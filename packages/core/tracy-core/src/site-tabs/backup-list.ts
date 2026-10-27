/**
 * Backups as the milestones of Site changes (ADR 0024, `tasks/todo-backup.md` §3; drawn in
 * `@tracy/design` › `Mockups/Site changes backup`, approved by Brian 02/10): how a `/backups` row
 * becomes a backup point, what it can put back, and where it sits among the events. No React and
 * no runtime imports, so `test/backup-list.test.mjs` loads it through Node's type stripping.
 *
 * 🔒 A POINT SAYS WHAT IT HOLDS FROM ITSELF (ADR §1): the capability is read from the point's own
 * `database`, never from the software version. "Full backup" is never shown for a point that does
 * not prove it has its database, and Restore everything is offered only on a proven one.
 *
 * 🔒 A BACKUP HAS NO SOURCE and is counted neither per Source nor in the total; under a Source
 * filter it folds to a divider that keeps the time frame.
 */
import type { ActivityItemV2, BackupRecord } from './api'

/**
 * `full` files + database; `files-only` made before the database was kept (or a host that cannot
 * tell); `content` EmDash database + media; `db-missing` the point names a database copy that is
 * gone, does not match, or was removed after retention.
 */
export type Capability = 'full' | 'files-only' | 'content' | 'db-missing'

export interface BackupPoint {
  version: number
  sha: string
  title: string
  notes: string | null
  /** Unix seconds; null when the host did not say. */
  at: number | null
  by: BackupRecord['by']
  capability: Capability
  /** Why the database copy cannot be used (`db-missing`). */
  reason: 'missing' | 'mismatch' | 'removed' | null
  /** The first point, made when the site was built (`tracy-release/v1` on the baseline, ADR §5). */
  initial: boolean
  /** Taken by Tracy just before a Restore everything: the backup that restore went to. */
  beforeRestoreTo: number | null
  /** True for the host's own "Before restore" point even when its title names no number. */
  auto: boolean
  /** Files changed between the previous backup and this one; null when files are not tracked. */
  files: number | null
  /** The backup before this one, by number; null for the first. */
  previous: number | null
  database: BackupRecord['database'] | null
  /** True only when the host reports an EmDash app snapshot alongside the point. */
  applicationAvailable?: boolean
}

/** What a point holds besides files, read from its own `database` (ADR §1). */
export function capabilityOf(row: Pick<BackupRecord, 'database'>): Capability {
  const db = row.database
  if (!db) return 'files-only'
  if (db.state === 'full') return db.engine === 'sqlite' ? 'content' : 'full'
  if (db.state === 'missing') return 'db-missing'
  return 'files-only'
}

const BEFORE_RESTORE = /Before restore to Backup (\d+)/

/**
 * The backups of a `/backups` answer, newest first. `fileHistory: false` (EmDash): files are not
 * tracked, so no file count is said.
 */
export function backupsOf(
  rows: readonly { kind: string }[],
  { fileHistory = true }: { fileHistory?: boolean } = {}
): BackupPoint[] {
  const points = rows.filter((r): r is BackupRecord => r.kind === 'backup')
  const sorted = [...points].sort((a, b) => b.version - a.version)
  return sorted.map((r, i) => {
    const capability = capabilityOf(r)
    const m = r.auto === 'pre-restore' ? BEFORE_RESTORE.exec(r.title ?? '') : null
    return {
      version: r.version,
      sha: r.sha,
      title: r.title ?? '',
      notes: r.notes ?? null,
      at: typeof r.at === 'number' ? r.at : null,
      by: r.by,
      capability,
      reason: capability === 'db-missing' ? (r.database?.reason ?? 'missing') : null,
      initial: r.version === 1,
      beforeRestoreTo: m ? Number(m[1]) : null,
      auto: r.auto === 'pre-restore',
      files: fileHistory ? (typeof r.files === 'number' ? r.files : null) : null,
      previous: sorted[i + 1]?.version ?? null,
      database: r.database ?? null,
      ...(typeof r.applicationAvailable === 'boolean' ? { applicationAvailable: r.applicationAvailable } : {})
    }
  })
}

/**
 * The verbs a point offers (ADR §2), from its capability and the site: Restore files where files
 * are tracked and the point is not a content backup; Restore everything on a proven full backup;
 * Restore content on an EmDash content backup.
 */
export function verbsOf(
  b: Pick<BackupPoint, 'capability'>,
  { fileHistory = true }: { fileHistory?: boolean } = {}
): { files: boolean; everything: boolean; content: boolean } {
  return {
    files: fileHistory && b.capability !== 'content',
    everything: b.capability === 'full',
    content: b.capability === 'content'
  }
}

/**
 * What Restore… on a point may put back for this seat (Brian 03/10: ONE button, the scope chosen in
 * its dialog). `everything` and `files` are the scopes this seat may press on this point; `content`
 * marks an EmDash point, whose single Restore content… has no choice. `reason` says why a scope the
 * point could take is not offered: the point itself (`files-only`, `db-missing`) or the seat's role.
 * `may` null = the server did not say: every verb is offered and the door decides.
 */
export function restoreScopes(
  b: Pick<BackupPoint, 'capability'>,
  {
    fileHistory = true,
    may = null
  }: { fileHistory?: boolean; may?: { restoreFiles: boolean; restoreEverything: boolean } | null } = {}
): {
  everything: boolean
  files: boolean
  content: boolean
  reason: 'files-only' | 'db-missing' | 'role-everything' | 'role-files' | null
} {
  const v = verbsOf(b, { fileHistory })
  const okFiles = may?.restoreFiles ?? true
  const okEverything = may?.restoreEverything ?? true
  const everything = v.everything && okEverything
  const files = v.files && okFiles
  const reason =
    b.capability === 'files-only' || b.capability === 'db-missing'
      ? b.capability
      : v.everything && !okEverything && files
        ? 'role-everything'
        : v.files && !okFiles && everything
          ? 'role-files'
          : null
  return { everything, files, content: v.content, reason }
}

/** One entry of the merged timeline: an event, or a backup shown in full or folded to a divider. */
export type TimelineEntry =
  | {
      kind: 'event'
      item: ActivityItemV2
      at: number | null
      /** A Restore everything's own Before-restore backup, folded into its row (its way back). */
      returnPoint?: BackupPoint
    }
  | {
      kind: 'backup'
      backup: BackupPoint
      as: 'row' | 'divider'
      at: number | null
      /** Changes recorded since the previous backup; null when the list cannot tell yet. */
      changes: number | null
    }

/**
 * The Before-restore backup a Restore everything row names (`params.returnPoint`, from the host's
 * own answer, Brian 03/10/2026); null for any other row, or one settled before the link was kept.
 */
export function returnPointOf(item: Pick<ActivityItemV2, 'description'>): number | null {
  // Read defensively: a row is the server's answer, newer or older than these types.
  const d = item.description as ActivityItemV2['description'] | undefined
  if ((d?.key as string | undefined) !== 'site-changes.restore-everything') return null
  const n = (d?.params as Record<string, unknown> | undefined)?.returnPoint
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null
}

const secondsOf = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000)
}

/**
 * Events and backups in one newest-first line. The events keep the server's order; a backup goes
 * in by its time. When the list has more pages (`complete: false`), a backup older than the oldest
 * event loaded waits for its page — never drawn at the bottom of a list it is not the end of.
 * Under a Source filter every backup is a divider; under All and People and Tracy, a row.
 *
 * A Restore everything's own Before-restore backup is NOT a row of its own while its restore row is
 * in the list (Brian 03/10/2026): drawn by time it sat ABOVE the restore and read as "backed up after
 * restoring". It rides on the restore row as `returnPoint` instead, linked by the host's answer
 * (`returnPointOf`), never by time. A restore row that names none (settled before the link was
 * kept) leaves the backup where its time puts it.
 *
 * Each backup also counts the changes recorded since the previous backup (every event, not only
 * files), when the list holds that whole stretch.
 */
export function mergeTimeline(
  items: readonly ActivityItemV2[],
  backups: readonly BackupPoint[],
  { filter, complete, hidden = 0 }: { filter: string; complete: boolean; hidden?: number }
): TimelineEntry[] {
  const byVersion = new Map(backups.map((b) => [b.version, b]))
  const events: TimelineEntry[] = items.map((item) => {
    const n = returnPointOf(item)
    const returnPoint = n === null ? undefined : byVersion.get(n)
    return {
      kind: 'event',
      item,
      at: secondsOf(item.occurredAt ?? item.detectedAt),
      ...(returnPoint ? { returnPoint } : {})
    }
  })
  const folded = new Set(
    events.flatMap((e) => (e.kind === 'event' && e.returnPoint ? [e.returnPoint.version] : []))
  )
  const oldest = events.reduce<number | null>(
    (min, e) => (e.at === null ? min : min === null || e.at < min ? e.at : min),
    null
  )
  /** Events between the previous backup and this one, when every event of that stretch is loaded. */
  const changesOf = (b: BackupPoint): number | null => {
    const prev = b.previous === null ? undefined : byVersion.get(b.previous)
    if (!prev || prev.at === null || b.at === null) return null
    if (!complete && (oldest === null || oldest > prev.at)) return null
    const from = prev.at
    const to = b.at
    return events.filter((e) => e.at !== null && e.at > from && e.at <= to).length
  }
  // People and Tracy (the tab's default) is the whole list less automatic updates (`hidden` of them):
  // backups stay rows (Restore… lives there), and their "N changes" is said only when nothing is held
  // back — with automatic updates hidden it would leave them out, so the row says its files instead.
  const people = filter === 'people' && hidden > 0
  const as = filter === 'all' || filter === 'people' ? 'row' : 'divider'
  const marks = backups
    .filter((b) => !folded.has(b.version))
    .filter((b) => complete || (b.at !== null && oldest !== null && b.at >= oldest))
    .map(
      (b): TimelineEntry => ({
        kind: 'backup',
        backup: b,
        as,
        at: b.at,
        changes: people ? null : changesOf(b)
      })
    )
  const out: TimelineEntry[] = []
  let m = 0
  const placed = marks.filter((b) => b.at !== null)
  const undated = marks.filter((b) => b.at === null)
  for (const e of events) {
    while (m < placed.length && e.at !== null && (placed[m]?.at ?? 0) >= e.at)
      out.push(placed[m++] as TimelineEntry)
    out.push(e)
  }
  while (m < placed.length) out.push(placed[m++] as TimelineEntry)
  return [...out, ...undated]
}

/** Whether Restore… on a point has a scope this seat may press (its menu, and a return point). */
export function restorePressable(
  b: Pick<BackupPoint, 'capability'>,
  opts: {
    fileHistory?: boolean
    may?: { restoreFiles: boolean; restoreEverything: boolean } | null
  } = {}
): boolean {
  const scopes = restoreScopes(b, opts)
  return scopes.content ? (opts.may?.restoreEverything ?? true) : scopes.everything || scopes.files
}

/**
 * Site changes recorded nothing since the newest backup: the newest entry already is a backup (an
 * empty list too). It never turns "Create a backup" off (QA-I04/I07, 02/10): a backup keeps the
 * DATABASE as well, and the database changes without a row here — orders, comments, form entries,
 * a CLI write — so "nothing recorded" is not "nothing to keep". It only words the button's hover.
 */
export const nothingRecordedSince = (timeline: readonly TimelineEntry[]): boolean =>
  timeline.length === 0 || timeline[0]?.kind === 'backup'

/**
 * What a Create a backup press came back with (#1403 item 9). `pending`: the door answered 202 —
 * the host is still making it. `unconfirmed`: no answer that proves anything (the request failed,
 * a proxy's 5xx page, a host whose answer could not be read): the backup may still be made.
 */
export type BackupCreateOutcome = 'made' | 'pending' | 'unconfirmed' | 'failed' | 'rate-limited'

/**
 * A press's answer as one outcome. "Nothing on the site was changed" belongs to a refusal only — a
 * 4xx, which the door gives before it starts a job, or the host's own `FLEET_JOB_FAILED`; the tab
 * used to say it after a timed-out wait while the host went on and made the backup.
 * @param answer - the HTTP status and the door's `code`; null when no answer came back at all.
 */
export function backupCreateOutcomeOf(answer: { status: number; code: string } | null): BackupCreateOutcome {
  if (answer === null) return 'unconfirmed'
  if (answer.status >= 200 && answer.status < 300) return answer.status === 202 ? 'pending' : 'made'
  if (answer.status === 429) return 'rate-limited'
  if (answer.status >= 400 && answer.status < 500) return 'failed'
  if (answer.code === 'FLEET_JOB_FAILED') return 'failed'
  return 'unconfirmed'
}

/** The newest backup's version among `/backups` rows; 0 when there is none. */
export const newestBackupVersion = (rows: readonly { kind: string; version?: number }[] | null): number =>
  (rows ?? []).reduce(
    (top, r) => (r.kind === 'backup' && typeof r.version === 'number' && r.version > top ? r.version : top),
    0
  )
